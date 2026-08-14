import { listArchivedStages, listPipeline } from '@/data/admin/lead-statuses';
import { PipelineEditor } from '@/features/admin/pipeline-editor';
import { requireCapability } from '@/lib/auth/guards';

export const metadata = { title: 'Этапы воронки' };

export default async function PipelinePage() {
  // Reading the pipeline needs only crm.read; every mutation inside the editor
  // re-checks settings.write on the server.
  await requireCapability('settings.write');

  const [stages, archived] = await Promise.all([listPipeline(), listArchivedStages()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-tight">Этапы воронки</h1>
        <p className="text-ink-soft mt-2 max-w-[72ch] text-[14px]">
          Порядок этапов задаёт вид доски и списка заявок. Переименовать этап можно в любой момент —
          на заявках это не отражается. Убрать этап, на котором есть заявки, без выбора нового
          нельзя.
        </p>
      </div>

      <PipelineEditor stages={stages} archived={archived} />
    </div>
  );
}
