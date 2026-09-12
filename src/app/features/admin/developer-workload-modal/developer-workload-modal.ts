import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { DeveloperWorkload } from '../../../core/admin/models';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * The Admin Dashboard's Developers card popup — one card per Developer with
 * their task workload, click-through to that Developer's existing detail
 * page (person-detail.ts). Same composition pattern as PaymentFollowUpModal
 * (wraps Modal, own `closed` output, fetch-on-open guard).
 */
@Component({
  selector: 'app-developer-workload-modal',
  imports: [DecimalPipe, RouterLink, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()" maxWidthClass="max-w-3xl">
      <h2 class="text-base font-semibold text-slate-900">Developers</h2>
      <p class="mt-1 text-sm text-slate-500">Task workload by developer.</p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          @for (row of rows(); track row.developerId) {
            <a
              [routerLink]="detailBase() ? [detailBase(), row.developerId] : null"
              (click)="dismiss()"
              class="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-md"
            >
              <p class="font-semibold text-slate-900">{{ row.developerDisplayName }}</p>
              <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt class="text-slate-500">Customers served</dt>
                <dd class="text-right font-medium text-slate-700">{{ row.totalParties }}</dd>
                <dt class="text-slate-500">Complaints pending</dt>
                <dd class="text-right font-medium text-amber-700">{{ row.pendingTasks }}</dd>
                <dt class="text-slate-500">Complaints completed</dt>
                <dd class="text-right font-medium text-emerald-700">{{ row.completedTasks }}</dd>
                <dt class="text-slate-500">Total complaints assigned</dt>
                <dd class="text-right font-medium text-slate-700">{{ row.totalTasks }}</dd>
                @if (!hidePendingAmount()) {
                  <dt class="text-slate-500">Estimated amount pending delivery</dt>
                  <dd class="text-right font-medium text-emerald-700">{{ row.pendingAmount | number: '1.0-2' }}</dd>
                }
              </dl>
            </a>
          } @empty {
            <p class="col-span-2 p-8 text-center text-sm text-slate-500">No developers yet.</p>
          }
        </div>
      }
    </app-modal>
  `,
})
export class DeveloperWorkloadModal {
  readonly open = input.required<boolean>();
  /** Last-30-days by default — see AdminDashboardPage. */
  readonly dateFrom = input<string | undefined>(undefined);
  readonly dateTo = input<string | undefined>(undefined);
  /** Route prefix for the per-developer click-through, or null to render the cards as non-links (e.g. from the Implementator dashboard, which has no developer detail page). */
  readonly detailBase = input<string | null>('/app/admin/developers');
  /** Implementator dashboard doesn't show payment/amount data — see ImplementatorDashboardPage. Defaults to false so the Admin dashboard is unaffected. */
  readonly hidePendingAmount = input<boolean>(false);
  readonly closed = output<void>();

  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<DeveloperWorkload[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        this.loading.set(true);
        this.adminService
          .getDeveloperWorkload(this.dateFrom(), this.dateTo())
          .pipe(catchError(() => of([] as DeveloperWorkload[])))
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
