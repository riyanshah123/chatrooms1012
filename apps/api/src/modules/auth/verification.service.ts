import { randomBytes } from "crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailService } from "@/infra/mail/mail.service";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

/**
 * Email confirmation.
 *
 * Tokens live in Redis with a TTL rather than a database table: they're
 * short-lived, single-use, and expiring them is the whole point, so there's
 * nothing worth persisting.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private static readonly TTL_SECONDS = 24 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private key(token: string): string {
    return `cr:verify:${token}`;
  }

  /** Issue a token and email it. Safe to call repeatedly (resend). */
  async sendFor(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await this.redis.client.set(
      this.key(token),
      userId,
      "EX",
      VerificationService.TTL_SECONDS,
    );
    const webUrl = this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    await this.mail.sendVerification(
      email,
      `${webUrl.replace(/\/$/, "")}/api/v1/auth/verify?token=${token}`,
    );
  }

  /**
   * Consume a token. Returns the verified user's id, or null when the token
   * is unknown or expired. Deleting first makes it single use even if two
   * clicks land at once.
   */
  async confirm(token: string): Promise<string | null> {
    if (!token) return null;
    const userId = await this.redis.client.getdel(this.key(token));
    if (!userId) return null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
    return userId;
  }

  /** Re-send for a user who hasn't confirmed yet. */
  async resend(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });
    if (!user) throw new BadRequestException({ code: "NO_USER", message: "Unknown account." });
    if (user.emailVerified) return; // already done, nothing to do
    await this.sendFor(userId, user.email);
  }
}
