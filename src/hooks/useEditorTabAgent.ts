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
  filePath: string | null;
  setFilePath: Dispatch<SetStateAction<string | null>>;
  dirty: boolean;
  setDirty: Dispatch<SetStateAction<boolean>>;
  fileIsLoaded: boolean;
  setFileIsLoaded: Dispatch<SetStateAction<boolean>>;
  storeEditor: (editor: MonacoEditorInterface) => void;
  computeDirty: (newCode: string) => void;
  handleEditorChange: (newCode: string) => void;
  openFileHandle: (
    handle: FileSystemFileHandle,
    path: string
  ) => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  closeFile: () => Promise<void>;
  /** Force the Monaco editor to relayout */
  layoutEditor: () => void;
  setScrollTop: (scrollTop: number) => void;
  setCursorPosition: (lineNumber: number, column: number) => void;
}

const isMac = () => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
};

export default function useEditorTabAgent({
  code,
  setCode,
  onScrollChange,
  onCursorChange,
}: {
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
  onScrollChange?: (filePath: string, scrollTop: number) => void;
  onCursorChange?: (filePath: string, lineNumber: number, column: number) => void;
}): EditorTabAgent {
  const fileRef = useRef<FileSystemFileHandle | null>(null);
  const [isNewFile, setIsNewFile] = useState(false);
  // const [code, setCode] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastLoadedCode, setLastLoadedCode] = useState<string | null>(null);
  const [fileIsLoaded, setFileIsLoaded] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const editorRef = useRef<MonacoEditorInterface | null>(null);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const suppressNextChangeRef = useRef(false);
  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ lineNumber: number; column: number } | null>(
    null
  );



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

  const handleEditorChange = (newValue: string) => {
    if (suppressNextChangeRef.current) {
      suppressNextChangeRef.current = false;
      return;
    }
    setCode(newValue);
    computeDirty(newValue);
  };

  const storeEditor = (editor: MonacoEditorInterface) => {
    editorRef.current = editor;
  };

  const setEditorValue = (value: string) => {
    suppressNextChangeRef.current = true;
    editorRef.current?.setValue(value);
    window.setTimeout(() => {
      suppressNextChangeRef.current = false;
    }, 0);
  };

  const openFileHandle = async (
    handle: FileSystemFileHandle,
    path: string
  ) => {
    const file = await handle.getFile();
    const content = await file.text();
    fileRef.current = handle;
    setCode(content);
    setFilename(handle.name);
    setLastLoadedCode(content);
    setDirty(false);
    setFileIsLoaded(true);
    setIsNewFile(false);
    setFilePath(path);
    setEditorValue(content);
    await storeFileHandle(handle);
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
     setFilePath(null);
    fileRef.current = null;
    setEditorValue("");
    await deleteStoredFileHandle();
  };

  const layoutEditor = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.layout();
    }
  }, []);

  const setScrollTop = useCallback((scrollTop: number) => {
    if (editorRef.current) {
      editorRef.current.setScrollTop(scrollTop);
    } else {
      pendingScrollTopRef.current = scrollTop;
    }
  }, []);

  const setCursorPosition = useCallback(
    (lineNumber: number, column: number) => {
      if (editorRef.current) {
        editorRef.current.setPosition({ lineNumber, column });
        editorRef.current.revealPositionInCenterIfOutsideViewport({
          lineNumber,
          column,
        });
      } else {
        pendingCursorRef.current = { lineNumber, column };
      }
    },
    []
  );

  useEffect(() => {
    if (!editorLoaded) return;
    if (pendingScrollTopRef.current === null) return;
    if (!editorRef.current) return;
    editorRef.current.setScrollTop(pendingScrollTopRef.current);
    pendingScrollTopRef.current = null;
  }, [editorLoaded, filePath]);

  useEffect(() => {
    if (!editorLoaded) return;
    if (!pendingCursorRef.current) return;
    if (!editorRef.current) return;
    const { lineNumber, column } = pendingCursorRef.current;
    editorRef.current.setPosition({ lineNumber, column });
    editorRef.current.revealPositionInCenterIfOutsideViewport({
      lineNumber,
      column,
    });
    pendingCursorRef.current = null;
  }, [editorLoaded, filePath]);

  useEffect(() => {
    if (!editorLoaded || !editorRef.current || !onScrollChange) return;
    const editor = editorRef.current;
    const disposable = editor.onDidScrollChange(() => {
      if (!filePath) return;
      onScrollChange(filePath, editor.getScrollTop());
    });
    return () => {
      disposable.dispose();
    };
  }, [editorLoaded, onScrollChange, filePath]);

  useEffect(() => {
    if (!editorLoaded || !editorRef.current || !onCursorChange) return;
    const editor = editorRef.current;
    const disposable = editor.onDidChangeCursorPosition((event) => {
      if (!filePath) return;
      onCursorChange(
        filePath,
        event.position.lineNumber,
        event.position.column
      );
    });
    return () => {
      disposable.dispose();
    };
  }, [editorLoaded, onCursorChange, filePath]);

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
    filePath,
    setFilePath,
    setDirty,
    fileIsLoaded,
    setFileIsLoaded,
    storeEditor,
    computeDirty,
    handleEditorChange,
    openFileHandle,
    saveCurrentFile,
    closeFile,
    layoutEditor,
    setScrollTop,
    setCursorPosition,
  };
}
