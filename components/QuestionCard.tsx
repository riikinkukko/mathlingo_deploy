import type { StudentQuestionView } from "@/lib/queries";

function when(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Карточка вопроса «Не понял»: условие, ответ ученика, сообщение, ответ репетитора. */
export default function QuestionCard({
  q,
  showStudent,
  children,
}: {
  q: StudentQuestionView;
  showStudent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article id={q.id} className="scroll-mt-24 rounded-[20px] border border-line-soft bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-ink-soft">
        {showStudent && <span className="font-black text-ink">{q.studentName}</span>}
        {q.egeTaskNumber && (
          <span className="rounded-pill bg-amber-light px-2 py-0.5 font-black text-amber-dark">ЕГЭ №{q.egeTaskNumber}</span>
        )}
        <span>{when(q.createdAt)}</span>
        {!q.answeredAt && (
          <span className="rounded-pill bg-violet-light px-2 py-0.5 font-black text-violet-text">ждёт ответа</span>
        )}
      </div>
      <p className="text-[15px] leading-relaxed text-ink">{q.problemText}</p>
      {q.studentAnswer && (
        <p className="mt-2 text-[13px] text-ink-soft">
          Ответ ученика: <span className="font-mono font-bold text-ink">{q.studentAnswer}</span>
        </p>
      )}
      {q.hasSketch && (
        <a
          href={`/api/question-sketch/${q.id}`}
          target="_blank"
          rel="noopener"
          className="mt-3 block overflow-hidden rounded-2xl border border-line-soft bg-white"
        >
          <span className="block px-3 pt-2 text-[12px] font-black text-ink-soft">Черновик ученика · нажми, чтобы открыть крупно</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/question-sketch/${q.id}`} alt="Черновик ученика" loading="lazy" className="max-h-72 w-full object-contain" />
        </a>
      )}
      {q.message && (
        <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-paper px-3 py-2 text-[14px] text-ink">
          <span className="font-bold">Вопрос: </span>
          {q.message}
        </p>
      )}
      {q.answer && (
        <div className="mt-3 rounded-2xl bg-pine-light px-3 py-2.5">
          <p className="text-[12px] font-black text-pine-dark">Ответ репетитора{q.answeredAt ? ` · ${when(q.answeredAt)}` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink">{q.answer}</p>
        </div>
      )}
      {children}
    </article>
  );
}
