import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { sortRows, TableSortState } from '../../core/ui/table-sort';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { StockBalance, StockBalanceStatus } from './stock-balance.model';
import { StockBalancesService } from './stock-balances.service';

interface BalanceRow extends StockBalance {
  category: string;
  itemUnit: string;
  status: StockBalanceStatus;
}

type BalanceSortColumn =
  | 'itemName'
  | 'itemCode'
  | 'category'
  | 'warehouseName'
  | 'availableQuantity'
  | 'reorderLevel'
  | 'status';

@Component({
  selector: 'app-stock-balances',
  imports: [DecimalPipe],
  templateUrl: './stock-balances.html',
  styleUrl: './stock-balances.css',
})
export class StockBalances implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly balancesService = inject(StockBalancesService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly balances = toSignal(this.balancesService.balances$, { initialValue: [] });
  protected readonly loading = toSignal(this.balancesService.loading$, { initialValue: false });
  protected readonly loadError = toSignal(this.balancesService.loadError$, { initialValue: null });
  private readonly itemsLoading = toSignal(this.itemsService.loading$, { initialValue: false });
  private readonly warehousesLoading = toSignal(this.warehousesService.loading$, {
    initialValue: false,
  });
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
  protected readonly selectedBalance = signal<BalanceRow | null>(null);
  protected readonly sorting = new TableSortState<BalanceSortColumn>('itemName');

  protected readonly balanceRows = computed(() => {
    const itemsById = new Map<number, InventoryItem>(this.items().map((item) => [item.id, item]));
    return this.balances().map((balance): BalanceRow => {
      const item = itemsById.get(balance.itemId);
      return {
        ...balance,
        category: item?.category ?? '',
        itemUnit: item?.unit ?? '',
        status:
          balance.availableQuantity <= 0
            ? 'Out of Stock'
            : balance.lowStock
              ? 'Low Stock'
              : 'In Stock',
      };
    });
  });

  protected readonly filteredBalances = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const warehouseId = this.selectedWarehouseId();
    const category = this.selectedCategory();
    const status = this.selectedStatus();

    const filteredBalances = this.balanceRows().filter((balance) => {
      const matchesSearch =
        query.length === 0 ||
        balance.itemName.toLocaleLowerCase().includes(query) ||
        balance.itemCode.toLocaleLowerCase().includes(query);
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

  private readonly filteredItemTotals = computed(() => {
    const totalsByItem = new Map<number, { available: number; lowStock: boolean }>();
    for (const balance of this.filteredBalances()) {
      const current = totalsByItem.get(balance.itemId) ?? {
        available: 0,
        lowStock: false,
      };
      current.available += balance.availableQuantity;
      current.lowStock ||= balance.lowStock;
      totalsByItem.set(balance.itemId, current);
    }
    return [...totalsByItem.values()];
  });

  protected readonly totalItems = computed(() => this.filteredItemTotals().length);
  protected readonly totalAvailableUnits = computed(() =>
    this.filteredBalances().reduce((total, balance) => total + balance.availableQuantity, 0),
  );
  protected readonly lowStockItems = computed(
    () => this.filteredItemTotals().filter((item) => item.available > 0 && item.lowStock).length,
  );
  protected readonly outOfStockItems = computed(
    () => this.filteredItemTotals().filter((item) => item.available <= 0).length,
  );

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.balancesService.reloadBalances();
      if (!this.itemsLoading()) {
        this.itemsService.reloadItems();
      }
      if (!this.warehousesLoading()) {
        this.warehousesService.reloadWarehouses();
      }
    }
  }

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
    const warehouseId = (event.target as HTMLSelectElement).value;
    this.selectedWarehouseId.set(warehouseId);
    this.balancesService.reloadBalances(warehouseId === 'all' ? undefined : Number(warehouseId));
  }

  protected setCategory(event: Event): void {
    this.selectedCategory.set((event.target as HTMLSelectElement).value);
  }

  protected setStatus(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value);
  }

  protected clearFilters(): void {
    const warehouseFilterChanged = this.selectedWarehouseId() !== 'all';
    this.searchTerm.set('');
    this.selectedWarehouseId.set('all');
    this.selectedCategory.set('all');
    this.selectedStatus.set('all');
    if (warehouseFilterChanged) {
      this.balancesService.reloadBalances();
    }
  }

  protected retryLoad(): void {
    this.balancesService.reloadBalances(
      this.selectedWarehouseId() === 'all' ? undefined : Number(this.selectedWarehouseId()),
    );
    this.itemsService.reloadItems();
    this.warehousesService.reloadWarehouses();
  }

  protected viewDetails(balance: BalanceRow): void {
    this.selectedBalance.set(balance);
  }

  protected closeDetails(): void {
    this.selectedBalance.set(null);
  }
}
