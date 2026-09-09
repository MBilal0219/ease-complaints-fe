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
      <p class="mt-1 text-sm text-slate-500">Warm customers, deals, and warm→cool transitions by sales person.</p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          @for (row of rows(); track row.salesPersonUserId) {
            <a
              [routerLink]="['/app/admin/sales-people', row.salesPersonUserId]"
              (click)="dismiss()"
              class="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-md"
            >
              <p class="font-semibold text-slate-900">{{ row.salesPersonDisplayName }}</p>
              <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt class="text-slate-500">Warm customers</dt>
                <dd class="text-right font-medium text-amber-700">{{ row.warmCount }}</dd>
                <dt class="text-slate-500">Deals</dt>
                <dd class="text-right font-medium text-emerald-700">{{ row.dealsCount }}</dd>
                <dt class="text-slate-500">Warm → Cool</dt>
                <dd class="text-right font-medium text-sky-700">{{ row.warmToCoolCount }}</dd>
                <dt class="text-slate-500">Pending amount</dt>
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
  /** Last-30-days by default — see AdminDashboardPage. */
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
            this.rows.set(rows);
            this.loading.set(false);
          });
      });
  }

  dismiss(): void {
    this.closed.emit();
  }
}
