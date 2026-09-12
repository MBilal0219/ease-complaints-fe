import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { ImplementatorWorkload } from '../../../core/admin/models';
import { Modal } from '../../../shared/ui/modal/modal';

/** The Admin Dashboard's Implementators card popup — one card per Implementator, same composition pattern as SalesWorkloadModal. */
@Component({
  selector: 'app-implementator-workload-modal',
  imports: [RouterLink, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()" maxWidthClass="max-w-3xl">
      <h2 class="text-base font-semibold text-slate-900">Implementators</h2>
      <p class="mt-1 text-sm text-slate-500">Subcomplaints triaged (assigned, resolved, rejected, or marked as sale) by implementator.</p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          @for (row of rows(); track row.implementatorUserId) {
            <a
              [routerLink]="['/app/admin/implementators', row.implementatorUserId]"
              (click)="dismiss()"
              class="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-md"
            >
              <p class="font-semibold text-slate-900">{{ row.implementatorDisplayName }}</p>
              <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt class="text-slate-500">Subcomplaints triaged</dt>
                <dd class="text-right font-medium text-amber-700">{{ row.triagedCount }}</dd>
              </dl>
            </a>
          } @empty {
            <p class="col-span-2 p-8 text-center text-sm text-slate-500">No implementators yet.</p>
          }
        </div>
      }
    </app-modal>
  `,
})
export class ImplementatorWorkloadModal {
  readonly open = input.required<boolean>();
  /** Defaults to today — see AdminDashboardPage's date-range picker. */
  readonly dateFrom = input<string | undefined>(undefined);
  readonly dateTo = input<string | undefined>(undefined);
  readonly closed = output<void>();

  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<ImplementatorWorkload[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        this.loading.set(true);
        this.adminService
          .getImplementatorWorkload(this.dateFrom(), this.dateTo())
          .pipe(catchError(() => of([] as ImplementatorWorkload[])))
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
