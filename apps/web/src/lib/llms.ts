import { llms } from "fumadocs-core/source";
import { source } from "./source";

/** The docs as markdown for language models: an index (/llms.txt), every page (/llms-full.txt), one page (/docs/x.md). */
export const docsLlms = llms(source, {
  // The processed text ends each heading with its id (`## Server [#server]`); readers don't need it.
  renderPage: async (page) =>
    `# ${page.data.title} (${page.url})\n\n${(await page.data.getText("processed")).replace(/ \[#[^\]]+\]$/gm, "")}`,
});
