export type StockTransferStatus = 'Pending' | 'Completed' | 'Cancelled';

export interface StockTransfer {
  id: number;
  transferNumber: string;
  transferDate: string;
  itemId: number;
  sourceWarehouseId: number;
  destinationWarehouseId: number;
  quantity: number;
  status: StockTransferStatus;
}

export type NewStockTransfer = Omit<StockTransfer, 'id'>;
