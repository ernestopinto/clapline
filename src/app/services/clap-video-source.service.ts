import { Injectable, signal, effect } from '@angular/core';

type TimeSource = 'video' | 'timeline';

@Injectable({ providedIn: 'root' })
export class ClapVideoSourceService {
  readonly duration = signal<number>(0);
  readonly currentTime = signal<number>(0);
  readonly isScrubbing = signal<boolean>(false);

  private _video: HTMLVideoElement | null = null;
  private _lastSource = signal<TimeSource>('video');
  private _cleanup: (() => void) | null = null;

  constructor() {
    // Timeline -> Video seeking
    effect(() => {
      const video = this._video;
      const t = this.currentTime();
      const source = this._lastSource();

      if (!video) return;
      if (source !== 'timeline') return;

      if (Math.abs(video.currentTime - t) < 0.02) return;

      try {
        video.currentTime = t;
      } catch {
        // ignore (seek can fail early)
      }
    });
  }

  connectVideo(video: HTMLVideoElement): void {
    this._cleanup?.();
    this._cleanup = null;

    this._video = video;

    // New source -> reset published values
    this.duration.set(0);
    this.currentTime.set(video.currentTime || 0);

    const updateDuration = () => {
      let d = video.duration;

      // duration may be NaN/Infinity/0 early; use seekable as fallback
      if (!Number.isFinite(d) || d <= 0) {
        try {
          if (video.seekable && video.seekable.length > 0) {
            d = video.seekable.end(video.seekable.length - 1);
          }
        } catch {
          // ignore
        }
      }

      if (Number.isFinite(d) && d > 0) {
        this.duration.set(d);
      }
    };

    const onLoadedMetadata = () => {
      updateDuration();
      this._lastSource.set('video');
      this.currentTime.set(video.currentTime || 0);
    };

    const onLoadedData = () => updateDuration();
    const onCanPlay = () => updateDuration();
    const onDurationChange = () => updateDuration();

    const onTimeUpdate = () => {
      if (this.isScrubbing()) return;
      this._lastSource.set('video');
      this.currentTime.set(video.currentTime || 0);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('timeupdate', onTimeUpdate);

    // If metadata already present, publish immediately
    if (video.readyState >= 1) onLoadedMetadata();

    // Also retry once on next frame (some browsers populate duration slightly later)
    requestAnimationFrame(() => updateDuration());

    this._cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }

  beginScrub(): void {
    this.isScrubbing.set(true);
  }

  endScrub(): void {
    this.isScrubbing.set(false);
  }

  setTimeFromTimeline(t: number): void {
    const d = this.duration();
    const clamped = d > 0 ? Math.max(0, Math.min(d, t)) : Math.max(0, t);

    this._lastSource.set('timeline');
    this.currentTime.set(clamped);
  }
}
