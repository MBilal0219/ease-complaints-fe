import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { TicketLookups } from '../../../core/tickets/models';
import { FileDropzone } from '../../../shared/ui/file-dropzone/file-dropzone';

@Component({
  selector: 'app-new-complaint',
  imports: [ReactiveFormsModule, FileDropzone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl">
      <h1 class="text-lg font-semibold text-slate-900">New complaint</h1>
      <p class="mt-1 text-sm text-slate-500">Tell us what's wrong — an Admin will assign it to a developer.</p>

      <form class="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label for="title" class="block text-sm font-medium text-slate-700">Title</label>
          <input
            id="title"
            type="text"
            formControlName="title"
            placeholder="Short summary of the issue"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="category" class="block text-sm font-medium text-slate-700">Category</label>
            <select
              id="category"
              formControlName="categoryId"
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option [ngValue]="null" disabled>Select a category</option>
              @for (category of lookups()?.categories; track category.id) {
                <option [ngValue]="category.id">{{ category.name }}</option>
              }
            </select>
          </div>
          <div>
            <label for="priority" class="block text-sm font-medium text-slate-700">Priority</label>
            <select
              id="priority"
              formControlName="priorityId"
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option [ngValue]="null" disabled>Select a priority</option>
              @for (priority of lookups()?.priorities; track priority.id) {
                <option [ngValue]="priority.id">{{ priority.name }}</option>
              }
            </select>
          </div>
        </div>

        <div>
          <label for="description" class="block text-sm font-medium text-slate-700">Description</label>
          <textarea
            id="description"
            rows="5"
            formControlName="description"
            placeholder="What happened, when, and any steps to reproduce it"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700">Attachments (optional)</label>
          <div class="mt-1">
            <app-file-dropzone (filesChange)="files.set($event)" />
          </div>
        </div>

        @if (errorMessage()) {
          <p class="text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
        }

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            [disabled]="form.invalid || submitting()"
            class="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {{ submitting() ? 'Submitting…' : 'Submit complaint' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class NewComplaintPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsService = inject(TicketsService);
  private readonly router = inject(Router);

  protected readonly lookups = signal<TicketLookups | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly files = signal<File[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    categoryId: [null as number | null, [Validators.required]],
    priorityId: [null as number | null, [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(4000)]],
  });

  ngOnInit(): void {
    this.ticketsService.getLookups().subscribe((lookups) => this.lookups.set(lookups));
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { title, categoryId, priorityId, description } = this.form.getRawValue();

    this.ticketsService.create({ title, categoryId: categoryId!, priorityId: priorityId!, description }).subscribe({
      next: (ticket) => {
        const files = this.files();
        if (files.length === 0) {
          this.submitting.set(false);
          this.router.navigate(['/app/user/tickets', ticket.id]);
          return;
        }

        // The ticket itself was created fine either way — if only the
        // attachment upload fails, still land on the ticket (the user can
        // retry attaching from the thread) rather than losing the complaint.
        this.ticketsService.postMessage(ticket.id, '', files).subscribe({
          next: () => {
            this.submitting.set(false);
            this.router.navigate(['/app/user/tickets', ticket.id]);
          },
          error: () => {
            this.submitting.set(false);
            this.router.navigate(['/app/user/tickets', ticket.id]);
          },
        });
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(error.error?.error ?? 'Could not submit this complaint.');
      },
    });
  }
}
