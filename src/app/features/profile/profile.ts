import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuthSessionSummary } from '../../core/auth/models';
import { PasswordInput } from '../../shared/ui/password-input/password-input';

type Tab = 'account' | 'sessions';

/** Polling stand-in for real-time session push (SignalR is out of scope for now). */
const SESSIONS_POLL_MS = 4_000;

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('newPassword')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, PasswordInput, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Profile</h1>
    <p class="mt-1 text-sm text-slate-500">Manage your account details and see where you're signed in.</p>

    <div class="mt-6 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
      <button
        type="button"
        (click)="tab.set('account')"
        class="rounded px-4 py-1.5 font-medium"
        [class]="tab() === 'account' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'"
      >
        Account
      </button>
      <button
        type="button"
        (click)="tab.set('sessions')"
        class="rounded px-4 py-1.5 font-medium"
        [class]="tab() === 'sessions' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'"
      >
        Sessions
      </button>
    </div>

    @if (tab() === 'account') {
      <div class="mt-6 grid max-w-2xl grid-cols-1 gap-6">
        <div class="rounded-lg border border-slate-200 bg-white p-5">
          <h2 class="text-sm font-semibold text-slate-900">General info</h2>
          <p class="mt-1 text-sm text-slate-500">Your name and email address.</p>

          <form class="mt-4 space-y-4" [formGroup]="profileForm" (ngSubmit)="saveProfile()" novalidate>
            <div>
              <label for="profile-name" class="block text-sm font-medium text-slate-700">Name</label>
              <input
                id="profile-name"
                type="text"
                formControlName="displayName"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label for="profile-email" class="block text-sm font-medium text-slate-700">Email</label>
              <input
                id="profile-email"
                type="email"
                formControlName="email"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            @if (profileMessage(); as msg) {
              <p class="text-sm" [class]="profileError() ? 'text-red-600' : 'text-green-600'" role="status">{{ msg }}</p>
            }

            <div class="flex justify-end">
              <button
                type="submit"
                [disabled]="profileForm.invalid || savingProfile()"
                class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {{ savingProfile() ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </form>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-5">
          <h2 class="text-sm font-semibold text-slate-900">Change password</h2>
          <p class="mt-1 text-sm text-slate-500">Changing your password signs you out of every other device.</p>

          <form class="mt-4 space-y-4" [formGroup]="passwordForm" (ngSubmit)="changePassword()" novalidate>
            <div>
              <label for="current-password" class="block text-sm font-medium text-slate-700">Current password</label>
              <app-password-input inputId="current-password" autocomplete="current-password" formControlName="currentPassword" />
            </div>
            <div>
              <label for="new-password" class="block text-sm font-medium text-slate-700">New password</label>
              <app-password-input inputId="new-password" autocomplete="new-password" formControlName="newPassword" />
            </div>
            <div>
              <label for="confirm-password" class="block text-sm font-medium text-slate-700">Confirm new password</label>
              <app-password-input inputId="confirm-password" autocomplete="new-password" formControlName="confirmPassword" />
              @if (passwordForm.errors?.['mismatch'] && passwordForm.controls.confirmPassword.touched) {
                <p class="mt-1 text-sm text-red-600" role="alert">Passwords do not match.</p>
              }
            </div>

            @if (passwordMessage(); as msg) {
              <p class="text-sm" [class]="passwordError() ? 'text-red-600' : 'text-green-600'" role="status">{{ msg }}</p>
            }

            <div class="flex justify-end">
              <button
                type="submit"
                [disabled]="passwordForm.invalid || changingPassword()"
                class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {{ changingPassword() ? 'Updating…' : 'Update password' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    } @else {
      <div class="mt-6 max-w-2xl">
        <p class="text-sm text-slate-500">
          Every device currently signed in to your account. Revoking a session signs it out immediately.
        </p>

        @if (loadingSessions()) {
          <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
        } @else {
          <ul class="mt-4 max-h-[40rem] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            @for (session of sessions(); track session.id) {
              <li class="flex items-center justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-slate-900">
                    {{ session.browser ?? 'Unknown browser' }} · {{ session.platform ?? 'Unknown platform' }}
                    @if (session.isCurrent) {
                      <span class="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">This device</span>
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
                  class="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Log out
                </button>
              </li>
            } @empty {
              <li class="px-4 py-8 text-center text-sm text-slate-400">No active sessions.</li>
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
      </div>
    }
  `,
})
export class ProfilePage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tab = signal<Tab>('account');

  protected readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly savingProfile = signal(false);
  protected readonly profileMessage = signal<string | null>(null);
  protected readonly profileError = signal(false);

  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );
  protected readonly changingPassword = signal(false);
  protected readonly passwordMessage = signal<string | null>(null);
  protected readonly passwordError = signal(false);

  protected readonly sessions = signal<AuthSessionSummary[]>([]);
  protected readonly loadingSessions = signal(true);
  protected readonly revokingId = signal<string | null>(null);
  protected readonly loggingOutAll = signal(false);

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.profileForm.setValue({ displayName: user.displayName, email: user.email });
    }

    timer(0, SESSIONS_POLL_MS)
      .pipe(
        switchMap(() => this.authService.getSessions().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((sessions) => {
        if (sessions) this.sessions.set(sessions);
        this.loadingSessions.set(false);
      });
  }

  saveProfile(): void {
    if (this.profileForm.invalid || this.savingProfile()) return;

    this.savingProfile.set(true);
    this.profileMessage.set(null);
    const { displayName, email } = this.profileForm.getRawValue();

    this.authService.updateProfile(displayName, email).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.profileError.set(false);
        this.profileMessage.set('Saved.');
      },
      error: (error: HttpErrorResponse) => {
        this.savingProfile.set(false);
        this.profileError.set(true);
        this.profileMessage.set(error.error?.error ?? 'Could not save your profile.');
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid || this.changingPassword()) return;

    this.changingPassword.set(true);
    this.passwordMessage.set(null);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();

    this.authService.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordError.set(false);
        this.passwordMessage.set('Password updated. Other devices have been signed out.');
        this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      },
      error: (error: HttpErrorResponse) => {
        this.changingPassword.set(false);
        this.passwordError.set(true);
        this.passwordMessage.set(error.error?.error ?? 'Could not update your password.');
      },
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
