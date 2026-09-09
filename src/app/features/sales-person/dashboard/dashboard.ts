import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, merge, of, switchMap, timer } from 'rxjs';
import { SalesPersonService } from '../../../core/sales-person/sales-person.service';
import { PaymentFollowUpSummary, SalesPersonDashboardStats } from '../../../core/sales-person/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { PaymentFollowUpModal } from '../payment-follow-up-modal/payment-follow-up-modal';

interface StatCard {
  label: string;
  value: (s: SalesPersonDashboardStats) => number;
  accent: string;
  link?: string[];
}

const CARDS: StatCard[] = [
  { label: 'Total Calls', value: (s) => s.totalCalls, accent: 'bg-teal-50 text-teal-700', link: ['/app/sales-person/calls'] },
  { label: 'Total Leads', value: (s) => s.totalReferrals, accent: 'bg-cyan-50 text-cyan-700', link: ['/app/sales-person/leads'] },
  { label: 'A+ Leads', value: (s) => s.aPlusReferrals, accent: 'bg-emerald-50 text-emerald-700', link: ['/app/sales-person/leads'] },
  { label: 'Cool Leads', value: (s) => s.coolReferrals, accent: 'bg-sky-50 text-sky-700', link: ['/app/sales-person/leads'] },
  { label: 'Warm Leads', value: (s) => s.warmReferrals, accent: 'bg-amber-50 text-amber-700', link: ['/app/sales-person/leads'] },
  { label: 'Complaints Filed', value: (s) => s.complaintsFiled, accent: 'bg-orange-50 text-orange-700', link: ['/app/sales-person/calls'] },
];

/** Poll interval — a push (see docs/modules/realtime.md) merges in as an extra, earlier trigger on top of this, not a replacement for it. */
const STATS_POLL_MS = 15_000;

/** 1 Lac = 100,000 — a shorter, locally-familiar way to show a large rupee figure than a long comma-grouped number. Amounts under 1 Lac just show plain comma grouping. */
function formatAmountCompact(amount: number): string {
  if (amount >= 100_000) {
    const lac = amount / 100_000;
    const trimmed = Number.isInteger(lac) ? lac.toFixed(0) : lac.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${trimmed} Lac`;
  }
  return amount.toLocaleString();
}

@Component({
  selector: 'app-sales-person-dashboard',
  imports: [RouterLink, PaymentFollowUpModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Dashboard</h1>
    <p class="mt-1 text-sm text-slate-500">Your calls, leads, and complaints filed on customers' behalf.</p>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (stats(); as s) {
      <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        @for (card of cards; track card.label) {
          <a
            [routerLink]="card.link"
            class="block rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md hover:border-slate-300"
          >
            <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
            <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">
              {{ card.value(s) }}
            </p>
          </a>
        }
      </div>
    }

    @if (paymentSummary(); as p) {
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          (click)="showOverdue.set(true)"
          class="block rounded-lg border border-red-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
        >
          <p class="text-xs font-medium text-slate-500">Overdue Payments</p>
          <p class="mt-2 inline-flex rounded-md bg-red-50 px-2 py-1 text-2xl font-semibold text-red-700">{{ p.overdueCount }}</p>
          <p class="mt-2 text-sm text-slate-600">Payment: {{ p.overdueCount }} · Total amount: {{ formatAmount(p.overdueTotalAmount) }}</p>
        </button>
        <button
          type="button"
          (click)="showUpcoming.set(true)"
          class="block rounded-lg border border-amber-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
        >
          <p class="text-xs font-medium text-slate-500">Upcoming Payments (next 7 days)</p>
          <p class="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-2xl font-semibold text-amber-700">{{ p.upcomingCount }}</p>
          <p class="mt-2 text-sm text-slate-600">Payment: {{ p.upcomingCount }} · Total amount: {{ formatAmount(p.upcomingTotalAmount) }}</p>
        </button>
      </div>
    }

    <app-payment-follow-up-modal [open]="showOverdue()" kind="overdue" (closed)="showOverdue.set(false)" />
    <app-payment-follow-up-modal [open]="showUpcoming()" kind="upcoming" (closed)="showUpcoming.set(false)" />
  `,
})
export class SalesPersonDashboardPage implements OnInit {
  private readonly salesPersonService = inject(SalesPersonService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected readonly cards = CARDS;
  protected readonly stats = signal<SalesPersonDashboardStats | null>(null);
  protected readonly paymentSummary = signal<PaymentFollowUpSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly showOverdue = signal(false);
  protected readonly showUpcoming = signal(false);

  protected readonly formatAmount = formatAmountCompact;

  ngOnInit(): void {
    merge(timer(0, STATS_POLL_MS), this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.salesPersonService.getDashboardStats().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((stats) => {
        if (stats) {
          this.stats.set(stats);
        }
        this.loading.set(false);
      });

    merge(timer(0, STATS_POLL_MS), this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.salesPersonService.getPaymentFollowUpSummary().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((summary) => {
        if (summary) this.paymentSummary.set(summary);
      });
  }
}
