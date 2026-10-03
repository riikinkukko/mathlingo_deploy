/** Картинка, присланная учеником (фото решения, снимок черновика): только
 * JPEG/PNG data URL разумного размера. Иначе — null. */
export const MAX_IMAGE_DATA_URL = 720_000;

export function cleanImageDataUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MAX_IMAGE_DATA_URL) return null;
  return /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
}
