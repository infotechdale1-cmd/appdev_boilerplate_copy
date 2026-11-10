export interface OcrOptions {
  lang?: string;
  pageSegMode?: number;
  whitelist?: string;
  blacklist?: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
  source: 'tesseract' | 'ocr_space' | 'fallback';
  error?: string;
}

export async function isTesseractAvailable(): Promise<boolean> {
  return false;
}

export async function getTesseractLanguages(): Promise<string[]> {
  return ['eng'];
}

export async function prepareTessData(_lang: string = 'eng'): Promise<boolean> {
  return false;
}

export async function recognizeTextWithTesseract(
  _imageUriOrBase64: string,
  _options?: OcrOptions
): Promise<OcrResult> {
  throw new Error('Native Tesseract OCR is only available in the Android app build.');
}

export async function extractTextFromImage(
  imageUriOrBase64: string,
  mimeType: string = 'image/jpeg',
  _options?: OcrOptions
): Promise<OcrResult> {
  try {
    let cleanBase64 = imageUriOrBase64;
    if (imageUriOrBase64.startsWith('data:')) {
      cleanBase64 = imageUriOrBase64.split(',')[1] || imageUriOrBase64;
    }
    const dataUri = `data:${mimeType || 'image/jpeg'};base64,${cleanBase64}`;
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: 'helloworld',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        isTable: 'true',
        scale: 'true',
        base64Image: dataUri,
      }).toString(),
    });

    if (!response.ok) return { text: '', confidence: 0, source: 'fallback' };
    const data = await response.json();
    const text = data?.ParsedResults?.[0]?.ParsedText || '';
    return {
      text,
      confidence: 70,
      source: 'ocr_space',
    };
  } catch {
    return {
      text: '',
      confidence: 0,
      source: 'fallback',
    };
  }
}
