import {
  cacheMkdir,
  cacheWriteFile,
  createFsCache,
  splitPath,
  type FsCacheNode,
} from "./fsSnapshot";

export type FsWriteCache = FsCacheNode;
export const createFsWriteCache = createFsCache;

const ensureDirectoryHandle = async (
  root: FileSystemDirectoryHandle,
  parts: string[],
  cache?: FsWriteCache
): Promise<FileSystemDirectoryHandle> => {
  let dir = root;
  const created: string[] = [];
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
    created.push(part);
    if (cache) cacheMkdir(cache, created);
  }
  return dir;
};

export const ensureDir = async (
  root: FileSystemDirectoryHandle,
  relPath: string,
  cache?: FsWriteCache
): Promise<void> => {
  const parts = splitPath(relPath);
  if (!parts.length) return;
  await ensureDirectoryHandle(root, parts, cache);
};

export const writeTextFile = async (
  root: FileSystemDirectoryHandle,
  relPath: string,
  text: string,
  cache?: FsWriteCache
): Promise<void> => {
  const parts = splitPath(relPath);
  const dirParts = parts.slice(0, -1);
  const filename = parts[parts.length - 1];
  if (!filename) return;
  const dir = await ensureDirectoryHandle(root, dirParts, cache);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
  if (cache) cacheWriteFile(cache, parts, text);
};
