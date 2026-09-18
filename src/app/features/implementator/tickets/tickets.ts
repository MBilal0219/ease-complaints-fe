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
  CategoryDto,
  ESTIMATE_UNITS,
  EstimateUnit,
  PENDING_STATUS_QUERY_VALUE,
  PagedResult,
  PriorityDto,
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

/**
 * Implementator's own complaint-management list — same company-wide ticket
 * view and actions as AdminTicketsPage (they now share the exact same
 * /api/v1/admin/tickets* endpoints, see RoleNames.ComplaintManagers), just
 * routed under /app/implementator instead of /app/admin. Kept as a separate
 * copy (not a shared/parameterized component) — same pattern as every other
 * role-mirrored page this session (sales-people.ts -> implementators.ts,
 * etc.): the routerLinks below need a different base path, which isn't
 * worth threading through as an @Input for one page.
 */
@Component({
  selector: 'app-implementator-tickets',
  imports: [DatePipe, FormsModule, RouterLink, Pagination, StatusDropdown, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Complaints</h1>
        <p class="mt-1 text-sm text-slate-500">Every complaint submitted by a party, across every status.</p>
      </div>
      <button
        type="button"
        (click)="openCreateComplaint()"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Create Complaint
      </button>
    </div>

    @if (actionError()) {
      <p class="mt-3 text-sm text-red-600" role="alert">{{ actionError() }}</p>
    }

    <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">All complaints ({{ result().totalCount }})</h2>
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
                  <td class="cursor-pointer px-4 py-2.5 font-mono text-xs text-slate-500" [routerLink]="['/app/implementator/tickets', ticket.id]">{{ ticket.ticketNumber }}</td>
                  <td class="cursor-pointer px-4 py-2.5 font-medium text-slate-900" [routerLink]="['/app/implementator/tickets', ticket.id]">{{ ticket.title }}</td>
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
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/implementator/tickets', ticket.id]">{{ ticket.createdByDisplayName || '—' }}</td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/implementator/tickets', ticket.id]">{{ ticket.companyName || '—' }}</td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/implementator/tickets', ticket.id]">{{ ticket.assignedDeveloperDisplayName ?? '—' }}</td>
                  <td class="cursor-pointer px-4 py-2.5 font-medium text-indigo-700" [routerLink]="['/app/implementator/tickets', ticket.id]">
                    {{ formatDurationFull(ticket.pendingMinutes) }}
                  </td>
                  <td class="cursor-pointer px-4 py-2.5 text-slate-600" [routerLink]="['/app/implementator/tickets', ticket.id]">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
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

    <app-modal [open]="showCreateComplaint()" (close)="showCreateComplaint.set(false)">
      <h2 class="text-base font-semibold text-slate-900">Create Complaint</h2>
      <p class="mt-1 text-sm text-slate-500">File a complaint on a Party's behalf, or without one at all.</p>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div>
            <p class="text-sm font-medium text-slate-700">Attach a Party</p>
            <p class="text-xs text-slate-500">Turn off to file this with no party attached.</p>
          </div>
          <label class="inline-flex cursor-pointer items-center">
            <input type="checkbox" [(ngModel)]="hasParty" (ngModelChange)="onHasPartyChange()" class="peer sr-only" />
            <span class="peer relative h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-4"></span>
          </label>
        </div>

        @if (hasParty) {
          <div>
            <label class="block text-sm font-medium text-slate-700">Party</label>
            @if (selectedParty(); as party) {
              <div class="mt-1 flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                <span class="font-medium text-slate-800">{{ party.displayName }} <span class="text-slate-500">({{ party.email }})</span></span>
                <button type="button" (click)="selectedParty.set(null)" class="text-xs font-medium text-indigo-600 hover:text-indigo-500">Change</button>
              </div>
            } @else {
              <input
                type="search"
                placeholder="Search parties by name or email…"
                [(ngModel)]="partySearch"
                (ngModelChange)="onPartySearchChange()"
                class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              @if (partyResults().length > 0) {
                <div class="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1.5">
                  @for (party of partyResults(); track party.id) {
                    <button
                      type="button"
                      (click)="selectedParty.set(party)"
                      class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span class="font-medium text-slate-800">{{ party.displayName }}</span>
                      <span class="text-xs text-slate-400">{{ party.email }}</span>
                    </button>
                  }
                </div>
              }
            }
          </div>
        }

        <div>
          <label class="block text-sm font-medium text-slate-700">Title</label>
          <input type="text" [(ngModel)]="newTitle" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Description</label>
          <textarea rows="4" [(ngModel)]="newDescription" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-slate-700">Category</label>
            <select [(ngModel)]="newCategoryId" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700">Priority</label>
            <select [(ngModel)]="newPriorityId" class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              @for (priority of priorities(); track priority.id) {
                <option [value]="priority.id">{{ priority.name }}</option>
              }
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label class="block text-sm font-medium text-slate-700">Estimated time <span class="text-red-500">*</span></label>
            <div class="mt-1 flex gap-2">
              <input type="number" min="1" [(ngModel)]="newEstimateValue" class="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <select [(ngModel)]="newEstimateUnit" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                @for (unit of estimateUnits; track unit) { <option [value]="unit">{{ unit }}</option> }
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700">Amount <span class="text-slate-400">(optional)</span></label>
            <input type="number" min="0" step="0.01" [(ngModel)]="newAmount" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>
      </div>

      @if (createError()) {
        <p class="mt-2 text-sm text-red-600" role="alert">{{ createError() }}</p>
      }

      <div class="mt-4 flex justify-end gap-3">
        <button type="button" (click)="showCreateComplaint.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button
          type="button"
          (click)="createComplaint()"
          [disabled]="creating() || !newTitle.trim() || newDescription.trim().length < 3 || !newCategoryId || !newPriorityId || (hasParty && !selectedParty()) || !newEstimateValue || newEstimateValue <= 0"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ creating() ? 'Creating…' : 'Create complaint' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ImplementatorTicketsPage implements OnInit {
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

  // ---- Create Complaint (req #7) ----
  protected readonly showCreateComplaint = signal(false);
  protected readonly categories = signal<CategoryDto[]>([]);
  protected readonly priorities = signal<PriorityDto[]>([]);
  protected hasParty = true;
  protected partySearch = '';
  protected readonly partyResults = signal<PersonSummary[]>([]);
  protected readonly selectedParty = signal<PersonSummary | null>(null);
  protected newTitle = '';
  protected newDescription = '';
  protected newCategoryId: number | '' = '';
  protected newPriorityId: number | '' = '';
  protected newEstimateValue: number | null = null;
  protected newEstimateUnit: EstimateUnit = 'Hours';
  protected newAmount: number | null = null;
  protected readonly estimateUnits = ESTIMATE_UNITS;
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    this.adminService.getDevelopers('', 1, 100).subscribe((result) => this.developers.set(result.items));
    this.ticketsService.getLookups().subscribe((lookups) => {
      this.categories.set(lookups.categories);
      this.priorities.set(lookups.priorities);
    });

    const params = this.route.snapshot.queryParamMap;
    const status = params.get('status');
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

  // ---- Create Complaint (req #7) ----

  openCreateComplaint(): void {
    this.hasParty = true;
    this.partySearch = '';
    this.partyResults.set([]);
    this.selectedParty.set(null);
    this.newTitle = '';
    this.newDescription = '';
    this.newCategoryId = this.categories()[0]?.id ?? '';
    this.newPriorityId = this.priorities()[0]?.id ?? '';
    this.newEstimateValue = null;
    this.newEstimateUnit = 'Hours';
    this.newAmount = null;
    this.createError.set(null);
    this.showCreateComplaint.set(true);
  }

  onHasPartyChange(): void {
    this.selectedParty.set(null);
    this.partySearch = '';
    this.partyResults.set([]);
  }

  onPartySearchChange(): void {
    const term = this.partySearch.trim();
    if (term.length < 2) {
      this.partyResults.set([]);
      return;
    }
    this.adminService.getParties(term, 1, 8).subscribe((result) => this.partyResults.set(result.items));
  }

  createComplaint(): void {
    const title = this.newTitle.trim();
    const description = this.newDescription.trim();
    if (!title || description.length < 3 || !this.newCategoryId || !this.newPriorityId || this.creating()) return;
    if (this.hasParty && !this.selectedParty()) return;
    if (this.newEstimateValue == null || this.newEstimateValue <= 0) {
      this.createError.set('Estimated time is required and must be greater than zero.');
      return;
    }

    this.creating.set(true);
    this.createError.set(null);
    this.ticketsService
      .createAsImplementator({
        title,
        description,
        categoryId: Number(this.newCategoryId),
        priorityId: Number(this.newPriorityId),
        partyUserId: this.hasParty ? (this.selectedParty()?.id ?? null) : null,
        estimateValue: this.newEstimateValue,
        estimateUnit: this.newEstimateUnit,
        amount: this.newAmount ?? undefined,
      })
      .subscribe({
        next: (ticket) => {
          this.creating.set(false);
          this.showCreateComplaint.set(false);
          this.router.navigate(['/app/implementator/tickets', ticket.id]);
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          this.createError.set(error.error?.error ?? 'Could not create this complaint.');
        },
      });
  }
}
