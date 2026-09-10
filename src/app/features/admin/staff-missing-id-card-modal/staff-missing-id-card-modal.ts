import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { StaffMissingIdCardRow } from '../../../core/admin/models';
import { Modal } from '../../../shared/ui/modal/modal';

const GROUPS: { role: string; label: string; route: string }[] = [
  { role: 'Developer', label: 'Developers', route: 'developers' },
  { role: 'SalesPerson', label: 'Sales People', route: 'sales-people' },
  { role: 'Implementator', label: 'Implementators', route: 'implementators' },
];

/** The Admin Dashboard's "Missing ID Card" alert popup — staff grouped by role, each linking to their profile. Same composition as DeveloperWorkloadModal. */
@Component({
  selector: 'app-staff-missing-id-card-modal',
  imports: [RouterLink, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()" maxWidthClass="max-w-2xl">
      <h2 class="text-base font-semibold text-slate-900">Missing ID card</h2>
      <p class="mt-1 text-sm text-slate-500">Staff without a complete ID card (number + front + back).</p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else if (rows().length === 0) {
        <p class="mt-6 p-6 text-center text-sm text-slate-500">Everyone's ID card is on file. 🎉</p>
      } @else {
        <div class="mt-4 space-y-4">
          @for (group of grouped(); track group.label) {
            @if (group.rows.length > 0) {
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ group.label }} ({{ group.rows.length }})</p>
                <ul class="mt-1.5 divide-y divide-slate-100 rounded-md border border-slate-200">
                  @for (row of group.rows; track row.id) {
                    <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <p class="font-medium text-slate-800">{{ row.displayName }}</p>
                        <p class="text-xs text-slate-500">
                          {{ row.branchName }}
                          @if (row.developerTypeName) { · {{ row.developerTypeName }} }
                          @if (row.rankName) { · {{ row.rankName }} }
                        </p>
                      </div>
                      @if (linkBase()) {
                        <a [routerLink]="[linkBase(), group.route, row.id]" (click)="dismiss()" class="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-500">View profile</a>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
          }
        </div>
      }
    </app-modal>
  `,
})
export class StaffMissingIdCardModal {
  readonly open = input.required<boolean>();
  /** Route prefix for the "View profile" links, or null to hide them (e.g. the Implementator dashboard, which has no staff detail pages). */
  readonly linkBase = input<string | null>('/app/admin');
  readonly closed = output<void>();

  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<StaffMissingIdCardRow[]>([]);
  protected readonly loading = signal(true);

  protected readonly grouped = computed(() =>
    GROUPS.map((g) => ({ ...g, rows: this.rows().filter((r) => r.role === g.role) })),
  );

  constructor() {
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        this.loading.set(true);
        this.adminService
          .getStaffMissingIdCard()
          .pipe(catchError(() => of([] as StaffMissingIdCardRow[])))
          .subscribe((rows) => {
            this.rows.set(rows);
            this.loading.set(false);
          });
      });
  }

  dismiss(): void {
    this.closed.emit();
  }
}
