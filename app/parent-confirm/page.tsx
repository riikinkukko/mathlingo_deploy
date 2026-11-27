import StudentSignupPassword from "@/components/StudentSignupPassword";

export default async function ParentConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-md p-6">
      {token ? <StudentSignupPassword token={token} parent /> : <p>Откройте ссылку из письма поддержки.</p>}
    </main>
  );
}
