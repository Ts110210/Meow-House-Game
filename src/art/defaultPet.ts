// 默认宠物的占位精灵图：用代码画出来，格式和「上传规范」完全一样
// （每格 256×256，每行一个动作，每行 4 帧，面朝右）。
// 换成正式素材时，只要给出同样格式的 PNG 即可。
import { FUR_COLORS, NPC_COLORS, SPRITE, coatOfLook, decodeLook, type Coat } from '../config';
import { pencilOver } from './sketch';

type Pal = Coat;
type Eyes = 'open' | 'closed' | 'happy';

interface Pose {
  bodyY?: number; jump?: number; headX?: number; headY?: number;
  legs?: [number, number][]; tail?: number; eyes?: Eyes;
  curled?: boolean; tongue?: boolean; pawUp?: boolean;
  extra?: 'bubbles' | 'zzz' | 'heart'; phase?: number;
}

const C = SPRITE.cell;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = true) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill(); if (stroke) ctx.stroke();
}

function face(ctx: CanvasRenderingContext2D, hx: number, hy: number, pal: Pal, eyes: Eyes, tongue: boolean) {
  ctx.save();
  ctx.lineWidth = 3.5; ctx.strokeStyle = pal.line; ctx.lineCap = 'round';
  for (const ex of [hx - 12, hx + 22]) {
    if (eyes === 'open' && pal.eye) {
      // 有颜色的眼睛：彩色的眼珠 + 竖着的瞳孔
      ctx.beginPath(); ctx.ellipse(ex, hy - 2, 7, 8.5, 0, 0, Math.PI * 2); ctx.fillStyle = pal.eye; ctx.fill(); ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = '#3B2A22'; ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.ellipse(ex, hy - 2, 3, 7, 0, 0, Math.PI * 2); ctx.fillStyle = '#2A1E18'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 2, hy - 5, 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (eyes === 'open') {
      ctx.beginPath(); ctx.ellipse(ex, hy - 2, 6, 8, 0, 0, Math.PI * 2); ctx.fillStyle = '#3B2A22'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 2, hy - 5, 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (eyes === 'closed') {
      ctx.beginPath(); ctx.arc(ex, hy - 4, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ex, hy + 2, 6, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    }
  }
  if (eyes === 'happy') {
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#F58C8C';
    ctx.beginPath(); ctx.ellipse(hx - 24, hy + 12, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 34, hy + 12, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#E88A8A';
  ctx.beginPath(); ctx.moveTo(hx + 1, hy + 9); ctx.lineTo(hx + 11, hy + 9); ctx.lineTo(hx + 6, hy + 15); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(hx + 1, hy + 15, 5, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(hx + 11, hy + 15, 5, 0, Math.PI); ctx.stroke();
  if (tongue) { ctx.beginPath(); ctx.ellipse(hx + 6, hy + 25, 5, 8, 0, 0, Math.PI * 2); ctx.fillStyle = '#F2848E'; ctx.fill(); }
  ctx.restore();
}

/** 花斑的位置：相对椭圆中心，单位是椭圆的半径。[x, y, 大小, 用第几种颜色] */
const BLOBS: Record<string, Record<'body' | 'head', [number, number, number, 2 | 3][]>> = {
  calico: { body: [[-0.55, -0.5, 0.6, 2], [0.4, -0.45, 0.5, 3], [-0.05, 0.75, 0.35, 3], [0.85, 0.5, 0.3, 2]], head: [[-0.6, -0.55, 0.62, 2], [0.7, -0.6, 0.58, 3]] },
  cow: { body: [[-0.45, -0.35, 0.6, 2], [0.6, 0.1, 0.42, 2], [0.05, 0.9, 0.25, 2]], head: [[0.62, -0.62, 0.62, 2], [-0.85, 0.15, 0.3, 2]] },
  tortie: { body: [[-0.7, -0.4, 0.34, 2], [-0.2, 0.3, 0.3, 3], [0.3, -0.5, 0.36, 2], [0.75, 0.2, 0.3, 3], [-0.45, 0.75, 0.24, 2], [0.1, -0.1, 0.2, 3], [0.55, 0.8, 0.22, 2]], head: [[-0.5, -0.4, 0.4, 2], [0.55, -0.2, 0.32, 3], [0.1, -0.75, 0.25, 3], [-0.75, 0.4, 0.22, 2]] },
};

/** 在刚画好的身体或头上画花纹。只画在椭圆里面，不会涂出去。 */
function markings(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, pal: Pal, part: 'body' | 'head') {
  const pattern = pal.pattern ?? 'stripes';
  if (pattern === 'stripes' || pattern === 'solid') return;
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx - 1.5, ry - 1.5, 0, 0, Math.PI * 2); ctx.clip();
  if (pattern === 'point') {
    if (part === 'head') { ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(cx + 5, cy + 8, rx * 0.62, ry * 0.66, 0, 0, Math.PI * 2); ctx.fillStyle = pal.c2 ?? pal.shade; ctx.fill(); }
  } else for (const [x, y, r, c] of BLOBS[pattern][part]) {
    ctx.beginPath(); ctx.ellipse(cx + x * rx, cy + y * ry, r * rx, r * rx * 0.8, x * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = (c === 2 ? pal.c2 : pal.c3 ?? pal.c2) ?? pal.shade; ctx.fill();
  }
  ctx.restore();
}
/** 耳朵、尾巴、腿用的颜色：重点色的猫这些地方是深色 */
const ext = (pal: Pal) => (pal.pattern === 'point' ? pal.c2 ?? pal.shade : pal.body);
const stripes = (pal: Pal) => (pal.pattern ?? 'stripes') === 'stripes';
/** 长毛：先沿着轮廓画一圈毛球，再把身体盖上去 */
function fluff(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, pal: Pal, from = 0, to = Math.PI * 2) {
  if (!pal.long) return;
  const n = Math.round(((to - from) / (Math.PI * 2)) * 16);
  for (let i = 0; i <= n; i++) { const a = from + ((to - from) * i) / n; ell(ctx, x + Math.cos(a) * rx, y + Math.sin(a) * ry, 11, 11, pal.body); }
}

function head(ctx: CanvasRenderingContext2D, hx: number, hy: number, pal: Pal, eyes: Eyes, tongue = false) {
  // 耳朵
  for (const [a, b, c] of [[[-36, -22], [-40, -66], [-6, -40]], [[10, -42], [36, -68], [42, -24]]] as number[][][]) {
    ctx.beginPath(); ctx.moveTo(hx + a[0], hy + a[1]); ctx.lineTo(hx + b[0], hy + b[1]); ctx.lineTo(hx + c[0], hy + c[1]); ctx.closePath();
    ctx.fillStyle = ext(pal); ctx.fill(); ctx.stroke();
  }
  fluff(ctx, hx, hy + 4, 44, 38, pal, 0.05 * Math.PI, 0.95 * Math.PI);
  ell(ctx, hx, hy, 46, 42, pal.body);
  markings(ctx, hx, hy, 46, 42, pal, 'head');
  // 额头的条纹
  if (stripes(pal)) {
    ctx.save(); ctx.strokeStyle = pal.shade; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const dx of [-8, 5, 18]) { ctx.beginPath(); ctx.moveTo(hx + dx, hy - 38); ctx.lineTo(hx + dx, hy - 26); ctx.stroke(); }
    ctx.restore();
  }
  if (pal.pattern !== 'point') ell(ctx, hx + 6, hy + 16, 22, 15, pal.belly, false);
  face(ctx, hx, hy, pal, eyes, tongue);
}

function extras(ctx: CanvasRenderingContext2D, kind: Pose['extra'], phase: number, hx: number, hy: number) {
  if (kind === 'bubbles') {
    ctx.save(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#8FC3DA'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const pts = [[60, 120], [100, 96], [150, 200], [80, 190], [200, 170], [130, 80], [215, 80]];
    pts.forEach(([x, y], i) => { const r = 9 + ((i + phase) % 3) * 4; ctx.beginPath(); ctx.arc(x + (phase % 2) * 4, y - phase * 3, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.restore();
  } else if (kind === 'zzz') {
    ctx.save(); ctx.fillStyle = '#8FA7C4'; ctx.font = 'bold 26px sans-serif';
    ctx.globalAlpha = 0.9; ctx.fillText('z', hx + 36 + phase * 3, hy - 44 - phase * 6);
    if (phase > 1) { ctx.font = 'bold 18px sans-serif'; ctx.fillText('z', hx + 20, hy - 40); }
    ctx.restore();
  } else if (kind === 'heart') {
    ctx.save(); ctx.fillStyle = '#F2788A'; const x = hx + 44, y = hy - 62 - phase * 3;
    ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.bezierCurveTo(x - 16, y - 8, x - 6, y - 18, x, y - 8); ctx.bezierCurveTo(x + 6, y - 18, x + 16, y - 8, x, y + 6); ctx.fill();
    ctx.restore();
  }
}

function drawCat(ctx: CanvasRenderingContext2D, ox: number, oy: number, pal: Pal, p: Pose) {
  ctx.save(); ctx.translate(ox, oy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = pal.line;
  const phase = p.phase ?? 0;

  if (p.curled) {
    const b = p.bodyY ?? 0;
    fluff(ctx, 118, 198 - b, 78, 30 + b, pal, Math.PI, Math.PI * 2);
    ell(ctx, 118, 198 - b, 80, 32 + b, pal.body);
    markings(ctx, 118, 198 - b, 80, 32 + b, pal, 'body');
    if (stripes(pal)) {
      ctx.save(); ctx.strokeStyle = pal.shade; ctx.lineWidth = 5;
      for (const x of [86, 108, 130]) { ctx.beginPath(); ctx.moveTo(x, 170 - b); ctx.lineTo(x + 4, 184 - b); ctx.stroke(); }
      ctx.restore();
    }
    // 绕到身前的尾巴
    ctx.beginPath(); ctx.moveTo(44, 206); ctx.quadraticCurveTo(70, 236, 140, 224);
    ctx.lineWidth = pal.long ? 25 : 17; ctx.strokeStyle = pal.line; ctx.stroke(); ctx.lineWidth = pal.long ? 19 : 11; ctx.strokeStyle = ext(pal); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = pal.line;
    head(ctx, 172, 186 - b * 0.5, pal, 'closed');
    extras(ctx, p.extra, phase, 172, 186);
    ctx.restore(); return;
  }

  const jump = p.jump ?? 0;
  const by = 168 + (p.bodyY ?? 0) - jump;
  const ground = 230 - jump;
  const tail = p.tail ?? 0;
  // 尾巴
  ctx.beginPath(); ctx.moveTo(64, by - 4); ctx.quadraticCurveTo(26, by - 16 + tail * 10, 40 + tail * 6, by - 66 - tail * 10);
  ctx.lineWidth = pal.long ? 28 : 18; ctx.strokeStyle = pal.line; ctx.stroke(); ctx.lineWidth = pal.long ? 22 : 12; ctx.strokeStyle = ext(pal); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = pal.line;
  // 腿：0、2 在远侧，颜色深一点
  const legs = p.legs ?? [[0, 0], [0, 0], [0, 0], [0, 0]];
  const xs = [78, 100, 146, 166];
  const leg = (i: number) => {
    const [dx, lift] = legs[i];
    const top = by + 14, bottom = ground - lift;
    rr(ctx, xs[i] - 9 + dx, top, 18, Math.max(12, bottom - top), 8);
    ctx.fillStyle = pal.pattern === 'point' ? ext(pal) : i % 2 === 0 ? pal.shade : pal.body; ctx.fill(); ctx.stroke();
  };
  leg(0); leg(2);
  fluff(ctx, 118, by + 4, 60, 34, pal, 0.1 * Math.PI, 0.9 * Math.PI); fluff(ctx, 118, by, 60, 36, pal, 1.05 * Math.PI, 1.6 * Math.PI);
  ell(ctx, 118, by, 62, 38, pal.body);
  markings(ctx, 118, by, 62, 38, pal, 'body');
  if (pal.pattern !== 'point' && pal.pattern !== 'tortie') ell(ctx, 120, by + 17, 42, 16, pal.belly, false);
  if (stripes(pal)) {
    ctx.save(); ctx.strokeStyle = pal.shade; ctx.lineWidth = 5;
    for (const x of [92, 112, 132]) { ctx.beginPath(); ctx.moveTo(x, by - 34); ctx.lineTo(x + 4, by - 18); ctx.stroke(); }
    ctx.restore();
  }
  leg(1); if (!p.pawUp) leg(3);
  const hx = 176 + (p.headX ?? 0), hy = 122 + (p.headY ?? 0) + (p.bodyY ?? 0) - jump;
  head(ctx, hx, hy, pal, p.eyes ?? 'open', !!p.tongue);
  if (p.pawUp) { ctx.lineWidth = 3; ctx.strokeStyle = pal.line; ell(ctx, hx + 16, hy + 44, 11, 15, ext(pal)); }
  extras(ctx, p.extra, phase, hx, hy);
  ctx.restore();
}

const L0: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];

const POSES: Record<string, Pose[]> = {
  idle: [0, 1, 2, 1].map((b, i) => ({ bodyY: b, tail: [0, 0.5, 1, 0.5][i], eyes: i === 3 ? 'closed' : 'open' } as Pose)),
  walk: [
    { legs: [[10, 0], [-10, 8], [-10, 8], [10, 0]], tail: 0.3 },
    { legs: [[3, 0], [-3, 2], [-3, 2], [3, 0]], bodyY: -3, tail: 0.6 },
    { legs: [[-10, 8], [10, 0], [10, 0], [-10, 8]], tail: 0.3 },
    { legs: [[-3, 2], [3, 0], [3, 0], [-3, 2]], bodyY: -3, tail: 0 },
  ],
  eat: [44, 50, 44, 50].map((h, i) => ({ headX: 16, headY: h, eyes: 'happy', tail: i % 2 ? 0.6 : 0.2 } as Pose)),
  sleep: [0, 1, 2, 1].map((b, i) => ({ curled: true, bodyY: b, extra: 'zzz', phase: i } as Pose)),
  happy: [-2, -7, -2, -7].map((h, i) => ({ headY: h, eyes: 'happy', tail: 1, extra: i % 2 ? 'heart' : undefined, phase: i } as Pose)),
  bath: [0, 1, 2, 3].map((i) => ({ eyes: 'closed', bodyY: i % 2, extra: 'bubbles', phase: i } as Pose)),
  lick: [0, 1, 2, 3].map((i) => ({ headX: -4, headY: 16 + (i % 2) * 4, eyes: 'closed', tongue: i % 2 === 0, pawUp: true, tail: 0.2 } as Pose)),
  play: [8, 24, 32, 14].map((j, i) => ({ jump: j, legs: [[-6, 0], [-6, 0], [12, 16], [14, 20]], tail: 1, eyes: i === 2 ? 'happy' : 'open' } as Pose)),
};

/** color 可以是内置毛色的名字、一套颜色，或者 look:… 这样的自定义编号 */
export function drawDefaultSheet(color: string | Coat): HTMLCanvasElement {
  const look = typeof color === 'string' ? decodeLook(color) : null;
  const pal = typeof color !== 'string' ? color : look ? coatOfLook(look) : FUR_COLORS[color] ?? NPC_COLORS[color] ?? FUR_COLORS.orange;
  const cv = document.createElement('canvas');
  cv.width = C * SPRITE.framesPerRow; cv.height = C * SPRITE.rows.length;
  const ctx = cv.getContext('2d')!;
  SPRITE.rows.forEach((row, r) => {
    for (let f = 0; f < SPRITE.framesPerRow; f++) drawCat(ctx, f * C, r * C, pal, POSES[row][f] ?? { legs: L0 });
  });
  // 整张叠一层彩铅排线；每格的排线位置一样，动起来不会闪
  for (let r = 0; r < SPRITE.rows.length; r++) for (let f = 0; f < SPRITE.framesPerRow; f++) {
    ctx.save(); ctx.beginPath(); ctx.rect(f * C, r * C, C, C); ctx.clip(); ctx.translate(f * C, r * C); pencilOver(ctx, C, C, 11, 0.9); ctx.restore();
  }
  return cv;
}

/** 头像：从待机第 1 帧里裁出头部 */
export function drawDefaultAvatar(sheet: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = C; cv.height = C;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(sheet, 100, 32, 152, 152, 0, 0, C, C);
  return cv;
}
