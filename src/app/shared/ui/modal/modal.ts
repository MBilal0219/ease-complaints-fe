import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" (click)="close.emit()"></div>
        <div class="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
          <button
            type="button"
            (click)="close.emit()"
            aria-label="Close"
            class="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class Modal {
  readonly open = input.required<boolean>();
  readonly close = output<void>();
}
