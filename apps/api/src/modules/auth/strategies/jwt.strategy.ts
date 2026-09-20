import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthUser } from "@/common/decorators";
import type { AccessPayload } from "../token.service";

/**
 * Validates `Authorization: Bearer <jwt>`. Deliberately no DB hit per
 * request — the 15-minute expiry bounds staleness, and bans take effect at
 * next refresh (or immediately for sockets, which re-check on connect).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  validate(payload: AccessPayload): AuthUser {
    return {
      userId: payload.sub,
      profileId: payload.pid,
      role: payload.role,
      emailVerified: !!payload.ver,
    };
  }
}
