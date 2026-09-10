import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { LookupValue } from '../../../core/admin/models';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { Toggle } from '../../../shared/ui/toggle/toggle';

/** System-wide preferences + the admin-extensible employee lookups. */
@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, Toggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Settings</h1>
    <p class="mt-1 text-sm text-slate-500">System-wide preferences.</p>

    <div class="mt-6 max-w-md rounded-lg border border-slate-200 bg-white p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <span class="block text-sm font-medium text-slate-700">Show sale amounts to customers</span>
          <p class="mt-0.5 text-xs text-slate-500">
            When on, a Party can see the per-message and total Sale amounts on their own complaints. Admin and Developer always see them regardless.
          </p>
        </div>
        <app-toggle [ngModel]="showSaleAmountToParty()" (ngModelChange)="save($event)" />
      </div>
      @if (saving()) {
        <p class="mt-2 text-xs text-slate-400">Saving…</p>
      }
    </div>

    <h2 class="mt-8 text-sm font-semibold text-slate-900">Employee lookups</h2>
    <p class="mt-1 text-sm text-slate-500">Values available in the Developer type and Rank dropdowns when adding or editing staff.</p>

    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      @for (list of lists; track list.key) {
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <p class="text-sm font-medium text-slate-700">{{ list.label }}</p>
          <ul class="mt-2 flex flex-wrap gap-1.5">
            @for (v of list.values(); track v.id) {
              <li class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{{ v.name }}</li>
            } @empty {
              <li class="text-xs text-slate-400">None yet.</li>
            }
          </ul>
          <div class="mt-3 flex gap-2">
            <input
              type="text"
              [value]="list.draft()"
              (input)="list.draft.set($any($event.target).value)"
              [placeholder]="'New ' + list.label.toLowerCase().slice(0, -1)"
              class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button type="button" (click)="add(list)" class="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">Add</button>
          </div>
          @if (list.error()) {
            <p class="mt-1 text-xs text-red-600" role="alert">{{ list.error() }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly ticketsService = inject(TicketsService);
  private readonly adminService = inject(AdminService);

  protected readonly showSaleAmountToParty = signal(false);
  protected readonly saving = signal(false);

  protected readonly lists = [
    {
      key: 'developerType' as const,
      label: 'Developer types',
      values: signal<LookupValue[]>([]),
      draft: signal(''),
      error: signal<string | null>(null),
    },
    {
      key: 'rank' as const,
      label: 'Ranks',
      values: signal<LookupValue[]>([]),
      draft: signal(''),
      error: signal<string | null>(null),
    },
  ];

  ngOnInit(): void {
    this.ticketsService.getTicketSettings().subscribe((result) => this.showSaleAmountToParty.set(result.showSaleAmountToParty));
    this.adminService.getDeveloperTypes().subscribe((v) => this.lists[0].values.set(v));
    this.adminService.getRanks().subscribe((v) => this.lists[1].values.set(v));
  }

  save(value: boolean): void {
    this.showSaleAmountToParty.set(value);
    this.saving.set(true);
    this.ticketsService.updateTicketSettings(value).subscribe(() => this.saving.set(false));
  }

  add(list: (typeof this.lists)[number]): void {
    const name = list.draft().trim();
    if (!name) return;
    list.error.set(null);
    const req = list.key === 'developerType' ? this.adminService.createDeveloperType(name) : this.adminService.createRank(name);
    req.subscribe({
      next: (created) => {
        list.values.update((v) => [...v, created]);
        list.draft.set('');
      },
      error: (error: HttpErrorResponse) => list.error.set(error.error?.error ?? 'Could not add that value.'),
    });
  }
}
