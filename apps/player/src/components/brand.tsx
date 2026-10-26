/** The keep's mark: a filled square and the name in mono. */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5 font-medium font-mono text-small">
      <span aria-hidden className="size-2.5 bg-foreground" />
      keep music
    </span>
  );
}
