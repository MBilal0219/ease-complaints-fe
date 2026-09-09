import { ChangeDetectionStrategy, Component, OnInit, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';

/**
 * Lets Admin attach a new Party to an existing customer org instead of
 * always creating a brand-new Company — see docs/modules/sales-person-role.md
 * and docs/modules/company-management.md. Three choices, encoded as a single
 * CVA<string | null> value so this stays a plain `formControlName`:
 *   - `null` (default): create a brand-new Company + Branch, unchanged from
 *     Module 1 — the parent form's own text fields drive this.
 *   - `"company:<id>"`: add a new Branch under this existing Company.
 *   - `"branch:<id>"`: attach directly to this existing, currently-unowned
 *     Branch (typically pre-created via the Companies page) — no new Branch
 *     is created. Only Branches with no owner yet are offered here.
 * The parent decodes the prefix when building its create-party request —
 * see PartyFormModal.submit().
 */
@Component({
  selector: 'app-company-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (companies().length > 0 || unownedBranches().length > 0) {
      <div class="flex items-center gap-2">
        <input
          id="company-picker-existing"
          type="checkbox"
          [checked]="useExisting()"
          (change)="toggleUseExisting($any($event.target).checked)"
          [disabled]="disabled()"
          class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label for="company-picker-existing" class="text-sm text-slate-700">Attach to an existing company or branch instead</label>
      </div>

      @if (useExisting()) {
        <select
          [value]="selected()"
          (change)="select($any($event.target).value)"
          [disabled]="disabled()"
          class="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          @if (unownedBranches().length > 0) {
            <optgroup label="Existing branch (this party becomes its owner)">
              @for (branch of unownedBranches(); track branch.branchId) {
                <option [value]="'branch:' + branch.branchId">{{ branch.companyName }} — {{ branch.branchName }}</option>
              }
            </optgroup>
          }
          @if (companies().length > 0) {
            <optgroup label="Existing company (add a new branch to it)">
              @for (company of companies(); track company.companyId) {
                <option [value]="'company:' + company.companyId">{{ company.companyName }}</option>
              }
            </optgroup>
          }
        </select>
      }
    }
  `,
})
export class CompanyPicker implements ControlValueAccessor, OnInit {
  private readonly adminService = inject(AdminService);

  protected readonly companies = signal<{ companyId: string; companyName: string }[]>([]);
  protected readonly unownedBranches = signal<{ branchId: string; branchName: string; companyName: string }[]>([]);
  protected readonly useExisting = signal(false);
  protected readonly selected = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    this.adminService.getAssignableBranches().subscribe({
      next: (all) => {
        const customerBranches = all.filter((o) => !o.isInternal);

        const seenCompanies = new Map<string, string>();
        for (const branch of customerBranches) {
          if (!seenCompanies.has(branch.companyId)) {
            seenCompanies.set(branch.companyId, branch.companyName);
          }
        }
        this.companies.set([...seenCompanies.entries()].map(([companyId, companyName]) => ({ companyId, companyName })));

        this.unownedBranches.set(
          customerBranches
            .filter((b) => !b.ownerUserId)
            .map((b) => ({ branchId: b.branchId, branchName: b.branchName, companyName: b.companyName })),
        );
      },
    });
  }

  writeValue(value: string | null): void {
    this.selected.set(value ?? '');
    this.useExisting.set(!!value);
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

  toggleUseExisting(useExisting: boolean): void {
    this.useExisting.set(useExisting);
    if (!useExisting) {
      this.selected.set('');
      this.onChange(null);
    } else {
      const first = this.unownedBranches()[0] ? `branch:${this.unownedBranches()[0].branchId}` : this.companies()[0] ? `company:${this.companies()[0].companyId}` : '';
      this.selected.set(first);
      this.onChange(first || null);
    }
    this.onTouched();
  }

  select(value: string): void {
    this.selected.set(value);
    this.onChange(value || null);
  }
}
