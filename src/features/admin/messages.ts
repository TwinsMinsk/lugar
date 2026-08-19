/**
 * What the panel says when an action fails.
 *
 * Server actions return *codes*; the wording lives here. That split is the
 * reason a Russian interface can never show an English sentence from Zod or a
 * Postgres constraint name — but only if every screen resolves through
 * `messagesFor`, which is why the lookup is a function rather than a plain
 * object spread at each call site.
 *
 * `tests/unit/error-vocabulary.test.ts` asserts that every code any action can
 * return has a phrase here, and that no phrase is written in English.
 */

/**
 * Codes any action can return, worded once.
 *
 * A screen dictionary overrides these where it can be more specific — "не
 * найдено" is true everywhere and useful nowhere, so most screens say what was
 * not found.
 */
export const BASE_ERRORS: Record<string, string> = {
  invalid_input: 'Проверьте заполненные поля.',
  invalid: 'Проверьте заполненные поля.',
  not_found: 'Запись не найдена — возможно, её уже убрали.',
  forbidden: 'У вас нет прав на это действие.',
  save_failed: 'Не удалось сохранить. Попробуйте ещё раз.',
  unexpected: 'Что-то пошло не так. Попробуйте ещё раз.',

  // Content
  invalid_blocks: 'Блоки страницы не прошли проверку — сообщите разработчику.',
  publish_failed: 'Не удалось опубликовать. Попробуйте ещё раз.',
  rollback_failed: 'Не удалось вернуть версию. Попробуйте ещё раз.',
  revision_not_found: 'Такой версии больше нет — обновите страницу.',
  system_document: 'Это одна из постоянных страниц сайта: её можно только снять с сайта.',
  was_published: 'Запись была на сайте, поэтому её история сохраняется. Она остаётся в архиве.',
  not_archived: 'Сначала уберите запись в архив.',
  archived: 'Запись убрана в архив.',
  slug_format: 'Адрес может содержать только строчные латинские буквы, цифры и дефис.',
  slug_taken: 'Такой адрес уже занят.',
  slug_taken_archived:
    'Такой адрес занят убранной записью. Верните её из архива или удалите насовсем — либо возьмите другой адрес.',
  slug_empty: 'Адрес не может быть пустым — по нему открывается главная страница.',
  slug_is_home: 'Это главная страница: её адрес — корень сайта, и он не меняется.',

  // Media
  alt_required: 'Опишите изображение — без описания его не примут.',
  file_too_large: 'Файл больше 20 МБ.',
  unsupported_format: 'Поддерживаются JPEG, PNG, WebP, AVIF и TIFF.',
  unreadable_image: 'Не удалось прочитать изображение.',
  processing_failed: 'Не удалось обработать изображение.',
  no_file: 'Файл не выбран.',
  in_use_on_published_page: 'Изображение стоит на опубликованной странице.',
  still_referenced: 'Изображение ещё используется в черновике или в истории версий.',

  // Navigation and redirects
  needs_target: 'Укажите, куда ведёт пункт меню.',
  unknown_target: 'Такой страницы больше нет — выберите другую.',
  loop: 'Эта переадресация зациклится: адрес в итоге ведёт сам на себя.',

  // CRM
  has_active_leads: 'У клиента есть заявки в работе. Уберите сначала их.',
  unknown_status: 'Такого этапа воронки больше нет — обновите страницу.',
  is_entry: 'Это точка входа воронки: новые заявки попадают сюда. Убрать её нельзя.',
  last_stage: 'Это последний этап — воронка не может остаться пустой.',
  won_and_lost: 'Этап не может быть одновременно успешным и проигранным.',
  task_completed: 'Задача уже выполнена. Её можно вернуть в работу, но не удалить.',

  // WhatsApp
  not_configured: 'WhatsApp ещё не подключён.',
  no_consent: 'Клиент не давал согласия на переписку в WhatsApp.',
  window_closed: 'Прошло больше 24 часов с последнего сообщения клиента — доступны только шаблоны.',
  not_dead: 'Это сообщение не в ошибке — повторять нечего.',
  message_already_sent: 'Сообщение уже отправлено — отменить его нельзя.',
  in_flight: 'Сообщение прямо сейчас отправляется. Обновите страницу через минуту.',

  // Users
  already_a_user: 'Этот человек уже есть в списке сотрудников.',
  already_sent: 'Приглашение на этот адрес уже отправлено.',
  invalid_email: 'Проверьте адрес электронной почты.',
  invalid_invitation: 'Приглашение недействительно или уже использовано.',
  password_too_short: 'Пароль должен быть не короче 12 символов.',
  last_owner: 'Это единственный владелец — иначе панель останется без доступа.',
  cannot_ban_self: 'Себе доступ отключить нельзя.',
  unknown_setting: 'Такой настройки не существует — обновите страницу.',
};

/**
 * A screen's dictionary, merged over the base.
 *
 * The resolver, not discipline, is what guarantees an unknown code still
 * produces a Russian sentence: a new action can ship a code nobody wrote a
 * phrase for, and the worst case is a generic message plus a console warning in
 * development — never `Ошибка: invalid_blocks`.
 */
export function messagesFor(overrides: Record<string, string> = {}) {
  const table = { ...BASE_ERRORS, ...overrides };

  return function message(code: string | undefined): string {
    if (!code) return table.unexpected!;
    const found = table[code];
    if (found) return found;
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[admin] no message for error code "${code}"`);
    }
    return table.unexpected!;
  };
}

export type MessageResolver = ReturnType<typeof messagesFor>;
