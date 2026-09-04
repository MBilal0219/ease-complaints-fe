import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MenuService } from '../../../core/menu/menu.service';
import { MenuCategory } from '../../../core/menu/models';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { categoryColor } from '../../../shared/utils/category-color';
import { emojiForIconKey } from '../../../shared/utils/menu-icons';
import { CategoryFormModal } from '../category-form-modal/category-form-modal';

@Component({
  selector: 'app-pos-categories',
  imports: [CategoryFormModal, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Categories</h1>
        <p class="mt-1 text-sm text-slate-500">Group your menu items for the terminal's category grid.</p>
      </div>
      <button
        type="button"
        (click)="openCreate()"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Add Category
      </button>
    </div>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (categories().length === 0) {
      <div class="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No categories yet — add your first one to start building your menu.
      </div>
    } @else {
      <div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        @for (category of categories(); track category.id) {
          <div class="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div
              class="flex h-24 items-center justify-center text-3xl text-white"
              [style.background]="category.imageUrl ? 'none' : colorFor(category.id)"
            >
              @if (category.imageUrl) {
                <img [src]="category.imageUrl" alt="" class="h-24 w-full object-cover" />
              } @else if (emojiFor(category.iconKey)) {
                {{ emojiFor(category.iconKey) }}
              } @else {
                {{ category.name.charAt(0).toUpperCase() }}
              }
            </div>
            <div class="p-3">
              <p class="truncate text-sm font-medium text-slate-900">{{ category.name }}</p>
              <p class="text-xs text-slate-500">{{ category.itemCount }} item{{ category.itemCount === 1 ? '' : 's' }}</p>
            </div>
            <div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                (click)="openEdit(category)"
                class="rounded-md bg-white/90 p-1.5 text-slate-600 shadow-sm hover:bg-white"
                aria-label="Edit category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897z" />
                </svg>
              </button>
              <button
                type="button"
                (click)="confirmDelete(category)"
                class="rounded-md bg-white/90 p-1.5 text-red-600 shadow-sm hover:bg-white"
                aria-label="Delete category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        }
      </div>
    }

    @if (errorMessage()) {
      <p class="mt-4 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    <app-category-form-modal [open]="showFormModal()" [category]="editingCategory()" (closed)="showFormModal.set(false)" (saved)="onSaved()" />

    <app-confirm-dialog
      [open]="!!deletingCategory()"
      title="Delete category?"
      [message]="'Delete \\'' + (deletingCategory()?.name ?? '') + '\\'? This cannot be undone.'"
      confirmLabel="Delete"
      [destructive]="true"
      [busy]="deleting()"
      (cancel)="deletingCategory.set(null)"
      (confirm)="doDelete()"
    />
  `,
})
export class PosCategoriesPage implements OnInit {
  private readonly menuService = inject(MenuService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly categories = signal<MenuCategory[]>([]);
  protected readonly showFormModal = signal(false);
  protected readonly editingCategory = signal<MenuCategory | null>(null);
  protected readonly deletingCategory = signal<MenuCategory | null>(null);
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  protected colorFor(id: string): string {
    return categoryColor(id);
  }

  protected emojiFor(iconKey: string | null): string | null {
    return emojiForIconKey(iconKey);
  }

  openCreate(): void {
    this.editingCategory.set(null);
    this.showFormModal.set(true);
  }

  openEdit(category: MenuCategory): void {
    this.editingCategory.set(category);
    this.showFormModal.set(true);
  }

  onSaved(): void {
    this.showFormModal.set(false);
    this.refresh();
  }

  confirmDelete(category: MenuCategory): void {
    this.errorMessage.set(null);
    this.deletingCategory.set(category);
  }

  doDelete(): void {
    const category = this.deletingCategory();
    if (!category) return;

    this.deleting.set(true);
    this.menuService.deleteCategory(category.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deletingCategory.set(null);
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.deleting.set(false);
        this.deletingCategory.set(null);
        this.errorMessage.set(error.error?.error ?? 'Could not delete this category.');
      },
    });
  }

  private refresh(): void {
    this.loading.set(true);
    this.menuService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
