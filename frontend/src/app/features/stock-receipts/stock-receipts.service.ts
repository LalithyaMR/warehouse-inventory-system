import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MOCK_STOCK_RECEIPTS } from './mock-stock-receipts';
import { NewStockReceipt, StockReceipt } from './stock-receipt.model';

export class DuplicateReceiptNumberError extends Error {
  constructor(receiptNumber: string) {
    super(`A receipt with number "${receiptNumber}" already exists.`);
    this.name = 'DuplicateReceiptNumberError';
  }
}

export class StockReceiptNotFoundError extends Error {
  constructor(id: number) {
    super(`Stock receipt ${id} could not be found.`);
    this.name = 'StockReceiptNotFoundError';
  }
}

@Injectable({ providedIn: 'root' })
export class StockReceiptsService {
  private readonly receiptsSubject = new BehaviorSubject<StockReceipt[]>(
    MOCK_STOCK_RECEIPTS.map((receipt) => ({ ...receipt })),
  );
  private nextId = Math.max(...MOCK_STOCK_RECEIPTS.map((receipt) => receipt.id)) + 1;
  private nextReceiptSequence = this.findNextSequence();

  readonly receipts$ = this.receiptsSubject.asObservable();

  getCurrentReceipts(): readonly StockReceipt[] {
    return this.receiptsSubject.value;
  }

  suggestReceiptNumber(): string {
    return `RCV-${String(this.nextReceiptSequence).padStart(4, '0')}`;
  }

  addReceipt(receipt: NewStockReceipt): StockReceipt {
    this.ensureReceiptNumberIsAvailable(receipt.receiptNumber);

    const newReceipt: StockReceipt = {
      ...receipt,
      id: this.nextId++,
      receiptNumber: receipt.receiptNumber.trim(),
      supplierName: receipt.supplierName.trim(),
      referenceNumber: receipt.referenceNumber.trim(),
      notes: receipt.notes.trim(),
    };

    this.receiptsSubject.next([...this.receiptsSubject.value, newReceipt]);
    this.updateNextSequence(newReceipt.receiptNumber);
    return newReceipt;
  }

  updateReceipt(receipt: StockReceipt): StockReceipt {
    const currentReceipts = this.receiptsSubject.value;
    if (!currentReceipts.some((currentReceipt) => currentReceipt.id === receipt.id)) {
      throw new StockReceiptNotFoundError(receipt.id);
    }

    this.ensureReceiptNumberIsAvailable(receipt.receiptNumber, receipt.id);
    const updatedReceipt: StockReceipt = {
      ...receipt,
      receiptNumber: receipt.receiptNumber.trim(),
      supplierName: receipt.supplierName.trim(),
      referenceNumber: receipt.referenceNumber.trim(),
      notes: receipt.notes.trim(),
    };

    this.receiptsSubject.next(
      currentReceipts.map((currentReceipt) =>
        currentReceipt.id === updatedReceipt.id ? updatedReceipt : currentReceipt,
      ),
    );
    this.updateNextSequence(updatedReceipt.receiptNumber);
    return updatedReceipt;
  }

  deleteReceipt(id: number): void {
    const currentReceipts = this.receiptsSubject.value;
    if (!currentReceipts.some((receipt) => receipt.id === id)) {
      throw new StockReceiptNotFoundError(id);
    }

    this.receiptsSubject.next(currentReceipts.filter((receipt) => receipt.id !== id));
  }

  private ensureReceiptNumberIsAvailable(receiptNumber: string, exceptId?: number): void {
    const normalizedNumber = receiptNumber.trim().toLocaleLowerCase();
    const duplicate = this.receiptsSubject.value.some(
      (receipt) =>
        receipt.id !== exceptId && receipt.receiptNumber.toLocaleLowerCase() === normalizedNumber,
    );

    if (duplicate) {
      throw new DuplicateReceiptNumberError(receiptNumber.trim());
    }
  }

  private findNextSequence(): number {
    const sequences = MOCK_STOCK_RECEIPTS.map((receipt) =>
      /^RCV-(\d+)$/i.exec(receipt.receiptNumber),
    )
      .filter((match) => match !== null)
      .map((match) => Number(match[1]));

    return sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
  }

  private updateNextSequence(receiptNumber: string): void {
    const match = /^RCV-(\d+)$/i.exec(receiptNumber);
    if (match) {
      this.nextReceiptSequence = Math.max(this.nextReceiptSequence, Number(match[1]) + 1);
    }
  }
}
