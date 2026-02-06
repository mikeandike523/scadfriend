/**
 * Extracts OpenSCAD include/use imports of other .scad files.
 */
export function extractImports(code: string): string[] {
  const regex = /(include|use)\s*<([^>]+)>/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    const imp = match[2];
    imports.push(imp);
  }
  return imports;
}

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

/**
 * Extracts STL file imports via import("*.stl") calls in OpenSCAD code.
 */
export function extractStlImports(code: string): string[] {
  const regex = /import\s*\(\s*["']([^"']+\.stl)["']\s*\)/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    const imp = match[1];
    imports.push(imp);
  }
  return imports;
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

export function rewriteProjectImportsForVm(
  code: string,
  currentRelPath: string
): string {
  const rewritePath = (imp: string) =>
    resolveProjectImportPathForVm(currentRelPath, imp) ?? imp;

  const includeUseRegex = /(include|use)\s*<([^>]+)>/g;
  const stlImportRegex = /import\s*\(\s*["']([^"']+\.stl)["']\s*\)/g;

  let out = code.replace(includeUseRegex, (match, kw, imp) => {
    const rewritten = rewritePath(imp);
    if (!rewritten || rewritten === imp) return match;
    return `${kw} <${rewritten}>`;
  });

  out = out.replace(stlImportRegex, (match, imp) => {
    const rewritten = rewritePath(imp);
    if (!rewritten || rewritten === imp) return match;
    return match.replace(imp, rewritten);
  });

  return out;
}

async function getFileHandleFromPath(
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

/**
 * Collects imported files (both .scad and .stl) recursively from a root directory.
 * Returns a map from relative path to file content (string for .scad, Uint8Array for .stl).
 */
export async function collectImports(
  root: FileSystemDirectoryHandle,
  filePath: string,
  visited = new Set<string>(),
  external = new Set<string>()
): Promise<{
  files: Record<string, string | Uint8Array>;
  externalImports: string[];
}> {
  const handle = await getFileHandleFromPath(root, filePath);
  const file = await handle.getFile();
  const text = await file.text();
  const result: Record<string, string | Uint8Array> = {};

  // Handle .scad include/use imports
  const imports = extractImports(text);
  for (const imp of imports) {
    if (imp.startsWith("/")) {
      external.add(normalizeAbsolutePath(imp));
      continue;
    }

    // resolved path for project-relative imports
    const resolved = resolveImportPath(filePath, imp);
    if (!resolved) continue;
    if (visited.has(resolved)) continue;
    visited.add(resolved);

    const childHandle = await getFileHandleFromPath(root, resolved);
    const childFile = await childHandle.getFile();
    const childText = await childFile.text();
    result[resolved] = childText;

    const deeper = await collectImports(root, resolved, visited, external);
    Object.assign(result, deeper.files);
  }

  // Handle .stl binary imports via import("*.stl")
  const stlImps = extractStlImports(text);
  for (const imp of stlImps) {
    if (imp.startsWith("/")) {
      external.add(normalizeAbsolutePath(imp));
      continue;
    }

    const resolved = resolveImportPath(filePath, imp);
    if (!resolved) continue;
    if (visited.has(resolved)) continue;
    visited.add(resolved);

    const childHandle = await getFileHandleFromPath(root, resolved);
    const childFile = await childHandle.getFile();
    const buf = new Uint8Array(await childFile.arrayBuffer());
    result[resolved] = buf;
    // No deeper imports from binary files
  }

  return { files: result, externalImports: Array.from(external) };
}
