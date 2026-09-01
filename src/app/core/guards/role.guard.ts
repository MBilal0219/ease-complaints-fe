import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * Navigation-only role check — purely UX (hides a route from the wrong role's
 * menu). The backend re-enforces every role/policy check independently; this
 * guard being bypassed can never grant real access. See authorization.md.
 */
export function roleGuard(role: string): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.ensureLoaded().pipe(
      map((user) => (user?.roles.includes(role) ? true : router.createUrlTree(['/login']))),
    );
  };
}
