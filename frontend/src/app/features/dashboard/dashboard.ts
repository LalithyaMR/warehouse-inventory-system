import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { StockIssue } from '../stock-issues/stock-issue.model';
import { StockIssuesService } from '../stock-issues/stock-issues.service';
import { StockReceipt } from '../stock-receipts/stock-receipt.model';
import { StockReceiptsService } from '../stock-receipts/stock-receipts.service';
import { StockTransfer } from '../stock-transfers/stock-transfer.model';
import { StockTransfersService } from '../stock-transfers/stock-transfers.service';
import { StockBalance, StockBalanceStatus } from '../stock-balances/stock-balance.model';
import { StockBalancesService } from '../stock-balances/stock-balances.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';

interface RecentReceipt extends StockReceipt {
  itemName: string;
  warehouseName: string;
  itemUnit: string;
}

interface RecentIssue extends StockIssue {
  itemName: string;
  warehouseName: string;
  itemUnit: string;
}

interface RecentTransfer extends StockTransfer {
  itemName: string;
  sourceWarehouseName: string;
  destinationWarehouseName: string;
  itemUnit: string;
}

interface WarehouseSummary {
  warehouse: Warehouse;
  availableStock: number;
  lowStockCount: number;
  outOfStockCount: number;
}

interface MovementChartDay {
  key: string;
  label: string;
  fullDate: string;
  x: number;
  receiptCount: number;
  issueCount: number;
  transferCount: number;
  receiptY: number;
  issueY: number;
  transferY: number;
}

interface MovementChart {
  days: MovementChartDay[];
  receiptPoints: string;
  issuePoints: string;
  transferPoints: string;
  receiptTotal: number;
  issueTotal: number;
  transferTotal: number;
  totalRecords: number;
  ariaLabel: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly currentDate = new Date();

  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);
  private readonly balancesService = inject(StockBalancesService);
  private readonly receiptsService = inject(StockReceiptsService);
  private readonly issuesService = inject(StockIssuesService);
  private readonly transfersService = inject(StockTransfersService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly balances = toSignal(this.balancesService.balances$, { initialValue: [] });
  protected readonly receipts = toSignal(this.receiptsService.receipts$, { initialValue: [] });
  protected readonly issues = toSignal(this.issuesService.issues$, { initialValue: [] });
  protected readonly transfers = toSignal(this.transfersService.transfers$, { initialValue: [] });

  private readonly itemMap = computed(
    () => new Map<number, InventoryItem>(this.items().map((item) => [item.id, item])),
  );
  private readonly warehouseMap = computed(
    () =>
      new Map<number, Warehouse>(this.warehouses().map((warehouse) => [warehouse.id, warehouse])),
  );

  private readonly itemTotals = computed(() => {
    const totals = new Map<number, { availableStock: number; minStockLevel: number }>();
    for (const balance of this.balances()) {
      const current = totals.get(balance.itemId) ?? {
        availableStock: 0,
        minStockLevel: balance.minStockLevel,
      };
      current.availableStock += balance.availableStock;
      totals.set(balance.itemId, current);
    }
    return [...totals.values()];
  });

  protected readonly stats = computed(() => [
    {
      label: 'Total Items',
      value: this.items().length,
      detail: 'Items in the catalog',
      icon: 'IT',
      tone: 'green',
    },
    {
      label: 'Total Warehouses',
      value: this.warehouses().length,
      detail: 'All warehouse locations',
      icon: 'WH',
      tone: 'blue',
    },
    {
      label: 'Total Available Stock',
      value: this.balances().reduce((total, balance) => total + balance.availableStock, 0),
      detail: 'Across all warehouses',
      icon: 'QTY',
      tone: 'purple',
    },
    {
      label: 'Low Stock Items',
      value: this.itemTotals().filter(
        (item) => item.availableStock > 0 && item.availableStock <= item.minStockLevel,
      ).length,
      detail: 'Below minimum overall',
      icon: 'LOW',
      tone: 'orange',
    },
    {
      label: 'Out of Stock Items',
      value: this.itemTotals().filter((item) => item.availableStock <= 0).length,
      detail: 'No stock across warehouses',
      icon: 'OUT',
      tone: 'red',
    },
  ]);

  protected readonly movementChart = computed(() => this.createMovementChart());

  protected readonly recentReceipts = computed(() => {
    const items = this.itemMap();
    const warehouses = this.warehouseMap();

    return [...this.receipts()]
      .sort((left, right) => right.receiptDate.localeCompare(left.receiptDate))
      .slice(0, 5)
      .map((receipt): RecentReceipt => {
        const item = items.get(receipt.itemId);
        const warehouse = warehouses.get(receipt.warehouseId);
        return {
          ...receipt,
          itemName: item?.name ?? `Unavailable item #${receipt.itemId}`,
          itemUnit: item?.unit ?? '',
          warehouseName: warehouse?.name ?? `Unavailable warehouse #${receipt.warehouseId}`,
        };
      });
  });

  protected readonly recentIssues = computed(() => {
    const items = this.itemMap();
    const warehouses = this.warehouseMap();

    return [...this.issues()]
      .sort((left, right) => right.issueDate.localeCompare(left.issueDate))
      .slice(0, 5)
      .map((issue): RecentIssue => {
        const item = items.get(issue.itemId);
        const warehouse = warehouses.get(issue.warehouseId);
        return {
          ...issue,
          itemName: item?.name ?? `Unavailable item #${issue.itemId}`,
          itemUnit: item?.unit ?? '',
          warehouseName: warehouse?.name ?? `Unavailable warehouse #${issue.warehouseId}`,
        };
      });
  });

  protected readonly recentTransfers = computed(() => {
    const items = this.itemMap();
    const warehouses = this.warehouseMap();

    return [...this.transfers()]
      .sort((left, right) => right.transferDate.localeCompare(left.transferDate))
      .slice(0, 5)
      .map((transfer): RecentTransfer => {
        const item = items.get(transfer.itemId);
        const source = warehouses.get(transfer.sourceWarehouseId);
        const destination = warehouses.get(transfer.destinationWarehouseId);
        return {
          ...transfer,
          itemName: item?.name ?? `Unavailable item #${transfer.itemId}`,
          itemUnit: item?.unit ?? '',
          sourceWarehouseName:
            source?.name ?? `Unavailable warehouse #${transfer.sourceWarehouseId}`,
          destinationWarehouseName:
            destination?.name ?? `Unavailable warehouse #${transfer.destinationWarehouseId}`,
        };
      });
  });

  protected readonly warehouseSummaries = computed(() => {
    const balances = this.balances();

    return this.warehouses().map((warehouse): WarehouseSummary => {
      const warehouseBalances = balances.filter((balance) => balance.warehouseId === warehouse.id);
      return {
        warehouse,
        availableStock: warehouseBalances.reduce(
          (total, balance) => total + balance.availableStock,
          0,
        ),
        lowStockCount: warehouseBalances.filter((balance) => balance.status === 'Low Stock').length,
        outOfStockCount: warehouseBalances.filter((balance) => balance.status === 'Out of Stock')
          .length,
      };
    });
  });

  protected readonly stockAlerts = computed(() =>
    this.balances()
      .filter((balance) => balance.status !== 'In Stock')
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'Out of Stock' ? -1 : 1;
        }
        return left.availableStock - right.availableStock;
      })
      .slice(0, 6),
  );

  protected stockStatusClass(status: StockBalanceStatus): string {
    switch (status) {
      case 'In Stock':
        return 'text-bg-success';
      case 'Low Stock':
        return 'text-bg-warning';
      case 'Out of Stock':
        return 'text-bg-danger';
    }
  }

  private createMovementChart(): MovementChart {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return {
        date,
        key: this.dateKey(date),
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        fullDate: date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
      };
    });
    const dateKeys = new Set(dates.map((date) => date.key));
    const receiptCounts = this.countByDate(
      this.receipts()
        .filter((receipt) => receipt.status === 'Received')
        .map((receipt) => receipt.receiptDate),
      dateKeys,
    );
    const issueCounts = this.countByDate(
      this.issues()
        .filter((issue) => issue.status === 'Issued')
        .map((issue) => issue.issueDate),
      dateKeys,
    );
    const transferCounts = this.countByDate(
      this.transfers()
        .filter((transfer) => transfer.status !== 'Cancelled')
        .map((transfer) => transfer.transferDate),
      dateKeys,
    );
    const counts = dates.flatMap((date) => [
      receiptCounts.get(date.key) ?? 0,
      issueCounts.get(date.key) ?? 0,
      transferCounts.get(date.key) ?? 0,
    ]);
    const maximum = Math.max(1, ...counts);
    const days = dates.map((date, index): MovementChartDay => {
      const receiptCount = receiptCounts.get(date.key) ?? 0;
      const issueCount = issueCounts.get(date.key) ?? 0;
      const transferCount = transferCounts.get(date.key) ?? 0;
      const yFor = (count: number) => 170 - (count / maximum) * 130;

      return {
        ...date,
        x: 45 + index * 100,
        receiptCount,
        issueCount,
        transferCount,
        receiptY: yFor(receiptCount),
        issueY: yFor(issueCount),
        transferY: yFor(transferCount),
      };
    });
    const receiptTotal = days.reduce((total, day) => total + day.receiptCount, 0);
    const issueTotal = days.reduce((total, day) => total + day.issueCount, 0);
    const transferTotal = days.reduce((total, day) => total + day.transferCount, 0);
    const firstDate = dates[0].fullDate;
    const lastDate = dates[dates.length - 1].fullDate;

    return {
      days,
      receiptPoints: days.map((day) => `${day.x},${day.receiptY}`).join(' '),
      issuePoints: days.map((day) => `${day.x},${day.issueY}`).join(' '),
      transferPoints: days.map((day) => `${day.x},${day.transferY}`).join(' '),
      receiptTotal,
      issueTotal,
      transferTotal,
      totalRecords: receiptTotal + issueTotal + transferTotal,
      ariaLabel: `Movement records from ${firstDate} to ${lastDate}: ${receiptTotal} receipts, ${issueTotal} issues, and ${transferTotal} transfers`,
    };
  }

  private countByDate(dates: string[], allowedDates: Set<string>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const date of dates) {
      if (allowedDates.has(date)) {
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }
    }
    return counts;
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
