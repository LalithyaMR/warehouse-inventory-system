export type ReceiptStatus = 'Received';

export interface StockReceipt {
  id: number;
  receiptNumber: string;
  receiptDate: string;
  itemId: number;
  warehouseId: number;
  supplierName: string;
  quantityReceived: number;
  referenceNumber: string;
  notes: string;
  status: ReceiptStatus;
}

export type NewStockReceipt = Omit<StockReceipt, 'id'>;
