import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { StatusOption, TICKET_STATUS_BADGE_CLASSES, TICKET_STATUS_LABELS, TicketStatus } from '../../../core/tickets/models';

/**
 * Status pill with a chevron that opens a dropdown of contextual actions —
 * the caller computes `options` per-ticket (see adminStatusOptionsFor) since
 * what's offered depends on the ticket's current state (e.g. "Reopen" only
 * once Closed). An empty options list (Revoked, or nothing else applies)
 * renders as a plain pill with no chevron.
 */
@Component({
  selector: 'app-status-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-flex items-center gap-1">
      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="badgeClasses[status()]">
        {{ labels[status()] }}
      </span>

      @if (!disabled() && options().length > 0) {
        <button
          type="button"
          (click)="toggle($event)"
          class="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Change status"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        @if (menuOpen()) {
          <div class="absolute left-0 top-full z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            @for (option of options(); track option.value + option.label) {
              <button
                type="button"
                (click)="select(option)"
                class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                {{ option.label }}
              </button>
            }
          </div>
        }
      }
    </div>
  `,
})
export class StatusDropdown {
  readonly status = input.required<TicketStatus>();
  readonly options = input<StatusOption[]>([]);
  readonly disabled = input(false);
  readonly statusSelected = output<StatusOption>();

  protected readonly labels = TICKET_STATUS_LABELS;
  protected readonly badgeClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly menuOpen = signal(false);

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  toggle(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  select(option: StatusOption): void {
    this.menuOpen.set(false);
    this.statusSelected.emit(option);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }
}
