import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { landingRouteForRoles } from '../../../core/auth/role-landing';
import { PRODUCT_NAME } from '../../../core/branding/branding';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, PasswordInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 class="text-xl font-semibold text-slate-900">Sign in</h1>
        <p class="mt-1 text-sm text-slate-500">{{ productName }}</p>

        <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div>
            <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
            <input
              id="email"
              type="email"
              autocomplete="username"
              formControlName="email"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              [attr.aria-invalid]="form.controls.email.invalid && form.controls.email.touched"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-slate-700">Password</label>
            <div class="mt-1">
              <app-password-input inputId="password" autocomplete="current-password" formControlName="password" />
            </div>
          </div>

          @if (errorMessage()) {
            <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
          }

          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {{ submitting() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <a routerLink="/forgot-password" class="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Forgot your password?
        </a>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly productName = PRODUCT_NAME;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { email, password } = this.form.getRawValue();

    this.authService.login(email, password).subscribe({
      next: (user) => this.router.navigateByUrl(landingRouteForRoles(user.roles)),
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          error.status === 429
            ? 'Too many attempts. Please wait a moment and try again.'
            : (error.error?.error ?? 'Invalid email or password.'),
        );
      },
    });
  }
}
