import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CsrfTokenReader } from '../auth/csrf';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NO_REFRESH_RETRY = /\/api\/v1\/auth\/(login|refresh)$/;

/**
 * Cookies carry the tokens automatically — this interceptor only needs to:
 * ensure credentials are sent, attach the CSRF header on mutating requests,
 * and transparently retry once after a silent refresh on a 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const csrf = inject(CsrfTokenReader);
  const router = inject(Router);

  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  // Relative in dev (ng serve's proxy.conf.json forwards /api locally);
  // rewritten to the API's own origin in production, where the frontend is
  // deployed on a different domain — see environment.prod.ts.
  let outgoing = req.clone({ url: environment.apiBaseUrl + req.url, withCredentials: true });

  if (MUTATING_METHODS.has(req.method)) {
    const token = csrf.read();
    if (token) {
      outgoing = outgoing.clone({ setHeaders: { 'X-XSRF-TOKEN': token } });
    }
  }

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      const isHttpError = error instanceof HttpErrorResponse;
      const skipRefresh = NO_REFRESH_RETRY.test(req.url);

      if (isHttpError && error.status === 401 && !skipRefresh) {
        // Was the app under the impression it was logged in before this
        // request? Guards on public pages (e.g. guestGuard on
        // /invite/accept/:token) probe /me to check "is someone already
        // signed in?" — a 401 there is the expected, normal outcome for a
        // fresh browser, not a session that got revoked, and must NOT force
        // -navigate away from the public page the guard is about to allow.
        // Only redirect when the app actually believed there was an active
        // session and it just turned out not to be true anymore.
        const wasConsideredAuthenticated = authService.isAuthenticated();

        return authService.refresh().pipe(
          switchMap(() => next(outgoing)),
          catchError((refreshError) => {
            authService.clearLocalState();
            if (wasConsideredAuthenticated) {
              router.navigateByUrl('/login');
            }
            return throwError(() => refreshError);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};
