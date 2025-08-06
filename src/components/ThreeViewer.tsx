import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MutableRefObject, useEffect, useRef } from 'react';

export interface ThreeHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  loader: STLLoader;
  ambientLight: THREE.AmbientLight;
  directionalLight: THREE.DirectionalLight;
  partsGroup: THREE.Group;
}

function Scene({ handleRef, controlsRef, onReady }: { handleRef: MutableRefObject<ThreeHandles | null>; controlsRef: MutableRefObject<OrbitControls | null>; onReady?: () => void; }) {
  const { scene, camera, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const ambientRef = useRef<THREE.AmbientLight>(null!);
  const dirRef = useRef<THREE.DirectionalLight>(null!);

  useEffect(() => {
    handleRef.current = {
      scene,
      camera: camera as THREE.PerspectiveCamera,
      renderer: gl,
      loader: new STLLoader(),
      ambientLight: ambientRef.current,
      directionalLight: dirRef.current,
      partsGroup: groupRef.current,
    };
    onReady?.();
  }, [scene, camera, gl, handleRef, onReady]);

  useFrame(() => {
    dirRef.current.position.copy(camera.position);
    if (controlsRef.current) {
      dirRef.current.target.position.copy(controlsRef.current.target);
      dirRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.25} />
      <directionalLight ref={dirRef} intensity={1} />
      <group ref={groupRef} name="partsGroup" />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} />
    </>
  );
}

export default function ThreeViewer({ handleRef, controlsRef, onReady }: { handleRef: MutableRefObject<ThreeHandles | null>; controlsRef: MutableRefObject<OrbitControls | null>; onReady?: () => void; }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 100], fov: 75 }}
      style={{ width: '100%', height: '100%' }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color(0xaaaaaa);
      }}
    >
      <Scene handleRef={handleRef} controlsRef={controlsRef} onReady={onReady} />
    </Canvas>
  );
}
