import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { NewWarehouse } from './warehouse.model';
import { DuplicateWarehouseCodeError, WarehousesService } from './warehouses.service';
import { Warehouses } from './warehouses';

const API_URL = 'http://localhost:8080/api/warehouses';

const apiWarehouses = [
  {
    id: 1,
    warehouseCode: 'WH-NORTH',
    warehouseName: 'North Fulfillment Hub',
    location: '1860 Harbor Way, Seattle, WA',
    active: true,
  },
  {
    id: 2,
    warehouseCode: 'WH-SEASON',
    warehouseName: 'Seasonal Overflow',
    location: null,
    active: false,
  },
];

const newWarehouse: NewWarehouse = {
  name: 'West Coast Hub',
  code: 'WH-WEST',
  location: '1200 Market Street, San Francisco, CA',
};

describe('WarehousesService', () => {
  let service: WarehousesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(WarehousesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps all backend warehouses, including inactive records', async () => {
    const result = firstValueFrom(service.loadWarehouses());
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush(apiWarehouses);

    expect(await result).toEqual([
      {
        id: 1,
        code: 'WH-NORTH',
        name: 'North Fulfillment Hub',
        location: '1860 Harbor Way, Seattle, WA',
        status: 'Active',
      },
      {
        id: 2,
        code: 'WH-SEASON',
        name: 'Seasonal Overflow',
        location: '',
        status: 'Inactive',
      },
    ]);
  });

  it('loads one warehouse by ID', async () => {
    const result = firstValueFrom(service.getWarehouse(1));
    const request = http.expectOne(`${API_URL}/1`);
    expect(request.request.method).toBe('GET');
    request.flush(apiWarehouses[0]);

    expect(await result).toEqual({
      id: 1,
      code: 'WH-NORTH',
      name: 'North Fulfillment Hub',
      location: '1860 Harbor Way, Seattle, WA',
      status: 'Active',
    });
  });

  it('creates, updates, and deactivates using backend requests and responses', async () => {
    const initialLoad = firstValueFrom(service.loadWarehouses());
    http.expectOne(API_URL).flush([apiWarehouses[0]]);
    await initialLoad;

    const createResult = firstValueFrom(service.addWarehouse(newWarehouse));
    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      warehouseCode: 'WH-WEST',
      warehouseName: 'West Coast Hub',
      location: '1200 Market Street, San Francisco, CA',
    });
    expect(await firstValueFrom(service.warehouses$)).toHaveLength(1);
    createRequest.flush({
      id: 3,
      warehouseCode: 'WH-WEST',
      warehouseName: 'West Coast Hub',
      location: '1200 Market Street, San Francisco, CA',
      active: true,
    });
    const created = await createResult;

    const updateResult = firstValueFrom(
      service.updateWarehouse({ ...created, name: 'West Coast Distribution Hub' }),
    );
    const updateRequest = http.expectOne(`${API_URL}/3`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({
      warehouseCode: 'WH-WEST',
      warehouseName: 'West Coast Distribution Hub',
      location: '1200 Market Street, San Francisco, CA',
    });
    updateRequest.flush({
      id: 3,
      warehouseCode: 'WH-WEST',
      warehouseName: 'West Coast Distribution Hub',
      location: '1200 Market Street, San Francisco, CA',
      active: true,
    });
    expect((await updateResult).name).toBe('West Coast Distribution Hub');

    const deleteResult = firstValueFrom(service.deleteWarehouse(3));
    const deleteRequest = http.expectOne(`${API_URL}/3`);
    expect(deleteRequest.request.method).toBe('DELETE');
    expect((await firstValueFrom(service.warehouses$)).find((item) => item.id === 3)?.status).toBe(
      'Active',
    );
    deleteRequest.flush(null, { status: 204, statusText: 'No Content' });
    await deleteResult;
    expect((await firstValueFrom(service.warehouses$)).find((item) => item.id === 3)?.status).toBe(
      'Inactive',
    );
  });

  it('surfaces duplicate warehouse codes from the backend', async () => {
    const result = firstValueFrom(service.addWarehouse(newWarehouse));
    http.expectOne(API_URL).flush(
      { status: 409, message: 'Warehouse code already exists' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(result).rejects.toBeInstanceOf(DuplicateWarehouseCodeError);
  });
});

describe('Warehouses component', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Warehouses],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createLoadedFixture() {
    const fixture = TestBed.createComponent(Warehouses);
    fixture.detectChanges();
    http.expectOne(API_URL).flush(apiWarehouses);
    fixture.detectChanges();
    return fixture;
  }

  it('searches by name, code, and location, and filters by backend status', () => {
    const fixture = createLoadedFixture();
    const search = fixture.nativeElement.querySelector('#warehouse-search') as HTMLInputElement;

    for (const query of ['North Fulfillment', 'WH-NORTH', 'Harbor Way']) {
      search.value = query;
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    }

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const status = fixture.nativeElement.querySelector(
      '#warehouse-status-filter',
    ) as HTMLSelectElement;
    status.value = 'Inactive';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody tr')?.textContent).toContain(
      'Seasonal Overflow',
    );
  });

  it('only presents fields supported by the backend and validates required name and code', () => {
    const fixture = createLoadedFixture();
    fixture.nativeElement.querySelector('.add-warehouse-button')?.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.warehouse-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.invalid-feedback').length).toBe(2);
    expect(fixture.nativeElement.querySelector('#warehouse-manager')).toBeNull();
    expect(fixture.nativeElement.querySelector('#warehouse-contact')).toBeNull();
  });

  it('shows a retryable message when the backend cannot load warehouses', () => {
    const fixture = TestBed.createComponent(Warehouses);
    fixture.detectChanges();
    http.expectOne(API_URL).error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cannot connect to Spring Boot');
    expect(fixture.nativeElement.querySelector('.alert-danger button')?.textContent).toContain(
      'Retry',
    );
  });
});
