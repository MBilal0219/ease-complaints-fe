import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SaleService } from '../../../core/sales/sale.service';
import { Sale } from '../../../core/sales/models';
import { Modal } from '../../../shared/ui/modal/modal';

/** Voids a punched sale and opens a new Held sale (OriginalSaleId set) cloned from it — see docs/modules/pos-sales-and-billing.md. */
@Component({
  selector: 'app-void-reissue-modal',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()">
      <h2 class="text-base font-semibold text-slate-900">Void & Reissue Invoice {{ sale()?.receiptNumber ?? sale()?.invoiceNumber }}</h2>
      <p class="mt-2 text-sm text-slate-600">
        This voids the punched bill and opens a new Held order with the same items, ready to correct and re-punch. The original
        stays on record, marked Voided, for a full audit trail.
      </p>

      <form class="mt-4 space-y-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="void-reason" class="block text-sm font-medium text-slate-700">Reason</label>
          <textarea id="void-reason" rows="2" formControlName="voidReason" placeholder="e.g. Wrong items rung in" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
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
            class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {{ submitting() ? 'Working…' : 'Void & Reissue' }}
          </button>
        </div>
      </form>
    </app-modal>
  `,
})
export class VoidReissueModal {
  readonly open = input.required<boolean>();
  readonly sale = input<Sale | null>(null);
  readonly closed = output<void>();
  readonly reissued = output<Sale>();

  private readonly fb = inject(FormBuilder);
  private readonly saleService = inject(SaleService);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    voidReason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form.reset({ voidReason: '' });
        this.errorMessage.set(null);
      }
    });
  }

  dismiss(): void {
    this.closed.emit();
  }

  submit(): void {
    const sale = this.sale();
    if (this.form.invalid || this.submitting() || !sale) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.saleService.voidAndReissue(sale.id, this.form.getRawValue().voidReason).subscribe({
      next: (reissued) => {
        this.submitting.set(false);
        this.reissued.emit(reissued);
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not void this sale.');
      },
    });
  }
}
