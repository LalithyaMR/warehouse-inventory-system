import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewStockReceipt } from './stock-receipt.model';
import { DuplicateReceiptNumberError, StockReceiptsService } from './stock-receipts.service';
import { StockReceipts } from './stock-receipts';

const newReceipt: NewStockReceipt = {
  receiptNumber: 'RCV-TEST-01',
  receiptDate: '2026-11-25',
  itemId: 101,
  warehouseId: 1,
  supplierName: 'Test Supply Co.',
  quantityReceived: 25,
  referenceNumber: 'PO-TEST-01',
  notes: '',
  status: 'Received',
};

describe('StockReceiptsService', () => {
  let service: StockReceiptsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StockReceiptsService);
  });

  it('creates, updates, and deletes receipts in the observable history', async () => {
    const created = service.addReceipt(newReceipt);
    expect(await firstValueFrom(service.receipts$)).toContain(created);

    const updated = service.updateReceipt({
      ...created,
      supplierName: 'Updated Supply Co.',
    });
    const updatedReceipts = await firstValueFrom(service.receipts$);
    expect(updatedReceipts).toContain(updated);
    expect(updatedReceipts).not.toContain(created);

    service.deleteReceipt(created.id);
    expect(await firstValueFrom(service.receipts$)).not.toContain(updated);
  });

  it('rejects duplicate receipt numbers without regard to letter case', async () => {
    const existingNumber = (await firstValueFrom(service.receipts$))[0].receiptNumber;
    expect(() =>
      service.addReceipt({ ...newReceipt, receiptNumber: existingNumber.toLowerCase() }),
    ).toThrow(DuplicateReceiptNumberError);
  });
});

describe('StockReceipts', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StockReceipts] }).compileComponents();
  });

  it('searches receipt number, item name, and supplier, then filters by warehouse and dates', () => {
    const fixture = TestBed.createComponent(StockReceipts);
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('#receipt-search') as HTMLInputElement;
    for (const query of ['RCV-3001', 'Corrugated carton', 'Summit Packaging']) {
      search.value = query;
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    }

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const warehouse = fixture.nativeElement.querySelector(
      '#receipt-warehouse-filter',
    ) as HTMLSelectElement;
    warehouse.value = '1';
    warehouse.dispatchEvent(new Event('change'));
    const from = fixture.nativeElement.querySelector('#receipt-date-from') as HTMLInputElement;
    from.value = '2026-11-24';
    from.dispatchEvent(new Event('change'));
    const to = fixture.nativeElement.querySelector('#receipt-date-to') as HTMLInputElement;
    to.value = '2026-11-24';
    to.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('RCV-3001');
  });

  it('requires a positive quantity before a receipt can be recorded', () => {
    const fixture = TestBed.createComponent(StockReceipts);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector(
      '.add-receipt-button',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.receipt-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const quantity = fixture.nativeElement.querySelector('#receipt-quantity') as HTMLInputElement;
    expect(quantity.classList.contains('is-invalid')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Quantity received must be greater than zero.',
    );
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(4);
  });
});
