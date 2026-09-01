import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { landingRouteForRoles } from '../auth/role-landing';

/** Sends `/app` itself to the caller's actual role landing (admin/developer/user). */
export const roleLandingRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureLoaded().pipe(
    map((user) => router.createUrlTree([landingRouteForRoles(user?.roles ?? [])])),
  );
};
