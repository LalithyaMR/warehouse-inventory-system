import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { StockTransfer } from '../stock-transfers/stock-transfer.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { StockBalance, StockBalanceStatus } from './stock-balance.model';
import { StockBalancesService } from './stock-balances.service';
import { sortRows, TableSortState } from '../../core/ui/table-sort';

type BalanceSortColumn =
  | 'itemName'
  | 'sku'
  | 'category'
  | 'warehouseName'
  | 'openingStock'
  | 'totalStockReceived'
  | 'totalStockIssued'
  | 'totalTransfersIn'
  | 'totalTransfersOut'
  | 'availableStock'
  | 'minStockLevel'
  | 'status';

@Component({
  selector: 'app-stock-balances',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './stock-balances.html',
  styleUrl: './stock-balances.css',
})
export class StockBalances {
  private readonly balancesService = inject(StockBalancesService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly balances = toSignal(this.balancesService.balances$, { initialValue: [] });
  protected readonly statuses: readonly StockBalanceStatus[] = [
    'In Stock',
    'Low Stock',
    'Out of Stock',
  ];
  protected readonly categories = computed(() =>
    [...new Set(this.items().map((item: InventoryItem) => item.category))].sort(),
  );
  protected readonly searchTerm = signal('');
  protected readonly selectedWarehouseId = signal('all');
  protected readonly selectedCategory = signal('all');
  protected readonly selectedStatus = signal('all');
  protected readonly selectedBalance = signal<StockBalance | null>(null);
  protected readonly sorting = new TableSortState<BalanceSortColumn>('itemName');

  protected readonly filteredBalances = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const warehouseId = this.selectedWarehouseId();
    const category = this.selectedCategory();
    const status = this.selectedStatus();

    const filteredBalances = this.balances().filter((balance) => {
      const matchesSearch =
        query.length === 0 ||
        balance.itemName.toLocaleLowerCase().includes(query) ||
        balance.sku.toLocaleLowerCase().includes(query);
      const matchesWarehouse = warehouseId === 'all' || String(balance.warehouseId) === warehouseId;
      const matchesCategory = category === 'all' || balance.category === category;
      const matchesStatus = status === 'all' || balance.status === status;

      return matchesSearch && matchesWarehouse && matchesCategory && matchesStatus;
    });

    return sortRows(
      filteredBalances,
      (balance) => balance[this.sorting.column()],
      this.sorting.direction(),
    );
  });

  protected readonly filteredItemTotals = computed(() => {
    const totalsByItem = new Map<number, { availableStock: number; minStockLevel: number }>();

    for (const balance of this.filteredBalances()) {
      const current = totalsByItem.get(balance.itemId) ?? {
        availableStock: 0,
        minStockLevel: balance.minStockLevel,
      };
      current.availableStock += balance.availableStock;
      totalsByItem.set(balance.itemId, current);
    }

    return [...totalsByItem.values()];
  });
  protected readonly totalItems = computed(() => this.filteredItemTotals().length);
  protected readonly totalAvailableUnits = computed(() =>
    this.filteredBalances().reduce((total, balance) => total + balance.availableStock, 0),
  );
  protected readonly lowStockItems = computed(
    () =>
      this.filteredItemTotals().filter(
        (item) => item.availableStock > 0 && item.availableStock <= item.minStockLevel,
      ).length,
  );
  protected readonly outOfStockItems = computed(
    () => this.filteredItemTotals().filter((item) => item.availableStock <= 0).length,
  );

  protected hasActiveFilters(): boolean {
    return (
      this.searchTerm().length > 0 ||
      this.selectedWarehouseId() !== 'all' ||
      this.selectedCategory() !== 'all' ||
      this.selectedStatus() !== 'all'
    );
  }

  protected setSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected setWarehouse(event: Event): void {
    this.selectedWarehouseId.set((event.target as HTMLSelectElement).value);
  }

  protected setCategory(event: Event): void {
    this.selectedCategory.set((event.target as HTMLSelectElement).value);
  }

  protected setStatus(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.selectedWarehouseId.set('all');
    this.selectedCategory.set('all');
    this.selectedStatus.set('all');
  }

  protected viewDetails(balance: StockBalance): void {
    this.selectedBalance.set(balance);
  }

  protected closeDetails(): void {
    this.selectedBalance.set(null);
  }

  protected transferDirection(transfer: StockTransfer, balance: StockBalance): string {
    if (transfer.sourceWarehouseId === balance.warehouseId) {
      const destination = this.warehouses().find(
        (warehouse) => warehouse.id === transfer.destinationWarehouseId,
      );
      return `To ${destination?.name ?? `warehouse #${transfer.destinationWarehouseId}`}`;
    }

    const source = this.warehouses().find(
      (warehouse) => warehouse.id === transfer.sourceWarehouseId,
    );
    return `From ${source?.name ?? `warehouse #${transfer.sourceWarehouseId}`}`;
  }
}
