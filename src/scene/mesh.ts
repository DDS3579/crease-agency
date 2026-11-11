import { SHEET } from '../content/folds';

export interface SheetMesh {
  vertices: Float32Array;
  indices: Uint16Array;
  triangles: number;
}

export function buildSheetMesh(nx: number, ny: number): SheetMesh {
  const vertices = new Float32Array((nx + 1) * (ny + 1) * 2);
  let v = 0;
  for (let j = 0; j <= ny; j++) {
    const y = -SHEET.halfH + (SHEET.height * j) / ny;
    for (let i = 0; i <= nx; i++) {
      const x = -SHEET.halfW + (SHEET.width * i) / nx;
      vertices[v++] = x;
      vertices[v++] = y;
    }
  }
  const indices = new Uint16Array(nx * ny * 6);
  let k = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + (nx + 1);
      const d = c + 1;
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = b; indices[k++] = d; indices[k++] = c;
    }
  }
  return { vertices, indices, triangles: nx * ny * 2 };
}

export const shadowVertices = new Float32Array([
  -1.08, -0.7,
  1.08, -0.7,
  -1.08, 0.7,
  1.08, 0.7
]);
export const shadowIndices = new Uint16Array([0, 1, 2, 1, 3, 2]);
