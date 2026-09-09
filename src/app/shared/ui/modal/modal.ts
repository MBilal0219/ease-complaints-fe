import { ApplicationRef, ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

/**
 * The outer wrapper carries `pos-hide-print` (see eas-complaints/src/styles.css)
 * so this modal itself never bleeds into a print job — it matters concretely
 * for the POS Terminal's receipt modal, which is the one modal actually open
 * at print time: without this, the modal's backdrop/close button/action
 * buttons print alongside the dedicated `#pos-print-area` content instead of
 * being hidden like the rest of the app chrome.
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="pos-hide-print fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" (click)="emitClose()"></div>
        <div
          class="relative flex max-h-[90vh] w-full {{ maxWidthClass() }} flex-col rounded-xl bg-white shadow-xl"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            (click)="emitClose()"
            aria-label="Close"
            class="absolute right-4 top-4 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <!-- Own scroll container, not the dialog itself — keeps the close
               button fixed at the corner instead of scrolling away with
               tall content (e.g. the Reports modal's filters + type toggle
               + Print button + results table, which previously had no
               bound on the dialog's height at all and could push its own
               top controls off-screen with nothing to scroll them back
               into view). -->
          <div class="overflow-y-auto p-6">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
})
export class Modal {
  private readonly appRef = inject(ApplicationRef);

  readonly open = input.required<boolean>();
  /** Tailwind max-width utility class (e.g. "max-w-xs") — defaults to the dialog's usual size; a caller like the receipt modal overrides it to look right for its own content instead of always being one fixed dialog width. */
  readonly maxWidthClass = input<string>('max-w-lg');
  readonly close = output<void>();

  /**
   * Closing via the X or the backdrop routes through here (not a plain
   * `close.emit()`) as a safety net: this app has no zone.js at all
   * (Angular 22, zoneless by default), so change detection after a click
   * relies entirely on Angular's own zoneless scheduler noticing the signal
   * writes triggered by `close.emit()`. That should always be automatic —
   * this is deliberately deferred (queueMicrotask) and guarded (try/catch)
   * rather than an immediate `appRef.tick()`, because calling `tick()`
   * synchronously while Angular's own scheduler may already have a render
   * in flight for this same click can throw ("ApplicationRef.tick called
   * recursively") instead of helping. The real fix for the modal-not-
   * closing bug this was chasing turned out to be at the actual root cause —
   * see OrderReceiptModal.print()'s doc comment — this stays only as cheap,
   * harmless insurance.
   */
  protected emitClose(): void {
    this.close.emit();
    queueMicrotask(() => {
      try {
        this.appRef.tick();
      } catch {
        // Already flushed by Angular's own scheduler — nothing to do.
      }
    });
  }
}
