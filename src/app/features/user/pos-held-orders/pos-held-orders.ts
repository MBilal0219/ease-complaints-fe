import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { PagedResult, Sale, SaleOrderType } from '../../../core/sales/models';
import { SaleService } from '../../../core/sales/sale.service';
import { PosSettings, ReceiptPaperSize } from '../../../core/settings/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { OrderReceiptModal } from '../pos-terminal/order-receipt-modal';
import { Pagination } from '../../../shared/ui/pagination/pagination';

const PAGE_SIZE = 12;

/**
 * Every Held sale across the restaurant, so a server can pick one back up
 * instead of starting over — see docs/modules/pos-terminal-ui.md. Nothing
 * new to persist here: every cart mutation in the Sale terminal is already
 * saved as a Held sale as it happens (pos-terminal.ts's `mutations$` queue
 * calls SaleService.createHeld/updateHeld on every change), so this page is
 * just `SaleService.search({ status: 'Held' })` and a "Continue" link.
 * "Continue" hands off to the Sale terminal via its existing `?saleId=`
 * resume mechanism (pos-terminal.ts's `resumeSale`) — the exact same code
 * path as reopening any held order from within the Terminal itself, just
 * entered from here instead. A held order's own screen (pos-terminal.ts's
 * "Current Order" panel header) links back here the same way, so either
 * screen can hand off to the other.
 *
 * Every Held sale is numbered (InvoiceNumber/ReceiptNumber) the moment
 * it's created, not just once punched — see ISaleRepository.AddAsync —
 * specifically so it has a real tracking id to search by and show here
 * while still Held, not just a status change. A Held sale created before
 * that existed will still show "—" until it's cancelled/recreated; nothing
 * backfills those.
 */
@Component({
  selector: 'app-pos-held-orders',
  imports: [FormsModule, DatePipe, DecimalPipe, RouterLink, OrderReceiptModal, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Held Orders</h1>
        <p class="mt-1 text-sm text-slate-500">Pick one up to continue exactly where it was left — same cart, same table or customer.</p>
      </div>
      <a routerLink="/app/user/pos/sale" class="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">+ New Sale</a>
    </div>

    <div class="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div class="min-w-[200px] flex-1">
        <label for="search" class="block text-xs font-medium text-slate-500">Order #, table, or customer name</label>
        <input
          id="search"
          type="search"
          [(ngModel)]="search"
          (ngModelChange)="onFilterChange()"
          placeholder="Search…"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label for="orderType" class="block text-xs font-medium text-slate-500">Order type</label>
        <select
          id="orderType"
          [(ngModel)]="orderType"
          (ngModelChange)="onFilterChange()"
          class="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All</option>
          <option value="DineIn">Dine-In</option>
          <option value="Takeaway">Takeaway</option>
          <option value="Delivery">Delivery</option>
        </select>
      </div>
    </div>

    @if (errorMessage()) {
      <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage() }}</p>
    }

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (result().items.length === 0) {
      <div class="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
        <p class="text-sm">No held orders right now.</p>
      </div>
    } @else {
      <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (sale of result().items; track sale.id) {
          <div class="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <span class="inline-block rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">{{ orderTypeLabel(sale.orderType) }}</span>
                  <span class="font-mono text-xs text-slate-400">{{ trackingLabel(sale) }}</span>
                </div>
                <p class="mt-1.5 text-sm font-semibold text-slate-900">{{ sale.tableName ? 'Table ' + sale.tableName : sale.customerName ?? 'Walking' }}</p>
              </div>
              <p class="shrink-0 text-xs text-slate-400">{{ sale.createdAtUtc | date: 'short' }}</p>
            </div>

            <p class="mt-2 line-clamp-2 text-xs text-slate-500">{{ itemsSummary(sale) }}</p>

            <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span class="text-base font-bold text-slate-900">{{ sale.total | number: '1.2-2' }}</span>
              <span class="text-xs text-slate-400">{{ sale.items.length }} item{{ sale.items.length === 1 ? '' : 's' }}</span>
            </div>

            <div class="mt-3 flex gap-2">
              <button type="button" (click)="overviewSale.set(sale)" class="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Overview
              </button>
              <button
                type="button"
                (click)="cancel(sale)"
                [disabled]="cancellingId() === sale.id"
                class="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <a [routerLink]="['/app/user/pos/sale']" [queryParams]="{ saleId: sale.id }" class="flex-1 rounded-md bg-cyan-500 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-cyan-600">
                Continue
              </a>
            </div>
          </div>
        }
      </div>

      <div class="mt-4 rounded-lg border border-slate-200 bg-white">
        <app-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="result().totalCount" [pageSize]="pageSizeValue" (pageChange)="goToPage($event)" />
      </div>
    }

    <!-- Same receipt view the Sale terminal shows right after a Punch — see
         OrderReceiptModal's own doc comment. footerMode="held": no Print
         (nothing's final yet), just a "Continue" link back into the Sale
         terminal's resume flow. -->
    <app-order-receipt-modal
      [open]="!!overviewSale()"
      [sale]="overviewSale()"
      [restaurantName]="restaurantName()"
      [receiptFooterText]="receiptFooterText()"
      [currencySymbol]="currencySymbol()"
      [paperSize]="receiptPaperSize()"
      [logoUrl]="logoUrl()"
      footerMode="held"
      (closed)="overviewSale.set(null)"
    />
  `,
})
export class PosHeldOrdersPage implements OnInit {
  protected readonly pageSizeValue = PAGE_SIZE;

  private readonly saleService = inject(SaleService);
  private readonly settingsService = inject(SettingsService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected search = '';
  protected orderType: SaleOrderType | '' = '';

  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly result = signal<PagedResult<Sale>>({ items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE });
  protected readonly totalPages = signal(1);
  protected readonly cancellingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly overviewSale = signal<Sale | null>(null);

  // For the Overview popup (<app-order-receipt-modal>) — same branding
  // inputs the Sale terminal itself fetches; this page needs its own copy
  // since it's a separate route, not a child of the Terminal.
  protected readonly receiptFooterText = signal<string | null>(null);
  protected readonly currencySymbol = signal('$');
  protected readonly receiptPaperSize = signal<ReceiptPaperSize>('Thermal80mm');
  protected readonly logoUrl = signal<string | null>(null);

  private readonly refresh$ = new Subject<void>();

  ngOnInit(): void {
    this.settingsService
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: PosSettings) => {
        this.receiptFooterText.set(settings.receiptFooterText);
        this.currencySymbol.set(settings.currencySymbol);
        this.receiptPaperSize.set(settings.receiptPaperSize);
        this.logoUrl.set(settings.logoUrl);
      });

    this.refresh$
      .pipe(
        switchMap(() =>
          this.saleService
            .search({ status: 'Held', orderType: this.orderType, search: this.search.trim(), page: this.page(), pageSize: PAGE_SIZE })
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

    this.refresh$.next();
  }

  protected restaurantName(): string {
    return this.authService.currentUser()?.displayName ?? '';
  }

  onFilterChange(): void {
    this.page.set(1);
    this.refresh$.next();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.refresh$.next();
  }

  cancel(sale: Sale): void {
    this.errorMessage.set(null);
    this.cancellingId.set(sale.id);
    this.saleService.cancelHeld(sale.id).subscribe({
      next: () => {
        this.cancellingId.set(null);
        this.refresh$.next();
      },
      error: (error: HttpErrorResponse) => {
        this.cancellingId.set(null);
        this.errorMessage.set(error.error?.error ?? 'Could not cancel this order.');
      },
    });
  }

  protected orderTypeLabel(type: SaleOrderType): string {
    return type === 'DineIn' ? 'Dine-In' : type;
  }

  protected itemsSummary(sale: Sale): string {
    return sale.items.map((i) => `${i.quantity}× ${i.menuItemName}`).join(', ') || 'No items yet';
  }

  /** ReceiptNumber/InvoiceNumber are assigned atomically the moment a sale is first created (Held) — see ISaleRepository.AddAsync — so this is real, not a placeholder; "—" only for a Held sale that predates that change. */
  protected trackingLabel(sale: Sale): string {
    if (sale.receiptNumber) return sale.receiptNumber;
    if (sale.invoiceNumber) return `#${sale.invoiceNumber}`;
    return '—';
  }
}
