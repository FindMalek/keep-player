import { useState } from "react";
import { cn } from "@/lib/utils";

/** Text that turns into an input on click: enter or leaving saves, esc cancels. Plain text when not editable. */
export function EditableText({
  value,
  onSave,
  label,
  editable,
  placeholder,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  editable: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!editable) return value ? <span className={className}>{value}</span> : null;
  if (draft === null)
    return (
      <button
        type="button"
        aria-label={`${label}: ${value || "none"}, click to edit`}
        className={cn(
          "cursor-text text-left hover:underline hover:decoration-dotted hover:underline-offset-4",
          !value && "text-faint",
          className,
        )}
        onClick={() => setDraft(value)}
      >
        {value || placeholder}
      </button>
    );
  const finish = () => {
    const next = draft.trim();
    setDraft(null);
    if (next !== value && (next || placeholder)) onSave(next);
  };
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the click asked to edit this
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
      className={cn("w-full min-w-0 border-b bg-transparent outline-none", className)}
    />
  );
}
