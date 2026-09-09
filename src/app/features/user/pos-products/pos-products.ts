import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { MenuService } from '../../../core/menu/menu.service';
import { MenuCategory, MenuItem } from '../../../core/menu/models';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { categoryColor } from '../../../shared/utils/category-color';
import { emojiForIconKey } from '../../../shared/utils/menu-icons';
import { ItemFormModal } from '../item-form-modal/item-form-modal';

@Component({
  selector: 'app-pos-products',
  imports: [DecimalPipe, ItemFormModal, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Products</h1>
        <p class="mt-1 text-sm text-slate-500">The items your terminal sells, grouped by category.</p>
      </div>
      <button
        type="button"
        [disabled]="categories().length === 0"
        (click)="openCreate()"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        + Add Item
      </button>
    </div>

    @if (categories().length === 0 && !loading()) {
      <div class="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Add a category first, then come back here to add items to it.
      </div>
    }

    @if (categories().length > 0) {
      <div class="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          (click)="selectedCategoryId.set(null)"
          class="rounded-full px-3 py-1.5 text-sm font-medium"
          [class]="selectedCategoryId() === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
        >
          All
        </button>
        @for (category of categories(); track category.id) {
          <button
            type="button"
            (click)="selectedCategoryId.set(category.id)"
            class="rounded-full px-3 py-1.5 text-sm font-medium"
            [class]="selectedCategoryId() === category.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          >
            {{ category.name }}
          </button>
        }
      </div>
    }

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else {
      <div class="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Item</th>
                <th class="px-4 py-2.5">Category</th>
                <th class="px-4 py-2.5">Price</th>
                <th class="px-4 py-2.5">Modifiers</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (item of filteredItems(); track item.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2.5">
                      @if (item.imageUrl) {
                        <img [src]="item.imageUrl" alt="" class="h-9 w-9 rounded-md object-contain bg-white ring-1 ring-slate-200" />
                      } @else {
                        <span class="flex h-9 w-9 items-center justify-center rounded-md text-white" [style.background]="colorFor(item.id)">{{ emojiFor(item.iconKey) ?? '🍽️' }}</span>
                      }
                      <span class="font-medium text-slate-900">{{ item.name }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ categoryName(item.categoryId) }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ item.price | number: '1.2-2' }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ item.modifierGroups.length || '—' }}</td>
                  <td class="px-4 py-2.5">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="item.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'">
                      {{ item.isActive ? 'Active' : 'Hidden' }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-right">
                    <button type="button" (click)="openEdit(item)" class="font-medium text-indigo-600 hover:text-indigo-500">Edit</button>
                    <button type="button" (click)="deletingItem.set(item)" class="ml-3 font-medium text-red-600 hover:text-red-500">Delete</button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500">No items yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (errorMessage()) {
      <p class="mt-4 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    <app-item-form-modal
      [open]="showFormModal()"
      [item]="editingItem()"
      [categories]="categories()"
      (closed)="showFormModal.set(false)"
      (saved)="onSaved()"
    />

    <app-confirm-dialog
      [open]="!!deletingItem()"
      title="Delete item?"
      [message]="'Delete \\'' + (deletingItem()?.name ?? '') + '\\'? This cannot be undone.'"
      confirmLabel="Delete"
      [destructive]="true"
      [busy]="deleting()"
      (cancel)="deletingItem.set(null)"
      (confirm)="doDelete()"
    />
  `,
})
export class PosProductsPage implements OnInit {
  private readonly menuService = inject(MenuService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly categories = signal<MenuCategory[]>([]);
  protected readonly items = signal<MenuItem[]>([]);
  protected readonly selectedCategoryId = signal<string | null>(null);
  protected readonly showFormModal = signal(false);
  protected readonly editingItem = signal<MenuItem | null>(null);
  protected readonly deletingItem = signal<MenuItem | null>(null);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly filteredItems = () => {
    const categoryId = this.selectedCategoryId();
    const all = this.items();
    return categoryId ? all.filter((i) => i.categoryId === categoryId) : all;
  };

  ngOnInit(): void {
    this.refresh();
  }

  protected categoryName(categoryId: string): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '—';
  }

  protected colorFor(id: string): string {
    return categoryColor(id);
  }

  protected emojiFor(iconKey: string | null): string | null {
    return emojiForIconKey(iconKey);
  }

  openCreate(): void {
    this.editingItem.set(null);
    this.showFormModal.set(true);
  }

  openEdit(item: MenuItem): void {
    this.editingItem.set(item);
    this.showFormModal.set(true);
  }

  onSaved(): void {
    this.showFormModal.set(false);
    this.refresh();
  }

  doDelete(): void {
    const item = this.deletingItem();
    if (!item) return;

    this.deleting.set(true);
    this.menuService.deleteItem(item.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deletingItem.set(null);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.deleting.set(false);
        this.deletingItem.set(null);
        this.errorMessage.set(error.error?.error ?? 'Could not delete this item.');
      },
    });
  }

  private refresh(): void {
    this.loading.set(true);
    forkJoin({ categories: this.menuService.getCategories(), items: this.menuService.getItems() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ categories, items }) => {
          this.categories.set(categories);
          this.items.set(items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
