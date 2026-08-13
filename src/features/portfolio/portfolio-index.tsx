import { ProjectCard } from '@/content/blocks/render';
import type { RenderContext } from '@/content/blocks/render/context';
import { t } from '@/content/i18n';
import { getPortfolioCategories } from '@/data/public/portfolio';
import { Container } from '@/components/ui/typography';
import { PortfolioFilter } from './portfolio-filter';

/**
 * The filterable portfolio index.
 *
 * Cards are rendered on the server and handed to the client filter as children,
 * so every project link is in the initial HTML and therefore crawlable and
 * shareable. The filter only changes what is visible.
 *
 * Categories with no published projects are dropped rather than shown as empty
 * buttons — a filter that always yields nothing is worse than no filter.
 */
export async function PortfolioIndex({ ctx }: { ctx: RenderContext }) {
  const categories = await getPortfolioCategories();

  const counts: Record<string, number> = {};
  for (const project of ctx.projects) {
    for (const slug of project.categorySlugs) {
      counts[slug] = (counts[slug] ?? 0) + 1;
    }
  }

  const options = categories
    .filter((category) => (counts[category.slug] ?? 0) > 0)
    .map((category) => ({
      slug: category.slug,
      label: t(category.label, ctx.locale) ?? category.slug,
    }));

  return (
    <section className="pb-[clamp(64px,8vw,120px)]">
      <Container wide>
        <PortfolioFilter categories={options} counts={counts} total={ctx.projects.length}>
          {ctx.projects.map((project) => (
            <div key={project.documentId} data-categories={project.categorySlugs.join(' ')}>
              <ProjectCard card={project} ctx={ctx} aspect="4/5" columns={4} />
            </div>
          ))}
        </PortfolioFilter>
      </Container>
    </section>
  );
}
