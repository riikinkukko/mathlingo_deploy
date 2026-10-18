"use client";

// «−» и «/» — первыми: на цифровой клавиатуре телефона (inputMode="decimal")
// их нет, а ответы бывают отрицательными и дробями. Вставляем обычный дефис —
// его понимает проверка ответа. «°» убран: проверка всё равно отбрасывает
// градусы в конце ответа («60°» = «60»), а седьмая кнопка не влезала в ряд.
const KEYS = [
  { symbol: "-", label: "−", aria: "Минус" },
  { symbol: "/", label: "/", aria: "Дробь" },
  { symbol: "√", label: "√" },
  { symbol: "²", label: "²" },
  { symbol: "π", label: "π" },
  { symbol: "sin", label: "sin" },
] as { symbol: string; label: string; aria?: string }[];

export default function MathKeyboard({
  inputRef,
  onInsert,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInsert: (nextValue: string) => void;
}) {
  function insert(symbol: string) {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + symbol + el.value.slice(end);
    onInsert(next);
    // Возвращаем курсор сразу после вставленного символа — без этого фокус
    // и позиция курсора сбрасываются на конец при каждом клике.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + symbol.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {KEYS.map((k) => (
        <button
          key={k.symbol}
          type="button"
          onClick={() => insert(k.symbol)}
          aria-label={k.aria ?? k.label}
          className="flex h-[46px] min-w-[46px] items-center justify-center rounded-xl border border-line bg-white px-2 font-display text-lg font-black text-ink transition hover:border-pine hover:text-pine"
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
