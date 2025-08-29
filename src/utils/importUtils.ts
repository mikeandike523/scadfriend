export function extractImports(code: string): string[] {
  const regex = /(include|use)\s*<([^>]+)>/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[2]);
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

export async function collectImports(
  root: FileSystemDirectoryHandle,
  filePath: string,
  visited = new Set<string>()
): Promise<Record<string, string>> {
  const handle = await getFileHandleFromPath(root, filePath);
  const file = await handle.getFile();
  const text = await file.text();
  const imports = extractImports(text);
  const result: Record<string, string> = {};
  for (const imp of imports) {
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
  return result;
}

