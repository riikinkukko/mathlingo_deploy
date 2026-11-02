import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Фото решения: камера или галерея → уменьшаем до 1600 px по длинной стороне
 * и сжимаем в JPEG (тот же предел ~650 КБ, что у сайта) → data URL для сервера.
 */
export async function pickSolutionPhoto(fromCamera: boolean): Promise<string | null | "denied"> {
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return "denied";
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, allowsEditing: false };
  const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const longSide = Math.max(asset.width || 1600, asset.height || 1600);
  const scale = Math.min(1, 1600 / longSide);
  for (const compress of [0.75, 0.6, 0.45]) {
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (scale < 1) ctx.resize({ width: Math.round((asset.width || 1600) * scale) });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
    if (out.base64 && out.base64.length < 640_000) return `data:image/jpeg;base64,${out.base64}`;
  }
  return null;
}
