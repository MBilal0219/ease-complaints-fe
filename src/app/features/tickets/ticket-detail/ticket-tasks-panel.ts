import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { PersonSummary } from '../../../core/admin/models';
import {
  ACTIVE_TASK_STATUSES,
  ESTIMATE_UNITS,
  EstimateUnit,
  DeveloperWorkStatus,
  TICKET_TASK_STATUS_BADGE_CLASSES,
  TICKET_TASK_STATUS_LABELS,
  TicketAttachmentDto,
  TicketStatus,
  TicketTaskDto,
  TicketTaskStatus,
  formatDuration,
  formatDurationFull,
} from '../../../core/tickets/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { AttachmentPreview, PreviewItem } from '../../../shared/ui/attachment-preview/attachment-preview';
import { FileDropzone } from '../../../shared/ui/file-dropzone/file-dropzone';
import { Modal } from '../../../shared/ui/modal/modal';

type TaskAction = 'edit' | 'assign' | 'status' | 'reject' | 'resolve' | 'cancel' | 'close' | 'sale' | 'reopen' | 'estimate' | 'amount';

/**
 * The complaint's subcomplaints/tasks — see Entities/TicketTask.cs on the
 * backend. Every subcomplaint is Party-authored (see PartySubComplaintsPanel)
 * or Implementator/Admin-authored (Add Task here); this panel is where
 * Admin/Implementator/Developer triage them — assign, resolve, reject,
 * cancel, or mark as a Sale, each with a required reason and optional
 * attachments recorded as a reply/activity entry against the original
 * submission (never a replacement of it). Not shown to a Party (TicketDto.
 * tasks is redacted, not nulled, for them — see TicketDtoExtensions.
 * MaskForParty and PartySubComplaintsPanel, which they see instead).
 */
@Component({
  selector: 'app-ticket-tasks-panel',
  imports: [DecimalPipe, DatePipe, NgTemplateOutlet, Modal, FileDropzone, AttachmentPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">Tasks ({{ tasks().length }})</h2>
          <p class="mt-1 text-xs text-slate-500">
            Total estimate: <span class="font-semibold text-slate-700">{{ formatDurationFull(totalEstimatedMinutes()) }}</span>
            @if (canManage()) {
              <span class="mx-1.5 text-slate-300">·</span>
              Total amount: <span class="font-semibold text-slate-700">{{ totalAmount() | number: '1.0-2' }}</span>
            }
          </p>
        </div>
        @if (canManage() && ticketStatus() !== 'Closed' && ticketStatus() !== 'Revoked') {
          <button
            type="button"
            (click)="showAddTask.set(true)"
            class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add Task
          </button>
        }
      </div>

      <div class="divide-y divide-slate-100">
        @for (task of tasks(); track task.id) {
          <div class="p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono text-slate-400">#{{ task.sequenceNumber }}</span>
                <span class="rounded-full px-2 py-0.5 text-xs font-medium" [class]="statusBadgeClasses[task.status]">
                  {{ statusLabels[task.status] }}
                </span>
                @if (task.developerWorkStatus && canDeveloperSeeOwnStatus(task)) {
                  <span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">My status: {{ task.developerWorkStatus }}</span>
                }
              </div>

              @if (canManage() || canDeveloperActOn(task) || canDeveloperReopen(task)) {
                <div class="relative" data-actions-menu>
                  <button
                    type="button"
                    (click)="toggleMenu(task)"
                    class="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Actions
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3 w-3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  @if (menuOpenTaskId() === task.id) {
                    <div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                      @if (canManage()) {
                        @if (task.status !== 'Resolved' && task.status !== 'Rejected' && task.status !== 'Cancelled' && task.status !== 'Sale') {
                          <button type="button" (click)="menuAction(task, 'edit')" class="block w-full px-3 py-1.5 text-left text-sm font-medium text-indigo-700 hover:bg-slate-50">Edit task</button>
                        }
                        @if (task.status !== 'Rejected' && task.status !== 'Cancelled' && task.status !== 'Sale') {
                          <button type="button" (click)="menuAction(task, 'assign')" class="block w-full px-3 py-1.5 text-left text-sm text-indigo-600 hover:bg-slate-50">
                            {{ task.currentDeveloperId ? 'Reassign' : 'Assign' }}
                          </button>
                          <button type="button" (click)="menuAction(task, 'status')" class="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">Change status</button>
                          <div class="my-1 border-t border-slate-100"></div>
                          <button type="button" (click)="menuAction(task, 'resolve')" class="block w-full px-3 py-1.5 text-left text-sm text-green-600 hover:bg-slate-50">Resolve</button>
                          <button type="button" (click)="menuAction(task, 'reject')" class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-slate-50">Reject</button>
                          <button type="button" (click)="menuAction(task, 'cancel')" class="block w-full px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button type="button" (click)="menuAction(task, 'sale')" class="block w-full px-3 py-1.5 text-left text-sm text-fuchsia-600 hover:bg-slate-50">Add as Sale</button>
                          <div class="my-1 border-t border-slate-100"></div>
                        }
                        @if (task.status === 'Resolved' || task.status === 'Rejected' || task.status === 'Cancelled' || task.status === 'Sale') {
                          <button type="button" (click)="menuAction(task, 'reopen')" class="block w-full px-3 py-1.5 text-left text-sm text-sky-600 hover:bg-slate-50">Reopen</button>
                          <div class="my-1 border-t border-slate-100"></div>
                        }
                        @if (task.status !== 'Resolved' && task.status !== 'Rejected' && task.status !== 'Cancelled' && task.status !== 'Sale') {
                          <button type="button" (click)="menuAction(task, 'estimate')" class="block w-full px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50">Set estimate</button>
                          <button type="button" (click)="menuAction(task, 'amount')" class="block w-full px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50">Set amount</button>
                        }
                      }
                      @if (canDeveloperActOn(task)) {
                        @if (!task.developerWorkStatus || task.developerWorkStatus === 'Assigned') {
                          <button type="button" (click)="closeMenu(); developerSetStatus(task, 'InProgress')" class="block w-full px-3 py-1.5 text-left text-sm text-indigo-600 hover:bg-slate-50">Start progress</button>
                        }
                        @if (task.developerWorkStatus === 'InProgress') {
                          <button type="button" (click)="closeMenu(); developerSetStatus(task, 'OnHold')" class="block w-full px-3 py-1.5 text-left text-sm text-yellow-700 hover:bg-slate-50">Hold</button>
                        }
                        @if (task.developerWorkStatus === 'OnHold') {
                          <button type="button" (click)="closeMenu(); developerSetStatus(task, 'InProgress')" class="block w-full px-3 py-1.5 text-left text-sm text-indigo-600 hover:bg-slate-50">Resume</button>
                        }
                        @if (!isDeveloperWorkTerminal(task.developerWorkStatus)) {
                          <div class="my-1 border-t border-slate-100"></div>
                          <button type="button" (click)="menuAction(task, 'resolve')" class="block w-full px-3 py-1.5 text-left text-sm text-green-600 hover:bg-slate-50">Mark resolved</button>
                          <button type="button" (click)="menuAction(task, 'reject')" class="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-slate-50">Reject</button>
                          <button type="button" (click)="menuAction(task, 'cancel')" class="block w-full px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button type="button" (click)="menuAction(task, 'close')" class="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">Close my work</button>
                        }
                      }
                      @if (canDeveloperReopen(task)) {
                        <button type="button" (click)="developerReopen(task)" class="block w-full px-3 py-1.5 text-left text-sm font-medium text-sky-700 hover:bg-sky-50">Reopen my work</button>
                      }
                    </div>
                  }
                </div>
              }
            </div>

            @if (task.title) {
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ task.title }}</p>
            }
            <p class="mt-1 whitespace-pre-wrap text-sm text-slate-600">{{ task.description }}</p>

            @if (task.attachments.length > 0) {
              <div class="mt-2 flex flex-wrap gap-2">
                @for (attachment of task.attachments; track attachment.id) {
                  <ng-container [ngTemplateOutlet]="attachmentChip" [ngTemplateOutletContext]="{ $implicit: attachment, siblings: task.attachments }" />
                }
              </div>
            }

            <p class="mt-2 text-xs text-slate-500">
              Developer: <span class="font-medium text-slate-700">{{ task.currentDeveloperDisplayName ?? 'Unassigned' }}</span>
              <span class="mx-1.5 text-slate-300">·</span>
              Estimate: <span class="font-medium text-slate-700">{{ formatDuration(task.estimatedMinutes) }}</span>
              @if (canManage()) {
                <span class="mx-1.5 text-slate-300">·</span>
                Amount: <span class="font-medium text-slate-700">{{ (task.amount ?? 0) | number: '1.0-2' }}</span>
              }
              <span class="mx-1.5 text-slate-300">·</span>
              Worked: <span class="font-medium text-emerald-700">{{ formatDuration(task.actualWorkedMinutes) }}</span>
              <span class="mx-1.5 text-slate-300">·</span>
              Remaining: <span class="font-medium text-indigo-700">{{ formatDuration(task.remainingEstimatedMinutes) }}</span>
              @if (task.assignmentCount > 0) {
                <span class="mx-1.5 text-slate-300">·</span>
                Assigned {{ task.assignmentCount }}×
              }
            </p>

            @if (task.workSpans.length > 0) {
              <details class="mt-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <summary class="cursor-pointer text-xs font-medium text-slate-600">Work history ({{ task.workSpans.length }}) · Total {{ formatDuration(task.actualWorkedMinutes) }}</summary>
                <div class="mt-2 space-y-1.5">
                  @for (span of task.workSpans; track span.id) {
                    <div class="text-xs text-slate-500">
                      <span class="font-medium text-slate-700">{{ span.startedAtUtc | date: 'medium' }}</span>
                      → <span>{{ span.endedAtUtc ? (span.endedAtUtc | date: 'medium') : 'Running' }}</span>
                      <span class="ml-1 font-semibold text-indigo-700">{{ formatDuration(span.durationMinutes) }}</span>
                      @if (span.endReason) { <span class="ml-1 text-slate-400">· {{ span.endReason }}</span> }
                    </div>
                  }
                </div>
              </details>
            }

            @if (visibleActivity(task).length > 0) {
              <div class="mt-3 rounded-md bg-slate-50 p-2.5">
                <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Activity</p>
                <div class="space-y-1.5 border-l-2 border-slate-200 pl-3">
                  @for (entry of visibleActivity(task); track entry.id) {
                    <div class="text-xs">
                      <span class="rounded-full px-1.5 py-0.5 font-medium" [class]="statusBadgeClasses[entry.toStatus]">{{ statusLabels[entry.toStatus] }}</span>
                      <span class="ml-1.5 text-slate-500">
                        {{ actorLabel(entry) }} · {{ entry.changedAtUtc | date: 'medium' }}
                      </span>
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
              </div>
            }

            @if (activeTaskId() === task.id && activeAction(); as action) {
              <div class="mt-3 space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                @switch (action) {
                  @case ('edit') {
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div class="sm:col-span-2">
                        <label class="block text-xs font-medium text-slate-700">Title <span class="text-slate-400">(optional)</span></label>
                        <input type="text" [value]="editTitle()" (input)="editTitle.set($any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <div class="sm:col-span-2">
                        <label class="block text-xs font-medium text-slate-700">Description</label>
                        <textarea rows="3" [value]="editDescription()" (input)="editDescription.set($any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-slate-700">Estimated time <span class="text-red-500">*</span></label>
                        <div class="mt-1 flex gap-2">
                          <input type="number" min="1" [value]="estimateValue()" (input)="estimateValue.set($any($event.target).value)" class="w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                          <select [value]="estimateUnit()" (change)="estimateUnit.set($any($event.target).value)" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
                            @for (unit of estimateUnits; track unit) { <option [value]="unit">{{ unit }}</option> }
                          </select>
                        </div>
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-slate-700">Amount</label>
                        <input type="number" min="0" step="0.01" [value]="amountInput()" (input)="amountInput.set($any($event.target).value)" class="mt-1 w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                      </div>
                    </div>
                    <button type="button" (click)="saveTaskEdit(task)" [disabled]="busy() || editDescription().trim().length < 3 || !isPositiveNumber(estimateValue())" class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">Save task</button>
                  }
                  @case ('assign') {
                    <p class="text-xs font-medium text-slate-700">Assign to:</p>
                    <div class="max-h-40 space-y-1 overflow-y-auto">
                      @for (developer of developers(); track developer.id) {
                        <button
                          type="button"
                          (click)="assign(task, developer.id)"
                          [disabled]="busy()"
                          class="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          <span class="font-medium text-slate-800">{{ developer.displayName }}</span>
                          <span class="text-slate-400">{{ developer.openTicketCount }} open</span>
                        </button>
                      } @empty {
                        <p class="p-2 text-center text-xs text-slate-400">No developers available.</p>
                      }
                    </div>
                  }
                  @case ('status') {
                    <div class="flex flex-wrap gap-2">
                      @for (option of statusOptionsFor(task); track option) {
                        <button
                          type="button"
                          (click)="setStatus(task, option)"
                          [disabled]="busy()"
                          class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {{ statusLabels[option] }}
                        </button>
                      }
                    </div>
                  }
                  @case ('resolve') {
                    <label class="block text-xs font-medium text-slate-700">How was this resolved? (required)</label>
                    <textarea rows="2" [value]="reasonInput()" (input)="reasonInput.set($any($event.target).value)" class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                    <app-file-dropzone (filesChange)="actionFiles.set($event)" [maxFiles]="10" />
                    <button
                      type="button"
                      (click)="isDeveloperReject(task) ? developerSetStatusWithReason(task, 'Resolved') : setStatus(task, 'Resolved')"
                      [disabled]="busy() || !reasonInput().trim()"
                      class="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
                    >
                      Confirm resolved
                    </button>
                  }
                  @case ('reject') {
                    <label class="block text-xs font-medium text-slate-700">Reason for rejecting (required)</label>
                    <textarea rows="2" [value]="reasonInput()" (input)="reasonInput.set($any($event.target).value)" class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                    <app-file-dropzone (filesChange)="actionFiles.set($event)" [maxFiles]="10" />
                    <button
                      type="button"
                      (click)="isDeveloperReject(task) ? developerSetStatusWithReason(task, 'Rejected') : setStatus(task, 'Rejected')"
                      [disabled]="busy() || !reasonInput().trim()"
                      class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      Confirm reject
                    </button>
                  }
                  @case ('cancel') {
                    <label class="block text-xs font-medium text-slate-700">Reason for cancelling (required)</label>
                    <textarea rows="2" [value]="reasonInput()" (input)="reasonInput.set($any($event.target).value)" class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                    <app-file-dropzone (filesChange)="actionFiles.set($event)" [maxFiles]="10" />
                    <button
                      type="button"
                      (click)="isDeveloperReject(task) ? developerSetStatusWithReason(task, 'Cancelled') : setStatus(task, 'Cancelled')"
                      [disabled]="busy() || !reasonInput().trim()"
                      class="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                    >
                      Confirm cancel
                    </button>
                  }
                  @case ('close') {
                    <label class="block text-xs font-medium text-slate-700">Closing note (required)</label>
                    <textarea rows="2" [value]="reasonInput()" (input)="reasonInput.set($any($event.target).value)" class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                    <app-file-dropzone (filesChange)="actionFiles.set($event)" [maxFiles]="10" />
                    <button type="button" (click)="developerSetStatusWithReason(task, 'Closed')" [disabled]="busy() || !reasonInput().trim()" class="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50">Confirm closed</button>
                  }
                  @case ('sale') {
                    <label class="block text-xs font-medium text-slate-700">Amount (required)</label>
                    <input type="number" min="0" step="0.01" [value]="saleAmountInput()" (input)="saleAmountInput.set($any($event.target).value)" class="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <label class="block text-xs font-medium text-slate-700">Description (required)</label>
                    <textarea rows="2" [value]="reasonInput()" (input)="reasonInput.set($any($event.target).value)" placeholder="e.g. New feature, quoted and approved." class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                    <app-file-dropzone (filesChange)="actionFiles.set($event)" [maxFiles]="10" />
                    <button
                      type="button"
                      (click)="markAsSale(task)"
                      [disabled]="busy() || !saleAmountInput() || !reasonInput().trim()"
                      class="rounded-md bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
                    >
                      Confirm sale
                    </button>
                  }
                  @case ('reopen') {
                    <label class="block text-xs font-medium text-slate-700">Why is this being reopened? (required)</label>
                    <textarea rows="2" [value]="reasonInput()" (input)="reasonInput.set($any($event.target).value)" class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
                    <button
                      type="button"
                      (click)="reopen(task)"
                      [disabled]="busy() || reasonInput().trim().length < 3"
                      class="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Confirm reopen
                    </button>
                  }
                  @case ('estimate') {
                    <div class="flex flex-wrap items-end gap-2">
                      <div>
                        <label class="block text-xs font-medium text-slate-700">Value</label>
                        <input type="number" min="0" [value]="estimateValue()" (input)="estimateValue.set($any($event.target).value)" class="w-24 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-slate-700">Unit</label>
                        <select [value]="estimateUnit()" (change)="estimateUnit.set($any($event.target).value)" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                          @for (unit of estimateUnits; track unit) {
                            <option [value]="unit">{{ unit }}</option>
                          }
                        </select>
                      </div>
                      <button type="button" (click)="saveEstimate(task)" [disabled]="busy() || !estimateValue()" class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                        Save
                      </button>
                    </div>
                  }
                  @case ('amount') {
                    <div class="flex flex-wrap items-end gap-2">
                      <div>
                        <label class="block text-xs font-medium text-slate-700">Amount</label>
                        <input type="number" min="0" step="0.01" [value]="amountInput()" (input)="amountInput.set($any($event.target).value)" class="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <button type="button" (click)="saveAmount(task)" [disabled]="busy()" class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                        Save
                      </button>
                    </div>
                  }
                }
                @if (actionError()) {
                  <p class="text-xs text-red-600" role="alert">{{ actionError() }}</p>
                }
                <div class="flex justify-end">
                  <button type="button" (click)="closeAction()" class="text-xs font-medium text-slate-500 hover:text-slate-700">Close</button>
                </div>
              </div>
            }
          </div>
        } @empty {
          <p class="p-6 text-center text-sm text-slate-400">No tasks yet.</p>
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

    <app-modal [open]="showAddTask()" (close)="showAddTask.set(false)">
      <h2 class="text-base font-semibold text-slate-900">Add a task</h2>
      <div class="mt-4 space-y-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">Title <span class="text-slate-400">(optional)</span></label>
          <input type="text" [value]="newTaskTitle()" (input)="newTaskTitle.set($any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Description</label>
          <textarea rows="3" [value]="newTaskDescription()" (input)="newTaskDescription.set($any($event.target).value)" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"></textarea>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label class="block text-sm font-medium text-slate-700">Estimate <span class="text-red-500">*</span></label>
            <input type="number" min="1" [value]="newTaskEstimateValue()" (input)="newTaskEstimateValue.set($any($event.target).value)" class="mt-1 w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <select [value]="newTaskEstimateUnit()" (change)="newTaskEstimateUnit.set($any($event.target).value)" class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            @for (unit of estimateUnits; track unit) {
              <option [value]="unit">{{ unit }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">Amount <span class="text-slate-400">(optional)</span></label>
          <input type="number" min="0" step="0.01" [value]="newTaskAmount()" (input)="newTaskAmount.set($any($event.target).value)" class="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <app-file-dropzone (filesChange)="newTaskFiles.set($event)" [maxFiles]="10" />
      </div>
      @if (addTaskError()) {
        <p class="mt-2 text-sm text-red-600" role="alert">{{ addTaskError() }}</p>
      }
      <div class="mt-4 flex justify-end gap-3">
        <button type="button" (click)="showAddTask.set(false)" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button
          type="button"
          (click)="addTask()"
          [disabled]="busy() || newTaskDescription().trim().length < 3 || !isPositiveNumber(newTaskEstimateValue())"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {{ busy() ? 'Adding…' : 'Add task' }}
        </button>
      </div>
    </app-modal>

    <app-attachment-preview [open]="previewOpen()" [kind]="previewKind()" [items]="previewItems()" [startIndex]="previewStartIndex()" (closed)="previewOpen.set(false)" />
  `,
})
export class TicketTasksPanel {
  readonly ticketId = input.required<string>();
  readonly ticketStatus = input.required<TicketStatus>();
  readonly tasks = input.required<TicketTaskDto[]>();
  readonly developers = input.required<PersonSummary[]>();
  readonly canManage = input.required<boolean>();
  readonly currentDeveloperId = input<string | null>(null);
  readonly currentUserId = input<string | null>(null);
  readonly changed = output<void>();

  private readonly ticketsService = inject(TicketsService);

  protected readonly statusLabels = TICKET_TASK_STATUS_LABELS;
  protected readonly statusBadgeClasses = TICKET_TASK_STATUS_BADGE_CLASSES;
  protected readonly estimateUnits = ESTIMATE_UNITS;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDurationFull = formatDurationFull;
  protected readonly totalEstimatedMinutes = computed(() => this.tasks().reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0));
  protected readonly totalAmount = computed(() => this.tasks().reduce((total, task) => total + (task.amount ?? 0), 0));

  protected readonly menuOpenTaskId = signal<string | null>(null);

  protected readonly activeTaskId = signal<string | null>(null);
  protected readonly activeAction = signal<TaskAction | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly reasonInput = signal('');
  protected readonly saleAmountInput = signal('');
  protected readonly actionFiles = signal<File[]>([]);
  protected readonly estimateValue = signal('');
  protected readonly estimateUnit = signal<EstimateUnit>('Hours');
  protected readonly amountInput = signal('');
  protected readonly editTitle = signal('');
  protected readonly editDescription = signal('');

  protected readonly showAddTask = signal(false);
  protected readonly newTaskTitle = signal('');
  protected readonly newTaskDescription = signal('');
  protected readonly newTaskEstimateValue = signal('');
  protected readonly newTaskEstimateUnit = signal<EstimateUnit>('Hours');
  protected readonly newTaskAmount = signal('');
  protected readonly newTaskFiles = signal<File[]>([]);
  protected readonly addTaskError = signal<string | null>(null);

  protected readonly previewOpen = signal(false);
  protected readonly previewKind = signal<'image' | 'video'>('image');
  protected readonly previewItems = signal<PreviewItem[]>([]);
  protected readonly previewStartIndex = signal(0);

  /** Attachment downloadUrl fields are relative paths bound directly into <img src>/<a href> — needs the API's own origin in production. */
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

  /** Skips the very first "created" entry (no reason, nothing to show) — every real triage action after that is shown. */
  protected visibleActivity(task: TicketTaskDto) {
    return task.activity.filter((a) => a.reason != null || a.attachments.length > 0 || a.fromStatus != null);
  }

  protected actorLabel(entry: TicketTaskDto['activity'][number]): string {
    if (entry.changedByUserId == null) return entry.changedByRole; // redacted for a Party viewer
    if (entry.changedByUserId === this.currentUserId()) return 'you';
    return entry.changedByDisplayName ?? entry.changedByRole;
  }

  protected canDeveloperActOn(task: TicketTaskDto): boolean {
    const devId = this.currentDeveloperId();
    const businessTerminal = ['Resolved', 'Rejected', 'Cancelled', 'Sale'].includes(task.status);
    const ticketTerminal = ['Resolved', 'Rejected', 'Closed', 'Revoked', 'Sale'].includes(this.ticketStatus());
    return !!devId && task.currentDeveloperId === devId && !businessTerminal && !ticketTerminal && !this.isDeveloperWorkTerminal(task.developerWorkStatus);
  }

  protected canDeveloperReopen(task: TicketTaskDto): boolean {
    const devId = this.currentDeveloperId();
    const businessTerminal = ['Resolved', 'Rejected', 'Cancelled', 'Sale'].includes(task.status);
    const ticketTerminal = ['Resolved', 'Rejected', 'Closed', 'Revoked', 'Cancelled', 'Sale'].includes(this.ticketStatus());
    return !!devId
      && task.currentDeveloperId === devId
      && !businessTerminal
      && !ticketTerminal
      && this.isDeveloperWorkTerminal(task.developerWorkStatus);
  }

  protected canDeveloperSeeOwnStatus(task: TicketTaskDto): boolean {
    return !!this.currentDeveloperId() && task.currentDeveloperId === this.currentDeveloperId();
  }

  protected isDeveloperWorkTerminal(status: DeveloperWorkStatus | null | undefined): boolean {
    return status === 'Resolved' || status === 'Rejected' || status === 'Cancelled' || status === 'Closed';
  }

  protected isDeveloperReject(task: TicketTaskDto): boolean {
    return !this.canManage() && this.canDeveloperActOn(task);
  }

  protected statusOptionsFor(task: TicketTaskDto): TicketTaskStatus[] {
    // Resolved/Rejected/Cancelled/Sale all go through their own reason-required flow above — this is just the quick, no-reason transitions.
    const all: TicketTaskStatus[] = ['Pending', 'Assigned', 'InProgress', 'OnHold'];
    return all.filter((s) => s !== task.status && (s !== 'Assigned' || task.currentDeveloperId));
  }

  toggleMenu(task: TicketTaskDto): void {
    this.menuOpenTaskId.update((id) => (id === task.id ? null : task.id));
  }

  closeMenu(): void {
    this.menuOpenTaskId.set(null);
  }

  /** Every dropdown item opens the same reason/quick-picker panel the old flat button row did — the menu just declutters how you get there. */
  menuAction(task: TicketTaskDto, action: TaskAction): void {
    this.closeMenu();
    this.openAction(task, action);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuOpenTaskId() && !(event.target as HTMLElement).closest('[data-actions-menu]')) {
      this.closeMenu();
    }
  }

  openAction(task: TicketTaskDto, action: TaskAction): void {
    this.activeTaskId.set(task.id);
    this.activeAction.set(action);
    this.actionError.set(null);
    this.reasonInput.set('');
    this.saleAmountInput.set('');
    this.actionFiles.set([]);
    this.estimateValue.set(task.estimatedMinutes != null ? String(task.estimatedMinutes) : '');
    this.estimateUnit.set('Minutes');
    this.amountInput.set(task.amount != null ? String(task.amount) : '');
    this.editTitle.set(task.title ?? '');
    this.editDescription.set(task.description);
  }

  closeAction(): void {
    this.activeTaskId.set(null);
    this.activeAction.set(null);
  }

  private runMutation(request: () => ReturnType<TicketsService['assignTask']>): void {
    this.busy.set(true);
    this.actionError.set(null);
    request().subscribe({
      next: () => {
        this.busy.set(false);
        this.closeAction();
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.actionError.set(error.error?.error ?? 'Could not complete this action.');
      },
    });
  }

  assign(task: TicketTaskDto, developerId: string): void {
    this.runMutation(() => this.ticketsService.assignTask(this.ticketId(), task.id, developerId));
  }

  setStatus(task: TicketTaskDto, status: TicketTaskStatus): void {
    this.runMutation(() => this.ticketsService.updateTaskStatusAsAdmin(this.ticketId(), task.id, status, this.reasonInput().trim() || undefined, this.actionFiles()));
  }

  developerSetStatus(task: TicketTaskDto, status: DeveloperWorkStatus): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.ticketsService.updateTaskStatusAsDeveloper(this.ticketId(), task.id, status).subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update this task.');
      },
    });
  }

  developerReopen(task: TicketTaskDto): void {
    this.closeMenu();
    const entered = window.prompt('Reason for reopening your work (optional):', '');
    if (entered == null) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.ticketsService.updateTaskStatusAsDeveloper(this.ticketId(), task.id, 'Assigned', entered.trim() || 'Reopened by developer').subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.actionError.set(error.error?.error ?? 'Could not reopen this task.');
      },
    });
  }

  /** Developer's own Resolve/Reject — both now go through the reason-required panel. */
  developerSetStatusWithReason(task: TicketTaskDto, status: DeveloperWorkStatus): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.ticketsService.updateTaskStatusAsDeveloper(this.ticketId(), task.id, status, this.reasonInput().trim(), this.actionFiles()).subscribe({
      next: () => {
        this.busy.set(false);
        this.closeAction();
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.actionError.set(error.error?.error ?? 'Could not update this task.');
      },
    });
  }

  markAsSale(task: TicketTaskDto): void {
    const amount = Number(this.saleAmountInput());
    if (!this.saleAmountInput() || Number.isNaN(amount) || amount <= 0 || !this.reasonInput().trim()) return;
    this.runMutation(() =>
      this.ticketsService.markTaskAsSale(this.ticketId(), task.id, {
        amount,
        description: this.reasonInput().trim(),
        files: this.actionFiles(),
      }),
    );
  }

  reopen(task: TicketTaskDto): void {
    this.runMutation(() => this.ticketsService.reopenTask(this.ticketId(), task.id, this.reasonInput().trim()));
  }

  isPositiveNumber(value: string): boolean {
    const parsed = Number(value);
    return value.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;
  }

  saveTaskEdit(task: TicketTaskDto): void {
    const description = this.editDescription().trim();
    const estimateValue = Number(this.estimateValue());
    const rawAmount = this.amountInput().trim();
    const amount = rawAmount ? Number(rawAmount) : null;
    if (description.length < 3 || !Number.isFinite(estimateValue) || estimateValue <= 0 || (amount != null && (!Number.isFinite(amount) || amount < 0))) return;
    this.runMutation(() =>
      this.ticketsService.updateTask(this.ticketId(), task.id, {
        title: this.editTitle().trim() || undefined,
        description,
        estimateValue,
        estimateUnit: this.estimateUnit(),
        amount,
      }),
    );
  }

  saveEstimate(task: TicketTaskDto): void {
    const value = Number(this.estimateValue());
    if (!this.estimateValue() || Number.isNaN(value) || value <= 0) return;
    this.runMutation(() => this.ticketsService.setTaskEstimate(this.ticketId(), task.id, value, this.estimateUnit()));
  }

  saveAmount(task: TicketTaskDto): void {
    const raw = this.amountInput().trim();
    const amount = raw ? Number(raw) : null;
    if (raw && Number.isNaN(amount)) return;
    this.runMutation(() => this.ticketsService.setTaskAmount(this.ticketId(), task.id, amount));
  }

  addTask(): void {
    const description = this.newTaskDescription().trim();
    if (description.length < 3 || this.busy()) return;

    const estimateValue = Number(this.newTaskEstimateValue());
    const rawAmount = this.newTaskAmount().trim();
    const amount = rawAmount ? Number(rawAmount) : undefined;
    if (!Number.isFinite(estimateValue) || estimateValue <= 0 || (amount != null && (!Number.isFinite(amount) || amount < 0))) return;
    this.busy.set(true);
    this.addTaskError.set(null);
    this.ticketsService
      .addTask(this.ticketId(), {
        title: this.newTaskTitle().trim() || undefined,
        description,
        estimateValue,
        estimateUnit: this.newTaskEstimateUnit(),
        amount,
        files: this.newTaskFiles(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.showAddTask.set(false);
          this.newTaskTitle.set('');
          this.newTaskDescription.set('');
          this.newTaskEstimateValue.set('');
          this.newTaskAmount.set('');
          this.newTaskFiles.set([]);
          this.changed.emit();
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set(false);
          this.addTaskError.set(error.error?.error ?? 'Could not add this task.');
        },
      });
  }
}
