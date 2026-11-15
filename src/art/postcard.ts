// 明信片 = 地点背景 + 程序把宠物的一帧贴上去（结伴时贴两只）。
// 现在的背景是代码画的占位图；正式素材到位后，把 drawBackground 换成读图片即可。
import { DESTS, type DestDef } from '../config';
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
    case 'snow': {
      ctx.fillStyle = grad(ctx, 0, 280, '#D7E6F3', '#EEF4F9'); ctx.fillRect(0, 0, W, 280);
      tri(ctx, 170, 290, 340, 210, '#B8C9DA'); tri(ctx, 170, 150, 110, 70, '#FFFFFF');
      tri(ctx, 430, 290, 300, 170, '#A9BDD1'); tri(ctx, 430, 172, 100, 52, '#FFFFFF');
      ctx.fillStyle = '#F7FAFC'; ctx.fillRect(0, 280, W, H - 280);
      ctx.beginPath(); ctx.ellipse(120, 318, 80, 22, 0, 0, Math.PI * 2); ctx.fillStyle = '#A7D3DC'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (const x of [90, 120, 150]) { ctx.beginPath(); ctx.moveTo(x, 300); ctx.quadraticCurveTo(x - 10, 284, x, 268); ctx.stroke(); }
      ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((i * 131) % W, (i * 71) % 270, 2.5, 0, Math.PI * 2); ctx.fill(); }
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

/** 画一张明信片。sets = 出门的宠物的精灵图（1 只或 2 只）。 */
export function renderPostcard(destId: string, sets: (SpriteSet | undefined)[], background?: HTMLCanvasElement): HTMLCanvasElement {
  const dest = DESTS.find((d) => d.id === destId) ?? DESTS[0];
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d')!;
  if (background) {
    // 有正式的背景图：按 3:2 居中裁切铺满
    const k = Math.max(CARD_W / background.width, CARD_H / background.height); const w = background.width * k, h = background.height * k;
    ctx.drawImage(background, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
  } else { drawBackground(ctx, dest); pencilOver(ctx, CARD_W, CARD_H, 23, 1.2); }
  // 宠物贴在画面下方中间，大小约占画面高度的三分之一
  const size = CARD_H * 0.42;
  const list = sets.filter((s): s is SpriteSet => !!s);
  const total = list.length * size * 0.8;
  list.forEach((set, i) => {
    const x = CARD_W / 2 - total / 2 + i * size * 0.8 - size * 0.1;
    const y = CARD_H - size - 18;
    ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * 0.9, size * 0.3, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60,50,40,0.18)'; ctx.fill();
    drawFrame(ctx, set, 'idle', 0, x, y, size, i === 1);
  });
  return cv;
}
