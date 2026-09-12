import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { Modal } from '../modal/modal';

export interface PreviewItem {
  url: string;
  name: string;
}

/**
 * A large image/video preview lightbox — image gets zoom/rotate/download/
 * prev-next navigation, video gets a larger player + download. Anything
 * else (Archive/Other) never opens this; those stay a plain download chip
 * wherever they're rendered (see ticket-detail.ts's attachment rendering).
 * Built as a Modal variant, matching this app's existing hand-built Tailwind
 * component style rather than a new dependency — no Ant Design/ng-zorro
 * exists anywhere in this codebase.
 */
@Component({
  selector: 'app-attachment-preview',
  imports: [Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [open]="open()" (close)="dismiss()" maxWidthClass="max-w-4xl">
      @if (current(); as item) {
        <div class="flex items-center justify-between gap-3">
          <p class="min-w-0 truncate text-sm font-medium text-slate-700">{{ item.name }}</p>
          <div class="flex shrink-0 items-center gap-1">
            @if (kind() === 'image') {
              <button type="button" (click)="zoomOut()" title="Zoom out" class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">−</button>
              <button type="button" (click)="zoomIn()" title="Zoom in" class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">+</button>
              <button type="button" (click)="rotate()" title="Rotate" class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">⟳</button>
            }
            <a [href]="item.url" target="_blank" rel="noopener" title="Download" class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">⬇</a>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-center overflow-hidden rounded-md bg-slate-900" style="min-height: 20rem">
          @if (kind() === 'image') {
            <img
              [src]="item.url"
              [alt]="item.name"
              class="max-h-[70vh] max-w-full select-none object-contain transition-transform"
              [style.transform]="'scale(' + zoom() + ') rotate(' + rotation() + 'deg)'"
            />
          } @else {
            <video [src]="item.url" controls autoplay class="max-h-[70vh] max-w-full"></video>
          }
        </div>

        @if (items().length > 1) {
          <div class="mt-3 flex items-center justify-between">
            <button
              type="button"
              (click)="previous()"
              [disabled]="index() === 0"
              class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Previous
            </button>
            <span class="text-xs text-slate-400">{{ index() + 1 }} of {{ items().length }}</span>
            <button
              type="button"
              (click)="next()"
              [disabled]="index() === items().length - 1"
              class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        }
      }
    </app-modal>
  `,
})
export class AttachmentPreview {
  readonly open = input.required<boolean>();
  readonly kind = input.required<'image' | 'video'>();
  readonly items = input.required<PreviewItem[]>();
  readonly startIndex = input<number>(0);
  readonly closed = output<void>();

  protected readonly index = signal(0);
  protected readonly zoom = signal(1);
  protected readonly rotation = signal(0);

  protected readonly current = computed<PreviewItem | null>(() => this.items()[this.index()] ?? null);

  constructor() {
    // Reset the viewer (index/zoom/rotation) every time it's (re)opened on a new item.
    effect(() => {
      if (this.open()) {
        this.index.set(this.startIndex());
        this.zoom.set(1);
        this.rotation.set(0);
      }
    });
  }

  dismiss(): void {
    this.closed.emit();
  }

  zoomIn(): void {
    this.zoom.update((z) => Math.min(z + 0.25, 3));
  }

  zoomOut(): void {
    this.zoom.update((z) => Math.max(z - 0.25, 0.5));
  }

  rotate(): void {
    this.rotation.update((r) => (r + 90) % 360);
  }

  previous(): void {
    this.index.update((i) => Math.max(0, i - 1));
    this.zoom.set(1);
    this.rotation.set(0);
  }

  next(): void {
    this.index.update((i) => Math.min(this.items().length - 1, i + 1));
    this.zoom.set(1);
    this.rotation.set(0);
  }
}
