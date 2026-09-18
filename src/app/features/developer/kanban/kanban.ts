import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, forkJoin, map, merge, of, switchMap, timer } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { PersonSummary } from '../../../core/admin/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  CategoryDto,
  DeveloperWorkStatus,
  ESTIMATE_UNITS,
  EstimateUnit,
  HIGH_OR_URGENT_PRIORITY_VALUE,
  PENDING_STATUS_QUERY_VALUE,
  PriorityDto,
  TICKET_STATUS_BADGE_CLASSES,
  TICKET_STATUS_LABELS,
  TICKET_TASK_STATUS_BADGE_CLASSES,
  TICKET_TASK_STATUS_LABELS,
  TicketDto,
  TicketStatus,
  TicketTaskActivityDto,
  TicketTaskDto,
  TicketTaskStatus,
  categoryBadgeClasses,
  formatDuration,
  formatDurationFull,
  priorityBadgeClasses,
  priorityBorderClass,
} from '../../../core/tickets/models';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { Modal } from '../../../shared/ui/modal/modal';

const POLL_MS = 8_000;
const TABLE_PAGE_SIZE = 10;

/** A developer's tickets are always one of these — New/Revoked never apply once a developer is assigned. Table view only — see STATUS_FILTER_OPTIONS' own callers. */
const STATUS_FILTER_OPTIONS: TicketStatus[] = ['Assigned', 'InProgress', 'Resolved', 'Rejected', 'Closed'];

type ViewMode = 'board' | 'table';

/** One task, paired with the complaint it belongs to — what a board card needs. Board-only; Table view stays ticket-level (unchanged). */
interface TaskCard {
  ticket: TicketDto;
  task: TicketTaskDto;
}

type ColumnKey = 'todo' | 'inprogress' | 'hold' | 'done' | 'closed';

function columnFor(status: DeveloperWorkStatus | null): ColumnKey {
  if (!status || status === 'Assigned') return 'todo';
  if (status === 'InProgress') return 'inprogress';
  if (status === 'OnHold') return 'hold';
  if (status === 'Resolved' || status === 'Closed') return 'done';
  return 'closed';
}

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  borderClass: string;
  /** The status a drop into this column sets, or null if it doesn't accept drops. To Do never accepts one — a developer can't set a task back to Assigned (that's Admin/Implementator-only, see TicketTaskService.DeveloperAllowedTaskTargets) — but a To Do card can still be dragged OUT (see sourceDraggable). Done/Rejected are view-only in both directions — those transitions need a reason, which a drag can't collect (use the task's own detail on the ticket page instead). */
  droppableStatus: DeveloperWorkStatus | null;
  sourceDraggable: boolean;
}

const BOARD_COLUMNS: ColumnConfig[] = [
  { key: 'todo', label: 'To Do', borderClass: 'border-t-amber-400', droppableStatus: null, sourceDraggable: true },
  { key: 'inprogress', label: 'In Progress', borderClass: 'border-t-purple-400', droppableStatus: 'InProgress', sourceDraggable: true },
  { key: 'hold', label: 'On Hold', borderClass: 'border-t-yellow-400', droppableStatus: 'OnHold', sourceDraggable: true },
  { key: 'done', label: 'Done', borderClass: 'border-t-green-400', droppableStatus: null, sourceDraggable: false },
  { key: 'closed', label: 'Rejected / Cancelled', borderClass: 'border-t-slate-400', droppableStatus: null, sourceDraggable: false },
];

/** Two-letter initials — kept only for the (rare) case a task shows someone other than the viewer, e.g. "Added by". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A Developer's own work: Board is the same Jira-style per-task board as
 * the Implementator's (see implementator/kanban/kanban.ts) — To Do/In
 * Progress/On Hold/Done/Rejected columns, cards keyed on the subcomplaint's
 * own title — but scoped to ONLY this developer's own tasks: no Unassigned
 * column (a task with no developer can never be theirs), no other
 * developer's cards, no developer-avatar filter (pointless with just one
 * developer — themselves). Table view (the older "every ticket ever
 * assigned to me" list) is unchanged.
 */
@Component({
  selector: 'app-kanban',
  imports: [RouterLink, DatePipe, Pagination, FormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">My tickets</h1>
        <p class="mt-1 text-sm text-slate-500">
          @if (viewMode() === 'board') {
            Drag a card between To Do, In Progress, and On Hold to update it.
          } @else {
            Every ticket ever assigned to you, including closed ones.
          }
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" (click)="openDirectWork()" class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">+ Add Direct Work</button>
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
    </div>

    @if (viewMode() === 'board') {
      <div class="mt-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search ticket #, task, complaint…"
          [(ngModel)]="boardSearch"
          class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          [(ngModel)]="selectedTicketId"
          class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option [ngValue]="null">All complaints</option>
          @for (option of mainComplaintOptions(); track option.id) {
            <option [ngValue]="option.id">{{ option.title }}</option>
          }
        </select>
      </div>
    } @else {
      <div class="mt-4 flex flex-wrap items-center gap-2">
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
        <input
          type="search"
          placeholder="Search title/company/category…"
          [ngModel]="search()"
          (ngModelChange)="search.set($event); tablePage.set(1)"
          class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        @if (pendingOnly()) {
          <span class="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            Pending work only
            <button type="button" (click)="pendingOnly.set(false); tablePage.set(1); syncUrl()" class="text-indigo-500 hover:text-indigo-800" aria-label="Clear pending work filter">×</button>
          </span>
        }
      </div>
    }

    @if (errorMessage()) {
      <p class="mt-3 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    @if (viewMode() === 'board') {
      @if (boardLoading()) {
        <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="mt-6 flex gap-4 overflow-x-auto pb-2">
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
                  <div
                    (click)="openTicket(card)"
                    [draggable]="column.sourceDraggable"
                    (dragstart)="column.sourceDraggable && onDragStart($event, card)"
                    (dragend)="draggingTaskId.set(null)"
                    class="cursor-pointer rounded-md border-l-4 border-y border-r border-slate-200 bg-white p-3 text-sm shadow-sm hover:shadow"
                    [class]="priorityBorderClass(card.ticket.priorityName)"
                    [class.opacity-40]="draggingTaskId() === card.task.id"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <p class="font-mono text-[10px] text-slate-400">{{ card.ticket.ticketNumber }} · #{{ card.task.sequenceNumber }}</p>
                      <button
                        type="button"
                        (click)="$event.stopPropagation(); openHistory(card)"
                        title="View history"
                        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      </button>
                    </div>
                    <p class="mt-1 line-clamp-2 font-medium text-slate-800">{{ card.task.title || card.task.description }}</p>
                    <div class="mt-1.5 flex items-center justify-between gap-2">
                      <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium" [class]="categoryBadgeClasses(card.ticket.categoryName)">{{ card.ticket.categoryName }}</span>
                      <span class="rounded-full px-1.5 py-0.5 text-[10px] font-medium" [class]="priorityBadgeClasses(card.ticket.priorityName)">{{ card.ticket.priorityName }}</span>
                    </div>
                    <p class="mt-1.5 text-xs font-medium text-slate-700">{{ card.ticket.companyName || '—' }}</p>
                    <p class="text-xs text-slate-500">{{ card.ticket.createdByDisplayName || '—' }}</p>
                    <p class="mt-1 text-[11px] text-indigo-600">Worked {{ formatDuration(card.task.actualWorkedMinutes) }} · Remaining {{ formatDuration(card.task.remainingEstimatedMinutes) }}</p>
                    <p class="mt-1.5 text-[11px] text-slate-400">Added by <span class="font-medium text-slate-600">{{ addedByLabel(card.task) }}</span></p>
                  </div>
                } @empty {
                  <p class="p-4 text-center text-xs text-slate-400">Nothing here.</p>
                }
              </div>
            </div>
          }
        </div>
      }

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
                Actual worked: <span class="font-medium text-slate-700">{{ formatDurationFull(card.task.actualWorkedMinutes) }}</span>
                <span class="mx-1.5 text-slate-300">·</span>
                Remaining: <span class="font-medium text-slate-700">{{ formatDurationFull(card.task.remainingEstimatedMinutes) }}</span>
              </p>

              @if (card.task.workSpans.length > 0) {
                <p class="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Work spans</p>
                <div class="mt-1.5 space-y-2 rounded-md bg-indigo-50 p-3">
                  @for (span of card.task.workSpans; track span.id) {
                    <div class="text-xs text-slate-600">
                      <span class="font-medium text-slate-800">{{ span.startedAtUtc | date: 'medium' }}</span>
                      → <span>{{ span.endedAtUtc ? (span.endedAtUtc | date: 'medium') : 'Running' }}</span>
                      <span class="ml-1 font-semibold text-indigo-700">({{ formatDuration(span.durationMinutes) }})</span>
                      @if (span.endReason) { <span class="ml-1 text-slate-400">· {{ span.endReason }}</span> }
                    </div>
                  }
                </div>
              }

              <p class="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status history</p>
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
    } @else {
      <div class="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
        <span>Filtered worked time: <strong class="text-indigo-700">{{ formatDurationFull(filteredWorkedMinutes()) }}</strong></span>
        <span>Filtered remaining time: <strong class="text-indigo-700">{{ formatDurationFull(filteredRemainingMinutes()) }}</strong></span>
      </div>
      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Ticket</th>
                <th class="px-4 py-2.5">Title</th>
                <th class="px-4 py-2.5">Company</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Priority</th>
                <th class="px-4 py-2.5">Category</th>
                <th class="px-4 py-2.5">Remaining</th>
                <th class="px-4 py-2.5">Worked time</th>
                <th class="px-4 py-2.5">Submitted</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (ticket of pagedTickets(); track ticket.id) {
                <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="['/app/developer/tickets', ticket.id]">
                  <td class="px-4 py-2.5 font-mono text-xs text-slate-500">{{ ticket.ticketNumber }}</td>
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ ticket.title }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.companyName || '—' }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[ticket.status]">
                      {{ statusLabels[ticket.status] }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="priorityBadgeClasses(ticket.priorityName)">
                      {{ ticket.priorityName }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.categoryName }}</td>
                  <td class="px-4 py-2.5 font-medium text-indigo-700">{{ formatDurationFull(ticket.pendingMinutes) }}</td>
                  <td class="px-4 py-2.5 font-medium text-emerald-700">{{ formatDurationFull(ticket.developerWorkedMinutes) }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="px-4 py-8 text-center text-slate-500">No tickets have ever been assigned to you.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <app-pagination
          [page]="tablePage()"
          [totalPages]="tableTotalPages()"
          [totalItems]="filteredTickets().length"
          [pageSize]="tablePageSizeValue"
          (pageChange)="tablePage.set($event)"
        />
      </div>
    }

    <app-modal [open]="showDirectWork()" (close)="showDirectWork.set(false)">
      <h2 class="text-base font-semibold text-slate-900">Add Direct Work</h2>
      <p class="mt-1 text-sm text-slate-500">Record work you handled directly for a party. It will be assigned to you automatically.</p>
      <div class="mt-4 space-y-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">Party</label>
          @if (directParty(); as party) {
            <div class="mt-1 flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
              <span>{{ party.displayName }} · {{ party.companyName }}</span>
              <button type="button" (click)="directParty.set(null)" class="text-xs font-medium text-indigo-600">Change</button>
            </div>
          } @else {
            <input type="search" [(ngModel)]="directPartySearch" (ngModelChange)="searchDirectParties()" placeholder="Search party…" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            @if (directPartyResults().length) {
              <div class="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 p-1">
                @for (party of directPartyResults(); track party.id) {
                  <button type="button" (click)="directParty.set(party)" class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50">{{ party.displayName }} · {{ party.companyName }}</button>
                }
              </div>
            }
          }
        </div>
        <div><label class="block text-sm font-medium text-slate-700">Title</label><input [(ngModel)]="directTitle" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
        <div><label class="block text-sm font-medium text-slate-700">Description</label><textarea rows="3" [(ngModel)]="directDescription" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium text-slate-700">Category</label><select [(ngModel)]="directCategoryId" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">@for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
          <div><label class="block text-sm font-medium text-slate-700">Priority</label><select [(ngModel)]="directPriorityId" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">@for (p of priorities(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></div>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Estimated time</label>
          <div class="mt-1 flex gap-2"><input type="number" min="1" [(ngModel)]="directEstimateValue" class="w-24 rounded-md border border-slate-300 px-2 py-2 text-sm" /><select [(ngModel)]="directEstimateUnit" class="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">@for (u of estimateUnits; track u) { <option [value]="u">{{ u }}</option> }</select></div>
        </div>
      </div>
      @if (directError()) { <p class="mt-2 text-sm text-red-600">{{ directError() }}</p> }
      <div class="mt-4 flex justify-end gap-2"><button type="button" (click)="showDirectWork.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="button" (click)="createDirectWork()" [disabled]="directSaving() || !directParty() || !directTitle.trim() || directDescription.trim().length < 3 || !directCategoryId || !directPriorityId || !directEstimateValue || directEstimateValue <= 0" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{{ directSaving() ? 'Saving…' : 'Add work' }}</button></div>
    </app-modal>
  `,
})
export class KanbanPage implements OnInit {
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly statusClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly priorityBadgeClasses = priorityBadgeClasses;
  protected readonly highOrUrgent = HIGH_OR_URGENT_PRIORITY_VALUE;
  protected readonly tablePageSizeValue = TABLE_PAGE_SIZE;
  protected readonly columns = BOARD_COLUMNS;
  protected readonly initialsOf = initials;
  protected readonly categoryBadgeClasses = categoryBadgeClasses;
  protected readonly priorityBorderClass = priorityBorderClass;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDurationFull = formatDurationFull;
  protected readonly taskStatusLabels = TICKET_TASK_STATUS_LABELS;
  protected readonly taskStatusBadgeClasses = TICKET_TASK_STATUS_BADGE_CLASSES;

  private readonly ticketsService = inject(TicketsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly viewMode = signal<ViewMode>('board');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showDirectWork = signal(false);
  protected readonly directPartyResults = signal<PersonSummary[]>([]);
  protected readonly directParty = signal<PersonSummary | null>(null);
  protected readonly categories = signal<CategoryDto[]>([]);
  protected readonly priorities = signal<PriorityDto[]>([]);
  protected readonly directError = signal<string | null>(null);
  protected readonly directSaving = signal(false);
  protected readonly estimateUnits = ESTIMATE_UNITS;
  protected directPartySearch = '';
  protected directTitle = '';
  protected directDescription = '';
  protected directCategoryId: number | '' = '';
  protected directPriorityId: number | '' = '';
  protected directEstimateValue: number | null = null;
  protected directEstimateUnit: EstimateUnit = 'Hours';

  // ---- Table view (unchanged from the previous ticket-level board) ----
  protected readonly allTickets = signal<TicketDto[]>([]);
  protected readonly tablePage = signal(1);
  protected readonly search = signal('');
  protected readonly priorityFilter = signal('');
  protected readonly statusFilter = signal<TicketStatus | ''>('');
  protected readonly pendingOnly = signal(false);

  protected readonly priorityOptions = computed(() => [...new Set(this.allTickets().map((t) => t.priorityName))].sort());

  protected readonly filteredTickets = computed(() => {
    const term = this.search().trim().toLowerCase();
    const priority = this.priorityFilter();
    const status = this.statusFilter();
    const pendingOnly = this.pendingOnly();
    return this.allTickets().filter((t) => {
      if (pendingOnly) {
        const ticketTerminal = ['Resolved', 'Rejected', 'Closed', 'Revoked', 'Cancelled', 'Sale'].includes(t.status);
        const developerTerminal = t.developerWorkStatus != null && ['Resolved', 'Rejected', 'Cancelled', 'Closed'].includes(t.developerWorkStatus);
        if (ticketTerminal || developerTerminal) return false;
      }
      if (status && t.status !== status) return false;
      if (priority === HIGH_OR_URGENT_PRIORITY_VALUE) {
        if (t.priorityName !== 'High' && t.priorityName !== 'Urgent') return false;
      } else if (priority && t.priorityName !== priority) {
        return false;
      }
      if (term && !t.title.toLowerCase().includes(term) && !t.companyName.toLowerCase().includes(term) && !t.categoryName.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  protected readonly filteredWorkedMinutes = computed(() => this.filteredTickets().reduce((sum, ticket) => sum + (ticket.developerWorkedMinutes ?? 0), 0));
  protected readonly filteredRemainingMinutes = computed(() => this.filteredTickets().reduce((sum, ticket) => sum + (ticket.pendingMinutes ?? 0), 0));

  protected readonly tableTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredTickets().length / TABLE_PAGE_SIZE)));
  protected readonly pagedTickets = computed(() => {
    const sorted = [...this.filteredTickets()].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
    const start = (this.tablePage() - 1) * TABLE_PAGE_SIZE;
    return sorted.slice(start, start + TABLE_PAGE_SIZE);
  });

  // ---- Board view — the new Jira-style per-task board, scoped to this developer's own tasks only ----
  protected readonly boardLoading = signal(true);
  protected readonly cards = signal<TaskCard[]>([]);
  protected boardSearch = '';
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

  private readonly filteredCards = computed(() => {
    const term = this.boardSearch.trim().toLowerCase();
    const ticketId = this.selectedTicketId;
    return this.cards().filter((c) => {
      if (ticketId && c.ticket.id !== ticketId) return false;
      if (!term) return true;
      const haystack = `${c.ticket.ticketNumber} ${c.ticket.title} ${c.ticket.companyName} ${c.task.title ?? ''} ${c.task.description}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  cardsFor(columnKey: ColumnKey) {
    return computed(() => this.filteredCards().filter((c) => columnFor(c.task.developerWorkStatus) === columnKey));
  }

  protected statusLabel(status: TicketTaskStatus): string {
    return this.taskStatusLabels[status];
  }

  protected statusBadgeClass(status: TicketTaskStatus): string {
    return this.taskStatusBadgeClasses[status];
  }

  /** "you" when the current viewer submitted/added the task themselves; otherwise the creator's name and the role they held at the time. */
  protected addedByLabel(task: TicketTaskDto): string {
    if (task.createdByUserId === this.authService.currentUser()?.id) return 'you';
    const role = task.activity.find((a) => a.fromStatus == null)?.changedByRole;
    return role ? `${task.createdByDisplayName} · ${role}` : task.createdByDisplayName;
  }

  protected actorLabel(entry: TicketTaskActivityDto): string {
    if (entry.changedByUserId == null) return entry.changedByRole;
    if (entry.changedByUserId === this.authService.currentUser()?.id) return 'you';
    return entry.changedByDisplayName ?? entry.changedByRole;
  }

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    this.ticketsService.getLookups().subscribe((lookups) => {
      this.categories.set(lookups.categories); this.priorities.set(lookups.priorities);
      this.directCategoryId = lookups.categories[0]?.id ?? ''; this.directPriorityId = lookups.priorities[0]?.id ?? '';
    });
    // Seeds from the URL once on load — covers the dashboard's stat-card
    // links (?view=table&status=X or &priority=Urgent|HighOrUrgent) as well
    // as a bookmarked/refreshed filtered view. Kept in sync going forward
    // via syncUrl(), so the URL always matches what's on screen.
    const params = this.route.snapshot.queryParamMap;
    if (params.get('view') === 'table' || params.has('status') || params.has('priority') || params.get('pending') === '1') {
      this.viewMode.set('table');
    }
    this.statusFilter.set((params.get('status') as TicketStatus | null) ?? '');
    this.priorityFilter.set(params.get('priority') ?? '');
    this.pendingOnly.set(params.get('pending') === '1');

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.ticketsService.getDeveloperTickets({ page: 1, pageSize: 200 }).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) this.allTickets.set(result.items);
      });

    const developerId = this.authService.currentUser()?.id ?? null;
    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() =>
          this.ticketsService.getDeveloperTickets({ status: PENDING_STATUS_QUERY_VALUE, page: 1, pageSize: 100 }).pipe(
            switchMap((result) => {
              if (result.items.length === 0) return of<TaskCard[]>([]);
              return forkJoin(
                result.items.map((ticket) =>
                  this.ticketsService.getTasksAsDeveloper(ticket.id).pipe(
                    // Only this developer's own tasks — a ticket can have other tasks assigned to other developers.
                    map((tasks) => tasks.filter((task) => task.currentDeveloperId === developerId).map((task): TaskCard => ({ ticket, task }))),
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
        this.boardLoading.set(false);
      });
  }

  openDirectWork(): void {
    this.directParty.set(null); this.directPartyResults.set([]); this.directPartySearch = ''; this.directTitle = ''; this.directDescription = '';
    this.directEstimateValue = null; this.directEstimateUnit = 'Hours'; this.directError.set(null);
    this.directCategoryId = this.categories()[0]?.id ?? ''; this.directPriorityId = this.priorities()[0]?.id ?? ''; this.showDirectWork.set(true);
  }

  searchDirectParties(): void {
    const term = this.directPartySearch.trim();
    if (term.length < 2) { this.directPartyResults.set([]); return; }
    this.ticketsService.getDeveloperParties(term).subscribe((r) => this.directPartyResults.set(r.items));
  }

  createDirectWork(): void {
    const party = this.directParty();
    if (!party || !this.directCategoryId || !this.directPriorityId || !this.directTitle.trim() || this.directDescription.trim().length < 3) return;
    if (this.directEstimateValue == null || this.directEstimateValue <= 0) {
      this.directError.set('Estimated time is required and must be greater than zero.');
      return;
    }
    this.directSaving.set(true); this.directError.set(null);
    this.ticketsService.createDirectWork({
      partyUserId: party.id, title: this.directTitle.trim(), description: this.directDescription.trim(),
      categoryId: Number(this.directCategoryId), priorityId: Number(this.directPriorityId),
      estimateValue: this.directEstimateValue, estimateUnit: this.directEstimateUnit,
    }).subscribe({ next: (t) => { this.directSaving.set(false); this.showDirectWork.set(false); this.manualRefresh.next(); this.router.navigate(['/app/developer/tickets', t.id]); }, error: (e) => { this.directSaving.set(false); this.directError.set(e.error?.error ?? 'Could not add direct work.'); } });
  }

  /** Keeps the address bar matching what's actually filtered/viewed — no navigation/reload, just the query string. */
  syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: this.viewMode() === 'table' ? 'table' : null,
        status: this.statusFilter() || null,
        priority: this.priorityFilter() || null,
        pending: this.pendingOnly() ? '1' : null,
      },
      replaceUrl: true,
    });
  }

  openTicket(card: TaskCard): void {
    this.router.navigate(['/app/developer/tickets', card.ticket.id]);
  }

  openHistory(card: TaskCard): void {
    this.historyTaskId.set(card.task.id);
  }

  closeHistory(): void {
    this.historyTaskId.set(null);
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

  onDrop(event: DragEvent, targetStatus: DeveloperWorkStatus, columnKey: ColumnKey): void {
    event.preventDefault();
    this.dragOverColumn.set(null);
    this.draggingTaskId.set(null);

    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return;
    const { ticketId, taskId } = JSON.parse(raw) as { ticketId: string; taskId: string };

    const card = this.cards().find((c) => c.task.id === taskId);
    if (!card || columnFor(card.task.developerWorkStatus) === columnKey) return;
    // Timer-safe drag transitions only: Assigned/OnHold → InProgress opens a span;
    // InProgress → OnHold closes it. A To Do card cannot jump straight to Hold.
    const current = card.task.developerWorkStatus ?? 'Assigned';
    const allowed = (targetStatus === 'InProgress' && (current === 'Assigned' || current === 'OnHold'))
      || (targetStatus === 'OnHold' && current === 'InProgress');
    if (!allowed) return;

    this.errorMessage.set(null);
    this.cards.update((cards) => cards.map((c) => (c.task.id === taskId ? { ...c, task: { ...c.task, developerWorkStatus: targetStatus } } : c)));

    this.ticketsService.updateTaskStatusAsDeveloper(ticketId, taskId, targetStatus).subscribe({
      next: () => this.manualRefresh.next(),
      error: (error) => {
        this.errorMessage.set(error.error?.error ?? 'Could not update this task.');
        this.manualRefresh.next();
      },
    });
  }
}
