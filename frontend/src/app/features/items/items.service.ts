import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, finalize, map, tap, throwError } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { InventoryItem, NewInventoryItem } from './item.model';

interface ApiItem {
  id: number;
  itemCode: string;
  itemName: string;
  category: string | null;
  unit: string | null;
  reorderLevel: number;
  active: boolean;
}

interface ApiItemRequest {
  itemCode: string;
  itemName: string;
  category: string;
  unit: string;
  reorderLevel: number;
}

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`An item with SKU "${sku}" already exists.`);
    this.name = 'DuplicateSkuError';
  }
}

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly api = inject(ApiClient);
  private readonly itemsSubject = new BehaviorSubject<InventoryItem[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);

  readonly items$ = this.itemsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.reloadItems();
    }
  }

  loadItems(): Observable<InventoryItem[]> {
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    return this.api.get<ApiItem[]>('items').pipe(
      map((items) => items.map((item) => this.toFrontend(item))),
      tap((items) => this.itemsSubject.next(items)),
      catchError((error: unknown) => {
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadItems(): void {
    this.loadItems().subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }

  getItem(id: number): Observable<InventoryItem> {
    return this.api.get<ApiItem>(`items/${id}`).pipe(
      map((item) => this.toFrontend(item)),
    );
  }

  addItem(item: NewInventoryItem): Observable<InventoryItem> {
    return this.api.post<ApiItem, ApiItemRequest>('items', this.toBackend(item)).pipe(
      map((saved) => this.toFrontend(saved)),
      tap((saved) => this.itemsSubject.next([...this.itemsSubject.value, saved])),
      catchError((error: unknown) => this.handleError(error, item.sku)),
    );
  }

  updateItem(item: InventoryItem): Observable<InventoryItem> {
    return this.api.put<ApiItem, ApiItemRequest>(
      `items/${item.id}`,
      this.toBackend(item),
    ).pipe(
      map((saved) => this.toFrontend(saved)),
      tap((saved) => {
        this.itemsSubject.next(
          this.itemsSubject.value.map((current) =>
            current.id === saved.id ? saved : current,
          ),
        );
      }),
      catchError((error: unknown) => this.handleError(error, item.sku)),
    );
  }

  deleteItem(id: number): Observable<void> {
    return this.api.delete<void>(`items/${id}`).pipe(
      tap(() => {
        this.itemsSubject.next(
          this.itemsSubject.value.map((item) =>
            item.id === id ? { ...item, status: 'Inactive' } : item,
          ),
        );
      }),
    );
  }

  private toFrontend(item: ApiItem): InventoryItem {
    return {
      id: item.id,
      sku: item.itemCode,
      name: item.itemName,
      category: item.category ?? '',
      unit: item.unit ?? '',
      minStock: item.reorderLevel,
      status: item.active ? 'Active' : 'Inactive',
    };
  }

  private toBackend(item: NewInventoryItem): ApiItemRequest {
    return {
      itemCode: item.sku.trim(),
      itemName: item.name.trim(),
      category: item.category,
      unit: item.unit,
      reorderLevel: item.minStock,
    };
  }

  private handleError(error: unknown, sku: string): Observable<never> {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return throwError(() => new DuplicateSkuError(sku));
    }

    return throwError(() => error);
  }
}
