import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser, Public, type AuthUser } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { AuthService, type AuthResult } from "./auth.service";
import {
  loginSchema,
  signupSchema,
  usernameSchema,
  type LoginDto,
  type SignupDto,
  type UsernameDto,
} from "./dto/auth.schemas";
import type { GoogleIdentity } from "./strategies/google.strategy";
import { suggestUsernames } from "./username.generator";

const REFRESH_COOKIE = "cr_refresh";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ── Email / password ───────────────────────────────────────────────────

  /** Tight throttle: credential endpoints are the brute-force surface. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("signup")
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) dto: SignupDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.signup(dto.email, dto.password, {
      userAgent: req.headers["user-agent"],
      ip,
    });
    return this.finish(res, result);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, {
      userAgent: req.headers["user-agent"],
      ip,
    });
    return this.finish(res, result);
  }

  /**
   * Which sign-in methods this deployment can actually offer. The UI hides
   * the Google button when no credentials are configured, rather than showing
   * a button that dead-ends on a Google error page.
   */
  @Public()
  @Get("providers")
  providers() {
    return { google: !!this.config.get<string>("GOOGLE_CLIENT_ID") };
  }

  // ── Google OAuth ───────────────────────────────────────────────────────

  /** Redirects to Google's consent screen. */
  @Public()
  @UseGuards(AuthGuard("google"))
  @Get("google")
  googleAuth(): void {
    /* passport redirects */
  }

  /**
   * Google redirects here. We set the refresh cookie and bounce to the web
   * app's /auth/callback, which immediately calls POST /auth/refresh to get
   * an access token — tokens never appear in URLs.
   */
  @Public()
  @UseGuards(AuthGuard("google"))
  @Get("google/callback")
  async googleCallback(
    @Req() req: Request & { user: GoogleIdentity },
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.auth.loginWithGoogle(req.user.googleId, req.user.email, {
      userAgent: req.headers["user-agent"],
      ip,
    });
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    res.redirect(`${webUrl}/auth/callback${result.needsOnboarding ? "?onboarding=1" : ""}`);
  }

  // ── Session lifecycle ──────────────────────────────────────────────────

  /** Cookie-authenticated (the only such route) — see CSRF note in main.ts. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.auth.refresh(presented ?? "", {
      userAgent: req.headers["user-agent"],
      ip,
    });
    return this.finish(res, result);
  }

  @Public()
  @HttpCode(204)
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  // ── Onboarding & session info ──────────────────────────────────────────

  @Get("username/suggestions")
  suggestions() {
    return { suggestions: suggestUsernames(5) };
  }

  /** Claim the anonymous username (one-time). Returns a fresh access token
   *  because the profileId is baked into the JWT payload. */
  @Post("username")
  async claimUsername(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(usernameSchema)) dto: UsernameDto,
  ) {
    const profile = await this.auth.claimUsername(user.userId, dto.username);
    return { profile };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { userId: user.userId, profileId: user.profileId, role: user.role };
  }

  // ── Cookie plumbing ────────────────────────────────────────────────────

  private finish(res: Response, result: AuthResult) {
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    // Refresh token travels ONLY in the cookie — never in the JSON body.
    return {
      accessToken: result.accessToken,
      needsOnboarding: result.needsOnboarding,
      profile: result.profile,
    };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get("NODE_ENV") === "production",
      sameSite: "strict" as const,
      path: "/api/v1/auth", // sent only to auth endpoints, nowhere else
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, { ...this.cookieOptions(), expires: expiresAt });
  }
}
