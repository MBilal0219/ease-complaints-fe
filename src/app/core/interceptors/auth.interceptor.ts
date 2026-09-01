import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
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

  let outgoing = req.clone({ withCredentials: true });

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
        return authService.refresh().pipe(
          switchMap(() => next(outgoing)),
          catchError((refreshError) => {
            authService.clearLocalState();
            router.navigateByUrl('/login');
            return throwError(() => refreshError);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};
