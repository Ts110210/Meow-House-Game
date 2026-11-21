// 精灵图拼装：每个动作一张「横排 4 帧、白底」的图 → 标准的 4 列精灵图。
// 流程：去白底 → 自动找出 4 帧 → 裁掉空白 → 同一个动作按同一个比例缩放 → 脚底对齐 → 拼到格子里。
// 开发者工具和玩家上传自定义宠物用的是同一套。
import { SPRITE, type ActionName } from './config';
import { knockOutWhite } from './sprites';
import { rowLift } from './assembleLift';
export { rowLift };

const C = SPRITE.cell, N = SPRITE.framesPerRow;

export interface StripPart {
  frames: HTMLCanvasElement[];
  /** 这个动作最高的一帧占格子高度的多少 */
  size: number;
  /** 自动切帧时遇到的问题（没问题就是空的） */
  warn: string;
  /** 每一帧的脚底在原图里的位置（像素，从上往下） */
  bottoms: number[];
  /** 保留跳跃高度：不把每帧的脚底拉回地面，保留 4 帧之间的上下位置（最低的一帧当地面） */
  keepHeight: boolean;
  /** 保留跳跃高度时，跳得太高格子放不下，上下距离压到了原来的多少（1 = 没压）。拼的时候算出来 */
  lift?: number;
}


interface Run { x0: number; x1: number; mass: number }

/** 把一张横排的图切成 4 帧，每帧裁掉四周的空白 */
export function splitStrip(img: HTMLImageElement | HTMLCanvasElement, action: ActionName): StripPart {
  // 太大的图先缩小，手机上处理得动
  const k = Math.min(1, 2400 / img.width);
  const w = Math.max(4, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
  // 先看看四条边是不是白的：不是的话，多半不是按要求画的序列帧
  const edge = ctx.getImageData(0, 0, w, h).data; let white = 0, total = 0;
  const isW = (x: number, y: number) => { const i = (y * w + x) * 4; total++; if (edge[i + 3] < 20 || (edge[i] > 232 && edge[i + 1] > 232 && edge[i + 2] > 232)) white++; };
  for (let x = 0; x < w; x += 3) { isW(x, 0); isW(x, h - 1); } for (let y = 0; y < h; y += 3) { isW(0, y); isW(w - 1, y); }
  const whiteEdge = white / Math.max(1, total);
  knockOutWhite(ctx, w, h, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 48;

  // 每一列有多少个有颜色的点
  const col = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) col[x]++;
  const minGap = Math.max(3, Math.round(w * 0.004));
  let runs: Run[] = []; let cur: Run | null = null; let gap = 0;
  for (let x = 0; x < w; x++) {
    if (col[x] >= 2) { if (!cur) cur = { x0: x, x1: x, mass: 0 }; cur.x1 = x; cur.mass += col[x]; gap = 0; }
    else if (cur && ++gap >= minGap) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  // 去掉零星的杂点；多于 4 段时，把挨得最近的两段并起来（比如尾巴和身体分开了）
  const big = Math.max(1, ...runs.map((r) => r.mass));
  runs = runs.filter((r) => r.mass > big * 0.03);
  while (runs.length > N) {
    let bi = 0, bg = Infinity;
    for (let i = 0; i < runs.length - 1; i++) { const g = runs[i + 1].x0 - runs[i].x1; if (g < bg) { bg = g; bi = i; } }
    runs.splice(bi, 2, { x0: runs[bi].x0, x1: runs[bi + 1].x1, mass: runs[bi].mass + runs[bi + 1].mass });
  }
  let warn = '';
  if (runs.length < N) {
    // 帧和帧连在一起了，分不开：按宽度平均切
    warn = runs.length === 0 ? '图里没找到内容' : `只分出 ${runs.length} 帧（帧和帧可能挨在一起了），改成按宽度平均切成 4 份`;
    runs = Array.from({ length: N }, (_, i) => ({ x0: Math.round((i * w) / N), x1: Math.round(((i + 1) * w) / N) - 1, mass: 0 }));
  }

  const bottoms: number[] = [];
  const frames = runs.map((r) => {
    let x0 = r.x1, x1 = r.x0, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = r.x0; x <= r.x1; x++) if (solid(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const f = document.createElement('canvas'); bottoms.push(Math.max(0, y1));
    if (y1 < 0) { f.width = 1; f.height = 1; return f; }
    f.width = x1 - x0 + 1; f.height = y1 - y0 + 1;
    f.getContext('2d')!.drawImage(cv, x0, y0, f.width, f.height, 0, 0, f.width, f.height);
    return f;
  });
  if (!warn && frames.some((f) => f.width < 4 || f.height < 4)) warn = '有一帧几乎是空的，检查一下原图';
  const hs = frames.map((f) => f.height), ws = frames.map((f) => f.width);
  if (whiteEdge < 0.6) warn = '这张图不像序列帧：四周不是白色背景，去不掉底。' + (warn ? warn : '');
  else if (!warn && (Math.max(...hs) > Math.min(...hs) * 2.2 || frames.some((f) => f.height > f.width * 4 || f.width > f.height * 4))) warn = '4 帧的大小差得很多，可能不是同一只宠物的 4 个动作';
  return { frames, size: SPRITE.assembleSize[action] ?? SPRITE.cellFill, warn, bottoms, keepHeight: SPRITE.keepHeight.includes(action) };
}

/** 把一个动作的 4 帧画进一行格子里 */
function drawRow(ctx: CanvasRenderingContext2D, row: number, part: StripPart) {
  const maxH = Math.max(1, ...part.frames.map((f) => f.height)), maxW = Math.max(1, ...part.frames.map((f) => f.width));
  // 同一个动作的 4 帧用同一个缩放比例，动起来才不会忽大忽小；太宽的话缩到格子里放得下
  const s = Math.min((C * part.size) / maxH, (C * 0.96) / maxW);
  // 保留跳跃高度的行：每帧按原图抬高（大小不变，太高放不下时只压低跳的高度）
  const { dy, fit } = rowLift(part.frames.map((f) => f.height), part.bottoms, s, part.keepHeight);
  part.lift = fit;
  part.frames.forEach((f, i) => {
    const dw = f.width * s, dh = f.height * s;
    ctx.drawImage(f, i * C + (C - dw) / 2, row * C + C * SPRITE.footLine - dh - dy[i], dw, dh);
  });
}

export interface Assembled { sheet: HTMLCanvasElement; rows: number; complete: boolean; missing: string[] }

/** 拼成标准精灵图。中间缺的可选动作，用代替动作补上，保证每一行都在规范的位置。 */
export function composeSheet(parts: Partial<Record<ActionName, StripPart>>): Assembled {
  const order = SPRITE.rows; let last = -1;
  order.forEach((a, i) => { if (parts[a]) last = i; });
  const missing = order.slice(0, SPRITE.requiredRows).filter((a) => !parts[a]).map((a) => SPRITE.rowNames[a]);
  const rows = Math.max(last + 1, 1);
  const sheet = document.createElement('canvas'); sheet.width = C * N; sheet.height = C * rows;
  const ctx = sheet.getContext('2d')!; ctx.imageSmoothingQuality = 'high';
  for (let r = 0; r < rows; r++) {
    let a: string = order[r]; let part = parts[a as ActionName];
    for (let hop = 0; !part && hop < 3; hop++) { a = SPRITE.fallback[a] ?? 'idle'; part = parts[a as ActionName]; }
    if (part) drawRow(ctx, r, part);
  }
  return { sheet, rows, complete: missing.length === 0, missing };
}
