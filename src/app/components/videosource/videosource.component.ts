import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { ClapVideoSourceService } from '../../services/clap-video-source.service';

type VideoKey = 'anabela' | 'woman' | 'woman2';

@Component({
  selector: 'app-videosource',
  standalone: true,
  templateUrl: './videosource.component.html',
})
export class VideoSourceComponent implements AfterViewInit {
  @ViewChild('videoEl', { static: true })
  private readonly videoEl!: ElementRef<HTMLVideoElement>;

  selected: VideoKey = 'anabela';
  videoSrc = this.toSrc(this.selected);

  // ✅ Only TCOUT is user typed now
  tcOutText = '';

  constructor(public readonly video: ClapVideoSourceService) {}

  // ---------- lifecycle ----------
  ngAfterViewInit(): void {
    const el = this.videoEl.nativeElement;

    el.src = this.videoSrc;
    el.load();

    this.video.connectVideo(el);
  }

  // ---------- UI events ----------
  onSourceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as VideoKey;
    this.selected = value;
    this.videoSrc = this.toSrc(value);

    const el = this.videoEl.nativeElement;
    el.pause();
    el.src = this.videoSrc;
    el.load();

    // Clear subsection + input when changing source
    this.tcOutText = '';
    this.video.setSubSection(null, null);

    this.video.setSubIn(null);
    this.video.setSubOut(null);

    this.video.connectVideo(el);
  }

  onTcOut(text: string): void {
    this.tcOutText = text;
    const out = parseTimecodeToSeconds(this.tcOutText);
    this.video.setSubOut(out); // ✅ only OUT
  }


  // ---------- helpers for template ----------
  formatTime(t: number | null): string {
    if (t == null || !Number.isFinite(t)) return '--';

    const total = Math.max(0, t);
    const mm = Math.floor(total / 60);
    const ss = total - mm * 60;

    // mm:ss.xx (2 decimals)
    const ssText = ss.toFixed(2).padStart(5, '0'); // "03.25", "12.00"
    return mm > 0 ? `${mm}:${ssText}` : `${ssText}s`;
  }

  // ---------- private ----------
  private toSrc(key: VideoKey): string {
    // because files are in: src/assets/videos/...
    return key === 'woman'
      ? 'assets/videos/woman.mp4'
      : key === 'woman2'
        ? 'assets/videos/woman2.mp4'
        : 'assets/videos/anabela.mp4';
  }
}

/**
 * Accepts:
 *  - "12" or "12.5" (seconds)
 *  - "mm:ss"
 *  - "hh:mm:ss"
 * Returns seconds or null if empty/invalid.
 */
function parseTimecodeToSeconds(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // plain seconds
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);

  const parts = s.split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;

  if (parts.length === 2) {
    const mm = Number(parts[0]);
    const ss = Number(parts[1]);
    return mm * 60 + ss;
  }

  if (parts.length === 3) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    const ss = Number(parts[2]);
    return hh * 3600 + mm * 60 + ss;
  }

  return null;
}
