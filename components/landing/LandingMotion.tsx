"use client";

import { useEffect } from "react";

/**
 * Движение лендинга при прокрутке: элементы с data-reveal проявляются,
 * когда доезжают до экрана, а числа с data-count досчитывают до значения.
 * Класс .lp-js на <html> ставит встроенный скрипт в Landing до отрисовки —
 * без JS всё видно сразу.
 */
export default function LandingMotion() {
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const reveal = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));

    if (reduce || !("IntersectionObserver" in window)) {
      reveal.forEach((el) => el.classList.add("lp-in"));
      counters.forEach((el) => (el.textContent = format(Number(el.dataset.count), el.dataset.suffix)));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("lp-in");
          if (el.dataset.count) countUp(el);
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    reveal.forEach((el) => io.observe(el));
    counters.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

function format(n: number, suffix = "") {
  return n.toLocaleString("ru-RU") + suffix;
}

/** Досчитать от нуля до значения за ~1,2 с с замедлением в конце. */
function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count) || 0;
  const suffix = el.dataset.suffix ?? "";
  const start = performance.now();
  const dur = 1200;
  function tick(now: number) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = format(Math.round(target * eased), t === 1 ? suffix : "");
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
