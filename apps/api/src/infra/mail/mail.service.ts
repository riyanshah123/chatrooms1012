import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Transactional email via Resend's HTTP API (no SDK, just fetch).
 *
 * When no API key is configured the service degrades to logging the link
 * instead of throwing, so local development and a not-yet-configured deploy
 * both keep working. `enabled` lets callers decide whether to promise the
 * user an email.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>("RESEND_API_KEY");
    this.from = config.get<string>("MAIL_FROM") ?? "onboarding@resend.dev";
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async sendVerification(to: string, link: string): Promise<void> {
    const subject = "Confirm your email for chatrooms101";
    const text = [
      "Confirm your email to start talking.",
      "",
      link,
      "",
      "This link works for 24 hours. If you didn't sign up, ignore this.",
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;color:#1C1B19">Confirm your email</h2>
        <p style="color:#6E6A63;line-height:1.6;margin:0 0 24px">
          One click and you're in. This link works for 24 hours.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#E0603C;color:#fff;text-decoration:none;
                  padding:12px 24px;border-radius:999px;font-weight:600">
          Confirm email
        </a>
        <p style="color:#6E6A63;font-size:13px;line-height:1.6;margin:24px 0 0">
          If the button doesn't work, paste this into your browser:<br>
          <span style="color:#E0603C;word-break:break-all">${link}</span>
        </p>
        <p style="color:#9a958c;font-size:12px;margin:24px 0 0">
          Didn't sign up? Ignore this email.
        </p>
      </div>`;

    await this.send({ to, subject, text, html });
  }

  private async send(msg: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    if (!this.apiKey) {
      // Not configured: make the link obvious in the logs rather than failing.
      this.logger.warn(
        `Email disabled (no RESEND_API_KEY). Would send to ${msg.to}:\n${msg.text}`,
      );
      return;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
      });
      if (!res.ok) {
        this.logger.error(`Resend rejected the message: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      // Never let a mail outage break signup.
      this.logger.error(`Sending mail failed: ${(e as Error).message}`);
    }
  }
}
