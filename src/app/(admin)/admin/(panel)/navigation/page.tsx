import { listNavigation, listNavigationTargets } from '@/data/admin/navigation';
import { NavigationEditor } from '@/features/admin/navigation-editor';
import { requireCapability } from '@/lib/auth/guards';

export const metadata = { title: 'Меню' };

export default async function AdminNavigationPage() {
  await requireCapability('navigation.write');
  const [menus, targets] = await Promise.all([listNavigation(), listNavigationTargets()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Меню</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Пункты ссылаются на страницу, а не на её адрес, поэтому переименование адреса меню не
          ломает. Названия задаются для каждого языка; если испанского или английского нет,
          показывается русское. Порядок меняется кнопками и полем «позиция» — мышь не обязательна.
        </p>
      </div>

      <NavigationEditor menus={menus} targets={targets} />
    </div>
  );
}
