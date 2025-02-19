// App.tsx
import { css, keyframes } from "@emotion/react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { Button, Div } from "style-props-html";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import Color from "color";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

import "./App.css";
import exampleCode from "./assets/example.scad?raw";
import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import { identifyParts, OpenSCADPart } from "./openscad-parsing";

const MAX_MESSAGES = 200;
const LOCAL_STORAGE_KEY = "openscad-code";

type OpenSCADPartWithSTL = OpenSCADPart & { stl?: Uint8Array };

function rgbaByteToInt(r: number, g: number, b: number, a: number) {
  return (a << 24) | (r << 16) | (g << 8) | b;
}

/**
 * Takes some valid CSS color string and converts it to an RGBA integer.
 */
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

function App() {
  useRegisterOpenSCADLanguage();
  const consoleDivRef = useRef<HTMLDivElement>(null);
  // This ref points to the viewer pane (our Three.js container)
  const viewerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [editorValue, setEditorValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  // For later export, we keep the completed parts in a ref.
  const completedModelRef = useRef<{ [name: string]: OpenSCADPartWithSTL }>({});

  // Create a ref to store the OrbitControls instance.
  const orbitControlsRef = useRef<OrbitControls | null>(null);

  // Create a ref for Three.js objects so that they are only initialized once.
  const threeObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    loader: STLLoader;
  } | null>(null);

  if (!threeObjectsRef.current) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    const loader = new STLLoader();
    threeObjectsRef.current = { scene, camera, renderer, loader };
  }

  // Append Three.js canvas to the viewer ref.
  useEffect(() => {
    const threeObjects = threeObjectsRef.current;
    if (viewerRef.current && threeObjects) {
      const { renderer, camera } = threeObjects;
      const { width: clientWidth, height: clientHeight } =
        viewerRef.current.getBoundingClientRect();
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      viewerRef.current.appendChild(renderer.domElement);
      orbitControlsRef.current = new OrbitControls(camera, renderer.domElement);
      orbitControlsRef.current.enableDamping = true;
      orbitControlsRef.current.dampingFactor = 0.05;
    }
    const current = viewerRef.current;
    return () => {
      if (orbitControlsRef.current) {
        orbitControlsRef.current.dispose();
        orbitControlsRef.current = null;
      }
      if (
        current &&
        threeObjects &&
        threeObjects.renderer.domElement.parentElement === current
      ) {
        current.removeChild(threeObjects.renderer.domElement);
      }
    };
  }, []);

  // Three.js animation loop.
  useEffect(() => {
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControlsRef.current?.update();
      if (threeObjectsRef.current) {
        threeObjectsRef.current.renderer.render(
          threeObjectsRef.current.scene,
          threeObjectsRef.current.camera
        );
      }
    };
    animate();
  }, []);

  // Update the Three.js scene by adding rendered parts.
  const updateThreeScene = () => {
    const threeObjects = threeObjectsRef.current;
    if (!threeObjects) return;

    const { scene, loader, camera } = threeObjects;

    function traverseSyncChildrenFirst(
      node: THREE.Object3D,
      callback: (node: THREE.Object3D) => void
    ) {
      for (const child of node.children) {
        traverseSyncChildrenFirst(child, callback);
      }
      callback(node);
    }

    traverseSyncChildrenFirst(scene, (node: THREE.Object3D) => {
      if (node instanceof THREE.Mesh) {
        scene.remove(node);
      }
    });

    for (const child of scene.children) {
      if (child instanceof THREE.Mesh) {
        scene.remove(child);
      }
    }

    // Add new mesh for each completed part.
    Object.entries(completedModelRef.current).forEach(([name, part]) => {
      if (part.stl) {
        try {
          const geometry = loader.parse(part.stl.buffer);
          const material = new THREE.MeshBasicMaterial({
            color: getColorOrDefault(part.color),
          });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
        } catch (error) {
          console.error(`Error parsing STL for part "${name}":`, error);
        }
      }
    });
    const bbox = new THREE.Box3();
    traverseSyncChildrenFirst(scene, (node: THREE.Object3D) => {
      if (node instanceof THREE.Mesh) {
        bbox.expandByObject(node);
      }
    });
    if (!bbox.isEmpty()) {
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
      cameraDistance *= 1.5;
      const offset = new THREE.Vector3(1, 1, 1)
        .normalize()
        .multiplyScalar(cameraDistance);
      camera.position.copy(center).add(offset);
      camera.lookAt(center);
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(center);
        orbitControlsRef.current.update();
      }
    }
  };

  const handleEditorDidMount: OnMount = (editor) => {
    const savedCode = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedCode) {
      editor.setValue(savedCode);
      setEditorValue(savedCode);
    } else {
      editor.setValue(exampleCode);
      setEditorValue(exampleCode);
    }
    const model = editor.getModel();
    if (model) {
      const lastLineNumber = model.getLineCount();
      const lastLineLength = model.getLineLength(lastLineNumber);
      editor.setPosition({
        lineNumber: lastLineNumber,
        column: lastLineLength + 1,
      });
      editor.focus();
    }
  };

  const log = (message: string) => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages, message];
      if (newMessages.length > MAX_MESSAGES) {
        newMessages.shift();
      }
      return newMessages;
    });
    consoleDivRef.current?.scrollTo({
      top: consoleDivRef.current?.scrollHeight,
      behavior: "smooth",
    });
  };

  const clearLogs = () => {
    setMessages([]);
  };

  /**
   * Offloads rendering for a given part to a worker.
   */
  const renderPartInWorker = (partName: string, part: OpenSCADPart) => {
    return new Promise<void>((resolve, reject) => {
      // Create a new worker using Vite’s built-in worker support.
      const worker = new Worker(
        new URL("./openscad.worker.ts", import.meta.url),
        { type: "module" }
      );

      // Listen for messages from the worker.
      worker.onmessage = (event) => {
        const data = event.data;
        if (data.type === "log") {
          log(`[${partName}] ${data.message}`);
        } else if (data.type === "result") {
          completedModelRef.current[partName] = { ...part, stl: data.stl };
          log(`Render completed for part: "${partName}".`);
          worker.terminate();
          resolve();
        } else if (data.type === "error") {
          log(`Error rendering part ${partName}: ${data.error}`);
          worker.terminate();
          reject(new Error(data.error));
        }
      };

      worker.onerror = (err) => {
        log(`Worker error rendering part ${partName}: ${err.message}`);
        worker.terminate();
        reject(err);
      };

      // Post the render command to the worker.
      worker.postMessage({ command: "render", partName, part });
    });
  };

  /**
   * Initiates rendering of all detected parts by delegating to the worker.
   */
  const renderModel = async () => {
    if (isProcessing) {
      log("Already processing, please wait...");
      return;
    }
    setIsProcessing(true);
    clearLogs();
    completedModelRef.current = {};

    const detectedParts = identifyParts(editorValue);
    log(`Found Parts: ${Object.keys(detectedParts).join(", ")}`);

    try {
      // Process parts sequentially (you can also do this concurrently if desired).
      for (const [name, part] of Object.entries(detectedParts)) {
        await renderPartInWorker(name, part);
      }
      log("Rendering complete.");
      updateThreeScene();
    } catch (error) {
      log(`Rendering failed: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Div
      display="flex"
      flexDirection="row"
      alignItems="flex-start"
      justifyContent="flex-start"
      height="100%"
    >
      <Div height="100%" flex={1.5}>
        <Editor
          options={{
            fontSize: 18,
            fontFamily: "'Fira Code', monospace",
            fontLigatures: true,
            fontWeight: "400",
            renderWhitespace: "all",
            minimap: { enabled: false },
          }}
          defaultLanguage="openscad"
          defaultValue={"// Loading..."}
          theme="openscad-theme"
          onMount={handleEditorDidMount}
          onChange={(value) => {
            if (typeof value === "string") {
              if (value === "") {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
              } else {
                localStorage.setItem(LOCAL_STORAGE_KEY, value);
              }
            } else {
              localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
            setEditorValue(value ?? "");
          }}
        />
      </Div>
      <Div
        height="100%"
        flex={1}
        display="grid"
        gridTemplateRows="auto 1fr 1fr"
        gridTemplateColumns="1fr"
      >
        {/* Render Controls */}
        <Div display="flex" flexDirection="row" gap="8px" padding="8px">
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={renderModel}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Render
          </Button>
        </Div>
        {/* Three.js Model Viewer */}
        <Div
          background="skyblue"
          position="relative"
          width="100%"
          height="100%"
        >
          <Div ref={viewerRef} width="100%" height="100%"></Div>
          <Div
            position="absolute"
            top="0"
            left="0"
            right="0"
            bottom="0"
            display="flex"
            pointerEvents={isProcessing ? "auto" : "none"}
            opacity={isProcessing ? 1 : 0}
            transition="opacity 0.5s ease-in-out"
            alignItems="center"
            justifyContent="center"
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
            ></Div>
          </Div>
        </Div>
        {/* Console Output */}
        <Div
          ref={consoleDivRef}
          overflow="auto"
          whiteSpace="pre-wrap"
          background="darkgreen"
          color="white"
          fontFamily="'Fira Code', monospace"
        >
          {messages.join("\n") + "\n"}
        </Div>
      </Div>
    </Div>
  );
}

export default App;
