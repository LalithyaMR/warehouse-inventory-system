import { OpeningStock } from './stock-balance.model';

export const MOCK_OPENING_STOCK: readonly OpeningStock[] = [
  { itemId: 101, warehouseId: 1, quantity: 25 },
  { itemId: 101, warehouseId: 2, quantity: 3 },
  { itemId: 102, warehouseId: 2, quantity: 4 },
  { itemId: 103, warehouseId: 1, quantity: 12 },
  { itemId: 103, warehouseId: 4, quantity: 3 },
  { itemId: 104, warehouseId: 1, quantity: 2 },
  { itemId: 105, warehouseId: 5, quantity: 5 },
];
