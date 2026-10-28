/** Lodesong's mark: a square split by one stepped vein, and the name in mono. */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5 font-medium font-mono text-small">
      <svg aria-hidden className="size-3.5 fill-foreground" viewBox="2 2 12 12">
        <path d="M2 2h12v4H7.25v2.5H2zM2 10h6.75V7.5H14V14H2z" />
      </svg>
      lodesong
    </span>
  );
}
