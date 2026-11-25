export type StockTransferStatus = 'Pending' | 'In Transit' | 'Completed' | 'Cancelled';

export interface StockTransfer {
  id: number;
  transferNumber: string;
  transferDate: string;
  itemId: number;
  sourceWarehouseId: number;
  destinationWarehouseId: number;
  quantity: number;
  referenceNumber: string;
  notes: string;
  status: StockTransferStatus;
}

export type NewStockTransfer = Omit<StockTransfer, 'id' | 'transferNumber'>;
