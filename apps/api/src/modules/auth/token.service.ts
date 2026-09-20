import { createHash, randomBytes } from "crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { UserRole } from "@chatrooms/contracts";
import { PrismaService } from "@/infra/prisma/prisma.service";

export interface AccessPayload {
  sub: string; // userId
  pid: string | null; // profileId — null until onboarding completes
  role: UserRole;
  ver: boolean; // email confirmed — gates posting, not reading
}

/**
 * Access tokens: short-lived JWTs, held in memory by the SPA, sent via
 * Authorization header (never a cookie ⇒ no CSRF surface on API routes).
 *
 * Refresh tokens: 256-bit random strings in an httpOnly SameSite=strict
 * cookie scoped to /api/v1/auth. Stored SHA-256-hashed. Every refresh
 * ROTATES the token and links old→new; presenting an already-revoked token
 * is proof of theft (the legitimate client holds the newer one), so the
 * whole session family is revoked.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  signAccessToken(payload: AccessPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
      expiresIn: this.config.getOrThrow("JWT_ACCESS_TTL"),
    });
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private refreshTtlMs(): number {
    const ttl = this.config.getOrThrow<string>("JWT_REFRESH_TTL"); // e.g. "30d"
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) throw new Error(`Bad JWT_REFRESH_TTL: ${ttl}`);
    const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2] as "s" | "m" | "h" | "d"];
    return Number(m[1]) * mult;
  }

  async issueRefreshToken(
    userId: string,
    meta: { userAgent?: string; ip?: string },
    replacesId?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
        ...(replacesId && { replaces: { connect: { id: replacesId } } }),
      },
    });
    return { token, expiresAt };
  }

  /**
   * Validate + rotate. Returns the owning userId and the fresh token.
   * Throws 401 on unknown/expired tokens; on REUSE, revokes every active
   * session for the user before throwing.
   */
  async rotateRefreshToken(
    presented: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ userId: string; token: string; expiresAt: Date }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(presented) },
    });
    if (!row) throw new UnauthorizedException({ code: "INVALID_REFRESH", message: "Sign in again." });

    if (row.revokedAt) {
      // Token reuse — kill the family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: "REFRESH_REUSED",
        message: "Session revoked for your safety. Sign in again.",
      });
    }
    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: "REFRESH_EXPIRED", message: "Session expired." });
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const next = await this.issueRefreshToken(row.userId, meta, row.id);
    return { userId: row.userId, ...next };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByToken(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
