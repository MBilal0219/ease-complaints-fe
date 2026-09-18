import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, merge, of, switchMap, timer } from 'rxjs';
import { AdminService } from '../../../core/admin/admin.service';
import { PersonSummary } from '../../../core/admin/models';
import { ROLE_ADMIN, ROLE_DEVELOPER, ROLE_IMPLEMENTATOR } from '../../../core/auth/models';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { DealsService } from '../../../core/tickets/deals.service';
import { TicketsService } from '../../../core/tickets/tickets.service';
import {
  DealSummary,
  DeveloperWorkStatus,
  StatusOption,
  TICKET_MESSAGE_OUTCOME_BADGE_CLASSES,
  TICKET_MESSAGE_OUTCOME_LABELS,
  TICKET_STATUS_BADGE_CLASSES,
  TICKET_STATUS_LABELS,
  TicketAttachmentDto,
  TicketDto,
  TicketMessageAudience,
  TicketMessageDto,
  TicketMessageOutcomeStatus,
  adminStatusOptionsFor,
  formatDurationFull,
  priorityBadgeClasses,
} from '../../../core/tickets/models';
import { AttachmentPreview, PreviewItem } from '../../../shared/ui/attachment-preview/attachment-preview';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FileDropzone } from '../../../shared/ui/file-dropzone/file-dropzone';
import { Modal } from '../../../shared/ui/modal/modal';
import { StatusDropdown } from '../../../shared/ui/status-dropdown/status-dropdown';
import { PartySubComplaintsPanel } from './party-subcomplaints-panel';
import { TicketTasksPanel } from './ticket-tasks-panel';

const TICKET_POLL_MS = 6_000;
const OUTCOME_OPTIONS: TicketMessageOutcomeStatus[] = ['InProgress', 'Resolved', 'Rejected', 'Sale'];

@Component({
  selector: 'app-ticket-detail',
  imports: [DatePipe, RouterLink, FileDropzone, Modal, ConfirmDialog, StatusDropdown, TicketTasksPanel, PartySubComplaintsPanel, AttachmentPreview],
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
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-semibold text-slate-900">{{ t.title }}</h1>
            @if (t.companyName) {
              <span class="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-lg font-semibold text-indigo-800 shadow-sm">
                {{ t.companyName }}
              </span>
            }
          </div>
          @if (runningWork(); as running) {
            <div class="mt-3 inline-flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm">
              <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"></span>
              <span class="text-xs font-semibold uppercase tracking-wide text-emerald-700">Working now</span>
              <span class="font-mono text-lg font-bold tabular-nums text-emerald-800">{{ formatElapsedSeconds(runningElapsedSeconds()) }}</span>
              <span class="text-xs text-emerald-700">Task #{{ running.task.sequenceNumber }}{{ running.task.title ? ' · ' + running.task.title : '' }}</span>
            </div>
          }
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
          @if (isAdmin() && t.status !== 'Closed' && t.status !== 'Revoked' && t.status !== 'Sale') {
            <button
              type="button"
              (click)="saleAmount = ''; saleDeliveryDate = ''; showSaleModal.set(true)"
              class="rounded-md border border-fuchsia-300 bg-white px-3 py-1.5 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-50"
            >
              Sale
            </button>
          }
          @if (canDeveloperAct()) {
            @if (!t.developerWorkStatus || t.developerWorkStatus === 'Assigned') {
              <button type="button" (click)="setDeveloperStatus('InProgress')" [disabled]="actionPending()" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Start progress</button>
            }
            @if (t.developerWorkStatus === 'InProgress') {
              <button type="button" (click)="setDeveloperStatus('OnHold')" [disabled]="actionPending()" class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">Hold</button>
            }
            @if (t.developerWorkStatus === 'OnHold') {
              <button type="button" (click)="setDeveloperStatus('InProgress')" [disabled]="actionPending()" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Resume</button>
            }
            @if (!isDeveloperWorkTerminal(t.developerWorkStatus)) {
              <button type="button" (click)="setDeveloperStatus('Resolved')" [disabled]="actionPending()" class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">My work resolved</button>
              <button type="button" (click)="setDeveloperStatus('Rejected')" [disabled]="actionPending()" class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
              <button type="button" (click)="setDeveloperStatus('Cancelled')" [disabled]="actionPending()" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" (click)="setDeveloperStatus('Closed')" [disabled]="actionPending()" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close my work</button>
            }
          }
          @if (canDeveloperReopen()) {
            <button type="button" (click)="reopenDeveloperWork()" [disabled]="actionPending()" class="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50">Reopen my work</button>
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

          @if (t.tasks; as tasks) {
            <div class="mt-6">
              @if (isOwner()) {
                <app-party-subcomplaints-panel [ticketId]="t.id" [ticketStatus]="t.status" [tasks]="tasks" (changed)="onTaskChanged()" />
              } @else {
                <app-ticket-tasks-panel
                  [ticketId]="t.id"
                  [ticketStatus]="t.status"
                  [tasks]="tasks"
                  [developers]="developers()"
                  [canManage]="isAdmin()"
                  [currentDeveloperId]="developerUserId()"
                  [currentUserId]="authService.currentUser()?.id ?? null"
                  (changed)="onTaskChanged()"
                />
              }
            </div>
          }

          <div class="mt-6 rounded-lg border border-slate-200 bg-white">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
              <h2 class="text-sm font-semibold text-slate-900">Conversation</h2>
              @if (showThreadTabs()) {
                <div class="flex rounded-md border border-slate-200 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    (click)="activeThread.set('Party')"
                    class="rounded px-2.5 py-1"
                    [class]="activeThread() === 'Party' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'"
                  >
                    Party
                  </button>
                  <button
                    type="button"
                    (click)="activeThread.set('Developer')"
                    class="rounded px-2.5 py-1"
                    [class]="activeThread() === 'Developer' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'"
                  >
                    Developer
                  </button>
                </div>
              }
            </div>

            <div class="max-h-[28rem] space-y-4 overflow-y-auto p-4">
              @for (message of visibleMessages(); track message.id) {
                <div class="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-slate-800">{{ message.authorDisplayName }}</span>
                    <span class="text-xs text-slate-400">{{ message.createdAtUtc | date: 'medium' }}</span>
                  </div>
                  @if (message.parentMessageId) {
                    <p class="mt-1 text-xs italic text-slate-400">In reply to: "{{ parentPreview(message.parentMessageId) }}"</p>
                  }
                  @if (message.outcomeStatus; as outcome) {
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="outcomeBadgeClasses[outcome]">{{ outcomeLabels[outcome] }}</span>
                      @if (message.saleAmount != null) {
                        <span class="text-xs font-medium text-fuchsia-700">{{ message.saleAmount }}</span>
                      }
                      @if (message.reassignedToDeveloperDisplayName) {
                        <span class="text-xs text-slate-500">→ reassigned to {{ message.reassignedToDeveloperDisplayName }}</span>
                      }
                    </div>
                  }
                  @if (message.body) {
                    <p class="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{{ message.body }}</p>
                  }
                  @if (canReplyToMessages() && !message.parentMessageId) {
                    <div class="mt-1.5">
                      <button type="button" (click)="startReply(message.id)" class="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                        Reply as sub-complaint
                      </button>
                    </div>
                  }
                  @if (replyTargetMessageId() === message.id) {
                    <div class="mt-2 space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                      <textarea
                        rows="2"
                        [value]="replyBody"
                        (input)="replyBody = $any($event.target).value"
                        placeholder="Your reply…"
                        class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      ></textarea>
                      <div class="flex flex-wrap gap-2">
                        <select
                          [value]="replyOutcomeStatus"
                          (change)="replyOutcomeStatus = $any($event.target).value"
                          class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          @for (option of replyOutcomeOptions(); track option) {
                            <option [value]="option">{{ outcomeLabels[option] }}</option>
                          }
                        </select>
                        @if (isAdmin() && replyOutcomeStatus === 'Sale') {
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            [value]="replySaleAmount"
                            (input)="replySaleAmount = $any($event.target).value"
                            class="w-28 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        }
                        @if (isAdmin()) {
                          <select
                            [value]="replyReassignToDeveloperId"
                            (change)="replyReassignToDeveloperId = $any($event.target).value"
                            class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">Don't reassign</option>
                            @for (developer of developers(); track developer.id) {
                              <option [value]="developer.id">Reassign to {{ developer.displayName }}</option>
                            }
                          </select>
                        }
                      </div>
                      @if (replyError()) {
                        <p class="text-xs text-red-600" role="alert">{{ replyError() }}</p>
                      }
                      <div class="flex justify-end gap-2">
                        <button type="button" (click)="cancelReply()" class="text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button>
                        <button
                          type="button"
                          (click)="sendReply()"
                          [disabled]="replySending() || (!replyBody.trim() && replyOutcomeStatus !== 'Sale') || (replyOutcomeStatus === 'Sale' && !replySaleAmount)"
                          class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {{ replySending() ? 'Sending…' : 'Send reply' }}
                        </button>
                      </div>
                    </div>
                  }
                  @if (message.attachments.length > 0) {
                    <div class="mt-2 flex flex-wrap gap-2">
                      @for (attachment of message.attachments; track attachment.id) {
                        @if (attachment.category === 'Image') {
                          <button type="button" (click)="openImagePreview(message, attachment.id)" class="block">
                            <img [src]="fileUrl(attachment.downloadUrl)" [alt]="attachment.originalFileName" class="h-24 w-24 rounded-md border border-slate-200 object-cover hover:opacity-90" />
                          </button>
                        } @else if (attachment.category === 'Video') {
                          <button type="button" (click)="openVideoPreview(attachment)" class="relative block h-24 w-40 overflow-hidden rounded-md border border-slate-200 bg-black">
                            <video [src]="fileUrl(attachment.downloadUrl)" class="h-full w-full object-cover"></video>
                            <span class="absolute inset-0 flex items-center justify-center text-xl text-white/90">▶</span>
                          </button>
                        } @else {
                          <a
                            [href]="fileUrl(attachment.downloadUrl)"
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
                @if (showThreadTabs()) {
                  <p class="mb-1.5 text-xs text-slate-400">Posting to the {{ activeThread() }} conversation.</p>
                }
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
                <dt class="text-slate-500">Company</dt>
                <dd class="text-right font-medium text-slate-700">{{ t.companyName || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Created by</dt>
                <dd class="text-right font-medium text-slate-700">{{ t.createdByDisplayName }}</dd>
              </div>
              @if (developerUserId() && t.developerWorkStatus) {
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">My work status</dt>
                  <dd class="text-right font-medium text-indigo-700">{{ t.developerWorkStatus }}</dd>
                </div>
              }
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500">Developer</dt>
                <dd class="text-right font-medium text-slate-700">{{ t.assignedDeveloperDisplayName ?? 'Unassigned' }}</dd>
              </div>
              @if (t.tasks) {
                <div class="flex justify-between gap-3 border-t border-slate-100 pt-2.5">
                  <dt class="text-slate-500">Total estimate</dt>
                  <dd class="text-right font-medium text-slate-700">{{ formatDurationFull(totalTaskEstimateMinutes()) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Actual worked</dt>
                  <dd class="text-right font-medium text-emerald-700">{{ formatDurationFull(totalTaskActualWorkedMinutes()) }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-slate-500">Remaining estimate</dt>
                  <dd class="text-right font-medium text-indigo-700">{{ formatDurationFull(totalTaskRemainingMinutes()) }}</dd>
                </div>
                @if (isAdmin()) {
                  <div class="flex justify-between gap-3">
                    <dt class="text-slate-500">Total task amount</dt>
                    <dd class="text-right font-medium text-slate-700">{{ (t.totalTaskAmount ?? 0).toLocaleString() }}</dd>
                  </div>
                }
              }
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

          @if (t.totalSubComplaintSaleAmount != null) {
            <div class="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm">
              <h2 class="text-sm font-semibold text-fuchsia-900">Sub-complaint sales</h2>
              <div class="mt-2 flex justify-between gap-3">
                <dt class="text-fuchsia-700">Total amount</dt>
                <dd class="font-medium text-fuchsia-900">{{ t.totalSubComplaintSaleAmount }}</dd>
              </div>
              <p class="mt-2 text-xs text-fuchsia-700">Sum of every message replied to as a Sale — see each reply above for details.</p>
            </div>
          }

          @if (t.deal; as deal) {
            <div class="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm">
              <h2 class="text-sm font-semibold text-fuchsia-900">Sale</h2>
              <dl class="mt-3 space-y-2.5">
                <div class="flex justify-between gap-3">
                  <dt class="text-fuchsia-700">Estimated amount</dt>
                  <dd class="font-medium text-fuchsia-900">{{ deal.estimatedAmount }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-fuchsia-700">Delivery date</dt>
                  <dd class="font-medium text-fuchsia-900">{{ deal.deliveryDate ? (deal.deliveryDate | date: 'mediumDate') : 'Pending' }}</dd>
                </div>
              </dl>

              @if (isAdmin() && deal.status !== 'Completed') {
                @if (editingDealDate()) {
                  <div class="mt-3 flex items-center gap-2">
                    <input
                      type="date"
                      [value]="dealDeliveryDateInput"
                      (input)="dealDeliveryDateInput = $any($event.target).value"
                      class="min-w-0 flex-1 rounded-md border border-fuchsia-300 bg-white px-2.5 py-1.5 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                    />
                    <button
                      type="button"
                      (click)="saveDealDeliveryDate(deal.id)"
                      [disabled]="!dealDeliveryDateInput || actionPending()"
                      class="rounded-md bg-fuchsia-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button type="button" (click)="editingDealDate.set(false)" class="text-xs font-medium text-fuchsia-700 hover:text-fuchsia-900">Cancel</button>
                  </div>
                } @else {
                  <button
                    type="button"
                    (click)="startEditDealDate(deal)"
                    class="mt-3 rounded-md border border-fuchsia-300 bg-white px-2.5 py-1.5 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100"
                  >
                    {{ deal.deliveryDate ? 'Edit date' : 'Set delivery date' }}
                  </button>
                }
                @if (dealDateError()) {
                  <p class="mt-2 text-xs text-red-600" role="alert">{{ dealDateError() }}</p>
                }
              }

              @if (!deal.deliveryDate) {
                <p class="mt-2 text-xs text-fuchsia-700">A reminder to set the delivery date goes out twice daily until one is set (see docs/modules/sales-deals.md — Module 5).</p>
              } @else if (deal.status !== 'Completed') {
                <p class="mt-2 text-xs text-fuchsia-700">You'll get a reminder one day before this date if it hasn't been marked complete yet.</p>
              }
            </div>
          }
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

      <app-modal [open]="showSaleModal()" (close)="showSaleModal.set(false)">
        <h2 class="text-base font-semibold text-slate-900">Convert to Sale</h2>
        <p class="mt-1 text-sm text-slate-500">This isn't really a complaint — it's a new requirement or additional work. Delivery date is optional; you can add it later.</p>
        <div class="mt-4 space-y-3">
          <div>
            <label for="sale-amount" class="block text-sm font-medium text-slate-700">Estimated amount</label>
            <input
              id="sale-amount"
              type="number"
              min="0"
              step="0.01"
              [value]="saleAmount"
              (input)="saleAmount = $any($event.target).value"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label for="sale-delivery-date" class="block text-sm font-medium text-slate-700">Delivery date (optional)</label>
            <input
              id="sale-delivery-date"
              type="date"
              [value]="saleDeliveryDate"
              (input)="saleDeliveryDate = $any($event.target).value"
              class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        @if (saleError()) {
          <p class="mt-2 text-sm text-red-600" role="alert">{{ saleError() }}</p>
        }
        <div class="mt-4 flex justify-end gap-3">
          <button type="button" (click)="showSaleModal.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            (click)="convertToSale()"
            [disabled]="actionPending() || !saleAmount"
            class="rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {{ actionPending() ? 'Converting…' : 'Convert to Sale' }}
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

      <app-attachment-preview
        [open]="previewOpen()"
        [kind]="previewKind()"
        [items]="previewItems()"
        [startIndex]="previewStartIndex()"
        (closed)="previewOpen.set(false)"
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
  protected readonly outcomeLabels = TICKET_MESSAGE_OUTCOME_LABELS;
  protected readonly outcomeBadgeClasses = TICKET_MESSAGE_OUTCOME_BADGE_CLASSES;
  protected readonly outcomeOptions = OUTCOME_OPTIONS;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ticketsService = inject(TicketsService);
  private readonly dealsService = inject(DealsService);
  private readonly adminService = inject(AdminService);
  protected readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly ticketId = this.route.snapshot.paramMap.get('id')!;

  protected readonly ticket = signal<TicketDto | null>(null);
  protected readonly messages = signal<TicketMessageDto[]>([]);
  protected readonly notFound = signal<string | null>(null);
  protected readonly developers = signal<PersonSummary[]>([]);

  protected readonly showAssignModal = signal(false);
  protected readonly showCloseModal = signal(false);
  protected readonly closeMessage = signal('');
  protected readonly showSaleModal = signal(false);
  protected saleAmount = '';
  protected saleDeliveryDate = '';
  protected readonly saleError = signal<string | null>(null);
  protected readonly editingDealDate = signal(false);
  protected dealDeliveryDateInput = '';
  protected readonly dealDateError = signal<string | null>(null);
  protected readonly showRevokeConfirm = signal(false);
  protected readonly showRecomplainConfirm = signal(false);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly actionPending = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly reopenMessage = signal('');
  protected readonly reopening = signal(false);
  protected readonly reopenError = signal<string | null>(null);

  protected readonly replyTargetMessageId = signal<string | null>(null);
  protected replyBody = '';
  protected replyOutcomeStatus: TicketMessageOutcomeStatus = 'InProgress';
  protected replySaleAmount = '';
  protected replyReassignToDeveloperId = '';
  protected readonly replySending = signal(false);
  protected readonly replyError = signal<string | null>(null);

  protected readonly draftBody = signal('');
  protected readonly draftFiles = signal<File[]>([]);
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  private readonly messagesRefresh = new Subject<void>();
  private readonly composerDropzone = viewChild<FileDropzone>('composerDropzone');

  protected readonly activeThread = signal<TicketMessageAudience>('Party');
  protected readonly previewOpen = signal(false);
  protected readonly previewKind = signal<'image' | 'video'>('image');
  protected readonly previewItems = signal<PreviewItem[]>([]);
  protected readonly previewStartIndex = signal(0);

  /** Attachment downloadUrl fields come from the backend as relative paths, bound directly into <a href>/<img src> — not an HttpClient call, so the auth interceptor never rewrites them. Needs the API's own origin in production (see environment.apiBaseUrl). */
  protected fileUrl(relativeUrl: string): string {
    return environment.apiBaseUrl + relativeUrl;
  }

  /** Admin or Implementator — both manage the complaint workflow, see RoleNames.ComplaintManagers on the backend. */
  protected readonly formatDurationFull = formatDurationFull;
  protected readonly totalTaskEstimateMinutes = computed(() =>
    this.ticket()?.tasks?.reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0) ?? 0,
  );
  protected readonly totalTaskActualWorkedMinutes = computed(() =>
    this.ticket()?.tasks?.reduce((total, task) => total + (task.actualWorkedMinutes ?? 0), 0) ?? 0,
  );
  protected readonly totalTaskRemainingMinutes = computed(() =>
    this.ticket()?.tasks?.reduce((total, task) => total + (task.remainingEstimatedMinutes ?? task.estimatedMinutes ?? 0), 0) ?? 0,
  );

  private readonly liveClockMs = signal(Date.now());
  protected readonly runningWork = computed(() => {
    const tasks = this.ticket()?.tasks ?? [];
    for (const task of tasks) {
      const span = task.workSpans?.find((item) => item.isOpen || item.endedAtUtc == null);
      if (span) return { task, span };
    }
    return null;
  });
  protected readonly runningElapsedSeconds = computed(() => {
    const running = this.runningWork();
    if (!running) return 0;
    const started = Date.parse(running.span.startedAtUtc);
    return Number.isFinite(started) ? Math.max(0, Math.floor((this.liveClockMs() - started) / 1000)) : 0;
  });

  protected readonly isAdmin = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    return roles.includes(ROLE_ADMIN) || roles.includes(ROLE_IMPLEMENTATOR);
  });
  protected readonly replyOutcomeOptions = computed(() => this.isAdmin() ? this.outcomeOptions : this.outcomeOptions.filter((option) => option !== 'Sale'));
  protected readonly isOwner = computed(() => this.authService.currentUser()?.id === this.ticket()?.createdByUserId);
  protected readonly canDeveloperAct = computed(() => {
    const user = this.authService.currentUser();
    const t = this.ticket();
    return !!user && user.roles.includes(ROLE_DEVELOPER) && t?.assignedDeveloperId === user.id && !['Resolved', 'Rejected', 'Closed', 'Revoked', 'Sale'].includes(t.status) && !this.isDeveloperWorkTerminal(t.developerWorkStatus);
  });
  protected readonly canDeveloperReopen = computed(() => {
    const user = this.authService.currentUser();
    const t = this.ticket();
    return !!user
      && user.roles.includes(ROLE_DEVELOPER)
      && t?.assignedDeveloperId === user.id
      && !['Resolved', 'Rejected', 'Closed', 'Revoked', 'Cancelled', 'Sale'].includes(t.status)
      && this.isDeveloperWorkTerminal(t.developerWorkStatus);
  });

  /** Admin or this ticket's assigned Developer, and the ticket isn't Closed/Revoked — mirrors TicketMessageService.PostMessageAsync's own outcome-field permission check. */
  protected readonly canReplyToMessages = computed(() => {
    const t = this.ticket();
    if (!t || t.status === 'Closed' || t.status === 'Revoked') return false;
    return this.isAdmin() || this.canDeveloperAct();
  });

  /** This viewer's own id when they're a Developer — used to gate the Tasks panel's Developer-only actions (a task currently assigned to them). Null for every other role. */
  protected readonly developerUserId = computed(() => {
    const user = this.authService.currentUser();
    return user?.roles.includes(ROLE_DEVELOPER) ? user.id : null;
  });

  /**
   * Party↔Implementator and Developer↔Implementator are separate threads
   * (see TicketMessageDto.audience). Only Admin/Implementator receive both
   * from the backend and need a tab switcher — a Party/Developer viewer's
   * GetMessagesAsync response is already scoped to just their own thread
   * (plus any legacy null-audience message), so no filtering is needed here
   * for them.
   */
  protected readonly showThreadTabs = computed(() => this.isAdmin());
  protected readonly visibleMessages = computed(() => {
    if (!this.showThreadTabs()) return this.messages();
    const thread = this.activeThread();
    return this.messages().filter((m) => m.audience == null || m.audience === thread);
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
    if (roles.includes(ROLE_IMPLEMENTATOR)) return '/app/implementator/tickets';
    if (roles.includes(ROLE_DEVELOPER)) return '/app/developer/board';
    return '/app/user/my-complaints';
  });

  ngOnInit(): void {
    timer(0, 1_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.liveClockMs.set(Date.now()));

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

    if (this.isAdmin()) {
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

  convertToSale(): void {
    const amount = Number(this.saleAmount);
    if (!this.saleAmount || Number.isNaN(amount) || amount < 0) return;

    this.actionPending.set(true);
    this.saleError.set(null);
    this.ticketsService.convertToSale(this.ticketId, amount, this.saleDeliveryDate || null).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.showSaleModal.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.saleError.set(error.error?.error ?? 'Could not convert this ticket to a sale.');
      },
    });
  }

  startEditDealDate(deal: DealSummary): void {
    this.dealDeliveryDateInput = deal.deliveryDate ? deal.deliveryDate.slice(0, 10) : '';
    this.dealDateError.set(null);
    this.editingDealDate.set(true);
  }

  saveDealDeliveryDate(dealId: string): void {
    if (!this.dealDeliveryDateInput || this.actionPending()) return;

    this.actionPending.set(true);
    this.dealDateError.set(null);
    this.dealsService.setDeliveryDate(dealId, this.dealDeliveryDateInput).subscribe({
      next: () => {
        this.actionPending.set(false);
        this.editingDealDate.set(false);
        this.ticketsService.getById(this.ticketId).subscribe((ticket) => this.ticket.set(ticket));
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.dealDateError.set(error.error?.error ?? 'Could not set the delivery date.');
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

  protected isDeveloperWorkTerminal(status: DeveloperWorkStatus | null | undefined): boolean {
    return status === 'Resolved' || status === 'Rejected' || status === 'Cancelled' || status === 'Closed';
  }

  protected formatElapsedSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  }

  setDeveloperStatus(status: DeveloperWorkStatus): void {
    let reason: string | undefined;
    if (this.isDeveloperWorkTerminal(status)) {
      const entered = window.prompt(`Reason for ${status.toLowerCase()} (required):`, '');
      if (entered == null) return;
      reason = entered.trim();
      if (!reason) { this.actionError.set('A reason is required for a final developer work status.'); return; }
    }
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.updateStatus(this.ticketId, status, reason).subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.messagesRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update your work status.');
      },
    });
  }

  reopenDeveloperWork(): void {
    const entered = window.prompt('Reason for reopening your work (optional):', '');
    if (entered == null) return;
    this.actionPending.set(true);
    this.actionError.set(null);
    this.ticketsService.updateStatus(this.ticketId, 'Assigned', entered.trim() || 'Reopened by developer').subscribe({
      next: (ticket) => {
        this.actionPending.set(false);
        this.ticket.set(ticket);
        this.messagesRefresh.next();
      },
      error: (error: HttpErrorResponse) => {
        this.actionPending.set(false);
        this.actionError.set(error.error?.error ?? 'Could not reopen your work.');
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
    this.ticketsService.postMessage(this.ticketId, body, files, undefined, this.showThreadTabs() ? this.activeThread() : undefined).subscribe({
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

  protected parentPreview(parentMessageId: string): string {
    const parent = this.messages().find((m) => m.id === parentMessageId);
    if (!parent) return '';
    return parent.body.length > 80 ? `${parent.body.slice(0, 80)}…` : parent.body;
  }

  startReply(messageId: string): void {
    this.replyTargetMessageId.set(messageId);
    this.replyBody = '';
    this.replyOutcomeStatus = 'InProgress';
    this.replySaleAmount = '';
    this.replyReassignToDeveloperId = '';
    this.replyError.set(null);
  }

  cancelReply(): void {
    this.replyTargetMessageId.set(null);
  }

  sendReply(): void {
    const parentMessageId = this.replyTargetMessageId();
    if (!parentMessageId || this.replySending()) return;
    if (this.replyOutcomeStatus === 'Sale' && !this.replySaleAmount) return;

    this.replySending.set(true);
    this.replyError.set(null);
    this.ticketsService
      .postMessage(this.ticketId, this.replyBody.trim(), [], {
        parentMessageId,
        outcomeStatus: this.replyOutcomeStatus,
        saleAmount: this.replyOutcomeStatus === 'Sale' ? Number(this.replySaleAmount) : undefined,
        reassignedToDeveloperId: this.replyReassignToDeveloperId || undefined,
      })
      .subscribe({
        next: () => {
          this.replySending.set(false);
          this.replyTargetMessageId.set(null);
          this.messagesRefresh.next();
          // A reassignment changes the ticket's own AssignedDeveloperId — refresh it too.
          this.ticketsService.getById(this.ticketId).subscribe((ticket) => this.ticket.set(ticket));
        },
        error: (error: HttpErrorResponse) => {
          this.replySending.set(false);
          this.replyError.set(error.error?.error ?? 'Could not send this reply.');
        },
      });
  }

  protected iconFor(category: string): string {
    if (category === 'Archive') return '🗜️';
    if (category === 'Video') return '🎞️';
    return '📎';
  }

  /** A task mutation may have changed the derived Ticket.Status — refetch immediately rather than waiting for the next poll tick. */
  protected onTaskChanged(): void {
    this.ticketsService.getById(this.ticketId).subscribe((ticket) => this.ticket.set(ticket));
  }

  /** Every Image attachment in the same message becomes the gallery, opened at the clicked one. */
  protected openImagePreview(message: TicketMessageDto, attachmentId: string): void {
    const images = message.attachments.filter((a) => a.category === 'Image');
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
}
