'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { changeLeadStatus } from '@/app/(admin)/admin/_actions/leads';
import type { BoardColumn } from '@/data/admin/leads';
import { cn } from '@/lib/utils';

/**
 * The pipeline board.
 *
 * Moving a card is a labelled `<select>` on the card, not a drag. Drag-and-drop
 * is the expected gesture for a board and would be a reasonable addition on
 * top, but it can never be the only way: a keyboard or screen-reader user has
 * to be able to move a lead through the pipeline too, and building the drag
 * first is how that ends up permanently unfinished.
 */
export type BoardCard = BoardColumn['cards'][number];

export type SerializedColumn = {
  status: { id: string; label: string; color: string; isTerminal: boolean };
  total: number;
  cards: Array<Omit<BoardCard, 'createdAt'> & { createdAt: string }>;
};

const dayMonth = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
});

export function LeadBoard({ columns }: { columns: SerializedColumn[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [pending, startTransition] = useTransition();

  function move(leadId: string, statusId: string, publicId: string, label: string) {
    startTransition(async () => {
      setError(null);
      const result = await changeLeadStatus({ leadId, statusId });
      if (!result.ok) {
        setError('Не удалось перенести заявку.');
        return;
      }
      setAnnouncement(`${publicId} перенесена в «${label}»`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {error ? (
        <p role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((column) => (
          <section
            key={column.status.id}
            aria-label={column.status.label}
            className="border-line bg-surface-muted/50 w-[260px] flex-none rounded-[--radius-card] border p-2.5"
          >
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: column.status.color }}
              />
              {column.status.label}
              <span className="text-ink-faint ml-auto">{column.total}</span>
            </h2>

            {column.cards.length === 0 ? (
              <p className="text-ink-faint px-1 py-2 text-[12px]">Пусто</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {column.cards.map((card) => (
                  <li
                    key={card.id}
                    className={cn(
                      'bg-surface rounded-[--radius-card] border p-2.5',
                      card.isStale ? 'border-[oklch(0.82_0.10_60)]' : 'border-line',
                    )}
                  >
                    <Link
                      href={`/admin/leads/${card.id}`}
                      className="text-ink hover:text-accent text-[13px] font-medium"
                    >
                      {card.contactName ?? card.publicId}
                    </Link>
                    <div className="text-ink-faint mt-0.5 text-[12px]">
                      {card.service ?? '—'}
                      {card.city ? ` · ${card.city}` : ''}
                    </div>
                    <div className="text-ink-faint mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-mono">{card.publicId}</span>
                      <span>{dayMonth.format(new Date(card.createdAt))}</span>
                      {card.isStale ? (
                        <span
                          title="Больше пяти дней без движения"
                          className="text-[oklch(0.5_0.13_60)]"
                        >
                          без движения
                        </span>
                      ) : null}
                    </div>
                    <div className="text-ink-faint mt-0.5 text-[11px]">
                      {card.assigneeEmail ?? 'не назначен'}
                    </div>

                    <label className="sr-only" htmlFor={`move-${card.id}`}>
                      Перенести заявку {card.publicId}
                    </label>
                    <select
                      id={`move-${card.id}`}
                      value={column.status.id}
                      disabled={pending}
                      onChange={(event) => {
                        const target = columns.find(
                          (item) => item.status.id === event.target.value,
                        );
                        if (target) {
                          move(card.id, target.status.id, card.publicId, target.status.label);
                        }
                      }}
                      className="border-line-strong mt-2 w-full rounded-[--radius-btn] border px-1.5 py-1 text-[12px]"
                    >
                      {columns.map((item) => (
                        <option key={item.status.id} value={item.status.id}>
                          {item.status.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}

            {column.total > column.cards.length ? (
              <p className="text-ink-faint mt-2 px-1 text-[12px]">
                Показаны {column.cards.length} из {column.total}.{' '}
                <Link href={`/admin/leads?status=${column.status.id}`} className="underline">
                  Все
                </Link>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
