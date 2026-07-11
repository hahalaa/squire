import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { flattenVisible, moveLabel } from "./treeModel";
import type { PositionNode } from "./types";

interface RepertoireTreeProps {
  tree: PositionNode[];
  // Expansion state is owned by the parent (RepertoireBrowser) so it can seed
  // "expand all" on load and reset when the selected repertoire changes.
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

// Collapsible tree browser. Renders the flattened, currently-visible rows
// (pure logic in treeModel.ts) as an indented list — the mainline first, with
// variations marked, at each depth.
export function RepertoireTree({ tree, expanded, onToggle }: RepertoireTreeProps) {
  if (tree.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No lines saved yet. Import a PGN to populate this repertoire.
      </p>
    );
  }

  const rows = flattenVisible(tree, expanded);

  return (
    <ul className="space-y-0.5">
      {rows.map(({ node, depth, hasChildren, isExpanded, isVariation }) => (
        <li key={node.id}>
          <div
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-secondary/40"
            style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
          >
            {hasChildren ? (
              <button
                type="button"
                aria-label={isExpanded ? "Collapse" : "Expand"}
                aria-expanded={isExpanded}
                onClick={() => onToggle(node.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              // Keep leaf labels aligned with expandable siblings.
              <span className="h-5 w-5 shrink-0" aria-hidden />
            )}
            <span
              className={cn(
                "font-mono text-sm",
                isVariation ? "italic text-muted-foreground" : "text-foreground",
              )}
            >
              {moveLabel(node.fen, node.move)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
