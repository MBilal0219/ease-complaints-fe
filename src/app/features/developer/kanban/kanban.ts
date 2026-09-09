import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  HIGH_OR_URGENT_PRIORITY_VALUE,
  TICKET_STATUS_BADGE_CLASSES,
  TICKET_STATUS_LABELS,
  TicketDto,
  TicketStatus,
  priorityBadgeClasses,
} from '../../../core/tickets/models';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const POLL_MS = 8_000;
const TABLE_PAGE_SIZE = 10;

interface Column {
  status: TicketStatus;
  title: string;
  accent: string;
  /** Only InProgress/Resolved/Rejected are valid developer-set targets — Assigned is Admin-only, so it's a source column but never a drop target. */
  isDropTarget: boolean;
}

const COLUMNS: Column[] = [
  { status: 'Assigned', title: 'Assigned', accent: 'border-t-amber-400', isDropTarget: false },
  { status: 'InProgress', title: 'In Progress', accent: 'border-t-purple-400', isDropTarget: true },
  { status: 'Resolved', title: 'Resolved', accent: 'border-t-green-400', isDropTarget: true },
  { status: 'Rejected', title: 'Rejected', accent: 'border-t-red-400', isDropTarget: true },
];

/** A developer's tickets are always one of these — New/Revoked never apply once a developer is assigned. */
const STATUS_FILTER_OPTIONS: TicketStatus[] = ['Assigned', 'InProgress', 'Resolved', 'Rejected', 'Closed'];

type ViewMode = 'board' | 'table';

@Component({
  selector: 'app-kanban',
  imports: [RouterLink, DatePipe, Pagination, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">My tickets</h1>
        <p class="mt-1 text-sm text-slate-500">
          @if (viewMode() === 'board') {
            Drag a card to move it — Resolved and Rejected are up to you; Assign is Admin-only.
          } @else {
            Every ticket ever assigned to you, including closed ones.
          }
        </p>
      </div>
      <div class="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
        <button
          type="button"
          (click)="viewMode.set('board'); syncUrl()"
          class="rounded px-3 py-1.5 font-medium"
          [class]="viewMode() === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'"
        >
          Board
        </button>
        <button
          type="button"
          (click)="viewMode.set('table'); syncUrl()"
          class="rounded px-3 py-1.5 font-medium"
          [class]="viewMode() === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'"
        >
          All tickets
        </button>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      @if (viewMode() === 'table') {
        <select
          [ngModel]="statusFilter()"
          (ngModelChange)="statusFilter.set($event); tablePage.set(1); syncUrl()"
          class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          @for (status of statusFilterOptions; track status) {
            <option [value]="status">{{ statusLabels[status] }}</option>
          }
        </select>
      }
      <select
        [ngModel]="priorityFilter()"
        (ngModelChange)="priorityFilter.set($event); tablePage.set(1); syncUrl()"
        class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="">All priorities</option>
        <option [value]="highOrUrgent">High or Urgent</option>
        @for (priority of priorityOptions(); track priority) {
          <option [value]="priority">{{ priority }}</option>
        }
      </select>
      <div class="relative">
        <input
          type="search"
          placeholder="Search title/category…"
          [ngModel]="search()"
          (ngModelChange)="search.set($event); tablePage.set(1)"
          class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>

    @if (errorMessage()) {
      <p class="mt-3 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    @if (viewMode() === 'board') {
      <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (column of columns; track column.status) {
          <div
            class="flex flex-col rounded-lg border border-t-4 border-slate-200 bg-slate-50"
            [class]="column.accent"
            (dragover)="onDragOver($event, column)"
            (dragleave)="onDragLeave(column)"
            (drop)="onDrop($event, column)"
          >
            <div class="flex items-center justify-between px-3 py-2.5">
              <h2 class="text-sm font-semibold text-slate-700">{{ column.title }}</h2>
              <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{{ ticketsFor(column.status)().length }}</span>
            </div>

            <div
              class="flex min-h-[16rem] flex-1 flex-col gap-2 p-2 transition-colors"
              [class.bg-indigo-50]="dragOverStatus() === column.status && column.isDropTarget"
            >
              @for (ticket of ticketsFor(column.status)(); track ticket.id) {
                <a
                  [routerLink]="['/app/developer/tickets', ticket.id]"
                  draggable="true"
                  (dragstart)="onDragStart($event, ticket)"
                  (dragend)="draggingId.set(null)"
                  class="block cursor-grab rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm hover:shadow active:cursor-grabbing"
                  [class.opacity-40]="draggingId() === ticket.id"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-xs text-slate-400">{{ ticket.ticketNumber }}</span>
                    <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium" [class]="priorityClasses(ticket.priorityName)">{{ ticket.priorityName }}</span>
                  </div>
                  <p class="mt-1.5 line-clamp-2 font-medium text-slate-800">{{ ticket.title }}</p>
                  <p class="mt-1 text-xs text-slate-400">{{ ticket.categoryName }}</p>
                </a>
              } @empty {
                <p class="p-4 text-center text-xs text-slate-400">Nothing here.</p>
              }
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Ticket</th>
                <th class="px-4 py-2.5">Title</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Priority</th>
                <th class="px-4 py-2.5">Category</th>
                <th class="px-4 py-2.5">Submitted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (ticket of pagedTickets(); track ticket.id) {
                <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="['/app/developer/tickets', ticket.id]">
                  <td class="px-4 py-2.5 font-mono text-xs text-slate-500">{{ ticket.ticketNumber }}</td>
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ ticket.title }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[ticket.status]">
                      {{ statusLabels[ticket.status] }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="priorityClasses(ticket.priorityName)">
                      {{ ticket.priorityName }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.categoryName }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">No tickets have ever been assigned to you.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <app-pagination
          [page]="tablePage()"
          [totalPages]="tableTotalPages()"
          [totalItems]="allTickets().length"
          [pageSize]="tablePageSizeValue"
          (pageChange)="tablePage.set($event)"
        />
      </div>
    }
  `,
})
export class KanbanPage implements OnInit {
  protected readonly columns = COLUMNS;
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly statusClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly priorityClasses = priorityBadgeClasses;
  protected readonly highOrUrgent = HIGH_OR_URGENT_PRIORITY_VALUE;
  protected readonly tablePageSizeValue = TABLE_PAGE_SIZE;

  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly allTickets = signal<TicketDto[]>([]);
  protected readonly draggingId = signal<string | null>(null);
  protected readonly dragOverStatus = signal<TicketStatus | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly viewMode = signal<ViewMode>('board');
  protected readonly tablePage = signal(1);
  protected readonly search = signal('');
  protected readonly priorityFilter = signal('');
  protected readonly statusFilter = signal<TicketStatus | ''>('');

  protected readonly priorityOptions = computed(() =>
    [...new Set(this.allTickets().map((t) => t.priorityName))].sort(),
  );

  // Client-side — the developer board/table already fetches up to 200
  // tickets in one page, so a second network round trip per filter change
  // isn't worth it. statusFilter only applies in table view — the board's
  // columns are already the status grouping, so it's hidden (not reset)
  // when switching back to board, and ignored here to match.
  private readonly filteredTickets = computed(() => {
    const term = this.search().trim().toLowerCase();
    const priority = this.priorityFilter();
    const status = this.viewMode() === 'table' ? this.statusFilter() : '';
    return this.allTickets().filter((t) => {
      if (status && t.status !== status) return false;
      if (priority === HIGH_OR_URGENT_PRIORITY_VALUE) {
        if (t.priorityName !== 'High' && t.priorityName !== 'Urgent') return false;
      } else if (priority && t.priorityName !== priority) {
        return false;
      }
      if (term && !t.title.toLowerCase().includes(term) && !t.categoryName.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  protected readonly tableTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredTickets().length / TABLE_PAGE_SIZE)));
  protected readonly pagedTickets = computed(() => {
    const sorted = [...this.filteredTickets()].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
    const start = (this.tablePage() - 1) * TABLE_PAGE_SIZE;
    return sorted.slice(start, start + TABLE_PAGE_SIZE);
  });

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    // Seeds from the URL once on load — covers the dashboard's stat-card
    // links (?view=table&status=X or &priority=Urgent|HighOrUrgent) as well
    // as a bookmarked/refreshed filtered view. Kept in sync going forward
    // via syncUrl(), so the URL always matches what's on screen.
    const params = this.route.snapshot.queryParamMap;
    if (params.get('view') === 'table' || params.has('status') || params.has('priority')) {
      this.viewMode.set('table');
    }
    this.statusFilter.set((params.get('status') as TicketStatus | null) ?? '');
    this.priorityFilter.set(params.get('priority') ?? '');

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() =>
          this.ticketsService.getDeveloperTickets({ page: 1, pageSize: 200 }).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) this.allTickets.set(result.items);
      });
  }

  /** Keeps the address bar matching what's actually filtered/viewed — no navigation/reload, just the query string. */
  syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: this.viewMode() === 'table' ? 'table' : null,
        status: this.statusFilter() || null,
        priority: this.priorityFilter() || null,
      },
      replaceUrl: true,
    });
  }

  ticketsFor(status: TicketStatus) {
    return computed(() => this.filteredTickets().filter((t) => t.status === status));
  }

  onDragStart(event: DragEvent, ticket: TicketDto): void {
    this.draggingId.set(ticket.id);
    event.dataTransfer?.setData('text/plain', ticket.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, column: Column): void {
    if (!column.isDropTarget) return;
    event.preventDefault();
    this.dragOverStatus.set(column.status);
  }

  onDragLeave(column: Column): void {
    if (this.dragOverStatus() === column.status) {
      this.dragOverStatus.set(null);
    }
  }

  onDrop(event: DragEvent, column: Column): void {
    event.preventDefault();
    this.dragOverStatus.set(null);
    if (!column.isDropTarget) return;

    const ticketId = event.dataTransfer?.getData('text/plain');
    this.draggingId.set(null);
    if (!ticketId) return;

    const ticket = this.allTickets().find((t) => t.id === ticketId);
    if (!ticket || ticket.status === column.status) return;

    this.errorMessage.set(null);
    // Optimistic move — reverted from the next poll if the server rejects it.
    this.allTickets.update((tickets) => tickets.map((t) => (t.id === ticketId ? { ...t, status: column.status } : t)));

    this.ticketsService.updateStatus(ticketId, column.status).subscribe({
      next: () => this.manualRefresh.next(),
      error: (error) => {
        this.errorMessage.set(error.error?.error ?? 'Could not move this ticket.');
        this.manualRefresh.next();
      },
    });
  }
}
