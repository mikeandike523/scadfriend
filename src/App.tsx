import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css, keyframes } from "@emotion/react";
import Color from "color";
import throttle from "lodash/throttle.js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import SplitPane from 'react-split-pane';

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
import useEditorTabAgent from "./hooks/useEditorTabAgent";
import useFSAUnsupported from "./hooks/useFSAUnsupported";

import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import { identifyParts, OpenSCADPart } from "./openscad-parsing";
import { createLabeledAxis } from "./AxisVisualizer";
import { formatError } from "./utils/serialization";

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
  const viewerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderedAtLeastOnce, setRenderedAtLeastOnce] = useState(false);
  const completedModelRef = useRef<Record<string, OpenSCADPartWithSTL>>({});
  const [partSettings, setPartSettings] = useState<Record<string, PartSettings>>({});

  const editorTabAgent = useEditorTabAgent({ code, setCode });
  const layoutEditorThrottled = useMemo(
    () => throttle(() => editorTabAgent.layoutEditor(), 100, { trailing: true }),
    [editorTabAgent]
  );
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const threeObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    loader: STLLoader;
    ambientLight: THREE.AmbientLight;
    directionalLight: THREE.DirectionalLight;
    partsGroup: THREE.Group;
  } | null>(null);
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
    scene.add(camera, ambientLight);
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

  useEffect(() => {
    const three = threeObjectsRef.current!;
    const container = viewerRef.current!;
    const { renderer, camera } = three;
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    container.appendChild(renderer.domElement);

    orbitControlsRef.current = new OrbitControls(camera, renderer.domElement);
    orbitControlsRef.current.enableDamping = true;
    orbitControlsRef.current.dampingFactor = 0.05;

    return () => {
      orbitControlsRef.current?.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    window.addEventListener("resize", layoutEditorThrottled);
    layoutEditorThrottled();
    return () => {
      window.removeEventListener("resize", layoutEditorThrottled);
      layoutEditorThrottled.cancel();
    };
  }, [layoutEditorThrottled]);

  useEffect(() => {
    const three = threeObjectsRef.current;
    const container = viewerRef.current;
    if (!three || !container) return;

    const onResize = throttle(() => {
      const { width, height } = container.getBoundingClientRect();
      three.renderer.setSize(width, height);
      three.camera.aspect = width / height;
      three.camera.updateProjectionMatrix();
    }, 100, { trailing: true });

    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
      onResize.cancel();
    };
  }, []);

  useEffect(() => {
    const three = threeObjectsRef.current;
    if (!three || axesAdded.current) return;
    const { scene } = three;

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
        length: 100,
        tickSpacing: 10,
        tickLength: 2,
        majorTickInterval: 5,
        majorTickLength: 4,
        mainLineColor: mainColor,
        tickColor,
        labelText: label,
        labelFontSize: 4,
        labelOffset: offset,
        name: "__AXIS_" + label,
        visible: false,
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
      addAxis(dir, new THREE.Color(color), new THREE.Color(0x000000), label, new THREE.Vector3(0, 5, 0))
    );

    axesAdded.current = true;
  }, []);

  useEffect(() => {
    if (!renderedAtLeastOnce) return;
    const { scene } = threeObjectsRef.current!;
    traverseSyncChildrenFirst(scene, (node) => {
      if (node.name.startsWith("__AXIS_")) node.visible = true;
    });
  }, [renderedAtLeastOnce]);

  useEffect(() => {
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControlsRef.current?.update();
      const three = threeObjectsRef.current!;
      three.renderer.render(three.scene, three.camera);
      three.directionalLight.position.copy(three.camera.position);
      three.directionalLight.target.position.copy(orbitControlsRef.current!.target);
      three.directionalLight.target.updateMatrixWorld();
    };
    animate();
  }, []);

  useEffect(() => {
    consoleDivRef.current?.scrollTo({ top: consoleDivRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const goToDefaultView = () => {
    const three = threeObjectsRef.current!;
    const bbox = new THREE.Box3();
    traverseSyncChildrenFirst(three.scene, (node) => {
      if (node instanceof THREE.Mesh && !node.userData.keep) bbox.expandByObject(node);
    });
    if (!bbox.isEmpty()) {
      const center = new THREE.Vector3(); bbox.getCenter(center);
      const size = new THREE.Vector3(); bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim / (2 * Math.tan((three.camera.fov * Math.PI) / 360)) * 1.5;
      const offset = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist);
      three.camera.position.copy(center).add(offset);
      three.camera.lookAt(center);
      orbitControlsRef.current!.target.copy(center);
      orbitControlsRef.current!.update();
    }
  };

  const updateThreeScene = () => {
    const three = threeObjectsRef.current!;
    const { loader, partsGroup } = three;
    partsGroup.clear();
    Object.entries(completedModelRef.current).forEach(([name, part]) => {
      if (!part.stl) return;
      try {
        const geom = loader.parse(copySharedBufferToArrayBuffer(part.stl.buffer));
        geom.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshPhongMaterial({ color: getColorOrDefault(part.color) });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
        partsGroup.add(mesh);
      } catch {};
    });
    if (!renderedAtLeastOnce) goToDefaultView();
  };

  const updateVisibility = useCallback(() => {
    threeObjectsRef.current!.scene.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.userData.keep) {
        child.visible = !!partSettings[child.name]?.visible;
      }
    });
  }, [partSettings]);

  useEffect(updateVisibility, [updateVisibility]);

  const log = (msg: string) => setMessages((m) => [...m, msg].slice(-MAX_MESSAGES));
  const clearLogs = () => setMessages([]);

  const renderPartInWorker = (name: string, part: OpenSCADPart, backend: "Manifold" | "CGAL") =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e) => {
        if (e.data.type === "log") log(`[${name}] ${e.data.message}`);
        else if (e.data.type === "result") { completedModelRef.current[name] = {...part, stl: e.data.stl}; log(`Rendered "${name}"`); w.terminate(); resolve(); }
        else if (e.data.type === "error") { log(`Error: ${formatError(e.data.error)}`); w.terminate(); reject(e.data.error); }
      };
      w.onerror = (err) => { log(`Worker error: ${err.message}`); w.terminate(); reject(err); };
      w.postMessage({ command: "render", partName: name, part, backend });
    });

  const renderModel = async (backend: "Manifold" | "CGAL") => {
    if (isProcessing) return log("Already processing");
    const parts = identifyParts(code); if (!Object.keys(parts).length) return alert('No parts exported. Use "// @export".');
    Object.entries(parts).forEach(([n,p]) => { 
      if (!(n in partSettings)) partSettings[n] = { visible:true, exported:p.exported }; 
      else partSettings[n].exported = p.exported;
    });
    Object.keys(partSettings).forEach(n => { if (!(n in parts)) delete partSettings[n]; });
    setPartSettings({...partSettings}); clearLogs(); setIsProcessing(true); completedModelRef.current = {};
    log(`Found parts: ${Object.keys(parts).join(", ")}`);
    try { for (const [n,p] of Object.entries(parts)) if (p.exported) await renderPartInWorker(n,p,backend); setRenderedAtLeastOnce(true); log("Done"); updateThreeScene(); setPartSettings({...partSettings}); }
    catch(err){ alert("Rendering failed"); log(`Fail: ${formatError(err)}`); }
    finally { setIsProcessing(false);}  
  };

  const downloadPart = (name: string) => {
    const part = completedModelRef.current[name]; if (!part?.stl) return alert(`${name} missing`);
    const url=URL.createObjectURL(new Blob([part.stl])); const a=document.createElement("a"); a.href=url; a.download=`${name}.stl`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <>
      <div style={{width:"100vw",height:"100vh",overflow:"hidden"}}>
        {/* @ts-expect-error There seems to be a typing bug in splitplane library where `children` property is not present */}
        <SplitPane split="vertical" minSize={200} defaultSize="35%" onChange={layoutEditorThrottled}>
          <div style={{height:"100%",overflow:"auto",background:"#f5f5f5",padding:"8px"}}>
            <EditorTab agent={editorTabAgent}/>
          </div>
          <div style={{height:"100%",display:"grid",gridTemplateRows:"auto 1.5fr 1fr"}}>
            <Div display="flex" gap="8px" padding="8px">
              <Button disabled={isProcessing}
                flex={1} fontSize="150%" onClick={()=>renderModel("Manifold")}>Preview</Button>
              <Button disabled={isProcessing}
                flex={1} fontSize="150%" onClick={()=>renderModel("CGAL")}>Render</Button>
            </Div>
            <Div display="grid" gridTemplateColumns="1.3fr 3fr" height="100%">
              <Div background="white" padding="8px" display="flex" flexDirection="column" gap="8px">
                {Object.keys(partSettings).length? Object.entries(partSettings).map(([name,s],i)=>(
                  <Div key={i} display="flex" alignItems="center" gap="0.7em">
                    <Label display="flex" alignItems="center" gap="0.7em" color={!s.exported?"#666":undefined}>
                      <Input type="checkbox" checked={s.visible} onChange={()=>{s.visible=!s.visible;setPartSettings({...partSettings});}}/>
                      {s.exported?name:`${name}(ignored)`}
                    </Label>
                    {completedModelRef.current[name]?.stl&&(
                      <Button width="1.25rem"height="1.25rem" onClick={()=>downloadPart(name)}>
                        <FaFileDownload style={{fontSize:"0.75rem"}}/></Button>)}
                  </Div>)):
                  <I>No parts yet.</I>}
              </Div>
              <Div background="#aaa" position="relative" height="100%">
                <Div ref={viewerRef} width="100%" height="100%"/>
                <Div position="absolute" top={0}left={0}right={0}bottom={0}display="flex"alignItems="center"justifyContent="center"pointerEvents={isProcessing?"auto":"none"}opacity={isProcessing?1:0} transition="opacity .5s">
                  <Div width="48px"height="48px"css={css`border-radius:50%;border:4px solid blue;border-top:4px solid transparent;animation:${spinnerAnimation} 2s linear infinite;`}/>
                </Div>
                <Div position="absolute" top={0}left={0}right={0}bottom={0}display="flex"flexDirection="column"alignItems="center"justifyContent="center"pointerEvents={renderedAtLeastOnce||isProcessing?"none":"auto"}opacity={renderedAtLeastOnce||isProcessing?0:1}transition="opacity .5s">
                  <H1 color="darkblue" textAlign="center">Nothing to show.</H1>
                  <H1 color="darkblue" textAlign="center">Press "Render" to start.</H1>
                </Div>
                <Div position="absolute" bottom={0} right={0} display="flex" gap="8px" padding="8px">
                  <Button onClick={goToDefaultView} width="2.5rem" height="2.5rem" borderRadius="50%">
                    <FaHome style={{fontSize:"1.5rem"}}/>
                  </Button>
                </Div>
              </Div>
            </Div>
            <Div ref={consoleDivRef} overflow="auto" whiteSpace="pre-wrap" background="darkgreen" color="white" fontFamily="'Fira Code', monospace">
              {messages.join("\n")+"\n"}
            </Div>
          </div>
        </SplitPane>
        <Div position="fixed" width="100vw" height="100vh" zIndex={9999} background="black" display={fsaUnsupported?"flex":"none"}alignItems="center"justifyContent="center">
          <Div background="white" padding="8px" display="flex" flexDirection="column" alignItems="stretch">
            <H1 color="red" textAlign="center">Your browser is too old!</H1>
            <P textAlign="center">The File System Access API isn't supported.</P>
            <P textAlign="center">Upgrade to a modern browser.</P>
          </Div>
        </Div>
      </div>
    </>
  );
}
