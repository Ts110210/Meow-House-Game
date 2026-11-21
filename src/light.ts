// 跟着真实时间变化的光影：现在几点 → 整体的光色、太阳在哪、影子多长、窗户光什么颜色。
// 纯函数（不碰画面），有测试；怎么画在 scene.ts 的 drawLight()。
import { CONFIG } from './config';
import type { Weather } from './types';

const L = CONFIG.light;

const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (v: number[]) => '#' + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** 两个颜色之间取一个（t = 0 是 a，1 是 b） */
export const mixColor = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return toHex(A.map((x, i) => x + (B[i] - x) * t)); };
/** 两个颜色相乘（正片叠底叠两层的效果） */
export const mulColor = (a: string, b: string) => { const A = rgb(a), B = rgb(b); return toHex(A.map((x, i) => (x * B[i]) / 255)); };

export interface Light {
  /** 几点（0–24） */
  hour: number;
  /** 时段的名字：清晨、上午、中午、下午、黄昏、夜晚 */
  phase: string;
  /** 屋里、室外整个画面乘上的颜色 */
  indoor: string; outdoor: string;
  /** 太阳的强弱（0–1）：0 = 没有室外影子和窗户光（夜里、下雨） */
  sun: number;
  /** 太阳从哪边照过来：-1 = 在左边（早上，影子往右拉），0 = 头顶，1 = 在右边（傍晚，影子往左拉） */
  side: number;
  /** 太阳有多高（0 = 贴着地平线，1 = 正午） */
  high: number;
  /** 窗户光的颜色 */
  win: string;
  /** 灯的光圈有多亮（0–1） */
  glow: number;
}

/** 几点 → 时段的名字 */
export function phaseName(hour: number): string {
  const h = ((hour % 24) + 24) % 24; let name = L.phases[L.phases.length - 1][1];
  for (const [from, n] of L.phases) if (h >= from) name = n;
  return name;
}

/** 几点、什么天气 → 这一刻的光。关键时刻之间平滑过渡（先慢后快再慢） */
export function lightAt(hour: number, weather: Weather): Light {
  const h = ((hour % 24) + 24) % 24; const K = L.keys;
  let i = 0; while (i < K.length - 2 && h >= K[i + 1].h) i++;
  const a = K[i], b = K[i + 1]; const t0 = b.h > a.h ? (h - a.h) / (b.h - a.h) : 0; const t = t0 * t0 * (3 - 2 * t0);
  const num = (x: number, y: number) => x + (y - x) * t;
  let indoor = mixColor(a.indoor, b.indoor, t), outdoor = mixColor(a.outdoor, b.outdoor, t), sun = num(a.sun, b.sun);
  // 太阳的位置：日出在左边、正午在头顶、日落在右边
  const day = Math.max(0, Math.min(1, (h - L.sunrise) / (L.sunset - L.sunrise)));
  const side = day * 2 - 1, high = Math.sin(Math.PI * day);
  if (weather === 'rain') { indoor = mulColor(indoor, L.rain); outdoor = mulColor(outdoor, L.rain); sun = 0; }
  return { hour: h, phase: phaseName(h), indoor, outdoor, sun, side, high, win: mixColor(a.win, b.win, t), glow: num(a.glow, b.glow) };
}

/** 室外影子的形状：按物品高度的比例，影子顶端往旁边斜出去多少（正数 = 往右）、压扁成多高。
 *  早上太阳在左，影子往右拉长；中午短；傍晚往左拉长 */
export function sunShadow(l: Light): { dx: number; dy: number } {
  const S = L.shadow; const low = 1 - l.high;
  return { dx: -l.side * S.lean * low, dy: S.short + (S.long - S.short) * low };
}
