/** Lodesong's mark: a square split by one stepped vein, and the name in mono. */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5 font-medium font-mono text-small">
      <svg aria-hidden className="size-3.5 fill-foreground" viewBox="8 8 48 48">
        <path d="M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z" />
      </svg>
      lodesong
    </span>
  );
}
