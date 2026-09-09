import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReportingPageSize } from '../../../core/reports/models';
import { ReportsService } from '../../../core/reports/reports.service';

/** Just the one setting Sales Person needs — the Referrals report's default print page size. Backed by the same per-Branch PosSettings row the Party role's POS Settings page reads/writes, via a slim endpoint (see ISettingsService.GetReportingPageSizeAsync). */
@Component({
  selector: 'app-sales-person-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-lg font-semibold text-slate-900">Settings</h1>
    <p class="mt-1 text-sm text-slate-500">Preferences for your reports.</p>

    <div class="mt-6 max-w-md rounded-lg border border-slate-200 bg-white p-5">
      <span class="block text-sm font-medium text-slate-700">Report page size</span>
      <p class="text-xs text-slate-500">Default page size when printing the Referrals Collection Report — you can still override it per print.</p>
      <div class="mt-2 flex gap-6">
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="pageSize" value="A4" [checked]="pageSize() === 'A4'" (change)="save('A4')" class="text-indigo-600 focus:ring-indigo-500" />
          A4
        </label>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name="pageSize" value="A5" [checked]="pageSize() === 'A5'" (change)="save('A5')" class="text-indigo-600 focus:ring-indigo-500" />
          A5
        </label>
      </div>
      @if (saving()) {
        <p class="mt-2 text-xs text-slate-400">Saving…</p>
      }
    </div>
  `,
})
export class SalesPersonSettingsPage implements OnInit {
  private readonly reportsService = inject(ReportsService);

  protected readonly pageSize = signal<ReportingPageSize>('A4');
  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.reportsService.getReportingPageSize().subscribe((result) => this.pageSize.set(result.pageSize));
  }

  save(pageSize: ReportingPageSize): void {
    this.pageSize.set(pageSize);
    this.saving.set(true);
    this.reportsService.updateReportingPageSize(pageSize).subscribe(() => this.saving.set(false));
  }
}
