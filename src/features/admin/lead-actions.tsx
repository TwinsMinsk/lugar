'use client';

import { useState } from 'react';

import {
  addLeadNote,
  assignLead,
  changeLeadStatus,
  completeLeadTask,
  deleteLeadTask,
  reopenLeadTask,
  createLeadTask,
} from '@/app/(admin)/admin/_actions/leads';
import { buttonClasses } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/dialog';
import type { LeadStatusRow } from '@/data/admin/leads';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAction } from './use-action';

export type LeadTaskRow = {
  id: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  assigneeEmail: string | null;
};

/** Only what this screen says better than the shared vocabulary. */
const ERRORS = {
  not_found: 'Заявка не найдена — возможно, её удалили.',
  unknown_status: 'Такого статуса больше нет.',
  invalid_input: 'Проверьте заполненные поля.',
};

const inputClass = cn(
  'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3 py-2 text-[14px]',
  'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
);

export function LeadActions({
  leadId,
  statusId,
  assignedToId,
  statuses,
  assignees,
  tasks,
}: {
  leadId: string;
  statusId: string;
  assignedToId: string | null;
  statuses: LeadStatusRow[];
  assignees: Array<{ id: string; email: string; name: string }>;
  tasks: LeadTaskRow[];
}) {
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const { busy: pending, isBusy, error, status, run } = useAction(ERRORS);

  const open = tasks.filter((task) => task.completedAt === null);
  const done = tasks.filter((task) => task.completedAt !== null);

  return (
    <div className="flex flex-col gap-4">
      {/* Both areas stay mounted: one inserted together with its text is not
          announced by a screen reader. */}
      <p role="alert" className="text-danger text-[13px] empty:hidden">
        {error}
      </p>
      <p role="status" className="text-ink-muted text-[13px] empty:hidden">
        {status}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="lead-status"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Статус
          </label>
          <select
            id="lead-status"
            value={statusId}
            disabled={pending}
            onChange={(event) =>
              run(() => changeLeadStatus({ leadId, statusId: event.target.value }), {
                success: 'Статус изменён.',
              })
            }
            className={inputClass}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label.ru ?? status.slug}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="lead-assignee"
            className="text-ink-muted mb-1 block text-[12px] font-medium"
          >
            Ответственный
          </label>
          <select
            id="lead-assignee"
            value={assignedToId ?? ''}
            disabled={pending}
            onChange={(event) =>
              run(() => assignLead({ leadId, assigneeId: event.target.value }), {
                success: 'Ответственный назначен.',
              })
            }
            className={inputClass}
          >
            <option value="">Не назначен</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form
        className="border-line rounded-[--radius-card] border border-dashed p-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => addLeadNote({ leadId, body: note }), {
            key: 'note',
            success: 'Заметка добавлена.',
            onDone: () => setNote(''),
          });
        }}
      >
        <label htmlFor="lead-note" className="text-ink-muted mb-1 block text-[12px] font-medium">
          Заметка
        </label>
        <textarea
          id="lead-note"
          required
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Что обсудили, о чём договорились"
          className={cn(inputClass, 'resize-y')}
        />
        <button
          type="submit"
          disabled={pending || note.trim() === ''}
          className={cn(buttonClasses('primary', 'sm'), 'mt-2')}
        >
          {pending ? 'Сохраняем…' : 'Добавить заметку'}
        </button>
      </form>

      <section className="border-line rounded-[--radius-card] border border-dashed p-3">
        <h3 className="text-ink mb-2 text-[14px] font-medium">Задачи</h3>

        {open.length === 0 && done.length === 0 ? (
          <p className="text-ink-faint mb-2 text-[12px]">Задач нет.</p>
        ) : (
          <ul className="divide-line mb-3 divide-y">
            {[...open, ...done].map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 py-2">
                <span
                  className={cn(
                    'flex-1 text-[13px]',
                    task.completedAt ? 'text-ink-faint line-through' : 'text-ink',
                  )}
                >
                  {task.title}
                </span>
                {task.dueAt ? (
                  <span className="text-ink-faint text-[12px]">до {formatDate(task.dueAt)}</span>
                ) : null}
                {task.assigneeEmail ? (
                  <span className="text-ink-faint text-[12px]">{task.assigneeEmail}</span>
                ) : null}
                {task.completedAt ? (
                  // A completed task is a statement that the call was made, so
                  // it is never deleted — it goes back on the list instead,
                  // which is what someone who ticked the wrong row wanted.
                  <button
                    type="button"
                    disabled={isBusy(task.id)}
                    onClick={() =>
                      run(() => reopenLeadTask(task.id), {
                        key: task.id,
                        success: 'Задача вернулась в работу.',
                      })
                    }
                    className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                  >
                    Вернуть в работу
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isBusy(task.id)}
                      onClick={() =>
                        run(() => completeLeadTask(task.id), {
                          key: task.id,
                          success: 'Задача отмечена выполненной.',
                        })
                      }
                      className={cn(buttonClasses('ghost', 'sm'), 'text-[12px]')}
                    >
                      Выполнено
                    </button>
                    <InlineConfirm
                      label="Удалить"
                      question="Удалить задачу?"
                      confirmLabel="Удалить"
                      disabled={isBusy(task.id)}
                      onConfirm={() =>
                        run(() => deleteLeadTask(task.id), {
                          key: task.id,
                          success: 'Задача удалена.',
                        })
                      }
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createLeadTask({ leadId, title: taskTitle, dueOn: taskDue }), {
              key: 'task',
              success: 'Задача создана.',
              onDone: () => {
                setTaskTitle('');
                setTaskDue('');
              },
            });
          }}
        >
          <div className="min-w-[200px] flex-1">
            <label htmlFor="task-title" className="text-ink-muted mb-1 block text-[12px]">
              Новая задача
            </label>
            <input
              id="task-title"
              required
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Перезвонить и уточнить размеры"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="task-due" className="text-ink-muted mb-1 block text-[12px]">
              Срок
            </label>
            <input
              id="task-due"
              type="date"
              value={taskDue}
              onChange={(event) => setTaskDue(event.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={pending || taskTitle.trim() === ''}
            className={buttonClasses('outline', 'sm')}
          >
            Добавить
          </button>
        </form>
      </section>
    </div>
  );
}
