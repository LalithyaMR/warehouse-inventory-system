import { signal, type WritableSignal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

export class TableSortState<K extends string> {
  readonly column: WritableSignal<K>;
  readonly direction: WritableSignal<SortDirection>;

  constructor(
    initialColumn: K,
    initialDirection: SortDirection = 'asc',
    private readonly descendingByDefault: readonly K[] = [],
  ) {
    this.column = signal(initialColumn);
    this.direction = signal(initialDirection);
  }

  toggle(column: K): void {
    if (this.column() === column) {
      this.direction.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    this.column.set(column);
    this.direction.set(this.descendingByDefault.includes(column) ? 'desc' : 'asc');
  }

  indicator(column: K): string {
    if (this.column() !== column) {
      return '↕';
    }
    return this.direction() === 'asc' ? '↑' : '↓';
  }

  ariaSort(column: K): 'ascending' | 'descending' | 'none' {
    return this.column() === column
      ? this.direction() === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
  }
}

export function sortRows<T>(
  rows: readonly T[],
  valueOf: (row: T) => string | number,
  direction: SortDirection,
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = valueOf(left);
    const rightValue = valueOf(right);
    const comparison =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, {
            numeric: true,
            sensitivity: 'base',
          });

    return comparison * multiplier;
  });
}
