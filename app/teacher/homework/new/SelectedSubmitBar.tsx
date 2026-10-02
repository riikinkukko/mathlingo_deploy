"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Липкая кнопка «Назначить задание» со счётчиком выбранных задач. Раньше
 * кнопка стояла после списка из сотен задач — до неё приходилось листать
 * десятки экранов. Счётчик слушает изменения формы, в которую вложена панель.
 */
export default function SelectedSubmitBar() {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const recount = () => setCount(form.querySelectorAll('input[name="problemIds"]:checked').length);
    recount();
    form.addEventListener("change", recount);
    return () => form.removeEventListener("change", recount);
  }, []);

  return (
    <div
      ref={ref}
      className="sticky bottom-[calc(64px+max(10px,var(--app-sab)))] z-20 -mx-4 border-t border-line-soft bg-paper/95 px-4 py-3 backdrop-blur lg:bottom-0"
    >
      <button className="btn-primary w-full sm:w-auto" type="submit">
        {count > 0 ? `Назначить задание · ${count} ${plural(count)}` : "Назначить задание"}
      </button>
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "задача";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "задачи";
  return "задач";
}
