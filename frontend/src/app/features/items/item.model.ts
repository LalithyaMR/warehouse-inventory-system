export type ItemStatus = 'Active' | 'Inactive';

export interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  category: string;
  unit: string;
  minStock: number;
  status: ItemStatus;
}

export type NewInventoryItem = Omit<InventoryItem, 'id'>;

export const ITEM_CATEGORIES = [
  'Packaging',
  'Electronics',
  'Office Supplies',
  'Raw Materials',
  'Safety',
] as const;

export const ITEM_UNITS = ['Each', 'Box', 'Case', 'Roll', 'Kg', 'Litre', 'Pair'] as const;
