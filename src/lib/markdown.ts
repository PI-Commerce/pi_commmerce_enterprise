/**
 * Minimal, dependency-free Markdown → HTML for the agent builder previews.
 * Input is escaped first, so only the tags this function emits can appear —
 * safe to feed into dangerouslySetInnerHTML for user-authored prompt text.
 * Also renders `{{tool}}` mention tokens as blue chips.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  let out = esc(s);
  // code spans first so their contents aren't further transformed
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-ai underline" href="$2" target="_blank" rel="noreferrer">$1</a>');
  // {{tool}} mention chips
  out = out.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    '<span class="mx-0.5 inline-flex items-center rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 align-baseline font-mono text-[0.85em] text-ai">@$1</span>');
  return out;
}

export function renderMarkdown(src: string): string {
  if (!src.trim()) return '<p class="text-muted-foreground">Nothing to preview yet.</p>';
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++; // skip closing fence
      html.push(`<pre class="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 font-mono text-[12px]"><code>${buf.join("\n")}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      const size = lvl === 1 ? "text-lg" : lvl === 2 ? "text-base" : "text-sm";
      html.push(`<h${lvl} class="mt-3 mb-1 font-semibold ${size}">${inline(h[2])}</h${lvl}>`);
      i++; continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") { closeList(); html.push('<ul class="my-1 ml-5 list-disc space-y-0.5">'); listType = "ul"; }
      html.push(`<li>${inline(ul[1])}</li>`);
      i++; continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") { closeList(); html.push('<ol class="my-1 ml-5 list-decimal space-y-0.5">'); listType = "ol"; }
      html.push(`<li>${inline(ol[1])}</li>`);
      i++; continue;
    }

    if (!line.trim()) { closeList(); i++; continue; }

    closeList();
    html.push(`<p class="my-1.5 leading-relaxed">${inline(line)}</p>`);
    i++;
  }
  closeList();
  return html.join("\n");
}
