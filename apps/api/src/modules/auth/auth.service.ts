import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import type { UserRole } from "@chatrooms/contracts";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { SearchService } from "@/infra/search/search.service";
import { TokenService, type AccessPayload } from "./token.service";
import { isReservedUsername } from "./username.generator";

export interface AuthResult {
  accessToken: string;
  refreshToken: string; // controller moves this into the httpOnly cookie
  refreshExpiresAt: Date;
  needsOnboarding: boolean; // true → client routes to username picker
  profile: { id: string; username: string; avatarUrl: string | null } | null;
}

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly search: SearchService,
  ) {}

  // ── Email / password ───────────────────────────────────────────────────

  async signup(email: string, password: string, meta: RequestMeta): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: "EMAIL_TAKEN",
        message: "An account with this email already exists.",
      });
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        provider: "EMAIL",
        // argon2id defaults (v0.41): 64 MiB memory, t=3 — OWASP-aligned.
        passwordHash: await argon2.hash(password),
      },
    });
    return this.buildAuthResult(user.id, null, user.role as UserRole, meta);
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    // Uniform error for unknown email vs wrong password — no user enumeration.
    const invalid = new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "Incorrect email or password.",
    });
    if (!user?.passwordHash) throw invalid;
    if (!(await argon2.verify(user.passwordHash, password))) throw invalid;
    this.assertActive(user.status);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildAuthResult(user.id, user.profile, user.role as UserRole, meta);
  }

  // ── Google OAuth (called by the passport strategy callback) ────────────

  async loginWithGoogle(
    googleId: string,
    email: string,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({
      where: { googleId },
      include: { profile: true },
    });
    if (!user) {
      // Same email already registered via password? Link the Google identity
      // (email is Google-verified, so this is a safe account link).
      const byEmail = await this.prisma.user.findUnique({
        where: { email },
        include: { profile: true },
      });
      user = byEmail
        ? await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { googleId, emailVerified: true },
            include: { profile: true },
          })
        : await this.prisma.user.create({
            data: { email, googleId, provider: "GOOGLE", emailVerified: true },
            include: { profile: true },
          });
    }
    this.assertActive(user.status);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildAuthResult(user.id, user.profile, user.role as UserRole, meta);
  }

  // ── Refresh / logout ───────────────────────────────────────────────────

  async refresh(presented: string, meta: RequestMeta): Promise<AuthResult> {
    const rotated = await this.tokens.rotateRefreshToken(presented, meta);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: rotated.userId },
      include: { profile: true },
    });
    this.assertActive(user.status);
    return {
      accessToken: this.tokens.signAccessToken({
        sub: user.id,
        pid: user.profile?.id ?? null,
        role: user.role as UserRole,
      }),
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
      needsOnboarding: !user.profile,
      profile: user.profile
        ? { id: user.profile.id, username: user.profile.username, avatarUrl: user.profile.avatarUrl }
        : null,
    };
  }

  async logout(presentedRefresh: string | undefined): Promise<void> {
    if (presentedRefresh) await this.tokens.revokeByToken(presentedRefresh);
  }

  // ── Onboarding: claim the anonymous username ───────────────────────────

  async claimUsername(userId: string, username: string): Promise<AuthResult["profile"]> {
    if (isReservedUsername(username)) {
      throw new ConflictException({
        code: "USERNAME_RESERVED",
        message: "That username isn't available.",
      });
    }
    const existing = await this.prisma.anonymousProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException({
        code: "ALREADY_ONBOARDED",
        message: "You already have a username.",
      });
    }
    try {
      const profile = await this.prisma.anonymousProfile.create({
        data: { userId, username, usernameLower: username.toLowerCase() },
      });
      // Searchable by anonymous username (and only that) from day one.
      this.search.indexUser({
        id: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        reputation: profile.reputation,
      });
      return { id: profile.id, username: profile.username, avatarUrl: profile.avatarUrl };
    } catch (e) {
      // P2002 = unique violation on usernameLower — someone beat us to it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({
          code: "USERNAME_TAKEN",
          message: "That username is taken — try another.",
        });
      }
      throw e;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private assertActive(status: string): void {
    if (status === "SUSPENDED" || status === "BANNED") {
      throw new UnauthorizedException({
        code: "ACCOUNT_BLOCKED",
        message: "This account is suspended.",
      });
    }
  }

  private async buildAuthResult(
    userId: string,
    profile: { id: string; username: string; avatarUrl: string | null } | null,
    role: UserRole,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const payload: AccessPayload = { sub: userId, pid: profile?.id ?? null, role };
    const refresh = await this.tokens.issueRefreshToken(userId, meta);
    return {
      accessToken: this.tokens.signAccessToken(payload),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      needsOnboarding: !profile,
      profile: profile
        ? { id: profile.id, username: profile.username, avatarUrl: profile.avatarUrl }
        : null,
    };
  }
}
