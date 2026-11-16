"use client";

import { useEffect } from "react";

/**
 * Запоминает, откуда человек пришёл на сайт в первый раз: utm_source / ym из
 * адреса, иначе сайт-источник (яндекс, телеграм…), иначе «direct», плюс первая
 * страница. Кладём в cookie на 90 дней; при регистрации сервер сохраняет её в
 * users.signup_source (lib/signup-source.ts) — для воронки в /admin/metrics.
 */
export default function SignupSource() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith("pl_src="))) return;
      const q = new URLSearchParams(location.search);
      let src = q.get("utm_source") || q.get("ym") || "";
      if (!src && document.referrer) {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (host && host !== location.hostname) src = host;
      }
      const value = `${(src || "direct").slice(0, 40)}|${location.pathname.slice(0, 70)}`;
      document.cookie = `pl_src=${encodeURIComponent(value)}; path=/; max-age=${90 * 86400}; samesite=lax`;
    } catch {
      /* cookie недоступны — не страшно */
    }
  }, []);
  return null;
}
