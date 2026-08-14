import { coerceSettingValue, SETTINGS_BY_KEY, settingFields } from '@/content/settings-registry';
import { listPickableAssets } from '@/data/admin/portfolio';
import { listRawSettings } from '@/data/admin/settings';
import { SettingsForm } from '@/features/admin/settings-form';

export const metadata = { title: 'Настройки' };

export default async function AdminSettingsPage() {
  const [rows, assets] = await Promise.all([listRawSettings(), listPickableAssets()]);

  // Only registry keys. The database also holds settings that are deliberately
  // not owner-editable — legal.consentVersion, for one: changing it invalidates
  // every visitor's stored consent, which is not a decision to make from a form
  // field. Sending it would also fail the whole save on a key with no visible
  // field, so the error would be invisible.
  const initial: Record<string, unknown> = {};
  const pendingKeys: string[] = [];
  for (const row of rows) {
    const definition = SETTINGS_BY_KEY.get(row.key);
    if (!definition) continue;
    // JSONB does not preserve string-ness for numeric-looking values; without
    // this the WhatsApp number renders as an empty field.
    initial[row.key] = coerceSettingValue(definition.kind, row.value);
    if (row.needsReview) pendingKeys.push(row.key);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Настройки</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Значения, которые используются на всём сайте. Пустое поле означает «ещё не заполнено» —
          такие блоки на сайте просто не показываются, вместо того чтобы выводить выдуманные данные.
          Соцсети, адрес и реквизиты появятся в футере и контактах сразу после заполнения.
        </p>
      </div>

      {pendingKeys.length > 0 ? (
        <p className="rounded-[--radius-card] border border-[oklch(0.86_0.09_85)] bg-[oklch(0.98_0.03_85)] px-4 py-3 text-[13px]">
          Осталось заполнить: <strong>{pendingKeys.length}</strong>. До этого сайт не показывает
          соответствующие ссылки и данные — это намеренно.
        </p>
      ) : null}

      <SettingsForm
        definitions={settingFields()}
        initial={initial}
        pendingKeys={pendingKeys}
        assets={assets}
      />
    </div>
  );
}
