import { Injectable, effect, signal } from '@angular/core';

type TimeSource = 'video' | 'timeline';

@Injectable({ providedIn: 'root' })
export class ClapVideoSourceService {
  readonly duration = signal<number>(0);
  readonly currentTime = signal<number>(0);
  readonly isScrubbing = signal<boolean>(false);

  readonly subIn = signal<number | null>(null);
  readonly subOut = signal<number | null>(null);

  private _video: HTMLVideoElement | null = null;
  private _lastSource = signal<TimeSource>('video');
  private _cleanup: (() => void) | null = null;

  // High-frequency sync loop (video -> service)
  private _syncRunning = false;
  private _rafId: number | null = null;
  private _rvfcId: number | null = null;

  // Tuning knobs
  private readonly _epsilon = 1 / 240; // ~0.004s; prevents noisy updates

  constructor() {
    // Timeline -> Video seeking (write-through)
    effect(() => {
      const video = this._video;
      const t = this.currentTime();
      const source = this._lastSource();

      if (!video) return;
      if (source !== 'timeline') return;

      // Don’t thrash the media element for tiny diffs
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

    this._stopSyncLoop();

    this._video = video;

    // Reset published values
    this.duration.set(0);
    this.currentTime.set(video.currentTime || 0);
    this._lastSource.set('video');

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

    const publishFromVideo = () => {
      if (this.isScrubbing()) return; // timeline is “owning” the UI now

      // If timeline was the last writer, don’t fight it.
      // As soon as video catches up closely, we can hand back control to video.
      if (this._lastSource() === 'timeline') {
        const desired = this.currentTime();
        const actual = video.currentTime || 0;
        if (Math.abs(actual - desired) > 0.03) return;
        this._lastSource.set('video');
      }

      const t = video.currentTime || 0;
      const prev = this.currentTime();

      if (Math.abs(t - prev) < this._epsilon) return;

      this._lastSource.set('video');
      this.currentTime.set(t);
    };

    const onLoadedMetadata = () => {
      updateDuration();
      // publish immediately
      this._lastSource.set('video');
      this.currentTime.set(video.currentTime || 0);

      // Start the high-frequency loop if we’re likely to move
      if (!video.paused && !video.ended) this._startSyncLoop(publishFromVideo);
    };

    const onPlay = () => this._startSyncLoop(publishFromVideo);
    const onPause = () => this._stopSyncLoop();
    const onEnded = () => this._stopSyncLoop();

    // Important for native scrub bar: these fire when user drags the built-in controls
    const onSeeking = () => {
      updateDuration();
      publishFromVideo(); // immediate UI response while dragging
    };
    const onSeeked = () => {
      updateDuration();
      publishFromVideo(); // ensure final value is published
    };

    // Keep as fallback
    const onTimeUpdate = () => publishFromVideo();

    const onLoadedData = () => updateDuration();
    const onCanPlay = () => updateDuration();
    const onDurationChange = () => updateDuration();

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('durationchange', onDurationChange);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);

    video.addEventListener('timeupdate', onTimeUpdate);

    // If metadata already present, publish immediately
    if (video.readyState >= 1) onLoadedMetadata();
    requestAnimationFrame(() => updateDuration());

    this._cleanup = () => {
      this._stopSyncLoop();

      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('durationchange', onDurationChange);

      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);

      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);

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

  private _startSyncLoop(publishFromVideo: () => void): void {
    const video = this._video;
    if (!video) return;
    if (this._syncRunning) return;

    this._syncRunning = true;

    // Best: sync on decoded frames
    const anyVideo = video as any;
    if (typeof anyVideo.requestVideoFrameCallback === 'function') {
      const step = () => {
        if (!this._syncRunning || this._video !== video) return;
        publishFromVideo();
        this._rvfcId = anyVideo.requestVideoFrameCallback(step);
      };
      this._rvfcId = anyVideo.requestVideoFrameCallback(step);
      return;
    }

    // Fallback: RAF
    const tick = () => {
      if (!this._syncRunning || this._video !== video) return;
      publishFromVideo();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _stopSyncLoop(): void {
    this._syncRunning = false;

    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    const video = this._video as any;
    if (this._rvfcId != null && video && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(this._rvfcId);
      this._rvfcId = null;
    } else {
      this._rvfcId = null;
    }
  }

  setSubSection(tcIn: number | null, tcOut: number | null): void {
    const d = this.duration();

    const clamp = (v: number) => (d > 0 ? Math.max(0, Math.min(d, v)) : Math.max(0, v));

    const a = tcIn == null ? null : clamp(tcIn);
    const b = tcOut == null ? null : clamp(tcOut);

    // allow typing in any order, but normalize if both present
    if (a != null && b != null) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      this.subIn.set(lo);
      this.subOut.set(hi);
      return;
    }

    this.subIn.set(a);
    this.subOut.set(b);
  }

  setSubIn(tcIn: number | null): void {
    if (tcIn == null) {
      this.subIn.set(null);
      return;
    }
    const d = this.duration();
    const clamped = d > 0 ? Math.max(0, Math.min(d, tcIn)) : Math.max(0, tcIn);
    this.subIn.set(clamped);
  }

  setSubOut(tcOut: number | null): void {
    if (tcOut == null) {
      this.subOut.set(null);
      return;
    }
    const d = this.duration();
    const clamped = d > 0 ? Math.max(0, Math.min(d, tcOut)) : Math.max(0, tcOut);
    this.subOut.set(clamped);
  }

}
