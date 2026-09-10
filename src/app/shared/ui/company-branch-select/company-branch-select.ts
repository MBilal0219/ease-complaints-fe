import { ChangeDetectionStrategy, Component, OnInit, computed, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';

/**
 * Two cascading dropdowns — Company, then Branch — for the internal-staff
 * create/edit forms. Emits the selected **branchId** (the backend derives the
 * company from it); Company is a UI-only filter. Nothing is preselected, so a
 * `Validators.required` on the bound control keeps the form's Save button
 * disabled until both are chosen. ControlValueAccessor<string>.
 */
@Component({
  selector: 'app-company-branch-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CompanyBranchSelect), multi: true },
  ],
  template: `
    @if (loading()) {
      <p class="text-sm text-slate-500">Loading companies…</p>
    } @else if (branches().length === 0) {
      <p class="text-sm text-red-600">No internal branch exists yet — this shouldn't happen.</p>
    } @else {
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          [value]="companyId()"
          (change)="selectCompany($any($event.target).value)"
          [disabled]="disabled()"
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Select a company…</option>
          @for (company of companies(); track company.id) {
            <option [value]="company.id">{{ company.name }}</option>
          }
        </select>
        <select
          [value]="selectedBranchId()"
          (change)="selectBranch($any($event.target).value)"
          [disabled]="disabled() || !companyId()"
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Select a branch…</option>
          @for (branch of branchesForCompany(); track branch.branchId) {
            <option [value]="branch.branchId">{{ branch.branchName }}</option>
          }
        </select>
      </div>
    }
  `,
})
export class CompanyBranchSelect implements ControlValueAccessor, OnInit {
  private readonly adminService = inject(AdminService);

  protected readonly branches = signal<{ branchId: string; branchName: string; companyId: string; companyName: string }[]>([]);
  protected readonly loading = signal(true);
  protected readonly disabled = signal(false);
  protected readonly companyId = signal('');
  protected readonly selectedBranchId = signal('');

  protected readonly companies = computed(() => {
    const seen = new Map<string, string>();
    for (const b of this.branches()) {
      if (!seen.has(b.companyId)) seen.set(b.companyId, b.companyName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  });

  protected readonly branchesForCompany = computed(() =>
    this.branches().filter((b) => b.companyId === this.companyId()),
  );

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    this.adminService.getAssignableBranches().subscribe({
      next: (all) => {
        this.branches.set(all.filter((o) => o.isInternal));
        this.loading.set(false);
        this.syncCompanyFromBranch();
      },
      error: () => this.loading.set(false),
    });
  }

  writeValue(value: string | null): void {
    this.selectedBranchId.set(value ?? '');
    this.syncCompanyFromBranch();
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  selectCompany(companyId: string): void {
    this.companyId.set(companyId);
    // Company changed — the current branch may no longer belong to it.
    this.selectedBranchId.set('');
    this.onChange(null);
    this.onTouched();
  }

  selectBranch(branchId: string): void {
    this.selectedBranchId.set(branchId);
    this.onChange(branchId || null);
    this.onTouched();
  }

  /** When an initial branchId is written in (edit mode) or branches load, pick the company that owns it. */
  private syncCompanyFromBranch(): void {
    const branchId = this.selectedBranchId();
    if (!branchId) return;
    const owner = this.branches().find((b) => b.branchId === branchId);
    if (owner) this.companyId.set(owner.companyId);
  }
}
