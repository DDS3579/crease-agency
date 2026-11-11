declare module 'fontkit' {
  export function openSync(path: string): {
    variationAxes?: Record<string, { min: number; max: number; default: number }>;
    numGlyphs: number;
    unitsPerEm: number;
    ascent: number;
    descent: number;
    lineGap: number;
    capHeight: number;
    xHeight: number;
  };
}
