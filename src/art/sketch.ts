// 彩铅手绘风的小画笔：暖棕色细线带一点抖动，色块上叠彩铅排线。
// 只给代码画的占位图用；换成正式图片后这些就不再出现。
import { PALETTE } from '../config';

export type Pt = [number, number];
export interface Style { fill?: string | null; stroke?: string | false; width?: number; hatch?: number; r?: number; alpha?: number }

export function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeCanvas(w: number, h: number, res = 2): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas'); cv.width = Math.round(w * res); cv.height = Math.round(h * res);
  const ctx = cv.getContext('2d')!; ctx.scale(res, res); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  return [cv, ctx];
}

export class Sketch {
  r: () => number;
  constructor(public ctx: CanvasRenderingContext2D, seed = 1) { this.r = mulberry(seed); }

  /** 把一条折线切成小段，每个点轻轻抖一下 */
  private wobble(pts: Pt[], closed: boolean, amp: number): Pt[] {
    const out: Pt[] = []; const n = pts.length; const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % n]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const k = Math.max(1, Math.round(len / 22));
      for (let j = 0; j < k; j++) { const t = j / k; out.push([a[0] + (b[0] - a[0]) * t + (this.r() - 0.5) * 2 * amp, a[1] + (b[1] - a[1]) * t + (this.r() - 0.5) * 2 * amp]); }
    }
    if (!closed) out.push([pts[n - 1][0] + (this.r() - 0.5) * amp, pts[n - 1][1] + (this.r() - 0.5) * amp]);
    return out;
  }

  outline(pts: Pt[], closed: boolean, color: string = PALETTE.ink, width = 1.7, alpha = 0.85) {
    const c = this.ctx; c.save(); c.strokeStyle = color;
    for (const [amp, a, w] of [[0.9, alpha, width], [1.5, alpha * 0.4, width * 0.8]]) {
      const p = this.wobble(pts, closed, amp);
      c.globalAlpha = a; c.lineWidth = w; c.beginPath(); c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
      if (closed) c.closePath(); c.stroke();
    }
    c.restore();
  }

  /** 彩铅排线：斜着的细线，有深有浅 */
  private hatch(pts: Pt[], strength: number) {
    const c = this.ctx; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const h = y1 - y0;
    c.save(); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.clip();
    for (let d = x0 - h * 0.6; d < x1; d += 2.5 + this.r() * 4) {
      const light = this.r() < 0.5;
      c.strokeStyle = light ? '#FFFFFF' : '#6B4526'; c.globalAlpha = (light ? 0.1 + this.r() * 0.16 : 0.04 + this.r() * 0.09) * strength;
      c.lineWidth = 0.8 + this.r() * 1.6;
      c.beginPath(); c.moveTo(d + (this.r() - 0.5) * 3, y1 + 2); c.lineTo(d + h * 0.6 + (this.r() - 0.5) * 3, y0 - 2); c.stroke();
    }
    c.restore();
  }

  poly(pts: Pt[], s: Style = {}) {
    const c = this.ctx;
    if (s.fill) {
      c.save(); c.globalAlpha = s.alpha ?? 1; c.fillStyle = s.fill; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); c.restore();
      if ((s.hatch ?? 1) > 0) this.hatch(pts, s.hatch ?? 1);
    }
    if (s.stroke !== false) this.outline(pts, true, s.stroke || PALETTE.ink, s.width ?? 1.7);
  }

  rect(x: number, y: number, w: number, h: number, s: Style = {}) {
    const r = Math.min(s.r ?? 0, w / 2, h / 2);
    if (r <= 0) return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], s);
    const pts: Pt[] = []; const cs: [number, number, number][] = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
    for (const [cx, cy, a0] of cs) for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    this.poly(pts, s);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, s: Style = {}) {
    const n = Math.max(14, Math.round((rx + ry) / 5)); const pts: Pt[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    this.poly(pts, s);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string = PALETTE.ink, width = 1.7, alpha = 0.85) { this.outline([[x1, y1], [x2, y2]], false, color, width, alpha); }

  /** 一条弯的线（花茎、窗帘褶子之类） */
  curve(pts: Pt[], color: string = PALETTE.ink, width = 1.7, alpha = 0.85) { this.outline(pts, false, color, width, alpha); }

  /** 叶子 */
  leaf(x: number, y: number, len: number, angle: number, fill: string) {
    const c = Math.cos(angle), s = Math.sin(angle); const w = len * 0.28;
    const p = (t: number, o: number): Pt => [x + c * len * t - s * w * o, y + s * len * t + c * w * o];
    this.poly([p(0, 0), p(0.3, 0.8), p(0.65, 0.9), p(1, 0), p(0.65, -0.9), p(0.3, -0.8)], { fill, width: 1.3 });
  }
}

/** 给已经画好的图整体叠一层彩铅排线（只画在有颜色的地方） */
export function pencilOver(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7, strength = 1) {
  const r = mulberry(seed);
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.lineCap = 'round';
  for (let d = -h * 0.6; d < w; d += 3 + r() * 5) {
    const light = r() < 0.55;
    ctx.strokeStyle = light ? '#FFFFFF' : '#6B4526'; ctx.globalAlpha = (light ? 0.1 + r() * 0.14 : 0.03 + r() * 0.07) * strength; ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(d, h); ctx.lineTo(d + h * 0.6, 0); ctx.stroke();
  }
  ctx.restore();
}
