import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { UserRole } from "@chatrooms/contracts";

/** Marks a route as public — skipped by the global JwtAuthGuard. */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to roles; enforced by RolesGuard (admin endpoints). */
export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Requires a confirmed email address; enforced by VerifiedGuard. */
export const REQUIRE_VERIFIED_KEY = "requireVerified";
export const RequireVerified = () => SetMetadata(REQUIRE_VERIFIED_KEY, true);

/** Shape attached to req.user by the JWT strategy (Step 5). */
export interface AuthUser {
  userId: string;
  profileId: string | null; // null until onboarding picks a username
  role: UserRole;
  emailVerified: boolean;
}

/** Injects the authenticated user: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
