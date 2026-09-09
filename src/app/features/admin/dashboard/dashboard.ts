import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { DashboardStats, DeveloperWorkload, SalesPersonWorkload } from '../../../core/admin/models';
import { PaymentFollowUpSummary } from '../../../core/sales-person/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { PENDING_STATUS_QUERY_VALUE } from '../../../core/tickets/models';
import { AdminPaymentModal } from '../admin-payment-modal/admin-payment-modal';
import { DeveloperWorkloadModal } from '../developer-workload-modal/developer-workload-modal';
import { SalesWorkloadModal } from '../sales-workload-modal/sales-workload-modal';

interface StatCard {
  label: string;
  value: (s: DashboardStats) => number;
  accent: string;
  /** Where clicking the count takes you — omitted for cards with nothing sensible to link to. */
  link?: string[];
  queryParams?: Record<string, string>;
}

const CARDS: StatCard[] = [
  { label: 'Total Parties', value: (s) => s.totalUsers, accent: 'bg-indigo-50 text-indigo-700', link: ['/app/admin/parties'] },
  { label: 'Total Developers', value: (s) => s.totalDevelopers, accent: 'bg-violet-50 text-violet-700', link: ['/app/admin/developers'] },
  { label: 'Total Sales People', value: (s) => s.totalSalesPeople, accent: 'bg-fuchsia-50 text-fuchsia-700', link: ['/app/admin/sales-people'] },
  { label: 'Total Complaints', value: (s) => s.totalTickets, accent: 'bg-slate-100 text-slate-700', link: ['/app/admin/tickets'] },
  // Pending = New + Assigned + InProgress combined (see AdminService.GetDashboardStatsAsync) —
  // the tickets list understands a comma-separated status list for exactly this case.
  { label: 'Pending', value: (s) => s.pendingCount, accent: 'bg-amber-50 text-amber-700', link: ['/app/admin/tickets'], queryParams: { status: PENDING_STATUS_QUERY_VALUE } },
  { label: 'In Progress', value: (s) => s.inProgressCount, accent: 'bg-sky-50 text-sky-700', link: ['/app/admin/tickets'], queryParams: { status: 'InProgress' } },
  { label: 'Resolved', value: (s) => s.resolvedCount, accent: 'bg-emerald-50 text-emerald-700', link: ['/app/admin/tickets'], queryParams: { status: 'Resolved' } },
  { label: 'Rejected', value: (s) => s.rejectedCount, accent: 'bg-rose-50 text-rose-700', link: ['/app/admin/tickets'], queryParams: { status: 'Rejected' } },
  { label: 'Closed', value: (s) => s.closedCount, accent: 'bg-slate-100 text-slate-500', link: ['/app/admin/tickets'], queryParams: { status: 'Closed' } },
  // "today"/"last7days" are resolved server-side to the exact same UTC cutoff
  // GetDashboardStatsAsync used for this count — see TicketService.SearchAsync.
  { label: 'New Today', value: (s) => s.newToday, accent: 'bg-indigo-50 text-indigo-700', link: ['/app/admin/tickets'], queryParams: { dateRange: 'today' } },
  { label: 'New Last 7 Days', value: (s) => s.newLast7Days, accent: 'bg-indigo-50 text-indigo-700', link: ['/app/admin/tickets'], queryParams: { dateRange: 'last7days' } },
  { label: 'Total Calls', value: (s) => s.totalCalls, accent: 'bg-teal-50 text-teal-700', link: ['/app/sales-person/calls'] },
  { label: 'Total Leads', value: (s) => s.totalReferrals, accent: 'bg-cyan-50 text-cyan-700', link: ['/app/admin/leads'] },
  { label: 'Complaints from Calls', value: (s) => s.complaintsFromCalls, accent: 'bg-orange-50 text-orange-700', link: ['/app/admin/tickets'] },
  { label: 'Total Sales', value: (s) => s.totalDeals, accent: 'bg-fuchsia-50 text-fuchsia-700', link: ['/app/admin/deals'] },
  { label: 'Sales Awaiting Date', value: (s) => s.deliveryDatePendingDeals, accent: 'bg-amber-50 text-amber-700', link: ['/app/admin/deals'], queryParams: { status: 'DeliveryDatePending' } },
];

/** Poll interval — a push (see docs/modules/realtime.md) merges in as an extra, earlier trigger on top of this, not a replacement for it. */
const STATS_POLL_MS = 15_000;

/** Local calendar date as YYYY-MM-DD — see calls.ts's own copy of this helper for why not toISOString(). */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function thirtyDaysAgo(): string {
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return isoDate(from);
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [DecimalPipe, RouterLink, DeveloperWorkloadModal, SalesWorkloadModal, AdminPaymentModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Dashboard</h1>
    <p class="mt-1 text-sm text-slate-500">Overview of parties, developers, and complaint activity.</p>

    <h2 class="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Overview — last 30 days</h2>
    <div class="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <button
        type="button"
        (click)="showDevelopers.set(true)"
        class="block rounded-lg border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md hover:border-slate-300"
      >
        <p class="text-xs font-medium text-slate-500">Developers</p>
        <p class="mt-2 inline-flex rounded-md bg-violet-50 px-2 py-1 text-2xl font-semibold text-violet-700">{{ stats()?.totalDevelopers ?? 0 }}</p>
        <p class="mt-1 text-sm text-slate-600">Total developers</p>
        <p class="mt-2 text-sm text-slate-600">Pending tasks: <span class="font-medium text-amber-700">{{ totalPendingTasks() }}</span></p>
        <p class="text-sm text-slate-600">Pending amount: <span class="font-medium text-emerald-700">{{ totalPendingAmount() | number: '1.0-2' }}</span></p>
      </button>

      <button
        type="button"
        (click)="showSales.set(true)"
        class="block rounded-lg border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md hover:border-slate-300"
      >
        <p class="text-xs font-medium text-slate-500">Sales</p>
        <p class="mt-2 inline-flex rounded-md bg-fuchsia-50 px-2 py-1 text-2xl font-semibold text-fuchsia-700">{{ stats()?.totalSalesPeople ?? 0 }}</p>
        <p class="mt-1 text-sm text-slate-600">Total sales people</p>
        <p class="mt-2 text-sm text-slate-600">Warm: {{ totalWarm() }} · Deals: {{ totalDeals() }} · Warm→Cool: {{ totalWarmToCool() }}</p>
        <p class="text-sm text-slate-600">Pending amount: <span class="font-medium text-emerald-700">{{ totalSalesPendingAmount() | number: '1.0-2' }}</span></p>
      </button>

      <a
        [routerLink]="['/app/admin/implementators']"
        class="block rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md hover:border-slate-300"
      >
        <p class="text-xs font-medium text-slate-500">Implementators</p>
        <p class="mt-2 inline-flex rounded-md bg-sky-50 px-2 py-1 text-2xl font-semibold text-sky-700">{{ stats()?.totalImplementators ?? 0 }}</p>
        <p class="mt-1 text-sm text-slate-600">Total implementators</p>
        <p class="mt-2 text-sm text-slate-600">Pending tasks: <span class="font-medium text-amber-700">0</span></p>
        <p class="text-sm text-slate-600">Pending amount: <span class="font-medium text-emerald-700">0.00</span></p>
        <p class="mt-2 text-xs italic text-slate-400">Not yet assigned to complaint tasks</p>
      </a>

      <button
        type="button"
        (click)="showOverduePayments.set(true)"
        class="block rounded-lg border border-red-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
      >
        <p class="text-xs font-medium text-slate-500">Overdue Payments</p>
        <p class="mt-2 inline-flex rounded-md bg-red-50 px-2 py-1 text-2xl font-semibold text-red-700">{{ paymentSummary()?.overdueCount ?? 0 }}</p>
        <p class="mt-2 text-sm text-slate-600">Total amount: {{ (paymentSummary()?.overdueTotalAmount ?? 0) | number: '1.0-2' }}</p>
      </button>

      <button
        type="button"
        (click)="showUpcomingPayments.set(true)"
        class="block rounded-lg border border-amber-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
      >
        <p class="text-xs font-medium text-slate-500">Upcoming Payments</p>
        <p class="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-2xl font-semibold text-amber-700">{{ paymentSummary()?.upcomingCount ?? 0 }}</p>
        <p class="mt-2 text-sm text-slate-600">Total amount: {{ (paymentSummary()?.upcomingTotalAmount ?? 0) | number: '1.0-2' }}</p>
      </button>

      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="text-xs font-medium text-slate-500">Total Amount</p>
        <p class="mt-2 inline-flex rounded-md bg-indigo-50 px-2 py-1 text-2xl font-semibold text-indigo-700">{{ (paymentSummary()?.totalAmount ?? 0) | number: '1.0-2' }}</p>
        <p class="mt-2 text-sm text-slate-600">Across every customer's latest payment call</p>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="text-xs font-medium text-slate-500">Paid Amount</p>
        <p class="mt-2 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-2xl font-semibold text-emerald-700">{{ (paymentSummary()?.paidAmount ?? 0) | number: '1.0-2' }}</p>
        <p class="mt-2 text-sm text-slate-600">Collected so far</p>
      </div>
    </div>

    <h2 class="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">Everything else</h2>
    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (stats(); as s) {
      <div class="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        @for (card of cards; track card.label) {
          @if (card.link) {
            <a
              [routerLink]="card.link"
              [queryParams]="card.queryParams ?? null"
              class="block rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md hover:border-slate-300"
            >
              <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
              <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">
                {{ card.value(s) }}
              </p>
            </a>
          } @else {
            <div class="rounded-lg border border-slate-200 bg-white p-4">
              <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
              <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">
                {{ card.value(s) }}
              </p>
            </div>
          }
        }
      </div>
    }

    <app-developer-workload-modal [open]="showDevelopers()" [dateFrom]="rangeFrom" [dateTo]="rangeTo" (closed)="showDevelopers.set(false)" />
    <app-sales-workload-modal [open]="showSales()" [dateFrom]="rangeFrom" [dateTo]="rangeTo" (closed)="showSales.set(false)" />
    <app-admin-payment-modal [open]="showOverduePayments()" kind="overdue" (closed)="showOverduePayments.set(false)" />
    <app-admin-payment-modal [open]="showUpcomingPayments()" kind="upcoming" (closed)="showUpcomingPayments.set(false)" />
  `,
})
export class DashboardPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected readonly cards = CARDS;
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly loading = signal(true);

  /** Last 30 days — the Overview section's fixed default range (see the module spec this dashboard implements). */
  protected readonly rangeFrom = thirtyDaysAgo();
  protected readonly rangeTo = isoDate(new Date());

  protected readonly showDevelopers = signal(false);
  protected readonly showSales = signal(false);
  protected readonly showOverduePayments = signal(false);
  protected readonly showUpcomingPayments = signal(false);

  private readonly developerWorkload = signal<DeveloperWorkload[]>([]);
  private readonly salesWorkload = signal<SalesPersonWorkload[]>([]);
  protected readonly paymentSummary = signal<PaymentFollowUpSummary | null>(null);

  protected readonly totalPendingTasks = computed(() => this.developerWorkload().reduce((sum, d) => sum + d.pendingTasks, 0));
  protected readonly totalPendingAmount = computed(() => this.developerWorkload().reduce((sum, d) => sum + d.pendingAmount, 0));
  protected readonly totalWarm = computed(() => this.salesWorkload().reduce((sum, s) => sum + s.warmCount, 0));
  protected readonly totalDeals = computed(() => this.salesWorkload().reduce((sum, s) => sum + s.dealsCount, 0));
  protected readonly totalWarmToCool = computed(() => this.salesWorkload().reduce((sum, s) => sum + s.warmToCoolCount, 0));
  protected readonly totalSalesPendingAmount = computed(() => this.salesWorkload().reduce((sum, s) => sum + s.pendingAmount, 0));

  ngOnInit(): void {
    merge(timer(0, STATS_POLL_MS), this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.adminService.getDashboardStats().pipe(catchError(() => of(null)))),
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
        switchMap(() => this.adminService.getDeveloperWorkload(this.rangeFrom, this.rangeTo).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => {
        if (rows) this.developerWorkload.set(rows);
      });

    merge(timer(0, STATS_POLL_MS), this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.adminService.getSalesPersonWorkload(this.rangeFrom, this.rangeTo).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => {
        if (rows) this.salesWorkload.set(rows);
      });

    merge(timer(0, STATS_POLL_MS), this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.adminService.getPaymentSummary().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((summary) => {
        if (summary) this.paymentSummary.set(summary);
      });
  }
}
