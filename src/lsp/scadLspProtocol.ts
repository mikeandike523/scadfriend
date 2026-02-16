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

export type LspRequest = ParseRequest | FindReferencesRequest;

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

export type LspResponse =
  | ReadyResponse
  | ParseResultResponse
  | ReferencesResultResponse
  | ErrorResponse;
