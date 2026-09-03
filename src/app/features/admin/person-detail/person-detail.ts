import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PersonDetail } from '../../../core/admin/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { PagedResult, TICKET_STATUS_BADGE_CLASSES, TICKET_STATUS_LABELS, TicketDto, TicketStatus, priorityBadgeClasses } from '../../../core/tickets/models';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Pagination } from '../../../shared/ui/pagination/pagination';

type PersonRole = 'Party' | 'Developer';

const PAGE_SIZE = 10;
const POLL_MS = 10_000;
const STATUS_FILTERS: (TicketStatus | '')[] = ['', 'New', 'Assigned', 'InProgress', 'Resolved', 'Rejected', 'Closed', 'Revoked'];

/** Admin's profile view of one Party or Developer — which one is set by the route (`data.personRole`). */
@Component({
  selector: 'app-person-detail',
  imports: [DatePipe, FormsModule, RouterLink, Pagination, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notFound()) {
      <div class="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p class="text-sm text-slate-500">{{ notFound() }}</p>
        <a [routerLink]="backLink" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back</a>
      </div>
    } @else if (person(); as p) {
      <a [routerLink]="backLink" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back</a>

      <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold text-slate-900">{{ p.displayName }}</h1>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'">
              {{ p.isActive ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-500">{{ p.email }} · {{ p.role }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          @if (role === 'Party') {
            <button
              type="button"
              (click)="showImpersonateConfirm.set(true)"
              class="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
            >
              Log in as this party
            </button>
          }
          <button
            type="button"
            (click)="showToggleActiveConfirm.set(true)"
            class="rounded-md border px-3 py-1.5 text-sm font-medium"
            [class]="p.isActive ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-600 hover:bg-green-50'"
          >
            {{ p.isActive ? 'Deactivate' : 'Activate' }}
          </button>
        </div>
      </div>

      @if (actionError()) {
        <p class="mt-3 text-sm text-red-600" role="alert">{{ actionError() }}</p>
      }

      <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium text-slate-500">{{ role === 'Party' ? 'Complaints raised' : 'Tickets assigned' }}</p>
          <p class="mt-1 text-2xl font-semibold text-slate-900">{{ p.totalTicketCount }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium text-slate-500">Currently open</p>
          <p class="mt-1 text-2xl font-semibold text-slate-900">{{ p.openTicketCount }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium text-slate-500">Joined</p>
          <p class="mt-1 text-sm font-medium text-slate-700">{{ p.createdAtUtc | date: 'mediumDate' }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium text-slate-500">Last login</p>
          <p class="mt-1 text-sm font-medium text-slate-700">{{ p.lastLoginAtUtc ? (p.lastLoginAtUtc | date: 'medium') : 'Never' }}</p>
        </div>
      </div>

      @if (role === 'Party') {
        <div class="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h2 class="text-sm font-semibold text-slate-900">Party details</h2>
          <dl class="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <dt class="text-slate-500">Location</dt>
              <dd class="font-medium text-slate-700">{{ p.location ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Branch</dt>
              <dd class="font-medium text-slate-700">{{ p.branch ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Owner phone</dt>
              <dd class="font-medium text-slate-700">{{ p.phoneNumber ?? '—' }}</dd>
            </div>
          </dl>
        </div>
      }

      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h2 class="text-sm font-semibold text-slate-900">
            {{ role === 'Party' ? 'Complaints raised' : 'Tickets assigned' }} ({{ ticketsResult().totalCount }})
          </h2>
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
            <input
              type="search"
              placeholder="Search title/description…"
              [(ngModel)]="search"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 py-1.5 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        @if (ticketsLoading()) {
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
                  <th class="px-4 py-2.5">{{ role === 'Party' ? 'Developer' : 'Party' }}</th>
                  <th class="px-4 py-2.5">Submitted</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (ticket of ticketsResult().items; track ticket.id) {
                  <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="['/app/admin/tickets', ticket.id]">
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
                    <td class="px-4 py-2.5 text-slate-600">
                      {{ role === 'Party' ? (ticket.assignedDeveloperDisplayName ?? '—') : ticket.createdByDisplayName }}
                    </td>
                    <td class="px-4 py-2.5 text-slate-600">{{ ticket.createdAtUtc | date: 'mediumDate' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-slate-500">No tickets match this filter.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="ticketsPage()"
            [totalPages]="ticketsTotalPages()"
            [totalItems]="ticketsResult().totalCount"
            [pageSize]="pageSizeValue"
            (pageChange)="goToPage($event)"
          />
        }
      </div>

      <app-confirm-dialog
        [open]="showToggleActiveConfirm()"
        [title]="p.isActive ? 'Deactivate this account?' : 'Activate this account?'"
        [message]="p.isActive ? 'They will be signed out of every device immediately and unable to log back in until reactivated.' : 'They will be able to sign in again.'"
        [confirmLabel]="p.isActive ? 'Deactivate' : 'Activate'"
        [destructive]="p.isActive"
        [busy]="actionPending()"
        (confirm)="toggleActive(p)"
        (cancel)="showToggleActiveConfirm.set(false)"
      />
      <app-confirm-dialog
        [open]="showImpersonateConfirm()"
        title="Log in as this party?"
        message="You'll be signed in as them in this browser. You'll need to log back in as Admin afterwards to return."
        confirmLabel="Log in as them"
        [busy]="actionPending()"
        (confirm)="impersonate()"
        (cancel)="showImpersonateConfirm.set(false)"
      />
    } @else {
      <p class="text-sm text-slate-500" role="status">Loading…</p>
    }
  `,
})
export class PersonDetailPage implements OnInit {
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly statusClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly priorityClasses = priorityBadgeClasses;
  protected readonly statusOptions = STATUS_FILTERS;
  protected readonly pageSizeValue = PAGE_SIZE;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminService = inject(AdminService);
  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly role: PersonRole = this.route.snapshot.data['personRole'];
  protected readonly backLink = this.role === 'Party' ? '/app/admin/parties' : '/app/admin/developers';
  private readonly personId = this.route.snapshot.paramMap.get('id')!;

  protected readonly person = signal<PersonDetail | null>(null);
  protected readonly notFound = signal<string | null>(null);
  protected readonly actionPending = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly showToggleActiveConfirm = signal(false);
  protected readonly showImpersonateConfirm = signal(false);

  protected search = '';
  protected statusFilter: TicketStatus | '' = '';
  protected readonly ticketsPage = signal(1);
  protected readonly ticketsLoading = signal(true);
  protected readonly ticketsResult = signal<PagedResult<TicketDto>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly ticketsTotalPages = signal(1);

  private readonly ticketsRefresh = new Subject<void>();

  ngOnInit(): void {
    this.loadPerson();

    merge(timer(0, POLL_MS), this.ticketsRefresh)
      .pipe(
        switchMap(() => {
          const filter = {
            page: this.ticketsPage(),
            pageSize: PAGE_SIZE,
            status: this.statusFilter || undefined,
            search: this.search || undefined,
            ...(this.role === 'Party' ? { createdByUserId: this.personId } : { assignedDeveloperId: this.personId }),
          };
          return this.ticketsService.getAdminTickets(filter).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.ticketsResult.set(result);
          this.ticketsTotalPages.set(Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)));
        }
        this.ticketsLoading.set(false);
      });
  }

  private loadPerson(): void {
    const request$ = this.role === 'Party' ? this.adminService.getPartyDetail(this.personId) : this.adminService.getDeveloperDetail(this.personId);
    request$.subscribe({
      next: (person) => this.person.set(person),
      error: () => this.notFound.set(`This ${this.role.toLowerCase()} could not be found.`),
    });
  }

  onFilterChange(): void {
    this.ticketsPage.set(1);
    this.ticketsRefresh.next();
  }

  goToPage(page: number): void {
    this.ticketsPage.set(page);
    this.ticketsRefresh.next();
  }

  toggleActive(person: PersonDetail): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.adminService.setUserActive(person.id, !person.isActive).subscribe({
      next: () => {
        this.actionPending.set(false);
        this.showToggleActiveConfirm.set(false);
        this.loadPerson();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showToggleActiveConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update this account.');
      },
    });
  }

  impersonate(): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.adminService.impersonateParty(this.personId).subscribe({
      next: () => {
        // Our own session cookies were just replaced with the party's —
        // a hard navigation re-resolves the app's identity from scratch.
        window.location.href = '/app';
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showImpersonateConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not log in as this party.');
      },
    });
  }
}
