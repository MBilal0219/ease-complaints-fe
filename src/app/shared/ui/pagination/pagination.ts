import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Sentinel for a collapsed run of pages in the numbered strip. */
const ELLIPSIS = -1;

/**
 * Always visible (even for a single page) so the control isn't mistaken for
 * missing — Previous/Next just disable themselves when there's nowhere to go.
 */
@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="flex flex-wrap items-center justify-between gap-3 px-4 py-3" aria-label="Pagination">
      <span class="text-sm text-slate-500">{{ summary() }}</span>

      <div class="flex items-center gap-1">
        <button
          type="button"
          (click)="go(page() - 1)"
          [disabled]="page() <= 1"
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Previous
        </button>

        <div class="hidden items-center gap-1 sm:flex">
          @for (item of pageItems(); track $index) {
            @if (item === ellipsis) {
              <span class="px-2 text-sm text-slate-400">…</span>
            } @else {
              <button
                type="button"
                (click)="go(item)"
                [attr.aria-current]="item === page() ? 'page' : null"
                class="h-8 w-8 rounded-md text-sm font-medium"
                [class]="item === page() ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
              >
                {{ item }}
              </button>
            }
          }
        </div>

        <button
          type="button"
          (click)="go(page() + 1)"
          [disabled]="page() >= totalPages()"
          class="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Next
        </button>
      </div>
    </nav>
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly totalItems = input<number>(0);
  readonly pageSize = input<number>(10);
  readonly pageChange = output<number>();

  protected readonly ellipsis = ELLIPSIS;

  protected readonly summary = computed(() => {
    const total = this.totalItems();
    if (total === 0) return 'No results';

    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.page() * this.pageSize(), total);
    return `Showing ${start}–${end} of ${total}`;
  });

  /** Windowed page numbers: first, last, and a run around the current page, with ellipses for gaps. */
  protected readonly pageItems = computed<number[]>(() => {
    const total = this.totalPages();
    const current = this.page();
    const window = 1;

    const pages = new Set<number>([1, total]);
    for (let p = current - window; p <= current + window; p++) {
      if (p >= 1 && p <= total) pages.add(p);
    }

    const sorted = [...pages].sort((a, b) => a - b);
    const result: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
        result.push(ELLIPSIS);
      }
      result.push(sorted[i]);
    }
    return result;
  });

  go(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.pageChange.emit(page);
  }
}
