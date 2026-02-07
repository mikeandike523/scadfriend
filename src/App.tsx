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
import useEditorTabAgent from "./hooks/useEditorTabAgent";
import useFSAUnsupported from "./hooks/useFSAUnsupported";
import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import { identifyParts, OpenSCADPart } from "./openscad-parsing";
import { createLabeledAxis, removeAxes } from "./AxisVisualizer";
import { formatError } from "./utils/serialization";
import ResizeSvgHelper from "./utils/ResizeSVGHelper";
import ThreeViewer, { ThreeHandles } from "./components/ThreeViewer";
import { collectImports } from "./utils/importUtils";
import { subscribeUiLog } from "./utils/uiLogger";
import {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
  getFileHandleByPath,
  loadWorkspaceState,
  updateWorkspaceState,
  warnOnce,
} from "./utils/fsaUtils";
import { saveVmDebugSnapshot } from "./utils/debugSnapshot";

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
  const fsaUnsupported = useFSAUnsupported();

  const consoleDivRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderedAtLeastOnce, setRenderedAtLeastOnce] = useState(false);
  const [partsPanelOpen, setPartsPanelOpen] = useState(true);
  const completedModelRef = useRef<Record<string, OpenSCADPartWithSTL>>({});
  const [partSettings, setPartSettings] = useState<
    Record<string, PartSettings>
  >({});

  const editorTabAgent = useEditorTabAgent({ code, setCode });
  const openFileHandleRef = useRef(editorTabAgent.openFileHandle);
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
    openFileHandleRef.current = editorTabAgent.openFileHandle;
  }, [editorTabAgent.openFileHandle]);

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
      if(!projectHandle) return;
      const state = await loadWorkspaceState(projectHandle.name);
      if (cancelled) return;

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

      const openFilePath =
        typeof state.openFilePath === "string" ? state.openFilePath : null;
      if (state.openFilePath && !openFilePath) {
        warnOnce(
          `workspace-openFile-${projectHandle.name}`,
          `Workspace state: invalid open file for "${projectHandle.name}". Clearing open file.`
        );
        updateWorkspaceState(projectHandle.name, { openFilePath: null });
      }
      if (openFilePath) {
        const handle = await getFileHandleByPath(
          projectHandle,
          openFilePath
        );
        if (cancelled) return;
        if (handle) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const perm = await (handle as any).queryPermission?.({
              mode: "read",
            });
            if (perm && perm !== "granted") {
              warnOnce(
                `workspace-openFile-perm-${projectHandle.name}`,
                `Workspace state: missing permission to open "${openFilePath}" in "${projectHandle.name}". Clearing open file.`
              );
              updateWorkspaceState(projectHandle.name, { openFilePath: null });
            } else {
              await openFileHandleRef.current(handle, openFilePath);
            }
          } catch {
            warnOnce(
              `workspace-openFile-perm-${projectHandle.name}`,
              `Workspace state: unable to verify permission for "${openFilePath}" in "${projectHandle.name}". Clearing open file.`
            );
            updateWorkspaceState(projectHandle.name, { openFilePath: null });
          }
        } else {
          warnOnce(
            `workspace-openFile-${projectHandle.name}`,
            `Workspace state: missing file "${openFilePath}" in "${projectHandle.name}". Clearing open file.`
          );
          updateWorkspaceState(projectHandle.name, { openFilePath: null });
        }
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

  useEffect(() => {
    if (!projectHandle || !workspaceLoaded) return;
    updateWorkspaceState(projectHandle.name, {
      openFilePath: editorTabAgent.filePath ?? null,
    });
  }, [editorTabAgent.filePath, projectHandle, workspaceLoaded]);

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

  const openFileFromBrowser = async (
    path: string,
    handle: FileSystemFileHandle
  ) => {
    await editorTabAgent.openFileHandle(handle, path);
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
    return subscribeUiLog((entry) => {
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
    path: string,
    extraFiles: Record<string, string | Uint8Array>,
    externalImports: string[]
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
        path,
        extraFiles,
        externalImports,
      });
    });

  const renderModel = async (backend: "Manifold" | "CGAL") => {
    if (isProcessing) return log("Already processing");
    const parts = identifyParts(code);
    if (!Object.keys(parts).length)
      return alert('No parts exported. Use "// @export".');
    Object.entries(parts).forEach(([n, p]) => {
      if (!(n in partSettings))
        partSettings[n] = { visible: true, exported: p.exported };
      else partSettings[n].exported = p.exported;
    });
    Object.keys(partSettings).forEach((n) => {
      if (!(n in parts)) delete partSettings[n];
    });
    setPartSettings({ ...partSettings });
    clearLogs();
    setIsProcessing(true);
    completedModelRef.current = {};
    log(`Found parts: ${Object.keys(parts).join(", ")}`);
    try {
      // Collect .scad and .stl imports to upload into the worker VM
      let extraFiles: Record<string, string | Uint8Array> = {};
      let externalImports: string[] = [];
      if (projectHandle && editorTabAgent.filePath) {
        const collected = await collectImports(
          projectHandle,
          editorTabAgent.filePath
        );
        extraFiles = collected.files;
        externalImports = collected.externalImports;
      }
      for (const [n, p] of Object.entries(parts))
        if (p.exported)
          await renderPartInWorker(
            n,
            p,
            backend,
            editorTabAgent.filePath || "input.scad",
            extraFiles,
            externalImports
          );
      setRenderedAtLeastOnce(true);
      log("Done");
      setPartSettings({ ...partSettings });
      updateThreeScene();
    } catch (err) {
      alert("Rendering failed");
      log(`Fail: ${formatError(err)}`);
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
    <>
      {!projectHandle ? (
        <Div
          width="100vw"
          height="100vh"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap="16px"
          padding="0 32px"
        >
          <P textAlign="center" maxWidth="600px">
            SCADFriend works by using local folders to organize projects.
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
            height: "100vh",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: `${fileBrowserFrac}fr ${resizeBarSVGHelper.getComputedWidth()}px ${editorFrac}fr ${resizeBarSVGHelper.getComputedWidth()}px ${viewerFrac}fr`,
          }}
        >
          <div
            style={{
              height: "100%",
              background: "#eee",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Div
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              padding="8px"
              background="#ddd"
            >
              <P margin="0" fontWeight="bold">
                {projectHandle.name}
              </P>
              <Button onClick={closeProject}>Close Project</Button>
            </Div>
            <div style={{ flex: 1, overflow: "auto" }}>
              <FileBrowser
                rootHandle={projectHandle}
                onOpenFile={openFileFromBrowser}
                openFilePath={editorTabAgent.filePath}
              />
            </div>
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
              overflow: "auto",
              background: "#f5f5f5",
              padding: "8px",
            }}
          >
            <EditorTab
              agent={editorTabAgent}
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
            style={{
              height: "100%",
              display: "grid",
              gridTemplateRows: "auto 1.5fr 1fr",
              gridTemplateColumns: "1fr",
              overflow: "hidden",
            }}
          >
            <Div width="100%" display="flex" gap="8px" padding="8px">
              <Button
                disabled={isProcessing}
                flex={1}
                fontSize="150%"
                onClick={() => renderModel("Manifold")}
              >
                Render (Manifold)
              </Button>
              <Button
                disabled={isProcessing}
                flex={1}
                fontSize="150%"
                onClick={() => renderModel("CGAL")}
              >
                Render (CGAL)
              </Button>
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
                />
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
              background="darkgreen"
              color="white"
              fontFamily="'Fira Code', monospace"
              width="100%"
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
    </>
  );
}
