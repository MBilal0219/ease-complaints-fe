import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { InvitationValidation } from '../../../core/auth/models';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

type ViewState = 'validating' | 'invalid' | 'form' | 'done';

@Component({
  selector: 'app-accept-invitation',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        @switch (state()) {
          @case ('validating') {
            <p class="text-sm text-slate-500" role="status">Checking your invitation…</p>
          }
          @case ('invalid') {
            <h1 class="text-xl font-semibold text-slate-900">Invitation not valid</h1>
            <p class="mt-2 text-sm text-red-600" role="alert">
              This invitation link is invalid, expired, or has already been used. Ask your
              administrator to send a new one.
            </p>
          }
          @case ('done') {
            <h1 class="text-xl font-semibold text-slate-900">You're all set</h1>
            <p class="mt-2 text-sm text-slate-700" role="status">Your account is active. You can now sign in.</p>
          }
          @case ('form') {
            <h1 class="text-xl font-semibold text-slate-900">Set up your account</h1>
            <p class="mt-1 text-sm text-slate-500">
              {{ invitation()?.email }} · joining as {{ invitation()?.role }}
            </p>

            <form class="mt-6 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <div>
                <label for="password" class="block text-sm font-medium text-slate-700">Password</label>
                <input
                  id="password"
                  type="password"
                  autocomplete="new-password"
                  formControlName="password"
                  class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label for="confirmPassword" class="block text-sm font-medium text-slate-700">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autocomplete="new-password"
                  formControlName="confirmPassword"
                  class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
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
                {{ submitting() ? 'Creating account…' : 'Activate account' }}
              </button>
            </form>
          }
        }

        <a routerLink="/login" class="mt-4 inline-block text-sm text-indigo-600 hover:underline">Back to sign in</a>
      </div>
    </div>
  `,
})
export class AcceptInvitationPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

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
}
