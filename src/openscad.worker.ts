

import { SerializableObject, toSerializableObject } from "./utils/serialization"
import oscadUtil from "./oscadUtil"


// (Optional) Define the interface for an OpenSCAD part if not imported.
export interface OpenSCADPart {
  ownSourceCode: string;
  color?: string;
  // ... other properties as needed.
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
    sendLog(partName, "OpenSCAD initialized.");

    sendLog(partName, "Writing input file...");
    instance.FS.writeFile("/input.scad", part.ownSourceCode);
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
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error",
      partName,
      error: toSerializableObject(err,{
        enumerableOnly: false,
      })
    } as ErrorMessage);
  }
};
