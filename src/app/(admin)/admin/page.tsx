/**
 * M1 placeholder. The real admin shell (RBAC-gated navigation, dashboard,
 * CMS and CRM modules) lands in M3/M4.
 */
export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="eyebrow">LUGAR</p>
      <h1 className="mt-4 text-3xl">Админка</h1>
      <p className="text-ink-muted mt-4 text-base leading-relaxed">
        Оболочка админки появится в M3. Схема базы, аутентификация и роли готовы.
      </p>
    </main>
  );
}
