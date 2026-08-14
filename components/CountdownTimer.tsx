"use client";

import { useEffect, useState } from "react";
import { IconClock } from "./icons";

function formatTime(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function CountdownTimer({
  deadlineAt,
  onExpire,
}: {
  deadlineAt: string;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.round((new Date(deadlineAt).getTime() - Date.now()) / 1000)
  );

  useEffect(() => {
    if (remaining <= 0) {
      onExpire();
      return;
    }
    const t = setInterval(() => {
      setRemaining((r) => {
        const next = Math.round((new Date(deadlineAt).getTime() - Date.now()) / 1000);
        if (next <= 0) {
          clearInterval(t);
          onExpire();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt]);

  const low = remaining <= 60;
  const warn = remaining <= 300;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-extrabold tabular-nums ${
        low
          ? "animate-pop-in bg-coral text-white"
          : warn
            ? "bg-amber-light text-amber"
            : "bg-pine-light text-pine-dark"
      }`}
    >
      <IconClock className="h-4 w-4" />
      {formatTime(remaining)}
    </div>
  );
}
