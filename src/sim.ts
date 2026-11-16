// 游戏规则。这个文件不碰画面，只改存档数据，方便单独测试。
import { CONFIG, DAY, DESTS, FOODS, FRY, FUR_COLORS, GEAR, GOODS, HOUR, MIN, SOUVENIRS, TOOLS, TREAT, type DayTime, type Season, type StatKey, decodeLook } from './config';
import type { GameEvent, GameState, Pet, Postcard, RepeatKey, Result, Trip } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
let idSeq = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}_${(idSeq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function newPet(name: string, spriteId: string, clock: number): Pet {
  return {
    id: newId('pet'), name, spriteId, age: 0,
    food: CONFIG.stats.start.food, mood: CONFIG.stats.start.mood, clean: CONFIG.stats.start.clean,
    weakSince: null, dead: false, lostSince: null, searchUntil: null, tripId: null, repeats: {}, hungryNotified: false, adoptedAt: clock,
  };
}

export function newState(now: number): GameState {
  const s: GameState = {
    v: 4, createdAt: now, settings: { notify: true }, clock: now, lastReal: now, fish: CONFIG.startFish, slots: 1,
    pets: [], trips: [], postcards: [], souvenirs: {}, inv: { ...CONFIG.startItems }, owned: {},
    pond: Array(CONFIG.pond.slots).fill(null), lastCheckin: '', pendingReturns: [], display: { souvenirs: [], postcards: [] },
    dev: { enabled: false, background: false, time: 'auto', season: 'auto', speed: 1, growth: 1, decay: { food: 1, mood: 1, clean: 1 } },
  };
  s.pets.push(newPet(CONFIG.startPet.name, `default:${CONFIG.startPet.color}`, now));
  return s;
}

// ---------- 查询 ----------

/** 离开游戏的那段时间，游戏里的时间走多快（平时是 1 倍） */
export const awaySpeed = (s: GameState) => (s.dev.enabled && s.dev.background ? Math.max(1, s.dev.speed) : 1);
/** 家里有没有能让宠物自己玩的东西 */
export const hasToy = (s: GameState) => !!(s.owned.scratcher || s.owned.ball);
export const alivePets = (s: GameState) => s.pets.filter((p) => !p.dead);
export const isLost = (p: Pet) => p.lostSince !== null && !p.dead;
export const homePets = (s: GameState) => s.pets.filter((p) => !p.dead && !p.tripId && p.lostSince === null);
export const lostPets = (s: GameState) => s.pets.filter(isLost);
export const albumLimit = () => Math.round(DESTS.length * CONFIG.travel.albumPerDest);

/** 现在是白天、傍晚还是夜晚；什么季节。开发者面板里可以强制指定。 */
export function dayTime(s: GameState): DayTime {
  if (s.dev.enabled && s.dev.time !== 'auto') return s.dev.time;
  const h = new Date(s.clock).getHours();
  return h >= 20 || h < 6 ? 'night' : h >= 17 ? 'dusk' : 'day';
}
export function season(s: GameState): Season {
  if (s.dev.enabled && s.dev.season !== 'auto') return s.dev.season;
  const m = new Date(s.clock).getMonth();
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}
export const stageOf = (p: Pet) => Math.min(2, Math.floor(p.age / CONFIG.growth.stageDuration));
export const stageName = (p: Pet) => CONFIG.growth.stageNames[stageOf(p)];
export const isWeak = (p: Pet) => p.weakSince !== null && !p.dead;
export const count = (s: GameState, id: string) => s.inv[id] ?? 0;
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export const canCheckin = (s: GameState) => s.lastCheckin !== dayKey(s.clock);
export function weakTimeLeft(s: GameState, p: Pet) {
  if (p.weakSince === null) return 0;
  return Math.max(0, p.weakSince + CONFIG.weak.timeToDeath[stageOf(p)] - s.clock);
}

function addItem(s: GameState, id: string, n: number) {
  s.inv[id] = (s.inv[id] ?? 0) + n;
  if (s.inv[id] <= 0) delete s.inv[id];
}

// ---------- 时间流逝 ----------

const STEP = MIN;

/** 把游戏时间往前推 dt 毫秒。关掉 App 再打开时，也是用它把离线期间一次算清。 */
export function advance(s: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  let left = Math.max(0, dt);
  while (left > 0) {
    const step = Math.min(STEP, left);
    left -= step;
    s.clock += step;
    stepPets(s, step, events);
    for (const trip of [...s.trips]) if (s.clock >= trip.returnAt) resolveTrip(s, trip, events);
    for (const p of s.pets) if (p.searchUntil !== null && s.clock >= p.searchUntil) resolveSearch(s, p, events);
  }
  return events;
}

function stepPets(s: GameState, step: number, events: GameEvent[]) {
  const c = CONFIG.stats;
  const hours = step / HOUR;
  const companions = homePets(s).length >= 2;
  for (const p of s.pets) {
    if (p.dead || p.lostSince !== null) continue; // 离家出走期间不长大、不掉状态
    const before = stageOf(p);
    p.age += step * s.dev.growth;
    const after = stageOf(p);
    if (after !== before) events.push({ type: 'stage', petId: p.id, stage: after });
    if (p.tripId) continue; // 旅途中靠便当，状态不变

    const hungry = p.food < c.lowThreshold;
    const dirty = p.clean < c.lowThreshold;
    const moodRate = c.decayPerHour.mood * (1 + (hungry ? c.moodDecayExtraWhenHungry : 0) + (dirty ? c.moodDecayExtraWhenDirty : 0));

    const foodFloor = s.owned.feeder ? c.feederFoodFloor : 0;
    if (p.food > foodFloor) p.food = Math.max(foodFloor, p.food - c.decayPerHour.food * s.dev.decay.food * hours);
    // 心情保底：有同伴一起玩，或者家里有玩具可以自己玩
    const moodFloor = Math.max(companions ? c.companionMoodFloor : 0, hasToy(s) ? c.toyMoodFloor : 0);
    if (p.mood > moodFloor) p.mood = Math.max(moodFloor, p.mood - moodRate * s.dev.decay.mood * hours);
    if (p.clean > c.selfGroomCleanFloor) p.clean = Math.max(c.selfGroomCleanFloor, p.clean - c.decayPerHour.clean * s.dev.decay.clean * hours);

    if (p.food < c.notifyFoodBelow && !p.hungryNotified) { p.hungryNotified = true; events.push({ type: 'hungry', petId: p.id }); }
    if (p.food >= c.notifyFoodBelow + 10) p.hungryNotified = false;

    if (p.food <= 0 && p.weakSince === null) { p.weakSince = s.clock; events.push({ type: 'weak', petId: p.id }); }
    if (p.weakSince !== null && s.clock - p.weakSince >= CONFIG.weak.timeToDeath[stageOf(p)]) {
      // 饿太久了：不会死，而是离家出走，要请狸花猫去找
      p.lostSince = s.clock; p.weakSince = null; p.searchUntil = null;
      events.push({ type: 'ranAway', petId: p.id });
    }
  }
}

// ---------- 互动 ----------

/** 同一动作效果递减：返回这次的效果倍率，并记一次 */
function repeatMult(s: GameState, p: Pet, key: RepeatKey): number {
  const a = CONFIG.actions;
  let r = p.repeats[key];
  if (!r || s.clock - r.last > a.repeatCooldown) r = { n: 0, last: s.clock };
  const mult = Math.pow(a.repeatFactor, r.n);
  p.repeats[key] = { n: r.n + 1, last: s.clock };
  return mult;
}

/** 下一次做这个动作的效果倍率（只看，不记） */
export function peekMult(s: GameState, p: Pet, key: RepeatKey): number {
  const r = p.repeats[key];
  if (!r || s.clock - r.last > CONFIG.actions.repeatCooldown) return 1;
  return Math.pow(CONFIG.actions.repeatFactor, r.n);
}

function usable(p: Pet | undefined): Result {
  if (!p || p.dead) return { ok: false, msg: '找不到这只宠物' };
  if (p.lostSince !== null) return { ok: false, msg: `${p.name}离家出走了` };
  if (p.tripId) return { ok: false, msg: `${p.name}出门了` };
  return { ok: true };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export function feed(s: GameState, petId: string, foodId: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  const food = FOODS.find((f) => f.id === foodId);
  if (!food || count(s, foodId) <= 0) return { ok: false, msg: '没有这种食物了' };
  addItem(s, foodId, -1);
  const gain = food.restore * repeatMult(s, p!, 'feed');
  p!.food = clamp(p!.food + gain);
  if (p!.weakSince !== null) {
    p!.weakSince = null;
    p!.mood = clamp(p!.mood - CONFIG.weak.rescueMoodPenalty);
    return { ok: true, msg: `${p!.name}被救回来了，但心情很差（-${CONFIG.weak.rescueMoodPenalty}）` };
  }
  return { ok: true, msg: `饱食 +${fmt(gain)}` };
}

export function petPet(s: GameState, petId: string, amount = CONFIG.actions.petMood): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  const gain = amount * repeatMult(s, p!, 'pet');
  p!.mood = clamp(p!.mood + gain);
  return { ok: true, msg: `心情 +${fmt(gain)}` };
}

export function bath(s: GameState, petId: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  if (isWeak(p!)) return { ok: false, msg: `${p!.name}太虚弱了，先喂点东西` };
  const gain = CONFIG.actions.bathClean * repeatMult(s, p!, 'bath');
  p!.clean = clamp(p!.clean + gain);
  return { ok: true, msg: `干净 +${fmt(gain)}` };
}

export function play(s: GameState, petId: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  if (isWeak(p!)) return { ok: false, msg: `${p!.name}太虚弱了，先喂点东西` };
  const a = CONFIG.actions;
  const base = s.owned.wand ? a.playMoodWand : a.playMoodHand;
  const gain = base * repeatMult(s, p!, 'play');
  p!.mood = clamp(p!.mood + gain);
  return { ok: true, msg: `心情 +${fmt(gain)}` };
}

/** 两只宠物自己凑在一起玩（场景里随机触发） */
export function companionPlay(s: GameState, aId: string, bId: string) {
  for (const id of [aId, bId]) {
    const p = s.pets.find((x) => x.id === id);
    if (p && !p.dead && !p.tripId) p.mood = clamp(p.mood + CONFIG.actions.companionPlayMood);
  }
}

/** 默认宠物换毛色（上传的宠物不能换） */
export function setColor(s: GameState, petId: string, color: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  if (!p || p.dead) return { ok: false, msg: '找不到这只宠物' };
  if (p.spriteId.startsWith('custom:')) return { ok: false, msg: '上传的宠物不能换毛色' };
  // color 可以是内置毛色的名字，也可以是自己捏的样子（look:…）
  if (decodeLook(color)) { p.spriteId = color; return { ok: true }; }
  if (!FUR_COLORS[color]) return { ok: false, msg: '没有这种毛色' };
  p.spriteId = `default:${color}`;
  return { ok: true };
}

export function rename(s: GameState, petId: string, name: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  const n = name.trim().slice(0, 8);
  if (!p || !n) return { ok: false, msg: '名字不能为空' };
  p.name = n;
  return { ok: true };
}

// ---------- 出门 ----------

export interface DispatchPlan { petIds: string[]; bento: string; tool: string | null; goods: string[] }

export function checkDispatch(s: GameState, plan: DispatchPlan): Result {
  const t = CONFIG.travel;
  if (plan.petIds.length < 1) return { ok: false, msg: '先选一只宠物' };
  if (plan.petIds.length > t.maxCompanions) return { ok: false, msg: `一趟最多 ${t.maxCompanions} 只` };
  for (const id of plan.petIds) {
    const p = s.pets.find((x) => x.id === id);
    const u = usable(p); if (!u.ok) return u;
    if (isWeak(p!)) return { ok: false, msg: `${p!.name}太虚弱了，出不了门` };
    if (p!.mood < t.moodRefuseBelow) return { ok: false, msg: `${p!.name}心情太差，不愿意出门` };
  }
  if (!FOODS.some((f) => f.id === plan.bento)) return { ok: false, msg: '先选一份便当' };
  if (count(s, plan.bento) < 1) return { ok: false, msg: '便当不够了，去商店买一些' };
  if (plan.tool && count(s, plan.tool) < 1) return { ok: false, msg: '没有这件行李' };
  if (plan.goods.length > t.goodsCapacity) return { ok: false, msg: `行李箱最多放 ${t.goodsCapacity} 件货物` };
  const need: Record<string, number> = {};
  for (const g of plan.goods) need[g] = (need[g] ?? 0) + 1;
  for (const g in need) if (count(s, g) < need[g]) return { ok: false, msg: '货物不够了' };
  return { ok: true };
}

function pickDest(tier: number, toolType: string | null) {
  const t = CONFIG.travel;
  const cands = DESTS.filter((d) => d.tier <= tier);
  const weights = cands.map((d) => (d.tier === tier ? t.destWeightSameTier : 1) * (toolType && d.type === toolType ? t.destWeightToolMatch : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i]; }
  return cands[cands.length - 1];
}

export function dispatch(s: GameState, plan: DispatchPlan): Result {
  const chk = checkDispatch(s, plan); if (!chk.ok) return chk;
  const food = FOODS.find((f) => f.id === plan.bento)!;
  const tool = plan.tool ? TOOLS.find((x) => x.id === plan.tool) ?? null : null;
  addItem(s, plan.bento, -1);
  if (tool) addItem(s, tool.id, -1); // 行李回家时还回来
  for (const g of plan.goods) addItem(s, g, -1);
  const dest = pickDest(food.tier, tool?.type ?? null);
  const trip: Trip = {
    id: newId('trip'), petIds: [...plan.petIds], bento: plan.bento, tool: tool?.id ?? null, goods: [...plan.goods],
    startAt: s.clock, returnAt: s.clock + food.tripTime, destId: dest.id,
  };
  s.trips.push(trip);
  for (const id of plan.petIds) s.pets.find((p) => p.id === id)!.tripId = trip.id;
  return { ok: true, msg: '出门啦，路上小心' };
}

function resolveTrip(s: GameState, trip: Trip, events: GameEvent[]) {
  const t = CONFIG.travel;
  s.trips = s.trips.filter((x) => x.id !== trip.id);
  const dest = DESTS.find((d) => d.id === trip.destId) ?? DESTS[0];
  const pets = trip.petIds.map((id) => s.pets.find((p) => p.id === id)).filter((p): p is Pet => !!p);

  // 行商：路上随机卖掉货物
  let income = 0; const sold: string[] = []; const unsold: string[] = [];
  for (const g of trip.goods) {
    const def = GOODS.find((x) => x.id === g);
    if (def && Math.random() < def.sellChance) {
      income += Math.round(def.sellMin + Math.random() * (def.sellMax - def.sellMin));
      sold.push(g);
    } else { unsold.push(g); addItem(s, g, 1); }
  }
  s.fish += income;

  // 纪念品
  const tool = trip.tool ? TOOLS.find((x) => x.id === trip.tool) : null;
  if (tool) addItem(s, tool.id, 1);
  let chance = t.souvenirBaseChance + (tool && tool.type === dest.type ? t.souvenirToolMatchBonus : 0) + (pets.length > 1 ? t.souvenirCompanionBonus : 0);
  if (pets.some((p) => p.mood < t.moodFewerBelow)) chance *= 0.5;
  let souvenir: string | null = null;
  if (Math.random() < chance) {
    // 每个地方两件：一件普通一件稀有。已经有的不会再带，两件都有了就不带。
    const [normal, rare] = dest.souvenirs;
    const first = Math.random() < t.souvenirRareChance ? rare : normal;
    const pick = [first, first === rare ? normal : rare].find((id) => !s.souvenirs[id]);
    if (pick) { souvenir = pick; s.souvenirs[pick] = 1; }
  }

  for (const p of pets) { p.tripId = null; p.clean = clamp(p.clean - t.cleanDropOnReturn); }

  const card: Postcard = { id: newId('card'), destId: dest.id, petIds: trip.petIds, at: s.clock, souvenir, tool: trip.tool, seed: Math.floor(Math.random() * 1e9), income, sold, unsold };
  // 相册满了也先收下：多出来的由主人自己决定删哪张（见 albumOver / discardOverflow），不会自动删
  s.postcards.push(card);
  s.pendingReturns.push(card.id);
  events.push({ type: 'return', postcardId: card.id });
}

/** 开发者模式：一键结束出门等待 */
export function finishTripNow(s: GameState, tripId: string): GameEvent[] {
  const trip = s.trips.find((t) => t.id === tripId);
  const events: GameEvent[] = [];
  if (trip) resolveTrip(s, trip, events);
  return events;
}

// ---------- 商店、签到、鱼塘 ----------

export function priceOf(id: string): number | null {
  return [...FOODS, ...TOOLS, ...GOODS, FRY, TREAT, ...GEAR].find((x) => x.id === id)?.price ?? null;
}

export function buy(s: GameState, id: string): Result {
  const price = priceOf(id);
  if (price === null) return { ok: false, msg: '商店没有这件东西' };
  const gear = GEAR.some((g) => g.id === id);
  if (gear && s.owned[id]) return { ok: false, msg: '已经有了' };
  if (s.fish < price) return { ok: false, msg: '小鱼干不够' };
  s.fish -= price;
  if (gear) s.owned[id] = true; else addItem(s, id, 1);
  return { ok: true, msg: '买好了' };
}

export function checkin(s: GameState): Result {
  if (!canCheckin(s)) return { ok: false, msg: '今天已经签到过了' };
  s.lastCheckin = dayKey(s.clock);
  s.fish += CONFIG.checkinFish;
  return { ok: true, msg: `签到成功，小鱼干 +${CONFIG.checkinFish}` };
}

export function plantFry(s: GameState, slot: number): Result {
  if (s.pond[slot] !== null && s.pond[slot] !== undefined) return { ok: false, msg: '这个位置已经有鱼苗了' };
  if (count(s, FRY.id) < 1) return { ok: false, msg: '没有鱼苗了，去商店买' };
  addItem(s, FRY.id, -1);
  s.pond[slot] = s.clock;
  return { ok: true, msg: '鱼苗放进去了' };
}

export const pondReady = (s: GameState, slot: number) => s.pond[slot] != null && s.clock - (s.pond[slot] as number) >= CONFIG.pond.growTime;

export function harvest(s: GameState, slot: number): Result {
  if (!pondReady(s, slot)) return { ok: false, msg: '还没长大' };
  s.pond[slot] = null;
  s.fish += CONFIG.pond.fishPerFry;
  return { ok: true, msg: `收获小鱼干 +${CONFIG.pond.fishPerFry}` };
}

// ---------- 离家出走：请狸花猫去找 ----------

/** 给狸花猫一根猫条，请它去找一只离家出走的宠物 */
export function sendSearch(s: GameState, petId: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  if (!p || !isLost(p)) return { ok: false, msg: '它没有离家出走' };
  if (p.searchUntil !== null) return { ok: false, msg: '狸花猫已经在找它了' };
  if (s.pets.some((x) => x.searchUntil !== null)) return { ok: false, msg: '狸花猫正在外面找另一只，等它回来' };
  if (count(s, TREAT.id) < 1) return { ok: false, msg: '先到商店买一根猫条' };
  addItem(s, TREAT.id, -1);
  p.searchUntil = s.clock + CONFIG.runaway.searchTime;
  return { ok: true, msg: `狸花猫叼着猫条出门找${p.name}了` };
}

function resolveSearch(s: GameState, p: Pet, events: GameEvent[]) {
  const r = CONFIG.runaway;
  p.searchUntil = null;
  if (Math.random() < r.failChance) { events.push({ type: 'notFound', petId: p.id }); return; }
  const stat = () => r.returnStatMin + Math.random() * (r.returnStatMax - r.returnStatMin);
  p.lostSince = null; p.weakSince = null; p.repeats = {}; p.hungryNotified = true;
  p.food = stat(); p.mood = stat(); p.clean = stat();
  events.push({ type: 'found', petId: p.id });
}

// ---------- 展示：收藏柜上摆哪几件、相册墙上挂哪几张 ----------

/** 相册里超出上限的张数。大于 0 时要请主人删掉几张，或者放弃新带回来的 */
export const albumOver = (s: GameState) => Math.max(0, s.postcards.length - albumLimit());

/** 主人自己删一张明信片（纪念品和小鱼干不受影响） */
export function deletePostcard(s: GameState, id: string): Result {
  const i = s.postcards.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, msg: '找不到这张明信片' };
  s.postcards.splice(i, 1);
  s.display.postcards = s.display.postcards.filter((x) => x !== id);
  s.pendingReturns = s.pendingReturns.filter((x) => x !== id);
  return { ok: true, msg: '已删除' };
}

/** 主人不想整理：放弃最新带回来的那几张，直到相册不超上限。返回放弃了几张 */
export function discardOverflow(s: GameState): number {
  let n = 0;
  while (albumOver(s) > 0) { const last = s.postcards[s.postcards.length - 1]; deletePostcard(s, last.id); n++; }
  return n;
}

export function toggleDisplaySouvenir(s: GameState, id: string): Result {
  if (!s.souvenirs[id]) return { ok: false, msg: '还没有这件纪念品' };
  // 第一次自己挑的时候，从现在自动摆着的那几件开始改
  const list = s.display.souvenirs.length ? s.display.souvenirs : shownSouvenirs(s);
  const i = list.indexOf(id);
  if (i >= 0) s.display.souvenirs = list.filter((x) => x !== id);
  else if (list.length >= CONFIG.travel.displaySouvenirs) return { ok: false, msg: `收藏柜上最多摆 ${CONFIG.travel.displaySouvenirs} 件，先收起一件` };
  else s.display.souvenirs = [...list, id];
  return { ok: true };
}

export function toggleDisplayPostcard(s: GameState, id: string): Result {
  if (!s.postcards.some((c) => c.id === id)) return { ok: false, msg: '找不到这张明信片' };
  const list = s.display.postcards.length ? s.display.postcards : shownPostcards(s).map((c) => c.id);
  const i = list.indexOf(id);
  if (i >= 0) s.display.postcards = list.filter((x) => x !== id);
  else if (list.length >= CONFIG.travel.displayPostcards) return { ok: false, msg: `相册墙上最多挂 ${CONFIG.travel.displayPostcards} 张，先取下一张` };
  else s.display.postcards = [...list, id];
  return { ok: true };
}

/** 收藏柜上实际摆着的：主人挑过就用挑的，没挑过就摆最先得到的那几件 */
export function shownSouvenirs(s: GameState): string[] {
  const picked = s.display.souvenirs.filter((id) => s.souvenirs[id] && SOUVENIRS[id]);
  return (picked.length ? picked : Object.keys(s.souvenirs).filter((id) => SOUVENIRS[id])).slice(0, CONFIG.travel.displaySouvenirs);
}

/** 相册墙上实际挂着的：主人挑过就用挑的，没挑过就挂最新的几张 */
export function shownPostcards(s: GameState): Postcard[] {
  const picked = s.display.postcards.map((id) => s.postcards.find((c) => c.id === id)).filter((c): c is Postcard => !!c);
  return (picked.length ? picked : s.postcards.slice(-CONFIG.travel.displayPostcards).reverse()).slice(0, CONFIG.travel.displayPostcards);
}

// ---------- 提醒 ----------

export interface ReminderPlan { title: string; body: string; inMs: number }

/** 现在离开的话，接下来该在什么时候提醒主人（饱食偏低、快撑不住、回家）。inMs = 多久以后。 */
export function planReminders(s: GameState): ReminderPlan[] {
  const c = CONFIG.stats; const out: ReminderPlan[] = [];
  const rate = c.decayPerHour.food * s.dev.decay.food; // 每小时掉多少
  const floor = s.owned.feeder ? c.feederFoodFloor : 0;
  for (const p of homePets(s)) {
    if (p.weakSince !== null) {
      const left = weakTimeLeft(s, p) - 12 * HOUR; // 撑不住之前 12 小时再提醒一次
      if (left > 0) out.push({ title: `${p.name}很虚弱`, body: '再不喂就来不及了，快回来看看', inMs: left });
      continue;
    }
    if (rate <= 0) continue;
    if (p.food > c.notifyFoodBelow && floor < c.notifyFoodBelow) out.push({ title: `${p.name}饿了`, body: '饭碗空了，回来喂点东西吧', inMs: ((p.food - c.notifyFoodBelow) / rate) * HOUR });
    if (floor <= 0) out.push({ title: `${p.name}饿得没力气了`, body: '它变得很虚弱，喂食可以救回来', inMs: (p.food / rate) * HOUR + MIN });
  }
  for (const p of s.pets) if (p.searchUntil !== null) out.push({ title: '狸花猫回来了', body: `去找${p.name}有结果了，快来看看`, inMs: p.searchUntil - s.clock });
  for (const t of s.trips) {
    const names = t.petIds.map((id) => s.pets.find((p) => p.id === id)?.name).filter(Boolean).join(' 和 ');
    out.push({ title: `${names}回家了`, body: '带回了一张明信片，快来看看', inMs: t.returnAt - s.clock });
  }
  // inMs 是游戏时间；开了「后台也按倍速」时，真实时间要除以倍速
  const k = awaySpeed(s);
  return out.map((r) => ({ ...r, inMs: r.inMs / k })).filter((r) => r.inMs > 20_000).sort((a, b) => a.inMs - b.inMs);
}

// ---------- 领养 ----------

export function nextSlotCost(s: GameState): number | null {
  if (s.slots >= CONFIG.maxPets) return null;
  return CONFIG.slotUnlockCost[s.slots] ?? 0;
}

export function unlockSlot(s: GameState): Result {
  const cost = nextSlotCost(s);
  if (cost === null) return { ok: false, msg: `最多同时养 ${CONFIG.maxPets} 只` };
  if (s.fish < cost) return { ok: false, msg: '小鱼干不够' };
  s.fish -= cost; s.slots += 1;
  return { ok: true, msg: '多了一个空位' };
}

export function adopt(s: GameState, name: string, spriteId: string): Result & { petId?: string } {
  if (alivePets(s).length >= s.slots) return { ok: false, msg: '没有空位了' };
  const n = name.trim().slice(0, 8);
  if (!n) return { ok: false, msg: '先取个名字' };
  const p = newPet(n, spriteId, s.clock);
  s.pets.push(p);
  return { ok: true, msg: `${n}来到了家里`, petId: p.id };
}

export { DAY, HOUR, MIN };
export type { StatKey };
