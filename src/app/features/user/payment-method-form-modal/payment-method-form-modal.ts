import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsService } from '../../../core/settings/settings.service';
import { PaymentMethod } from '../../../core/settings/models';
import { Modal } from '../../../shared/ui/modal/modal';

/** Create when `method()` is null, edit otherwise. Cash/Card are never deleted — only renamed, re-taxed, or deactivated — same as any custom method. */
@Component({
  selector: 'app-payment-method-form-modal',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">{{ method() ? 'Edit Payment Method' : 'Add Payment Method' }}</h2>
      <p class="mt-1 text-sm text-slate-500">e.g. "Cash", "Card", "JazzCash" — each with its own tax rate.</p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="pm-name" class="block text-sm font-medium text-slate-700">Name</label>
          <input id="pm-name" type="text" formControlName="name" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label for="pm-tax" class="block text-sm font-medium text-slate-700">Tax rate (%)</label>
          <input id="pm-tax" type="number" step="0.01" min="0" max="100" formControlName="taxRatePercent" class="mt-1 w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <p class="mt-1 text-xs text-slate-500">Applied to a sale's total when this method is selected at punch time.</p>
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
export class PaymentMethodFormModal {
  readonly open = input.required<boolean>();
  readonly method = input<PaymentMethod | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    taxRatePercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const existing = this.method();
        this.form.reset({ name: existing?.name ?? '', taxRatePercent: existing?.taxRatePercent ?? 0 });
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
    const { name, taxRatePercent } = this.form.getRawValue();
    const existing = this.method();
    const request = { name, taxRatePercent, sortOrder: existing?.sortOrder ?? 0 };

    const save$ = existing ? this.settingsService.updatePaymentMethod(existing.id, request) : this.settingsService.createPaymentMethod(request);

    save$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not save this payment method.');
      },
    });
  }
}
