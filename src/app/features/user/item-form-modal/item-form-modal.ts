import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap } from 'rxjs';
import { MenuService } from '../../../core/menu/menu.service';
import { MenuCategory, MenuItem, ModifierGroupInput } from '../../../core/menu/models';
import { Modal } from '../../../shared/ui/modal/modal';
import { Toggle } from '../../../shared/ui/toggle/toggle';
import { MENU_ICONS } from '../../../shared/utils/menu-icons';

type OptionGroup = FormGroup<{
  name: import('@angular/forms').FormControl<string>;
  priceDelta: import('@angular/forms').FormControl<number>;
  priceIsTotalAmount: import('@angular/forms').FormControl<boolean>;
  totalPriceAmount: import('@angular/forms').FormControl<number | null>;
}>;
type ModifierFormGroup = FormGroup<{
  name: import('@angular/forms').FormControl<string>;
  selectionType: import('@angular/forms').FormControl<'Single' | 'Multiple'>;
  isRequired: import('@angular/forms').FormControl<boolean>;
  options: FormArray<OptionGroup>;
}>;

/** Create when `item()` is null, edit otherwise. Modifier groups are always saved as a full replacement — see SaveMenuItemRequestDto. */
@Component({
  selector: 'app-item-form-modal',
  imports: [ReactiveFormsModule, Modal, Toggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ item() ? 'Edit Item' : 'Add Item' }}</h2>

      <form class="mt-5 max-h-[70vh] space-y-4 overflow-y-auto pr-1" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="item-name" class="block text-sm font-medium text-slate-700">Name</label>
            <input id="item-name" type="text" formControlName="name" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label for="item-category" class="block text-sm font-medium text-slate-700">Category</label>
            <select id="item-category" formControlName="categoryId" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="" disabled>Select a category…</option>
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </div>
          <div>
            <label for="item-price" class="block text-sm font-medium text-slate-700">Price</label>
            <input id="item-price" type="number" step="0.01" min="0" formControlName="price" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div class="flex items-end justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p class="text-sm font-medium text-slate-700">Active (visible on terminal)</p>
            <app-toggle formControlName="isActive" />
          </div>
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

        <div class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-slate-900">Modifier groups</p>
            <button type="button" (click)="addGroup()" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">+ Add group</button>
          </div>
          <p class="mt-1 text-xs text-slate-500">e.g. "Size" (pick one) or "Add-ons" (pick several).</p>

          @for (group of modifierGroups.controls; track group; let groupIndex = $index) {
            <div class="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3" [formGroup]="group">
              <div class="flex flex-wrap items-center gap-2">
                <input type="text" placeholder="Group name (e.g. Size)" formControlName="name" class="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                <select formControlName="selectionType" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="Single">Pick one</option>
                  <option value="Multiple">Pick several</option>
                </select>
                <label class="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" formControlName="isRequired" class="rounded border-slate-300" />
                  Required
                </label>
                <button type="button" (click)="removeGroup(groupIndex)" class="ml-auto text-xs font-medium text-red-600 hover:text-red-500">Remove group</button>
              </div>

              <div formArrayName="options" class="mt-2 space-y-2">
                @for (option of optionsOf(group).controls; track option; let optionIndex = $index) {
                  <div class="rounded-md border border-slate-200 bg-white p-2" [formGroup]="option">
                    <div class="flex items-center gap-2">
                      <input type="text" placeholder="Option (e.g. Large)" formControlName="name" class="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <button type="button" (click)="removeOption(groupIndex, optionIndex)" class="shrink-0 text-xs font-medium text-red-600 hover:text-red-500">Remove</button>
                    </div>

                    <!-- Either an extra amount added to the item's base price, or the
                         variant's full total price (the extra amount is then derived
                         automatically from the item's price) — see docs/modules/pos-menu.md. -->
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <div class="flex overflow-hidden rounded-md border border-slate-300 text-xs">
                        <button
                          type="button"
                          (click)="setOptionPriceMode(option, false)"
                          class="px-2 py-1"
                          [class]="!option.controls.priceIsTotalAmount.value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
                        >
                          + Extra amount
                        </button>
                        <button
                          type="button"
                          (click)="setOptionPriceMode(option, true)"
                          class="border-l border-slate-300 px-2 py-1"
                          [class]="option.controls.priceIsTotalAmount.value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
                        >
                          = Total price
                        </button>
                      </div>

                      @if (option.controls.priceIsTotalAmount.value) {
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Total price"
                          formControlName="totalPriceAmount"
                          class="w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span class="text-xs text-slate-400">({{ effectiveDeltaLabel(option) }} vs. base price)</span>
                      } @else {
                        <input
                          type="number"
                          step="0.01"
                          placeholder="+price"
                          formControlName="priceDelta"
                          class="w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      }
                    </div>
                  </div>
                }
              </div>
              <button type="button" (click)="addOption(groupIndex)" class="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-500">+ Add option</button>
            </div>
          }
        </div>

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
export class ItemFormModal {
  readonly open = input.required<boolean>();
  readonly item = input<MenuItem | null>(null);
  readonly categories = input.required<MenuCategory[]>();
  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly menuService = inject(MenuService);

  protected readonly icons = MENU_ICONS;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  private pickedFile: File | null = null;
  private removingImage = false;

  protected readonly form = this.fb.nonNullable.group({
    categoryId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    price: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
    iconKey: [null as string | null],
    modifierGroups: this.fb.array<ModifierFormGroup>([]),
  });

  protected get modifierGroups(): FormArray<ModifierFormGroup> {
    return this.form.controls.modifierGroups;
  }

  protected optionsOf(group: ModifierFormGroup): FormArray<OptionGroup> {
    return group.controls.options;
  }

  constructor() {
    effect(() => {
      if (this.open()) {
        const existing = this.item();
        this.form.reset({
          categoryId: existing?.categoryId ?? this.categories()[0]?.id ?? '',
          name: existing?.name ?? '',
          price: existing?.price ?? 0,
          isActive: existing?.isActive ?? true,
          iconKey: existing?.iconKey ?? null,
        });
        this.modifierGroups.clear();
        for (const group of existing?.modifierGroups ?? []) {
          const groupForm = this.buildGroup(group.name, group.selectionType, group.isRequired);
          for (const option of group.options) {
            groupForm.controls.options.push(this.buildOption(option.name, option.priceDelta, option.priceIsTotalAmount, option.totalPriceAmount));
          }
          this.modifierGroups.push(groupForm);
        }
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

  addGroup(): void {
    const group = this.buildGroup('', 'Single', false);
    group.controls.options.push(this.buildOption('', 0, false, null));
    this.modifierGroups.push(group);
  }

  removeGroup(index: number): void {
    this.modifierGroups.removeAt(index);
  }

  addOption(groupIndex: number): void {
    this.modifierGroups.at(groupIndex).controls.options.push(this.buildOption('', 0, false, null));
  }

  removeOption(groupIndex: number, optionIndex: number): void {
    this.modifierGroups.at(groupIndex).controls.options.removeAt(optionIndex);
  }

  protected setOptionPriceMode(option: OptionGroup, isTotal: boolean): void {
    option.controls.priceIsTotalAmount.setValue(isTotal);
    if (isTotal && option.controls.totalPriceAmount.value === null) {
      option.controls.totalPriceAmount.setValue(this.form.controls.price.value);
    }
  }

  /** Live preview of the actual extra amount a total-price option works out to, given the item's current base price — e.g. "+2.00" or "-1.50" (a total below the base price is allowed, same as any other discount-like modifier). */
  protected effectiveDeltaLabel(option: OptionGroup): string {
    const total = option.controls.totalPriceAmount.value ?? 0;
    const basePrice = this.form.controls.price.value ?? 0;
    const delta = total - basePrice;
    return `${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)}`;
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
    const { categoryId, name, price, isActive, iconKey } = this.form.getRawValue();
    const modifierGroups: ModifierGroupInput[] = this.modifierGroups.controls
      .map((group, groupIndex) => ({
        name: group.controls.name.value,
        selectionType: group.controls.selectionType.value,
        isRequired: group.controls.isRequired.value,
        sortOrder: groupIndex,
        options: group.controls.options.controls
          .map((option, optionIndex) => ({
            name: option.controls.name.value,
            priceDelta: option.controls.priceDelta.value,
            priceIsTotalAmount: option.controls.priceIsTotalAmount.value,
            totalPriceAmount: option.controls.totalPriceAmount.value,
            sortOrder: optionIndex,
          }))
          .filter((o) => o.name.trim().length > 0),
      }))
      .filter((g) => g.name.trim().length > 0 && g.options.length > 0);

    const request = { categoryId, name, price, isActive, iconKey, modifierGroups };
    const existing = this.item();

    const save$ = existing ? this.menuService.updateItem(existing.id, request) : this.menuService.createItem(request);

    save$
      .pipe(
        switchMap((saved) => {
          if (this.pickedFile) return this.menuService.setItemImage(saved.id, this.pickedFile);
          if (this.removingImage && existing?.imageUrl) return this.menuService.clearItemImage(saved.id);
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
          this.errorMessage.set(error.error?.error ?? 'Could not save this item.');
        },
      });
  }

  private buildGroup(name: string, selectionType: 'Single' | 'Multiple', isRequired: boolean): ModifierFormGroup {
    return this.fb.nonNullable.group({
      name: [name, [Validators.required]],
      selectionType: [selectionType],
      isRequired: [isRequired],
      options: this.fb.array<OptionGroup>([]),
    });
  }

  private buildOption(name: string, priceDelta: number, priceIsTotalAmount: boolean, totalPriceAmount: number | null): OptionGroup {
    return this.fb.nonNullable.group({
      name: [name, [Validators.required]],
      priceDelta: [priceDelta],
      priceIsTotalAmount: [priceIsTotalAmount],
      totalPriceAmount: this.fb.control<number | null>(totalPriceAmount),
    });
  }
}
