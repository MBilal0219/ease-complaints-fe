import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MenuCategory, MenuItem, SaveMenuCategoryRequest, SaveMenuItemRequest } from './models';

const BASE = '/api/v1/pos/menu';

/** A restaurant's own menu (categories, items, modifiers) — see docs/modules/pos-menu.md. Every call is implicitly scoped to the caller's restaurant. */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);

  getCategories(): Observable<MenuCategory[]> {
    return this.http.get<MenuCategory[]>(`${BASE}/categories`);
  }

  createCategory(request: SaveMenuCategoryRequest): Observable<MenuCategory> {
    return this.http.post<MenuCategory>(`${BASE}/categories`, request);
  }

  updateCategory(id: string, request: SaveMenuCategoryRequest): Observable<MenuCategory> {
    return this.http.put<MenuCategory>(`${BASE}/categories/${id}`, request);
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/categories/${id}`);
  }

  setCategoryImage(id: string, image: File): Observable<MenuCategory> {
    const form = new FormData();
    form.set('image', image, image.name);
    return this.http.post<MenuCategory>(`${BASE}/categories/${id}/image`, form);
  }

  clearCategoryImage(id: string): Observable<MenuCategory> {
    return this.http.delete<MenuCategory>(`${BASE}/categories/${id}/image`);
  }

  getItems(categoryId?: string): Observable<MenuItem[]> {
    let params = new HttpParams();
    if (categoryId) params = params.set('categoryId', categoryId);
    return this.http.get<MenuItem[]>(`${BASE}/items`, { params });
  }

  createItem(request: SaveMenuItemRequest): Observable<MenuItem> {
    return this.http.post<MenuItem>(`${BASE}/items`, request);
  }

  updateItem(id: string, request: SaveMenuItemRequest): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${BASE}/items/${id}`, request);
  }

  deleteItem(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/items/${id}`);
  }

  setItemImage(id: string, image: File): Observable<MenuItem> {
    const form = new FormData();
    form.set('image', image, image.name);
    return this.http.post<MenuItem>(`${BASE}/items/${id}/image`, form);
  }

  clearItemImage(id: string): Observable<MenuItem> {
    return this.http.delete<MenuItem>(`${BASE}/items/${id}/image`);
  }
}
