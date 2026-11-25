export type StockIssueStatus = 'Issued' | 'Cancelled';

export interface StockIssue {
  id: number;
  issueNumber: string;
  issueDate: string;
  itemId: number;
  warehouseId: number;
  quantityIssued: number;
  recipient: string;
  referenceNumber: string;
  reason: string;
  notes: string;
  status: StockIssueStatus;
}

export type NewStockIssue = Omit<StockIssue, 'id' | 'issueNumber'>;
