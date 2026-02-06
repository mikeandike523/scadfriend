import { formatSnapshotTree, type FsSnapshotNode } from "./fsSnapshot";
import { createFsWriteCache, ensureDir, writeTextFile } from "./fsaWriteUtils";

const sanitizeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "part";

const timestampId = () =>
  new Date().toISOString().replace(/[:.]/g, "-");

export const saveVmDebugSnapshot = async (
  root: FileSystemDirectoryHandle,
  partName: string,
  snapshot: FsSnapshotNode
): Promise<void> => {
  const cache = createFsWriteCache();
  const debugDir = `.debug/${timestampId()}_${sanitizeName(partName)}`;
  const treeText = formatSnapshotTree(snapshot);
  const vmRoot = `${debugDir}/vm`;

  const joinRel = (base: string, name: string) =>
    base ? `${base}/${name}` : name;

  const materialize = async (node: FsSnapshotNode, relPath: string) => {
    if (node.type === "file") {
      await writeTextFile(root, relPath, node.text, cache);
      return;
    }
    await ensureDir(root, relPath, cache);
    for (const entry of node.entries) {
      await materialize(entry.node, joinRel(relPath, entry.name));
    }
  };

  await materialize(snapshot, vmRoot);
  await writeTextFile(root, `${debugDir}/tree.txt`, treeText, cache);
  await writeTextFile(
    root,
    `${debugDir}/meta.json`,
    JSON.stringify(
      {
        partName,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    ),
    cache
  );
};
