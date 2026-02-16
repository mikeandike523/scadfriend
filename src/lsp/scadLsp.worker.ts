import type {
  LspRequest,
  LspResponse,
  ScadSymbol,
  ScadSymbolReference,
} from "./scadLspProtocol";

import type { Parser as ParserType, Node as SyntaxNode } from "web-tree-sitter";

let parser: ParserType | null = null;

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
    const tree = parser.parse(req.text);
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
    }

    tree.delete();
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
