import { countLeadsByStatus, listAssignees, listLeadStatuses, listLeads } from '@/data/admin/leads';
import { LeadsTable } from '@/features/admin/leads-table';
import { can, requireCapability } from '@/lib/auth/guards';

export const metadata = { title: 'Заявки' };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export default async function AdminLeadsPage({ searchParams }: PageProps) {
  await requireCapability('crm.read');

  const params = await searchParams;
  const filters = {
    status: first(params.status),
    assignee: first(params.assignee),
    q: first(params.q),
    cursor: first(params.cursor),
  };

  const [page, statuses, counts, assignees, canExport] = await Promise.all([
    listLeads({
      statusId: filters.status,
      assignedToId: filters.assignee,
      q: filters.q,
      cursor: filters.cursor,
    }),
    listLeadStatuses(),
    countLeadsByStatus(),
    listAssignees(),
    can('crm.export'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Заявки</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Каждая отправленная форма попадает сюда вместе с источником перехода. Повторные обращения
          отмечаются, но никогда не склеиваются автоматически — решает человек.
        </p>
      </div>

      <LeadsTable
        rows={page.rows}
        nextCursor={page.nextCursor}
        statuses={statuses}
        counts={counts}
        assignees={assignees}
        filters={filters}
        canExport={canExport}
      />
    </div>
  );
}
