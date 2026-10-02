"use client";

import { useEffect } from "react";

/** Последний рубеж: упал сам корневой layout. Стили приложения здесь
 * недоступны, поэтому — простая разметка со встроенными стилями. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "[global] " + error.message, stack: error.stack, digest: error.digest, path: location.pathname }),
        keepalive: true,
      });
    } catch {}
  }, [error]);
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F1F8F4", color: "#0F2A1E" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Что-то пошло не так</h1>
          <p style={{ maxWidth: 360, color: "#4A6357" }}>Мы уже получили сообщение об ошибке. Попробуйте обновить страницу.</p>
          <button onClick={() => reset()} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#1CAE6B", color: "#fff", fontWeight: 800, fontSize: 15 }}>
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
