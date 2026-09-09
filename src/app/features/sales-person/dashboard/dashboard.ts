import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, merge, of, switchMap, timer } from 'rxjs';
import { SalesPersonService } from '../../../core/sales-person/sales-person.service';
import { SalesPersonDashboardStats } from '../../../core/sales-person/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';

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

@Component({
  selector: 'app-sales-person-dashboard',
  imports: [RouterLink],
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
  `,
})
export class SalesPersonDashboardPage implements OnInit {
  private readonly salesPersonService = inject(SalesPersonService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected readonly cards = CARDS;
  protected readonly stats = signal<SalesPersonDashboardStats | null>(null);
  protected readonly loading = signal(true);

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
  }
}
