// Сжатие фото в браузере перед отправкой: длинная сторона до maxSide,
// JPEG с понижением качества, пока не влезет в maxLen символов data URL.
// Снимок с камеры телефона (4–8 МБ) превращается в ~200–600 КБ.
export async function fileToJpeg(file: File, maxSide = 1600, maxLen = 650_000): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    let side = maxSide;
    for (let attempt = 0; attempt < 3; attempt++) {
      const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (let q = 0.82; q >= 0.4; q -= 0.12) {
        const url = canvas.toDataURL("image/jpeg", q);
        if (url.length <= maxLen) return url;
      }
      side = Math.round(side * 0.7);
    }
    return null;
  } catch {
    return null;
  }
}
