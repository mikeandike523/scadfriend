/** Kind of an OpenSCAD symbol. */
export type ScadSymbolKind = "module" | "function" | "variable";

/** A symbol extracted from an OpenSCAD source file. */
export interface ScadSymbol {
  name: string;
  kind: ScadSymbolKind;
  /** Parameter names (empty for variables). */
  parameters: string[];
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** A reference to a symbol (identifier occurrence). */
export interface ScadSymbolReference {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** An import/include/use/surface directive extracted from OpenSCAD source. */
export interface ScadImport {
  kind: "include" | "use" | "import" | "surface";
  /** Raw path string from source (e.g. "MCAD/nuts.scad", "@/lib/foo.scad"). */
  path: string;
  /** Position of the full statement (for context). */
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  /** Position of just the path portion (for squiggle underline). */
  pathStartLine: number;
  pathStartColumn: number;
  pathEndLine: number;
  pathEndColumn: number;
}

// ---- Request types ----

interface ParseRequest {
  type: "parse";
  id: number;
  text: string;
}

interface FindReferencesRequest {
  type: "findReferences";
  id: number;
  text: string;
  name: string;
}

interface ExtractImportsRequest {
  type: "extractImports";
  id: number;
  text: string;
}

export type LspRequest =
  | ParseRequest
  | FindReferencesRequest
  | ExtractImportsRequest;

// ---- Response types ----

interface ReadyResponse {
  type: "ready";
}

interface ParseResultResponse {
  type: "parseResult";
  id: number;
  symbols: ScadSymbol[];
}

interface ReferencesResultResponse {
  type: "referencesResult";
  id: number;
  references: ScadSymbolReference[];
}

interface ErrorResponse {
  type: "error";
  id: number;
  message: string;
}

interface ImportsResultResponse {
  type: "importsResult";
  id: number;
  imports: ScadImport[];
}

export type LspResponse =
  | ReadyResponse
  | ParseResultResponse
  | ReferencesResultResponse
  | ImportsResultResponse
  | ErrorResponse;
