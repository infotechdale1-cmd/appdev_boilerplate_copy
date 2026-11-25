import type { AiImage } from './prepareImageForAi';

const MAX_IMAGE_DIMENSION = 1800;
const JPEG_QUALITY = 0.85;

export async function prepareImageForAi(base64: string, mimeType: string): Promise<AiImage> {
  const image = new Image();
  const source = base64.startsWith('data:')
    ? base64
    : `data:${mimeType || 'image/jpeg'};base64,${base64}`;
  image.src = source;

  try {
    await image.decode();
  } catch {
    throw new Error('Could not prepare the selected image for Gemini. Please choose another image and try again.');
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare this image. Please try another browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Could not compress the selected image.')),
      'image/jpeg',
      JPEG_QUALITY
    );
  });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the prepared image.'));
    reader.readAsDataURL(blob);
  });
  const encoded = dataUrl.split(',', 2)[1];
  if (!encoded) throw new Error('Could not encode the selected image for Gemini.');

  return { base64: encoded, mimeType: 'image/jpeg' };
}
