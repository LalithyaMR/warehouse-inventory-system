import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom, of, throwError, toArray } from 'rxjs';
import { API_BASE_URL, DATA_SOURCE_MODE } from './api-config';
import { ApiClient } from './api-client';
import { trackApiRequest } from './api-request-state';

describe('trackApiRequest', () => {
  it('emits loading followed by the successful response', async () => {
    const states = await firstValueFrom(trackApiRequest(of({ ready: true })).pipe(toArray()));

    expect(states).toEqual([{ status: 'loading' }, { status: 'success', data: { ready: true } }]);
  });

  it('preserves failures as an explicit error state', async () => {
    const failure = new Error('Request failed');
    const states = await firstValueFrom(trackApiRequest(throwError(() => failure)).pipe(toArray()));

    expect(states).toEqual([{ status: 'loading' }, { status: 'error', error: failure }]);
  });
});

describe('ApiClient', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: API_BASE_URL, useValue: '' },
        { provide: DATA_SOURCE_MODE, useValue: 'api' },
      ],
    });
  });

  it('reports an unconfigured base URL explicitly', async () => {
    const states = await firstValueFrom(
      trackApiRequest(TestBed.inject(ApiClient).get<unknown>('')).pipe(toArray()),
    );

    expect(states[0]).toEqual({ status: 'loading' });
    expect(states[1].status).toBe('error');
    if (states[1].status === 'error') {
      expect(states[1].error).toEqual(
        new Error(
          'API base URL is not configured. Set it after the backend contract is available.',
        ),
      );
    }
  });

  it('does not make requests while mock mode is selected', async () => {
    TestBed.overrideProvider(DATA_SOURCE_MODE, { useValue: 'mock' });
    const states = await firstValueFrom(
      trackApiRequest(TestBed.inject(ApiClient).get<unknown>('')).pipe(toArray()),
    );

    expect(states[1].status).toBe('error');
    if (states[1].status === 'error') {
      expect(states[1].error).toEqual(
        new Error('API requests are disabled while dataSource is set to mock.'),
      );
    }
  });
});
