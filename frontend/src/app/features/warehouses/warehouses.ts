import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Warehouse, WarehouseStatus } from './warehouse.model';
import { DuplicateWarehouseCodeError, WarehousesService } from './warehouses.service';
import { sortRows, TableSortState } from '../../core/ui/table-sort';

type WarehouseFormField = 'name' | 'code' | 'location' | 'managerName' | 'contactNumber' | 'status';
type WarehouseSortColumn =
  'name' | 'code' | 'location' | 'managerName' | 'contactNumber' | 'status';

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
  protected readonly searchTerm = signal('');
  protected readonly selectedStatus = signal('All statuses');
  protected readonly formOpen = signal(false);
  protected readonly warehouseToEdit = signal<Warehouse | null>(null);
  protected readonly warehouseToDelete = signal<Warehouse | null>(null);
  protected readonly saveError = signal('');
  protected readonly notice = signal('');
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
    location: ['', [Validators.required, Validators.maxLength(160), Validators.pattern(/\S/)]],
    managerName: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    contactNumber: [
      '',
      [
        Validators.required,
        Validators.maxLength(21),
        Validators.pattern(/^\+?[0-9][0-9\s()-]{6,19}$/),
      ],
    ],
    status: this.formBuilder.control<WarehouseStatus>('Active', Validators.required),
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

  protected openAddForm(): void {
    this.warehouseToEdit.set(null);
    this.form.reset({
      name: '',
      code: '',
      location: '',
      managerName: '',
      contactNumber: '',
      status: 'Active',
    });
    this.openForm();
  }

  protected openEditForm(warehouse: Warehouse): void {
    this.warehouseToEdit.set(warehouse);
    this.form.reset({
      name: warehouse.name,
      code: warehouse.code,
      location: warehouse.location,
      managerName: warehouse.managerName,
      contactNumber: warehouse.contactNumber,
      status: warehouse.status,
    });
    this.openForm();
  }

  protected closeForm(): void {
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
      if (field === 'code') {
        return 'Warehouse code must be 24 characters or fewer.';
      }
      if (field === 'contactNumber') {
        return 'Contact number must be 21 characters or fewer.';
      }
      return field === 'location'
        ? 'Location must be 160 characters or fewer.'
        : 'This field must be 100 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      if (field === 'code') {
        return 'Use letters, numbers, hyphens, or underscores.';
      }
      if (field === 'contactNumber') {
        return 'Enter a valid phone number, including its country code if needed.';
      }
      return 'This field cannot contain only spaces.';
    }

    return 'Check this value.';
  }

  protected saveWarehouse(): void {
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
      managerName: values.managerName.trim(),
      contactNumber: values.contactNumber.trim(),
      status: values.status,
    };

    try {
      const existingWarehouse = this.warehouseToEdit();
      if (existingWarehouse) {
        this.warehousesService.updateWarehouse({
          ...warehouseData,
          id: existingWarehouse.id,
        });
        this.notice.set(`${warehouseData.name} was updated.`);
      } else {
        this.warehousesService.addWarehouse(warehouseData);
        this.notice.set(`${warehouseData.name} was added.`);
      }

      this.closeForm();
    } catch (error) {
      if (error instanceof DuplicateWarehouseCodeError) {
        this.saveError.set(error.message);
        return;
      }

      throw error;
    }
  }

  protected requestDelete(warehouse: Warehouse): void {
    this.warehouseToDelete.set(warehouse);
  }

  protected cancelDelete(): void {
    this.warehouseToDelete.set(null);
  }

  protected confirmDelete(): void {
    const warehouse = this.warehouseToDelete();
    if (!warehouse) {
      return;
    }

    this.warehousesService.deleteWarehouse(warehouse.id);
    this.notice.set(`${warehouse.name} was deleted.`);
    this.cancelDelete();
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
}
