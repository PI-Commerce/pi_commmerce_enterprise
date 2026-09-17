/**
 * PromptEditor — a lightweight rich-text field for AI prompts.
 *
 * Behaviour:
 *  - Renders as a contentEditable div styled like a textarea.
 *  - Text and `{{variable}}` references are stored as a plain string; on mount
 *    the string is parsed into a token stream (text + var chips) and rendered.
 *  - Typing `{{` opens the VariablePicker anchored at the caret; picking a
 *    variable inserts a non-editable chip (styled span) and closes the picker.
 *  - Backspace immediately after a chip deletes the whole chip.
 *  - Non-chip text is freely editable; every DOM mutation is serialized back
 *    to a `{{var}}` string via `onChange`.
 *
 * The component is deliberately dependency-free (no draft.js / lexical /
 * tiptap). The blob it manages is small and the interactions few, so a hand-
 * rolled contentEditable stays cheaper to reason about.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parsePrompt, serializePrompt, type PromptToken } from "@/lib/ai-transformations";

/** Data attribute we set on chip spans so we can tell them apart from text. */
const CHIP_ATTR = "data-var";

export function PromptEditor({
  value,
  disabled,
  placeholder,
  onChange,
  variables,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
  variables: { key: string; source: string }[];
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<{ query: string; anchor: number } | null>(null);
  // Track whether we've hydrated the DOM once — subsequent edits are managed
  // directly on the contentEditable, we don't stomp them by re-rendering.
  const hydratedRef = useRef(false);

  useLayoutEffect(() => {
    if (!editorRef.current) return;
    if (hydratedRef.current) return;
    renderTokens(editorRef.current, parsePrompt(value));
    hydratedRef.current = true;
  }, [value]);

  // Also re-render when value changes externally (e.g. transform swapped types).
  useEffect(() => {
    if (!editorRef.current) return;
    if (!hydratedRef.current) return;
    const current = serializeEditor(editorRef.current);
    if (current !== value) renderTokens(editorRef.current, parsePrompt(value));
  }, [value]);

  const flush = () => {
    if (!editorRef.current) return;
    onChange(serializeEditor(editorRef.current));
  };

  const onInput = () => {
    // Detect `{{` typed just before the caret → open picker
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      const before = getTextBeforeCaret(el, r);
      if (before.endsWith("{{")) {
        setPicker({ query: "", anchor: before.length });
      } else if (picker) {
        // Cancel picker on next character that isn't part of a query
        setPicker(null);
      }
    }
    flush();
  };

  const insertChip = (varKey: string) => {
    const el = editorRef.current;
    if (!el) return;
    // Remove the trailing `{{` before caret, then insert chip.
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // Walk back and delete the two `{` characters immediately before the caret.
    for (let i = 0; i < 2; i++) {
      range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
      range.deleteContents();
    }
    const chip = makeChip(varKey);
    range.insertNode(chip);
    // Insert a trailing space + move caret after the chip.
    const space = document.createTextNode(" ");
    chip.after(space);
    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setPicker(null);
    flush();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (picker) {
      if (e.key === "Escape") { e.preventDefault(); setPicker(null); return; }
    }
    // Backspace right after a chip → delete the whole chip.
    if (e.key === "Backspace") {
      const el = editorRef.current;
      const sel = window.getSelection();
      if (el && sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        if (r.collapsed && r.startOffset === 0) {
          const prev = r.startContainer.previousSibling as HTMLElement | null;
          if (prev instanceof HTMLElement && prev.getAttribute(CHIP_ATTR)) {
            e.preventDefault();
            prev.remove();
            flush();
          }
        }
      }
    }
  };

  const filtered = picker
    ? variables.filter((v) => v.key.toLowerCase().includes(picker.query.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="relative">
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder ?? "Describe what this AI step should do…"}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onBlur={() => setPicker(null)}
        className={cn(
          "min-h-[92px] w-full whitespace-pre-wrap break-words rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
          "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      />
      {picker && filtered.length > 0 && (
        <div className="absolute left-2 top-full z-30 mt-1 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
          <p className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Insert variable</p>
          {filtered.map((v) => (
            <button
              key={v.key}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertChip(v.key); }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent"
            >
              <span className="truncate font-mono text-foreground">{v.key}</span>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">{v.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  DOM ↔ token helpers
 * -------------------------------------------------------------------------- */

function makeChip(name: string): HTMLElement {
  const chip = document.createElement("span");
  chip.setAttribute(CHIP_ATTR, name);
  chip.setAttribute("contenteditable", "false");
  chip.className = "mx-0.5 inline-flex items-center rounded-md border border-ai/30 bg-ai/10 px-1.5 py-0.5 align-baseline font-mono text-[11.5px] text-ai";
  chip.textContent = name;
  return chip;
}

/** Walk `editor`'s children in order and re-emit as text + chips. */
function renderTokens(editor: HTMLElement, tokens: PromptToken[]) {
  editor.innerHTML = "";
  for (const t of tokens) {
    if (t.kind === "text") editor.appendChild(document.createTextNode(t.value));
    else editor.appendChild(makeChip(t.name));
  }
}

/** Serialize editor back to a `text {{var}} text` string. */
function serializeEditor(editor: HTMLElement): string {
  let out = "";
  editor.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += (n.textContent ?? "").replace(/ /g, " ");
    } else if (n instanceof HTMLElement && n.getAttribute(CHIP_ATTR)) {
      out += `{{${n.getAttribute(CHIP_ATTR)}}}`;
    } else if (n instanceof HTMLElement) {
      // Line break inside the editor
      out += n.tagName === "BR" ? "\n" : n.textContent ?? "";
    }
  });
  return out;
}

/** Text before the current caret within `editor`. */
function getTextBeforeCaret(editor: HTMLElement, range: Range): string {
  const pre = range.cloneRange();
  pre.selectNodeContents(editor);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString();
}
