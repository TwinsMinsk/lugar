import { Fragment } from 'react';

import type { RichTextDoc, RichTextNode } from '@/content/i18n';
import { cn } from '@/lib/utils';

/**
 * Renders stored rich text.
 *
 * Walks the node tree and emits React elements directly. Nothing is ever passed
 * to `dangerouslySetInnerHTML`, and any node or mark outside the allowlist is
 * dropped rather than rendered — so there is no path by which content in the
 * database becomes markup, script or styling on a public page, even if the
 * database itself were tampered with.
 */
export function RichText({ doc, className }: { doc: RichTextDoc | undefined; className?: string }) {
  if (!doc?.content?.length) return null;
  return (
    <div
      className={cn(
        'text-ink-muted [&_p]:mb-4 [&_p]:text-[16.5px] [&_p]:leading-[1.68]',
        '[&_h2]:font-display [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-[clamp(22px,2.6vw,32px)] [&_h2]:leading-tight',
        '[&_h3]:font-display [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-[clamp(19px,2vw,24px)]',
        '[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_li]:mb-1.5 [&_li]:leading-[1.65]',
        '[&_blockquote]:border-accent [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-5 [&_blockquote]:italic',
        '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
        '[&_hr]:border-line [&_hr]:my-8',
        className,
      )}
    >
      {doc.content.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </div>
  );
}

function Children({ nodes }: { nodes: RichTextNode[] | undefined }) {
  if (!nodes?.length) return null;
  return (
    <>
      {nodes.map((node, index) => (
        <Node key={index} node={node} />
      ))}
    </>
  );
}

function Node({ node }: { node: RichTextNode }) {
  switch (node.type) {
    case 'text':
      return <TextNode node={node} />;
    case 'paragraph':
      return (
        <p>
          <Children nodes={node.content} />
        </p>
      );
    case 'heading': {
      const level = Number(node.attrs?.level ?? 2);
      // h1 is reserved for the page heading — a rich-text block must never
      // introduce a second one.
      const Tag = (level <= 2 ? 'h2' : level === 3 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4';
      return (
        <Tag>
          <Children nodes={node.content} />
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul>
          <Children nodes={node.content} />
        </ul>
      );
    case 'orderedList':
      return (
        <ol>
          <Children nodes={node.content} />
        </ol>
      );
    case 'listItem':
      return (
        <li>
          <Children nodes={node.content} />
        </li>
      );
    case 'blockquote':
      return (
        <blockquote>
          <Children nodes={node.content} />
        </blockquote>
      );
    case 'hardBreak':
      return <br />;
    case 'horizontalRule':
      return <hr />;
    default:
      // Unknown node types are dropped, never rendered raw.
      return null;
  }
}

function TextNode({ node }: { node: RichTextNode }) {
  const text = node.text ?? '';
  if (!node.marks?.length) return <Fragment>{text}</Fragment>;

  return node.marks.reduce<React.ReactNode>((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{acc}</strong>;
      case 'italic':
        return <em>{acc}</em>;
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : null;
        // Only http(s) and mailto survive — `javascript:` and `data:` are
        // dropped rather than sanitised, because a partially-sanitised URL
        // scheme is a bug waiting to happen.
        if (!href || !/^(https?:|mailto:|tel:|\/)/i.test(href)) return acc;
        const external = /^https?:/i.test(href);
        return (
          <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {acc}
          </a>
        );
      }
      default:
        return acc;
    }
  }, text);
}
