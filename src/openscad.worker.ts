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
 * Detects `include` or `use` statements whose path begins with "/SFLibs/"
 *
 * Returns an array of paths (prefix not included)
 *
 * Note:
 *
 * The relevant syntax in OpenSCAD is:
 *
 * include </SFLibs/library.scad>; or
 * use </SFLibs/library.scad>;
 *
 * @param code - OpenSCAD source code
 */
function detectSFLibsInclusions(code: string): string[] {
  const regex = /(include|use)\s+<\s*\/SFLibs\/([^>]+)>/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    matches.push(match[2]);
  }

  return matches;
}

async function grabSFLibFile(path: string) {
  const url = "/SFLibs/" + path;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Failed to load SFLib file: ${url}, file not found.`);
    }
    throw new Error(
      `Failed to load SFLib file: ${url}, status: ${response.status}`
    );
  }
  return await response.text();
}

async function addSFLibs(instance: OpenSCAD, paths: string[]) {
  const fs = instance.FS as FS;
  fs.mkdir("/SFLibs");
  const alreadyCreatedFolders = new Set<string>();
  for (const path of paths) {
    const segments = path.split("/");
    if (segments.length === 0) {
      continue;
    }
    if (alreadyCreatedFolders.has(path)) continue;
    alreadyCreatedFolders.add(path);
    if (segments.length === 1) {
      const code = await grabSFLibFile(path);
      console.log(code)
      fs.writeFile("/SFLibs/" + path, code);
    } else {
      const priorFolders: string[] = [];
      for (let i = 0; i < segments.length - 1; i++) {
        const segmentsAcc = segments.slice(0, i + 1).join("/");
        priorFolders.push(segmentsAcc);
      }
      for (const folder of priorFolders) {
        if (alreadyCreatedFolders.has(folder)) continue;
        fs.mkdir("/SFLibs/" + folder);
        alreadyCreatedFolders.add(folder);
      }
      const code = await grabSFLibFile(path);
      fs.writeFile("/SFLibs/" + path, code);
    }
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
  } = data; // Default to Manifold if not specified

  try {
    sendLog(partName, "Initializing OpenSCAD...");
    // Load the WASM module. (Assuming your OpenSCAD module returns a promise.)
    const instance = await oscadUtil.createInstance({
      fonts,
      mcad,
    });

    const sflibInclusions = detectSFLibsInclusions(part.ownSourceCode);

    console.log("SFLibs: ", sflibInclusions);

    await addSFLibs(instance,sflibInclusions);

    sendLog(partName, "OpenSCAD initialized.");

    sendLog(partName, "Writing input file...");
    instance.FS.writeFile("/input.scad", part.ownSourceCode);

    console.log(part.ownSourceCode.split('\n').map((l,i)=>{
      return `${i+1}. ${l}`
    }).join('\n'))

    sendLog(partName, "Input file written.");

    sendLog(partName, `Performing render with ${backend} backend...`);
    const args = [
      "/input.scad",
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
    console.error(err);
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error",
      partName,
      error: toSerializableObject(err, {
        enumerableOnly: false,
      }),
    } as ErrorMessage);
  }
};
