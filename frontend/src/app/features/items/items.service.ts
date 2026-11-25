import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { InventoryItem, NewInventoryItem } from './item.model';
import { MOCK_ITEMS } from './mock-items';

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`An item with SKU "${sku}" already exists.`);
    this.name = 'DuplicateSkuError';
  }
}

export class ItemNotFoundError extends Error {
  constructor(id: number) {
    super(`Item ${id} could not be found.`);
    this.name = 'ItemNotFoundError';
  }
}

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly itemsSubject = new BehaviorSubject<InventoryItem[]>(
    MOCK_ITEMS.map((item) => ({ ...item })),
  );
  private nextId = Math.max(...MOCK_ITEMS.map((item) => item.id)) + 1;

  readonly items$ = this.itemsSubject.asObservable();

  addItem(item: NewInventoryItem): InventoryItem {
    this.ensureSkuIsAvailable(item.sku);

    const newItem: InventoryItem = {
      ...item,
      id: this.nextId++,
      name: item.name.trim(),
      sku: item.sku.trim(),
    };

    this.itemsSubject.next([...this.itemsSubject.value, newItem]);
    return newItem;
  }

  updateItem(item: InventoryItem): InventoryItem {
    const currentItems = this.itemsSubject.value;
    if (!currentItems.some((currentItem) => currentItem.id === item.id)) {
      throw new ItemNotFoundError(item.id);
    }

    this.ensureSkuIsAvailable(item.sku, item.id);
    const updatedItem = {
      ...item,
      name: item.name.trim(),
      sku: item.sku.trim(),
    };

    this.itemsSubject.next(
      currentItems.map((currentItem) =>
        currentItem.id === updatedItem.id ? updatedItem : currentItem,
      ),
    );
    return updatedItem;
  }

  deleteItem(id: number): void {
    const currentItems = this.itemsSubject.value;
    if (!currentItems.some((item) => item.id === id)) {
      throw new ItemNotFoundError(id);
    }

    this.itemsSubject.next(currentItems.filter((item) => item.id !== id));
  }

  private ensureSkuIsAvailable(sku: string, exceptId?: number): void {
    const normalizedSku = sku.trim().toLocaleLowerCase();
    const duplicate = this.itemsSubject.value.some(
      (item) => item.id !== exceptId && item.sku.toLocaleLowerCase() === normalizedSku,
    );

    if (duplicate) {
      throw new DuplicateSkuError(sku.trim());
    }
  }
}
