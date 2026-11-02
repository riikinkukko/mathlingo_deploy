import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { api } from "./api";
import type { HomePayload } from "./types";

const TOPIC_KEY = "planimetrika_topic";

// Выбранная тема — общая для всех экранов (главная, выбор темы) и сохраняется между запусками.
let topicValue: string | null = null;
const listeners = new Set<() => void>();
AsyncStorage.getItem(TOPIC_KEY)
  .then((v) => {
    if (v && !topicValue) {
      topicValue = v;
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

export function useSelectedTopic(): [string | null, (id: string) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => topicValue
  );
  const set = useCallback((id: string) => {
    topicValue = id;
    listeners.forEach((l) => l());
    AsyncStorage.setItem(TOPIC_KEY, id).catch(() => {});
  }, []);
  return [value, set];
}

export function useHome(topic: string | null) {
  return useQuery({
    queryKey: ["home", topic ?? "auto"],
    queryFn: () => api<HomePayload>(`/api/m/home${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`),
  });
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
