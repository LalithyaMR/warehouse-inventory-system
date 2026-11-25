import { StockIssue } from '../stock-issues/stock-issue.model';
import { StockReceipt } from '../stock-receipts/stock-receipt.model';
import { StockTransfer } from '../stock-transfers/stock-transfer.model';

export type StockBalanceStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export interface OpeningStock {
  itemId: number;
  warehouseId: number;
  quantity: number;
}

export interface StockBalance {
  itemId: number;
  itemName: string;
  sku: string;
  category: string;
  itemUnit: string;
  warehouseId: number;
  warehouseName: string;
  openingStock: number;
  totalStockReceived: number;
  totalStockIssued: number;
  totalTransfersIn: number;
  totalTransfersOut: number;
  availableStock: number;
  minStockLevel: number;
  status: StockBalanceStatus;
  receipts: readonly StockReceipt[];
  issues: readonly StockIssue[];
  transfers: readonly StockTransfer[];
}
