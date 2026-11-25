import { TableSortState, sortRows } from './table-sort';

describe('table sorting', () => {
  it('sorts string values without mutating the source rows', () => {
    const rows = [{ name: 'item 10' }, { name: 'Item 2' }, { name: 'item 1' }];

    expect(sortRows(rows, (row) => row.name, 'asc').map((row) => row.name)).toEqual([
      'item 1',
      'Item 2',
      'item 10',
    ]);
    expect(rows.map((row) => row.name)).toEqual(['item 10', 'Item 2', 'item 1']);
  });

  it('sorts numeric values and toggles accessible sort state', () => {
    const rows = [{ quantity: 12 }, { quantity: 3 }, { quantity: 7 }];
    const sorting = new TableSortState<'quantity' | 'name'>('quantity');

    expect(sortRows(rows, (row) => row.quantity, 'desc').map((row) => row.quantity)).toEqual([
      12, 7, 3,
    ]);
    expect(sorting.ariaSort('quantity')).toBe('ascending');
    sorting.toggle('quantity');
    expect(sorting.direction()).toBe('desc');
    expect(sorting.ariaSort('quantity')).toBe('descending');
    sorting.toggle('name');
    expect(sorting.ariaSort('quantity')).toBe('none');
    expect(sorting.ariaSort('name')).toBe('ascending');
  });
});
