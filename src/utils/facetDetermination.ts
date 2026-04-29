import * as THREE from "three";

export interface Facet {
  triangleIndices: number[];
  normal: THREE.Vector3;
  planeOrigin: THREE.Vector3;
}

export interface FacetOptions {
  baseNormalEpsilon?: number;
  areaEpsilonScale?: number;
  areaCap?: number;
  planeDistEpsilon?: number;
}

interface Tri {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

function triCentroid(t: Tri): THREE.Vector3 {
  return new THREE.Vector3().addVectors(t.a, t.b).add(t.c).multiplyScalar(1 / 3);
}

function triArea(t: Tri): number {
  const ab = new THREE.Vector3().subVectors(t.b, t.a);
  const ac = new THREE.Vector3().subVectors(t.c, t.a);
  return ab.cross(ac).length() * 0.5;
}

function triNormal(t: Tri): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(t.b, t.a);
  const ac = new THREE.Vector3().subVectors(t.c, t.a);
  const n = ab.cross(ac);
  const len = n.length();
  if (len === 0) return new THREE.Vector3(0, 0, 0);
  return n.divideScalar(len);
}

function planeDist(p: THREE.Vector3, origin: THREE.Vector3, normal: THREE.Vector3): number {
  return new THREE.Vector3().subVectors(p, origin).dot(normal);
}

// Snap coordinates to avoid float key mismatches across triangles sharing a vertex.
const SNAP = 1e7;
function snapCoord(v: THREE.Vector3): string {
  return `${Math.round(v.x * SNAP)},${Math.round(v.y * SNAP)},${Math.round(v.z * SNAP)}`;
}
function edgeKey(va: THREE.Vector3, vb: THREE.Vector3): string {
  const ka = snapCoord(va);
  const kb = snapCoord(vb);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function buildNeighbours(tris: Tri[]): number[][] {
  const edgeMap = new Map<string, number[]>();
  for (let i = 0; i < tris.length; i++) {
    const { a, b, c } = tris[i];
    for (const [va, vb] of [[a, b], [b, c], [c, a]] as [THREE.Vector3, THREE.Vector3][]) {
      const key = edgeKey(va, vb);
      let list = edgeMap.get(key);
      if (!list) { list = []; edgeMap.set(key, list); }
      list.push(i);
    }
  }
  const nbrs: number[][] = Array.from({ length: tris.length }, () => []);
  for (const tris2 of edgeMap.values()) {
    if (tris2.length !== 2) continue;
    const [a, b] = tris2;
    nbrs[a].push(b);
    nbrs[b].push(a);
  }
  return nbrs;
}

function adaptiveEps(aA: number, aB: number, base: number, scale: number, cap: number): number {
  return base + scale / Math.max(Math.min(aA, aB), cap);
}

function extractTris(geom: THREE.BufferGeometry): Tri[] {
  const pos = geom.getAttribute("position");
  if (!pos) return [];
  const tris: Tri[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    tris.push({
      a: new THREE.Vector3(pos.getX(i),     pos.getY(i),     pos.getZ(i)),
      b: new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)),
      c: new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)),
    });
  }
  return tris;
}

/**
 * Greedy BFS flood-fill faceting over a BufferGeometry.
 * Groups coplanar triangles into facets using adaptive normal + plane-distance guards.
 */
export function determineFacets(geom: THREE.BufferGeometry, options: FacetOptions = {}): Facet[] {
  const {
    baseNormalEpsilon = 1e-6,
    areaEpsilonScale  = 1e-8,
    areaCap           = 1e-12,
    planeDistEpsilon  = 1e-4,
  } = options;

  const tris = extractTris(geom);
  const n = tris.length;
  if (n === 0) return [];

  const normals   = tris.map(triNormal);
  const areas     = tris.map(triArea);
  const centroids = tris.map(triCentroid);
  const nbrs      = buildNeighbours(tris);

  const facets: Facet[] = [];
  const visited = new Uint8Array(n);

  for (let seed = 0; seed < n; seed++) {
    if (visited[seed]) continue;

    if (areas[seed] === 0) {
      visited[seed] = 1;
      facets.push({ triangleIndices: [seed], normal: normals[seed].clone(), planeOrigin: centroids[seed].clone() });
      continue;
    }

    const seedN  = normals[seed];
    const seedO  = centroids[seed];
    const members: number[] = [];
    const queue  = [seed];
    visited[seed] = 1;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      members.push(cur);
      for (const nb of nbrs[cur]) {
        if (visited[nb]) continue;
        const eps = adaptiveEps(areas[seed], areas[nb], baseNormalEpsilon, areaEpsilonScale, areaCap);
        if (1 - Math.abs(seedN.dot(normals[nb])) > eps) continue;
        if (Math.abs(planeDist(centroids[nb], seedO, seedN)) > planeDistEpsilon) continue;
        visited[nb] = 1;
        queue.push(nb);
      }
    }

    const avgN = new THREE.Vector3();
    for (const idx of members) avgN.addScaledVector(normals[idx], areas[idx]);
    const avgLen = avgN.length();
    if (avgLen > 0) avgN.divideScalar(avgLen); else avgN.copy(seedN);

    facets.push({ triangleIndices: members, normal: avgN, planeOrigin: seedO.clone() });
  }

  return facets;
}

/** Returns a Uint32Array of length triCount where each entry is the facet index for that triangle. */
export function buildFaceIDArray(triCount: number, facets: Facet[]): Uint32Array {
  const ids = new Uint32Array(triCount);
  for (let fi = 0; fi < facets.length; fi++) {
    for (const ti of facets[fi].triangleIndices) ids[ti] = fi;
  }
  return ids;
}
