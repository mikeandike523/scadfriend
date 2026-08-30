import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { css, keyframes } from "@emotion/react";
import Color from "color";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

import {
  FaHome,
  FaFileDownload,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import { Button, Div, H1, I, Input, Label, P } from "style-props-html";

import "./App.css";

import EditorTab from "./components/EditorTab";
import FileBrowser from "./components/FileBrowser";
import useTabManager from "./hooks/useEditorTabAgent";
import useFSAUnsupported from "./hooks/useFSAUnsupported";
import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import {
  hasEnabledExports,
  identifyParts,
  OpenSCADPart,
} from "./openscad-parsing";
import { createLabeledAxis, removeAxes } from "./AxisVisualizer";
import { formatError } from "./utils/serialization";
import ResizeSvgHelper from "./utils/ResizeSVGHelper";
import ThreeViewer, { ThreeHandles } from "./components/ThreeViewer";
import { collectAndPrepareVmFiles } from "./utils/importUtils";
import { useOpenSCADLsp } from "./lsp/useOpenSCADLsp";
import { useImportDiagnostics } from "./lsp/useImportDiagnostics";
import { subscribeUiLog, emitUiLog } from "./utils/uiLogger";
import { determineFacets, buildFaceIDArray } from "./utils/facetDetermination";
import { buildOutlineGeometry, buildOutlineMaterial } from "./utils/outlineRenderer";
import {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
  getFileHandleByPath,
  loadWorkspaceState,
  updateWorkspaceState,
  updateWorkspaceScrollPosition,
  updateWorkspaceCursorPosition,
  updateWorkspaceSelections,
  updateWorkspaceOpenTabs,
  updateWorkspaceLastRender,
  updateWorkspaceLastRenderableFile,
  updateWorkspaceCameraState,
  clearWorkspaceState,
  warnOnce,
} from "./utils/fsaUtils";
import type { CameraState, PersistedModelEntry } from "./utils/fsaUtils";
import type { TabLoadData } from "./hooks/useEditorTabAgent";
import { saveVmDebugSnapshot } from "./utils/debugSnapshot";
import { isScadFile, isBinaryFile } from "./utils/fileTypes";
import { MAX_MODEL_PERSIST_BYTES } from "./utils/persistLimits";

const resizeBarSVGHelper = new ResizeSvgHelper({
  arrowHeadWidth: 12,
  arrowHeadLength: 4,
  shaftWidth: 2,
  shaftLength: 2,
  paddingX: 2,
  paddingY: 2,
});
const resizeBarSVGUri = resizeBarSVGHelper.getDataUri("#000");

const resizeBarStyle:CSSProperties = {
  // Because the computed width and height include padding,
  // The tiling and centering end up pleasing
  width: `${resizeBarSVGHelper.getComputedWidth()}px`,
  cursor: "col-resize",
  touchAction: "none",
  userSelect: "none",
  backgroundColor: "#e0f7ff",
  backgroundImage: `url("${resizeBarSVGUri}")`,
  backgroundRepeat: "repeat-y",
  backgroundPosition: "center",
  // Because the computed width and height include padding,
  // The tiling and centering end up pleasing
  backgroundSize: `${resizeBarSVGHelper.getComputedWidth()}px ${resizeBarSVGHelper.getComputedHeight()}px`,
};

const MAX_MESSAGES: string | undefined = undefined;
const WRITE_VM_DEBUG =
  typeof __WRITE_VM_DEBUG__ !== "undefined" && __WRITE_VM_DEBUG__;
type OpenSCADPartWithSTL = OpenSCADPart & { stl?: Uint8Array };
type PartSettings = { visible: boolean; exported: boolean };
type PaneLayout = { fileBrowser: number; editor: number; viewer: number };
type LogPanelStatus = "idle" | "processing" | "error" | "success";
type RenderSource = {
  code: string;
  filePath: string;
  filename: string;
  parts: Record<string, OpenSCADPart>;
};

const LOG_PANEL_BACKGROUNDS: Record<LogPanelStatus, string> = {
  idle: "#eeeeee",
  processing: "#d9efff",
  error: "#ffd6d6",
  success: "#dff5df",
};

type MenuBarProps = {
  workspaceName: string | null;
  onOpenWorkspace: () => void;
  onCloseWorkspace: () => void;
  onCreateFile: () => void;
  onSaveFile: () => void;
  onCloseFile: () => void;
  hasOpenFile: boolean;
};

function MenuBar({
  workspaceName,
  onOpenWorkspace,
  onCloseWorkspace,
  onCreateFile,
  onSaveFile,
  onCloseFile,
  hasOpenFile,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"workspace" | "file" | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const runMenuAction = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  return (
    <div className="menu-bar" ref={menuBarRef} role="menubar" aria-label="Application menu">
      <div className="menu-bar__group">
        <button
          className="menu-bar__trigger"
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === "workspace"}
          onClick={() => setOpenMenu(openMenu === "workspace" ? null : "workspace")}
        >
          Workspace
        </button>
        {openMenu === "workspace" && (
          <div className="menu-dropdown" role="menu">
            <div className="menu-dropdown__label" role="presentation">
              <span>Workspace</span>
              <strong>{workspaceName ?? "No workspace open"}</strong>
            </div>
            <div className="menu-dropdown__separator" />
            <button type="button" role="menuitem" onClick={() => runMenuAction(onOpenWorkspace)}>
              Open New Workspace…
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!workspaceName}
              onClick={() => runMenuAction(onCloseWorkspace)}
            >
              Close Workspace
            </button>
          </div>
        )}
      </div>
      <div className="menu-bar__group">
        <button
          className="menu-bar__trigger"
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === "file"}
          onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
        >
          File
        </button>
        {openMenu === "file" && (
          <div className="menu-dropdown" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={!workspaceName}
              onClick={() => runMenuAction(onCreateFile)}
            >
              Create New File…
            </button>
            <button type="button" role="menuitem" disabled={!hasOpenFile} onClick={() => runMenuAction(onSaveFile)}>
              Save File
            </button>
            <button type="button" role="menuitem" disabled={!hasOpenFile} onClick={() => runMenuAction(onCloseFile)}>
              Close File
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const MIN_PANE_FRAC: PaneLayout = {
  fileBrowser: 0.2,
  editor: 0.2,
  viewer: 0.2,
};
const DEFAULT_PANE_FRAC: PaneLayout = {
  fileBrowser: 0.2,
  editor: 0.4,
  viewer: 0.4,
};

function normalizePaneLayout(layout?: Partial<PaneLayout> | null): PaneLayout {
  if (!layout) return { ...DEFAULT_PANE_FRAC };
  let fileBrowser = Number(layout.fileBrowser);
  let editor = Number(layout.editor);
  let viewer = Number(layout.viewer);
  if (![fileBrowser, editor, viewer].every((v) => Number.isFinite(v))) {
    return { ...DEFAULT_PANE_FRAC };
  }
  if (fileBrowser <= 0) fileBrowser = 0;
  if (editor <= 0) editor = 0;
  if (viewer <= 0) viewer = 0;

  fileBrowser = Math.max(fileBrowser, MIN_PANE_FRAC.fileBrowser);
  editor = Math.max(editor, MIN_PANE_FRAC.editor);
  viewer = Math.max(viewer, MIN_PANE_FRAC.viewer);

  const total = fileBrowser + editor + viewer;
  if (total <= 0) return { ...DEFAULT_PANE_FRAC };

  if (total > 1) {
    const minSum =
      MIN_PANE_FRAC.fileBrowser + MIN_PANE_FRAC.editor + MIN_PANE_FRAC.viewer;
    const reducible =
      (fileBrowser - MIN_PANE_FRAC.fileBrowser) +
      (editor - MIN_PANE_FRAC.editor) +
      (viewer - MIN_PANE_FRAC.viewer);
    if (reducible > 0 && minSum < 1) {
      const scale = (1 - minSum) / reducible;
      fileBrowser =
        MIN_PANE_FRAC.fileBrowser +
        (fileBrowser - MIN_PANE_FRAC.fileBrowser) * scale;
      editor =
        MIN_PANE_FRAC.editor + (editor - MIN_PANE_FRAC.editor) * scale;
      viewer =
        MIN_PANE_FRAC.viewer + (viewer - MIN_PANE_FRAC.viewer) * scale;
    } else {
      const scale = 1 / total;
      fileBrowser *= scale;
      editor *= scale;
      viewer *= scale;
    }
  } else if (total < 1) {
    const scale = 1 / total;
    fileBrowser *= scale;
    editor *= scale;
    viewer *= scale;
  }

  return { fileBrowser, editor, viewer };
}

function copySharedBufferToArrayBuffer(
  sharedBuffer: SharedArrayBuffer | ArrayBuffer
): ArrayBuffer {
  if (sharedBuffer instanceof ArrayBuffer) return sharedBuffer;
  const arrayBuffer = new ArrayBuffer(sharedBuffer.byteLength);
  new Uint8Array(arrayBuffer).set(new Uint8Array(sharedBuffer));
  return arrayBuffer;
}

function rgbaByteToInt(r: number, g: number, b: number, a: number) {
  return (a << 24) | (r << 16) | (g << 8) | b;
}

function getColorOrDefault(
  colorString: string | undefined,
  defaultColor = 0xff00ff
): number {
  if (!colorString) return defaultColor;
  const color = Color(colorString);
  const { r, g, b, a } = {
    r: color.red(),
    g: color.green(),
    b: color.blue(),
    a: color.alpha(),
  };
  return rgbaByteToInt(r, g, b, Math.round(a * 255));
}

const spinnerAnimation = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

function traverseSyncChildrenFirst(
  node: THREE.Object3D,
  callback: (node: THREE.Object3D) => void
) {
  for (const child of node.children) traverseSyncChildrenFirst(child, callback);
  callback(node);
}

export default function App() {
  useRegisterOpenSCADLanguage();
  const lspClientRef = useOpenSCADLsp();
  const fsaUnsupported = useFSAUnsupported();

  const consoleDivRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [logPanelStatus, setLogPanelStatus] =
    useState<LogPanelStatus>("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderedAtLeastOnce, setRenderedAtLeastOnce] = useState(false);
  const [partsPanelOpen, setPartsPanelOpen] = useState(true);
  const [outlineMode, setOutlineMode] = useState<"facets" | "triangles">("facets");
  const completedModelRef = useRef<Record<string, OpenSCADPartWithSTL>>({});
  const [partSettings, setPartSettings] = useState<
    Record<string, PartSettings>
  >({});
  const [lastRenderedFile, setLastRenderedFile] = useState<string | null>(null);
  const [lastRenderedBackend, setLastRenderedBackend] = useState<
    "Manifold" | "CGAL" | null
  >(null);
  const lastRenderableFilePathRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef<{
    file: string;
    backend: "Manifold" | "CGAL";
    camera: CameraState;
    models: PersistedModelEntry[];
  } | null>(null);

  const scrollSaveTimeoutRef = useRef<number | null>(null);
  const cursorSaveTimeoutRef = useRef<number | null>(null);
  const selectionSaveTimeoutRef = useRef<number | null>(null);
  const tabManager = useTabManager({
    onScrollChange: (filePath, scrollTop) => {
      if (!projectHandle || !workspaceLoaded) return;
      if (scrollSaveTimeoutRef.current) {
        window.clearTimeout(scrollSaveTimeoutRef.current);
      }
      scrollSaveTimeoutRef.current = window.setTimeout(() => {
        updateWorkspaceScrollPosition(projectHandle.name, filePath, scrollTop);
      }, 200);
    },
    onCursorChange: (filePath, lineNumber, column) => {
      if (!projectHandle || !workspaceLoaded) return;
      if (cursorSaveTimeoutRef.current) {
        window.clearTimeout(cursorSaveTimeoutRef.current);
      }
      cursorSaveTimeoutRef.current = window.setTimeout(() => {
        updateWorkspaceCursorPosition(
          projectHandle.name,
          filePath,
          lineNumber,
          column
        );
      }, 200);
    },
    onSelectionChange: (filePath, selections) => {
      if (!projectHandle || !workspaceLoaded) return;
      if (selectionSaveTimeoutRef.current) {
        window.clearTimeout(selectionSaveTimeoutRef.current);
      }
      selectionSaveTimeoutRef.current = window.setTimeout(() => {
        updateWorkspaceSelections(projectHandle.name, filePath, selections);
      }, 200);
    },
  });
  const layoutSaveTimeoutRef = useRef<number | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Split pane proportions for CSS grid; sum to 1
  const [fileBrowserFrac, setFileBrowserFrac] = useState<number>(0);
  const [editorFrac, setEditorFrac] = useState<number>(0);
  const [viewerFrac, setViewerFrac] = useState<number>(0);
  const proportionsRef = useRef({
    fileBrowser: fileBrowserFrac,
    editor: editorFrac,
    viewer: viewerFrac,
  });
  const pointerStateRef = useRef<{
    which: "fileBrowser" | "editor";
    startX: number;
    start: { fileBrowser: number; editor: number; viewer: number };
  } | null>(null);
  useEffect(() => {
    proportionsRef.current = {
      fileBrowser: fileBrowserFrac,
      editor: editorFrac,
      viewer: viewerFrac,
    };
  }, [fileBrowserFrac, editorFrac, viewerFrac]);
  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  const [projectHandle, setProjectHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [fileBrowserRevision, setFileBrowserRevision] = useState(0);

  // Import validation squiggles
  useImportDiagnostics(
    lspClientRef,
    projectHandle,
    tabManager.filePath,
    tabManager.code
  );

  // Initialize pane proportions once on mount when we know window width
  useEffect(() => {
    if (
      windowWidth &&
      fileBrowserFrac === 0 &&
      editorFrac === 0 &&
      viewerFrac === 0
    ) {
      const normalized = normalizePaneLayout(DEFAULT_PANE_FRAC);
      setFileBrowserFrac(normalized.fileBrowser);
      setEditorFrac(normalized.editor);
      setViewerFrac(normalized.viewer);
    }
  }, [windowWidth, fileBrowserFrac, editorFrac, viewerFrac]);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    getStoredDirectoryHandle().then(async (h) => {
      if (h) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (h as any).queryPermission({ mode: "readwrite" });
        if (perm === "granted") {
          setProjectHandle(h);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!projectHandle) {
      setWorkspaceLoaded(false);
      return;
    }
    let cancelled = false;
    async function loadWorkspace() {
      if (!projectHandle) return;
      const state = await loadWorkspaceState(projectHandle.name);
      if (cancelled) return;

      lastRenderableFilePathRef.current =
        state.lastRenderableFilePath ?? null;

      // Restore layout
      if (state.layout) {
        const layout =
          typeof state.layout === "object" ? state.layout : null;
        const normalized = normalizePaneLayout(layout);
        const valid =
          normalized.fileBrowser > 0 &&
          normalized.editor > 0 &&
          normalized.viewer > 0;
        if (valid) {
          setFileBrowserFrac(normalized.fileBrowser);
          setEditorFrac(normalized.editor);
          setViewerFrac(normalized.viewer);
        } else {
          warnOnce(
            `workspace-layout-${projectHandle.name}`,
            `Workspace state: invalid layout proportions for "${projectHandle.name}". Resetting layout.`
          );
          updateWorkspaceState(projectHandle.name, { layout: null });
          const fallback = normalizePaneLayout(DEFAULT_PANE_FRAC);
          setFileBrowserFrac(fallback.fileBrowser);
          setEditorFrac(fallback.editor);
          setViewerFrac(fallback.viewer);
        }
      }

      // Restore tabs (new system) or migrate from legacy openFilePath
      const savedTabs = state.openTabs;
      const savedActiveIndex = state.activeTabIndex ?? 0;

      // Determine which tab entries to restore
      let tabEntries: Array<{ path: string; isPreview: boolean }> = [];
      if (Array.isArray(savedTabs) && savedTabs.length > 0) {
        tabEntries = savedTabs;
      } else if (typeof state.openFilePath === "string" && state.openFilePath) {
        // Migrate legacy single-file state
        tabEntries = [{ path: state.openFilePath, isPreview: false }];
      }

      if (tabEntries.length > 0) {
        const resolvedTabs: TabLoadData[] = [];
        const failedPaths: string[] = [];

        for (const entry of tabEntries) {
          if (cancelled) return;
          try {
            const handle = await getFileHandleByPath(projectHandle, entry.path);
            if (!handle) {
              failedPaths.push(entry.path);
              continue;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const perm = await (handle as any).queryPermission?.({ mode: "read" });
            if (perm && perm !== "granted") {
              failedPaths.push(entry.path);
              continue;
            }
            // Skip reading binary file content — tab manager won't push it to Monaco
            let content = "";
            if (!isBinaryFile(handle.name)) {
              const file = await handle.getFile();
              content = await file.text();
            }
            resolvedTabs.push({
              handle,
              path: entry.path,
              isPreview: entry.isPreview,
              content,
              scrollTop: state.scrollPositions?.[entry.path],
              cursorPosition: state.cursorPositions?.[entry.path],
              selections: state.selections?.[entry.path],
            });
          } catch {
            failedPaths.push(entry.path);
          }
        }

        if (failedPaths.length > 0) {
          warnOnce(
            `workspace-tabs-${projectHandle.name}`,
            `Workspace state: could not restore tabs for: ${failedPaths.join(", ")}. Removing from saved state.`
          );
        }

        if (cancelled) return;

        if (resolvedTabs.length > 0) {
          const clampedIndex = Math.min(savedActiveIndex, resolvedTabs.length - 1);
          tabManager.loadTabs(resolvedTabs, Math.max(0, clampedIndex));
        }

        // Persist cleaned state
        if (failedPaths.length > 0 || !Array.isArray(savedTabs)) {
          updateWorkspaceOpenTabs(
            projectHandle.name,
            resolvedTabs.map((t) => ({ path: t.path, isPreview: t.isPreview })),
            Math.max(0, Math.min(savedActiveIndex, resolvedTabs.length - 1))
          );
          // Clear legacy field
          updateWorkspaceState(projectHandle.name, { openFilePath: null });
        }
      }

      // Queue persisted render restore (applied once Three.js scene is ready)
      if (state.lastRender && state.lastRender.models.length > 0) {
        pendingRestoreRef.current = state.lastRender;
      }

      if (!cancelled) setWorkspaceLoaded(true);
    }
    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [projectHandle]);

  useEffect(() => {
    if (!projectHandle || !workspaceLoaded) return;
    if (fileBrowserFrac <= 0 || editorFrac <= 0 || viewerFrac <= 0) return;
    if (layoutSaveTimeoutRef.current) {
      window.clearTimeout(layoutSaveTimeoutRef.current);
    }
    layoutSaveTimeoutRef.current = window.setTimeout(() => {
      updateWorkspaceState(projectHandle.name, {
        layout: {
          fileBrowser: fileBrowserFrac,
          editor: editorFrac,
          viewer: viewerFrac,
        },
      });
    }, 200);
    return () => {
      if (layoutSaveTimeoutRef.current) {
        window.clearTimeout(layoutSaveTimeoutRef.current);
        layoutSaveTimeoutRef.current = null;
      }
    };
  }, [fileBrowserFrac, editorFrac, viewerFrac, projectHandle, workspaceLoaded]);

  // Persist open tabs and active index when they change
  const tabsSaveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!projectHandle || !workspaceLoaded) return;
    if (tabsSaveTimeoutRef.current) {
      window.clearTimeout(tabsSaveTimeoutRef.current);
    }
    tabsSaveTimeoutRef.current = window.setTimeout(() => {
      updateWorkspaceOpenTabs(
        projectHandle.name,
        tabManager.tabs.map((t) => ({ path: t.filePath, isPreview: t.isPreview })),
        tabManager.activeTabIndex
      );
    }, 200);
    return () => {
      if (tabsSaveTimeoutRef.current) {
        window.clearTimeout(tabsSaveTimeoutRef.current);
        tabsSaveTimeoutRef.current = null;
      }
    };
  }, [tabManager.tabs, tabManager.activeTabIndex, projectHandle, workspaceLoaded]);

  // Remember a selection only while its live editor contents are renderable.
  // If it later becomes invalid, keep the path so it can be revalidated when
  // used as a fallback.
  useEffect(() => {
    const path = tabManager.filePath;
    if (!path) return;
    try {
      if (!hasEnabledExports(tabManager.code)) return;
    } catch {
      return;
    }
    if (lastRenderableFilePathRef.current === path) return;

    lastRenderableFilePathRef.current = path;
    if (projectHandle && workspaceLoaded) {
      updateWorkspaceLastRenderableFile(projectHandle.name, path);
    }
  }, [
    tabManager.activeTabIndex,
    tabManager.filePath,
    tabManager.code,
    projectHandle,
    workspaceLoaded,
  ]);

  // Persist camera/orbit state via pointer events on viewer container
  // (debounced, leading + trailing, 500ms)
  const cameraSaveTimeoutRef = useRef<number | null>(null);
  const cameraSaveLeadingFiredRef = useRef(false);

  const persistCamera = useCallback(() => {
    const three = threeObjectsRef.current;
    const ctrl = orbitControlsRef.current;
    if (!three || !ctrl || !projectHandle) return;
    const cam: CameraState = {
      position: three.camera.position.toArray() as [number, number, number],
      fov: three.camera.fov,
      zoom: three.camera.zoom,
      orbitTarget: ctrl.target.toArray() as [number, number, number],
    };
    updateWorkspaceCameraState(projectHandle.name, cam);
  }, [projectHandle]);

  const onViewerPointerUp = useCallback(() => {
    if (!projectHandle || !workspaceLoaded || !renderedAtLeastOnce) return;
    // Leading edge: fire immediately on first interaction in a burst
    if (!cameraSaveLeadingFiredRef.current) {
      cameraSaveLeadingFiredRef.current = true;
      persistCamera();
    }
    // Trailing edge: reset timer, fire when idle
    if (cameraSaveTimeoutRef.current) {
      window.clearTimeout(cameraSaveTimeoutRef.current);
    }
    cameraSaveTimeoutRef.current = window.setTimeout(() => {
      cameraSaveLeadingFiredRef.current = false;
      persistCamera();
    }, 500);
  }, [projectHandle, workspaceLoaded, renderedAtLeastOnce, persistCamera]);

  const onViewerWheel = useCallback(() => {
    // Zoom via scroll wheel also changes camera
    if (!projectHandle || !workspaceLoaded || !renderedAtLeastOnce) return;
    if (cameraSaveTimeoutRef.current) {
      window.clearTimeout(cameraSaveTimeoutRef.current);
    }
    cameraSaveTimeoutRef.current = window.setTimeout(() => {
      cameraSaveLeadingFiredRef.current = false;
      persistCamera();
    }, 500);
  }, [projectHandle, workspaceLoaded, renderedAtLeastOnce, persistCamera]);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!state) return;
    const barW = resizeBarSVGHelper.getComputedWidth();
    const totalW = window.innerWidth;
    const freeW = totalW - 2 * barW;
    if (freeW <= 0) return;
    const minFbPx = MIN_PANE_FRAC.fileBrowser * freeW;
    const minEdPx = MIN_PANE_FRAC.editor * freeW;
    const minViewPx = MIN_PANE_FRAC.viewer * freeW;
    const dx = e.clientX - state.startX;
    const startFbPx = state.start.fileBrowser * freeW;
    const startEdPx = state.start.editor * freeW;
    const startViewPx = state.start.viewer * freeW;

    if (state.which === "fileBrowser") {
      const maxFbPx = freeW - startViewPx - minEdPx;
      const newFbPx = Math.max(minFbPx, Math.min(maxFbPx, startFbPx + dx));
      const newEdPx = freeW - startViewPx - newFbPx;
      setFileBrowserFrac(newFbPx / freeW);
      setEditorFrac(newEdPx / freeW);
      setViewerFrac(startViewPx / freeW);
    } else {
      const maxEdPx = freeW - startFbPx - minViewPx;
      const newEdPx = Math.max(minEdPx, Math.min(maxEdPx, startEdPx + dx));
      const newViewPx = freeW - startFbPx - newEdPx;
      setFileBrowserFrac(startFbPx / freeW);
      setEditorFrac(newEdPx / freeW);
      setViewerFrac(newViewPx / freeW);
    }
  }, []);

  const startResizing = useCallback(
    (which: "fileBrowser" | "editor") =>
      (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointerStateRef.current = {
          which,
          startX: e.clientX,
          start: { ...proportionsRef.current },
        };
      },
    []
  );

  const stopResizing = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerStateRef.current) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore if capture was lost
      }
      pointerStateRef.current = null;
    },
    []
  );

  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const threeObjectsRef = useRef<ThreeHandles | null>(null);

  useEffect(() => {
    consoleDivRef.current?.scrollTo({
      top: consoleDivRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const goToDefaultView = () => {
    const three = threeObjectsRef.current!;
    const bbox = new THREE.Box3();
    traverseSyncChildrenFirst(three.scene, (node) => {
      if (node instanceof THREE.Mesh && !node.userData.keep)
        bbox.expandByObject(node);
    });
    if (!bbox.isEmpty()) {
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist =
        (maxDim / (2 * Math.tan((three.camera.fov * Math.PI) / 360))) * 1.5;
      const offset = new THREE.Vector3(1, 1, 1)
        .normalize()
        .multiplyScalar(dist);
      three.camera.position.copy(center).add(offset);
      three.camera.lookAt(center);
      orbitControlsRef.current!.target.copy(center);
      orbitControlsRef.current!.update();
    }
  };

  const updateThreeScene = () => {
    const three = threeObjectsRef.current!;
    const { loader, partsGroup, scene } = three;
    partsGroup.clear();
    Object.entries(completedModelRef.current).forEach(([name, part]) => {
      if (!part.stl) return;
      try {
        const geom = loader.parse(
          copySharedBufferToArrayBuffer(part.stl.buffer)
        );
        geom.rotateX(-Math.PI / 2);
        emitUiLog("info", `Faceting "${name}"...`);
        const facets = determineFacets(geom);
        const triCount = geom.getAttribute("position").count / 3;
        const faceIDs = buildFaceIDArray(triCount, facets);
        console.log(`[Faceting] "${name}" faceIDs:`, Array.from(faceIDs));
        emitUiLog("info", `Faceted "${name}": ${facets.length} facet${facets.length !== 1 ? "s" : ""}`);
        const mat = new THREE.MeshPhongMaterial({
          color: getColorOrDefault(part.color),
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = name;
        mesh.castShadow = mesh.receiveShadow = true;
        partsGroup.add(mesh);

        const addOutline = (mode: "facets" | "triangles") => {
          const geo = buildOutlineGeometry(geom, faceIDs, mode);
          if (!geo) return;
          const m = new THREE.Mesh(geo, buildOutlineMaterial());
          // keep=true: excluded from partSettings visibility traversal;
          // still hidden automatically when the parent mesh is hidden.
          m.userData.keep = true;
          m.userData.isFacetOutline = mode === "facets";
          m.userData.isTriOutline   = mode === "triangles";
          m.visible = outlineMode === mode;
          mesh.add(m);
        };
        addOutline("facets");
        addOutline("triangles");
      } catch {
        // ignored
      }
    });
    if (!renderedAtLeastOnce) goToDefaultView();

    // Remove old axes and add new axes sized to bounding box (1.5× max dimension), with ticks every 5 units
    removeAxes(scene);
    const bbox = new THREE.Box3();
    traverseSyncChildrenFirst(scene, (node) => {
      if (node instanceof THREE.Mesh && !node.userData.keep) {
        bbox.expandByObject(node);
      }
    });
    if (!bbox.isEmpty()) {
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const axisLength = (maxDim / 2) * 1.5;
      const addAxis = (
        dir: THREE.Vector3,
        mainColor: THREE.Color,
        tickColor: THREE.Color,
        label: string,
        offset: THREE.Vector3
      ) => {
        createLabeledAxis({
          scene,
          direction: dir,
          length: axisLength,
          tickSpacing: 5,
          mainLineColor: mainColor,
          tickColor,
          labelText: label,
          labelFontSize: 4,
          labelOffset: offset,
          name: "__AXIS_" + label,
          visible: true,
        });
      };
      [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff0000, label: "+X" },
        { dir: new THREE.Vector3(0, 0, -1), color: 0x00ff00, label: "+Y" },
        { dir: new THREE.Vector3(0, 1, 0), color: 0x0000ff, label: "+Z" },
        { dir: new THREE.Vector3(-1, 0, 0), color: 0xffff00, label: "-X" },
        { dir: new THREE.Vector3(0, 0, 1), color: 0x00ffff, label: "-Y" },
        { dir: new THREE.Vector3(0, -1, 0), color: 0xff00ff, label: "-Z" },
      ].forEach(({ dir, color, label }) =>
        addAxis(
          dir,
          new THREE.Color(color),
          new THREE.Color(0x000000),
          label,
          new THREE.Vector3(0, 5, 0)
        )
      );
    }
  };

  const onThreeReady = useCallback(() => {
    const restore = pendingRestoreRef.current;
    if (!restore) return;
    pendingRestoreRef.current = null;

    // Rebuild completedModelRef from persisted data
    const rebuilt: Record<string, OpenSCADPartWithSTL> = {};
    for (const m of restore.models) {
      rebuilt[m.name] = {
        ownSourceCode: "",
        exported: m.exported,
        color: m.color,
        stl: new Uint8Array(m.stl),
      };
    }
    completedModelRef.current = rebuilt;
    setLastRenderedFile(restore.file);
    setLastRenderedBackend(restore.backend);
    setRenderedAtLeastOnce(true);

    // Rebuild part settings
    const ps: Record<string, PartSettings> = {};
    for (const m of restore.models) {
      ps[m.name] = { visible: true, exported: m.exported };
    }
    setPartSettings(ps);

    // Build the scene (without goToDefaultView — we'll restore camera manually)
    const three = threeObjectsRef.current;
    if (!three) return;
    const { loader, partsGroup, scene } = three;
    partsGroup.clear();
    Object.entries(rebuilt).forEach(([name, part]) => {
      if (!part.stl) return;
      try {
        const geom = loader.parse(
          copySharedBufferToArrayBuffer(part.stl.buffer)
        );
        geom.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshPhongMaterial({
          color: getColorOrDefault(part.color),
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = name;
        mesh.castShadow = mesh.receiveShadow = true;
        partsGroup.add(mesh);
      } catch {
        // ignored
      }
    });

    // Restore axes
    removeAxes(scene);
    const bbox = new THREE.Box3();
    traverseSyncChildrenFirst(scene, (node) => {
      if (node instanceof THREE.Mesh && !node.userData.keep)
        bbox.expandByObject(node);
    });
    if (!bbox.isEmpty()) {
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const axisLength = (maxDim / 2) * 1.5;
      const addAxis = (
        dir: THREE.Vector3,
        mainColor: THREE.Color,
        tickColor: THREE.Color,
        label: string,
        offset: THREE.Vector3
      ) => {
        createLabeledAxis({
          scene,
          direction: dir,
          length: axisLength,
          tickSpacing: 5,
          mainLineColor: mainColor,
          tickColor,
          labelText: label,
          labelFontSize: 4,
          labelOffset: offset,
          name: "__AXIS_" + label,
          visible: true,
        });
      };
      [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff0000, label: "+X" },
        { dir: new THREE.Vector3(0, 0, -1), color: 0x00ff00, label: "+Y" },
        { dir: new THREE.Vector3(0, 1, 0), color: 0x0000ff, label: "+Z" },
        { dir: new THREE.Vector3(-1, 0, 0), color: 0xffff00, label: "-X" },
        { dir: new THREE.Vector3(0, 0, 1), color: 0x00ffff, label: "-Y" },
        { dir: new THREE.Vector3(0, -1, 0), color: 0xff00ff, label: "-Z" },
      ].forEach(({ dir, color, label }) =>
        addAxis(
          dir,
          new THREE.Color(color),
          new THREE.Color(0x000000),
          label,
          new THREE.Vector3(0, 5, 0)
        )
      );
    }

    // Restore camera + orbit controls
    const cam = restore.camera;
    three.camera.position.set(...cam.position);
    three.camera.fov = cam.fov;
    three.camera.zoom = cam.zoom;
    three.camera.updateProjectionMatrix();
    if (orbitControlsRef.current) {
      orbitControlsRef.current.target.set(...cam.orbitTarget);
      orbitControlsRef.current.update();
    }
  }, []);

  // const log = (msg: string) =>
  //   setMessages((m) => [...m, msg].slice(-MAX_MESSAGES));
  const log = (msg: string) => {
    if(MAX_MESSAGES !== undefined) {
      setMessages((m) => [...m, msg].slice(-MAX_MESSAGES));
    }
    setMessages((m) => [...m, msg]);

  }
  const clearLogs = () => setMessages([]);

  const selectProject = async () => {
    try {
      const handle = await (
        window as object as {
          showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker();
      const perm = await (
        handle as object as {
          requestPermission: (options: {
            mode: "readwrite" | "read";
          }) => Promise<string>;
        }
      ).requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        await storeDirectoryHandle(handle);
        setProjectHandle(handle);
      }
    } catch (err) {
      log(`Failed to select project: ${formatError(err)}`);
    }
  };

  /**
   * Close the current project, clear stored handle, and return to initial state.
   */
  const closeProject = () => {
    setProjectHandle(null);
    clearStoredDirectoryHandle().catch((err) =>
      log(`Failed to clear stored directory handle: ${formatError(err)}`)
    );
  };

  const createNewFile = async () => {
    if (!projectHandle) return;
    const requestedName = window.prompt("New file name", "untitled.scad");
    if (requestedName === null) return;
    const filename = requestedName.trim();
    if (!filename || filename === "." || filename === ".." || /[\\/]/.test(filename)) {
      window.alert("Enter a file name without folder separators.");
      return;
    }

    try {
      try {
        await projectHandle.getFileHandle(filename);
        window.alert(`A file named \"${filename}\" already exists.`);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name !== "NotFoundError") throw err;
      }
      const handle = await projectHandle.getFileHandle(filename, { create: true });
      setFileBrowserRevision((revision) => revision + 1);
      await tabManager.openFilePermanent(handle, filename);
    } catch (err) {
      log(`Failed to create file: ${formatError(err)}`);
      window.alert(`Failed to create file: ${formatError(err)}`);
    }
  };

  const openFileFromBrowser = async (
    path: string,
    handle: FileSystemFileHandle
  ) => {
    await tabManager.openFilePreview(handle, path);
  };

  const openFileFromBrowserPermanent = async (
    path: string,
    handle: FileSystemFileHandle
  ) => {
    await tabManager.openFilePermanent(handle, path);
  };

  const updateVisibility = useCallback(() => {
    threeObjectsRef.current?.scene?.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.userData.keep) {
        child.visible = !!partSettings[child.name]?.visible;
      }
    });
  }, [partSettings]);

  useEffect(updateVisibility, [updateVisibility]);

  useEffect(() => {
    threeObjectsRef.current?.scene.traverse((child) => {
      if (child.userData.isFacetOutline) child.visible = outlineMode === "facets";
      if (child.userData.isTriOutline)   child.visible = outlineMode === "triangles";
    });
  }, [outlineMode]);

  useEffect(() => {
    return subscribeUiLog((entry) => {
      if (entry.level === "error") setLogPanelStatus("error");
      const prefix =
        entry.level === "error"
          ? "ERROR"
          : entry.level === "warn"
          ? "WARN"
          : "INFO";
      log(`${prefix}: ${entry.message}`);
    });
  }, [log]);

  const renderPartInWorker = (
    name: string,
    part: OpenSCADPart,
    backend: "Manifold" | "CGAL",
    vmFiles: Record<string, string | Uint8Array>,
    vmMainPath: string
  ) =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("./openscad.worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = (e) => {
        if (e.data.type === "log") log(`[${name}] ${e.data.message}`);
        else if (e.data.type === "debugfs") {
          if (!WRITE_VM_DEBUG) return;
          if (!projectHandle || fsaUnsupported) {
            log(`[${name}] Debug snapshot skipped (no project handle).`);
            return;
          }
          saveVmDebugSnapshot(projectHandle, name, e.data.snapshot).catch(
            (err) =>
              log(
                `[${name}] Failed to write debug snapshot: ${formatError(err)}`
              )
          );
        } else if (e.data.type === "result") {
          completedModelRef.current[name] = { ...part, stl: e.data.stl };
          log(`Rendered "${name}"`);
          w.terminate();
          resolve();
        } else if (e.data.type === "error") {
          log(`Error: ${formatError(e.data.error)}`);
          w.terminate();
          reject(e.data.error);
        }
      };
      w.onerror = (err) => {
        log(`Worker error: ${err.message}`);
        w.terminate();
        reject(err);
      };
      w.postMessage({
        command: "render",
        partName: name,
        part,
        backend,
        vmFiles,
        vmMainPath,
      });
    });

  const resolveRenderSource = async (): Promise<RenderSource | null> => {
    if (tabManager.filePath && tabManager.filename) {
      const currentParts = identifyParts(tabManager.code);
      if (Object.values(currentParts).some((part) => part.exported)) {
        return {
          code: tabManager.code,
          filePath: tabManager.filePath,
          filename: tabManager.filename,
          parts: currentParts,
        };
      }
    }

    const fallbackPath = lastRenderableFilePathRef.current;
    if (!fallbackPath || fallbackPath === tabManager.filePath) return null;

    // A still-open tab may outlive a file deleted or renamed on disk. Verify
    // project-backed fallbacks still exist before using their in-memory code.
    let fallbackHandle: FileSystemFileHandle | null = null;
    if (projectHandle) {
      fallbackHandle = await getFileHandleByPath(projectHandle, fallbackPath);
      if (!fallbackHandle) return null;
    }

    const openFallback = tabManager.tabs.find(
      (tab) => tab.filePath === fallbackPath
    );
    if (openFallback) {
      const parts = identifyParts(openFallback.code);
      if (!Object.values(parts).some((part) => part.exported)) return null;
      return {
        code: openFallback.code,
        filePath: openFallback.filePath,
        filename: openFallback.filename,
        parts,
      };
    }

    if (!fallbackHandle) return null;

    try {
      const code = await (await fallbackHandle.getFile()).text();
      const parts = identifyParts(code);
      if (!Object.values(parts).some((part) => part.exported)) return null;
      return {
        code,
        filePath: fallbackPath,
        filename: fallbackHandle.name,
        parts,
      };
    } catch {
      return null;
    }
  };

  const renderModel = async (backend: "Manifold" | "CGAL") => {
    if (isProcessing) return log("Already processing");
    clearLogs();
    setLogPanelStatus("processing");
    setIsProcessing(true);

    let source: RenderSource | null;
    try {
      source = await resolveRenderSource();
    } catch (err) {
      setLogPanelStatus("error");
      log(`ERROR: Failed to inspect exports: ${formatError(err)}`);
      setIsProcessing(false);
      return;
    }
    if (!source) {
      setLogPanelStatus("error");
      log(
        'ERROR: Current file has no exports. Add a "// @export" comment to render it.'
      );
      setIsProcessing(false);
      return;
    }

    const { code, filePath, parts } = source;
    Object.entries(parts).forEach(([n, p]) => {
      if (!(n in partSettings))
        partSettings[n] = { visible: true, exported: p.exported };
      else partSettings[n].exported = p.exported;
    });
    Object.keys(partSettings).forEach((n) => {
      if (!(n in parts)) delete partSettings[n];
    });
    setPartSettings({ ...partSettings });
    completedModelRef.current = {};
    if (filePath !== tabManager.filePath) {
      log(`Current file has no exports; rendering "${filePath}" instead.`);
    }
    log(`Found parts: ${Object.keys(parts).join(", ")}`);
    try {
      // Collect imports, fetch externals, rewrite paths — all on main thread
      const lspClient = lspClientRef.current;
      let vmFiles: Record<string, string | Uint8Array> = {};
      let vmMainPath = "/@/input.scad";
      if (lspClient && projectHandle) {
        const prepared = await collectAndPrepareVmFiles(
          lspClient,
          projectHandle,
          filePath,
          code,
          (msg) => log(msg)
        );
        vmFiles = prepared.vmFiles;
        vmMainPath = prepared.vmMainPath;
      } else {
        // Fallback: no LSP or no project — at minimum place main file
        const { toVmProjectPath, rewriteProjectImportsForVm } = await import("./utils/importUtils");
        vmMainPath = toVmProjectPath(filePath);
        vmFiles[vmMainPath] = rewriteProjectImportsForVm(code, filePath);
      }
      // Import rewriter for per-part source (only needed when we have a file path)
      const rewrite = (await import("./utils/importUtils")).rewriteProjectImportsForVm;

      for (const [n, p] of Object.entries(parts)) {
        if (!p.exported) continue;
        // Substitute main entry with this part's own source slice
        const partSource = rewrite(p.ownSourceCode, filePath);
        const partVmFiles = { ...vmFiles, [vmMainPath]: partSource };
        await renderPartInWorker(n, p, backend, partVmFiles, vmMainPath);
      }
      const renderedSourcePath = filePath;
      setRenderedAtLeastOnce(true);
      setLastRenderedFile(renderedSourcePath);
      setLastRenderedBackend(backend);
      log("Done");
      setLogPanelStatus("success");
      setPartSettings({ ...partSettings });
      updateThreeScene();

      // Persist model + camera state to IndexedDB (all-or-nothing)
      if (projectHandle) {
        let totalBytes = 0;
        for (const entry of Object.values(completedModelRef.current)) {
          if (entry.stl) totalBytes += entry.stl.byteLength;
        }
        if (totalBytes < MAX_MODEL_PERSIST_BYTES) {
          const three = threeObjectsRef.current;
          const controls = orbitControlsRef.current;
          const camera: CameraState | null =
            three && controls
              ? {
                  position: three.camera.position.toArray() as [number, number, number],
                  fov: three.camera.fov,
                  zoom: three.camera.zoom,
                  orbitTarget: controls.target.toArray() as [number, number, number],
                }
              : null;
          const models: PersistedModelEntry[] = Object.entries(
            completedModelRef.current
          )
            .filter(([, v]) => v.stl)
            .map(([name, v]) => ({
              name,
              stl: copySharedBufferToArrayBuffer(v.stl!.buffer),
              color: v.color,
              exported: v.exported,
            }));
          updateWorkspaceLastRender(projectHandle.name, {
            file: renderedSourcePath,
            backend,
            camera: camera ?? { position: [0, 0, 100], fov: 75, zoom: 1, orbitTarget: [0, 0, 0] },
            models,
          });
        } else {
          // Model too large — clear any stale persisted render
          updateWorkspaceLastRender(projectHandle.name, null);
        }
      }
    } catch (err) {
      setLogPanelStatus("error");
      log(`ERROR: Rendering failed: ${formatError(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPart = async (name: string) => {
    const part = completedModelRef.current[name];
    if (!part?.stl) {
      return alert(`${name} missing`);
    }

    // Make sure the bytes are backed by a regular ArrayBuffer (not SAB)
    const ab = copySharedBufferToArrayBuffer(part.stl.buffer);
    // Respect the original view window
    const bytes = new Uint8Array(ab, part.stl.byteOffset, part.stl.byteLength);

    // If File System Access API is unsupported or no project handle, fallback to browser download
    if (fsaUnsupported || !projectHandle) {
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.stl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      const exportsDir = await projectHandle.getDirectoryHandle("exports", {
        create: true,
      });
      const fileHandle = await exportsDir.getFileHandle(`${name}.stl`, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes); // <-- bytes is safe
      await writable.close();
    } catch (err) {
      alert(`Saving export failed: ${formatError(err)}`);
    }
  };

  return (
    <div className="app-shell">
      <MenuBar
        workspaceName={projectHandle?.name ?? null}
        onOpenWorkspace={selectProject}
        onCloseWorkspace={closeProject}
        onCreateFile={createNewFile}
        onSaveFile={tabManager.saveCurrentFile}
        onCloseFile={() => {
          if (tabManager.activeTabIndex >= 0) void tabManager.closeTab(tabManager.activeTabIndex);
        }}
        hasOpenFile={tabManager.activeTabIndex >= 0}
      />
      {!projectHandle ? (
        <Div
          width="100vw"
          flex="1"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap="16px"
          padding="0 32px"
        >
          <P textAlign="center" maxWidth="600px">
            DesignCSG works by using local folders to organize projects.
          </P>
          <P textAlign="center" maxWidth="600px">
            Select a folder by clicking the button below.
          </P>
          <P textAlign="center" maxWidth="600px">
            For new projects, create a new folder on your computer, then select
            it using the button below.
          </P>
          <Button fontSize="150%" padding="16px 32px" onClick={selectProject}>
            Select Project Folder
          </Button>
        </Div>
      ) : (
        <div
          style={{
            width: "100vw",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: `${fileBrowserFrac}fr ${resizeBarSVGHelper.getComputedWidth()}px ${editorFrac}fr ${resizeBarSVGHelper.getComputedWidth()}px ${viewerFrac}fr`,
          }}
        >
          <div
            style={{
              height: "100%",
              background: "#eee",
              display: "grid",
              gridTemplateRows: "1fr auto",
              gridTemplateColumns: "1fr",
              overflow: "hidden",
            }}
          >
            <div style={{ overflow: "auto" }}>
              <FileBrowser
                rootHandle={projectHandle}
                revision={fileBrowserRevision}
                onOpenFile={openFileFromBrowser}
                onOpenFilePermanent={openFileFromBrowserPermanent}
                openFilePath={tabManager.filePath}
              />
            </div>
            <Div padding="8px" borderTop="1px solid #ccc">
              <Button
                width="100%"
                border="1px solid #d0d0d0"
                borderRadius="6px"
                padding="6px"
                background="#fff7f7"
                color="#9b1c1c"
                onClick={async () => {
                  await clearWorkspaceState(projectHandle.name);
                  window.location.reload();
                }}
              >
                Clear Workspace State
              </Button>
            </Div>
          </div>
          <div
            style={resizeBarStyle}
            onPointerDown={startResizing("fileBrowser")}
            onPointerMove={onPointerMove}
            onPointerUp={stopResizing}
            onPointerCancel={stopResizing}
          />
          <div
            ref={editorContainerRef}
            style={{
              height: "100%",
              overflow: "hidden",
            }}
          >
            <EditorTab
              agent={tabManager}
              containerRef={editorContainerRef}
            />
          </div>
          <div
            style={resizeBarStyle}
            onPointerDown={startResizing("editor")}
            onPointerMove={onPointerMove}
            onPointerUp={stopResizing}
            onPointerCancel={stopResizing}
          />
          <div
            className="viewer-container"
            ref={viewerContainerRef}
            onPointerUp={onViewerPointerUp}
            onWheel={onViewerWheel}
            style={{
              height: "100%",
              display: "grid",
              gridTemplateRows: "auto 1.5fr 1fr",
              gridTemplateColumns: "1fr",
              overflow: "hidden",
            }}
          >
            <Div width="100%" display="flex" flexDirection="column" gap="0">
              <Div display="flex" gap="8px" padding="8px">
                <Button
                  disabled={isProcessing || !(tabManager.filename && isScadFile(tabManager.filename))}
                  flex={1}
                  fontSize="150%"
                  onClick={() => renderModel("Manifold")}
                >
                  Render (Manifold)
                </Button>
                <Button
                  disabled={isProcessing || !(tabManager.filename && isScadFile(tabManager.filename))}
                  flex={1}
                  fontSize="150%"
                  onClick={() => renderModel("CGAL")}
                >
                  Render (CGAL)
                </Button>
              </Div>
              {lastRenderedFile && (
                <Div
                  padding="2px 8px 4px"
                  fontSize="12px"
                  color="#666"
                  background="#f0f0f0"
                  borderBottom="1px solid #ddd"
                  textAlign="center"
                >
                  Last render: {lastRenderedFile} ({lastRenderedBackend})
                </Div>
              )}
            </Div>
            <Div
              width="100%"
              display="grid"
              gridTemplateColumns="1fr"
              height="100%"
              overflow="hidden"
            >
              <Div background="#aaa" position="relative">
                <Div
                  position="absolute"
                  top="8px"
                  left="8px"
                  zIndex={5}
                  background="rgba(255, 255, 255, 0.92)"
                  padding="8px"
                  borderRadius="6px"
                  boxShadow="0 2px 8px rgba(0, 0, 0, 0.2)"
                  minWidth="220px"
                  maxWidth="40%"
                  maxHeight="70%"
                  overflow="auto"
                >
                  <Div display="flex" alignItems="center" gap="8px">
                    <Button
                      width="1.5rem"
                      height="1.5rem"
                      onClick={() => setPartsPanelOpen(!partsPanelOpen)}
                    >
                      {partsPanelOpen ? (
                        <FaChevronUp style={{ fontSize: "0.8rem" }} />
                      ) : (
                        <FaChevronDown style={{ fontSize: "0.8rem" }} />
                      )}
                    </Button>
                    <H1
                      fontSize="1rem"
                      margin="0"
                      lineHeight="1.2"
                      color="#222"
                    >
                      Parts
                    </H1>
                    {!partsPanelOpen && (
                      <Div
                        background="#1e88e5"
                        color="white"
                        fontSize="0.75rem"
                        padding="2px 6px"
                        borderRadius="999px"
                        lineHeight="1"
                      >
                        {Object.keys(partSettings).length}
                      </Div>
                    )}
                  </Div>
                  {partsPanelOpen && (
                    <Div
                      marginTop="8px"
                      display="flex"
                      flexDirection="column"
                      gap="8px"
                    >
                      {Object.keys(partSettings).length ? (
                        Object.entries(partSettings).map(([name, s], i) => (
                          <Div
                            key={i}
                            display="flex"
                            alignItems="center"
                            gap="0.7em"
                          >
                            <Label
                              display="flex"
                              alignItems="center"
                              gap="0.7em"
                              color={!s.exported ? "#666" : undefined}
                            >
                              <Input
                                type="checkbox"
                                checked={s.visible}
                                onChange={() => {
                                  s.visible = !s.visible;
                                  setPartSettings({ ...partSettings });
                                }}
                              />
                              {s.exported ? name : `${name}(ignored)`}
                            </Label>
                            {completedModelRef.current[name]?.stl && (
                              <Button
                                width="1.25rem"
                                height="1.25rem"
                                onClick={() => downloadPart(name)}
                              >
                                <FaFileDownload
                                  style={{ fontSize: "0.75rem" }}
                                />
                              </Button>
                            )}
                          </Div>
                        ))
                      ) : (
                        <I>No parts yet.</I>
                      )}
                    </Div>
                  )}
                </Div>
                <ThreeViewer
                  handleRef={threeObjectsRef}
                  controlsRef={orbitControlsRef}
                  onReady={onThreeReady}
                />
                <Div
                  position="absolute"
                  top="8px"
                  right="8px"
                  zIndex={5}
                  display="flex"
                  gap="2px"
                  background="rgba(255,255,255,0.92)"
                  padding="3px"
                  borderRadius="6px"
                  boxShadow="0 2px 8px rgba(0,0,0,0.2)"
                >
                  {(["facets", "triangles"] as const).map((mode) => (
                    <Button
                      key={mode}
                      onClick={() => setOutlineMode(mode)}
                      fontSize="0.7rem"
                      padding="3px 8px"
                      borderRadius="4px"
                      border="none"
                      cursor="pointer"
                      background={outlineMode === mode ? "#1e88e5" : "transparent"}
                      color={outlineMode === mode ? "white" : "#444"}
                      fontWeight={outlineMode === mode ? "bold" : "normal"}
                    >
                      {mode === "facets" ? "Facets" : "Triangles"}
                    </Button>
                  ))}
                </Div>
                <Div
                  position="absolute"
                  top={0}
                  left={0}
                  right={0}
                  bottom={0}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  pointerEvents={isProcessing ? "auto" : "none"}
                  opacity={isProcessing ? 1 : 0}
                  transition="opacity .5s"
                >
                  <Div
                    width="48px"
                    height="48px"
                    css={css`
                      border-radius: 50%;
                      border: 4px solid blue;
                      border-top: 4px solid transparent;
                      animation: ${spinnerAnimation} 2s linear infinite;
                    `}
                  />
                </Div>
                <Div
                  position="absolute"
                  top={0}
                  left={0}
                  right={0}
                  bottom={0}
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  pointerEvents={
                    renderedAtLeastOnce || isProcessing ? "none" : "auto"
                  }
                  opacity={renderedAtLeastOnce || isProcessing ? 0 : 1}
                  transition="opacity .5s"
                >
                  <H1 color="darkblue" textAlign="center">
                    Nothing to show.
                  </H1>
                  <H1 color="darkblue" textAlign="center">
                    Press "Render" to start.
                  </H1>
                </Div>
                <Div
                  position="absolute"
                  bottom={0}
                  right={0}
                  display="flex"
                  gap="8px"
                  padding="8px"
                >
                  <Button
                    onClick={goToDefaultView}
                    width="2.5rem"
                    height="2.5rem"
                    borderRadius="50%"
                  >
                    <FaHome style={{ fontSize: "1.5rem" }} />
                  </Button>
                </Div>
              </Div>
            </Div>
            <Div
              ref={consoleDivRef}
              overflow="auto"
              whiteSpace="pre-wrap"
              background={LOG_PANEL_BACKGROUNDS[logPanelStatus]}
              color="#222"
              fontFamily="'Fira Code', monospace"
              width="100%"
              css={css`
                transition: background-color 160ms ease;
              `}
            >
              {messages.join("\n") + "\n"}
            </Div>
          </div>
        </div>
      )}
      <Div
        position="fixed"
        width="100vw"
        height="100vh"
        zIndex={9999}
        background="black"
        display={fsaUnsupported ? "flex" : "none"}
        alignItems="center"
        justifyContent="center"
      >
        <Div
          background="white"
          padding="8px"
          display="flex"
          flexDirection="column"
          alignItems="stretch"
        >
          <H1 color="red" textAlign="center">
            Your browser is too old!
          </H1>
          <P textAlign="center">The File System Access API isn't supported.</P>
          <P textAlign="center">Upgrade to a modern browser.</P>
        </Div>
      </Div>
    </div>
  );
}
