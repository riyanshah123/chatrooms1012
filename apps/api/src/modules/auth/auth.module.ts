import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleStrategy } from "./strategies/google.strategy";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { TokenService } from "./token.service";

@Module({
  imports: [
    PassportModule,
    // Secrets/TTLs are passed per-sign in TokenService (access vs refresh
    // use different secrets), so no global registration values here.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, GoogleStrategy],
  exports: [TokenService],
})
export class AuthModule {}
