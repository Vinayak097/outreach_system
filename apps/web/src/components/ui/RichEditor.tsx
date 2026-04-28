import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  PaintBucket,
  Type,
  Underline,
} from "lucide-react";
import { ChangeEvent, useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
];

const COLOR_SWATCHES = ["#111827", "#374151", "#2563eb", "#0f766e", "#15803d", "#b45309", "#b91c1c", "#7c3aed"];

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

  function applyFont(e: ChangeEvent<HTMLSelectElement>) {
    const font = e.target.value;
    if (font) exec("fontName", font);
  }

  function applyColor(color: string) {
    exec("foreColor", color);
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
        <div className="w-px h-4 bg-border mx-1 shrink-0" />
        <label className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-ink-secondary">
          <Type size={13} />
          <select
            className="bg-transparent text-small focus:outline-none min-w-[110px]"
            defaultValue=""
            onChange={applyFont}
            title="Choose font"
          >
            <option value="" disabled>
              Font
            </option>
            {FONT_OPTIONS.map((font) => (
              <option key={font.label} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-flex items-center gap-1 pl-1">
          <PaintBucket size={13} className="text-ink-secondary" />
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              title={`Text color ${color}`}
              className="h-4 w-4 rounded-full border border-black/10 transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
              onMouseDown={(e) => {
                e.preventDefault();
                applyColor(color);
              }}
            />
          ))}
        </div>
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
