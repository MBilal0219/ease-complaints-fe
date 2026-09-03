import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PersonSummary } from '../../../core/admin/models';
import { ROLE_ADMIN, ROLE_DEVELOPER } from '../../../core/auth/models';
import { AuthService } from '../../../core/auth/auth.service';
import { TicketsService } from '../../../core/tickets/tickets.service';
import {
  StatusOption,
  TICKET_STATUS_BADGE_CLASSES,
  TICKET_STATUS_LABELS,
  TicketDto,
  TicketMessageDto,
  adminStatusOptionsFor,
  priorityBadgeClasses,
} from '../../../core/tickets/models';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FileDropzone } from '../../../shared/ui/file-dropzone/file-dropzone';
import { Modal } from '../../../shared/ui/modal/modal';
import { StatusDropdown } from '../../../shared/ui/status-dropdown/status-dropdown';

const TICKET_POLL_MS = 6_000;

@Component({
  selector: 'app-ticket-detail',
  imports: [DatePipe, RouterLink, FileDropzone, Modal, ConfirmDialog, StatusDropdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notFound()) {
      <div class="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p class="text-sm text-slate-500">{{ notFound() }}</p>
        <a [routerLink]="backLink()" class="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back</a>
      </div>
    } @else if (ticket(); as t) {
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a [routerLink]="backLink()" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">← Back</a>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <span class="font-mono text-xs text-slate-500">{{ t.ticketNumber }}</span>
            @if (isAdmin()) {
              <app-status-dropdown [status]="t.status" [options]="adminOptions()" (statusSelected)="changeStatusAsAdmin($event)" />
            } @else {
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="badgeClasses[t.status]">
                {{ statusLabels[t.status] }}
              </span>
            }
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="priorityClasses(t.priorityName)">
              {{ t.priorityName }}
            </span>
          </div>
          <h1 class="mt-1 text-lg font-semibold text-slate-900">{{ t.title }}</h1>
        </div>

        <div class="flex flex-wrap gap-2">
          @if (isAdmin() && t.status !== 'Closed' && t.status !== 'Revoked') {
            <button
              type="button"
              (click)="showAssignModal.set(true)"
              class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {{ t.assignedDeveloperId ? 'Reassign' : 'Assign developer' }}
            </button>
          }
          @if (isAdmin() && (t.status === 'Resolved' || t.status === 'Rejected')) {
            <button
              type="button"
              (click)="closeMessage.set(''); showCloseModal.set(true)"
              class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Close ticket
            </button>
          }
          @if (canDeveloperAct()) {
            @if (t.status === 'Assigned') {
              <button
                type="button"
                (click)="setStatus('InProgress')"
                [disabled]="actionPending()"
                class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Start progress
              </button>
            }
            @if (t.status === 'Assigned' || t.status === 'InProgress') {
              <button
                type="button"
                (click)="setStatus('Resolved')"
                [disabled]="actionPending()"
                class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                Mark resolved
              </button>
              <button
                type="button"
                (click)="setStatus('Rejected')"
                [disabled]="actionPending()"
                class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
            }
          }
          @if (isOwner() && (t.status === 'New' || t.status === 'Assigned')) {
            <button
              type="button"
              (click)="showRevokeConfirm.set(true)"
              class="rounded-md border border-orange-300 bg-white px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-50"
            >
              Revoke complaint
            </button>
          }
        </div>
      </div>

      @if (actionError()) {
        <p class="mt-3 text-sm text-red-600" role="alert">{{ actionError() }}</p>
      }

      @if (isOwner() && t.status === 'Revoked') {
        <div class="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p class="text-sm font-medium text-orange-800">This complaint was revoked{{ t.revokedAtUtc ? ' on ' + (t.revokedAtUtc | date: 'medium') : '' }}.</p>
          <p class="mt-1 text-sm text-orange-700">You can bring it back as a fresh complaint, or delete it for good.</p>
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              (click)="showRecomplainConfirm.set(true)"
              class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Recomplain
            </button>
            <button
              type="button"
              (click)="showDeleteConfirm.set(true)"
              class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete permanently
            </button>
          </div>
        </div>
      }

      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="rounded-lg border border-slate-200 bg-white p-5">
            <h2 class="text-sm font-semibold text-slate-900">Description</h2>
            <p class="mt-2 whitespace-pre-wrap text-sm text-slate-600">{{ t.description }}</p>
          </div>

          <div class="mt-6 rounded-lg border border-slate-200 bg-white">
            <h2 class="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Conversation</h2>

            <div class="max-h-[28rem] space-y-4 overflow-y-auto p-4">
              @for (message of messages(); track message.id) {
                <div class="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-slate-800">{{ message.authorDisplayName }}</span>
                    <span class="text-xs text-slate-400">{{ message.createdAtUtc | date: 'medium' }}</span>
                  </div>
                  @if (message.body) {
                    <p class="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{{ message.body }}</p>
                  }
                  @if (message.attachments.length > 0) {
                    <div class="mt-2 flex flex-wrap gap-2">
                      @for (attachment of message.attachments; track attachment.id) {
                        @if (attachment.category === 'Image') {
                          <a [href]="attachment.downloadUrl" target="_blank" rel="noopener" class="block">
                            <img [src]="attachment.downloadUrl" [alt]="attachment.originalFileName" class="h-24 w-24 rounded-md border border-slate-200 object-cover hover:opacity-90" />
                          </a>
                        } @else if (attachment.category === 'Video') {
                          <video [src]="attachment.downloadUrl" controls class="h-32 max-w-full rounded-md border border-slate-200 bg-black"></video>
                        } @else {
                          <a
                            [href]="attachment.downloadUrl"
                            target="_blank"
                            rel="noopener"
                            class="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <span>{{ iconFor(attachment.category) }}</span>
                            <span class="max-w-[10rem] truncate">{{ attachment.originalFileName }}</span>
                          </a>
                        }
                      }
                    </div>
                  }
                </div>
              } @empty {
                <p class="py-6 text-center text-sm text-slate-400">No messages yet.</p>
              }
            </div>

            @if (t.status !== 'Closed' && t.status !== 'Revoked') {
              <div class="border-t border-slate-100 p-4">
                <textarea
                  rows="3"
                  [value]="draftBody()"
                  (input)="draftBody.set($any($event.target).value)"
                  placeholder="Write a message…"
                  class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                ></textarea>
                <div class="mt-2">
                  <app-file-dropzone #composerDropzone (filesChange)="draftFiles.set($event)" [maxFiles]="10" />
                </div>
                @if (sendError()) {
                  <p class="mt-2 text-sm text-red-600" role="alert">{{ sendError() }}</p>
                }
                <div class="mt-2 flex justify-end">
                  <button
                    type="button"
                    (click)="sendMessage()"
                    [disabled]="sending() || (!draftBody().trim() && draftFiles().length === 0)"
                    class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {{ sending() ? 'Sending…' : 'Send' }}
                  </button>
                </div>
              </div>
            } @else if (isOwner() && t.status === 'Closed') {
              <div class="border-t border-slate-100 p-4">
                <p class="text-sm font-medium text-slate-700">Not satisfied with this resolution?</p>
                <textarea
                  rows="2"
                  [value]="reopenMessage()"
                  (input)="reopenMessage.set($any($event.target).value)"
                  placeholder="Explain what's still wrong…"
                  class="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                ></textarea>
                @if (reopenError()) {
                  <p class="mt-2 text-sm text-red-600" role="alert">{{ reopenError() }}</p>
                }
                <div class="mt-2 flex justify-end">
                  <button
                    type="button"
                    (click)="reopen()"
                    [disabled]="reopening() || reopenMessage().trim().length < 3"
                    class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {{ reopening() ? 'Reopening…' : 'Reopen complaint' }}
                  </button>
                </div>
              </div>
            } @else {
              <p class="border-t border-slate-100 p-4 text-center text-sm text-slate-400">
                {{ t.status === 'Revoked' ? 'This complaint has been revoked.' : 'This ticket is closed.' }}
              </p>
            }
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 class="text-sm font-semibold text-slate-900">Details</h2>
            <dl class="mt-3 space-y-2.5">
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Category</dt>
                <dd class="font-medium text-slate-700">{{ t.categoryName }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Priority</dt>
                <dd class="font-medium text-slate-700">{{ t.priorityName }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Created by</dt>
                <dd class="text-right font-medium text-slate-700">{{ t.createdByDisplayName }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Developer</dt>
                <dd class="text-right font-medium text-slate-700">{{ t.assignedDeveloperDisplayName ?? 'Unassigned' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Submitted</dt>
                <dd class="font-medium text-slate-700">{{ t.createdAtUtc | date: 'medium' }}</dd>
              </div>
              @if (t.resolvedAtUtc) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Resolved</dt>
                  <dd class="font-medium text-slate-700">{{ t.resolvedAtUtc | date: 'medium' }}</dd>
                </div>
              }
              @if (t.closedAtUtc) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Closed</dt>
                  <dd class="font-medium text-slate-700">{{ t.closedAtUtc | date: 'medium' }}</dd>
                </div>
              }
              @if (t.revokedAtUtc) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Revoked</dt>
                  <dd class="font-medium text-slate-700">{{ t.revokedAtUtc | date: 'medium' }}</dd>
                </div>
              }
            </dl>
          </div>
        </div>
      </div>

      <app-modal [open]="showAssignModal()" (close)="showAssignModal.set(false)">
        <h2 class="text-base font-semibold text-slate-900">Assign developer</h2>
        <p class="mt-1 text-sm text-slate-500">Choose who should work on this ticket.</p>

        <div class="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
          @for (developer of developers(); track developer.id) {
            <button
              type="button"
              (click)="assign(developer.id)"
              [disabled]="actionPending()"
              class="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <span class="font-medium text-slate-800">{{ developer.displayName }}</span>
              <span class="text-xs text-slate-400">{{ developer.openTicketCount }} open</span>
            </button>
          } @empty {
            <p class="py-4 text-center text-sm text-slate-400">No developers available.</p>
          }
        </div>
      </app-modal>

      <app-modal [open]="showCloseModal()" (close)="showCloseModal.set(false)">
        <h2 class="text-base font-semibold text-slate-900">Close ticket</h2>
        <p class="mt-1 text-sm text-slate-500">Optionally leave a note for the party explaining the resolution — they'll see it in the conversation.</p>
        <textarea
          rows="3"
          [value]="closeMessage()"
          (input)="closeMessage.set($any($event.target).value)"
          placeholder="e.g. Fixed and verified in the latest release."
          class="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        ></textarea>
        <div class="mt-4 flex justify-end gap-3">
          <button type="button" (click)="showCloseModal.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            (click)="closeTicket()"
            [disabled]="actionPending()"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {{ actionPending() ? 'Closing…' : 'Close ticket' }}
          </button>
        </div>
      </app-modal>

      <app-confirm-dialog
        [open]="showRevokeConfirm()"
        title="Revoke this complaint?"
        message="It will be moved out of the active queue. You can recomplain or delete it afterwards."
        confirmLabel="Revoke"
        [destructive]="true"
        [busy]="actionPending()"
        (confirm)="revoke()"
        (cancel)="showRevokeConfirm.set(false)"
      />
      <app-confirm-dialog
        [open]="showRecomplainConfirm()"
        title="Recomplain this ticket?"
        message="It will go back to New and re-enter the normal queue for an Admin to assign."
        confirmLabel="Recomplain"
        [busy]="actionPending()"
        (confirm)="recomplain()"
        (cancel)="showRecomplainConfirm.set(false)"
      />
      <app-confirm-dialog
        [open]="showDeleteConfirm()"
        title="Delete this complaint permanently?"
        message="This cannot be undone — the complaint and everything in it will be gone for good."
        confirmLabel="Delete permanently"
        [destructive]="true"
        [busy]="actionPending()"
        (confirm)="deleteRevoked()"
        (cancel)="showDeleteConfirm.set(false)"
      />
    } @else {
      <p class="text-sm text-slate-500" role="status">Loading…</p>
    }
  `,
})
export class TicketDetailPage implements OnInit {
  protected readonly statusLabels = TICKET_STATUS_LABELS;
  protected readonly badgeClasses = TICKET_STATUS_BADGE_CLASSES;
  protected readonly priorityClasses = priorityBadgeClasses;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ticketsService = inject(TicketsService);
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly ticketId = this.route.snapshot.paramMap.get('id')!;

  protected readonly ticket = signal<TicketDto | null>(null);
  protected readonly messages = signal<TicketMessageDto[]>([]);
  protected readonly notFound = signal<string | null>(null);
  protected readonly developers = signal<PersonSummary[]>([]);

  protected readonly showAssignModal = signal(false);
  protected readonly showCloseModal = signal(false);
  protected readonly closeMessage = signal('');
  protected readonly showRevokeConfirm = signal(false);
  protected readonly showRecomplainConfirm = signal(false);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly actionPending = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly reopenMessage = signal('');
  protected readonly reopening = signal(false);
  protected readonly reopenError = signal<string | null>(null);

  protected readonly draftBody = signal('');
  protected readonly draftFiles = signal<File[]>([]);
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  private readonly messagesRefresh = new Subject<void>();
  private readonly composerDropzone = viewChild<FileDropzone>('composerDropzone');

  protected readonly isAdmin = computed(() => this.authService.currentUser()?.roles.includes(ROLE_ADMIN) ?? false);
  protected readonly isOwner = computed(() => this.authService.currentUser()?.id === this.ticket()?.createdByUserId);
  protected readonly canDeveloperAct = computed(() => {
    const user = this.authService.currentUser();
    const t = this.ticket();
    return !!user && user.roles.includes(ROLE_DEVELOPER) && t?.assignedDeveloperId === user.id && t.status !== 'Closed' && t.status !== 'Revoked';
  });

  // Assign/Reassign already has its own dedicated button above — the
  // dropdown here only needs to offer what that button doesn't (Reject, Reopen).
  protected readonly adminOptions = computed<StatusOption[]>(() => {
    const t = this.ticket();
    return t ? adminStatusOptionsFor(t, false) : [];
  });

  protected readonly backLink = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    if (roles.includes(ROLE_ADMIN)) return '/app/admin/tickets';
    if (roles.includes(ROLE_DEVELOPER)) return '/app/developer/board';
    return '/app/user/my-complaints';
  });

  ngOnInit(): void {
    // Poll the ticket itself too (not just messages) — the closest thing to
    // "real time" without SignalR (deferred per ADR-003): an Admin's status
    // change shows up here within one tick.
    timer(0, TICKET_POLL_MS)
      .pipe(
        switchMap(() => this.ticketsService.getById(this.ticketId).pipe(catchError((error: HttpErrorResponse) => of(error)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result instanceof HttpErrorResponse) {
          if (!this.ticket()) {
            this.notFound.set(result.status === 403 ? 'You do not have access to this ticket.' : 'This ticket could not be found.');
          }
          return;
        }
        this.ticket.set(result);
      });

    merge(timer(0, TICKET_POLL_MS), this.messagesRefresh)
      .pipe(
        switchMap(() => this.ticketsService.getMessages(this.ticketId).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((messages) => {
        if (messages) this.messages.set(messages);
      });

    if (this.authService.currentUser()?.roles.includes(ROLE_ADMIN)) {
      this.adminService.getDevelopers('', 1, 100).subscribe((result) => this.developers.set(result.items));
    }
  }

  assign(developerId: string): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.assign(this.ticketId, developerId).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.showAssignModal.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not assign this ticket.');
      },
    });
  }

  closeTicket(): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.close(this.ticketId, this.closeMessage().trim() || undefined).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.showCloseModal.set(false);
        this.messagesRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not close this ticket.');
      },
    });
  }

  changeStatusAsAdmin(option: StatusOption): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.updateStatusAsAdmin(this.ticketId, option.value).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not change this ticket’s status.');
      },
    });
  }

  setStatus(status: 'InProgress' | 'Resolved' | 'Rejected'): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.updateStatus(this.ticketId, status).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.messagesRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update this ticket.');
      },
    });
  }

  revoke(): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.revoke(this.ticketId).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.showRevokeConfirm.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showRevokeConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not revoke this complaint.');
      },
    });
  }

  recomplain(): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.recomplain(this.ticketId).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.showRecomplainConfirm.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showRecomplainConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not recomplain this ticket.');
      },
    });
  }

  deleteRevoked(): void {
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.deleteRevoked(this.ticketId).subscribe({
      next: () => {
        this.router.navigateByUrl('/app/user/my-complaints');
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.showDeleteConfirm.set(false);
        this.actionError.set(error.error?.error ?? 'Could not delete this complaint.');
      },
    });
  }

  reopen(): void {
    const message = this.reopenMessage().trim();
    if (message.length < 3) return;

    this.reopening.set(true);
    this.reopenError.set(null);
    this.ticketsService.reopen(this.ticketId, message).subscribe({
      next: (ticket) => {
        this.reopening.set(false);
        this.reopenMessage.set('');
        this.ticket.set(ticket);
        this.messagesRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.reopening.set(false);
        this.reopenError.set(error.error?.error ?? 'Could not reopen this complaint.');
      },
    });
  }

  sendMessage(): void {
    const body = this.draftBody().trim();
    const files = this.draftFiles();
    if (!body && files.length === 0) return;

    this.sending.set(true);
    this.sendError.set(null);
    this.ticketsService.postMessage(this.ticketId, body, files).subscribe({
      next: () => {
        this.sending.set(false);
        this.draftBody.set('');
        this.draftFiles.set([]);
        this.composerDropzone()?.clear();
        this.messagesRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.sending.set(false);
        this.sendError.set(error.error?.error ?? 'Could not send this message.');
      },
    });
  }

  protected iconFor(category: string): string {
    if (category === 'Archive') return '🗜️';
    if (category === 'Video') return '🎞️';
    return '📎';
  }
}
