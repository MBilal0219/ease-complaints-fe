import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, share, tap } from 'rxjs';
import { AuthSessionSummary, CurrentUser, InvitationValidation } from './models';

const BASE = '/api/v1/auth';

/**
 * Auth state lives only in memory, sourced from GET /me — Angular never reads
 * or decodes the access/refresh token cookies (they're HttpOnly). See
 * docs/modules/authentication.md.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly currentUserSignal = signal<CurrentUser | null>(null);
  private readonly loadedSignal = signal(false);
  private loadInFlight: Observable<CurrentUser | null> | null = null;
  private refreshInFlight: Observable<CurrentUser> | null = null;

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly loaded = this.loadedSignal.asReadonly();

  /** Resolves the current auth state, fetching GET /me at most once until explicitly refreshed. */
  ensureLoaded(): Observable<CurrentUser | null> {
    if (this.loadedSignal()) {
      return of(this.currentUserSignal());
    }
    if (!this.loadInFlight) {
      this.loadInFlight = this.http.get<CurrentUser>(`${BASE}/me`).pipe(
        tap((user) => {
          this.currentUserSignal.set(user);
          this.loadedSignal.set(true);
        }),
        catchError(() => {
          this.currentUserSignal.set(null);
          this.loadedSignal.set(true);
          return of(null);
        }),
      );
    }
    return this.loadInFlight;
  }

  login(email: string, password: string): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${BASE}/login`, { email, password }).pipe(
      tap((user) => {
        this.currentUserSignal.set(user);
        this.loadedSignal.set(true);
      }),
    );
  }

  /** Shared so multiple 401s in flight at once trigger only one refresh call. */
  refresh(): Observable<CurrentUser> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http.post<CurrentUser>(`${BASE}/refresh`, {}).pipe(
        tap((user) => {
          this.currentUserSignal.set(user);
          this.loadedSignal.set(true);
        }),
        finalize(() => (this.refreshInFlight = null)),
        share(),
      );
    }
    return this.refreshInFlight;
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${BASE}/logout`, {}).pipe(tap(() => this.clearLocalState()));
  }

  logoutAll(): Observable<void> {
    return this.http.post<void>(`${BASE}/logout-all`, {}).pipe(tap(() => this.clearLocalState()));
  }

  getSessions(): Observable<AuthSessionSummary[]> {
    return this.http.get<AuthSessionSummary[]>(`${BASE}/sessions`);
  }

  revokeSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/sessions/${sessionId}`);
  }

  forgotPassword(email: string): Observable<unknown> {
    return this.http.post(`${BASE}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${BASE}/reset-password`, { token, newPassword });
  }

  validateInvitation(token: string): Observable<InvitationValidation> {
    return this.http.post<InvitationValidation>(`${BASE}/invitations/validate`, { token });
  }

  acceptInvitation(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${BASE}/invitations/accept`, { token, password });
  }

  /**
   * Always hits the network (unlike ensureLoaded, which caches). Used for
   * periodic "is this device still logged in?" polling — see
   * layout/sidebar-layout/sidebar-layout.ts (used by every role's shell)
   * — so a session revoked from another device/browser gets noticed without
   * the user having to refresh the page. A 401 here means an in-flight
   * request already went through the auth interceptor's refresh-then-retry
   * logic and still failed, i.e. the session is genuinely gone.
   */
  checkSessionStillValid(): Observable<boolean> {
    return this.http.get<CurrentUser>(`${BASE}/me`).pipe(
      tap((user) => this.currentUserSignal.set(user)),
      map(() => true),
      catchError(() => {
        this.clearLocalState();
        return of(false);
      }),
    );
  }

  /** Called after a hard 401 that a refresh attempt could not recover from. */
  clearLocalState(): void {
    this.currentUserSignal.set(null);
    this.loadedSignal.set(true);
  }
}
