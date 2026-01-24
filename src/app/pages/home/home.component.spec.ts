import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeComponent } from './home.component';

describe('Home', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    // Mock ResizeObserver
    (globalThis as any).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // Mock getContext for canvas used in TimelineComponent
    HTMLCanvasElement.prototype.getContext = (() => {
      return {
        fillRect: () => {},
        clearRect: () => {},
        getImageData: (x: any, y: any, w: any, h: any) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        createImageData: () => [],
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        rect: () => {},
        clip: () => {},
        fillText: () => {},
        measureText: () => ({ width: 0 }),
        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
      } as any;
    }) as any;

    await TestBed.configureTestingModule({
      imports: [HomeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
