/** Where this site lives; the domain is still a placeholder until the project's name settles. */
export const SITE_URL = process.env.SITE_URL ?? "https://keepmusic.findmalek.engineer";
export const REPO = "https://github.com/FindMalek/keep-player";
export const DOCS = "/docs";
export const SELF_HOSTING = "/docs/self-hosting";
export const MAC_APP = `${REPO}/releases/latest/download/keep-music-macos.zip`;

/** Stars for the GitHub button, refreshed daily; none when GitHub doesn't answer. */
export async function stars(): Promise<number | null> {
  const response = await fetch("https://api.github.com/repos/FindMalek/keep-player", { next: { revalidate: 86_400 } }).catch(() => null);
  if (!response?.ok) return null;
  return ((await response.json()) as { stargazers_count?: number }).stargazers_count ?? null;
}
