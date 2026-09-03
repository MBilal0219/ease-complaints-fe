import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap, timer } from 'rxjs';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { PartyDashboardStats } from '../../../core/tickets/models';

interface StatCard {
  label: string;
  value: (s: PartyDashboardStats) => number;
  accent: string;
}

// No Resolved/Rejected cards — a Party only ever sees New/Assigned/InProgress/Closed/Revoked (see PartyDashboardStats).
const CARDS: StatCard[] = [
  { label: 'Total Complaints', value: (s) => s.totalComplaints, accent: 'bg-slate-100 text-slate-700' },
  { label: 'New', value: (s) => s.newCount, accent: 'bg-blue-50 text-blue-700' },
  { label: 'Assigned', value: (s) => s.assignedCount, accent: 'bg-amber-50 text-amber-700' },
  { label: 'In Progress', value: (s) => s.inProgressCount, accent: 'bg-purple-50 text-purple-700' },
  { label: 'Closed', value: (s) => s.closedCount, accent: 'bg-slate-100 text-slate-500' },
  { label: 'Revoked', value: (s) => s.revokedCount, accent: 'bg-orange-50 text-orange-700' },
];

/** Polling stand-in for real-time stats (SignalR is out of scope for now). */
const STATS_POLL_MS = 15_000;

@Component({
  selector: 'app-party-dashboard',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Dashboard</h1>
        <p class="mt-1 text-sm text-slate-500">Where all your complaints stand.</p>
      </div>
      <a routerLink="/app/user/new-complaint" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
        + New complaint
      </a>
    </div>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (stats(); as s) {
      <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        @for (card of cards; track card.label) {
          <div class="rounded-lg border border-slate-200 bg-white p-4">
            <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
            <p class="mt-2 inline-flex rounded-md px-2 py-1 text-2xl font-semibold" [class]="card.accent">
              {{ card.value(s) }}
            </p>
          </div>
        }
      </div>

      <div class="mt-6">
        <a routerLink="/app/user/my-complaints" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">View all my complaints →</a>
      </div>
    }
  `,
})
export class PartyDashboardPage implements OnInit {
  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly cards = CARDS;
  protected readonly stats = signal<PartyDashboardStats | null>(null);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    timer(0, STATS_POLL_MS)
      .pipe(
        switchMap(() => this.ticketsService.getPartyDashboard().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((stats) => {
        if (stats) this.stats.set(stats);
        this.loading.set(false);
      });
  }
}
