import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewStockTransfer } from './stock-transfer.model';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfers } from './stock-transfers';

const newTransfer: NewStockTransfer = {
  transferDate: '2026-11-25',
  itemId: 101,
  sourceWarehouseId: 1,
  destinationWarehouseId: 2,
  quantity: 25,
  referenceNumber: 'MOVE-TEST-01',
  notes: '',
  status: 'Pending',
};

describe('StockTransfersService', () => {
  let service: StockTransfersService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StockTransfersService);
  });

  it('creates, updates, and deletes transfers with generated transfer numbers', async () => {
    const created = service.addTransfer(newTransfer);
    expect(created.transferNumber).toBe('TRF-4005');
    expect(await firstValueFrom(service.transfers$)).toContain(created);

    const updated = service.updateTransfer({ ...created, status: 'In Transit' });
    const updatedTransfers = await firstValueFrom(service.transfers$);
    expect(updatedTransfers).toContain(updated);
    expect(updatedTransfers).not.toContain(created);

    service.deleteTransfer(created.id);
    expect(await firstValueFrom(service.transfers$)).not.toContain(updated);
  });
});

describe('StockTransfers', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StockTransfers] }).compileComponents();
  });

  it('searches by transfer number and item, then filters by route, status, and date', () => {
    const fixture = TestBed.createComponent(StockTransfers);
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('#transfer-search') as HTMLInputElement;
    for (const query of ['TRF-4001', 'Corrugated carton']) {
      search.value = query;
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    }

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const source = fixture.nativeElement.querySelector(
      '#transfer-source-filter',
    ) as HTMLSelectElement;
    source.value = '1';
    source.dispatchEvent(new Event('change'));
    const destination = fixture.nativeElement.querySelector(
      '#transfer-destination-filter',
    ) as HTMLSelectElement;
    destination.value = '2';
    destination.dispatchEvent(new Event('change'));
    const status = fixture.nativeElement.querySelector(
      '#transfer-status-filter',
    ) as HTMLSelectElement;
    status.value = 'Completed';
    status.dispatchEvent(new Event('change'));
    const from = fixture.nativeElement.querySelector('#transfer-date-from') as HTMLInputElement;
    from.value = '2026-11-24';
    from.dispatchEvent(new Event('change'));
    const to = fixture.nativeElement.querySelector('#transfer-date-to') as HTMLInputElement;
    to.value = '2026-11-24';
    to.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('TRF-4001');
  });

  it('requires a positive quantity before a transfer can be recorded', () => {
    const fixture = TestBed.createComponent(StockTransfers);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector(
      '.add-transfer-button',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.transfer-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const quantity = fixture.nativeElement.querySelector('#transfer-quantity') as HTMLInputElement;
    expect(quantity.classList.contains('is-invalid')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Quantity must be greater than zero.');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(4);
  });

  it('rejects matching source and destination warehouses with a clear message', () => {
    const fixture = TestBed.createComponent(StockTransfers);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector(
      '.add-transfer-button',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const source = fixture.nativeElement.querySelector('#transfer-source') as HTMLSelectElement;
    source.selectedIndex = 1;
    source.dispatchEvent(new Event('change'));
    const destination = fixture.nativeElement.querySelector(
      '#transfer-destination',
    ) as HTMLSelectElement;
    destination.selectedIndex = 1;
    destination.dispatchEvent(new Event('change'));

    const form = fixture.nativeElement.querySelector('.transfer-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(destination.classList.contains('is-invalid')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Source and destination warehouses must be different.',
    );
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(4);
  });
});
