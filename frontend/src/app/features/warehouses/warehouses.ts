import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { sortRows, TableSortState } from '../../core/ui/table-sort';
import { Warehouse, WarehouseStatus } from './warehouse.model';
import { DuplicateWarehouseCodeError, WarehousesService } from './warehouses.service';

type WarehouseFormField = 'name' | 'code' | 'location';
type WarehouseSortColumn = 'name' | 'code' | 'location' | 'status';

@Component({
  selector: 'app-warehouses',
  imports: [ReactiveFormsModule],
  templateUrl: './warehouses.html',
  styleUrl: './warehouses.css',
})
export class Warehouses {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly warehousesService = inject(WarehousesService);

  protected readonly statuses: readonly WarehouseStatus[] = ['Active', 'Inactive'];
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly loading = toSignal(this.warehousesService.loading$, {
    initialValue: false,
  });
  private readonly loadRequestError = toSignal(this.warehousesService.loadError$, {
    initialValue: null,
  });
  protected readonly loadError = computed(() => {
    const error = this.loadRequestError();
    return error ? this.getErrorMessage(error, 'Could not load warehouses.') : '';
  });

  protected readonly searchTerm = signal('');
  protected readonly selectedStatus = signal('All statuses');
  protected readonly formOpen = signal(false);
  protected readonly warehouseToEdit = signal<Warehouse | null>(null);
  protected readonly warehouseToDelete = signal<Warehouse | null>(null);
  protected readonly saveError = signal('');
  protected readonly editError = signal('');
  protected readonly deleteError = signal('');
  protected readonly notice = signal('');
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly loadingWarehouseId = signal<number | null>(null);
  protected readonly sorting = new TableSortState<WarehouseSortColumn>('name');

  protected submitted = false;

  protected readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    code: [
      '',
      [
        Validators.required,
        Validators.maxLength(24),
        Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
      ],
    ],
    location: ['', [Validators.maxLength(160)]],
  });

  protected readonly filteredWarehouses = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const status = this.selectedStatus();

    const filteredWarehouses = this.warehouses().filter((warehouse) => {
      const matchesSearch =
        query.length === 0 ||
        warehouse.name.toLocaleLowerCase().includes(query) ||
        warehouse.code.toLocaleLowerCase().includes(query) ||
        warehouse.location.toLocaleLowerCase().includes(query);
      const matchesStatus = status === 'All statuses' || warehouse.status === status;

      return matchesSearch && matchesStatus;
    });

    return sortRows(
      filteredWarehouses,
      (warehouse) => warehouse[this.sorting.column()],
      this.sorting.direction(),
    );
  });

  protected readonly activeCount = computed(
    () => this.warehouses().filter((warehouse) => warehouse.status === 'Active').length,
  );
  protected readonly inactiveCount = computed(
    () => this.warehouses().filter((warehouse) => warehouse.status === 'Inactive').length,
  );

  protected hasActiveFilters(): boolean {
    return this.searchTerm().length > 0 || this.selectedStatus() !== 'All statuses';
  }

  protected setSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected setStatus(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.selectedStatus.set('All statuses');
  }

  protected retryLoadWarehouses(): void {
    this.warehousesService.reloadWarehouses();
  }

  protected openAddForm(): void {
    this.warehouseToEdit.set(null);
    this.form.reset({ name: '', code: '', location: '' });
    this.openForm();
  }

  protected openEditForm(warehouse: Warehouse): void {
    if (this.loadingWarehouseId() !== null) {
      return;
    }

    this.editError.set('');
    this.loadingWarehouseId.set(warehouse.id);
    this.warehousesService.getWarehouse(warehouse.id).subscribe({
      next: (loadedWarehouse) => {
        this.loadingWarehouseId.set(null);
        this.warehouseToEdit.set(loadedWarehouse);
        this.form.reset({
          name: loadedWarehouse.name,
          code: loadedWarehouse.code,
          location: loadedWarehouse.location,
        });
        this.openForm();
      },
      error: (error: unknown) => {
        this.loadingWarehouseId.set(null);
        this.editError.set(
          this.getErrorMessage(error, 'Could not load the warehouse for editing.'),
        );
      },
    });
  }

  protected closeForm(): void {
    if (this.saving()) {
      return;
    }

    this.formOpen.set(false);
    this.warehouseToEdit.set(null);
    this.saveError.set('');
  }

  protected clearSaveError(): void {
    this.saveError.set('');
  }

  protected shouldShowError(field: WarehouseFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  protected validationMessage(field: WarehouseFormField): string {
    const control = this.form.controls[field];

    if (control.hasError('required')) {
      return 'This field is required.';
    }
    if (control.hasError('maxlength')) {
      return field === 'code'
        ? 'Warehouse code must be 24 characters or fewer.'
        : field === 'location'
          ? 'Location must be 160 characters or fewer.'
          : 'Warehouse name must be 100 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      return field === 'code'
        ? 'Use letters, numbers, hyphens, or underscores.'
        : 'This field cannot contain only spaces.';
    }

    return 'Check this value.';
  }

  protected saveWarehouse(): void {
    if (this.saving()) {
      return;
    }

    this.submitted = true;
    this.saveError.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();
    const warehouseData = {
      name: values.name.trim(),
      code: values.code.trim(),
      location: values.location.trim(),
    };
    const existingWarehouse = this.warehouseToEdit();
    const request = existingWarehouse
      ? this.warehousesService.updateWarehouse({
          ...warehouseData,
          id: existingWarehouse.id,
          status: existingWarehouse.status,
        })
      : this.warehousesService.addWarehouse(warehouseData);

    this.saving.set(true);
    request.subscribe({
      next: (savedWarehouse) => {
        this.saving.set(false);
        this.notice.set(
          `${savedWarehouse.name} was ${existingWarehouse ? 'updated' : 'added'} successfully.`,
        );
        this.closeForm();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.getErrorMessage(error, 'Could not save the warehouse.'));
      },
    });
  }

  protected requestDelete(warehouse: Warehouse): void {
    this.deleteError.set('');
    this.warehouseToDelete.set(warehouse);
  }

  protected cancelDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.warehouseToDelete.set(null);
    this.deleteError.set('');
  }

  protected confirmDelete(): void {
    const warehouse = this.warehouseToDelete();
    if (!warehouse || this.deleting()) {
      return;
    }

    this.deleteError.set('');
    this.deleting.set(true);
    this.warehousesService.deleteWarehouse(warehouse.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.notice.set(`${warehouse.name} was deactivated successfully.`);
        this.cancelDelete();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.deleteError.set(this.getErrorMessage(error, 'Could not deactivate the warehouse.'));
      },
    });
  }

  protected dismissNotice(): void {
    this.notice.set('');
  }

  private openForm(): void {
    this.submitted = false;
    this.saveError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof DuplicateWarehouseCodeError) {
      return error.message;
    }

    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    const backendMessage = this.backendErrorMessage(error);
    if (error.status === 0) {
      return 'Cannot connect to Spring Boot. Check that the backend is running on port 8080.';
    }
    if (error.status === 400) {
      return backendMessage ?? 'The backend rejected the warehouse details. Check the fields and try again.';
    }
    if (error.status === 404) {
      return backendMessage ?? 'The requested warehouse was not found. Refresh the directory and try again.';
    }
    if (error.status === 409) {
      return backendMessage ?? 'A warehouse with this code already exists.';
    }
    if (error.status >= 500) {
      return `The server could not complete the request (HTTP ${error.status}). Try again later.`;
    }
    return `${fallback} (HTTP ${error.status}).`;
  }

  private backendErrorMessage(error: HttpErrorResponse): string | null {
    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim();
    }

    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null) {
      return null;
    }

    const detail = 'detail' in body ? body.detail : undefined;
    const message = 'message' in body ? body.message : undefined;
    const backendError = 'error' in body ? body.error : undefined;
    const text = [detail, message, backendError].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return text?.trim() ?? null;
  }
}
