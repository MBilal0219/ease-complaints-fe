import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthSessionSummary } from '../../../core/auth/models';

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

  protected readonly sessions = signal<AuthSessionSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly revokingId = signal<string | null>(null);
  protected readonly loggingOutAll = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.authService.getSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
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
        this.load();
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
