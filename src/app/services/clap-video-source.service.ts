import { Injectable, effect, signal } from '@angular/core';
import { VideoSourceDTO, VideoSubSectionDTO } from '../models/video-source.dto';

type TimeSource = 'video' | 'timeline';

@Injectable({ providedIn: 'root' })
export class ClapVideoSourceService {
  readonly videoSources = signal<VideoSourceDTO[]>([]);
  readonly isLoading = signal<boolean>(false);

  readonly duration = signal<number>(0);
  readonly currentTime = signal<number>(0);
  readonly isScrubbing = signal<boolean>(false);
  readonly isPlayingSubSection = signal<boolean>(false);

  readonly subIn = signal<number | null>(null);
  readonly subOut = signal<number | null>(null);
  readonly selectedSource = signal<VideoSourceDTO | null>(null);

  private _video: HTMLVideoElement | null = null;
  private _lastSource = signal<TimeSource>('video');
  private _cleanup: (() => void) | null = null;
  private _rangeStopCleanup: (() => void) | null = null;
  private _rangeStopRafId: number | null = null;
  private _rangeStopRvfcId: number | null = null;
  private _playAllQueue: VideoSubSectionDTO[] | null = null;
  private _playAllIndex = 0;
  private _ignoreNextPause = false;

  // High-frequency sync loop (video -> service)
  private _syncRunning = false;
  private _rafId: number | null = null;
  private _rvfcId: number | null = null;

  // Tuning knobs
  private readonly _epsilon = 1 / 240; // ~0.004s; prevents noisy updates

  constructor() {
    // Simulate loading
    this.isLoading.set(true);
    setTimeout(() => {
      this.videoSources.set([
        {
          name: 'Woman dancing on the street',
          url: 'assets/videos/womanDancing.mp4',
          subSections: [
            { name: 's1', tcin: '00:00:03', tcout: '00:00:04' },
          ]
        },
        {
          name: 'Woman dancing on an ancient monument',
          url: 'assets/videos/woman2.mp4',
          subSections: [
            { name: 's1', tcin: '00:00:02', tcout: '00:00:03' },
            { name: 's1', tcin: '00:00:04', tcout: '00:00:10.5' },
            { name: 's1', tcin: '00:00:13', tcout: '00:00:15' }
          ]
        },
        {
          name: 'Cats',
          url: 'assets/videos/cats.mp4',
          subSections: [
            { name: 's1', tcin: '00:00:02', tcout: '00:00:4' },
            { name: 's2', tcin: '00:00:5', tcout: '00:00:8' }
          ]
        }
      ]);
      this.isLoading.set(false);
    }, 1500);

    // Timeline -> Video seeking (write-through)
    effect(() => {
      const video = this._video;
      const t = this.currentTime();
      const source = this._lastSource();
      const scrubbing = this.isScrubbing();

      if (!video) return;
      if (source !== 'timeline') return;

      // Don’t thrash the media element for tiny diffs
      const threshold = scrubbing ? 0 : 0.02;
      if (Math.abs(video.currentTime - t) < threshold) return;

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
      this._lastSource.set('video');
      publishFromVideo(); // immediate UI response while dragging
    };
    const onSeeked = () => {
      updateDuration();
      this._lastSource.set('video');
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
      this._clearRangeStop();

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

  updateSubSectionByIndex(
    index: number,
    field: 'name' | 'tcin' | 'tcout',
    rawValue: string,
  ): void {
    const source = this.selectedSource();
    if (!source) return;
    if (index < 0 || index >= source.subSections.length) return;

    const updatedSubSections = source.subSections.map((s, i) => {
      if (i !== index) return s;
      return { ...s, [field]: rawValue };
    });

    const updatedSource: VideoSourceDTO = { ...source, subSections: updatedSubSections };
    this.selectedSource.set(updatedSource);

    const sources = this.videoSources().map((s) =>
      s.url === updatedSource.url ? updatedSource : s,
    );
    this.videoSources.set(sources);
  }

  editSubSection(sub: VideoSubSectionDTO): void {
    const a = this._parseTimecodeToSeconds(sub.tcin);
    const b = this._parseTimecodeToSeconds(sub.tcout);
    this.setSubSection(a, b);
  }

  playSubSection(sub: VideoSubSectionDTO): void {
    const video = this._video;
    if (!video) return;
    this._clearPlayAllQueue();

    const a = this._parseTimecodeToSeconds(sub.tcin);
    const b = this._parseTimecodeToSeconds(sub.tcout);
    if (a == null || b == null) return;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    this.setSubSection(lo, hi);
    this._lastSource.set('timeline');
    this.currentTime.set(lo);
    this.isPlayingSubSection.set(true);

    try {
      video.currentTime = lo;
    } catch {
      // ignore (seek can fail early)
    }

    this._installRangeStop(hi);
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        this.isPlayingSubSection.set(false);
        // ignore autoplay restrictions
      });
    }
  }

  playAllSections(subs: VideoSubSectionDTO[]): void {
    const video = this._video;
    if (!video) return;

    const queue = subs.filter((s) => {
      const a = this._parseTimecodeToSeconds(s.tcin);
      const b = this._parseTimecodeToSeconds(s.tcout);
      return a != null && b != null;
    });
    if (queue.length === 0) return;

    this._playAllQueue = queue;
    this._playAllIndex = 0;
    this._playNextInQueue();
  }

  private _playNextInQueue(): void {
    if (!this._playAllQueue) return;
    if (this._playAllIndex >= this._playAllQueue.length) {
      this._clearPlayAllQueue();
      return;
    }

    const sub = this._playAllQueue[this._playAllIndex];
    const a = this._parseTimecodeToSeconds(sub.tcin);
    const b = this._parseTimecodeToSeconds(sub.tcout);
    if (a == null || b == null) {
      this._playAllIndex += 1;
      this._playNextInQueue();
      return;
    }

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    const video = this._video;
    if (!video) return;

    this.setSubSection(lo, hi);
    this._lastSource.set('timeline');
    this.currentTime.set(lo);
    this.isPlayingSubSection.set(true);

    try {
      video.currentTime = lo;
    } catch {
      // ignore (seek can fail early)
    }

    this._installRangeStop(hi, () => {
      this._playAllIndex += 1;
      this._playNextInQueue();
    });

    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        this.isPlayingSubSection.set(false);
        this._clearPlayAllQueue();
      });
    }
  }

  private _clearPlayAllQueue(): void {
    this._playAllQueue = null;
    this._playAllIndex = 0;
  }

  private _installRangeStop(end: number, onEnd?: () => void): void {
    const video = this._video;
    if (!video) return;

    this._clearRangeStop();

    const stopAtEnd = () => {
      try {
        video.currentTime = end;
      } catch {
        // ignore (seek can fail early)
      }
      this.currentTime.set(end);
      this._ignoreNextPause = true;
      video.pause();
      this.isPlayingSubSection.set(false);
      this._clearRangeStop();
      if (onEnd) onEnd();
    };

    const tick = () => {
      if (video.currentTime >= end - this._epsilon) {
        stopAtEnd();
        return;
      }
      this._rangeStopRafId = requestAnimationFrame(tick);
    };

    const anyVideo = video as any;
    if (typeof anyVideo.requestVideoFrameCallback === 'function') {
      const step = () => {
        if (video.currentTime >= end - this._epsilon) {
          stopAtEnd();
          return;
        }
        this._rangeStopRvfcId = anyVideo.requestVideoFrameCallback(step);
      };
      this._rangeStopRvfcId = anyVideo.requestVideoFrameCallback(step);
    } else {
      this._rangeStopRafId = requestAnimationFrame(tick);
    }
    const onPause = () => {
      if (this._ignoreNextPause) {
        this._ignoreNextPause = false;
        return;
      }
      this.isPlayingSubSection.set(false);
      this._clearPlayAllQueue();
      this._clearRangeStop();
    };

    video.addEventListener('pause', onPause);
    this._rangeStopCleanup = () => {
      video.removeEventListener('pause', onPause);
      if (this._rangeStopRafId != null) {
        cancelAnimationFrame(this._rangeStopRafId);
        this._rangeStopRafId = null;
      }
      const any = video as any;
      if (this._rangeStopRvfcId != null && typeof any.cancelVideoFrameCallback === 'function') {
        any.cancelVideoFrameCallback(this._rangeStopRvfcId);
        this._rangeStopRvfcId = null;
      } else {
        this._rangeStopRvfcId = null;
      }
    };
  }

  private _clearRangeStop(): void {
    if (!this._rangeStopCleanup) return;
    this._rangeStopCleanup();
    this._rangeStopCleanup = null;
  }

  private _parseTimecodeToSeconds(raw: string): number | null {
    const s = raw.trim();
    if (!s) return null;

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
}
