// Few, short comments: what the code can't say (a constraint, a footgun, a product decision), never what it does.
const DIRECTIVE = /^\s*(biome-ignore|@ts-|eslint-|oxlint-|@vitest|@jsx|#__|\/ <reference|global )/;
const BUDGET_SHARE = 0.03;
const BUDGET_MIN = 3;
const MAX_BLOCK_LINES = 2;

/** Comments as blocks: a `/* *\/` comment, or `//` lines on consecutive lines. Directives don't count. */
function blocksOf(sourceCode) {
  const blocks = [];
  for (const comment of sourceCode.getAllComments()) {
    if (DIRECTIVE.test(comment.value.replace(/^\*+/, ""))) continue;
    const lines = comment.value.trim().split("\n").filter((line) => line.replace(/^\s*\*?/, "").trim()).length || 1;
    const last = blocks.at(-1);
    if (comment.type === "Line" && last?.line && last.end === comment.loc.start.line - 1) {
      last.lines += 1;
      last.end = comment.loc.end.line;
    } else blocks.push({ loc: comment.loc, lines, end: comment.loc.end.line, line: comment.type === "Line" });
  }
  return blocks;
}

const commentBudget = {
  meta: { type: "suggestion", docs: { description: "Caps comment lines per file and per comment" } },
  create(context) {
    return {
      Program() {
        const { sourceCode } = context;
        const blocks = blocksOf(sourceCode);
        const codeLines = sourceCode.text.split("\n").filter((line) => line.trim()).length;
        const budget = Math.max(BUDGET_MIN, Math.floor(codeLines * BUDGET_SHARE));
        let used = 0;
        let over = false;
        for (const block of blocks) {
          if (block.lines > MAX_BLOCK_LINES)
            context.report({
              loc: block.loc,
              message: `${block.lines}-line comment: keep it to ${MAX_BLOCK_LINES} lines, only what the code can't say.`,
            });
          used += block.lines;
          if (used > budget && !over) {
            over = true;
            context.report({
              loc: block.loc,
              message: `Too many comments: ${blocks.reduce((sum, b) => sum + b.lines, 0)} lines in ${codeLines} (budget ${budget}). Delete the ones that restate the code.`,
            });
          }
        }
      },
    };
  },
};

export default { meta: { name: "keep" }, rules: { "comment-budget": commentBudget } };
