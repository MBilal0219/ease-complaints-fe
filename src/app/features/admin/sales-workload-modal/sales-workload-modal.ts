import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { SalesPersonWorkload } from '../../../core/admin/models';
import { Modal } from '../../../shared/ui/modal/modal';

/** The Admin Dashboard's Sales card popup — one card per Sales Person, same composition pattern as DeveloperWorkloadModal. */
@Component({
  selector: 'app-sales-workload-modal',
  imports: [DecimalPipe, RouterLink, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()" maxWidthClass="max-w-3xl">
      <h2 class="text-base font-semibold text-slate-900">Sales</h2>
      <p class="mt-1 text-sm text-slate-500">Performance by sales person, highest total calls first.</p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          @for (row of rows(); track row.salesPersonUserId; let i = $index) {
            <a
              [routerLink]="['/app/admin/sales-people', row.salesPersonUserId]"
              (click)="dismiss()"
              class="block rounded-lg border p-4 hover:shadow-md"
              [class]="rankClass(i)"
            >
              <p class="font-semibold text-slate-900">{{ row.salesPersonDisplayName }}</p>
              <p class="mt-1 text-sm text-slate-600">
                Deals closed / follow-up calls made: <span class="font-medium text-fuchsia-700">{{ row.dealsCount }}/{{ row.leadCallsCount }}</span>
              </p>
              <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt class="text-slate-500">Calls to existing customers</dt>
                <dd class="text-right font-medium text-teal-700">{{ row.referralCallsCount }}</dd>
                <dt class="text-slate-500">Follow-up calls to referred leads</dt>
                <dd class="text-right font-medium text-sky-700">{{ row.leadCallsCount }}</dd>
                <dt class="text-slate-500">New referrals collected</dt>
                <dd class="text-right font-medium text-cyan-700">{{ row.referralsCollectedCount }}</dd>
                <dt class="text-slate-500">Warm-category customers</dt>
                <dd class="text-right font-medium text-amber-700">{{ row.warmCount }}</dd>
                <dt class="text-slate-500">Deals closed</dt>
                <dd class="text-right font-medium text-emerald-700">{{ row.dealsCount }}</dd>
                <dt class="text-slate-500">Warm → Cool transitions</dt>
                <dd class="text-right font-medium text-sky-700">{{ row.warmToCoolCount }}</dd>
                <dt class="text-slate-500">Pending deal value</dt>
                <dd class="text-right font-medium text-emerald-700">{{ row.pendingAmount | number: '1.0-2' }}</dd>
              </dl>
            </a>
          } @empty {
            <p class="col-span-2 p-8 text-center text-sm text-slate-500">No sales people yet.</p>
          }
        </div>
      }
    </app-modal>
  `,
})
export class SalesWorkloadModal {
  readonly open = input.required<boolean>();
  /** Defaults to today — see AdminDashboardPage's date-range picker. */
  readonly dateFrom = input<string | undefined>(undefined);
  readonly dateTo = input<string | undefined>(undefined);
  readonly closed = output<void>();

  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<SalesPersonWorkload[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        this.loading.set(true);
        this.adminService
          .getSalesPersonWorkload(this.dateFrom(), this.dateTo())
          .pipe(catchError(() => of([] as SalesPersonWorkload[])))
          .subscribe((rows) => {
            // Backend already sorts by referralCallsCount + leadCallsCount descending.
            this.rows.set(rows);
            this.loading.set(false);
          });
      });
  }

  /** Tiered highlight for the top three rows — the list is already highest-calls-first. */
  protected rankClass(index: number): string {
    if (index === 0) return 'border-amber-300 bg-amber-50';
    if (index === 1) return 'border-slate-300 bg-slate-50';
    if (index === 2) return 'border-orange-200 bg-orange-50';
    return 'border-slate-200 bg-white';
  }

  dismiss(): void {
    this.closed.emit();
  }
}
