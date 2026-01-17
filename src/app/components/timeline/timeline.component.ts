import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { ClapVideoSourceService } from '../../services/clap-video-source.service';

@Component({
  selector: 'app-timeline',
  standalone: true,
  templateUrl: './timeline.component.html',
})
export class TimelineComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('stage', { static: true })
  private readonly stageRef!: ElementRef<HTMLElement>;

  private readonly zone = inject(NgZone);
  public readonly video = inject(ClapVideoSourceService);

  private readonly paddingX = 12;
  private readonly rulerHeight = 36;
  private readonly lanePaddingTop = 10;

  private readonly laneHeight = 64; // 👈 adjust freely (48 / 56 / 64 are good)

  // View window (seconds) — THIS makes zoom keep same width
  private viewStart = 0;
  private viewEnd = 10; // will be set to duration when metadata arrives

  // Derived scale
  pxPerSecond = 80;

  private ctx!: CanvasRenderingContext2D;
  private dpr = 1;
  private ro?: ResizeObserver;
  private rafId: number | null = null;

  private isScrubbingLocal = false;

  // ✅ Effects must be created in injection context
  private readonly _onDuration = effect(() => {
    const d = this.video.duration();
    if (d > 0) {
      // Default view: full clip visible
      this.viewStart = 0;
      this.viewEnd = d;
      this.recomputeScale();
    }
    this.requestRender();
  });

  private readonly _onTime = effect(() => {
    this.video.currentTime();
    this.requestRender();
  });

  get currentTime(): number {
    return this.video.currentTime();
  }

  get duration(): number {
    return this.video.duration();
  }

  get pinX(): number {
    const t = this.currentTime;
    const clamped = Math.max(this.viewStart, Math.min(this.viewEnd, t));
    return this.paddingX + (clamped - this.viewStart) * this.pxPerSecond;
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    this.ctx = ctx;

    this.zone.runOutsideAngular(() => {
      this.ro = new ResizeObserver(() => this.resizeAndRender());
      this.ro.observe(canvas);
    });

    this.resizeAndRender();
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  zoomIn(): void {
    const d = this.duration;
    if (!(d > 0)) return;

    const center = this.currentTime;
    const currentSpan = this.viewEnd - this.viewStart;

    // zoom in = smaller window
    const newSpan = Math.max(1, currentSpan / 1.5);

    this.setViewWindowCentered(center, newSpan, d);
  }

  zoomOut(): void {
    const d = this.duration;
    if (!(d > 0)) return;

    const center = this.currentTime;
    const currentSpan = this.viewEnd - this.viewStart;

    // zoom out = larger window (but never bigger than full duration)
    const newSpan = Math.min(d, currentSpan * 1.5);

    this.setViewWindowCentered(center, newSpan, d);
  }

  onPointerDown(ev: PointerEvent): void {
    this.isScrubbingLocal = true;
    this.video.beginScrub();

    this.stageRef.nativeElement.setPointerCapture(ev.pointerId);
    this.seekFromClientX(ev.clientX);

    ev.preventDefault();
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.isScrubbingLocal) return;
    this.seekFromClientX(ev.clientX);
    ev.preventDefault();
  }

  onPointerUp(_ev: PointerEvent): void {
    this.isScrubbingLocal = false;
    this.video.endScrub();
  }

  private seekFromClientX(clientX: number): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const x = clientX - rect.left;
    const timelineX = x - this.paddingX;

    const t = this.viewStart + (timelineX / this.pxPerSecond);
    this.video.setTimeFromTimeline(t);

    this.requestRender();
  }

  private setViewWindowCentered(center: number, span: number, duration: number): void {
    const half = span / 2;

    let start = center - half;
    let end = center + half;

    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > duration) {
      const over = end - duration;
      start = Math.max(0, start - over);
      end = duration;
    }

    this.viewStart = start;
    this.viewEnd = end;

    this.recomputeScale();
    this.requestRender();
  }

  private recomputeScale(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const usableW = Math.max(1, rect.width - this.paddingX * 2);

    const span = Math.max(0.001, this.viewEnd - this.viewStart);
    this.pxPerSecond = usableW / span;
  }

  private resizeAndRender(): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    this.dpr = window.devicePixelRatio || 1;

    const w = Math.max(1, Math.floor(rect.width * this.dpr));
    const h = Math.max(1, Math.floor(rect.height * this.dpr));

    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    // keep scale correct on resize
    if (this.duration > 0) this.recomputeScale();

    this.requestRender();
  }

  private requestRender(): void {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  private render(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const cssW = w / this.dpr;
    const cssH = h / this.dpr;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, cssW, this.rulerHeight);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.rulerHeight + 0.5);
    ctx.lineTo(cssW, this.rulerHeight + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, this.rulerHeight, cssW, cssH - this.rulerHeight);

    this.drawLane(ctx, cssW, cssH);
    this.drawRuler(ctx, cssW);

    ctx.restore();
  }

  private drawRuler(ctx: CanvasRenderingContext2D, cssW: number): void {
    const startX = this.paddingX;
    const endX = cssW - this.paddingX;

    const d = this.duration;
    ctx.font = '11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';

    if (!(d > 0)) {
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('Loading metadata…', this.paddingX, 14);
      return;
    }

    const span = this.viewEnd - this.viewStart;

    // choose tick step based on visible span
    let minorEvery = 1;
    if (span > 60) minorEvery = 5;
    if (span > 180) minorEvery = 10;

    let majorEvery = 5;
    if (minorEvery === 5) majorEvery = 10;
    if (minorEvery === 10) majorEvery = 30;

    ctx.fillStyle = '#6b7280';
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;

    const tStart = Math.floor(this.viewStart / minorEvery) * minorEvery;
    const tEnd = this.viewEnd;

    for (let t = tStart; t <= tEnd + 0.0001; t += minorEvery) {
      const x = startX + (t - this.viewStart) * this.pxPerSecond;
      if (x < startX - 50 || x > endX + 50) continue;

      const isMajor = Math.round(t) % majorEvery === 0;
      const tickTop = 6;
      const tickBottom = isMajor ? 28 : 18;

      ctx.beginPath();
      ctx.moveTo(x + 0.5, tickTop);
      ctx.lineTo(x + 0.5, tickBottom);
      ctx.stroke();

      if (isMajor) ctx.fillText(this.formatTime(t), x + 4, 14);
    }
  }

  private drawLane(ctx: CanvasRenderingContext2D, cssW: number, _cssH: number): void {
    const laneTop = this.rulerHeight + this.lanePaddingTop;

    const x = this.paddingX;
    const w = cssW - this.paddingX * 2;
    const y = laneTop;
    const h = this.laneHeight; // ✅ fixed, smaller height

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private formatTime(t: number): string {
    const sec = Math.floor(Math.max(0, t));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }
}
