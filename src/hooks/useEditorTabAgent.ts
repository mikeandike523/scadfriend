import {
  Dispatch,
  RefObject,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Encapsulates the necessary resources and included functionality of an editor tab.
 * The editor tab JSX component takes this as a props and uses it as an intermediary to interact with the
 * parent component and the rest of the application
 *
 * @remarks
 * It is not 100% clear the best practices for interfacing with monaco
 * So far I have simply tracked a state and onchange
 *
 * In the future I would like to test if a reference to the editor can be stored and then the content
 * queried on demand but since I haven't tested such in previous versions I do not yet know if it is possible
 * We'll stick with the simple solution for now
 *
 */
export interface EditorTabAgent {
  fileRef: RefObject<FileSystemFileHandle | null>;
  isNewFile: boolean;
  setIsNewFile: Dispatch<SetStateAction<boolean>>;
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
  lastLoadedCode: string | null;
  setLastLoadedCode: Dispatch<SetStateAction<string | null>>;
  filename: string | null;
  setFilename: Dispatch<SetStateAction<string | null>>;
  dirty: boolean;
  setDirty: Dispatch<SetStateAction<boolean>>;
  fileIsLoaded: boolean;
  setFileIsLoaded: Dispatch<SetStateAction<boolean>>;
}

export default function useEditorTabAgent(): EditorTabAgent {
  const fileRef = useRef<FileSystemFileHandle | null>(null);
  const [isNewFile, setIsNewFile] = useState(false);
  const [code, setCode] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastLoadedCode, setLastLoadedCode] = useState<string | null>(null);
  const [fileIsLoaded, setFileIsLoaded] = useState(false);

  useEffect(() => {
    if (fileIsLoaded && code !== lastLoadedCode) {
      setDirty(true);
    }
  }, [code, lastLoadedCode, fileIsLoaded]);

  return {
    lastLoadedCode,
    setLastLoadedCode,
    dirty,
    fileRef,
    isNewFile,
    setIsNewFile,
    code,
    setCode,
    filename,
    setFilename,
    setDirty,
    fileIsLoaded,
    setFileIsLoaded,
  };
}
