import { Injectable, inject } from '@angular/core';
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
import { InventoryBalanceSnapshot } from './stock-balance.model';

export type { InventoryBalanceSnapshot } from './stock-balance.model';

@Injectable({ providedIn: 'root' })
export class InventoryBalancesApiService {
  private readonly api = inject(ApiClient);
  private readonly balancesSubject = new BehaviorSubject<InventoryBalanceSnapshot[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);
  private reloadSubscription: Subscription | null = null;
  private requestedWarehouseId: number | null = null;

  readonly balances$ = this.balancesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  loadBalances(warehouseId?: number): Observable<InventoryBalanceSnapshot[]> {
    const requestedWarehouseId = warehouseId ?? null;
    if (this.requestedWarehouseId !== requestedWarehouseId) {
      this.balancesSubject.next([]);
      this.requestedWarehouseId = requestedWarehouseId;
    }
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    const resourcePath =
      warehouseId === undefined
        ? 'inventory/balances'
        : `inventory/balances?warehouseId=${encodeURIComponent(warehouseId)}`;

    return this.api.get<InventoryBalanceSnapshot[]>(resourcePath).pipe(
      tap((balances) => this.balancesSubject.next(balances)),
      catchError((error: unknown) => {
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadBalances(warehouseId?: number): void {
    this.reloadSubscription?.unsubscribe();
    this.reloadSubscription = this.loadBalances(warehouseId).subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }

  getCurrentBalances(): readonly InventoryBalanceSnapshot[] {
    return this.balancesSubject.value;
  }
}
