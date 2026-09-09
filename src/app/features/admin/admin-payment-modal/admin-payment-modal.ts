import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PAYMENT_STATUS_LABELS, PaymentFollowUpCustomer } from '../../../core/sales-person/models';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * The Admin Dashboard's Payments card popup — company-wide, read-only. A
 * trimmed copy of the Sales Person's own PaymentFollowUpModal: same row
 * layout (customer, status, amount, due date), but no Call/WhatsApp quick
 * actions — Admin doesn't log calls — each row links to that Party's
 * existing detail page instead.
 */
@Component({
  selector: 'app-admin-payment-modal',
  imports: [DatePipe, DecimalPipe, RouterLink, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ kind() === 'overdue' ? 'Overdue Payments' : 'Upcoming Payments' }}</h2>
      <p class="mt-1 text-sm text-slate-500">
        {{ kind() === 'overdue' ? 'Payments past their due date, company-wide.' : 'Payments due within the next 7 days, company-wide.' }}
      </p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-4 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          @for (row of rows(); track row.customerUserId) {
            <a [routerLink]="['/app/admin/parties', row.customerUserId]" (click)="dismiss()" class="block p-3 hover:bg-slate-50">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-slate-900">{{ row.customerCompanyName || row.customerDisplayName }}</p>
                  <p class="text-xs text-slate-500">{{ row.customerDisplayName }}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-emerald-700">{{ row.amountDue != null ? (row.amountDue | number: '1.0-2') : '—' }}</p>
                  @if (row.dueDateUtc) {
                    <p class="text-xs text-slate-500">{{ row.dueDateUtc | date: 'mediumDate' }}</p>
                  }
                  <p class="text-xs text-slate-400">{{ statusLabels[row.status] }}</p>
                </div>
              </div>
            </a>
          } @empty {
            <p class="p-8 text-center text-sm text-slate-500">
              {{ kind() === 'overdue' ? 'No overdue payments.' : 'No payments due in the next 7 days.' }}
            </p>
          }
        </div>
      }
    </app-modal>
  `,
})
export class AdminPaymentModal {
  readonly open = input.required<boolean>();
  readonly kind = input.required<'overdue' | 'upcoming'>();
  readonly closed = output<void>();

  protected readonly statusLabels = PAYMENT_STATUS_LABELS;

  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<PaymentFollowUpCustomer[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        this.loading.set(true);
        const request = this.kind() === 'overdue' ? this.adminService.getOverduePayments() : this.adminService.getUpcomingPayments();
        request.pipe(catchError(() => of([] as PaymentFollowUpCustomer[]))).subscribe((rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        });
      });
  }

  dismiss(): void {
    this.closed.emit();
  }
}
