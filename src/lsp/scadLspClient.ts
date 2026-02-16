import type {
  LspRequest,
  LspResponse,
  ScadImport,
  ScadSymbol,
  ScadSymbolReference,
} from "./scadLspProtocol";

export class ScadLspClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  private _ready: Promise<void>;

  constructor() {
    this.worker = new Worker(
      new URL("./scadLsp.worker.ts", import.meta.url),
      { type: "module" }
    );

    this._ready = new Promise<void>((resolve) => {
      const onReady = (event: MessageEvent<LspResponse>) => {
        if (event.data.type === "ready") {
          this.worker.removeEventListener("message", onReady);
          resolve();
        }
      };
      this.worker.addEventListener("message", onReady);
    });

    this.worker.addEventListener("message", (event: MessageEvent<LspResponse>) => {
      const msg = event.data;
      if (msg.type === "ready") return;

      const id = msg.id;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);

      if (msg.type === "error") {
        entry.reject(new Error(msg.message));
      } else if (msg.type === "parseResult") {
        entry.resolve(msg.symbols);
      } else if (msg.type === "referencesResult") {
        entry.resolve(msg.references);
      } else if (msg.type === "importsResult") {
        entry.resolve(msg.imports);
      }
    });
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  parse(text: string): Promise<ScadSymbol[]> {
    return this.send({ type: "parse", id: 0, text }) as Promise<ScadSymbol[]>;
  }

  findReferences(text: string, name: string): Promise<ScadSymbolReference[]> {
    return this.send({ type: "findReferences", id: 0, text, name }) as Promise<
      ScadSymbolReference[]
    >;
  }

  extractImports(text: string): Promise<ScadImport[]> {
    return this.send({ type: "extractImports", id: 0, text }) as Promise<
      ScadImport[]
    >;
  }

  private send(request: LspRequest): Promise<unknown> {
    const id = this.nextId++;
    request.id = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  dispose() {
    this.worker.terminate();
    for (const entry of this.pending.values()) {
      entry.reject(new Error("Worker terminated"));
    }
    this.pending.clear();
  }
}
