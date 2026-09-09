import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * Pre-creates a Company + its first Branch with no owning User yet — see
 * docs/modules/company-management.md. A Party can later be attached to this
 * exact Branch (as its owner) via the "add user" forms' Company/Branch
 * picker, instead of always spinning up a brand-new Company/Branch pair.
 */
@Component({
  selector: 'app-company-form-modal',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">Add a Company</h2>
      <p class="mt-1 text-sm text-slate-500">Creates the company and its first branch — no user is created here.</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="company-name" class="block text-sm font-medium text-slate-700">Company name</label>
          <input id="company-name" type="text" formControlName="companyName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="company-branch-name" class="block text-sm font-medium text-slate-700">First branch name</label>
          <input id="company-branch-name" type="text" formControlName="branchName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
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
            {{ submitting() ? 'Saving…' : 'Create company' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class CompanyFormModal {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();
  readonly created = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    companyName: ['', [Validators.required]],
    branchName: ['', [Validators.required]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form.reset({ companyName: '', branchName: '' });
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
    const { companyName, branchName } = this.form.getRawValue();

    this.adminService.createCompany({ companyName, branchName }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.created.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not create this company.');
      },
    });
  }
}
