import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, concatMap, debounceTime, forkJoin, interval } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { MenuService } from '../../../core/menu/menu.service';
import { MenuCategory, MenuItem } from '../../../core/menu/models';
import { PaymentMethod } from '../../../core/settings/models';
import { SettingsService } from '../../../core/settings/settings.service';
import { Sale, SaleOrderType, SaveSaleItemRequest, SaveSaleRequest } from '../../../core/sales/models';
import { SaleService } from '../../../core/sales/sale.service';
import { RestaurantTable } from '../../../core/tables/models';
import { TableService } from '../../../core/tables/table.service';
import { Modal } from '../../../shared/ui/modal/modal';
import { categoryColor } from '../../../shared/utils/category-color';
import { emojiForIconKey } from '../../../shared/utils/menu-icons';
import { ModifierPickerModal, ModifierPickerResult } from './modifier-picker-modal';
import { OrderReceiptModal } from './order-receipt-modal';
import { PosNavDrawer } from './pos-nav-drawer';
import { ReceiptPanel } from './receipt-panel';

type SortMode = 'name' | 'price-asc' | 'price-desc';

const QUICK_CASH_AMOUNTS = [5, 10, 20, 50];
const CLOCK_TICK_MS = 30_000;

@Component({
  selector: 'app-pos-terminal',
  imports: [FormsModule, DecimalPipe, DatePipe, NgTemplateOutlet, RouterLink, Modal, PosNavDrawer, ModifierPickerModal, ReceiptPanel, OrderReceiptModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="flex h-dvh items-center justify-center bg-blue-gray-900 text-white">Loading…</div>
    } @else {
      <div class="pos-hide-print flex h-dvh flex-col bg-blue-gray-50 text-blue-gray-800">
        <!-- Top bar -->
        <header class="flex h-14 shrink-0 items-center gap-3 bg-cyan-900 px-4 text-white shadow-sm">
          <button type="button" (click)="navDrawerOpen.set(true)" aria-label="Open menu" class="rounded-md p-1.5 hover:bg-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span class="font-semibold">POS Terminal</span>

          <div class="ml-auto flex items-center gap-4 text-sm text-blue-gray-300">
            <span class="hidden sm:inline">{{ now() | date: 'shortTime' }} · {{ now() | date: 'mediumDate' }}</span>
            <div class="relative">
              <button type="button" (click)="userMenuOpen.set(!userMenuOpen())" class="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                {{ currentUserName() }}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </button>
              @if (userMenuOpen()) {
                <div class="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-md bg-white py-1 text-blue-gray-700 shadow-lg">
                  <a routerLink="/app/user/profile" (click)="userMenuOpen.set(false)" class="block px-3 py-2 text-sm hover:bg-blue-gray-50">Profile</a>
                  <button type="button" (click)="logout()" class="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Log out</button>
                </div>
              }
            </div>
          </div>
        </header>

        <div class="flex flex-1 overflow-hidden bg-blue-gray-50">
          <!-- Left sidebar: order type + categories. Outer wrapper mirrors tailwind-pos's
               "pl-4 pr-2 py-4" inset padding around the colored rail — a floating rounded-3xl
               pill with visible page background bleeding around it, not a flush rectangle. -->
          <div class="flex shrink-0 flex-col py-4 pl-4 pr-2">
            <aside class="flex w-64 flex-1 flex-col gap-1.5 overflow-y-auto rounded-3xl bg-cyan-500 p-3">
            <button
              type="button"
              (click)="chooseOrderType('DineIn')"
              [title]="orderTypeBlockReason('DineIn')"
              class="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold"
              [class]="orderTypeButtonClass('DineIn')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 6.75v10.5A2.25 2.25 0 0 0 6 19.5h12a2.25 2.25 0 0 0 2.25-2.25V6.75M3.75 6.75 5.25 3h13.5l1.5 3.75M8.25 19.5V6.75m7.5 12.75V6.75" /></svg>
              Dine In
            </button>
            <button
              type="button"
              (click)="chooseOrderType('Takeaway')"
              [title]="orderTypeBlockReason('Takeaway')"
              class="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold"
              [class]="orderTypeButtonClass('Takeaway')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>
              Take Away
            </button>
            <button
              type="button"
              (click)="chooseOrderType('Delivery')"
              [title]="orderTypeBlockReason('Delivery')"
              class="flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold"
              [class]="orderTypeButtonClass('Delivery')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5 shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm7.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-13.5-6h16.5m-16.5 0-1.5-6h19.5m-19.5 6h1.5m18-6-1.5 6h-16.5" /></svg>
              Delivery
            </button>

            <hr class="my-2 border-white/10" />

            <!-- Categories are a plain menu-style list now (just an icon + name), not
                 individually color-filled tiles — only the selected one is highlighted,
                 matching the order-type buttons' own active/inactive treatment above.
                 min-w-0 on the button + name span is what actually lets truncate work
                 here — a flex item's default min-width is "auto" (sized to its content),
                 which silently defeats text-overflow:ellipsis until it's overridden. -->
            <button
              type="button"
              (click)="selectedCategoryId.set(null)"
              class="flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-4 text-left text-base font-semibold"
              [class]="!selectedCategoryId() ? 'bg-cyan-300 text-white shadow-lg' : 'text-cyan-100 hover:bg-cyan-400'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-6 w-6 shrink-0"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>
              <span class="truncate">All Items</span>
            </button>
            @for (category of categories(); track category.id) {
              <button
                type="button"
                (click)="selectedCategoryId.set(category.id)"
                class="flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-4 text-left text-base font-semibold"
                [class]="selectedCategoryId() === category.id ? 'bg-cyan-300 text-white shadow-lg' : 'text-cyan-100 hover:bg-cyan-400'"
              >
                <span class="shrink-0 text-lg">{{ emojiFor(category.iconKey) ?? '📦' }}</span>
                <span class="min-w-0 flex-1 truncate">{{ category.name }}</span>
              </button>
            } @empty {
              <p class="px-2 py-3 text-xs text-blue-gray-400">No categories yet — add some under POS ▸ Categories.</p>
            }
            </aside>
          </div>

          <!-- Center: search + product grid — spacing mirrors tailwind-pos's own
               "py-4" outer / "px-2" inner rows (its search bar and grid sit in a
               plain bg-blue-gray-50 column, not a bordered/padded card). -->
          <div class="flex flex-1 flex-col overflow-hidden py-4">
            <div class="flex flex-row items-center gap-2 px-2">
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-cyan-500 text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </span>
                <input
                  type="search"
                  [(ngModel)]="searchTerm"
                  placeholder="Search menu items..."
                  class="h-16 w-full rounded-3xl bg-white py-4 pl-16 pr-4 text-lg text-blue-gray-800 shadow transition-shadow focus:shadow-2xl focus:outline-none"
                />
              </div>
              <button type="button" (click)="cycleSortMode()" [title]="sortModeLabel()" class="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-blue-gray-600 shadow hover:shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                </svg>
              </button>
            </div>

            <!-- Grid + card markup below is a deliberate, literal mirror of tailwind-pos/index.html's
                 product grid (grid-cols-4 gap-4; the <img> carries NO sizing classes at all — it
                 relies on Tailwind's own preflight max-width:100%/height:auto so each photo keeps its
                 natural aspect ratio at full card width, exactly like the reference — not the fixed
                 h-28 object-cover crop this used to have). -->
            <div class="mt-4 flex-1 overflow-hidden px-2">
              <div class="h-full overflow-y-auto">
                <div class="grid grid-cols-4 gap-4 pb-3">
                  @for (item of visibleItems(); track item.id) {
                    <div role="button" tabindex="0" (click)="onProductTap(item)" (keydown.enter)="onProductTap(item)" class="select-none cursor-pointer overflow-hidden rounded-2xl bg-white shadow transition-shadow hover:shadow-lg">
                      @if (item.imageUrl) {
                        <img [src]="item.imageUrl" [alt]="item.name" />
                      } @else {
                        <span class="flex aspect-[4/3] w-full items-center justify-center text-4xl text-white" [style.background]="colorFor(item.id)">{{ emojiFor(item.iconKey) ?? '🍽️' }}</span>
                      }
                      <div class="-mt-3 flex px-3 pb-3 text-sm">
                        <p class="mr-1 flex-grow truncate">{{ item.name }}</p>
                        <p class="whitespace-nowrap font-semibold">{{ currencySymbol() }}{{ item.price | number: '1.2-2' }}</p>
                      </div>
                    </div>
                  } @empty {
                    <p class="col-span-full py-8 text-center text-blue-gray-400">
                      @if (searchTerm()) {
                        No items match "{{ searchTerm() }}".
                      } @else {
                        No items in this category yet.
                      }
                    </p>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Current Order. Outer wrapper mirrors tailwind-pos's "pr-4 pl-2 py-4"
               inset padding; the inner bg-white rounded-3xl shadow card is the reference's
               own cart panel treatment, not a flush bordered rectangle. -->
          <div class="flex w-[28rem] shrink-0 flex-col py-4 pl-2 pr-4">
          <div class="flex flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow">
            <div class="flex items-center justify-between px-4 py-3">
              <h2 class="text-base font-semibold text-blue-gray-900">Current Order</h2>
              <div class="flex items-center gap-1">
                <button type="button" (click)="openCustomerModal()" [disabled]="!sale()" class="rounded-md p-1.5 text-blue-gray-500 hover:bg-blue-gray-100 disabled:opacity-40" title="Customer info">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25v3m1.5-1.5h-3" />
                  </svg>
                </button>
                <div class="relative">
                  <button type="button" (click)="orderMenuOpen.set(!orderMenuOpen())" [disabled]="!sale()" class="rounded-md p-1.5 text-blue-gray-500 hover:bg-blue-gray-100 disabled:opacity-40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                    </svg>
                  </button>
                  @if (orderMenuOpen()) {
                    <div class="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md bg-white py-1 shadow-lg">
                      @if (sale()?.orderType === 'DineIn') {
                        <button type="button" (click)="orderMenuOpen.set(false); toggleTableSwitcher()" class="block w-full px-3 py-2 text-left text-sm hover:bg-blue-gray-50">Change Table</button>
                      }
                      <button type="button" (click)="orderMenuOpen.set(false); clearItems()" class="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Clear Items</button>
                      <button type="button" (click)="orderMenuOpen.set(false); cancelOrder()" class="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Cancel Order</button>
                    </div>
                  }
                </div>
              </div>
            </div>

            <ng-template #pickATableGrid>
              @for (group of groupedTables(); track group.sectionId ?? '_none') {
                @if (group.sectionName) {
                  <p class="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-blue-gray-400 first:mt-0">{{ group.sectionName }}</p>
                }
                <div class="grid grid-cols-3 gap-2">
                  @for (table of group.tables; track table.id) {
                    <button
                      type="button"
                      [disabled]="table.status === 'Occupied'"
                      (click)="chooseTable(table.id)"
                      class="rounded-lg bg-blue-gray-100 px-4 py-4 text-center text-sm font-semibold text-blue-gray-700 hover:bg-blue-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {{ table.name }}
                    </button>
                  }
                </div>
              } @empty {
                <p class="text-sm text-blue-gray-400">No tables set up yet — add some under POS ▸ Tables.</p>
              }
              @if (errorMessage()) {
                <p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage() }}</p>
              }
            </ng-template>

            @if (!sale()) {
              @if (pendingOrderType() === 'DineIn') {
                <!-- Rendered inline, not a modal — picking a table is just the next thing on this same screen. -->
                <div class="flex flex-1 flex-col overflow-y-auto p-4">
                  <h3 class="mb-3 text-sm font-semibold text-blue-gray-700">Pick a Table</h3>
                  <ng-container [ngTemplateOutlet]="pickATableGrid" />
                </div>
              } @else {
                <div class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-blue-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-14 w-14">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.98-4.804 2.53-7.454.107-.51-.281-.996-.803-.996H5.25M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                  </svg>
                  <p class="font-medium">Starting your order…</p>
                </div>
              }
            } @else if (tableSwitcherOpen() && sale()!.orderType !== 'DineIn') {
              <!-- Mid-switch from an existing empty Take Away/Delivery sale over to
                   Dine-In: show ONLY the table picker (same as the fresh-start case
                   above), not the cart/payment UI underneath it too — the switch
                   isn't real until a table's actually picked. -->
              <div class="flex flex-1 flex-col overflow-y-auto p-4">
                <h3 class="mb-3 text-sm font-semibold text-blue-gray-700">Pick a Table</h3>
                <ng-container [ngTemplateOutlet]="pickATableGrid" />
              </div>
            } @else {
              <div class="flex items-center justify-between bg-blue-gray-50 px-4 py-2 text-sm">
                <span class="flex items-center gap-1.5 text-blue-gray-600">
                  @if (sale()!.orderType === 'DineIn') {
                    Table {{ sale()!.tableName }}
                  } @else if (sale()!.customerName) {
                    {{ sale()!.customerName }}
                  } @else {
                    {{ orderTypeLabel(sale()!.orderType) }}
                  }
                </span>
                @if (sale()!.invoiceNumber) {
                  <span class="font-semibold text-cyan-700">#{{ sale()!.invoiceNumber }}</span>
                }
              </div>

              @if (tableSwitcherOpen()) {
                <!-- Inline table switcher — replaces the old table-picker modal; everything happens on this one screen. -->
                <div class="bg-blue-gray-50 px-4 py-3">
                  @for (group of groupedTables(); track group.sectionId ?? '_none') {
                    @if (group.sectionName) {
                      <p class="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-blue-gray-400 first:mt-0">{{ group.sectionName }}</p>
                    }
                    <div class="grid grid-cols-4 gap-2">
                      @for (table of group.tables; track table.id) {
                        <button
                          type="button"
                          [disabled]="table.status === 'Occupied' && table.id !== sale()?.tableId"
                          (click)="chooseTable(table.id)"
                          class="rounded-lg px-2 py-2 text-center text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                          [class]="table.id === sale()?.tableId ? 'bg-cyan-500 text-white' : 'bg-blue-gray-100 text-blue-gray-700 hover:bg-blue-gray-200'"
                        >
                          {{ table.name }}
                        </button>
                      }
                    </div>
                  } @empty {
                    <p class="text-xs text-blue-gray-400">No tables set up yet — add some under POS ▸ Tables.</p>
                  }
                </div>
              }

              <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <app-receipt-panel
                  [items]="sale()!.items"
                  [menuItems]="menuItems()"
                  [subtotal]="sale()!.subtotal"
                  [discountAmount]="sale()!.discountAmount"
                  [taxAmount]="previewTaxAmount()"
                  [taxRatePercent]="selectedPaymentMethod()?.taxRatePercent ?? 0"
                  [total]="previewTotal()"
                  [currencySymbol]="currencySymbol()"
                  (quantityChange)="onQuantityChange($event)"
                  (deleteConfirmed)="onDeleteConfirmed($event)"
                />
              </div>

              <div class="px-4 py-2">
                <div class="flex items-center gap-2 text-xs">
                  <label for="discount" class="font-medium text-blue-gray-500">Discount</label>
                  <input
                    id="discount"
                    type="number"
                    min="0"
                    step="0.01"
                    [ngModel]="discountAmount()"
                    (ngModelChange)="setDiscountAmount($event)"
                    class="w-24 rounded-md shadow px-2 py-1 text-right focus:shadow-md focus:outline-none"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 px-4 pb-2 pt-1">
                <button type="button" (click)="hold()" class="flex items-center justify-center gap-1.5 rounded-md bg-white shadow py-2.5 text-sm font-medium text-blue-gray-700 hover:shadow-md">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  Hold
                </button>
                <button type="button" disabled title="Kitchen tickets aren't built yet — see pos-kot-and-printing.md" class="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-md bg-amber-400 py-2.5 text-sm font-medium text-white opacity-50">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.75A1.5 1.5 0 0 0 15.75 2.25h-7.5a1.5 1.5 0 0 0-1.5 1.5v3.99" /></svg>
                  Send Kitchen
                </button>
              </div>

              @if (isCashSelected()) {
                <div class="mx-4 mb-2 rounded-md bg-blue-gray-50 p-2.5">
                  <div class="flex items-center justify-between gap-2 text-xs font-medium text-blue-gray-600">
                    <span>Cash received</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      [ngModel]="cashReceived() ?? 0"
                      (ngModelChange)="setCashReceived($event)"
                      class="w-24 rounded-md shadow px-2 py-1 text-right focus:shadow-md focus:outline-none"
                    />
                  </div>
                  <div class="mt-1.5 grid grid-cols-4 gap-1.5">
                    @for (amount of quickCashAmounts; track amount) {
                      <button type="button" (click)="addQuickCash(amount)" class="rounded-md bg-white py-1 text-xs shadow hover:bg-blue-gray-100">+{{ amount }}</button>
                    }
                  </div>
                  <div class="mt-1.5 flex justify-between rounded-md px-2 py-1.5 text-xs font-semibold" [class]="changeDue() >= 0 ? 'bg-cyan-50 text-cyan-800' : 'bg-pink-100 text-pink-600'">
                    <span>Change</span><span>{{ currencySymbol() }}{{ changeDue() | number: '1.2-2' }}</span>
                  </div>
                </div>
              }

              <div class="grid gap-2 px-4 pb-2" [style.grid-template-columns]="paymentGridColumns()">
                @for (method of activePaymentMethods(); track method.id) {
                  <button
                    type="button"
                    (click)="selectPaymentMethod(method.id)"
                    class="rounded-md py-2 text-xs font-semibold text-white"
                    [style.background]="paymentMethodColor(method)"
                    [class.ring-2]="selectedPaymentMethodId() === method.id"
                    [class.ring-offset-1]="selectedPaymentMethodId() === method.id"
                  >
                    {{ method.name }}
                  </button>
                }
                <button type="button" disabled title="Splitting a bill across multiple payment methods isn't built yet" class="cursor-not-allowed rounded-md bg-purple-500 py-2 text-xs font-semibold text-white opacity-50">
                  Split
                </button>
              </div>

              @if (errorMessage()) {
                <p class="mx-4 mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{{ errorMessage() }}</p>
              }

              <div class="px-4 pb-4">
                <button
                  type="button"
                  (click)="completeAndPrint()"
                  [disabled]="punching() || !canPunch()"
                  class="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 py-3 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.75A1.5 1.5 0 0 0 15.75 2.25h-7.5a1.5 1.5 0 0 0-1.5 1.5v3.99" /></svg>
                  {{ punching() ? 'Completing…' : 'Complete & Print' }}
                </button>
              </div>
            }
          </div>
          </div>
        </div>
      </div>
    }

    <!-- Customer info -->
    <app-modal [open]="customerModalOpen()" (close)="customerModalOpen.set(false)">
      <h2 class="mb-4 text-base font-semibold text-blue-gray-900">Customer Info</h2>
      <div class="space-y-3">
        <div>
          <label for="cust-name" class="block text-sm font-medium text-blue-gray-700">Name</label>
          <input id="cust-name" type="text" [(ngModel)]="customerName" class="mt-1 w-full rounded-md px-3 py-2 text-sm shadow focus:shadow-md focus:outline-none" />
        </div>
        <div>
          <label for="cust-phone" class="block text-sm font-medium text-blue-gray-700">Phone</label>
          <input id="cust-phone" type="tel" [(ngModel)]="customerPhone" class="mt-1 w-full rounded-md px-3 py-2 text-sm shadow focus:shadow-md focus:outline-none" />
        </div>
        @if (sale()?.orderType === 'Delivery') {
          <div>
            <label for="cust-address" class="block text-sm font-medium text-blue-gray-700">Delivery address</label>
            <input id="cust-address" type="text" [(ngModel)]="deliveryAddress" class="mt-1 w-full rounded-md px-3 py-2 text-sm shadow focus:shadow-md focus:outline-none" />
          </div>
        }
      </div>
      <div class="mt-5 flex justify-end gap-3">
        <button type="button" (click)="customerModalOpen.set(false)" class="rounded-md bg-white px-4 py-2 text-sm font-medium text-blue-gray-700 shadow hover:shadow-md">Cancel</button>
        <button type="button" (click)="saveCustomerInfo()" class="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600">Save</button>
      </div>
    </app-modal>

    <app-pos-nav-drawer [open]="navDrawerOpen()" (closed)="navDrawerOpen.set(false)" />

    <app-modifier-picker-modal
      [open]="!!modifierPickerItem()"
      [item]="modifierPickerItem()"
      (closed)="modifierPickerItem.set(null)"
      (confirmed)="onModifierConfirmed($event)"
    />

    <app-order-receipt-modal
      [open]="showReceiptModal()"
      [sale]="punchedSale()"
      [restaurantName]="currentUserName()"
      [receiptFooterText]="receiptFooterText()"
      [currencySymbol]="currencySymbol()"
      [cashReceived]="wasCashSelectedAtPunch() ? cashReceived() : null"
      (closed)="onReceiptClosed()"
    />

    <div id="pos-print-area" class="pos-print-area"></div>
  `,
})
export class PosTerminalPage implements OnInit {
  protected readonly quickCashAmounts = QUICK_CASH_AMOUNTS;

  private readonly menuService = inject(MenuService);
  private readonly tableService = inject(TableService);
  private readonly settingsService = inject(SettingsService);
  private readonly saleService = inject(SaleService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly navDrawerOpen = signal(false);
  protected readonly userMenuOpen = signal(false);
  protected readonly orderMenuOpen = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly punching = signal(false);
  protected readonly now = signal(new Date());

  protected readonly categories = signal<MenuCategory[]>([]);
  protected readonly menuItems = signal<MenuItem[]>([]);
  protected readonly tables = signal<RestaurantTable[]>([]);
  /** Tables grouped by section for the table pickers, preserving the order they arrive in (the backend already orders by section then table sort order) — a restaurant with sections shows a small heading per section (Dining, Rooftop, ...); one with no sections at all (every table's sectionId null) collapses to a single unheaded group so the picker is just a flat grid. */
  protected readonly groupedTables = computed(() => {
    const groups: { sectionId: string | null; sectionName: string | null; tables: RestaurantTable[] }[] = [];
    for (const table of this.tables()) {
      let group = groups.find((g) => g.sectionId === table.sectionId);
      if (!group) {
        group = { sectionId: table.sectionId, sectionName: table.sectionName, tables: [] };
        groups.push(group);
      }
      group.tables.push(table);
    }
    // Un-sectioned tables always lead (a flat block with no heading), then
    // sections follow in the order they first appeared — Array.sort is
    // stable, so this only ever moves the unsectioned group to the front
    // without disturbing the sections' own relative order.
    return groups.sort((a, b) => (a.sectionId === null ? -1 : b.sectionId === null ? 1 : 0));
  });
  protected readonly paymentMethods = signal<PaymentMethod[]>([]);
  protected readonly activePaymentMethods = computed(() => this.paymentMethods().filter((m) => m.isActive));
  protected readonly currencySymbol = signal('$');
  protected readonly receiptFooterText = signal<string | null>(null);

  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly sortMode = signal<SortMode>('name');
  protected readonly visibleItems = computed(() => {
    const categoryId = this.selectedCategoryId();
    const term = this.searchTerm().trim().toLowerCase();
    let items = this.menuItems().filter((i) => i.isActive && (!categoryId || i.categoryId === categoryId));
    if (term) items = items.filter((i) => i.name.toLowerCase().includes(term));

    const sort = this.sortMode();
    return [...items].sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  });

  protected readonly sale = signal<Sale | null>(null);
  /** pendingOrderType takes priority so a mid-switch order type (e.g. tapping Dine In while an empty Takeaway sale exists, before a table's actually picked) highlights immediately — it's null again as soon as there's no switch in flight, at which point sale()'s own orderType takes back over. */
  protected readonly orderType = computed<SaleOrderType | null>(() => this.pendingOrderType() ?? this.sale()?.orderType ?? null);
  /** Dine-In is the default-highlighted order type on load/reset — purely visual until actually tapped (or a product is tapped while it's still just a pending default, which prompts the same as tapping it). Protected, not private: the template reads it directly to decide whether the right panel shows the inline "Pick a Table" grid. */
  protected readonly pendingOrderType = signal<SaleOrderType | null>('DineIn');

  protected readonly modifierPickerItem = signal<MenuItem | null>(null);
  /** Inline Dine-In table switcher shown within the right panel — replaces what used to be a separate table-picker modal; see docs/modules/pos-terminal-ui.md "Fifth pass". */
  protected readonly tableSwitcherOpen = signal(false);
  protected readonly customerModalOpen = signal(false);
  protected readonly selectedPaymentMethodId = signal<string | null>(null);
  protected readonly selectedPaymentMethod = computed(() => this.activePaymentMethods().find((m) => m.id === this.selectedPaymentMethodId()) ?? null);
  protected readonly isCashSelected = computed(() => (this.selectedPaymentMethod()?.name ?? '').toLowerCase().includes('cash'));
  protected readonly cashReceived = signal<number | null>(null);

  protected readonly discountAmount = signal(0);
  protected customerName = '';
  protected customerPhone = '';
  protected deliveryAddress = '';

  protected readonly showReceiptModal = signal(false);
  protected readonly punchedSale = signal<Sale | null>(null);
  protected readonly wasCashSelectedAtPunch = signal(false);

  /** Client-side preview only — the authoritative TaxAmount/Total are computed server-side at PunchAsync from whichever method is actually selected then; see docs/modules/pos-sales-and-billing.md. */
  protected readonly previewTaxAmount = computed(() => {
    const sale = this.sale();
    const method = this.selectedPaymentMethod();
    if (!sale || !method) return 0;
    const taxable = Math.max(0, sale.subtotal - sale.discountAmount);
    return Math.round(taxable * method.taxRatePercent) / 100;
  });
  protected readonly previewTotal = computed(() => {
    const sale = this.sale();
    if (!sale) return 0;
    const taxable = Math.max(0, sale.subtotal - sale.discountAmount);
    return taxable + this.previewTaxAmount();
  });
  protected readonly changeDue = computed(() => (this.cashReceived() ?? 0) - this.previewTotal());

  protected readonly canPunch = computed(() => {
    const sale = this.sale();
    if (!sale || sale.items.length === 0 || !this.selectedPaymentMethodId()) return false;
    if (this.isCashSelected() && (this.cashReceived() ?? 0) < this.previewTotal()) return false;
    return true;
  });

  private readonly fieldChange$ = new Subject<void>();
  private readonly mutations$ = new Subject<(current: Sale) => SaveSaleRequest>();

  ngOnInit(): void {
    interval(CLOCK_TICK_MS).subscribe(() => this.now.set(new Date()));

    this.fieldChange$.pipe(debounceTime(500)).subscribe(() => this.enqueueFieldsOnlyChange());

    this.mutations$
      .pipe(
        concatMap((buildRequest) => {
          const current = this.sale();
          if (!current) return EMPTY;

          this.errorMessage.set(null);

          return this.saleService.updateHeld(current.id, buildRequest(current)).pipe(
            catchError((error: HttpErrorResponse) => {
              this.errorMessage.set(error.error?.error ?? 'Could not save this change — please try again.');
              return EMPTY;
            }),
          );
        }),
      )
      .subscribe((updated) => {
        this.sale.set(updated);
        // Clears any mid-switch order type set by chooseOrderType (e.g.
        // switching an existing empty sale's type directly, or completing
        // a Dine-In switch via chooseTable) now that `updated` itself
        // carries the real, current order type — orderType() falls back
        // to reading it straight from `updated` again.
        this.pendingOrderType.set(null);
      });

    forkJoin({
      categories: this.menuService.getCategories(),
      items: this.menuService.getItems(),
      tables: this.tableService.getTables(),
      paymentMethods: this.settingsService.getPaymentMethods(),
      settings: this.settingsService.getSettings(),
    }).subscribe(({ categories, items, tables, paymentMethods, settings }) => {
      this.categories.set(categories);
      this.menuItems.set(items);
      this.tables.set(tables);
      this.paymentMethods.set(paymentMethods);
      this.currencySymbol.set(settings.currencySymbol);
      this.receiptFooterText.set(settings.receiptFooterText);
      this.loading.set(false);

      const resumeSaleId = this.route.snapshot.queryParamMap.get('saleId');
      if (resumeSaleId) this.resumeSale(resumeSaleId);
    });
  }

  private resumeSale(saleId: string): void {
    this.saleService.getById(saleId).subscribe({
      next: (sale) => {
        this.sale.set(sale);
        this.customerName = sale.customerName ?? '';
        this.customerPhone = sale.customerPhone ?? '';
        this.deliveryAddress = sale.deliveryAddress ?? '';
        this.discountAmount.set(sale.discountAmount);
      },
      error: () => this.errorMessage.set('Could not load that order — starting a new one.'),
    });
  }

  logout(): void {
    this.userMenuOpen.set(false);
    this.authService.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }

  protected currentUserName(): string {
    return this.authService.currentUser()?.displayName ?? '';
  }

  /** Non-null only when tapping this order-type button right now would be blocked — an empty cart can always switch freely (nothing to lose), but a cart with items would silently orphan those lines if the order type changed under them. Bound to the button's [title] so hovering a greyed-out button explains why, rather than just disabling it with no reason (see user feedback on this exact point). */
  protected orderTypeBlockReason(type: SaleOrderType): string | null {
    const sale = this.sale();
    if (!sale || sale.orderType === type || sale.items.length === 0) return null;
    return 'Empty this cart first, or put this order on Hold to start a new invoice.';
  }

  protected orderTypeButtonClass(type: SaleOrderType): string {
    if (this.orderType() === type) return 'bg-cyan-300 text-white shadow-lg';
    if (this.orderTypeBlockReason(type)) return 'cursor-not-allowed bg-cyan-800 text-cyan-100 opacity-40';
    return 'bg-cyan-800 text-cyan-100 hover:bg-cyan-700';
  }

  chooseOrderType(type: SaleOrderType): void {
    const sale = this.sale();

    if (sale && sale.orderType === type) {
      // Already this type — if a switch to something else was in progress
      // (pendingOrderType set, table switcher open), clicking back to the
      // current type cancels it instead of being a silent no-op.
      this.pendingOrderType.set(null);
      this.tableSwitcherOpen.set(false);
      return;
    }
    if (this.orderTypeBlockReason(type)) return; // cart has items — blocked, see the button's title tooltip

    this.errorMessage.set(null);
    this.pendingOrderType.set(type);

    if (type === 'DineIn') {
      this.refreshTables();
      if (sale) {
        // Existing empty non-DineIn sale — this is the fix for "can't
        // switch back to Dine In": the right panel's "!sale()" branch
        // (which renders the fresh-start "Pick a Table" grid) never shows
        // once a sale already exists, so this reuses the same inline
        // table-switcher that "Change Table" opens on an in-progress
        // Dine-In order instead — chooseTable() always submits 'DineIn'
        // as the orderTypeOverride, completing the switch either way.
        this.tableSwitcherOpen.set(true);
      }
      // else: no sale yet — the right panel's own "!sale()" branch renders
      // the inline "Pick a Table" grid because pendingOrderType() is DineIn.
      return;
    }

    this.tableSwitcherOpen.set(false);

    if (sale) {
      // The guard above already confirmed this sale is empty — safe to
      // switch its order type in place via the same PUT every other edit
      // uses, instead of abandoning it and creating a second Held sale
      // server-side.
      this.mutations$.next((current) => this.buildRequest(current, this.mapSaleItemsToRequests(current), null, type));
      return;
    }

    this.createSale(type, null);
  }

  /** Toggles the inline table-switcher for an already-started Dine-In order (see the "..." ▸ Change Table menu item) — refetches on open so occupied/free status is current. */
  toggleTableSwitcher(): void {
    const next = !this.tableSwitcherOpen();
    this.tableSwitcherOpen.set(next);
    if (next) this.refreshTables();
  }

  private refreshTables(): void {
    this.tableService.getTables().subscribe((tables) => this.tables.set(tables));
  }

  chooseTable(tableId: string): void {
    if (this.sale()) {
      this.tableSwitcherOpen.set(false);
      // orderTypeOverride is always 'DineIn' here — this fires for a normal
      // mid-order table change (already DineIn, so it's a no-op override)
      // and for switching an existing empty non-DineIn sale over to DineIn
      // by picking its table (see chooseOrderType).
      this.mutations$.next((current) => this.buildRequest(current, this.mapSaleItemsToRequests(current), tableId, 'DineIn'));
      return;
    }
    this.createSale('DineIn', tableId);
  }

  private createSale(orderType: SaleOrderType, tableId: string | null): void {
    const request: SaveSaleRequest = { orderType, tableId, customerName: null, customerPhone: null, deliveryAddress: null, discountAmount: 0, items: [] };

    this.saleService.createHeld(request).subscribe({
      next: (sale) => {
        this.sale.set(sale);
        this.pendingOrderType.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.error?.error ?? 'Could not start this order.');
        this.pendingOrderType.set(orderType);
      },
    });
  }

  onProductTap(item: MenuItem): void {
    if (!this.sale()) {
      // Dine-In is the default-highlighted mode even before anything's
      // actually started — tapping a product while it's just a pending
      // default proceeds the same as tapping the sidebar button itself
      // (opens the table picker for Dine-In, starts immediately otherwise).
      this.chooseOrderType(this.pendingOrderType() ?? 'DineIn');
      return;
    }
    if (item.modifierGroups.length > 0) {
      this.modifierPickerItem.set(item);
      return;
    }
    this.enqueueAddOrIncrement(item.id, []);
  }

  onModifierConfirmed(result: ModifierPickerResult): void {
    const item = this.modifierPickerItem();
    this.modifierPickerItem.set(null);
    if (!item) return;
    this.enqueueAddOrIncrement(item.id, result.selectedOptionIds);
  }

  private enqueueAddOrIncrement(menuItemId: string, selectedOptionIds: string[]): void {
    this.mutations$.next((current) => {
      const items = this.mapSaleItemsToRequests(current);

      if (selectedOptionIds.length === 0) {
        const existingIndex = items.findIndex((i) => i.menuItemId === menuItemId && i.selectedOptionIds.length === 0);
        if (existingIndex >= 0) {
          items[existingIndex] = { ...items[existingIndex], quantity: items[existingIndex].quantity + 1 };
          return this.buildRequest(current, items);
        }
      }

      items.push({ menuItemId, quantity: 1, selectedOptionIds, lineDiscountAmount: 0 });
      return this.buildRequest(current, items);
    });
  }

  onQuantityChange(change: { itemId: string; quantity: number }): void {
    if (change.quantity < 1) {
      this.onDeleteConfirmed(change.itemId);
      return;
    }
    this.mutations$.next((current) => {
      const items = this.mapSaleItemsToRequests(current);
      const index = current.items.findIndex((i) => i.id === change.itemId);
      if (index >= 0) items[index] = { ...items[index], quantity: change.quantity };
      return this.buildRequest(current, items);
    });
  }

  onDeleteConfirmed(itemId: string): void {
    this.mutations$.next((current) => {
      const items = current.items.filter((i) => i.id !== itemId).map((i) => this.toRequestItem(i));
      return this.buildRequest(current, items);
    });
  }

  clearItems(): void {
    this.mutations$.next((current) => this.buildRequest(current, []));
  }

  /** "Cancel Order" — abandons the whole Held sale (unlike Clear Items, which keeps the sale/table and just empties the cart). Frees its Dine-In table server-side (see SaleService.CancelHeldSaleAsync) before resetting the Terminal back to its initial state, same as after Hold/Complete. No confirmation step, consistent with this Terminal's other destructive actions (Clear Items, per-line delete) — a Held order is cheap to recreate. */
  cancelOrder(): void {
    const sale = this.sale();
    if (!sale) return;
    this.errorMessage.set(null);
    this.saleService.cancelHeld(sale.id).subscribe({
      next: () => this.resetToFreshOrder(),
      error: (error: HttpErrorResponse) => this.errorMessage.set(error.error?.error ?? 'Could not cancel this order.'),
    });
  }

  setDiscountAmount(value: number): void {
    this.discountAmount.set(value || 0);
    this.fieldChange$.next();
  }

  openCustomerModal(): void {
    this.customerModalOpen.set(true);
  }

  saveCustomerInfo(): void {
    this.customerModalOpen.set(false);
    this.enqueueFieldsOnlyChange();
  }

  private enqueueFieldsOnlyChange(): void {
    this.mutations$.next((current) => this.buildRequest(current, this.mapSaleItemsToRequests(current)));
  }

  private mapSaleItemsToRequests(current: Sale): SaveSaleItemRequest[] {
    return current.items.map((i) => this.toRequestItem(i));
  }

  private toRequestItem(item: Sale['items'][number]): SaveSaleItemRequest {
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      selectedOptionIds: item.selectedModifiers.map((m) => m.optionId),
      lineDiscountAmount: item.lineDiscountAmount,
    };
  }

  /** tableIdOverride: undefined keeps the sale's current table, null clears it (switching away from Dine-In), a string sets it. orderTypeOverride: undefined keeps the sale's current order type. */
  private buildRequest(
    current: Sale,
    items: SaveSaleItemRequest[],
    tableIdOverride?: string | null,
    orderTypeOverride?: SaleOrderType,
  ): SaveSaleRequest {
    return {
      orderType: orderTypeOverride ?? current.orderType,
      tableId: tableIdOverride === undefined ? current.tableId : tableIdOverride,
      customerName: this.customerName.trim() || null,
      customerPhone: this.customerPhone.trim() || null,
      deliveryAddress: this.deliveryAddress.trim() || null,
      discountAmount: this.discountAmount(),
      items,
    };
  }

  selectPaymentMethod(id: string): void {
    this.selectedPaymentMethodId.set(id);
  }

  protected paymentMethodColor(method: PaymentMethod): string {
    const name = method.name.toLowerCase();
    if (name.includes('cash')) return '#16a34a';
    if (name.includes('card')) return '#2563eb';
    return categoryColor(method.id);
  }

  protected paymentGridColumns(): string {
    return `repeat(${this.activePaymentMethods().length + 1}, minmax(0, 1fr))`;
  }

  setCashReceived(value: number): void {
    this.cashReceived.set(value || 0);
  }

  addQuickCash(amount: number): void {
    this.cashReceived.set((this.cashReceived() ?? 0) + amount);
  }

  hold(): void {
    this.resetToFreshOrder();
  }

  completeAndPrint(): void {
    const sale = this.sale();
    const methodId = this.selectedPaymentMethodId();
    if (!sale || !methodId || this.punching() || !this.canPunch()) return;

    this.punching.set(true);
    this.errorMessage.set(null);
    this.wasCashSelectedAtPunch.set(this.isCashSelected());

    this.saleService.punch(sale.id, methodId).subscribe({
      next: (punched) => {
        this.punching.set(false);
        this.punchedSale.set(punched);
        this.showReceiptModal.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.punching.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not complete this order.');
      },
    });
  }

  onReceiptClosed(): void {
    this.showReceiptModal.set(false);
    this.punchedSale.set(null);
    this.resetToFreshOrder();
  }

  private resetToFreshOrder(): void {
    this.sale.set(null);
    this.pendingOrderType.set('DineIn');
    this.selectedCategoryId.set(null);
    this.searchTerm.set('');
    this.selectedPaymentMethodId.set(null);
    this.cashReceived.set(null);
    this.wasCashSelectedAtPunch.set(false);
    this.discountAmount.set(0);
    this.customerName = '';
    this.customerPhone = '';
    this.deliveryAddress = '';
    this.errorMessage.set(null);
    this.orderMenuOpen.set(false);
    this.tableSwitcherOpen.set(false);
    this.refreshTables();
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected colorFor(id: string): string {
    return categoryColor(id);
  }

  protected emojiFor(iconKey: string | null): string | null {
    return emojiForIconKey(iconKey);
  }

  protected orderTypeLabel(type: SaleOrderType): string {
    return type === 'DineIn' ? 'Dine-In' : type;
  }

  protected sortModeLabel(): string {
    switch (this.sortMode()) {
      case 'price-asc':
        return 'Sorted by price (low to high) — tap to change';
      case 'price-desc':
        return 'Sorted by price (high to low) — tap to change';
      default:
        return 'Sorted by name — tap to change';
    }
  }

  cycleSortMode(): void {
    const next: Record<SortMode, SortMode> = { name: 'price-asc', 'price-asc': 'price-desc', 'price-desc': 'name' };
    this.sortMode.set(next[this.sortMode()]);
  }
}
