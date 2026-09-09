import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RestaurantTable, SaveTableRequest, SaveTableSectionRequest, TableSection, TableStatus } from './models';

const BASE = '/api/v1/pos/tables';

/** A restaurant's own Dine-In tables and (optional) sections — see docs/modules/pos-tables.md. Every call is implicitly scoped to the caller's restaurant. */
@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);

  getSections(): Observable<TableSection[]> {
    return this.http.get<TableSection[]>(`${BASE}/sections`);
  }

  createSection(request: SaveTableSectionRequest): Observable<TableSection> {
    return this.http.post<TableSection>(`${BASE}/sections`, request);
  }

  updateSection(id: string, request: SaveTableSectionRequest): Observable<TableSection> {
    return this.http.put<TableSection>(`${BASE}/sections/${id}`, request);
  }

  deleteSection(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/sections/${id}`);
  }

  getTables(sectionId?: string): Observable<RestaurantTable[]> {
    let params = new HttpParams();
    if (sectionId) params = params.set('sectionId', sectionId);
    return this.http.get<RestaurantTable[]>(BASE, { params });
  }

  createTable(request: SaveTableRequest): Observable<RestaurantTable> {
    return this.http.post<RestaurantTable>(BASE, request);
  }

  updateTable(id: string, request: SaveTableRequest): Observable<RestaurantTable> {
    return this.http.put<RestaurantTable>(`${BASE}/${id}`, request);
  }

  deleteTable(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}`);
  }

  setStatus(id: string, status: TableStatus): Observable<RestaurantTable> {
    return this.http.patch<RestaurantTable>(`${BASE}/${id}/status`, { status });
  }
}
