import { useEffect, useRef } from "react";
import { useMonaco } from "@monaco-editor/react";
import { ScadLspClient } from "./scadLspClient";
import { registerOpenSCADProviders } from "./scadMonacoProviders";

export function useOpenSCADLsp() {
  const monaco = useMonaco();
  const clientRef = useRef<ScadLspClient | null>(null);
  const disposablesRef = useRef<{ dispose(): void }[]>([]);

  useEffect(() => {
    if (!monaco) return;

    const client = new ScadLspClient();
    clientRef.current = client;

    client.ready.then(() => {
      // Only register if we haven't been cleaned up
      if (clientRef.current !== client) return;
      disposablesRef.current = registerOpenSCADProviders(monaco, client);
    });

    return () => {
      clientRef.current = null;
      for (const d of disposablesRef.current) {
        d.dispose();
      }
      disposablesRef.current = [];
      client.dispose();
    };
  }, [monaco]);

  return clientRef;
}
