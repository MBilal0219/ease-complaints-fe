import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, timer } from 'rxjs';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { DeveloperDashboardStats, HIGH_OR_URGENT_PRIORITY_VALUE } from '../../../core/tickets/models';

interface StatCard {
  label: string;
  value: (s: DeveloperDashboardStats) => number;
  accent: string;
  queryParams: Record<string, string>;
}

const CARDS: StatCard[] = [
  { label: 'Total Assigned', value: (s) => s.totalAssigned, accent: 'bg-slate-100 text-slate-700', queryParams: { view: 'table' } },
  { label: 'Assigned', value: (s) => s.assignedCount, accent: 'bg-amber-50 text-amber-700', queryParams: { view: 'table', status: 'Assigned' } },
  { label: 'In Progress', value: (s) => s.inProgressCount, accent: 'bg-purple-50 text-purple-700', queryParams: { view: 'table', status: 'InProgress' } },
  { label: 'Resolved', value: (s) => s.resolvedCount, accent: 'bg-emerald-50 text-emerald-700', queryParams: { view: 'table', status: 'Resolved' } },
  { label: 'Rejected', value: (s) => s.rejectedCount, accent: 'bg-rose-50 text-rose-700', queryParams: { view: 'table', status: 'Rejected' } },
  { label: 'Closed', value: (s) => s.closedCount, accent: 'bg-slate-100 text-slate-500', queryParams: { view: 'table', status: 'Closed' } },
];

/** Polling stand-in for real-time stats (SignalR is out of scope for now). */
const STATS_POLL_MS = 15_000;

@Component({
  selector: 'app-developer-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Dashboard</h1>
        <p class="mt-1 text-sm text-slate-500">Your workload at a glance.</p>
      </div>
      <a routerLink="/app/developer/board" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
        Open my board
      </a>
    </div>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (stats(); as s) {
      <!-- Urgent/High lead the page — the "pay attention to this first" cards. -->
      <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          routerLink="/app/developer/board"
          [queryParams]="{ view: 'table', priority: 'Urgent' }"
          class="block rounded-lg border-2 border-red-200 bg-red-50 p-5 transition-shadow hover:shadow-md"
        >
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-red-800">🔥 Urgent — needs attention</p>
          </div>
          <p class="mt-2 text-4xl font-bold text-red-700">{{ s.urgentPriorityActiveCount }}</p>
          <p class="mt-1 text-xs text-red-600">Active tickets marked Urgent</p>
        </a>
        <a
          routerLink="/app/developer/board"
          [queryParams]="{ view: 'table', priority: highOrUrgent }"
          class="block rounded-lg border-2 border-orange-200 bg-orange-50 p-5 transition-shadow hover:shadow-md"
        >
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-orange-800">⚡ High priority (incl. Urgent)</p>
          </div>
          <p class="mt-2 text-4xl font-bold text-orange-700">{{ s.highPriorityActiveCount }}</p>
          <p class="mt-1 text-xs text-orange-600">Active tickets marked High or Urgent</p>
        </a>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        @for (card of cards; track card.label) {
          <a
            routerLink="/app/developer/board"
            [queryParams]="card.queryParams"
            class="block rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md hover:border-slate-300"
          >
            <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
            <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">
              {{ card.value(s) }}
            </p>
          </a>
        }
      </div>

      <!-- Charts (resolution trend, progress over time) — planned, not built yet. -->
    }
  `,
})
export class DeveloperDashboardPage implements OnInit {
  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly cards = CARDS;
  protected readonly stats = signal<DeveloperDashboardStats | null>(null);
  protected readonly loading = signal(true);
  protected readonly highOrUrgent = HIGH_OR_URGENT_PRIORITY_VALUE;

  ngOnInit(): void {
    timer(0, STATS_POLL_MS)
      .pipe(
        switchMap(() => this.ticketsService.getDeveloperDashboard().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((stats) => {
        if (stats) this.stats.set(stats);
        this.loading.set(false);
      });
  }
}
