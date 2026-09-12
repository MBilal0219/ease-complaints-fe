import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PagedResult } from '../../../core/admin/models';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN } from '../../../core/auth/models';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ReportsModal } from '../../reports/reports-modal/reports-modal';
import { CALL_OUTCOME_BADGE_CLASSES, CALL_OUTCOME_LABELS, CallOutcome, CallSummary, CustomerDirectoryEntry } from '../../../core/sales-person/models';
import { CallFilter, SalesPersonService } from '../../../core/sales-person/sales-person.service';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 15;
const POLL_MS = 15_000;
const OUTCOME_OPTIONS: (CallOutcome | '')[] = ['', 'Complaint', 'Payment', 'Commitment', 'Notes'];

/** Local calendar date as YYYY-MM-DD — NOT toISOString(), which converts to UTC first and can land on the wrong day near midnight in timezones ahead of UTC. */
function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** "Today"/"Yesterday"/"N days ago" for the customer directory sidebar's last-interaction line — no relative-time helper exists anywhere else in this codebase yet, see calls.ts's own note on why a plain function over a Pipe. */
function daysAgoLabel(dateUtc: string | null): string {
  if (!dateUtc) return 'Never';
  const then = new Date(dateUtc);
  const thenDateOnly = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((todayDateOnly.getTime() - thenDateOnly.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/**
 * Every call logged by every Sales Person (company-wide, not just "my own")
 * — see docs/modules/sales-person-calls.md. Shared by Admin and Sales
 * Person, same pattern as LeadsListPage: Admin's variant has no "+ Log a
 * Call" button (Admin doesn't make calls), but rows link into the same
 * call-detail/edit page as the Sales Person's own — see call-detail.ts's
 * own isAdmin branching. Admin reaches the Referrals Collection Report from
 * here too.
 */
@Component({
  selector: 'app-calls',
  imports: [DatePipe, NgTemplateOutlet, FormsModule, RouterLink, Pagination, ReportsModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Calls</h1>
        <p class="mt-1 text-sm text-slate-500">Every customer contact logged by the team.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" (click)="showReports.set(true)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Reports
        </button>
        @if (!isAdmin()) {
          <a routerLink="/app/sales-person/calls/new" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            + Log a Call
          </a>
        }
      </div>
    </div>

    <div class="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-4">
      <!-- Customer directory — click a customer to filter the table without searching every time. -->
      <div class="lg:col-span-1">
        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div class="border-b border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Customers</h2>
              @if (selectedCustomerUserId()) {
                <button type="button" (click)="selectCustomer(null)" class="text-xs font-medium text-indigo-600 hover:text-indigo-500">Clear</button>
              }
            </div>
            <input
              type="search"
              placeholder="Search customer or company…"
              [ngModel]="customerSearch()"
              (ngModelChange)="customerSearch.set($event)"
              class="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div class="max-h-[40rem] divide-y divide-slate-100 overflow-y-auto">
            @for (customer of filteredCustomerDirectory(); track customer.customerUserId) {
              <button
                type="button"
                (click)="selectCustomer(customer.customerUserId)"
                class="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                [class.bg-indigo-50]="selectedCustomerUserId() === customer.customerUserId"
              >
                <p class="font-medium text-slate-900">{{ customer.displayName }}</p>
                <p class="text-xs text-slate-500">{{ customer.companyName || '—' }}</p>
                <p class="text-xs text-slate-400">{{ customer.location || '—' }}</p>
                <p class="text-xs text-slate-400">
                  {{ daysAgo(customer.lastCallAtUtc) }}{{ customer.lastCallBySalesPersonDisplayName ? ' with ' + lastCallByLabel(customer) : '' }}
                </p>
              </button>
            } @empty {
              <p class="p-3 text-sm text-slate-400">No customers found.</p>
            }
          </div>
        </div>
      </div>

      <div class="lg:col-span-3">
        <div class="flex flex-wrap items-end gap-2">
          <input
            type="search"
            placeholder="Search customer or notes…"
            [(ngModel)]="search"
            (ngModelChange)="onFilterChange()"
            class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <select
            [(ngModel)]="outcomeFilter"
            (ngModelChange)="onFilterChange()"
            class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            @for (option of outcomeOptions; track option) {
              <option [value]="option">{{ option === '' ? 'Any outcome' : outcomeLabels[option] }}</option>
            }
          </select>
          <div class="flex items-center gap-1.5">
            <label class="text-xs text-slate-500">From</label>
            <input
              type="date"
              [(ngModel)]="dateFrom"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <label class="text-xs text-slate-500">To</label>
            <input
              type="date"
              [(ngModel)]="dateTo"
              (ngModelChange)="onFilterChange()"
              class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button type="button" (click)="applyQuickRange(0)" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Today</button>
          <button type="button" (click)="applyQuickRange(6)" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Last 7 days</button>
          @if (dateFrom || dateTo) {
            <button type="button" (click)="clearDateRange()" class="text-xs font-medium text-slate-500 hover:text-slate-700">Clear dates</button>
          }
        </div>

        <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div class="border-b border-slate-100 p-4">
            <h2 class="text-sm font-semibold text-slate-900">All calls ({{ result().totalCount }})</h2>
          </div>

          @if (loading()) {
            <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
          } @else {
            <div class="divide-y divide-slate-100">
              @for (call of result().items; track call.id) {
                <a [routerLink]="[isAdmin() ? '/app/admin/calls' : '/app/sales-person/calls', call.id]" class="block p-4 hover:bg-slate-50">
                  <ng-container [ngTemplateOutlet]="rowContent" [ngTemplateOutletContext]="{ call: call }" />
                </a>
              } @empty {
                <p class="p-8 text-center text-sm text-slate-500">No calls logged yet.</p>
              }
            </div>

            <ng-template #rowContent let-call="call">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-slate-900">{{ call.customerCompanyName }}</span>
                    @if (call.customerBranchName) {
                      <span class="text-xs text-slate-400">({{ call.customerBranchName }})</span>
                    }
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="outcomeClass(call.outcome)">{{ outcomeLabel(call.outcome) }}</span>
                    @if (call.leadCount > 0) {
                      <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{{ call.leadCount }} referral{{ call.leadCount === 1 ? '' : 's' }}</span>
                    }
                  </div>
                  <p class="mt-0.5 text-sm text-slate-500">{{ call.customerDisplayName }} <span class="text-slate-400">· {{ call.customerEmail }}</span></p>
                </div>
                <span class="shrink-0 text-xs text-slate-400">{{ call.createdAtUtc | date: 'medium' }} · by {{ isMine(call) ? 'you' : call.salesPersonDisplayName }}</span>
              </div>
              @if (call.previewText) {
                <p class="mt-2 truncate text-sm text-slate-600">{{ call.previewText }}</p>
              }
            </ng-template>

            <div class="p-4">
              <app-pagination
                [page]="page()"
                [totalPages]="totalPages()"
                [totalItems]="result().totalCount"
                [pageSize]="pageSizeValue"
                (pageChange)="goToPage($event)"
              />
            </div>
          }
        </div>
      </div>
    </div>

    <app-reports-modal [open]="showReports()" (closed)="showReports.set(false)" />
  `,
})
export class CallsPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;
  protected readonly outcomeOptions = OUTCOME_OPTIONS;
  protected readonly outcomeLabels = CALL_OUTCOME_LABELS;
  protected readonly outcomeClasses = CALL_OUTCOME_BADGE_CLASSES;
  protected readonly showReports = signal(false);

  private readonly salesPersonService = inject(SalesPersonService);
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Same shared component mounted at both /app/admin/calls and /app/sales-person/calls — see leads-list.ts's basePath() for the same pattern. */
  protected readonly isAdmin = computed(() => this.authService.currentUser()?.roles.includes(ROLE_ADMIN) ?? false);

  protected search = '';
  protected outcomeFilter: CallOutcome | '' = '';
  protected dateFrom = '';
  protected dateTo = '';
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<CallSummary>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);

  protected readonly customerDirectory = signal<CustomerDirectoryEntry[]>([]);
  protected readonly selectedCustomerUserId = signal<string | null>(null);
  protected readonly customerSearch = signal('');

  /** Client-side — the whole directory is already fetched in one shot (see ngOnInit), so a second network round trip per keystroke isn't worth it. */
  protected readonly filteredCustomerDirectory = computed(() => {
    const term = this.customerSearch().trim().toLowerCase();
    if (!term) return this.customerDirectory();
    return this.customerDirectory().filter(
      (c) => c.displayName.toLowerCase().includes(term) || c.companyName.toLowerCase().includes(term) || (c.location ?? '').toLowerCase().includes(term),
    );
  });

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.outcomeFilter = (params.get('outcome') as CallOutcome | '') ?? '';
    this.search = params.get('search') ?? '';

    // Default to the last month when neither bound is in the URL — an
    // explicit "Clear dates" (or picking a custom range) still works as
    // unrestricted, this only affects the very first load.
    if (params.has('dateFrom') || params.has('dateTo')) {
      this.dateFrom = params.get('dateFrom') ?? '';
      this.dateTo = params.get('dateTo') ?? '';
    } else {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      this.dateFrom = isoDate(from);
      this.dateTo = isoDate(to);
    }

    const directory$ = this.isAdmin() ? this.adminService.getCustomerDirectory() : this.salesPersonService.getCustomerDirectory();
    directory$.pipe(catchError(() => of([] as CustomerDirectoryEntry[])), takeUntilDestroyed(this.destroyRef)).subscribe((directory) => this.customerDirectory.set(directory));

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => {
          const request$ = this.isAdmin() ? this.adminService.getCalls(this.buildFilter()) : this.salesPersonService.getCalls(this.buildFilter());
          return request$.pipe(catchError(() => of(null)));
        }),
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

  private buildFilter(): CallFilter {
    return {
      page: this.page(),
      pageSize: PAGE_SIZE,
      outcome: this.outcomeFilter || undefined,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
      search: this.search || undefined,
      customerUserId: this.selectedCustomerUserId() || undefined,
    };
  }

  /** Clicking the already-selected customer clears the filter — the same "Clear" button in the sidebar header also calls this with null. */
  protected selectCustomer(customerUserId: string | null): void {
    this.selectedCustomerUserId.set(this.selectedCustomerUserId() === customerUserId ? null : customerUserId);
    this.onFilterChange();
  }

  protected daysAgo(dateUtc: string | null): string {
    return daysAgoLabel(dateUtc);
  }

  protected lastCallByLabel(customer: CustomerDirectoryEntry): string {
    if (customer.lastCallBySalesPersonUserId === this.authService.currentUser()?.id) return 'you';
    return customer.lastCallBySalesPersonDisplayName ?? '';
  }

  onFilterChange(): void {
    this.page.set(1);
    this.syncUrl();
    this.manualRefresh.next();
  }

  applyQuickRange(daysBack: number): void {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    this.dateFrom = isoDate(from);
    this.dateTo = isoDate(to);
    this.onFilterChange();
  }

  clearDateRange(): void {
    this.dateFrom = '';
    this.dateTo = '';
    this.onFilterChange();
  }

  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        outcome: this.outcomeFilter || null,
        dateFrom: this.dateFrom || null,
        dateTo: this.dateTo || null,
        search: this.search || null,
      },
      replaceUrl: true,
    });
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }

  protected isMine(call: CallSummary): boolean {
    return call.salesPersonUserId === this.authService.currentUser()?.id;
  }

  /** Typed lookup for the #rowContent ng-template — its `call` context var is untyped (any), so direct Record indexing there doesn't type-check. */
  protected outcomeLabel(outcome: string): string {
    return this.outcomeLabels[outcome as CallOutcome];
  }

  protected outcomeClass(outcome: string): string {
    return this.outcomeClasses[outcome as CallOutcome];
  }
}
