import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, tap, throwError } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { NewStockTransfer, StockTransfer, StockTransferStatus } from './stock-transfer.model';

type ApiTransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

interface ApiStockTransfer {
  id: number;
  transferNumber: string;
  itemId: number;
  sourceWarehouseId: number;
  destinationWarehouseId: number;
  quantity: number;
  transferDate: string;
  status: ApiTransferStatus;
}

interface ApiStockTransferRequest {
  transferNumber: string;
  itemId: number;
  sourceWarehouseId: number;
  destinationWarehouseId: number;
  quantity: number;
  transferDate: string;
  status: ApiTransferStatus;
}

export class DuplicateTransferNumberError extends Error {
  constructor(transferNumber: string) {
    super(`A stock transfer with number "${transferNumber}" already exists.`);
    this.name = 'DuplicateTransferNumberError';
  }
}

@Injectable({ providedIn: 'root' })
export class StockTransfersService {
  private readonly api = inject(ApiClient);
  private readonly transfersSubject = new BehaviorSubject<StockTransfer[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);

  readonly transfers$ = this.transfersSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.reloadTransfers();
    }
  }

  getCurrentTransfers(): readonly StockTransfer[] {
    return this.transfersSubject.value;
  }

  loadTransfers(): Observable<StockTransfer[]> {
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    return this.api.get<ApiStockTransfer[]>('stock-transfers').pipe(
      map((transfers) => transfers.map((transfer) => this.toFrontend(transfer))),
      tap((transfers) => this.transfersSubject.next(transfers)),
      catchError((error: unknown) => {
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadTransfers(): void {
    this.loadTransfers().subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }

  getTransfer(id: number): Observable<StockTransfer> {
    return this.api.get<ApiStockTransfer>(`stock-transfers/${id}`).pipe(
      map((transfer) => this.toFrontend(transfer)),
      tap((transfer) => {
        this.transfersSubject.next(
          this.transfersSubject.value.map((current) =>
            current.id === transfer.id ? transfer : current,
          ),
        );
      }),
    );
  }

  suggestTransferNumber(): string {
    const sequences = this.transfersSubject.value
      .map((transfer) => /^TRF-(\d+)$/i.exec(transfer.transferNumber))
      .filter((match) => match !== null)
      .map((match) => Number(match[1]));
    const nextSequence = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
    return `TRF-${String(nextSequence).padStart(4, '0')}`;
  }

  addTransfer(transfer: NewStockTransfer): Observable<StockTransfer> {
    return this.api
      .post<ApiStockTransfer, ApiStockTransferRequest>('stock-transfers', this.toBackend(transfer))
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => this.transfersSubject.next([...this.transfersSubject.value, saved])),
        catchError((error: unknown) => this.handleError(error, transfer.transferNumber)),
      );
  }

  updateTransfer(transfer: StockTransfer): Observable<StockTransfer> {
    return this.api
      .put<ApiStockTransfer, ApiStockTransferRequest>(
        `stock-transfers/${transfer.id}`,
        this.toBackend(transfer),
      )
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => {
          this.transfersSubject.next(
            this.transfersSubject.value.map((current) =>
              current.id === saved.id ? saved : current,
            ),
          );
        }),
        catchError((error: unknown) => this.handleError(error, transfer.transferNumber)),
      );
  }

  deleteTransfer(id: number): Observable<void> {
    return this.api.delete<void>(`stock-transfers/${id}`).pipe(
      tap(() => {
        this.transfersSubject.next(
          this.transfersSubject.value.filter((transfer) => transfer.id !== id),
        );
      }),
    );
  }

  private toFrontend(transfer: ApiStockTransfer): StockTransfer {
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      itemId: transfer.itemId,
      sourceWarehouseId: transfer.sourceWarehouseId,
      destinationWarehouseId: transfer.destinationWarehouseId,
      quantity: transfer.quantity,
      transferDate: transfer.transferDate,
      status: this.toFrontendStatus(transfer.status),
    };
  }

  private toBackend(transfer: NewStockTransfer | StockTransfer): ApiStockTransferRequest {
    return {
      transferNumber: transfer.transferNumber.trim(),
      itemId: transfer.itemId,
      sourceWarehouseId: transfer.sourceWarehouseId,
      destinationWarehouseId: transfer.destinationWarehouseId,
      quantity: transfer.quantity,
      transferDate: transfer.transferDate,
      status: this.toBackendStatus(transfer.status),
    };
  }

  private toFrontendStatus(status: ApiTransferStatus): StockTransferStatus {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
    }
  }

  private toBackendStatus(status: StockTransferStatus): ApiTransferStatus {
    switch (status) {
      case 'Pending':
        return 'PENDING';
      case 'Completed':
        return 'COMPLETED';
      case 'Cancelled':
        return 'CANCELLED';
    }
  }

  private handleError(error: unknown, transferNumber: string): Observable<never> {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 409 &&
      this.backendErrorMessage(error)
        ?.toLocaleLowerCase()
        .includes('transfer number already exists')
    ) {
      return throwError(() => new DuplicateTransferNumberError(transferNumber));
    }
    return throwError(() => error);
  }

  private backendErrorMessage(error: HttpErrorResponse): string | null {
    if (typeof error.error === 'string') {
      return error.error;
    }
    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const text = ['message', 'detail', 'error']
      .map((key) => Reflect.get(body, key))
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return text?.trim() ?? null;
  }
}
