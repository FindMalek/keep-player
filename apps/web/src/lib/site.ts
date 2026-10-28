/**
 * Where this site lives: `SITE_URL` when set, else Vercel's production domain for the project, else the placeholder
 * (the domain waits for the project's name to settle).
 */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://lodesong.findmalek.engineer");
export const REPO = "https://github.com/FindMalek/lodesong";
export const DOCS = "/docs";
export const SELF_HOSTING = "/docs/self-hosting";
export const MAC_APP = `${REPO}/releases/latest/download/lodesong-macos.zip`;

/** Stars for the GitHub button, refreshed daily; none when GitHub doesn't answer. */
export async function stars(): Promise<number | null> {
  const response = await fetch("https://api.github.com/repos/FindMalek/lodesong", { next: { revalidate: 86_400 } }).catch(() => null);
  if (!response?.ok) return null;
  return ((await response.json()) as { stargazers_count?: number }).stargazers_count ?? null;
}
