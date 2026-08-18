"use client";

const KEYS = [
  { symbol: "√", label: "√" },
  { symbol: "²", label: "²" },
  { symbol: "π", label: "π" },
  { symbol: "°", label: "°" },
  { symbol: "/", label: "/" },
  { symbol: "sin", label: "sin" },
];

export default function MathKeyboard({
  inputRef,
  onInsert,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
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
          className="flex h-[46px] min-w-[46px] items-center justify-center rounded-xl border border-line bg-white px-2 font-display text-lg font-black text-ink transition hover:border-pine hover:text-pine"
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
