export type StockBalanceStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export interface InventoryBalanceSnapshot {
  itemId: number;
  itemCode: string;
  itemName: string;
  warehouseId: number;
  warehouseName: string;
  availableQuantity: number;
  reorderLevel: number;
  lowStock: boolean;
}

export type StockBalance = InventoryBalanceSnapshot;
