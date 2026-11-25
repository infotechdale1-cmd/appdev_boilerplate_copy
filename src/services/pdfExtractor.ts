// @ts-expect-error pako untyped
import pako from 'pako';

function unescapePdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([()\\])/g, '$1');
}

function decodeHex(hexStr: string): string {
  let decoded = '';
  for (let i = 0; i < hexStr.length; i += 2) {
    const code = parseInt(hexStr.substr(i, 2), 16);
    if (!isNaN(code)) {
      decoded += String.fromCharCode(code);
    }
  }
  return decoded;
}

function extractTextFromContentStream(streamStr: string): string {
  let text = '';
  const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(streamStr)) !== null) {
    const block = btMatch[1];
    const lines = block.split(/(?:T\*|(?:\-?\d+(?:\.\d+)?\s+\-?\d+(?:\.\d+)?\s+T[dD]))/);

    for (const line of lines) {
      let lineText = '';

      // (string) Tj
      const tjRegex = /\(((?:[^\\)]|\\.)*)\)\s*Tj/g;
      let tj: RegExpExecArray | null;
      while ((tj = tjRegex.exec(line)) !== null) {
        lineText += unescapePdfString(tj[1]) + ' ';
      }

      // <hex> Tj
      const hexRegex = /<([0-9a-fA-F]+)>\s*Tj/g;
      let hex: RegExpExecArray | null;
      while ((hex = hexRegex.exec(line)) !== null) {
        lineText += decodeHex(hex[1]) + ' ';
      }

      // [(item1) (item2)] TJ
      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let tjArr: RegExpExecArray | null;
      while ((tjArr = tjArrayRegex.exec(line)) !== null) {
        const itemRegex = /\(((?:[^\\)]|\\.)*)\)|<([0-9a-fA-F]+)>/g;
        let item: RegExpExecArray | null;
        while ((item = itemRegex.exec(tjArr[1])) !== null) {
          if (item[1] !== undefined) {
            lineText += unescapePdfString(item[1]);
          } else if (item[2] !== undefined) {
            lineText += decodeHex(item[2]);
          }
        }
        lineText += ' ';
      }

      if (lineText.trim()) {
        text += lineText.trim() + '\n';
      }
    }
  }

  return text;
}

/**
 * Extracts embedded text from a PDF file buffer or Uint8Array.
 * Handles FlateDecode compressed streams using pako and standard uncompressed streams.
 */
export function extractTextFromPdfBytes(data: Uint8Array): string {
  let rawStr = '';
  const chunkSize = 32768;
  for (let i = 0; i < data.length; i += chunkSize) {
    const sub = data.subarray(i, Math.min(i + chunkSize, data.length));
    rawStr += String.fromCharCode.apply(null, Array.from(sub));
  }

  let extractedText = '';
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(rawStr)) !== null) {
    const rawStreamChunk = match[1];
    const streamStartIdx = match.index + match[0].indexOf(rawStreamChunk);
    const streamBytes = data.subarray(streamStartIdx, streamStartIdx + rawStreamChunk.length);

    let decompressed = '';
    try {
      decompressed = pako.inflate(streamBytes, { to: 'string' });
    } catch {
      decompressed = rawStreamChunk;
    }

    if (decompressed && decompressed.includes('BT')) {
      const pageText = extractTextFromContentStream(decompressed);
      if (pageText.trim()) {
        extractedText += pageText + '\n';
      }
    }
  }

  return extractedText.trim();
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_CHARS.indexOf(clean[i]);
    const b = B64_CHARS.indexOf(clean[i + 1]);
    const c = B64_CHARS.indexOf(clean[i + 2]);
    const d = B64_CHARS.indexOf(clean[i + 3]);
    if (a >= 0 && b >= 0) bytes[p++] = (a << 2) | (b >> 4);
    if (b >= 0 && c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (c >= 0 && d >= 0) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, p);
}

/**
 * Convenience function to extract text from a base64 encoded PDF string.
 */
export function extractTextFromPdfBase64(base64: string): string {
  try {
    const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const bytes = base64ToBytes(cleanB64);
    return extractTextFromPdfBytes(bytes);
  } catch (err) {
    console.warn('[PDF Extractor] Error extracting text from PDF base64:', err);
    return '';
  }
}
