// 猫头上「想要」的小气泡（占位图）：一个白色圆气泡，下面一个小尖角指着猫，里面画它想要的东西。
// 正式图放 public/assets/ui/want-<种类>.png（整个气泡连图标一起画），见素材模板「想要的小气泡」。
import { PALETTE } from '../config';
import { makeCanvas, Sketch } from './sketch';
import type { WantKind } from '../sim';

const P = PALETTE;
const ICON: Record<WantKind, (s: Sketch) => void> = {
  // 饿了：一只饭碗，里面堆着粮
  food: (s) => {
    s.ellipse(50, 40, 22, 6, { fill: '#C98A55' });
    s.poly([[26, 42], [74, 42], [66, 60], [34, 60]], { fill: P.coral });
    s.ellipse(50, 42, 24, 5, { fill: '#B8794A' });
  },
  // 想洗澡：小浴缸冒泡泡
  bath: (s) => {
    s.rect(24, 40, 52, 18, { fill: P.white, r: 6 }); s.rect(22, 38, 56, 6, { fill: P.mist, r: 3 });
    for (const [x, y, r] of [[38, 30, 6], [52, 24, 7], [64, 32, 5]] as [number, number, number][]) s.ellipse(x, y, r, r, { fill: '#E6F1F6' });
  },
  // 想被摸：一只手
  pet: (s) => {
    s.ellipse(50, 46, 15, 13, { fill: '#F3D3B8' });
    for (const [x, y] of [[38, 30], [46, 26], [55, 26], [63, 31]] as [number, number][]) s.ellipse(x, y, 4.5, 8, { fill: '#F3D3B8' });
    s.ellipse(34, 50, 8, 4, { fill: '#F3D3B8' });
  },
  // 想有人陪它玩（家里没有玩具）：一根逗猫棒和羽毛
  play: (s) => {
    s.line(30, 64, 62, 24, P.woodDark, 3, 1);
    s.ellipse(66, 26, 6, 11, { fill: P.coral }); s.ellipse(60, 30, 4, 9, { fill: P.mustard });
  },
  // 想玩球
  ball: (s) => {
    s.ellipse(50, 44, 17, 17, { fill: P.coral }); s.line(34, 40, 66, 48, P.white, 2.5, 0.9); s.line(40, 30, 58, 60, P.white, 2.5, 0.9);
  },
  // 想玩自动逗猫球
  autoball: (s) => {
    s.rect(32, 46, 36, 14, { fill: P.mist, r: 4 }); s.ellipse(50, 40, 12, 12, { fill: P.mustard });
    s.line(50, 28, 60, 18, P.woodDark, 2, 1); s.ellipse(62, 16, 4, 6, { fill: P.coral });
  },
  // 想抓猫抓板：一根缠着麻绳的柱子
  scratcher: (s) => {
    s.rect(28, 58, 44, 6, { fill: P.woodDark, r: 2 }); s.rect(42, 22, 16, 38, { fill: '#D9C29A', r: 3 });
    for (let y = 26; y < 58; y += 6) s.line(42, y, 58, y + 2, P.woodDark, 1.4, 0.7);
  },
};

/** 画一个「想要」气泡：100×100（加上尖角），图标在圆里 */
export function drawWant(kind: WantKind): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(100, 100, 2);
  const s = new Sketch(ctx, 300 + kind.length * 13);
  s.poly([[42, 80], [58, 80], [50, 97]], { fill: P.white });
  s.ellipse(50, 46, 40, 38, { fill: P.white });
  ICON[kind](s);
  return cv;
}
