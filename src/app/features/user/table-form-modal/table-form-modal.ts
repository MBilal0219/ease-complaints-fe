import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableService } from '../../../core/tables/table.service';
import { RestaurantTable, TableSection } from '../../../core/tables/models';
import { Modal } from '../../../shared/ui/modal/modal';

/** Create when `table()` is null, edit otherwise. */
@Component({
  selector: 'app-table-form-modal',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ table() ? 'Edit Table' : 'Add Table' }}</h2>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="table-name" class="block text-sm font-medium text-slate-700">Table name / number</label>
            <input id="table-name" type="text" formControlName="name" placeholder="e.g. 12" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label for="table-seats" class="block text-sm font-medium text-slate-700">Seats</label>
            <input id="table-seats" type="number" min="1" formControlName="seats" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <label for="table-section" class="block text-sm font-medium text-slate-700">Section</label>
          <select id="table-section" formControlName="sectionId" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option [ngValue]="null">No section (shows in "All Tables" only)</option>
            @for (section of sections(); track section.id) {
              <option [ngValue]="section.id">{{ section.name }}</option>
            }
          </select>
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
export class TableFormModal {
  readonly open = input.required<boolean>();
  readonly table = input<RestaurantTable | null>(null);
  readonly sections = input.required<TableSection[]>();
  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly tableService = inject(TableService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    seats: [2, [Validators.required, Validators.min(1)]],
    sectionId: [null as string | null],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const existing = this.table();
        this.form.reset({ name: existing?.name ?? '', seats: existing?.seats ?? 2, sectionId: existing?.sectionId ?? null });
        this.errorMessage.set(null);
      }
    });
  }

  dismiss(): void {
    this.closed.emit();
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const request = this.form.getRawValue();
    const existing = this.table();

    const save$ = existing ? this.tableService.updateTable(existing.id, request) : this.tableService.createTable(request);

    save$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this table.');
      },
    });
  }
}
