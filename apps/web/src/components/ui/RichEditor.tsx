import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef("");

  useEffect(() => {
    if (editorRef.current && value !== lastRef.current) {
      editorRef.current.innerHTML = value;
      lastRef.current = value;
    }
  }, [value]);

  function sync() {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastRef.current = html;
      onChange(html);
    }
  }

  function exec(cmd: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    sync();
  }

  function insertLink() {
    const url = window.prompt("Enter URL (e.g. https://example.com):");
    if (url) exec("createLink", url);
  }

  const isEmpty = !value || value === "<br>" || value === "<div><br></div>";

  return (
    <div className="border rounded-card overflow-hidden focus-within:border-[rgba(0,0,0,0.35)]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-surface-secondary border-b flex-wrap">
        <ToolBtn title="Bold (Ctrl+B)" onMouseDown={() => exec("bold")}>
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn title="Italic (Ctrl+I)" onMouseDown={() => exec("italic")}>
          <Italic size={13} />
        </ToolBtn>
        <ToolBtn title="Underline (Ctrl+U)" onMouseDown={() => exec("underline")}>
          <Underline size={13} />
        </ToolBtn>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />
        <ToolBtn title="Bullet list" onMouseDown={() => exec("insertUnorderedList")}>
          <List size={13} />
        </ToolBtn>
        <ToolBtn title="Numbered list" onMouseDown={() => exec("insertOrderedList")}>
          <ListOrdered size={13} />
        </ToolBtn>
        <div className="w-px h-4 bg-border mx-1 shrink-0" />
        <ToolBtn title="Insert link" onMouseDown={insertLink}>
          <Link size={13} />
        </ToolBtn>
      </div>

      {/* Editor area */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute top-0 left-0 px-3 py-2 text-ink-tertiary pointer-events-none text-body select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="px-3 py-2 min-h-[200px] focus:outline-none text-body text-ink-primary [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline"
          onInput={sync}
          onBlur={sync}
        />
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  title,
  onMouseDown,
}: {
  children: React.ReactNode;
  title: string;
  onMouseDown: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className="p-1.5 rounded hover:bg-surface-tertiary text-ink-secondary hover:text-ink-primary transition-colors"
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus
        onMouseDown();
      }}
    >
      {children}
    </button>
  );
}
