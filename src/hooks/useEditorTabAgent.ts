import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { OnMount } from "@monaco-editor/react";
import { saveFile } from "../utils/fsaUtils";
import type { SelectionRange } from "../utils/fsaUtils";

export type MonacoEditorInterface = Parameters<OnMount>[0];

export type TabState = {
  filePath: string;
  filename: string;
  fileHandle: FileSystemFileHandle;
  code: string;
  lastLoadedCode: string;
  dirty: boolean;
  isPreview: boolean;
  scrollTop: number;
  cursorPosition: { lineNumber: number; column: number };
  selections: SelectionRange[];
};

export type TabLoadData = {
  handle: FileSystemFileHandle;
  path: string;
  isPreview: boolean;
  content: string;
  scrollTop?: number;
  cursorPosition?: { lineNumber: number; column: number };
  selections?: SelectionRange[];
};

export interface TabManager {
  // Tab state
  tabs: TabState[];
  activeTabIndex: number;

  // Active tab convenience getters
  code: string;
  filePath: string | null;
  filename: string | null;
  dirty: boolean;
  fileIsLoaded: boolean;
  isPreview: boolean;

  // Monaco integration
  storeEditor: (editor: MonacoEditorInterface) => void;
  handleEditorChange: (newCode: string) => void;
  layoutEditor: () => void;

  // Tab operations
  openFilePreview: (handle: FileSystemFileHandle, path: string) => Promise<void>;
  openFilePermanent: (handle: FileSystemFileHandle, path: string) => Promise<void>;
  switchTab: (index: number) => void;
  closeTab: (index: number) => Promise<"closed" | "cancelled">;
  saveCurrentFile: () => Promise<void>;

  // Viewport restoration (for IndexedDB load on startup)
  setScrollTop: (scrollTop: number) => void;
  setCursorPosition: (lineNumber: number, column: number) => void;

  // Bulk load for persistence restoration
  loadTabs: (tabData: TabLoadData[], activeIndex: number) => void;
}

const isMac = () => navigator.platform.toUpperCase().indexOf("MAC") >= 0;

function createTab(
  handle: FileSystemFileHandle,
  path: string,
  content: string,
  isPreview: boolean,
  viewport?: {
    scrollTop?: number;
    cursorPosition?: { lineNumber: number; column: number };
    selections?: SelectionRange[];
  }
): TabState {
  return {
    filePath: path,
    filename: handle.name,
    fileHandle: handle,
    code: content,
    lastLoadedCode: content,
    dirty: false,
    isPreview,
    scrollTop: viewport?.scrollTop ?? 0,
    cursorPosition: viewport?.cursorPosition ?? { lineNumber: 1, column: 1 },
    selections: viewport?.selections ?? [],
  };
}

export default function useTabManager({
  onScrollChange,
  onCursorChange,
  onSelectionChange,
}: {
  onScrollChange?: (filePath: string, scrollTop: number) => void;
  onCursorChange?: (
    filePath: string,
    lineNumber: number,
    column: number
  ) => void;
  onSelectionChange?: (filePath: string, selections: SelectionRange[]) => void;
}): TabManager {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const editorRef = useRef<MonacoEditorInterface | null>(null);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const suppressNextChangeRef = useRef(false);

  // Refs for synchronous access (updated in tandem with state)
  const tabsRef = useRef(tabs);
  const activeTabIndexRef = useRef(activeTabIndex);

  // Helper to update tabs + ref together
  const commitTabs = useCallback(
    (newTabs: TabState[], newActive: number) => {
      tabsRef.current = newTabs;
      activeTabIndexRef.current = newActive;
      setTabs(newTabs);
      setActiveTabIndex(newActive);
    },
    []
  );

  // Poll for editor readiness
  useEffect(() => {
    if (editorLoaded) return;
    const timer = setInterval(() => {
      if (editorRef.current) {
        setEditorLoaded(true);
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [editorLoaded]);

  // --- Derived active tab state ---

  const activeTab =
    activeTabIndex >= 0 && activeTabIndex < tabs.length
      ? tabs[activeTabIndex]
      : null;
  const code = activeTab?.code ?? "";
  const filePath = activeTab?.filePath ?? null;
  const filename = activeTab?.filename ?? null;
  const dirty = activeTab?.dirty ?? false;
  const fileIsLoaded = activeTab !== null;
  const isPreview = activeTab?.isPreview ?? false;

  // --- Editor value swap (suppresses onChange) ---

  const setEditorValue = useCallback((value: string) => {
    suppressNextChangeRef.current = true;
    editorRef.current?.setValue(value);
    window.setTimeout(() => {
      suppressNextChangeRef.current = false;
    }, 0);
  }, []);

  // --- Snapshot active tab's viewport from the live editor ---

  const snapshotActiveTab = useCallback((): TabState[] => {
    const editor = editorRef.current;
    const idx = activeTabIndexRef.current;
    const currentTabs = tabsRef.current;
    if (!editor || idx < 0 || idx >= currentTabs.length) return currentTabs;

    const scrollTop = editor.getScrollTop();
    const position = editor.getPosition();
    const sels = editor.getSelections();

    const next = [...currentTabs];
    next[idx] = {
      ...next[idx],
      scrollTop,
      cursorPosition: position
        ? { lineNumber: position.lineNumber, column: position.column }
        : next[idx].cursorPosition,
      selections: sels
        ? sels.map((s) => ({
            startLineNumber: s.startLineNumber,
            startColumn: s.startColumn,
            endLineNumber: s.endLineNumber,
            endColumn: s.endColumn,
          }))
        : next[idx].selections,
    };
    return next;
  }, []);

  // --- Restore a tab's viewport into the live editor ---

  const restoreTabViewport = useCallback((tab: TabState) => {
    const editor = editorRef.current;
    if (!editor) return;
    // Defer so Monaco processes the new content from setValue first
    requestAnimationFrame(() => {
      editor.setScrollTop(tab.scrollTop);
      editor.setPosition(tab.cursorPosition);
      if (tab.selections.length > 0) {
        editor.setSelections(
          tab.selections.map((s) => ({
            selectionStartLineNumber: s.startLineNumber,
            selectionStartColumn: s.startColumn,
            positionLineNumber: s.endLineNumber,
            positionColumn: s.endColumn,
          }))
        );
      }
      editor.revealPositionInCenterIfOutsideViewport(tab.cursorPosition);
    });
  }, []);

  // --- Persist a tab's viewport state to IndexedDB via callbacks ---

  const persistTabViewport = useCallback(
    (tab: TabState) => {
      if (onScrollChange) onScrollChange(tab.filePath, tab.scrollTop);
      if (onCursorChange)
        onCursorChange(
          tab.filePath,
          tab.cursorPosition.lineNumber,
          tab.cursorPosition.column
        );
      if (onSelectionChange) onSelectionChange(tab.filePath, tab.selections);
    },
    [onScrollChange, onCursorChange, onSelectionChange]
  );

  // --- Tab operations ---

  const switchTab = useCallback(
    (index: number) => {
      const currentTabs = tabsRef.current;
      if (index < 0 || index >= currentTabs.length) return;
      if (index === activeTabIndexRef.current) return;

      // Snapshot outgoing tab
      const snapshotted = snapshotActiveTab();

      // Switch and load
      const tab = snapshotted[index];
      commitTabs(snapshotted, index);
      setEditorValue(tab.code);
      restoreTabViewport(tab);
    },
    [snapshotActiveTab, commitTabs, setEditorValue, restoreTabViewport]
  );

  const openFilePreview = useCallback(
    async (handle: FileSystemFileHandle, path: string) => {
      const currentTabs = tabsRef.current;
      const currentActive = activeTabIndexRef.current;

      // Case 1: File already open in any tab -> switch to it
      const existingIdx = currentTabs.findIndex((t) => t.filePath === path);
      if (existingIdx !== -1) {
        switchTab(existingIdx);
        return;
      }

      // Read file content
      const file = await handle.getFile();
      const content = await file.text();
      const newTab = createTab(handle, path, content, true);

      const existingPreviewIdx = currentTabs.findIndex((t) => t.isPreview);

      // Case 2: Preview tab IS the active tab -> reuse in place
      if (existingPreviewIdx !== -1 && existingPreviewIdx === currentActive) {
        const snapshotted = snapshotActiveTab();
        persistTabViewport(snapshotted[existingPreviewIdx]);

        const next = [...snapshotted];
        next[existingPreviewIdx] = newTab;
        commitTabs(next, existingPreviewIdx);
        setEditorValue(content);
        restoreTabViewport(newTab);
        return;
      }

      // Case 3: Preview tab exists but is NOT active -> remove it, insert new after active
      if (existingPreviewIdx !== -1) {
        const snapshotted = snapshotActiveTab();
        persistTabViewport(snapshotted[existingPreviewIdx]);

        const next = [...snapshotted];
        next.splice(existingPreviewIdx, 1);

        let adjustedActive = currentActive;
        if (existingPreviewIdx < currentActive) {
          adjustedActive--;
        }

        const insertAt = adjustedActive + 1;
        next.splice(insertAt, 0, newTab);

        commitTabs(next, insertAt);
        setEditorValue(content);
        restoreTabViewport(newTab);
        return;
      }

      // Case 4: No preview tab exists -> create after active
      const snapshotted = snapshotActiveTab();
      const insertAt = currentActive >= 0 ? currentActive + 1 : 0;
      const next = [...snapshotted];
      next.splice(insertAt, 0, newTab);

      commitTabs(next, insertAt);
      setEditorValue(content);
      restoreTabViewport(newTab);
    },
    [
      switchTab,
      snapshotActiveTab,
      commitTabs,
      setEditorValue,
      restoreTabViewport,
      persistTabViewport,
    ]
  );

  const openFilePermanent = useCallback(
    async (handle: FileSystemFileHandle, path: string) => {
      const currentTabs = tabsRef.current;
      const currentActive = activeTabIndexRef.current;

      // Case 1: File already open -> switch to it (promote if preview)
      const existingIdx = currentTabs.findIndex((t) => t.filePath === path);
      if (existingIdx !== -1) {
        if (currentTabs[existingIdx].isPreview) {
          const snapshotted = snapshotActiveTab();
          const next = [...snapshotted];
          next[existingIdx] = { ...next[existingIdx], isPreview: false };
          commitTabs(next, existingIdx);
          if (existingIdx !== currentActive) {
            setEditorValue(next[existingIdx].code);
            restoreTabViewport(next[existingIdx]);
          }
        } else {
          switchTab(existingIdx);
        }
        return;
      }

      // Case 2: Not open -> create new permanent tab after active
      const file = await handle.getFile();
      const content = await file.text();
      const newTab = createTab(handle, path, content, false);

      const snapshotted = snapshotActiveTab();
      const insertAt = currentActive >= 0 ? currentActive + 1 : 0;
      const next = [...snapshotted];
      next.splice(insertAt, 0, newTab);

      commitTabs(next, insertAt);
      setEditorValue(content);
      restoreTabViewport(newTab);
    },
    [
      switchTab,
      snapshotActiveTab,
      commitTabs,
      setEditorValue,
      restoreTabViewport,
    ]
  );

  const saveCurrentFile = useCallback(async () => {
    const idx = activeTabIndexRef.current;
    const currentTabs = tabsRef.current;
    if (idx < 0 || idx >= currentTabs.length) return;
    const tab = currentTabs[idx];

    const didSave = await saveFile(tab.fileHandle, tab.code);
    if (didSave) {
      const next = [...tabsRef.current];
      const latestIdx = activeTabIndexRef.current;
      if (latestIdx >= 0 && latestIdx < next.length) {
        next[latestIdx] = {
          ...next[latestIdx],
          lastLoadedCode: next[latestIdx].code,
          dirty: false,
        };
        commitTabs(next, latestIdx);
      }
    }
  }, [commitTabs]);

  const closeTab = useCallback(
    async (index: number): Promise<"closed" | "cancelled"> => {
      let currentTabs = tabsRef.current;
      if (index < 0 || index >= currentTabs.length) return "cancelled";
      const tab = currentTabs[index];
      const currentActive = activeTabIndexRef.current;

      // Snapshot if closing the active tab
      if (index === currentActive) {
        currentTabs = snapshotActiveTab();
      }

      // Dirty tab prompt: Save / Don't Save / Cancel
      if (tab.dirty) {
        const shouldSave = window.confirm(
          `"${tab.filename}" has unsaved changes.\n\nPress OK to save before closing, or Cancel to keep editing.`
        );
        if (shouldSave) {
          const didSave = await saveFile(tab.fileHandle, tab.code);
          if (!didSave) return "cancelled";
        } else {
          const discardOk = window.confirm(
            `Close "${tab.filename}" without saving?`
          );
          if (!discardOk) return "cancelled";
        }
      }

      // Re-read current state (may have changed during async save)
      currentTabs = tabsRef.current;
      const latestActive = activeTabIndexRef.current;
      const latestIndex = currentTabs.findIndex(
        (t) => t.filePath === tab.filePath
      );
      if (latestIndex === -1) return "cancelled"; // tab already gone

      // Persist closing tab's viewport for future reopens
      persistTabViewport(currentTabs[latestIndex]);

      // Remove tab and compute new active index
      const newTabs = [...currentTabs];
      newTabs.splice(latestIndex, 1);

      let newActive: number;
      if (newTabs.length === 0) {
        newActive = -1;
      } else if (latestIndex === latestActive) {
        // Closed the active tab: activate right neighbor, or left if rightmost
        newActive =
          latestIndex < newTabs.length ? latestIndex : latestIndex - 1;
      } else if (latestIndex < latestActive) {
        newActive = latestActive - 1;
      } else {
        newActive = latestActive;
      }

      commitTabs(newTabs, newActive);

      if (newActive >= 0) {
        setEditorValue(newTabs[newActive].code);
        restoreTabViewport(newTabs[newActive]);
      } else {
        setEditorValue("");
      }

      return "closed";
    },
    [
      snapshotActiveTab,
      commitTabs,
      setEditorValue,
      restoreTabViewport,
      persistTabViewport,
    ]
  );

  // --- Editor change handler ---

  const handleEditorChange = useCallback((newValue: string) => {
    if (suppressNextChangeRef.current) {
      suppressNextChangeRef.current = false;
      return;
    }
    const idx = activeTabIndexRef.current;
    const currentTabs = tabsRef.current;
    if (idx < 0 || idx >= currentTabs.length) return;

    const tab = currentTabs[idx];
    const next = [...currentTabs];
    next[idx] = {
      ...tab,
      code: newValue,
      dirty: newValue !== tab.lastLoadedCode,
      // Editing promotes preview to permanent
      isPreview: false,
    };
    tabsRef.current = next;
    activeTabIndexRef.current = idx;
    setTabs(next);
  }, []);

  const storeEditor = useCallback((editor: MonacoEditorInterface) => {
    editorRef.current = editor;
  }, []);

  const layoutEditor = useCallback(() => {
    editorRef.current?.layout();
  }, []);

  // --- Viewport setters (for external restoration on startup) ---

  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{
    lineNumber: number;
    column: number;
  } | null>(null);

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

  // Apply pending viewport when editor becomes ready
  useEffect(() => {
    if (!editorLoaded || !editorRef.current) return;
    if (pendingScrollTopRef.current !== null) {
      editorRef.current.setScrollTop(pendingScrollTopRef.current);
      pendingScrollTopRef.current = null;
    }
    if (pendingCursorRef.current) {
      const { lineNumber, column } = pendingCursorRef.current;
      editorRef.current.setPosition({ lineNumber, column });
      editorRef.current.revealPositionInCenterIfOutsideViewport({
        lineNumber,
        column,
      });
      pendingCursorRef.current = null;
    }
  }, [editorLoaded]);

  // --- Scroll / cursor / selection change listeners ---

  useEffect(() => {
    if (!editorLoaded || !editorRef.current || !onScrollChange) return;
    const editor = editorRef.current;
    const disposable = editor.onDidScrollChange(() => {
      const fp =
        tabsRef.current[activeTabIndexRef.current]?.filePath;
      if (!fp) return;
      onScrollChange(fp, editor.getScrollTop());
    });
    return () => disposable.dispose();
  }, [editorLoaded, onScrollChange]);

  useEffect(() => {
    if (!editorLoaded || !editorRef.current || !onCursorChange) return;
    const editor = editorRef.current;
    const disposable = editor.onDidChangeCursorPosition((event) => {
      const fp =
        tabsRef.current[activeTabIndexRef.current]?.filePath;
      if (!fp) return;
      onCursorChange(fp, event.position.lineNumber, event.position.column);
    });
    return () => disposable.dispose();
  }, [editorLoaded, onCursorChange]);

  useEffect(() => {
    if (!editorLoaded || !editorRef.current || !onSelectionChange) return;
    const editor = editorRef.current;
    const disposable = editor.onDidChangeCursorSelection(() => {
      const fp =
        tabsRef.current[activeTabIndexRef.current]?.filePath;
      if (!fp) return;
      const sels = editor.getSelections();
      if (sels) {
        onSelectionChange(
          fp,
          sels.map((s) => ({
            startLineNumber: s.startLineNumber,
            startColumn: s.startColumn,
            endLineNumber: s.endLineNumber,
            endColumn: s.endColumn,
          }))
        );
      }
    });
    return () => disposable.dispose();
  }, [editorLoaded, onSelectionChange]);

  // --- Ctrl+S / Cmd+S ---

  const onCtrlS = useCallback(() => {
    const idx = activeTabIndexRef.current;
    const currentTabs = tabsRef.current;
    if (idx < 0 || idx >= currentTabs.length) return;
    if (currentTabs[idx].dirty) {
      saveCurrentFile();
    }
  }, [saveCurrentFile]);

  useEffect(() => {
    const isUserOnMac = isMac();
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (
        (isUserOnMac && event.metaKey && event.key === "s") ||
        (!isUserOnMac && event.ctrlKey && event.key === "s")
      ) {
        event.preventDefault();
        onCtrlS();
      }
    };
    document.addEventListener("keydown", handleSaveShortcut);
    return () => document.removeEventListener("keydown", handleSaveShortcut);
  }, [onCtrlS]);

  // --- Bulk load for persistence restoration ---

  const loadTabs = useCallback(
    (tabData: TabLoadData[], activeIndex: number) => {
      const newTabs: TabState[] = tabData.map((d) =>
        createTab(d.handle, d.path, d.content, d.isPreview, {
          scrollTop: d.scrollTop,
          cursorPosition: d.cursorPosition,
          selections: d.selections,
        })
      );

      const validIndex =
        activeIndex >= 0 && activeIndex < newTabs.length
          ? activeIndex
          : newTabs.length > 0
          ? 0
          : -1;

      commitTabs(newTabs, validIndex);

      if (validIndex >= 0) {
        const tab = newTabs[validIndex];
        setEditorValue(tab.code);
        restoreTabViewport(tab);
      }
    },
    [commitTabs, setEditorValue, restoreTabViewport]
  );

  return {
    tabs,
    activeTabIndex,
    code,
    filePath,
    filename,
    dirty,
    fileIsLoaded,
    isPreview,
    storeEditor,
    handleEditorChange,
    layoutEditor,
    openFilePreview,
    openFilePermanent,
    switchTab,
    closeTab,
    saveCurrentFile,
    setScrollTop,
    setCursorPosition,
    loadTabs,
  };
}
