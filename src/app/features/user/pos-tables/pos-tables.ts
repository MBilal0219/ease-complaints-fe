import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { TableService } from '../../../core/tables/table.service';
import { RestaurantTable, TableSection } from '../../../core/tables/models';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { SectionFormModal } from '../section-form-modal/section-form-modal';
import { TableFormModal } from '../table-form-modal/table-form-modal';

type PendingDelete = { kind: 'section' | 'table'; id: string; name: string };

@Component({
  selector: 'app-pos-tables',
  imports: [SectionFormModal, TableFormModal, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Tables</h1>
        <p class="mt-1 text-sm text-slate-500">Your Dine-In tables, optionally grouped into sections.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" (click)="openCreateSection()" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          + Add Section
        </button>
        <button type="button" (click)="openCreateTable()" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          + Add Table
        </button>
      </div>
    </div>

    @if (sections().length > 0) {
      <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Sections</div>
        <ul class="divide-y divide-slate-100">
          @for (section of sections(); track section.id) {
            <li class="flex items-center justify-between px-4 py-2 text-sm">
              <span class="text-slate-700">{{ section.name }} <span class="text-slate-400">({{ section.tableCount }} table{{ section.tableCount === 1 ? '' : 's' }})</span></span>
              <span class="flex gap-3">
                <button type="button" (click)="openEditSection(section)" class="font-medium text-indigo-600 hover:text-indigo-500">Edit</button>
                <button type="button" (click)="pendingDelete.set({ kind: 'section', id: section.id, name: section.name })" class="font-medium text-red-600 hover:text-red-500">Delete</button>
              </span>
            </li>
          }
        </ul>
      </div>
    }

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button
        type="button"
        (click)="selectedSectionId.set(null)"
        class="rounded-full px-3 py-1.5 text-sm font-medium"
        [class]="selectedSectionId() === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
      >
        All Tables
      </button>
      @for (section of sections(); track section.id) {
        <button
          type="button"
          (click)="selectedSectionId.set(section.id)"
          class="rounded-full px-3 py-1.5 text-sm font-medium"
          [class]="selectedSectionId() === section.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
        >
          {{ section.name }}
        </button>
      }
    </div>

    @if (loading()) {
      <p class="mt-6 text-sm text-slate-500" role="status">Loading…</p>
    } @else if (filteredTables().length === 0) {
      <div class="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No tables yet — add your first one.
      </div>
    } @else {
      <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        @for (table of filteredTables(); track table.id) {
          <div class="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-lg font-semibold text-slate-900">{{ table.name }}</p>
                <p class="text-xs text-slate-500">{{ table.seats }} seat{{ table.seats === 1 ? '' : 's' }}{{ table.sectionName ? ' · ' + table.sectionName : '' }}</p>
              </div>
              <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" (click)="openEditTable(table)" class="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Edit table">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897z" />
                  </svg>
                </button>
                <button type="button" (click)="pendingDelete.set({ kind: 'table', id: table.id, name: table.name })" class="rounded-md p-1 text-red-500 hover:bg-red-50" aria-label="Delete table">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="h-4 w-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
            <button
              type="button"
              (click)="toggleStatus(table)"
              [disabled]="togglingId() === table.id"
              class="mt-3 w-full rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              [class]="table.status === 'Free' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'"
            >
              {{ table.status === 'Free' ? 'Free — tap to mark Occupied' : 'Occupied — tap to mark Free' }}
            </button>
          </div>
        }
      </div>
    }

    @if (errorMessage()) {
      <p class="mt-4 text-sm text-red-600" role="alert">{{ errorMessage() }}</p>
    }

    <app-section-form-modal [open]="showSectionModal()" [section]="editingSection()" (closed)="showSectionModal.set(false)" (saved)="onSectionSaved()" />
    <app-table-form-modal [open]="showTableModal()" [table]="editingTable()" [sections]="sections()" (closed)="showTableModal.set(false)" (saved)="onTableSaved()" />

    <app-confirm-dialog
      [open]="!!pendingDelete()"
      title="Delete?"
      [message]="'Delete \\'' + (pendingDelete()?.name ?? '') + '\\'? This cannot be undone.'"
      confirmLabel="Delete"
      [destructive]="true"
      [busy]="deleting()"
      (cancel)="pendingDelete.set(null)"
      (confirm)="doDelete()"
    />
  `,
})
export class PosTablesPage implements OnInit {
  private readonly tableService = inject(TableService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly sections = signal<TableSection[]>([]);
  protected readonly tables = signal<RestaurantTable[]>([]);
  protected readonly selectedSectionId = signal<string | null>(null);

  protected readonly showSectionModal = signal(false);
  protected readonly editingSection = signal<TableSection | null>(null);
  protected readonly showTableModal = signal(false);
  protected readonly editingTable = signal<RestaurantTable | null>(null);
  protected readonly pendingDelete = signal<PendingDelete | null>(null);
  protected readonly deleting = signal(false);
  protected readonly togglingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly filteredTables = () => {
    const sectionId = this.selectedSectionId();
    const all = this.tables();
    return sectionId ? all.filter((t) => t.sectionId === sectionId) : all;
  };

  ngOnInit(): void {
    this.refresh();
  }

  openCreateSection(): void {
    this.editingSection.set(null);
    this.showSectionModal.set(true);
  }

  openEditSection(section: TableSection): void {
    this.editingSection.set(section);
    this.showSectionModal.set(true);
  }

  onSectionSaved(): void {
    this.showSectionModal.set(false);
    this.refresh();
  }

  openCreateTable(): void {
    this.editingTable.set(null);
    this.showTableModal.set(true);
  }

  openEditTable(table: RestaurantTable): void {
    this.editingTable.set(table);
    this.showTableModal.set(true);
  }

  onTableSaved(): void {
    this.showTableModal.set(false);
    this.refresh();
  }

  toggleStatus(table: RestaurantTable): void {
    this.togglingId.set(table.id);
    this.errorMessage.set(null);
    const next = table.status === 'Free' ? 'Occupied' : 'Free';

    this.tableService.setStatus(table.id, next).subscribe({
      next: (updated) => {
        this.togglingId.set(null);
        this.tables.update((all) => all.map((t) => (t.id === updated.id ? updated : t)));
      },
      error: (error: HttpErrorResponse) => {
        this.togglingId.set(null);
        this.errorMessage.set(error.error?.error ?? 'Could not update this table.');
      },
    });
  }

  doDelete(): void {
    const pending = this.pendingDelete();
    if (!pending) return;

    this.deleting.set(true);
    const delete$ = pending.kind === 'section' ? this.tableService.deleteSection(pending.id) : this.tableService.deleteTable(pending.id);

    delete$.subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        if (pending.kind === 'section' && this.selectedSectionId() === pending.id) {
          this.selectedSectionId.set(null);
        }
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.errorMessage.set(error.error?.error ?? 'Could not delete this.');
      },
    });
  }

  private refresh(): void {
    this.loading.set(true);
    forkJoin({ sections: this.tableService.getSections(), tables: this.tableService.getTables() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sections, tables }) => {
          this.sections.set(sections);
          this.tables.set(tables);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
