import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { landingRouteForRoles } from '../auth/role-landing';

/** Keeps an already-authenticated user off public-only pages (login, etc). */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureLoaded().pipe(
    map((user) => (user ? router.createUrlTree([landingRouteForRoles(user.roles)]) : true)),
  );
};
