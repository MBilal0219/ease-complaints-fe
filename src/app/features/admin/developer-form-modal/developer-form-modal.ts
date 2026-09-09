import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { InvitationsService } from '../../../core/admin/invitations.service';
import { BranchSelect } from '../../../shared/ui/branch-select/branch-select';
import { Modal } from '../../../shared/ui/modal/modal';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';
import { Toggle } from '../../../shared/ui/toggle/toggle';

@Component({
  selector: 'app-developer-form-modal',
  imports: [ReactiveFormsModule, Modal, PasswordInput, Toggle, BranchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">Add a Developer</h2>
      <p class="mt-1 text-sm text-slate-500">Create a team member account who resolves complaints.</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="dev-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="dev-name" type="text" formControlName="displayName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="dev-email" class="block text-sm font-medium text-slate-700">Email</label>
          <input id="dev-email" type="email" formControlName="email" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div class="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div>
            <p class="text-sm font-medium text-slate-700">Send email invitation</p>
            <p class="text-xs text-slate-500">Recipient sets their own password. Turn off to set one yourself.</p>
          </div>
          <app-toggle formControlName="sendInvite" />
        </div>

        @if (!form.controls.sendInvite.value) {
          <div>
            <label for="dev-password" class="block text-sm font-medium text-slate-700">Password</label>
            <app-password-input inputId="dev-password" autocomplete="new-password" formControlName="password" />
          </div>
        }

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
            {{ submitButtonLabel() }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class DeveloperFormModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();
  readonly created = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly invitationsService = inject(InvitationsService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    displayName: this.fb.nonNullable.control('', [Validators.required]),
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    sendInvite: this.fb.nonNullable.control(true),
    password: this.fb.nonNullable.control(''),
    // Only used on the direct-create path (sendInvite off) — see docs/modules/sales-person-role.md.
    branchId: this.fb.control<string | null>(null),
  });

  constructor() {
    this.form.controls.sendInvite.valueChanges.subscribe((sendInvite) => {
      const passwordControl = this.form.controls.password;
      passwordControl.setValidators(sendInvite ? [] : [Validators.required, Validators.minLength(8)]);
      passwordControl.updateValueAndValidity();
    });

    effect(() => {
      if (this.open()) {
        this.form.reset({ displayName: '', email: '', sendInvite: true, password: '', branchId: null });
        this.errorMessage.set(null);
      }
    });
  }

  protected submitButtonLabel(): string {
    if (this.submitting()) return 'Saving…';
    return this.form.controls.sendInvite.value ? 'Send invitation' : 'Save user';
  }

  dismiss(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { displayName, email, sendInvite, password, branchId } = this.form.getRawValue();

    const request$: Observable<unknown> = sendInvite
      ? this.invitationsService.create({ displayName, email, role: 'Developer', branchId: branchId ?? undefined })
      : this.adminService.createDeveloper({ displayName, email, password, branchId: branchId ?? undefined });

    request$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.created.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this developer.');
      },
    });
  }
}
