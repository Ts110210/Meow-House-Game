// 规则和存档的自动检查。运行：npm test
import { CONFIG, DAY, HOUR, MIN } from '../src/config';
import * as sim from '../src/sim';
import { buildExport, migrate, parseImport, repair, SAVE_VERSION } from '../src/save';

let failed = 0;
function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? '  通过' : '✗ 失败'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const T0 = new Date(2026, 0, 1, 9, 0, 0).getTime();

console.log('时间补算');
{
  const a = sim.newState(T0), b = sim.newState(T0);
  sim.advance(a, 8 * HOUR);
  for (let i = 0; i < 480; i++) sim.advance(b, MIN);
  const pa = a.pets[0], pb = b.pets[0];
  check('一次补 8 小时 = 一分钟一分钟过 8 小时', near(pa.food, pb.food) && near(pa.mood, pb.mood) && near(pa.clean, pb.clean) && a.clock === b.clock, `${pa.food} vs ${pb.food}`);
  const c = sim.newState(T0);
  for (let i = 0; i < 8 * 3600; i += 7) sim.advance(c, 7000); // 每帧一小段
  check('很多小段加起来也一样', near(c.pets[0].food, pa.food, 0.05) && near(c.pets[0].mood, pa.mood, 0.05), `${c.pets[0].food} vs ${pa.food}`);
  const before = JSON.stringify(a); sim.advance(a, 0); sim.advance(a, -5000);
  check('时间不前进或倒退时什么都不变', JSON.stringify(a) === before);
}
{
  const s = sim.newState(T0); const p = s.pets[0];
  const hoursToZero = CONFIG.stats.start.food / CONFIG.stats.decayPerHour.food;
  sim.advance(s, (hoursToZero - 0.1) * HOUR); check('饱食归零前不会虚弱', p.weakSince === null);
  sim.advance(s, 0.2 * HOUR); check('饱食归零后进入虚弱', p.weakSince !== null && !p.dead);
  sim.advance(s, CONFIG.weak.timeToDeath[0] - HOUR); check('幼年虚弱不到 3 天不会死', !p.dead);
  const ev = sim.advance(s, 2 * HOUR); check('幼年虚弱满 3 天死亡，并且有事件', p.dead && ev.some((e) => e.type === 'died'));
  const stats = [p.food, p.mood, p.clean]; sim.advance(s, 30 * DAY);
  check('死后状态不再变化', p.food === stats[0] && p.mood === stats[1] && p.clean === stats[2]);
}
{
  const s = sim.newState(T0); const p = s.pets[0]; p.food = 0; sim.advance(s, MIN);
  const r = sim.feed(s, p.id, 'kibble');
  check('虚弱时喂食可以救回，心情受罚', r.ok && p.weakSince === null && p.mood <= CONFIG.stats.start.mood - CONFIG.weak.rescueMoodPenalty + 1);
}
{
  const s = sim.newState(T0); s.owned.feeder = true; sim.advance(s, 10 * DAY);
  check('有自动喂食机就不会饿到虚弱', s.pets[0].weakSince === null && !s.pets[0].dead && s.pets[0].food >= CONFIG.stats.feederFoodFloor - 1e-9);
}
{
  const s = sim.newState(T0); const p = s.pets[0]; s.owned.feeder = true;
  sim.advance(s, CONFIG.growth.stageDuration - HOUR); check('不到 7 天还是幼年', sim.stageOf(p) === 0);
  const ev = sim.advance(s, 2 * HOUR); check('满 7 天长到青年，并且有事件', sim.stageOf(p) === 1 && ev.some((e) => e.type === 'stage'));
  sim.advance(s, 30 * DAY); check('最多长到壮年', sim.stageOf(p) === 2);
}

{
  const solo = sim.newState(T0); solo.owned.feeder = true; sim.advance(solo, 6 * DAY);
  check('只养一只、没有玩具时，心情没有保底', solo.pets[0].mood === 0);
  for (const toy of ['ball', 'scratcher']) {
    const s = sim.newState(T0); s.owned.feeder = true; s.owned[toy] = true; sim.advance(s, 6 * DAY);
    check(`只养一只、有${toy === 'ball' ? '玩具球' : '猫抓板'}时，心情不低于保底线`, near(s.pets[0].mood, CONFIG.stats.toyMoodFloor));
  }
  const pair = sim.newState(T0); pair.owned.feeder = true; pair.slots = 2; sim.adopt(pair, '二号', 'default:grey'); sim.advance(pair, 6 * DAY);
  check('有同伴时的保底不受影响', near(pair.pets[0].mood, CONFIG.stats.companionMoodFloor));
}

console.log('互动');
{
  const s = sim.newState(T0); const p = s.pets[0]; p.mood = 10;
  sim.petPet(s, p.id); const g1 = p.mood - 10; sim.petPet(s, p.id); const g2 = p.mood - 10 - g1;
  check('连续做同一个动作效果减半', near(g2, g1 / 2));
  sim.advance(s, CONFIG.actions.repeatCooldown + MIN); const m = p.mood; sim.petPet(s, p.id);
  check('冷却之后恢复正常', near(p.mood - m, g1, 0.01));
}

console.log('出门');
{
  const s = sim.newState(T0); const p = s.pets[0]; s.inv.bell = 2;
  const r = sim.dispatch(s, { petIds: [p.id], bento: 'kibble', tool: null, goods: ['bell', 'bell'] });
  check('可以派出门，便当和货物被扣掉', r.ok && s.trips.length === 1 && (s.inv.bell ?? 0) === 0 && p.tripId !== null);
  const f = p.food; sim.advance(s, 20 * MIN); check('旅途中状态不下降', p.food === f);
  const fish = s.fish; const ev = sim.advance(s, 3 * DAY);
  check('离线期间到点会回家，带回明信片', s.trips.length === 0 && p.tripId === null && s.postcards.length === 1 && s.pendingReturns.length === 1 && ev.some((e) => e.type === 'return'));
  const card = s.postcards[0];
  check('卖货的钱和没卖掉的货都对得上', s.fish === fish + card.income && card.sold.length + card.unsold.length === 2 && (s.inv.bell ?? 0) === card.unsold.length);
  check('回家后接着正常掉状态', p.food < f);
}
{
  const s = sim.newState(T0); s.slots = 2; sim.adopt(s, '二号', 'default:grey'); s.inv.kibble = 1;
  const ids = s.pets.map((p) => p.id);
  check('可以两只结伴', sim.dispatch(s, { petIds: ids, bento: 'kibble', tool: null, goods: [] }).ok && s.trips[0].petIds.length === 2);
  check('没有便当时不能再派', !sim.dispatch(s, { petIds: [], bento: 'kibble', tool: null, goods: [] }).ok);
}

console.log('存档');
{
  const v1 = { v: 1, clock: T0, lastReal: T0, fish: 77, slots: 1, pets: [{ id: 'p1', name: '老猫', spriteId: 'default:orange', age: 5 * DAY, food: 40, mood: 50, clean: 60, weakSince: null, dead: false, tripId: null, repeats: {}, hungryNotified: false, adoptedAt: T0 - DAY }],
    trips: [], postcards: [], souvenirs: { shell: 2 }, inv: { kibble: 3 }, owned: { ball: true }, pond: [null, T0, null], lastCheckin: '', pendingReturns: [], dev: { enabled: false, speed: 1, growth: 1, decay: { food: 1, mood: 1, clean: 1 } } };
  const r = migrate(v1, T0);
  check('v1 旧存档能升级到当前版本', r.ok && r.state.v === SAVE_VERSION && r.from === 1);
  if (r.ok) {
    check('升级后原来的进度都在', r.state.fish === 77 && r.state.pets[0].name === '老猫' && r.state.pets[0].age === 5 * DAY && r.state.souvenirs.shell === 2 && r.state.inv.kibble === 3 && r.state.owned.ball === true && r.state.pond[1] === T0);
    check('升级后新字段有默认值', r.state.settings.notify === true && r.state.createdAt === T0 - DAY);
    sim.advance(r.state, DAY); check('升级后的存档可以继续玩', r.state.pets[0].food < 40);
  }
  check('来自更新版本的存档会被拒绝，而不是读坏', !migrate({ ...v1, v: SAVE_VERSION + 1 }).ok);
  check('不是存档的东西会被拒绝', !migrate({ hello: 1 }).ok && !migrate(null).ok && !migrate('abc').ok);
}
{
  const broken: any = { v: SAVE_VERSION, clock: 'oops', fish: -50, slots: 99, pets: [{ id: 'a', food: 999, mood: NaN, tripId: 'ghost' }, { name: '没编号' }, { id: 'b', dead: true, tripId: 't1' }],
    trips: [{ id: 't1', petIds: ['b', 'zzz'], destId: 'nowhere' }], postcards: [{ id: 'c1', destId: 'park' }, { id: 'c2', destId: 'nope' }], pendingReturns: ['c1', 'c9'], pond: [1, 'x'], inv: { kibble: -2, can: 2.7 } };
  const s = repair(broken, T0);
  check('坏数据会被修好', s.clock === T0 && s.fish === 0 && s.slots <= CONFIG.maxPets && s.pets.length === 2 && s.pets[0].food === 100 && s.pets[0].mood === 50 && s.pets[0].tripId === null);
  check('对不上的行程、明信片会被清掉', s.trips.length === 0 && s.postcards.length === 1 && s.pendingReturns.length === 1 && s.pond.length === CONFIG.pond.slots && s.pond[1] === null && s.inv.kibble === undefined && s.inv.can === 2);
  let threw = false; try { sim.advance(s, 3 * DAY); } catch { threw = true; }
  check('修好的存档可以继续玩不报错', !threw);
}
{
  const s = sim.newState(T0); s.fish = 321; sim.advance(s, 5 * HOUR);
  const text = JSON.stringify(buildExport(s, { 'custom:x': '{"sheet":"data:,"}', 'asset:y': 'no' }, '{"objects":{}}'));
  const r = parseImport(text, T0 + 9 * DAY);
  check('导出再导入，进度一样', r.ok && r.state.fish === 321 && near(r.state.pets[0].food, s.pets[0].food) && r.state.clock === s.clock);
  check('导入只带自定义宠物的图片和布局', r.ok && Object.keys(r.sprites).join() === 'custom:x' && r.layout === '{"objects":{}}');
  check('导入后从现在接着算，不补算导出之后的时间', r.ok && r.state.lastReal === T0 + 9 * DAY);
  check('存档文字被截断时报错而不是读坏', !parseImport(text.slice(0, text.length - 30)).ok);
}

console.log('提醒');
{
  const s = sim.newState(T0); const p = s.pets[0]; s.inv.kibble = 2;
  let plan = sim.planReminders(s);
  const hungry = plan.find((r) => r.title.includes('饿了'))!;
  check('会在饱食降到提醒线的时候提醒', !!hungry && near(hungry.inMs, ((p.food - CONFIG.stats.notifyFoodBelow) / CONFIG.stats.decayPerHour.food) * HOUR, 1));
  sim.advance(s, hungry.inMs + MIN); check('到了那个时间，饱食确实降到提醒线以下', p.food < CONFIG.stats.notifyFoodBelow && p.food > CONFIG.stats.notifyFoodBelow - 1);
  const s2 = sim.newState(T0); s2.owned.feeder = true;
  check('有喂食机就不发饿了的提醒', sim.planReminders(s2).length === 0);
  const s3 = sim.newState(T0); s3.inv.kibble = 1; sim.dispatch(s3, { petIds: [s3.pets[0].id], bento: 'kibble', tool: null, goods: [] });
  plan = sim.planReminders(s3);
  check('出门的宠物只提醒回家', plan.length === 1 && plan[0].title.includes('回家') && plan[0].inMs === s3.trips[0].returnAt - s3.clock);
}

console.log(failed ? `\n有 ${failed} 项没通过` : '\n全部通过');
process.exit(failed ? 1 : 0);
