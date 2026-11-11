export const FOLD_GLSL = /* glsl */ `
uniform vec2 uAxisPoint[8];
uniform vec2 uAxisDir[8];
uniform float uAngle[8];
uniform int uParent[8];
uniform int uOrder[8];
uniform int uFoldCount;
uniform float uBendHalf;
uniform float uLayerEpsilon;

float sideDist(int i, vec2 p) {
  vec2 n = vec2(-uAxisDir[i].y, uAxisDir[i].x);
  return dot(p - uAxisPoint[i], n);
}

bool insideFold(int i, vec2 p) {
  if (sideDist(i, p) <= -uBendHalf) return false;
  int par = uParent[i];
  int guard = 0;
  while (par >= 0 && guard < 8) {
    if (sideDist(par, p) <= -uBendHalf) return false;
    par = uParent[par];
    guard++;
  }
  return true;
}

vec3 rotAxis(vec3 v, vec3 ax, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
}

void foldVertex(vec2 flat, out vec3 pos, out vec3 nrm, out float layer) {
  pos = vec3(flat, 0.0);
  nrm = vec3(0.0, 0.0, 1.0);
  layer = 0.0;
  for (int o = 0; o < 8; o++) {
    if (o >= uFoldCount) break;
    int i = uOrder[o];
    if (!insideFold(i, flat)) continue;
    float theta = uAngle[i];
    if (abs(theta) < 1e-7) continue;
    float d = sideDist(i, flat);
    if (d > 0.0) layer += 1.0;
    float phi = theta * clamp((d + uBendHalf) / (2.0 * uBendHalf), 0.0, 1.0);
    float k = theta / (2.0 * uBendHalf);
    float extra = max(d - uBendHalf, 0.0);
    float f = -uBendHalf + sin(phi) / k + extra * cos(theta);
    float g = (1.0 - cos(phi)) / k + extra * sin(theta);
    float cn = f - d * cos(phi);
    float ck = g - d * sin(phi);
    vec3 ax = vec3(uAxisDir[i], 0.0);
    vec3 n2 = vec3(-uAxisDir[i].y, uAxisDir[i].x, 0.0);
    vec3 anchor = vec3(uAxisPoint[i], 0.0);
    vec3 v = pos - anchor;
    pos = anchor + rotAxis(v, ax, phi) + n2 * cn + vec3(0.0, 0.0, 1.0) * ck;
    nrm = rotAxis(nrm, ax, phi);
  }
  pos += nrm * uLayerEpsilon * layer;
}
`;

export const SHEET_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aFlat;
uniform mat4 uProj;
uniform mat4 uView;
${FOLD_GLSL}
out vec2 vFlat;
out vec3 vNormal;
out float vLayer;
void main() {
  vec3 pos; vec3 nrm; float layer;
  foldVertex(aFlat, pos, nrm, layer);
  vFlat = aFlat;
  vNormal = nrm;
  vLayer = layer;
  gl_Position = uProj * uView * vec4(pos, 1.0);
}
`;

export const SHEET_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vFlat;
in vec3 vNormal;
in float vLayer;
uniform sampler2D uPrint;
uniform vec3 uInkLevels;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uBack;
uniform vec3 uCrease;
uniform vec3 uLightDir;
uniform float uWrap;
uniform float uExposure;
uniform float uFibre;
uniform float uActivity[8];
${FOLD_GLSL}
out vec4 outColor;

float creaseLine(int i, vec2 p, out float activity) {
  float d = sideDist(i, p);
  float w = fwidth(d);
  activity = uActivity[i];
  float line = 1.0 - smoothstep(w * 0.35, w * 1.6, abs(d));
  return line;
}

void main() {
  vec3 n = normalize(vNormal);
  float fiber = sin(vFlat.x * 420.0 + sin(vFlat.y * 37.0)) * sin(vFlat.y * 420.0);
  n = normalize(n + vec3(fiber * uFibre * 0.012, fiber * uFibre * 0.008, 0.0));
  if (!gl_FrontFacing) n = -n;

  float ndl = dot(n, uLightDir);
  float diffuse = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0);
  float hemi = 0.5 + 0.5 * n.z;
  float light = 0.72 * diffuse + 0.28 * hemi;

  float ao = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uFoldCount) break;
    float d = sideDist(i, vFlat);
    float band = 1.0 - smoothstep(0.0, uBendHalf * 2.5, abs(d));
    ao -= 0.16 * (abs(uAngle[i]) / 3.14159265) * band;
  }
  ao = clamp(ao, 0.6, 1.0);

  vec3 base = gl_FrontFacing ? uPaper : uBack;
  vec3 col = base * light * uExposure * ao;

  vec2 uv = vec2((vFlat.x + 1.0) * 0.5, (0.625 - vFlat.y) / 1.25);
  vec3 print = texture(uPrint, uv).rgb;
  float inkAmt = clamp(dot(print, uInkLevels), 0.0, 1.0);
  col = mix(col, uInk, inkAmt);

  for (int i = 0; i < 8; i++) {
    if (i >= uFoldCount) break;
    if (abs(uAngle[i]) < 0.001 && uActivity[i] < 0.001) continue;
    float act;
    float line = creaseLine(i, vFlat, act);
    if (line <= 0.0) continue;
    vec3 lineCol = mix(uInk, uCrease, clamp(act, 0.0, 1.0));
    float alpha = line * (0.55 + 0.45 * clamp(act, 0.0, 1.0));
    col = mix(col, lineCol, alpha);
  }

  outColor = vec4(col, 1.0);
}
`;

export const SHADOW_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uProj;
uniform mat4 uView;
out vec2 vUv;
void main() {
  vUv = aPos / vec2(1.08, 0.7) * 0.5 + 0.5;
  gl_Position = uProj * uView * vec4(aPos, -0.012, 1.0);
}
`;

export const SHADOW_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uOpacity;
out vec4 outColor;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float d = length(q * vec2(1.0, 1.25));
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * uOpacity;
  vec3 col = vec3(0.08, 0.075, 0.065);
  outColor = vec4(col * a, a);
}
`;

export const PARITY_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aFlat;
${FOLD_GLSL}
out vec3 vPos;
void main() {
  vec3 pos; vec3 nrm; float layer;
  foldVertex(aFlat, pos, nrm, layer);
  vPos = pos;
  int id = gl_VertexID;
  float x = float(id % 8) / 7.0 * 2.0 - 1.0;
  float y = float(id / 8) / 7.0 * 2.0 - 1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

export const PARITY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vPos;
out vec4 outColor;
void main() { outColor = vec4(vPos, 1.0); }
`;
