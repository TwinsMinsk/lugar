'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { updateSettings } from '@/app/(admin)/admin/_actions/settings';
import { buttonClasses } from '@/components/ui/button';
import type { SettingField } from '@/content/settings-registry';
import { LOCALES, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { MediaPicker, type PickableAsset } from './media-picker';

const ERRORS: Record<string, string> = {
  e164_format: 'Формат: + и от 7 до 15 цифр, без пробелов.',
  digits_only: 'Только цифры, без плюса и пробелов.',
  http_only: 'Ссылка должна начинаться с http:// или https://',
  ru_required: 'Русский вариант обязателен — он используется как запасной.',
  unknown_setting: 'Неизвестная настройка.',
  invalid_input: 'Проверьте заполненные поля.',
};

type Values = Record<string, unknown>;

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

export function SettingsForm({
  definitions,
  initial,
  pendingKeys,
  assets,
}: {
  definitions: SettingField[];
  initial: Values;
  pendingKeys: string[];
  assets: PickableAsset[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pendingSet = new Set(pendingKeys);
  const groups = [...new Set(definitions.map((definition) => definition.group))];
  const renderedKeys = new Set(definitions.map((definition) => definition.key));
  const unrenderable = Object.keys(errors).filter((key) => !renderedKeys.has(key));

  function set(key: string, value: unknown) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setStatus(null);
          const result = await updateSettings({ values });
          if (result.ok) {
            setErrors({});
            setStatus('Настройки сохранены.');
            router.refresh();
          } else {
            setErrors(result.errors);
            setStatus(null);
          }
        });
      }}
    >
      {groups.map((group) => (
        <section key={group} className="border-line bg-surface rounded-[--radius-card] border p-4">
          <h2 className="font-display mb-4 text-[19px]">{group}</h2>
          <div className="flex flex-col gap-4">
            {definitions
              .filter((definition) => definition.group === group)
              .map((definition) => (
                <Field
                  key={definition.key}
                  definition={definition}
                  value={values[definition.key]}
                  error={errors[definition.key]}
                  needsReview={pendingSet.has(definition.key)}
                  assets={assets}
                  onChange={(value) => set(definition.key, value)}
                />
              ))}
          </div>
        </section>
      ))}

      <div className="border-line bg-surface sticky bottom-0 flex flex-wrap items-center gap-3 rounded-[--radius-card] border p-4">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
        {status ? (
          <span role="status" className="text-ink-muted text-[13px]">
            {status}
          </span>
        ) : null}
        {Object.keys(errors).length > 0 ? (
          <span role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
            Не сохранено: проверьте отмеченные поля.
            {/* An error keyed to something with no field on screen would
                otherwise be invisible, and the save would appear to do nothing. */}
            {unrenderable.length > 0 ? ` Непоказанные ошибки: ${unrenderable.join(', ')}.` : ''}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  definition,
  value,
  error,
  needsReview,
  assets,
  onChange,
}: {
  definition: SettingField;
  value: unknown;
  error?: string;
  needsReview: boolean;
  assets: PickableAsset[];
  onChange: (value: unknown) => void;
}) {
  const id = `setting-${definition.key.replace(/\./g, '-')}`;

  /**
   * A soft warning, not a rejection.
   *
   * A link on a different host is usually a paste mistake, but the owner may
   * legitimately use a redirect or a regional domain — so this points it out
   * and gets out of the way rather than refusing to save.
   */
  const hostMismatch =
    definition.expectHost &&
    typeof value === 'string' &&
    value.trim() !== '' &&
    !value.includes(definition.expectHost);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-ink-muted text-[13px] font-medium">
          {definition.label}
        </label>
        {needsReview ? (
          <span className="rounded-[--radius-btn] bg-[oklch(0.94_0.07_85)] px-1.5 py-0.5 text-[11px] text-[oklch(0.42_0.10_85)]">
            не заполнено
          </span>
        ) : null}
      </div>

      {definition.kind === 'boolean' ? (
        <label className="text-ink-muted flex items-center gap-2 text-[14px]">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            className="accent-accent h-4 w-4"
          />
          Включено
        </label>
      ) : definition.kind === 'localized' ? (
        <div className="flex flex-col gap-2">
          {LOCALES.map((locale) => {
            const map = (value ?? {}) as Partial<Record<Locale, string>>;
            return (
              <div key={locale} className="flex items-center gap-2">
                <span className="text-ink-faint w-7 text-[12px] uppercase">{locale}</span>
                <input
                  id={locale === 'ru' ? id : `${id}-${locale}`}
                  value={map[locale] ?? ''}
                  placeholder={locale === 'ru' ? '' : (map.ru ?? '')}
                  onChange={(event) => onChange({ ...map, [locale]: event.target.value })}
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      ) : definition.kind === 'media' ? (
        <MediaPicker
          assets={assets}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
          label=""
        />
      ) : (
        <input
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          inputMode={definition.kind === 'phone_digits' ? 'numeric' : undefined}
          className={cn(inputClass, definition.kind === 'url' && 'font-mono text-[13px]')}
        />
      )}

      {definition.help ? (
        <p className="text-ink-faint mt-1 text-[12px] leading-snug">{definition.help}</p>
      ) : null}

      {hostMismatch ? (
        <p className="mt-1 text-[12px] text-[oklch(0.5_0.12_85)]">
          Ссылка не содержит {definition.expectHost} — проверьте, что вставлен нужный адрес.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-[oklch(0.52_0.17_25)]">
          {ERRORS[error] ?? error}
        </p>
      ) : null}
    </div>
  );
}
