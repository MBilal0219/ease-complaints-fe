import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../../core/tickets/tickets.service';
import { Toggle } from '../../../shared/ui/toggle/toggle';

/** Just the one setting so far — whether a Party can see per-message/total Sale amounts on their own complaints. See TicketSettings on the backend. */
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
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly ticketsService = inject(TicketsService);

  protected readonly showSaleAmountToParty = signal(false);
  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.ticketsService.getTicketSettings().subscribe((result) => this.showSaleAmountToParty.set(result.showSaleAmountToParty));
  }

  save(value: boolean): void {
    this.showSaleAmountToParty.set(value);
    this.saving.set(true);
    this.ticketsService.updateTicketSettings(value).subscribe(() => this.saving.set(false));
  }
}
