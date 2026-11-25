import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewStockReceipt } from '../stock-receipts/stock-receipt.model';
import { StockReceiptsService } from '../stock-receipts/stock-receipts.service';
import { StockIssuesService } from '../stock-issues/stock-issues.service';
import { NewStockIssue } from '../stock-issues/stock-issue.model';
import { StockTransfersService } from '../stock-transfers/stock-transfers.service';
import { StockBalancesService } from './stock-balances.service';
import { StockBalances } from './stock-balances';

describe('StockBalancesService', () => {
  let service: StockBalancesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StockBalancesService);
  });

  it('calculates balances from opening stock and completed stock movements', async () => {
    const balances = await firstValueFrom(service.balances$);
    const mainCartons = balances.find(
      (balance) => balance.itemId === 101 && balance.warehouseId === 1,
    );
    const cancelledIssueItem = balances.find(
      (balance) => balance.itemId === 106 && balance.warehouseId === 3,
    );
    const lowStock = balances.find(
      (balance) => balance.itemId === 104 && balance.warehouseId === 1,
    );
    const outOfStock = balances.find(
      (balance) => balance.itemId === 105 && balance.warehouseId === 1,
    );

    expect(mainCartons).toMatchObject({
      openingStock: 25,
      totalStockReceived: 120,
      totalStockIssued: 24,
      totalTransfersIn: 0,
      totalTransfersOut: 20,
      availableStock: 101,
      status: 'In Stock',
    });
    expect(cancelledIssueItem).toMatchObject({
      totalStockReceived: 18,
      totalStockIssued: 0,
      totalTransfersOut: 0,
      totalTransfersIn: 0,
      availableStock: 18,
      status: 'In Stock',
    });
    expect(lowStock?.status).toBe('Low Stock');
    expect(outOfStock?.status).toBe('Out of Stock');
  });

  it('recomputes balances when a receipt is added', async () => {
    const receiptsService = TestBed.inject(StockReceiptsService);
    const receipt: NewStockReceipt = {
      receiptNumber: 'RCV-3010',
      receiptDate: '2026-11-25',
      itemId: 101,
      warehouseId: 1,
      supplierName: 'Test supplier',
      quantityReceived: 10,
      referenceNumber: '',
      notes: '',
      status: 'Received',
    };

    receiptsService.addReceipt(receipt);

    const balances = await firstValueFrom(service.balances$);
    const mainCartons = balances.find(
      (balance) => balance.itemId === 101 && balance.warehouseId === 1,
    );
    expect(mainCartons?.totalStockReceived).toBe(130);
    expect(mainCartons?.availableStock).toBe(111);
  });

  it('recomputes balances when the existing issue service emits a new issue', async () => {
    const issuesService = TestBed.inject(StockIssuesService);
    const issue: NewStockIssue = {
      issueDate: '2026-11-25',
      itemId: 101,
      warehouseId: 1,
      quantityIssued: 5,
      recipient: 'Test Department',
      referenceNumber: '',
      reason: 'Balance calculation test',
      notes: '',
      status: 'Issued',
    };

    issuesService.addIssue(issue);

    const balances = await firstValueFrom(service.balances$);
    const mainCartons = balances.find(
      (balance) => balance.itemId === 101 && balance.warehouseId === 1,
    );
    expect(mainCartons?.totalStockIssued).toBe(29);
    expect(mainCartons?.availableStock).toBe(96);
  });

  it('moves stock only when a transfer becomes completed', async () => {
    const transfersService = TestBed.inject(StockTransfersService);
    const existingTransfer = (await firstValueFrom(transfersService.transfers$)).find(
      (transfer) => transfer.transferNumber === 'TRF-4003',
    );
    expect(existingTransfer?.status).toBe('Pending');
    if (!existingTransfer) {
      throw new Error('Expected seeded pending transfer TRF-4003.');
    }

    transfersService.updateTransfer({ ...existingTransfer, status: 'Completed' });

    const balances = await firstValueFrom(service.balances$);
    const source = balances.find((balance) => balance.itemId === 103 && balance.warehouseId === 4);
    const destination = balances.find(
      (balance) => balance.itemId === 103 && balance.warehouseId === 1,
    );
    expect(source).toMatchObject({ totalTransfersOut: 8, availableStock: 28 });
    expect(destination).toMatchObject({ totalTransfersIn: 8, availableStock: 20 });
  });

  it('does not count pending, in-transit, or cancelled transfers', async () => {
    const balances = await firstValueFrom(service.balances$);
    const inTransitSource = balances.find(
      (balance) => balance.itemId === 102 && balance.warehouseId === 2,
    );
    const cancelledDestination = balances.find(
      (balance) => balance.itemId === 106 && balance.warehouseId === 5,
    );

    expect(inTransitSource?.totalTransfersOut).toBe(0);
    expect(cancelledDestination?.totalTransfersIn).toBe(0);
  });

  it('rejects issues that exceed available stock', () => {
    const issuesService = TestBed.inject(StockIssuesService);
    const issue: NewStockIssue = {
      issueDate: '2026-11-25',
      itemId: 105,
      warehouseId: 1,
      quantityIssued: 1,
      recipient: 'Test Department',
      referenceNumber: '',
      reason: 'Stock guard test',
      notes: '',
      status: 'Issued',
    };

    expect(() => issuesService.addIssue(issue)).toThrow('0 available, but 1 requested');
  });
});

describe('StockBalances', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StockBalances] }).compileComponents();
  });

  it('summarizes distinct items and totals across their visible warehouse balances', () => {
    const fixture = TestBed.createComponent(StockBalances);
    fixture.detectChanges();

    const summaryCards = fixture.nativeElement.querySelectorAll(
      '.summary-card strong',
    ) as NodeListOf<HTMLElement>;
    const summaryValues = Array.from(summaryCards, (element) => element.textContent?.trim() ?? '');

    expect(summaryValues).toEqual(['6', '231', '2', '0']);
  });

  it('searches by item or SKU and applies warehouse, category, and status filters', () => {
    const fixture = TestBed.createComponent(StockBalances);
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('#balance-search') as HTMLInputElement;
    search.value = 'PKG-BOX-M';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(5);

    const warehouse = fixture.nativeElement.querySelector(
      '#balance-warehouse-filter',
    ) as HTMLSelectElement;
    warehouse.value = '1';
    warehouse.dispatchEvent(new Event('change'));
    const category = fixture.nativeElement.querySelector(
      '#balance-category-filter',
    ) as HTMLSelectElement;
    category.value = 'Packaging';
    category.dispatchEvent(new Event('change'));
    const status = fixture.nativeElement.querySelector(
      '#balance-status-filter',
    ) as HTMLSelectElement;
    status.value = 'In Stock';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Main Distribution Centre');
  });

  it('shows item and warehouse movement details', () => {
    const fixture = TestBed.createComponent(StockBalances);
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('#balance-search') as HTMLInputElement;
    search.value = 'PKG-BOX-M';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const detailsButton = Array.from(
      fixture.nativeElement.querySelectorAll('.details-button') as NodeListOf<HTMLButtonElement>,
    ).find(
      (button) => button.getAttribute('aria-label')?.includes('Main Distribution Centre') ?? false,
    );
    detailsButton?.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('101 Each');
    expect(dialog.textContent).toContain('RCV-3001');
    expect(dialog.textContent).toContain('ISS-2001');
    expect(dialog.textContent).toContain('TRF-4001');
  });
});
