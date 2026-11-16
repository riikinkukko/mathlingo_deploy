import TeacherShell from "@/components/TeacherShell";
import ImportForm from "./ImportForm";

export default function ImportStudentsPage() {
  return (
    <TeacherShell active="students" title="Ученики списком">
      <main className="mx-auto max-w-2xl px-4 py-6">
        <a href="/teacher/students/new" className="text-[13px] font-bold text-ink-soft hover:text-ink">
          ← По одному
        </a>
        <h1 className="mb-2 mt-2 font-display text-2xl font-black text-ink">Добавить учеников списком</h1>
        <p className="mb-5 text-[14px] leading-relaxed text-ink-soft">
          Скопируйте строки из своей таблицы (Google, Excel) и вставьте ниже. Одна строка — один ученик: сначала имя, дальше
          по желанию email, класс и цена занятия — в любом порядке, через табуляцию, «;» или «,». Почта не обязательна: без
          неё выдадим логин и пароль, их можно переслать родителям.
        </p>
        <ImportForm />
      </main>
    </TeacherShell>
  );
}
