// 明信片 = 地点背景 + 程序把宠物的一帧贴上去（结伴时贴两只）。
// 现在的背景是代码画的占位图；正式素材到位后，把 drawBackground 换成读图片即可。
import { DESTS, type DestDef, CONFIG, type DayTime, type Season } from '../config';
import { drawFrame, type SpriteSet } from '../sprites';
import { pencilOver } from './sketch';

export const CARD_W = 600, CARD_H = 400;

function grad(ctx: CanvasRenderingContext2D, y0: number, y1: number, a: string, b: string) {
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g;
}

function hill(ctx: CanvasRenderingContext2D, pts: number[][], fill: string) {
  ctx.beginPath(); ctx.moveTo(0, CARD_H); ctx.lineTo(0, pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.lineTo(CARD_W, pts[pts.length - 1][1]); ctx.lineTo(CARD_W, CARD_H); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

function tri(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

function drawBackground(ctx: CanvasRenderingContext2D, dest: DestDef) {
  const W = CARD_W, H = CARD_H;
  switch (dest.type) {
    case 'sea': {
      ctx.fillStyle = grad(ctx, 0, 230, '#F9D9B0', '#F6B98E'); ctx.fillRect(0, 0, W, 230);
      ctx.beginPath(); ctx.arc(430, 200, 46, 0, Math.PI * 2); ctx.fillStyle = '#FBEFC9'; ctx.fill();
      ctx.fillStyle = grad(ctx, 210, 300, '#7FB5C4', '#5E96AE'); ctx.fillRect(0, 210, W, 100);
      // 灯塔和小船
      ctx.fillStyle = '#F4F1EA'; ctx.fillRect(96, 110, 26, 104); ctx.fillStyle = '#D9675A'; ctx.fillRect(96, 140, 26, 16); ctx.fillRect(92, 96, 34, 16);
      tri(ctx, 109, 96, 34, 20, '#B9534A');
      ctx.fillStyle = '#8A5B3C'; ctx.beginPath(); ctx.moveTo(300, 236); ctx.lineTo(356, 236); ctx.lineTo(346, 250); ctx.lineTo(310, 250); ctx.closePath(); ctx.fill();
      tri(ctx, 330, 234, 30, 34, '#FFF7E8');
      ctx.fillStyle = grad(ctx, 290, H, '#E9D7B7', '#D8C29C'); ctx.fillRect(0, 290, W, H - 290);
      break;
    }
    case 'forest': {
      ctx.fillStyle = grad(ctx, 0, 280, '#DCEBD6', '#BFD8BE'); ctx.fillRect(0, 0, W, 280);
      for (let i = 0; i < 9; i++) tri(ctx, 30 + i * 70, 270, 90, 150 + (i % 3) * 30, i % 2 ? '#7FA884' : '#93B893');
      ctx.fillStyle = '#B98A5E'; ctx.fillRect(420, 190, 90, 70); tri(ctx, 465, 192, 120, 50, '#9B5F4A');
      ctx.fillStyle = '#F6E7B8'; ctx.fillRect(452, 214, 24, 24);
      hill(ctx, [[0, 280], [300, 262], [600, 284]], '#A9C79A');
      ctx.fillStyle = grad(ctx, 300, H, '#B7D1A4', '#9DBD8C'); ctx.fillRect(0, 310, W, H - 310);
      break;
    }
    case 'rain': {
      ctx.fillStyle = grad(ctx, 0, 300, '#C9D3DB', '#AEBBC6'); ctx.fillRect(0, 0, W, 300);
      ctx.fillStyle = '#8E9BA8'; for (const [x, w, h] of [[40, 90, 150], [150, 70, 110], [400, 100, 170], [520, 70, 120]]) ctx.fillRect(x, 270 - h, w, h);
      ctx.fillStyle = '#F5DFA0'; for (const [x, y] of [[62, 160], [100, 200], [430, 150], [470, 210], [540, 190]]) ctx.fillRect(x, y, 14, 18);
      // 小桥
      ctx.strokeStyle = '#7A6652'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(300, 330, 110, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = grad(ctx, 270, H, '#9FB3BF', '#8AA0AE'); ctx.fillRect(0, 290, W, H - 290);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      for (let i = 0; i < 60; i++) { const x = (i * 97) % W, y = (i * 53) % 280; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); ctx.stroke(); }
      break;
    }
    case 'city': {
      ctx.fillStyle = grad(ctx, 0, 290, '#F6D9B8', '#F9E9D2'); ctx.fillRect(0, 0, W, 290);
      ctx.beginPath(); ctx.arc(470, 90, 36, 0, Math.PI * 2); ctx.fillStyle = '#FBE9A9'; ctx.fill();
      const blocks: [number, number, number, string][] = [[30, 70, 150, '#C9B7A6'], [110, 54, 200, '#B9C6CF'], [176, 90, 130, '#D8C3A5'], [280, 60, 220, '#A9BDCB'], [352, 80, 160, '#CDB9A8'], [446, 64, 190, '#B6C4B0'], [520, 70, 140, '#C9B7A6']];
      for (const [x, w, hh, c] of blocks) { ctx.fillStyle = c; ctx.fillRect(x, 290 - hh, w, hh); ctx.fillStyle = 'rgba(255,248,225,0.8)'; for (let yy = 290 - hh + 14; yy < 276; yy += 26) for (let xx = x + 10; xx < x + w - 12; xx += 20) ctx.fillRect(xx, yy, 9, 12); }
      ctx.fillStyle = grad(ctx, 284, H, '#D9CDBD', '#C7B9A6'); ctx.fillRect(0, 286, W, H - 286);
      ctx.fillStyle = '#E08E79'; ctx.fillRect(60, 250, 70, 40); ctx.fillStyle = '#FBF6EC'; ctx.fillRect(56, 244, 78, 10);
      break;
    }
    case 'mountain': {
      ctx.fillStyle = grad(ctx, 0, 260, '#BFDDEE', '#E6F1F4'); ctx.fillRect(0, 0, W, 260);
      tri(ctx, 150, 270, 320, 200, '#8FA9B8'); tri(ctx, 380, 270, 380, 230, '#7C98AA'); tri(ctx, 380, 100, 90, 60, '#F4F8FA');
      ctx.fillStyle = grad(ctx, 250, 310, '#8EC3D4', '#6FAEC4'); ctx.fillRect(0, 250, W, 64);
      hill(ctx, [[0, 300], [300, 316], [600, 298]], '#A8C596');
      break;
    }
    default: {
      ctx.fillStyle = grad(ctx, 0, 270, '#CFE7F2', '#EAF4EC'); ctx.fillRect(0, 0, W, 270);
      ctx.beginPath(); ctx.arc(500, 70, 34, 0, Math.PI * 2); ctx.fillStyle = '#FBE9A9'; ctx.fill();
      hill(ctx, [[0, 230], [160, 190], [340, 240], [600, 210]], '#B9D6A4');
      for (const [x, y] of [[90, 236], [470, 232]]) { ctx.fillStyle = '#8B6A4B'; ctx.fillRect(x - 5, y, 10, 44); ctx.beginPath(); ctx.arc(x, y - 8, 36, 0, Math.PI * 2); ctx.fillStyle = '#86B27F'; ctx.fill(); }
      ctx.fillStyle = '#B58A62'; ctx.fillRect(250, 262, 90, 8); ctx.fillRect(256, 270, 6, 18); ctx.fillRect(328, 270, 6, 18);
      ctx.fillStyle = grad(ctx, 280, H, '#C5DDAE', '#AFCB99'); ctx.fillRect(0, 284, W, H - 284);
    }
  }
}

/** 落脚点：宠物在这张背景里可以待的地方。
 *  x、y = 脚底的位置（明信片是 600×400）；size = 宠物多大（占明信片高度的比例，越远越小）；
 *  poses = 在这里可以摆的姿势；water = 这是水里的位置，只有带了泳圈才会用到。
 *  换成正式的背景图后，照着图把这张表改一下就行（开发者面板 → 显示范围框，可以在明信片上看到这些点）。 */
export interface CardSpot { x: number; y: number; size: number; poses: ('idle' | 'happy' | 'walk' | 'sleep' | 'lick')[]; water?: boolean }
const GROUND: CardSpot['poses'] = ['idle', 'happy', 'walk', 'lick'];
export const CARD_SPOTS: Record<string, CardSpot[]> = {
  city: [{ x: 300, y: 384, size: 0.42, poses: GROUND }, { x: 190, y: 372, size: 0.38, poses: ['idle', 'happy', 'walk'] }, { x: 450, y: 376, size: 0.4, poses: GROUND }, { x: 520, y: 330, size: 0.28, poses: ['idle', 'walk'] }],
  sea: [{ x: 210, y: 384, size: 0.42, poses: [...GROUND, 'sleep'] }, { x: 400, y: 378, size: 0.4, poses: [...GROUND, 'sleep'] }, { x: 520, y: 350, size: 0.32, poses: ['idle', 'walk'] }, { x: 430, y: 292, size: 0.26, poses: ['idle', 'happy'], water: true }],
  forest: [{ x: 200, y: 384, size: 0.42, poses: [...GROUND, 'sleep'] }, { x: 330, y: 376, size: 0.4, poses: GROUND }, { x: 120, y: 340, size: 0.3, poses: ['idle', 'walk'] }],
  rain: [{ x: 300, y: 384, size: 0.42, poses: ['idle', 'walk', 'happy'] }, { x: 170, y: 374, size: 0.38, poses: ['idle', 'walk'] }, { x: 450, y: 376, size: 0.4, poses: ['idle', 'happy'] }],
  mountain: [{ x: 220, y: 384, size: 0.42, poses: [...GROUND, 'sleep'] }, { x: 420, y: 376, size: 0.4, poses: GROUND }, { x: 520, y: 344, size: 0.3, poses: ['idle', 'walk'] }],
};

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** 行李画在宠物身上。坐标按精灵图的一格 256×256 写（面朝右），画的时候跟着宠物缩放和翻转。
 *  layer = 'back' 画在宠物后面，'front' 画在前面。 */
function drawProp(ctx: CanvasRenderingContext2D, tool: string, layer: 'back' | 'front', x: number, y: number, size: number, flip: boolean, upright: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 256, size / 256); if (flip) { ctx.translate(256, 0); ctx.scale(-1, 1); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#5B4634'; ctx.lineWidth = 4;
  if (tool === 'camera' && layer === 'front') {
    // 站着：挂在脖子上；趴着或舔毛：放在脚边
    const [cx, cy] = upright ? [168, 176] : [226, 214];
    if (upright) { ctx.beginPath(); ctx.moveTo(140, 150); ctx.lineTo(cx - 8, cy); ctx.moveTo(204, 150); ctx.lineTo(cx + 8, cy); ctx.stroke(); }
    ctx.fillStyle = '#4B4F58'; ctx.beginPath(); ctx.roundRect(cx - 22, cy - 6, 44, 30, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4B4F58'; ctx.fillRect(cx - 14, cy - 12, 14, 8);
    ctx.fillStyle = '#BFD3E0'; ctx.beginPath(); ctx.arc(cx, cy + 9, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (tool === 'umbrella') {
    if (layer === 'back') { ctx.beginPath(); ctx.moveTo(196, 30); ctx.lineTo(196, 176); ctx.stroke(); }
    else {
      ctx.fillStyle = '#E08E79'; ctx.beginPath(); ctx.moveTo(86, 62); ctx.quadraticCurveTo(196, -50, 306, 62);
      for (let i = 3; i >= 0; i--) ctx.quadraticCurveTo(86 + i * 55 + 27, 44, 86 + i * 55, 62);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (tool === 'float') {
    // 泳圈套在身上：后半圈在身后，前半圈在身前
    ctx.lineWidth = 22; ctx.strokeStyle = layer === 'back' ? '#D97B68' : '#E08E79';
    ctx.beginPath(); ctx.ellipse(120, 182, 84, 24, 0, layer === 'back' ? Math.PI : 0, layer === 'back' ? Math.PI * 2 : Math.PI); ctx.stroke();
    if (layer === 'front') { ctx.lineWidth = 22; ctx.strokeStyle = '#FBF6EC'; for (const a of [0.25, 0.75]) { ctx.beginPath(); ctx.ellipse(120, 182, 84, 24, 0, Math.PI * a - 0.12, Math.PI * a + 0.12); ctx.stroke(); } }
  } else if (tool === 'boots' && layer === 'front' && upright) {
    ctx.fillStyle = '#D9A94A'; ctx.lineWidth = 3;
    for (const bx of [78, 100, 146, 166]) { ctx.beginPath(); ctx.roundRect(bx - 11, 212, 26, 20, 6); ctx.fill(); ctx.stroke(); }
  } else if (tool === 'tent' && layer === 'back') {
    // 帐篷搭在身后
    ctx.fillStyle = '#A8B89A'; ctx.beginPath(); ctx.moveTo(-150, 232); ctx.lineTo(-40, 60); ctx.lineTo(70, 232); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5B4634'; ctx.beginPath(); ctx.moveTo(-70, 232); ctx.lineTo(-40, 130); ctx.lineTo(-10, 232); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export interface CardInfo { id: string; destId: string; seed?: number; tool?: string | null; season?: Season; time?: DayTime }

/** 按季节和时段给整张明信片调色：春偏粉、夏明亮、秋暖橙、冬冷蓝；傍晚偏暖偏暗，夜晚压暗加星星。数值在 CONFIG.cardTint。 */
function tintCard(ctx: CanvasRenderingContext2D, card: CardInfo) {
  const T = CONFIG.cardTint; const se = card.season ? T.season[card.season] : null; const ti = card.time ? T.time[card.time] : null;
  ctx.save();
  if (se) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = se.alpha; ctx.fillStyle = se.color; ctx.fillRect(0, 0, CARD_W, CARD_H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = se.alpha * 0.22; ctx.fillRect(0, 0, CARD_W, CARD_H); }
  if (ti) {
    if (ti.warm) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = ti.warm; ctx.fillStyle = T.warmColor; ctx.fillRect(0, 0, CARD_W, CARD_H); }
    if (ti.dark) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = ti.dark; ctx.fillStyle = ti.darkColor; ctx.fillRect(0, 0, CARD_W, CARD_H); }
    if (ti.stars) {
      ctx.globalCompositeOperation = 'source-over'; const r = rng((card.seed ?? hash(card.id)) ^ 0x5bd1e995);
      for (let i = 0; i < ti.stars; i++) { ctx.globalAlpha = 0.5 + r() * 0.5; ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.arc(r() * CARD_W, r() * CARD_H * 0.42, 0.8 + r() * 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

/** 这张明信片里宠物怎么摆：站在哪个落脚点、什么姿势、脸朝哪。由明信片自己的随机数决定，所以每次画出来都一样。 */
export function layoutCard(card: CardInfo, count: number) {
  const dest = DESTS.find((d) => d.id === card.destId) ?? DESTS[0];
  const r = rng(card.seed ?? hash(card.id));
  const all = CARD_SPOTS[dest.type] ?? CARD_SPOTS.city;
  // 水里的位置只有带了泳圈才去；带了泳圈而这里有水，就一定下水
  const water = all.filter((s) => s.water);
  const pool = card.tool === 'float' && water.length ? water : all.filter((s) => !s.water);
  const spot = pool[Math.floor(r() * pool.length)];
  const flip = r() < 0.5;
  const pets = Array.from({ length: count }, (_, i) => ({ pose: spot.poses[Math.floor(r() * spot.poses.length)], frame: Math.floor(r() * 4), flip: i === 1 ? !flip : flip }));
  return { dest, spot, pets };
}

/** 画一张明信片。sets = 出门的宠物的精灵图（1 只或 2 只）。showSpots = 把所有落脚点标出来（开发者用）。 */
export function renderPostcard(card: CardInfo, sets: (SpriteSet | undefined)[], background?: HTMLCanvasElement, showSpots = false): HTMLCanvasElement {
  const list = sets.filter((s): s is SpriteSet => !!s);
  const { dest, spot, pets } = layoutCard(card, list.length);
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d')!;
  if (background) {
    // 有正式的背景图：按 3:2 居中裁切铺满
    const k = Math.max(CARD_W / background.width, CARD_H / background.height); const w = background.width * k, h = background.height * k;
    ctx.drawImage(background, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
  } else { drawBackground(ctx, dest); pencilOver(ctx, CARD_W, CARD_H, 23, 1.2); }
  const size = CARD_H * spot.size;
  const step = size * 0.78; const x0 = Math.max(size * 0.5, Math.min(CARD_W - size * 0.5 - step * (list.length - 1), spot.x - (step * (list.length - 1)) / 2));
  list.forEach((set, i) => {
    const { pose, frame, flip } = pets[i];
    const x = x0 + i * step - size / 2, y = spot.y - size * 0.9;
    const tool = i === 0 ? card.tool ?? null : null; const upright = pose !== 'sleep' && pose !== 'lick';
    if (spot.water) {
      // 泡在水里：只露出上半身，水面画一圈波纹
      if (tool) drawProp(ctx, tool, 'back', x, y, size, flip, upright);
      ctx.save(); ctx.beginPath(); ctx.rect(x - size, y - size, size * 3, size * 1.72); ctx.clip(); drawFrame(ctx, set, pose, frame, x, y, size, flip); ctx.restore();
      if (tool) drawProp(ctx, tool, 'front', x, y, size, flip, upright);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
      for (const k of [0.5, 0.66]) { ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * 0.76, size * k, size * k * 0.16, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
      return;
    }
    ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * 0.9, size * 0.3, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60,50,40,0.18)'; ctx.fill();
    if (tool) drawProp(ctx, tool, 'back', x, y, size, flip, upright);
    drawFrame(ctx, set, pose, frame, x, y, size, flip);
    if (tool) drawProp(ctx, tool, 'front', x, y, size, flip, upright);
  });
  tintCard(ctx, card);
  if (showSpots) for (const s of CARD_SPOTS[dest.type] ?? []) {
    const sz = CARD_H * s.size; ctx.strokeStyle = s.water ? '#2F7FD0' : '#D03A3A'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(s.x - sz / 2, s.y - sz * 0.9, sz, sz); ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '12px sans-serif'; ctx.fillText(s.poses.join(' ') + (s.water ? '（水里）' : ''), s.x - sz / 2 + 4, s.y - sz * 0.9 + 14);
  }
  return cv;
}
