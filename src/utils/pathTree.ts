type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | symbol
  | bigint;

type Node<TLeaf extends Primitive> =
  | TLeaf
  | Map<string, Node<TLeaf>>;

export class Tree<TLeaf extends Primitive> {
  private root: Map<string, Node<TLeaf>> = new Map();

  insert(parts: string[], leaf: TLeaf): this {
    let node = this.root;

    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i];
      const isLast = i === parts.length - 1;
      const existing = node.get(segment);

      if (isLast) {
        if (existing === undefined) node.set(segment, leaf);
        return this;
      }

      if (!(existing instanceof Map)) {
        const next: Map<string, Node<TLeaf>> = new Map();
        node.set(segment, next);
        node = next;
      } else {
        node = existing;
      }
    }

    return this;
  }

  get value(): Map<string, Node<TLeaf>> {
    return this.root;
  }
}

// --- path wrapper helpers ---

export const splitAbsPath = (path: string): string[] =>
  path.split("/").filter(Boolean);

export const buildPathTree = (paths: string[]) => {
  const t = new Tree<null>();
  for (const p of paths) t.insert(splitAbsPath(p), null);
  return t;
};

export const formatPathTree = (
  tree: Tree<null> | Map<string, Node<null>>,
  indent: string = ""
): string => {
  const root = tree instanceof Tree ? tree.value : tree;
  const lines: string[] = [];
  for (const [key, value] of root.entries()) {
    lines.push(`${indent}${key}`);
    if (value instanceof Map) {
      lines.push(formatPathTree(value, `${indent}\t`));
    }
  }
  return lines.join("\n");
};
