import { Observable } from 'rxjs';
import { InventoryItem, NewInventoryItem } from '../../features/items/item.model';
import { NewStockIssue, StockIssue } from '../../features/stock-issues/stock-issue.model';
import { NewStockReceipt, StockReceipt } from '../../features/stock-receipts/stock-receipt.model';
import {
  NewStockTransfer,
  StockTransfer,
} from '../../features/stock-transfers/stock-transfer.model';
import { StockBalance } from '../../features/stock-balances/stock-balance.model';
import { NewWarehouse, Warehouse } from '../../features/warehouses/warehouse.model';

// These ports use frontend domain models; HTTP adapters must map the backend contract when it is available.
export interface ItemsApiPort {
  listItems(): Observable<readonly InventoryItem[]>;
  createItem(item: NewInventoryItem): Observable<InventoryItem>;
  updateItem(item: InventoryItem): Observable<InventoryItem>;
  deleteItem(id: number): Observable<void>;
}

export interface WarehousesApiPort {
  listWarehouses(): Observable<readonly Warehouse[]>;
  createWarehouse(warehouse: NewWarehouse): Observable<Warehouse>;
  updateWarehouse(warehouse: Warehouse): Observable<Warehouse>;
  deleteWarehouse(id: number): Observable<void>;
}

export interface StockReceiptsApiPort {
  listReceipts(): Observable<readonly StockReceipt[]>;
  createReceipt(receipt: NewStockReceipt): Observable<StockReceipt>;
  updateReceipt(receipt: StockReceipt): Observable<StockReceipt>;
  deleteReceipt(id: number): Observable<void>;
}

export interface StockIssuesApiPort {
  listIssues(): Observable<readonly StockIssue[]>;
  createIssue(issue: NewStockIssue): Observable<StockIssue>;
  updateIssue(issue: StockIssue): Observable<StockIssue>;
  deleteIssue(id: number): Observable<void>;
}

export interface StockTransfersApiPort {
  listTransfers(): Observable<readonly StockTransfer[]>;
  createTransfer(transfer: NewStockTransfer): Observable<StockTransfer>;
  updateTransfer(transfer: StockTransfer): Observable<StockTransfer>;
  deleteTransfer(id: number): Observable<void>;
}

export interface StockBalancesApiPort {
  listBalances(): Observable<readonly StockBalance[]>;
}
