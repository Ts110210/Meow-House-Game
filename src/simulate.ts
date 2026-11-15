// 数值模拟：用真正的游戏规则（sim.ts）快进 N 天，看一个按固定习惯照顾的主人会遇到什么。
// 不碰真实存档。开发者面板里的「数值模拟」和命令行的 npm run sim 用的都是这里。
import { CONFIG, DAY, FOODS, FRY, GOODS, HOUR } from './config';
import * as sim from './sim';
import type { GameState, Pet } from './types';

export interface SimOptions {
  days: number;
  /** 养几只（多出来的直接领养，不算解锁空位的钱） */
  pets: number;
  /** 每天几点照顾（24 小时制）。空 = 完全不管 */
  careHours: number[];
  /** 开局就有自动喂食机 */
  feeder: boolean;
  /** 每天第一次照顾时派一只出门，带点货 */
  travel: boolean;
}

export interface DayRow { day: number; food: number; mood: number; clean: number; minFood: number; minMood: number; fish: number; stage: string; note: string }
export interface SimResult {
  label: string; rows: DayRow[];
  /** 第一次虚弱、第一次死亡发生在第几小时（没有就是 null） */
  firstWeakHour: number | null; firstDeathHour: number | null; deaths: number; rescues: number;
  /** 一天里有多大比例的时间处在「饿」「闷」「脏」 */
  hungryPct: number; sadPct: number; dirtyPct: number;
  fishStart: number; fishEnd: number; fishPerDay: number; spentOnFood: number; earned: { checkin: number; pond: number; trade: number };
  postcards: number; souvenirs: number; stageDays: (number | null)[];
}

const alive = (s: GameState) => s.pets.filter((p) => !p.dead);

/** 一次照顾：签到、收鱼塘、喂饱、摸一摸、玩一会儿、脏了就洗、能出门就出门 */
function care(s: GameState, o: SimOptions, tally: SimResult, firstToday: boolean) {
  const low = CONFIG.stats.lowThreshold;
  if (sim.canCheckin(s)) { sim.checkin(s); tally.earned.checkin += CONFIG.checkinFish; }
  s.pond.forEach((_, i) => {
    if (sim.pondReady(s, i)) { sim.harvest(s, i); tally.earned.pond += CONFIG.pond.fishPerFry; }
    if (s.pond[i] == null) { if (sim.count(s, FRY.id) < 1 && s.fish >= FRY.price + 20) { sim.buy(s, FRY.id); tally.earned.pond -= FRY.price; } sim.plantFry(s, i); }
  });
  for (const p of sim.homePets(s)) {
    const wasWeak = sim.isWeak(p);
    // 喂食：挑一份刚好能喂饱的；钱不够就买便宜的。连续喂效果减半，所以最多喂两次。
    for (let n = 0; n < 2 && p.food < 70; n++) {
      const need = 95 - p.food;
      const mult = sim.peekMult(s, p, 'feed');
      const options = [...FOODS].sort((a, b) => a.price - b.price);
      let pick = options.find((f) => f.restore * mult >= need && (sim.count(s, f.id) > 0 || s.fish >= f.price))
        ?? [...options].reverse().find((f) => sim.count(s, f.id) > 0 || s.fish >= f.price);
      if (!pick) break;
      if (sim.count(s, pick.id) < 1) { sim.buy(s, pick.id); tally.spentOnFood += pick.price; }
      sim.feed(s, p.id, pick.id);
    }
    if (wasWeak && !sim.isWeak(p)) tally.rescues++;
    sim.petPet(s, p.id);
    if (!sim.isWeak(p)) { sim.play(s, p.id); if (p.clean < 60) sim.bath(s, p.id); }
    void low;
  }
  if (o.travel && firstToday) {
    const goer = sim.homePets(s).find((p) => !sim.isWeak(p) && p.mood >= CONFIG.travel.moodFewerBelow);
    const bento = FOODS[0];
    if (goer && (sim.count(s, bento.id) > 0 || s.fish >= bento.price + 30)) {
      if (sim.count(s, bento.id) < 1) { sim.buy(s, bento.id); tally.spentOnFood += bento.price; }
      const goods: string[] = []; const g = GOODS[0];
      while (goods.length < 2 && (sim.count(s, g.id) > goods.length || s.fish >= g.price + 40)) { if (sim.count(s, g.id) <= goods.length) { sim.buy(s, g.id); tally.earned.trade -= g.price; } goods.push(g.id); }
      sim.dispatch(s, { petIds: [goer.id], bento: bento.id, tool: null, goods });
    }
  }
}

export function simulate(o: SimOptions, label: string): SimResult {
  const start = new Date(2026, 0, 1, 0, 0, 0).getTime();
  const s = sim.newState(start);
  s.slots = Math.max(1, Math.min(CONFIG.maxPets, o.pets));
  const colors = ['grey', 'cream', 'black', 'orange'];
  for (let i = 1; i < s.slots; i++) sim.adopt(s, `宠物${i + 1}`, `default:${colors[(i - 1) % 4]}`);
  if (o.feeder) s.owned.feeder = true;
  const r: SimResult = { label, rows: [], firstWeakHour: null, firstDeathHour: null, deaths: 0, rescues: 0, hungryPct: 0, sadPct: 0, dirtyPct: 0,
    fishStart: s.fish, fishEnd: 0, fishPerDay: 0, spentOnFood: 0, earned: { checkin: 0, pond: 0, trade: 0 }, postcards: 0, souvenirs: 0, stageDays: [0, null, null] };
  const low = CONFIG.stats.lowThreshold; let samples = 0, hungry = 0, sad = 0, dirty = 0;
  const avg = (f: (p: Pet) => number) => { const a = alive(s); return a.length ? a.reduce((t, p) => t + f(p), 0) / a.length : 0; };

  for (let d = 0; d < o.days; d++) {
    let minFood = 100, minMood = 100; const notes: string[] = []; let firstToday = true; let snap: [number, number, number] | null = null;
    for (let h = 0; h < 24; h++) {
      if (o.careHours.includes(h)) {
        if (!snap) snap = [avg((p) => p.food), avg((p) => p.mood), avg((p) => p.clean)]; // 照顾之前看到的样子
        care(s, o, r, firstToday); firstToday = false;
      }
      const cardsBefore = s.postcards.length;
      for (const e of sim.advance(s, HOUR)) {
        const hour = d * 24 + h + 1; const name = s.pets.find((p) => 'petId' in e && p.id === e.petId)?.name ?? '';
        if (e.type === 'weak') { if (r.firstWeakHour === null) r.firstWeakHour = hour; notes.push(`${name}虚弱`); }
        if (e.type === 'died') { if (r.firstDeathHour === null) r.firstDeathHour = hour; r.deaths++; notes.push(`${name}死亡`); }
        if (e.type === 'stage' && r.stageDays[e.stage] === null) { r.stageDays[e.stage] = +(hour / 24).toFixed(1); notes.push(`${name}长成${CONFIG.growth.stageNames[e.stage]}`); }
      }
      for (const c of s.postcards.slice(cardsBefore)) { r.earned.trade += c.income; }
      for (const p of sim.homePets(s)) { samples++; if (p.food < low) hungry++; if (p.mood < low) sad++; if (p.clean < low) dirty++; }
      if (alive(s).length) { minFood = Math.min(minFood, ...alive(s).map((p) => p.food)); minMood = Math.min(minMood, ...alive(s).map((p) => p.mood)); }
    }
    if (!snap) snap = [avg((p) => p.food), avg((p) => p.mood), avg((p) => p.clean)];
    const a = alive(s);
    r.rows.push({ day: d + 1, food: Math.round(snap[0]), mood: Math.round(snap[1]), clean: Math.round(snap[2]), minFood: Math.round(a.length ? minFood : 0), minMood: Math.round(a.length ? minMood : 0), fish: s.fish,
      stage: a.length ? [...new Set(a.map((p) => sim.stageName(p)))].join('/') : '—', note: [...new Set(notes)].join('，') });
    if (!a.length) { r.rows[r.rows.length - 1].note += (notes.length ? '，' : '') + '全部离开，模拟结束'; break; }
  }
  r.fishEnd = s.fish; r.fishPerDay = Math.round(((s.fish - r.fishStart) / r.rows.length) * 10) / 10;
  r.hungryPct = samples ? Math.round((hungry / samples) * 100) : 0; r.sadPct = samples ? Math.round((sad / samples) * 100) : 0; r.dirtyPct = samples ? Math.round((dirty / samples) * 100) : 0;
  r.postcards = s.postcards.length; r.souvenirs = Object.keys(s.souvenirs).length;
  return r;
}

export const CARE_PLANS: { label: string; hours: number[] }[] = [
  { label: '完全不管', hours: [] },
  { label: '每天照顾 1 次（20 点）', hours: [20] },
  { label: '每天照顾 3 次（8、13、20 点）', hours: [8, 13, 20] },
];

export function simulateAll(days: number, pets: number, feeder: boolean, travel: boolean): SimResult[] {
  return CARE_PLANS.map((p) => simulate({ days, pets, careHours: p.hours, feeder, travel }, p.label));
}

export const hoursToText = (h: number | null) => (h === null ? '没有发生' : h < 48 ? `第 ${h} 小时` : `第 ${(h / 24).toFixed(1)} 天`);
void DAY;
