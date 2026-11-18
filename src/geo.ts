// 房间的几何：地板线在哪、每个区域从哪到哪。
// 没有背景长图时用默认值（每个区域 432 宽，地板从 560 开始）。
// 有背景长图时，这些值跟着图片走：图片按高度铺满房间，
// 地板线和区域分界线用 assets.config.ts 里 strip.floor / strip.lines（在「调整背景」里拖出来的）。
import { ASSETS } from './assets.config';
import { CONFIG, ZONES } from './config';

export const BASE_ZW = CONFIG.room.zoneWidth, ROOM_H = CONFIG.room.height, BASE_FY = CONFIG.room.floorY;

/** 现在用的是整张图（room.full）还是长图（room.strip）：两者各有自己的地板线和分界线 */
export const bg = { full: false };
export const bgCfg = (): { coverZones: number; floor: number; lines: number[] } => (bg.full ? ASSETS.room.full : ASSETS.room.strip);

export const geo = {
  floorY: BASE_FY,
  /** 每个区域左边的位置，最后一个数是整个房间的宽度 */
  bounds: [] as number[],
  /** 背景长图摆在哪（没有长图时是 null） */
  strip: null as null | { x: number; w: number },
};

export function recompute(strip?: { width: number; height: number } | null) {
  const n = ZONES.length; const cfg = bgCfg(); const cover = Math.min(n, cfg.coverZones);
  const b = [0];
  if (strip) {
    const W = strip.width * (ROOM_H / strip.height); const L = cfg.lines;
    for (let i = 1; i <= cover; i++) b.push((L[i] - L[0]) * W);
    geo.floorY = cfg.floor * ROOM_H; geo.strip = { x: -L[0] * W, w: W };
  } else {
    for (let i = 1; i <= cover; i++) b.push(i * BASE_ZW);
    geo.floorY = BASE_FY; geo.strip = null;
  }
  for (let i = cover + 1; i <= n; i++) b.push(b[i - 1] + BASE_ZW);
  geo.bounds = b;
}
recompute(null);
