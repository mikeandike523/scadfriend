import { type FS } from "./openscad";
import oscadUtil from "./oscadUtil";

import {
  SerializableObject,
  toSerializableObject,
} from "./utils/serialization";
import { buildPathTree, formatPathTree } from "./utils/pathTree";
import { type FsSnapshotNode, FsMirror } from "./utils/fsSnapshot";

// (Optional) Define the interface for an OpenSCAD part if not imported.
export interface OpenSCADPart {
  ownSourceCode: string;
  color?: string;
  // ... other properties as needed.
  exported: boolean;
}

interface RenderRequest {
  command: "render";
  partName: string;
  part: OpenSCADPart;
  backend?: Backend;
  fonts?: boolean;
  mcad?: boolean;
  /**
   * Pre-assembled VM filesystem: maps VM paths → file contents.
   * All path rewriting and external fetching is done on the main thread.
   */
  vmFiles: Record<string, string | Uint8Array>;
  /** VM path for the main entry file. */
  vmMainPath: string;
}

interface LogMessage {
  type: "log";
  partName: string;
  message: string;
}

interface ResultMessage {
  type: "result";
  partName: string;
  stl: Uint8Array;
}

interface ErrorMessage {
  type: "error";
  partName: string;
  error: SerializableObject;
}

interface DebugFsMessage {
  type: "debugfs";
  partName: string;
  snapshot: FsSnapshotNode;
}

function writeFileWithDirs(
  fs: FS,
  path: string,
  content: string | Uint8Array,
  mirror?: FsMirror
) {
  const segments = path.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < segments.length - 1; i++) {
    current += "/" + segments[i];
    try {
      fs.mkdir(current);
    } catch {
      /* already exists */
    }
    mirror?.mkdir(current);
  }
  // Write text or binary content
  fs.writeFile(path, content as any);
  const text =
    typeof content === "string"
      ? content
      : `<<binary ${content.byteLength} bytes>>`;
  mirror?.writeFile(segments, text);
}

// Manifold:  Ultra Fast
// Works in most cases perfectly
// Good for render

// CGAL
// Very slow, but much more guaranteed to be accurate
// Good for export
type Backend = "CGAL" | "Manifold";

// A helper to send a log message back to the main thread.
const sendLog = (partName: string, message: string) => {
  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "log",
    partName,
    message,
  } as LogMessage);
};

const WRITE_VM_DEBUG =
  typeof __WRITE_VM_DEBUG__ !== "undefined" && __WRITE_VM_DEBUG__;

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const data = event.data;
  if (data.command !== "render") return;
  const {
    partName,
    part,
    backend = "Manifold",
    fonts = true,
    mcad = true,
    vmFiles,
    vmMainPath,
  } = data;

  try {
    sendLog(partName, "Initializing OpenSCAD...");
    const instance = await oscadUtil.createInstance({
      fonts,
      mcad,
      print: (text) => sendLog(partName, text),
      printErr: (text) => sendLog(partName, `ERR: ${text}`),
    });
    const mirror = WRITE_VM_DEBUG ? new FsMirror() : undefined;

    sendLog(partName, "OpenSCAD initialized.");

    // Write all pre-assembled VM files
    sendLog(partName, "Writing VM files...");
    const writtenPaths: string[] = [];
    for (const [vmPath, content] of Object.entries(vmFiles)) {
      writeFileWithDirs(instance.FS as FS, vmPath, content, mirror);
      writtenPaths.push(vmPath);
    }

    if (writtenPaths.length) {
      const tree = buildPathTree(writtenPaths);
      const treeText = formatPathTree(tree);
      sendLog(partName, `VM files written:\n${treeText}`);
    }

    sendLog(partName, "VM files written.");

    if (mirror) {
      try {
        const snapshot = mirror.toSnapshot();
        (self as DedicatedWorkerGlobalScope).postMessage({
          type: "debugfs",
          partName,
          snapshot,
        } as DebugFsMessage);
      } catch (err) {
        sendLog(partName, `Failed to snapshot VM FS: ${String(err)}`);
      }
    }

    sendLog(partName, `Performing render with ${backend} backend...`);
    const args = [
      vmMainPath,
      "--viewall",
      "--autocenter",
      "--render",
      `--backend=${backend}`,
      "--export-format=binstl",
    ];
    const filename = `part_${partName}.stl`;
    args.push("-o", filename);
    instance.callMain(args);
    sendLog(partName, "Render performed.");

    sendLog(partName, "Reading output...");
    const output = instance.FS.readFile("/" + filename, { encoding: "binary" });
    sendLog(partName, "Output read.");
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "result",
      partName,
      stl: output,
    } as ResultMessage);
  } catch (err: unknown) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error",
      partName,
      error: toSerializableObject(err, {
        enumerableOnly: false,
      }),
    } as ErrorMessage);
  }
};
