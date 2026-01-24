import { AfterViewInit, Component, ElementRef, ViewChild, signal, effect } from '@angular/core';
import { ClapVideoSourceService } from '../../services/clap-video-source.service';
import { VideoSubSectionDTO } from '../../models/video-source.dto';

@Component({
  selector: 'app-videosource',
  standalone: true,
  templateUrl: './videosource.component.html',
})
export class VideoSourceComponent implements AfterViewInit {
  @ViewChild('videoEl', { static: true })
  private readonly videoEl!: ElementRef<HTMLVideoElement>;

  // ✅ Only TCOUT is user typed now
  tcOutText = '';

  constructor(public readonly video: ClapVideoSourceService) {
    // Default selection once sources are loaded
    effect(() => {
      const sources = this.video.videoSources();
      if (sources.length > 0 && !this.video.selectedSource()) {
        const defaultSource = sources[2] || sources[0];
        this.video.selectedSource.set(defaultSource);

        // Trigger initial video load if view is already ready
        if (this.videoEl) {
          const el = this.videoEl.nativeElement;
          el.src = defaultSource.url;
          el.load();
          this.video.connectVideo(el);
        }
      }
    });

    // Keep TCOUT input in sync when subsection is cleared elsewhere.
    effect(() => {
      const subIn = this.video.subIn();
      const subOut = this.video.subOut();
      if (subIn == null && subOut == null && this.tcOutText !== '') {
        this.tcOutText = '';
      }
    });
  }

  get videoSrc(): string {
    return this.video.selectedSource()?.url ?? '';
  }

  // ---------- lifecycle ----------
  ngAfterViewInit(): void {
    const el = this.videoEl.nativeElement;

    if (this.video.selectedSource()) {
      el.src = this.videoSrc;
      el.load();
      this.video.connectVideo(el);
    }
  }

  // ---------- UI events ----------
  onSourceChange(event: Event): void {
    const url = (event.target as HTMLSelectElement).value;
    const source = this.video.videoSources().find(s => s.url === url) || null;
    this.video.selectedSource.set(source);

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

  onSubSectionTimeInput(
    index: number,
    field: 'tcin' | 'tcout',
    rawValue: string,
  ): void {
    this.video.updateSubSectionByIndex(index, field, rawValue);
  }

  onSubSectionNameInput(index: number, rawValue: string): void {
    this.video.updateSubSectionByIndex(index, 'name', rawValue);
  }

  toSecondsValue(tc: string): string {
    const seconds = parseTimecodeToSeconds(tc);
    return seconds == null ? '' : String(seconds);
  }

  editSubsection(sub: VideoSubSectionDTO): void {
    this.tcOutText = sub.tcout;
    this.video.editSubSection(sub);
  }

  playSubsection(sub: VideoSubSectionDTO): void {
    this.tcOutText = sub.tcout;
    this.video.playSubSection(sub);
  }

  playAllSections(): void {
    const subs = this.video.selectedSource()?.subSections ?? [];
    this.video.playAllSections(subs);
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
