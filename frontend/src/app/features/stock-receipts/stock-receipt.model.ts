export type ReceiptStatus = 'Received';

export interface StockReceipt {
  id: number;
  receiptNumber: string;
  receiptDate: string;
  itemId: number;
  warehouseId: number;
  quantityReceived: number;
  status: ReceiptStatus;
}

export type NewStockReceipt = Omit<StockReceipt, 'id' | 'status'>;
