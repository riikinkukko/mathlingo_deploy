import Constants from "expo-constants";

/** Адрес сервера: EXPO_PUBLIC_API_URL (для разработки) или app.json → extra.apiUrl. */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  "https://planimetrika.online"
).replace(/\/$/, "");
