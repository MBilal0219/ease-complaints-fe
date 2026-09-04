import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { MenuItem } from '../../../core/menu/models';
import { Modal } from '../../../shared/ui/modal/modal';

export interface ModifierPickerResult {
  selectedOptionIds: string[];
}

/** Choose Size/Add-ons etc. before an item with modifier groups lands on the receipt — see docs/modules/pos-terminal-ui.md. */
@Component({
  selector: 'app-modifier-picker-modal',
  imports: [DecimalPipe, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      @if (item(); as item) {
        <h2 class="text-base font-semibold text-slate-900">{{ item.name }}</h2>
        <p class="mt-1 text-sm text-slate-500">{{ item.price | number: '1.2-2' }}</p>

        <div class="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1">
          @for (group of item.modifierGroups; track group.id) {
            <div>
              <div class="flex items-center justify-between">
                <p class="text-sm font-semibold text-slate-900">{{ group.name }}</p>
                @if (group.isRequired) {
                  <span class="text-xs font-medium text-red-500">Required</span>
                } @else {
                  <span class="text-xs text-slate-400">{{ group.selectionType === 'Multiple' ? 'Optional' : 'Optional' }}</span>
                }
              </div>
              <div class="mt-2 space-y-1.5">
                @if (group.selectionType === 'Single') {
                  @if (!group.isRequired) {
                    <label class="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input type="radio" [name]="group.id" [checked]="!selectedSingle(group.id)" (change)="selectSingle(group.id, null)" />
                      None
                    </label>
                  }
                  @for (option of group.options; track option.id) {
                    <label class="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <span class="flex items-center gap-2">
                        <input type="radio" [name]="group.id" [checked]="selectedSingle(group.id) === option.id" (change)="selectSingle(group.id, option.id)" />
                        {{ option.name }}
                      </span>
                      @if (option.priceDelta) {
                        <span class="text-slate-500">+{{ option.priceDelta | number: '1.2-2' }}</span>
                      }
                    </label>
                  }
                } @else {
                  @for (option of group.options; track option.id) {
                    <label class="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <span class="flex items-center gap-2">
                        <input type="checkbox" [checked]="isMultiSelected(option.id)" (change)="toggleMulti(option.id)" />
                        {{ option.name }}
                      </span>
                      @if (option.priceDelta) {
                        <span class="text-slate-500">+{{ option.priceDelta | number: '1.2-2' }}</span>
                      }
                    </label>
                  }
                }
              </div>
            </div>
          }
        </div>

        <div class="mt-5 flex justify-end gap-3">
          <button type="button" (click)="dismiss()" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            [disabled]="!allRequiredSatisfied()"
            (click)="confirm()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Add to Order
          </button>
        </div>
      }
    </app-modal>
  `,
})
export class ModifierPickerModal {
  readonly open = input.required<boolean>();
  readonly item = input<MenuItem | null>(null);
  readonly closed = output<void>();
  readonly confirmed = output<ModifierPickerResult>();

  /** groupId -> selected option id (Single groups only). */
  private readonly singleSelections = signal<Record<string, string>>({});
  /** Selected option ids across every Multiple group. */
  private readonly multiSelections = signal<Set<string>>(new Set());

  protected readonly allRequiredSatisfied = computed(() => {
    const item = this.item();
    if (!item) return false;
    return item.modifierGroups.every((group) => {
      if (!group.isRequired) return true;
      if (group.selectionType === 'Single') return !!this.singleSelections()[group.id];
      return group.options.some((o) => this.multiSelections().has(o.id));
    });
  });

  constructor() {
    // Reset selections every time the modal opens for a (possibly new) item
    // — required Single groups default to their first option.
    effect(() => {
      if (this.open()) {
        const item = this.item();
        const defaults: Record<string, string> = {};
        for (const group of item?.modifierGroups ?? []) {
          if (group.isRequired && group.selectionType === 'Single' && group.options.length > 0) {
            defaults[group.id] = group.options[0].id;
          }
        }
        this.singleSelections.set(defaults);
        this.multiSelections.set(new Set());
      }
    });
  }

  protected selectedSingle(groupId: string): string | undefined {
    return this.singleSelections()[groupId];
  }

  selectSingle(groupId: string, optionId: string | null): void {
    this.singleSelections.update((current) => {
      const next = { ...current };
      if (optionId) next[groupId] = optionId;
      else delete next[groupId];
      return next;
    });
  }

  protected isMultiSelected(optionId: string): boolean {
    return this.multiSelections().has(optionId);
  }

  toggleMulti(optionId: string): void {
    this.multiSelections.update((current) => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  dismiss(): void {
    this.closed.emit();
  }

  confirm(): void {
    if (!this.allRequiredSatisfied()) return;
    const selectedOptionIds = [...Object.values(this.singleSelections()), ...this.multiSelections()];
    this.confirmed.emit({ selectedOptionIds });
  }
}
