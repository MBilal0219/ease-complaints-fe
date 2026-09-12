import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { InvitationsService } from '../../../core/admin/invitations.service';
import { CompanyPicker } from '../../../shared/ui/company-picker/company-picker';
import { Modal } from '../../../shared/ui/modal/modal';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';
import { Toggle } from '../../../shared/ui/toggle/toggle';

@Component({
  selector: 'app-party-form-modal',
  imports: [ReactiveFormsModule, Modal, PasswordInput, Toggle, CompanyPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">Add a Party</h2>
      <p class="mt-1 text-sm text-slate-500">Create an end-user account who can submit complaints.</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="party-name" class="block text-sm font-medium text-slate-700">Name</label>
            <input id="party-name" type="text" formControlName="displayName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label for="party-email" class="block text-sm font-medium text-slate-700">Email</label>
            <input id="party-email" type="email" formControlName="email" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label for="party-location" class="block text-sm font-medium text-slate-700">Location</label>
            <input id="party-location" type="text" formControlName="location" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label for="party-branch" class="block text-sm font-medium text-slate-700">Branch</label>
            <input id="party-branch" type="text" formControlName="branch" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div class="sm:col-span-2">
            <label for="party-phone" class="block text-sm font-medium text-slate-700">Owner phone number</label>
            <input id="party-phone" type="tel" formControlName="phoneNumber" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
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
            <label for="party-password" class="block text-sm font-medium text-slate-700">Password</label>
            <app-password-input inputId="party-password" autocomplete="new-password" formControlName="password" />
          </div>
        }

        <app-company-picker formControlName="orgSelection" />

        <div class="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div>
            <p class="text-sm font-medium text-slate-700">Allow this party to add complaints themselves</p>
            <p class="text-xs text-slate-500">Turn off if complaints should only ever be filed on their behalf.</p>
          </div>
          <app-toggle formControlName="canSelfFileComplaints" />
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
export class PartyFormModal {
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
    location: this.fb.nonNullable.control('', [Validators.required]),
    branch: this.fb.nonNullable.control('', [Validators.required]),
    phoneNumber: this.fb.nonNullable.control('', [Validators.required]),
    sendInvite: this.fb.nonNullable.control(true),
    password: this.fb.nonNullable.control(''),
    // Encoded "company:<id>" / "branch:<id>" / null — see CompanyPicker's own doc comment.
    orgSelection: this.fb.control<string | null>(null),
    canSelfFileComplaints: this.fb.nonNullable.control(true),
  });

  constructor() {
    this.form.controls.sendInvite.valueChanges.subscribe((sendInvite) => {
      const passwordControl = this.form.controls.password;
      passwordControl.setValidators(sendInvite ? [] : [Validators.required, Validators.minLength(8)]);
      passwordControl.updateValueAndValidity();
    });

    // Reset to a clean form every time the modal is (re)opened.
    effect(() => {
      if (this.open()) {
        this.form.reset({ displayName: '', email: '', location: '', branch: '', phoneNumber: '', sendInvite: true, password: '', orgSelection: null, canSelfFileComplaints: true });
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
    const { displayName, email, location, branch, phoneNumber, sendInvite, password, orgSelection, canSelfFileComplaints } = this.form.getRawValue();

    // Decode CompanyPicker's "company:<id>" / "branch:<id>" / null — see its own doc comment.
    const companyId = orgSelection?.startsWith('company:') ? orgSelection.slice('company:'.length) : undefined;
    const branchId = orgSelection?.startsWith('branch:') ? orgSelection.slice('branch:'.length) : undefined;

    const request$: Observable<unknown> = sendInvite
      ? this.invitationsService.create({ displayName, email, role: 'User', location, branch, phoneNumber, companyId, branchId, canSelfFileComplaints })
      : this.adminService.createParty({ displayName, email, location, branch, phoneNumber, password, companyId, branchId, canSelfFileComplaints });

    request$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.created.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this party.');
      },
    });
  }
}
