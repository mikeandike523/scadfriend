import { useEffect, useState } from "react";
import { Button, Div, Ul, Li } from "style-props-html";
import { css } from "@emotion/react";

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

interface FileNodeViewProps {
  node: FileNode;
  onOpen: (path: string, handle: FileSystemFileHandle) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
}
function FileNodeView({ node, onOpen, expandedDirs, toggleDir }: FileNodeViewProps) {
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
          css={css`
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          `}
          onClick={() => onOpen(node.path, node.handle as FileSystemFileHandle)}
        >
          {node.name}
        </Button>
      </Li>
    );
  }
  const isExpanded = expandedDirs.has(node.path);
  return (
    <Li>
      <Div
        css={css`
          display: flex;
          align-items: center;
          padding: 4px 0;
        `}
      >
        {node.children && node.children.length > 0 ? (
          <Button
            background="none"
            border="none"
            padding="0 4px"
            onClick={() => toggleDir(node.path)}
          >
            {isExpanded ? "▼" : "▶"}
          </Button>
        ) : (
          <Div width="16px" />
        )}
        <Div
          fontWeight="bold"
          userSelect="none"
          cursor={node.children && node.children.length > 0 ? "pointer" : "default"}
          onClick={() => node.children && node.children.length > 0 && toggleDir(node.path)}
        >
          {node.name}
        </Div>
      </Div>
      {isExpanded && node.children && node.children.length > 0 && (
        <Ul marginLeft="16px">
          {node.children.map((child) => (
            <FileNodeView
              key={child.path}
              node={child}
              onOpen={onOpen}
              expandedDirs={expandedDirs}
              toggleDir={toggleDir}
            />
          ))}
        </Ul>
      )}
    </Li>
  );
}

// collect all existing directory paths in the tree
function collectDirPaths(nodes: FileNode[]): Set<string> {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.kind === "directory") {
      paths.add(node.path);
      if (node.children) {
        for (const childPath of collectDirPaths(node.children)) {
          paths.add(childPath);
        }
      }
    }
  }
  return paths;
}

export default function FileBrowser({
  rootHandle,
  onOpenFile,
}: {
  rootHandle: FileSystemDirectoryHandle;
  onOpenFile: (path: string, handle: FileSystemFileHandle) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // read directory tree when root changes
  useEffect(() => {
    readDirectory(rootHandle).then(setTree);
  }, [rootHandle]);

  // garbage collect stale expanded entries when tree updates
  useEffect(() => {
    const validDirs = collectDirPaths(tree);
    setExpandedDirs((prev) => {
      const next = new Set<string>();
      for (const path of prev) {
        if (validDirs.has(path)) {
          next.add(path);
        }
      }
      return next;
    });
  }, [tree]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <Div padding="8px" overflow="auto" height="100%">
      <Ul listStyleType="none" padding="0" margin="0">
        {tree.map((node) => (
          <FileNodeView
            key={node.path}
            node={node}
            onOpen={onOpenFile}
            expandedDirs={expandedDirs}
            toggleDir={toggleDir}
          />
        ))}
      </Ul>
    </Div>
  );
}
