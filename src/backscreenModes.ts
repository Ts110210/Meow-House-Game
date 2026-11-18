// 背屏的几种画面。现在都是「预览」：用来确定背屏上放什么、怎么排，画面和文案之后还会改。
// 真正接到小米背屏上的方式见 docs/背屏调研.md；接入时这里的画法可以原样复用（都是往一块 976×596 的画布上画）。
//
// 要加一种新的背屏画面：在下面的 BACK_MODES 里加一项（名字 + 一个 draw 函数），预览面板里会自动多出一个按钮。
// draw 拿到的 view 里有整份存档、现在轮到哪只宠物、每只宠物的精灵图，画在摄像头右边的那一块（x 从 area.x 开始，宽 area.w）。
import { CONFIG, NEIGHBORS, SEASON_NAMES, TIME_NAMES, type ActionName } from './config';
import * as sim from './sim';
import { drawFrame, frameIndex, type SpriteSet } from './sprites';
import type { GameState, Pet } from './types';

export interface BackModeView {
  state: GameState;
  /** 宠物模式下现在看的是哪只 */
  pet: Pet | undefined;
  /** 每只宠物的精灵图 */
  setOf: (p: Pet) => SpriteSet | undefined;
  /** 主画面里这只宠物此刻真的在做什么（只有游戏里的预览面板给得出；背屏单独运行时没有，就按状态猜一个） */
  doing?: (p: Pet) => { action: ActionName; text: string } | null;
  /** 可以画的区域（已经避开摄像头） */
  area: { x: number; w: number; h: number };
}
export interface BackMode { id: string; name: string; desc: string; draw(ctx: CanvasRenderingContext2D, t: number, v: BackModeView): void }

const INK = '#5b4634', SOFT = '#8f7b66', PAPER = '#f3e9da', FLOOR = '#c99a6b';

/** 背屏单独运行时看不到主画面，只能按存档里的状态猜这只宠物在做什么。每 20 秒换一个说法，同一段时间里不变 */
export function guessDoing(s: GameState, p: Pet): { action: ActionName; text: string } {
  if (sim.isLost(p)) return { action: 'idle', text: '离家出走了' };
  if (p.tripId) return { action: 'walk', text: '出门旅行中' };
  if (p.outing) return { action: 'walk', text: `去${NEIGHBORS[p.outing.neighborId]?.name ?? '邻居'}家玩了` };
  if (sim.isWeak(p)) return { action: 'sleep', text: '没力气，躺着' };
  const low = CONFIG.stats.lowThreshold;
  if (p.food < low) return { action: 'beg', text: '蹲在饭碗边等开饭' };
  if (sim.dayTime(s) === 'night') return { action: 'sleep', text: '睡着了' };
  if (p.clean < low) return { action: 'lick', text: '在自己舔毛' };
  const rain = sim.weather(s) === 'rain';
  const list: { action: ActionName; text: string }[] = [
    { action: 'sit', text: rain ? '趴在窗台上看雨' : '在窗台上看外面' }, { action: 'sleep', text: '在沙发上打盹' }, { action: 'lick', text: '在舔毛' }, { action: 'idle', text: '在客厅里转悠' },
    ...(s.owned.scratcher ? [{ action: 'scratch' as ActionName, text: '在抓猫抓板' }] : []),
    ...(s.owned.ball || s.owned.autoball ? [{ action: 'play' as ActionName, text: '在追球' }] : []),
    ...(s.owned.cattree ? [{ action: 'sit' as ActionName, text: '蹲在猫爬架上' }] : []),
    ...(s.owned.box ? [{ action: 'idle' as ActionName, text: '钻进了纸箱' }] : []),
    ...(!rain && s.pond.some((x) => x != null) ? [{ action: 'fish' as ActionName, text: '在鱼塘边捞鱼' }] : []),
    ...(s.hood.now ? [{ action: 'play' as ActionName, text: `在和${NEIGHBORS[s.hood.now.id]?.name ?? '邻居'}玩` }] : []),
  ];
  let h = 0; for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[(h + Math.floor(s.clock / 20_000)) % list.length];
}

const weatherLine = (s: GameState) => { const se = sim.season(s), rain = sim.weather(s) === 'rain'; return `${SEASON_NAMES[se]}天 · ${TIME_NAMES[sim.dayTime(s)]} · ${rain ? (se === 'winter' ? '下雪 ❄️' : '下雨 🌧️') : sim.dayTime(s) === 'night' ? '晴 🌙' : '晴 ☀️'}`; };

export const BACK_MODES: BackMode[] = [
  // 宠物：一只宠物和它的三个状态。这一种的画法在 backscreen.ts 里（最早就有的那一版）
  { id: 'pet', name: '宠物', desc: '一只宠物和它的状态，点一下摸摸它', draw() { /* 见 backscreen.ts 的 drawBackScreen */ } },

  // 小剧场：每隔几秒换一只，告诉你它现在在家里做什么
  { id: 'theater', name: '小剧场', desc: '轮流播放每只宠物现在在做什么', draw(ctx, t, v) {
    const s = v.state, a = v.area; const cast = sim.alivePets(s); const cx = a.x + a.w / 2;
    ctx.fillStyle = PAPER; ctx.fillRect(a.x, 0, a.w, a.h); ctx.fillStyle = FLOOR; ctx.fillRect(a.x, 470, a.w, a.h - 470);
    ctx.textAlign = 'center';
    if (!cast.length) { ctx.fillStyle = SOFT; ctx.font = '32px sans-serif'; ctx.fillText('家里还没有宠物', cx, a.h / 2); return; }
    const SHOW = 6000; const i = Math.floor(t / SHOW) % cast.length, p = cast[i]; const into = (t % SHOW) / SHOW;
    const d = v.doing?.(p) ?? guessDoing(s, p); const set = v.setOf(p);
    // 幕布一样的淡入淡出
    ctx.globalAlpha = Math.min(1, into * 8, (1 - into) * 8);
    ctx.fillStyle = SOFT; ctx.font = '26px sans-serif'; ctx.fillText('现在，家里……', cx, 64);
    const away = !!p.tripId || !!p.outing || sim.isLost(p);
    if (set && !away) { const size = 380 * CONFIG.growth.backScale[sim.stageOf(p)]; drawFrame(ctx, set, d.action, frameIndex(d.action, t), cx - size / 2, 500 - size * 0.9, size); }
    else { ctx.fillStyle = SOFT; ctx.font = 'bold 60px sans-serif'; ctx.fillText(sim.isLost(p) ? '？' : '🧳', cx, 330); }
    ctx.fillStyle = INK; ctx.font = 'bold 40px sans-serif'; ctx.fillText(`${p.name}${d.text}`, cx, 548);
    ctx.globalAlpha = 1;
    // 下面一排小圆点：现在播到第几只
    cast.forEach((_, k) => { ctx.fillStyle = k === i ? INK : '#d9c9b0'; ctx.beginPath(); ctx.arc(cx + (k - (cast.length - 1) / 2) * 22, 578, 5, 0, Math.PI * 2); ctx.fill(); });
  } },

  // 时钟：大大的时间，加上游戏里的季节和天气，旁边蹲着一只宠物。当成一块活的桌面摆件
  { id: 'clock', name: '时钟', desc: '时间、季节和天气，旁边蹲着一只宠物', draw(ctx, t, v) {
    const s = v.state, a = v.area; const night = sim.dayTime(s) === 'night', dusk = sim.dayTime(s) === 'dusk';
    ctx.fillStyle = night ? '#2f3a63' : dusk ? '#f2cfa9' : PAPER; ctx.fillRect(a.x, 0, a.w, a.h);
    ctx.fillStyle = night ? '#4a3a30' : FLOOR; ctx.fillRect(a.x, 500, a.w, a.h - 500);
    const d = new Date(s.clock); const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const fg = night ? '#f6ecc6' : INK, soft = night ? '#b9c0dc' : SOFT;
    ctx.textAlign = 'left'; ctx.fillStyle = fg; ctx.font = 'bold 150px sans-serif'; ctx.fillText(hh, a.x + 40, 220);
    if (Math.floor(t / 1000) % 2 === 0) ctx.fillText(':', a.x + 212, 208);
    ctx.fillText(mm, a.x + 258, 220);
    ctx.fillStyle = soft; ctx.font = '30px sans-serif'; ctx.fillText(`${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${'日一二三四五六'[d.getDay()]}`, a.x + 46, 276);
    ctx.fillStyle = fg; ctx.font = 'bold 32px sans-serif'; ctx.fillText(weatherLine(s), a.x + 46, 330);
    const info = sim.seasonInfo(s); ctx.fillStyle = soft; ctx.font = '26px sans-serif'; ctx.fillText(`第 ${info.day} 天，还有 ${info.daysLeft} 天入${SEASON_NAMES[info.next]}`, a.x + 46, 372);
    // 右下角的宠物：白天端坐，夜里睡觉，饿了站起来讨吃的
    const p = v.pet && !v.pet.tripId && !v.pet.outing && !sim.isLost(v.pet) ? v.pet : sim.homePets(s)[0]; const set = p ? v.setOf(p) : undefined;
    if (p && set) {
      const act: ActionName = sim.isWeak(p) || night ? 'sleep' : p.food < CONFIG.stats.lowThreshold ? 'beg' : 'sit';
      const size = 300 * CONFIG.growth.backScale[sim.stageOf(p)]; drawFrame(ctx, set, act, frameIndex(act, t), a.x + a.w - size - 16, 540 - size * 0.9, size, true);
      ctx.textAlign = 'right'; ctx.fillStyle = night ? '#f6ecc6' : '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(p.name, a.x + a.w - 30, 578);
    }
  } },
];
export const backMode = (id: string) => BACK_MODES.find((m) => m.id === id) ?? BACK_MODES[0];
