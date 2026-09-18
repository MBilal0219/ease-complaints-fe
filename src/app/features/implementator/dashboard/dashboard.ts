import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { DashboardStats, DeveloperWorkload } from '../../../core/admin/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { PENDING_STATUS_QUERY_VALUE, formatDurationFull } from '../../../core/tickets/models';

interface ActivityCard {
  label: string;
  value: (s: DashboardStats) => number;
  accent: string;
  link?: string[];
  queryParams?: Record<string, string>;
}

const TICKETS = ['/app/implementator/tickets'];

const ACTIVITY_CARDS: ActivityCard[] = [
  { label: 'Total complaints', value: (s) => s.totalTickets, accent: 'bg-slate-100 text-slate-700', link: TICKETS, queryParams: { status: '' } },
  { label: 'Pending complaints', value: (s) => s.pendingCount, accent: 'bg-amber-50 text-amber-700', link: TICKETS, queryParams: { status: PENDING_STATUS_QUERY_VALUE } },
  { label: 'In progress', value: (s) => s.inProgressCount, accent: 'bg-sky-50 text-sky-700', link: TICKETS, queryParams: { status: 'InProgress' } },
  { label: 'Resolved', value: (s) => s.resolvedCount, accent: 'bg-emerald-50 text-emerald-700', link: TICKETS, queryParams: { status: 'Resolved' } },
  { label: 'Rejected', value: (s) => s.rejectedCount, accent: 'bg-rose-50 text-rose-700', link: TICKETS, queryParams: { status: 'Rejected' } },
  { label: 'Closed', value: (s) => s.closedCount, accent: 'bg-slate-100 text-slate-500', link: TICKETS, queryParams: { status: 'Closed' } },
  { label: 'New today', value: (s) => s.newToday, accent: 'bg-indigo-50 text-indigo-700', link: TICKETS, queryParams: { dateRange: 'today' } },
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

@Component({
  selector: 'app-implementator-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Implementator dashboard</h1>
        <p class="mt-1 text-sm text-slate-500">What needs attention right now.</p>
      </div>
      <p class="mt-2 text-xs text-slate-400 sm:mt-0">Workload refreshes automatically</p>
    </div>

    <section class="mt-6" aria-labelledby="needs-attention-heading">
      <div class="flex items-center justify-between gap-3">
        <h2 id="needs-attention-heading" class="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs attention</h2>
        @if (stats(); as s) {
          <p class="hidden text-xs text-slate-500 sm:block">
            {{ formatDurationFull(assignedPendingMinutes()) }} assigned + {{ formatDurationFull(s.unassignedPendingMinutes) }} unassigned = {{ formatDurationFull(s.pendingMinutes) }} total
          </p>
        }
      </div>

      @if (loading()) {
        <p class="mt-3 text-sm text-slate-500" role="status">Loading workload…</p>
      } @else if (stats(); as s) {
        <div class="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <a
            routerLink="/app/implementator/kanban"
            class="group rounded-xl border-2 border-orange-200 bg-orange-50 p-5 transition hover:border-orange-300 hover:shadow-md"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-orange-700">Unassigned work</p>
                <p class="mt-3 text-3xl font-bold tracking-tight text-orange-700">{{ formatDurationFull(s.unassignedPendingMinutes) }}</p>
                <p class="mt-2 text-sm text-orange-800/80">Pending estimated time that still needs a developer.</p>
              </div>
              <span class="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-orange-700 shadow-sm">Needs action</span>
            </div>
            <p class="mt-4 text-xs font-medium text-orange-700 group-hover:underline">Open Kanban →</p>
          </a>

          <a
            href="#developer-workload"
            class="group rounded-xl border-2 border-indigo-200 bg-indigo-50 p-5 transition hover:border-indigo-300 hover:shadow-md"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-indigo-700">Assigned work</p>
            <p class="mt-3 text-3xl font-bold tracking-tight text-indigo-700">{{ formatDurationFull(assignedPendingMinutes()) }}</p>
            <p class="mt-2 text-sm text-indigo-800/80">Pending estimated time already owned by developers.</p>
            <p class="mt-4 text-xs font-medium text-indigo-700 group-hover:underline">View developer load ↓</p>
          </a>

          <a
            [routerLink]="TICKETS"
            [queryParams]="{ status: pendingStatusQueryValue }"
            class="group rounded-xl border-2 border-violet-200 bg-violet-50 p-5 transition hover:border-violet-300 hover:shadow-md"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-violet-700">Total pending work</p>
            <p class="mt-3 text-3xl font-bold tracking-tight text-violet-700">{{ formatDurationFull(s.pendingMinutes) }}</p>
            <p class="mt-2 text-sm text-violet-800/80"><span class="font-semibold">{{ s.pendingTaskCount }}</span> active pending tasks across all complaints.</p>
            <p class="mt-4 text-xs font-medium text-violet-700 group-hover:underline">View pending complaints →</p>
          </a>
        </div>

        <div class="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:hidden">
          <span class="font-semibold text-indigo-700">{{ formatDurationFull(assignedPendingMinutes()) }}</span> assigned
          <span class="mx-1 text-slate-300">+</span>
          <span class="font-semibold text-orange-700">{{ formatDurationFull(s.unassignedPendingMinutes) }}</span> unassigned
          <span class="mx-1 text-slate-300">=</span>
          <span class="font-semibold text-violet-700">{{ formatDurationFull(s.pendingMinutes) }}</span> total
        </div>
      }
    </section>

    <section id="developer-workload" class="mt-8 scroll-mt-20" aria-labelledby="developer-workload-heading">
      <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="developer-workload-heading" class="text-sm font-semibold text-slate-900">Developer workload</h2>
          <p class="mt-1 text-xs text-slate-500">Sorted by remaining time. Click a developer to open their pending complaints.</p>
        </div>
        <p class="text-xs text-slate-400">Actual worked time uses work spans</p>
      </div>

      <div class="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        @if (workloadLoading()) {
          <p class="p-4 text-sm text-slate-500" role="status">Loading developer workload…</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[820px] text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-3">Developer</th>
                  <th class="px-4 py-3">Pending tasks</th>
                  <th class="px-4 py-3">Remaining time</th>
                  <th class="px-4 py-3">Worked this week</th>
                  <th class="px-4 py-3">Worked this month</th>
                  <th class="px-4 py-3">Customers</th>
                  <th class="px-4 py-3">Total tasks</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of sortedDeveloperWorkload(); track row.developerId) {
                  <tr
                    [routerLink]="['/app/implementator/developer-workload', row.developerId]"
                    class="cursor-pointer transition-colors hover:bg-indigo-50/60"
                    title="Open {{ row.developerDisplayName }} pending complaints"
                  >
                    <td class="px-4 py-3 font-semibold text-indigo-700">{{ row.developerDisplayName }}</td>
                    <td class="px-4 py-3">
                      <span
                        class="inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        [class]="row.pendingTasks > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'"
                      >{{ row.pendingTasks }}</span>
                    </td>
                    <td class="px-4 py-3 font-semibold" [class]="row.pendingMinutes > 0 ? 'text-indigo-700' : 'text-slate-400'">
                      {{ formatDurationFull(row.pendingMinutes) }}
                    </td>
                    <td class="px-4 py-3 text-emerald-700">{{ formatDurationFull(row.doneThisWeekMinutes) }}</td>
                    <td class="px-4 py-3 text-emerald-700">{{ formatDurationFull(row.doneThisMonthMinutes) }}</td>
                    <td class="px-4 py-3 text-slate-600">{{ row.totalParties }}</td>
                    <td class="px-4 py-3 text-slate-600">{{ row.totalTasks }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="px-4 py-8 text-center text-slate-500">No developers yet.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>

    <section class="mt-8" aria-labelledby="activity-heading">
      <div>
        <h2 id="activity-heading" class="text-sm font-semibold text-slate-900">Activity snapshot</h2>
        <p class="mt-1 text-xs text-slate-500">Secondary counts for context — operational workload stays above.</p>
      </div>

      @if (stats(); as s) {
        <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          @for (card of activityCards; track card.label) {
            @if (card.link) {
              <a
                [routerLink]="card.link"
                [queryParams]="card.queryParams ?? null"
                class="rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
              >
                <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
                <p class="mt-2 inline-flex rounded-md px-2 py-1 text-xl font-semibold" [class]="card.accent">{{ card.value(s) }}</p>
              </a>
            }
          }
        </div>

        <p class="mt-4 text-xs text-slate-400">
          {{ s.totalUsers }} parties · {{ s.totalCompanies }} companies · {{ s.totalDevelopers }} developers
        </p>
      }
    </section>
  `,
})
export class ImplementatorDashboardPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected readonly activityCards = ACTIVITY_CARDS;
  protected readonly TICKETS = TICKETS;
  protected readonly pendingStatusQueryValue = PENDING_STATUS_QUERY_VALUE;
  protected readonly stats = signal<DashboardStats | null>(null);
  protected readonly loading = signal(true);

  protected readonly rangeFrom = thirtyDaysAgo();
  protected readonly rangeTo = isoDate(new Date());

  protected readonly developerWorkload = signal<DeveloperWorkload[]>([]);
  protected readonly workloadLoading = signal(true);
  protected readonly assignedPendingMinutes = computed(() => {
    const s = this.stats();
    if (!s) return 0;
    return Math.max(0, s.pendingMinutes - s.unassignedPendingMinutes);
  });
  protected readonly sortedDeveloperWorkload = computed(() =>
    [...this.developerWorkload()].sort(
      (a, b) =>
        b.pendingMinutes - a.pendingMinutes ||
        b.pendingTasks - a.pendingTasks ||
        a.developerDisplayName.localeCompare(b.developerDisplayName),
    ),
  );
  protected readonly formatDurationFull = formatDurationFull;

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
        this.workloadLoading.set(false);
      });
  }
}
