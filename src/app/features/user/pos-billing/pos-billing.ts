import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, merge, of, switchMap } from 'rxjs';
import { SaleService } from '../../../core/sales/sale.service';
import { PagedResult, Sale, SaleItem, SaleOrderType, SaleSearchFilter, SaleStatus } from '../../../core/sales/models';
import { Modal } from '../../../shared/ui/modal/modal';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { VoidReissueModal } from '../void-reissue-modal/void-reissue-modal';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-pos-billing',
  imports: [FormsModule, DatePipe, DecimalPipe, Modal, Pagination, VoidReissueModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Billing</h1>
    <p class="mt-1 text-sm text-slate-500">Search and review past sales. Punch orders from the Sale terminal.</p>

    <div class="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div class="min-w-[200px] flex-1">
        <label for="search" class="block text-xs font-medium text-slate-500">Invoice # or customer name</label>
        <input
          id="search"
          type="search"
          [(ngModel)]="search"
          (ngModelChange)="onFilterChange()"
          placeholder="Scan or type…"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label for="status" class="block text-xs font-medium text-slate-500">Status</label>
        <select id="status" [(ngModel)]="status" (ngModelChange)="onFilterChange()" class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">All</option>
          <option value="Held">Held</option>
          <option value="Punched">Punched</option>
          <option value="Voided">Voided</option>
        </select>
      </div>
      <div>
        <label for="orderType" class="block text-xs font-medium text-slate-500">Order type</label>
        <select id="orderType" [(ngModel)]="orderType" (ngModelChange)="onFilterChange()" class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">All</option>
          <option value="DineIn">Dine-In</option>
          <option value="Takeaway">Takeaway</option>
          <option value="Delivery">Delivery</option>
        </select>
      </div>
      <div>
        <label for="dateFrom" class="block text-xs font-medium text-slate-500">From</label>
        <input id="dateFrom" type="date" [(ngModel)]="dateFrom" (ngModelChange)="onFilterChange()" class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
      <div>
        <label for="dateTo" class="block text-xs font-medium text-slate-500">To</label>
        <input id="dateTo" type="date" [(ngModel)]="dateTo" (ngModelChange)="onFilterChange()" class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>
    </div>

    <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Invoice</th>
                <th class="px-4 py-2.5">Type</th>
                <th class="px-4 py-2.5">Table / Customer</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Total</th>
                <th class="px-4 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (sale of result().items; track sale.id) {
                <tr class="cursor-pointer hover:bg-slate-50" (click)="openDetail(sale)">
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ sale.invoiceNumber ?? '—' }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ orderTypeLabel(sale.orderType) }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ sale.tableName ? 'Table ' + sale.tableName : sale.customerName ?? '—' }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusBadgeClass(sale.status)">{{ sale.status }}</span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ sale.total | number: '1.2-2' }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ (sale.punchedAtUtc ?? sale.createdAtUtc) | date: 'medium' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">No sales match these filters.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <app-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="result().totalCount" [pageSize]="pageSizeValue" (pageChange)="goToPage($event)" />
      }
    </div>

    <app-modal [open]="!!selectedSale()" (close)="selectedSale.set(null)">
      @if (selectedSale(); as sale) {
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-base font-semibold text-slate-900">Invoice {{ sale.invoiceNumber ?? '(Held)' }}</h2>
            <p class="mt-1 text-sm text-slate-500">{{ orderTypeLabel(sale.orderType) }} · {{ sale.tableName ? 'Table ' + sale.tableName : sale.customerName ?? 'Walk-in' }}</p>
          </div>
          <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusBadgeClass(sale.status)">{{ sale.status }}</span>
        </div>

        @if (sale.status === 'Voided' && sale.voidReason) {
          <p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Voided: {{ sale.voidReason }}</p>
        }
        @if (sale.originalSaleId) {
          <p class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Reissued to correct a previous invoice.</p>
        }

        <ul class="mt-4 divide-y divide-slate-100 text-sm">
          @for (item of sale.items; track item.id) {
            <li class="py-2">
              <div class="flex justify-between">
                <span class="font-medium text-slate-900">{{ item.quantity }}× {{ item.menuItemName }}</span>
                <span class="text-slate-600">{{ item.lineTotal | number: '1.2-2' }}</span>
              </div>
              @if (item.selectedModifiers.length > 0) {
                <p class="text-xs text-slate-500">{{ modifierSummary(item) }}</p>
              }
            </li>
          }
        </ul>

        <dl class="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div class="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{{ sale.subtotal | number: '1.2-2' }}</dd></div>
          @if (sale.discountAmount > 0) {
            <div class="flex justify-between text-slate-600"><dt>Discount</dt><dd>-{{ sale.discountAmount | number: '1.2-2' }}</dd></div>
          }
          <div class="flex justify-between text-slate-600"><dt>Tax</dt><dd>{{ sale.taxAmount | number: '1.2-2' }}</dd></div>
          <div class="flex justify-between text-base font-semibold text-slate-900"><dt>Total</dt><dd>{{ sale.total | number: '1.2-2' }}</dd></div>
          @if (sale.paymentMethodName) {
            <div class="flex justify-between text-xs text-slate-400"><dt>Paid via</dt><dd>{{ sale.paymentMethodName }}</dd></div>
          }
        </dl>

        <div class="mt-5 flex justify-end gap-3">
          <button type="button" (click)="selectedSale.set(null)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
          @if (sale.status === 'Punched') {
            <button type="button" (click)="showVoidModal.set(true)" class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
              Void & Reissue
            </button>
          }
        </div>
      }
    </app-modal>

    <app-void-reissue-modal [open]="showVoidModal()" [sale]="selectedSale()" (closed)="showVoidModal.set(false)" (reissued)="onReissued()" />
  `,
})
export class PosBillingPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;

  private readonly saleService = inject(SaleService);
  private readonly destroyRef = inject(DestroyRef);

  protected search = '';
  protected status: SaleStatus | '' = '';
  protected orderType: SaleOrderType | '' = '';
  protected dateFrom = '';
  protected dateTo = '';

  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<Sale>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);
  protected readonly selectedSale = signal<Sale | null>(null);
  protected readonly showVoidModal = signal(false);

  private readonly manualRefresh = new Subject<void>();

  ngOnInit(): void {
    merge(this.manualRefresh)
      .pipe(
        switchMap(() => this.saleService.search(this.buildFilter()).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.result.set(result);
          this.totalPages.set(Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)));
        }
        this.loading.set(false);
      });

    this.manualRefresh.next();
  }

  onFilterChange(): void {
    this.page.set(1);
    this.manualRefresh.next();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.manualRefresh.next();
  }

  openDetail(sale: Sale): void {
    this.selectedSale.set(sale);
  }

  onReissued(): void {
    this.showVoidModal.set(false);
    this.selectedSale.set(null);
    this.manualRefresh.next();
  }

  protected modifierSummary(item: SaleItem): string {
    return item.selectedModifiers.map((m) => m.optionName).join(', ');
  }

  protected orderTypeLabel(type: SaleOrderType): string {
    return type === 'DineIn' ? 'Dine-In' : type;
  }

  protected statusBadgeClass(status: SaleStatus): string {
    switch (status) {
      case 'Held':
        return 'bg-amber-100 text-amber-700';
      case 'Punched':
        return 'bg-green-100 text-green-700';
      case 'Voided':
        return 'bg-slate-100 text-slate-500';
    }
  }

  private buildFilter(): SaleSearchFilter {
    return {
      status: this.status,
      orderType: this.orderType,
      dateFromUtc: this.dateFrom ? new Date(this.dateFrom).toISOString() : undefined,
      dateToUtc: this.dateTo ? new Date(this.dateTo + 'T23:59:59').toISOString() : undefined,
      search: this.search.trim(),
      page: this.page(),
      pageSize: PAGE_SIZE,
    };
  }
}
