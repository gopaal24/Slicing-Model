import * as THREE from 'three';
import { facesFromEdges } from './faces-from-edges.ts';
import { BufferGeometryUtils } from 'three/examples/jsm/Addons.js';

const FRONT = 'front';
const BACK = 'back';
const ON = 'on';

type Position = typeof FRONT | typeof BACK | typeof ON;

export function sliceGeometry(geometry: THREE.BufferGeometry, plane: THREE.Plane, closeHoles: boolean = true, mesh: THREE.Mesh): { front: THREE.BufferGeometry, back: THREE.BufferGeometry } {
  // Convert BufferGeometry to temporary position array for easier processing
  const originalPositions = new Float32Array(geometry.getAttribute('position').array);
  const normals = geometry.getAttribute('normal')?.array;
  const uvs = geometry.getAttribute('uv')?.array;
  const indices = geometry.getIndex()?.array || [];

  mesh.updateMatrixWorld(true);
  const matrixWorld = mesh.matrixWorld;
  const inverseMatrix = new THREE.Matrix4().copy(matrixWorld).invert();
  const localPlane = plane.clone().applyMatrix4(inverseMatrix);
  
  const vertices: THREE.Vector3[] = [];
  const frontVertices: THREE.Vector3[] = [];
  const backVertices: THREE.Vector3[] = [];
  const frontNormals: THREE.Vector3[] = [];
  const backNormals: THREE.Vector3[] = [];
  const frontUvs: THREE.Vector2[] = [];
  const backUvs: THREE.Vector2[] = [];
  const frontColors: THREE.Color[] = [];
  const backColors: THREE.Color[] = [];
  const frontIndices: number[] = [];
  const backIndices: number[] = [];
  const intersectionMap = new Map<string, { front: number, back: number }>();
  const frontEdges: number[][] = [];
  const backEdges: number[][] = [];

  // Convert positions to vertices in local space
  for (let i = 0; i < originalPositions.length; i += 3) {
    vertices.push(new THREE.Vector3(
      originalPositions[i], 
      originalPositions[i + 1], 
      originalPositions[i + 2]
    ));
  }

  // Calculate distances and positions using local plane
  const distances: number[] = vertices.map(v => localPlane.distanceToPoint(v));
  const vertexPositions: Position[] = distances.map(distanceAsPosition);

  // Process triangles
  for (let i = 0; i < indices.length; i += 3) {
    const triangleIndices = [indices[i], indices[i + 1], indices[i + 2]];
    // const trianglePositions = triangleIndices.map(idx => vertexPositions[idx]);

    let frontTriangleVertices: number[] = [];
    let backTriangleVertices: number[] = [];
    
    for (let j = 0; j < 3; j++) {
      const currentIdx = triangleIndices[j];
      const nextIdx = triangleIndices[(j + 1) % 3];
      const currentPos = vertexPositions[currentIdx];
      const nextPos = vertexPositions[nextIdx];

      if (currentPos === FRONT || currentPos === ON) {
        frontTriangleVertices.push(addVertex(currentIdx, 'front'));
      }
      if (currentPos === BACK || currentPos === ON) {
        backTriangleVertices.push(addVertex(currentIdx, 'back'));
      }

      if ((currentPos === FRONT && nextPos === BACK) || 
          (currentPos === BACK && nextPos === FRONT)) {
        const t = Math.abs(distances[currentIdx]) / 
                 (Math.abs(distances[currentIdx]) + Math.abs(distances[nextIdx]));
        
        const intersection = addIntersection(currentIdx, nextIdx, t);
        frontTriangleVertices.push(intersection.front);
        backTriangleVertices.push(intersection.back);
      }
    }

    // Add triangles to respective geometries
    if (frontTriangleVertices.length >= 3) {
      for (let j = 1; j < frontTriangleVertices.length - 1; j++) {
        frontIndices.push(
          frontTriangleVertices[0],
          frontTriangleVertices[j],
          frontTriangleVertices[j + 1]
        );
      }
    }

    if (backTriangleVertices.length >= 3) {
      for (let j = 1; j < backTriangleVertices.length - 1; j++) {
        backIndices.push(
          backTriangleVertices[0],
          backTriangleVertices[j],
          backTriangleVertices[j + 1]
        )
      }
    }
  }

  // Create geometries
  let frontGeometry = new THREE.BufferGeometry();
  let backGeometry = new THREE.BufferGeometry();
 
  // Set attributes
  frontGeometry.setAttribute('position', 
    new THREE.Float32BufferAttribute(frontVertices.flatMap(v => [v.x, v.y, v.z]), 3));
  backGeometry.setAttribute('position', 
    new THREE.Float32BufferAttribute(backVertices.flatMap(v => [v.x, v.y, v.z]), 3));

  // Add color attributes
  frontGeometry.setAttribute('color',
    new THREE.Float32BufferAttribute(frontColors.flatMap(c => [c.r, c.g, c.b]), 3));
  backGeometry.setAttribute('color',
    new THREE.Float32BufferAttribute(backColors.flatMap(c => [c.r, c.g, c.b]), 3));

  if (normals) {
    frontGeometry.setAttribute('normal',
      new THREE.Float32BufferAttribute(frontNormals.flatMap(n => [n.x, n.y, n.z]), 3));
    backGeometry.setAttribute('normal',
      new THREE.Float32BufferAttribute(backNormals.flatMap(n => [n.x, n.y, n.z]), 3));
  }

  if (uvs) {
    frontGeometry.setAttribute('uv',
      new THREE.Float32BufferAttribute(frontUvs.flatMap(uv => [uv.x, uv.y]), 2));
    backGeometry.setAttribute('uv',
      new THREE.Float32BufferAttribute(backUvs.flatMap(uv => [uv.x, uv.y]), 2));
  }

  frontGeometry.setIndex(frontIndices);
  backGeometry.setIndex(backIndices);

  frontGeometry = BufferGeometryUtils.mergeVertices( frontGeometry);
  backGeometry = BufferGeometryUtils.mergeVertices( backGeometry);

  // Compute normals
  frontGeometry.computeVertexNormals();
  backGeometry.computeVertexNormals();

  // Close holes if requested
  if (closeHoles) {
    if (frontEdges.length > 0) {
      const frontHoleFaces = facesFromEdges(frontEdges);
      for (const face of frontHoleFaces) {
        const normal = calculateNormal(face.map(idx => frontVertices[idx]));
        if (normal.dot(localPlane.normal) > 0) face.reverse();
        for (let i = 1; i < face.length - 1; i++) {
          frontIndices.push(face[0], face[i], face[i + 1]);
        }
      }
    }

    if (backEdges.length > 0) {
      const backHoleFaces = facesFromEdges(backEdges);
      for (const face of backHoleFaces) {
        const normal = calculateNormal(face.map(idx => backVertices[idx]));
        if (normal.dot(localPlane.normal) < 0) face.reverse();
        for (let i = 1; i < face.length - 1; i++) {
          backIndices.push(face[0], face[i], face[i + 1]);
        }
      }
    }
  }

  return { front: frontGeometry, back: backGeometry };

  // Helper functions
  function addVertex(index: number, side: 'front' | 'back'): number {
    const vertex = vertices[index];
    const targetVertices = side === 'front' ? frontVertices : backVertices;
    const targetNormals = side === 'front' ? frontNormals : backNormals;
    const targetUvs = side === 'front' ? frontUvs : backUvs;
    const targetColors = side === 'front' ? frontColors : backColors;
    
    targetVertices.push(vertex.clone());
    targetColors.push(new THREE.Color(1, 1, 1)); // Default white color for non-intersection vertices
    
    if (normals) {
      const i = index * 3;
      targetNormals.push(new THREE.Vector3(normals[i], normals[i + 1], normals[i + 2]));
    }
    
    if (uvs) {
      const i = index * 2;
      targetUvs.push(new THREE.Vector2(uvs[i], uvs[i + 1]));
    }
    
    return targetVertices.length - 1;
  }

  function addIntersection(indexA: number, indexB: number, t: number): { front: number, back: number } {
    const id = [indexA, indexB].sort().join(',');
    if (intersectionMap.has(id)) return intersectionMap.get(id)!;

    const vertexA = vertices[indexA];
    const vertexB = vertices[indexB];
    const newVertex = vertexA.clone().lerp(vertexB, t);
    
    const frontIndex = frontVertices.length;
    const backIndex = backVertices.length;
    
    frontVertices.push(newVertex.clone());
    backVertices.push(newVertex.clone());
    
    // Add red color for intersection vertices
    frontColors.push(new THREE.Color(1, 0, 1));
    backColors.push(new THREE.Color(1, 0, 1));

    if (normals) {
      const iA = indexA * 3;
      const iB = indexB * 3;
      const normalA = new THREE.Vector3(normals[iA], normals[iA + 1], normals[iA + 2]);
      const normalB = new THREE.Vector3(normals[iB], normals[iB + 1], normals[iB + 2]);
      const newNormal = normalA.clone().lerp(normalB, t).normalize();
      frontNormals.push(newNormal.clone());
      backNormals.push(newNormal.clone());
    }

    if (uvs) {
      const iA = indexA * 2;
      const iB = indexB * 2;
      const uvA = new THREE.Vector2(uvs[iA], uvs[iA + 1]);
      const uvB = new THREE.Vector2(uvs[iB], uvs[iB + 1]);
      const newUv = uvA.clone().lerp(uvB, t);
      frontUvs.push(newUv.clone());
      backUvs.push(newUv.clone());
    }

    const result = { front: frontIndex, back: backIndex };
    intersectionMap.set(id, result);
    frontEdges.push([indexA, indexB]);
    backEdges.push([indexA, indexB]);
    
    return result;
  }
}

function distanceAsPosition(distance: number): Position {
  if (distance < 0) return BACK;
  if (distance > 0) return FRONT;
  return ON;
}

function calculateNormal(vertices: THREE.Vector3[]): THREE.Vector3 {
  const edgeA = vertices[1].clone().sub(vertices[0]);
  const edgeB = vertices[2].clone().sub(vertices[0]);
  return edgeA.cross(edgeB).normalize();
}