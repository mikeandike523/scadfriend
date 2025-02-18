import Editor, { OnMount } from "@monaco-editor/react";
import { useRef, useState, useEffect, useMemo } from "react";
import { Button, Div } from "style-props-html";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import Color from "color";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

import "./App.css";
import exampleCode from "./assets/example.scad?raw";
import OpenSCAD from "./openscad";
import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import { identifyParts, OpenSCADPart } from "./openscad-parsing";

const MAX_MESSAGES = 200;
const LOCAL_STORAGE_KEY = "openscad-code";

type OpenSCADPartWithSTL = OpenSCADPart & { stl?: Uint8Array };

function rgbaByteToInt(r: number, g: number, b: number, a: number) {
  return (a << 24) | (r << 16) | (g << 8) | b;
}

/**
 *
 * Takes some valid css color string and converts to an RGBA integer
 *
 * @param colorString
 * @param defaultColor
 */
function getColorOrDefault(
  colorString: string | undefined,
  defaultColor = 0xff00ffff
): number {
  if (!colorString) return defaultColor;
  const color = Color(colorString);
  const { r, g, b, a } = color.object();
  return rgbaByteToInt(
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255),
    Math.round(a * 255)
  );
}

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

  // Create persistent Three.js objects (scene, camera, renderer, and STLLoader) using useMemo.
  const threeObjects = useMemo(() => {
    // Create the scene and set a background color.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);
    // Add basic lights.
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 0, 1);
    scene.add(directionalLight);

    // Create the camera.
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);

    // Create the renderer.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // The size will be set once the viewer pane mounts.

    // Create the STL loader.
    const loader = new STLLoader();

    return { scene, camera, renderer, loader };
  }, []);

  // When the viewer pane (Div) mounts, append the Three.js renderer's DOM element.
  useEffect(() => {
    if (viewerRef.current) {
      const { clientWidth, clientHeight } = viewerRef.current;
      threeObjects.renderer.setSize(clientWidth, clientHeight);
      // Update the camera aspect ratio.
      threeObjects.camera.aspect = clientWidth / clientHeight;
      threeObjects.camera.updateProjectionMatrix();
      viewerRef.current.appendChild(threeObjects.renderer.domElement);

      // Initialize OrbitControls on the camera and renderer DOM element.
      orbitControlsRef.current = new OrbitControls(
        threeObjects.camera,
        threeObjects.renderer.domElement
      );
      // Optional: enable damping (inertia) for smoother controls.
      orbitControlsRef.current.enableDamping = true;
      orbitControlsRef.current.dampingFactor = 0.05;
    }
    const current = viewerRef.current;
    return () => {
      // Dispose OrbitControls on unmount.
      if (orbitControlsRef.current) {
        orbitControlsRef.current.dispose();
        orbitControlsRef.current = null;
      }
      if (
        current &&
        threeObjects.renderer.domElement.parentElement === current
      ) {
        current.removeChild(threeObjects.renderer.domElement);
      }
    };
  }, [threeObjects.renderer, threeObjects.camera]);

  // Animation loop.
  useEffect(() => {
    const animate = () => {
      requestAnimationFrame(animate);
      // Update orbit controls (if damping is enabled).
      orbitControlsRef.current?.update();
      threeObjects.renderer.render(threeObjects.scene, threeObjects.camera);
    };
    animate();
  }, [threeObjects.renderer, threeObjects.scene, threeObjects.camera]);

  // Update the Three.js scene by clearing existing meshes and adding new ones.
  const updateThreeScene = () => {
    const { scene, loader, camera } = threeObjects;

    // Remove existing meshes (but keep lights and other scene objects).
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        scene.remove(child);
      }
    });

    // Add a new mesh for each completed part.
    Object.entries(completedModelRef.current).forEach(([name, part]) => {
      if (part.stl) {
        try {
          // Parse the STL binary data into a geometry.
          const geometry = loader.parse(part.stl.buffer);
          // You can adjust the color here. For now, we use the part color.
          const material = new THREE.MeshPhongMaterial({
            color: getColorOrDefault(part.color),
          });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
        } catch (error) {
          console.error(`Error parsing STL for part "${name}":`, error);
        }
      }
    });

    // Compute the bounding box of all meshes in the scene.
    const bbox = new THREE.Box3();
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        bbox.expandByObject(child);
      }
    });
    if (!bbox.isEmpty()) {
      // Get the center and size of the bounding box.
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      // Determine the maximum dimension.
      const maxDim = Math.max(size.x, size.y, size.z);
      // Compute the camera distance based on the fov and max dimension.
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
      // Add an extra margin.
      cameraDistance *= 1.5;
      // For a 3/4 view, offset the camera in all axes.
      const offset = new THREE.Vector3(1, 1, 1)
        .normalize()
        .multiplyScalar(cameraDistance);
      camera.position.copy(center).add(offset);
      camera.lookAt(center);
      // Update OrbitControls' target.
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(center);
        orbitControlsRef.current.update();
      }
    }
  };

  const handleEditorDidMount: OnMount = (editor) => {
    // Load code from localStorage when the editor mounts.
    const savedCode = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedCode) {
      editor.setValue(savedCode);
      setEditorValue(savedCode);
    } else {
      editor.setValue(exampleCode);
      setEditorValue(exampleCode);
    }
    // Set the cursor position to the end of the content.
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

  const renderModel = async (quality: "draft" | "full" = "draft") => {
    if (isProcessing) {
      log("Already processing, please wait...");
      return;
    }

    setIsProcessing(true);
    clearLogs();
    completedModelRef.current = {};

    const detectedParts = identifyParts(editorValue);
    log(`Found Parts: ${Object.keys(detectedParts).join(", ")}`);

    async function renderPart(partName: string, part: OpenSCADPart) {
      log(`Processing part ${partName}...`);
      log("Initializing OpenSCAD...");
      const instance = await OpenSCAD({ noInitialRun: true });
      log("Writing input file...");
      instance.FS.writeFile("/input.scad", part.ownSourceCode);
      log("Performing render...");

      const args = [
        "/input.scad",
        "--viewall",
        "--autocenter",
        "--render",
        "--export-format=binstl",
      ];
      let filename: string;
      switch (quality) {
        case "draft":
          filename = "draft.stl";
          break;
        case "full":
          filename = "final.stl";
          args.push("--enable=manifold");
          break;
      }
      args.push("-o", filename);
      instance.callMain(args);
      log("Reading output...");
      // Read the output 3D-model into a JS byte-array.
      const output = instance.FS.readFile("/" + filename, {
        encoding: "binary",
      }) as Uint8Array;

      completedModelRef.current[partName] = { ...part, stl: output };
      log(`Render completed for part: "${partName}".`);
    }

    for (const [name, part] of Object.entries(detectedParts)) {
      await renderPart(name, part);
    }

    log("Rendering complete.");
    // Update the Three.js scene with the newly rendered STL parts.
    updateThreeScene();
    setIsProcessing(false);
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
          <Div flex={0} fontSize="150%">
            Render:
          </Div>
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={() => renderModel("draft")}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Draft Quality
          </Button>
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={() => renderModel("full")}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Final Quality
          </Button>
        </Div>
        {/* ThreeJS Model Viewer Div */}
        {/* The viewerRef is attached here so we can inject the Three.js canvas */}
        <Div background="skyblue" ref={viewerRef} />
        {/* Console Div */}
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
