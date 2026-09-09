import { DatePipe, DecimalPipe } from '@angular/common';
import { ApplicationRef, ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Sale } from '../../../core/sales/models';
import { ReceiptPaperSize } from '../../../core/settings/models';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * The one receipt view used everywhere a Sale needs to look like an actual
 * receipt — see docs/modules/pos-terminal-ui.md "Twenty-second pass" (the
 * unified Thermal/A5 template) and "Twenty-ninth/Thirtieth passes" (reused
 * outside the just-punched flow it started as). `footerMode` is the only
 * thing that changes what's actually going on:
 *  - 'punch' (default) — shown right after a successful Punch in the Sale
 *    terminal: "New Order" + "Print".
 *  - 'held' — the Held Orders "Overview" popup, for a sale that hasn't been
 *    paid yet: no Print (nothing final to print), a "Continue" link back
 *    into the Sale terminal's own `?saleId=` resume flow instead of a
 *    close button.
 *  - 'view' — Billing's own sale detail popup: "Close" + "Print" (reprint
 *    a past invoice), plus an optional `[receipt-extra-actions]`-projected
 *    slot for a caller-specific action (Billing puts its own "Void &
 *    Reissue" button there) — this component has no idea what that button
 *    does, it just reserves the spot.
 * One template, not per-mode variants — Thermal80mm and A5 must look like
 * the *same* receipt, just at different scale (a #/Item/Qty/Subtotal table
 * for A5 vs. the mockup-based Product/Qty/Total table for Thermal was
 * explicitly rejected once already). Every size-dependent class runs
 * through s(thermalClasses, a5Classes) so the two stay visually
 * proportional instead of drifting into different designs again.
 * The `#pos-print-area` element print() copies into lives inside THIS
 * component (not the host page) specifically so it's portable — Held
 * Orders and Billing are separate routed pages from the Sale terminal and
 * have no other element to provide it.
 *
 * "Host" and a contact-info footer (email/phone) from the original
 * reference mockup were deliberately left out — this app has no per-sale
 * staff attribution (a Restaurant maps to a single owner Party, not
 * multiple tracked staff members) and no Address/Email/Phone fields on
 * PosSettings yet, and showing fabricated values would be worse than
 * omitting them. receiptFooterText already covers a restaurant-authored
 * footer line.
 */
@Component({
  selector: 'app-order-receipt-modal',
  imports: [DecimalPipe, DatePipe, RouterLink, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="emitClosed()" [maxWidthClass]="isA5() ? 'max-w-xl' : 'max-w-xs'">
      <div id="pos-receipt-content" [class]="s('text-xs', 'text-base') + ' text-blue-gray-900'">
        @if (logoUrl()) {
          <img [src]="logoUrl()" alt="" class="mx-auto object-contain" [class]="s('h-20 w-20', 'h-32 w-32')" />
        }
        <h2 [class]="s('mt-2 text-sm', 'mt-3 text-2xl') + ' text-center font-semibold'">{{ restaurantName() }}</h2>

        @if (sale(); as sale) {
          <div [class]="s('mt-4 gap-1.5 pb-3', 'mt-6 gap-2.5 pb-5') + ' flex flex-col border-b border-blue-gray-200'">
            <p class="flex justify-between"><span class="font-bold text-blue-gray-800">Receipt No:</span><span class="font-semibold">#{{ receiptNumber(sale) }}</span></p>
            <p class="flex justify-between"><span class="font-bold text-blue-gray-800">Date:</span><span>{{ sale.punchedAtUtc ?? sale.createdAtUtc | date: 'medium' }}</span></p>
            <p class="flex justify-between"><span class="font-bold text-blue-gray-800">Order Type:</span><span>{{ orderTypeLabel() }}</span></p>
            @if (sale.tableName) {
              <p class="flex justify-between"><span class="font-bold text-blue-gray-800">Table:</span><span>{{ sale.tableName }}</span></p>
            }
            @if (sale.orderType !== 'DineIn' && sale.customerName) {
              <p class="flex justify-between"><span class="font-bold text-blue-gray-800">Customer:</span><span>{{ sale.customerName }}</span></p>
            }
          </div>

          @if (sale.status === 'Voided' && sale.voidReason) {
            <p class="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Voided: {{ sale.voidReason }}</p>
          }
          @if (sale.originalSaleId) {
            <p class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">Reissued to correct a previous invoice.</p>
          }

          <div [class]="s('gap-1.5 pb-3 pt-3', 'gap-2.5 pb-5 pt-5') + ' flex flex-col'">
            <!-- Plain flex divs, not a real <table>/<td> — mixing table-cell
                 elements with a flex row on the parent fights the browser's own
                 table layout and silently defeats text-center on the cells. -->
            <div [class]="s('gap-2 pb-1', 'gap-3 pb-2') + ' flex border-b border-blue-gray-200 font-semibold'">
              <div class="flex-1">Product</div>
              <div [class]="s('w-8', 'w-12') + ' shrink-0 text-center'">Qty</div>
              <div [class]="s('min-w-[56px]', 'min-w-[80px]') + ' shrink-0 text-right'">Total</div>
            </div>
            @for (item of sale.items; track item.id) {
              <div [class]="s('gap-2 py-0.5', 'gap-3 py-1.5') + ' flex'">
                <div class="flex-1">
                  {{ item.menuItemName }}
                  @if (item.selectedModifiers.length > 0) {
                    <br /><span [class]="s('text-[10px]', 'text-xs') + ' text-blue-gray-400'">{{ modifierSummary(item) }}</span>
                  }
                </div>
                <div [class]="s('w-8', 'w-12') + ' shrink-0 text-center'">{{ item.quantity }}</div>
                <div [class]="s('min-w-[56px]', 'min-w-[80px]') + ' shrink-0 text-right'">{{ currencySymbol() }}{{ item.lineTotal | number: '1.2-2' }}</div>
              </div>
            }

            <div [class]="s('my-1', 'my-2') + ' border border-dashed border-blue-gray-300'"></div>

            <div [class]="s('space-y-1', 'space-y-2')">
              <div class="flex justify-between text-blue-gray-600"><span>Subtotal</span><span>{{ currencySymbol() }}{{ sale.subtotal | number: '1.2-2' }}</span></div>
              @if (sale.discountAmount > 0) {
                <div class="flex justify-between text-pink-600"><span>Discount</span><span>-{{ currencySymbol() }}{{ sale.discountAmount | number: '1.2-2' }}</span></div>
              }
              <div class="flex justify-between text-blue-gray-600"><span>Tax</span><span>{{ currencySymbol() }}{{ sale.taxAmount | number: '1.2-2' }}</span></div>
              <div [class]="s('text-sm', 'text-xl') + ' flex justify-between font-bold'"><span>TOTAL</span><span>{{ currencySymbol() }}{{ sale.total | number: '1.2-2' }}</span></div>
              @if (sale.status === 'Held') {
                <div class="flex justify-between font-semibold text-amber-600"><span>Status</span><span>Held</span></div>
              } @else if (sale.paymentMethodName) {
                <div class="flex justify-between text-blue-gray-500"><span>Paid via</span><span>{{ sale.paymentMethodName }}</span></div>
              }
              @if (cashReceived() !== null) {
                <div class="flex justify-between text-blue-gray-500"><span>Cash</span><span>{{ currencySymbol() }}{{ cashReceived() | number: '1.2-2' }}</span></div>
                <div class="flex justify-between font-semibold text-cyan-700"><span>Change</span><span>{{ currencySymbol() }}{{ (cashReceived() ?? 0) - sale.total | number: '1.2-2' }}</span></div>
              }
            </div>
          </div>

          @if (receiptFooterText()) {
            <div [class]="s('pt-3 text-[11px]', 'pt-5 text-sm') + ' border-t border-dashed border-blue-gray-300 text-center text-blue-gray-500'">
              <p>{{ receiptFooterText() }}</p>
            </div>
          }
        }
      </div>

      <div class="pos-hide-print mt-5 flex gap-3">
        @switch (footerMode()) {
          @case ('held') {
            <a
              [routerLink]="['/app/user/pos/sale']"
              [queryParams]="{ saleId: sale()?.id }"
              class="flex-1 rounded-md bg-cyan-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-cyan-600"
            >
              Continue
            </a>
          }
          @case ('view') {
            <button type="button" (click)="emitClosed()" class="flex-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-blue-gray-700 shadow hover:shadow-md">
              Close
            </button>
            <button type="button" (click)="print()" class="flex-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">
              Print
            </button>
            <ng-content select="[receipt-extra-actions]" />
          }
          @default {
            <button type="button" (click)="emitClosed()" class="flex-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-blue-gray-700 shadow hover:shadow-md">
              New Order
            </button>
            <button type="button" (click)="print()" class="flex-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">
              Print
            </button>
          }
        }
      </div>
    </app-modal>

    <!-- Lives here, not on the host page, so this component is fully
         portable — see the class doc comment above. -->
    <div id="pos-print-area" class="pos-print-area"></div>
  `,
})
export class OrderReceiptModal {
  private readonly appRef = inject(ApplicationRef);

  readonly open = input.required<boolean>();
  readonly sale = input<Sale | null>(null);
  readonly restaurantName = input<string>('');
  readonly receiptFooterText = input<string | null>(null);
  readonly currencySymbol = input<string>('$');
  readonly cashReceived = input<number | null>(null);
  /** Which @page rule (see styles.css) the printed receipt uses, and which size tier s() picks — from PosSettings, set in the restaurant's own Settings screen. */
  readonly paperSize = input<ReceiptPaperSize>('Thermal80mm');
  /** From PosSettings.LogoUrl — omitted entirely (no broken-image placeholder) when the restaurant hasn't uploaded one. */
  readonly logoUrl = input<string | null>(null);
  /** Which footer buttons show — see the class doc comment for what each mode means. */
  readonly footerMode = input<'punch' | 'held' | 'view'>('punch');
  readonly closed = output<void>();

  /** See Modal.emitClose's doc comment — same deferred, guarded appRef.tick() safety net after emitting. */
  protected emitClosed(): void {
    this.closed.emit();
    queueMicrotask(() => {
      try {
        this.appRef.tick();
      } catch {
        // A tick may already be in flight (Angular's own zoneless scheduler
        // already picked up the signal writes above) — this is a safety net,
        // not the primary mechanism, so a redundant/racing tick is fine to
        // swallow.
      }
    });
  }

  protected isA5(): boolean {
    return this.paperSize() === 'A5';
  }

  /** The one place Thermal vs. A5 ever branches — every other line of the template is identical between the two, by construction, so they can't drift into different designs again. */
  protected s(thermalClasses: string, a5Classes: string): string {
    return this.isA5() ? a5Classes : thermalClasses;
  }

  /** Sale.ReceiptNumber is the persisted, authoritative identity now (server-assigned atomically with InvoiceNumber — see SaleService.PunchAsync/ReceiptNumberHelper); this only reformats client-side as a fallback for a sale punched before that column existed. */
  protected receiptNumber(sale: Sale): string {
    if (sale.receiptNumber) return sale.receiptNumber;
    const padded = String(sale.invoiceNumber ?? 0).padStart(6, '0');
    const branch = sale.branch?.trim();
    const prefix = branch ? branch.slice(0, 3).toUpperCase() : 'INV';
    return `${prefix}-${padded}`;
  }

  protected orderTypeLabel(): string {
    const type = this.sale()?.orderType;
    return type === 'DineIn' ? 'Dine-In' : type ?? '';
  }

  protected modifierSummary(item: { selectedModifiers: { optionName: string }[] }): string {
    return item.selectedModifiers.map((m) => m.optionName).join(', ');
  }

  print(): void {
    const content = document.getElementById('pos-receipt-content');
    const printArea = document.getElementById('pos-print-area');
    if (!content || !printArea) return;

    // data-paper-size drives which named @page rule applies — see styles.css.
    printArea.dataset['paperSize'] = this.paperSize();
    printArea.innerHTML = content.innerHTML;

    // This app has no zone.js at all (Angular 22, zoneless by default — see
    // package.json/angular.json) — a prior fix here wrapped window.print()
    // in NgZone.runOutsideAngular(), which was a no-op the whole time and
    // never actually the problem or the fix. window.print() blocks the main
    // thread and briefly steals window/tab focus while the native print
    // dialog is open; calling it synchronously from inside a click handler
    // means that focus-stealing block can happen while Angular's zoneless
    // change-detection scheduler still has a render pending from *this same
    // click* (e.g. this button's own click, or state set just before Print
    // was reached) — deferring window.print() into its own macrotask via
    // setTimeout lets that pending render flush first, so print() never runs
    // mid-tick. This is the documented safe pattern for window.print() (or
    // any other focus-stealing/blocking browser API) in a zoneless app.
    setTimeout(() => {
      window.print();
      printArea.innerHTML = '';
    }, 0);
  }
}
