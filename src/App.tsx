// App.tsx
import { css, keyframes } from "@emotion/react";
import Color from "color";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Div, H1, I, Input, Label, P } from "style-props-html";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import throttle from "lodash/throttle.js";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

import { FaHome, FaFileDownload } from "react-icons/fa";

import "./App.css";
import EditorTab from "./components/EditorTab";
import useEditorTabAgent from "./hooks/useEditorTabAgent";
import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import { identifyParts, OpenSCADPart } from "./openscad-parsing";

// Import our axis helper.
import { createLabeledAxis } from "./AxisVisualizer";
import useFSAUnsupported from "./hooks/useFSAUnsupported";
import { formatError } from "./utils/serialization";

const MAX_MESSAGES = 200;

type OpenSCADPartWithSTL = OpenSCADPart & { stl?: Uint8Array };

function copySharedBufferToArrayBuffer(
  sharedBuffer: SharedArrayBuffer | ArrayBuffer
): ArrayBuffer {
  if (sharedBuffer instanceof ArrayBuffer) {
    return sharedBuffer;
  }
  const arrayBuffer = new ArrayBuffer(sharedBuffer.byteLength);
  new Uint8Array(arrayBuffer).set(new Uint8Array(sharedBuffer));
  return arrayBuffer;
}

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

type PartSettings = {
  visible: boolean;
  exported: boolean;
};

function traverseSyncChildrenFirst(
  node: THREE.Object3D,
  callback: (node: THREE.Object3D) => void
) {
  for (const child of node.children) {
    traverseSyncChildrenFirst(child, callback);
  }
  callback(node);
}

function App() {
  useRegisterOpenSCADLanguage();

  const fsaUnsupported = useFSAUnsupported();

  const consoleDivRef = useRef<HTMLDivElement>(null);
  // This ref points to the viewer pane (our Three.js container)
  const viewerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderedAtLeastOnce, setRenderedAtLeastOnce] = useState(false);
  // For later export, we keep the completed parts in a ref.
  const completedModelRef = useRef<{ [name: string]: OpenSCADPartWithSTL }>({});
  const [partSettings, setPartSettings] = useState<{
    [name: string]: PartSettings;
  }>({});

  // For now, just one tab

  const editorTabAgent = useEditorTabAgent({
    code,
    setCode,
  });

  // Create a ref to store the OrbitControls instance.
  const orbitControlsRef = useRef<OrbitControls | null>(null);

  // Create a ref for Three.js objects so that they are only initialized once.
  const threeObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    loader: STLLoader;
    ambientLight: THREE.AmbientLight;
    directionalLight: THREE.DirectionalLight;
    partsGroup: THREE.Group; // Group for rendered parts
  } | null>(null);

  // Ref flag to ensure we add the axes only once.
  const axesAdded = useRef(false);

  if (!threeObjectsRef.current) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    const loader = new STLLoader();
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.copy(camera.position);
    camera.add(directionalLight);
    scene.add(camera);
    scene.add(ambientLight);
    // Create a dedicated group for rendered parts.
    const partsGroup = new THREE.Group();
    partsGroup.name = "partsGroup";
    scene.add(partsGroup);

    threeObjectsRef.current = {
      scene,
      camera,
      renderer,
      loader,
      ambientLight,
      directionalLight,
      partsGroup,
    };
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
        threeObjectsRef.current &&
        threeObjectsRef.current.renderer.domElement.parentElement === current
      ) {
        current.removeChild(threeObjectsRef.current.renderer.domElement);
      }
    };
  }, []);

  // Keep the renderer in sync with the viewer div size.
  useEffect(() => {
    const threeObjects = threeObjectsRef.current;
    const viewer = viewerRef.current;
    if (!threeObjects || !viewer) return;

    const resizeViewport = throttle(() => {
      const { width, height } = viewer.getBoundingClientRect();
      threeObjects.renderer.setSize(width, height);
      threeObjects.camera.aspect = width / height;
      threeObjects.camera.updateProjectionMatrix();
    }, 100, { trailing: true });

    window.addEventListener("resize", resizeViewport);

    // Call once in case the initial size is different.
    resizeViewport();

    return () => {
      window.removeEventListener("resize", resizeViewport);
      resizeViewport.cancel();
    };
  }, []);

  // Add axes only once.
  useEffect(() => {
    const threeObjects = threeObjectsRef.current;
    if (!threeObjects || axesAdded.current) return;
    const { scene } = threeObjects;

    const addAxis = (
      direction: THREE.Vector3,
      mainLineColor: THREE.Color,
      tickColor: THREE.Color,
      labelText: string,
      /**
       * Offset from the end of the axis
       */
      labelOffset: THREE.Vector3
    ) => {
      createLabeledAxis({
        scene,
        direction,
        length: 100,
        tickSpacing: 10,
        tickLength: 2,
        majorTickInterval: 5,
        majorTickLength: 4,
        mainLineColor,
        tickColor,
        labelText,
        labelFontSize: 4,
        labelOffset, // Float slight above
        name: "__AXIS_" + labelText,
        visible: false,
      });
    };

    // Create SCAD X-Axis (red)
    addAxis(
      new THREE.Vector3(1, 0, 0), // SCAD +X is ThreeJS +X (no change)
      new THREE.Color(0xff0000),
      new THREE.Color(0x000000),
      "+X",
      new THREE.Vector3(0, 5, 0) // Float slight above
    );

    // Create SCAD Y-Axis (green)
    addAxis(
      new THREE.Vector3(0, 0, -1), // SCAD +Y is ThreeJS -Z
      new THREE.Color(0x00ff00),
      new THREE.Color(0x000000),

      "+Y",
      new THREE.Vector3(0, 5, 0) // Float slight above
    );

    // Create SCAD Z-Axis (blue)
    addAxis(
      new THREE.Vector3(0, 1, 0), // SCAD +Z is ThreeJS +Y
      new THREE.Color(0x0000ff),
      new THREE.Color(0x000000),

      "+Z",
      new THREE.Vector3(5, 0, 0) // Float slightly to the right
    );

    // Create SCAD -X-Axis (yellow)
    addAxis(
      new THREE.Vector3(-1, 0, 0), // SCAD -X is ThreeJS -X
      new THREE.Color(0xffff00),
      new THREE.Color(0x000000),

      "-X",
      new THREE.Vector3(0, 5, 0) // Float slight above
    );

    // Create SCAD -Y-Axis (cyan)
    addAxis(
      new THREE.Vector3(0, 0, 1), // SCAD -Y is ThreeJS +Z
      new THREE.Color(0x00ffff),
      new THREE.Color(0x000000),

      "-Y",
      new THREE.Vector3(0, 5, 0) // Float slight above
    );

    // Create SCAD -Z-Axis (magenta)
    addAxis(
      new THREE.Vector3(0, -1, 0), // SCAD -Z is ThreeJS -Y
      new THREE.Color(0xff00ff),
      new THREE.Color(0x000000),

      "-Z",
      new THREE.Vector3(5, 0, 0) // Float slightly to the right
    );

    axesAdded.current = true;
  }, []);

  useEffect(() => {
    if (!threeObjectsRef.current) return;
    const { scene } = threeObjectsRef.current;
    if (renderedAtLeastOnce) {
      traverseSyncChildrenFirst(scene, (node) => {
        if (node.name && node.name.startsWith("__AXIS_")) {
          node.visible = true;
        }
      });
    }
  }, [renderedAtLeastOnce]);

  // Create the opposite axes
  // From testing it appear it is useful to show all 6 directions for best visibility
  // In the future, we may even add support for showing different grids on different planes

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
        const directionalLight = threeObjectsRef.current.directionalLight;
        directionalLight.position.copy(threeObjectsRef.current.camera.position);
        if (orbitControlsRef.current) {
          directionalLight.target.position.copy(
            orbitControlsRef.current.target
          );
        }
        directionalLight.target.updateMatrixWorld();
      }
    };
    animate();
  }, []);

  const shownMessages = messages.join("\n");
  useEffect(() => {
    consoleDivRef.current?.scrollTo({
      top: consoleDivRef.current?.scrollHeight ?? 0,
      behavior: "smooth",
    });
  }, [shownMessages]);

  const goToDefaultView = () => {
    const threeObjects = threeObjectsRef.current;
    if (!threeObjects) return;

    const { scene, camera } = threeObjects;
    const bbox = new THREE.Box3();
    traverseSyncChildrenFirst(scene, (node: THREE.Object3D) => {
      if (node instanceof THREE.Mesh && !node.userData.keep) {
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

  // Update the Three.js scene by adding rendered parts.
  // We now clear and update only the partsGroup, leaving our axes intact.
  const updateThreeScene = () => {
    const threeObjects = threeObjectsRef.current;
    if (!threeObjects) return;

    const { loader, partsGroup } = threeObjects;

    // Clear out previous parts.
    while (partsGroup.children.length > 0) {
      partsGroup.remove(partsGroup.children[0]);
    }

    // Add new mesh for each completed part.
    Object.entries(completedModelRef.current).forEach(([name, part]) => {
      if (part.stl) {
        try {
          const geometry = loader.parse(
            copySharedBufferToArrayBuffer(part.stl.buffer)
          );
          geometry.rotateX(-Math.PI / 2);
          const material = new THREE.MeshPhongMaterial({
            color: getColorOrDefault(part.color),
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = name;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          partsGroup.add(mesh);
        } catch (error) {
          console.error(`Error parsing STL for part "${name}":`, error);
        }
      }
    });
    if (!renderedAtLeastOnce) {
      goToDefaultView();
    }
  };

  const updateThreeScenePartsVisibility = useCallback(() => {
    const threeObjects = threeObjectsRef.current;
    if (!threeObjects) return;
    const { scene } = threeObjects;

    // Toggle visibility only for objects not marked as keep (i.e. rendered parts).
    scene.traverse((child) => {
      if (!child.userData.keep && child instanceof THREE.Mesh) {
        const partName = child.name;
        const settings = partSettings[partName];
        child.visible = settings ? settings.visible : false;
      }
    });
  }, [partSettings]);

  useEffect(() => {
    updateThreeScenePartsVisibility();
  }, [partSettings, updateThreeScenePartsVisibility]);

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
  const renderPartInWorker = (
    partName: string,
    part: OpenSCADPart,
    backend: "Manifold" | "CGAL"
  ) => {
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
          log(`Error rendering part ${partName}:\n${formatError(data.error)}`);
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
      worker.postMessage({ command: "render", partName, part, backend });
    });
  };

  /**
   * Initiates rendering of all detected parts by delegating to the worker.
   */
  const renderModel = async (backend: "Manifold" | "CGAL" = "Manifold") => {
    if (isProcessing) {
      log("Already processing, please wait...");
      return;
    }

    const detectedParts = identifyParts(code);

    if (!Object.keys(detectedParts).length) {
      alert(
        'Your design did not export any parts. Did you remember to use the "// @export" comment correctly?'
      );
      return;
    }

    // Update part settings with any newly detected parts.
    for (const [name, part] of Object.entries(detectedParts)) {
      if (!(name in partSettings)) {
        partSettings[name] = { visible: true, exported: part.exported };
      } else {
        partSettings[name].exported = part.exported;
      }
    }
    // Remove settings for parts that no longer exist.
    for (const name of Object.keys(partSettings)) {
      if (!(name in detectedParts)) {
        delete partSettings[name];
      }
    }
    setPartSettings({ ...partSettings });

    clearLogs();

    setIsProcessing(true);

    completedModelRef.current = {};

    log(
      `Found Parts: ${Object.entries(detectedParts)
        .map(([n, p]) => (p.exported ? n : `${n} (export ignored)`))
        .join(", ")}`
    );

    try {
      // Process parts sequentially (you can also do this concurrently if desired).
      for (const [name, part] of Object.entries(detectedParts)) {
        if (!part.exported) {
          continue;
        }
        await renderPartInWorker(name, part, backend);
      }
      // Update visibility state for all detected parts after rendering.
      for (const [name, part] of Object.entries(detectedParts)) {
        if (!(name in partSettings)) {
          partSettings[name] = { visible: true, exported: part.exported };
        }
      }
      setPartSettings({ ...partSettings });
      setRenderedAtLeastOnce(true);
      log("Rendering complete.");
      updateThreeScene();
    } catch (error) {
      alert(`Rendering failed. Check the console for more details.`);
      log(`Rendering failed: ${formatError(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPart = (partName: string) => {
    const part = completedModelRef.current[partName];
    if (!part || !part.stl) {
      alert(`Part "${partName}" not found or not rendered yet.`);
      return;
    }

    // 1) Make a Blob from the raw Uint8Array
    const blob = new Blob(
      // Blob constructor takes an array of ArrayBufferViews or ArrayBuffers
      [part.stl],
      { type: "application/octet-stream" }
    );

    // 2) Create an object URL
    const url = URL.createObjectURL(blob);

    // 3) Programmatically click an <a> to download
    const a = document.createElement("a");
    a.href = url;
    a.download = `${partName}.stl`;
    // On some browsers you need to append it to the DOM for click() to work
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 4) Clean up
    URL.revokeObjectURL(url);
  };
  return (
    <Div
      display="flex"
      flexDirection="row"
      alignItems="flex-start"
      justifyContent="flex-start"
      height="100%"
    >
      <Div height="100%" flex={1.3}>
        <EditorTab agent={editorTabAgent} />
      </Div>
      <Div
        height="100%"
        flex={1}
        display="grid"
        gridTemplateRows="auto 1.5fr 1fr"
        gridTemplateColumns="1fr"
      >
        {/* Render Controls */}
        <Div display="flex" flexDirection="row" gap="8px" padding="8px">
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={() => {
              renderModel("Manifold");
            }}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Preview Render
          </Button>
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={() => {
              renderModel("CGAL");
            }}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Full Render
          </Button>
        </Div>
        {/* Three.js Model Viewer And Item Visibility Checkboxes */}
        <Div
          width="100%"
          height="100%"
          display="grid"
          gridTemplateRows="1fr"
          gridTemplateColumns="1.3fr 3fr"
        >
          <Div
            background="white"
            padding="8px"
            display="flex"
            flexDirection="column"
            gap="8px"
          >
            {Object.keys(partSettings).length > 0 ? (
              <>
                {Object.entries(partSettings).map(([name, settings], index) => (
                  <Div
                    display="flex"
                    flexDirection="row"
                    alignItems="center"
                    gap="0.7em"
                    key={index}
                  >
                    <Label
                      whiteSpace="nowrap"
                      display="flex"
                      flexDirection="row"
                      alignItems="center"
                      gap="0.7em"
                      color={settings.exported ? undefined : "#666"}
                    >
                      <Input
                        display="flex"
                        flexDirection="row"
                        alignItems="center"
                        gap="0.7em"
                        type="checkbox"
                        checked={settings.visible}
                        onChange={() => {
                          const currentValue = partSettings[name].visible;
                          partSettings[name].visible = !currentValue;
                          setPartSettings({ ...partSettings });
                        }}
                      />
                      {settings.exported ? name : `${name} (export ignored)`}
                    </Label>
                    {completedModelRef.current[name] &&
                      completedModelRef.current[name].stl && (
                        <Button
                          width="1.25rem"
                          height="1.25rem"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          title="Download STL"
                          borderRadius="50%"
                          onClick={() => {
                            downloadPart(name);
                          }}
                        >
                          <FaFileDownload
                            style={{
                              fontSize: "0.75rem",
                            }}
                          />
                        </Button>
                      )}
                  </Div>
                ))}
              </>
            ) : (
              <I>No parts yet.</I>
            )}
          </Div>
          <Div background="#aaaaaa" position="relative" height="100%">
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
            <Div
              position="absolute"
              top="0"
              left="0"
              right="0"
              bottom="0"
              display="flex"
              pointerEvents={
                renderedAtLeastOnce || isProcessing ? "none" : "auto"
              }
              opacity={renderedAtLeastOnce || isProcessing ? 0 : 1}
              transition="opacity 0.5s ease-in-out"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
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
              bottom="0"
              right="0"
              padding="8px"
              gap="8px"
              display="flex"
              flexDirection="row"
            >
              <Button
                width="2.5rem"
                height="2.5rem"
                display="flex"
                alignItems="center"
                justifyContent="center"
                title="Default View"
                borderRadius="50%"
                onClick={goToDefaultView}
              >
                <FaHome
                  style={{
                    fontSize: "1.5rem",
                  }}
                />
              </Button>
            </Div>
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
          <H1 textAlign="center" color="red">
            Your browser is too old!
          </H1>
          <P textAlign="center">
            The File System Access API (2016) is not supported in your browser.
          </P>
          <P textAlign="center">Please switch to a browser from after 2016.</P>
        </Div>
      </Div>
    </Div>
  );
}

export default App;
