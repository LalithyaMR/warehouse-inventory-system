import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, tap, throwError } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { NewStockIssue, StockIssue } from './stock-issue.model';

interface ApiStockIssue {
  id: number;
  issueNumber: string;
  itemId: number;
  warehouseId: number;
  quantity: number;
  issueDate: string;
}

interface ApiStockIssueRequest {
  issueNumber: string;
  itemId: number;
  warehouseId: number;
  quantity: number;
  issueDate: string;
}

export class DuplicateIssueNumberError extends Error {
  constructor(issueNumber: string) {
    super(`A stock issue with number "${issueNumber}" already exists.`);
    this.name = 'DuplicateIssueNumberError';
  }
}

@Injectable({ providedIn: 'root' })
export class StockIssuesService {
  private readonly api = inject(ApiClient);
  private readonly issuesSubject = new BehaviorSubject<StockIssue[]>([]);
  private readonly loadingSubject = new BehaviorSubject(false);
  private readonly loadErrorSubject = new BehaviorSubject<unknown | null>(null);

  readonly issues$ = this.issuesSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly loadError$ = this.loadErrorSubject.asObservable();

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.reloadIssues();
    }
  }

  getCurrentIssues(): readonly StockIssue[] {
    return this.issuesSubject.value;
  }

  loadIssues(): Observable<StockIssue[]> {
    this.loadingSubject.next(true);
    this.loadErrorSubject.next(null);

    return this.api.get<ApiStockIssue[]>('stock-issues').pipe(
      map((issues) => issues.map((issue) => this.toFrontend(issue))),
      tap((issues) => this.issuesSubject.next(issues)),
      catchError((error: unknown) => {
        this.loadErrorSubject.next(error);
        return throwError(() => error);
      }),
      finalize(() => this.loadingSubject.next(false)),
    );
  }

  reloadIssues(): void {
    this.loadIssues().subscribe({
      error: (error: unknown) => this.loadErrorSubject.next(error),
    });
  }

  getIssue(id: number): Observable<StockIssue> {
    return this.api.get<ApiStockIssue>(`stock-issues/${id}`).pipe(
      map((issue) => this.toFrontend(issue)),
      tap((issue) => {
        this.issuesSubject.next(
          this.issuesSubject.value.map((current) => (current.id === issue.id ? issue : current)),
        );
      }),
    );
  }

  suggestIssueNumber(): string {
    const sequences = this.issuesSubject.value
      .map((issue) => /^ISS-(\d+)$/i.exec(issue.issueNumber))
      .filter((match) => match !== null)
      .map((match) => Number(match[1]));
    const nextSequence = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
    return `ISS-${String(nextSequence).padStart(4, '0')}`;
  }

  addIssue(issue: NewStockIssue): Observable<StockIssue> {
    return this.api
      .post<ApiStockIssue, ApiStockIssueRequest>('stock-issues', this.toBackend(issue))
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => this.issuesSubject.next([...this.issuesSubject.value, saved])),
        catchError((error: unknown) => this.handleError(error, issue.issueNumber)),
      );
  }

  updateIssue(issue: StockIssue): Observable<StockIssue> {
    return this.api
      .put<ApiStockIssue, ApiStockIssueRequest>(`stock-issues/${issue.id}`, this.toBackend(issue))
      .pipe(
        map((saved) => this.toFrontend(saved)),
        tap((saved) => {
          this.issuesSubject.next(
            this.issuesSubject.value.map((current) => (current.id === saved.id ? saved : current)),
          );
        }),
        catchError((error: unknown) => this.handleError(error, issue.issueNumber)),
      );
  }

  deleteIssue(id: number): Observable<void> {
    return this.api.delete<void>(`stock-issues/${id}`).pipe(
      tap(() => {
        this.issuesSubject.next(this.issuesSubject.value.filter((issue) => issue.id !== id));
      }),
    );
  }

  private toFrontend(issue: ApiStockIssue): StockIssue {
    return {
      id: issue.id,
      issueNumber: issue.issueNumber,
      issueDate: issue.issueDate,
      itemId: issue.itemId,
      warehouseId: issue.warehouseId,
      quantityIssued: issue.quantity,
      status: 'Issued',
    };
  }

  private toBackend(issue: NewStockIssue | StockIssue): ApiStockIssueRequest {
    return {
      issueNumber: issue.issueNumber.trim(),
      itemId: issue.itemId,
      warehouseId: issue.warehouseId,
      quantity: issue.quantityIssued,
      issueDate: issue.issueDate,
    };
  }

  private handleError(error: unknown, issueNumber: string): Observable<never> {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 409 &&
      this.backendErrorMessage(error)?.toLocaleLowerCase().includes('issue number already exists')
    ) {
      return throwError(() => new DuplicateIssueNumberError(issueNumber));
    }

    return throwError(() => error);
  }

  private backendErrorMessage(error: HttpErrorResponse): string | null {
    if (typeof error.error === 'string') {
      return error.error;
    }

    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const detail = 'detail' in body ? body.detail : undefined;
    const message = 'message' in body ? body.message : undefined;
    const backendMessage = 'error' in body ? body.error : undefined;
    const text = [detail, message, backendMessage].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return text?.trim() ?? null;
  }
}
