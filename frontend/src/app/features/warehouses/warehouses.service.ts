import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  tap,
  throwError,
} from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { NewWarehouse, Warehouse } from './warehouse.model';

interface ApiWarehouse {
  id: number;
  warehouseCode: string;
  warehouseName: string;
  location: string | null;
  active: boolean;
}

interface ApiWarehouseRequest {
  warehouseCode: string;
  warehouseName: string;
  location: string;
}

export class DuplicateWarehouseCodeError extends Error {
  constructor(code: string) {
    super(`A warehouse with code "${code}" already exists.`);
    this.name = 'DuplicateWarehouseCodeError';
  }
}

@Injectable({ providedIn: 'root' })
export class WarehousesService {
  private readonly api = inject(ApiClient);
  private readonly warehousesSubject = new BehaviorSubject<Warehouse[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);

  readonly warehouses$ = this.warehousesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.reloadWarehouses();
    }
  }

  loadWarehouses(): Observable<Warehouse[]> {
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    return this.api.get<ApiWarehouse[]>('warehouses').pipe(
      map((warehouses) => warehouses.map((warehouse) => this.toFrontend(warehouse))),
      tap((warehouses) => this.warehousesSubject.next(warehouses)),
      catchError((error: unknown) => {
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadWarehouses(): void {
    this.loadWarehouses().subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }

  getWarehouse(id: number): Observable<Warehouse> {
    return this.api.get<ApiWarehouse>(`warehouses/${id}`).pipe(
      map((warehouse) => this.toFrontend(warehouse)),
      tap((warehouse) => {
        this.warehousesSubject.next(
          this.warehousesSubject.value.map((current) =>
            current.id === warehouse.id ? warehouse : current,
          ),
        );
      }),
    );
  }

  addWarehouse(warehouse: NewWarehouse): Observable<Warehouse> {
    return this.api
      .post<ApiWarehouse, ApiWarehouseRequest>('warehouses', this.toBackend(warehouse))
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => this.warehousesSubject.next([...this.warehousesSubject.value, saved])),
        catchError((error: unknown) => this.handleError(error, warehouse.code)),
      );
  }

  updateWarehouse(warehouse: Warehouse): Observable<Warehouse> {
    return this.api
      .put<ApiWarehouse, ApiWarehouseRequest>(
        `warehouses/${warehouse.id}`,
        this.toBackend(warehouse),
      )
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => {
          this.warehousesSubject.next(
            this.warehousesSubject.value.map((current) =>
              current.id === saved.id ? saved : current,
            ),
          );
        }),
        catchError((error: unknown) => this.handleError(error, warehouse.code)),
      );
  }

  deleteWarehouse(id: number): Observable<void> {
    return this.api.delete<void>(`warehouses/${id}`).pipe(
      tap(() => {
        this.warehousesSubject.next(
          this.warehousesSubject.value.map((warehouse) =>
            warehouse.id === id ? { ...warehouse, status: 'Inactive' } : warehouse,
          ),
        );
      }),
    );
  }

  private toFrontend(warehouse: ApiWarehouse): Warehouse {
    return {
      id: warehouse.id,
      code: warehouse.warehouseCode,
      name: warehouse.warehouseName,
      location: warehouse.location ?? '',
      status: warehouse.active ? 'Active' : 'Inactive',
    };
  }

  private toBackend(
    warehouse: Pick<Warehouse, 'name' | 'code' | 'location'>,
  ): ApiWarehouseRequest {
    return {
      warehouseCode: warehouse.code.trim(),
      warehouseName: warehouse.name.trim(),
      location: warehouse.location.trim(),
    };
  }

  private handleError(error: unknown, code: string): Observable<never> {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return throwError(() => new DuplicateWarehouseCodeError(code));
    }

    return throwError(() => error);
  }
}
