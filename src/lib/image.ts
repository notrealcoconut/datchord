const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class ImageReadError extends Error {
  code: 'invalidType' | 'tooLarge' | 'readError';

  constructor(code: 'invalidType' | 'tooLarge' | 'readError') {
    super(code);
    this.name = 'ImageReadError';
    this.code = code;
  }
}

export function validateImageFile(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new ImageReadError('invalidType');
  if (file.size > MAX_BYTES) throw new ImageReadError('tooLarge');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageReadError('readError'));
    };
    image.src = url;
  });
}

export async function readImageFile(file: File, maxSize = 512): Promise<string> {
  validateImageFile(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    throw new ImageReadError('readError');
  }

  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (!side) throw new ImageReadError('readError');
  const target = Math.min(maxSize, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageReadError('readError');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const sx = (image.naturalWidth - side) / 2;
  const sy = (image.naturalHeight - side) / 2;
  context.drawImage(image, sx, sy, side, side, 0, 0, target, target);

  const dataUrl = canvas.toDataURL('image/webp', 0.9);
  if (!dataUrl.startsWith('data:image/webp')) {
    return canvas.toDataURL('image/png');
  }
  return dataUrl;
}
