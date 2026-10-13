import { Glob } from "bun";

/**
 * The brand is only shadcn theme tokens (src/web/app.css). Anywhere else, a Tailwind palette class, an arbitrary color
 * value or a literal color is a bug. Vendored registry code (components/ui, hooks, lib/audio) is exempt.
 */
const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|placeholder|caret|accent|shadow|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/;
const ARBITRARY = /-\[(?:#|rgb|hsl|oklch|oklab|lab|lch|color)/;
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/;
const EXEMPT = ["src/web/app.css", "src/web/components/ui/", "src/web/hooks/", "src/web/lib/audio/"];

export function findColors(source: string): { line: number; text: string }[] {
  return source
    .split("\n")
    .flatMap((text, index) =>
      PALETTE.test(text) || ARBITRARY.test(text) || LITERAL.test(text) ? [{ line: index + 1, text: text.trim() }] : [],
    );
}

if (import.meta.main) {
  let failures = 0;
  for await (const path of new Glob("src/web/**/*.{ts,tsx,css,html}").scan()) {
    if (EXEMPT.some((prefix) => path.startsWith(prefix)) || path.endsWith(".test.ts")) continue;
    for (const hit of findColors(await Bun.file(path).text())) {
      failures += 1;
      console.error(`${path}:${hit.line}  raw color, use a theme token: ${hit.text}`);
    }
  }
  if (failures) process.exit(1);
  console.log("colors: theme tokens only");
}
