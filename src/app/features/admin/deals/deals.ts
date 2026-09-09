import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { DealsService } from '../../../core/tickets/deals.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DEAL_STATUS_BADGE_CLASSES, DEAL_STATUS_LABELS, Deal, DealStatus, PagedResult } from '../../../core/tickets/models';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 15;
const POLL_MS = 15_000;
const STATUS_FILTERS: (DealStatus | '')[] = ['', 'DeliveryDatePending', 'Scheduled', 'Completed'];

/** Admin's Deal management — see docs/modules/sales-deals.md. Every "Sale" ticket lands here. */
@Component({
  selector: 'app-deals',
  imports: [DatePipe, FormsModule, RouterLink, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Sales</h1>
        <p class="mt-1 text-sm text-slate-500">Complaints converted into commercial deals.</p>
      </div>
      <select
        [(ngModel)]="statusFilter"
        (ngModelChange)="onFilterChange()"
        class="rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        @for (status of statusOptions; track status) {
          <option [value]="status">{{ status === '' ? 'All statuses' : statusLabels[status] }}</option>
        }
      </select>
    </div>

    <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div class="border-b border-slate-100 p-4">
        <h2 class="text-sm font-semibold text-slate-900">All sales ({{ result().totalCount }})</h2>
      </div>

      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Ticket</th>
                <th class="px-4 py-2.5">Estimated</th>
                <th class="px-4 py-2.5">Delivery date</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Converted by</th>
                <th class="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (deal of result().items; track deal.id) {
                <tr>
                  <td class="px-4 py-2.5">
                    <a [routerLink]="['/app/admin/tickets', deal.ticketId]" class="font-medium text-indigo-600 hover:text-indigo-500">{{ deal.ticketNumber }}</a>
                    <p class="text-xs text-slate-500">{{ deal.ticketTitle }}</p>
                  </td>
                  <td class="px-4 py-2.5 text-slate-700">{{ deal.estimatedAmount }}</td>
                  <td class="px-4 py-2.5 text-slate-700">{{ deal.deliveryDate ? (deal.deliveryDate | date: 'mediumDate') : '—' }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusClasses[deal.status]">{{ statusLabels[deal.status] }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ deal.createdByDisplayName }}</td>
                  <td class="px-4 py-2.5 text-right">
                    @if (deal.status !== 'Completed') {
                      <div class="flex justify-end gap-2">
                        @if (editingId() === deal.id) {
                          <input
                            type="date"
                            [(ngModel)]="editDate"
                            class="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button type="button" (click)="saveDeliveryDate(deal.id)" [disabled]="!editDate || busy()" class="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                            Save
                          </button>
                          <button type="button" (click)="editingId.set(null)" class="text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button>
                        } @else {
                          <button type="button" (click)="startEdit(deal)" class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            {{ deal.deliveryDate ? 'Edit date' : 'Set date' }}
                          </button>
                          <button type="button" (click)="markCompleted(deal.id)" [disabled]="busy()" class="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50">
                            Complete
                          </button>
                        }
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">No sales yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (actionError()) {
          <p class="border-t border-slate-100 p-3 text-sm text-red-600" role="alert">{{ actionError() }}</p>
        }

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
export class DealsPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;
  protected readonly statusOptions = STATUS_FILTERS;
  protected readonly statusLabels = DEAL_STATUS_LABELS;
  protected readonly statusClasses = DEAL_STATUS_BADGE_CLASSES;

  private readonly dealsService = inject(DealsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtimeService = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected statusFilter: DealStatus | '' = '';
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<Deal>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected editDate = '';

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    // Seeds the filter from the URL once on load — covers a direct link (e.g. the
    // dashboard's "Sales Awaiting Date" card) and a bookmarked or refreshed filtered
    // view. Kept in sync going forward via onFilterChange below.
    const status = this.route.snapshot.queryParamMap.get('status');
    this.statusFilter = (status as DealStatus | '') ?? '';

    merge(timer(0, POLL_MS), this.manualRefresh, this.realtimeService.notificationCreated$)
      .pipe(
        switchMap(() => this.dealsService.getDeals(this.statusFilter, this.page(), PAGE_SIZE).pipe(catchError(() => of(null)))),
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
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: this.statusFilter || null },
      replaceUrl: true,
    });
    this.manualRefresh.next();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }

  startEdit(deal: Deal): void {
    this.editDate = deal.deliveryDate ? deal.deliveryDate.slice(0, 10) : '';
    this.editingId.set(deal.id);
    this.actionError.set(null);
  }

  saveDeliveryDate(dealId: string): void {
    if (!this.editDate || this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.dealsService.setDeliveryDate(dealId, this.editDate).subscribe({
      next: () => {
        this.busy.set(false);
        this.editingId.set(null);
        this.manualRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.actionError.set(error.error?.error ?? 'Could not set the delivery date.');
      },
    });
  }

  markCompleted(dealId: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.dealsService.markCompleted(dealId).subscribe({
      next: () => {
        this.busy.set(false);
        this.manualRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.actionError.set(error.error?.error ?? 'Could not mark this deal completed.');
      },
    });
  }
}
