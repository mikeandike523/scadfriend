export type FsSnapshotFile = {
  type: "file";
  text: string;
};

export type FsSnapshotDir = {
  type: "dir";
  entries: { name: string; node: FsSnapshotNode }[];
};

export type FsSnapshotNode = FsSnapshotDir | FsSnapshotFile;

export type FsCacheNode = Map<string, FsCacheNode | FsSnapshotFile>;

export const createFsCache = (): FsCacheNode => new Map();

export const splitPath = (path: string): string[] =>
  path.split("/").filter(Boolean);

const ensureDir = (root: FsCacheNode, parts: string[]): FsCacheNode => {
  let node = root;
  for (const part of parts) {
    const existing = node.get(part);
    if (existing instanceof Map) {
      node = existing;
      continue;
    }
    const next: FsCacheNode = new Map();
    node.set(part, next);
    node = next;
  }
  return node;
};

export const cacheMkdir = (root: FsCacheNode, parts: string[]) => {
  ensureDir(root, parts);
};

export const cacheWriteFile = (
  root: FsCacheNode,
  parts: string[],
  text: string
) => {
  const dir = ensureDir(root, parts.slice(0, -1));
  const name = parts[parts.length - 1];
  if (!name) return;
  dir.set(name, { type: "file", text });
};

export const cacheToSnapshot = (root: FsCacheNode): FsSnapshotDir => {
  const toNode = (node: FsCacheNode): FsSnapshotDir => ({
    type: "dir",
    entries: Array.from(node.entries()).map(([name, value]) => {
      if (value instanceof Map) {
        return { name, node: toNode(value) };
      }
      return { name, node: value };
    }),
  });
  return toNode(root);
};

export class FsMirror {
  private cache: FsCacheNode;

  constructor() {
    this.cache = createFsCache();
  }

  mkdir(path: string | string[]) {
    const parts = Array.isArray(path) ? path : splitPath(path);
    if (!parts.length) return;
    cacheMkdir(this.cache, parts);
  }

  writeFile(path: string | string[], text: string) {
    const parts = Array.isArray(path) ? path : splitPath(path);
    if (!parts.length) return;
    cacheWriteFile(this.cache, parts, text);
  }

  toSnapshot(): FsSnapshotDir {
    return cacheToSnapshot(this.cache);
  }
}

export const formatSnapshotTree = (
  node: FsSnapshotNode,
  indent: string = ""
): string => {
  if (node.type === "file") return "";
  const lines: string[] = [];
  for (const entry of node.entries) {
    lines.push(`${indent}${entry.name}`);
    if (entry.node.type === "dir") {
      lines.push(formatSnapshotTree(entry.node, `${indent}\t`));
    }
  }
  return lines.join("\n");
};
