import { llms } from "fumadocs-core/source";
import { source } from "./source";

/** The docs as markdown for language models: an index (/llms.txt), every page (/llms-full.txt), one page (/docs/x.md). */
export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})\n\n${await page.data.getText("processed")}`,
});
