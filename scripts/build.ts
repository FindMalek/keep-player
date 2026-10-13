import tailwind from "bun-plugin-tailwind";

/** One self-contained executable: the Bun server with the web app bundled, minified and embedded. */
const result = await Bun.build({
  entrypoints: ["src/server.ts"],
  compile: { outfile: "dist/keep-player" },
  target: "bun",
  minify: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log("built dist/keep-player");
