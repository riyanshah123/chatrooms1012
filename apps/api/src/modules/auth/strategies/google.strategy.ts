import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy } from "passport-google-oauth20";

export interface GoogleIdentity {
  googleId: string;
  email: string;
}

/**
 * Google OAuth code flow. We only take id + verified email — no name or
 * picture, on purpose: real identity should never even enter the system.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>("GOOGLE_CLIENT_ID") ?? "unset",
      clientSecret: config.get<string>("GOOGLE_CLIENT_SECRET") ?? "unset",
      callbackURL: config.get<string>("GOOGLE_CALLBACK_URL") ?? "",
      scope: ["email"],
    });
  }

  validate(_at: string, _rt: string, profile: Profile): GoogleIdentity {
    const email = profile.emails?.find((e) => (e as { verified?: boolean }).verified !== false)
      ?.value;
    if (!email) {
      throw new UnauthorizedException({
        code: "GOOGLE_NO_EMAIL",
        message: "Google account has no verified email.",
      });
    }
    return { googleId: profile.id, email: email.toLowerCase() };
  }
}
