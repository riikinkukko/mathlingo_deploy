"use client";

import { useEffect } from "react";
import { ymGoal } from "@/lib/ym";

/** Отправляет цель Метрики один раз при показе компонента. Ставим на серверных
 * страницах, где цель = «страницу увидели» (например, экран тарифа). */
export default function TrackGoal({ goal }: { goal: string }) {
  useEffect(() => {
    ymGoal(goal);
  }, [goal]);
  return null;
}
