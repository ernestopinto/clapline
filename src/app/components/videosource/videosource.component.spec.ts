import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoSourceComponent } from './videosource.component';

describe('Videosource', () => {
  let component: VideoSourceComponent;
  let fixture: ComponentFixture<VideoSourceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoSourceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VideoSourceComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
