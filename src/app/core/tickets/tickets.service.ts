import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateTicketRequest,
  DeveloperDashboardStats,
  PagedResult,
  PartyDashboardStats,
  TicketDto,
  TicketFilter,
  TicketLookups,
  TicketMessageDto,
} from './models';

const TICKETS_BASE = '/api/v1/tickets';

@Injectable({ providedIn: 'root' })
export class TicketsService {
  private readonly http = inject(HttpClient);

  getLookups(): Observable<TicketLookups> {
    return this.http.get<TicketLookups>(`${TICKETS_BASE}/lookups`);
  }

  create(request: CreateTicketRequest): Observable<TicketDto> {
    return this.http.post<TicketDto>(TICKETS_BASE, request);
  }

  getById(id: string): Observable<TicketDto> {
    return this.http.get<TicketDto>(`${TICKETS_BASE}/${id}`);
  }

  /** The Party's own complaints. */
  getMyTickets(filter: TicketFilter): Observable<PagedResult<TicketDto>> {
    return this.http.get<PagedResult<TicketDto>>('/api/v1/user/tickets', { params: this.buildParams(filter) });
  }

  getAdminTickets(filter: TicketFilter): Observable<PagedResult<TicketDto>> {
    return this.http.get<PagedResult<TicketDto>>('/api/v1/admin/tickets', { params: this.buildParams(filter) });
  }

  getDeveloperTickets(filter: TicketFilter): Observable<PagedResult<TicketDto>> {
    return this.http.get<PagedResult<TicketDto>>('/api/v1/developer/tickets', { params: this.buildParams(filter) });
  }

  assign(ticketId: string, developerId: string): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/admin/tickets/${ticketId}/assign`, { developerId });
  }

  close(ticketId: string, reason?: string): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/admin/tickets/${ticketId}/close`, { reason: reason ?? null });
  }

  updateStatus(ticketId: string, status: string, reason?: string): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/developer/tickets/${ticketId}/status`, { status, reason: reason ?? null });
  }

  /** Admin's direct status-pill dropdown — any status except Revoked. */
  updateStatusAsAdmin(ticketId: string, status: string, reason?: string): Observable<TicketDto> {
    return this.http.patch<TicketDto>(`/api/v1/admin/tickets/${ticketId}/status`, { status, reason: reason ?? null });
  }

  /** Only while the complaint is still New/Assigned. */
  revoke(ticketId: string): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/user/tickets/${ticketId}/revoke`, {});
  }

  /** Reactivates a revoked complaint back to New. */
  recomplain(ticketId: string): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/user/tickets/${ticketId}/recomplain`, {});
  }

  /** Permanently deletes a revoked complaint. */
  deleteRevoked(ticketId: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/user/tickets/${ticketId}`);
  }

  /** Party wasn't satisfied with a Closed complaint's resolution. */
  reopen(ticketId: string, message: string): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/user/tickets/${ticketId}/reopen`, { message });
  }

  getPartyDashboard(): Observable<PartyDashboardStats> {
    return this.http.get<PartyDashboardStats>('/api/v1/user/dashboard');
  }

  getDeveloperDashboard(): Observable<DeveloperDashboardStats> {
    return this.http.get<DeveloperDashboardStats>('/api/v1/developer/dashboard');
  }

  getMessages(ticketId: string): Observable<TicketMessageDto[]> {
    return this.http.get<TicketMessageDto[]>(`${TICKETS_BASE}/${ticketId}/messages`);
  }

  postMessage(ticketId: string, body: string, files: File[]): Observable<TicketMessageDto> {
    const form = new FormData();
    if (body) {
      form.set('Body', body);
    }
    for (const file of files) {
      form.append('Files', file, file.name);
    }
    return this.http.post<TicketMessageDto>(`${TICKETS_BASE}/${ticketId}/messages`, form);
  }

  private buildParams(filter: TicketFilter): HttpParams {
    let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.categoryId) params = params.set('categoryId', filter.categoryId);
    if (filter.priorityId) params = params.set('priorityId', filter.priorityId);
    if (filter.assignedDeveloperId) params = params.set('assignedDeveloperId', filter.assignedDeveloperId);
    if (filter.createdByUserId) params = params.set('createdByUserId', filter.createdByUserId);
    if (filter.dateRange) params = params.set('dateRange', filter.dateRange);
    if (filter.search) params = params.set('search', filter.search);
    return params;
  }
}
