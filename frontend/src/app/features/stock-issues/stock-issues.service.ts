import { Injectable, inject } from '@angular/core';
import { NewStockIssue, StockIssue } from './stock-issue.model';
import { StockMovementLedgerService } from '../stock-balances/stock-movement-ledger.service';

@Injectable({ providedIn: 'root' })
export class StockIssuesService {
  private readonly ledger = inject(StockMovementLedgerService);

  readonly issues$ = this.ledger.issues$;

  suggestIssueNumber(): string {
    return this.ledger.suggestIssueNumber();
  }

  addIssue(issue: NewStockIssue): StockIssue {
    return this.ledger.addIssue(issue);
  }

  updateIssue(issue: StockIssue): StockIssue {
    return this.ledger.updateIssue(issue);
  }

  deleteIssue(id: number): void {
    this.ledger.deleteIssue(id);
  }
}

export {
  DuplicateIssueNumberError,
  InsufficientStockError,
  InvalidStockMovementQuantityError,
  StockIssueNotFoundError,
} from '../stock-balances/stock-movement-ledger.service';
