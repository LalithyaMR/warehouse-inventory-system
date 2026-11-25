import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MOCK_STOCK_ISSUES } from '../stock-issues/mock-stock-issues';
import { NewStockIssue, StockIssue } from '../stock-issues/stock-issue.model';
import { MOCK_STOCK_TRANSFERS } from '../stock-transfers/mock-stock-transfers';
import { NewStockTransfer, StockTransfer } from '../stock-transfers/stock-transfer.model';
import { StockReceiptsService } from '../stock-receipts/stock-receipts.service';
import { MOCK_OPENING_STOCK } from './mock-opening-stock';

export class DuplicateIssueNumberError extends Error {
  constructor(issueNumber: string) {
    super(`A stock issue with number "${issueNumber}" already exists.`);
    this.name = 'DuplicateIssueNumberError';
  }
}

export class StockIssueNotFoundError extends Error {
  constructor(id: number) {
    super(`Stock issue ${id} could not be found.`);
    this.name = 'StockIssueNotFoundError';
  }
}

export class DuplicateTransferNumberError extends Error {
  constructor(transferNumber: string) {
    super(`A stock transfer with number "${transferNumber}" already exists.`);
    this.name = 'DuplicateTransferNumberError';
  }
}

export class StockTransferNotFoundError extends Error {
  constructor(id: number) {
    super(`Stock transfer ${id} could not be found.`);
    this.name = 'StockTransferNotFoundError';
  }
}

export class InsufficientStockError extends Error {
  constructor(
    readonly requestedQuantity: number,
    readonly availableStock: number,
  ) {
    super(`Insufficient stock: ${availableStock} available, but ${requestedQuantity} requested.`);
    this.name = 'InsufficientStockError';
  }
}

export class InvalidStockMovementQuantityError extends Error {
  constructor(quantity: number) {
    super(`Stock movement quantity must be greater than zero. Received: ${quantity}.`);
    this.name = 'InvalidStockMovementQuantityError';
  }
}

export class SameWarehouseTransferError extends Error {
  constructor() {
    super('Source and destination warehouses must be different.');
    this.name = 'SameWarehouseTransferError';
  }
}

@Injectable({ providedIn: 'root' })
export class StockMovementLedgerService {
  private readonly receiptsService = inject(StockReceiptsService);
  private readonly issuesSubject = new BehaviorSubject<StockIssue[]>(
    MOCK_STOCK_ISSUES.map((issue) => ({ ...issue })),
  );
  private readonly transfersSubject = new BehaviorSubject<StockTransfer[]>(
    MOCK_STOCK_TRANSFERS.map((transfer) => ({ ...transfer })),
  );
  private nextIssueId = Math.max(...MOCK_STOCK_ISSUES.map((issue) => issue.id)) + 1;
  private nextTransferId = Math.max(...MOCK_STOCK_TRANSFERS.map((transfer) => transfer.id)) + 1;
  private nextIssueSequence = this.findNextSequence(
    MOCK_STOCK_ISSUES.map((issue) => issue.issueNumber),
    /^ISS-(\d+)$/i,
  );
  private nextTransferSequence = this.findNextSequence(
    MOCK_STOCK_TRANSFERS.map((transfer) => transfer.transferNumber),
    /^TRF-(\d+)$/i,
  );

  readonly issues$ = this.issuesSubject.asObservable();
  readonly transfers$ = this.transfersSubject.asObservable();

  suggestIssueNumber(): string {
    return `ISS-${String(this.nextIssueSequence).padStart(4, '0')}`;
  }

  addIssue(issue: NewStockIssue): StockIssue {
    const issueNumber = this.suggestIssueNumber();
    this.ensureIssueNumberIsAvailable(issueNumber);
    this.ensurePositiveQuantity(issue.quantityIssued);
    if (issue.status === 'Issued') {
      this.ensureStockAvailable(issue.itemId, issue.warehouseId, issue.quantityIssued);
    }

    const newIssue: StockIssue = {
      ...issue,
      id: this.nextIssueId++,
      issueNumber,
      recipient: issue.recipient.trim(),
      referenceNumber: issue.referenceNumber.trim(),
      reason: issue.reason.trim(),
      notes: issue.notes.trim(),
    };

    this.issuesSubject.next([...this.issuesSubject.value, newIssue]);
    this.nextIssueSequence++;
    return newIssue;
  }

  updateIssue(issue: StockIssue): StockIssue {
    const currentIssues = this.issuesSubject.value;
    if (!currentIssues.some((currentIssue) => currentIssue.id === issue.id)) {
      throw new StockIssueNotFoundError(issue.id);
    }

    this.ensureIssueNumberIsAvailable(issue.issueNumber, issue.id);
    this.ensurePositiveQuantity(issue.quantityIssued);
    if (issue.status === 'Issued') {
      this.ensureStockAvailable(issue.itemId, issue.warehouseId, issue.quantityIssued, issue.id);
    }

    const updatedIssue: StockIssue = {
      ...issue,
      issueNumber: issue.issueNumber.trim(),
      recipient: issue.recipient.trim(),
      referenceNumber: issue.referenceNumber.trim(),
      reason: issue.reason.trim(),
      notes: issue.notes.trim(),
    };

    this.issuesSubject.next(
      currentIssues.map((currentIssue) =>
        currentIssue.id === updatedIssue.id ? updatedIssue : currentIssue,
      ),
    );
    this.updateIssueSequence(updatedIssue.issueNumber);
    return updatedIssue;
  }

  deleteIssue(id: number): void {
    const currentIssues = this.issuesSubject.value;
    if (!currentIssues.some((issue) => issue.id === id)) {
      throw new StockIssueNotFoundError(id);
    }

    this.issuesSubject.next(currentIssues.filter((issue) => issue.id !== id));
  }

  suggestTransferNumber(): string {
    return `TRF-${String(this.nextTransferSequence).padStart(4, '0')}`;
  }

  addTransfer(transfer: NewStockTransfer): StockTransfer {
    const transferNumber = this.suggestTransferNumber();
    this.ensureTransferNumberIsAvailable(transferNumber);
    this.validateTransfer(transfer);
    if (transfer.status === 'Completed') {
      this.ensureStockAvailable(transfer.itemId, transfer.sourceWarehouseId, transfer.quantity);
    }

    const newTransfer: StockTransfer = {
      ...transfer,
      id: this.nextTransferId++,
      transferNumber,
      referenceNumber: transfer.referenceNumber.trim(),
      notes: transfer.notes.trim(),
    };

    this.transfersSubject.next([...this.transfersSubject.value, newTransfer]);
    this.nextTransferSequence++;
    return newTransfer;
  }

  updateTransfer(transfer: StockTransfer): StockTransfer {
    const currentTransfers = this.transfersSubject.value;
    if (!currentTransfers.some((currentTransfer) => currentTransfer.id === transfer.id)) {
      throw new StockTransferNotFoundError(transfer.id);
    }

    this.ensureTransferNumberIsAvailable(transfer.transferNumber, transfer.id);
    this.validateTransfer(transfer);
    if (transfer.status === 'Completed') {
      this.ensureStockAvailable(
        transfer.itemId,
        transfer.sourceWarehouseId,
        transfer.quantity,
        undefined,
        transfer.id,
      );
    }

    const updatedTransfer: StockTransfer = {
      ...transfer,
      transferNumber: transfer.transferNumber.trim(),
      referenceNumber: transfer.referenceNumber.trim(),
      notes: transfer.notes.trim(),
    };

    this.transfersSubject.next(
      currentTransfers.map((currentTransfer) =>
        currentTransfer.id === updatedTransfer.id ? updatedTransfer : currentTransfer,
      ),
    );
    this.updateTransferSequence(updatedTransfer.transferNumber);
    return updatedTransfer;
  }

  deleteTransfer(id: number): void {
    const currentTransfers = this.transfersSubject.value;
    if (!currentTransfers.some((transfer) => transfer.id === id)) {
      throw new StockTransferNotFoundError(id);
    }

    this.transfersSubject.next(currentTransfers.filter((transfer) => transfer.id !== id));
  }

  private ensureStockAvailable(
    itemId: number,
    warehouseId: number,
    quantity: number,
    exceptIssueId?: number,
    exceptTransferId?: number,
  ): void {
    const availableStock = this.getAvailableStock(
      itemId,
      warehouseId,
      exceptIssueId,
      exceptTransferId,
    );
    if (quantity > availableStock) {
      throw new InsufficientStockError(quantity, availableStock);
    }
  }

  private getAvailableStock(
    itemId: number,
    warehouseId: number,
    exceptIssueId?: number,
    exceptTransferId?: number,
  ): number {
    const openingStock =
      MOCK_OPENING_STOCK.find(
        (opening) => opening.itemId === itemId && opening.warehouseId === warehouseId,
      )?.quantity ?? 0;
    const totalStockReceived = this.receiptsService
      .getCurrentReceipts()
      .filter((receipt) => receipt.itemId === itemId && receipt.warehouseId === warehouseId)
      .reduce((total, receipt) => total + receipt.quantityReceived, 0);
    const totalStockIssued = this.issuesSubject.value
      .filter(
        (issue) =>
          issue.id !== exceptIssueId &&
          issue.status === 'Issued' &&
          issue.itemId === itemId &&
          issue.warehouseId === warehouseId,
      )
      .reduce((total, issue) => total + issue.quantityIssued, 0);
    const completedTransfers = this.transfersSubject.value.filter(
      (transfer) => transfer.status === 'Completed' && transfer.id !== exceptTransferId,
    );
    const transferredIn = completedTransfers
      .filter(
        (transfer) => transfer.itemId === itemId && transfer.destinationWarehouseId === warehouseId,
      )
      .reduce((total, transfer) => total + transfer.quantity, 0);
    const transferredOut = completedTransfers
      .filter(
        (transfer) => transfer.itemId === itemId && transfer.sourceWarehouseId === warehouseId,
      )
      .reduce((total, transfer) => total + transfer.quantity, 0);

    return openingStock + totalStockReceived + transferredIn - totalStockIssued - transferredOut;
  }

  private validateTransfer(transfer: NewStockTransfer | StockTransfer): void {
    this.ensurePositiveQuantity(transfer.quantity);
    if (transfer.sourceWarehouseId === transfer.destinationWarehouseId) {
      throw new SameWarehouseTransferError();
    }
  }

  private ensurePositiveQuantity(quantity: number): void {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new InvalidStockMovementQuantityError(quantity);
    }
  }

  private ensureIssueNumberIsAvailable(issueNumber: string, exceptId?: number): void {
    const normalizedNumber = issueNumber.trim().toLocaleLowerCase();
    if (
      this.issuesSubject.value.some(
        (issue) =>
          issue.id !== exceptId && issue.issueNumber.toLocaleLowerCase() === normalizedNumber,
      )
    ) {
      throw new DuplicateIssueNumberError(issueNumber.trim());
    }
  }

  private ensureTransferNumberIsAvailable(transferNumber: string, exceptId?: number): void {
    const normalizedNumber = transferNumber.trim().toLocaleLowerCase();
    if (
      this.transfersSubject.value.some(
        (transfer) =>
          transfer.id !== exceptId &&
          transfer.transferNumber.toLocaleLowerCase() === normalizedNumber,
      )
    ) {
      throw new DuplicateTransferNumberError(transferNumber.trim());
    }
  }

  private findNextSequence(numbers: string[], pattern: RegExp): number {
    const sequences = numbers
      .map((number) => pattern.exec(number))
      .filter((match) => match !== null)
      .map((match) => Number(match[1]));
    return sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
  }

  private updateIssueSequence(issueNumber: string): void {
    const match = /^ISS-(\d+)$/i.exec(issueNumber);
    if (match) {
      this.nextIssueSequence = Math.max(this.nextIssueSequence, Number(match[1]) + 1);
    }
  }

  private updateTransferSequence(transferNumber: string): void {
    const match = /^TRF-(\d+)$/i.exec(transferNumber);
    if (match) {
      this.nextTransferSequence = Math.max(this.nextTransferSequence, Number(match[1]) + 1);
    }
  }
}
