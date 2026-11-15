// 物品的位置和大小、背景的对齐、宠物大小：默认值写在 assets.config.ts 里。
// 在开发者面板里拖出来的结果存在这个浏览器里，并且可以导出成配置文字。
import { ASSETS } from './assets.config';
import { kv } from './platform/storage';

const KEY = 'pet-game-layout-v2';
type Box = { x: number; y: number; height: number };
interface Saved { objects?: Record<string, Box>; bg?: { floor: number; lines: number[] }; petScale?: number }

const DEF_OBJ: Record<string, Box> = {};
for (const [k, d] of Object.entries(ASSETS.objects)) DEF_OBJ[k] = { x: d.x, y: d.y, height: d.height };
const DEF_BG = { floor: ASSETS.room.strip.floor, lines: [...ASSETS.room.strip.lines] };
const DEF_PET = ASSETS.petScale;

export function loadLayout() {
  try {
    const saved = JSON.parse(kv.get(KEY) ?? '{}') as Saved;
    for (const [k, b] of Object.entries(saved.objects ?? {})) { const d = ASSETS.objects[k]; if (d && isFinite(b.x) && isFinite(b.y) && b.height > 0) { d.x = b.x; d.y = b.y; d.height = b.height; } }
    const bg = saved.bg;
    if (bg && bg.floor > 0.2 && bg.floor < 1 && Array.isArray(bg.lines) && bg.lines.length === DEF_BG.lines.length && bg.lines.every((v, i) => isFinite(v) && (i === 0 || v > bg.lines[i - 1]))) {
      ASSETS.room.strip.floor = bg.floor; ASSETS.room.strip.lines = [...bg.lines];
    }
    if (saved.petScale && saved.petScale > 0.2 && saved.petScale < 5) ASSETS.petScale = saved.petScale;
  } catch { /* 存的东西读不出来就用默认值 */ }
}

export const isChanged = (k: string) => { const d = ASSETS.objects[k], o = DEF_OBJ[k]; return d.x !== o.x || d.y !== o.y || d.height !== o.height; };
export const bgChanged = () => ASSETS.room.strip.floor !== DEF_BG.floor || ASSETS.room.strip.lines.some((v, i) => v !== DEF_BG.lines[i]) || ASSETS.petScale !== DEF_PET;

export function saveLayout() {
  const out: Saved = { objects: {} };
  for (const [k, d] of Object.entries(ASSETS.objects)) if (isChanged(k)) out.objects![k] = { x: d.x, y: d.y, height: d.height };
  if (bgChanged()) { out.bg = { floor: ASSETS.room.strip.floor, lines: [...ASSETS.room.strip.lines] }; out.petScale = ASSETS.petScale; }
  kv.set(KEY, JSON.stringify(out));
}

export function resetObjects() { for (const [k, d] of Object.entries(ASSETS.objects)) Object.assign(d, DEF_OBJ[k]); saveLayout(); }
export function resetBackground() { ASSETS.room.strip.floor = DEF_BG.floor; ASSETS.room.strip.lines = [...DEF_BG.lines]; ASSETS.petScale = DEF_PET; saveLayout(); }

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** 导出成可以直接发给 Claude、或对照着改 assets.config.ts 的文字 */
export function exportLayout(): string {
  const s = ASSETS.room.strip;
  const objs = Object.entries(ASSETS.objects).map(([k, d]) => `${k}: { x: ${d.x}, y: ${d.y}, height: ${d.height} },  // ${d.label}（${d.zone}）${isChanged(k) ? ' ← 已调整' : ''}`);
  return [
    '// ===== 背景对齐（assets.config.ts → room.strip 和 petScale）' + (bgChanged() ? ' ← 已调整' : ''),
    '// floor = 地板线在图片高度的位置，lines = 5 个区域的 6 条分界线在图片宽度的位置（都是 0–1）',
    `floor: ${r4(s.floor)},`,
    `lines: [${s.lines.map(r4).join(', ')}],`,
    `petScale: ${r4(ASSETS.petScale)},`,
    '',
    '// ===== 物品的点击区域（assets.config.ts → objects）',
    '// x = 中心点离所在区域左边的距离（按 432 宽的区域算），y = 底边位置（按地板线在 560 算），height = 显示高度',
    ...objs,
  ].join('\n');
}
