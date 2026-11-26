import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ItemsService } from '../items/items.service';
import { InventoryBalancesApiService } from '../stock-balances/inventory-balances-api.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { NewStockTransfer } from './stock-transfer.model';
import { DuplicateTransferNumberError, StockTransfersService } from './stock-transfers.service';
import { StockTransfers } from './stock-transfers';

const API_URL = 'http://localhost:8080/api/stock-transfers';
const apiTransfer = {
  id: 51,
  transferNumber: 'TRF-0051',
  itemId: 11,
  sourceWarehouseId: 21,
  destinationWarehouseId: 22,
  quantity: 4,
  transferDate: '2026-11-25',
  status: 'PENDING' as const,
};
const newTransfer: NewStockTransfer = {
  transferNumber: 'TRF-0052',
  itemId: 11,
  sourceWarehouseId: 21,
  destinationWarehouseId: 22,
  quantity: 2,
  transferDate: '2026-11-26',
  status: 'Pending',
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
];
const apiWarehouses = [
  {
    id: 21,
    warehouseCode: 'WH-21',
    warehouseName: 'North Depot',
    location: 'North',
    active: true,
  },
  {
    id: 22,
    warehouseCode: 'WH-22',
    warehouseName: 'South Depot',
    location: 'South',
    active: true,
  },
];
const apiBalances = [
  {
    itemId: 11,
    itemCode: 'BOX-01',
    itemName: 'Storage Box',
    warehouseId: 21,
    warehouseName: 'North Depot',
    availableQuantity: 12,
    reorderLevel: 3,
    lowStock: false,
  },
];

describe('StockTransfersService', () => {
  let service: StockTransfersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(StockTransfersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads transfer records and maps the backend enum', async () => {
    const result = firstValueFrom(service.loadTransfers());
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush([apiTransfer, { ...apiTransfer, id: 52, status: 'COMPLETED' }]);

    expect(await result).toMatchObject([
      { id: 51, status: 'Pending' },
      { id: 52, status: 'Completed' },
    ]);
  });

  it('loads a transfer by its database ID', async () => {
    const result = firstValueFrom(service.getTransfer(apiTransfer.id));
    const request = http.expectOne(`${API_URL}/${apiTransfer.id}`);
    expect(request.request.method).toBe('GET');
    request.flush(apiTransfer);

    expect(await result).toMatchObject({ id: 51, status: 'Pending' });
  });

  it('sends exact backend fields and enum values for create, update and delete', async () => {
    const createResult = firstValueFrom(
      service.addTransfer({ ...newTransfer, status: 'Completed' }),
    );
    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      ...newTransfer,
      status: 'COMPLETED',
    });
    createRequest.flush({
      ...apiTransfer,
      id: 52,
      transferNumber: 'TRF-0052',
      status: 'COMPLETED',
    });
    const created = await createResult;

    const updateResult = firstValueFrom(
      service.updateTransfer({ ...created, status: 'Cancelled' }),
    );
    const updateRequest = http.expectOne(`${API_URL}/${created.id}`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({
      transferNumber: 'TRF-0052',
      itemId: 11,
      sourceWarehouseId: 21,
      destinationWarehouseId: 22,
      quantity: 4,
      transferDate: '2026-11-25',
      status: 'CANCELLED',
    });
    updateRequest.flush({
      ...apiTransfer,
      id: created.id,
      transferNumber: created.transferNumber,
      status: 'CANCELLED',
    });
    await updateResult;

    const deleteResult = firstValueFrom(service.deleteTransfer(created.id));
    const deleteRequest = http.expectOne(`${API_URL}/${created.id}`);
    expect(deleteRequest.request.method).toBe('DELETE');
    deleteRequest.flush(null);
    await deleteResult;
    expect(service.getCurrentTransfers()).toEqual([]);
  });

  it('maps duplicate numbers but preserves stock and status errors', async () => {
    const duplicate = firstValueFrom(service.addTransfer(newTransfer));
    http
      .expectOne(API_URL)
      .flush(
        { message: 'Transfer number already exists' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(duplicate).rejects.toBeInstanceOf(DuplicateTransferNumberError);

    const insufficient = firstValueFrom(
      service.addTransfer({ ...newTransfer, transferNumber: 'TRF-0053', status: 'Completed' }),
    );
    http
      .expectOne(API_URL)
      .flush(
        { message: 'Operation rejected: insufficient stock' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(insufficient).rejects.toMatchObject({
      status: 409,
      error: { message: 'Operation rejected: insufficient stock' },
    });

    const invalidTransition = firstValueFrom(
      service.updateTransfer({
        ...apiTransfer,
        status: 'Pending',
      }),
    );
    http
      .expectOne(`${API_URL}/${apiTransfer.id}`)
      .flush(
        { message: 'Completed transfer cannot become PENDING' },
        { status: 400, statusText: 'Bad Request' },
      );
    await expect(invalidTransition).rejects.toMatchObject({
      status: 400,
      error: { message: 'Completed transfer cannot become PENDING' },
    });
  });
});

describe('StockTransfers form', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockTransfers],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadFormData(transfers: unknown[] = []) {
    TestBed.inject(ItemsService).loadItems().subscribe();
    http.expectOne('http://localhost:8080/api/items').flush(apiItems);
    TestBed.inject(WarehousesService).loadWarehouses().subscribe();
    http.expectOne('http://localhost:8080/api/warehouses').flush(apiWarehouses);
    TestBed.inject(InventoryBalancesApiService).loadBalances().subscribe();
    http.expectOne('http://localhost:8080/api/inventory/balances').flush(apiBalances);
    TestBed.inject(StockTransfersService).loadTransfers().subscribe();
    http.expectOne(API_URL).flush(transfers);

    const fixture = TestBed.createComponent(StockTransfers);
    fixture.detectChanges();
    return fixture;
  }

  function chooseOption(select: HTMLSelectElement, index: number): void {
    select.value = select.options[index].value;
    select.dispatchEvent(new Event('change'));
  }

  function fillTransferForm(fixture: ReturnType<typeof loadFormData>): void {
    (fixture.nativeElement.querySelector('.add-transfer-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    chooseOption(fixture.nativeElement.querySelector('#transfer-item'), 1);
    chooseOption(fixture.nativeElement.querySelector('#transfer-source'), 1);
    chooseOption(fixture.nativeElement.querySelector('#transfer-destination'), 2);

    const quantity = fixture.nativeElement.querySelector('#transfer-quantity') as HTMLInputElement;
    quantity.value = '2';
    quantity.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('only offers backend-supported statuses for new transfers and prevents same-warehouse selection', () => {
    const fixture = loadFormData();
    fillTransferForm(fixture);

    const status = fixture.nativeElement.querySelector('#transfer-status') as HTMLSelectElement;
    expect(Array.from(status.options).map((option) => option.value)).toEqual([
      'Pending',
      'Completed',
    ]);

    const destination = fixture.nativeElement.querySelector(
      '#transfer-destination',
    ) as HTMLSelectElement;
    expect(destination.options[1].disabled).toBe(true);
  });

  it('keeps the form open and displays the backend insufficient-stock response', () => {
    const fixture = loadFormData();
    fillTransferForm(fixture);
    const status = fixture.nativeElement.querySelector('#transfer-status') as HTMLSelectElement;
    status.value = 'Completed';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.transfer-dialog form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    const request = http.expectOne(API_URL);
    expect(request.request.body.status).toBe('COMPLETED');
    request.flush(
      { message: 'Operation rejected: insufficient stock' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.transfer-dialog')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Operation rejected: insufficient stock');
    expect(fixture.nativeElement.textContent).not.toContain('was recorded.');
  });

  it('cancels using the original details and refreshes transfers and balances after success', () => {
    const completedTransfer = { ...apiTransfer, status: 'COMPLETED' as const };
    const fixture = loadFormData([completedTransfer]);
    (
      fixture.nativeElement.querySelector('[aria-label="Edit TRF-0051"]') as HTMLButtonElement
    ).click();
    const detailRequest = http.expectOne(`${API_URL}/51`);
    detailRequest.flush(completedTransfer);
    fixture.detectChanges();

    const quantity = fixture.nativeElement.querySelector('#transfer-quantity') as HTMLInputElement;
    quantity.value = '9';
    quantity.dispatchEvent(new Event('input'));
    const status = fixture.nativeElement.querySelector('#transfer-status') as HTMLSelectElement;
    expect(Array.from(status.options).map((option) => option.value)).toEqual([
      'Completed',
      'Cancelled',
    ]);
    status.value = 'Cancelled';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(quantity.disabled).toBe(true);
    expect(quantity.value).toBe('4');
    (fixture.nativeElement.querySelector('.transfer-dialog form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    const updateRequest = http.expectOne(`${API_URL}/51`);
    expect(updateRequest.request.body).toEqual({
      transferNumber: 'TRF-0051',
      itemId: 11,
      sourceWarehouseId: 21,
      destinationWarehouseId: 22,
      quantity: 4,
      transferDate: '2026-11-25',
      status: 'CANCELLED',
    });
    updateRequest.flush({ ...completedTransfer, status: 'CANCELLED' });
    http.expectOne(API_URL).flush([{ ...completedTransfer, status: 'CANCELLED' }]);
    http.expectOne('http://localhost:8080/api/inventory/balances').flush(apiBalances);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.transfer-dialog')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('TRF-0051 was cancelled.');
  });
});
