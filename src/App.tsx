import { useCallback, useEffect, useRef, useState } from "react";
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

import { FaHome, FaFileDownload } from "react-icons/fa";
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
import {
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
} from "./utils/fsaUtils";

const resizeBarSVGHelper = new ResizeSvgHelper({
  arrowHeadWidth: 12,
  arrowHeadLength: 4,
  shaftWidth: 2,
  shaftLength: 2,
  paddingX: 2,
  paddingY: 2,
});
const resizeBarSVGUri = resizeBarSVGHelper.getDataUri("#000");

const resizeBarStyle = {
  // Because the computed width and height include padding,
  // The tiling and centering end up pleasing
  width: `${resizeBarSVGHelper.getComputedWidth()}px`,
  cursor: "col-resize",
  backgroundColor: "#e0f7ff",
  backgroundImage: `url("${resizeBarSVGUri}")`,
  backgroundRepeat: "repeat-y",
  backgroundPosition: "center",
  // Because the computed width and height include padding,
  // The tiling and centering end up pleasing
  backgroundSize: `${resizeBarSVGHelper.getComputedWidth()}px ${resizeBarSVGHelper.getComputedHeight()}px`,
};

const MAX_MESSAGES = 200;
type OpenSCADPartWithSTL = OpenSCADPart & { stl?: Uint8Array };
type PartSettings = { visible: boolean; exported: boolean };

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
  const completedModelRef = useRef<Record<string, OpenSCADPartWithSTL>>({});
  const [partSettings, setPartSettings] = useState<
    Record<string, PartSettings>
  >({});

  const editorTabAgent = useEditorTabAgent({ code, setCode });
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  const FILE_BROWSER_WIDTH = 200;
  // Split pane widths are managed manually
  const resizingRef = useRef<'fileBrowser' | 'editor' | null>(null);
  const [fileBrowserWidth, setFileBrowserWidth] = useState<number>(FILE_BROWSER_WIDTH);
  const [editorWidth, setEditorWidth] = useState<number>(0);

  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  const [projectHandle, setProjectHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    if (editorWidth === 0 && windowWidth) {
      setEditorWidth(Math.floor(windowWidth * 0.5));
    }
  }, [windowWidth, editorWidth]);

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
    const onMove = (e: MouseEvent) => {
      const which = resizingRef.current;
      if (!which) return;
      const min = 100;
      const max = window.innerWidth - 100;
      const newSize = Math.min(max, Math.max(min, e.clientX));
      if (which === "fileBrowser") {
        setFileBrowserWidth(newSize);
      } else if (which === "editor") {
        setEditorWidth(newSize);
      }
    };
    const stop = () => {
      resizingRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
  }, []);

  const startResizing = useCallback((which: "fileBrowser" | "editor") => {
    resizingRef.current = which;
  }, []);

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

  const selectProject = async () => {
    try {
      const handle = await (window as object as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker();
      const perm = await (handle as object as {
        requestPermission: (options: { mode: "readwrite" | "read" }) => Promise<string>;
      }).requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        await storeDirectoryHandle(handle);
        setProjectHandle(handle);
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Close the current project, clear stored handle, and return to initial state.
   */
  const closeProject = () => {
    setProjectHandle(null);
    clearStoredDirectoryHandle().catch((err) =>
      console.error("Failed to clear stored directory handle:", err)
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

  const log = (msg: string) =>
    setMessages((m) => [...m, msg].slice(-MAX_MESSAGES));
  const clearLogs = () => setMessages([]);

  const renderPartInWorker = (
    name: string,
    part: OpenSCADPart,
    backend: "Manifold" | "CGAL",
    path: string,
    extraFiles: Record<string, string>
  ) =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("./openscad.worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = (e) => {
        if (e.data.type === "log") log(`[${name}] ${e.data.message}`);
        else if (e.data.type === "result") {
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
      if (projectHandle && editorTabAgent.filePath) {
        extraFiles = await collectImports(projectHandle, editorTabAgent.filePath);
      }
      for (const [n, p] of Object.entries(parts))
        if (p.exported)
          await renderPartInWorker(
            n,
            p,
            backend,
            editorTabAgent.filePath || "input.scad",
            extraFiles
          );
      setRenderedAtLeastOnce(true);
      log("Done");
      setPartSettings({ ...partSettings });
      updateThreeScene();

    } catch (err) {
      console.error(err)
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
    // If File System Access API is unsupported or no project handle, fallback to browser download
    if (fsaUnsupported || !projectHandle) {
      const url = URL.createObjectURL(new Blob([part.stl]));
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
      await writable.write(part.stl);
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
            SCADFriend works by using folders to organize projects. Select a folder by clicking the button below.
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
            display: "flex",
          }}
        >
        <div
          style={{
            width: fileBrowserWidth,
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
              />
            </div>
        </div>
        <div style={resizeBarStyle} onMouseDown={() => startResizing("fileBrowser")} />
        <div
            ref={editorContainerRef}
            style={{
              height: "100%",
              overflow: "auto",
              background: "#f5f5f5",
              padding: "8px",
              width: `${editorWidth}px`,
            }}
          >
            <EditorTab
              agent={editorTabAgent}
              containerRef={editorContainerRef}
            />
          </div>
          <div style={resizeBarStyle} onMouseDown={() => startResizing("editor")} />
          <div
            className="viewer-container"
            ref={viewerContainerRef}
            style={{
              flex: 1,
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
                Preview
              </Button>
              <Button
                disabled={isProcessing}
                flex={1}
                fontSize="150%"
                onClick={() => renderModel("CGAL")}
              >
                Render
              </Button>
            </Div>
            <Div
              width="100%"
              display="grid"
              gridTemplateColumns="1.5fr 3fr"
              height="100%"
              overflow="hidden"
            >
              <Div
                background="white"
                padding="8px"
                display="flex"
                flexDirection="column"
                gap="8px"
              >
                {Object.keys(partSettings).length ? (
                  Object.entries(partSettings).map(([name, s], i) => (
                    <Div key={i} display="flex" alignItems="center" gap="0.7em">
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
                          <FaFileDownload style={{ fontSize: "0.75rem" }} />
                        </Button>
                      )}
                    </Div>
                  ))
                ) : (
                  <I>No parts yet.</I>
                )}
              </Div>
              <Div background="#aaa" position="relative">
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
          <P textAlign="center">
            The File System Access API isn't supported.
          </P>
          <P textAlign="center">Upgrade to a modern browser.</P>
        </Div>
      </Div>
    </>
  );
}
