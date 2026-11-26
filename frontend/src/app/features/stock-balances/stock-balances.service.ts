import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { InventoryBalancesApiService } from './inventory-balances-api.service';
import { StockBalance } from './stock-balance.model';

@Injectable({ providedIn: 'root' })
export class StockBalancesService {
  private readonly inventoryBalances = inject(InventoryBalancesApiService);

  readonly balances$ = this.inventoryBalances.balances$;
  readonly loading$ = this.inventoryBalances.loading$;
  readonly loadError$ = this.inventoryBalances.loadError$;

  loadBalances(warehouseId?: number): Observable<StockBalance[]> {
    return this.inventoryBalances.loadBalances(warehouseId);
  }

  reloadBalances(warehouseId?: number): void {
    this.inventoryBalances.reloadBalances(warehouseId);
  }
}
