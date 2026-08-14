export type Rotation = 0 | 90 | 180 | 270;

export interface EbookRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pageIds: string[];
}

export interface PageRecord {
  id: string;
  ebookId: string;
  imageBlob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
  rotation: Rotation;
  capturedAt: number;
}

export type PageAsset = Pick<
  PageRecord,
  'imageBlob' | 'thumbnailBlob' | 'width' | 'height'
>;
