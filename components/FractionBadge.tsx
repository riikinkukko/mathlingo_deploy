export default function FractionBadge({
  solved,
  total,
  size = "md",
}: {
  solved: number;
  total: number;
  size?: "sm" | "md";
}) {
  const complete = total > 0 && solved === total;
  const textSize = size === "sm" ? "text-sm" : "text-lg";
  return (
    <div
      className={`inline-flex flex-col items-center justify-center font-mono ${textSize} leading-none ${
        complete ? "text-pine" : "text-ink"
      }`}
      title={`Решено ${solved} из ${total}`}
    >
      <span>{solved}</span>
      <span className="my-0.5 h-px w-4 bg-current" />
      <span>{total}</span>
    </div>
  );
}
