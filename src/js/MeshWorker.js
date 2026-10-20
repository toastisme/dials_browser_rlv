// MeshWorker.js
// Marching cubes over the flat grid. Only the triangles are kept, so memory
// scales with the surface rather than the grid.
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js';
import LZ4 from 'lz4js';

// Above this the mesh is too large to draw; the user should raise the threshold
const MAX_TRIANGLES = 4000000;

// Cube corners (x fastest) and the corners at the ends of each edge
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function decompressGrid(msg) {
  const { data: compressedData, dtype } = msg;
  const decompressed = LZ4.decompress(new Uint8Array(compressedData));
  let TypedArray;
  switch (dtype) {
    case "float16":
      TypedArray = Float16Array;
      break;
    case "float32":
      TypedArray = Float32Array;
      break;
    case "float64":
      TypedArray = Float64Array;
      break;
    case "int32":
      TypedArray = Int32Array;
      break;
    default:
      throw new Error(`Unsupported data type: ${dtype}`);
  }
  return new TypedArray(
    decompressed.buffer,
    decompressed.byteOffset,
    decompressed.byteLength / TypedArray.BYTES_PER_ELEMENT
  );
}

/**
 * Triangles (9 floats each) of the isosurface of grid, a C-ordered
 * [n0][n1][n2] array. Vertices are (i0, i1, i2) grid coordinates.
 * Returns null if there are more than MAX_TRIANGLES.
 */
function marchingCubes(grid, shape, isovalue) {
  const [n0, n1, n2] = shape;
  const stride = [1, n2, n1 * n2]; // x = i2, y = i1, z = i0
  const cornerOffsets = CORNERS.map(c => c[0] * stride[0] + c[1] * stride[1] + c[2] * stride[2]);
  const values = new Float64Array(8);
  const edgeVertices = new Float32Array(12 * 3);
  let positions = new Float32Array(9 * 65536);
  let numFloats = 0;

  for (let z = 0; z < n0 - 1; z++) {
    for (let y = 0; y < n1 - 1; y++) {
      for (let x = 0; x < n2 - 1; x++) {
        const base = z * stride[2] + y * stride[1] + x;
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          values[c] = grid[base + cornerOffsets[c]];
          if (values[c] < isovalue) cubeIndex |= 1 << c;
        }
        const edges = edgeTable[cubeIndex];
        if (edges === 0) continue;

        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue;
          const [a, b] = EDGES[e];
          const va = values[a], vb = values[b];
          const mu = va === vb ? 0.5 : (isovalue - va) / (vb - va);
          const ca = CORNERS[a], cb = CORNERS[b];
          // Stored as (i0, i1, i2)
          edgeVertices[e * 3] = z + ca[2] + mu * (cb[2] - ca[2]);
          edgeVertices[e * 3 + 1] = y + ca[1] + mu * (cb[1] - ca[1]);
          edgeVertices[e * 3 + 2] = x + ca[0] + mu * (cb[0] - ca[0]);
        }

        for (let t = cubeIndex * 16; triTable[t] !== -1; t++) {
          if (numFloats + 3 > positions.length) {
            if (positions.length / 9 >= MAX_TRIANGLES) return null;
            const larger = new Float32Array(positions.length * 2);
            larger.set(positions);
            positions = larger;
          }
          const e = triTable[t] * 3;
          positions[numFloats++] = edgeVertices[e];
          positions[numFloats++] = edgeVertices[e + 1];
          positions[numFloats++] = edgeVertices[e + 2];
        }
      }
    }
  }
  return positions.slice(0, numFloats);
}

self.onmessage = function (e) {
  const { data, meshShape, isovalue } = e.data;
  const grid = decompressGrid(data);
  if (grid.length !== meshShape[0] * meshShape[1] * meshShape[2]) {
    throw new Error("Mesh data length does not match its shape");
  }
  const positions = marchingCubes(grid, meshShape, Number(isovalue));
  if (positions === null) {
    self.postMessage({
      type: 'marchingError',
      message: "The mesh is too large to show. Raise the mesh threshold or lower the grid size.",
    });
    return;
  }
  self.postMessage({ type: 'marchingResult', positions }, [positions.buffer]);
};
