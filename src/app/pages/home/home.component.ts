import { Component } from '@angular/core';
import {VideoSourceComponent} from '../../components/videosource/videosource.component';
import {TimelineComponent} from '../../components/timeline/timeline.component';
import { ClapVideoSourceService } from '../../services/clap-video-source.service';

@Component({
  selector: 'app-home',
  imports: [
    VideoSourceComponent,
    TimelineComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  constructor(public readonly videoService: ClapVideoSourceService) {}
}
