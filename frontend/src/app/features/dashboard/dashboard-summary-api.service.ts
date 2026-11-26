import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  catchError,
  finalize,
  tap,
  throwError,
} from 'rxjs';

import { ApiClient } from '../../core/api/api-client';

export interface DashboardSummary {
  totalItems: number;
  totalWarehouses: number;
  lowStockItems: number;
  totalStockQuantity: number;
  totalReceipts: number;
  totalIssues: number;
  totalTransfers: number;
  pendingTransfers: number;
  completedTransfers: number;
  cancelledTransfers: number;
  totalReceivedUnits: number;
  totalIssuedUnits: number;
  totalTransferredUnits: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardSummaryApiService {
  private readonly api = inject(ApiClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly summarySubject = new BehaviorSubject<DashboardSummary | null>(null);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);
  private reloadSubscription: Subscription | null = null;

  readonly summary$ = this.summarySubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.reloadSummary();
    }
  }

  loadSummary(): Observable<DashboardSummary> {
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    return this.api.get<DashboardSummary>('dashboard/summary').pipe(
      tap((summary) => this.summarySubject.next(summary)),
      catchError((error: unknown) => {
        this.summarySubject.next(null);
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadSummary(): void {
    this.reloadSubscription?.unsubscribe();
    this.reloadSubscription = this.loadSummary().subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }
}
