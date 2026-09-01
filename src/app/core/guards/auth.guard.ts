import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * UX-only navigation gate — the backend is the actual security authority and
 * re-checks authentication/authorization on every request regardless of what
 * this guard allows. See docs/modules/authorization.md.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureLoaded().pipe(
    map((user) => (user ? true : router.createUrlTree(['/login']))),
  );
};
