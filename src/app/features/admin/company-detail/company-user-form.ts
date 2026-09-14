import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { CompanyBranch, CompanyUser } from '../../../core/admin/models';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

/**
 * The company-detail screen's right-hand "add/edit user" panel — a trimmed
 * party form scoped to one company. Branch is a required <select> of that
 * company's own branches, defaulting to the first (Head Office). Doubles as
 * the edit form: when `editingUser` is set (a row's "Edit" was clicked), it
 * prefills from that user, drops the password field (not editable here —
 * use the separate password-reset flow), and the submit button becomes
 * "Update". See docs/modules/company-management.md.
 */
@Component({
  selector: 'app-company-user-form',
  imports: [ReactiveFormsModule, PasswordInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">{{ editingUser() ? 'Edit user' : 'Add a user' }}</h2>
        @if (editingUser()) {
          <button type="button" (click)="cancelEdit()" class="text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button>
        }
      </div>
      <p class="mt-1 text-xs text-slate-500">
        {{ editingUser() ? 'Change this user\\'s own details or move them to another branch.' : 'First user on a branch owns it; the rest join as team members.' }}
      </p>

      <form class="mt-4 space-y-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="cu-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="cu-name" type="text" formControlName="displayName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="cu-email" class="block text-sm font-medium text-slate-700">Email</label>
          <input id="cu-email" type="email" formControlName="email" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="cu-location" class="block text-sm font-medium text-slate-700">Location <span class="text-slate-400">(optional)</span></label>
          <input id="cu-location" type="text" formControlName="location" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="cu-phone" class="block text-sm font-medium text-slate-700">Owner phone number <span class="text-slate-400">(optional)</span></label>
          <input id="cu-phone" type="tel" formControlName="phoneNumber" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="cu-branch" class="block text-sm font-medium text-slate-700">Branch</label>
          <select id="cu-branch" formControlName="branchId" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            @for (branch of branches(); track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>
        </div>
        @if (!editingUser()) {
          <div>
            <label for="cu-password" class="block text-sm font-medium text-slate-700">Password</label>
            <app-password-input inputId="cu-password" autocomplete="new-password" formControlName="password" />
          </div>
        }

        @if (errorMessage()) {
          <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
        }

        <button
          type="submit"
          [disabled]="form.invalid || submitting()"
          class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ submitButtonLabel() }}
        </button>
      </form>
    </div>
  `,
})
export class CompanyUserForm {
  readonly companyId = input.required<string>();
  readonly branches = input.required<CompanyBranch[]>();
  /** Non-null while a row's "Edit" is active — switches the form to edit mode. */
  readonly editingUser = input<CompanyUser | null>(null);
  readonly added = output<void>();
  readonly updated = output<void>();
  readonly editCancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    location: [''],
    phoneNumber: [''],
    branchId: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly submitButtonLabel = computed(() => {
    if (this.submitting()) return this.editingUser() ? 'Updating…' : 'Saving…';
    return this.editingUser() ? 'Update user' : 'Add user';
  });

  constructor() {
    // Default the branch to the first (Head Office) once branches arrive
    // (add mode only — edit mode's prefill effect below owns branchId then).
    effect(() => {
      const list = this.branches();
      const current = this.form.controls.branchId.value;
      if (!this.editingUser() && list.length && !list.some((b) => b.id === current)) {
        this.form.controls.branchId.setValue(list[0].id);
      }
    });

    // Prefill from the row being edited; drop back to a clean "Add" form
    // once editingUser clears (Cancel, or a successful Update).
    effect(() => {
      const user = this.editingUser();
      this.errorMessage.set(null);
      if (user) {
        this.form.controls.password.clearValidators();
        this.form.controls.password.updateValueAndValidity();
        this.form.reset({
          displayName: user.displayName,
          email: user.email,
          location: user.location ?? '',
          phoneNumber: user.phoneNumber ?? '',
          branchId: user.branchId,
          password: '',
        });
      } else {
        this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
        this.form.controls.password.updateValueAndValidity();
        this.form.reset({ displayName: '', email: '', location: '', phoneNumber: '', branchId: this.branches()[0]?.id ?? '', password: '' });
      }
    });
  }

  cancelEdit(): void {
    this.editCancelled.emit();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    const { displayName, email, location, phoneNumber, branchId, password } = this.form.getRawValue();
    const editing = this.editingUser();

    const request$ = editing
      ? this.adminService.updateCompanyUser(this.companyId(), editing.id, {
          displayName,
          email,
          branchId,
          location: location.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
        })
      : this.adminService.addCompanyUser(this.companyId(), {
          displayName,
          email,
          branchId,
          location: location.trim() || undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          password,
        });

    request$.subscribe({
      next: () => {
        this.submitting.set(false);
        if (editing) {
          this.updated.emit();
        } else {
          this.form.reset({ displayName: '', email: '', location: '', phoneNumber: '', branchId: this.branches()[0]?.id ?? '', password: '' });
          this.added.emit();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? (editing ? 'Could not update this user.' : 'Could not add this user.'));
      },
    });
  }
}
