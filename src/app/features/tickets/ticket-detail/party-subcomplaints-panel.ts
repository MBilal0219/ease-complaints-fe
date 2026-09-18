import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { TICKET_TASK_STATUS_BADGE_CLASSES, TICKET_TASK_STATUS_LABELS, TicketAttachmentDto, TicketStatus, TicketTaskDto } from '../../../core/tickets/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { AttachmentPreview, PreviewItem } from '../../../shared/ui/attachment-preview/attachment-preview';
import { FileDropzone } from '../../../shared/ui/file-dropzone/file-dropzone';
import { Modal } from '../../../shared/ui/modal/modal';

/**
 * The Party's own view of their subcomplaints — what TicketTasksPanel is for
 * staff, this is for the complaint's owner: their own requests (title,
 * description, status, submission attachments) and the Implementator/Admin's
 * response to each (status, reason, attachments — never who specifically
 * actioned it, see TicketDtoExtensions.MaskForParty), plus a "+ Submit a
 * request" action that always creates a new subcomplaint (req #1 in the
 * refinement plan — every subcomplaint is Party-authored). Wired into
 * ticket-detail.ts in the same slot TicketTasksPanel occupies for staff.
 */
@Component({
  selector: 'app-party-subcomplaints-panel',
  imports: [DatePipe, DecimalPipe, NgTemplateOutlet, Modal, FileDropzone, AttachmentPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 class="text-sm font-semibold text-slate-900">Your requests ({{ tasks().length }})</h2>
        @if (ticketStatus() !== 'Closed' && ticketStatus() !== 'Revoked') {
          <button
            type="button"
            (click)="openSubmit()"
            class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Submit a request
          </button>
        }
      </div>

      <div class="divide-y divide-slate-100">
        @for (task of tasks(); track task.id) {
          <div class="p-4">
            <div class="flex items-center gap-2">
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusBadgeClasses[task.status]">{{ statusLabels[task.status] }}</span>
            </div>
            @if (task.title) {
              <p class="mt-1 text-sm font-medium text-slate-900">{{ task.title }}</p>
            }
            <p class="mt-1 whitespace-pre-wrap text-sm text-slate-600">{{ task.description }}</p>
            @if (task.status === 'Sale' && task.amount != null) {
              <div class="mt-2 inline-flex rounded-md bg-fuchsia-50 px-2.5 py-1 text-sm font-semibold text-fuchsia-700">Sale amount: {{ task.amount | number: '1.0-2' }}</div>
            }

            @if (task.attachments.length > 0) {
              <div class="mt-2 flex flex-wrap gap-2">
                @for (attachment of task.attachments; track attachment.id) {
                  <ng-container [ngTemplateOutlet]="attachmentChip" [ngTemplateOutletContext]="{ $implicit: attachment, siblings: task.attachments }" />
                }
              </div>
            }

            @if (responses(task).length > 0) {
              <div class="mt-2.5 space-y-1.5 border-l-2 border-slate-100 pl-3">
                @for (entry of responses(task); track entry.id) {
                  <div class="text-xs">
                    <span class="rounded-full px-1.5 py-0.5 font-medium" [class]="statusBadgeClasses[entry.toStatus]">{{ statusLabels[entry.toStatus] }}</span>
                    <span class="ml-1.5 text-slate-500">{{ entry.changedAtUtc | date: 'medium' }}</span>
                    @if (entry.reason) {
                      <p class="mt-0.5 text-slate-600">{{ entry.reason }}</p>
                    }
                    @if (entry.attachments.length > 0) {
                      <div class="mt-1 flex flex-wrap gap-2">
                        @for (attachment of entry.attachments; track attachment.id) {
                          <ng-container [ngTemplateOutlet]="attachmentChip" [ngTemplateOutletContext]="{ $implicit: attachment, siblings: entry.attachments }" />
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @empty {
          <p class="p-6 text-center text-sm text-slate-400">You haven't submitted any requests yet.</p>
        }
      </div>
    </div>

    <ng-template #attachmentChip let-attachment let-siblings="siblings">
      @if (attachment.category === 'Image') {
        <button type="button" (click)="openImagePreview(siblings, attachment.id)" class="block">
          <img [src]="fileUrl(attachment.downloadUrl)" [alt]="attachment.originalFileName" class="h-16 w-16 rounded-md border border-slate-200 object-cover hover:opacity-90" />
        </button>
      } @else if (attachment.category === 'Video') {
        <button type="button" (click)="openVideoPreview(attachment)" class="relative block h-16 w-28 overflow-hidden rounded-md border border-slate-200 bg-black">
          <video [src]="fileUrl(attachment.downloadUrl)" class="h-full w-full object-cover"></video>
          <span class="absolute inset-0 flex items-center justify-center text-lg text-white/90">▶</span>
        </button>
      } @else {
        <a [href]="fileUrl(attachment.downloadUrl)" target="_blank" rel="noopener" class="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
          📎 <span class="max-w-[8rem] truncate">{{ attachment.originalFileName }}</span>
        </a>
      }
    </ng-template>

    <app-modal [open]="showSubmit()" (close)="showSubmit.set(false)">
      <h2 class="text-base font-semibold text-slate-900">Submit a request</h2>
      <p class="mt-1 text-sm text-slate-500">Describe the issue or request — our team will review it and get back to you.</p>
      <div class="mt-4 space-y-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">Title</label>
          <input type="text" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="e.g. Payment button is not working" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Description</label>
          <textarea rows="4" [value]="description()" (input)="description.set($any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
        </div>
        <app-file-dropzone (filesChange)="files.set($event)" [maxFiles]="10" />
      </div>
      @if (submitError()) {
        <p class="mt-2 text-sm text-red-600" role="alert">{{ submitError() }}</p>
      }
      <div class="mt-4 flex justify-end gap-3">
        <button type="button" (click)="showSubmit.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button
          type="button"
          (click)="submit()"
          [disabled]="submitting() || title().trim().length < 3 || description().trim().length < 3"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ submitting() ? 'Submitting…' : 'Submit request' }}
        </button>
      </div>
    </app-modal>

    <app-attachment-preview [open]="previewOpen()" [kind]="previewKind()" [items]="previewItems()" [startIndex]="previewStartIndex()" (closed)="previewOpen.set(false)" />
  `,
})
export class PartySubComplaintsPanel {
  readonly ticketId = input.required<string>();
  readonly ticketStatus = input.required<TicketStatus>();
  readonly tasks = input.required<TicketTaskDto[]>();
  readonly changed = output<void>();

  private readonly ticketsService = inject(TicketsService);

  protected readonly statusLabels = TICKET_TASK_STATUS_LABELS;
  protected readonly statusBadgeClasses = TICKET_TASK_STATUS_BADGE_CLASSES;

  protected readonly showSubmit = signal(false);
  protected title = signal('');
  protected description = signal('');
  protected files = signal<File[]>([]);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly previewOpen = signal(false);
  protected readonly previewKind = signal<'image' | 'video'>('image');
  protected readonly previewItems = signal<PreviewItem[]>([]);
  protected readonly previewStartIndex = signal(0);

  /** Skips the initial "submitted" entry (nothing to show yet) — only the team's actual responses. */
  protected responses(task: TicketTaskDto) {
    return task.activity.filter((a) => a.fromStatus != null);
  }

  protected fileUrl(relativeUrl: string): string {
    return environment.apiBaseUrl + relativeUrl;
  }

  protected openImagePreview(siblings: TicketAttachmentDto[], attachmentId: string): void {
    const images = siblings.filter((a) => a.category === 'Image');
    const startIndex = Math.max(0, images.findIndex((a) => a.id === attachmentId));
    this.previewItems.set(images.map((a) => ({ url: this.fileUrl(a.downloadUrl), name: a.originalFileName })));
    this.previewStartIndex.set(startIndex);
    this.previewKind.set('image');
    this.previewOpen.set(true);
  }

  protected openVideoPreview(attachment: TicketAttachmentDto): void {
    this.previewItems.set([{ url: this.fileUrl(attachment.downloadUrl), name: attachment.originalFileName }]);
    this.previewStartIndex.set(0);
    this.previewKind.set('video');
    this.previewOpen.set(true);
  }

  openSubmit(): void {
    this.title.set('');
    this.description.set('');
    this.files.set([]);
    this.submitError.set(null);
    this.showSubmit.set(true);
  }

  submit(): void {
    const title = this.title().trim();
    const description = this.description().trim();
    if (title.length < 3 || description.length < 3 || this.submitting()) return;

    this.submitting.set(true);
    this.submitError.set(null);
    this.ticketsService.submitSubComplaint(this.ticketId(), { title, description, files: this.files() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showSubmit.set(false);
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.submitError.set(error.error?.error ?? 'Could not submit this request.');
      },
    });
  }
}
