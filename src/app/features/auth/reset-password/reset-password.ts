import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('newPassword')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, PasswordInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 class="text-xl font-semibold text-slate-900">Choose a new password</h1>

        @if (!token()) {
          <p class="mt-4 text-sm text-red-600" role="alert">
            This reset link is missing its token. Request a new one.
          </p>
        } @else if (done()) {
          <p class="mt-4 text-sm text-slate-700" role="status">
            Your password has been reset. You can now sign in with your new password.
          </p>
        } @else {
          <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div>
              <label for="newPassword" class="block text-sm font-medium text-slate-700">New password</label>
              <div class="mt-1">
                <app-password-input inputId="newPassword" autocomplete="new-password" formControlName="newPassword" />
              </div>
            </div>

            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-slate-700">Confirm password</label>
              <div class="mt-1">
                <app-password-input inputId="confirmPassword" autocomplete="new-password" formControlName="confirmPassword" />
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
              class="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ submitting() ? 'Resetting…' : 'Reset password' }}
            </button>
          </form>
        }

        <a routerLink="/login" class="mt-4 inline-block text-sm text-indigo-600 hover:underline">Back to sign in</a>
      </div>
    </div>
  `,
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly token = signal(this.route.snapshot.queryParamMap.get('token'));
  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  submit(): void {
    const token = this.token();
    if (this.form.invalid || this.submitting() || !token) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authService.resetPassword(token, this.form.getRawValue().newPassword).subscribe({
      next: () => this.done.set(true),
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'This reset link is invalid or has expired.');
      },
    });
  }
}
