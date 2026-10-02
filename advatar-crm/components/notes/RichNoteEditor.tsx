"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface RichNoteEditorHandle {
  /** The markup as it stands. Sanitised again before it is stored. */
  getHtml: () => string;
  /** The words, for anything that works a line at a time. */
  getText: () => string;
  /** What is selected right now, as text. */
  getSelectedText: () => string;
  /** Removes the selection, leaving the rest of the note alone. */
  deleteSelection: () => void;
  focus: () => void;
}

/**
 * The note body: a contenteditable with bold, italic, underline and
 * bullets, plus two things that happen as you type.
 *
 * On React and contenteditable: the markup is handed over once, on
 * mount, and never written back from state afterwards. Re-rendering
 * the children of a contenteditable on each keystroke moves the caret
 * to the start of the line, which is unusable — so this owns its own
 * DOM and the form reads out of it rather than pushing into it.
 *
 * On execCommand: deprecated, and still the only thing every browser
 * implements for this. The replacement (a full editor model) is a
 * library-sized undertaking for three buttons. styleWithCSS is turned
 * off so the browser writes <b> and <i> rather than spans carrying
 * inline styles, which matters because the sanitiser allows the tags
 * and drops every attribute — styled spans would come back as plain
 * text.
 */
export const RichNoteEditor = forwardRef<
  RichNoteEditorHandle,
  {
    initialHtml: string;
    onInput?: () => void;
    placeholder?: string;
    ariaLabel?: string;
  }
>(function RichNoteEditor({ initialHtml, onInput, placeholder, ariaLabel }, ref) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (box && box.innerHTML !== initialHtml) box.innerHTML = initialHtml;
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Older browsers refuse this; the worst case is a styled span,
      // which the sanitiser turns back into plain text.
    }
    // Deliberately once. See the note above about the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getHtml: () => boxRef.current?.innerHTML ?? "",
    getText: () => boxRef.current?.innerText ?? "",
    getSelectedText: () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !boxRef.current) return "";
      // Only a selection inside this editor counts — otherwise
      // selecting something elsewhere on the page and pressing the
      // button would pull in text that is not part of the note.
      if (!boxRef.current.contains(sel.anchorNode) || !boxRef.current.contains(sel.focusNode)) return "";
      return sel.toString();
    },
    deleteSelection: () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !boxRef.current) return;
      if (!boxRef.current.contains(sel.anchorNode)) return;
      document.execCommand("delete");
      onInput?.();
    },
    focus: () => boxRef.current?.focus(),
  }));

  function run(command: string) {
    boxRef.current?.focus();
    document.execCommand(command);
    onInput?.();
  }

  /**
   * The two things that happen while typing.
   *
   * Both work off the caret's own text node rather than the whole
   * body, so neither has to understand the markup around it and
   * neither disturbs anything the person did not just type.
   */
  function handleInput() {
    const sel = window.getSelection();
    const node = sel?.focusNode;

    if (sel && sel.isCollapsed && node && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const at = sel.focusOffset;

      // "->" becomes an arrow, the moment the ">" lands.
      if (at >= 2 && text.slice(at - 2, at) === "->") {
        node.textContent = text.slice(0, at - 2) + "→" + text.slice(at);
        const range = document.createRange();
        range.setStart(node, at - 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        onInput?.();
        return;
      }

      // "- " at the start of a line starts a bullet list. Checked
      // against the line rather than the node so it only fires at a
      // real line start, not after "5 - 3 ".
      //
      // The non-breaking space is not optional pedantry: a trailing
      // space in a contenteditable is inserted as  , so the text
      // here reads "- " and a plain "- " comparison never matches.
      if (text.slice(0, at).replace(/ /g, " ") === "- " && atLineStart(node)) {
        node.textContent = text.slice(at);
        const range = document.createRange();
        range.setStart(node, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertUnorderedList");
        onInput?.();
        return;
      }
    }

    onInput?.();
  }

  /** True when nothing visible precedes this node on its own line. */
  function atLineStart(node: Node): boolean {
    const box = boxRef.current;
    if (!box) return false;

    let current: Node | null = node;
    while (current && current !== box) {
      let prev = current.previousSibling;
      while (prev) {
        if (prev.nodeName === "BR") return true;
        if ((prev.textContent ?? "").length > 0) return false;
        prev = prev.previousSibling;
      }
      current = current.parentNode;
      // A block of its own — div, p, li — is a line start.
      if (current && current !== box && /^(DIV|P|LI)$/.test(current.nodeName)) return true;
    }
    return true;
  }

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Formatting"
        style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}
      >
        <ToolButton label="Bold" hint="Bold (Ctrl+B)" onClick={() => run("bold")}>
          <b>B</b>
        </ToolButton>
        <ToolButton label="Italic" hint="Italic (Ctrl+I)" onClick={() => run("italic")}>
          <i>I</i>
        </ToolButton>
        <ToolButton label="Underline" hint="Underline (Ctrl+U)" onClick={() => run("underline")}>
          <u>U</u>
        </ToolButton>
        <ToolButton label="Bullet list" hint="Bullet list" onClick={() => run("insertUnorderedList")}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>•</span>
        </ToolButton>
      </div>

      <div
        ref={boxRef}
        className="note-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel ?? "Note"}
        data-placeholder={placeholder ?? "Write your note…"}
        onInput={handleInput}
        // Paste as plain text. A note pasted from a web page would
        // otherwise arrive carrying its own fonts, colours and
        // tracking markup — all of which the sanitiser strips on save
        // anyway, so accepting it would only mean the note looked one
        // way while being written and another once stored.
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
    </div>
  );
});

function ToolButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={hint}
      // The editor must not lose the selection when the button takes
      // focus, or bold would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        minWidth: 32,
        height: 30,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: "var(--text-1)",
        fontFamily: "var(--font-body)",
        fontSize: 13.5,
        cursor: "pointer",
        padding: "0 9px",
      }}
    >
      {children}
    </button>
  );
}
