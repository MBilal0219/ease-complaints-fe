import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { TeamMember } from '../../../core/team/models';
import { TeamService } from '../../../core/team/team.service';
import { TeamMemberFormModal } from './team-member-form-modal';

/** Branch Admin's own self-service team list — everyone sharing their Company/Branch. See docs/modules/company-management.md. */
@Component({
  selector: 'app-team',
  imports: [DatePipe, TeamMemberFormModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">My Team</h1>
        <p class="mt-1 text-sm text-slate-500">Everyone on your branch — add more people from your own team.</p>
      </div>
      <button
        type="button"
        (click)="showAddModal.set(true)"
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        + Add User
      </button>
    </div>

    <div class="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div class="border-b border-slate-100 p-4">
        <h2 class="text-sm font-semibold text-slate-900">Team members ({{ team().length }})</h2>
      </div>

      @if (loading()) {
        <p class="p-4 text-sm text-slate-500" role="status">Loading…</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2.5">Name</th>
                <th class="px-4 py-2.5">Email</th>
                <th class="px-4 py-2.5">Status</th>
                <th class="px-4 py-2.5">Joined</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (member of team(); track member.id) {
                <tr>
                  <td class="px-4 py-2.5 font-medium text-slate-900">{{ member.displayName }}</td>
                  <td class="px-4 py-2.5 text-slate-600">{{ member.email }}</td>
                  <td class="px-4 py-2.5">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="member.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'"
                    >
                      {{ member.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-slate-600">{{ member.createdAtUtc | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="px-4 py-8 text-center text-slate-500">Just you so far.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-team-member-form-modal [open]="showAddModal()" (closed)="showAddModal.set(false)" (created)="onCreated()" />
  `,
})
export class TeamPage implements OnInit {
  private readonly teamService = inject(TeamService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly team = signal<TeamMember[]>([]);
  protected readonly showAddModal = signal(false);

  ngOnInit(): void {
    this.refresh();
  }

  onCreated(): void {
    this.showAddModal.set(false);
    this.refresh();
  }

  private refresh(): void {
    this.teamService
      .getTeam()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((team) => {
        if (team) this.team.set(team);
        this.loading.set(false);
      });
  }
}
