/**
 * Structured data, the one sanctioned use of `dangerouslySetInnerHTML` in this
 * codebase.
 *
 * Every other place content reaches the page goes through a typed React tree
 * — there is no raw-HTML block in the CMS, precisely so a stored string can
 * never become executable markup. JSON-LD breaks that pattern on purpose: it
 * has to be a literal `<script type="application/ld+json">`, because that is
 * the only shape search engines and AI crawlers parse it in.
 *
 * `JSON.stringify` alone does not make that safe — a value containing
 * `</script>` would close the tag early and let whatever follows run as HTML.
 * Next's own guide for this exact pattern says to escape `<` to its Unicode
 * form, which is what `escape()` below does; nothing else in this file
 * accepts unescaped input. The values that reach it today are all
 * owner-controlled settings, not visitor input, but the escape costs nothing
 * and the alternative is a second thing to remember to check every time this
 * is reused.
 */
function escape(json: string): string {
  return json.replace(/</g, '\\u003c');
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: escape(JSON.stringify(data)) }}
    />
  );
}
