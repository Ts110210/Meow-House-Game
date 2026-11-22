// 规则和存档的自动检查。运行：npm test
import { ZONES, MOMENTS, VISITORS, QUESTS, NEIGHBORS, SEASON_EVENTS, SEASON_FINDS, CONFIG, DAY, DECOR, DESTS, FUR_COLORS, GEAR, HOUR, MIN, ROOM_THEMES, SKIN_PRICE, SKIN_SIZE, SKINNABLE, SKINS, SOUVENIRS, decodeLook, encodeLook, skinSize } from '../src/config';
import { SPRITE } from '../src/config';
import { ASSETS } from '../src/assets.config';
import * as sim from '../src/sim';
import * as sheetCut from '../src/sheetCut';
import { rowLift } from '../src/assembleLift';
import * as light from '../src/light';
import { TREASURES } from '../src/config';
import { diaryPlaceCount, writeDiary } from '../src/diary';
import { buildExport, migrate, parseImport, repair, SAVE_VERSION } from '../src/save';

let failed = 0;
function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? '  通过' : '✗ 失败'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; }
/** 新存档，第一只宠物固定成「爱冒险」（它不影响状态下降），这样每次跑结果都一样 */
// 开局自带的装饰清掉，下面算装饰件数的测试从零开始（开局自带的另外测）
const blank = (now = T0) => { const s = sim.newState(now); s.pets[0].trait = 'adventurer'; s.decor = []; return s; };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const T0 = new Date(2026, 0, 1, 9, 0, 0).getTime();

console.log('时间补算');
{
  const a = blank(), b = blank();
  sim.advance(a, 8 * HOUR);
  for (let i = 0; i < 480; i++) sim.advance(b, MIN);
  const pa = a.pets[0], pb = b.pets[0];
  check('一次补 8 小时 = 一分钟一分钟过 8 小时', near(pa.food, pb.food) && near(pa.mood, pb.mood) && near(pa.clean, pb.clean) && a.clock === b.clock, `${pa.food} vs ${pb.food}`);
  const c = blank();
  for (let i = 0; i < 8 * 3600; i += 7) sim.advance(c, 7000); // 每帧一小段
  check('很多小段加起来也一样', near(c.pets[0].food, pa.food, 0.05) && near(c.pets[0].mood, pa.mood, 0.05), `${c.pets[0].food} vs ${pa.food}`);
  const before = JSON.stringify(a); sim.advance(a, 0); sim.advance(a, -5000);
  check('时间不前进或倒退时什么都不变', JSON.stringify(a) === before);
}
{
  const s = blank(); const p = s.pets[0];
  const hoursToZero = CONFIG.stats.start.food / sim.foodRate(s, p);
  sim.advance(s, (hoursToZero - 0.1) * HOUR); check('饱食归零前不会虚弱', p.weakSince === null);
  sim.advance(s, 0.2 * HOUR); check('饱食归零后进入虚弱', p.weakSince !== null && !p.dead);
  sim.advance(s, CONFIG.weak.timeToDeath[0] - HOUR); check('幼年虚弱不到 3 天不会离家出走', !sim.isLost(p));
  const ev = sim.advance(s, 2 * HOUR); check('幼年虚弱满 3 天离家出走（不会死），并且有事件', sim.isLost(p) && !p.dead && ev.some((e) => e.type === 'ranAway'));
  const stats = [p.food, p.mood, p.clean, p.age]; sim.advance(s, 30 * DAY);
  check('出走期间状态和年龄都不变', p.food === stats[0] && p.mood === stats[1] && p.clean === stats[2] && p.age === stats[3]);
  check('出走的宠物不能喂、不能派出门', !sim.feed(s, p.id, 'kibble').ok && sim.homePets(s).length === 0);
}

console.log('离家出走和狸花猫');
{
  const lost = () => { const s = blank(); const p = s.pets[0]; p.lostSince = T0; p.food = 0; return { s, p }; };
  { const { s, p } = lost(); check('没有猫条时请不动狸花猫', !sim.sendSearch(s, p.id).ok && p.searchUntil === null); }
  const realRandom = Math.random;
  try {
    { const { s, p } = lost(); s.inv.treat = 2;
      check('给一根猫条，狸花猫出门找', sim.sendSearch(s, p.id).ok && s.inv.treat === 1 && p.searchUntil === T0 + CONFIG.runaway.searchTime);
      check('同一时间只能找一只', !sim.sendSearch(s, p.id).ok && s.inv.treat === 1);
      check('提醒里有狸花猫回来的时间', sim.planReminders(s).some((r) => r.inMs === CONFIG.runaway.searchTime));
      Math.random = () => 0.5;
      check('不到 2 小时不会有结果', sim.advance(s, CONFIG.runaway.searchTime - MIN).every((e) => e.type !== 'found' && e.type !== 'notFound') && sim.isLost(p));
      const ev = sim.advance(s, 2 * MIN);
      const inRange = (v: number) => v >= CONFIG.runaway.returnStatMin && v <= CONFIG.runaway.returnStatMax + 1e-9;
      check('2 小时后被带回来，三项状态都在 1–30 之间', ev.some((e) => e.type === 'found') && !sim.isLost(p) && inRange(p.food + 0.5) && inRange(p.mood + 0.5) && inRange(p.clean + 0.5), `${p.food} ${p.mood} ${p.clean}`);
      check('带回来之后可以正常喂', sim.feed(s, p.id, 'kibble').ok); }
    { const { s, p } = lost(); s.inv.treat = 2; sim.sendSearch(s, p.id); Math.random = () => 0.1;
      const ev = sim.advance(s, CONFIG.runaway.searchTime + MIN);
      check('两成的时候没找到：还在外面，猫条已经用掉', ev.some((e) => e.type === 'notFound') && sim.isLost(p) && p.searchUntil === null && s.inv.treat === 1);
      check('没找到可以再给一根接着找', sim.sendSearch(s, p.id).ok); }
    { let fails = 0; const N = 4000; let seed = 12345; Math.random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
      let lo = 100, hi = 0;
      for (let i = 0; i < N; i++) { const { s, p } = lost(); s.inv.treat = 1; sim.sendSearch(s, p.id); sim.advance(s, CONFIG.runaway.searchTime); if (sim.isLost(p)) fails++; else { lo = Math.min(lo, p.food, p.mood, p.clean); hi = Math.max(hi, p.food, p.mood, p.clean); } }
      check('试 4000 次：失败率约 20%，带回的状态都在 1–30', Math.abs(fails / N - CONFIG.runaway.failChance) < 0.03 && lo >= 1 && hi <= 30, `${fails / N} ${lo} ${hi}`); }
  } finally { Math.random = realRandom; }
}

console.log('旅行收藏');
{
  const realRandom = Math.random; Math.random = () => 0.01; // 一定带回纪念品，并且先出稀有
  try {
    const s = blank(); const p = s.pets[0]; const got: (string | null)[] = [];
    for (let i = 0; i < 4; i++) { s.inv.kibble = 1; p.food = 80; p.mood = 80; p.clean = 80; sim.dispatch(s, { petIds: [p.id], bento: 'kibble', tool: null, goods: [] }); const dest = s.trips[0].destId; sim.advance(s, s.trips[0].returnAt - s.clock + MIN); got.push(s.postcards[s.postcards.length - 1].souvenir); if (i === 0) (s as any)._first = dest; }
    const owned = Object.keys(s.souvenirs);
    check('纪念品不会重复拿到', owned.length === got.filter(Boolean).length && Object.values(s.souvenirs).every((n) => n === 1));
    check('每张明信片都记着是哪个地方', s.postcards.every((c) => !!c.destId));
  } finally { Math.random = realRandom; }
  check('10 个地方，每地 2 件纪念品（一普通一稀有）', (() => { return DESTS.length === 10 && DESTS.every((d: any) => d.souvenirs.length === 2 && SOUVENIRS[d.souvenirs[0]] && !SOUVENIRS[d.souvenirs[0]].rare && SOUVENIRS[d.souvenirs[1]]?.rare && SOUVENIRS[d.souvenirs[1]].desc); })());
  check('相册上限 = 地方数 × 5 = 50（每趟两张）', sim.albumLimit() === 50);
  const s = blank();
  for (let i = 0; i < 50; i++) s.postcards.push({ id: 'c' + i, destId: 'penang', petIds: [], at: T0 + i, souvenir: null, income: 0, sold: [], unsold: [] });
  check('默认挂最新的 4 张', sim.shownPostcards(s).map((c) => c.id).join() === 'c49,c48,c47,c46');
  sim.toggleDisplayPostcard(s, 'c49'); sim.toggleDisplayPostcard(s, 'c0');
  check('可以自己换：取下一张、挂上一张', sim.shownPostcards(s).map((c) => c.id).join() === 'c48,c47,c46,c0');
  check('挂满 4 张后不能再加', !sim.toggleDisplayPostcard(s, 'c5').ok);
  s.inv.kibble = 1; s.inv.camera = 1; const p = s.pets[0]; sim.dispatch(s, { petIds: [p.id], bento: 'kibble', tool: 'camera', goods: [] }); sim.advance(s, s.trips[0].returnAt - s.clock + MIN);
  const fresh = s.postcards[s.postcards.length - 1];
  check('相册满了不会自动删：路上寄的和带回来的都先收下，多出 2 张等主人整理', s.postcards.length === 52 && sim.albumOver(s) === 2 && s.postcards.some((c) => c.id === 'c1'));
  check('路上寄来的那张标着「信」，两张都有日记、季节和时段', s.postcards[50].kind === 'letter' && fresh.kind === undefined && [s.postcards[50], fresh].every((c) => !!c.diary && c.diary.length > 8 && !!c.season && !!c.time));
  check('明信片记着带了什么行李，还有自己的随机数', fresh.tool === 'camera' && typeof fresh.seed === 'number');
  { const t = JSON.parse(JSON.stringify(s)); check('主人自己删一张旧的，就不超了', sim.deletePostcard(t, 'c1').ok && sim.deletePostcard(t, 'c2').ok && sim.albumOver(t) === 0 && t.postcards.some((c: any) => c.id === fresh.id)); }
  { const t = JSON.parse(JSON.stringify(s)); sim.toggleDisplayPostcard(t, 'c0'); const before = sim.shownPostcards(t).length; sim.deletePostcard(t, sim.shownPostcards(t)[0].id); check('删掉挂在墙上的那张，墙上也跟着取下', sim.shownPostcards(t).every((c: any) => t.postcards.some((x: any) => x.id === c.id)) && before >= 1); }
  { const t = JSON.parse(JSON.stringify(s)); check('不整理直接退出：放弃新带回来的那两张，旧的一张不少', sim.discardOverflow(t) === 2 && t.postcards.length === 50 && !t.postcards.some((c: any) => c.id === fresh.id) && t.postcards.some((c: any) => c.id === 'c1') && !t.pendingReturns.includes(fresh.id)); }
  sim.discardOverflow(s);
  for (let i = 0; i < 12; i++) s.souvenirs[Object.keys(SOUVENIRS)[i]] = 1;
  check('收藏柜默认摆 9 件，其余收着', sim.shownSouvenirs(s).length === 9);
  const hidden = Object.keys(s.souvenirs).find((id) => !sim.shownSouvenirs(s).includes(id))!;
  check('摆满 9 件后不能再加', !sim.toggleDisplaySouvenir(s, hidden).ok);
  sim.toggleDisplaySouvenir(s, sim.shownSouvenirs(s)[0]);
  check('收起一件再摆另一件', sim.toggleDisplaySouvenir(s, hidden).ok && sim.shownSouvenirs(s).includes(hidden) && sim.shownSouvenirs(s).length === 9);
}

console.log('旅途来信和日记');
{
  let ok = true; const fr: number[] = [];
  for (let i = 0; i < 300; i++) { const s = blank(); s.inv.kibble = 1; sim.dispatch(s, { petIds: [s.pets[0].id], bento: 'kibble', tool: null, goods: [] }); const t = s.trips[0]; const f = (t.letterAt - t.startAt) / (t.returnAt - t.startAt); fr.push(f); if (f < 0.3 || f > 0.7) ok = false; }
  check('寄信的时间在行程的 30%–70% 之间，而且每趟不一样', ok && Math.max(...fr) - Math.min(...fr) > 0.25);
  check('每个地点至少 3 句日记', DESTS.every((d) => diaryPlaceCount(d.id) >= 3));
  const seen = new Set<string>(); let bad = '';
  for (const d of DESTS) for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) for (const time of ['day', 'dusk', 'night'] as const) for (const tool of [null, 'camera', 'float', 'umbrella', 'boots', 'tent']) for (const names of [['小橘'], ['小橘', '团子']]) {
    const t = writeDiary({ destId: d.id, season, time, tool, names, letter: true }); seen.add(t); if (/[{}]|undefined|我们们/.test(t) || t.length < 12) bad = t;
  }
  check('日记里没有没填上的空、句子够多样', bad === '' && seen.size > 150, bad || String(seen.size));
  const base = JSON.parse(JSON.stringify(blank())); base.pets[0].tripId = 't1';
  const old = repair({ ...base, trips: [{ id: 't1', petIds: [base.pets[0].id], bento: 'kibble', tool: null, goods: [], startAt: T0, returnAt: T0 + HOUR, destId: 'bali' }] }, T0);
  check('旧存档里正在路上的那一趟不会补寄信', old.trips[0].letterSent === true);
}

console.log('性格和友情');
{
  const mk = (trait: any) => { const s = blank(); s.pets[0].trait = 'adventurer'; s.slots = 3; sim.adopt(s, '甲', 'default:grey', trait); sim.adopt(s, '乙', 'default:cow', trait === 'tidy' ? 'glutton' : 'tidy'); return { s, a: s.pets[1], b: s.pets[2] }; };
  { const { s, a, b } = mk('glutton'); a.food = b.food = 90; sim.advance(s, 5 * HOUR);
    check('贪吃：饱食掉得快 20%', near((90 - a.food) / (90 - b.food), 1.2, 0.01), `${a.food} ${b.food}`);
    s.inv.kibble = 2; a.mood = b.mood = 40; a.food = b.food = 30; sim.feed(s, a.id, 'kibble'); sim.feed(s, b.id, 'kibble');
    check('贪吃：吃东西额外加心情', near(a.mood - b.mood, CONFIG.traits.glutton.eatMood, 0.01)); }
  { const { s, a, b } = mk('clingy'); a.mood = b.mood = 40; sim.petPet(s, a.id); sim.petPet(s, b.id);
    check('黏人：被摸时心情加得多', near((a.mood - 40) / (b.mood - 40), CONFIG.traits.clingy.petMood, 0.01));
    a.mood = b.mood = 90; a.food = b.food = 100; a.clean = b.clean = 100; sim.advance(s, 2 * HOUR); const early = [90 - a.mood, 90 - b.mood];
    check('黏人：刚被摸过，心情掉得和别人一样', near(early[0], early[1], 0.01));
    a.mood = b.mood = 90; a.food = b.food = 100; a.clean = b.clean = 100; sim.advance(s, 2 * HOUR); sim.advance(s, 2 * HOUR);
    check('黏人：太久没人理，心情掉得快', (90 - a.mood) > (90 - b.mood) * 1.1, `${a.mood} ${b.mood}`); }
  { const { s, a, b } = mk('tidy'); a.clean = b.clean = 100; sim.advance(s, 4 * HOUR);
    check('爱干净：干净值掉得慢', near((100 - a.clean) / (100 - b.clean), CONFIG.traits.tidy.cleanDecay, 0.01));
    sim.advance(s, 5 * DAY); check('爱干净：自己舔毛的保底线更高', near(a.clean - b.clean, CONFIG.traits.tidy.cleanFloorBonus, 0.01), `${a.clean} ${b.clean}`); }
  { const { s, a, b } = mk('tidy'); const A = a.id, B = b.id;
    check('一开始不是朋友', sim.friendship(s, A, B) === 0 && !sim.bestFriends(s, A, B));
    a.mood = b.mood = 10; sim.companionPlay(s, A, B);
    check('一起玩：友情增加，各加 3 心情', sim.friendship(s, A, B) === CONFIG.friendship.perPlay && near(a.mood, 13));
    s.inv.kibble = 9; for (let i = 0; i < 4; i++) { a.food = b.food = a.mood = b.mood = a.clean = b.clean = 80; sim.dispatch(s, { petIds: [A, B], bento: 'kibble', tool: null, goods: [] }); sim.advance(s, s.trips[0].returnAt - s.clock + MIN); }
    check('一起出门 4 趟就成了好朋友，友情不超过上限', sim.bestFriends(s, A, B) && sim.friendship(s, A, B) === CONFIG.friendship.best);
    a.mood = b.mood = 10; sim.companionPlay(s, A, B);
    check('好朋友一起玩，心情加倍', near(a.mood, 10 + CONFIG.actions.companionPlayMood * 2));
    check('宠物面板能列出朋友，好朋友排前面', sim.friendsOf(s, A)[0].pet.id === B && sim.friendsOf(s, A)[0].best && sim.friendsOf(s, A).length === 2);
    const r = repair(JSON.parse(JSON.stringify(s)), T0); check('友情和性格存档再读档还在', r.friends[sim.friendKey(A, B)] === 100 && r.pets[1].trait === 'tidy'); }
  { const raw = JSON.parse(JSON.stringify(blank())); delete raw.pets[0].trait; delete raw.friends; raw.friends = { 'x|y': 50 };
    const r1 = repair(JSON.parse(JSON.stringify(raw)), T0), r2 = repair(JSON.parse(JSON.stringify(raw)), T0);
    check('旧存档的宠物补上一种性格，每次读档都一样；没有主的友情被清掉', !!r1.pets[0].trait && r1.pets[0].trait === r2.pets[0].trait && Object.keys(r1.friends).length === 0); }
  { // 爱冒险：统计去远处的比例和纪念品
    const far = (trait: any) => { let n = 0; for (let i = 0; i < 1500; i++) { const s = blank(); s.pets[0].trait = trait; s.inv.can = 1; s.pets[0].food = s.pets[0].mood = s.pets[0].clean = 90; sim.dispatch(s, { petIds: [s.pets[0].id], bento: 'can', tool: null, goods: [] }); if (DESTS.find((d) => d.id === s.trips[0].destId)!.tier > 1) n++; } return n / 1500; };
    const fa = far('adventurer'), fo = far('tidy'); check('爱冒险：更常去远的地方', fa > fo + 0.03, `${fa} ${fo}`); }
}

console.log('访客');
{
  const V = CONFIG.visitors; const counts = [0, 0, 0]; const kinds: Record<string, number> = {};
  /** 已经玩了一天以上的存档（第一天不来访客） */
  const aged = () => { const s = blank(); s.createdAt -= V.firstAfter; return s; };
  { const s = blank(); s.visitorDay = sim.dayKey(s.clock); s.visitorQuota = 2; check('开始玩的第一天不来访客', sim.openDoorToVisitors(s).length === 0 && s.visitors.length === 0 && s.visitorQuota === 2); }
  for (let i = 0; i < 3000; i++) { const s = aged(); sim.openDoorToVisitors(s); counts[s.visitorQuota + s.visitors.length]++; for (const v of s.visitors) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1; }
  check('每天来 0–2 个，比例大约 25% / 50% / 25%', Math.abs(counts[0] / 3000 - 0.25) < 0.04 && Math.abs(counts[1] / 3000 - 0.5) < 0.04 && Math.abs(counts[2] / 3000 - 0.25) < 0.04, counts.join());
  check('三类事都会出现', ['gift', 'trade', 'errand'].every((k) => kinds[k] > 100), JSON.stringify(kinds));
  const real = Math.random;
  try {
    Math.random = () => 0.99; // 今天来 2 个
    const s = aged(); const e1 = sim.openDoorToVisitors(s);
    check('打开游戏时出现在门口，一次只来一个', e1.length === 1 && s.visitors.length === 1 && s.visitorQuota === 1);
    check('门口有人时不会再来', sim.openDoorToVisitors(s).length === 0);
    const ev = sim.advance(s, V.stay + MIN);
    check('几个小时没理会，自己走了', s.visitors.length === 0 && ev.some((e) => e.type === 'visitorLeft'));
    check('同一天的第二个：再打开时来', sim.openDoorToVisitors(s).length === 1 && s.visitorQuota === 0);
    s.visitors = []; sim.advance(s, 3 * HOUR); check('今天的名额用完就不来了', sim.openDoorToVisitors(s).length === 0);
    sim.advance(s, DAY); check('第二天重新算', sim.openDoorToVisitors(s).length === 1);
  } finally { Math.random = real; }
  { const s = blank(); const v = sim.makeVisitor(s, 'courier', 'gift'); v.fish = 12; delete v.item; s.visitors.push(v); const f = s.fish;
    check('送礼：收下就拿到，访客离开', sim.answerVisitor(s, v.id, true).ok && s.fish === f + 12 && s.visitors.length === 0); }
  { const s = blank(); const v = sim.makeVisitor(s, 'neighbor', 'trade'); v.wants = 'can'; s.visitors.push(v); s.inv.can = 0;
    check('换东西：给的是一件还没有的稀有纪念品', !!SOUVENIRS[v.gives!]?.rare);
    check('换东西：没有它想要的食物换不了，访客还在', !sim.answerVisitor(s, v.id, true).ok && s.visitors.length === 1);
    s.inv.can = 1; check('换东西：有了就能换到', sim.answerVisitor(s, v.id, true).ok && (s.inv.can ?? 0) === 0 && s.souvenirs[v.gives!] === 1); }
  { const s = blank(); const v = sim.makeVisitor(s, 'tabby', 'errand'); v.destId = 'bali'; s.visitors.push(v);
    check('托送信：接下后记在手上', sim.answerVisitor(s, v.id, true).ok && s.errand?.destId === 'bali' && s.visitors.length === 0);
    check('手上有信时，新来的访客不会再托信', Array.from({ length: 200 }, () => sim.makeVisitor(s)).every((x) => x.kind !== 'errand'));
    const tier = DESTS.find((d) => d.id === 'bali')!.tier; const bento = ['', 'kibble', 'can', 'feast'][tier]; s.inv[bento] = 1; s.inv.kibble = 1;
    if (tier > 1) check('便当不够好到不了那里', !sim.errandReachable(s, 'kibble'));
    const p = s.pets[0]; p.food = p.mood = p.clean = 90; const reward = s.errand!.reward;
    sim.dispatch(s, { petIds: [p.id], bento, tool: null, goods: [], errand: true });
    check('选了顺路送信，就一定去那里', s.trips[0].destId === 'bali' && s.errand === null && s.trips[0].errandReward === reward);
    const f = s.fish; const ev = sim.advance(s, s.trips[0].returnAt - s.clock + MIN);
    check('送到后拿到谢礼', ev.some((e) => e.type === 'errandDone') && s.fish >= f + reward); }
  { const s = blank(); const v = sim.makeVisitor(s, 'tabby', 'errand'); s.visitors.push(v); sim.answerVisitor(s, v.id, true); sim.advance(s, V.errandExpire + MIN);
    check('信太久没送就作废', s.errand === null); }
  { const s = blank(); s.visitors.push(sim.makeVisitor(s, 'courier', 'trade')); const v = sim.makeVisitor(s, 'tabby', 'errand'); s.visitors.push(v); sim.answerVisitor(s, v.id, true);
    const r = repair(JSON.parse(JSON.stringify(s)), T0); check('访客和手上的信存档再读档还在', r.visitors.length === 1 && r.visitors[0].kind === 'trade' && r.errand?.destId === s.errand!.destId); }
}

console.log('图鉴和里程碑');
{
  const s = blank(new Date(2026, 3, 10, 10).getTime()); const p = s.pets[0]; s.dev.enabled = true;
  const go = (season: any, time: any) => { s.dev.season = season; s.dev.time = time; p.food = p.mood = p.clean = 90; s.inv.kibble = 1; sim.dispatch(s, { petIds: [p.id], bento: 'kibble', tool: null, goods: [] }); const d = s.trips[0].destId; sim.advance(s, s.trips[0].returnAt - s.clock + MIN); return d; };
  const d1 = go('spring', 'day');
  check('出一趟门，记下这个地方的一种变体（路上和回家是同一种，只算一次）', sim.variantsOf(s, d1).length === 1 && sim.variantsOf(s, d1)[0] === 'spring-day' && sim.variantTotal(s) === 1);
  for (const se of ['spring', 'summer', 'autumn', 'winter']) for (const t of ['day', 'dusk', 'night']) for (let i = 0; i < 6; i++) go(se, t);
  const tier1 = DESTS.filter((d) => d.tier === 1);
  check('每个地方最多 12 种，不会重复记', tier1.every((d) => sim.variantsOf(s, d.id).length <= 12 && new Set(sim.variantsOf(s, d.id)).size === sim.variantsOf(s, d.id).length) && sim.variantTotal(s) > 20, String(sim.variantTotal(s)));
  const before = sim.variantTotal(s); for (const c of [...s.postcards]) sim.deletePostcard(s, c.id);
  check('删掉明信片，图鉴记录还在', s.postcards.length === 0 && sim.variantTotal(s) === before);
  const m10 = sim.milestoneStatus(s).find((m) => m.id === 'v10')!; const f = s.fish;
  check('达到里程碑可以领一次奖励', m10.ready && sim.claimMilestone(s, 'v10').ok && s.fish === f + m10.fish && !sim.claimMilestone(s, 'v10').ok);
  check('没达到的领不了', !sim.claimMilestone(s, 'v120').ok && !sim.claimMilestone(s, 's20').ok);
  for (const id of Object.keys(SOUVENIRS)) s.souvenirs[id] = 1;
  check('纪念品集齐 20 件：奖励里有特殊装饰，先收着', sim.souvenirTotal(s) === 20 && sim.claimMilestone(s, 's20').ok && s.decor.some((d) => d.kind === 'trophy' && d.zone === null));
  const r = repair(JSON.parse(JSON.stringify(s)), T0); check('图鉴、里程碑、装饰存档再读档还在', sim.variantTotal(r) === before && r.milestones.includes('v10') && r.decor.length === 1);
  const old = JSON.parse(JSON.stringify(blank())); delete old.variants; old.postcards = [{ id: 'c1', destId: 'bali', petIds: [], at: T0, souvenir: null, season: 'winter', time: 'night', income: 0, sold: [], unsold: [] }];
  check('旧存档：相册里已有的明信片会补记进图鉴', repair(old, T0).variants.bali?.[0] === 'winter-night');
}

console.log('开局自带的装饰');
{
  const s = sim.newState(T0); const st = s.decor.filter((d) => d.starter);
  check('新存档一开始就摆好了地毯、挂画、盆栽（原来画在背景里的那些）', st.length === ASSETS.starterDecor.length && st.every((d) => !!DECOR[d.kind] && !!d.zone));
  check('门口和客厅是大地毯，浴室、卧室、收藏柜是中地毯，厨房是小圆垫', ['door', 'living'].every((z) => st.some((d) => d.zone === z && d.kind === 'bigrug')) && ['bath', 'bedroom', 'shelf'].every((z) => st.some((d) => d.zone === z && d.kind === 'midrug')) && st.some((d) => d.zone === 'kitchen' && d.kind === 'mat'));
  s.fish = 10000; const n = sim.decorCount(s, 'plant');
  check('开局自带的不算在「最多买几件」里', n === 0 && [1, 2, 3, 4].every(() => sim.buyDecor(s, 'plant').ok) && !sim.buyDecor(s, 'plant').ok);
  check('大地毯、中地毯、几幅小画商店里也有卖', ['bigrug', 'midrug', 'leafpic', 'sunpic', 'duopic', 'triopic'].every((k) => DECOR[k] && !DECOR[k].special && DECOR[k].price > 0));
  const old = JSON.parse(JSON.stringify(sim.newState(T0))); old.v = 6; old.decor = [{ id: 'd1', kind: 'lamp', zone: 'living', x: 300, y: 640 }];
  const m1 = migrate(old, T0); const r = m1.ok ? m1.state : null; const m2 = r ? migrate(JSON.parse(JSON.stringify(r)), T0) : null;
  check('旧存档读档时补上一份开局自带的，原来摆的不动；再读一次不会重复补', !!r && r.decor.length === 1 + ASSETS.starterDecor.length && r.decor[0].kind === 'lamp' && r.decor.filter((d) => d.starter).length === ASSETS.starterDecor.length && !!m2?.ok && m2.state.decor.length === r.decor.length);
}

console.log('任务：新手引导和每日任务');
{
  const s = blank(); s.fish = 1000; const p = s.pets[0]; p.food = 50; p.mood = 50; p.clean = 50;
  let st = sim.questStatus(s);
  check('新存档先走新手引导，一共 10 步', st.mode === 'guide' && st.items.length === QUESTS.guide.length && QUESTS.guide.length === 10 && st.claimable === 0);
  check('没做到的领不了', !sim.claimQuest(s, 'pet').ok);
  sim.petPet(s, p.id); sim.feed(s, p.id, 'kibble'); sim.checkin(s);
  st = sim.questStatus(s);
  check('摸一摸、喂一顿、签到之后这三步变成可以领', ['pet', 'feed', 'checkin'].every((id) => st.items.find((x) => x.id === id)!.done) && st.claimable === 3);
  const f0 = s.fish; const r = sim.claimQuest(s, 'pet');
  check('领取：加小鱼干，不能重复领', r.ok && s.fish === f0 + QUESTS.guide[0].reward && !sim.claimQuest(s, 'pet').ok);
  for (const g of QUESTS.guide) sim.questEvent(s, g.key);
  let total = 0; for (const g of QUESTS.guide) { const before = s.fish; if (sim.claimQuest(s, g.id).ok) total += s.fish - before; }
  st = sim.questStatus(s);
  check('全部领完：引导结束，开始每日任务（3 个）', st.mode === 'daily' && st.items.length === QUESTS.dailyCount && new Set(st.items.map((x) => x.id)).size === QUESTS.dailyCount && total > 0);
  for (const it of st.items) sim.questEvent(s, it.key, it.need);
  check('每日任务做够次数就能领', sim.questStatus(s).items.every((x) => x.done) && !sim.claimDailyBonus(s).ok);
  for (const it of st.items) sim.claimQuest(s, it.id);
  const f1 = s.fish; check('全部领完再领额外奖励，一天一次', sim.claimDailyBonus(s).ok && s.fish === f1 + QUESTS.dailyBonus && !sim.claimDailyBonus(s).ok);
  sim.advance(s, DAY); st = sim.questStatus(s);
  check('第二天换一批新的，进度从零开始', st.items.length === QUESTS.dailyCount && st.items.every((x) => x.got === 0 && !x.claimed) && !st.bonusClaimed);
  check('每日任务一天能多赚大约 75–105', (() => { const r = QUESTS.daily.map((q) => q.reward).sort((a, b) => a - b); const lo = r.slice(0, 3).reduce((a, b) => a + b, 0) + QUESTS.dailyBonus, hi = r.slice(-3).reduce((a, b) => a + b, 0) + QUESTS.dailyBonus; return lo >= 70 && hi <= 110; })());
  const old = JSON.parse(JSON.stringify(sim.newState(T0))); old.v = 7; delete old.quests; old.clock += 2 * DAY;
  const m = migrate(old, T0); check('已经玩了一阵的旧存档不走引导，直接每日任务', m.ok && m.state.quests.guideDone);
  const young = JSON.parse(JSON.stringify(sim.newState(T0))); young.v = 7; delete young.quests;
  const m2 = migrate(young, T0); check('刚开的旧存档照样走引导', m2.ok && !m2.state.quests.guideDone);
  const m3 = migrate(JSON.parse(JSON.stringify(s)), T0); check('任务进度存档再读档还在', m3.ok && m3.state.quests.guideDone && m3.state.quests.daily.length === QUESTS.dailyCount);
}

console.log('整张切图');
{
  // 一张 40×20 的图：左边一块方的、右边一块方的、中间隔开；右边那块中间有一道 1 像素的缝（不该被切成两件）；还有一个孤零零的杂点
  const w = 40, h = 20, a = new Uint8Array(w * h); const fill = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = 1; };
  fill(2, 2, 12, 18); fill(24, 2, 30, 18); fill(31, 2, 38, 18); a[0] = 1;
  const L = sheetCut.labelPieces(a, w, h, 2, 1, 0.01);
  check('按内容找出两件：小缝不会把一件切开，孤零零的杂点不算', L.blobs.length === 2 && L.blobs[0].x0 <= 2 && L.blobs[0].x1 >= 12 && L.blobs[1].x0 <= 24 && L.blobs[1].x1 >= 38);
  check('从左到右排好，每个格子知道自己属于哪一件', L.blobs[0].x0 < L.blobs[1].x0 && L.label[(4 / 2 | 0) * L.gw + 3] === 0 && L.label[(4 / 2 | 0) * L.gw + 17] === 1);
  check('CRC32 算得对（标准测试值）', sheetCut.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926);
  const zip = sheetCut.makeZip([{ name: 'public/assets/objects/door.png', data: new Uint8Array([1, 2, 3]) }, { name: 'public/assets/decor/rug.png', data: new Uint8Array([4, 5]) }]);
  const dv = new DataView(zip.buffer); const endAt = zip.length - 22;
  check('zip：开头和结尾的标记对，记着 2 个文件，文件名带着 public/assets/ 的文件夹', dv.getUint32(0, true) === 0x04034b50 && dv.getUint32(endAt, true) === 0x06054b50 && dv.getUint16(endAt + 10, true) === 2 && new TextDecoder().decode(zip.slice(30, 30 + 30)) === 'public/assets/objects/door.png');
  check('窗户（包括它的皮肤）按素材模板的比例挖玻璃，别的不挖', !!sheetCut.glassOf('object.kitchenWindow') && sheetCut.glassOf('object.bedroomWindow@cream') === ASSETS.objects.bedroomWindow.glass && sheetCut.glassOf('object.door') === null && sheetCut.glassOf('decor.rug') === null);
}

console.log('精灵图拼装：保留跳跃高度');
{
  // 4 帧一样高（100），原图里脚底分别在 500、400、300、500：最低的 500 当地面
  const hs = [100, 100, 100, 100], bs = [500, 400, 300, 500];
  const off = rowLift(hs, bs, 1, false);
  check('关着：每帧都贴地', off.dy.every((d) => d === 0) && off.fit === 1);
  const on = rowLift(hs, bs, 1, true, 1000, 0.9);
  check('打开：按原图抬高，最低的那帧贴地', on.dy[0] === 0 && on.dy[1] === 100 && on.dy[2] === 200 && on.dy[3] === 0 && on.fit === 1);
  const high = rowLift(hs, [500, 300, 100, 500], 1, true, 256, 0.9);
  check('跳得太高放不下：一起压低，最高的那帧刚好顶到格子上沿，最低的还是贴地', high.fit < 1 && Math.abs(high.dy[2] + 100 - 256 * 0.9) < 1e-6 && high.dy[0] === 0 && Math.abs(high.dy[1] / high.dy[2] - 0.5) < 1e-6);
  check('默认每一行都关（跳跃是原地跳，高度由程序的弧线负责）', !SPRITE.keepHeight.includes('jump') && !SPRITE.keepHeight.includes('walk'));
}

console.log('光影：跟着真实时间');
{
  const at = (h: number, w: 'clear' | 'rain' = 'clear') => light.lightAt(h, w);
  check('六个时段的名字', ['清晨', '上午', '中午', '下午', '黄昏', '夜晚', '夜晚'].every((n, i) => light.phaseName([6, 9, 12, 15, 18, 21, 2][i]) === n));
  check('中午画面不变色、太阳最强；夜里没有太阳、灯最亮', at(12.5).indoor === '#FFFFFF' && at(12.5).sun === 1 && at(23).sun === 0 && at(23).glow === 1 && at(12.5).glow === 0);
  check('清晨偏粉（红比蓝多）、黄昏偏橙（红远多于蓝）、夜里偏蓝（蓝比红多）', (() => {
    const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [r1, , b1] = rgb(at(6).outdoor), [r2, , b2] = rgb(at(18).outdoor), [r3, , b3] = rgb(at(23).outdoor);
    return r1 > b1 && r2 - b2 > r1 - b1 && b3 > r3;
  })());
  check('平滑过渡：每隔 6 分钟颜色变化都很小', (() => { let worst = 0; for (let h = 0; h < 24; h += 0.1) { const a = at(h).outdoor, b = at(h + 0.1).outdoor; for (const i of [1, 3, 5]) worst = Math.max(worst, Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16))); } return worst <= 12; })());
  check('下雨天白天：灯和屋里的固定光源也开着，屋里按白天的亮度算、只轻轻偏灰', at(12.5, 'rain').glow >= 0.7 && at(12.5, 'rain').day === 1 && at(12.5).glow === 0 && parseInt(at(12.5, 'rain').indoor.slice(1, 3), 16) > parseInt(at(12.5, 'rain').outdoor.slice(1, 3), 16));
  const m = light.sunShadow(at(7.5)), n = light.sunShadow(at(12.3)), e = light.sunShadow(at(17.5));
  check('影子：早上往右拉长、中午短、傍晚往左拉长', m.dx > 0.5 && e.dx < -0.5 && Math.abs(n.dx) < 0.1 && n.dy < m.dy && n.dy < e.dy);
  check('下雨：没有太阳（影子和窗户光都关掉），画面偏冷偏灰', at(12.5, 'rain').sun === 0 && at(12.5, 'rain').indoor !== '#FFFFFF' && (() => { const c = at(12.5, 'rain').indoor; return parseInt(c.slice(5, 7), 16) >= parseInt(c.slice(1, 3), 16); })());
  // 超高：家具挡光、朝光面、每个光源的影子
  const box = { x0: 100, y0: 100, x1: 200, y1: 200, zone: 0 };
  check('家具挡光：光源和这一点中间隔着家具才算挡住；家具自己身上不算', light.blocked(50, 150, 260, 150, box) && !light.blocked(50, 150, 80, 150, box) && !light.blocked(50, 150, 150, 150, box) && !light.blocked(50, 50, 260, 40, box));
  const lampL: light.LightSource = { x: 0, y: 400, zone: 1, power: 1, radius: 300, color: '#FFC27A' }, lampR: light.LightSource = { ...lampL, x: 400, color: '#FF9C55' };
  const d1 = light.lightDir([lampL], 150, 500, 1, () => false)!;
  check('朝光面：只有左边一盏灯，亮的一面朝左；隔壁房间的灯不算', d1.dx < 0 && light.lightDir([lampL], 150, 500, 2, () => false) === null);
  const d2 = light.lightDir([lampL, { ...lampR, power: 3 }], 150, 500, 1, () => false)!;
  check('两盏灯：更亮更近的那盏决定朝哪边、用它的颜色', d2.dx > 0 && d2.color === '#FF9C55');
  const sl = light.lampShadow(lampL, 150, 600), sr = light.lampShadow(lampR, 150, 600);
  check('每盏灯各投一道影子，背离光源：左边的灯往右投、右边的灯往左投', sl.alpha > 0 && sr.alpha > 0 && sl.dx > 0 && sr.dx < 0);
  const near = light.lampShadow({ ...lampL, x: 140 }, 150, 600), far = light.lampShadow(lampL, 260, 600);
  check('灯在头顶影子短、离得近更浓；斜着照影子长', near.dy < far.dy && near.alpha > far.alpha && Math.abs(near.dx) < Math.abs(far.dx));
  const grid = { x0: 0, y0: 0, cell: 10, cols: 40, rows: 10 };
  const lm = light.lightMap(light.lightAt(23, 'clear'), grid, () => 0, () => false, [{ x: 50, y: 50, zone: 0, power: 1, radius: 400, color: '#FFFFFF' }], [{ x0: 150, y0: 0, x1: 200, y1: 100, zone: 0 }]);
  const px = (i: number) => lm[(5 * 40 + i) * 4];
  const open = light.lightMap(light.lightAt(23, 'clear'), grid, () => 0, () => false, [{ x: 50, y: 50, zone: 0, power: 1, radius: 400, color: '#FFFFFF' }]);
  check('光照图：离灯近的亮、远的暗；家具背光的那一边比没有家具时暗得多', px(8) >= px(13) && px(13) > px(30) && open[(5 * 40 + 25) * 4] > px(25) + 40);
  const s = blank();
  s.dev.enabled = true; s.dev.hour = 18.5;
  check('开发者面板拖的时间：光影和昼夜都按它', sim.lightHour(s) === 18.5 && sim.dayTime(s) === 'dusk');
  s.dev.hour = null; s.dev.time = 'night';
  check('选了「夜晚」：光影用夜里的时间', sim.dayTime(s) === 'night' && light.lightAt(sim.lightHour(s), 'clear').sun === 0);
  check('新存档默认「简单」；读档时不认识的值修成「简单」', s.settings.light === 'simple' && repair({ ...s, settings: { ...s.settings, light: 'max' as any } }).settings.light === 'simple');
}

console.log('猫的日记、猫叼回来的礼物');
{
  const s = blank(); const p = s.pets[0]; p.name = '豆豆'; s.inv.kibble = 5;
  sim.feed(s, p.id, 'kibble'); sim.feed(s, p.id, 'kibble'); sim.petPet(s, p.id);
  const today = sim.diaryDay(s.clock); const facts = s.diary.days[today];
  check('照顾它会记进日记；同一天吃两顿只记一条、算 2 次', facts.filter((f) => f.k === 'feed').length === 1 && facts.find((f) => f.k === 'feed')!.c === 2 && facts.some((f) => f.k === 'pet'));
  const pg = sim.diaryPage(s, today);
  check('日记写成句子：有名字、吃了几顿', pg.featured.length === 1 && pg.featured[0].lines.some((l) => l.includes('豆豆') && l.includes('2')) && pg.featured[0].lines.length <= CONFIG.diary.linesEach);
  check('同一天的句子每次打开都一样', JSON.stringify(sim.diaryPage(s, today)) === JSON.stringify(pg));
  check('看过日记之后红点消失，有新的又亮', (sim.markDiarySeen(s), !sim.diaryUnread(s)) && (sim.advance(s, 1000), sim.petPet(s, p.id), sim.diaryUnread(s)));
  // 多只猫：每页主角最多 3 只，其他的各一句；连着几天都是同一只最热闹，好几天没当主角的会被轮上
  const m = blank(); m.pets = []; for (let i = 0; i < 5; i++) { const q = sim.newPet('猫' + i, 'default:orange', m.clock); m.pets.push(q); }
  for (let d = 0; d < 4; d++) {
    const t = m.clock + d * DAY;
    m.pets.forEach((q, i) => { for (let j = 0; j <= (i === 0 ? 3 : 0); j++) sim.note(m, q.id, ['tripBack', 'gift', 'neighbor', 'feed'][j], undefined, t); if (i > 0) sim.note(m, q.id, 'feed', undefined, t); });
  }
  m.clock += 5 * DAY; sim.tidyDiary(m);
  const page = sim.diaryPage(m, sim.diaryDay(m.clock - 5 * DAY));
  check('多只猫：每页最多 3 只写得详细，其他的各一句', page.featured.length === 3 && page.others.length === 2 && page.others.every((o) => o.line.length > 0));
  const leads = Object.values(m.diary.lead).flat();
  check('轮流当主角：4 天里每只猫都当过', m.pets.every((q) => leads.includes(q.id)));
  // 只留 30 天，收藏的一直留着
  const k = sim.diaryDay(m.clock - 5 * DAY); sim.starDiary(m, k);
  m.clock += 40 * DAY; sim.note(m, m.pets[0].id, 'pet'); 
  check('超过 30 天的日记删掉，收藏的一页留着', !!m.diary.days[k] && Object.keys(m.diary.days).length === 2);
  check('读档时日记原样保留', JSON.stringify(repair(JSON.parse(JSON.stringify(m))).diary.days[k]) === JSON.stringify(m.diary.days[k]));
  // 礼物
  const g = blank(); const rnd = Math.random;
  check('离开没多久：没有礼物', sim.welcomeBack(g, HOUR).length === 0);
  Math.random = () => 0.01; // 一定会叼回来，而且是稀有的
  const got = sim.welcomeBack(g, 6 * HOUR); Math.random = rnd;
  check('离开很久：在门口留了礼物，日记里也记着；你不在时的事也补进日记', got.length === 1 && g.gifts.length === 1 && Object.values(g.diary.days).flat().some((f) => f.k === 'gift') && Object.values(g.diary.days).flat().some((f) => f.k.startsWith('away')));
  const r = sim.collectGift(g, got[0].id);
  check('稀有礼物捡起来进图鉴，还是一件能摆出来的装饰', r.ok && !!g.treasures[got[0].kind] && TREASURES[got[0].kind].rare === true && g.decor.some((d) => d.kind === got[0].kind && d.zone === null));
  g.gifts.push({ id: 'x', kind: 'feather', petId: g.pets[0].id, at: g.clock }); sim.advance(g, CONFIG.gifts.expire + MIN);
  check('门口的礼物放太久没捡会不见', g.gifts.length === 0);
}

console.log('装饰的摆放规则');
{
  const world = (extra: Partial<sim.PlaceWorld> = {}): sim.PlaceWorld => ({ zoneW: 432, floorY: 560, height: 720, wall: [{ x0: 28, y0: 156, x1: 216, y1: 312, label: '厨房的窗户' }], foot: [{ x0: 40, y0: 539, x1: 200, y1: 573, label: '橱柜' }], keepClear: [{ x0: 100, y0: 560, x1: 330, y1: 640, label: '门前的路' }], ...extra });
  const P = (k: string, z: string, x: number, y: number, w: number, h: number, wd = world()) => sim.decorProblem(k, z, x, y, w, h, wd);
  check('挂画不能挂到窗户上', /窗户/.test(P('painting', 'kitchen', 122, 300, 150, 120) ?? ''));
  check('挂画挂在空墙上可以', P('painting', 'kitchen', 330, 500, 150, 120) === null);
  check('挂画不能超出墙（碰到天花板、踢脚线或者跨到别的房间）', !!P('painting', 'kitchen', 330, 100, 150, 120) && !!P('painting', 'kitchen', 330, 556, 150, 120) && !!P('painting', 'kitchen', 400, 400, 150, 120));
  check('阳台和院子没有墙，挂不了画', !!P('painting', 'balcony', 200, 300, 150, 120) && !!P('poster', 'garden', 200, 300, 84, 84));
  check('院子里什么装饰都不能摆', !!P('plant', 'garden', 200, 650, 80, 90) && !!P('rug', 'garden', 200, 700, 300, 64));
  check('阳台只能摆户外也合适的（盆栽、灯笼、雪人…），书架、落地灯、地毯不行', P('plant', 'balcony', 300, 700, 80, 90, world({ keepClear: [], foot: [] })) === null && !!P('shelf', 'balcony', 300, 700, 130, 190) && !!P('lamp', 'balcony', 300, 700, 96, 250) && !!P('rug', 'balcony', 216, 700, 300, 64));
  check('摆地上的：脚底和家具叠在一起不行（塞到橱柜后面）', /橱柜/.test(P('shelf', 'kitchen', 120, 570, 130, 190, world({ keepClear: [] })) ?? ''));
  check('摆地上的：在家具前面、脚底不叠就可以', P('shelf', 'kitchen', 120, 660, 130, 190, world({ keepClear: [] })) === null);
  check('摆地上的：不能挡门前的路、猫的站位', /门前的路/.test(P('plant', 'kitchen', 216, 600, 80, 90) ?? ''));
  check('地毯要整块铺在这个房间的地板上（不能伸到别的房间、不能翻到墙上）', !!P('rug', 'kitchen', 380, 700, 300, 64) && !!P('rug', 'kitchen', 216, 600, 300, 64) && P('rug', 'kitchen', 216, 700, 300, 64) === null);
  check('地毯可以压在家具下面', P('rug', 'kitchen', 150, 640, 300, 64) === null);
  const s = blank(); s.fish = 1000; sim.buyDecor(s, 'painting'); const id = s.decor[0].id;
  check('放不下的时候不摆，说出原因', !sim.placeDecor(s, id, 'kitchen', 122, 300, world(), [150, 120]).ok && s.decor[0].zone === null && sim.placeDecor(s, id, 'kitchen', 330, 500, world(), [150, 120]).ok);
}

console.log('房间装饰');
{
  const s = blank(); s.fish = 1000;
  check('商店里的装饰价格都在 50–300 之间', Object.values(DECOR).filter((d) => !d.special).every((d) => d.price >= 50 && d.price <= 300) && Object.values(DECOR).filter((d) => !d.special).length >= 5);
  check('买一件：扣小鱼干，先收着', sim.buyDecor(s, 'plant').ok && s.fish === 1000 - DECOR.plant.price && sim.storedDecor(s).length === 1);
  check('特殊装饰买不到', !sim.buyDecor(s, 'trophy').ok);
  const id = s.decor[0].id;
  check('摆到客厅', sim.placeDecor(s, id, 'living', 120.4, 600).ok && s.decor[0].zone === 'living' && s.decor[0].x === 120 && sim.storedDecor(s).length === 0);
  check('可以挪到别的房间', sim.placeDecor(s, id, 'bedroom', 200, 610).ok && s.decor[0].zone === 'bedroom');
  check('不存在的房间放不了', !sim.placeDecor(s, id, 'attic', 0, 0).ok);
  check('收起来不会丢，还能再摆', sim.storeDecor(s, id).ok && s.decor.length === 1 && s.decor[0].zone === null && sim.placeDecor(s, id, 'living', 50, 600).ok);
  for (let i = 0; i < 5; i++) sim.buyDecor(s, 'plant');
  check('同一种最多买 4 件', sim.decorCount(s, 'plant') === CONFIG.decor.maxPerKind);
  s.fish = 5000; for (const k of ['cushion', 'mat', 'poster']) for (let i = 0; i < 4; i++) sim.buyDecor(s, k);
  let placed = 0; for (const d of s.decor) if (sim.placeDecor(s, d.id, 'kitchen', 100, 600).ok) placed++;
  check('一个区域最多摆 8 件', placed === CONFIG.decor.maxPerZone && s.decor.filter((d) => d.zone === 'kitchen').length === 8);
  s.fish = 10; check('小鱼干不够买不了', !sim.buyDecor(s, 'shelf').ok);
  const r = repair(JSON.parse(JSON.stringify(s)), T0); check('装饰和位置存档再读档还在', r.decor.length === s.decor.length && r.decor.filter((d) => d.zone === 'kitchen').length === 8);
  const bad = JSON.parse(JSON.stringify(s)); bad.decor.push({ id: 'x', kind: 'unicorn', zone: 'living', x: 0, y: 0 }); bad.decor[0].zone = 'nowhere';
  const rb = repair(bad, T0); check('存档里不认识的装饰丢掉，不认识的房间当作收起来', !rb.decor.some((d) => d.kind === 'unicorn') && rb.decor[0].zone === null);
}

console.log('新手保护');
{
  const s = blank(); const p = s.pets[0]; p.food = 80; s.slots = 2; sim.adopt(s, '二号', 'default:grey', 'tidy'); const q = s.pets[1]; q.food = 80;
  sim.advance(s, 10 * HOUR);
  check('第一只宠物幼年期饱食掉得慢一半', Math.abs((80 - p.food) - 15) < 0.2 && Math.abs((80 - q.food) - 30) < 0.2, `${p.food} ${q.food}`);
  check('提醒时间也按慢的速度算', sim.planReminders(s).find((r) => r.title.startsWith(p.name))!.inMs > sim.planReminders(s).find((r) => r.title.startsWith('二号'))!.inMs);
  p.age = CONFIG.growth.stageDuration + 1; p.food = 80; sim.advance(s, 10 * HOUR);
  check('长到青年以后恢复正常速度', Math.abs((80 - p.food) - 30) < 0.2, String(p.food));
}

console.log('逗猫棒和毛色');
{
  const s = blank(); const p = s.pets[0]; p.mood = 20;
  sim.play(s, p.id); check('空手陪玩：心情 +10', Math.abs(p.mood - 30) < 0.01, String(p.mood));
  const s2 = blank(); const q = s2.pets[0]; q.mood = 20; s2.fish = 100;
  check('逗猫棒可以在商店买到', sim.buy(s2, 'wand').ok && s2.owned.wand === true);
  sim.play(s2, q.id); check('有逗猫棒：心情 +24', Math.abs(q.mood - 44) < 0.01, String(q.mood));
  check('有 10 种内置毛色', Object.keys(FUR_COLORS).length === 10 && ['tabby', 'calico', 'tortie', 'cow', 'siamese', 'persian'].every((k) => FUR_COLORS[k]));
  const look = { pattern: 'calico' as const, body: '#fbf6ec', c2: '#f0994a', c3: '#4a4550', eye: '#3b2a22', long: true };
  const id = encodeLook(look); const back = decodeLook(id);
  check('自己捏的样子存进编号里再读出来不变', !!back && JSON.stringify(back) === JSON.stringify(look));
  check('乱写的编号读不出来', decodeLook('look:zebra|#fff|x|y|z|0') === null && decodeLook('default:orange') === null);
  check('领养自己捏的猫，之后还能换回内置毛色', sim.adopt(Object.assign(s, { slots: 2 }), '捏捏', id).ok && sim.setColor(s, s.pets[1].id, 'cow').ok && s.pets[1].spriteId === 'default:cow' && sim.setColor(s, s.pets[1].id, id).ok);
  const r = repair(JSON.parse(JSON.stringify(s)), T0); check('自己捏的猫存档再读档还在', r.pets[1].spriteId === id);
}

console.log('家具、皮肤和房间风格');
{
  check('每件「家里的东西」要么是场景里的家具，要么是逗猫棒这样的道具', GEAR.every((g) => g.id === 'wand' || ASSETS.objects[g.id]?.needsOwned === g.id));
  check('背景里的灯都变成了要买的东西：两盏吊灯、床头灯会发光，落地灯是能摆的装饰', ['pendantDoor', 'pendantShelf', 'bedlamp'].every((k) => !!ASSETS.objects[k].light && GEAR.some((g) => g.id === k)) && ['lamp', 'sidelamp'].every((k) => DECOR[k].layer === 'stand' && !!DECOR[k].light) && !ASSETS.objects.lamp);
  check('有 5 套皮肤，第一套是默认款', SKINS.length === 5 && SKINS[0].id === 'wood' && Object.keys(SKINS[0].palette).length === 0);
  check('所有固定家具（院子的树跟着季节换，不算）、「家里的东西」里的家具和所有装饰都有皮肤，名字不冲突', Object.entries(ASSETS.objects).every(([k, d]) => d.seasonal ? !SKIN_SIZE[k] : !!SKIN_SIZE[k]) && Object.keys(DECOR).every((k) => skinSize(k) !== null) && new Set(SKINNABLE).size === SKINNABLE.length);
  check('每款皮肤、每张图片都配了路径', Object.keys(ASSETS.objects).every((k) => !!ASSETS.objects[k].src) && Object.keys(DECOR).every((k) => !!ASSETS.decor[k]));
  const s = blank(); s.fish = 200;
  check('默认款不用买；固定家具一开始就能换皮肤', sim.skinOf(s, 'bed') === 'wood' && sim.ownsSkin(s, 'bed', 'wood') && !sim.ownsSkin(s, 'bed', 'mint'));
  check('第一次换上一款：扣钱、记下买过', sim.setSkin(s, 'bed', 'mint').ok && s.fish === 200 - SKIN_PRICE.L && sim.skinOf(s, 'bed') === 'mint' && sim.ownsSkin(s, 'bed', 'mint'));
  check('换回默认款、再换回买过的款都不再扣钱', sim.setSkin(s, 'bed', 'wood').ok && sim.skinOf(s, 'bed') === 'wood' && sim.setSkin(s, 'bed', 'mint').ok && s.fish === 200 - SKIN_PRICE.L);
  check('小件便宜，大件贵', sim.skinPrice('bowl') === SKIN_PRICE.S && sim.skinPrice('scratcher') === SKIN_PRICE.M && sim.skinPrice('sofa') === SKIN_PRICE.L && sim.skinPrice('cushion') === SKIN_PRICE.S && sim.skinPrice('shelf') === SKIN_PRICE.L);
  check('钱不够买不了，也不会换上', (s.fish = 10, !sim.setSkin(s, 'sofa', 'navy').ok) && sim.skinOf(s, 'sofa') === 'wood' && s.fish === 10);
  s.fish = 2000;
  check('还没买的东西（猫抓板、没有的装饰）不能换皮肤', !sim.setSkin(s, 'scratcher', 'berry').ok && !sim.setSkin(s, 'rug', 'berry').ok && !sim.setSkin(s, 'bed', 'gold').ok && !sim.setSkin(s, 'window', 'mint').ok);
  check('买了之后就能换', sim.buy(s, 'scratcher').ok && sim.setSkin(s, 'scratcher', 'berry').ok && sim.buyDecor(s, 'rug').ok && sim.setSkin(s, 'rug', 'navy').ok);
  check('房间风格：默认的不用买，另外两套要买', ROOM_THEMES.length === 3 && sim.roomOf(s) === 'classic' && sim.ownsRoom(s, 'classic') && !sim.ownsRoom(s, 'seaside') && !sim.setRoom(s, 'seaside').ok);
  const before = s.fish;
  check('买下一套房间风格会直接换上，之后可以随便换', sim.buyRoom(s, 'seaside').ok && s.fish === before - ROOM_THEMES[1].price && sim.roomOf(s) === 'seaside' && !sim.buyRoom(s, 'seaside').ok && sim.setRoom(s, 'classic').ok && sim.setRoom(s, 'seaside').ok && s.fish === before - ROOM_THEMES[1].price);
  const r = repair(JSON.parse(JSON.stringify(s)), T0);
  check('皮肤和房间风格存档再读档还在', sim.skinOf(r, 'bed') === 'mint' && sim.skinOf(r, 'rug') === 'navy' && sim.roomOf(r) === 'seaside' && sim.ownsSkin(r, 'scratcher', 'berry'));
  const bad = JSON.parse(JSON.stringify(s)); bad.skins = { bed: 'navy', ghost: 'mint', sofa: 'gold' }; bad.room = 'sakura'; bad.roomsOwned = ['seaside', 'moon'];
  const rb = repair(bad, T0);
  check('存档里没买过的皮肤、不存在的款式和房间会被清掉', sim.skinOf(rb, 'bed') === 'wood' && !rb.skins.ghost && !rb.skins.sofa && sim.roomOf(rb) === 'classic' && rb.roomsOwned.length === 1);
  const old = JSON.parse(JSON.stringify(blank())); delete old.skins; delete old.skinsOwned; delete old.room; delete old.roomsOwned; old.v = 5; old.owned = { lamp: true };
  const ro = migrate(old); check('旧存档升级：皮肤和房间都是默认的，以前买的固定落地灯不再出现也不报错', ro.ok && sim.roomOf(ro.state) === 'classic' && Object.keys(ro.state.skins).length === 0 && sim.skinOf(ro.state, 'door') === 'wood');
}

console.log('公母和体型');
{
  const s = blank(); s.slots = 3;
  const many = Array.from({ length: 400 }, (_, i) => sim.newPet('猫' + i, 'default:orange', s.clock));
  const inRange = (p: any) => { const [a, b] = CONFIG.growth.adultSize[p.sex as 'm' | 'f']; return p.size >= a && p.size <= b; };
  check('新领养的猫有公母，成年大小落在自己公母的范围里（公 0.85–0.9，母 0.8–0.85）', many.every(inRange) && many.some((p) => p.sex === 'm') && many.some((p) => p.sex === 'f'));
  check('成年最大是最初设计的 90%', many.every((p) => p.size <= 0.9) && CONFIG.growth.adultSize.m[1] === 0.9);
  check('领养时可以指定公母', sim.newPet('a', 'default:orange', s.clock, 'tidy', 'f').sex === 'f' && sim.adopt(s, '小母', 'default:grey', undefined, 'm').ok && s.pets[s.pets.length - 1].sex === 'm');
  const p = s.pets[0];
  sim.devSetStage(s, p.id, 0); const kid = sim.bodySize(p); sim.devSetStage(s, p.id, 1); const young = sim.bodySize(p); sim.devSetStage(s, p.id, 2); const adult = sim.bodySize(p);
  // 2026-11-22 重定：成年 = 原来青年的 1.2 倍（青年 = 成年 ÷ 1.2），幼年 = 原来幼年的 1.1 倍（原来是成年的一半，成年缩到 0.8）
  check('开发者面板能直接设成幼年、青年、成年；青年是成年的 1/1.2，幼年是原来幼年的 1.1 倍', sim.stageOf(p) === 2 && Math.abs(kid - adult * 0.55 / 0.8) < 1e-9 && Math.abs(young - adult / 1.2) < 1e-9 && adult === p.size && kid < young && young < adult);
  check('三个阶段叫幼年、青年、成年', CONFIG.growth.stageNames.join() === '幼年,青年,成年');
  const old = JSON.parse(JSON.stringify(s)); delete old.pets[0].sex; delete old.pets[0].size; old.pets[1].size = 5;
  const r1 = repair(JSON.parse(JSON.stringify(old)), T0), r2 = repair(JSON.parse(JSON.stringify(old)), T0);
  check('旧存档读出来补上公母和大小，每次读都一样，乱写的大小会被修回范围里', r1.pets.every(inRange) && r1.pets[0].sex === r2.pets[0].sex && r1.pets[0].size === r2.pets[0].size && r1.pets[1].size !== 5);
  check('邻居和访客都有公母和大小，和家猫的范围一样', [...Object.values(NEIGHBORS), ...Object.values(VISITORS)].every(inRange));
}

console.log('邻居猫和常客');
{
  const s = blank(); s.fish = 0; const p = s.pets[0]; p.food = 80; p.mood = 50;
  check('有三只邻居，样子都画得出来', Object.keys(NEIGHBORS).length === 3 && Object.values(NEIGHBORS).every((n) => !!decodeLook(n.look) && n.notes.length >= 3 && n.stories.length >= 3));
  s.hood.day = sim.dayKey(s.clock); s.hood.quota = 0;
  check('今天没有名额就不来', sim.openDoorToNeighbors(s).length === 0 && s.hood.now === null);
  s.hood.quota = 2;
  check('开始玩的第一天不来串门（免得以为家里多了一只猫）', sim.openDoorToNeighbors(s).length === 0 && s.hood.now === null && s.hood.quota === 2);
  check('开发者面板叫来的不受这个限制', sim.openDoorToNeighbors(s, 'mochi').length === 1 && sim.sendNeighborHome(s) !== null && s.hood.now === null);
  s.createdAt -= CONFIG.neighbors.firstAfter; s.hood.last = -1e15; s.hood.bonds = {}; // 上面叫来的那次让麻薯熟了一点，清掉免得影响下面
  const ev = sim.openDoorToNeighbors(s);
  check('有名额就来一只，名额减一', ev.length === 1 && ev[0].type === 'neighbor' && !!s.hood.now && s.hood.quota === 1 && s.hood.now.leaveAt > s.clock);
  check('家里已经有一只邻居时不会再来第二只', sim.openDoorToNeighbors(s).length === 0);
  const id = s.hood.now!.id;
  check('和宠物玩一次：加心情、变熟；同一次串门里和同一只只算一次', sim.neighborMeet(s, p.id) && p.mood === 50 + CONFIG.neighbors.playMood && sim.bondOf(s, id) === CONFIG.neighbors.bondPerPlay && !sim.neighborMeet(s, p.id));
  const evs = sim.advance(s, CONFIG.neighbors.stay[1] + MIN);
  check('待够了就走，走了更熟一点', s.hood.now === null && evs.some((e) => e.type === 'neighborLeft') && sim.bondOf(s, id) === CONFIG.neighbors.bondPerPlay + CONFIG.neighbors.bondPerVisit);
  check('刚走不会马上又来（要隔一阵）', sim.openDoorToNeighbors(s).length === 0 && (sim.advance(s, CONFIG.neighbors.gap), s.hood.day = sim.dayKey(s.clock), sim.openDoorToNeighbors(s).length === 1));
  sim.sendNeighborHome(s);
  check('还不熟不能回访', !sim.visitNeighbor(s, p.id, id).ok && !sim.visitNeighbor(s, p.id, 'nobody').ok);
  s.hood.bonds[id] = CONFIG.neighbors.friendAt; p.food = 80; const mood0 = p.mood;
  check('成了朋友可以去它家玩：这段时间不在家，也不能喂', sim.visitNeighbor(s, p.id, id).ok && !!p.outing && sim.homePets(s).length === 0 && !sim.feed(s, p.id, 'kibble').ok && !sim.visitNeighbor(s, p.id, id).ok);
  const food0 = p.food; const back = sim.advance(s, CONFIG.neighbors.outing + MIN);
  check('半小时后回来：加心情、更熟、带回一句小见闻，在邻居家不挨饿', !p.outing && p.mood > mood0 && back.some((e) => e.type === 'outingBack' && e.text.includes(p.name)) && s.hood.stories.length === 1 && sim.bondOf(s, id) === CONFIG.neighbors.friendAt + CONFIG.neighbors.outingBond && food0 - p.food < 3);
  s.finds = [{ id: 'f1', kind: 'fish', from: id, at: s.clock, x: 0.1 }, { id: 'f2', kind: 'flower', from: id, at: s.clock, x: 0.2 }, { id: 'f3', kind: 'note', from: id, at: s.clock, x: 0.3, text: '你好' }];
  const r1 = sim.collectFind(s, 'f1'), r2 = sim.collectFind(s, 'f2'), r3 = sim.collectFind(s, 'f3');
  check('捡院子里的东西：小鱼换小鱼干，小花和纸条记进收集', r1.ok && s.fish >= CONFIG.neighbors.giftFish[0] && r2.ok && sim.keepsakeCount(s, 'flower', id) === 1 && r3.ok && r3.msg!.includes('你好') && sim.keepsakeCount(s, 'note', id) === 1 && s.finds.length === 0 && !sim.collectFind(s, 'f1').ok);
  s.finds = [{ id: 'old', kind: 'flower', from: id, at: s.clock, x: 0.1 }]; sim.advance(s, CONFIG.neighbors.findExpire + HOUR);
  check('太久没捡的东西会不见', !s.finds.some((f) => f.id === 'old'));
  let gifts = 0; for (let i = 0; i < 300; i++) { const t = blank(); t.hood.bonds.mochi = 100; sim.openDoorToNeighbors(t, 'mochi'); sim.sendNeighborHome(t); gifts += t.finds.length; }
  check('朋友走的时候经常留下小东西（约七成）', gifts > 160 && gifts < 260, String(gifts));
  const r = repair(JSON.parse(JSON.stringify(s)), T0);
  check('邻居的熟悉度、小见闻、收集存档再读档还在；旧存档补默认值', sim.bondOf(r, id) === sim.bondOf(s, id) && r.hood.stories.length === 1 && sim.keepsakeCount(r, 'note', id) === 1 && repair({ ...JSON.parse(JSON.stringify(blank())), hood: undefined, finds: undefined, keepsakes: undefined, favor: undefined }, T0).hood.now === null);

  const v = blank(); v.fish = 0; const give = () => { const x = sim.makeVisitor(v, 'tabby', 'gift'); v.visitors.push(x); return sim.answerVisitor(v, x.id, true); };
  give(); give(); check('帮访客办成事会加好感，婉拒不加', v.favor.tabby === 2 && (() => { const x = sim.makeVisitor(v, 'tabby', 'gift'); v.visitors.push(x); sim.answerVisitor(v, x.id, false); return v.favor.tabby === 2; })());
  const third = give();
  check('好感到 3：成了常客，送小鱼干和一款皮肤（不用买）', third.ok && third.msg!.includes('常客') && sim.ownsSkin(v, 'bowl', 'berry') && sim.skinOf(v, 'bowl') === 'wood' && v.favorClaimed.includes('tabby:0'));
  const fishBefore = v.fish; sim.setSkin(v, 'bowl', 'berry'); check('送的皮肤换上不扣钱', sim.skinOf(v, 'bowl') === 'berry' && v.fish === fishBefore);
  for (let i = 0; i < 4; i++) give();
  check('好感到 7：送商店买不到的装饰；每份回礼只送一次', v.decor.some((d) => d.kind === 'bell') && v.decor.filter((d) => d.kind === 'bell').length === 1 && (give(), v.decor.filter((d) => d.kind === 'bell').length === 1) && sim.favorStatus(v, 'tabby').next === null && sim.favorStatus(v, 'courier').next === 3);
  check('回礼和季节奖励的装饰都有名字、图片路径，商店里不卖', ['bell', 'lantern', 'parcel', ...Object.values(SEASON_EVENTS).map((e) => e.reward)].every((k) => DECOR[k]?.special && !!ASSETS.decor[k]) && Object.keys(SEASON_FINDS).length === 12);
}

console.log('季节活动、皮肤的其他来源、瞬间相册');
{
  const s = sim.newState(new Date(2026, 6, 10, 10).getTime()); s.fish = 0; const E = SEASON_EVENTS.spring;
  check('春天的活动：三种小东西各要捡几个', sim.seasonEventStatus(s).season === 'spring' && sim.seasonEventStatus(s).items.length === 3 && !sim.seasonEventStatus(s).done);
  sim.advance(s, CONFIG.seasonEvent.gap + MIN);
  check('过一阵院子里会冒出这一季的小东西', s.finds.length >= 1 && s.finds.length <= 2 && s.finds.every((f) => E.items.some((it) => it.id === f.kind)));
  sim.advance(s, 3 * DAY);
  check('离开很久也只会攒到院子放满为止', s.finds.length <= CONFIG.neighbors.maxFinds && s.finds.length >= 1);
  s.finds = [];
  const give = (kind: string) => { s.finds.push({ id: 'x' + Math.random(), kind, at: s.clock, x: 0.1 }); return sim.collectFind(s, s.finds[s.finds.length - 1].id); };
  give(E.items[0].id); give(E.items[0].id); give(E.items[1].id); give(E.items[1].id); give(E.items[2].id);
  check('捡了记进度，没集齐不发奖', sim.seasonEventStatus(s).items.every((it, i) => it.have === (i < 2 ? 2 : 1)) && !sim.seasonEventStatus(s).done && s.fish === 0);
  const fin = give(E.items[2].id);
  check('集齐了：小鱼干加这一季限定的装饰', fin.ok && sim.seasonEventStatus(s).done && s.fish === E.fish && s.decor.some((d) => d.kind === E.reward) && s.seasonalClaimed.includes('spring'));
  const n0 = s.finds.length; sim.advance(s, CONFIG.seasonEvent.gap * 3);
  check('这一季完成之后不再冒新的', s.finds.length === n0);
  s.clock = s.seasonStart + CONFIG.season.days * DAY + HOUR;
  check('换季后是新的活动，进度清零', sim.seasonEventStatus(s).season === 'summer' && !sim.seasonEventStatus(s).done && sim.seasonEventStatus(s).items.every((it) => it.have === 0));
  s.clock = s.seasonStart + CONFIG.season.days * DAY * 4 + HOUR; s.finds = []; const f0 = s.fish;
  for (const it of E.items) { give(it.id); give(it.id); }
  check('下一轮春天可以再完成一次，但限定装饰只送一次', sim.seasonEventStatus(s).done && s.fish === f0 + E.fish && s.decor.filter((d) => d.kind === E.reward).length === 1);
  const r = repair(JSON.parse(JSON.stringify(s)), T0); check('季节活动的进度存档再读档还在', r.seasonal.done && r.seasonalClaimed.includes('spring') && repair({ ...JSON.parse(JSON.stringify(blank())), seasonal: undefined, moments: undefined }, T0).seasonal.key === '');

  const m = blank(); m.fish = 0; (m as any).variants = Object.fromEntries(DESTS.map((d) => [d.id, ['a', 'b']]));
  const got = sim.claimMilestone(m, 'v10');
  check('图鉴里程碑会送皮肤（不用买）', got.ok && sim.ownsSkin(m, 'album', 'mint') && got.msg!.includes('皮肤') && CONFIG.milestones.filter((x) => x.skin).length >= 4 && CONFIG.milestones.every((x) => !x.skin || skinSize(x.skin[0]) !== null));
  check('常客回礼里的皮肤也都是存在的家具和款式', Object.values(CONFIG.visitors.favor).flat().every((x) => !x.skin || (skinSize(x.skin[0]) !== null && SKINS.some((k) => k.id === x.skin![1]))));

  const a = blank(); const p = a.pets[0];
  const shot = sim.recordMoment(a, 'fishing', [p.id]);
  check('抓拍一个瞬间：记下是谁、什么时候、当时的季节和时段', !!shot && a.moments.length === 1 && sim.momentTitle(shot!).includes(p.name) && shot!.season === sim.season(a));
  check('同一种瞬间短时间内不重复拍；不认识的种类和不存在的宠物不拍', sim.recordMoment(a, 'fishing', [p.id]) === null && sim.recordMoment(a, 'nope', [p.id]) === null && sim.recordMoment(a, 'box', ['ghost']) === null && (sim.advance(a, CONFIG.moments.cooldown + HOUR), !!sim.recordMoment(a, 'fishing', [p.id])));
  const before = a.moments.length; for (let i = 0; i < CONFIG.moments.max + 5 - before; i++) { a.clock += CONFIG.moments.cooldown + HOUR; sim.recordMoment(a, 'box', [p.id]); }
  check('和明信片一样：满了也照样收下，不会自动删', a.moments.length === CONFIG.moments.max + 5 && sim.momentsOver(a) === 5);
  { const b = JSON.parse(JSON.stringify(a)); const newest = b.moments[0].id, oldest = b.moments[b.moments.length - 1].id;
    check('不整理就放弃新拍的那几张，旧的都留着', sim.discardMomentOverflow(b) === 5 && sim.momentsOver(b) === 0 && !b.moments.some((m: any) => m.id === newest) && b.moments.some((m: any) => m.id === oldest)); }
  for (let i = 0; i < 5; i++) sim.deleteMoment(a, a.moments[a.moments.length - 1].id);
  check('自己删掉几张（新的旧的都行）就不超了；还可以再删', sim.momentsOver(a) === 0 && sim.deleteMoment(a, a.moments[0].id).ok && a.moments.length === CONFIG.moments.max - 1);
  p.name = '改名了'; check('宠物改名后，旧照片上还是当时的名字', !sim.momentTitle(a.moments[a.moments.length - 1]).includes('改名了'));
  check('瞬间存档再读档还在', repair(JSON.parse(JSON.stringify(a)), T0).moments.length === a.moments.length);
}

console.log('新场景和新家具');
{
  check('一共 8 个区域，最后一个是院子；屋顶不是区域，是上面一层，有自己的图片路径', ZONES.length === 8 && ZONES[7].id === 'garden' && !ZONES.some((z) => (z.id as string) === 'roof') && !!ASSETS.room.top);
  check('扑蝴蝶的位置落在存在的区域里；窗台跟着窗户（固定家具）走，窗户有玻璃', Object.values(ASSETS.perches).every((p) => ZONES.some((z) => z.id === p.zone)) && !!ASSETS.perches.butterfly && ['kitchenWindow', 'bedroomWindow'].every((k) => !ASSETS.perches[k] && !!ASSETS.objects[k]?.glass && ASSETS.objects[k].wall));
  check('从背景里拆出来的固定家具都在，墙上的标了 wall', ['hooks', 'kitchenShelf', 'mirror', 'bathShelf', 'towel', 'shelfRack'].every((k) => ASSETS.objects[k]?.wall && !ASSETS.objects[k].needsOwned) && ['umbrella', 'chair', 'tree', 'fence'].every((k) => !!ASSETS.objects[k] && !ASSETS.objects[k].wall) && !!ASSETS.objects.tree.seasonal);
  {
    const R = ASSETS.roof, houseW = 7 * CONFIG.room.zoneWidth; const w = R.walk, o = R.outline;
    check('屋顶盖住门口到阳台（右屋檐在阳台右边），猫走的线从左到右、在屋顶轮廓里面', o[0][0] <= 0 && o[3][0] >= houseW && w.every((p, i) => i === 0 || p[0] > w[i - 1][0]) && w[0][0] >= o[0][0] && w[w.length - 1][0] <= o[3][0]);
    check('看星星的两个位置在平顶上', R.spots.length === 2 && R.spots.every((x) => x >= w[1][0] && x <= w[2][0]));
    const L = ASSETS.objects.ladder; const lu = 6 * CONFIG.room.zoneWidth + L.x;
    check('木梯子在阳台，顶端伸出天花板，正好够到屋顶走的那条线', L.zone === 'balcony' && L.y - L.height < 0 && lu > w[2][0] && lu < w[3][0] && Math.abs((L.y - L.height) - (w[2][1] + (w[3][1] - w[2][1]) * (lu - w[2][0]) / (w[3][0] - w[2][0]) - 720)) < 30);
    check('木梯子是固定家具，有皮肤可买', !L.needsOwned && sim.skinPrice('ladder') != null);
    check('上屋顶的概率低、最多两只', CONFIG.roof.chance <= 0.05 && CONFIG.roof.chanceAdventurer <= 0.12 && CONFIG.roof.max === 2 && CONFIG.roof.gap >= 5 * 60_000);
    check('看星星的瞬间用屋顶那一层当背景', MOMENTS.stargaze.zone === 'roof');
  }
  check('能钻进去的家具都写了遮挡线', ['tub', 'box', 'basket', 'tunnel'].every((k) => ASSETS.objects[k].frontFrom != null));
  const s = blank(); s.fish = 1000; const p = s.pets[0]; p.mood = 50;
  check('没有猫草盆啃不了', !sim.nibbleGrass(s, p.id));
  check('六件新家具都买得到', ['box', 'basket', 'catgrass', 'tunnel', 'autoball', 'heater'].every((k) => sim.buy(s, k).ok && !!s.owned[k]));
  check('啃猫草加一点心情，要隔一阵才能再加', sim.nibbleGrass(s, p.id) && p.mood === 50 + CONFIG.actions.grassMood && !sim.nibbleGrass(s, p.id) && (sim.advance(s, CONFIG.actions.grassCooldown + MIN), sim.nibbleGrass(s, p.id)));
}

console.log('猫爬架');
{
  const s = blank(); s.fish = 1000; sim.adopt(Object.assign(s, { slots: 3 }), '二号', 'default:grey'); const [a, b] = s.pets;
  check('没买猫爬架不能指定位置', !sim.setCatTree(s, 0, a.id).ok);
  check('买得到猫爬架', sim.buy(s, 'cattree').ok && !!s.owned.cattree);
  check('指定谁待在哪一层', sim.setCatTree(s, 0, a.id).ok && sim.setCatTree(s, 2, b.id).ok && s.cattree[0] === a.id && s.cattree[2] === b.id && s.cattree[1] === null);
  check('一只宠物只占一层：换到新的一层，原来那层空出来', sim.setCatTree(s, 1, a.id).ok && s.cattree[0] === null && s.cattree[1] === a.id);
  check('可以改回谁都可以；乱写的层和宠物会被拒绝', sim.setCatTree(s, 1, null).ok && s.cattree[1] === null && !sim.setCatTree(s, 5, a.id).ok && !sim.setCatTree(s, 0, 'ghost').ok);
  sim.setCatTree(s, 0, a.id); const raw = JSON.parse(JSON.stringify(s)); raw.cattree = [a.id, 'ghost']; const r = repair(raw, T0);
  check('存档再读档：位置还在，不存在的宠物被清掉，旧存档补成三层都空', r.cattree[0] === a.id && r.cattree[1] === null && r.cattree.length === 3 && repair({ ...raw, cattree: undefined }, T0).cattree.every((x) => x === null));
}

console.log('昼夜和四季');
{
  const at = (mo: number, h: number) => { const s = sim.newState(new Date(2026, mo, 10, h).getTime()); return s; };
  check('白天、傍晚、夜里按时间走', sim.dayTime(at(0, 10)) === 'day' && sim.dayTime(at(0, 18)) === 'dusk' && sim.dayTime(at(0, 23)) === 'night' && sim.dayTime(at(0, 3)) === 'night');
  const L = CONFIG.season.days * DAY; const after = (ms: number) => { const s = at(6, 10); s.clock += ms; return sim.season(s); };
  check('新存档从春天开始，和现实的月份无关', [0, 3, 6, 9].every((mo) => sim.season(at(mo, 10)) === 'spring'));
  check('每季持续配置里的天数，春夏秋冬一轮后回到春天', after(L - MIN) === 'spring' && after(L) === 'summer' && after(2 * L) === 'autumn' && after(3 * L) === 'winter' && after(4 * L - MIN) === 'winter' && after(4 * L) === 'spring' && after(9 * L) === 'summer');
  { const a = at(6, 10); sim.advance(a, L + HOUR); check('时间补算过了一季，季节跟着换', sim.season(a) === 'summer'); }
  { const old: any = JSON.parse(JSON.stringify(at(6, 10))); old.v = 4; delete old.seasonStart; old.clock += 100 * DAY; const r = migrate(old);
    check('旧存档升级后从春天开始算，之后照常轮换', r.ok && sim.season(r.state) === 'spring' && r.state.seasonStart === old.clock && (r.state.clock += L, sim.season(r.state) === 'summer')); }
  { const a = at(6, 10); a.clock += 2 * DAY + HOUR; const i = sim.seasonInfo(a);
    check('季节提示：第几天、还有几天、下一季', i.season === 'spring' && i.day === 3 && i.daysLeft === CONFIG.season.days - 2 && i.next === 'summer', JSON.stringify(i)); }
  { const real = (mo: number, d = 10) => { const a = at(mo, 10); a.settings.seasonMode = 'real'; a.clock = new Date(2026, mo, d, 10).getTime(); return a; };
    check('设置成跟现实月份：3–5 春、6–8 夏、9–11 秋、12–2 冬', sim.season(real(3)) === 'spring' && sim.season(real(6)) === 'summer' && sim.season(real(9)) === 'autumn' && sim.season(real(0)) === 'winter' && sim.season(real(11)) === 'winter');
    const j = sim.seasonInfo(real(0, 10)), k = sim.seasonInfo(real(4, 31));
    check('现实月份模式的天数：1 月 10 日是冬天第 41 天，5 月 31 日是春天最后一天', j.day === 41 && j.next === 'spring' && k.day === 92 && k.daysLeft === 1 && k.next === 'summer', JSON.stringify([j, k]));
    const r = repair(JSON.parse(JSON.stringify(real(6))), T0); check('季节的设置存档再读档还在；旧存档默认是游戏里的循环、不显示', r.settings.seasonMode === 'real' && repair({ ...JSON.parse(JSON.stringify(at(6, 10))), settings: { notify: true } }, T0).settings.seasonMode === 'cycle' && r.settings.showSeason === false); }
  { const a = at(6, 10); const w0 = sim.weather(a); const seen = new Set<string>(); let same = true;
    for (let i = 0; i < 400; i++) { const b = at(6, 10); b.clock += i * CONFIG.weather.block; seen.add(sim.weather(b)); const c = at(6, 10); c.clock = b.clock + CONFIG.weather.block / 2; if (Math.floor(c.clock / CONFIG.weather.block) === Math.floor(b.clock / CONFIG.weather.block) && sim.weather(c) !== sim.weather(b)) same = false; }
    check('天气由时间算出来：同一段时间里不变，长期看晴天和雨天都有', sim.weather(a) === w0 && same && seen.has('clear') && seen.has('rain'));
    a.dev.weather = 'rain'; check('开发者面板可以指定天气（没开开发者模式不生效）', sim.weather(a) === w0 && (a.dev.enabled = true, sim.weather(a) === 'rain') && repair(JSON.parse(JSON.stringify(a)), T0).dev.weather === 'rain' && repair({ ...JSON.parse(JSON.stringify(a)), dev: {} }, T0).dev.weather === 'auto'); }
  const s = at(6, 10); s.dev.time = 'night'; s.dev.season = 'winter';
  check('开发者开关没开开发者模式时不生效', sim.dayTime(s) === 'day' && sim.season(s) === 'spring');
  s.dev.enabled = true;
  check('开发者模式下一键切到夜里、冬天', sim.dayTime(s) === 'night' && sim.season(s) === 'winter');
}
{
  const s = blank(); const p = s.pets[0]; p.food = 0; sim.advance(s, MIN);
  const r = sim.feed(s, p.id, 'kibble');
  check('虚弱时喂食可以救回，心情受罚', r.ok && p.weakSince === null && p.mood <= CONFIG.stats.start.mood - CONFIG.weak.rescueMoodPenalty + 1);
}
{
  const s = blank(); s.owned.feeder = true; sim.advance(s, 10 * DAY);
  check('有自动喂食机就不会饿到虚弱', s.pets[0].weakSince === null && !s.pets[0].dead && s.pets[0].food >= CONFIG.stats.feederFoodFloor - 1e-9);
}
{
  const s = blank(); const p = s.pets[0]; s.owned.feeder = true;
  sim.advance(s, CONFIG.growth.stageDuration - HOUR); check('不到 7 天还是幼年', sim.stageOf(p) === 0);
  const ev = sim.advance(s, 2 * HOUR); check('满 7 天长到青年，并且有事件', sim.stageOf(p) === 1 && ev.some((e) => e.type === 'stage'));
  sim.advance(s, 30 * DAY); check('最多长到壮年', sim.stageOf(p) === 2);
}

{
  const solo = blank(); solo.owned.feeder = true; sim.advance(solo, 6 * DAY);
  check('只养一只、没有玩具时，心情没有保底', solo.pets[0].mood === 0);
  for (const toy of ['ball', 'scratcher']) {
    const s = blank(); s.owned.feeder = true; s.owned[toy] = true; sim.advance(s, 6 * DAY);
    check(`只养一只、有${toy === 'ball' ? '玩具球' : '猫抓板'}时，心情不低于保底线`, near(s.pets[0].mood, CONFIG.stats.toyMoodFloor));
  }
  const pair = blank(); pair.owned.feeder = true; pair.slots = 2; sim.adopt(pair, '二号', 'default:grey'); sim.advance(pair, 6 * DAY);
  check('有同伴时的保底不受影响', near(pair.pets[0].mood, CONFIG.stats.companionMoodFloor));
}

console.log('互动');
{
  const s = blank(); const p = s.pets[0]; p.mood = 10;
  sim.petPet(s, p.id); const g1 = p.mood - 10; sim.petPet(s, p.id); const g2 = p.mood - 10 - g1;
  check('连续做同一个动作效果减半', near(g2, g1 / 2));
  sim.advance(s, CONFIG.actions.repeatCooldown + MIN); const m = p.mood; sim.petPet(s, p.id);
  check('冷却之后恢复正常', near(p.mood - m, g1, 0.01));
}

console.log('出门');
{
  const s = blank(); const p = s.pets[0]; s.inv.bell = 2;
  const r = sim.dispatch(s, { petIds: [p.id], bento: 'kibble', tool: null, goods: ['bell', 'bell'] });
  check('可以派出门，便当和货物被扣掉', r.ok && s.trips.length === 1 && (s.inv.bell ?? 0) === 0 && p.tripId !== null);
  const f = p.food; sim.advance(s, 20 * MIN); check('旅途中状态不下降', p.food === f);
  const fish = s.fish; const ev = sim.advance(s, 3 * DAY);
  check('离线期间到点会回家，带回明信片', s.trips.length === 0 && p.tripId === null && s.postcards.length === 2 && s.pendingReturns.length === 2 && ev.some((e) => e.type === 'return'));
  check('信比回家早到，而且只有一封', s.postcards[0].kind === 'letter' && s.postcards[0].at < s.postcards[1].at && s.postcards.filter((c) => c.kind === 'letter').length === 1);
  const card = s.postcards[1];
  check('卖货的钱和没卖掉的货都对得上', s.fish === fish + card.income && card.sold.length + card.unsold.length === 2 && (s.inv.bell ?? 0) === card.unsold.length);
  check('回家后接着正常掉状态', p.food < f);
}
{
  const s = blank(); s.slots = 2; sim.adopt(s, '二号', 'default:grey'); s.inv.kibble = 1;
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
    check('升级后原来的进度都在', r.state.fish === 77 && r.state.pets[0].name === '老猫' && r.state.pets[0].age === 5 * DAY && r.state.souvenirs.shellchime === 1 && r.state.display.souvenirs.length === 0 && r.state.pets[0].lostSince === null && r.state.inv.kibble === 3 && r.state.owned.ball === true && r.state.pond[1] === T0);
    check('升级后新字段有默认值', r.state.settings.notify === true && r.state.createdAt === T0 - DAY);
    sim.advance(r.state, DAY); check('升级后的存档可以继续玩', r.state.pets[0].food < 40);
  }
  const v2 = { ...v1, v: 2, settings: { notify: false }, createdAt: T0 - 5 * DAY };
  const r2 = migrate(v2, T0);
  check('v2 存档能升级，原有的设置保留，新开关默认关', r2.ok && r2.from === 2 && r2.state.settings.notify === false && r2.state.createdAt === T0 - 5 * DAY && r2.state.dev.background === false);
  check('来自更新版本的存档会被拒绝，而不是读坏', !migrate({ ...v1, v: SAVE_VERSION + 1 }).ok);
  check('不是存档的东西会被拒绝', !migrate({ hello: 1 }).ok && !migrate(null).ok && !migrate('abc').ok);
}
{
  const broken: any = { v: SAVE_VERSION, clock: 'oops', fish: -50, slots: 99, pets: [{ id: 'a', food: 999, mood: NaN, tripId: 'ghost' }, { name: '没编号' }, { id: 'b', dead: true, tripId: 't1' }],
    trips: [{ id: 't1', petIds: ['b', 'zzz'], destId: 'nowhere' }], postcards: [{ id: 'c1', destId: 'penang' }, { id: 'c2', destId: 'nope' }], pendingReturns: ['c1', 'c9'], pond: [1, 'x'], inv: { kibble: -2, can: 2.7 } };
  const s = repair(broken, T0);
  check('坏数据会被修好', s.clock === T0 && s.fish === 0 && s.slots <= CONFIG.maxPets && s.pets.length === 2 && s.pets[0].food === 100 && s.pets[0].mood === 50 && s.pets[0].tripId === null);
  check('对不上的行程、明信片会被清掉', s.trips.length === 0 && s.postcards.length === 1 && s.pendingReturns.length === 1 && s.pond.length === CONFIG.pond.slots && s.pond[1] === null && s.inv.kibble === undefined && s.inv.can === 2);
  let threw = false; try { sim.advance(s, 3 * DAY); } catch { threw = true; }
  check('修好的存档可以继续玩不报错', !threw);
}
{
  const s = blank(); s.fish = 321; sim.advance(s, 5 * HOUR);
  const text = JSON.stringify(buildExport(s, { 'custom:x': '{"sheet":"data:,"}', 'asset:y': 'no' }, '{"objects":{}}'));
  const r = parseImport(text, T0 + 9 * DAY);
  check('导出再导入，进度一样', r.ok && r.state.fish === 321 && near(r.state.pets[0].food, s.pets[0].food) && r.state.clock === s.clock);
  check('导入只带自定义宠物的图片和布局', r.ok && Object.keys(r.sprites).join() === 'custom:x' && r.layout === '{"objects":{}}');
  check('导入后从现在接着算，不补算导出之后的时间', r.ok && r.state.lastReal === T0 + 9 * DAY);
  check('存档文字被截断时报错而不是读坏', !parseImport(text.slice(0, text.length - 30)).ok);
}

console.log('提醒');
{
  const s = blank(); s.inv.kibble = 1; sim.dispatch(s, { petIds: [s.pets[0].id], bento: 'kibble', tool: null, goods: [] });
  const home = () => sim.planReminders(s).find((r) => r.title.includes('回家'))!.inMs;
  const normal = home();
  s.dev.enabled = true; s.dev.speed = 60;
  check('只开倍速、没开「后台也按倍速」时，提醒时间不变', sim.awaySpeed(s) === 1 && home() === normal);
  s.dev.background = true;
  check('开了「后台也按倍速」，离开期间按倍速算，提醒也提前', sim.awaySpeed(s) === 60 && near(home(), normal / 60));
  s.dev.enabled = false;
  check('关掉开发者模式后恢复 1 倍', sim.awaySpeed(s) === 1);
}
{
  const s = blank(); const p = s.pets[0]; s.inv.kibble = 2;
  let plan = sim.planReminders(s);
  const hungry = plan.find((r) => r.title.includes('饿了'))!;
  check('会在饱食降到提醒线的时候提醒', !!hungry && near(hungry.inMs, ((p.food - CONFIG.stats.notifyFoodBelow) / sim.foodRate(s, p)) * HOUR, 1));
  sim.advance(s, hungry.inMs + MIN); check('到了那个时间，饱食确实降到提醒线以下', p.food < CONFIG.stats.notifyFoodBelow && p.food > CONFIG.stats.notifyFoodBelow - 1);
  const s2 = blank(); s2.owned.feeder = true;
  check('有喂食机就不发饿了的提醒', sim.planReminders(s2).length === 0);
  const s3 = blank(); s3.inv.kibble = 1; sim.dispatch(s3, { petIds: [s3.pets[0].id], bento: 'kibble', tool: null, goods: [] });
  plan = sim.planReminders(s3);
  check('出门的宠物提醒两次：路上寄信、回家', plan.length === 2 && plan[0].title.includes('寄来') && plan[1].title.includes('回家') && plan[1].inMs === s3.trips[0].returnAt - s3.clock && plan[0].inMs === s3.trips[0].letterAt - s3.clock);
}

console.log(failed ? `\n有 ${failed} 项没通过` : '\n全部通过');
process.exit(failed ? 1 : 0);
