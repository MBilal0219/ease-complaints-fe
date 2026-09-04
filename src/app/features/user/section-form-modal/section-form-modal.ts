import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableService } from '../../../core/tables/table.service';
import { TableSection } from '../../../core/tables/models';
import { Modal } from '../../../shared/ui/modal/modal';

/** Create when `section()` is null, edit otherwise. */
@Component({
  selector: 'app-section-form-modal',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ section() ? 'Edit Section' : 'Add Section' }}</h2>
      <p class="mt-1 text-sm text-slate-500">e.g. "Dining", "Terrace", "VIP".</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="section-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="section-name" type="text" formControlName="name" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="section-sort" class="block text-sm font-medium text-slate-700">Display order</label>
          <input id="section-sort" type="number" formControlName="sortOrder" class="mt-1 w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
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
export class SectionFormModal {
  readonly open = input.required<boolean>();
  readonly section = input<TableSection | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly tableService = inject(TableService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sortOrder: [0],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const existing = this.section();
        this.form.reset({ name: existing?.name ?? '', sortOrder: existing?.sortOrder ?? 0 });
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
    const existing = this.section();

    const save$ = existing ? this.tableService.updateSection(existing.id, request) : this.tableService.createSection(request);

    save$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this section.');
      },
    });
  }
}
