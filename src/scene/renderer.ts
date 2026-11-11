import {
  BEND_HALF,
  LAYER_EPSILON,
  applyFolds,
  baseFolds,
  cornerCurlFold,
  createFoldState,
  type Fold
} from '../content/folds';
import type { SceneState } from '../content/journey';
import { clamp, clamp01, degToRad, type Vec2 } from '../lib/math';
import { calibratedExposure, LIGHT_DIR, palette, WRAP } from '../lib/exposure';
import { ladderSettings, type LadderLevel, type Tier } from '../lib/tier';
import { buildSheetMesh, shadowIndices, shadowVertices } from './mesh';
import { cameraEye, lookAt, multiply, perspective, projectPoint } from './camera';
import { createFallbackTexture, createPrintTexture } from './print-texture';
import { PARITY_FS, PARITY_VS, SHADOW_FS, SHADOW_VS, SHEET_FS, SHEET_VS } from './shaders';

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255
];

const ORDER = [1, 2, 0, 3, 4];
const PARENT = [-1, 0, 0, -1, -1];

export interface RenderStats {
  renders: number;
  drawCalls: number;
  triangles: number;
  textureCount: number;
  gpuMemoryMB: number;
}

export class SceneRenderer {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  tier: Tier;
  level: LadderLevel;
  stats: RenderStats = { renders: 0, drawCalls: 0, triangles: 0, textureCount: 0, gpuMemoryMB: 0 };
  activity = new Float32Array(8);
  private prevAngles: Record<string, number> = {};
  private sheetProg: WebGLProgram;
  private shadowProg: WebGLProgram;
  private parityProg: WebGLProgram | null = null;
  private sheetVao: WebGLVertexArrayObject;
  private shadowVao: WebGLVertexArrayObject;
  private sheetVbo: WebGLBuffer;
  private sheetIbo: WebGLBuffer;
  private shadowVbo: WebGLBuffer;
  private shadowIbo: WebGLBuffer;
  private printTex: WebGLTexture;
  private fallbackTex: WebGLTexture;
  private meshTriangles = 0;
  private cssW = 1;
  private cssH = 1;
  private lastViewProj: Float32Array | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private shadowUniforms: Record<string, WebGLUniformLocation | null> = {};
  private disposed = false;
  private printReady = false;
  private extFloat: EXT_color_buffer_float | null;

  constructor(canvas: HTMLCanvasElement, tier: Tier, level: LadderLevel) {
    this.canvas = canvas;
    this.tier = tier;
    this.level = level;
    const settings = ladderSettings(level, tier);
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: settings.msaa,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 context creation failed');
    this.gl = gl;
    this.extFloat = gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('KHR_parallel_shader_compile');
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);

    this.sheetProg = this.program(SHEET_VS, SHEET_FS);
    this.shadowProg = this.program(SHADOW_VS, SHADOW_FS);
    this.cacheUniforms();

    this.sheetVao = this.createVao();
    this.sheetVbo = this.createBuffer();
    this.sheetIbo = this.createBuffer();
    this.shadowVao = this.createVao();
    this.shadowVbo = this.createBuffer();
    this.shadowIbo = this.createBuffer();
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
    gl.bufferData(gl.ARRAY_BUFFER, shadowVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.shadowIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shadowIndices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this.fallbackTex = this.trackTexture(createFallbackTexture(gl));
    this.printTex = this.fallbackTex;
    this.rebuildMesh(settings.mesh[0], settings.mesh[1]);
    this.resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error('shader alloc failed');
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile: ${log}`);
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram();
    if (!p) throw new Error('program alloc failed');
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`Program link: ${log}`);
    }
    return p;
  }

  private cacheUniforms(): void {
    const gl = this.gl;
    const names = [
      'uProj', 'uView', 'uAxisPoint', 'uAxisDir', 'uAngle', 'uParent', 'uOrder', 'uFoldCount',
      'uBendHalf', 'uLayerEpsilon', 'uPrint', 'uInkLevels', 'uPaper', 'uInk', 'uBack', 'uCrease',
      'uLightDir', 'uWrap', 'uExposure', 'uFibre', 'uActivity'
    ];
    for (const n of names) this.uniforms[n] = gl.getUniformLocation(this.sheetProg, n);
    for (const n of ['uProj', 'uView', 'uOpacity']) this.shadowUniforms[n] = gl.getUniformLocation(this.shadowProg, n);
  }

  private createVao(): WebGLVertexArrayObject {
    const v = this.gl.createVertexArray();
    if (!v) throw new Error('vao alloc failed');
    return v;
  }
  private createBuffer(): WebGLBuffer {
    const b = this.gl.createBuffer();
    if (!b) throw new Error('buffer alloc failed');
    return b;
  }
  private trackTexture(t: WebGLTexture): WebGLTexture {
    this.stats.textureCount++;
    return t;
  }

  private rebuildMesh(nx: number, ny: number): void {
    const gl = this.gl;
    const mesh = buildSheetMesh(nx, ny);
    gl.bindVertexArray(this.sheetVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sheetVbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sheetIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.meshTriangles = mesh.triangles;
    this.stats.gpuMemoryMB = (mesh.vertices.byteLength + mesh.indices.byteLength) / 1048576 + (this.printReady ? 10 : 0.1);
  }

  async loadPrint(): Promise<void> {
    if (this.printReady || this.disposed) return;
    await document.fonts.ready;
    if (this.disposed) return;
    const tex = this.trackTexture(createPrintTexture(this.gl, this.tier === 'B' || this.level === 'A2'));
    const old = this.printTex;
    this.printTex = tex;
    this.printReady = true;
    if (old !== this.fallbackTex) {
      this.gl.deleteTexture(old);
      this.stats.textureCount--;
    }
    this.stats.gpuMemoryMB += 10;
  }

  resize(cssW: number, cssH: number): void {
    const s = ladderSettings(this.level, this.tier);
    const dpr = Math.min(window.devicePixelRatio || 1, s.dprCap) * s.renderScale;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.cssW = cssW;
    this.cssH = cssH;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  setLevel(level: LadderLevel): void {
    if (level === this.level) return;
    const before = ladderSettings(this.level, this.tier);
    this.level = level;
    const after = ladderSettings(level, this.tier);
    if (before.mesh[0] !== after.mesh[0]) this.rebuildMesh(after.mesh[0], after.mesh[1]);
    this.resize(this.cssW, this.cssH);
  }

  private setFoldUniforms(folds: readonly Fold[], prog: WebGLProgram): void {
    const gl = this.gl;
    const points = new Float32Array(16);
    const dirs = new Float32Array(16);
    const angles = new Float32Array(8);
    folds.forEach((f, i) => {
      points[i * 2] = f.axisPoint[0];
      points[i * 2 + 1] = f.axisPoint[1];
      const l = Math.hypot(f.axisDir[0], f.axisDir[1]) || 1;
      dirs[i * 2] = f.axisDir[0] / l;
      dirs[i * 2 + 1] = f.axisDir[1] / l;
      angles[i] = degToRad(f.angle);
    });
    gl.useProgram(prog);
    gl.uniform2fv(gl.getUniformLocation(prog, 'uAxisPoint'), points);
    gl.uniform2fv(gl.getUniformLocation(prog, 'uAxisDir'), dirs);
    gl.uniform1fv(gl.getUniformLocation(prog, 'uAngle'), angles);
    gl.uniform1iv(gl.getUniformLocation(prog, 'uParent'), PARENT);
    gl.uniform1iv(gl.getUniformLocation(prog, 'uOrder'), ORDER);
    gl.uniform1i(gl.getUniformLocation(prog, 'uFoldCount'), folds.length);
    gl.uniform1f(gl.getUniformLocation(prog, 'uBendHalf'), BEND_HALF);
    gl.uniform1f(gl.getUniformLocation(prog, 'uLayerEpsilon'), LAYER_EPSILON);
  }

  render(state: SceneState, curl: { corner: 'tl' | 'tr' | 'bl' | 'br'; angle: number } | null, dt: number): boolean {
    if (this.disposed) return false;
    const gl = this.gl;
    const s = ladderSettings(this.level, this.tier);
    const folds = createFoldState(state.folds);
    if (curl && curl.angle > 0.001) {
      const idx = folds.findIndex((f) => f.id === 'curl');
      folds[idx] = cornerCurlFold(curl.corner, curl.angle);
    }

    // crease activity: smoothed absolute angular velocity, ~250ms decay.
    let activityActive = false;
    const decay = 1 - Math.exp(-dt / 0.25);
    for (let i = 0; i < folds.length; i++) {
      const f = folds[i]!;
      const prev = this.prevAngles[f.id] ?? f.angle;
      const vel = dt > 0 ? Math.abs(f.angle - prev) / dt : 0;
      const target = clamp01(vel / 150);
      this.activity[i] = this.activity[i]! + (target - this.activity[i]!) * decay;
      if (this.activity[i]! > 0.002) activityActive = true;
      this.prevAngles[f.id] = f.angle;
    }

    const aspect = this.cssW / this.cssH;
    const proj = perspective(aspect, state.camera.centreX, state.camera.centreY);
    const view = lookAt(cameraEye(state.camera.az, state.camera.el, state.camera.dist), [0, 0, 0], [0, 1, 0]);
    this.lastViewProj = multiply(proj, view);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.stats.drawCalls = 0;

    // baked contact shadow plane
    gl.useProgram(this.shadowProg);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniformMatrix4fv(this.shadowUniforms.uProj!, false, proj);
    gl.uniformMatrix4fv(this.shadowUniforms.uView!, false, view);
    gl.uniform1f(this.shadowUniforms.uOpacity!, state.key === 'launch' ? 0 : 0.11);
    gl.bindVertexArray(this.shadowVao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    this.stats.drawCalls++;
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // sheet
    gl.useProgram(this.sheetProg);
    this.setFoldUniforms(folds, this.sheetProg);
    const u = this.uniforms;
    gl.uniformMatrix4fv(u.uProj!, false, proj);
    gl.uniformMatrix4fv(u.uView!, false, view);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.printTex);
    gl.uniform1i(u.uPrint!, 0);
    gl.uniform3f(u.uInkLevels!, state.ink[0], state.ink[1], state.ink[2]);
    const paper = hex(palette.paper);
    const ink = hex(palette.ink);
    const back = hex(palette.back);
    const crease = hex(palette.crease);
    gl.uniform3f(u.uPaper!, paper[0], paper[1], paper[2]);
    gl.uniform3f(u.uInk!, ink[0], ink[1], ink[2]);
    gl.uniform3f(u.uBack!, back[0], back[1], back[2]);
    gl.uniform3f(u.uCrease!, crease[0], crease[1], crease[2]);
    gl.uniform3f(u.uLightDir!, LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
    gl.uniform1f(u.uWrap!, WRAP);
    gl.uniform1f(u.uExposure!, calibratedExposure());
    gl.uniform1f(u.uFibre!, s.fibre ? 1 - state.launchInkFade : 0);
    gl.uniform1fv(u.uActivity!, this.activity);
    gl.bindVertexArray(this.sheetVao);
    gl.drawElements(gl.TRIANGLES, this.meshTriangles * 3, gl.UNSIGNED_SHORT, 0);
    this.stats.drawCalls++;
    gl.bindVertexArray(null);

    this.stats.renders++;
    this.stats.triangles = this.meshTriangles + 2;
    return activityActive;
  }

  curlTarget(px: number, py: number, state: SceneState): { corner: 'tl' | 'tr' | 'bl' | 'br'; angle: number } | null {
    if (!this.lastViewProj) return null;
    const corners: { id: 'tl' | 'tr' | 'bl' | 'br'; p: Vec2 }[] = [
      { id: 'tl', p: [-1, 0.625] },
      { id: 'tr', p: [1, 0.625] },
      { id: 'bl', p: [-1, -0.625] },
      { id: 'br', p: [1, -0.625] }
    ];
    let best: { corner: 'tl' | 'tr' | 'bl' | 'br'; angle: number } | null = null;
    let bestD = 160;
    for (const c of corners) {
      const ndc = projectPoint(this.lastViewProj, [c.p[0], c.p[1], 0]);
      const sx = ((ndc[0] + 1) / 2) * this.cssW;
      const sy = ((1 - ndc[1]) / 2) * this.cssH;
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestD) {
        bestD = d;
        best = { corner: c.id, angle: 14 * Math.pow(1 - d / 160, 1.4) };
      }
    }
    return best;
  }

  gpuParity(points: readonly Vec2[], state: SceneState): Float32Array {
    const gl = this.gl;
    if (!this.extFloat) throw new Error('EXT_color_buffer_float unavailable');
    if (!this.parityProg) this.parityProg = this.program(PARITY_VS, PARITY_FS);
    const folds = createFoldState(state.folds);
    this.setFoldUniforms(folds, this.parityProg);
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    const vao = this.createVao();
    const vbo = this.createBuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 8, 8, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 8, 8);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.parityProg);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flat()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, points.length);
    const out = new Float32Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.DEPTH_TEST);
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fb);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vbo);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = out[i * 4]!;
      positions[i * 3 + 1] = out[i * 4 + 1]!;
      positions[i * 3 + 2] = out[i * 4 + 2]!;
    }
    return positions;
  }

  readCenterPixel(): [number, number, number, number] {
    const gl = this.gl;
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(this.canvas.width / 2), Math.floor(this.canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0]!, px[1]!, px[2]!, px[3]!];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteProgram(this.sheetProg);
    gl.deleteProgram(this.shadowProg);
    if (this.parityProg) gl.deleteProgram(this.parityProg);
    gl.deleteVertexArray(this.sheetVao);
    gl.deleteVertexArray(this.shadowVao);
    gl.deleteBuffer(this.sheetVbo);
    gl.deleteBuffer(this.sheetIbo);
    gl.deleteBuffer(this.shadowVbo);
    gl.deleteBuffer(this.shadowIbo);
    gl.deleteTexture(this.printTex);
    if (this.fallbackTex !== this.printTex) gl.deleteTexture(this.fallbackTex);
    this.stats.textureCount = 0;
  }
}

export { applyFolds, baseFolds };
