import { Injectable, inject } from '@angular/core';
import { NewStockTransfer, StockTransfer } from './stock-transfer.model';
import { StockMovementLedgerService } from '../stock-balances/stock-movement-ledger.service';

@Injectable({ providedIn: 'root' })
export class StockTransfersService {
  private readonly ledger = inject(StockMovementLedgerService);

  readonly transfers$ = this.ledger.transfers$;

  suggestTransferNumber(): string {
    return this.ledger.suggestTransferNumber();
  }

  addTransfer(transfer: NewStockTransfer): StockTransfer {
    return this.ledger.addTransfer(transfer);
  }

  updateTransfer(transfer: StockTransfer): StockTransfer {
    return this.ledger.updateTransfer(transfer);
  }

  deleteTransfer(id: number): void {
    this.ledger.deleteTransfer(id);
  }
}

export {
  DuplicateTransferNumberError,
  InsufficientStockError,
  InvalidStockMovementQuantityError,
  SameWarehouseTransferError,
  StockTransferNotFoundError,
} from '../stock-balances/stock-movement-ledger.service';
