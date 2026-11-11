import { drawPrint, PRINT_MAX, printContent } from '../content/print';

export interface PrintTextureSize { width: number; height: number }

/** Explicit sizes: Tier A full print, Tier B / ladder A2 half. */
export function printTextureSize(tierB: boolean): PrintTextureSize {
  return tierB
    ? { width: PRINT_MAX.width / 2, height: PRINT_MAX.height / 2 }
    : { width: PRINT_MAX.width, height: PRINT_MAX.height };
}

/** Base + full mip chain, RGB8. */
export function printTextureBytes(size: PrintTextureSize): number {
  return Math.round(size.width * size.height * 3 * (4 / 3));
}

export function createPrintTexture(gl: WebGL2RenderingContext, tierB: boolean): WebGLTexture {
  const { width, height } = printTextureSize(tierB);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2d context unavailable');
  drawPrint(ctx, { width, height }, printContent);

  const tex = gl.createTexture();
  if (!tex) throw new Error('texture alloc failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // Channel purity matters: R/G/B are independent ink levels, so no premultiply
  // and no colour-space conversion on upload.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) {
    const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
  }
  gl.bindTexture(gl.TEXTURE_2D, null);

  // The 2D canvas is only a staging surface; release it immediately.
  canvas.width = 1;
  canvas.height = 1;
  return tex;
}

export function createFallbackTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('texture alloc failed');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0])
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function disposeTexture(gl: WebGL2RenderingContext, tex: WebGLTexture | null): void {
  if (tex && !gl.isContextLost()) gl.deleteTexture(tex);
}
