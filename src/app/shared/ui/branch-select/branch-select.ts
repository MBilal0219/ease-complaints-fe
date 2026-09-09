import { ChangeDetectionStrategy, Component, OnInit, forwardRef, inject, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';

/**
 * Picks which Branch of the internal Company a new Developer/Sales Person
 * account belongs to — see docs/modules/sales-person-role.md. Defaults to
 * the first internal Branch it finds (today, always the one auto-created
 * "Head Office" branch — the same default the backend falls back to when no
 * BranchId is sent at all). ControlValueAccessor<string>, wired via
 * `formControlName`.
 */
@Component({
  selector: 'app-branch-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => BranchSelect),
      multi: true,
    },
  ],
  template: `
    @if (loading()) {
      <p class="text-sm text-slate-500">Loading branches…</p>
    } @else if (options().length === 0) {
      <p class="text-sm text-red-600">No internal branch exists yet — this shouldn't happen.</p>
    } @else {
      <select
        [value]="selectedId()"
        (change)="select($any($event.target).value)"
        [disabled]="disabled()"
        class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        @for (option of options(); track option.branchId) {
          <option [value]="option.branchId">{{ option.companyName }} — {{ option.branchName }}</option>
        }
      </select>
    }
  `,
})
export class BranchSelect implements ControlValueAccessor, OnInit {
  private readonly adminService = inject(AdminService);

  protected readonly options = signal<{ branchId: string; branchName: string; companyName: string }[]>([]);
  protected readonly loading = signal(true);
  protected readonly selectedId = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    this.adminService.getAssignableBranches().subscribe({
      next: (all) => {
        const internal = all.filter((o) => o.isInternal);
        this.options.set(internal);
        this.loading.set(false);
        if (internal.length > 0 && !this.selectedId()) {
          this.select(internal[0].branchId);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  writeValue(value: string | null): void {
    this.selectedId.set(value ?? '');
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

  select(branchId: string): void {
    this.selectedId.set(branchId);
    this.onChange(branchId || null);
    this.onTouched();
  }
}
