export interface AiImage {
  base64: string;
  mimeType: string;
}

export async function prepareImageForAi(base64: string, mimeType: string): Promise<AiImage> {
  return { base64, mimeType };
}
