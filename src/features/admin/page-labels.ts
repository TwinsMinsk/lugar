/**
 * Human names for the ten fixed pages.
 *
 * The panel showed them by seed key — `o-kompanii`, `politika-konfidencialnosti`
 * — which is a database detail the owner never agreed to learn. The set is
 * fixed by seeding, so a lookup table here is honest rather than a guess: a new
 * page type is a developer task, and it will arrive with a name.
 *
 * The fallback is the key, so an unlisted page is still identifiable rather
 * than blank.
 */
const PAGE_LABELS: Record<string, string> = {
  'page.home': 'Главная',
  'page.korpusnaya-mebel': 'Корпусная мебель',
  'page.mebel': 'Мебель на заказ',
  'page.dveri': 'Двери',
  'page.raboty': 'Наши работы',
  'page.o-kompanii': 'О компании',
  'page.kontakty': 'Контакты',
  'page.spasibo': 'Спасибо за заявку',
  'page.politika-konfidencialnosti': 'Политика конфиденциальности',
  'page.cookies': 'Файлы cookie',
};

export function pageLabel(seedKey: string | null, fallback: string): string {
  if (!seedKey) return fallback;
  return PAGE_LABELS[seedKey] ?? seedKey.replace(/^page\./, '');
}
