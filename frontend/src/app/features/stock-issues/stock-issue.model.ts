export type StockIssueStatus = 'Issued';

export interface StockIssue {
  id: number;
  issueNumber: string;
  issueDate: string;
  itemId: number;
  warehouseId: number;
  quantityIssued: number;
  status: StockIssueStatus;
}

export type NewStockIssue = Omit<StockIssue, 'id' | 'status'>;
