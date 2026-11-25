import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type DetectedFileType = 'image' | 'pdf' | 'text' | 'unsupported';

export interface FileInputAsset {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  fileSize?: number;
  file?: unknown; // browser File/Blob on web
  includeBase64?: boolean;
}

export interface FileReadResult {
  success: boolean;
  fileType: DetectedFileType;
  name: string;
  mimeType: string;
  size: number;
  localUri: string;
  base64?: string;
  textContent?: string;
  error?: string;
}

const SUPPORTED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
const SUPPORTED_TEXT_EXTS = ['txt', 'csv', 'tsv', 'json'];

export function detectFileType(name: string, mimeType?: string): DetectedFileType {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (lowerMime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (lowerMime.startsWith('image/') || SUPPORTED_IMAGE_EXTS.includes(ext)) {
    return 'image';
  }
  if (lowerMime.startsWith('text/') || lowerMime.includes('json') || lowerMime.includes('csv') || SUPPORTED_TEXT_EXTS.includes(ext)) {
    return 'text';
  }
  return 'unsupported';
}

export function getMimeType(name: string, detectedType: DetectedFileType, providedMime?: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (detectedType === 'pdf') return 'application/pdf';
  if (
    providedMime &&
    providedMime.includes('/') &&
    !['application/octet-stream', 'binary/octet-stream'].includes(providedMime.toLowerCase())
  ) {
    return providedMime;
  }
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'json') return 'application/json';
  return detectedType === 'image' ? 'image/jpeg' : 'text/plain';
}

/**
 * Reads any selected file or URI across Android and Web, guaranteeing:
 * - Proper temporary permission & cache handling
 * - Content validation (size, readability)
 * - Base64 extraction for images and PDFs
 * - UTF-8 text extraction for text files
 */
export async function readTimetableFile(asset: FileInputAsset): Promise<FileReadResult> {
  const fileName = asset.name || (asset.uri.split('/').pop() || 'uploaded_timetable').split('?')[0];
  const fileType = detectFileType(fileName, asset.mimeType);
  const mimeType = getMimeType(fileName, fileType, asset.mimeType);

  if (fileType === 'unsupported') {
    return {
      success: false,
      fileType: 'unsupported',
      name: fileName,
      mimeType,
      size: asset.size || asset.fileSize || 0,
      localUri: asset.uri,
      error: `Unsupported format (${fileName}). StudyTrac supports PDF timetables, image files (JPG, PNG, WEBP), and text/CSV schedules.`,
    };
  }

  // Handle WEB file reading
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const size = blob.size || asset.size || 0;

      if (size === 0) {
        return {
          success: false,
          fileType,
          name: fileName,
          mimeType,
          size: 0,
          localUri: asset.uri,
          error: 'The selected file is empty (0 bytes).',
        };
      }

      if (fileType === 'text') {
        const textContent = await blob.text();
        return {
          success: true,
          fileType,
          name: fileName,
          mimeType,
          size,
          localUri: asset.uri,
          textContent,
        };
      }

      // Read as base64 for image or PDF
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result || '');
          const b64 = res.includes(',') ? res.split(',')[1] : res;
          resolve(b64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      return {
        success: true,
        fileType,
        name: fileName,
        mimeType,
        size,
        localUri: asset.uri,
        base64,
      };
    } catch (webErr) {
      const msg = webErr instanceof Error ? webErr.message : String(webErr);
      return {
        success: false,
        fileType,
        name: fileName,
        mimeType,
        size: asset.size || 0,
        localUri: asset.uri,
        error: `Could not read file in browser: ${msg}`,
      };
    }
  }

  // Handle NATIVE (Android) file reading
  let activeUri = asset.uri;

  try {
    // If it's a content URI, copy to local cache directory to ensure permanent access
    if (activeUri.startsWith('content://')) {
      const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const cacheDir = FileSystem.cacheDirectory || `${FileSystem.documentDirectory}scans/`;
      const targetPath = `${cacheDir}scan_${Date.now()}_${cleanName}`;
      try {
        await FileSystem.copyAsync({ from: activeUri, to: targetPath });
        activeUri = targetPath;
      } catch (copyErr) {
        // Fallback to activeUri if copy fails
        console.warn('[FileReader] Content URI copy fallback:', copyErr);
      }
    }

    // Verify accessibility and size
    const info = await FileSystem.getInfoAsync(activeUri);
    if (!info.exists) {
      return {
        success: false,
        fileType,
        name: fileName,
        mimeType,
        size: 0,
        localUri: activeUri,
        error: `File does not exist or cannot be accessed at ${activeUri}`,
      };
    }

    const fileSize = info.size ?? asset.size ?? 0;
    if (fileSize === 0) {
      return {
        success: false,
        fileType,
        name: fileName,
        mimeType,
        size: 0,
        localUri: activeUri,
        error: 'The selected file is empty (0 bytes).',
      };
    }

    if (fileType === 'text') {
      const textContent = await FileSystem.readAsStringAsync(activeUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return {
        success: true,
        fileType,
        name: fileName,
        mimeType,
        size: fileSize,
        localUri: activeUri,
        textContent,
      };
    }

    // Keep native image scans on the local URI to avoid copying large photos
    // through JavaScript. PDFs still need base64 for text extraction/rendering.
    const base64 = asset.includeBase64 === false && fileType === 'image'
      ? undefined
      : await FileSystem.readAsStringAsync(activeUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

    return {
      success: true,
      fileType,
      name: fileName,
      mimeType,
      size: fileSize,
      localUri: activeUri,
      base64,
    };
  } catch (nativeErr) {
    const msg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
    return {
      success: false,
      fileType,
      name: fileName,
      mimeType,
      size: asset.size || 0,
      localUri: activeUri,
      error: `Failed to read file from storage: ${msg}`,
    };
  }
}
