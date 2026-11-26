export type WarehouseStatus = 'Active' | 'Inactive';

export interface Warehouse {
  id: number;
  name: string;
  code: string;
  location: string;
  status: WarehouseStatus;
}

export type NewWarehouse = Omit<Warehouse, 'id' | 'status'>;
