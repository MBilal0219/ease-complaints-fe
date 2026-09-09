import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Placeholder for a nav item that's already wired up but whose page hasn't
 * been built yet (e.g. docs/modules/pos-overview.md, docs/modules/sales-person-role.md —
 * both built one sub-module at a time). Title/subtitle come from the route's
 * `data.title`/`data.subtitle` so one component can stand in for every
 * not-yet-built leaf across any module.
 */
@Component({
  selector: 'app-coming-soon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-7 w-7">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
        </svg>
      </div>
      <h1 class="mt-4 text-lg font-semibold text-slate-900">{{ title }}</h1>
      <p class="mt-1 text-sm text-slate-500">{{ subtitle }}</p>
    </div>
  `,
})
export class ComingSoon {
  private readonly route = inject(ActivatedRoute);
  protected readonly title = this.route.snapshot.data['title'] ?? 'Coming soon';
  protected readonly subtitle = this.route.snapshot.data['subtitle'] ?? 'This part of the app is coming soon.';
}
