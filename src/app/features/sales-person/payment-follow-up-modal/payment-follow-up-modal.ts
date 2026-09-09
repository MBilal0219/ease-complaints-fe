import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { PAYMENT_STATUS_LABELS, PaymentFollowUpCustomer } from '../../../core/sales-person/models';
import { SalesPersonService } from '../../../core/sales-person/sales-person.service';
import { logCallPrefillKey } from '../log-call/log-call';
import { Modal } from '../../../shared/ui/modal/modal';

/** Local calendar date as YYYY-MM-DD — see reports-modal.ts's own copy of this helper for why not toISOString(). */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(fromDateUtc: string, today: Date): number {
  const from = new Date(fromDateUtc);
  const fromDateOnly = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayDateOnly.getTime() - fromDateOnly.getTime()) / 86_400_000);
}

/**
 * The Overdue/Upcoming Payments dashboard cards' popup — lists customers
 * whose latest Payment call is overdue or due within a week (see
 * ICallService.GetOverduePaymentsAsync/GetUpcomingPaymentsAsync), each with
 * a Call and a WhatsApp quick action. Composed the same way ReportsModal
 * wraps the shared Modal — this component's own `closed` output, not
 * Modal's `close`, is what callers bind to.
 */
@Component({
  selector: 'app-payment-follow-up-modal',
  imports: [DatePipe, DecimalPipe, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ kind() === 'overdue' ? 'Overdue Payments' : 'Upcoming Payments' }}</h2>
      <p class="mt-1 text-sm text-slate-500">
        {{ kind() === 'overdue' ? 'Payments past their due date — call or message these customers.' : 'Payments due within the next 7 days.' }}
      </p>

      @if (loading()) {
        <p class="mt-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-4 max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          @for (row of rows(); track row.customerUserId) {
            <div class="p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-slate-900">{{ row.customerCompanyName || row.customerDisplayName }}</p>
                  <p class="text-xs text-slate-500">{{ row.customerDisplayName }}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-emerald-700">{{ row.amountDue != null ? (row.amountDue | number: '1.0-2') : '—' }}</p>
                  @if (row.dueDateUtc) {
                    <p class="text-xs" [class]="kind() === 'overdue' ? 'text-red-600' : 'text-amber-600'">
                      {{ kind() === 'overdue' ? daysOverdue(row.dueDateUtc) + ' day(s) overdue' : 'due in ' + daysUntil(row.dueDateUtc) + ' day(s)' }}
                      · {{ row.dueDateUtc | date: 'mediumDate' }}
                    </p>
                  }
                  <p class="text-xs text-slate-400">{{ statusLabels[row.status] }}</p>
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  (click)="callCustomer(row)"
                  class="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                >
                  Call
                </button>
                <button
                  type="button"
                  [disabled]="!row.customerPhoneNumber"
                  (click)="messageOnWhatsApp(row)"
                  class="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  WhatsApp
                </button>
              </div>
            </div>
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
export class PaymentFollowUpModal {
  readonly open = input.required<boolean>();
  readonly kind = input.required<'overdue' | 'upcoming'>();
  readonly closed = output<void>();

  protected readonly statusLabels = PAYMENT_STATUS_LABELS;

  private readonly salesPersonService = inject(SalesPersonService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<PaymentFollowUpCustomer[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    // Same "only do real work once open() is actually true" guard as
    // ReportsModal — see its own constructor doc comment for why this can't
    // just be an @if in the template.
    toObservable(this.open)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOpen) => {
        if (!isOpen) return;
        this.loading.set(true);
        const request = this.kind() === 'overdue' ? this.salesPersonService.getOverduePayments() : this.salesPersonService.getUpcomingPayments();
        request.pipe(catchError(() => of([] as PaymentFollowUpCustomer[]))).subscribe((rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        });
      });
  }

  dismiss(): void {
    this.closed.emit();
  }

  protected daysOverdue(dueDateUtc: string): number {
    return daysBetween(dueDateUtc, new Date());
  }

  protected daysUntil(dueDateUtc: string): number {
    return -daysBetween(dueDateUtc, new Date());
  }

  /** Writes a prefill payload the Log a Call page picks up on load — see log-call.ts's own handling of logCallPrefillKey. */
  protected callCustomer(row: PaymentFollowUpCustomer): void {
    const userId = this.authService.currentUser()?.id;
    if (userId) {
      localStorage.setItem(
        logCallPrefillKey(userId),
        JSON.stringify({
          customerId: row.customerUserId,
          customerDisplayName: row.customerDisplayName,
          customerCompanyName: row.customerCompanyName,
          followUpForCallId: row.callId,
        }),
      );
    }
    this.dismiss();
    this.router.navigate(['/app/sales-person/calls/new']);
  }

  protected messageOnWhatsApp(row: PaymentFollowUpCustomer): void {
    if (!row.customerPhoneNumber) return;
    const phoneDigits = row.customerPhoneNumber.replace(/[^\d]/g, '');
    const amountLine = row.amountDue != null ? ` of ${row.amountDue}` : '';
    const dueLine = row.dueDateUtc
      ? this.kind() === 'overdue'
        ? ` that was due on ${new Date(row.dueDateUtc).toLocaleDateString()}`
        : ` due on ${new Date(row.dueDateUtc).toLocaleDateString()}`
      : '';
    const message = `Hi ${row.customerDisplayName}, this is a reminder about your pending payment${amountLine}${dueLine}. Please let us know if you have any questions.`;
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }
}
