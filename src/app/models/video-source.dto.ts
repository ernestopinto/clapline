export interface VideoSubSectionDTO {
  name: string;
  tcin: string;
  tcout: string;
}

export interface VideoSourceDTO {
  name: string;
  url: string;
  subSections: VideoSubSectionDTO[];
}
