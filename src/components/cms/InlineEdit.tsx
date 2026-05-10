import { useState, useEffect, useRef } from "react";
import { Pencil } from "lucide-react";

export function InlineEdit({
  value,
  onChange,
  multiline = false,
  className = "",
  placeholder = "Nhấn để chỉnh…",
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref as any}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        rows={3}
        className={`w-full rounded-md border border-primary bg-surface px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      />
    ) : (
      <input
        ref={ref as any}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") commit();
        }}
        className={`w-full rounded-md border border-primary bg-surface px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group inline-flex items-start gap-1.5 text-left rounded-md px-1 -mx-1 hover:bg-primary/5 transition cursor-text w-full ${className}`}
    >
      <span className={value ? "" : "text-muted-foreground italic"}>{value || placeholder}</span>
      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 mt-1 shrink-0 transition" />
    </button>
  );
}
