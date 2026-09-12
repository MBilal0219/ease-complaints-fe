import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, forkJoin, map, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PersonSummary } from '../../../core/admin/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { TicketsService } from '../../../core/tickets/tickets.service';
import {
  PENDING_STATUS_QUERY_VALUE,
  TICKET_TASK_STATUS_BADGE_CLASSES,
  TICKET_TASK_STATUS_LABELS,
  TicketDto,
  TicketTaskActivityDto,
  TicketTaskDto,
  TicketTaskStatus,
  categoryBadgeClasses,
  formatDuration,
  priorityBorderClass,
} from '../../../core/tickets/models';

/** One task, paired with the complaint it belongs to — what a Kanban card needs. */
interface TaskCard {
  ticket: TicketDto;
  task: TicketTaskDto;
}

/** The board's columns are workflow stages, not developers — a developer is a *filter*, not a column (see selectedDeveloperId). Pending tasks always land in "unassigned" (a task never has a developer while Pending); Reopened rejoins "todo" since it behaves the same as a freshly-assigned task. Every status has a column — nothing is hidden — the board scrolls horizontally (see the flex/overflow-x-auto row) once there are more columns than fit. */
type ColumnKey = 'unassigned' | 'todo' | 'inprogress' | 'hold' | 'done' | 'closed';

const STATUS_COLUMN: Record<TicketTaskStatus, ColumnKey> = {
  Pending: 'unassigned',
  Assigned: 'todo',
  Reopened: 'todo',
  InProgress: 'inprogress',
  OnHold: 'hold',
  Resolved: 'done',
  Sale: 'done',
  Rejected: 'closed',
  Cancelled: 'closed',
};

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  borderClass: string;
  /** The status a drop into this column sets, or null for a view-only column (Done/Rejected-Cancelled) — those transitions need a reason/attachment a drag can't collect, so they're reached from the task's own detail/ticket page instead. */
  droppableStatus: TicketTaskStatus | null;
}

const COLUMNS: ColumnConfig[] = [
  { key: 'todo', label: 'To Do', borderClass: 'border-t-amber-400', droppableStatus: 'Assigned' },
  { key: 'inprogress', label: 'In Progress', borderClass: 'border-t-purple-400', droppableStatus: 'InProgress' },
  { key: 'hold', label: 'On Hold', borderClass: 'border-t-yellow-400', droppableStatus: 'OnHold' },
  { key: 'done', label: 'Done', borderClass: 'border-t-green-400', droppableStatus: null },
  { key: 'closed', label: 'Rejected / Cancelled', borderClass: 'border-t-slate-400', droppableStatus: null },
];

const POLL_MS = 12_000;

/** Two-letter initials for the avatar circle — "Ali Khan" -> "AK", "Sarah" -> "S". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The Implementator's Kanban — a Jira-inspired board: search + a Developer
 * avatar filter row ("All" by default) + a Main Complaint dropdown at the
 * top, workflow-stage columns underneath (Unassigned, To Do, In Progress, On
 * Hold, Done, Rejected/Cancelled — not developers; a developer is a filter,
 * not a column). Clicking a card opens the full ticket; each card's own
 * small clock icon instead opens a lightweight read-only popup with just
 * that task's status/audit history, for a quick look without leaving the
 * board.
 */
@Component({
  selector: 'app-implementator-kanban',
  imports: [RouterLink, NgTemplateOutlet, FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Kanban</h1>
        <p class="mt-1 text-sm text-slate-500">Every task, grouped by stage. Drag a card between To Do, In Progress, and On Hold to update it.</p>
      </div>
      <a routerLink="/app/implementator/tickets" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Table view
      </a>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-4">
      <input
        type="search"
        placeholder="Search ticket #, task, complaint…"
        [(ngModel)]="search"
        class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          (click)="selectedDeveloperId.set(null)"
          title="All developers"
          class="flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors"
          [class]="selectedDeveloperId() === null ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
        >
          All
        </button>
        @for (developer of developers(); track developer.id) {
          <button
            type="button"
            (click)="selectedDeveloperId.set(developer.id)"
            [title]="developer.displayName"
            class="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors"
            [class]="selectedDeveloperId() === developer.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'"
          >
            {{ initialsOf(developer.displayName) }}
          </button>
        }
      </div>

      <select
        [(ngModel)]="selectedTicketId"
        class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option [ngValue]="null">All complaints</option>
        @for (option of mainComplaintOptions(); track option.id) {
          <option [ngValue]="option.id">{{ option.title }}</option>
        }
      </select>

      <label class="flex items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" [(ngModel)]="showUnassigned" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
        Show unassigned
      </label>
    </div>

    @if (errorMessage()) {
      <p class="mt-3 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else {
      <div class="mt-6 flex gap-4 overflow-x-auto pb-2">
        @if (showUnassigned) {
          <div class="flex w-72 shrink-0 flex-col rounded-lg border border-t-4 border-slate-200 border-t-slate-400 bg-slate-50">
            <div class="flex items-center justify-between px-3 py-2.5">
              <h2 class="text-sm font-semibold text-slate-700">Unassigned</h2>
              <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{{ cardsFor('unassigned')().length }}</span>
            </div>
            <div class="flex min-h-[16rem] flex-1 flex-col gap-2 p-2">
              @for (card of cardsFor('unassigned')(); track card.task.id) {
                <ng-container [ngTemplateOutlet]="cardTemplate" [ngTemplateOutletContext]="{ $implicit: card, unassignedColumn: true }" />
              } @empty {
                <p class="p-4 text-center text-xs text-slate-400">Nothing unassigned.</p>
              }
            </div>
          </div>
        }

        @for (column of columns; track column.key) {
          <div
            class="flex w-72 shrink-0 flex-col rounded-lg border border-t-4 border-slate-200 bg-slate-50"
            [class]="column.borderClass"
            (dragover)="column.droppableStatus && onDragOver($event, column.key)"
            (dragleave)="column.droppableStatus && onDragLeave(column.key)"
            (drop)="column.droppableStatus && onDrop($event, column.droppableStatus, column.key)"
          >
            <div class="flex items-center justify-between px-3 py-2.5">
              <h2 class="text-sm font-semibold text-slate-700">{{ column.label }}</h2>
              <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{{ cardsFor(column.key)().length }}</span>
            </div>
            <div class="flex min-h-[16rem] flex-1 flex-col gap-2 p-2 transition-colors" [class.bg-indigo-50]="dragOverColumn() === column.key">
              @for (card of cardsFor(column.key)(); track card.task.id) {
                <ng-container [ngTemplateOutlet]="cardTemplate" [ngTemplateOutletContext]="{ $implicit: card, draggable: !!column.droppableStatus }" />
              } @empty {
                <p class="p-4 text-center text-xs text-slate-400">Nothing here.</p>
              }
            </div>
          </div>
        }
      </div>
    }

    <ng-template #cardTemplate let-card let-draggable="draggable" let-unassignedColumn="unassignedColumn">
      <div
        (click)="openTicket(card)"
        [draggable]="!!draggable"
        (dragstart)="draggable && onDragStart($event, card)"
        (dragend)="draggingTaskId.set(null)"
        class="cursor-pointer rounded-md border-l-4 border-y border-r border-slate-200 bg-white p-3 text-sm shadow-sm hover:shadow"
        [class]="priorityBorderClass(card.ticket.priorityName)"
        [class.opacity-40]="draggingTaskId() === card.task.id"
      >
        <div class="flex items-start justify-between gap-2">
          <p class="font-mono text-[10px] text-slate-400">{{ card.ticket.ticketNumber }} · #{{ card.task.sequenceNumber }}</p>
          <div class="flex shrink-0 items-center gap-1">
            @if (card.task.currentDeveloperDisplayName; as name) {
              <span [title]="name" class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700">
                {{ initialsOf(name) }}
              </span>
            }
            <button
              type="button"
              (click)="$event.stopPropagation(); openHistory(card)"
              title="View history"
              class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </button>
          </div>
        </div>
        <p class="mt-1 line-clamp-2 font-medium text-slate-800">{{ card.task.title || card.task.description }}</p>
        <div class="mt-1.5 flex items-center justify-between gap-2">
          <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium" [class]="categoryBadgeClasses(card.ticket.categoryName)">{{ card.ticket.categoryName }}</span>
          <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium" [class]="priorityBadgeClass(card.ticket.priorityName)">{{ card.ticket.priorityName }}</span>
        </div>
        <p class="mt-1.5 text-xs font-medium text-slate-700">{{ card.ticket.companyName || '—' }}</p>
        <p class="text-xs text-slate-500">{{ card.ticket.createdByDisplayName || '—' }}</p>
        <p class="mt-1.5 text-[11px] text-slate-400">Added by <span class="font-medium text-slate-600">{{ addedByLabel(card.task) }}</span></p>

        @if (unassignedColumn) {
          <select
            (click)="$event.stopPropagation()"
            (change)="quickAssign(card, $any($event.target).value); $any($event.target).value = ''"
            class="mt-2 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="" disabled selected>Assign to developer…</option>
            @for (developer of developers(); track developer.id) {
              <option [value]="developer.id">{{ developer.displayName }}</option>
            }
          </select>
        }
      </div>
    </ng-template>

    @if (historyCard(); as card) {
      <div class="pos-hide-print fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" (click)="closeHistory()"></div>
        <div class="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
          <button
            type="button"
            (click)="closeHistory()"
            aria-label="Close"
            class="absolute right-4 top-4 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <div class="overflow-y-auto p-6">
            <p class="font-mono text-xs text-slate-400">{{ card.ticket.ticketNumber }} · #{{ card.task.sequenceNumber }}</p>
            <h2 class="mt-1 pr-8 text-base font-semibold text-slate-900">{{ card.task.title || card.task.description }}</h2>
            <p class="mt-2 text-xs text-slate-500">
              Time in progress: <span class="font-medium text-slate-700">{{ formatDuration(card.task.inProgressElapsedMinutes) }}</span>
            </p>

            <p class="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">History</p>
            <div class="mt-1.5 space-y-2.5 border-l-2 border-slate-100 pl-3">
              @for (entry of card.task.activity; track entry.id) {
                <div class="text-xs">
                  <span class="rounded-full px-1.5 py-0.5 font-medium" [class]="statusBadgeClass(entry.toStatus)">{{ statusLabel(entry.toStatus) }}</span>
                  <span class="ml-1.5 text-slate-500">{{ actorLabel(entry) }} · {{ entry.changedAtUtc | date: 'medium' }}</span>
                  @if (entry.reason) {
                    <p class="mt-0.5 text-slate-600">{{ entry.reason }}</p>
                  }
                </div>
              } @empty {
                <p class="text-xs text-slate-400">No history yet.</p>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ImplementatorKanbanPage implements OnInit {
  protected readonly initialsOf = initials;
  protected readonly categoryBadgeClasses = categoryBadgeClasses;
  protected readonly priorityBorderClass = priorityBorderClass;
  protected readonly formatDuration = formatDuration;
  protected readonly statusLabels = TICKET_TASK_STATUS_LABELS;
  protected readonly statusBadgeClasses = TICKET_TASK_STATUS_BADGE_CLASSES;
  protected readonly columns = COLUMNS;

  private readonly ticketsService = inject(TicketsService);
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly developers = signal<PersonSummary[]>([]);
  protected readonly cards = signal<TaskCard[]>([]);

  protected search = '';
  protected showUnassigned = true;
  protected readonly selectedDeveloperId = signal<string | null>(null);
  protected selectedTicketId: string | null = null;

  protected readonly draggingTaskId = signal<string | null>(null);
  protected readonly dragOverColumn = signal<ColumnKey | null>(null);

  protected readonly historyTaskId = signal<string | null>(null);
  /** Recomputed from `cards()` (not a static snapshot) so the popup stays live if a poll refresh brings in a newer activity entry while it's open. */
  protected readonly historyCard = computed(() => {
    const id = this.historyTaskId();
    return id ? (this.cards().find((c) => c.task.id === id) ?? null) : null;
  });

  protected readonly mainComplaintOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const card of this.cards()) seen.set(card.ticket.id, card.ticket.title);
    return [...seen.entries()].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  });

  /** Only the developer avatar row + main-complaint dropdown + search all AND together — the developer filter narrows to that person's own cards, exactly like selecting one column used to before columns became stages instead of developers. */
  private readonly filteredCards = computed(() => {
    const term = this.search.trim().toLowerCase();
    const ticketId = this.selectedTicketId;
    const developerId = this.selectedDeveloperId();
    return this.cards().filter((c) => {
      if (ticketId && c.ticket.id !== ticketId) return false;
      if (developerId && c.task.currentDeveloperId !== developerId) return false;
      if (!term) return true;
      const haystack = `${c.ticket.ticketNumber} ${c.ticket.title} ${c.task.title ?? ''} ${c.task.description}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  protected statusLabel(status: TicketTaskStatus): string {
    return this.statusLabels[status];
  }

  protected statusBadgeClass(status: TicketTaskStatus): string {
    return this.statusBadgeClasses[status];
  }

  protected priorityBadgeClass(priorityName: string): string {
    const key = priorityName.toLowerCase();
    if (key === 'urgent') return 'bg-red-100 text-red-700';
    if (key === 'high') return 'bg-orange-100 text-orange-700';
    if (key === 'medium') return 'bg-sky-100 text-sky-700';
    return 'bg-slate-100 text-slate-600';
  }

  /** "you" when the current viewer submitted/added the task themselves; otherwise the creator's name and the role they held at the time (read off the task's own creation activity entry — never re-derived from their current role). */
  protected addedByLabel(task: TicketTaskDto): string {
    if (task.createdByUserId === this.authService.currentUser()?.id) return 'you';
    const role = task.activity.find((a) => a.fromStatus == null)?.changedByRole;
    return role ? `${task.createdByDisplayName} · ${role}` : task.createdByDisplayName;
  }

  /** Same "you"/name+role treatment as the ticket-detail activity feed. */
  protected actorLabel(entry: TicketTaskActivityDto): string {
    if (entry.changedByUserId == null) return entry.changedByRole;
    if (entry.changedByUserId === this.authService.currentUser()?.id) return 'you';
    return entry.changedByDisplayName ?? entry.changedByRole;
  }

  cardsFor(columnKey: ColumnKey) {
    return computed(() => this.filteredCards().filter((c) => STATUS_COLUMN[c.task.status] === columnKey));
  }

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    this.adminService.getDevelopers('', 1, 100).subscribe((result) => this.developers.set(result.items));

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() =>
          this.ticketsService.getAdminTickets({ status: PENDING_STATUS_QUERY_VALUE, page: 1, pageSize: 100 }).pipe(
            switchMap((result) => {
              if (result.items.length === 0) return of<TaskCard[]>([]);
              return forkJoin(
                result.items.map((ticket) =>
                  this.ticketsService.getTasksAsAdmin(ticket.id).pipe(
                    map((tasks) => tasks.map((task): TaskCard => ({ ticket, task }))),
                    catchError(() => of<TaskCard[]>([])),
                  ),
                ),
              ).pipe(map((groups) => groups.flat()));
            }),
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((cards) => {
        if (cards) this.cards.set(cards);
        this.loading.set(false);
      });
  }

  openTicket(card: TaskCard): void {
    this.router.navigate(['/app/implementator/tickets', card.ticket.id]);
  }

  openHistory(card: TaskCard): void {
    this.historyTaskId.set(card.task.id);
  }

  closeHistory(): void {
    this.historyTaskId.set(null);
  }

  quickAssign(card: TaskCard, developerId: string): void {
    if (!developerId) return;
    this.errorMessage.set(null);
    this.cards.update((cards) =>
      cards.map((c) => (c.task.id === card.task.id ? { ...c, task: { ...c.task, currentDeveloperId: developerId, status: 'Assigned' } } : c)),
    );
    this.ticketsService.assignTask(card.ticket.id, card.task.id, developerId).subscribe({
      next: () => this.manualRefresh.next(),
      error: (error) => {
        this.errorMessage.set(error.error?.error ?? 'Could not assign this task.');
        this.manualRefresh.next();
      },
    });
  }

  onDragStart(event: DragEvent, card: TaskCard): void {
    this.draggingTaskId.set(card.task.id);
    event.dataTransfer?.setData('text/plain', JSON.stringify({ ticketId: card.ticket.id, taskId: card.task.id }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, columnKey: ColumnKey): void {
    event.preventDefault();
    this.dragOverColumn.set(columnKey);
  }

  onDragLeave(columnKey: ColumnKey): void {
    if (this.dragOverColumn() === columnKey) {
      this.dragOverColumn.set(null);
    }
  }

  onDrop(event: DragEvent, targetStatus: TicketTaskStatus, columnKey: ColumnKey): void {
    event.preventDefault();
    this.dragOverColumn.set(null);
    this.draggingTaskId.set(null);

    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return;
    const { ticketId, taskId } = JSON.parse(raw) as { ticketId: string; taskId: string };

    const card = this.cards().find((c) => c.task.id === taskId);
    if (!card || STATUS_COLUMN[card.task.status] === columnKey) return;
    // Only a plain To Do/In Progress/On Hold flip is drag-driven — every other transition (assigning a developer, resolving, rejecting) needs its own reason/attachment/developer picker, which a drag can't collect.
    if (card.task.status !== 'Assigned' && card.task.status !== 'InProgress' && card.task.status !== 'OnHold' && card.task.status !== 'Reopened') return;

    this.errorMessage.set(null);
    this.cards.update((cards) => cards.map((c) => (c.task.id === taskId ? { ...c, task: { ...c.task, status: targetStatus } } : c)));

    this.ticketsService.updateTaskStatusAsAdmin(ticketId, taskId, targetStatus).subscribe({
      next: () => this.manualRefresh.next(),
      error: (error) => {
        this.errorMessage.set(error.error?.error ?? 'Could not update this task.');
        this.manualRefresh.next();
      },
    });
  }
}
