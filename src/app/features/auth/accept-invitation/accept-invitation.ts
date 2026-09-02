import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { InvitationValidation } from '../../../core/auth/models';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

type ViewState = 'validating' | 'invalid' | 'form' | 'done';

@Component({
  selector: 'app-accept-invitation',
  imports: [ReactiveFormsModule, PasswordInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-slate-50 px-4">
      <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
        @switch (state()) {
          @case ('validating') {
            <div class="flex flex-col items-center py-6 text-center">
              <div class="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600"></div>
              <p class="mt-4 text-sm text-slate-500" role="status">Checking your invitation…</p>
            </div>
          }
          @case ('invalid') {
            <div class="flex flex-col items-center text-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <h1 class="mt-4 text-lg font-semibold text-slate-900">This invitation isn't valid</h1>
              <p class="mt-2 text-sm text-slate-500">
                The link may have expired, already been used, or been revoked. Ask your administrator to send a new one.
              </p>
              <button
                type="button"
                (click)="goToLogin()"
                class="mt-6 w-full rounded-md bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-800"
              >
                Back to sign in
              </button>
            </div>
          }
          @case ('done') {
            <div class="flex flex-col items-center text-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h1 class="mt-4 text-lg font-semibold text-slate-900">Your account is ready</h1>
              <p class="mt-2 text-sm text-slate-500">Your password has been set. You can sign in now.</p>
              <button
                type="button"
                (click)="goToLogin()"
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Back to sign in
              </button>
            </div>
          }
          @case ('form') {
            <div class="text-center">
              <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                </svg>
              </div>
              <h1 class="mt-3 text-lg font-semibold text-slate-900">Set up your account</h1>
              <p class="mt-1 text-sm text-slate-500">
                You've been invited as
                <span class="font-medium text-slate-700">{{ invitation()?.role }}</span>.
                Choose a password to finish activating your account.
              </p>
            </div>

            <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <div>
                <label for="invite-email" class="block text-sm font-medium text-slate-700">Email</label>
                <input
                  id="invite-email"
                  type="email"
                  [value]="invitation()?.email"
                  disabled
                  class="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </div>

              <div>
                <label for="invite-password" class="block text-sm font-medium text-slate-700">Password</label>
                <div class="mt-1">
                  <app-password-input inputId="invite-password" autocomplete="new-password" formControlName="password" />
                </div>
              </div>

              <div>
                <label for="invite-confirm-password" class="block text-sm font-medium text-slate-700">Confirm password</label>
                <div class="mt-1">
                  <app-password-input inputId="invite-confirm-password" autocomplete="new-password" formControlName="confirmPassword" />
                </div>
                @if (form.errors?.['mismatch'] && form.controls.confirmPassword.touched) {
                  <p class="mt-1 text-sm text-red-600" role="alert">Passwords do not match.</p>
                }
              </div>

              @if (errorMessage()) {
                <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
              }

              <button
                type="submit"
                [disabled]="form.invalid || submitting()"
                class="w-full rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ submitting() ? 'Activating…' : 'Activate account' }}
              </button>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class AcceptInvitationPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  protected readonly state = signal<ViewState>('validating');
  protected readonly invitation = signal<InvitationValidation | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  ngOnInit(): void {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }

    this.authService.validateInvitation(this.token).subscribe({
      next: (result) => {
        if (result.valid) {
          this.invitation.set(result);
          this.state.set('form');
        } else {
          this.state.set('invalid');
        }
      },
      error: () => this.state.set('invalid'),
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authService.acceptInvitation(this.token, this.form.getRawValue().password).subscribe({
      next: () => this.state.set('done'),
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'This invitation could not be accepted.');
      },
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }
}
