/**
 * Extracts OpenSCAD include/use imports of other .scad files.
 * Completely ignores imports that begin with /SFLibs.
 */
export function extractImports(code: string): string[] {
  const regex = /(include|use)\s*<([^>]+)>/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    const imp = match[2];
    // Ignore imports starting with /SFLibs
    if (!imp.startsWith("/SFLibs")) {
      imports.push(imp);
    }
  }
  return imports;
}

export function resolveImportPath(currentPath: string, importPath: string): string {
  const baseParts = currentPath.split("/").slice(0, -1);
  const importParts = importPath.split("/");
  const combined = [...baseParts, ...importParts];
  const stack: string[] = [];
  for (const part of combined) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
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
    // Ignore imports starting with /SFLibs
    if (!imp.startsWith("/SFLibs")) {
      imports.push(imp);
    }
  }
  return imports;
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
 * Completely ignores imports that begin with /SFLibs.
 */
export async function collectImports(
  root: FileSystemDirectoryHandle,
  filePath: string,
  visited = new Set<string>()
): Promise<Record<string, string | Uint8Array>> {
  const handle = await getFileHandleFromPath(root, filePath);
  const file = await handle.getFile();
  const text = await file.text();
  const result: Record<string, string | Uint8Array> = {};

  // Handle .scad include/use imports
  const imports = extractImports(text);
  for (const imp of imports) {
    // resolved path for relative imports
    const resolved = resolveImportPath(filePath, imp);
    if (visited.has(resolved)) continue;
    visited.add(resolved);

    const childHandle = await getFileHandleFromPath(root, resolved);
    const childFile = await childHandle.getFile();
    const childText = await childFile.text();
    result[resolved] = childText;

    const deeper = await collectImports(root, resolved, visited);
    Object.assign(result, deeper);
  }

  // Handle .stl binary imports via import("*.stl")
  const stlImps = extractStlImports(text);
  for (const imp of stlImps) {
    const resolved = resolveImportPath(filePath, imp);
    if (visited.has(resolved)) continue;
    visited.add(resolved);

    const childHandle = await getFileHandleFromPath(root, resolved);
    const childFile = await childHandle.getFile();
    const buf = new Uint8Array(await childFile.arrayBuffer());
    result[resolved] = buf;
    // No deeper imports from binary files
  }

  return result;
}