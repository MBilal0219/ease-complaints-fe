import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PersonSummary } from '../../../core/admin/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  PENDING_STATUS_QUERY_VALUE,
  PagedResult,
  StatusOption,
  TICKET_STATUS_LABELS,
  TicketDto,
  TicketFilter,
  adminStatusOptionsFor,
  formatDurationFull,
  priorityBadgeClasses,
} from '../../../core/tickets/models';
import { Modal } from '../../../shared/ui/modal/modal';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { StatusDropdown } from '../../../shared/ui/status-dropdown/status-dropdown';

const PAGE_SIZE = 10;
const POLL_MS = 8_000;

/** 'Pending' is a synthetic entry standing in for PENDING_STATUS_QUERY_VALUE — not a real TicketStatus. */
type StatusFilterOption = '' | 'Pending' | 'New' | 'Assigned' | 'InProgress' | 'Resolved' | 'Rejected' | 'Closed' | 'Revoked' | 'Sale';
const STATUS_FILTERS: StatusFilterOption[] = ['', 'Pending', 'New', 'Assigned', 'InProgress', 'Resolved', 'Rejected', 'Closed', 'Revoked', 'Sale'];
type DateRangeFilter = '' | 'today' | 'last7days';

@Component({
  selector: 'app-admin-tickets',
  imports: [DatePipe, FormsModule, RouterLink, Pagination, StatusDropdown, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h1 class="text-lg font-semibold text-slate-900">Tickets</h1>
      <p class="mt-1 text-sm text-slate-500">Every complaint submitted by a party, across every status.</p>
    </div>

    @if (actionError()) {
      <p class="mt-3 text-sm text-red-600" role="alert">{{ actionError() }}</p>
    }

    <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">All tickets ({{ result().totalCount }})</h2>
          <p class="mt-1 text-xs text-slate-500">Total pending time: <span class="font-semibold text-indigo-700">{{ formatDurationFull(result().totalPendingMinutes ?? 0) }}</span></p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            [(ngModel)]="statusFilter"
            (ngModelChange)="onFilterChange()"
            class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            @for (status of statusOptions; track status) {
              <option [value]="status">{{ statusFilterLabel(status) }}</option>
            }
          </select>
          <select
            [(ngModel)]="dateRangeFilter"
            (ngModelChange)="onFilterChange()"
            class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Any time</option>
            <option value="today">New today</option>
            <option value="last7days">New last 7 days</option>
          </select>
          <select
            [(ngModel)]="developerFilter"
            (ngModelChange)="onFilterChange()"
            class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All developers</option>
            @for (developer of developers(); track developer.id) {
              <option [value]="developer.id">{{ developer.displayName }}</option>
            }
          </select>
          <div class="relative">
            <input
              type="search"
              placeholder="Search title/company/description…"
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
                <th class="px-4 py-2.5">Party</th>
                <th class="px-4 py-2.5">Company</th>
                <th class="px-4 py-2.5">Developer</th>
                <th class="px-4 py-2.5">Pending time</th>
                <th class="px-4 py-2.5">Submitted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (ticket of result().items; track ticket.id) {
                <tr class="hover:bg-slate-50">
                  <td class="cursor-pointer px-4 py-2.5 font-mono text-xs text-slate-500" [routerLink]="['/app/admin/tickets', ticket.id]">{{ ticket.ticketNumber }}</td>
                  <td class="cursor-pointer px-4 py-2.5 font-medium text-slate-900" [routerLink]="['/app/admin/tickets', ticket.id]">{{ ticket.title }}</td>
                  <td class="px-4 py-2.5">
                    <app-status-dropdown
                      [status]="ticket.status"
                      [options]="statusOptionsFor(ticket)"
                      (statusSelected)="changeStatus(ticket, $event)"
                    />
                  </td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="priorityClasses(ticket.priorityName)">
                      {{ ticket.priorityName }}
                    </span>
                  </td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/admin/tickets', ticket.id]">{{ ticket.createdByDisplayName || '—' }}</td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/admin/tickets', ticket.id]">{{ ticket.companyName || '—' }}</td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/admin/tickets', ticket.id]">{{ ticket.assignedDeveloperDisplayName ?? '—' }}</td>
                  <td class="cursor-pointer px-4 py-2.5 font-medium text-indigo-700" [routerLink]="['/app/admin/tickets', ticket.id]">
                    {{ formatDurationFull(ticket.pendingMinutes) }}
                  </td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/admin/tickets', ticket.id]">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="px-4 py-8 text-center text-slate-500">No tickets match this filter.</td>
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

    <app-modal [open]="assignTargetTicket() !== null" (close)="assignTargetTicket.set(null)">
      <h2 class="text-base font-semibold text-slate-900">Assign developer</h2>
      <p class="mt-1 text-sm text-slate-500">Choose who should work on {{ assignTargetTicket()?.ticketNumber }}.</p>

      <div class="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
        @for (developer of developers(); track developer.id) {
          <button
            type="button"
            (click)="assign(developer.id)"
            class="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <span class="font-medium text-slate-800">{{ developer.displayName }}</span>
            <span class="text-xs text-slate-400">{{ developer.openTicketCount }} open</span>
          </button>
        } @empty {
          <p class="py-4 text-center text-sm text-slate-400">No developers available.</p>
        }
      </div>
    </app-modal>
  `,
})
export class AdminTicketsPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly statusOptions = STATUS_FILTERS;
  protected readonly priorityClasses = priorityBadgeClasses;
  protected readonly formatDurationFull = formatDurationFull;
  protected readonly statusOptionsFor = (ticket: TicketDto) => adminStatusOptionsFor(ticket, true);

  private readonly ticketsService = inject(TicketsService);
  private readonly adminService = inject(AdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);

  protected search = '';
  protected statusFilter: StatusFilterOption = '';
  protected dateRangeFilter: DateRangeFilter = '';
  protected developerFilter = '';
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<TicketDto>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);
  protected readonly developers = signal<PersonSummary[]>([]);
  protected readonly actionError = signal<string | null>(null);
  protected readonly assignTargetTicket = signal<TicketDto | null>(null);

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    this.adminService.getDevelopers('', 1, 100).subscribe((result) => this.developers.set(result.items));

    // Seeds filters from the URL once on load — covers both a direct link
    // (e.g. the dashboard's "Pending"/"New Today" cards) and a bookmarked or
    // refreshed filtered view. Kept in sync going forward via onFilterChange
    // below, so the URL always reflects what's actually on screen.
    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
    // Defaults to Pending (not "All") when no status is in the URL at all — per user feedback.
    this.statusFilter = status === PENDING_STATUS_QUERY_VALUE ? 'Pending' : ((status as StatusFilterOption) ?? 'Pending');
    this.dateRangeFilter = (params.get('dateRange') as DateRangeFilter) ?? '';
    this.developerFilter = params.get('assignedDeveloperId') ?? '';
    this.search = params.get('search') ?? '';

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() =>
          this.ticketsService.getAdminTickets(this.buildFilter()).pipe(catchError(() => of(null))),
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

  protected statusFilterLabel(status: StatusFilterOption): string {
    if (status === '') return 'All statuses';
    if (status === 'Pending') return 'Pending';
    return this.statusLabels[status];
  }

  private buildFilter(): TicketFilter {
    return {
      page: this.page(),
      pageSize: PAGE_SIZE,
      status: this.statusFilter === 'Pending' ? PENDING_STATUS_QUERY_VALUE : this.statusFilter || undefined,
      dateRange: this.dateRangeFilter || undefined,
      assignedDeveloperId: this.developerFilter || undefined,
      search: this.search || undefined,
    };
  }

  onFilterChange(): void {
    this.page.set(1);
    this.syncUrl();
    this.manualRefresh.next();
  }

  /** Keeps the address bar (and therefore refresh/back/bookmark/share) matching what's actually filtered — no navigation/component reload, just the query string. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        status: this.statusFilter === 'Pending' ? PENDING_STATUS_QUERY_VALUE : this.statusFilter || null,
        dateRange: this.dateRangeFilter || null,
        assignedDeveloperId: this.developerFilter || null,
        search: this.search || null,
      },
      replaceUrl: true,
    });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }

  changeStatus(ticket: TicketDto, option: StatusOption): void {
    // "Assign"/"Reassign" (not the Closed→Reopen case, which also targets
    // Assigned but needs no developer picker — the developer's already set)
    // needs a developer chosen first; everything else is a direct call.
    if (option.value === 'Assigned' && ticket.status !== 'Closed') {
      this.assignTargetTicket.set(ticket);
      return;
    }

    this.actionError.set(null);
    this.ticketsService.updateStatusAsAdmin(ticket.id, option.value).subscribe({
      next: () => this.manualRefresh.next(),
      error: (error: HttpErrorResponse) => this.actionError.set(error.error?.error ?? 'Could not change this ticket’s status.'),
    });
  }

  assign(developerId: string): void {
    const ticket = this.assignTargetTicket();
    if (!ticket) return;

    this.actionError.set(null);
    this.ticketsService.assign(ticket.id, developerId).subscribe({
      next: () => {
        this.assignTargetTicket.set(null);
        this.manualRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.assignTargetTicket.set(null);
        this.actionError.set(error.error?.error ?? 'Could not assign this ticket.');
      },
    });
  }
}
