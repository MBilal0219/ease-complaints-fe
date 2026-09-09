import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { BranchSelect } from '../../../shared/ui/branch-select/branch-select';
import { Modal } from '../../../shared/ui/modal/modal';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

/**
 * Direct-create only, same as SalesPersonFormModal (which this is an exact
 * copy of) — Implementator isn't an invitable role either. Account
 * management only for now — see backend RoleNames.Implementator's own doc
 * comment.
 */
@Component({
  selector: 'app-implementator-form-modal',
  imports: [ReactiveFormsModule, Modal, PasswordInput, BranchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">Add an Implementator</h2>
      <p class="mt-1 text-sm text-slate-500">Create a team member who will handle the complaint workflow.</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="impl-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="impl-name" type="text" formControlName="displayName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="impl-email" class="block text-sm font-medium text-slate-700">Email</label>
          <input id="impl-email" type="email" formControlName="email" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="impl-password" class="block text-sm font-medium text-slate-700">Password</label>
          <app-password-input inputId="impl-password" autocomplete="new-password" formControlName="password" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Branch</label>
          <app-branch-select formControlName="branchId" />
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
export class ImplementatorFormModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();
  readonly created = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    displayName: this.fb.nonNullable.control('', [Validators.required]),
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    password: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
    branchId: this.fb.control<string | null>(null),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form.reset({ displayName: '', email: '', password: '', branchId: null });
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
    const { displayName, email, password, branchId } = this.form.getRawValue();

    this.adminService.createImplementator({ displayName, email, password, branchId: branchId ?? undefined }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.created.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this implementator.');
      },
    });
  }
}
