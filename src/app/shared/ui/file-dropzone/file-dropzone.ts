import { ChangeDetectionStrategy, Component, OnDestroy, computed, input, output, signal, viewChild, ElementRef } from '@angular/core';

export interface PickedFile {
  file: File;
  id: string;
  /** Object URL, only set for images/videos — revoked on remove/clear/destroy. */
  previewUrl: string | null;
  kind: 'image' | 'video' | 'other';
}

const KB = 1024;

/**
 * Drag-and-drop (or click-to-browse) file picker. Purely a client-side
 * staging area — it hands the caller a `File[]` on every change and does not
 * upload anything itself; the caller decides when to send them (e.g. as part
 * of posting a ticket message). Accepts images, video, .zip, .pdf, .txt, .log
 * — kept in sync with FileStorageOptions on the backend, which is the real
 * enforcement point. Images/videos get an actual thumbnail preview; anything
 * else gets a generic file icon.
 */
@Component({
  selector: 'app-file-dropzone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative rounded-lg border-2 border-dashed p-6 text-center transition-colors"
      [class]="isDragging() ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input
        #fileInput
        type="file"
        multiple
        [accept]="accept()"
        class="hidden"
        (change)="onFileInputChange($event)"
      />

      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mx-auto h-9 w-9 text-slate-400">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
      </svg>

      <p class="mt-2 text-sm text-slate-600">
        <button type="button" (click)="fileInput.click()" class="font-medium text-indigo-600 hover:text-indigo-500">Click to upload</button>
        or drag and drop
      </p>
      <p class="mt-1 text-xs text-slate-400">Images, video, ZIP, PDF, TXT — up to {{ maxSizeLabel() }} each</p>

      @if (picked().length > 0) {
        <ul class="mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
          @for (item of picked(); track item.id) {
            <li class="relative flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
              @if (item.kind === 'image' && item.previewUrl) {
                <img [src]="item.previewUrl" alt="" class="h-10 w-10 shrink-0 rounded object-cover" />
              } @else if (item.kind === 'video' && item.previewUrl) {
                <video [src]="item.previewUrl" muted class="h-10 w-10 shrink-0 rounded object-cover bg-slate-900"></video>
              } @else {
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-lg">{{ iconFor(item.file) }}</span>
              }
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-slate-700">{{ item.file.name }}</p>
                <p class="text-[11px] text-slate-400">{{ formatSize(item.file.size) }}</p>
              </div>
              <button
                type="button"
                (click)="remove(item.id)"
                class="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-400 shadow-sm hover:bg-slate-100 hover:text-slate-600"
                aria-label="Remove file"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class FileDropzone implements OnDestroy {
  readonly accept = input<string>('image/*,video/*,.zip,.pdf,.txt,.log');
  readonly maxFiles = input<number>(10);
  readonly filesChange = output<File[]>();

  protected readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly isDragging = signal(false);
  protected readonly picked = signal<PickedFile[]>([]);

  protected readonly maxSizeLabel = computed(() => '100MB');

  ngOnDestroy(): void {
    for (const item of this.picked()) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    if (event.dataTransfer?.files?.length) {
      this.addFiles(event.dataTransfer.files);
    }
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.addFiles(input.files);
    }
    input.value = '';
  }

  remove(id: string): void {
    const item = this.picked().find((i) => i.id === id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    this.picked.update((items) => items.filter((i) => i.id !== id));
    this.emitChange();
  }

  /** Clears every staged file — call after a successful upload. */
  clear(): void {
    for (const item of this.picked()) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    this.picked.set([]);
  }

  protected formatSize(bytes: number): string {
    if (bytes < KB) return `${bytes} B`;
    if (bytes < KB * KB) return `${(bytes / KB).toFixed(1)} KB`;
    return `${(bytes / (KB * KB)).toFixed(1)} MB`;
  }

  protected iconFor(file: File): string {
    if (file.name.toLowerCase().endsWith('.zip')) return '🗜️';
    if (file.name.toLowerCase().endsWith('.pdf')) return '📄';
    return '📎';
  }

  private addFiles(fileList: FileList): void {
    const remainingSlots = this.maxFiles() - this.picked().length;
    if (remainingSlots <= 0) return;

    const newItems: PickedFile[] = Array.from(fileList)
      .slice(0, remainingSlots)
      .map((file) => {
        const kind: PickedFile['kind'] = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'other';
        return {
          file,
          id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          previewUrl: kind === 'other' ? null : URL.createObjectURL(file),
          kind,
        };
      });

    this.picked.update((items) => [...items, ...newItems]);
    this.emitChange();
  }

  private emitChange(): void {
    this.filesChange.emit(this.picked().map((p) => p.file));
  }
}
