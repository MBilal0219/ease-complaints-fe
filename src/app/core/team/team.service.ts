import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTeamMemberRequest, TeamMember } from './models';

const BASE = '/api/v1/user/team';

/** Branch Admin only — see docs/modules/company-management.md. */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly http = inject(HttpClient);

  getTeam(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(BASE);
  }

  createTeamMember(request: CreateTeamMemberRequest): Observable<TeamMember> {
    return this.http.post<TeamMember>(BASE, request);
  }
}
