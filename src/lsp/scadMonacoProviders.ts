import type { Monaco } from "@monaco-editor/react";
import type { ScadLspClient } from "./scadLspClient";
import { ALL_BUILTINS } from "./scadBuiltins";
import type { ScadSymbol } from "./scadLspProtocol";

type IDisposable = ReturnType<Monaco["languages"]["registerCompletionItemProvider"]>;

function symbolToCompletionKind(
  monaco: Monaco,
  kind: ScadSymbol["kind"]
): number {
  switch (kind) {
    case "module":
      return monaco.languages.CompletionItemKind.Module;
    case "function":
      return monaco.languages.CompletionItemKind.Function;
    case "variable":
      return monaco.languages.CompletionItemKind.Variable;
  }
}

function symbolToDocumentSymbolKind(
  monaco: Monaco,
  kind: ScadSymbol["kind"]
): number {
  switch (kind) {
    case "module":
      return monaco.languages.SymbolKind.Module;
    case "function":
      return monaco.languages.SymbolKind.Function;
    case "variable":
      return monaco.languages.SymbolKind.Variable;
  }
}

function makeSnippet(sym: ScadSymbol): string {
  if (sym.parameters.length === 0) {
    return sym.kind === "variable" ? sym.name : `${sym.name}($0)`;
  }
  const params = sym.parameters
    .map((p, i) => `\${${i + 1}:${p}}`)
    .join(", ");
  return sym.kind === "module"
    ? `${sym.name}(${params}) {\n\t$0\n}`
    : `${sym.name}(${params})`;
}

function isBuiltin(sym: ScadSymbol): boolean {
  return sym.startLine === -1;
}

export function registerOpenSCADProviders(
  monaco: Monaco,
  client: ScadLspClient
): IDisposable[] {
  const disposables: IDisposable[] = [];

  // Completion provider
  disposables.push(
    monaco.languages.registerCompletionItemProvider("openscad", {
      provideCompletionItems: async (model, position) => {
        const text = model.getValue();
        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: wordInfo.endColumn,
        };

        let userSymbols: ScadSymbol[] = [];
        try {
          userSymbols = await client.parse(text);
        } catch {
          // If parse fails, still show builtins
        }

        const allSymbols = [...userSymbols, ...ALL_BUILTINS];
        // Deduplicate by name (user symbols win)
        const seen = new Set<string>();
        const unique: ScadSymbol[] = [];
        for (const sym of allSymbols) {
          if (!seen.has(sym.name)) {
            seen.add(sym.name);
            unique.push(sym);
          }
        }

        return {
          suggestions: unique.map((sym) => ({
            label: sym.name,
            kind: symbolToCompletionKind(monaco, sym.kind),
            insertText: makeSnippet(sym),
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: isBuiltin(sym) ? "(built-in)" : sym.kind,
            sortText: isBuiltin(sym) ? `z_${sym.name}` : `a_${sym.name}`,
          })),
        };
      },
    })
  );

  // Document symbol provider
  disposables.push(
    monaco.languages.registerDocumentSymbolProvider("openscad", {
      provideDocumentSymbols: async (model) => {
        const text = model.getValue();
        let symbols: ScadSymbol[] = [];
        try {
          symbols = await client.parse(text);
        } catch {
          return [];
        }

        return symbols
          .filter((sym) => !isBuiltin(sym))
          .map((sym) => ({
            name: sym.name,
            detail: sym.parameters.length
              ? `(${sym.parameters.join(", ")})`
              : "",
            kind: symbolToDocumentSymbolKind(monaco, sym.kind),
            range: {
              startLineNumber: sym.startLine + 1,
              startColumn: sym.startColumn + 1,
              endLineNumber: sym.endLine + 1,
              endColumn: sym.endColumn + 1,
            },
            selectionRange: {
              startLineNumber: sym.startLine + 1,
              startColumn: sym.startColumn + 1,
              endLineNumber: sym.startLine + 1,
              endColumn: sym.startColumn + sym.name.length + 1,
            },
            tags: [],
          }));
      },
    })
  );

  // Rename provider
  disposables.push(
    monaco.languages.registerRenameProvider("openscad", {
      provideRenameEdits: async (model, position, newName) => {
        const text = model.getValue();
        const wordAtPos = model.getWordAtPosition(position);
        if (!wordAtPos) return { edits: [] };

        const oldName = wordAtPos.word;

        let refs;
        try {
          refs = await client.findReferences(text, oldName);
        } catch {
          return { edits: [] };
        }

        return {
          edits: [
            {
              resource: model.uri,
              textEdit: undefined!,
              // Monaco expects versionId for proper edit tracking
              versionId: model.getVersionId(),
              edits: refs.map((ref) => ({
                range: {
                  startLineNumber: ref.startLine + 1,
                  startColumn: ref.startColumn + 1,
                  endLineNumber: ref.endLine + 1,
                  endColumn: ref.endColumn + 1,
                },
                text: newName,
              })),
            },
          ],
        };
      },
      resolveRenameLocation: async (model, position) => {
        const wordAtPos = model.getWordAtPosition(position);
        if (!wordAtPos) {
          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
            text: "",
            rejectReason: "Cannot rename this element",
          };
        }

        // Don't allow renaming built-in symbols
        const builtinNames = new Set(ALL_BUILTINS.map((b) => b.name));
        if (builtinNames.has(wordAtPos.word)) {
          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: wordAtPos.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: wordAtPos.endColumn,
            },
            text: wordAtPos.word,
            rejectReason: "Cannot rename a built-in symbol",
          };
        }

        return {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: wordAtPos.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: wordAtPos.endColumn,
          },
          text: wordAtPos.word,
        };
      },
    })
  );

  return disposables;
}
