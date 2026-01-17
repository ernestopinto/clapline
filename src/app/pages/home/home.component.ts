import { Component } from '@angular/core';
import {VideoSourceComponent} from '../../components/videosource/videosource.component';
import {TimelineComponent} from '../../components/timeline/timeline.component';

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

}
