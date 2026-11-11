export {};

declare global {
  interface Window {
    __layout?: {
      inFrame: number;
      total: number;
      inFrameCount: number;
      byApi: Record<string, number>;
    };
    __gl?: {
      counts: Record<string, number>;
      draws: number;
      live(): Record<string, number>;
    };
    __htmlStyle?: { count: number; samples: string[] };
    __probe?: { lastR: number; stable: number };
  }
}
