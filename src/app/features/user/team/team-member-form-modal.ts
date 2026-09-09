import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TeamService } from '../../../core/team/team.service';
import { Modal } from '../../../shared/ui/modal/modal';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

/** Branch Admin's own "+ Add User" — always plain User, on the caller's own Branch (implicit, no picker needed). See docs/modules/company-management.md. */
@Component({
  selector: 'app-team-member-form-modal',
  imports: [ReactiveFormsModule, Modal, PasswordInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">Add a User</h2>
      <p class="mt-1 text-sm text-slate-500">Adds another person to your own team — same company and branch as you.</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="team-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="team-name" type="text" formControlName="displayName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="team-email" class="block text-sm font-medium text-slate-700">Email</label>
          <input id="team-email" type="email" formControlName="email" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="team-password" class="block text-sm font-medium text-slate-700">Password</label>
          <app-password-input inputId="team-password" autocomplete="new-password" formControlName="password" />
        </div>

        @if (errorMessage()) {
          <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
        }

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" (click)="dismiss()" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {{ submitting() ? 'Saving…' : 'Save user' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class TeamMemberFormModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();
  readonly created = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly teamService = inject(TeamService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    displayName: this.fb.nonNullable.control('', [Validators.required]),
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    password: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form.reset({ displayName: '', email: '', password: '' });
        this.errorMessage.set(null);
      }
    });
  }

  dismiss(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { displayName, email, password } = this.form.getRawValue();

    this.teamService.createTeamMember({ displayName, email, password }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.created.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this user.');
      },
    });
  }
}
