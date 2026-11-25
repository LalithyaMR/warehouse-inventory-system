import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MOCK_WAREHOUSES } from './mock-warehouses';
import { NewWarehouse, Warehouse } from './warehouse.model';

export class DuplicateWarehouseCodeError extends Error {
  constructor(code: string) {
    super(`A warehouse with code "${code}" already exists.`);
    this.name = 'DuplicateWarehouseCodeError';
  }
}

export class WarehouseNotFoundError extends Error {
  constructor(id: number) {
    super(`Warehouse ${id} could not be found.`);
    this.name = 'WarehouseNotFoundError';
  }
}

@Injectable({ providedIn: 'root' })
export class WarehousesService {
  private readonly warehousesSubject = new BehaviorSubject<Warehouse[]>(
    MOCK_WAREHOUSES.map((warehouse) => ({ ...warehouse })),
  );
  private nextId = Math.max(...MOCK_WAREHOUSES.map((warehouse) => warehouse.id)) + 1;

  readonly warehouses$ = this.warehousesSubject.asObservable();

  addWarehouse(warehouse: NewWarehouse): Warehouse {
    this.ensureCodeIsAvailable(warehouse.code);

    const newWarehouse: Warehouse = {
      ...warehouse,
      id: this.nextId++,
      name: warehouse.name.trim(),
      code: warehouse.code.trim(),
    };

    this.warehousesSubject.next([...this.warehousesSubject.value, newWarehouse]);
    return newWarehouse;
  }

  updateWarehouse(warehouse: Warehouse): Warehouse {
    const currentWarehouses = this.warehousesSubject.value;
    if (!currentWarehouses.some((currentWarehouse) => currentWarehouse.id === warehouse.id)) {
      throw new WarehouseNotFoundError(warehouse.id);
    }

    this.ensureCodeIsAvailable(warehouse.code, warehouse.id);
    const updatedWarehouse = {
      ...warehouse,
      name: warehouse.name.trim(),
      code: warehouse.code.trim(),
    };

    this.warehousesSubject.next(
      currentWarehouses.map((currentWarehouse) =>
        currentWarehouse.id === updatedWarehouse.id ? updatedWarehouse : currentWarehouse,
      ),
    );
    return updatedWarehouse;
  }

  deleteWarehouse(id: number): void {
    const currentWarehouses = this.warehousesSubject.value;
    if (!currentWarehouses.some((warehouse) => warehouse.id === id)) {
      throw new WarehouseNotFoundError(id);
    }

    this.warehousesSubject.next(currentWarehouses.filter((warehouse) => warehouse.id !== id));
  }

  private ensureCodeIsAvailable(code: string, exceptId?: number): void {
    const normalizedCode = code.trim().toLocaleLowerCase();
    const duplicate = this.warehousesSubject.value.some(
      (warehouse) =>
        warehouse.id !== exceptId && warehouse.code.toLocaleLowerCase() === normalizedCode,
    );

    if (duplicate) {
      throw new DuplicateWarehouseCodeError(code.trim());
    }
  }
}
