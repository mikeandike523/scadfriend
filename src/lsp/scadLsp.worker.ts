import type {
  LspRequest,
  LspResponse,
  ScadImport,
  ScadSymbol,
  ScadSymbolReference,
} from "./scadLspProtocol";

import type {
  Parser as ParserType,
  Tree as TreeType,
  Node as SyntaxNode,
} from "web-tree-sitter";

let parser: ParserType | null = null;

// ---- Tree cache: avoid re-parsing identical text ----
let cachedText: string | null = null;
let cachedTree: TreeType | null = null;

/** Parse text, reusing the cached tree if the text hasn't changed. */
function parseText(text: string): TreeType | null {
  if (!parser) return null;
  if (cachedText === text && cachedTree) return cachedTree;
  if (cachedTree) cachedTree.delete();
  cachedTree = parser.parse(text);
  cachedText = text;
  return cachedTree;
}

async function init() {
  const { Parser, Language } = await import("web-tree-sitter");
  await Parser.init({
    locateFile: () => "/tree-sitter.wasm",
  });
  const lang = await Language.load("/tree-sitter-openscad.wasm");
  parser = new Parser();
  parser.setLanguage(lang);

  const msg: LspResponse = { type: "ready" };
  self.postMessage(msg);
}

function extractParameters(paramsNode: SyntaxNode | null): string[] {
  if (!paramsNode) return [];
  const names: string[] = [];
  for (const child of paramsNode.namedChildren) {
    if (child.type === "parameter") {
      const id = child.namedChildren[0];
      if (id) names.push(id.text);
    } else if (child.type === "assignment") {
      const left = child.childForFieldName("left");
      if (left) names.push(left.text);
    }
  }
  return names;
}

function extractSymbols(root: SyntaxNode): ScadSymbol[] {
  const symbols: ScadSymbol[] = [];

  for (const child of root.namedChildren) {
    if (child.type === "module_declaration") {
      const nameNode = child.childForFieldName("name");
      const paramsNode = child.childForFieldName("parameters");
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          kind: "module",
          parameters: extractParameters(paramsNode),
          startLine: child.startPosition.row,
          startColumn: child.startPosition.column,
          endLine: child.endPosition.row,
          endColumn: child.endPosition.column,
        });
      }
    } else if (child.type === "function_declaration") {
      const nameNode = child.childForFieldName("name");
      const paramsNode = child.childForFieldName("parameters");
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          kind: "function",
          parameters: extractParameters(paramsNode),
          startLine: child.startPosition.row,
          startColumn: child.startPosition.column,
          endLine: child.endPosition.row,
          endColumn: child.endPosition.column,
        });
      }
    } else if (child.type === "assignment") {
      const left = child.childForFieldName("left");
      if (left) {
        symbols.push({
          name: left.text,
          kind: "variable",
          parameters: [],
          startLine: child.startPosition.row,
          startColumn: child.startPosition.column,
          endLine: child.endPosition.row,
          endColumn: child.endPosition.column,
        });
      }
    }
  }

  return symbols;
}

function findAllReferences(
  root: SyntaxNode,
  name: string
): ScadSymbolReference[] {
  const refs: ScadSymbolReference[] = [];
  const identifiers = root.descendantsOfType(["identifier", "special_variable"]);
  for (const node of identifiers) {
    if (node.text === name) {
      refs.push({
        startLine: node.startPosition.row,
        startColumn: node.startPosition.column,
        endLine: node.endPosition.row,
        endColumn: node.endPosition.column,
      });
    }
  }
  return refs;
}

/**
 * Extract all import/include/use/surface directives from the AST.
 *
 * Handles:
 *   include <path>         → include_statement > include_path
 *   use <path>             → use_statement > include_path
 *   import("path")         → module_call(name="import") or function_call
 *   surface("path")        → module_call(name="surface") or function_call
 */
function extractImportNodes(root: SyntaxNode): ScadImport[] {
  const imports: ScadImport[] = [];

  // --- include / use statements ---
  const includeUseNodes = root.descendantsOfType([
    "include_statement",
    "use_statement",
  ]);
  for (const node of includeUseNodes) {
    const kind = node.type === "include_statement" ? "include" : "use";
    const pathNode = node.namedChildren.find(
      (c) => c.type === "include_path"
    );
    if (!pathNode) continue;

    // include_path text includes angle brackets: "<MCAD/foo.scad>"
    const raw = pathNode.text;
    const path = raw.startsWith("<") && raw.endsWith(">")
      ? raw.slice(1, -1)
      : raw;

    // Path position: skip the leading '<' and trailing '>'
    const pathStartCol = pathNode.startPosition.column + 1;
    const pathEndCol = pathNode.endPosition.column - 1;

    imports.push({
      kind,
      path,
      startLine: node.startPosition.row,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row,
      endColumn: node.endPosition.column,
      pathStartLine: pathNode.startPosition.row,
      pathStartColumn: pathStartCol,
      pathEndLine: pathNode.endPosition.row,
      pathEndColumn: pathEndCol,
    });
  }

  // --- import() / surface() calls ---
  // These appear as module_call in statement context, or function_call in
  // expression context. Check both to be safe.
  const callNodes = root.descendantsOfType(["module_call", "function_call"]);
  for (const node of callNodes) {
    // module_call uses "name" field, function_call uses "function" field
    const nameNode =
      node.childForFieldName("name") ?? node.childForFieldName("function");
    if (!nameNode) continue;
    const funcName = nameNode.text;
    if (funcName !== "import" && funcName !== "surface") continue;

    const argsNode = node.childForFieldName("arguments");
    if (!argsNode) continue;

    // Find the first string literal among arguments
    const stringNodes = argsNode.descendantsOfType("string");
    if (stringNodes.length === 0) continue;
    const stringNode = stringNodes[0];

    // Strip quotes from the string text
    const raw = stringNode.text;
    const path = raw.replace(/^["']|["']$/g, "");
    if (!path) continue;

    imports.push({
      kind: funcName as "import" | "surface",
      path,
      startLine: node.startPosition.row,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row,
      endColumn: node.endPosition.column,
      // Path position: inside the quotes
      pathStartLine: stringNode.startPosition.row,
      pathStartColumn: stringNode.startPosition.column + 1,
      pathEndLine: stringNode.endPosition.row,
      pathEndColumn: stringNode.endPosition.column - 1,
    });
  }

  return imports;
}

self.onmessage = (event: MessageEvent<LspRequest>) => {
  const req = event.data;
  if (!parser) {
    const msg: LspResponse = {
      type: "error",
      id: req.id,
      message: "Parser not initialized",
    };
    self.postMessage(msg);
    return;
  }

  try {
    const tree = parseText(req.text);
    if (!tree) {
      const msg: LspResponse = {
        type: "error",
        id: req.id,
        message: "Parse returned null",
      };
      self.postMessage(msg);
      return;
    }

    if (req.type === "parse") {
      const symbols = extractSymbols(tree.rootNode);
      const msg: LspResponse = {
        type: "parseResult",
        id: req.id,
        symbols,
      };
      self.postMessage(msg);
    } else if (req.type === "findReferences") {
      const references = findAllReferences(tree.rootNode, req.name);
      const msg: LspResponse = {
        type: "referencesResult",
        id: req.id,
        references,
      };
      self.postMessage(msg);
    } else if (req.type === "extractImports") {
      const imps = extractImportNodes(tree.rootNode);
      const msg: LspResponse = {
        type: "importsResult",
        id: req.id,
        imports: imps,
      };
      self.postMessage(msg);
    }

    // Don't delete the tree — it's cached for reuse by parseText()
  } catch (err) {
    const msg: LspResponse = {
      type: "error",
      id: req.id,
      message: String(err),
    };
    self.postMessage(msg);
  }
};

init().catch((err) => {
  console.error("Failed to initialize tree-sitter:", err);
});
