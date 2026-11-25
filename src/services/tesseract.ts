import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

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

interface NativeTesseractModule {
  isAvailable(): Promise<boolean>;
  getAvailableLanguages(): Promise<string[]>;
  prepareTessData(lang?: string): Promise<string>;
  recognize(
    imageUri: string,
    options?: {
      lang?: string;
      pageSegMode?: number;
      whitelist?: string;
      blacklist?: string;
    }
  ): Promise<{ text: string; confidence: number }>;
}

function getNativeTesseract(): NativeTesseractModule | null {
  if (Platform.OS !== 'android') return null;
  return requireOptionalNativeModule<NativeTesseractModule>('TesseractOcr');
}

/**
 * Checks if the native Tesseract OCR engine and trained models are available.
 */
export async function isTesseractAvailable(): Promise<boolean> {
  const native = getNativeTesseract();
  if (!native) return false;
  try {
    return await native.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Returns list of language codes installed/ready in tessdata (e.g. ['eng']).
 */
export async function getTesseractLanguages(): Promise<string[]> {
  const native = getNativeTesseract();
  if (!native) return ['eng'];
  try {
    return await native.getAvailableLanguages();
  } catch {
    return ['eng'];
  }
}

/**
 * Explicitly prepare/unpack language data from assets to internal storage.
 */
export async function prepareTessData(lang: string = 'eng'): Promise<boolean> {
  const native = getNativeTesseract();
  if (!native) return false;
  try {
    await native.prepareTessData(lang);
    return true;
  } catch (err) {
    console.warn('[Tesseract] prepareTessData error:', err);
    return false;
  }
}

/**
 * Performs local, on-device OCR using Tesseract (100% offline, private).
 * Supports file://, content://, local path, or base64 input.
 */
export async function recognizeTextWithTesseract(
  imageUriOrBase64: string,
  options?: OcrOptions
): Promise<OcrResult> {
  const native = getNativeTesseract();
  if (!native) {
    throw new Error('Tesseract OCR native module is not available on this platform.');
  }

  const result = await native.recognize(imageUriOrBase64, {
    lang: options?.lang || 'eng',
    pageSegMode: options?.pageSegMode ?? 3, // PSM_AUTO
    whitelist: options?.whitelist,
    blacklist: options?.blacklist,
  });

  return {
    text: result.text,
    confidence: result.confidence,
    source: 'tesseract',
  };
}

/**
 * Fallback to OCR Space API (useful if on web or if Tesseract is uninitialized).
 */
async function extractTextWithOcrSpace(
  base64OrUri: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  let cleanBase64 = base64OrUri;
  if (/^(file|content):\/\//i.test(base64OrUri)) {
    try {
      cleanBase64 = await FileSystem.readAsStringAsync(base64OrUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (error) {
      console.warn('[OCR] Could not read local image for cloud fallback:', error);
      return '';
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    if (base64OrUri.startsWith('data:')) {
      cleanBase64 = base64OrUri.split(',')[1] || base64OrUri;
    }
    const dataUri = `data:${mimeType || 'image/jpeg'};base64,${cleanBase64}`;
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: 'helloworld',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: controller.signal,
      body: new URLSearchParams({
        isTable: 'true',
        scale: 'true',
        base64Image: dataUri,
      }).toString(),
    });

    if (!response.ok) return '';
    const data = await response.json();
    return data?.ParsedResults?.[0]?.ParsedText || '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Unified OCR extraction:
 * 1. Tries offline Tesseract OCR first (fast, private, no network needed).
 * 2. If offline Tesseract fails or produces empty output, falls back to OCR Space if connected.
 */
export async function extractTextFromImage(
  imageUriOrBase64: string,
  mimeType: string = 'image/jpeg',
  options?: OcrOptions
): Promise<OcrResult> {
  let lastError: string | undefined;

  // 1. Try on-device Tesseract OCR
  try {
    const isAvail = await isTesseractAvailable();
    if (isAvail) {
      const result = await recognizeTextWithTesseract(imageUriOrBase64, options);
      if (result.text && result.text.trim().length > 0) {
        return result;
      } else {
        lastError = 'No text detected by local Tesseract OCR engine.';
      }
    } else {
      lastError = 'Tesseract OCR engine is not ready or language data is missing.';
    }
  } catch (tessErr) {
    const msg = tessErr instanceof Error ? tessErr.message : String(tessErr);
    lastError = `Local OCR error: ${msg}`;
    console.warn('[OCR] Local Tesseract OCR error, falling back:', tessErr);
  }

  // 2. Fallback to OCR Space API (if available)
  try {
    const ocrSpaceText = await extractTextWithOcrSpace(imageUriOrBase64, mimeType);
    if (ocrSpaceText && ocrSpaceText.trim().length > 0) {
      return {
        text: ocrSpaceText,
        confidence: 70,
        source: 'ocr_space',
      };
    }
  } catch (cloudErr) {
    console.warn('[OCR] Cloud OCR fallback error:', cloudErr);
  }

  return {
    text: '',
    confidence: 0,
    source: 'fallback',
    error: lastError || 'No readable text could be recognized in the image.',
  };
}
