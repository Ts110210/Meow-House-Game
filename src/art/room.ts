// 代码画的占位图：房间背景（每个区域一张）和每件可互动的物品（每件一张）。
// 画风往彩铅手绘靠：正侧面、没有透视、暖棕色细线、低饱和配色。
// 在 assets.config.ts 里配了图片（或在开发者面板上传）之后，对应的占位图就不再使用。
import { CONFIG, PALETTE as P, type ZoneId } from '../config';
import { makeCanvas, Sketch, type Pt } from './sketch';

const W = CONFIG.room.zoneWidth, H = CONFIG.room.height, FY = CONFIG.room.floorY;
const lighten = (hex: string, t: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.round(v + (255 - v) * t); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const darken = (hex: string, t: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.round(v * (1 - t)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

function base(s: Sketch) {
  s.rect(0, 0, W, FY, { fill: P.wall, stroke: false, hatch: 0.55 });
  s.rect(0, 0, 6, 546, { fill: P.post, stroke: false, hatch: 0.4 }); s.rect(W - 6, 0, 6, 546, { fill: P.post, stroke: false, hatch: 0.4 });
  s.line(6, 0, 6, 546, P.ink, 1.2, 0.3); s.line(W - 6, 0, W - 6, 546, P.ink, 1.2, 0.3);
  s.rect(0, 546, W, 14, { fill: P.white, stroke: false, hatch: 0.4 }); s.line(0, 546, W, 546, P.ink, 1.2, 0.45);
  floor(s);
}

/** 正侧面的地板：只有水平的木纹，没有透视 */
function floor(s: Sketch) {
  s.rect(0, FY, W, H - FY, { fill: P.floor, stroke: false, hatch: 0.5 });
  s.line(0, FY, W, FY, P.ink, 1.6, 0.7);
  for (const y of [FY + 38, FY + 78, FY + 120]) s.line(0, y, W, y, P.floorLine, 1.5, 0.75);
  for (let i = 0; i < 16; i++) { const x = s.r() * (W - 70), y = FY + 8 + s.r() * (H - FY - 14), len = 24 + s.r() * 50; s.line(x, y, x + len, y + (s.r() - 0.5) * 1.5, P.floorLine, 1, 0.4); }
}

function frame(s: Sketch, x: number, y: number, w: number, h: number, color: string, motif: 'hill' | 'sun' | 'leaf' | 'fish' | 'plain' = 'plain') {
  s.rect(x, y, w, h, { fill: P.white, stroke: P.woodDark, width: 2.2 });
  s.rect(x + 7, y + 7, w - 14, h - 14, { fill: lighten(color, 0.35), width: 1.1 });
  const cx = x + w / 2, by = y + h - 9;
  if (motif === 'hill') { s.poly([[x + 9, by], [cx - 6, y + h * 0.45], [cx + 8, by - 8], [x + w - 16, y + h * 0.55], [x + w - 9, by]], { fill: color, width: 1.1 }); s.ellipse(x + w - 22, y + 22, 7, 7, { fill: P.mustard, width: 1 }); }
  if (motif === 'sun') { s.ellipse(cx, y + h / 2, w * 0.2, w * 0.2, { fill: color, width: 1.1 }); }
  if (motif === 'leaf') { s.curve([[cx, by], [cx + 2, y + 16]], P.woodDark, 1.3); for (let i = 0; i < 4; i++) s.leaf(cx + 1, by - 10 - i * (h - 44) / 4, 16, i % 2 ? -0.5 : Math.PI + 0.5, color); }
  if (motif === 'fish') { s.ellipse(cx - 3, y + h / 2, w * 0.24, h * 0.14, { fill: color, width: 1.1 }); s.poly([[cx + w * 0.2, y + h / 2], [cx + w * 0.32, y + h / 2 - 9], [cx + w * 0.32, y + h / 2 + 9]], { fill: color, width: 1.1 }); }
}

function plant(s: Sketch, x: number, y: number, size: number, pot: string, leaves = 7) {
  for (let i = 0; i < leaves; i++) { const a = -Math.PI / 2 + ((i - (leaves - 1) / 2) / leaves) * 2.3; s.leaf(x, y - size * 0.32, size * (0.75 + s.r() * 0.35), a, i % 2 ? P.sage : darken(P.sage, 0.12)); }
  s.poly([[x - size * 0.26, y - size * 0.36], [x + size * 0.26, y - size * 0.36], [x + size * 0.2, y], [x - size * 0.2, y]], { fill: pot });
}

function windowPane(s: Sketch, x: number, y: number, w: number, h: number, glass: string, curtain: string | null) {
  s.rect(x - 6, y - 6, w + 12, h + 12, { fill: P.white, width: 2 });
  s.rect(x, y, w, h, { fill: glass, width: 1.2 });
  s.line(x + w / 2, y, x + w / 2, y + h, P.ink, 1.3, 0.6); s.line(x, y + h / 2, x + w, y + h / 2, P.ink, 1.3, 0.6);
  s.rect(x - 12, y + h + 6, w + 24, 8, { fill: P.white, width: 1.4 });
  if (curtain) {
    s.line(x - 18, y - 16, x + w + 18, y - 16, P.woodDark, 2.4);
    for (const side of [0, 1]) {
      const cx = side ? x + w - 10 : x - 14;
      s.poly([[cx, y - 14], [cx + 30, y - 14], [cx + (side ? 30 : 22), y + h + 14], [cx + (side ? 8 : 0), y + h + 14]], { fill: curtain });
      s.curve([[cx + 12, y - 10], [cx + 14, y + h + 8]], P.ink, 1, 0.4); s.curve([[cx + 21, y - 10], [cx + 20, y + h + 8]], P.ink, 1, 0.4);
    }
  }
}

function shelf(s: Sketch, x: number, y: number, w: number) {
  s.rect(x, y, w, 9, { fill: P.wood });
  s.poly([[x + 12, y + 9], [x + 22, y + 9], [x + 12, y + 24]], { fill: P.woodDark, width: 1.2 }); s.poly([[x + w - 12, y + 9], [x + w - 22, y + 9], [x + w - 12, y + 24]], { fill: P.woodDark, width: 1.2 });
}

const ZONE_ART: Record<ZoneId, (s: Sketch) => void> = {
  door(s) {
    frame(s, 28, 236, 78, 96, P.sage, 'leaf');
    // 挂钩、围巾和帽子
    s.rect(322, 268, 96, 10, { fill: P.wood, r: 3 });
    for (const x of [340, 372, 404]) s.ellipse(x, 284, 4, 4, { fill: P.woodDark, width: 1 });
    s.poly([[364, 286], [382, 286], [386, 372], [374, 380], [362, 372]], { fill: P.coral }); s.line(364, 356, 386, 356, P.ink, 1, 0.5);
    s.poly([[324, 300], [356, 300], [350, 286], [330, 286]], { fill: P.mustard }); s.rect(318, 298, 44, 7, { fill: P.mustard, r: 3 });
    // 伞桶
    s.poly([[36, 470], [92, 470], [86, 546], [42, 546]], { fill: P.mist });
    s.curve([[58, 472], [54, 420], [46, 410]], P.coral, 4); s.curve([[74, 472], [80, 430]], P.woodDark, 3);
    // 地垫
    s.ellipse(216, 630, 132, 20, { fill: P.mist });
    s.ellipse(216, 630, 100, 12, { fill: lighten(P.mist, 0.3), width: 1 });
    // 门上方的小灯
    s.line(66, 0, 66, 150, P.ink, 1.3); s.poly([[44, 190], [88, 190], [78, 150], [54, 150]], { fill: P.mustard });
  },
  kitchen(s) {
    windowPane(s, 46, 174, 150, 124, P.glass, P.mustard);
    plant(s, 120, 304, 30, P.coral, 5);
    // 置物架和瓶瓶罐罐
    shelf(s, 238, 224, 168);
    s.rect(250, 190, 26, 34, { fill: P.coral, r: 4 }); s.rect(284, 198, 22, 26, { fill: P.white, r: 4 }); s.rect(314, 184, 28, 40, { fill: P.sage, r: 4 }); s.ellipse(374, 210, 16, 14, { fill: P.mist });
    shelf(s, 238, 316, 168);
    s.rect(252, 292, 44, 24, { fill: P.mustard, r: 5 }); s.ellipse(330, 302, 16, 14, { fill: P.white }); s.rect(362, 286, 24, 30, { fill: P.coral, r: 4 });
    // 柜子
    s.rect(24, 402, 196, 14, { fill: P.white, r: 3 });
    s.rect(30, 416, 184, 130, { fill: P.sage, r: 4 });
    s.line(122, 420, 122, 542, P.ink, 1.3, 0.6); s.ellipse(108, 476, 4.5, 4.5, { fill: P.white, width: 1 }); s.ellipse(136, 476, 4.5, 4.5, { fill: P.white, width: 1 });
    // 柜子上的水壶和碗
    s.rect(50, 366, 40, 36, { fill: P.mist, r: 8 }); s.curve([[90, 374], [104, 366]], P.ink, 2); s.rect(62, 358, 16, 8, { fill: P.woodDark, r: 3 });
    s.poly([[140, 384], [196, 384], [186, 402], [150, 402]], { fill: P.coral });
    // 地上的小垫子
    s.ellipse(330, 650, 84, 14, { fill: lighten(P.sage, 0.15) });
  },
  living(s) {
    frame(s, 44, 176, 130, 104, P.mist, 'hill'); frame(s, 190, 200, 76, 92, P.coral, 'sun'); frame(s, 196, 306, 64, 52, P.mustard, 'fish');
    shelf(s, 292, 250, 120);
    for (const [x, w, h, c] of [[300, 14, 44, P.coral], [316, 12, 36, P.mist], [330, 16, 48, P.sage], [348, 12, 40, P.mustard]] as [number, number, number, string][]) s.rect(x, 250 - h, w, h, { fill: c, width: 1.2 });
    plant(s, 390, 250, 28, P.white, 5);
    // 地毯
    s.ellipse(210, 646, 176, 30, { fill: P.mist }); s.ellipse(210, 646, 140, 20, { fill: lighten(P.mist, 0.3), width: 1 });
    // 沙发
    s.rect(28, 418, 262, 128, { fill: P.sage, r: 26 });
    s.rect(42, 478, 234, 58, { fill: lighten(P.sage, 0.28), r: 16 });
    s.rect(58, 436, 64, 56, { fill: P.coral, r: 14 }); s.rect(196, 442, 58, 50, { fill: P.mustard, r: 14 });
    s.rect(46, 544, 12, 16, { fill: P.woodDark, width: 1.2 }); s.rect(260, 544, 12, 16, { fill: P.woodDark, width: 1.2 });
    // 落地灯
    s.line(306, 400, 306, 552, P.woodDark, 3); s.poly([[284, 400], [328, 400], [318, 356], [294, 356]], { fill: P.mustard }); s.ellipse(306, 554, 16, 5, { fill: P.woodDark, width: 1.2 });
  },
  bath(s) {
    // 下半墙的瓷砖
    s.rect(6, 320, W - 12, 226, { fill: lighten(P.mist, 0.42), stroke: false, hatch: 0.6 });
    s.rect(6, 310, W - 12, 12, { fill: P.mist, stroke: false }); s.line(6, 310, W - 6, 310, P.ink, 1.3, 0.6);
    for (let y = 366; y < 546; y += 46) s.line(6, y, W - 6, y, '#FFFFFF', 2, 0.85);
    for (let x = 52; x < W - 10; x += 47) s.line(x, 322, x, 546, '#FFFFFF', 2, 0.85);
    // 圆镜子、小架子、毛巾
    s.ellipse(112, 226, 60, 60, { fill: P.mustard }); s.ellipse(112, 226, 50, 50, { fill: P.glass, width: 1.2 }); s.curve([[84, 214], [100, 194]], '#FFFFFF', 3, 0.8);
    shelf(s, 210, 232, 96); s.rect(222, 196, 20, 36, { fill: P.coral, r: 5 }); s.rect(250, 206, 18, 26, { fill: P.sage, r: 5 }); s.ellipse(286, 220, 10, 12, { fill: P.white });
    s.line(326, 176, 414, 176, P.woodDark, 3); s.rect(338, 178, 56, 84, { fill: P.coral, r: 4 }); s.line(338, 242, 394, 242, P.white, 2.5, 0.8);
    plant(s, 372, 546, 44, P.white, 6);
    s.ellipse(216, 660, 120, 18, { fill: lighten(P.sage, 0.1) });
  },
  bedroom(s) {
    windowPane(s, 250, 174, 140, 130, '#B9C6D6', P.coral);
    s.ellipse(350, 214, 17, 17, { fill: '#F6ECC6', width: 1.1 }); for (const [x, y] of [[282, 204], [300, 254], [330, 274], [372, 260]]) s.ellipse(x, y, 2, 2, { fill: '#FFFFFF', stroke: false, hatch: 0 });
    frame(s, 64, 200, 110, 82, P.sage, 'hill'); frame(s, 80, 300, 70, 56, P.mist, 'fish');
    // 床头柜和台灯
    s.rect(18, 480, 62, 66, { fill: P.wood, r: 4 }); s.line(22, 512, 76, 512, P.ink, 1.2, 0.6); s.ellipse(49, 498, 4, 4, { fill: P.mustard, width: 1 });
    s.line(49, 446, 49, 480, P.woodDark, 3); s.poly([[30, 446], [68, 446], [60, 410], [38, 410]], { fill: P.mustard });
    s.ellipse(250, 652, 150, 22, { fill: lighten(P.coral, 0.35) });
  },
  shelf(s) {
    s.line(340, 0, 340, 150, P.ink, 1.3); s.poly([[314, 192], [366, 192], [354, 150], [326, 150]], { fill: P.coral });
    shelf(s, 236, 420, 170); plant(s, 276, 420, 30, P.mustard, 5); s.rect(316, 388, 30, 32, { fill: P.mist, r: 4 }); s.rect(354, 380, 34, 40, { fill: P.sage, r: 4 });
    plant(s, 318, 546, 70, P.coral, 8);
    s.ellipse(320, 650, 92, 15, { fill: lighten(P.mustard, 0.2) });
    frame(s, 44, 170, 80, 64, P.mustard, 'sun');
  },
  pond(s) {
    // 阳台外面的天空、远山、栏杆
    s.rect(26, 160, W - 52, 386, { fill: P.sky, hatch: 0.6 });
    s.ellipse(330, 206, 26, 26, { fill: '#F4E3A6', width: 1.1 });
    s.ellipse(120, 196, 40, 12, { fill: P.white, width: 1 }); s.ellipse(150, 186, 30, 12, { fill: P.white, width: 1 });
    s.poly([[26, 430], [110, 340], [190, 400], [270, 330], [406, 430]] as Pt[], { fill: lighten(P.sage, 0.15) });
    s.poly([[26, 446], [140, 392], [260, 430], [406, 398], [406, 446]] as Pt[], { fill: P.sage });
    for (let x = 44; x < W - 30; x += 36) s.rect(x, 446, 8, 100, { fill: P.white, width: 1.2 });
    s.rect(26, 436, W - 52, 12, { fill: P.white, width: 1.4 });
    plant(s, 60, 546, 46, P.coral, 6); plant(s, 380, 546, 40, P.mustard, 6);
  },
};

export function drawZone(id: ZoneId, index: number): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(W, H, 1.5);
  const s = new Sketch(ctx, 101 + index * 17);
  base(s); ZONE_ART[id](s);
  return cv;
}

// ---------- 可互动的物品：每件一张单独的图，带一个跳色 ----------

const OBJECT_ART: Record<string, { w: number; h: number; draw: (s: Sketch) => void }> = {
  door: { w: 176, h: 392, draw(s) {
    s.rect(3, 3, 170, 389, { fill: lighten(P.wood, 0.45), r: 4 });
    s.rect(13, 13, 150, 379, { fill: P.wood, r: 3 });
    s.rect(30, 36, 116, 130, { fill: lighten(P.wood, 0.2), r: 4, width: 1.3 }); s.rect(30, 192, 116, 172, { fill: lighten(P.wood, 0.2), r: 4, width: 1.3 });
    s.ellipse(142, 210, 9, 9, { fill: P.mustard });
  } },
  bowl: { w: 96, h: 44, draw(s) {
    s.poly([[6, 12], [90, 12], [78, 40], [18, 40]], { fill: P.coral }); s.ellipse(48, 13, 42, 9, { fill: darken(P.wood, 0.1) });
  } },
  feeder: { w: 70, h: 128, draw(s) {
    s.rect(5, 4, 60, 122, { fill: P.white, r: 10 }); s.rect(15, 14, 40, 54, { fill: P.mist, r: 6, width: 1.3 });
    s.rect(18, 40, 34, 26, { fill: darken(P.wood, 0.05), stroke: false, r: 3 }); s.ellipse(35, 94, 10, 10, { fill: P.coral });
  } },
  scratcher: { w: 84, h: 160, draw(s) {
    s.rect(28, 16, 28, 132, { fill: lighten(P.wood, 0.35) });
    for (let y = 30; y < 144; y += 11) s.line(29, y, 55, y + 4, P.woodDark, 1.1, 0.6);
    s.rect(14, 4, 56, 16, { fill: P.mustard, r: 7 }); s.rect(6, 144, 72, 14, { fill: P.mustard, r: 6 });
  } },
  ball: { w: 32, h: 32, draw(s) { s.ellipse(16, 16, 13, 13, { fill: P.coral }); s.curve([[6, 12], [16, 16], [26, 10]], P.white, 2.5, 0.8); } },
  tub: { w: 260, h: 128, draw(s) {
    s.line(226, 4, 226, 40, P.ink, 3); s.curve([[226, 6], [204, 6], [204, 20]], P.ink, 3); s.ellipse(226, 26, 8, 8, { fill: P.mustard });
    s.rect(6, 34, 248, 78, { fill: P.white, r: 36 }); s.rect(2, 28, 256, 14, { fill: P.white, r: 7 });
    s.curve([[40, 96], [130, 104], [220, 96]], P.mist, 5, 0.7);
    s.rect(34, 110, 14, 16, { fill: P.mist, r: 3 }); s.rect(212, 110, 14, 16, { fill: P.mist, r: 3 });
  } },
  bed: { w: 290, h: 150, draw(s) {
    s.rect(4, 6, 22, 142, { fill: P.woodDark, r: 6 }); s.rect(266, 76, 18, 72, { fill: P.woodDark, r: 5 });
    s.rect(14, 96, 264, 44, { fill: P.wood, r: 6 });
    s.rect(20, 66, 256, 46, { fill: P.white, r: 14 });
    s.rect(96, 62, 182, 54, { fill: P.coral, r: 14 }); s.line(104, 82, 270, 82, P.white, 2.5, 0.7);
    s.rect(30, 44, 72, 36, { fill: P.white, r: 14 });
  } },
  cabinet: { w: 190, h: 280, draw(s) {
    s.rect(4, 4, 182, 272, { fill: P.wood, r: 6 });
    for (let r = 0; r < 3; r++) s.rect(16, 18 + r * 86, 158, 72, { fill: lighten(P.wood, 0.55), r: 3, width: 1.3 });
    s.ellipse(95, 11, 5, 5, { fill: P.coral, width: 1 });
  } },
  album: { w: 150, h: 170, draw(s) {
    frame(s, 4, 20, 72, 56, P.mist, 'hill'); frame(s, 86, 4, 58, 74, P.coral, 'sun'); frame(s, 12, 88, 56, 70, P.sage, 'leaf'); frame(s, 78, 92, 68, 54, P.mustard, 'fish');
  } },
  pond: { w: 340, h: 96, draw(s) {
    s.ellipse(170, 48, 166, 44, { fill: lighten(P.wood, 0.25) }); s.ellipse(170, 46, 150, 35, { fill: P.mist });
    s.curve([[90, 38], [120, 34], [150, 38]], P.white, 2.5, 0.7); s.curve([[190, 60], [220, 56], [250, 60]], P.white, 2.5, 0.7);
    s.ellipse(60, 30, 12, 7, { fill: P.sage, width: 1.1 }); s.ellipse(286, 64, 14, 8, { fill: P.sage, width: 1.1 });
  } },
};

export function drawObject(kind: string): HTMLCanvasElement | null {
  const def = OBJECT_ART[kind]; if (!def) return null;
  const [cv, ctx] = makeCanvas(def.w, def.h, 2);
  def.draw(new Sketch(ctx, 300 + kind.length * 31 + kind.charCodeAt(0)));
  return cv;
}

export const objectAspect = (kind: string) => { const d = OBJECT_ART[kind]; return d ? d.w / d.h : 1; };
