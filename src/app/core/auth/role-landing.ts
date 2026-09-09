import { ROLE_ADMIN, ROLE_DEVELOPER, ROLE_IMPLEMENTATOR, ROLE_SALES_PERSON, ROLE_USER } from './models';

/** Where to send an authenticated user after login / when hitting a guest-only page. */
export function landingRouteForRoles(roles: string[]): string {
  if (roles.includes(ROLE_ADMIN)) return '/app/admin';
  if (roles.includes(ROLE_DEVELOPER)) return '/app/developer';
  if (roles.includes(ROLE_SALES_PERSON)) return '/app/sales-person';
  if (roles.includes(ROLE_IMPLEMENTATOR)) return '/app/implementator';
  if (roles.includes(ROLE_USER)) return '/app/user';
  return '/login';
}
