import { Warehouse } from './warehouse.model';

export const MOCK_WAREHOUSES: readonly Warehouse[] = [
  {
    id: 1,
    name: 'Main Distribution Centre',
    code: 'WH-MAIN',
    location: '742 Industrial Ave, Denver, CO',
    managerName: 'Alicia Morgan',
    contactNumber: '+1 (303) 555-0142',
    status: 'Active',
  },
  {
    id: 2,
    name: 'North Fulfillment Hub',
    code: 'WH-NORTH',
    location: '1860 Harbor Way, Seattle, WA',
    managerName: 'Jordan Lee',
    contactNumber: '+1 (206) 555-0184',
    status: 'Active',
  },
  {
    id: 3,
    name: 'Eastside Storage',
    code: 'WH-EAST',
    location: '51 Exchange Place, Jersey City, NJ',
    managerName: 'Priya Shah',
    contactNumber: '+1 (201) 555-0116',
    status: 'Active',
  },
  {
    id: 4,
    name: 'Parts and Materials Depot',
    code: 'WH-PARTS',
    location: '930 Foundry Road, Columbus, OH',
    managerName: 'Marcus Reed',
    contactNumber: '+1 (614) 555-0173',
    status: 'Active',
  },
  {
    id: 5,
    name: 'Seasonal Overflow',
    code: 'WH-SEASON',
    location: '2200 Airport Road, Boise, ID',
    managerName: 'Taylor Brooks',
    contactNumber: '+1 (208) 555-0127',
    status: 'Inactive',
  },
];
