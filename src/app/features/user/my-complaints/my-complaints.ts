import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { PagedResult, TICKET_STATUS_BADGE_CLASSES, TICKET_STATUS_LABELS, TicketDto, TicketStatus, priorityBadgeClasses } from '../../../core/tickets/models';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 10;
const POLL_MS = 10_000;

/// A Party never sees Resolved (masked as InProgress) — see TicketDtoExtensions.MaskForParty on the backend. Rejected is NOT masked — a Party sees a rejection immediately.
const STATUS_FILTERS: (TicketStatus | '')[] = ['', 'New', 'Assigned', 'InProgress', 'Rejected', 'Closed', 'Revoked'];

@Component({
  selector: 'app-my-complaints',
  imports: [DatePipe, FormsModule, RouterLink, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">My complaints</h1>
        <p class="mt-1 text-sm text-slate-500">Everything you've submitted, and where it stands.</p>
      </div>
      <a
        routerLink="/app/user/new-complaint"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + New complaint
      </a>
    </div>

    <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 class="text-sm font-semibold text-slate-900">All complaints ({{ result().totalCount }})</h2>
        <div class="flex flex-wrap items-center gap-2">
          <select
            [(ngModel)]="statusFilter"
            (ngModelChange)="onFilterChange()"
            class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            @for (status of statusOptions; track status) {
              <option [value]="status">{{ status === '' ? 'All statuses' : statusLabels[status] }}</option>
            }
          </select>
          <div class="relative">
            <input
              type="search"
              placeholder="Search title/description…"
              [(ngModel)]="search"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Ticket</th>
                <th class="px-4 py-2.5">Title</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Priority</th>
                <th class="px-4 py-2.5">Developer</th>
                <th class="px-4 py-2.5">Submitted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (ticket of result().items; track ticket.id) {
                <tr
                  class="cursor-pointer hover:bg-slate-50"
                  [routerLink]="['/app/user/tickets', ticket.id]"
                >
                  <td class="px-4 py-2.5 font-mono text-xs text-slate-500">{{ ticket.ticketNumber }}</td>
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ ticket.title }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="badgeClasses[ticket.status]">
                      {{ statusLabels[ticket.status] }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="priorityClasses(ticket.priorityName)">
                      {{ ticket.priorityName }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.assignedDeveloperDisplayName ?? '—' }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                    No complaints match this filter.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <app-pagination
          [page]="page()"
          [totalPages]="totalPages()"
          [totalItems]="result().totalCount"
          [pageSize]="pageSizeValue"
          (pageChange)="goToPage($event)"
        />
      }
    </div>
  `,
})
export class MyComplaintsPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly badgeClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly priorityClasses = priorityBadgeClasses;
  protected readonly statusOptions = STATUS_FILTERS;

  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected search = '';
  protected statusFilter: TicketStatus | '' = '';
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<TicketDto>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    // Seeds from the URL once on load — covers the dashboard's stat-card
    // links as well as a bookmarked/refreshed filtered view. Kept in sync
    // going forward via onFilterChange, so the URL always matches the screen.
    const params = this.route.snapshot.queryParamMap;
    this.statusFilter = (params.get('status') as TicketStatus | null) ?? '';
    this.search = params.get('search') ?? '';

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() =>
          this.ticketsService
            .getMyTickets({
              page: this.page(),
              pageSize: PAGE_SIZE,
              status: this.statusFilter || undefined,
              search: this.search || undefined,
            })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.result.set(result);
          this.totalPages.set(Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)));
        }
        this.loading.set(false);
      });
  }

  onFilterChange(): void {
    this.page.set(1);
    this.syncUrl();
    this.manualRefresh.next();
  }

  /** Keeps the address bar matching what's actually filtered — no navigation/reload, just the query string. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: this.statusFilter || null, search: this.search || null },
      replaceUrl: true,
    });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }
}
