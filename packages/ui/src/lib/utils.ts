import { createCn } from "cn/engine";
import tables from "./cn-tables";

// Tables built from theme.css (`bun run cn-tables` in packages/ui), so `text-body` merges as a size, not a color.
export const cn = createCn(tables);
