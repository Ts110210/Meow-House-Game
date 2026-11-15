// 读取精灵图：默认宠物和上传的宠物走同一套格式。
import { Rectangle, Texture } from 'pixi.js';
import { SPRITE, type ActionName } from './config';

const C = SPRITE.cell;
const N = SPRITE.framesPerRow;

export interface SpriteSet {
  id: string;
  sheet: HTMLCanvasElement;
  rows: number;
  avatar: HTMLCanvasElement;
  tex: Texture[][];
}

export function buildSet(id: string, sheet: HTMLCanvasElement, avatar?: HTMLCanvasElement | null): SpriteSet {
  const rows = Math.min(SPRITE.rows.length, Math.floor(sheet.height / C));
  const base = Texture.from(sheet);
  const tex: Texture[][] = [];
  for (let r = 0; r < rows; r++) {
    tex.push(Array.from({ length: N }, (_, f) => new Texture({ source: base.source, frame: new Rectangle(f * C, r * C, C, C) })));
  }
  return { id, sheet, rows, avatar: avatar ?? firstFrame(sheet), tex };
}

/** 只给面板里的预览动画用的轻量版：不建 Pixi 贴图 */
export function previewSet(sheet: HTMLCanvasElement): SpriteSet {
  return { id: 'preview', sheet, rows: Math.min(SPRITE.rows.length, Math.floor(sheet.height / C)), avatar: sheet, tex: [] };
}

function firstFrame(sheet: HTMLCanvasElement) {
  const cv = document.createElement('canvas'); cv.width = C; cv.height = C;
  cv.getContext('2d')!.drawImage(sheet, 0, 0, C, C, 0, 0, C, C);
  return cv;
}

/** 这个动作实际用第几行（缺了的可选动作会换成代替动作） */
export function rowFor(set: SpriteSet, action: ActionName): number {
  let a: string = action;
  for (let i = 0; i < 3; i++) {
    const idx = (SPRITE.rows as readonly string[]).indexOf(a);
    if (idx >= 0 && idx < set.rows) return idx;
    a = SPRITE.fallback[a] ?? 'idle';
  }
  return 0;
}

export const hasRow = (set: SpriteSet, action: ActionName) => (SPRITE.rows as readonly string[]).indexOf(action) < set.rows;

export function frameIndex(action: ActionName, t: number) {
  return Math.floor((t / 1000) * (SPRITE.fps[action] ?? 4)) % N;
}

/** 在普通 canvas 上画一帧（明信片、背屏预览、面板里的小动画都用它） */
export function drawFrame(ctx: CanvasRenderingContext2D, set: SpriteSet, action: ActionName, frame: number, x: number, y: number, size: number, flip = false) {
  const r = rowFor(set, action);
  ctx.save();
  if (flip) { ctx.translate(x + size, y); ctx.scale(-1, 1); ctx.drawImage(set.sheet, (frame % N) * C, r * C, C, C, 0, 0, size, size); }
  else ctx.drawImage(set.sheet, (frame % N) * C, r * C, C, C, x, y, size, size);
  ctx.restore();
}

// ---------- 导入上传的图片 ----------

export interface ImportResult { ok: boolean; msg?: string; sheet?: HTMLCanvasElement; rows?: number }

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读不出来'));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/** 按格子切开：宽度分成 4 列，每格是正方形，行数由高度决定。大小不是 256 的会自动缩放。 */
export function normalizeSheet(img: HTMLImageElement | HTMLCanvasElement, removeWhite: boolean): ImportResult {
  const cellW = img.width / N;
  const rowsF = img.height / cellW;
  const rows = Math.round(rowsF);
  if (cellW < 32) return { ok: false, msg: '图片太小了' };
  if (Math.abs(rowsF - rows) > 0.12) return { ok: false, msg: `尺寸对不上：宽度分成 4 格后，每格 ${Math.round(cellW)} 像素，高度应该是它的整数倍` };
  if (rows < SPRITE.requiredRows) return { ok: false, msg: `至少要有 ${SPRITE.requiredRows} 行（待机、走路、吃东西、睡觉、开心），这张只有 ${rows} 行` };
  const useRows = Math.min(rows, SPRITE.rows.length);
  const cv = document.createElement('canvas'); cv.width = C * N; cv.height = C * useRows;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, img.width, cellW * useRows, 0, 0, cv.width, cv.height);
  if (removeWhite) knockOutWhite(ctx, cv.width, cv.height, C);
  return { ok: true, sheet: cv, rows: useRows };
}

/** 去掉和图片边缘连在一起的白色背景（被线条围住的白色不会被去掉）。
 *  cell > 0 时，每一格的四条边都当作起点，这样精灵图格子之间的白色也能去掉。 */
export function knockOutWhite(ctx: CanvasRenderingContext2D, w: number, h: number, cell = 0) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const isWhite = (i: number) => d[i * 4 + 3] > 0 && d[i * 4] > 232 && d[i * 4 + 1] > 232 && d[i * 4 + 2] > 232;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => { if (!seen[i] && isWhite(i)) { seen[i] = 1; stack.push(i); } };
  const cw = cell > 0 ? Math.max(1, Math.round(cell)) : w, ch = cell > 0 ? cw : h;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y += ch) { push(y * w + x); push(Math.min(h - 1, y + ch - 1) * w + x); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x += cw) { push(y * w + x); push(y * w + Math.min(w - 1, x + cw - 1)); }
  while (stack.length) {
    const i = stack.pop()!;
    d[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  ctx.putImageData(img, 0, 0);
}

export function imageToAvatar(img: HTMLImageElement): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = C; cv.height = C;
  const s = Math.min(img.width, img.height);
  cv.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, C, C);
  return cv;
}
