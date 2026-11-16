// 从一张猫的照片里取出主要的毛色，猜一个最接近的花纹。
// 全部在手机本地算，不联网、不用 AI：所以只能做到「颜色和花纹像」，做不到「长得像」。
// 结果只是初稿，主人可以在捏猫的界面里接着改。
import { DEFAULT_LOOK, type Look } from './config';

interface Cluster { r: number; g: number; b: number; share: number; l: number; sat: number; hue: number }

const toHex = (c: { r: number; g: number; b: number }) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function describe(r: number, g: number, b: number, share: number): Cluster {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255; const l = (mx + mn) / 2; const d = mx - mn;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) { const R = r / 255, G = g / 255, B = b / 255; hue = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; hue = (hue * 60 + 360) % 360; }
  return { r, g, b, share, l, sat, hue };
}

/** 把照片中间那一块的颜色分成三堆（k-means），按占的面积从大到小排 */
export function dominantColors(src: CanvasImageSource & { width: number; height: number }): Cluster[] {
  const S = 48; const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  // 只看中间 70%：猫一般在照片中间，四周多半是背景
  const w = src.width * 0.7, h = src.height * 0.7;
  ctx.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const px: [number, number, number, number][] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; if (d[i + 3] < 128) continue;
    // 越靠中间越重要
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    px.push([d[i], d[i + 1], d[i + 2], Math.exp(-(dx * dx + dy * dy) * 1.2)]);
  }
  if (!px.length) return [];
  const lum = (p: number[]) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;
  const sorted = px.slice().sort((a, b) => lum(a) - lum(b));
  // 起点：最暗、中间、最亮
  let cs = [sorted[Math.floor(sorted.length * 0.08)], sorted[Math.floor(sorted.length * 0.5)], sorted[Math.floor(sorted.length * 0.92)]].map((p) => [p[0], p[1], p[2]]);
  let weight = [0, 0, 0];
  for (let it = 0; it < 10; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let best = 0, bd = Infinity;
      cs.forEach((c, k) => { const dist = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dist < bd) { bd = dist; best = k; } });
      sum[best][0] += p[0] * p[3]; sum[best][1] += p[1] * p[3]; sum[best][2] += p[2] * p[3]; sum[best][3] += p[3];
    }
    cs = cs.map((c, k) => (sum[k][3] > 0 ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
    weight = sum.map((x) => x[3]);
  }
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  let out = cs.map((c, k) => describe(c[0], c[1], c[2], weight[k] / total)).filter((c) => c.share > 0.02);
  // 很接近的两堆并成一堆
  for (let i = 0; i < out.length; i++) for (let j = out.length - 1; j > i; j--) {
    const a = out[i], b = out[j];
    if (Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 42) { const t = a.share + b.share; out[i] = describe((a.r * a.share + b.r * b.share) / t, (a.g * a.share + b.g * b.share) / t, (a.b * a.share + b.b * b.share) / t, t); out.splice(j, 1); }
  }
  return out.sort((a, b) => b.share - a.share);
}

export function lookFromColors(cs: Cluster[]): Look {
  if (!cs.length) return { ...DEFAULT_LOOK };
  const big = cs.filter((c) => c.share >= 0.14);
  const white = big.find((c) => c.l > 0.74 && c.sat < 0.3);
  const dark = big.find((c) => c.l < 0.28);
  const orange = big.find((c) => c.hue >= 12 && c.hue <= 48 && c.sat > 0.32 && c.l > 0.3 && c.l < 0.8);
  const main = cs[0];
  const look: Look = { ...DEFAULT_LOOK, body: toHex(main), eye: '#3B2A22' };
  if (white && dark && orange) return { ...look, pattern: 'calico', body: toHex(white), c2: toHex(orange), c3: toHex(dark) };
  if (dark && orange && !white) return { ...look, pattern: 'tortie', body: toHex(dark), c2: toHex(orange), c3: toHex({ r: orange.r + 30, g: orange.g + 40, b: orange.b + 30 }), eye: '#E0B040' };
  if (white && dark) return { ...look, pattern: 'cow', body: toHex(white), c2: toHex(dark) };
  // 浅色的身体 + 一小块深棕：当成重点色（暹罗那样）
  const brown = big.find((c) => c !== main && c.l < 0.4 && c.l < main.l - 0.3);
  if (main.l > 0.62 && brown) return { ...look, pattern: 'point', c2: toHex(brown), eye: '#5E9BD6' };
  // 差不多只有一种颜色：很深或很浅的当纯色，其余当条纹
  if (main.l < 0.3) return { ...look, pattern: 'solid', eye: '#E0B040' };
  if (main.l > 0.8) return { ...look, pattern: 'solid' };
  return { ...look, pattern: 'stripes' };
}

export const lookFromPhoto = (src: CanvasImageSource & { width: number; height: number }) => lookFromColors(dominantColors(src));
