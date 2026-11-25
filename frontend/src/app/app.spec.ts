import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppShell } from './layout/app-shell';

describe('AppShell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([])],
    })
      .compileComponents();
  });

  it('should create the shared application layout', () => {
    const fixture = TestBed.createComponent(AppShell);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render all inventory sections and a routed page outlet', async () => {
    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav')?.textContent).toContain('Stock Receipts');
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
