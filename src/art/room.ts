// 代码画的占位图：房间背景（每个区域一张）和每件可互动的物品（每件一张）。
// 画风往彩铅手绘靠：正侧面、没有透视、暖棕色细线、低饱和配色。
// 在 assets.config.ts 里配了图片（或在开发者面板上传）之后，对应的占位图就不再使用。
import { CONFIG, PALETTE, ROOM_THEMES, SKINS, type DayTime, type Season, type ZoneId } from '../config';
import { makeCanvas, Sketch, type Pt } from './sketch';

/** 现在用来画的调色板。画某一款皮肤、某一套房间风格的占位图时，临时换成那一套的颜色，画完换回来 */
let P: typeof PALETTE = PALETTE;
export const skinPalette = (skin?: string): typeof PALETTE => ({ ...PALETTE, ...(SKINS.find((k) => k.id === skin)?.palette ?? {}) });
export const roomPalette = (room?: string): typeof PALETTE => ({ ...PALETTE, ...(ROOM_THEMES.find((r) => r.id === room)?.palette ?? {}) });

const W = CONFIG.room.zoneWidth, H = CONFIG.room.height, FY = CONFIG.room.floorY;
const lighten = (hex: string, t: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.round(v + (255 - v) * t); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const darken = (hex: string, t: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.round(v * (1 - t)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

// ---------- 昼夜和季节：窗外、阳台、院子的颜色跟着变 ----------

export interface Env { time: DayTime; season: Season; weather?: 'clear' | 'rain' }
let ENV: Env = { time: 'day', season: 'summer' };
const SKY: Record<DayTime, string> = { day: '#D5E3EA', dusk: '#F2C9A4', night: '#3F4C80' };
const SEASON = {
  spring: { leaf: '#EFB7C4', leaf2: '#F6D3DB', grass: '#B8D3A0', hill: '#C6DDB2', hill2: '#A8C894', ground: '#B7CF9C' },
  summer: { leaf: '#8DB07E', leaf2: '#A8C596', grass: '#9DBF87', hill: '#B4CDA6', hill2: '#A8B89A', ground: '#A5C28C' },
  autumn: { leaf: '#E0914F', leaf2: '#D9A94A', grass: '#CDBE84', hill: '#DCC28E', hill2: '#CFA56B', ground: '#C9B77C' },
  winter: { leaf: '#F4F6F8', leaf2: '#E3EAF0', grass: '#EEF2F4', hill: '#E6ECF0', hill2: '#D3DDE5', ground: '#EDF1F3' },
};
const sea = () => SEASON[ENV.season];
const rainy = () => ENV.weather === 'rain';
/** 天空的颜色：下雨（冬天是下大雪）时灰蒙蒙的 */
const skyColor = () => (rainy() ? { day: '#C2CBD2', dusk: '#C8B8AB', night: '#333C60' }[ENV.time] : SKY[ENV.time]);

/** 天上的东西：太阳或月亮、云或星星 */
function skyThings(s: Sketch, x: number, y: number, w: number) {
  if (rainy()) {
    // 阴天：只有几朵灰云，看不到太阳、月亮和星星
    const c = ENV.time === 'night' ? '#4A5378' : '#A9B3BC';
    for (const [fx, dy, rx] of [[0.2, 34, 46], [0.34, 22, 34], [0.62, 40, 52], [0.8, 26, 38]]) s.ellipse(x + w * fx, y + dy, rx, 13, { fill: c, width: 1 });
  } else if (ENV.time === 'night') {
    s.ellipse(x + w * 0.76, y + 44, 20, 20, { fill: '#F6ECC6', width: 1.1 }); s.ellipse(x + w * 0.76 + 8, y + 38, 16, 16, { fill: SKY.night, stroke: false, hatch: 0 });
    stars(s, x + 10, y - 40, w - 20, 300, 26);
  } else {
    s.ellipse(x + w * 0.76, y + (ENV.time === 'dusk' ? 100 : 44), 24, 24, { fill: ENV.time === 'dusk' ? '#F0A46A' : '#F4E3A6', width: 1.1 });
    s.ellipse(x + w * 0.24, y + 40, 38, 11, { fill: P.white, width: 1 }); s.ellipse(x + w * 0.32, y + 30, 28, 11, { fill: P.white, width: 1 });
  }
}

/** 夜空里的星星：大小不一，有几颗偏暖。画在给定的方框里 */
function stars(s: Sketch, x: number, y: number, w: number, h: number, n: number) {
  for (let i = 0; i < n; i++) {
    const r = i % 5 === 0 ? 2.6 : i % 2 ? 1.3 : 1.8;
    s.ellipse(x + r + s.r() * (w - r * 2), y + r + s.r() * (h - r * 2), r, r, { fill: i % 4 === 0 ? '#FFF1C4' : '#FFFFFF', stroke: false, hatch: 0 });
  }
}

/** 窗外的月牙 */
function moon(s: Sketch, x: number, y: number, r: number) {
  s.ellipse(x, y, r, r, { fill: '#F6ECC6', width: 1 }); s.ellipse(x + r * 0.42, y - r * 0.3, r * 0.82, r * 0.82, { fill: SKY.night, stroke: false, hatch: 0 });
}

/** 一棵树：春天开花，夏天绿，秋天黄，冬天光秃秃挂着雪 */
function tree(s: Sketch, x: number, y: number, size: number) {
  const c = sea();
  s.poly([[x - size * 0.07, y], [x + size * 0.07, y], [x + size * 0.04, y - size * 0.62], [x - size * 0.04, y - size * 0.62]], { fill: P.woodDark });
  if (ENV.season === 'winter') {
    for (const [dx, dy, len, a] of [[0, -0.6, 0.34, -1.2], [0, -0.6, 0.3, -1.9], [0, -0.48, 0.26, -0.7], [0, -0.44, 0.24, -2.4]] as number[][]) {
      const bx = x + dx * size, by = y + dy * size; const ex = bx + Math.cos(a) * len * size, ey = by + Math.sin(a) * len * size;
      s.line(bx, by, ex, ey, P.woodDark, 3); s.ellipse(ex, ey - 3, 12, 6, { fill: c.leaf, width: 1 });
    }
    return;
  }
  for (const [dx, dy, r] of [[-0.2, -0.7, 0.26], [0.2, -0.72, 0.27], [0, -0.92, 0.3], [-0.08, -0.6, 0.22], [0.14, -0.56, 0.2]]) s.ellipse(x + dx * size, y + dy * size, r * size, r * size * 0.86, { fill: s.r() < 0.5 ? c.leaf : c.leaf2, width: 1.3 });
}

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
  },
  kitchen(s) {
    windowPane(s, 46, 174, 150, 124, lighten(skyColor(), ENV.time === 'night' ? 0 : 0.25), P.mustard);
    if (rainy() && ENV.time === 'night') { /* 下雨的夜里窗外一片黑 */ } else if (ENV.time === 'night') { stars(s, 50, 178, 142, 116, 9); moon(s, 160, 208, 13); } else s.ellipse(150, 268, 34, 22, { fill: sea().hill2, width: 1 });
    // 置物架和瓶瓶罐罐（窗台空着：猫会跳上去看外面）
    shelf(s, 238, 224, 168);
    s.rect(250, 190, 26, 34, { fill: P.coral, r: 4 }); s.rect(284, 198, 22, 26, { fill: P.white, r: 4 }); s.rect(314, 184, 28, 40, { fill: P.sage, r: 4 }); s.ellipse(374, 210, 16, 14, { fill: P.mist });
    shelf(s, 238, 316, 168);
    s.rect(252, 292, 44, 24, { fill: P.mustard, r: 5 }); s.ellipse(330, 302, 16, 14, { fill: P.white }); s.rect(362, 286, 24, 30, { fill: P.coral, r: 4 });
    // 橱柜是单独的家具（见下面的 counter）
    // 地上的小垫子
    s.ellipse(330, 650, 84, 14, { fill: lighten(P.sage, 0.15) });
  },
  living(s) {
    frame(s, 44, 176, 130, 104, P.mist, 'hill'); frame(s, 190, 200, 76, 92, P.coral, 'sun'); frame(s, 196, 306, 64, 52, P.mustard, 'fish');
    // 地毯
    s.ellipse(210, 646, 176, 30, { fill: P.mist }); s.ellipse(210, 646, 140, 20, { fill: lighten(P.mist, 0.3), width: 1 });
    // 沙发、猫爬架是单独的家具；右边的墙空着留给猫爬架。落地灯是可以自己摆的装饰
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
    windowPane(s, 250, 174, 140, 130, lighten(skyColor(), ENV.time === 'night' ? 0 : 0.25), P.coral);
    if (ENV.time === 'night' && !rainy()) { stars(s, 254, 178, 132, 122, 10); moon(s, 350, 214, 15); }
    else if (ENV.time !== 'night') { if (!rainy()) s.ellipse(350, 214, 15, 15, { fill: ENV.time === 'dusk' ? '#F0A46A' : '#F4E3A6', width: 1.1 }); s.ellipse(300, 284, 40, 18, { fill: sea().hill2, width: 1 }); }
    frame(s, 64, 200, 110, 82, P.sage, 'hill'); frame(s, 80, 300, 70, 56, P.mist, 'fish');
    // 床头柜和床头灯是单独的家具
    s.ellipse(250, 652, 150, 22, { fill: lighten(P.coral, 0.35) });
  },
  shelf(s) {
    shelf(s, 236, 420, 170); plant(s, 276, 420, 30, P.mustard, 5); s.rect(316, 388, 30, 32, { fill: P.mist, r: 4 }); s.rect(354, 380, 34, 40, { fill: P.sage, r: 4 });
    plant(s, 318, 546, 70, P.coral, 8);
    s.ellipse(320, 650, 92, 15, { fill: lighten(P.mustard, 0.2) });
    frame(s, 44, 170, 80, 64, P.mustard, 'sun');
  },
  // 阳台：没有墙，直接看到外面。栏杆、花盆、一把小椅子。
  balcony(s) {
    const c = sea();
    s.rect(6, 0, W - 12, 546, { fill: skyColor(), stroke: false, hatch: 0.5 });
    skyThings(s, 6, 60, W - 12);
    s.poly([[6, 440], [90, 350], [170, 404], [260, 336], [W - 6, 430], [W - 6, 546], [6, 546]] as Pt[], { fill: c.hill });
    s.poly([[6, 456], [130, 404], [250, 438], [W - 6, 408], [W - 6, 546], [6, 546]] as Pt[], { fill: c.hill2 });
    tree(s, 340, 470, 150);
    // 屋檐和柱子
    s.rect(0, 0, W, 34, { fill: P.wood, hatch: 0.6 }); s.rect(0, 34, 16, 512, { fill: P.wood }); s.rect(W - 16, 34, 16, 512, { fill: P.wood });
    // 栏杆
    for (let x = 34; x < W - 20; x += 34) s.rect(x, 430, 8, 116, { fill: P.white, width: 1.2 });
    s.rect(16, 418, W - 32, 14, { fill: P.white, width: 1.4 });
    // 花盆和小椅子
    plant(s, 62, 546, 44, P.coral, 6); plant(s, 118, 546, 30, P.mustard, 5);
    s.rect(290, 470, 80, 12, { fill: P.mist, r: 4 }); s.rect(296, 482, 8, 64, { fill: P.woodDark, width: 1.2 }); s.rect(356, 482, 8, 64, { fill: P.woodDark, width: 1.2 }); s.rect(356, 420, 8, 56, { fill: P.woodDark, width: 1.2 }); s.rect(350, 418, 20, 40, { fill: P.mist, r: 4 });
    if (ENV.season === 'winter') { s.ellipse(216, 420, 190, 6, { fill: '#FFFFFF', stroke: false, hatch: 0 }); }
  },
  // 院子：完全在室外。天空、远山、一棵大树、篱笆、草地；鱼塘是单独的物品。
  // 屋顶：一大片天，远处是别人家的屋顶，脚下是瓦片。夜里上来看星星
  roof(s) {
    s.rect(0, 0, W, 560, { fill: skyColor(), stroke: false, hatch: 0.5 });
    skyThings(s, 0, 90, W);
    if (ENV.time === 'night' && !rainy()) stars(s, 10, 250, W - 20, 200, 22);
    // 远处的屋顶和楼，夜里窗户亮着灯
    const far = ENV.time === 'night' ? '#3A4670' : lighten(P.mist, 0.25);
    for (const [x, w, h] of [[0, 70, 70], [64, 90, 120], [150, 60, 84], [206, 110, 150], [312, 64, 96], [372, 60, 130]]) {
      s.rect(x, 560 - h, w, h, { fill: far, width: 1 });
      for (let wy = 560 - h + 14; wy < 548; wy += 24) for (let wx = x + 10; wx < x + w - 12; wx += 20) if ((wx * 7 + wy * 3) % 5 < 2) s.rect(wx, wy, 9, 11, { fill: ENV.time === 'day' ? lighten(P.mist, 0.55) : '#F4D98A', stroke: false, hatch: 0 });
    }
    // 烟囱和天线
    s.rect(322, 432, 62, 128, { fill: P.coral, r: 2 }); s.rect(314, 420, 78, 16, { fill: P.woodDark, r: 3 });
    for (let y = 452; y < 556; y += 20) s.line(324, y, 382, y, P.ink, 1, 0.4);
    s.line(60, 560, 60, 452, P.ink, 2); s.line(38, 470, 82, 470, P.ink, 1.6); s.line(46, 486, 74, 486, P.ink, 1.4);
    // 瓦片
    const tile = ENV.season === 'winter' ? '#E9EEF1' : ROOF_TILE;
    s.rect(0, FY, W, H - FY, { fill: tile, stroke: false, hatch: 0.6 }); s.rect(0, FY - 8, W, 12, { fill: darken(tile, 0.12), r: 4 });
    for (let row = 0; row < 6; row++) for (let x = (row % 2) * 24 - 24; x < W; x += 48) s.curve([[x, FY + 22 + row * 26], [x + 24, FY + 34 + row * 26], [x + 48, FY + 22 + row * 26]], darken(tile, 0.22), 1.3, 0.7);
  },
  garden(s) {
    const c = sea();
    s.rect(0, 0, W, 560, { fill: skyColor(), stroke: false, hatch: 0.5 });
    skyThings(s, 0, 70, W);
    s.poly([[0, 450], [110, 356], [200, 416], [300, 340], [W, 440], [W, 560], [0, 560]] as Pt[], { fill: c.hill });
    s.poly([[0, 470], [150, 420], [280, 452], [W, 424], [W, 560], [0, 560]] as Pt[], { fill: c.hill2 });
    // 篱笆
    for (let x = 14; x < W; x += 40) s.poly([[x, 560], [x, 492], [x + 9, 480], [x + 18, 492], [x + 18, 560]], { fill: P.white, width: 1.2 });
    s.rect(0, 510, W, 8, { fill: P.white, width: 1.1 }); s.rect(0, 538, W, 8, { fill: P.white, width: 1.1 });
    tree(s, 92, 552, 300);
    // 草地（盖住木地板）
    s.rect(0, FY, W, H - FY, { fill: c.ground, stroke: false, hatch: 0.6 }); s.line(0, FY, W, FY, P.ink, 1.4, 0.5);
    for (let i = 0; i < 22; i++) { const x = s.r() * W, y = FY + 10 + s.r() * (H - FY - 16); s.curve([[x, y], [x + 3, y - 9]], ENV.season === 'winter' ? '#C9D3DA' : darken(P.sage, 0.15), 1.4, 0.7); }
    // 季节的小东西
    if (ENV.season === 'spring') for (let i = 0; i < 10; i++) s.ellipse(20 + s.r() * (W - 40), FY + 14 + s.r() * 120, 5, 5, { fill: i % 2 ? P.coral : '#F6D3DB', width: 1 });
    if (ENV.season === 'autumn') for (let i = 0; i < 12; i++) s.leaf(20 + s.r() * (W - 40), FY + 14 + s.r() * 130, 12, s.r() * 6, i % 2 ? '#E0914F' : P.mustard);
    if (ENV.season === 'summer') { s.ellipse(350, 600, 9, 9, { fill: P.mustard, width: 1 }); s.ellipse(380, 640, 7, 7, { fill: P.coral, width: 1 }); }
    // 通往屋里的踏脚石
    s.ellipse(40, 640, 30, 9, { fill: '#D9D4CB', width: 1.1 }); s.ellipse(100, 664, 26, 8, { fill: '#D9D4CB', width: 1.1 });
  },
};

/** 每个区域的地面颜色（院子是草地，其他是木地板）。画面底部往下延伸时用。 */
const ROOF_TILE = '#B9694C';
export const groundColor = (id: ZoneId, env: Env, room?: string) => (id === 'garden' ? SEASON[env.season].ground : id === 'roof' ? (env.season === 'winter' ? '#E9EEF1' : ROOF_TILE) : roomPalette(room).floor);

/** room = 房间风格（不写 = 默认的那一套） */
export function drawZone(id: ZoneId, index: number, env: Env = ENV, room?: string): HTMLCanvasElement {
  ENV = env; P = roomPalette(room);
  const [cv, ctx] = makeCanvas(W, H, 1.5);
  const s = new Sketch(ctx, 101 + index * 17);
  try { base(s); ZONE_ART[id](s); } finally { P = PALETTE; }
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
  // 沙发：猫可以跳上去。坐垫在图片高度的一半左右
  sofa: { w: 262, h: 144, draw(s) {
    s.rect(18, 126, 12, 16, { fill: P.woodDark, width: 1.2 }); s.rect(232, 126, 12, 16, { fill: P.woodDark, width: 1.2 });
    s.rect(1, 1, 260, 128, { fill: P.sage, r: 26 });
    s.rect(14, 60, 234, 58, { fill: lighten(P.sage, 0.28), r: 16 });
    s.rect(30, 18, 64, 56, { fill: P.coral, r: 14 }); s.rect(168, 24, 58, 50, { fill: P.mustard, r: 14 });
  } },
  // 橱柜：台面上放着水壶和碗
  counter: { w: 200, h: 190, draw(s) {
    s.rect(28, 8, 40, 36, { fill: P.mist, r: 8 }); s.curve([[68, 16], [82, 8]], P.ink, 2); s.rect(40, 1, 16, 8, { fill: P.woodDark, r: 3 });
    s.poly([[118, 26], [174, 26], [164, 44], [128, 44]], { fill: P.coral });
    s.rect(2, 44, 196, 14, { fill: P.white, r: 3 });
    s.rect(8, 58, 184, 130, { fill: P.sage, r: 4 });
    s.line(100, 62, 100, 184, P.ink, 1.3, 0.6); s.ellipse(86, 118, 4.5, 4.5, { fill: P.white, width: 1 }); s.ellipse(114, 118, 4.5, 4.5, { fill: P.white, width: 1 });
  } },
  // 猫爬架：三层（左上顶层、右边中层、左下底层），每层一只。落脚点写在 scene.ts 的 STATIONS.cattree 里
  cattree: { w: 200, h: 340, draw(s) {
    s.rect(8, 322, 184, 16, { fill: P.mustard, r: 6 });
    s.rect(42, 60, 20, 264, { fill: lighten(P.wood, 0.35) }); s.rect(142, 168, 20, 156, { fill: lighten(P.wood, 0.35) });
    for (let y = 76; y < 318; y += 12) s.line(43, y, 61, y + 4, P.woodDark, 1.1, 0.6);
    for (let y = 184; y < 318; y += 12) s.line(143, y, 161, y + 4, P.woodDark, 1.1, 0.6);
    s.rect(2, 262, 100, 14, { fill: P.mustard, r: 6 });   // 底层
    s.rect(98, 154, 100, 14, { fill: P.mustard, r: 6 });  // 中层
    s.rect(2, 47, 100, 14, { fill: P.mustard, r: 6 });    // 顶层
    s.rect(2, 36, 8, 14, { fill: P.mustard, r: 3 }); s.rect(94, 36, 8, 14, { fill: P.mustard, r: 3 });
    s.line(170, 168, 174, 206, P.ink, 1.2, 0.7); s.ellipse(175, 214, 8, 8, { fill: P.coral }); // 挂着的小球
  } },
  // 纸箱：猫钻进去只露出脑袋。前面一层从图片高度 42% 处开始（箱口的下沿）
  box: { w: 120, h: 92, draw(s) {
    s.poly([[8, 40], [0, 10], [44, 22], [58, 40]], { fill: lighten(P.wood, 0.42) }); s.poly([[112, 40], [120, 8], [78, 20], [62, 40]], { fill: lighten(P.wood, 0.42) });
    s.rect(8, 38, 104, 52, { fill: lighten(P.wood, 0.28), r: 3 }); s.line(60, 40, 60, 88, P.ink, 1.2, 0.5); s.rect(70, 56, 30, 18, { fill: P.white, r: 2, width: 1 });
  } },
  // 洗衣篮：藤编的，里面能窝一只猫。前面一层从 30% 处开始
  basket: { w: 110, h: 96, draw(s) {
    s.ellipse(55, 30, 50, 14, { fill: darken(P.wood, 0.1) });
    s.poly([[6, 30], [104, 30], [94, 92], [16, 92]], { fill: lighten(P.wood, 0.2) });
    for (let y = 44; y < 90; y += 14) s.line(10 + (y - 30) * 0.16, y, 100 - (y - 30) * 0.16, y, P.woodDark, 1.4, 0.6);
    for (let x = 24; x < 96; x += 16) s.line(x, 34, x + (x - 55) * -0.1, 90, P.woodDark, 1.1, 0.4);
    s.rect(30, 20, 50, 12, { fill: P.mist, r: 6 });
  } },
  // 小暖炉：中间的小窗透着橘色的火光（发光点）
  heater: { w: 84, h: 112, draw(s) {
    s.rect(34, 0, 16, 26, { fill: P.woodDark, r: 3 }); s.rect(8, 22, 68, 78, { fill: darken(P.mist, 0.25), r: 10 });
    s.rect(22, 44, 40, 36, { fill: '#F2A04A', r: 6 }); s.poly([[30, 78], [36, 56], [42, 70], [48, 52], [54, 78]], { fill: '#F6D06A', width: 1 });
    s.rect(14, 98, 12, 14, { fill: P.woodDark, r: 2 }); s.rect(58, 98, 12, 14, { fill: P.woodDark, r: 2 });
  } },
  // 自动逗猫球：自己会滚，带一根小羽毛
  autoball: { w: 44, h: 34, draw(s) { s.ellipse(17, 18, 15, 15, { fill: P.mist }); s.curve([[4, 14], [17, 20], [30, 14]], P.white, 3); s.curve([[30, 10], [40, 2], [42, 12]], P.coral, 3); } },
  // 猫隧道：布做的筒，两头是洞口。整件都画在宠物前面，猫从右边的洞口探出头
  tunnel: { w: 220, h: 80, draw(s) {
    s.rect(18, 8, 184, 70, { fill: P.sage, r: 30 });
    for (const x of [62, 110, 158]) s.curve([[x, 10], [x + 8, 42], [x, 76]], darken(P.sage, 0.2), 2.2, 0.8);
    s.ellipse(24, 43, 20, 34, { fill: darken(P.sage, 0.45) }); s.ellipse(196, 43, 20, 34, { fill: lighten(P.sage, 0.1) }); s.ellipse(196, 43, 14, 27, { fill: darken(P.sage, 0.5), width: 1 });
  } },
  // 猫草盆
  catgrass: { w: 64, h: 64, draw(s) {
    for (const [x, tip, h] of [[16, -6, 40], [24, 2, 48], [32, 0, 52], [40, 4, 46], [48, 8, 38]]) s.curve([[x, 40], [x + tip * 0.5, 40 - h * 0.5], [x + tip, 40 - h]], '#6FA05E', 3.4);
    s.poly([[8, 36], [56, 36], [50, 62], [14, 62]], { fill: P.coral }); s.rect(4, 30, 56, 9, { fill: lighten(P.coral, 0.2), r: 3 });
  } },
  nightstand: { w: 66, h: 70, draw(s) {
    s.rect(2, 2, 62, 66, { fill: P.wood, r: 4 }); s.line(6, 34, 60, 34, P.ink, 1.2, 0.6); s.ellipse(33, 20, 4, 4, { fill: P.mustard, width: 1 });
  } },
  // 床头灯：放在床头柜上（底边 = 床头柜的台面）
  bedlamp: { w: 44, h: 74, draw(s) {
    s.line(22, 38, 22, 70, P.woodDark, 3); s.ellipse(22, 70, 10, 3, { fill: P.woodDark, width: 1 });
    s.poly([[3, 38], [41, 38], [33, 2], [11, 2]], { fill: P.mustard });
  } },
  // 吊灯：图片最上面顶着天花板，电线也画在图里
  pendantDoor: { w: 56, h: 194, draw(s) { s.line(28, 0, 28, 150, P.ink, 1.3); s.poly([[6, 190], [50, 190], [40, 150], [16, 150]], { fill: P.mustard }); } },
  pendantShelf: { w: 60, h: 194, draw(s) { s.line(30, 0, 30, 150, P.ink, 1.3); s.poly([[4, 192], [56, 192], [44, 150], [16, 150]], { fill: P.coral }); } },
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
    s.ellipse(170, 48, 166, 44, { fill: lighten(P.wood, 0.25) }); s.ellipse(170, 46, 150, 35, { fill: PALETTE.mist }); // 水的颜色不跟皮肤变，换的是石头围边
    s.curve([[90, 38], [120, 34], [150, 38]], P.white, 2.5, 0.7); s.curve([[190, 60], [220, 56], [250, 60]], P.white, 2.5, 0.7);
    s.ellipse(60, 30, 12, 7, { fill: P.sage, width: 1.1 }); s.ellipse(286, 64, 14, 8, { fill: P.sage, width: 1.1 });
  } },
};

/** skin = 皮肤（不写 = 默认款）。占位图的各款皮肤造型一样，只换配色 */
export function drawObject(kind: string, skin?: string): HTMLCanvasElement | null {
  const def = OBJECT_ART[kind]; if (!def) return null;
  const [cv, ctx] = makeCanvas(def.w, def.h, 2);
  P = skinPalette(skin);
  try { def.draw(new Sketch(ctx, 300 + kind.length * 31 + kind.charCodeAt(0))); } finally { P = PALETTE; }
  return cv;
}

export const objectAspect = (kind: string) => { const d = OBJECT_ART[kind]; return d ? d.w / d.h : 1; };
