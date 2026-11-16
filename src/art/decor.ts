// 装饰的占位图：用代码画的彩铅风小物件。以后每件都可以换成 PNG（路径在 assets.config.ts 的 decor 里，
// 也可以在开发者面板 →「素材替换」里上传）。画的时候底边贴着物件的最下面。
import { PALETTE, SKINS } from '../config';
import { makeCanvas, Sketch } from './sketch';

let P: typeof PALETTE = PALETTE;

const ART: Record<string, { w: number; h: number; draw(s: Sketch): void }> = {
  rug: { w: 300, h: 70, draw(s) { s.ellipse(150, 36, 146, 30, { fill: P.coral }); s.ellipse(150, 36, 112, 21, { fill: '#F1C9B8' }); s.ellipse(150, 36, 70, 12, { fill: P.mustard }); } },
  mat: { w: 150, h: 44, draw(s) { s.ellipse(75, 23, 72, 19, { fill: P.mist }); s.ellipse(75, 23, 44, 11, { fill: '#D6E1EA' }); } },
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
  // 里程碑奖励的特殊装饰
  globe: { w: 80, h: 100, draw(s) { s.rect(34, 78, 12, 14, { fill: P.woodDark }); s.rect(20, 90, 40, 8, { fill: P.woodDark, r: 4 }); s.ellipse(40, 44, 32, 32, { fill: P.mist }); s.poly([[22, 36], [36, 26], [44, 40], [34, 56], [24, 50]], { fill: P.sage }); s.poly([[48, 46], [60, 40], [62, 56], [52, 62]], { fill: P.sage }); } },
  goldframe: { w: 110, h: 130, draw(s) { s.rect(4, 4, 102, 122, { fill: '#E3B341', r: 6 }); s.rect(16, 16, 78, 98, { fill: '#FBF6EC' }); s.ellipse(55, 58, 22, 20, { fill: P.coral }); s.poly([[38, 44], [44, 26], [52, 44]], { fill: P.coral }); s.poly([[58, 44], [66, 26], [72, 44]], { fill: P.coral }); s.rect(30, 86, 50, 16, { fill: P.coral, r: 8 }); } },
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
