/**
 * Chat Markdown renderer — the subset Pi actually emits.
 *
 * Hand-rolled instead of pulling in `react-markdown` because (a) we render
 * inside chat bubbles and want tight control over spacing / classNames,
 * (b) the surface we accept is small (paragraphs, lists, bold, italic,
 * inline code, links) and the LLM is instructed to stay in that surface,
 * (c) shipping a small function is cheaper than pulling ~30KB of
 * markdown-parsing deps into the client bundle.
 *
 * NOT handled (Pi is prompted away from these):
 *   - headers (chat bubble is not a document)
 *   - code fences (Pi uses these only for `pi-choice` / `options` control
 *     blocks; they're extracted before render — see AiComposer's
 *     `parsePiFencedBlocks`)
 *   - tables, images, blockquotes, HTML pass-through
 *
 * If a piece of syntax slips through, it renders as literal text. That's
 * fine for a demo — better than crashing on a corner case.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";

type Block =
  | { kind: "para"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

/** Split source into paragraph-level blocks. Lists are contiguous runs
 *  of `- ` (unordered) or `1. ` / `2. ` (ordered) lines; anything else
 *  is a paragraph. Blank lines separate paragraphs. */
function parseBlocks(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let paraBuf: string[] = [];
  let ulBuf: string[] = [];
  let olBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) { blocks.push({ kind: "para", lines: paraBuf }); paraBuf = []; }
  };
  const flushUl = () => {
    if (ulBuf.length) { blocks.push({ kind: "ul", items: ulBuf }); ulBuf = []; }
  };
  const flushOl = () => {
    if (olBuf.length) { blocks.push({ kind: "ol", items: olBuf }); olBuf = []; }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "") {
      flushPara(); flushUl(); flushOl();
      continue;
    }
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      flushPara(); flushOl();
      ulBuf.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      flushPara(); flushUl();
      olBuf.push(olMatch[1]);
      continue;
    }
    flushUl(); flushOl();
    paraBuf.push(line);
  }
  flushPara(); flushUl(); flushOl();
  return blocks;
}

/** Render inline formatting inside a single text run. Handles (in order of
 *  match precedence): inline code (`...`), links [label](href), bold
 *  (**text**), italic (*text* — not in the middle of a word). */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Combined regex covers all four forms. Alternation captures:
  //   [1] inline code body
  //   [2] link label + [3] link href
  //   [4] bold body
  //   [5] italic body
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|(?<!\w)\*([^*\n]+)\*(?!\w)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <code key={`${keyPrefix}-c${key++}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[11.5px]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined && m[3] !== undefined) {
      const label = m[2];
      const href = m[3];
      out.push(
        href.startsWith("/") ? (
          <Link key={`${keyPrefix}-l${key++}`} to={href} className="font-medium text-ai underline underline-offset-2 hover:text-ai/80">
            {label}
          </Link>
        ) : (
          <a key={`${keyPrefix}-l${key++}`} href={href} target="_blank" rel="noreferrer" className="font-medium text-ai underline underline-offset-2 hover:text-ai/80">
            {label}
          </a>
        ),
      );
    } else if (m[4] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${key++}`} className="font-semibold">{m[4]}</strong>,
      );
    } else if (m[5] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-i${key++}`} className="italic">{m[5]}</em>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}

/** Scrub the AI-fluff dashes Pi occasionally slips into replies despite
 *  the prompt banning them. Em-dash (U+2014), en-dash (U+2013), and
 *  horizontal-bar (U+2015) all become plain " - ". Applied to the raw
 *  source before block parsing so downstream rendering never sees them. */
function scrubDashes(source: string): string {
  return source.replace(/[–—―]/g, " - ").replace(/\s+-\s+/g, " - ");
}

/** Render a full assistant/user message as a paragraph + list stack. */
export function renderChatMarkdown(source: string): React.ReactNode {
  const blocks = parseBlocks(scrubDashes(source));
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((b, i) => {
        const key = `md-${i}`;
        if (b.kind === "para") {
          // Inside a paragraph, single newlines become <br>. Blank lines
          // are already the paragraph boundary (see parseBlocks).
          return (
            <p key={key} className="mb-2 last:mb-0">
              {b.lines.map((line, li) => (
                <React.Fragment key={`${key}-l${li}`}>
                  {li > 0 && <br />}
                  {renderInline(line, `${key}-l${li}`)}
                </React.Fragment>
              ))}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={key} className="mb-2 ml-4 list-disc space-y-1 last:mb-0 marker:text-muted-foreground">
              {b.items.map((it, ii) => (
                <li key={`${key}-i${ii}`}>{renderInline(it, `${key}-i${ii}`)}</li>
              ))}
            </ul>
          );
        }
        // Ordered list
        return (
          <ol key={key} className="mb-2 ml-4 list-decimal space-y-1 last:mb-0 marker:text-muted-foreground">
            {b.items.map((it, ii) => (
              <li key={`${key}-i${ii}`}>{renderInline(it, `${key}-i${ii}`)}</li>
            ))}
          </ol>
        );
      })}
    </>
  );
}
