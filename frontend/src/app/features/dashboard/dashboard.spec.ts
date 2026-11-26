import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';

import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { StockIssue } from '../stock-issues/stock-issue.model';
import { StockIssuesService } from '../stock-issues/stock-issues.service';
import { StockReceipt } from '../stock-receipts/stock-receipt.model';
import { StockReceiptsService } from '../stock-receipts/stock-receipts.service';
import { StockTransfer } from '../stock-transfers/stock-transfer.model';
import { StockTransfersService } from '../stock-transfers/stock-transfers.service';
import { StockBalance } from '../stock-balances/stock-balance.model';
import { StockBalancesService } from '../stock-balances/stock-balances.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { Dashboard } from './dashboard';
import { DashboardSummary, DashboardSummaryApiService } from './dashboard-summary-api.service';

const API_URL = 'http://localhost:8080/api/dashboard/summary';

const dashboardSummary: DashboardSummary = {
  totalItems: 12,
  totalWarehouses: 2,
  lowStockItems: 2,
  totalStockQuantity: 6.5,
  totalReceipts: 14,
  totalIssues: 8,
  totalTransfers: 9,
  pendingTransfers: 2,
  completedTransfers: 5,
  cancelledTransfers: 2,
  totalReceivedUnits: 140.5,
  totalIssuedUnits: 82,
  totalTransferredUnits: 35.5,
};

const items: InventoryItem[] = [
  {
    id: 1,
    name: 'Storage box',
    sku: 'BOX-01',
    category: 'Packaging',
    unit: 'Each',
    minStock: 5,
    status: 'Active',
  },
  {
    id: 2,
    name: 'Packing tape',
    sku: 'TAPE-02',
    category: 'Packaging',
    unit: 'Roll',
    minStock: 2,
    status: 'Active',
  },
];

const warehouses: Warehouse[] = [
  { id: 1, code: 'NORTH', name: 'North warehouse', location: 'North', status: 'Active' },
  { id: 2, code: 'SOUTH', name: 'South warehouse', location: 'South', status: 'Active' },
  { id: 3, code: 'CLOSED', name: 'Inactive warehouse', location: 'Closed', status: 'Inactive' },
];

const balances: StockBalance[] = [
  {
    itemId: 1,
    itemCode: 'BOX-01',
    itemName: 'Storage box',
    warehouseId: 1,
    warehouseName: 'North warehouse',
    availableQuantity: 2,
    reorderLevel: 5,
    lowStock: true,
  },
  {
    itemId: 1,
    itemCode: 'BOX-01',
    itemName: 'Storage box',
    warehouseId: 2,
    warehouseName: 'South warehouse',
    availableQuantity: 4,
    reorderLevel: 5,
    lowStock: true,
  },
  {
    itemId: 2,
    itemCode: 'TAPE-02',
    itemName: 'Packing tape',
    warehouseId: 1,
    warehouseName: 'North warehouse',
    availableQuantity: 0,
    reorderLevel: 2,
    lowStock: true,
  },
  {
    itemId: 2,
    itemCode: 'TAPE-02',
    itemName: 'Packing tape',
    warehouseId: 2,
    warehouseName: 'South warehouse',
    availableQuantity: 0,
    reorderLevel: 2,
    lowStock: true,
  },
];

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('DashboardSummaryApiService', () => {
  let service: DashboardSummaryApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(DashboardSummaryApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the backend dashboard summary DTO', async () => {
    const result = firstValueFrom(service.loadSummary());
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush(dashboardSummary);

    await expect(result).resolves.toEqual(dashboardSummary);
  });

  it('clears stale summary data and exposes an API failure', async () => {
    const initialRequest = firstValueFrom(service.loadSummary());
    http.expectOne(API_URL).flush(dashboardSummary);
    await initialRequest;

    const failedRequest = firstValueFrom(service.loadSummary());
    http
      .expectOne(API_URL)
      .flush(
        { message: 'Dashboard unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );

    await expect(failedRequest).rejects.toMatchObject({ status: 503 });
    await expect(firstValueFrom(service.summary$)).resolves.toBeNull();
    await expect(firstValueFrom(service.loadError$)).resolves.toMatchObject({ status: 503 });
  });
});

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let summarySubject: BehaviorSubject<DashboardSummary | null>;
  let itemReload: ReturnType<typeof vi.fn>;
  let warehouseReload: ReturnType<typeof vi.fn>;
  let balanceReload: ReturnType<typeof vi.fn>;
  let receiptReload: ReturnType<typeof vi.fn>;
  let issueReload: ReturnType<typeof vi.fn>;
  let transferReload: ReturnType<typeof vi.fn>;
  let summaryReload: ReturnType<typeof vi.fn>;
  let loadErrors: BehaviorSubject<unknown | null>[];

  beforeEach(async () => {
    const today = localDateKey(new Date());
    const receipts: StockReceipt[] = [
      {
        id: 1,
        receiptNumber: 'RCV-1001',
        receiptDate: today,
        itemId: 1,
        warehouseId: 1,
        quantityReceived: 10,
        status: 'Received',
      },
    ];
    const issues: StockIssue[] = [
      {
        id: 2,
        issueNumber: 'ISS-2001',
        issueDate: today,
        itemId: 1,
        warehouseId: 1,
        quantityIssued: 2,
        status: 'Issued',
      },
    ];
    const transfers: StockTransfer[] = [
      {
        id: 3,
        transferNumber: 'TRF-3001',
        transferDate: today,
        itemId: 1,
        sourceWarehouseId: 1,
        destinationWarehouseId: 2,
        quantity: 1,
        status: 'Completed',
      },
      {
        id: 4,
        transferNumber: 'TRF-3002',
        transferDate: today,
        itemId: 2,
        sourceWarehouseId: 2,
        destinationWarehouseId: 1,
        quantity: 4,
        status: 'Pending',
      },
    ];

    summarySubject = new BehaviorSubject<DashboardSummary | null>(dashboardSummary);
    loadErrors = Array.from({ length: 7 }, () => new BehaviorSubject<unknown | null>(null));
    itemReload = vi.fn();
    warehouseReload = vi.fn();
    balanceReload = vi.fn();
    receiptReload = vi.fn();
    issueReload = vi.fn();
    transferReload = vi.fn();
    summaryReload = vi.fn();

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ItemsService,
          useValue: {
            items$: of(items),
            loading$: of(false),
            loadError$: loadErrors[0].asObservable(),
            reloadItems: itemReload,
          },
        },
        {
          provide: WarehousesService,
          useValue: {
            warehouses$: of(warehouses),
            loading$: of(false),
            loadError$: loadErrors[1].asObservable(),
            reloadWarehouses: warehouseReload,
          },
        },
        {
          provide: StockBalancesService,
          useValue: {
            balances$: of(balances),
            loading$: of(false),
            loadError$: loadErrors[2].asObservable(),
            reloadBalances: balanceReload,
          },
        },
        {
          provide: StockReceiptsService,
          useValue: {
            receipts$: of(receipts),
            loading$: of(false),
            loadError$: loadErrors[3].asObservable(),
            reloadReceipts: receiptReload,
          },
        },
        {
          provide: StockIssuesService,
          useValue: {
            issues$: of(issues),
            loading$: of(false),
            loadError$: loadErrors[4].asObservable(),
            reloadIssues: issueReload,
          },
        },
        {
          provide: StockTransfersService,
          useValue: {
            transfers$: of(transfers),
            loading$: of(false),
            loadError$: loadErrors[5].asObservable(),
            reloadTransfers: transferReload,
          },
        },
        {
          provide: DashboardSummaryApiService,
          useValue: {
            summary$: summarySubject.asObservable(),
            loading$: of(false),
            loadError$: loadErrors[6].asObservable(),
            reloadSummary: summaryReload,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
  });

  it('renders dashboard totals from the API summary and derives out-of-stock items from balances', () => {
    const values = Array.from(
      fixture.nativeElement.querySelectorAll('.stat-value') as NodeListOf<HTMLElement>,
      (element) => element.textContent?.trim() ?? '',
    );
    expect(values).toEqual(['12', '2', '6.5', '2', '1']);

    const movementSummary = fixture.nativeElement.querySelector(
      '.dashboard-api-summary',
    ) as HTMLElement;
    expect(movementSummary.textContent).toContain('Receipts 14');
    expect(movementSummary.textContent).toContain('Pending 2');
    expect(movementSummary.textContent).toContain('Transferred 35.5');

    expect(fixture.nativeElement.querySelectorAll('.warehouse-table tbody tr').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.warehouse-table')?.textContent).not.toContain(
      'Inactive warehouse',
    );
  });

  it('charts real completed movements and excludes pending transfers', () => {
    const chart = fixture.nativeElement.querySelector('.movement-chart') as SVGElement;
    expect(fixture.nativeElement.querySelectorAll('.chart-day').length).toBe(7);
    expect(chart.getAttribute('aria-label')).toContain(
      '1 receipts, 1 issues, and 1 completed transfers',
    );
    expect(fixture.nativeElement.querySelector('.chart-summary')?.textContent).toContain('3');
  });

  it('shows recent movement records and links to all application sections', () => {
    const recentPanels = fixture.nativeElement.querySelectorAll(
      '.recent-panels .recent-panel',
    ) as NodeListOf<HTMLElement>;
    expect(recentPanels.length).toBe(3);
    for (const panel of Array.from(recentPanels)) {
      expect(panel.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    }

    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.dashboard-shortcuts a',
      ) as NodeListOf<HTMLAnchorElement>,
      (anchor) => anchor.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      '/dashboard',
      '/items',
      '/warehouses',
      '/stock-receipts',
      '/stock-issues',
      '/stock-transfers',
      '/stock-balances',
    ]);
  });

  it('reloads backend data when the dashboard is entered again', () => {
    expect(itemReload).toHaveBeenCalledOnce();
    expect(warehouseReload).toHaveBeenCalledOnce();
    expect(balanceReload).toHaveBeenCalledOnce();
    expect(receiptReload).toHaveBeenCalledOnce();
    expect(issueReload).toHaveBeenCalledOnce();
    expect(transferReload).toHaveBeenCalledOnce();
    expect(summaryReload).toHaveBeenCalledOnce();
  });

  it('refreshes dashboard sources when requested', () => {
    (fixture.nativeElement.querySelector('.heading-actions button') as HTMLButtonElement).click();

    expect(itemReload).toHaveBeenCalledTimes(2);
    expect(warehouseReload).toHaveBeenCalledTimes(2);
    expect(balanceReload).toHaveBeenCalledTimes(2);
    expect(receiptReload).toHaveBeenCalledTimes(2);
    expect(issueReload).toHaveBeenCalledTimes(2);
    expect(transferReload).toHaveBeenCalledTimes(2);
    expect(summaryReload).toHaveBeenCalledTimes(2);
  });

  it('shows an error when an API source fails', () => {
    loadErrors[6].next(new Error('Dashboard summary unavailable'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Some dashboard data could not be loaded',
    );
  });
});
