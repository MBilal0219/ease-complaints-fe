import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Modal } from '../modal/modal';

/** Generic "are you sure?" popup — used for revoke/delete/recomplain and any other destructive or hard-to-undo action. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="cancel.emit()">
      <h2 class="text-base font-semibold text-slate-900">{{ title() }}</h2>
      <p class="mt-2 text-sm text-slate-600">{{ message() }}</p>

      <div class="mt-5 flex justify-end gap-3">
        <button
          type="button"
          (click)="cancel.emit()"
          class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {{ cancelLabel() }}
        </button>
        <button
          type="button"
          (click)="confirm.emit()"
          [disabled]="busy()"
          class="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          [class]="destructive() ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'"
        >
          {{ busy() ? 'Working…' : confirmLabel() }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ConfirmDialog {
  readonly open = input.required<boolean>();
  readonly title = input('Are you sure?');
  readonly message = input('This action cannot be undone.');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly destructive = input(false);
  readonly busy = input(false);

  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
