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
  /** 天有多亮（0–1，不管下不下雨；屋里压暗多少按它算，下雨天白天屋里也不会像夜里一样暗） */
  day: number;
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
  const bright = sun; let glow = num(a.glow, b.glow);
  // 下雨：室外偏冷偏灰；屋里只轻轻偏灰，灯白天也开着
  if (weather === 'rain') { indoor = mulColor(indoor, L.rainIndoor); outdoor = mulColor(outdoor, L.rain); sun = 0; glow = Math.max(glow, L.rainLamps); }
  return { hour: h, phase: phaseName(h), indoor, outdoor, sun, day: bright, side, high, win: mixColor(a.win, b.win, t), glow };
}

/** 室外影子的形状：按物品高度的比例，影子顶端往旁边斜出去多少（正数 = 往右）、压扁成多高。
 *  早上太阳在左，影子往右拉长；中午短；傍晚往左拉长 */
export function sunShadow(l: Light): { dx: number; dy: number } {
  const S = L.shadow; const low = 1 - l.high;
  return { dx: -l.side * S.lean * low, dy: S.short + (S.long - S.short) * low };
}

// ---------- 光影效果「超高」：光照图和每个光源的影子 ----------

/** 一个光源：x、y = 世界坐标；zone = 在哪个区域（-1 = 屋顶那一层）；power = 最亮处加多少（0–1）；radius = 照多远；color = 光的颜色 */
export interface LightSource { x: number; y: number; zone: number; power: number; radius: number; color: string; /** false = 只照亮、不投影（鱼塘的反光、喂食机的指示灯） */ cast?: boolean }
/** 挡光的家具：世界坐标的一个框，在哪个区域 */
export interface Occluder { x0: number; y0: number; x1: number; y1: number; zone: number }

/** 从光源到这一点的线有没有穿过这个框（这一点在框里面不算：家具自己朝光的那一面是亮的） */
export function blocked(lx: number, ly: number, px: number, py: number, o: Occluder): boolean {
  if (px >= o.x0 && px <= o.x1 && py >= o.y0 && py <= o.y1) return false;
  if (lx >= o.x0 && lx <= o.x1 && ly >= o.y0 && ly <= o.y1) return false;
  let t0 = 0, t1 = 1; const dx = px - lx, dy = py - ly;
  for (const [p, q] of [[-dx, lx - o.x0], [dx, o.x1 - lx], [-dy, ly - o.y0], [dy, o.y1 - ly]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

/** 一件家具从哪边被照亮：所有光源按亮度加起来的方向（单位向量，指向光）、总的亮度（0–1）、最亮那个光源的颜色。没有光返回 null */
export function lightDir(sources: LightSource[], x: number, y: number, zone: number, outdoor: (z: number) => boolean): { dx: number; dy: number; power: number; color: string } | null {
  let vx = 0, vy = 0, sum = 0, best = 0, color = '#FFFFFF'; const reach = L.ultra.shadow.reach;
  for (const s of sources) {
    if (s.zone !== zone && !(outdoor(s.zone) && outdoor(zone))) continue;
    const d = Math.hypot(s.x - x, s.y - y); const w = s.power * Math.max(0, 1 - d / (s.radius * reach)); if (w <= 0) continue;
    vx += ((s.x - x) / Math.max(1, d)) * w; vy += ((s.y - y) / Math.max(1, d)) * w; sum += w; if (w > best) { best = w; color = s.color; }
  }
  const len = Math.hypot(vx, vy); if (sum < 0.05 || len < 1e-6) return null;
  return { dx: vx / len, dy: vy / len, power: Math.min(1, sum), color };
}

/** 离光源 d 远时还剩多少（平方衰减，边缘自然淡出） */
export const falloff = (d: number, r: number) => { const t = 1 - d / r; return t > 0 ? t * t : 0; };

/**
 * 光照图：每一格乘多少颜色（正片叠底用，RGBA，一格 4 个数）。
 * 格子从世界坐标 (x0, y0) 开始，每格 cell 大小，cols × rows 格。
 * zoneOf(x, y) = 这一点在哪个区域（-1 = 屋顶那一层）；outdoor(zone) = 是不是露天。
 * 屋里离光源远的地方按 dim 压暗；窗户和灯在自己的区域里按距离加亮，透过墙到隔壁只剩 leak。
 */
export function lightMap(l: Light, grid: { x0: number; y0: number; cell: number; cols: number; rows: number }, zoneOf: (x: number, y: number) => number, outdoor: (zone: number) => boolean, sources: LightSource[], occluders: Occluder[] = []): Uint8ClampedArray<ArrayBuffer> {
  const U = L.ultra; const out = new Uint8ClampedArray(new ArrayBuffer(grid.cols * grid.rows * 4));
  const ind = rgb(l.indoor).map((v) => v / 255), outd = rgb(l.outdoor).map((v) => v / 255);
  const dim = U.dimNight + (U.dimDay - U.dimNight) * Math.min(1, l.day);
  const src = sources.map((s) => ({ ...s, c: rgb(s.color).map((v) => v / 255) }));
  for (let j = 0; j < grid.rows; j++) {
    const y = grid.y0 + (j + 0.5) * grid.cell;
    for (let i = 0; i < grid.cols; i++) {
      const x = grid.x0 + (i + 0.5) * grid.cell; const z = zoneOf(x, y); const open = outdoor(z);
      const base = open ? outd : ind; const k = open ? 1 : dim;
      let r = base[0] * k, g = base[1] * k, b = base[2] * k;
      for (const s of src) {
        const d = Math.hypot(x - s.x, y - s.y); if (d >= s.radius) continue;
        let a = s.power * falloff(d, s.radius) * (s.zone === z || (open && outdoor(s.zone)) ? 1 : U.leak);
        // 被家具挡住：这一格在家具背着光的那一边，只剩一点光
        for (const o of occluders) if (o.zone === s.zone && blocked(s.x, s.y, x, y, o)) { a *= U.block; break; }
        r += s.c[0] * a; g += s.c[1] * a; b += s.c[2] * a;
      }
      const o = (j * grid.cols + i) * 4; out[o] = Math.min(1, r) * 255; out[o + 1] = Math.min(1, g) * 255; out[o + 2] = Math.min(1, b) * 255; out[o + 3] = 255;
    }
  }
  return out;
}

/** 一个光源给一件东西投的影子：东西的脚底在 (x, y)；返回影子顶端往旁边斜多少、压扁成多高（按东西的高度）、多浓（0 = 不投）。
 *  背离光源的方向投；灯在头顶时影子短，斜着照时长；离得越近越浓 */
export function lampShadow(s: LightSource, x: number, y: number): { dx: number; dy: number; alpha: number } {
  // 影子比光照图照得远一点、衰减慢一点（直线衰减），不然离灯两三百的家具就投不出影子了
  const S = L.ultra.shadow; const d = Math.hypot(x - s.x, y - s.y); const strength = s.power * Math.max(0, 1 - d / (s.radius * S.reach));
  if (strength < S.min) return { dx: 0, dy: 0, alpha: 0 };
  const lean = Math.max(-S.maxLean, Math.min(S.maxLean, (x - s.x) / Math.max(40, y - s.y)));
  return { dx: lean, dy: S.short + (S.long - S.short) * Math.min(1, Math.abs(lean) / S.maxLean), alpha: S.alpha * Math.min(1, strength * 1.6) };
}
