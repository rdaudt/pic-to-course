export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const { videoWidth: width, videoHeight: height } = video;
  if (!width || !height) {
    return Promise.reject(new Error('Camera frame is not ready'));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return Promise.reject(new Error('Could not prepare the camera frame'));
  }

  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not capture the camera frame'));
    }, 'image/jpeg', 0.95);
  });
}
