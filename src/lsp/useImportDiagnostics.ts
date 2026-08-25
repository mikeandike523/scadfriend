import { useEffect, useRef, type MutableRefObject } from "react";
import { useMonaco } from "@monaco-editor/react";
import type { ScadLspClient } from "./scadLspClient";
import type { ScadImport } from "./scadLspProtocol";
import {
  resolveImportPath,
  isBuiltinPath,
  getFileHandleFromPath,
} from "../utils/importUtils";

const OWNER = "designcsg-import-validator";
const DEBOUNCE_MS = 500;

/**
 * Validates import/include/use/surface directives in the current editor file
 * and pushes red squiggle markers to Monaco for unresolvable paths.
 */
export function useImportDiagnostics(
  lspClientRef: MutableRefObject<ScadLspClient | null>,
  projectHandle: FileSystemDirectoryHandle | null,
  filePath: string | null,
  code: string
) {
  const monaco = useMonaco();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest validation run to discard stale results
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!monaco) return;

    // Clear markers when no file is open
    if (!code || !filePath) {
      for (const model of monaco.editor.getModels()) {
        monaco.editor.setModelMarkers(model, OWNER, []);
      }
      return;
    }

    // Debounce
    if (timerRef.current) clearTimeout(timerRef.current);
    const currentRunId = ++runIdRef.current;

    timerRef.current = setTimeout(async () => {
      const client = lspClientRef.current;
      if (!client) return;

      let imports: ScadImport[];
      try {
        imports = await client.extractImports(code);
      } catch {
        return;
      }

      // If a newer run was started, discard these results
      if (currentRunId !== runIdRef.current) return;

      type MarkerData = {
        severity: number;
        message: string;
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
      const markers: MarkerData[] = [];

      for (const imp of imports) {
        // Built-in paths are always valid
        if (isBuiltinPath(imp.path)) continue;

        if (imp.path.startsWith("/")) {
          // Absolute external path — HEAD check to see if it exists in public/
          try {
            const resp = await fetch(imp.path, { method: "HEAD" });
            if (!resp.ok) {
              markers.push({
                severity: monaco.MarkerSeverity.Error,
                message: `External file not found: ${imp.path}`,
                startLineNumber: imp.pathStartLine + 1,
                startColumn: imp.pathStartColumn + 1,
                endLineNumber: imp.pathEndLine + 1,
                endColumn: imp.pathEndColumn + 1,
              });
            }
          } catch {
            // Network error — can't verify, show warning
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Cannot verify external file: ${imp.path}`,
              startLineNumber: imp.pathStartLine + 1,
              startColumn: imp.pathStartColumn + 1,
              endLineNumber: imp.pathEndLine + 1,
              endColumn: imp.pathEndColumn + 1,
            });
          }
          continue;
        }

        // Project-relative or @/ import
        if (!projectHandle) continue; // Can't validate without a project

        const resolved = resolveImportPath(filePath, imp.path);
        if (!resolved) continue;

        try {
          await getFileHandleFromPath(projectHandle, resolved);
          // File exists — no squiggle
        } catch {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `File not found: ${resolved}`,
            startLineNumber: imp.pathStartLine + 1,
            startColumn: imp.pathStartColumn + 1,
            endLineNumber: imp.pathEndLine + 1,
            endColumn: imp.pathEndColumn + 1,
          });
        }
      }

      // Discard if a newer run overtook us
      if (currentRunId !== runIdRef.current) return;

      // Set markers on the first model (Monaco has one model for our editor)
      const models = monaco.editor.getModels();
      if (models.length > 0) {
        monaco.editor.setModelMarkers(models[0], OWNER, markers);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [monaco, code, filePath, projectHandle, lspClientRef]);
}
