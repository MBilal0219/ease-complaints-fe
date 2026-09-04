import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Sale } from '../../../core/sales/models';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * Shown right after a successful Punch — see docs/modules/pos-terminal-ui.md.
 * Deliberately simple: an on-screen, browser-printable receipt (same
 * copy-into-a-hidden-print-area + window.print() technique as the
 * tailwind-pos reference this was modeled on), not the formatted
 * thermal/A5/A4 templates that's pos-kot-and-printing.md's job.
 */
@Component({
  selector: 'app-order-receipt-modal',
  imports: [DecimalPipe, DatePipe, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="closed.emit()">
      <div id="pos-receipt-content" class="text-sm text-blue-gray-900">
        <div class="text-center">
          <h2 class="text-lg font-bold">{{ restaurantName() }}</h2>
          <p class="text-xs text-blue-gray-500">Order Receipt</p>
        </div>

        @if (sale(); as sale) {
          <div class="mt-4 flex justify-between text-xs text-blue-gray-500">
            <span>No: {{ sale.invoiceNumber ?? '—' }}</span>
            <span>{{ sale.punchedAtUtc ?? sale.createdAtUtc | date: 'medium' }}</span>
          </div>
          <div class="mt-1 text-xs text-blue-gray-500">
            {{ orderTypeLabel() }}
            @if (sale.tableName) {
              · Table {{ sale.tableName }}
            }
            @if (sale.customerName) {
              · {{ sale.customerName }}
            }
          </div>

          <hr class="my-3 border-blue-gray-200" />

          <table class="w-full text-xs">
            <thead>
              <tr class="text-blue-gray-500">
                <th class="w-1/12 py-1 text-center">#</th>
                <th class="py-1 text-left">Item</th>
                <th class="w-2/12 py-1 text-center">Qty</th>
                <th class="w-3/12 py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              @for (item of sale.items; track item.id; let index = $index) {
                <tr>
                  <td class="py-1.5 text-center align-top">{{ index + 1 }}</td>
                  <td class="py-1.5 text-left align-top">
                    {{ item.menuItemName }}
                    <br /><span class="text-[11px] text-blue-gray-400">{{ currencySymbol() }}{{ item.unitPriceAtSale | number: '1.2-2' }}</span>
                    @if (item.selectedModifiers.length > 0) {
                      <br /><span class="text-[11px] text-blue-gray-400">{{ modifierSummary(item) }}</span>
                    }
                  </td>
                  <td class="py-1.5 text-center align-top">{{ item.quantity }}</td>
                  <td class="py-1.5 text-right align-top">{{ currencySymbol() }}{{ item.lineTotal | number: '1.2-2' }}</td>
                </tr>
              }
            </tbody>
          </table>

          <hr class="my-3 border-blue-gray-200" />

          <div class="space-y-1">
            <div class="flex justify-between text-blue-gray-600"><span>Subtotal</span><span>{{ currencySymbol() }}{{ sale.subtotal | number: '1.2-2' }}</span></div>
            @if (sale.discountAmount > 0) {
              <div class="flex justify-between text-pink-600"><span>Discount</span><span>-{{ currencySymbol() }}{{ sale.discountAmount | number: '1.2-2' }}</span></div>
            }
            <div class="flex justify-between text-blue-gray-600"><span>Tax</span><span>{{ currencySymbol() }}{{ sale.taxAmount | number: '1.2-2' }}</span></div>
            <div class="flex justify-between text-base font-bold"><span>TOTAL</span><span>{{ currencySymbol() }}{{ sale.total | number: '1.2-2' }}</span></div>
            <div class="flex justify-between text-blue-gray-500"><span>Paid via</span><span>{{ sale.paymentMethodName }}</span></div>
            @if (cashReceived() !== null) {
              <div class="flex justify-between text-blue-gray-500"><span>Cash received</span><span>{{ currencySymbol() }}{{ cashReceived() | number: '1.2-2' }}</span></div>
              <div class="flex justify-between font-semibold text-cyan-700"><span>Change</span><span>{{ currencySymbol() }}{{ (cashReceived() ?? 0) - sale.total | number: '1.2-2' }}</span></div>
            }
          </div>

          @if (receiptFooterText()) {
            <p class="mt-4 text-center text-xs text-blue-gray-500">{{ receiptFooterText() }}</p>
          }
        }
      </div>

      <div class="pos-hide-print mt-5 flex gap-3">
        <button type="button" (click)="closed.emit()" class="flex-1 rounded-md border border-blue-gray-300 px-4 py-2 text-sm font-medium text-blue-gray-700 hover:bg-blue-gray-50">
          New Order
        </button>
        <button type="button" (click)="print()" class="flex-1 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">
          Print
        </button>
      </div>
    </app-modal>
  `,
})
export class OrderReceiptModal {
  readonly open = input.required<boolean>();
  readonly sale = input<Sale | null>(null);
  readonly restaurantName = input<string>('');
  readonly receiptFooterText = input<string | null>(null);
  readonly currencySymbol = input<string>('$');
  readonly cashReceived = input<number | null>(null);
  readonly closed = output<void>();

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

    printArea.innerHTML = content.innerHTML;
    window.print();
    printArea.innerHTML = '';
  }
}
