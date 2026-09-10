import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { CompanyBranch } from '../../../core/admin/models';
import { PasswordInput } from '../../../shared/ui/password-input/password-input';

/**
 * The company-detail screen's right-hand "add user" panel — a trimmed party
 * form scoped to one company. Branch is a required <select> of that company's
 * own branches, defaulting to the first (Head Office). Password-only: the
 * first user of an unowned branch becomes its owner (BranchAdmin), everyone
 * after is a plain User. See docs/modules/company-management.md.
 */
@Component({
  selector: 'app-company-user-form',
  imports: [ReactiveFormsModule, PasswordInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-900">Add a user</h2>
      <p class="mt-1 text-xs text-slate-500">First user on a branch owns it; the rest join as team members.</p>

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
        <div>
          <label for="cu-password" class="block text-sm font-medium text-slate-700">Password</label>
          <app-password-input inputId="cu-password" autocomplete="new-password" formControlName="password" />
        </div>

        @if (errorMessage()) {
          <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
        }

        <button
          type="submit"
          [disabled]="form.invalid || submitting()"
          class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ submitting() ? 'Saving…' : 'Add user' }}
        </button>
      </form>
    </div>
  `,
})
export class CompanyUserForm {
  readonly companyId = input.required<string>();
  readonly branches = input.required<CompanyBranch[]>();
  readonly added = output<void>();

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

  constructor() {
    // Default the branch to the first (Head Office) once branches arrive, and
    // keep a valid selection if the list changes underneath us.
    effect(() => {
      const list = this.branches();
      const current = this.form.controls.branchId.value;
      if (list.length && !list.some((b) => b.id === current)) {
        this.form.controls.branchId.setValue(list[0].id);
      }
    });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    const { displayName, email, location, phoneNumber, branchId, password } = this.form.getRawValue();

    this.adminService
      .addCompanyUser(this.companyId(), {
        displayName,
        email,
        branchId,
        location: location.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        password,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.form.reset({ displayName: '', email: '', location: '', phoneNumber: '', branchId: this.branches()[0]?.id ?? '', password: '' });
          this.added.emit();
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(error.error?.error ?? 'Could not add this user.');
        },
      });
  }
}
