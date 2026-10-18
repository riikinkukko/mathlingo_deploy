import { useEffect, useRef, type FormEvent } from "react";

type Saved = { el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; value: string; checked: boolean };

/** Поле управляется React (передан value/checked) — его React восстанавливает сам. */
function isControlled(el: Element): boolean {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  const props = key ? (el as unknown as Record<string, { value?: unknown; checked?: unknown }>)[key] : undefined;
  return !!props && (props.value !== undefined || props.checked !== undefined);
}

/**
 * React 19 после завершения экшена формы (`<form action={fn}>`) сам вызывает
 * form.reset() — неуправляемые поля возвращаются к defaultValue. В Next 14
 * (React 18) значения оставались: при ошибке входа email не стирался, а
 * переключатели, отправляющие форму по onChange, не «отщёлкивались» назад.
 * Хук возвращает прежнее поведение: запоминает значения в onSubmit и
 * восстанавливает их, когда экшен завершился (pending из useActionState
 * стал false). Свои эффекты компонента, очищающие форму после успеха,
 * объявлены после вызова хука и потому срабатывают позже — как и раньше.
 */
export function useKeepFormValues(pending: boolean) {
  const saved = useRef<Saved[]>([]);
  useEffect(() => {
    if (pending || saved.current.length === 0) return;
    for (const s of saved.current) {
      if (s.el instanceof HTMLInputElement && (s.el.type === "checkbox" || s.el.type === "radio")) s.el.checked = s.checked;
      else s.el.value = s.value;
    }
    saved.current = [];
  }, [pending]);

  return (e: FormEvent<HTMLFormElement>) => {
    const list: Saved[] = [];
    for (const el of Array.from(e.currentTarget.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
      if (el instanceof HTMLInputElement && ["hidden", "file", "submit", "button", "reset", "image"].includes(el.type)) continue;
      if (isControlled(el)) continue;
      list.push({ el, value: el.value, checked: el instanceof HTMLInputElement ? el.checked : false });
    }
    saved.current = list;
  };
}
