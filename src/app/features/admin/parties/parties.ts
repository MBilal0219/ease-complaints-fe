import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PagedResult, PersonSummary } from '../../../core/admin/models';
import { resolveAdminBase } from '../../../core/admin/route-base';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PartyFormModal } from '../party-form-modal/party-form-modal';
import { PendingInvitations } from '../pending-invitations/pending-invitations';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 10;
const POLL_MS = 8_000;

@Component({
  selector: 'app-parties',
  imports: [DatePipe, FormsModule, RouterLink, PartyFormModal, PendingInvitations, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Parties</h1>
        <p class="mt-1 text-sm text-slate-500">End users who submit complaints.</p>
      </div>
      <button
        type="button"
        (click)="showAddModal.set(true)"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Add Party
      </button>
    </div>

    <div class="mt-6">
      <app-pending-invitations #pendingInvitations role="User" />
    </div>

    <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 class="text-sm font-semibold text-slate-900">All parties ({{ result().totalCount }})</h2>
        <div class="relative">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="search"
            placeholder="Search by name or email…"
            [(ngModel)]="search"
            (ngModelChange)="onSearchChange()"
            class="rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Name</th>
                <th class="px-4 py-2.5">Email</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Open complaints</th>
                <th class="px-4 py-2.5">Joined</th>
                <th class="px-4 py-2.5">Last login</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (party of result().items; track party.id) {
                <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="[base, 'parties', party.id]">
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ party.displayName }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ party.email }}</td>
                  <td class="px-4 py-2.5">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="party.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'"
                    >
                      {{ party.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ party.openTicketCount }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ party.createdAtUtc | date: 'mediumDate' }}</td>
                  <td class="px-4 py-2.5 text-slate-600">
                    {{ party.lastLoginAtUtc ? (party.lastLoginAtUtc | date: 'medium') : 'Never' }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">No parties yet.</td>
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

    <app-party-form-modal [open]="showAddModal()" (closed)="showAddModal.set(false)" (created)="onCreated()" />
  `,
})
export class PartiesPage implements OnInit {
  @ViewChild('pendingInvitations') private pendingInvitations?: PendingInvitations;

  protected readonly pageSizeValue = PAGE_SIZE;

  private readonly adminService = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  /** `/app/admin` or `/app/implementator` — this page is shared by both shells. */
  protected readonly base = resolveAdminBase(inject(ActivatedRoute));

  protected search = '';
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<PersonSummary>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);
  protected readonly showAddModal = signal(false);

  private searchTerm = signal('');
  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    // Polls every POLL_MS for live updates, plus fires immediately whenever
    // the user changes the search term, page, or just created someone new.
    merge(timer(0, POLL_MS), this.manualRefresh)
      .pipe(
        switchMap(() => this.adminService.getParties(this.searchTerm(), this.page(), PAGE_SIZE).pipe(catchError(() => of(null)))),
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

  onSearchChange(): void {
    this.searchTerm.set(this.search);
    this.page.set(1);
    this.manualRefresh.next();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }

  onCreated(): void {
    this.showAddModal.set(false);
    this.manualRefresh.next();
    this.pendingInvitations?.refresh();
  }
}
