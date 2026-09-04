import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MenuItem } from '../../../core/menu/models';
import { SaleItem } from '../../../core/sales/models';
import { emojiForIconKey } from '../../../shared/utils/menu-icons';

/**
 * The live cart list in the Current Order panel — see docs/modules/pos-terminal-ui.md.
 * Explicit qty +/- buttons and a delete icon (matching the reference UI the
 * user provided), not the swipe-to-delete/double-tap-to-edit gestures
 * originally spec'd — superseded per that reference; a Held order is cheap
 * to fix by re-adding a line, so no confirmation step on delete either.
 */
@Component({
  selector: 'app-receipt-panel',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col">
      <!-- Simple 3-section cart row: image+name+price on the left, qty stepper
           centered, delete icon on the right — no repeated line total (the unit
           price under the name already covers it; showing it again under the
           stepper was redundant). The qty input is type="text"/inputmode="numeric"
           rather than type="number" specifically so no browser spin-button
           overlaps the centered digit. -->
      <div class="flex-1 overflow-y-auto">
        @for (item of items(); track item.id) {
          <div class="mb-3 flex w-full select-none items-center gap-2 rounded-lg bg-blue-gray-50 px-2 py-2 text-blue-gray-700">
            @if (visualFor(item).imageUrl) {
              <img [src]="visualFor(item).imageUrl" alt="" class="h-10 w-10 shrink-0 rounded-lg bg-white object-contain shadow" />
            } @else {
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-gray-200 text-lg shadow">{{ visualFor(item).emoji }}</span>
            }

            <div class="min-w-0 flex-grow">
              <h5 class="truncate text-sm">{{ item.menuItemName }}</h5>
              <p class="text-xs">{{ currencySymbol() }}{{ item.unitPriceAtSale | number: '1.2-2' }}</p>
              @if (item.selectedModifiers.length > 0) {
                <p class="truncate text-xs text-blue-gray-400">• {{ modifierSummary(item) }}</p>
              }
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                (click)="quantityChange.emit({ itemId: item.id, quantity: item.quantity - 1 })"
                class="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-gray-600 text-sm text-white hover:bg-blue-gray-700"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                [value]="item.quantity"
                (change)="onQuantityInput(item.id, $event)"
                class="h-7 w-10 rounded-lg bg-white text-center text-sm shadow focus:shadow-lg focus:outline-none"
                aria-label="Quantity"
              />
              <button
                type="button"
                (click)="quantityChange.emit({ itemId: item.id, quantity: item.quantity + 1 })"
                class="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-gray-600 text-sm text-white hover:bg-blue-gray-700"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button type="button" (click)="deleteConfirmed.emit(item.id)" class="ml-1.5 shrink-0 rounded-md p-1 text-red-500 hover:bg-red-50" aria-label="Remove line">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        } @empty {
          <p class="py-8 text-center text-sm text-blue-gray-400">No items yet — tap a product to add it.</p>
        }
      </div>

      <dl class="mt-3 space-y-1 border-t border-blue-gray-100 pt-3 text-sm">
        <div class="flex justify-between text-blue-gray-600"><dt>Subtotal</dt><dd>{{ currencySymbol() }}{{ subtotal() | number: '1.2-2' }}</dd></div>
        @if (discountAmount() > 0) {
          <div class="flex justify-between text-pink-600"><dt>Discount</dt><dd>-{{ currencySymbol() }}{{ discountAmount() | number: '1.2-2' }}</dd></div>
        }
        <div class="flex justify-between text-blue-gray-600"><dt>Tax {{ taxRateLabel() }}</dt><dd>{{ currencySymbol() }}{{ taxAmount() | number: '1.2-2' }}</dd></div>
        <div class="flex justify-between text-lg font-bold text-blue-gray-900"><dt>Grand Total</dt><dd>{{ currencySymbol() }}{{ total() | number: '1.2-2' }}</dd></div>
      </dl>
    </div>
  `,
})
export class ReceiptPanel {
  readonly items = input.required<SaleItem[]>();
  /** SaleItemDto doesn't carry its own image/icon (only a name/price snapshot) — looked up here from the live menu by MenuItemId purely for display. */
  readonly menuItems = input<MenuItem[]>([]);
  readonly subtotal = input<number>(0);
  readonly discountAmount = input<number>(0);
  readonly taxAmount = input<number>(0);
  readonly taxRatePercent = input<number>(0);
  readonly total = input<number>(0);
  readonly currencySymbol = input<string>('$');

  readonly quantityChange = output<{ itemId: string; quantity: number }>();
  readonly deleteConfirmed = output<string>();

  /** The stepper's middle cell is a real editable input (matching tailwind-pos's own `x-model.number="item.qty"`), not just a static count between the +/- buttons — typing a value commits on blur/Enter via the native `change` event. Non-numeric or sub-1 input is clamped to 1 rather than rejected outright. */
  protected onQuantityInput(itemId: string, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const quantity = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
    this.quantityChange.emit({ itemId, quantity });
  }

  protected modifierSummary(item: SaleItem): string {
    return item.selectedModifiers.map((m) => m.optionName).join(', ');
  }

  protected visualFor(item: SaleItem): { imageUrl: string | null; emoji: string } {
    const menuItem = this.menuItems().find((m) => m.id === item.menuItemId);
    return { imageUrl: menuItem?.imageUrl ?? null, emoji: emojiForIconKey(menuItem?.iconKey ?? null) ?? '🍽️' };
  }

  protected taxRateLabel(): string {
    return this.taxRatePercent() > 0 ? `(${this.taxRatePercent()}%)` : '';
  }
}
