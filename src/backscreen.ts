// 背屏画面（976×596）。两个地方用：
//   1. 游戏里的「背屏预览」面板；
//   2. 真正显示到小米背屏上的原型：页面地址带 #back-screen 时，整个页面只画这一块。
// 原型怎么用、有什么限制，见 docs/背屏调研.md。
import { CONFIG, DAY, FUR_COLORS, type ActionName } from './config';
import { AssetStore } from './assets';
import { drawDefaultSheet } from './art/defaultPet';
import { renderPostcard } from './art/postcard';
import { blobs, kv } from './platform/storage';
import { loadSave } from './save';
import * as sim from './sim';
import { drawFrame, frameIndex, loadImage, normalizeSheet, previewSet, type SpriteSet } from './sprites';
import type { GameState, Pet } from './types';
import { BACK_MODES, backMode, type BackModeView } from './backscreenModes';

const STAT_COLOR = { food: '#d9a94a', mood: '#e08e79', clean: '#9fb4c7' };
const STAT_NAME = { food: '饱食', mood: '心情', clean: '干净' };

function dur(ms: number): string {
  ms = Math.max(0, ms); const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return h > 0 ? `${h} 小时 ${m} 分` : `${Math.max(1, m)} 分钟`;
}

export interface BackView { state: GameState; pet: Pet | undefined; set: SpriteSet | undefined; happy: boolean; card: { image: HTMLCanvasElement; text: string } | null; hideCameraHint?: boolean;
  /** 画哪一种画面（backscreenModes.ts 里的 id）；不写 = 宠物。小剧场和时钟要用到 setOf、doing */
  mode?: string; setOf?: BackModeView['setOf']; doing?: BackModeView['doing'] }

export function drawBackScreen(ctx: CanvasRenderingContext2D, t: number, v: BackView) {
  const B = CONFIG.backScreen; const s = v.state; const cam = B.cameraArea;
  ctx.fillStyle = '#f3e9da'; ctx.fillRect(0, 0, B.width, B.height);
  // 摄像头占掉的区域：预览里画成灰色；真机上这里本来就被镜头挡住，留空
  if (!v.hideCameraHint) {
    ctx.fillStyle = '#d9d4cb'; ctx.fillRect(cam.x, cam.y, cam.w, cam.h);
    ctx.fillStyle = '#b9b3a8'; for (const cy of [cam.h * 0.3, cam.h * 0.7]) { ctx.beginPath(); ctx.arc(cam.x + cam.w / 2, cy, 84, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#8c857a'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('摄像头区域', cam.x + cam.w / 2, cam.h / 2 + 8);
  } else { ctx.fillStyle = '#000'; ctx.fillRect(cam.x, cam.y, cam.w, cam.h); }
  const x0 = cam.x + cam.w, w = B.width - x0; const cx = x0 + w / 2;
  ctx.textAlign = 'center';
  if (v.card) {
    const src = v.card.image; const cw = w - 60, ch = cw * (src.height / src.width);
    ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 20, 60, cw + 20, ch + 70);
    ctx.drawImage(src, x0 + 30, 70, cw, ch);
    ctx.fillStyle = '#5b4634'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(v.card.text, cx, 70 + ch + 44);
    return;
  }
  // 别的画面（小剧场、时钟……）：交给 backscreenModes.ts 里对应的那一种去画
  if (v.mode && v.mode !== 'pet') { backMode(v.mode).draw(ctx, t, { state: s, pet: v.pet, setOf: v.setOf ?? (() => v.set), doing: v.doing, area: { x: x0, w, h: B.height } }); ctx.textAlign = 'center'; return; }
  const p = v.pet;
  if (!p) { ctx.fillStyle = '#8f7b66'; ctx.font = '32px sans-serif'; ctx.fillText('家里还没有宠物', cx, B.height / 2); return; }
  ctx.fillStyle = '#c99a6b'; ctx.fillRect(x0, 470, w, B.height - 470);
  ctx.fillStyle = '#5b4634'; ctx.font = 'bold 38px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(p.name, x0 + 36, 70);
  ctx.textAlign = 'center';
  if (p.lostSince !== null) {
    ctx.fillStyle = '#8f7b66'; ctx.font = 'bold 50px sans-serif'; ctx.fillText('离家出走了', cx, 280);
    ctx.font = '28px sans-serif'; ctx.fillText(p.searchUntil !== null ? '狸花猫正在找它' : '去门口找狸花猫帮忙', cx, 336);
    return;
  }
  if (p.tripId) {
    const trip = s.trips.find((x) => x.id === p.tripId);
    ctx.fillStyle = '#8f7b66'; ctx.font = 'bold 54px sans-serif'; ctx.fillText('出门中', cx, 280);
    ctx.font = '30px sans-serif'; if (trip) ctx.fillText(`还有 ${dur(trip.returnAt - s.clock)} 回家`, cx, 340);
  } else if (v.set) {
    const a: ActionName = v.happy ? 'happy' : sim.isWeak(p) ? 'sleep' : 'idle';
    const size = 400 * CONFIG.growth.stageScale[sim.stageOf(p)];
    drawFrame(ctx, v.set, a, frameIndex(a, t), cx - size / 2 - 60, 510 - size * 0.9, size);
  }
  // 三个状态小图标
  (['food', 'mood', 'clean'] as const).forEach((k, i) => {
    const bx = B.width - 170, by = 130 + i * 110;
    ctx.fillStyle = '#eadfca'; ctx.beginPath(); ctx.arc(bx + 60, by, 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = STAT_COLOR[k]; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(bx + 60, by, 40, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p[k]) / 100); ctx.stroke();
    ctx.fillStyle = '#5b4634'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(STAT_NAME[k], bx + 60, by + 9);
  });
}

// ---------- 背屏上点宠物：记下来，等主画面那边写进存档 ----------

const TAPS = 'pet-game-back-taps';
export function pushBackTap(petId: string) {
  let list: string[] = []; try { list = JSON.parse(kv.get(TAPS) ?? '[]'); } catch { /* ignore */ }
  list.push(petId); kv.set(TAPS, JSON.stringify(list.slice(-20)));
}
export function takeBackTaps(): string[] {
  const raw = kv.get(TAPS); if (!raw || raw === '[]') return [];
  kv.remove(TAPS);
  try { const list = JSON.parse(raw); return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

// ---------- 原型：整个页面只当背屏画面 ----------

/** 只读地看存档：每秒重新读一次，自己把离上次保存到现在的时间补算出来再画。不往存档里写任何东西。 */
export async function bootBackScreen() {
  const B = CONFIG.backScreen;
  document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  document.getElementById('ui')?.remove();
  const stage = document.getElementById('stage')!; stage.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000';
  const cv = document.createElement('canvas'); cv.width = B.width; cv.height = B.height; cv.style.cssText = 'width:100vw;height:100vh;object-fit:contain;touch-action:manipulation';
  stage.replaceChildren(cv);
  const ctx = cv.getContext('2d')!;
  const assets = new AssetStore(); await assets.loadAll();
  const sets = new Map<string, SpriteSet>();
  const setFor = async (spriteId: string) => {
    if (sets.has(spriteId)) return;
    let sheet: HTMLCanvasElement | null = null;
    if (spriteId.startsWith('custom:')) {
      try { const raw = await blobs.get(spriteId); if (raw) { const img = await loadImage((JSON.parse(raw) as { sheet: string }).sheet); sheet = document.createElement('canvas'); sheet.width = img.width; sheet.height = img.height; sheet.getContext('2d')!.drawImage(img, 0, 0); } } catch { sheet = null; }
    } else {
      const color = spriteId.slice(8); const pic = assets.get(`pet.${color}`); const r = pic ? normalizeSheet(pic, false) : null;
      sheet = r && r.ok && r.sheet ? r.sheet : drawDefaultSheet(FUR_COLORS[color] ? color : 'orange');
    }
    sets.set(spriteId, previewSet(sheet ?? drawDefaultSheet('orange')));
  };

  let state: GameState | null = null; let petIndex = 0; let happyUntil = 0;
  // 画面的种类记在本机；点右上角换下一种
  const MODE = 'pet-game-back-mode'; let mode = backMode(kv.get(MODE) ?? 'pet').id;
  let lastCardId = ''; let card: { image: HTMLCanvasElement; text: string } | null = null; let cardUntil = 0; let first = true;
  const poll = async () => {
    const loaded = loadSave(); if (!loaded) { state = null; return; }
    const s = loaded.state;
    sim.advance(s, Math.min(60 * DAY, Math.max(0, Date.now() - s.lastReal))); // 只在这份副本上补算
    for (const p of s.pets) await setFor(p.spriteId);
    // 特别时刻：有新的明信片（宠物刚回家）
    const newest = s.postcards[s.postcards.length - 1];
    if (newest && newest.id !== lastCardId) {
      if (!first) {
        const names = newest.petIds.map((id) => s.pets.find((p) => p.id === id)?.name ?? '').join(' 和 ');
        card = { image: renderPostcard(newest, newest.petIds.map((id) => sets.get(s.pets.find((p) => p.id === id)?.spriteId ?? '')), assets.get(`postcard.${newest.destId}`)), text: `${names}回来了` };
        cardUntil = performance.now() + 12000;
      }
      lastCardId = newest.id;
    }
    first = false; state = s;
  };
  await poll(); setInterval(() => void poll(), 1000);

  const alive = () => (state ? sim.alivePets(state) : []);
  cv.addEventListener('click', (e) => {
    if (card && performance.now() < cardUntil) { cardUntil = 0; return; }
    const list = alive(); if (!list.length) return;
    const r = cv.getBoundingClientRect(); const y = ((e.clientY - r.top) / r.height) * B.height; const x = ((e.clientX - r.left) / r.width) * B.width;
    if (y < 110 && x > B.width - 200) { mode = BACK_MODES[(BACK_MODES.findIndex((m) => m.id === mode) + 1) % BACK_MODES.length].id; kv.set(MODE, mode); return; } // 点右上角：换一种画面
    if (mode !== 'pet') return;
    if (y < 110) { petIndex = (petIndex + 1) % list.length; return; } // 点名字那一行：换一只
    const p = list[petIndex % list.length]; if (p.tripId) return;
    pushBackTap(p.id); happyUntil = performance.now() + 1600;
  });
  const loop = (t: number) => {
    if (state) {
      const list = alive(); const pet = list.length ? list[petIndex % list.length] : undefined;
      drawBackScreen(ctx, t, { state, pet, set: pet ? sets.get(pet.spriteId) : undefined, happy: performance.now() < happyUntil, card: card && performance.now() < cardUntil ? card : null, hideCameraHint: true, mode, setOf: (p) => sets.get(p.spriteId) });
    } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, B.width, B.height); ctx.fillStyle = '#fff'; ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('先在主屏打开一次游戏', B.cameraArea.w + (B.width - B.cameraArea.w) / 2, B.height / 2); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
