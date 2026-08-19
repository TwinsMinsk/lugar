import Link from 'next/link';

import { getLeadBoard, listAssignees } from '@/data/admin/leads';
import { LeadBoard } from '@/features/admin/lead-board';
import { requireCapability } from '@/lib/auth/guards';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Воронка' };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadBoardPage({ searchParams }: PageProps) {
  await requireCapability('crm.read');

  const params = await searchParams;
  const assigneeParam = params.assignee;
  const assignee = Array.isArray(assigneeParam) ? assigneeParam[0] : assigneeParam;

  const [columns, assignees] = await Promise.all([getLeadBoard(assignee), listAssignees()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-tight">Воронка</h1>
          <p className="text-ink-soft mt-2 max-w-[70ch] text-[14px]">
            Заявки по этапам. Перенести можно с клавиатуры — у каждой карточки есть поле выбора
            этапа, перетаскивание мышью для этого не требуется.
          </p>
        </div>
        <Link
          href="/admin/leads"
          className="text-ink-faint hover:text-accent ml-auto text-[13px] whitespace-nowrap"
        >
          Списком →
        </Link>
      </div>

      <nav aria-label="Фильтр по ответственному" className="flex flex-wrap gap-2">
        {[
          { id: '', label: 'Все' },
          { id: 'none', label: 'Без ответственного' },
          ...assignees.map((person) => ({ id: person.id, label: person.name || person.email })),
        ].map((option) => (
          <Link
            key={option.id || 'all'}
            href={option.id ? `/admin/leads/board?assignee=${option.id}` : '/admin/leads/board'}
            aria-current={(assignee ?? '') === option.id ? 'true' : undefined}
            className={cn(
              'rounded-[--radius-btn] border px-2.5 py-1 text-[13px] transition-colors',
              (assignee ?? '') === option.id
                ? 'border-accent text-accent'
                : 'border-line text-ink-muted hover:border-line-strong',
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <LeadBoard
        columns={columns.map((column) => ({
          status: {
            id: column.status.id,
            label: column.status.label.ru ?? column.status.slug,
            color: column.status.color,
            isTerminal: column.status.isTerminal,
          },
          total: column.total,
          cards: column.cards.map((card) => ({
            ...card,
            createdAt: card.createdAt.toISOString(),
          })),
        }))}
      />
    </div>
  );
}
