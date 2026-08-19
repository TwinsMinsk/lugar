import { listRedirects } from '@/data/admin/redirects';
import { RedirectsEditor } from '@/features/admin/redirects-editor';
import { requireCapability } from '@/lib/auth/guards';

export const metadata = { title: 'Переадресация' };

export default async function AdminRedirectsPage() {
  await requireCapability('seo.write');
  const rows = await listRedirects();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Переадресация</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Когда вы меняете адрес опубликованной страницы, правило создаётся автоматически — старая
          ссылка продолжает работать, а позиции в поиске переносятся на новый адрес. Здесь можно
          добавить правила для адресов, которых в этой системе никогда не было: со старого сайта, из
          рекламы или с печатных материалов.
        </p>
      </div>

      <RedirectsEditor
        rows={rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
      />
    </div>
  );
}
