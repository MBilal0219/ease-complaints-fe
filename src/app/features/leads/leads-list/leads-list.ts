import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { PagedResult } from '../../../core/admin/models';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_ADMIN } from '../../../core/auth/models';
import {
  LEAD_CATEGORY_BADGE_CLASSES,
  LEAD_CATEGORY_LABELS,
  LEAD_INVITATION_STATUS_BADGE_CLASSES,
  LEAD_INVITATION_STATUS_LABELS,
  LEAD_SOURCE_BADGE_CLASSES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_BADGE_CLASSES,
  LEAD_STATUS_LABELS,
  LeadCategory,
  LeadSource,
  LeadSummary,
} from '../../../core/leads/models';
import { LeadsService } from '../../../core/leads/leads.service';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 15;
const POLL_MS = 15_000;
const SOURCE_OPTIONS: (LeadSource | '')[] = ['', 'Referral', 'Direct'];
const CATEGORY_OPTIONS: (LeadCategory | '')[] = ['', 'APlus', 'Cool', 'Warm'];

/** Every Lead, company-wide — prospective customers not yet fully added to the system, collected during a call or added directly. Shared by Admin and Sales Person, see docs/modules/leads.md. */
@Component({
  selector: 'app-leads-list',
  imports: [DatePipe, FormsModule, RouterLink, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Leads</h1>
        <p class="mt-1 text-sm text-slate-500">Prospective customers — collected on calls, plus anyone added directly.</p>
      </div>
      <a
        [routerLink]="[basePath(), 'new']"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Add Lead
      </a>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder="Search name or business…"
        [(ngModel)]="search"
        (ngModelChange)="onFilterChange()"
        class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <select
        [(ngModel)]="sourceFilter"
        (ngModelChange)="onFilterChange()"
        class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        @for (option of sourceOptions; track option) {
          <option [value]="option">{{ option === '' ? 'Any status' : sourceLabels[option] }}</option>
        }
      </select>
      <select
        [(ngModel)]="categoryFilter"
        (ngModelChange)="onFilterChange()"
        class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        @for (option of categoryOptions; track option) {
          <option [value]="option">{{ option === '' ? 'Any category' : categoryLabels[option] }}</option>
        }
      </select>
    </div>

    <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Name</th>
                <th class="px-4 py-2.5">Business</th>
                <th class="px-4 py-2.5">Source</th>
                <th class="px-4 py-2.5">Category</th>
                <th class="px-4 py-2.5">Deal status</th>
                <th class="px-4 py-2.5">Invitation</th>
                <th class="px-4 py-2.5">Follow-ups</th>
                <th class="px-4 py-2.5">Created by</th>
                <th class="px-4 py-2.5">Last activity</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (lead of result().items; track lead.id) {
                <tr [routerLink]="[basePath(), lead.id]" class="cursor-pointer hover:bg-slate-50">
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ lead.name }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ lead.businessName ?? '—' }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="sourceClasses[lead.source]">{{ sourceLabels[lead.source] }}</span>
                  </td>
                  <td class="px-4 py-2.5">
                    @if (lead.currentCategory; as category) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="categoryClasses[category]">{{ categoryLabels[category] }}</span>
                    } @else {
                      <span class="text-xs text-slate-400">Not yet followed up</span>
                    }
                  </td>
                  <td class="px-4 py-2.5">
                    @if (lead.currentStatus; as status) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[status]">{{ statusLabels[status] }}</span>
                    } @else {
                      <span class="text-xs text-slate-400">—</span>
                    }
                  </td>
                  <td class="px-4 py-2.5">
                    @if (lead.isConverted) {
                      <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Converted</span>
                    } @else if (lead.pendingInvitationStatus; as invStatus) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="invitationStatusClasses[invStatus]">{{ invitationStatusLabels[invStatus] }}</span>
                    } @else {
                      <span class="text-xs text-slate-400">—</span>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ lead.followUpCount }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ lead.createdByDisplayName }}</td>
                  <td class="px-4 py-2.5 text-slate-500">{{ lead.lastActivityAtUtc | date: 'medium' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="px-4 py-8 text-center text-slate-500">No leads yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

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
  `,
})
export class LeadsListPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly categoryOptions = CATEGORY_OPTIONS;
  protected readonly sourceLabels = LEAD_SOURCE_LABELS;
  protected readonly sourceClasses = LEAD_SOURCE_BADGE_CLASSES;
  protected readonly categoryLabels = LEAD_CATEGORY_LABELS;
  protected readonly categoryClasses = LEAD_CATEGORY_BADGE_CLASSES;
  protected readonly statusLabels = LEAD_STATUS_LABELS;
  protected readonly statusClasses = LEAD_STATUS_BADGE_CLASSES;
  protected readonly invitationStatusLabels = LEAD_INVITATION_STATUS_LABELS;
  protected readonly invitationStatusClasses = LEAD_INVITATION_STATUS_BADGE_CLASSES;

  private readonly leadsService = inject(LeadsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected search = '';
  protected sourceFilter: LeadSource | '' = '';
  protected categoryFilter: LeadCategory | '' = '';
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<LeadSummary>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);

  /** Same shared component mounted at both /app/admin/leads and /app/sales-person/leads. */
  protected readonly basePath = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    return roles.includes(ROLE_ADMIN) ? '/app/admin/leads' : '/app/sales-person/leads';
  });

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    merge(timer(0, POLL_MS), this.manualRefresh)
      .pipe(
        switchMap(() =>
          this.leadsService
            .getLeads({
              source: this.sourceFilter || undefined,
              category: this.categoryFilter || undefined,
              search: this.search || undefined,
              page: this.page(),
              pageSize: PAGE_SIZE,
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
    this.manualRefresh.next();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }
}
