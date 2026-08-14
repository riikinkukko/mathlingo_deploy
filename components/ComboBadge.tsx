"use client";

import { IconFlame } from "./icons";

export default function ComboBadge({ combo }: { combo: number }) {
  if (combo < 2) return null;

  const hot = combo >= 6;
  const warm = combo >= 4;

  return (
    <div
      key={combo}
      className={`inline-flex animate-pop-in items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-extrabold shadow-soft ${
        hot
          ? "bg-gradient-to-r from-amber to-coral text-white"
          : warm
            ? "bg-coral text-white"
            : "bg-amber text-white"
      }`}
    >
      <IconFlame className="h-4 w-4" />
      Комбо ×{combo}
    </div>
  );
}
