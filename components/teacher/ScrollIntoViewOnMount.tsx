"use client";

import { useEffect, useRef } from "react";

/**
 * Прокручивает к себе при появлении. Нужен для плашек «назначено» / ошибок,
 * которые появляются после редиректа из server action: Next сохраняет
 * прежнюю позицию прокрутки, и плашка оказывалась за верхним краем экрана.
 */
export default function ScrollIntoViewOnMount({
  children,
  className,
  role,
}: {
  children: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Учитываем липкую шапку/вкладки — scroll-margin задаётся классом.
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  return (
    <div ref={ref} role={role} className={`scroll-mt-32 ${className ?? ""}`}>
      {children}
    </div>
  );
}
