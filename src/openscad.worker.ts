import { type FS } from "./openscad";
import oscadUtil from "./oscadUtil";
import { type OpenSCAD } from "./openscad";


import {
  SerializableObject,
  toSerializableObject,
} from "./utils/serialization";

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
  path: string;
  /**
   * Map of project-relative paths to file contents. .scad files as string, .stl files as Uint8Array.
   */
  extraFiles?: Record<string, string | Uint8Array>;
  /**
   * Absolute imports (e.g. /SFLibs/foo.scad) to fetch and place in the VM FS.
   */
  externalImports?: string[];
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

/**
 *
function extractImports(code: string): string[] {
  const regex = /(include|use)\s*<([^>]+)>/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[2]);
  }
  return imports;
}

function extractStlImports(code: string): string[] {
  const regex = /import\s*\(\s*["']([^"']+\.stl)["']\s*\)/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function normalizePathParts(parts: string[]): string {
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function normalizeAbsolutePath(path: string): string {
  const normalized = normalizePathParts(path.split("/"));
  return normalized ? "/" + normalized : "/";
}

function resolveAbsoluteImportPath(
  currentAbsPath: string,
  importPath: string
): string {
  if (importPath.startsWith("/")) {
    return normalizeAbsolutePath(importPath);
  }
  const baseParts = currentAbsPath.split("/").slice(0, -1);
  const importParts = importPath.split("/");
  return "/" + normalizePathParts([...baseParts, ...importParts]);
}

function collectAbsoluteImportsFromCode(
  code: string,
  currentAbsPath?: string
): string[] {
  const out: string[] = [];
  const pushImport = (imp: string) => {
    if (imp.startsWith("@/")) return;
    if (imp.startsWith("/")) {
      out.push(normalizeAbsolutePath(imp));
      return;
    }
    if (currentAbsPath) {
      out.push(resolveAbsoluteImportPath(currentAbsPath, imp));
    }
  };

  for (const imp of extractImports(code)) pushImport(imp);
  for (const imp of extractStlImports(code)) pushImport(imp);
  return out;
}

async function grabExternalFile(path: string): Promise<string | Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Failed to load external file: ${path}, not found.`);
    }
    throw new Error(
      `Failed to load external file: ${path}, status: ${response.status}`
    );
  }

  if (path.toLowerCase().endsWith(".stl")) {
    return new Uint8Array(await response.arrayBuffer());
  }

  return await response.text();
}

async function addExternalFiles(
  instance: OpenSCAD,
  paths: string[],
  log?: (message: string) => void
) {
  if (!paths.length) return;
  const fs = instance.FS as FS;
  const pending = paths.map((p) => normalizeAbsolutePath(p));
  const fetched = new Set<string>();

  while (pending.length) {
    const path = normalizeAbsolutePath(pending.pop() as string);
    if (fetched.has(path)) continue;
    fetched.add(path);

    log?.(`Fetching external import: ${path}`);
    const content = await grabExternalFile(path);
    writeFileWithDirs(fs, path, content);

    if (typeof content === "string") {
      const more = collectAbsoluteImportsFromCode(content, path);
      for (const imp of more) {
        if (!fetched.has(imp)) pending.push(imp);
      }
    }
  }
}

function writeFileWithDirs(fs: FS, path: string, content: string | Uint8Array) {
  const segments = path.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < segments.length - 1; i++) {
    current += "/" + segments[i];
    try {
      fs.mkdir(current);
    } catch {
      /* already exists */
    }
  }
  // Write text or binary content
  fs.writeFile(path, content as any);
}

/**
 * Write extra project files into the OpenSCAD VM file system.
 * Supports .scad files as strings and .stl files as Uint8Array binaries.
 */
function addExtraFiles(fs: FS, files?: Record<string, string | Uint8Array>) {
  if (!files) return;
  for (const [p, c] of Object.entries(files)) {
    writeFileWithDirs(fs, "/" + p, c);
  }
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

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const data = event.data;
  if (data.command !== "render") return;
  const {
    partName,
    part,
    backend = "Manifold",
    fonts = true,
    mcad = true,
    path,
    extraFiles,
    externalImports,
  } = data; // Default to Manifold if not specified

  try {
    sendLog(partName, "Initializing OpenSCAD...");
    // Load the WASM module. (Assuming your OpenSCAD module returns a promise.)
    const instance = await oscadUtil.createInstance({
      fonts,
      mcad,
      print: (text) => sendLog(partName, text),
      printErr: (text) => sendLog(partName, `ERR: ${text}`),
    });

    const initialExternalImports = new Set<string>(externalImports ?? []);
    for (const imp of collectAbsoluteImportsFromCode(part.ownSourceCode)) {
      initialExternalImports.add(imp);
    }
    await addExternalFiles(
      instance,
      Array.from(initialExternalImports),
      (message) => sendLog(partName, message)
    );

    sendLog(partName, "OpenSCAD initialized.");

    sendLog(partName, "Writing input file...");
    addExtraFiles(instance.FS as FS, extraFiles);
    writeFileWithDirs(instance.FS as FS, "/" + path, part.ownSourceCode);

    sendLog(partName, "Input file written.");

    sendLog(partName, `Performing render with ${backend} backend...`);
    const args = [
      "/" + path,
      "--viewall",
      "--autocenter",
      "--render",
      `--backend=${backend}`, // Use the specified backend
      "--export-format=binstl",
    ];
    const filename = `part_${partName}.stl`;
    args.push("-o", filename);
    instance.callMain(args);
    sendLog(partName, "Render performed.");

    sendLog(partName, "Reading output...");
    // Read the output file as a binary Uint8Array.
    const output = instance.FS.readFile("/" + filename, { encoding: "binary" });
    sendLog(partName, "Output read.");
    // Post back the final result.
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
