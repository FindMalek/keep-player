import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@keep/ui/components/input-group";
import { SearchIcon, XIcon } from "lucide-react";
import { closeListFilter, type FilterScope, setListFilter } from "@/lib/list-filter";
import { Hint } from "./hint";

/** The ⌘F box over a list: filters as you type, esc or × closes it and shows everything again. */
export function ListFilterBar({ scope, query, shown, total }: { scope: FilterScope; query: string; shown: number; total: number }) {
  return (
    // Clear of a detail page's sticky bar when focusing it scrolls it into view.
    <InputGroup className="mb-2 h-8 scroll-mt-14">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        autoFocus
        aria-label="filter this list"
        placeholder="filter this list"
        value={query}
        onChange={(event) => setListFilter(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          closeListFilter(scope);
        }}
        className="font-mono text-xs"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText className="font-mono text-meta tabular-nums">{query ? `${shown} of ${total}` : total}</InputGroupText>
        <Hint label="close the filter" keys={["esc"]}>
          <InputGroupButton size="icon-xs" aria-label="close the filter" onClick={() => closeListFilter(scope)}>
            <XIcon />
          </InputGroupButton>
        </Hint>
      </InputGroupAddon>
    </InputGroup>
  );
}
