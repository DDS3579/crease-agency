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
      vertices[v++] = -SHEET.halfW + (SHEET.width * i) / nx;
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

/**
 * Baked contact shadow. Half-extents 1.02 x 0.64: 2% beyond the flat sheet, not
 * the 8%/12% of the first pass. The oversized plane was the single biggest
 * contributor to shadow intrusion under the text column.
 * SHADOW_VS divides by these exact numbers, so the falloff still reaches zero at
 * the quad edge and there is no hard seam.
 */
export const SHADOW_HALF = { x: 1.02, y: 0.64 } as const;

export const shadowVertices = new Float32Array([
  -SHADOW_HALF.x, -SHADOW_HALF.y,
  SHADOW_HALF.x, -SHADOW_HALF.y,
  -SHADOW_HALF.x, SHADOW_HALF.y,
  SHADOW_HALF.x, SHADOW_HALF.y
]);

export const shadowIndices = new Uint16Array([0, 1, 2, 1, 3, 2]);
