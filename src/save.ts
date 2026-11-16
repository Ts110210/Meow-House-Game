// 存档：版本号、旧存档自动迁移、损坏修复、备份、导出导入。
//
// 以后改存档结构时：
//   1. 把 SAVE_VERSION 加 1
//   2. 在 MIGRATIONS 里加一条「从上一个版本升到这个版本」的函数
//   3. 在 repair() 里给新字段补默认值
// 旧存档会在打开时自动一步一步升上来，升级前的原样会另存一份。
import { CONFIG, DESTS, FOODS, SOUVENIRS, TRAIT_IDS } from './config';
import { kv } from './platform/storage';
import type { GameState, Pet, Postcard, Trip } from './types';

export const SAVE_VERSION = 4;
const MAIN = 'pet-game-save-v1'; // 键名不跟版本走，这样旧存档一直读得到
const BACKUP = 'pet-game-save-backup';
const BEFORE_MIGRATION = 'pet-game-save-before-migration';
const BACKUP_EVERY = 60_000;

type Raw = Record<string, any>;

/** 每一条把存档从「键上的版本」升到下一个版本 */
const MIGRATIONS: Record<number, (s: Raw) => Raw> = {
  // v1 → v2：加了设置（提醒开关）和开始玩的时间
  1: (s) => { s.settings = { notify: true }; s.createdAt = s.pets?.[0]?.adoptedAt ?? s.clock ?? Date.now(); s.v = 2; return s; },
  // v2 → v3：开发者模式多了「后台也按倍速」的开关
  2: (s) => { s.dev = { ...(s.dev ?? {}), background: false }; s.v = 3; return s; },
  // v3 → v4：目的地换成东南亚的 10 个，纪念品换成每地两件不重复；多了离家出走、展示位、昼夜四季的开关
  3: (s) => {
    const DEST: Record<string, string> = { park: 'singapore', bridge: 'penang', seatown: 'langkawi', cabin: 'angkor', alley: 'cameron', lake: 'chiangmai', lighthouse: 'halong', onsen: 'bali' };
    const SOUV: Record<string, string> = { leaf: 'merlion', acorn: 'kaya', pebble: 'whitecoffee', paperboat: 'kuihmould', shell: 'shellchime', starfish: 'eaglefeather', mushroom: 'rubbing', pinecone: 'lotusincense',
      lantern: 'blacktea', teacup: 'strawberryjam', crystal: 'paperumbrella', edelweiss: 'krathong', bottle: 'nonla', compass: 'pearl', snowglobe: 'frangipani', woodbadge: 'mask' };
    for (const c of s.postcards ?? []) { if (DEST[c.destId]) c.destId = DEST[c.destId]; if (c.souvenir && SOUV[c.souvenir]) c.souvenir = SOUV[c.souvenir]; }
    for (const t of s.trips ?? []) if (DEST[t.destId]) t.destId = DEST[t.destId];
    const souv: Record<string, number> = {}; for (const k of Object.keys(s.souvenirs ?? {})) souv[SOUV[k] ?? k] = 1;
    s.souvenirs = souv;
    // 旧道具「围巾」（去雪地）没有了，换成小相机
    if (s.inv?.scarf) { s.inv.camera = (s.inv.camera ?? 0) + s.inv.scarf; delete s.inv.scarf; }
    for (const t of s.trips ?? []) if (t.tool === 'scarf') t.tool = 'camera';
    s.display = { souvenirs: [], postcards: [] };
    s.v = 4; return s;
  },
};

const num = (v: any, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: any, d: string) => (typeof v === 'string' ? v : d);
const obj = (v: any): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

/** 把存档里缺的、坏的字段补好，保证游戏拿到的一定是能用的数据 */
export function repair(raw: Raw, now = Date.now()): GameState {
  const clock = num(raw.clock, now);
  const pets: Pet[] = arr(raw.pets).filter((p) => p && typeof p.id === 'string').map((p) => ({
    id: p.id, name: str(p.name, '宠物').slice(0, 8) || '宠物', spriteId: str(p.spriteId, 'default:orange'),
    // 旧存档里的宠物没有性格：按编号算一个，每次读档都一样
    trait: TRAIT_IDS.includes(p.trait) ? p.trait : TRAIT_IDS[[...String(p.id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TRAIT_IDS.length], lastCare: num(p.lastCare, clock),
    age: num(p.age, 0, 0), food: num(p.food, 50, 0, 100), mood: num(p.mood, 50, 0, 100), clean: num(p.clean, 50, 0, 100),
    weakSince: typeof p.weakSince === 'number' && isFinite(p.weakSince) ? p.weakSince : null,
    dead: !!p.dead, ...(p.dead ? { diedAt: num(p.diedAt, clock) } : {}),
    lostSince: !p.dead && typeof p.lostSince === 'number' && isFinite(p.lostSince) ? p.lostSince : null,
    searchUntil: !p.dead && typeof p.lostSince === 'number' && typeof p.searchUntil === 'number' && isFinite(p.searchUntil) ? p.searchUntil : null,
    tripId: typeof p.tripId === 'string' ? p.tripId : null,
    repeats: obj(p.repeats), hungryNotified: !!p.hungryNotified, adoptedAt: num(p.adoptedAt, clock),
  }));
  const alive = (id: string) => pets.some((p) => p.id === id && !p.dead && p.lostSince === null);
  const trips: Trip[] = arr(raw.trips).filter((t) => t && typeof t.id === 'string').map((t) => ({
    id: t.id, petIds: arr(t.petIds).filter((id) => typeof id === 'string' && alive(id)),
    bento: FOODS.some((f) => f.id === t.bento) ? t.bento : FOODS[0].id, tool: typeof t.tool === 'string' ? t.tool : null,
    goods: arr(t.goods).filter((g) => typeof g === 'string'), startAt: num(t.startAt, clock), returnAt: num(t.returnAt, clock),
    destId: DESTS.some((d) => d.id === t.destId) ? t.destId : DESTS[0].id,
    // 旧存档里正在路上的那一趟没有「寄信」这回事：当作已经寄过
    letterAt: num(t.letterAt, num(t.returnAt, clock)), letterSent: typeof t.letterSent === 'boolean' ? t.letterSent : true,
  })).filter((t) => t.petIds.length > 0);
  // 宠物和行程要对得上：说在路上但找不到行程的，算在家
  for (const p of pets) if (p.dead || !trips.some((t) => t.id === p.tripId && t.petIds.includes(p.id))) p.tripId = null;
  for (const t of trips) for (const id of t.petIds) pets.find((p) => p.id === id)!.tripId = t.id;
  const postcards: Postcard[] = arr(raw.postcards).filter((c) => c && typeof c.id === 'string' && DESTS.some((d) => d.id === c.destId)).map((c) => ({
    id: c.id, destId: c.destId, petIds: arr(c.petIds).filter((x) => typeof x === 'string'), at: num(c.at, clock),
    souvenir: typeof c.souvenir === 'string' ? c.souvenir : null, tool: typeof c.tool === 'string' ? c.tool : null, ...(c.kind === 'letter' ? { kind: 'letter' as const } : {}), ...(typeof c.diary === 'string' ? { diary: c.diary } : {}), ...(typeof c.season === 'string' ? { season: c.season } : {}), ...(typeof c.time === 'string' ? { time: c.time } : {}), ...(typeof c.seed === 'number' ? { seed: c.seed } : {}), income: num(c.income, 0, 0), sold: arr(c.sold), unsold: arr(c.unsold),
  }));
  const souvenirs: Record<string, number> = {}; for (const [k, n] of Object.entries(obj(raw.souvenirs))) if (n && SOUVENIRS[k]) souvenirs[k] = 1;
  const display = obj(raw.display);
  const counts = (v: any) => { const out: Record<string, number> = {}; for (const [k, n] of Object.entries(obj(v))) if (typeof n === 'number' && n > 0) out[k] = Math.floor(n); return out; };
  const owned: Record<string, boolean> = {}; for (const [k, v] of Object.entries(obj(raw.owned))) if (v) owned[k] = true;
  const pond = arr(raw.pond).slice(0, CONFIG.pond.slots).map((v) => (typeof v === 'number' && isFinite(v) ? v : null));
  while (pond.length < CONFIG.pond.slots) pond.push(null);
  const dev = obj(raw.dev), decay = obj(dev.decay), settings = obj(raw.settings);
  const aliveCount = pets.filter((p) => !p.dead).length;
  return {
    v: SAVE_VERSION, clock, lastReal: num(raw.lastReal, now), createdAt: num(raw.createdAt, clock),
    fish: Math.floor(num(raw.fish, 0, 0)), slots: Math.floor(num(raw.slots, 1, Math.max(1, Math.min(aliveCount, CONFIG.maxPets)), CONFIG.maxPets)),
    pets, trips, postcards, souvenirs, inv: counts(raw.inv), owned, pond,
    lastCheckin: str(raw.lastCheckin, ''),
    friends: Object.fromEntries(Object.entries(obj(raw.friends)).filter(([k, v]) => typeof v === 'number' && k.split('|').length === 2 && k.split('|').every((id) => pets.some((p) => p.id === id))).map(([k, v]) => [k, Math.max(0, Math.min(CONFIG.friendship.best, v as number))])),
    display: { souvenirs: arr(display.souvenirs).filter((id) => souvenirs[id]).slice(0, CONFIG.travel.displaySouvenirs), postcards: arr(display.postcards).filter((id) => postcards.some((c) => c.id === id)).slice(0, CONFIG.travel.displayPostcards) },
    pendingReturns: arr(raw.pendingReturns).filter((id) => postcards.some((c) => c.id === id)),
    dev: { enabled: !!dev.enabled, background: !!dev.background, time: ['day', 'dusk', 'night'].includes(dev.time) ? dev.time : 'auto', season: ['spring', 'summer', 'autumn', 'winter'].includes(dev.season) ? dev.season : 'auto', speed: num(dev.speed, 1, 1, 100000), growth: num(dev.growth, 1, 0, 100000), decay: { food: num(decay.food, 1, 0, 1000), mood: num(decay.mood, 1, 0, 1000), clean: num(decay.clean, 1, 0, 1000) } },
    settings: { notify: settings.notify !== false },
  };
}

export type MigrateResult = { ok: true; state: GameState; from: number } | { ok: false; reason: string };

/** 任意版本的存档 → 当前版本 */
export function migrate(input: unknown, now = Date.now()): MigrateResult {
  if (!input || typeof input !== 'object') return { ok: false, reason: '不是存档数据' };
  let s = JSON.parse(JSON.stringify(input)) as Raw;
  const from = typeof s.v === 'number' ? s.v : NaN;
  if (!isFinite(from) || from < 1 || !Array.isArray(s.pets)) return { ok: false, reason: '不是这个游戏的存档' };
  if (from > SAVE_VERSION) return { ok: false, reason: `这份存档来自更新的版本（v${from}），当前游戏只认识到 v${SAVE_VERSION}` };
  for (let v = from; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, reason: `缺少从 v${v} 升级的方法` };
    s = step(s);
  }
  return { ok: true, state: repair(s, now), from };
}

export interface Loaded { state: GameState; from: number; source: 'main' | 'backup' }

/** 读存档：主存档坏了就用备份 */
export function loadSave(now = Date.now()): Loaded | null {
  for (const [key, source] of [[MAIN, 'main'], [BACKUP, 'backup']] as const) {
    const text = kv.get(key); if (!text) continue;
    try {
      const r = migrate(JSON.parse(text), now);
      if (r.ok) {
        if (r.from < SAVE_VERSION) kv.set(BEFORE_MIGRATION, text); // 升级前留一份原样
        return { state: r.state, from: r.from, source };
      }
    } catch { /* 这一份读不出来，试下一份 */ }
  }
  return null;
}

let lastBackup = 0;
/** 写存档。返回 false 表示这个浏览器存不下来（只留在内存里）。 */
export function writeSave(state: GameState): boolean {
  const text = JSON.stringify(state);
  const ok = kv.set(MAIN, text);
  const t = Date.now();
  if (ok && t - lastBackup > BACKUP_EVERY) { lastBackup = t; kv.set(BACKUP, text); }
  return ok;
}

export function clearSave() { kv.remove(MAIN); kv.remove(BACKUP); kv.remove(BEFORE_MIGRATION); }

// ---------- 导出、导入 ----------

export interface ExportFile { format: 'pet-game-save'; v: number; exportedAt: number; state: GameState; sprites: Record<string, string>; layout: string | null }

export function buildExport(state: GameState, sprites: Record<string, string>, layout: string | null): ExportFile {
  return { format: 'pet-game-save', v: SAVE_VERSION, exportedAt: Date.now(), state: JSON.parse(JSON.stringify(state)), sprites, layout };
}

export type ImportResult = { ok: true; state: GameState; sprites: Record<string, string>; layout: string | null; from: number } | { ok: false; reason: string };

export function parseImport(text: string, now = Date.now()): ImportResult {
  let data: any;
  try { data = JSON.parse(text.trim()); } catch { return { ok: false, reason: '读不出来：不是完整的存档文字' }; }
  const inner = data && data.format === 'pet-game-save' ? data.state : data; // 也接受直接贴存档本体
  const r = migrate(inner, now);
  if (!r.ok) return r;
  // 导入的存档从「现在」接着算，不补算导出之后过去的时间
  r.state.lastReal = now;
  const sprites: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(data?.sprites))) if (k.startsWith('custom:') && typeof v === 'string') sprites[k] = v;
  return { ok: true, state: r.state, sprites, layout: typeof data?.layout === 'string' ? data.layout : null, from: r.from };
}
