import { listAuditActions, listAuditActors, listAuditEntries } from '@/data/admin/audit';
import { AuditLog } from '@/features/admin/audit-log';
import { requireCapability } from '@/lib/auth/guards';

export const metadata = { title: 'Журнал' };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** A repeated query parameter is a probe, not a filter — take the first value. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  await requireCapability('audit.read');

  const params = await searchParams;
  const filters = {
    action: first(params.action),
    actor: first(params.actor),
    entity: first(params.entity),
    cursor: first(params.cursor),
  };

  const [page, actions, actors] = await Promise.all([
    listAuditEntries({
      action: filters.action,
      actorUserId: filters.actor,
      entityType: filters.entity,
      cursor: filters.cursor,
    }),
    listAuditActions(),
    listAuditActors(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Журнал</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Кто что изменил и когда. Записи создаются в той же транзакции, что и само изменение,
          поэтому здесь не может быть отметки о публикации, которая на самом деле не прошла. Записи
          не редактируются и не удаляются из интерфейса.
        </p>
      </div>

      <AuditLog
        entries={page.entries}
        nextCursor={page.nextCursor}
        actions={actions}
        actors={actors}
        filters={filters}
      />
    </div>
  );
}
