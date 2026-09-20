import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_VERIFIED_KEY, type AuthUser } from "@/common/decorators";

/**
 * Blocks routes marked @RequireVerified() for accounts that haven't confirmed
 * their email. Reading stays open on purpose; this only gates the actions that
 * create content, which is where fake signups actually cost something.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (user?.emailVerified) return true;
    throw new ForbiddenException({
      code: "EMAIL_NOT_VERIFIED",
      message: "Confirm your email address first. Check your inbox.",
    });
  }
}
