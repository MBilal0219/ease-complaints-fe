import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateTicketAsImplementatorRequest,
  CreateTicketRequest,
  CreateTicketTaskRequest,
  DeveloperDashboardStats,
  EstimateUnit,
  MarkTicketTaskAsSaleRequest,
  PagedResult,
  PartyDashboardStats,
  PostMessageOutcome,
  SubmitSubComplaintRequest,
  TicketDto,
  TicketFilter,
  TicketLookups,
  TicketMessageAudience,
  TicketMessageDto,
  TicketSettings,
  TicketTaskDto,
  TicketTaskStatus,
  UpdateTicketTaskRequest,
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

  /** Admin's "Sale" action — converts a complaint into a Deal. See docs/modules/complaint-workflow-v2.md. */
  convertToSale(ticketId: string, estimatedAmount: number, deliveryDate?: string | null): Observable<TicketDto> {
    return this.http.post<TicketDto>(`/api/v1/admin/tickets/${ticketId}/sale`, { estimatedAmount, deliveryDate: deliveryDate ?? null });
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

  /** audience: which thread to post into — only meaningful for an Admin/Implementator poster (Party/Developer's own messages are auto-stamped server-side regardless of what's sent here). */
  postMessage(ticketId: string, body: string, files: File[], outcome?: PostMessageOutcome, audience?: TicketMessageAudience): Observable<TicketMessageDto> {
    const form = new FormData();
    if (body) {
      form.set('Body', body);
    }
    for (const file of files) {
      form.append('Files', file, file.name);
    }
    if (outcome) {
      form.set('ParentMessageId', outcome.parentMessageId);
      form.set('OutcomeStatus', outcome.outcomeStatus);
      if (outcome.saleAmount != null) form.set('SaleAmount', String(outcome.saleAmount));
      if (outcome.reassignedToDeveloperId) form.set('ReassignedToDeveloperId', outcome.reassignedToDeveloperId);
    }
    if (audience) {
      form.set('Audience', audience);
    }
    return this.http.post<TicketMessageDto>(`${TICKETS_BASE}/${ticketId}/messages`, form);
  }

  /** The Implementator/Admin's own "Create Complaint" — with an existing Party attached, or none at all. */
  createAsImplementator(request: CreateTicketAsImplementatorRequest): Observable<TicketDto> {
    return this.http.post<TicketDto>('/api/v1/admin/tickets', request);
  }

  getDeveloperParties(search = ''): Observable<PagedResult<import('../admin/models').PersonSummary>> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<PagedResult<import('../admin/models').PersonSummary>>('/api/v1/developer/parties', { params });
  }

  createDirectWork(request: import('./models').CreateDirectWorkRequest): Observable<TicketDto> {
    return this.http.post<TicketDto>('/api/v1/developer/direct-work', request);
  }

  // ---- Subcomplaints/tasks — see TicketTaskDto ----

  getTasksAsAdmin(ticketId: string): Observable<TicketTaskDto[]> {
    return this.http.get<TicketTaskDto[]>(`/api/v1/admin/tickets/${ticketId}/tasks`);
  }

  getTasksAsDeveloper(ticketId: string): Observable<TicketTaskDto[]> {
    return this.http.get<TicketTaskDto[]>(`/api/v1/developer/tickets/${ticketId}/tasks`);
  }

  /** The Party's own "submit a subcomplaint" action — Title required, own ticket only. Every subcomplaint is Party-authored; the Implementator/Admin only triages it. */
  submitSubComplaint(ticketId: string, request: SubmitSubComplaintRequest): Observable<TicketTaskDto> {
    const form = new FormData();
    form.set('Title', request.title);
    form.set('Description', request.description);
    for (const file of request.files ?? []) form.append('Files', file, file.name);
    return this.http.post<TicketTaskDto>(`/api/v1/user/tickets/${ticketId}/tasks`, form);
  }

  addTask(ticketId: string, request: CreateTicketTaskRequest): Observable<TicketTaskDto> {
    const form = new FormData();
    if (request.title) form.set('Title', request.title);
    form.set('Description', request.description);
    if (request.estimateValue != null) form.set('EstimateValue', String(request.estimateValue));
    if (request.estimateUnit) form.set('EstimateUnit', request.estimateUnit);
    if (request.amount != null) form.set('Amount', String(request.amount));
    for (const file of request.files ?? []) form.append('Files', file, file.name);
    return this.http.post<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks`, form);
  }

  updateTask(ticketId: string, taskId: string, request: UpdateTicketTaskRequest): Observable<TicketTaskDto> {
    return this.http.put<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}`, request);
  }

  assignTask(ticketId: string, taskId: string, developerId: string): Observable<TicketTaskDto> {
    return this.http.post<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}/assign`, { developerId });
  }

  updateTaskStatusAsAdmin(ticketId: string, taskId: string, status: TicketTaskStatus, reason?: string, files?: File[]): Observable<TicketTaskDto> {
    return this.http.patch<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}/status`, this.buildStatusForm(status, reason, files));
  }

  updateTaskStatusAsDeveloper(ticketId: string, taskId: string, status: import('./models').DeveloperWorkStatus, reason?: string, files?: File[]): Observable<TicketTaskDto> {
    return this.http.patch<TicketTaskDto>(`/api/v1/developer/tickets/${ticketId}/tasks/${taskId}/status`, this.buildStatusForm(status, reason, files));
  }

  /** The client's request turned out to be a paid feature/requirement — a lightweight per-task outcome, not the ticket-level Deal subsystem. */
  markTaskAsSale(ticketId: string, taskId: string, request: MarkTicketTaskAsSaleRequest): Observable<TicketTaskDto> {
    const form = new FormData();
    form.set('Amount', String(request.amount));
    form.set('Description', request.description);
    for (const file of request.files ?? []) form.append('Files', file, file.name);
    return this.http.post<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}/sale`, form);
  }

  reopenTask(ticketId: string, taskId: string, reason: string): Observable<TicketTaskDto> {
    return this.http.post<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}/reopen`, { reason });
  }

  setTaskEstimate(ticketId: string, taskId: string, value: number, unit: EstimateUnit): Observable<TicketTaskDto> {
    return this.http.put<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}/estimate`, { value, unit });
  }

  setTaskAmount(ticketId: string, taskId: string, amount: number | null): Observable<TicketTaskDto> {
    return this.http.put<TicketTaskDto>(`/api/v1/admin/tickets/${ticketId}/tasks/${taskId}/amount`, { amount });
  }

  private buildStatusForm(status: string, reason?: string, files?: File[]): FormData {
    const form = new FormData();
    form.set('Status', status);
    if (reason) form.set('Reason', reason);
    for (const file of files ?? []) form.append('Files', file, file.name);
    return form;
  }

  /** Admin-only — whether a Party can see per-message/total Sale amounts on their own complaints. */
  getTicketSettings(): Observable<TicketSettings> {
    return this.http.get<TicketSettings>('/api/v1/admin/ticket-settings');
  }

  updateTicketSettings(showSaleAmountToParty: boolean): Observable<TicketSettings> {
    return this.http.put<TicketSettings>('/api/v1/admin/ticket-settings', { showSaleAmountToParty });
  }

  private buildParams(filter: TicketFilter): HttpParams {
    let params = new HttpParams().set('page', filter.page).set('pageSize', filter.pageSize);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.categoryId) params = params.set('categoryId', filter.categoryId);
    if (filter.priorityId) params = params.set('priorityId', filter.priorityId);
    if (filter.assignedDeveloperId) params = params.set('assignedDeveloperId', filter.assignedDeveloperId);
    if (filter.createdByUserId) params = params.set('createdByUserId', filter.createdByUserId);
    if (filter.dateRange) params = params.set('dateRange', filter.dateRange);
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.search) params = params.set('search', filter.search);
    return params;
  }
}
