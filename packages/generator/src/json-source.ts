import { findNodeAtLocation, getNodeValue, parseTree, printParseErrorCode } from "jsonc-parser";
import type { Node, ParseError } from "jsonc-parser";

export interface JsonSource {
  /** The parsed value; undefined if there were syntax errors */
  value: unknown;
  /** Syntax errors and duplicate keys, with 1-based lines */
  errors: { message: string; line: number }[];
  /**
   * Line of the node at `keyPath`: the key for object properties, the value for array items.
   * Falls back to the nearest existing ancestor for missing keys.
   */
  lineOf(keyPath: readonly PropertyKey[]): number | undefined;
}

/** Parses strict JSON (no comments, no trailing commas) and keeps source positions. */
export function parseJsonSource(text: string): JsonSource {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineAt = (offset: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line++;
    return line + 1;
  };

  const parseErrors: ParseError[] = [];
  const tree = parseTree(text, parseErrors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  // Like JSON.parse, report only the first syntax error; later ones are usually follow-ups.
  const errors = parseErrors.slice(0, 1).map((e) => ({
    message: humanize(printParseErrorCode(e.error)),
    line: lineAt(e.offset),
  }));
  if (tree && errors.length === 0) {
    for (const key of duplicateKeys(tree)) {
      errors.push({ message: `duplicate key "${key.value as string}"`, line: lineAt(key.offset) });
    }
  }

  return {
    value: tree && errors.length === 0 ? getNodeValue(tree) : undefined,
    errors: errors.sort((a, b) => a.line - b.line),
    lineOf(keyPath) {
      if (!tree) return undefined;
      for (let depth = keyPath.length; depth > 0; depth--) {
        const segments = keyPath
          .slice(0, depth)
          .map((k) => (typeof k === "number" ? k : String(k)));
        const node = findNodeAtLocation(tree, segments);
        if (node) {
          const located = node.parent?.type === "property" ? node.parent : node;
          return lineAt(located.offset);
        }
      }
      return undefined;
    },
  };
}

function duplicateKeys(node: Node): Node[] {
  const found: Node[] = [];
  if (node.type === "object") {
    const seen = new Set<unknown>();
    for (const property of node.children ?? []) {
      const key = property.children?.[0];
      if (!key) continue;
      if (seen.has(key.value)) found.push(key);
      seen.add(key.value);
    }
  }
  for (const child of node.children ?? []) found.push(...duplicateKeys(child));
  return found;
}

/** "PropertyNameExpected" -> "property name expected" */
function humanize(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
