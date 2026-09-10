import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { DashboardStats, DeveloperWorkload } from '../../../core/admin/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { PENDING_STATUS_QUERY_VALUE } from '../../../core/tickets/models';
import { DeveloperWorkloadModal } from '../../admin/developer-workload-modal/developer-workload-modal';
import { StaffMissingIdCardModal } from '../../admin/staff-missing-id-card-modal/staff-missing-id-card-modal';

interface StatCard {
  label: string;
  value: (s: DashboardStats) => number;
  accent: string;
  link?: string[];
  queryParams?: Record<string, string>;
}

const T = ['/app/implementator/tickets'];

const CARDS: StatCard[] = [
  { label: 'Total Parties', value: (s) => s.totalUsers, accent: 'bg-indigo-50 text-indigo-700', link: ['/app/implementator/parties'] },
  { label: 'Companies', value: (s) => s.totalCompanies, accent: 'bg-emerald-50 text-emerald-700', link: ['/app/implementator/companies'] },
  { label: 'Total Developers', value: (s) => s.totalDevelopers, accent: 'bg-violet-50 text-violet-700' },
  { label: 'Total Complaints', value: (s) => s.totalTickets, accent: 'bg-slate-100 text-slate-700', link: T, queryParams: { status: '' } },
  { label: 'Pending', value: (s) => s.pendingCount, accent: 'bg-amber-50 text-amber-700', link: T, queryParams: { status: PENDING_STATUS_QUERY_VALUE } },
  { label: 'In Progress', value: (s) => s.inProgressCount, accent: 'bg-sky-50 text-sky-700', link: T, queryParams: { status: 'InProgress' } },
  { label: 'Resolved', value: (s) => s.resolvedCount, accent: 'bg-emerald-50 text-emerald-700', link: T, queryParams: { status: 'Resolved' } },
  { label: 'Rejected', value: (s) => s.rejectedCount, accent: 'bg-rose-50 text-rose-700', link: T, queryParams: { status: 'Rejected' } },
  { label: 'Closed', value: (s) => s.closedCount, accent: 'bg-slate-100 text-slate-500', link: T, queryParams: { status: 'Closed' } },
  { label: 'New Today', value: (s) => s.newToday, accent: 'bg-indigo-50 text-indigo-700', link: T, queryParams: { dateRange: 'today' } },
  { label: 'New Last 7 Days', value: (s) => s.newLast7Days, accent: 'bg-indigo-50 text-indigo-700', link: T, queryParams: { dateRange: 'last7days' } },
  { label: 'Complaints from Calls', value: (s) => s.complaintsFromCalls, accent: 'bg-orange-50 text-orange-700', link: T, queryParams: { status: '' } },
];

const STATS_POLL_MS = 15_000;

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

/**
 * The Implementator's dashboard — the complaint/company/party subset of the
 * Admin dashboard. No payments, sales, deals, leads or calls (those stay
 * Sales-Person/Admin only). Data comes from AdminSharedController, which
 * accepts both roles. See docs/modules/company-management.md.
 */
@Component({
  selector: 'app-implementator-dashboard',
  imports: [RouterLink, DeveloperWorkloadModal, StaffMissingIdCardModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Dashboard</h1>
    <p class="mt-1 text-sm text-slate-500">Overview of parties, developers, and complaint activity.</p>

    <h2 class="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Overview — last 30 days</h2>
    <div class="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <button
        type="button"
        (click)="showDevelopers.set(true)"
        class="block rounded-lg border border-slate-200 bg-white p-4 text-left transition-shadow hover:border-slate-300 hover:shadow-md"
      >
        <p class="text-xs font-medium text-slate-500">Developers</p>
        <p class="mt-2 inline-flex rounded-md bg-violet-50 px-2 py-1 text-2xl font-semibold text-violet-700">{{ stats()?.totalDevelopers ?? 0 }}</p>
        <p class="mt-1 text-sm text-slate-600">Total developers</p>
        <p class="mt-2 text-sm text-slate-600">Pending tasks: <span class="font-medium text-amber-700">{{ totalPendingTasks() }}</span></p>
      </button>

      <button
        type="button"
        (click)="showMissingIdCard.set(true)"
        class="block rounded-lg border border-amber-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
      >
        <p class="text-xs font-medium text-slate-500">Missing ID Card</p>
        <p class="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-2xl font-semibold text-amber-700">{{ stats()?.missingIdCardCount ?? 0 }}</p>
        <p class="mt-2 text-sm text-slate-600">Staff without a complete ID card</p>
      </button>
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
              class="block rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:border-slate-300 hover:shadow-md"
            >
              <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
              <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">{{ card.value(s) }}</p>
            </a>
          } @else {
            <div class="rounded-lg border border-slate-200 bg-white p-4">
              <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
              <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">{{ card.value(s) }}</p>
            </div>
          }
        }
      </div>
    }

    <app-developer-workload-modal
      [open]="showDevelopers()"
      [dateFrom]="rangeFrom"
      [dateTo]="rangeTo"
      [detailBase]="null"
      (closed)="showDevelopers.set(false)"
    />
    <app-staff-missing-id-card-modal [open]="showMissingIdCard()" [linkBase]="null" (closed)="showMissingIdCard.set(false)" />
  `,
})
export class ImplementatorDashboardPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected readonly cards = CARDS;
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly loading = signal(true);

  protected readonly rangeFrom = thirtyDaysAgo();
  protected readonly rangeTo = isoDate(new Date());

  protected readonly showDevelopers = signal(false);
  protected readonly showMissingIdCard = signal(false);

  private readonly developerWorkload = signal<DeveloperWorkload[]>([]);
  protected readonly totalPendingTasks = computed(() => this.developerWorkload().reduce((sum, d) => sum + d.pendingTasks, 0));

  ngOnInit(): void {
    merge(timer(0, STATS_POLL_MS), this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.adminService.getDashboardStats().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((stats) => {
        if (stats) this.stats.set(stats);
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
  }
}
