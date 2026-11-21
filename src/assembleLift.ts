// 精灵图拼装里「保留跳跃高度」的算法：纯函数，单独放一个文件，测试时不用带上 PixiJS。
import { SPRITE } from './config';

/**
 * 每一帧要往上抬多少（格子里的像素）。keep = false 时都是 0（脚底都对齐到地面）。
 * keep = true 时按原图：最低的一帧当地面，别的帧抬高「它比最低那帧高出的距离 × s」；
 * 抬了之后顶到格子外面的话，所有帧的抬高按同一个比例压低（返回的 fit 小于 1）。
 */
export function rowLift(heights: number[], bottoms: number[], s: number, keep: boolean, cell = SPRITE.cell, foot = SPRITE.footLine): { dy: number[]; fit: number } {
  if (!keep || !bottoms.length) return { dy: heights.map(() => 0), fit: 1 };
  const ground = Math.max(...bottoms); const raw = bottoms.map((b) => (ground - b) * s);
  let fit = 1;
  heights.forEach((hh, i) => { const room = cell * foot - hh * s; if (raw[i] > room && raw[i] > 0) fit = Math.min(fit, Math.max(0, room) / raw[i]); });
  return { dy: raw.map((r) => r * fit), fit };
}
