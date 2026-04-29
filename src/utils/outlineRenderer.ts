import * as THREE from "three";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Half-width of each edge quad as a fraction of the longest triangle edge
// adjacent to that edge.
const MESH_QUAD_SIZE_PERCENT = 0.005;

// Squared cross-product magnitude below which a triangle is considered
// degenerate and skipped entirely.
const NORMAL_EPS_SQ = 1e-10;

// Coordinate snap precision for vertex identity (7 decimal digits).
const SNAP = 1e7;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

// Three.js auto-injects: position (in vec3), modelMatrix, modelViewMatrix,
// projectionMatrix, normalMatrix, cameraPosition.
const lineVertexShader = /* glsl */ `
in float aSide;
in vec3  aQuadNormal;

out float vSide;
out vec3  vWorldNormal;
out vec3  vViewDir;

void main() {
  vec4 worldPos4 = modelMatrix * vec4(position, 1.0);

  vSide        = aSide;
  vWorldNormal = normalize(mat3(modelMatrix) * aQuadNormal);
  vViewDir     = normalize(cameraPosition - worldPos4.xyz);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const lineFragmentShader = /* glsl */ `
precision highp float;

uniform vec3  uLineColor;
uniform vec3  uDebugColor;
uniform float uLineHalfWidthPx;
uniform float uOpacity;
uniform bool  uDebug;

in float vSide;
in vec3  vWorldNormal;
in vec3  vViewDir;

out vec4 fragColor;

void main() {
  if (uDebug) {
    float lambert  = abs(dot(normalize(vWorldNormal), normalize(vViewDir)));
    float lighting = 0.3 + 0.7 * lambert;
    fragColor = vec4(uDebugColor * lighting, 0.85);
  } else {
    float fw           = fwidth(vSide);
    float pxFromCentre = abs(vSide - 0.5) / max(fw, 1e-6);
    float alpha = smoothstep(
      uLineHalfWidthPx + 0.5, uLineHalfWidthPx - 0.5, pxFromCentre
    ) * uOpacity;
    if (alpha < 0.01) discard;
    fragColor = vec4(uLineColor, alpha);
  }
}
`;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GoodTri {
  triIdx: number;
  normal: THREE.Vector3;
}

interface EdgeEntry {
  pA: THREE.Vector3;
  pB: THREE.Vector3;
  tris: GoodTri[];
}

// ---------------------------------------------------------------------------
// Vertex key helpers (snapped coordinates for manifold edge matching)
// ---------------------------------------------------------------------------

function snapKey(x: number, y: number, z: number): string {
  return `${Math.round(x * SNAP)},${Math.round(y * SNAP)},${Math.round(z * SNAP)}`;
}

function vertKey(pos: THREE.BufferAttribute, i: number): string {
  return snapKey(pos.getX(i), pos.getY(i), pos.getZ(i));
}

function edgeKey(kA: string, kB: string): string {
  return kA < kB ? `${kA}|${kB}` : `${kB}|${kA}`;
}

// ---------------------------------------------------------------------------
// Step 1: build good_triangles — filter out degenerate faces
// ---------------------------------------------------------------------------

function buildGoodTriangles(pos: THREE.BufferAttribute): GoodTri[] {
  const result: GoodTri[] = [];
  const triCount = Math.floor(pos.count / 3);

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2;

    const ax = pos.getX(i1) - pos.getX(i0);
    const ay = pos.getY(i1) - pos.getY(i0);
    const az = pos.getZ(i1) - pos.getZ(i0);
    const bx = pos.getX(i2) - pos.getX(i0);
    const by = pos.getY(i2) - pos.getY(i0);
    const bz = pos.getZ(i2) - pos.getZ(i0);

    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const lenSq = cx * cx + cy * cy + cz * cz;

    if (lenSq < NORMAL_EPS_SQ) continue; // skip degenerate

    const len = Math.sqrt(lenSq);
    result.push({
      triIdx: t,
      normal: new THREE.Vector3(cx / len, cy / len, cz / len),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 2: edge adjacency over good triangles only
// ---------------------------------------------------------------------------

function buildEdgeAdjacency(
  pos: THREE.BufferAttribute,
  goodTris: GoodTri[]
): Map<string, EdgeEntry> {
  const map = new Map<string, EdgeEntry>();

  for (const gt of goodTris) {
    const t = gt.triIdx;
    const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2;
    const pairs: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];

    for (const [iA, iB] of pairs) {
      const kA = vertKey(pos, iA);
      const kB = vertKey(pos, iB);
      const key = edgeKey(kA, kB);

      if (!map.has(key)) {
        map.set(key, {
          pA: new THREE.Vector3(pos.getX(iA), pos.getY(iA), pos.getZ(iA)),
          pB: new THREE.Vector3(pos.getX(iB), pos.getY(iB), pos.getZ(iB)),
          tris: [],
        });
      }
      map.get(key)!.tris.push(gt);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Step 3: keep only facet-boundary and mesh-boundary edges
// ---------------------------------------------------------------------------

function extractFacetEdges(
  pos: THREE.BufferAttribute,
  faceIDs: Uint32Array,
  goodTris: GoodTri[]
): EdgeEntry[] {
  const adjMap = buildEdgeAdjacency(pos, goodTris);
  const result: EdgeEntry[] = [];

  for (const entry of adjMap.values()) {
    const { tris } = entry;
    if (tris.length === 1) {
      result.push(entry); // mesh boundary
    } else if (tris.length === 2) {
      if (faceIDs[tris[0].triIdx] !== faceIDs[tris[1].triIdx]) {
        result.push(entry); // facet boundary
      }
    }
    // non-manifold (3+) — skip
  }

  return result;
}

// ---------------------------------------------------------------------------
// Quad geometry helpers
// ---------------------------------------------------------------------------

function computeEdgeNormal(normals: THREE.Vector3[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const n of normals) sum.add(n);
  if (sum.lengthSq() < 1e-10) return normals[0].clone();
  return sum.normalize();
}

function binormalAxis(edgeDir: THREE.Vector3, edgeNorm: THREE.Vector3): THREE.Vector3 {
  const b = new THREE.Vector3().crossVectors(edgeDir, edgeNorm);
  if (b.lengthSq() < 1e-10) {
    const ref =
      Math.abs(edgeDir.dot(new THREE.Vector3(0, 1, 0))) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    b.crossVectors(edgeDir, ref);
  }
  return b.normalize();
}

function longestAdjacentEdge(pos: THREE.BufferAttribute, tris: GoodTri[]): number {
  let longest = 0;
  for (const gt of tris) {
    const t = gt.triIdx;
    const i0 = t * 3, i1 = t * 3 + 1, i2 = t * 3 + 2;
    const pairs: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
    for (const [a, b] of pairs) {
      const dx = pos.getX(b) - pos.getX(a);
      const dy = pos.getY(b) - pos.getY(a);
      const dz = pos.getZ(b) - pos.getZ(a);
      longest = Math.max(longest, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  return longest;
}

function emitQuad(
  positions: Float32Array,
  aSide: Float32Array,
  aQuadNormal: Float32Array,
  indices: Uint32Array,
  baseVert: number,
  baseIdx: number,
  pA: THREE.Vector3,
  pB: THREE.Vector3,
  axis: THREE.Vector3,
  edgeDir: THREE.Vector3,
  halfWidth: number
): void {
  const v0 = baseVert, v1 = baseVert + 1, v2 = baseVert + 2, v3 = baseVert + 3;
  const ox = axis.x * halfWidth, oy = axis.y * halfWidth, oz = axis.z * halfWidth;

  const setPos = (vi: number, x: number, y: number, z: number) => {
    positions[vi * 3] = x; positions[vi * 3 + 1] = y; positions[vi * 3 + 2] = z;
  };

  // aSide: 0.0 at one edge, 1.0 at the other — interpolates to 0.5 at centre.
  setPos(v0, pA.x - ox, pA.y - oy, pA.z - oz); aSide[v0] = 0.0;
  setPos(v1, pA.x + ox, pA.y + oy, pA.z + oz); aSide[v1] = 1.0;
  setPos(v2, pB.x - ox, pB.y - oy, pB.z - oz); aSide[v2] = 0.0;
  setPos(v3, pB.x + ox, pB.y + oy, pB.z + oz); aSide[v3] = 1.0;

  // Quad surface normal = normalize(edgeDir × axis).
  const qnx = edgeDir.y * axis.z - edgeDir.z * axis.y;
  const qny = edgeDir.z * axis.x - edgeDir.x * axis.z;
  const qnz = edgeDir.x * axis.y - edgeDir.y * axis.x;
  const qnLen = Math.sqrt(qnx * qnx + qny * qny + qnz * qnz) || 1;

  for (let i = 0; i < 4; i++) {
    aQuadNormal[(baseVert + i) * 3]     = qnx / qnLen;
    aQuadNormal[(baseVert + i) * 3 + 1] = qny / qnLen;
    aQuadNormal[(baseVert + i) * 3 + 2] = qnz / qnLen;
  }

  indices[baseIdx]     = v0; indices[baseIdx + 1] = v1; indices[baseIdx + 2] = v2;
  indices[baseIdx + 3] = v1; indices[baseIdx + 4] = v3; indices[baseIdx + 5] = v2;
}

// ---------------------------------------------------------------------------
// Step 4: build the full quad BufferGeometry (two quads per edge)
// ---------------------------------------------------------------------------

function buildLineGeometry(
  pos: THREE.BufferAttribute,
  edges: EdgeEntry[]
): THREE.BufferGeometry {
  if (edges.length === 0) return new THREE.BufferGeometry();

  // Two quads (a '+' cross) per edge for consistent oblique coverage.
  const numVerts = edges.length * 8;
  const numIdx   = edges.length * 12;

  const positions = new Float32Array(numVerts * 3);
  const aSide     = new Float32Array(numVerts);
  const aQuadNorm = new Float32Array(numVerts * 3);
  const indices   = new Uint32Array(numIdx);

  const edgeDir = new THREE.Vector3();

  for (let e = 0; e < edges.length; e++) {
    const { pA, pB, tris } = edges[e];
    const normals = tris.map((gt) => gt.normal);

    const halfWidth = longestAdjacentEdge(pos, tris) * MESH_QUAD_SIZE_PERCENT;

    edgeDir.subVectors(pB, pA).normalize();

    const eNorm = computeEdgeNormal(normals);
    const ax1   = binormalAxis(edgeDir, eNorm);
    const ax2   = new THREE.Vector3().crossVectors(edgeDir, ax1).normalize();

    emitQuad(positions, aSide, aQuadNorm, indices,
      e * 8 + 0, e * 12 + 0,  pA, pB, ax1, edgeDir, halfWidth);
    emitQuad(positions, aSide, aQuadNorm, indices,
      e * 8 + 4, e * 12 + 6,  pA, pB, ax2, edgeDir, halfWidth);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position",    new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSide",       new THREE.BufferAttribute(aSide,     1));
  geo.setAttribute("aQuadNormal", new THREE.BufferAttribute(aQuadNorm, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the edge-outline BufferGeometry for a (non-indexed) STL BufferGeometry.
 * Produces two cross-quads per facet-boundary / mesh-boundary edge.
 * Returns null if the geometry has no usable triangles.
 */
export function buildOutlineGeometry(
  geom: THREE.BufferGeometry,
  faceIDs: Uint32Array
): THREE.BufferGeometry | null {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  if (!pos || pos.count < 3) return null;

  const goodTris = buildGoodTriangles(pos);
  if (goodTris.length === 0) return null;

  const edges = extractFacetEdges(pos, faceIDs, goodTris);
  return buildLineGeometry(pos, edges);
}

/**
 * Create the ShaderMaterial for edge outlines.
 * Transparent, depth-tested, no depth write.
 */
export function buildOutlineMaterial(): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader:   lineVertexShader,
    fragmentShader: lineFragmentShader,
    uniforms: {
      uLineColor:       { value: new THREE.Color(0x111111) },
      uDebugColor:      { value: new THREE.Color(0xff6600) },
      uLineHalfWidthPx: { value: 1.2 },
      uOpacity:         { value: 1.0 },
      uDebug:           { value: false },
    },
    transparent: true,
    depthWrite:  false,
    depthTest:   true,
    side:        THREE.DoubleSide,
    glslVersion: THREE.GLSL3,
  });

  return mat;
}
