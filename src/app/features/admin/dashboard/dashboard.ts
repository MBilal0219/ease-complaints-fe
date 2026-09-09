import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { DashboardStats } from '../../../core/admin/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { PENDING_STATUS_QUERY_VALUE } from '../../../core/tickets/models';

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

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Dashboard</h1>
    <p class="mt-1 text-sm text-slate-500">Overview of parties, developers, and complaint activity.</p>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (stats(); as s) {
      <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
  `,
})
export class DashboardPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected readonly cards = CARDS;
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly loading = signal(true);

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
  }
}
