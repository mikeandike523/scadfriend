import { useEffect, useState } from "react";
import { Button, Div, Ul, Li } from "style-props-html";

export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "directory";
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  children?: FileNode[];
};

async function readDirectory(
  handle: FileSystemDirectoryHandle,
  basePath = ""
): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  for await (const [name, entry] of (handle as any).entries()) {
    const path = basePath ? `${basePath}/${name}` : name;
    if (entry.kind === "file") {
      nodes.push({ name, path, kind: "file", handle: entry as FileSystemFileHandle });
    } else if (entry.kind === "directory") {
      const children = await readDirectory(entry as FileSystemDirectoryHandle, path);
      nodes.push({ name, path, kind: "directory", handle: entry as FileSystemDirectoryHandle, children });
    }
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  return nodes;
}

function FileNodeView({
  node,
  onOpen,
}: {
  node: FileNode;
  onOpen: (path: string, handle: FileSystemFileHandle) => void;
}) {
  if (node.kind === "file") {
    return (
      <Li>
        <Button
          display="block"
          width="100%"
          textAlign="left"
          background="none"
          border="none"
          padding="4px"
          onClick={() => onOpen(node.path, node.handle as FileSystemFileHandle)}
        >
          {node.name}
        </Button>
      </Li>
    );
  }
  return (
    <Li>
      <Div fontWeight="bold" padding="4px 0">
        {node.name}
      </Div>
      {node.children && node.children.length > 0 && (
        <Ul marginLeft="16px">
          {node.children.map((child) => (
            <FileNodeView key={child.path} node={child} onOpen={onOpen} />
          ))}
        </Ul>
      )}
    </Li>
  );
}

export default function FileBrowser({
  rootHandle,
  onOpenFile,
}: {
  rootHandle: FileSystemDirectoryHandle;
  onOpenFile: (path: string, handle: FileSystemFileHandle) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);

  useEffect(() => {
    readDirectory(rootHandle).then(setTree);
  }, [rootHandle]);

  return (
    <Div padding="8px" overflow="auto" height="100%">
      <Ul listStyleType="none" padding="0" margin="0">
        {tree.map((node) => (
          <FileNodeView key={node.path} node={node} onOpen={onOpenFile} />
        ))}
      </Ul>
    </Div>
  );
}

