import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ItemsService } from '../items/items.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { StockReceipt } from './stock-receipt.model';
import { DuplicateReceiptNumberError, StockReceiptsService } from './stock-receipts.service';
import { StockReceipts } from './stock-receipts';

const API_URL = 'http://localhost:8080/api/stock-receipts';
const BALANCES_URL = 'http://localhost:8080/api/inventory/balances';
const ITEMS_URL = 'http://localhost:8080/api/items';
const WAREHOUSES_URL = 'http://localhost:8080/api/warehouses';

const apiReceipt = {
  id: 31,
  receiptNumber: 'RCV-TEST-01',
  itemId: 11,
  warehouseId: 21,
  quantity: 25,
  receiptDate: '2026-11-25',
};

const apiItems = [
  {
    id: 11,
    itemCode: 'BOX-01',
    itemName: 'Storage Box',
    category: 'Packaging',
    unit: 'Each',
    reorderLevel: 3,
    active: true,
  },
  {
    id: 12,
    itemCode: 'OLD-01',
    itemName: 'Inactive Item',
    category: 'Packaging',
    unit: 'Each',
    reorderLevel: 1,
    active: false,
  },
];

const apiWarehouses = [
  {
    id: 21,
    warehouseCode: 'WH-01',
    warehouseName: 'North Depot',
    location: 'North side',
    active: true,
  },
  {
    id: 22,
    warehouseCode: 'WH-OFF',
    warehouseName: 'Inactive Depot',
    location: null,
    active: false,
  },
];

const newReceipt = {
  receiptNumber: 'RCV-TEST-01',
  receiptDate: '2026-11-25',
  itemId: 11,
  warehouseId: 21,
  quantityReceived: 25,
};

describe('StockReceiptsService', () => {
  let service: StockReceiptsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(StockReceiptsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps receipt response fields from Spring Boot', async () => {
    const result = firstValueFrom(service.loadReceipts());
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush([apiReceipt]);

    expect(await result).toEqual([
      {
        id: 31,
        receiptNumber: 'RCV-TEST-01',
        receiptDate: '2026-11-25',
        itemId: 11,
        warehouseId: 21,
        quantityReceived: 25,
        status: 'Received',
      },
    ] satisfies StockReceipt[]);
  });

  it('loads one receipt by database ID', async () => {
    const result = firstValueFrom(service.getReceipt(31));
    const request = http.expectOne(`${API_URL}/31`);
    expect(request.request.method).toBe('GET');
    request.flush(apiReceipt);
    expect((await result).quantityReceived).toBe(25);
  });

  it('sends backend-shaped create and update requests and delets after success', async () => {
    const initialLoad = firstValueFrom(service.loadReceipts());
    http.expectOne(API_URL).flush([]);
    await initialLoad;

    const createResult = firstValueFrom(service.addReceipt(newReceipt));
    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      receiptNumber: 'RCV-TEST-01',
      itemId: 11,
      warehouseId: 21,
      quantity: 25,
      receiptDate: '2026-11-25',
    });
    expect(await firstValueFrom(service.receipts$)).toHaveLength(0);
    createRequest.flush(apiReceipt);
    const created = await createResult;

    const updateResult = firstValueFrom(
      service.updateReceipt({ ...created, quantityReceived: 40 }),
    );
    const updateRequest = http.expectOne(`${API_URL}/31`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body.quantity).toBe(40);
    updateRequest.flush({ ...apiReceipt, quantity: 40 });
    expect((await updateResult).quantityReceived).toBe(40);

    const deleteResult = firstValueFrom(service.deleteReceipt(31));
    const deleteRequest = http.expectOne(`${API_URL}/31`);
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(await firstValueFrom(service.receipts$)).toHaveLength(1);
    deleteRequest.flush(null, { status: 204, statusText: 'No Content' });
    await deleteResult;
    expect(await firstValueFrom(service.receipts$)).toHaveLength(0);
  });

  it('surfaces duplicate receipt numbers as a conflict', async () => {
    const result = firstValueFrom(service.addReceipt(newReceipt));
    http
      .expectOne(API_URL)
      .flush(
        { status: 409, message: 'Receipt number already exists' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(result).rejects.toBeInstanceOf(DuplicateReceiptNumberError);
  });
});

describe('StockReceipts component', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockReceipts],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createLoadedFixture(receipts = [apiReceipt]) {
    const fixture = TestBed.createComponent(StockReceipts);
    fixture.detectChanges();
    http.expectOne(ITEMS_URL).flush(apiItems);
    http.expectOne(WAREHOUSES_URL).flush(apiWarehouses);
    http.expectOne(API_URL).flush(receipts);
    fixture.detectChanges();
    return fixture;
  }

  it('populates selectors with active human-readable records and searches receipt history', () => {
    const fixture = createLoadedFixture();
    fixture.nativeElement.querySelector('.add-receipt-button')?.click();
    fixture.detectChanges();

    const itemSelect = fixture.nativeElement.querySelector('#receipt-item') as HTMLSelectElement;
    const warehouseSelect = fixture.nativeElement.querySelector(
      '#receipt-warehouse',
    ) as HTMLSelectElement;
    expect(itemSelect.textContent).toContain('Storage Box (BOX-01)');
    expect(itemSelect.textContent).not.toContain('Inactive Item');
    expect(warehouseSelect.textContent).toContain('North Depot (WH-01)');
    expect(warehouseSelect.textContent).not.toContain('Inactive Depot');

    const search = fixture.nativeElement.querySelector('#receipt-search') as HTMLInputElement;
    search.value = 'Storage Box';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('submits only backend fields with numeric item and warehouse IDs and refreshes the list', () => {
    const fixture = createLoadedFixture([]);
    fixture.nativeElement.querySelector('.add-receipt-button')?.click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#receipt-number') as HTMLInputElement).value =
      'RCV-TEST-02';
    (fixture.nativeElement.querySelector('#receipt-number') as HTMLInputElement).dispatchEvent(
      new Event('input'),
    );
    (fixture.nativeElement.querySelector('#receipt-date') as HTMLInputElement).value = '2026-11-26';
    (fixture.nativeElement.querySelector('#receipt-date') as HTMLInputElement).dispatchEvent(
      new Event('input'),
    );
    const itemSelect = fixture.nativeElement.querySelector('#receipt-item') as HTMLSelectElement;
    itemSelect.selectedIndex = 1;
    itemSelect.dispatchEvent(new Event('change'));
    const warehouseSelect = fixture.nativeElement.querySelector(
      '#receipt-warehouse',
    ) as HTMLSelectElement;
    warehouseSelect.selectedIndex = 1;
    warehouseSelect.dispatchEvent(new Event('change'));
    const quantity = fixture.nativeElement.querySelector('#receipt-quantity') as HTMLInputElement;
    quantity.value = '7';
    quantity.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.receipt-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      receiptNumber: 'RCV-TEST-02',
      itemId: 11,
      warehouseId: 21,
      quantity: 7,
      receiptDate: '2026-11-26',
    });
    expect(fixture.nativeElement.textContent).not.toContain('was recorded successfully');

    createRequest.flush({
      ...apiReceipt,
      id: 32,
      receiptNumber: 'RCV-TEST-02',
      quantity: 7,
      receiptDate: '2026-11-26',
    });
    http.expectOne(API_URL).flush([
      {
        ...apiReceipt,
        id: 32,
        receiptNumber: 'RCV-TEST-02',
        quantity: 7,
        receiptDate: '2026-11-26',
      },
    ]);
    http.expectOne(BALANCES_URL).flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('was recorded successfully');
    expect(fixture.nativeElement.textContent).toContain('RCV-TEST-02');
  });

  it('rejects missing required fields and non-positive or fractional quantities', () => {
    const fixture = createLoadedFixture([]);
    fixture.nativeElement.querySelector('.add-receipt-button')?.click();
    fixture.detectChanges();

    const quantity = fixture.nativeElement.querySelector('#receipt-quantity') as HTMLInputElement;
    quantity.value = '1.5';
    quantity.dispatchEvent(new Event('input'));
    const form = fixture.nativeElement.querySelector('.receipt-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(quantity.classList.contains('is-invalid')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.invalid-feedback').length).toBeGreaterThan(0);
    http.expectNone(`${API_URL}/`);
  });

  it('shows backend validation errors without reporting success', () => {
    const fixture = createLoadedFixture([]);
    fixture.nativeElement.querySelector('.add-receipt-button')?.click();
    fixture.detectChanges();
    const componentForm = fixture.nativeElement.querySelector(
      '.receipt-dialog form',
    ) as HTMLFormElement;
    const component = fixture.debugElement.componentInstance as StockReceipts;
    component['form'].setValue({
      receiptNumber: 'RCV-BAD',
      receiptDate: '2026-11-26',
      itemId: 11,
      warehouseId: 21,
      quantityReceived: 3,
    });
    componentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    http
      .expectOne(API_URL)
      .flush(
        { status: 400, detail: 'Item is inactive' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Item is inactive');
    expect(fixture.nativeElement.textContent).not.toContain('was recorded successfully');
  });
});
