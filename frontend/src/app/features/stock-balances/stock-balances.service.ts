import { Injectable, inject } from '@angular/core';
import { combineLatest, map } from 'rxjs';
import { ItemsService } from '../items/items.service';
import { StockIssue } from '../stock-issues/stock-issue.model';
import { StockIssuesService } from '../stock-issues/stock-issues.service';
import { StockReceiptsService } from '../stock-receipts/stock-receipts.service';
import { StockTransfer } from '../stock-transfers/stock-transfer.model';
import { StockTransfersService } from '../stock-transfers/stock-transfers.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { MOCK_OPENING_STOCK } from './mock-opening-stock';
import { StockBalance, StockBalanceStatus } from './stock-balance.model';

@Injectable({ providedIn: 'root' })
export class StockBalancesService {
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);
  private readonly receiptsService = inject(StockReceiptsService);
  private readonly issuesService = inject(StockIssuesService);
  private readonly transfersService = inject(StockTransfersService);

  readonly balances$ = combineLatest([
    this.itemsService.items$,
    this.warehousesService.warehouses$,
    this.receiptsService.receipts$,
    this.issuesService.issues$,
    this.transfersService.transfers$,
  ]).pipe(
    map(([items, warehouses, receipts, issues, transfers]) => {
      const openingByBalance = new Map(
        MOCK_OPENING_STOCK.map((opening) => [
          this.balanceKey(opening.itemId, opening.warehouseId),
          opening.quantity,
        ]),
      );
      const receiptsByBalance = new Map<string, typeof receipts>();
      const issuesByBalance = new Map<string, StockIssue[]>();
      const transfersByBalance = new Map<string, StockTransfer[]>();
      const transfersInByBalance = new Map<string, number>();
      const transfersOutByBalance = new Map<string, number>();

      for (const receipt of receipts) {
        const key = this.balanceKey(receipt.itemId, receipt.warehouseId);
        const receiptList = receiptsByBalance.get(key) ?? [];
        receiptList.push(receipt);
        receiptsByBalance.set(key, receiptList);
      }

      for (const issue of issues) {
        const key = this.balanceKey(issue.itemId, issue.warehouseId);
        const issueList = issuesByBalance.get(key) ?? [];
        issueList.push(issue);
        issuesByBalance.set(key, issueList);
      }

      for (const transfer of transfers) {
        const sourceKey = this.balanceKey(transfer.itemId, transfer.sourceWarehouseId);
        const destinationKey = this.balanceKey(transfer.itemId, transfer.destinationWarehouseId);
        const sourceMovements = transfersByBalance.get(sourceKey) ?? [];
        sourceMovements.push(transfer);
        transfersByBalance.set(sourceKey, sourceMovements);
        const destinationMovements = transfersByBalance.get(destinationKey) ?? [];
        destinationMovements.push(transfer);
        transfersByBalance.set(destinationKey, destinationMovements);

        if (transfer.status === 'Completed') {
          transfersOutByBalance.set(
            sourceKey,
            (transfersOutByBalance.get(sourceKey) ?? 0) + transfer.quantity,
          );
          transfersInByBalance.set(
            destinationKey,
            (transfersInByBalance.get(destinationKey) ?? 0) + transfer.quantity,
          );
        }
      }

      return items.flatMap((item) =>
        warehouses.map((warehouse): StockBalance => {
          const key = this.balanceKey(item.id, warehouse.id);
          const receiptMovements = receiptsByBalance.get(key) ?? [];
          const issueMovements = issuesByBalance.get(key) ?? [];
          const transferMovements = transfersByBalance.get(key) ?? [];
          const openingStock = openingByBalance.get(key) ?? 0;
          const totalStockReceived = receiptMovements.reduce(
            (total, receipt) => total + receipt.quantityReceived,
            0,
          );
          const totalStockIssued = issueMovements.reduce(
            (total, issue) => (issue.status === 'Issued' ? total + issue.quantityIssued : total),
            0,
          );
          const totalTransfersIn = transfersInByBalance.get(key) ?? 0;
          const totalTransfersOut = transfersOutByBalance.get(key) ?? 0;
          const availableStock =
            openingStock +
            totalStockReceived +
            totalTransfersIn -
            totalStockIssued -
            totalTransfersOut;

          return {
            itemId: item.id,
            itemName: item.name,
            sku: item.sku,
            category: item.category,
            itemUnit: item.unit,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            openingStock,
            totalStockReceived,
            totalStockIssued,
            totalTransfersIn,
            totalTransfersOut,
            availableStock,
            minStockLevel: item.minStock,
            status: this.getStatus(availableStock, item.minStock),
            receipts: receiptMovements,
            issues: issueMovements,
            transfers: transferMovements.sort((left, right) =>
              left.transferDate.localeCompare(right.transferDate),
            ),
          };
        }),
      );
    }),
  );

  private balanceKey(itemId: number, warehouseId: number): string {
    return `${itemId}:${warehouseId}`;
  }

  private getStatus(availableStock: number, minStockLevel: number): StockBalanceStatus {
    if (availableStock <= 0) {
      return 'Out of Stock';
    }
    return availableStock <= minStockLevel ? 'Low Stock' : 'In Stock';
  }
}
