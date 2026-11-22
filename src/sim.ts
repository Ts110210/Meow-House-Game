// 游戏规则。这个文件不碰画面，只改存档数据，方便单独测试。
import { writeDiary } from './diary';
import { TREASURES, DIARY_LINES } from './config';
import { CONFIG, DAY, QUESTS, SEX_IDS, type Sex, MOMENTS, NEIGHBORS, FIND_KINDS, SEASON_FINDS, SEASON_EVENTS, SEASON_IDS, SKINS, DEFAULT_SKIN, SKIN_PRICE, skinSize, ROOM_THEMES, DEFAULT_ROOM, DESTS, FOODS, FRY, FUR_COLORS, GEAR, GOODS, HOUR, MIN, SOUVENIRS, TOOLS, TREAT, type DayTime, type Season, type StatKey, decodeLook, TRAIT_IDS, type Trait, VISITORS, type VisitorWho, SPECIAL_DECOR, DECOR, ZONES } from './config';
import { ASSETS } from './assets.config';
import type { Decor, DiaryFact, Find, Gift, Moment, GameEvent, GameState, Pet, Postcard, RepeatKey, Result, Trip, Visitor, Weather } from './types';

const T = CONFIG.traits;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
let idSeq = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}_${(idSeq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** 随机一个公母；在这个公母的范围里随机一个成年大小 */
export const randomSex = (): Sex => SEX_IDS[Math.floor(Math.random() * SEX_IDS.length)];
export const randomAdultSize = (sex: Sex) => { const [a, b] = CONFIG.growth.adultSize[sex]; return Math.round((a + Math.random() * (b - a)) * 1000) / 1000; };

export function newPet(name: string, spriteId: string, clock: number, trait: Trait = TRAIT_IDS[Math.floor(Math.random() * TRAIT_IDS.length)], sex: Sex = randomSex()): Pet {
  return {
    id: newId('pet'), name, spriteId, age: 0, trait, sex, size: randomAdultSize(sex), lastCare: clock,
    food: CONFIG.stats.start.food, mood: CONFIG.stats.start.mood, clean: CONFIG.stats.start.clean,
    weakSince: null, dead: false, lostSince: null, searchUntil: null, tripId: null, repeats: {}, hungryNotified: false, adoptedAt: clock,
  };
}

// ---------- 任务：新手引导和每日任务 ----------

/** 新的任务记录。guideDone = true：不走新手引导，直接做每日任务（老玩家） */
export const newQuests = (guideDone: boolean): GameState['quests'] => ({ guide: [], guideClaimed: [], guideDone, day: '', daily: [], bonus: false });
const dailyDef = (id: string) => QUESTS.daily.find((q) => q.id === id);
/** 引导领完之后，每天第一次看任务时抽当天的每日任务 */
function refreshDaily(s: GameState) {
  const q = s.quests; if (!q.guideDone) return; const day = dayKey(s.clock); if (q.day === day) return;
  const pool = [...QUESTS.daily].sort(() => Math.random() - 0.5).slice(0, QUESTS.dailyCount);
  q.day = day; q.daily = pool.map((d) => ({ id: d.id, got: 0, claimed: false })); q.bonus = false;
}
/** 玩家做了一件事（摸、喂、洗、玩、签到、派出门、收到明信片、买东西、挪装饰、上屋顶、放鱼苗）：记进新手引导和当天的每日任务 */
export function questEvent(s: GameState, key: string, n = 1) {
  const q = s.quests;
  if (!q.guideDone) { for (const g of QUESTS.guide) if (g.key === key && !q.guide.includes(g.id)) q.guide.push(g.id); return; }
  refreshDaily(s);
  for (const d of q.daily) { const def = dailyDef(d.id); if (def && def.key === key && !d.claimed) d.got = Math.min(def.need, d.got + n); }
}
/** 任务面板要显示的东西：现在是引导还是每日任务、每一项的进度、能领几个 */
export function questStatus(s: GameState) {
  refreshDaily(s); const q = s.quests;
  const items = q.guideDone
    ? q.daily.map((d) => { const def = dailyDef(d.id)!; return { ...def, got: d.got, done: d.got >= def.need, claimed: d.claimed }; }).filter((x) => !!x.id)
    : QUESTS.guide.map((g) => ({ ...g, got: q.guide.includes(g.id) ? 1 : 0, done: q.guide.includes(g.id), claimed: q.guideClaimed.includes(g.id) }));
  const bonusReady = q.guideDone && items.length > 0 && items.every((x) => x.claimed) && !q.bonus;
  return { mode: q.guideDone ? 'daily' as const : 'guide' as const, items, bonusReady, bonusClaimed: q.bonus, claimable: items.filter((x) => x.done && !x.claimed).length + (bonusReady ? 1 : 0) };
}
/** 领一项任务的奖励。新手引导全部领完就开始每日任务 */
export function claimQuest(s: GameState, id: string): Result {
  const q = s.quests; refreshDaily(s);
  if (!q.guideDone) {
    const g = QUESTS.guide.find((x) => x.id === id); if (!g) return { ok: false, msg: '没有这个任务' };
    if (!q.guide.includes(id)) return { ok: false, msg: '还没做到' }; if (q.guideClaimed.includes(id)) return { ok: false, msg: '已经领过了' };
    q.guideClaimed.push(id); s.fish += g.reward;
    if (QUESTS.guide.every((x) => q.guideClaimed.includes(x.id))) { q.guideDone = true; refreshDaily(s); return { ok: true, msg: `小鱼干 +${g.reward}。新手引导全部完成！以后每天会有几个小任务` }; }
    return { ok: true, msg: `小鱼干 +${g.reward}` };
  }
  const d = q.daily.find((x) => x.id === id); const def = dailyDef(id); if (!d || !def) return { ok: false, msg: '今天没有这个任务' };
  if (d.claimed) return { ok: false, msg: '已经领过了' }; if (d.got < def.need) return { ok: false, msg: '还没做完' };
  d.claimed = true; s.fish += def.reward; return { ok: true, msg: `小鱼干 +${def.reward}` };
}
/** 今天的每日任务全部领完：额外奖励 */
export function claimDailyBonus(s: GameState): Result {
  const st = questStatus(s); if (!st.bonusReady) return { ok: false, msg: st.bonusClaimed ? '今天已经领过了' : '先把今天的任务都做完' };
  s.quests.bonus = true; s.fish += QUESTS.dailyBonus; return { ok: true, msg: `今天的任务全部完成，小鱼干 +${QUESTS.dailyBonus}` };
}

export function newState(now: number): GameState {
  const s: GameState = {
    v: 7, createdAt: now, seasonStart: now, settings: { notify: true, showSeason: false, seasonMode: 'cycle', light: 'simple' }, clock: now, lastReal: now, fish: CONFIG.startFish, slots: 1,
    pets: [], trips: [], postcards: [], souvenirs: {}, inv: { ...CONFIG.startItems }, owned: {},
    pond: Array(CONFIG.pond.slots).fill(null), lastCheckin: '', pendingReturns: [], friends: {}, variants: {}, milestones: [], decor: [], quests: newQuests(false), tutorial: 0, visitors: [], visitorQuota: 0, visitorDay: '', lastVisitorAt: 0, errand: null, display: { souvenirs: [], postcards: [] }, cattree: [null, null, null], hood: { now: null, bonds: {}, day: '', quota: 0, last: 0, stories: [] }, seasonal: { key: '', got: {}, done: false, last: 0, day: '', quota: 0 }, seasonalClaimed: [], moments: [], favor: {}, favorClaimed: [], finds: [], keepsakes: {}, diary: { days: {}, lead: {}, starred: [], seenAt: now }, gifts: [], treasures: {}, lastSeenReal: Date.now(), skins: {}, skinsOwned: {}, room: DEFAULT_ROOM, roomsOwned: [],
    dev: { enabled: false, background: false, time: 'auto', season: 'auto', weather: 'auto', speed: 1, growth: 1, decay: { food: 1, mood: 1, clean: 1 } },
  };
  s.pets.push(newPet(CONFIG.startPet.name, `default:${CONFIG.startPet.color}`, now));
  s.decor.push(...starterDecor());
  return s;
}

// ---------- 查询 ----------

/** 离开游戏的那段时间，游戏里的时间走多快（平时是 1 倍） */
export const awaySpeed = (s: GameState) => (s.dev.enabled && s.dev.background ? Math.max(1, s.dev.speed) : 1);
/** 家里有没有能让宠物自己玩的东西 */
export const hasToy = (s: GameState) => !!(s.owned.scratcher || s.owned.ball);
export const alivePets = (s: GameState) => s.pets.filter((p) => !p.dead);
export const isLost = (p: Pet) => p.lostSince !== null && !p.dead;
export const homePets = (s: GameState) => s.pets.filter((p) => !p.dead && !p.tripId && !p.outing && p.lostSince === null);
export const lostPets = (s: GameState) => s.pets.filter(isLost);
export const albumLimit = () => Math.round(DESTS.length * CONFIG.travel.albumPerDest);

/** 现在是白天、傍晚还是夜晚；什么季节。开发者面板里可以强制指定。 */
export function dayTime(s: GameState): DayTime {
  const dragged = s.dev.enabled && s.dev.hour != null;
  if (s.dev.enabled && s.dev.time !== 'auto' && !dragged) return s.dev.time;
  const h = dragged ? Math.floor(s.dev.hour!) : new Date(s.clock).getHours();
  return h >= 20 || h < 6 ? 'night' : h >= 17 ? 'dusk' : 'day';
}
/** 光影用的时间：现在几点（0–24，带小数）。开发者面板里拖了时间就用拖的；选了白天、傍晚、夜晚就用那一段里的一个时刻 */
export function lightHour(s: GameState): number {
  if (s.dev.enabled && s.dev.hour != null) return s.dev.hour;
  if (s.dev.enabled && s.dev.time !== 'auto') return { day: 12.5, dusk: 18, night: 23 }[s.dev.time];
  const d = new Date(s.clock); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
export function season(s: GameState): Season {
  if (s.dev.enabled && s.dev.season !== 'auto') return s.dev.season;
  return seasonInfo(s).season;
}
/** 现在的天气。每 CONFIG.weather.block 换一次，由时间算出来（同一段时间里怎么问都一样，不用存档）。冬天的 rain 画出来是大雪 */
export function weather(s: GameState): Weather {
  if (s.dev.enabled && s.dev.weather !== 'auto') return s.dev.weather;
  const n = Math.floor(s.clock / CONFIG.weather.block); const r = Math.abs(Math.sin(n * 12.9898 + 78.233) * 43758.5453) % 1;
  return r < (CONFIG.weather.rainChance[season(s)] ?? 0) ? 'rain' : 'clear';
}
const REAL_SEASON = (m: number): Season => (m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter');
/** 自动的季节（不看开发者面板的强制开关）：现在是哪一季、这一季的第几天、还有几天换季、下一季是什么。
 *  cycle = 游戏里自己的循环：从 seasonStart 那一刻的春天开始，每季 CONFIG.season.days 天，4 季一轮；
 *  real = 跟现实的月份走（3–5 月春，6–8 月夏，9–11 月秋，12–2 月冬）。在设置里选。 */
export function seasonInfo(s: GameState): { season: Season; day: number; daysLeft: number; next: Season } {
  const nextOf = (se: Season) => SEASON_IDS[(SEASON_IDS.indexOf(se) + 1) % SEASON_IDS.length];
  if (s.settings.seasonMode === 'real') {
    const d = new Date(s.clock); const season_ = REAL_SEASON(d.getMonth());
    // 这一季从哪个月的 1 号开始（冬天从 12 月开始，可能是去年的 12 月）
    const startMonth = season_ === 'winter' ? 11 : season_ === 'spring' ? 2 : season_ === 'summer' ? 5 : 8;
    const start = new Date(d.getFullYear() - (season_ === 'winter' && d.getMonth() < 2 ? 1 : 0), startMonth, 1).getTime();
    const end = new Date(new Date(start).getFullYear(), startMonth + 3, 1).getTime();
    return { season: season_, day: Math.floor((s.clock - start) / DAY) + 1, daysLeft: Math.max(1, Math.ceil((end - s.clock) / DAY)), next: nextOf(season_) };
  }
  const len = Math.max(0.01, CONFIG.season.days) * DAY; const t = Math.max(0, s.clock - s.seasonStart);
  const season_ = SEASON_IDS[Math.floor(t / len) % SEASON_IDS.length]; const into = t % len;
  return { season: season_, day: Math.floor(into / DAY) + 1, daysLeft: Math.max(1, Math.ceil((len - into) / DAY)), next: nextOf(season_) };
}
export const stageOf = (p: Pet) => Math.min(2, Math.floor(p.age / CONFIG.growth.stageDuration));
/** 新手保护：家里的第一只宠物，幼年期饱食掉得慢 */
export const isProtected = (s: GameState, p: Pet) => s.pets[0]?.id === p.id && stageOf(p) === 0;
/** 这只宠物每小时掉多少饱食（已经算上新手保护和开发者倍率） */
export function foodRate(s: GameState, p: Pet) {
  return CONFIG.stats.decayPerHour.food * s.dev.decay.food * (isProtected(s, p) ? CONFIG.stats.starterFoodDecay : 1) * (p.trait === 'glutton' ? CONFIG.traits.glutton.foodDecay : 1);
}

// ---------- 友情 ----------
export const friendKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const friendship = (s: GameState, a: string, b: string) => s.friends[friendKey(a, b)] ?? 0;
export const bestFriends = (s: GameState, a: string, b: string) => friendship(s, a, b) >= CONFIG.friendship.best;
function addFriendship(s: GameState, a: string, b: string, n: number) {
  if (a === b) return;
  s.friends[friendKey(a, b)] = Math.min(CONFIG.friendship.best, friendship(s, a, b) + n);
}
/** 这只宠物和家里其他宠物的关系，友情高的排前面 */
export function friendsOf(s: GameState, petId: string) {
  return alivePets(s).filter((o) => o.id !== petId).map((o) => ({ pet: o, value: friendship(s, petId, o.id), best: bestFriends(s, petId, o.id) })).sort((x, y) => y.value - x.value);
}
/** 现在画出来有多大（按最初设计算）：成年大小 × 成长阶段 */
export const bodySize = (p: Pet) => p.size * CONFIG.growth.stageScale[stageOf(p)];
/** 开发者面板：直接把宠物设成某个成长阶段（幼年、青年、成年刚开始的时候） */
export function devSetStage(s: GameState, petId: string, stage: number): Result {
  const p = s.pets.find((x) => x.id === petId); if (!p) return { ok: false, msg: '找不到这只宠物' };
  const st = Math.max(0, Math.min(2, Math.floor(stage))); p.age = st * CONFIG.growth.stageDuration;
  return { ok: true, msg: `${p.name}现在是${CONFIG.growth.stageNames[st]}` };
}
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
  let left = Math.max(0, dt); let noted = 0;
  while (left > 0) {
    const step = Math.min(STEP, left);
    left -= step;
    s.clock += step;
    stepPets(s, step, events);
    for (const v of [...s.visitors]) if (s.clock >= v.leaveAt) { s.visitors = s.visitors.filter((x) => x.id !== v.id); events.push({ type: 'visitorLeft', who: v.who }); }
    if (s.errand && s.clock >= s.errand.expiresAt) s.errand = null;
    if (s.hood.now && s.clock >= s.hood.now.leaveAt) neighborLeaves(s, events);
    for (const p of s.pets) if (p.outing && s.clock >= p.outing.until) outingBack(s, p, events);
    if (s.finds.length) s.finds = s.finds.filter((f) => s.clock - f.at < CONFIG.neighbors.findExpire);
    spawnSeasonFind(s);
    for (const trip of s.trips) if (!trip.letterSent && s.clock >= trip.letterAt) sendLetter(s, trip, events);
    for (const trip of [...s.trips]) if (s.clock >= trip.returnAt) resolveTrip(s, trip, events);
    for (const p of s.pets) if (p.searchUntil !== null && s.clock >= p.searchUntil) resolveSearch(s, p, events);
    expireGifts(s);
    // 这一步里发生的事写进日记（记在发生的时刻）
    for (; noted < events.length; noted++) diaryFromEvent(s, events[noted]);
  }
  return events;
}

/** 把游戏里发生的事（回家、长大、邻居来了…）记进日记 */
function diaryFromEvent(s: GameState, e: GameEvent) {
  const first = () => homePets(s)[0]?.id;
  switch (e.type) {
    case 'return': { const pc = s.postcards.find((c) => c.id === e.postcardId); if (!pc) break; for (const id of pc.petIds) { note(s, id, 'tripBack', pc.destId); if (pc.souvenir) note(s, id, 'souvenir', pc.souvenir); } break; }
    case 'visitor': { const v = s.visitors.find((x) => x.id === e.visitorId); const p = first(); if (v && p) note(s, p, 'visitor', v.who); break; }
    case 'neighbor': for (const p of homePets(s).slice(0, 2)) note(s, p.id, 'neighbor', e.id); break;
    case 'outingBack': note(s, e.petId, 'outing', e.neighborId); break;
    case 'stage': note(s, e.petId, 'grew', String(e.stage)); break;
    case 'ranAway': note(s, e.petId, 'lost'); break;
    case 'found': note(s, e.petId, 'found'); break;
  }
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
    if (p.tripId || p.outing) continue; // 旅途中靠便当、在邻居家有人照顾，状态不变

    const hungry = p.food < c.lowThreshold;
    const dirty = p.clean < c.lowThreshold;
    const lonely = p.trait === 'clingy' && s.clock - p.lastCare > T.clingy.lonelyAfter;
    const moodRate = c.decayPerHour.mood * (1 + (hungry ? c.moodDecayExtraWhenHungry : 0) + (dirty ? c.moodDecayExtraWhenDirty : 0)) * (lonely ? T.clingy.lonelyMoodDecay : 1);

    const foodFloor = s.owned.feeder ? c.feederFoodFloor : 0;
    if (p.food > foodFloor) p.food = Math.max(foodFloor, p.food - foodRate(s, p) * hours);
    // 心情保底：有同伴一起玩，或者家里有玩具可以自己玩
    const moodFloor = Math.max(companions ? c.companionMoodFloor : 0, hasToy(s) ? c.toyMoodFloor : 0);
    if (p.mood > moodFloor) p.mood = Math.max(moodFloor, p.mood - moodRate * s.dev.decay.mood * hours);
    const tidy = p.trait === 'tidy'; const cleanFloor = c.selfGroomCleanFloor + (tidy ? T.tidy.cleanFloorBonus : 0);
    if (p.clean > cleanFloor) p.clean = Math.max(cleanFloor, p.clean - c.decayPerHour.clean * (tidy ? T.tidy.cleanDecay : 1) * s.dev.decay.clean * hours);

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
  if (p.outing) return { ok: false, msg: `${p.name}去邻居家玩了` };
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
  p!.food = clamp(p!.food + gain); p!.lastCare = s.clock;
  const yum = p!.trait === 'glutton' && p!.weakSince === null ? T.glutton.eatMood : 0;
  if (yum) p!.mood = clamp(p!.mood + yum);
  if (p!.weakSince !== null) {
    p!.weakSince = null;
    p!.mood = clamp(p!.mood - CONFIG.weak.rescueMoodPenalty); questEvent(s, 'feed');
    return { ok: true, msg: `${p!.name}被救回来了，但心情很差（-${CONFIG.weak.rescueMoodPenalty}）` };
  }
  questEvent(s, 'feed'); note(s, p!.id, 'feed', foodId);
  return { ok: true, msg: `饱食 +${fmt(gain)}` + (yum ? `　心情 +${yum}` : '') };
}

export function petPet(s: GameState, petId: string, amount = CONFIG.actions.petMood): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  const gain = amount * (p!.trait === 'clingy' ? T.clingy.petMood : 1) * repeatMult(s, p!, 'pet');
  p!.mood = clamp(p!.mood + gain); p!.lastCare = s.clock; questEvent(s, 'pet'); note(s, p!.id, 'pet');
  return { ok: true, msg: `心情 +${fmt(gain)}` };
}

export function bath(s: GameState, petId: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  if (isWeak(p!)) return { ok: false, msg: `${p!.name}太虚弱了，先喂点东西` };
  const gain = CONFIG.actions.bathClean * repeatMult(s, p!, 'bath');
  p!.clean = clamp(p!.clean + gain); p!.lastCare = s.clock; questEvent(s, 'bath'); note(s, p!.id, 'bath');
  return { ok: true, msg: `干净 +${fmt(gain)}` };
}

export function play(s: GameState, petId: string): Result {
  const p = s.pets.find((x) => x.id === petId);
  const u = usable(p); if (!u.ok) return u;
  if (isWeak(p!)) return { ok: false, msg: `${p!.name}太虚弱了，先喂点东西` };
  const a = CONFIG.actions;
  const base = s.owned.wand ? a.playMoodWand : a.playMoodHand;
  const gain = base * repeatMult(s, p!, 'play');
  p!.mood = clamp(p!.mood + gain); p!.lastCare = s.clock; questEvent(s, 'play'); note(s, p!.id, 'play');
  return { ok: true, msg: `心情 +${fmt(gain)}` };
}

/** 两只宠物自己凑在一起玩（场景里随机触发） */
export function companionPlay(s: GameState, aId: string, bId: string) {
  const mult = bestFriends(s, aId, bId) ? CONFIG.friendship.bestPlayMult : 1;
  for (const id of [aId, bId]) {
    const p = s.pets.find((x) => x.id === id);
    if (p && !p.dead && !p.tripId) p.mood = clamp(p.mood + CONFIG.actions.companionPlayMood * mult);
  }
  addFriendship(s, aId, bId, CONFIG.friendship.perPlay);
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

// ---------- 图鉴 ----------

export const variantKey = (season_: Season, time: DayTime) => `${season_}-${time}`;
function recordVariant(s: GameState, card: Postcard) {
  if (!card.season || !card.time) return;
  const list = (s.variants[card.destId] ??= []); const k = variantKey(card.season, card.time);
  if (!list.includes(k)) list.push(k);
}
export const variantsOf = (s: GameState, destId: string) => s.variants[destId] ?? [];
export const variantTotal = (s: GameState) => DESTS.reduce((n, d) => n + variantsOf(s, d.id).length, 0);
export const VARIANTS_PER_DEST = 12;
export const souvenirTotal = (s: GameState) => Object.keys(s.souvenirs).filter((id) => SOUVENIRS[id]).length;
/** 里程碑现在的进度：have = 已经收集到多少；ready = 可以领了；claimed = 领过了 */
export function milestoneStatus(s: GameState) {
  return CONFIG.milestones.map((m) => { const have = m.kind === 'variants' ? variantTotal(s) : souvenirTotal(s); return { ...m, have, claimed: s.milestones.includes(m.id), ready: have >= m.need && !s.milestones.includes(m.id) }; });
}
export function claimMilestone(s: GameState, id: string): Result {
  const m = milestoneStatus(s).find((x) => x.id === id);
  if (!m) return { ok: false, msg: '没有这个里程碑' };
  if (m.claimed) return { ok: false, msg: '已经领过了' };
  if (!m.ready) return { ok: false, msg: `还差 ${m.need - m.have}` };
  s.milestones.push(id); s.fish += m.fish;
  let msg = `小鱼干 +${m.fish}`;
  if (m.skin && grantSkin(s, m.skin[0], m.skin[1])) msg += `，还有${skinLabel(m.skin[0], m.skin[1])}（在「布置房间」里换上）`;
  if (m.decor && SPECIAL_DECOR[m.decor]) { s.decor.push({ id: newId('decor'), kind: m.decor, zone: null, x: 0, y: 0 }); msg += `，还有特殊装饰「${SPECIAL_DECOR[m.decor].name}」`; }
  return { ok: true, msg };
}

// ---------- 房间装饰 ----------

export const decorCount = (s: GameState, kind: string) => s.decor.filter((d) => d.kind === kind && !d.starter).length;
/** 开局自带的装饰（原来画在背景里的地毯、挂画、盆栽），摆在原来的位置 */
export const starterDecor = (): Decor[] => ASSETS.starterDecor.map((d) => ({ id: newId('decor'), kind: d.kind, zone: d.zone, x: d.x, y: d.y, starter: true }));
export const storedDecor = (s: GameState) => s.decor.filter((d) => d.zone === null);
export function buyDecor(s: GameState, kind: string): Result {
  const def = DECOR[kind];
  if (!def || def.special) return { ok: false, msg: '商店里没有这件装饰' };
  if (decorCount(s, kind) >= CONFIG.decor.maxPerKind) return { ok: false, msg: `${def.name}最多买 ${CONFIG.decor.maxPerKind} 件` };
  if (s.fish < def.price) return { ok: false, msg: '小鱼干不够' };
  s.fish -= def.price; s.decor.push({ id: newId('decor'), kind, zone: null, x: 0, y: 0 }); questEvent(s, 'buy');
  return { ok: true, msg: `买到了${def.name}。到菜单的「布置房间」里摆出来` };
}
/** 摆到某个区域的某个位置（已经摆着的就是挪动；可以挪到别的区域） */
/** 摆放规则用的一个方框（区域里的坐标：x 从区域左边算，y 是整个房间的高度） */
export interface PlaceBox { x0: number; y0: number; x1: number; y1: number; label: string }
/** 这个区域现在的样子：墙上的东西、地上家具的脚底、要留空的地方，和别的装饰（画面那边量好传进来） */
export interface PlaceWorld {
  zoneW: number; floorY: number; height: number;
  /** 墙上的固定家具（窗户、置物架、镜子、门、相册墙、吊灯…）和墙上别的装饰 */
  wall: PlaceBox[];
  /** 地上家具的脚底和地上别的装饰的脚底 */
  foot: PlaceBox[];
  /** 不能挡住的地方：门前的路、猫用家具时要站的地方 */
  keepClear: PlaceBox[];
}
const hit = (a: PlaceBox, b: PlaceBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** 一件装饰摆在区域里的 (x, y)（x = 中心，y = 底边），图片宽 w、高 h：放得下返回 null，放不下返回原因。
 *  墙上的：整幅在墙上，不和墙上别的东西叠；铺地上的：整块在这个房间的地板上；摆地上的：脚底不和家具、别的装饰叠，不挡路和猫的站位 */
export function decorProblem(kind: string, zone: string, x: number, y: number, w: number, h: number, world?: PlaceWorld): string | null {
  const def = DECOR[kind]; const C = CONFIG.decor; if (!def) return '找不到这件装饰';
  if (C.noDecorZones.includes(zone)) return '院子里先不能摆装饰（以后有院子专用的）';
  if (zone === 'balcony' && (def.layer !== 'stand' || !C.outdoorOK.includes(kind))) return `${def.name}只能摆在屋里`;
  if (def.layer === 'wall' && C.noWallZones.includes(zone)) return '这里没有墙，挂不了';
  if (!world) return null;
  const { zoneW, floorY, height } = world;
  if (def.layer === 'wall') {
    const box = { x0: x - w / 2, y0: y - h, x1: x + w / 2, y1: y, label: '' };
    if (box.x0 < 4 || box.x1 > zoneW - 4 || box.y0 < C.wallTop || box.y1 > floorY - C.wallBottom) return `${def.name}要整幅挂在这个房间的墙上`;
    const o = world.wall.find((b) => hit(box, b)); return o ? `会和${o.label}叠在一起` : null;
  }
  if (def.layer === 'floor') {
    if (x - w / 2 < 0 || x + w / 2 > zoneW || y - h < floorY + 2 || y > height) return `${def.name}要整块铺在这个房间的地板上`;
    return null;
  }
  const foot = { x0: x - w * 0.4, y0: y - C.footDepth, x1: x + w * 0.4, y1: y, label: '' };
  if (foot.x0 < 0 || foot.x1 > zoneW || y < floorY + 8 || y > height - 4) return `${def.name}要摆在这个房间的地板上`;
  const o = world.foot.find((b) => hit(foot, b)); if (o) return `会和${o.label}叠在一起`;
  const k = world.keepClear.find((b) => hit(foot, b)); return k ? `会挡住${k.label}` : null;
}

/** world = 这个区域现在的样子（画面那边量好传进来）；不传就只查区域能不能摆这一种 */
export function placeDecor(s: GameState, id: string, zone: string, x: number, y: number, world?: PlaceWorld, size?: [number, number]): Result {
  const d = s.decor.find((it) => it.id === id);
  if (!d || !DECOR[d.kind]) return { ok: false, msg: '找不到这件装饰' };
  if (!ZONES.some((z) => z.id === zone)) return { ok: false, msg: '没有这个区域' };
  const why = decorProblem(d.kind, zone, x, y, size?.[0] ?? 0, size?.[1] ?? DECOR[d.kind].height, world); if (why) return { ok: false, msg: why };
  if (d.zone !== zone && s.decor.filter((it) => it.zone === zone).length >= CONFIG.decor.maxPerZone) return { ok: false, msg: `这个区域最多摆 ${CONFIG.decor.maxPerZone} 件` };
  d.zone = zone; d.x = Math.round(x); d.y = Math.round(y); questEvent(s, 'decor');
  return { ok: true };
}
/** 收起来：不会丢，还能再摆 */
export function storeDecor(s: GameState, id: string): Result {
  const d = s.decor.find((it) => it.id === id);
  if (!d) return { ok: false, msg: '找不到这件装饰' };
  d.zone = null;
  return { ok: true, msg: '收起来了' };
}

// ---------- 家具皮肤和房间风格 ----------

/** 这件东西现在用的是哪一款皮肤 */
export const skinOf = (s: GameState, kind: string) => { const id = s.skins[kind]; return id && SKINS.some((k) => k.id === id) ? id : DEFAULT_SKIN; };
export const ownsSkin = (s: GameState, kind: string, skin: string) => skin === DEFAULT_SKIN || !!s.skinsOwned[kind]?.includes(skin);
export const skinPrice = (kind: string) => { const size = skinSize(kind); return size ? SKIN_PRICE[size] : null; };
/** 这件东西玩家手里有没有（固定家具一直有；「家里的东西」要买过；装饰要至少有一件） */
export function hasFurniture(s: GameState, kind: string) {
  if (DECOR[kind]) return s.decor.some((d) => d.kind === kind);
  if (GEAR.some((g) => g.id === kind)) return !!s.owned[kind];
  return skinSize(kind) !== null;
}
/** 换皮肤。没买过的款式会直接买下来再换上；同一种东西（比如几件一样的装饰）一起换 */
export function setSkin(s: GameState, kind: string, skin: string): Result {
  const def = SKINS.find((k) => k.id === skin); const price = skinPrice(kind);
  if (!def || price === null) return { ok: false, msg: '没有这款皮肤' };
  if (!hasFurniture(s, kind)) return { ok: false, msg: '还没有这件东西' };
  let msg = `换成了${def.name}款`;
  if (!ownsSkin(s, kind, skin)) {
    if (s.fish < price) return { ok: false, msg: '小鱼干不够' };
    s.fish -= price; (s.skinsOwned[kind] ??= []).push(skin); msg = `买下并换上了${def.name}款`; questEvent(s, 'buy');
  }
  if (skin === DEFAULT_SKIN) delete s.skins[kind]; else s.skins[kind] = skin;
  return { ok: true, msg };
}
export const roomOf = (s: GameState) => (ROOM_THEMES.some((r) => r.id === s.room) ? s.room : DEFAULT_ROOM);
export const ownsRoom = (s: GameState, id: string) => id === DEFAULT_ROOM || s.roomsOwned.includes(id);
export function buyRoom(s: GameState, id: string): Result {
  const def = ROOM_THEMES.find((r) => r.id === id);
  if (!def) return { ok: false, msg: '没有这套房间' };
  if (ownsRoom(s, id)) return { ok: false, msg: '已经有了' };
  if (s.fish < def.price) return { ok: false, msg: '小鱼干不够' };
  s.fish -= def.price; s.roomsOwned.push(id); s.room = id; questEvent(s, 'buy');
  return { ok: true, msg: `买下了「${def.name}」，已经换上。可以在「布置房间」里换回去` };
}
export function setRoom(s: GameState, id: string): Result {
  const def = ROOM_THEMES.find((r) => r.id === id);
  if (!def || !ownsRoom(s, id)) return { ok: false, msg: '还没有这套房间' };
  s.room = id;
  return { ok: true, msg: `换成了「${def.name}」` };
}

// ---------- 常客的好感 ----------

/** 送一款皮肤（不用买）。已经有了就不重复给 */
export function grantSkin(s: GameState, kind: string, skin: string): boolean {
  if (skinSize(kind) === null || !SKINS.some((k) => k.id === skin) || ownsSkin(s, kind, skin)) return false;
  (s.skinsOwned[kind] ??= []).push(skin); return true;
}
const skinLabel = (kind: string, skin: string) => `${DECOR[kind]?.name ?? ({ bowl: '饭碗', bed: '小床', door: '门', sofa: '沙发', tub: '浴缸', cattree: '猫爬架', scratcher: '猫抓板', pond: '鱼塘', cabinet: '收藏柜', counter: '橱柜' } as Record<string, string>)[kind] ?? kind}的「${SKINS.find((k) => k.id === skin)?.name ?? skin}」皮肤`;
/** 帮访客办成了一件事：好感 +1；到了数就送回礼。返回要接在提示后面的话 */
function addFavor(s: GameState, who: string): string {
  s.favor[who] = (s.favor[who] ?? 0) + 1; let msg = '';
  (CONFIG.visitors.favor[who] ?? []).forEach((r, i) => {
    const key = `${who}:${i}`; if (s.favor[who] < r.need || s.favorClaimed.includes(key)) return;
    s.favorClaimed.push(key); s.fish += r.fish; msg += `。${VISITORS[who as VisitorWho]?.name ?? '它'}成了常客，送来回礼：小鱼干 +${r.fish}`;
    if (r.skin && grantSkin(s, r.skin[0], r.skin[1])) msg += `、${skinLabel(r.skin[0], r.skin[1])}`;
    if (r.decor && DECOR[r.decor]) { s.decor.push({ id: newId('decor'), kind: r.decor, zone: null, x: 0, y: 0 }); msg += `、装饰「${DECOR[r.decor].name}」（在「布置房间」里摆出来）`; }
  });
  return msg;
}
/** 这位访客的好感，和下一份回礼还差几次 */
export function favorStatus(s: GameState, who: string) {
  const have = s.favor[who] ?? 0; const next = (CONFIG.visitors.favor[who] ?? []).find((r, i) => !s.favorClaimed.includes(`${who}:${i}`));
  return { have, next: next ? next.need : null };
}

// ---------- 邻居猫 ----------

export const bondOf = (s: GameState, id: string) => s.hood.bonds[id] ?? 0;
export const isNeighborFriend = (s: GameState, id: string) => bondOf(s, id) >= CONFIG.neighbors.friendAt;
function addBond(s: GameState, id: string, n: number) { s.hood.bonds[id] = Math.min(CONFIG.neighbors.best, bondOf(s, id) + n); }
/** 主人打开 App（或回到前台）时调用：今天还有名额、家里有宠物、现在没有邻居在、离上一次够久，就来一只 */
export function openDoorToNeighbors(s: GameState, who?: string): GameEvent[] {
  const NB = CONFIG.neighbors; const day = dayKey(s.clock); const h = s.hood;
  if (h.day !== day) { h.day = day; let r = Math.random(); h.quota = 0; for (let n = 0; n < NB.perDayChance.length; n++) { r -= NB.perDayChance[n]; if (r <= 0) { h.quota = n; break; } } }
  if (!who && (h.quota <= 0 || h.now || s.clock - h.last < NB.gap || s.clock - s.createdAt < NB.firstAfter || homePets(s).length === 0)) return [];
  if (h.now) return [];
  const ids = Object.keys(NEIGHBORS); const id = who && NEIGHBORS[who] ? who : ids[Math.floor(Math.random() * ids.length)];
  if (!who) h.quota--;
  h.last = s.clock; h.now = { id, arrivedAt: s.clock, leaveAt: s.clock + between(NB.stay), met: [], ate: false };
  return [{ type: 'neighbor', id }];
}
/** 邻居和家里的一只宠物玩了一会儿（画面里它们凑到一起时调用）。同一次串门里和同一只只算一次 */
export function neighborMeet(s: GameState, petId: string): boolean {
  const n = s.hood.now, p = s.pets.find((x) => x.id === petId);
  if (!n || !p || p.dead || p.tripId || p.outing || n.met.includes(petId)) return false;
  n.met.push(petId); p.mood = clamp(p.mood + CONFIG.neighbors.playMood); addBond(s, n.id, CONFIG.neighbors.bondPerPlay);
  return true;
}
/** 邻居在饭碗边蹭了一口（只是记一笔，不扣你的食物） */
export function neighborSnack(s: GameState) { if (s.hood.now) s.hood.now.ate = true; }
function neighborLeaves(s: GameState, events: GameEvent[]) {
  const n = s.hood.now; if (!n) return; const NB = CONFIG.neighbors; const def = NEIGHBORS[n.id];
  addBond(s, n.id, NB.bondPerVisit); s.hood.now = null;
  let find: string | undefined;
  if (def && s.finds.length < NB.maxFinds && Math.random() < (isNeighborFriend(s, n.id) ? NB.giftChanceFriend : NB.giftChance)) {
    find = weighted(NB.giftWeight);
    s.finds.push({ id: newId('find'), kind: find, from: n.id, at: s.clock, x: 0.08 + Math.random() * 0.2, text: find === 'note' ? def.notes[Math.floor(Math.random() * def.notes.length)] : undefined });
  }
  events.push({ type: 'neighborLeft', id: n.id, find });
}
/** 开发者面板用：让正在串门的邻居马上走 */
export function sendNeighborHome(s: GameState): GameEvent[] { const ev: GameEvent[] = []; neighborLeaves(s, ev); return ev; }
/** 捡起院子里的一样小东西 */
export function collectFind(s: GameState, id: string): Result {
  const f = s.finds.find((x) => x.id === id); if (!f) return { ok: false, msg: '已经不在了' };
  s.finds = s.finds.filter((x) => x.id !== id);
  const from = f.from && NEIGHBORS[f.from] ? NEIGHBORS[f.from].name : '';
  if (f.kind === 'fish') { const n = between(CONFIG.neighbors.giftFish); s.fish += n; return { ok: true, msg: `${from}留下的小鱼：小鱼干 +${n}` }; }
  const key = `${f.kind}:${f.from ?? ''}`; s.keepsakes[key] = (s.keepsakes[key] ?? 0) + 1;
  if (SEASON_FINDS[f.kind]) return seasonCollect(s, f.kind);
  const name = FIND_KINDS[f.kind]?.name ?? SEASON_FINDS[f.kind]?.name ?? '小东西';
  return { ok: true, msg: f.kind === 'note' ? `${from}的脚印纸条：「${f.text ?? '……'}」` : from ? `${from}留下的${name.replace(/^一[朵条张片只个]/, '')}，收好了` : `捡到了${name}` };
}
export const keepsakeCount = (s: GameState, kind: string, from = '') => s.keepsakes[`${kind}:${from}`] ?? 0;
/** 让一只宠物去邻居家回访（要先和这只邻居成为朋友）。半小时后自己回来，带回一句小见闻 */
export function visitNeighbor(s: GameState, petId: string, neighborId: string): Result {
  const p = s.pets.find((x) => x.id === petId); const def = NEIGHBORS[neighborId];
  if (!def) return { ok: false, msg: '没有这位邻居' };
  const u = usable(p); if (!u.ok) return u;
  if (isWeak(p!)) return { ok: false, msg: `${p!.name}太虚弱了，出不了门` };
  if (!isNeighborFriend(s, neighborId)) return { ok: false, msg: `和${def.name}还不够熟，等它多来几次` };
  if (s.hood.now?.id === neighborId) return { ok: false, msg: `${def.name}正在你家呢` };
  if (p!.food < CONFIG.stats.lowThreshold) return { ok: false, msg: `${p!.name}饿着肚子，不想出门` };
  p!.outing = { neighborId, until: s.clock + CONFIG.neighbors.outing };
  return { ok: true, msg: `${p!.name}去${def.home}找${def.name}玩了，大概 ${Math.round(CONFIG.neighbors.outing / MIN)} 分钟后回来` };
}
function outingBack(s: GameState, p: Pet, events: GameEvent[]) {
  const o = p.outing; if (!o) return; p.outing = null; const def = NEIGHBORS[o.neighborId]; if (!def || p.dead) return;
  p.mood = clamp(p.mood + CONFIG.neighbors.outingMood); addBond(s, o.neighborId, CONFIG.neighbors.outingBond);
  const text = def.stories[Math.floor(Math.random() * def.stories.length)].replace(/\{pet\}/g, p.name);
  s.hood.stories = [{ petId: p.id, neighborId: o.neighborId, text, at: s.clock }, ...s.hood.stories].slice(0, 12);
  events.push({ type: 'outingBack', petId: p.id, neighborId: o.neighborId, text });
}

// ---------- 季节活动 ----------

/** 现在是哪一轮的哪一季（换季、换一轮都会变） */
export function seasonKey(s: GameState): string {
  const se = seasonInfo(s).season;
  return s.settings.seasonMode === 'real' ? `${new Date(s.clock).getFullYear()}:${se}` : `${Math.floor(Math.max(0, s.clock - s.seasonStart) / (Math.max(0.01, CONFIG.season.days) * DAY * SEASON_IDS.length))}:${se}`;
}
function seasonalNow(s: GameState) { const key = seasonKey(s); if (s.seasonal.key !== key) s.seasonal = { ...s.seasonal, key, got: {}, done: false }; return s.seasonal; }
/** 这一季的活动进度 */
export function seasonEventStatus(s: GameState) {
  const se = seasonInfo(s).season, ev = SEASON_EVENTS[se], st = seasonalNow(s);
  return { season: se, name: ev.name, need: ev.need, done: st.done, reward: ev.reward, rewardNew: !s.seasonalClaimed.includes(se), fish: ev.fish, items: ev.items.map((it) => ({ ...it, have: Math.min(ev.need, st.got[it.id] ?? 0) })) };
}
/** 院子里每隔一阵冒出一样这一季的小东西（优先冒还没捡够的那种）。这一季已经完成、今天的名额用完、院子里放满了，就不冒 */
function spawnSeasonFind(s: GameState) {
  const E = CONFIG.seasonEvent; const st = seasonalNow(s);
  if (st.done || s.clock - st.last < E.gap || s.finds.length >= CONFIG.neighbors.maxFinds) return;
  const day = dayKey(s.clock); if (st.day !== day) { st.day = day; st.quota = E.perDay; }
  if (st.quota <= 0) return;
  const ev = SEASON_EVENTS[seasonInfo(s).season]; const want = ev.items.filter((it) => (st.got[it.id] ?? 0) + s.finds.filter((f) => f.kind === it.id).length < ev.need);
  const it = (want.length ? want : ev.items)[Math.floor(Math.random() * (want.length ? want.length : ev.items.length))];
  st.quota--; st.last = s.clock;
  s.finds.push({ id: newId('find'), kind: it.id, at: s.clock, x: 0.04 + Math.random() * 0.2 });
}
function seasonCollect(s: GameState, kind: string): Result {
  const def = SEASON_FINDS[kind]; const cur = seasonInfo(s).season; const ev = SEASON_EVENTS[cur]; const st = seasonalNow(s);
  if (def.season !== cur || st.done) return { ok: true, msg: `捡到了${def.name}` };
  st.got[kind] = (st.got[kind] ?? 0) + 1;
  if (!ev.items.every((it) => (st.got[it.id] ?? 0) >= ev.need)) return { ok: true, msg: `捡到了${def.name}（${Math.min(ev.need, st.got[kind])} / ${ev.need}）` };
  st.done = true; s.fish += ev.fish; let msg = `捡到了${def.name}。「${ev.name}」完成了：小鱼干 +${ev.fish}`;
  if (!s.seasonalClaimed.includes(cur) && DECOR[ev.reward]) { s.seasonalClaimed.push(cur); s.decor.push({ id: newId('decor'), kind: ev.reward, zone: null, x: 0, y: 0 }); msg += `，还有这一季限定的装饰「${DECOR[ev.reward].name}」（在「布置房间」里摆出来）`; }
  return { ok: true, msg };
}

// ---------- 瞬间相册 ----------

/** 抓拍一个瞬间。同一种瞬间隔 CONFIG.moments.cooldown 才会再拍一次。拍到了返回这张，没拍返回 null */
export function recordMoment(s: GameState, kind: string, petIds: string[], extra?: string): Moment | null {
  if (!MOMENTS[kind]) return null;
  const pets = petIds.map((id) => s.pets.find((p) => p.id === id)).filter((p): p is Pet => !!p && !p.dead); if (!pets.length) return null;
  const last = s.moments.find((m) => m.kind === kind); if (last && s.clock - last.at < CONFIG.moments.cooldown) return null;
  const m: Moment = { id: newId('moment'), kind, at: s.clock, petIds: pets.map((p) => p.id), names: pets.map((p) => p.name), sprites: pets.map((p) => p.spriteId), season: season(s), time: dayTime(s), extra };
  // 和明信片一样：满了也先收下，多出来的请主人自己挑着删（见 momentsOver / discardMomentOverflow），不会自动删
  s.moments = [m, ...s.moments]; for (const p of pets) note(s, p.id, 'moment', kind);
  return m;
}
/** 瞬间相册里超出上限的张数。大于 0 时要请主人删掉几张，或者放弃新拍的 */
export const momentsOver = (s: GameState) => Math.max(0, s.moments.length - CONFIG.moments.max);
/** 主人不想整理：放弃最新拍的那几张，直到不超上限。返回放弃了几张 */
export function discardMomentOverflow(s: GameState): number { const n = momentsOver(s); if (n > 0) s.moments = s.moments.slice(n); return n; }
export const momentTitle = (m: Moment) => (MOMENTS[m.kind]?.title ?? '{pets}').replace('{pets}', m.names.join('、'));
export function deleteMoment(s: GameState, id: string): Result { const n = s.moments.length; s.moments = s.moments.filter((m) => m.id !== id); return n !== s.moments.length ? { ok: true, msg: '删掉了' } : { ok: false, msg: '找不到这张' }; }

// ---------- 猫草 ----------

/** 宠物啃了两口猫草：加一点心情。同一只要隔一阵才会再加（画面里它想去啃的时候调用） */
export function nibbleGrass(s: GameState, petId: string): boolean {
  const p = s.pets.find((x) => x.id === petId);
  if (!s.owned.catgrass || !p || p.dead || p.tripId || p.outing) return false;
  if (p.lastNibble != null && s.clock - p.lastNibble < CONFIG.actions.grassCooldown) return false;
  p.lastNibble = s.clock; p.mood = clamp(p.mood + CONFIG.actions.grassMood);
  return true;
}

// ---------- 猫爬架 ----------

export const CATTREE_LEVELS = ['顶层', '中层', '底层'];
/** 指定猫爬架的某一层给某只宠物（petId = null 表示谁都可以）。一只宠物只能占一层：指定到新的一层，原来那层就空出来 */
export function setCatTree(s: GameState, level: number, petId: string | null): Result {
  if (!s.owned.cattree) return { ok: false, msg: '还没有猫爬架' };
  if (!(level >= 0 && level < CATTREE_LEVELS.length)) return { ok: false, msg: '没有这一层' };
  if (petId !== null && !s.pets.some((p) => p.id === petId && !p.dead)) return { ok: false, msg: '找不到这只宠物' };
  if (petId !== null) s.cattree = s.cattree.map((id) => (id === petId ? null : id));
  s.cattree[level] = petId;
  return { ok: true, msg: petId === null ? `${CATTREE_LEVELS[level]}谁都可以上去` : `${s.pets.find((p) => p.id === petId)!.name}以后爱待在${CATTREE_LEVELS[level]}` };
}

// ---------- 访客 ----------

const weighted = <K extends string>(w: Record<K, number>): K => { let r = Math.random() * (Object.values(w) as number[]).reduce((a, b) => a + b, 0); for (const k of Object.keys(w) as K[]) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0] as K; };
const between = ([a, b]: [number, number]) => Math.round(a + Math.random() * (b - a));

/** 主人打开 App（或回到前台）时调用：新的一天先定今天来几个；今天还有名额、门口没人、离上一个够久，就来一个。 */
export function openDoorToVisitors(s: GameState): GameEvent[] {
  const V = CONFIG.visitors; const day = dayKey(s.clock);
  if (s.visitorDay !== day) {
    s.visitorDay = day;
    let r = Math.random(); s.visitorQuota = 0;
    for (let n = 0; n < V.perDayChance.length; n++) { r -= V.perDayChance[n]; if (r <= 0) { s.visitorQuota = n; break; } }
  }
  if (s.visitorQuota <= 0 || s.visitors.length > 0 || s.clock - s.lastVisitorAt < V.gap || s.clock - s.createdAt < V.firstAfter) return [];
  s.visitorQuota--; s.lastVisitorAt = s.clock;
  const v = makeVisitor(s); s.visitors.push(v);
  return [{ type: 'visitor', visitorId: v.id }];
}

export function makeVisitor(s: GameState, who?: VisitorWho, kind?: Visitor['kind']): Visitor {
  const V = CONFIG.visitors; const ids = Object.keys(VISITORS) as VisitorWho[];
  const w: Record<string, number> = { ...V.kindWeight }; if (s.errand) w.errand = 0; // 手上已经有一封信，就不再托第二封
  const v: Visitor = { id: newId('visitor'), who: who ?? ids[Math.floor(Math.random() * ids.length)], kind: kind ?? (weighted(w) as Visitor['kind']), arrivedAt: s.clock, leaveAt: s.clock + V.stay };
  if (v.kind === 'gift') { if (Math.random() < V.giftItemChance) v.item = V.giftItems[Math.floor(Math.random() * V.giftItems.length)]; else v.fish = between(V.giftFish); }
  else if (v.kind === 'trade') {
    v.wants = V.tradeWants[Math.floor(Math.random() * V.tradeWants.length)];
    const rare = Object.keys(SOUVENIRS).filter((id) => SOUVENIRS[id].rare && !s.souvenirs[id]);
    v.gives = rare.length ? rare[Math.floor(Math.random() * rare.length)] : 'fish';
  } else v.destId = DESTS[Math.floor(Math.random() * DESTS.length)].id;
  return v;
}

/** 回应访客。yes = 收下礼物、同意交换、接下这封信；no = 婉拒。不管哪种，访客办完事就走。 */
export function answerVisitor(s: GameState, id: string, yes: boolean): Result {
  const v = s.visitors.find((x) => x.id === id); const V = CONFIG.visitors;
  if (!v) return { ok: false, msg: '它已经走了' };
  const name = VISITORS[v.who].name; let msg = `${name}走了`;
  if (yes) {
    if (v.kind === 'gift') {
      if (v.item) { addItem(s, v.item, 1); msg = `收下了：${itemName(v.item)} ×1`; } else { s.fish += v.fish ?? 0; msg = `收下了：小鱼干 +${v.fish}`; }
    } else if (v.kind === 'trade') {
      if (count(s, v.wants!) < 1) return { ok: false, msg: `家里没有${itemName(v.wants!)}，换不了` };
      addItem(s, v.wants!, -1);
      if (v.gives === 'fish' || !SOUVENIRS[v.gives!] || s.souvenirs[v.gives!]) { s.fish += V.tradeFallbackFish; msg = `换到了：小鱼干 +${V.tradeFallbackFish}`; }
      else { s.souvenirs[v.gives!] = 1; msg = `换到了稀有纪念品：${SOUVENIRS[v.gives!].name}`; }
    } else {
      if (s.errand) return { ok: false, msg: '手上已经有一封信了，先送完那封' };
      s.errand = { destId: v.destId!, reward: between(V.errandFish), from: v.who, expiresAt: s.clock + V.errandExpire };
      msg = `接下了信。派宠物出门时可以选「顺路送信」`;
    }
    msg += addFavor(s, v.who);
  }
  s.visitors = s.visitors.filter((x) => x.id !== id);
  return { ok: true, msg };
}
const itemName = (id: string) => [...FOODS, ...TOOLS, ...GOODS, FRY, TREAT].find((x) => x.id === id)?.name ?? id;
/** 这份便当够不够送到信上写的地方（远的地方要好一点的便当） */
export const errandReachable = (s: GameState, bento: string) => !!s.errand && (FOODS.find((f) => f.id === bento)?.tier ?? 0) >= (DESTS.find((d) => d.id === s.errand!.destId)?.tier ?? 9);

export interface DispatchPlan { petIds: string[]; bento: string; tool: string | null; goods: string[]; /** 顺路送信：去信上写的那个地方 */ errand?: boolean }

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

function pickDest(tier: number, toolType: string | null, adventurous = false) {
  const t = CONFIG.travel;
  const cands = DESTS.filter((d) => d.tier <= tier);
  const weights = cands.map((d) => (d.tier === tier ? t.destWeightSameTier : 1) * (toolType && d.type === toolType ? t.destWeightToolMatch : 1) * (adventurous && d.tier > 1 ? T.adventurer.farWeight : 1));
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
  const errand = plan.errand && errandReachable(s, plan.bento) ? s.errand : null;
  const dest = errand ? DESTS.find((d) => d.id === errand.destId)! : pickDest(food.tier, tool?.type ?? null, plan.petIds.some((id) => s.pets.find((p) => p.id === id)?.trait === 'adventurer'));
  const trip: Trip = {
    id: newId('trip'), petIds: [...plan.petIds], bento: plan.bento, tool: tool?.id ?? null, goods: [...plan.goods],
    startAt: s.clock, returnAt: s.clock + food.tripTime, destId: dest.id,
    letterAt: s.clock + food.tripTime * (CONFIG.travel.letterWindow[0] + Math.random() * (CONFIG.travel.letterWindow[1] - CONFIG.travel.letterWindow[0])), letterSent: false,
  };
  if (errand) { trip.errandReward = errand.reward; s.errand = null; }
  s.trips.push(trip);
  for (const id of plan.petIds) s.pets.find((p) => p.id === id)!.tripId = trip.id;
  questEvent(s, 'trip'); for (const id of plan.petIds) note(s, id, 'tripGo', dest.id);
  return { ok: true, msg: '出门啦，路上小心' };
}

const petNames = (s: GameState, ids: string[]) => ids.map((id) => s.pets.find((p) => p.id === id)?.name ?? '').filter(Boolean);

/** 路上寄一张明信片回家：只有明信片和日记，纪念品和卖货的钱要等回家 */
function sendLetter(s: GameState, trip: Trip, events: GameEvent[]) {
  trip.letterSent = true;
  const season_ = season(s), time = dayTime(s);
  const card: Postcard = { id: newId('card'), kind: 'letter', destId: trip.destId, petIds: trip.petIds, at: s.clock, souvenir: null, tool: trip.tool, seed: Math.floor(Math.random() * 1e9),
    season: season_, time, diary: writeDiary({ destId: trip.destId, season: season_, time, tool: trip.tool, names: petNames(s, trip.petIds), letter: true }), income: 0, sold: [], unsold: [] };
  s.postcards.push(card); s.pendingReturns.push(card.id); recordVariant(s, card); questEvent(s, 'postcard');
  events.push({ type: 'letter', postcardId: card.id });
}

function resolveTrip(s: GameState, trip: Trip, events: GameEvent[]) {
  if (!trip.letterSent) sendLetter(s, trip, events); // 开发者一键结束时，信也照样寄到
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
  if (trip.errandReward) { s.fish += trip.errandReward; events.push({ type: 'errandDone', destId: dest.id, reward: trip.errandReward }); }

  // 纪念品
  const tool = trip.tool ? TOOLS.find((x) => x.id === trip.tool) : null;
  if (tool) addItem(s, tool.id, 1);
  let chance = t.souvenirBaseChance + (tool && tool.type === dest.type ? t.souvenirToolMatchBonus : 0) + (pets.length > 1 ? t.souvenirCompanionBonus : 0)
    + (pets.some((p) => p.trait === 'adventurer') ? T.adventurer.souvenirBonus : 0)
    + (pets.length > 1 && bestFriends(s, pets[0].id, pets[1].id) ? CONFIG.friendship.bestSouvenirBonus : 0);
  if (pets.length > 1) addFriendship(s, pets[0].id, pets[1].id, CONFIG.friendship.perTrip);
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

  const season_ = season(s), time = dayTime(s);
  const card: Postcard = { id: newId('card'), destId: dest.id, petIds: trip.petIds, at: s.clock, souvenir, tool: trip.tool, seed: Math.floor(Math.random() * 1e9),
    season: season_, time, diary: writeDiary({ destId: dest.id, season: season_, time, tool: trip.tool, names: petNames(s, trip.petIds), letter: false,
      avoid: [...s.postcards].reverse().find((c) => c.kind === 'letter' && c.destId === dest.id && c.petIds.join() === trip.petIds.join())?.diary }), income, sold, unsold };
  // 相册满了也先收下：多出来的由主人自己决定删哪张（见 albumOver / discardOverflow），不会自动删
  s.postcards.push(card); recordVariant(s, card); questEvent(s, 'postcard');
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
  questEvent(s, 'buy');
  return { ok: true, msg: '买好了' };
}

export function checkin(s: GameState): Result {
  if (!canCheckin(s)) return { ok: false, msg: '今天已经签到过了' };
  s.lastCheckin = dayKey(s.clock);
  s.fish += CONFIG.checkinFish; questEvent(s, 'checkin');
  return { ok: true, msg: `签到成功，小鱼干 +${CONFIG.checkinFish}` };
}

export function plantFry(s: GameState, slot: number): Result {
  if (s.pond[slot] !== null && s.pond[slot] !== undefined) return { ok: false, msg: '这个位置已经有鱼苗了' };
  if (count(s, FRY.id) < 1) return { ok: false, msg: '没有鱼苗了，去商店买' };
  addItem(s, FRY.id, -1);
  s.pond[slot] = s.clock; questEvent(s, 'plant');
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
  const floor = s.owned.feeder ? c.feederFoodFloor : 0;
  for (const p of homePets(s)) {
    const rate = foodRate(s, p); // 每小时掉多少
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
    if (!t.letterSent) out.push({ title: `${names}寄来了一张明信片`, body: '路上写了几句话给你', inMs: t.letterAt - s.clock });
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

export function adopt(s: GameState, name: string, spriteId: string, trait?: Trait, sex?: Sex): Result & { petId?: string } {
  if (alivePets(s).length >= s.slots) return { ok: false, msg: '没有空位了' };
  const n = name.trim().slice(0, 8);
  if (!n) return { ok: false, msg: '先取个名字' };
  const p = newPet(n, spriteId, s.clock, trait, sex);
  s.pets.push(p);
  return { ok: true, msg: `${n}来到了家里`, petId: p.id };
}

export { DAY, HOUR, MIN };
export type { StatKey };

// ============================================================
// 猫的日记、猫叼回来的礼物
// ============================================================

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 某个时刻是哪一天（本地日期 YYYY-MM-DD，补零，能直接按字符串排序），日记按这个分页（签到用的 dayKey 不补零，别混用） */
export const diaryDay = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
/** 同一天、同一只猫、同一件事只记一条，多做几次算次数（吃、摸、洗、玩不分吃的什么） */
const COUNTED = ['feed', 'pet', 'bath', 'play'];

/** 在日记里记下一件事 */
export function note(s: GameState, petId: string, k: string, x?: string, t = s.clock) {
  if (!DIARY_LINES[k]) return;
  const key = diaryDay(t); const fresh = !s.diary.days[key]; const list = (s.diary.days[key] ??= []);
  const same = list.find((f) => f.p === petId && f.k === k && (COUNTED.includes(k) || f.x === x));
  if (same) { same.c = (same.c ?? 1) + 1; if (x) same.x = x; same.t = Math.max(same.t, t); return; } // 记最后一次的时刻（有新的就亮红点）
  if (list.length < 200) list.push({ p: petId, k, x, t });
  if (fresh) tidyDiary(s);
}

/** 过去的每一天定下主角（之后不变）；超过 keepDays 天又没收藏的日子删掉 */
export function tidyDiary(s: GameState) {
  const D = CONFIG.diary; const today = diaryDay(s.clock);
  const keys = Object.keys(s.diary.days).sort();
  for (const k of keys) if (k < today && !s.diary.lead[k]) s.diary.lead[k] = pickLead(s, k);
  const oldest = diaryDay(s.clock - D.keepDays * DAY);
  for (const k of keys) if (k < oldest && !s.diary.starred.includes(k)) { delete s.diary.days[k]; delete s.diary.lead[k]; }
  for (const k of Object.keys(s.diary.lead)) if (!s.diary.days[k]) delete s.diary.lead[k];
}

const factWeight = (f: DiaryFact) => CONFIG.diary.weight[f.k] ?? 1;
/** 这一天挑谁当主角：当天的事越重要越优先；好几天没当过主角的猫加分（轮流来，一周里每只都能写到） */
function pickLead(s: GameState, key: string): string[] {
  const D = CONFIG.diary; const facts = s.diary.days[key] ?? [];
  const recent = Object.entries(s.diary.lead).filter(([k]) => k < key && k >= diaryDay(new Date(key + 'T12:00').getTime() - D.rotateDays * DAY)).flatMap(([, v]) => v);
  const score = (p: string) => facts.filter((f) => f.p === p).map(factWeight).sort((a, b) => b - a).slice(0, D.linesEach).reduce((a, b) => a + b, 0) + (recent.includes(p) ? 0 : D.rotateBonus);
  return [...new Set(facts.map((f) => f.p))].sort((a, b) => score(b) - score(a)).slice(0, D.featured);
}

/** 同一天、同一件事挑的句子固定（不会每次打开都变） */
const pickBy = (seed: string, n: number) => { let h = 2166136261; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); return (h >>> 0) % Math.max(1, n); };
/** 日记里提到的东西叫什么 */
function factLabel(f: DiaryFact): string {
  const x = f.x ?? '';
  switch (f.k) {
    case 'feed': return FOODS.find((d) => d.id === x)?.name ?? '饭';
    case 'tripGo': case 'tripBack': return DESTS.find((d) => d.id === x)?.name ?? '远方';
    case 'souvenir': return SOUVENIRS[x]?.name ?? '一件纪念品';
    case 'neighbor': case 'outing': return NEIGHBORS[x]?.name ?? '邻居家的猫';
    case 'visitor': return VISITORS[x as VisitorWho]?.name ?? '客人';
    case 'grew': return CONFIG.growth.stageNames[Number(x)] ?? '大猫';
    case 'gift': return TREASURES[x]?.name ?? '一样小东西';
    default: return '';
  }
}
/** 一件事写成一句话（按性格挑写法） */
export function factText(s: GameState, f: DiaryFact, key: string): string {
  const p = s.pets.find((x) => x.id === f.p); const name = p?.name ?? '它';
  if (f.k === 'moment' && f.x && MOMENTS[f.x]) return MOMENTS[f.x].title.replace('{pets}', name) + '。';
  const e = DIARY_LINES[f.k]; const seed = `${key}|${f.p}|${f.k}|${f.x ?? ''}`;
  const own = p ? e[p.trait] : undefined;
  const pool = (f.c ?? 1) > 1 && e.many ? e.many : own && pickBy(seed + 'T', 10) < 6 ? own : e.all;
  return pool[pickBy(seed, pool.length)].replace(/\{n\}/g, name).replace(/\{x\}/g, factLabel(f)).replace(/\{c\}/g, String(f.c ?? 1));
}

/** 日记的一页：主角每只写几句（按重要程度挑），其他猫各一句 */
export function diaryPage(s: GameState, key: string) {
  const D = CONFIG.diary; const facts = [...(s.diary.days[key] ?? [])].sort((a, b) => a.t - b.t);
  const lead = key < diaryDay(s.clock) ? s.diary.lead[key] ?? pickLead(s, key) : pickLead(s, key);
  const best = (p: string, n: number) => facts.filter((f) => f.p === p).sort((a, b) => factWeight(b) - factWeight(a) || a.t - b.t).slice(0, n).sort((a, b) => a.t - b.t);
  const name = (p: string) => s.pets.find((x) => x.id === p)?.name ?? '它';
  const featured = lead.map((p) => ({ petId: p, name: name(p), lines: best(p, D.linesEach).map((f) => factText(s, f, key)) }));
  const others = [...new Set(facts.map((f) => f.p))].filter((p) => !lead.includes(p)).map((p) => ({ petId: p, name: name(p), line: factText(s, best(p, 1)[0], key) }));
  return { key, featured, others, starred: s.diary.starred.includes(key), empty: !facts.length };
}
/** 有日记的日子（新的在前） */
export const diaryDays = (s: GameState) => Object.keys(s.diary.days).filter((k) => s.diary.days[k].length).sort().reverse();
/** 上次看日记之后有没有新写的 */
export const diaryUnread = (s: GameState) => Object.values(s.diary.days).some((l) => l.some((f) => f.t > s.diary.seenAt));
export function markDiarySeen(s: GameState) { s.diary.seenAt = s.clock; }
/** 收藏 / 取消收藏一页（收藏的不会被删，最多 maxStarred 页） */
export function starDiary(s: GameState, key: string): Result {
  if (s.diary.starred.includes(key)) { s.diary.starred = s.diary.starred.filter((k) => k !== key); return { ok: true, msg: '取消收藏了，30 天后会被翻过去' }; }
  if (!s.diary.days[key]) return { ok: false, msg: '这一页是空的' };
  if (s.diary.starred.length >= CONFIG.diary.maxStarred) return { ok: false, msg: `最多收藏 ${CONFIG.diary.maxStarred} 页，先取消几页` };
  s.diary.starred.push(key); return { ok: true, msg: '收藏了，这一页会一直留着' };
}

/** 你不在的时候它做了些什么：按经过的时间段和天气挑几件，写进日记 */
function noteAway(s: GameState, awayMs: number) {
  const D = CONFIG.diary; if (awayMs < D.awayMin) return;
  const from = s.clock - awayMs; const rain = weather(s) === 'rain';
  for (const p of homePets(s)) {
    const kinds: { k: string; t: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const t = from + (awayMs * (i + 0.5)) / 6; const h = new Date(t).getHours();
      const k = rain && i % 3 === 1 ? 'awayRain' : h >= 6 && h < 11 ? 'awayMorning' : h >= 11 && h < 16 ? 'awayNoon' : h >= 16 && h < 20 ? 'awayEvening' : 'awayNight';
      if (!kinds.some((x) => x.k === k)) kinds.push({ k, t });
    }
    if (awayMs >= 8 * HOUR) kinds.push({ k: 'awayMiss', t: s.clock - 10 * MIN });
    // 洗一下顺序，挑前几件
    kinds.sort(() => Math.random() - 0.5).slice(0, D.awayFacts).forEach((x) => note(s, p.id, x.k, undefined, x.t));
  }
}

/** 礼物放在门口多久没捡，被它叼走 */
function expireGifts(s: GameState) { if (s.gifts.length) s.gifts = s.gifts.filter((g) => s.clock - g.at < CONFIG.gifts.expire); }

/** 你离开了一段时间又回来（打开游戏、从后台切回来）：在家的猫可能在门口留了礼物，日记里补上你不在时的事 */
export function welcomeBack(s: GameState, awayMs: number): Gift[] {
  noteAway(s, awayMs);
  const G = CONFIG.gifts; const got: Gift[] = []; if (awayMs < G.minAway) return got;
  const sn = season(s);
  const rareLeft = Object.keys(TREASURES).filter((k) => TREASURES[k].rare && decorCount(s, k) === 0 && !s.gifts.some((g) => g.kind === k));
  const common = Object.keys(TREASURES).filter((k) => !TREASURES[k].rare && (!TREASURES[k].season || TREASURES[k].season === sn));
  for (const p of homePets(s).sort(() => Math.random() - 0.5)) {
    if (got.length >= G.maxPerReturn || s.gifts.length >= 6) break;
    if (Math.random() >= G.chance + (p.mood >= G.moodGood ? G.moodBonus : 0)) continue;
    const kind = rareLeft.length && Math.random() < G.rareChance ? rareLeft.splice(Math.floor(Math.random() * rareLeft.length), 1)[0] : common[Math.floor(Math.random() * common.length)];
    const g: Gift = { id: newId('gift'), kind, petId: p.id, at: s.clock }; s.gifts.push(g); got.push(g);
    note(s, p.id, 'gift', kind);
  }
  return got;
}

/** 捡起门口的礼物：进「猫的宝贝」图鉴；稀有的是一件装饰，放进仓库 */
export function collectGift(s: GameState, id: string): Result {
  const g = s.gifts.find((x) => x.id === id); if (!g) return { ok: false, msg: '已经不在了' };
  s.gifts = s.gifts.filter((x) => x.id !== id);
  const def = TREASURES[g.kind]; const who = s.pets.find((p) => p.id === g.petId)?.name ?? '它';
  const had = s.treasures[g.kind]; s.treasures[g.kind] = { n: (had?.n ?? 0) + 1, first: had?.first ?? s.clock, petId: had?.petId ?? g.petId };
  if (def.rare && DECOR[g.kind]) { s.decor.push({ id: newId('decor'), kind: g.kind, zone: null, x: 0, y: 0 }); return { ok: true, msg: `${who}叼回来的${def.name}！这件可以摆出来，到菜单的「布置房间」里找它` }; }
  return { ok: true, msg: `${who}叼回来的${def.name}，收进「猫的宝贝」了${had ? '' : '（新的！）'}` };
}
