import type { ScadImport } from "../lsp/scadLspProtocol";
import type { ScadLspClient } from "../lsp/scadLspClient";

// ---- Path utilities (unchanged) ----

export function normalizePathParts(parts: string[]): string {
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

export function normalizeAbsolutePath(path: string): string {
  const normalized = normalizePathParts(path.split("/"));
  return normalized ? "/" + normalized : "/";
}

export function resolveImportPath(
  currentPath: string,
  importPath: string
): string | null {
  if (importPath.startsWith("@/")) {
    const importParts = importPath.slice(2).split("/");
    return normalizePathParts(importParts);
  }

  // Ignore non-project absolute paths (e.g. "/usr/..." or "/SFLibs/...")
  if (importPath.startsWith("/")) {
    return null;
  }

  const baseParts = currentPath.split("/").slice(0, -1);
  const importParts = importPath.split("/");
  return normalizePathParts([...baseParts, ...importParts]);
}

export function toVmProjectPath(relPath: string): string {
  const normalized = normalizePathParts(relPath.split("/"));
  return normalized ? "/@/" + normalized : "/@";
}

export function resolveProjectImportPathForVm(
  currentRelPath: string,
  importPath: string
): string | null {
  // Contract: "@/..." is the only project-root marker. Absolute "/..." imports are external.
  if (importPath.startsWith("/@/")) return importPath;
  if (importPath.startsWith("@/")) {
    const importParts = importPath.slice(2).split("/");
    const normalized = normalizePathParts(importParts);
    return normalized ? "/@/" + normalized : "/@";
  }
  if (importPath.startsWith("/")) {
    return importPath;
  }
  const baseParts = currentRelPath.split("/").slice(0, -1);
  const importParts = importPath.split("/");
  const normalized = normalizePathParts([...baseParts, ...importParts]);
  return normalized ? "/@/" + normalized : "/@";
}

// ---- Path rewriting for VM (improved: all import()/surface() formats) ----

export function rewriteProjectImportsForVm(
  code: string,
  currentRelPath: string
): string {
  const rewritePath = (imp: string) =>
    resolveProjectImportPathForVm(currentRelPath, imp) ?? imp;

  const includeUseRegex = /(include|use)\s*<([^>]+)>/g;
  // Match import("...") and surface("...") with any file extension
  const funcImportRegex =
    /(import|surface)\s*\(\s*["']([^"']+)["']/g;

  let out = code.replace(includeUseRegex, (match, kw, imp) => {
    const rewritten = rewritePath(imp);
    if (!rewritten || rewritten === imp) return match;
    return `${kw} <${rewritten}>`;
  });

  out = out.replace(funcImportRegex, (match, _fn, imp) => {
    const rewritten = rewritePath(imp);
    if (!rewritten || rewritten === imp) return match;
    return match.replace(imp, rewritten);
  });

  return out;
}

// ---- FSA helpers ----

export async function getFileHandleFromPath(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle> {
  const parts = path.split("/");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }
  return await dir.getFileHandle(parts[parts.length - 1]);
}

// ---- External file fetching (moved from render worker) ----

async function fetchExternalFile(
  path: string
): Promise<string | Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`External file not found: ${path}`);
    }
    throw new Error(`Failed to fetch external file: ${path} (${response.status})`);
  }

  const ext = path.split(".").pop()?.toLowerCase();
  const binaryExts = ["stl", "off", "amf", "3mf", "png"];
  if (ext && binaryExts.includes(ext)) {
    return new Uint8Array(await response.arrayBuffer());
  }
  return await response.text();
}

/**
 * Resolve a relative import path against an absolute external file path.
 * E.g. resolveExternalRelative("/SFLibs/lib/foo.scad", "bar.scad") → "/SFLibs/lib/bar.scad"
 */
function resolveExternalRelative(
  currentAbsPath: string,
  importPath: string
): string {
  if (importPath.startsWith("/")) {
    return normalizeAbsolutePath(importPath);
  }
  const baseParts = currentAbsPath.split("/").slice(0, -1);
  const importParts = importPath.split("/");
  return "/" + normalizePathParts([...baseParts, ...importParts]);
}

// ---- Known built-in prefixes (always available in VM, never need fetching) ----

/** Returns true if the import path refers to a built-in VM path that's always present. */
export function isBuiltinPath(importPath: string): boolean {
  const lower = importPath.toLowerCase();
  // MCAD/ bare prefix: resolved by OpenSCAD's built-in library search
  if (lower.startsWith("mcad/")) return true;
  // Absolute built-in paths
  if (lower.startsWith("/libraries/mcad/")) return true;
  if (lower.startsWith("/fonts/")) return true;
  return false;
}

// ---- Main collection + preparation (tree-sitter-based) ----

/**
 * Determines if an import refers to a binary file (no recursion needed).
 * include/use are always .scad text files that may have deeper imports.
 * import()/surface() reference geometry/data that don't have imports.
 */
function isRecursiveImport(imp: ScadImport): boolean {
  return imp.kind === "include" || imp.kind === "use";
}

/**
 * Determines if a file path is a text format (read as string).
 */
function isTextFilePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "scad" || ext === "dxf" || ext === "svg" || ext === "dat";
}

export interface VmPrepResult {
  /** Complete map of VM paths → file contents, ready to write into the VM FS. */
  vmFiles: Record<string, string | Uint8Array>;
  /** VM path for the main entry file. */
  vmMainPath: string;
}

/**
 * Collects all imports (recursively), fetches external files, rewrites paths
 * for the VM, and returns a ready-to-go vmFiles map.
 *
 * This replaces the old collectImports + worker-side addExternalFiles +
 * addExtraFiles + rewriting pipeline.
 */
export async function collectAndPrepareVmFiles(
  lspClient: ScadLspClient,
  root: FileSystemDirectoryHandle,
  mainFilePath: string,
  mainFileCode: string,
  log?: (msg: string) => void
): Promise<VmPrepResult> {
  const projectFiles: Record<string, string | Uint8Array> = {};
  const externalPaths = new Set<string>();
  const visited = new Set<string>();

  // --- Step 1: Recursively collect project imports ---

  async function collectProjectFile(filePath: string, text: string) {
    const imports = await lspClient.extractImports(text);
    for (const imp of imports) {
      const rawPath = imp.path;

      // Built-in paths (MCAD/, /libraries/MCAD/, /fonts/) — skip
      if (isBuiltinPath(rawPath)) continue;

      // External absolute import
      if (rawPath.startsWith("/")) {
        externalPaths.add(normalizeAbsolutePath(rawPath));
        continue;
      }

      // Project-relative resolution
      const resolved = resolveImportPath(filePath, rawPath);
      if (!resolved) continue;
      if (visited.has(resolved)) continue;
      visited.add(resolved);

      try {
        const handle = await getFileHandleFromPath(root, resolved);
        const file = await handle.getFile();

        if (isRecursiveImport(imp) || isTextFilePath(resolved)) {
          const childText = await file.text();
          projectFiles[resolved] = childText;
          // Recurse into .scad files for deeper imports
          if (isRecursiveImport(imp)) {
            await collectProjectFile(resolved, childText);
          }
        } else {
          projectFiles[resolved] = new Uint8Array(await file.arrayBuffer());
        }
      } catch {
        log?.(`Warning: Could not read project file: ${resolved}`);
      }
    }
  }

  await collectProjectFile(mainFilePath, mainFileCode);

  // --- Step 2: Fetch external files (recursively for .scad transitive imports) ---

  const fetchedExternal = new Set<string>();
  const pendingExternal = [...externalPaths];

  while (pendingExternal.length) {
    const absPath = normalizeAbsolutePath(pendingExternal.pop()!);
    if (fetchedExternal.has(absPath)) continue;
    if (isBuiltinPath(absPath)) continue;
    fetchedExternal.add(absPath);

    log?.(`Fetching external: ${absPath}`);
    try {
      const content = await fetchExternalFile(absPath);

      // For text .scad files, scan for transitive imports
      if (typeof content === "string") {
        const transImports = await lspClient.extractImports(content);
        for (const imp of transImports) {
          const p = imp.path;
          if (isBuiltinPath(p)) continue;
          // Skip @/ imports in external files (shouldn't appear, but be safe)
          if (p.startsWith("@/")) continue;
          const resolved = resolveExternalRelative(absPath, p);
          if (!fetchedExternal.has(resolved)) {
            pendingExternal.push(resolved);
          }
        }
      }

      // External files go directly to VM with their absolute path
      // (no rewriting needed — they're already at the right absolute path)
      // But we don't add them to vmFiles yet — we do that below
      projectFiles["__external__" + absPath] = content;
    } catch (err) {
      log?.(`Failed to fetch external: ${absPath}: ${err}`);
    }
  }

  // --- Step 3: Assemble vmFiles map ---

  const vmFiles: Record<string, string | Uint8Array> = {};

  // Project files: rewrite paths and map to /@/ VM paths
  for (const [relPath, content] of Object.entries(projectFiles)) {
    if (relPath.startsWith("__external__")) {
      // External file: use its absolute path directly in VM
      const absPath = relPath.slice("__external__".length);
      vmFiles[absPath] = content;
    } else {
      // Project file: rewrite imports and place under /@/
      const vmPath = toVmProjectPath(relPath);
      if (typeof content === "string") {
        vmFiles[vmPath] = rewriteProjectImportsForVm(content, relPath);
      } else {
        vmFiles[vmPath] = content;
      }
    }
  }

  // Main file: rewrite and place under /@/
  const vmMainPath = toVmProjectPath(mainFilePath);
  vmFiles[vmMainPath] = rewriteProjectImportsForVm(mainFileCode, mainFilePath);

  return { vmFiles, vmMainPath };
}

