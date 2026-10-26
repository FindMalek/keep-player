import { configDocs } from "../apps/api/src/settings";

// Regenerates docs/configuration.md from the settings table; `--check` fails when the file is out of date (CI).
const path = "docs/configuration.md";
const expected = configDocs();
if (process.argv.includes("--check")) {
  if (
    (await Bun.file(path)
      .text()
      .catch(() => "")) !== expected
  ) {
    console.error(`${path} is out of date: run bun scripts/config-docs.ts`);
    process.exit(1);
  }
  console.log(`${path}: up to date`);
} else {
  await Bun.write(path, expected);
  console.log(`wrote ${path}`);
}
