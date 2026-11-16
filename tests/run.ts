// 规则和存档的自动检查。运行：npm test
import { CONFIG, DAY, DECOR, DESTS, FUR_COLORS, HOUR, MIN, SOUVENIRS, decodeLook, encodeLook } from '../src/config';
import * as sim from '../src/sim';
import { diaryPlaceCount, writeDiary } from '../src/diary';
import { buildExport, migrate, parseImport, repair, SAVE_VERSION } from '../src/save';

let failed = 0;
function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? '  通过' : '✗ 失败'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; }
/** 新存档，第一只宠物固定成「爱冒险」（它不影响状态下降），这样每次跑结果都一样 */
const blank = (now = T0) => { const s = sim.newState(now); s.pets[0].trait = 'adventurer'; return s; };
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
  for (let i = 0; i < 3000; i++) { const s = blank(); sim.openDoorToVisitors(s); counts[s.visitorQuota + s.visitors.length]++; for (const v of s.visitors) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1; }
  check('每天来 0–2 个，比例大约 25% / 50% / 25%', Math.abs(counts[0] / 3000 - 0.25) < 0.04 && Math.abs(counts[1] / 3000 - 0.5) < 0.04 && Math.abs(counts[2] / 3000 - 0.25) < 0.04, counts.join());
  check('三类事都会出现', ['gift', 'trade', 'errand'].every((k) => kinds[k] > 100), JSON.stringify(kinds));
  const real = Math.random;
  try {
    Math.random = () => 0.99; // 今天来 2 个
    const s = blank(); const e1 = sim.openDoorToVisitors(s);
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
