export interface ImageDimensions {
  width: number;
  height: number;
}

export const MIN_CREATE_WIDTH  = 400;
export const MIN_CREATE_HEIGHT = 300;

export async function getImageDimensions(dataUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}
