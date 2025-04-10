import {
  Dispatch,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { OnMount } from "@monaco-editor/react";
import {
  openExistingFile as fsaOpenExistingFile,
  reopenLastFile,
  saveFile,
  storeFileHandle,
  deleteStoredFileHandle,
} from "../utils/fsaUtils";

export type MonacoEditorInterface = Parameters<OnMount>[0];

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
  createNewFile: (name?: string, content?: string) => void;
  storeEditor: (editor: MonacoEditorInterface) => void;
  computeDirty: (newCode: string) => void;
  openExistingFile: () => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  closeFile: () => Promise<void>;
}

const isMac = () => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
};

export default function useEditorTabAgent({
  code,
  setCode,
}: {
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
}): EditorTabAgent {
  const fileRef = useRef<FileSystemFileHandle | null>(null);
  const [isNewFile, setIsNewFile] = useState(false);
  // const [code, setCode] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastLoadedCode, setLastLoadedCode] = useState<string | null>(null);
  const [fileIsLoaded, setFileIsLoaded] = useState(false);
  const editorRef = useRef<MonacoEditorInterface | null>(null);
  const [editorLoaded, setEditorLoaded] = useState(false);



  useEffect(() => {
    if (!editorLoaded) {
      const timer = setInterval(() => {
        if (editorRef.current) {
          setEditorLoaded(true);
          clearInterval(timer);
        }
      }, 100);
    }
  }, [editorLoaded]);

  function computeDirty(newValue: string) {
    if (fileIsLoaded) {
      setDirty(newValue !== lastLoadedCode);
    }
    if (isNewFile) {
      setDirty(newValue !== "");
    }
  }

  const createNewFile = (name?: string, content?: string) => {
    // TODO: If dirty warn before purging old content and creating new
    // We can leave this out for now
    setIsNewFile(true);
    setCode("");
    setFilename(name ?? "Untitled.scad");
    setLastLoadedCode(null);
    setDirty(typeof content === "string" && content.trim() !== "");
    setFileIsLoaded(false);
    editorRef.current?.setValue(content ?? "");
    fileRef.current = null;
  };

  const storeEditor = (editor: MonacoEditorInterface) => {
    editorRef.current = editor;
  };

  const checkForExistingFile = useCallback(
    async function checkForExistingFile() {
      if (!editorLoaded) return;
      const result = await reopenLastFile();
      if (result) {
        const { fileHandle, content } = result;
        fileRef.current = fileHandle;
        setCode(content);
        setFilename(fileHandle.name);
        setLastLoadedCode(content);
        setDirty(false);
        setFileIsLoaded(true);
        setIsNewFile(false);
        editorRef.current?.setValue(content);
      }
    },
    [setCode, editorLoaded]
  );
  useEffect(() => {
    checkForExistingFile();
  }, [checkForExistingFile]);

  const openExistingFile = async () => {
    const result = await fsaOpenExistingFile();
    if (result) {
      const { fileHandle, content } = result;
      fileRef.current = fileHandle;
      setCode(content);
      setFilename(fileHandle.name);
      setLastLoadedCode(content);
      setDirty(false);
      setFileIsLoaded(true);
      setIsNewFile(false);
      editorRef.current?.setValue(content);
      await storeFileHandle(fileHandle);
    }
  };

  const saveCurrentFile = useCallback(async () => {
    if (fileRef.current) {
      const didSave = await saveFile(fileRef.current, code);

      if (didSave) {
        setLastLoadedCode(code);
        setDirty(false);
        setFileIsLoaded(true);
        setIsNewFile(false);
      }
    }
  },[code]);

  // Todo: implement Save As functionality when a file is new

  const closeFile = async () => {
    // TODO: Add confirmation dialog for unsaved changes
    setFilename(null);
    setCode("");
    setLastLoadedCode(null);
    setDirty(false);
    setFileIsLoaded(false);
    setIsNewFile(false);
    fileRef.current = null;
    editorRef.current?.setValue("");
    await deleteStoredFileHandle();
  };

  const onCtrlS = useCallback(() => {
    const canSave= editorLoaded && dirty && (fileIsLoaded || isNewFile)
    if(canSave) {
      saveCurrentFile();
    }
  },[editorLoaded, dirty, fileIsLoaded, isNewFile, saveCurrentFile])

  useEffect(() => {
    const isUserOnMac = isMac();

    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (
        (isUserOnMac && event.metaKey && event.key === 's') ||
        (!isUserOnMac && event.ctrlKey && event.key === 's')
      ) {
        event.preventDefault();
        onCtrlS();
      }
    };

    document.addEventListener('keydown', handleSaveShortcut);

    return () => {
      document.removeEventListener('keydown', handleSaveShortcut);
    };
  }, [onCtrlS]);



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
    createNewFile,
    storeEditor,
    computeDirty,
    openExistingFile,
    saveCurrentFile,
    closeFile,
  };
}
