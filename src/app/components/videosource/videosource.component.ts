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

  constructor(public readonly video: ClapVideoSourceService) {}

  ngAfterViewInit(): void {
    const el = this.videoEl.nativeElement;

    el.src = this.videoSrc;
    el.load();

    this.video.connectVideo(el);
  }

  onSourceChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as VideoKey;
    this.selected = value;
    this.videoSrc = this.toSrc(value);

    const el = this.videoEl.nativeElement;
    el.pause();
    el.src = this.videoSrc;
    el.load();

    this.video.connectVideo(el);
  }

  private toSrc(key: VideoKey): string {
    // because files are in: src/assets/videos/...
    return key === 'woman'
      ? 'assets/videos/woman.mp4'
      : key === 'woman2'
        ? 'assets/videos/woman2.mp4'
        : 'assets/videos/anabela.mp4';
  }
}
