// 装饰的占位图：用代码画的彩铅风小物件。以后每件都可以换成 PNG（路径在 assets.config.ts 的 decor 里，
// 也可以在开发者面板 →「素材替换」里上传）。画的时候底边贴着物件的最下面。
import { PALETTE, SKINS } from '../config';
import { makeCanvas, Sketch } from './sketch';

let P: typeof PALETTE = PALETTE;
const lighten = (hex: string, t: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.round(v + (255 - v) * t); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

/** 带白边的小画框，里面画一样东西（和原来背景里的挂画一样） */
function frame(s: Sketch, x: number, y: number, w: number, h: number, color: string, motif: 'hill' | 'sun' | 'leaf' | 'fish') {
  s.rect(x, y, w, h, { fill: P.white, stroke: P.woodDark, width: 2.2 });
  s.rect(x + 7, y + 7, w - 14, h - 14, { fill: lighten(color, 0.35), width: 1.1 });
  const cx = x + w / 2, by = y + h - 9;
  if (motif === 'hill') { s.poly([[x + 9, by], [cx - 6, y + h * 0.45], [cx + 8, by - 8], [x + w - 16, y + h * 0.55], [x + w - 9, by]], { fill: color, width: 1.1 }); s.ellipse(x + w - 22, y + 22, 7, 7, { fill: P.mustard, width: 1 }); }
  if (motif === 'sun') s.ellipse(cx, y + h / 2, w * 0.2, w * 0.2, { fill: color, width: 1.1 });
  if (motif === 'leaf') { s.curve([[cx, by], [cx + 2, y + 16]], P.woodDark, 1.3); for (let i = 0; i < 4; i++) s.leaf(cx + 1, by - 10 - i * (h - 44) / 4, 16, i % 2 ? -0.5 : Math.PI + 0.5, color); }
  if (motif === 'fish') { s.ellipse(cx - 3, y + h / 2, w * 0.24, h * 0.14, { fill: color, width: 1.1 }); s.poly([[cx + w * 0.2, y + h / 2], [cx + w * 0.32, y + h / 2 - 9], [cx + w * 0.32, y + h / 2 + 9]], { fill: color, width: 1.1 }); }
}

const ART: Record<string, { w: number; h: number; draw(s: Sketch): void }> = {
  rug: { w: 300, h: 70, draw(s) { s.ellipse(150, 36, 146, 30, { fill: P.coral }); s.ellipse(150, 36, 112, 21, { fill: '#F1C9B8' }); s.ellipse(150, 36, 70, 12, { fill: P.mustard }); } },
  mat: { w: 150, h: 44, draw(s) { s.ellipse(75, 23, 72, 19, { fill: P.mist }); s.ellipse(75, 23, 44, 11, { fill: '#D6E1EA' }); } },
  // 开局自带的（原来画在背景里的）：大地毯、中地毯、几幅小画
  bigrug: { w: 360, h: 66, draw(s) { s.ellipse(180, 33, 176, 30, { fill: P.mist }); s.ellipse(180, 33, 140, 20, { fill: lighten(P.mist, 0.3), width: 1 }); } },
  midrug: { w: 270, h: 48, draw(s) { s.ellipse(135, 24, 132, 22, { fill: P.sage }); s.ellipse(135, 24, 98, 14, { fill: lighten(P.sage, 0.3), width: 1 }); } },
  leafpic: { w: 80, h: 98, draw(s) { frame(s, 1, 1, 78, 96, P.sage, 'leaf'); } },
  sunpic: { w: 82, h: 66, draw(s) { frame(s, 1, 1, 80, 64, P.mustard, 'sun'); } },
  duopic: { w: 112, h: 158, draw(s) { s.ctx.translate(-63, -199); frame(s, 64, 200, 110, 82, P.sage, 'hill'); frame(s, 80, 300, 70, 56, P.mist, 'fish'); } },
  triopic: { w: 224, h: 184, draw(s) { s.ctx.translate(-43, -175); frame(s, 44, 176, 130, 104, P.mist, 'hill'); frame(s, 190, 200, 76, 92, P.coral, 'sun'); frame(s, 196, 306, 64, 52, P.mustard, 'fish'); } },
  painting: { w: 150, h: 120, draw(s) {
    s.rect(4, 4, 142, 112, { fill: P.woodDark, r: 4 }); s.rect(14, 14, 122, 92, { fill: '#DCE8EE' });
    s.poly([[14, 106], [50, 52], [78, 84], [100, 62], [136, 106]], { fill: P.sage }); s.ellipse(108, 36, 12, 12, { fill: P.mustard });
  } },
  poster: { w: 84, h: 84, draw(s) {
    s.rect(4, 4, 76, 76, { fill: P.mustard, r: 3 }); s.rect(12, 12, 60, 60, { fill: '#FBF6EC' });
    s.ellipse(40, 42, 17, 10, { fill: P.mist }); s.poly([[55, 42], [68, 32], [68, 52]], { fill: P.mist }); s.ellipse(32, 40, 2, 2, { fill: P.ink });
  } },
  plant: { w: 80, h: 96, draw(s) {
    for (const [a, l] of [[-0.9, 40], [-0.35, 52], [0.25, 54], [0.8, 42]] as [number, number][]) s.leaf(40, 62, l, a - Math.PI / 2, P.sage);
    s.poly([[20, 60], [60, 60], [54, 94], [26, 94]], { fill: P.coral });
  } },
  bigplant: { w: 150, h: 220, draw(s) {
    for (const [a, l] of [[-1.1, 92], [-0.6, 120], [-0.15, 136], [0.3, 128], [0.75, 104], [1.15, 80]] as [number, number][]) s.leaf(75, 150, l, a - Math.PI / 2, P.sage);
    s.line(75, 150, 75, 172, P.woodDark, 5, 1);
    s.poly([[42, 166], [108, 166], [98, 218], [52, 218]], { fill: '#FBF6EC' }); s.rect(40, 160, 70, 12, { fill: '#EDE3D2', r: 4 });
  } },
  cushion: { w: 76, h: 54, draw(s) { s.rect(4, 6, 68, 44, { fill: P.mustard, r: 14 }); s.line(20, 18, 56, 40, '#FBF6EC', 2.4, 0.8); s.line(56, 18, 20, 40, '#FBF6EC', 2.4, 0.8); } },
  nightlight: { w: 60, h: 76, draw(s) { s.rect(22, 50, 16, 20, { fill: P.woodDark, r: 3 }); s.rect(12, 66, 36, 8, { fill: P.woodDark, r: 4 }); s.ellipse(30, 30, 24, 24, { fill: '#FFE7A8' }); s.ellipse(24, 24, 7, 7, { fill: '#FFF6DA' }); } },
  shelf: { w: 130, h: 200, draw(s) {
    s.rect(6, 6, 118, 190, { fill: P.wood, r: 4 }); for (const y of [16, 76, 136]) s.rect(16, y, 98, 50, { fill: '#8A5B3C' });
    const cols = [P.coral, P.mist, P.sage, P.mustard, '#FBF6EC'];
    for (const y of [16, 76]) for (let i = 0; i < 6; i++) s.rect(20 + i * 15, y + 10 + (i % 3) * 4, 12, 40 - (i % 3) * 4, { fill: cols[(i + y) % 5] });
    s.ellipse(44, 170, 16, 12, { fill: P.sage }); s.rect(72, 150, 30, 36, { fill: P.coral, r: 3 });
  } },
  // 两盏可以自己摆的落地灯
  lamp: { w: 96, h: 250, draw(s) {
    s.rect(44, 60, 8, 176, { fill: P.woodDark, r: 3 }); s.rect(24, 232, 48, 14, { fill: P.woodDark, r: 6 });
    s.poly([[26, 6], [70, 6], [88, 66], [8, 66]], { fill: P.mustard });
  } },
  sidelamp: { w: 52, h: 200, draw(s) {
    s.line(26, 46, 26, 194, P.woodDark, 3); s.ellipse(26, 195, 16, 5, { fill: P.woodDark, width: 1.2 });
    s.poly([[4, 46], [48, 46], [38, 2], [14, 2]], { fill: P.mustard });
  } },
  // 季节活动的奖励
  vase: { w: 80, h: 120, draw(s) { s.line(40, 70, 30, 20, P.woodDark, 2); s.line(40, 70, 52, 14, P.woodDark, 2); s.line(40, 70, 44, 34, P.woodDark, 2); for (const [x, y] of [[28, 20], [22, 30], [52, 14], [60, 24], [44, 32], [36, 12], [50, 40]]) s.ellipse(x, y, 7, 6, { fill: '#F2A9BC', width: 1 }); s.poly([[24, 116], [56, 116], [62, 84], [50, 66], [30, 66], [18, 84]], { fill: P.mist }); } },
  jar: { w: 64, h: 84, draw(s) { s.rect(8, 16, 48, 66, { fill: lighten(P.mist, 0.55), r: 10 }); s.rect(14, 6, 36, 12, { fill: P.woodDark, r: 3 }); for (const [x, y] of [[22, 36], [40, 46], [30, 62], [44, 68], [20, 54]]) s.ellipse(x, y, 4, 4, { fill: '#F3E77A', stroke: false, hatch: 0 }); } },
  wreath: { w: 110, h: 110, draw(s) { for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; s.ellipse(55 + Math.cos(a) * 36, 58 + Math.sin(a) * 36, 13, 8, { fill: ['#D9603F', '#E3B341', '#A97B50'][i % 3], width: 1 }); } s.rect(46, 6, 18, 14, { fill: P.coral, r: 4 }); } },
  snowman: { w: 90, h: 110, draw(s) { s.ellipse(45, 78, 32, 30, { fill: P.white }); s.ellipse(45, 36, 22, 21, { fill: P.white }); s.rect(28, 50, 34, 9, { fill: P.coral, r: 4 }); s.ellipse(38, 32, 2.5, 2.5, { fill: P.ink, stroke: false, hatch: 0 }); s.ellipse(52, 32, 2.5, 2.5, { fill: P.ink, stroke: false, hatch: 0 }); s.poly([[45, 38], [60, 41], [45, 44]], { fill: P.mustard, width: 1 }); s.rect(32, 8, 26, 10, { fill: P.woodDark, r: 2 }); } },
  // 常客的回礼
  bell: { w: 70, h: 90, draw(s) { s.line(35, 0, 35, 22, P.ink, 1.3); s.poly([[14, 60], [56, 60], [48, 26], [22, 26]], { fill: P.mustard }); s.rect(10, 58, 50, 8, { fill: P.mustard, r: 4 }); s.ellipse(35, 74, 7, 7, { fill: P.coral }); s.rect(27, 16, 16, 10, { fill: P.coral, r: 4 }); } },
  lantern: { w: 80, h: 110, draw(s) { s.line(40, 2, 40, 14, P.ink, 1.3); s.rect(26, 12, 28, 8, { fill: P.woodDark, r: 3 }); s.ellipse(40, 54, 32, 36, { fill: P.coral }); for (const x of [26, 40, 54]) s.curve([[x, 22], [x + (x - 40) * 0.5, 54], [x, 88]], P.ink, 1.1, 0.5); s.rect(26, 88, 28, 8, { fill: P.woodDark, r: 3 }); s.line(40, 96, 40, 108, P.mustard, 3); } },
  parcel: { w: 96, h: 80, draw(s) { s.rect(4, 22, 88, 56, { fill: lighten(P.wood, 0.25), r: 3 }); s.poly([[4, 22], [22, 4], [48, 22]], { fill: lighten(P.wood, 0.4) }); s.poly([[48, 22], [74, 4], [92, 22]], { fill: lighten(P.wood, 0.4) }); s.line(48, 22, 48, 78, P.mustard, 6, 0.8); s.rect(58, 44, 24, 16, { fill: P.white, r: 2, width: 1 }); } },
  // 里程碑奖励的特殊装饰
  globe: { w: 80, h: 100, draw(s) { s.rect(34, 78, 12, 14, { fill: P.woodDark }); s.rect(20, 90, 40, 8, { fill: P.woodDark, r: 4 }); s.ellipse(40, 44, 32, 32, { fill: P.mist }); s.poly([[22, 36], [36, 26], [44, 40], [34, 56], [24, 50]], { fill: P.sage }); s.poly([[48, 46], [60, 40], [62, 56], [52, 62]], { fill: P.sage }); } },
  goldframe: { w: 110, h: 130, draw(s) { s.rect(4, 4, 102, 122, { fill: '#E3B341', r: 6 }); s.rect(16, 16, 78, 98, { fill: '#FBF6EC' }); s.ellipse(55, 58, 22, 20, { fill: P.coral }); s.poly([[38, 44], [44, 26], [52, 44]], { fill: P.coral }); s.poly([[58, 44], [66, 26], [72, 44]], { fill: P.coral }); s.rect(30, 86, 50, 16, { fill: P.coral, r: 8 }); } },
  // 猫叼回来的稀有礼物
  featherCharm: { w: 60, h: 86, draw(s) { s.line(30, 0, 30, 14, P.ink, 1.3); s.ellipse(30, 22, 12, 10, { fill: P.woodDark }); for (const [x, c] of [[16, P.mist], [30, P.coral], [44, P.mustard]] as [number, string][]) { s.line(30, 28, x, 44, P.ink, 1); s.poly([[x - 6, 44], [x + 6, 44], [x + 2, 82], [x - 2, 82]], { fill: c }); } } },
  paperBoat: { w: 90, h: 44, draw(s) { s.poly([[4, 26], [86, 26], [70, 42], [20, 42]], { fill: '#FBF6EC' }); s.poly([[30, 26], [46, 2], [62, 26]], { fill: '#F2EADB' }); s.ellipse(56, 34, 4, 3, { fill: P.ink }); s.ellipse(62, 31, 2, 2, { fill: P.ink }); s.ellipse(60, 37, 2, 2, { fill: P.ink }); } },
  shellBox: { w: 70, h: 40, draw(s) { s.ellipse(35, 28, 32, 12, { fill: '#F4D9C6' }); s.poly([[6, 26], [35, 2], [64, 26]], { fill: '#F7E3D3' }); for (const x of [20, 35, 50]) s.line(35, 4, x, 26, '#C99A84', 1.2); } },
  trophy: { w: 80, h: 104, draw(s) { s.rect(24, 92, 32, 10, { fill: P.woodDark, r: 3 }); s.rect(35, 70, 10, 24, { fill: '#E3B341' }); s.poly([[16, 10], [64, 10], [56, 56], [40, 70], [24, 56]], { fill: '#E3B341' }); s.curve([[16, 18], [4, 22], [8, 42], [22, 46]], '#B8891F', 5, 1); s.curve([[64, 18], [76, 22], [72, 42], [58, 46]], '#B8891F', 5, 1); s.ellipse(40, 32, 9, 9, { fill: '#FBF6EC' }); } },
};

/** skin = 皮肤（不写 = 默认款）。占位图的各款皮肤造型一样，只换配色 */
export function drawDecor(kind: string, skin?: string): HTMLCanvasElement | null {
  const def = ART[kind]; if (!def) return null;
  const [cv, ctx] = makeCanvas(def.w, def.h, 2);
  P = { ...PALETTE, ...(SKINS.find((k) => k.id === skin)?.palette ?? {}) };
  try { def.draw(new Sketch(ctx, 900 + kind.length * 17 + kind.charCodeAt(0))); } finally { P = PALETTE; }
  return cv;
}
export const decorAspect = (kind: string) => { const d = ART[kind]; return d ? d.w / d.h : 1; };
