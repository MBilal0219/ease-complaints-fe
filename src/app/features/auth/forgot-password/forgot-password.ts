import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 class="text-xl font-semibold text-slate-900">Reset your password</h1>
        <p class="mt-1 text-sm text-slate-500">
          Enter your email and we'll send you a reset link if an account exists.
        </p>

        @if (submitted()) {
          <p class="mt-6 text-sm text-slate-700" role="status">
            If an account with that email exists, a reset link has been sent.
          </p>
        } @else {
          <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div>
              <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
              <input
                id="email"
                type="email"
                autocomplete="username"
                formControlName="email"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              [disabled]="form.invalid || submitting()"
              class="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ submitting() ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>
        }

        <a routerLink="/login" class="mt-4 inline-block text-sm text-indigo-600 hover:underline">Back to sign in</a>
      </div>
    </div>
  `,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    // Always shows the same confirmation regardless of outcome — matches the
    // backend's account-enumeration-resistant response.
    this.authService.forgotPassword(this.form.getRawValue().email).subscribe({
      next: () => this.submitted.set(true),
      error: () => this.submitted.set(true),
    });
  }
}
