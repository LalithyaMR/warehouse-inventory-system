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
import { NewStockReceipt, StockReceipt } from './stock-receipt.model';

interface ApiStockReceipt {
  id: number;
  receiptNumber: string;
  itemId: number;
  warehouseId: number;
  quantity: number;
  receiptDate: string;
}

interface ApiStockReceiptRequest {
  receiptNumber: string;
  itemId: number;
  warehouseId: number;
  quantity: number;
  receiptDate: string;
}

export class DuplicateReceiptNumberError extends Error {
  constructor(receiptNumber: string) {
    super(`A receipt with number "${receiptNumber}" already exists.`);
    this.name = 'DuplicateReceiptNumberError';
  }
}

@Injectable({ providedIn: 'root' })
export class StockReceiptsService {
  private readonly api = inject(ApiClient);
  private readonly receiptsSubject = new BehaviorSubject<StockReceipt[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);

  readonly receipts$ = this.receiptsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.reloadReceipts();
    }
  }

  getCurrentReceipts(): readonly StockReceipt[] {
    return this.receiptsSubject.value;
  }

  loadReceipts(): Observable<StockReceipt[]> {
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    return this.api.get<ApiStockReceipt[]>('stock-receipts').pipe(
      map((receipts) => receipts.map((receipt) => this.toFrontend(receipt))),
      tap((receipts) => this.receiptsSubject.next(receipts)),
      catchError((error: unknown) => {
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadReceipts(): void {
    this.loadReceipts().subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }

  getReceipt(id: number): Observable<StockReceipt> {
    return this.api.get<ApiStockReceipt>(`stock-receipts/${id}`).pipe(
      map((receipt) => this.toFrontend(receipt)),
      tap((receipt) => {
        this.receiptsSubject.next(
          this.receiptsSubject.value.map((current) =>
            current.id === receipt.id ? receipt : current,
          ),
        );
      }),
    );
  }

  suggestReceiptNumber(): string {
    const sequences = this.receiptsSubject.value
      .map((receipt) => /^RCV-(\d+)$/i.exec(receipt.receiptNumber))
      .filter((match) => match !== null)
      .map((match) => Number(match[1]));
    const nextSequence = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
    return `RCV-${String(nextSequence).padStart(4, '0')}`;
  }

  addReceipt(receipt: NewStockReceipt): Observable<StockReceipt> {
    return this.api
      .post<ApiStockReceipt, ApiStockReceiptRequest>(
        'stock-receipts',
        this.toBackend(receipt),
      )
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => this.receiptsSubject.next([...this.receiptsSubject.value, saved])),
        catchError((error: unknown) => this.handleError(error, receipt.receiptNumber)),
      );
  }

  updateReceipt(receipt: StockReceipt): Observable<StockReceipt> {
    return this.api
      .put<ApiStockReceipt, ApiStockReceiptRequest>(
        `stock-receipts/${receipt.id}`,
        this.toBackend(receipt),
      )
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => {
          this.receiptsSubject.next(
            this.receiptsSubject.value.map((current) =>
              current.id === saved.id ? saved : current,
            ),
          );
        }),
        catchError((error: unknown) => this.handleError(error, receipt.receiptNumber)),
      );
  }

  deleteReceipt(id: number): Observable<void> {
    return this.api.delete<void>(`stock-receipts/${id}`).pipe(
      tap(() => {
        this.receiptsSubject.next(
          this.receiptsSubject.value.filter((receipt) => receipt.id !== id),
        );
      }),
    );
  }

  private toFrontend(receipt: ApiStockReceipt): StockReceipt {
    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      receiptDate: receipt.receiptDate,
      itemId: receipt.itemId,
      warehouseId: receipt.warehouseId,
      quantityReceived: receipt.quantity,
      status: 'Received',
    };
  }

  private toBackend(receipt: NewStockReceipt | StockReceipt): ApiStockReceiptRequest {
    return {
      receiptNumber: receipt.receiptNumber.trim(),
      itemId: receipt.itemId,
      warehouseId: receipt.warehouseId,
      quantity: receipt.quantityReceived,
      receiptDate: receipt.receiptDate,
    };
  }

  private handleError(error: unknown, receiptNumber: string): Observable<never> {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 409 &&
      this.backendErrorMessage(error)?.toLocaleLowerCase().includes('receipt number already exists')
    ) {
      return throwError(() => new DuplicateReceiptNumberError(receiptNumber));
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
    const detail = 'detail' in body ? body.detail : undefined;
    const message = 'message' in body ? body.message : undefined;
    const backendMessage = 'error' in body ? body.error : undefined;
    const text = [detail, message, backendMessage].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return text?.trim() ?? null;
  }
}
