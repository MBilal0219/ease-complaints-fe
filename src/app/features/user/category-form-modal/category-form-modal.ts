import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap } from 'rxjs';
import { MenuService } from '../../../core/menu/menu.service';
import { MenuCategory } from '../../../core/menu/models';
import { Modal } from '../../../shared/ui/modal/modal';
import { MENU_ICONS } from '../../../shared/utils/menu-icons';

/** Create when `category()` is null, edit otherwise — same modal for both, matching PartyFormModal's pattern. */
@Component({
  selector: 'app-category-form-modal',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ category() ? 'Edit Category' : 'Add Category' }}</h2>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="cat-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="cat-name" type="text" formControlName="name" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div>
          <label for="cat-sort" class="block text-sm font-medium text-slate-700">Display order</label>
          <input id="cat-sort" type="number" formControlName="sortOrder" class="mt-1 w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <p class="mt-1 text-xs text-slate-500">Lower numbers show first on the terminal's category grid.</p>
        </div>

        <div>
          <p class="block text-sm font-medium text-slate-700">Photo</p>
          <div class="mt-1 flex items-center gap-3">
            @if (previewUrl()) {
              <img [src]="previewUrl()" alt="" class="h-14 w-14 rounded-lg object-cover" />
              <button type="button" (click)="removeImage()" class="text-sm font-medium text-red-600 hover:text-red-500">Remove photo</button>
            } @else {
              <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)" />
              <button type="button" (click)="fileInput.click()" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Upload photo
              </button>
              <span class="text-xs text-slate-400">Optional — falls back to an icon, then a color.</span>
            }
          </div>
        </div>

        @if (!previewUrl()) {
          <div>
            <p class="block text-sm font-medium text-slate-700">Icon</p>
            <div class="mt-2 grid grid-cols-6 gap-2">
              @for (icon of icons; track icon.key) {
                <button
                  type="button"
                  (click)="selectIcon(icon.key)"
                  class="flex h-10 w-10 items-center justify-center rounded-lg border text-xl"
                  [class]="form.controls.iconKey.value === icon.key ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'"
                  [attr.aria-label]="icon.label"
                  [title]="icon.label"
                >
                  {{ icon.emoji }}
                </button>
              }
              <button
                type="button"
                (click)="selectIcon(null)"
                class="flex h-10 w-10 items-center justify-center rounded-lg border text-xs text-slate-500"
                [class]="!form.controls.iconKey.value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'"
                title="No icon — use a color instead"
              >
                None
              </button>
            </div>
          </div>
        }

        @if (errorMessage()) {
          <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
        }

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" (click)="dismiss()" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {{ submitting() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class CategoryFormModal {
  readonly open = input.required<boolean>();
  readonly category = input<MenuCategory | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly icons = MENU_ICONS;

  private readonly fb = inject(FormBuilder);
  private readonly menuService = inject(MenuService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  private pickedFile: File | null = null;
  private removingImage = false;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sortOrder: [0],
    iconKey: [null as string | null],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const existing = this.category();
        this.form.reset({ name: existing?.name ?? '', sortOrder: existing?.sortOrder ?? 0, iconKey: existing?.iconKey ?? null });
        this.previewUrl.set(existing?.imageUrl ?? null);
        this.pickedFile = null;
        this.removingImage = false;
        this.errorMessage.set(null);
      }
    });
  }

  selectIcon(key: string | null): void {
    this.form.controls.iconKey.setValue(key);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.pickedFile = file;
    this.removingImage = false;
    this.previewUrl.set(URL.createObjectURL(file));
  }

  removeImage(): void {
    this.pickedFile = null;
    this.removingImage = true;
    this.previewUrl.set(null);
  }

  dismiss(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { name, sortOrder, iconKey } = this.form.getRawValue();
    const request = { name, sortOrder, iconKey };
    const existing = this.category();

    const save$ = existing ? this.menuService.updateCategory(existing.id, request) : this.menuService.createCategory(request);

    save$
      .pipe(
        switchMap((saved) => {
          if (this.pickedFile) return this.menuService.setCategoryImage(saved.id, this.pickedFile);
          if (this.removingImage && existing?.imageUrl) return this.menuService.clearCategoryImage(saved.id);
          return [saved];
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.saved.emit();
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.errorMessage.set(error.error?.error ?? 'Could not save this category.');
        },
      });
  }
}
