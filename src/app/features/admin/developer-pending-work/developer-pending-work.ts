import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminService } from '../../../core/admin/admin.service';
import {
  CompanyListItem,
  DeveloperPendingTicket,
  DeveloperPendingTicketFilter,
  PersonSummary,
} from '../../../core/admin/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { CategoryDto, PriorityDto, formatDurationFull } from '../../../core/tickets/models';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-developer-pending-work',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 sm:p-6">
      <a [routerLink]="dashboardRoute()" class="text-sm font-medium text-indigo-600 hover:text-indigo-700">← Back to dashboard</a>

      <div class="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">{{ developerName() || 'Developer' }} — Pending complaints</h1>
          <p class="mt-1 text-sm text-slate-500">Current complaints that still contain active work assigned to this developer.</p>
        </div>
        <div class="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-right">
          <p class="text-xs font-medium uppercase tracking-wide text-indigo-600">Total remaining time</p>
          <p class="mt-1 text-lg font-semibold text-indigo-700">{{ formatDuration(totalPendingMinutes()) }}</p>
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label class="text-xs font-medium text-slate-600">
            Status
            <input
              list="developer-status-list"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="All statuses"
              [value]="statusText()"
              (change)="setStatus(($any($event.target).value))"
            />
            <datalist id="developer-status-list">
              <option value="All statuses"></option>
              <option value="New"></option>
              <option value="Assigned"></option>
              <option value="In Progress"></option>
            </datalist>
          </label>

          <label class="text-xs font-medium text-slate-600">
            Company
            <input
              list="developer-company-list"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="All companies"
              [value]="companyText()"
              (change)="setCompany(($any($event.target).value))"
            />
            <datalist id="developer-company-list">
              <option value="All companies"></option>
              @for (company of companies(); track company.id) {
                <option [value]="company.name"></option>
              }
            </datalist>
          </label>

          <label class="text-xs font-medium text-slate-600">
            Party
            <input
              list="developer-party-list"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="All parties"
              [value]="partyText()"
              (change)="setParty(($any($event.target).value))"
            />
            <datalist id="developer-party-list">
              <option value="All parties"></option>
              @for (party of parties(); track party.id) {
                <option [value]="party.displayName"></option>
              }
            </datalist>
          </label>

          <label class="text-xs font-medium text-slate-600">
            Category
            <input
              list="developer-category-list"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="All categories"
              [value]="categoryText()"
              (change)="setCategory(($any($event.target).value))"
            />
            <datalist id="developer-category-list">
              <option value="All categories"></option>
              @for (category of categories(); track category.id) {
                <option [value]="category.name"></option>
              }
            </datalist>
          </label>

          <label class="text-xs font-medium text-slate-600">
            Priority
            <input
              list="developer-priority-list"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="All priorities"
              [value]="priorityText()"
              (change)="setPriority(($any($event.target).value))"
            />
            <datalist id="developer-priority-list">
              <option value="All priorities"></option>
              @for (priority of priorities(); track priority.id) {
                <option [value]="priority.name"></option>
              }
            </datalist>
          </label>

          <label class="text-xs font-medium text-slate-600">
            Search
            <input
              type="search"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ticket, title, party, company…"
              [value]="searchText()"
              (keyup.enter)="setSearch(($any($event.target).value))"
              (change)="setSearch(($any($event.target).value))"
            />
          </label>
        </div>
        <div class="mt-3 flex justify-end">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" (click)="clearFilters()">Clear filters</button>
        </div>
      </div>

      <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        @if (loading()) {
          <p class="p-8 text-center text-sm text-slate-500">Loading…</p>
        } @else if (items().length === 0) {
          <p class="p-8 text-center text-sm text-slate-500">No pending complaints match these filters.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-3">Ticket</th>
                  <th class="px-4 py-3">Title</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="px-4 py-3">Priority</th>
                  <th class="px-4 py-3">Party</th>
                  <th class="px-4 py-3">Company</th>
                  <th class="px-4 py-3 text-right">Pending tasks</th>
                  <th class="px-4 py-3 text-right">Remaining time</th>
                  <th class="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (item of items(); track item.ticketId) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 font-mono text-xs text-indigo-600">
                      <a [routerLink]="ticketRoute(item)" class="hover:underline">{{ item.ticketNumber }}</a>
                    </td>
                    <td class="px-4 py-3 font-medium text-slate-900">
                      <a [routerLink]="ticketRoute(item)" class="hover:text-indigo-700">{{ item.title }}</a>
                    </td>
                    <td class="px-4 py-3 text-slate-700">{{ statusLabel(item.status) }}</td>
                    <td class="px-4 py-3 text-slate-700">{{ item.priorityName }}</td>
                    <td class="px-4 py-3 text-slate-700">{{ item.partyName || '—' }}</td>
                    <td class="px-4 py-3 text-slate-700">{{ item.companyName || '—' }}</td>
                    <td class="px-4 py-3 text-right font-medium text-amber-700">{{ item.pendingTaskCount }}</td>
                    <td class="px-4 py-3 text-right font-semibold text-indigo-700">{{ formatDuration(item.pendingMinutes) }}</td>
                    <td class="px-4 py-3 text-slate-600">{{ formatDate(item.createdAtUtc) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
            <p class="text-slate-500">Showing {{ rangeStart() }}–{{ rangeEnd() }} of {{ totalCount() }}</p>
            <div class="flex gap-2">
              <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40" [disabled]="page() <= 1" (click)="goPage(page() - 1)">Previous</button>
              <span class="px-2 py-1.5 text-slate-600">Page {{ page() }} of {{ totalPages() }}</span>
              <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40" [disabled]="page() >= totalPages()" (click)="goPage(page() + 1)">Next</button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class DeveloperPendingWorkPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly adminService = inject(AdminService);
  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly developerId = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly roleBase = this.route.snapshot.data['roleBase'] === 'implementator' ? 'implementator' : 'admin';

  protected readonly developerName = signal('');
  protected readonly items = signal<DeveloperPendingTicket[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly totalPendingMinutes = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);

  protected readonly companies = signal<CompanyListItem[]>([]);
  protected readonly parties = signal<PersonSummary[]>([]);
  protected readonly categories = signal<CategoryDto[]>([]);
  protected readonly priorities = signal<PriorityDto[]>([]);

  protected readonly statusText = signal('All statuses');
  protected readonly companyText = signal('All companies');
  protected readonly partyText = signal('All parties');
  protected readonly categoryText = signal('All categories');
  protected readonly priorityText = signal('All priorities');
  protected readonly searchText = signal('');

  private status: string | undefined;
  private companyId: string | undefined;
  private partyId: string | undefined;
  private categoryId: number | undefined;
  private priorityId: number | undefined;

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / PAGE_SIZE)));
  protected readonly rangeStart = computed(() => this.totalCount() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1);
  protected readonly rangeEnd = computed(() => Math.min(this.totalCount(), this.page() * PAGE_SIZE));

  ngOnInit(): void {
    forkJoin({
      companies: this.adminService.getCompanies(undefined, undefined, undefined).pipe(catchError(() => of([] as CompanyListItem[]))),
      parties: this.adminService.getParties('', 1, 100).pipe(catchError(() => of({ items: [], totalCount: 0, page: 1, pageSize: 100 }))),
      lookups: this.ticketsService.getLookups().pipe(catchError(() => of({ categories: [], priorities: [] }))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ companies, parties, lookups }) => {
        this.companies.set(companies);
        this.parties.set(parties.items);
        this.categories.set(lookups.categories);
        this.priorities.set(lookups.priorities);
      });

    this.load();
  }

  protected dashboardRoute(): string[] { return ['/app', this.roleBase, 'dashboard']; }
  protected ticketRoute(item: DeveloperPendingTicket): string[] { return ['/app', this.roleBase, 'tickets', item.ticketId]; }
  protected formatDuration(minutes: number): string { return formatDurationFull(minutes); }
  protected formatDate(value: string): string { return new Date(value).toLocaleDateString(); }
  protected statusLabel(value: string): string { return value === 'InProgress' ? 'In Progress' : value; }

  protected setStatus(value: string): void {
    const normalized = value.trim().toLowerCase();
    const map: Record<string, string | undefined> = {
      '': undefined, 'all statuses': undefined, new: 'New', assigned: 'Assigned', 'in progress': 'InProgress', inprogress: 'InProgress',
    };
    this.status = map[normalized];
    this.statusText.set(this.status ? this.statusLabel(this.status) : 'All statuses');
    this.resetAndLoad();
  }

  protected setCompany(value: string): void {
    const match = this.companies().find(c => c.name.toLowerCase() === value.trim().toLowerCase());
    this.companyId = match?.id;
    this.companyText.set(match?.name ?? 'All companies');
    this.resetAndLoad();
  }

  protected setParty(value: string): void {
    const match = this.parties().find(p => p.displayName.toLowerCase() === value.trim().toLowerCase());
    this.partyId = match?.id;
    this.partyText.set(match?.displayName ?? 'All parties');
    this.resetAndLoad();
  }

  protected setCategory(value: string): void {
    const match = this.categories().find(c => c.name.toLowerCase() === value.trim().toLowerCase());
    this.categoryId = match?.id;
    this.categoryText.set(match?.name ?? 'All categories');
    this.resetAndLoad();
  }

  protected setPriority(value: string): void {
    const match = this.priorities().find(p => p.name.toLowerCase() === value.trim().toLowerCase());
    this.priorityId = match?.id;
    this.priorityText.set(match?.name ?? 'All priorities');
    this.resetAndLoad();
  }

  protected setSearch(value: string): void {
    this.searchText.set(value.trim());
    this.resetAndLoad();
  }

  protected clearFilters(): void {
    this.status = undefined;
    this.companyId = undefined;
    this.partyId = undefined;
    this.categoryId = undefined;
    this.priorityId = undefined;
    this.statusText.set('All statuses');
    this.companyText.set('All companies');
    this.partyText.set('All parties');
    this.categoryText.set('All categories');
    this.priorityText.set('All priorities');
    this.searchText.set('');
    this.resetAndLoad();
  }

  protected goPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  private resetAndLoad(): void {
    this.page.set(1);
    this.load();
  }

  private load(): void {
    if (!this.developerId) return;
    this.loading.set(true);
    const filter: DeveloperPendingTicketFilter = {
      status: this.status,
      companyId: this.companyId,
      partyId: this.partyId,
      categoryId: this.categoryId,
      priorityId: this.priorityId,
      search: this.searchText() || undefined,
      page: this.page(),
      pageSize: PAGE_SIZE,
    };
    this.adminService.getDeveloperPendingTickets(this.developerId, filter)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        if (result) {
          this.developerName.set(result.developerDisplayName);
          this.items.set(result.items);
          this.totalCount.set(result.totalCount);
          this.totalPendingMinutes.set(result.totalPendingMinutes);
        }
        this.loading.set(false);
      });
  }
}
