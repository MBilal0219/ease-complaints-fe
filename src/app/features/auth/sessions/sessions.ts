import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthSessionSummary } from '../../../core/auth/models';

/**
 * Polling stand-in for real-time session push (SignalR is out of scope for
 * this module). Keeps this list close to live — a session created or revoked
 * from another browser shows up here without a manual refresh.
 */
const SESSIONS_POLL_MS = 4_000;

@Component({
  selector: 'app-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Active sessions</h1>
    <p class="mt-1 text-sm text-slate-500">
      Every device currently signed in to your account. Revoking a session signs it out immediately.
    </p>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else {
      <ul class="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        @for (session of sessions(); track session.id) {
          <li class="flex items-center justify-between px-4 py-3">
            <div>
              <p class="text-sm font-medium text-slate-900">
                {{ session.browser ?? 'Unknown browser' }} · {{ session.platform ?? 'Unknown platform' }}
                @if (session.isCurrent) {
                  <span class="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                    >This device</span
                  >
                }
              </p>
              <p class="text-xs text-slate-500">
                Last active {{ session.lastSeenAtUtc | date: 'medium' }} · {{ session.ipAddress }}
              </p>
            </div>
            <button
              type="button"
              (click)="revoke(session.id)"
              [disabled]="revokingId() === session.id"
              class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Log out
            </button>
          </li>
        }
      </ul>

      <button
        type="button"
        (click)="logoutAll()"
        [disabled]="loggingOutAll()"
        class="mt-6 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        Log out all devices
      </button>
    }
  `,
  imports: [DatePipe],
})
export class SessionsPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sessions = signal<AuthSessionSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly revokingId = signal<string | null>(null);
  protected readonly loggingOutAll = signal(false);

  ngOnInit(): void {
    // timer(0, ms) fires immediately, then every `ms` — one continuous
    // subscription doing both the initial load and the live refresh.
    timer(0, SESSIONS_POLL_MS)
      .pipe(
        switchMap(() =>
          this.authService.getSessions().pipe(
            // A transient error shouldn't kill the poll loop for the rest of
            // the page's lifetime — keep the previous list and try again next tick.
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((sessions) => {
        if (sessions) {
          this.sessions.set(sessions);
        }
        this.loading.set(false);
      });
  }

  revoke(sessionId: string): void {
    this.revokingId.set(sessionId);
    const wasCurrent = this.sessions().find((s) => s.id === sessionId)?.isCurrent ?? false;

    this.authService.revokeSession(sessionId).subscribe({
      next: () => {
        if (wasCurrent) {
          this.authService.clearLocalState();
          this.router.navigateByUrl('/login');
          return;
        }
        this.revokingId.set(null);
        // The poll loop will pick this up within SESSIONS_POLL_MS regardless,
        // but refreshing right away keeps the click feeling immediate.
        this.authService.getSessions().subscribe((sessions) => this.sessions.set(sessions));
      },
      error: () => this.revokingId.set(null),
    });
  }

  logoutAll(): void {
    this.loggingOutAll.set(true);
    this.authService.logoutAll().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
