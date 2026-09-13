import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@chatrooms/contracts";
import { ROLES_KEY, type AuthUser } from "@/common/decorators";

/** Enforces @Roles("ADMIN" | "MODERATOR") on top of JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    return !!user && required.includes(user.role);
  }
}
