// 界面：顶部和底部的按钮，以及所有从下方弹出的面板。
import { TREASURES, FIRSTS } from './config';
import { MOMENTS, QUESTS, SEXES, SEX_IDS, type Sex, NEIGHBORS, FIND_KINDS, SEASON_EVENTS, SEASON_FINDS, SKINS, SKIN_PRICE, ROOM_THEMES, ZONES, CONFIG, DAY, DESTS, TREAT, TIME_NAMES, SEASON_NAMES, FOODS, FRY, FUR_COLORS, DECOR, VISITORS, SEASON_IDS, TIME_IDS, SPECIAL_DECOR, TRAITS, TRAIT_IDS, type Trait, PATTERN_NAMES, DEFAULT_LOOK, encodeLook, decodeLook, type Look, type CoatPattern, GEAR, GOODS, HOUR, MIN, SOUVENIRS, SPRITE, TOOLS, type ActionName } from './config';
import { renderPostcard } from './art/postcard';
import { drawDefaultSheet } from './art/defaultPet';
import type { Game } from './game';
import { setToastHandler } from './platform/notify';
import type { ObjectKind, Scene } from './scene';
import * as sim from './sim';
import { audioSettings, meow, setVolume, sfx } from './audio';
import { drawBackScreen, takeBackTaps } from './backscreen';
import { BACK_MODES } from './backscreenModes';
import { ASSETS } from './assets.config';
import { phaseName } from './light';
import { renderMoment } from './art/moment';
import { exportLayout, isChanged, resetBackground, resetObjects, saveLayout } from './layout';
import { bgCfg } from './geo';
import { composeSheet, splitStrip, type Assembled, type StripPart } from './assemble';
import { fishingGame, wandGame, type MiniGame } from './minigames';
import { canvasBytes, cropPieces, cutGlass, glassOf, makeZip, matchAssetPath, readSheet, readZip, type Sheet as CutSheet } from './sheetCut';
import { canvasToBlob, saveBlob, saveMessage } from './platform/download';
import { lookFromPhoto } from './lookFromPhoto';
import { isNative, notifyPermission, notifyStatus, testNotification } from './platform/native';
import { kv } from './platform/storage';
import { hoursToText, simulateAll, type SimResult } from './simulate';
import { buildSet, previewSet, drawFrame, fileToDataUrl, frameIndex, hasRow, imageToAvatar, loadImage, normalizeSheet, type SpriteSet } from './sprites';
import type { GameState, Moment, Pet, Postcard, Result } from './types';

type Kid = Node | string | number | null | undefined | false;
function h(tag: string, attrs: Record<string, any> | null = null, ...kids: (Kid | Kid[])[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'disabled' || k === 'checked') (el as any)[k] = !!v;
    else if (k === 'value') (el as any).value = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

export function fmtDur(ms: number): string {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / DAY), hr = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN), s = Math.floor((ms % MIN) / 1000);
  if (d > 0) return `${d} 天 ${hr} 小时`;
  if (hr > 0) return `${hr} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${String(s).padStart(2, '0')} 秒`;
  return `${s} 秒`;
}
const fmtDate = (t: number) => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const STAT_COLOR = { food: '#e2b85a', mood: '#e58f7b', clean: '#8ec3d4' };
const STAT_NAME = { food: '饱食', mood: '心情', clean: '干净' };

interface Sheet { title: string; render: () => Kid | Kid[]; onClose?: () => void; /** 返回 false = 先别关（比如还有没整理完的东西） */ beforeClose?: () => boolean }

export class UI {
  private hudFish!: HTMLElement; private hudCheck!: HTMLElement; private hudQuest!: HTMLElement; private hudDev!: HTMLElement; private hudSeason!: HTMLElement;
  private strip!: HTMLElement; private zonesEl!: HTMLElement; private toasts!: HTMLElement;
  private scrim: HTMLElement | null = null; private body: HTMLElement | null = null;
  private sheet: Sheet | null = null;
  private anims: ((t: number) => void)[] = [];
  private live: (() => void)[] = [];
  private cardCache = new Map<string, HTMLCanvasElement>();
  private preview: { petId: string; action: ActionName; until: number } | null = null;
  private plan: sim.DispatchPlan = { petIds: [], bento: '', tool: null, goods: [] };
  private albumFilter = 'all';
  private backMode = 'pet'; private backPet = ''; private backCard: { id: string; until: number } | null = null; private backHappy = 0;
  private verTaps = 0; private resetArmed = false;
  private imp: { sheet?: HTMLCanvasElement; rows?: number; set?: SpriteSet; removeWhite: boolean; avatar?: HTMLCanvasElement; name: string; error?: string; srcUrl?: string; busy?: boolean } = { removeWhite: true, name: '' };
  private adoptForm = { name: '', color: 'grey' };
  private editingName = false;

  constructor(private game: Game, private scene: Scene, private root: HTMLElement) {
    this.buildHud();
    const savedScale = Number(kv.get('pet-game-ui-scale')); if (savedScale >= 0.8 && savedScale <= 1.6) this.applyUiScale(savedScale, false);
    setToastHandler((t) => this.toast(t));
    // 新存档第一次打开：聚光灯引导（旧存档 tutorial = 99，不会出现）
    setTimeout(() => this.startTutorial(), 900);
    game.onChange(() => { this.updateHud(); this.refresh(); });
    game.onEvent((e) => {
      if (e.type === 'return') {
        this.backCard = { id: e.postcardId, until: performance.now() + 9000 };
        if (!this.sheet) this.showReturns(); else this.toast('有宠物回家了');
        sfx('return'); meow('happy');
      }
      if (e.type === 'letter') { if (!this.sheet) this.showReturns(); else this.toast('路上寄来了一张明信片'); sfx('door'); }
      if (e.type === 'visitor') { const v = game.state.visitors.find((x) => x.id === e.visitorId); if (v) { this.toast(`门口来了客人：${VISITORS[v.who].name}`); sfx('door'); } }
      if (e.type === 'visitorLeft') this.toast(`${VISITORS[e.who].name}等了很久，自己走了`);
      if (e.type === 'neighbor') { this.toast(`${NEIGHBORS[e.id]?.name ?? '邻居'}来串门了（${NEIGHBORS[e.id]?.route === 'roof' ? '从屋顶那边过来' : '从院子那边进来'}）`); sfx('door'); meow('short'); }
      if (e.type === 'neighborLeft') this.toast(`${NEIGHBORS[e.id]?.name ?? '邻居'}回去了` + (e.find ? `，在院子里留下了${FIND_KINDS[e.find]?.name ?? '一点东西'}` : ''));
      if (e.type === 'outingBack') { this.toast(e.text); sfx('return'); meow('happy'); }
      if (e.type === 'visitBack' || e.type === 'visitLeft' || e.type === 'letterFrom' || e.type === 'adoptedAway') {
        const p = this.game.state.pets.find((x) => x.id === e.petId); const n = p?.name ?? '它'; const home = p?.rehomed?.home ?? '新家';
        this.toast(e.type === 'visitBack' ? `${n}从${home}回来串门了` : e.type === 'visitLeft' ? `${n}回${home}去了` : e.type === 'letterFrom' ? `收到${n}从${home}寄来的信，按了一个小爪印` : `狸花猫带回消息：${n}被${home}收留了，过得挺好`);
        if (e.type === 'visitBack') meow('happy');
      }
      if (e.type === 'autoFish') { const p = this.game.state.pets.find((x) => x.id === e.petId); const who = p?.name ?? '它';
        this.toast(e.rain ? (e.fish ? `下雨了，${who}提前从鱼塘回来，捞完了 ${e.batches} 批：小鱼干 +${e.fish}，没捞完的还在塘里` : `下雨了，${who}没捞完就跑回来了，鱼还在塘里`)
          : `${who}从鱼塘回来了，捞完了 ${e.batches ?? 1} 批：小鱼干 +${e.fish}`); if (e.fish) sfx('coin'); }
      if (e.type === 'gift') { const p = this.game.state.pets.find((x) => x.id === e.petId); this.toast(`${p?.name ?? '它'}在门口放了一样东西，好像是给你的`); meow('happy'); }
      if (e.type === 'errandDone') { const d = DESTS.find((x) => x.id === e.destId); this.toast(`信送到${d?.name ?? ''}了，谢礼：小鱼干 +${e.reward}`); sfx('coin'); }
      if (e.type === 'hungry' || e.type === 'weak') meow('hungry');
      if (e.type === 'ranAway' || e.type === 'notFound') meow('sad');
      if (e.type === 'found') { sfx('return'); meow('happy'); }
      if (e.type === 'stage') sfx('checkin');
      if (e.type === 'ranAway' || e.type === 'found' || e.type === 'notFound') { this.stripSig = ''; this.updateHud(); }
    });
    setInterval(() => { this.live.forEach((f) => f()); this.updateHudLive(); }, 500);
    // 真正的背屏上点了宠物：在这里记到存档里
    setInterval(() => { for (const id of takeBackTaps()) this.game.act((s) => sim.petPet(s, id, CONFIG.backScreen.petMood)); }, 1500);
    const loop = (t: number) => { for (const f of this.anims) f(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    this.updateHud();
    this.showAway();
    if (game.isNew) { this.toast('点一下宠物可以照顾它'); setTimeout(() => this.toast('左右滑动看整个家，到门口可以派它出门'), 2800); }
    if (game.state.pendingReturns.length) setTimeout(() => { if (!this.sheet) this.showReturns(); }, 600);
    else if (sim.albumOver(game.state) > 0) setTimeout(() => { if (!this.sheet) this.openAlbumFull(); }, 600);
    else if (sim.momentsOver(game.state) > 0) setTimeout(() => { if (!this.sheet) this.openMomentsFull(); }, 600);
  }

  // ---------- 开场：离开期间发生了什么 ----------

  private showAway() {
    const g = this.game; const info = g.loadInfo;
    if (info?.source === 'backup') this.toast('主存档读不出来，已经换用备份存档');
    else if (info && info.from < g.saveVersion) this.toast(`存档已从 v${info.from} 升级到 v${g.saveVersion}`);
    if (g.awayMs < 2 * MIN) return;
    const name = (id: string) => g.pet(id)?.name ?? '宠物';
    const lines: string[] = [];
    const died = new Set<string>(), weak = new Set<string>();
    for (const e of g.awayEvents) {
      if (e.type === 'ranAway') died.add(e.petId);
      if (e.type === 'weak') weak.add(e.petId);
    }
    for (const e of g.awayEvents) {
      if (e.type === 'letter') { const c = g.state.postcards.find((x) => x.id === e.postcardId); if (c) lines.push(`${c.petIds.map(name).join(' 和 ')}在路上寄来了一张明信片`); }
      if (e.type === 'return') { const c = g.state.postcards.find((x) => x.id === e.postcardId); if (c) lines.push(`${c.petIds.map(name).join(' 和 ')}旅行回来了，带回一张明信片`); }
      if (e.type === 'stage') lines.push(`${name(e.petId)}长大了，现在是${CONFIG.growth.stageNames[e.stage]}`);
      if (e.type === 'weak' && !died.has(e.petId)) lines.push(`${name(e.petId)}饿得很虚弱，快喂点东西`);
      if (e.type === 'hungry' && !weak.has(e.petId) && !died.has(e.petId)) lines.push(`${name(e.petId)}饿了`);
      if (e.type === 'ranAway') lines.push(`${name(e.petId)}饿了太久，离家出走了。去门口找狸花猫帮忙。`);
      if (e.type === 'found') lines.push(`狸花猫把${name(e.petId)}带回来了，它又饿又脏`);
      if (e.type === 'notFound') lines.push(`狸花猫没找到${name(e.petId)}，可以再请它找一次`);
    }
    if (!lines.length) { this.toast(`你离开了 ${fmtDur(g.awayMs)}，这段时间的变化已经算好了`); return; }
    this.open({ title: `你离开了 ${fmtDur(g.awayMs)}`, render: () => [h('div', { class: 'card' }, lines.map((l) => h('div', { class: 'item' }, h('div', { class: 'txt' }, l)))),
      h('p', null, h('button', { class: 'btn primary block', onclick: () => this.close() }, '知道了'))] });
  }

  /** 返回键（安卓）或 Esc：有面板就关面板，在调整模式就退出。返回 false 表示没有东西可关。 */
  handleBack(): boolean {
    if (this.sheet) { this.close(); return true; }
    if (this.decorBar) { this.stopDecor(); return true; }
    if (this.editBar) { if (this.scene.bgMode) this.stopBgEdit(); else this.stopEdit(); return true; }
    return false;
  }

  // ---------- 提示 ----------

  toast(text: string) {
    const t = h('div', { class: 'toast' }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 2600);
  }
  private say(r: Result) { if (r.msg) this.toast(r.msg); return r.ok; }

  // ---------- 顶部和底部 ----------

  private buildHud() {
    this.hudFish = h('button', { class: 'pill', onclick: () => this.openShop() });
    this.hudCheck = h('button', { class: 'pill', onclick: () => { const r = this.game.act((s) => sim.checkin(s)); this.say(r); sfx(r.ok ? 'checkin' : 'error'); } }, '签到');
    this.hudQuest = h('button', { class: 'pill quest', onclick: () => this.openQuests() }, '任务');
    this.hudDev = h('button', { class: 'pill dev', onclick: () => this.openDev() });
    const top = h('div', { class: 'hud-top' }, this.hudFish, this.hudCheck, this.hudQuest, h('div', { class: 'spacer' }), this.hudDev,
      h('button', { class: 'pill', onclick: () => { this.scene.scrollToZone(0); this.openDoor(); } }, '出门'),
      h('button', { class: 'pill', onclick: () => this.openShop() }, '商店'),
      this.hudMenu = h('button', { class: 'pill', onclick: () => this.openMenu() }, '菜单'));
    this.strip = h('div', { class: 'petstrip' });
    // 最后一个按钮是「屋顶」：切到房子上面那一层（编号 = 区域个数）
    this.zonesEl = h('div', { class: 'zones' }, [...ZONES.map((z, i) => h('button', { class: 'zone', onclick: () => this.scene.scrollToZone(i) }, z.name)), h('button', { class: 'zone', onclick: () => this.scene.goRoof() }, '屋顶')]);
    this.toasts = h('div', { class: 'toasts' });
    this.hudSeason = h('div', { class: 'hud-season' });
    this.root.append(top, this.hudSeason, h('div', { class: 'hud-bottom' }, this.strip, this.zonesEl), this.toasts);
  }

  setZone(i: number) {
    [...this.zonesEl.children].forEach((c, k) => c.classList.toggle('on', k === i));
    // 底部的区域按钮可以左右滑：把当前区域滚到中间
    const el = this.zonesEl.children[i] as HTMLElement | undefined;
    if (el) this.zonesEl.scrollTo({ left: el.offsetLeft - (this.zonesEl.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }

  // ---------- 界面大小 ----------

  private uiScale = 1;
  private applyUiScale(v: number, save = true) {
    this.uiScale = v; (this.root.style as any).zoom = String(v);
    if (save) kv.set('pet-game-ui-scale', String(v));
    this.scene.relayout(); this.setZone(this.currentZone());
  }
  private currentZone() { return Math.max(0, [...this.zonesEl.children].findIndex((c) => c.classList.contains('on'))); }

  private avatarCanvas(pet: Pet, size = 92) {
    const cv = h('canvas', { width: size, height: size }) as HTMLCanvasElement;
    const av = this.game.avatarOf(pet);
    if (av) cv.getContext('2d')!.drawImage(av, 0, 0, size, size);
    return cv;
  }

  private stripSig = ''; private hudMenu: HTMLElement | null = null;
  private updateHud() {
    const s = this.game.state;
    this.hudFish.textContent = `🐟 ${s.fish}`;
    this.hudCheck.classList.toggle('hot', sim.canCheckin(s));
    this.hudCheck.textContent = sim.canCheckin(s) ? '签到' : '已签到';
    // 任务：有能领的奖励时变成高亮；引导期间显示进度
    const qs = sim.questStatus(s); this.hudQuest.classList.toggle('hot', qs.claimable > 0);
    this.hudQuest.textContent = qs.mode === 'guide' ? `引导 ${qs.items.filter((x) => x.claimed).length}/${qs.items.length}` : qs.claimable > 0 ? `任务 ${qs.claimable}` : '任务';
    this.hudDev.style.display = s.dev.enabled ? '' : 'none';
    this.hudMenu?.classList.toggle('has-dot', sim.diaryUnread(s)); // 日记有新写的
    this.hudDev.textContent = `×${s.dev.speed}`; this.hudDev.title = '开发者面板'; // 写短一点：顶上一行放得下（多了「出门」）
    this.scene.relayout();
    const sig = sim.alivePets(s).map((p) => `${p.id}${p.name}${p.tripId || p.outing ? 1 : 0}${sim.isLost(p) ? 1 : 0}${p.spriteId}`).join('|') + this.game.avatarRev;
    if (sig !== this.stripSig) {
      this.stripSig = sig;
      this.strip.replaceChildren(...sim.alivePets(s).map((p) => h('button', { class: 'petchip' + (p.tripId || p.outing || sim.isLost(p) ? ' out' : ''), 'data-pet': p.id, title: p.name, onclick: () => { this.scene.focusPet(p.id); this.openPet(p.id); } }, this.avatarCanvas(p), h('span', { class: 'dot' }))));
    }
    this.updateHudLive();
  }
  /** 「春天 · 第 3 天，还有 4 天入夏」。开发者面板强制了季节时，照强制的显示 */
  private seasonLine(): string {
    const s = this.game.state; const now = sim.season(s); const info = sim.seasonInfo(s);
    if (now !== info.season) return `${SEASON_NAMES[now]}天（开发者面板指定）`;
    return `${SEASON_NAMES[info.season]}天 · 第 ${info.day} 天，还有 ${info.daysLeft} 天入${SEASON_NAMES[info.next]}`;
  }
  private updateHudLive() {
    const s = this.game.state; const low = CONFIG.stats.lowThreshold;
    this.hudSeason.style.display = s.settings.showSeason ? '' : 'none';
    if (s.settings.showSeason) { const t = this.seasonLine(); if (this.hudSeason.textContent !== t) this.hudSeason.textContent = t; }
    this.hudCheck.classList.toggle('hot', sim.canCheckin(s));
    for (const chip of this.strip.children as any as HTMLElement[]) {
      const p = this.game.pet(chip.dataset.pet!); const dot = chip.querySelector('.dot') as HTMLElement; if (!p) continue;
      const text = sim.isLost(p) ? '出走' : p.tripId ? '外出' : p.outing ? '串门' : sim.isWeak(p) ? '虚弱' : p.food < low ? '饿' : p.clean < low ? '脏' : p.mood < low ? '闷' : '';
      dot.textContent = text; dot.style.display = text ? '' : 'none';
      dot.className = 'dot' + (sim.isLost(p) ? ' grey' : p.tripId || p.outing ? ' blue' : sim.isWeak(p) ? ' grey' : '');
    }
  }

  // ---------- 面板的开关 ----------

  private openedAt = 0;
  private open(sheet: Sheet) {
    if (!this.scrim) { this.openedAt = performance.now(); sfx('open'); }
    if (this.sheet?.onClose) this.sheet.onClose();
    this.sheet = sheet;
    if (!this.scrim) {
      this.body = h('div', { class: 'sheet-body' });
      const title = h('h2');
      const panel = h('div', { class: 'sheet' }, h('div', { class: 'sheet-head' }, title, h('button', { class: 'x', 'aria-label': '关闭', onclick: () => this.close() }, '×')), this.body);
      // 面板刚弹出来的一小会儿，面板里的点击一律不算（在按钮自己的处理之前就拦下来），防止点猫、点家具的第二下落到滑上来的按钮上
      panel.addEventListener('click', (e) => { if (performance.now() - this.openedAt < CONFIG.ui.tapGuardMs) { e.stopPropagation(); e.preventDefault(); } }, true);
      // 面板刚弹出来的一瞬间不接受「点外面关闭」：不然点家具的那一下手指抬起来，会被当成点了外面，面板一闪就没了
      this.scrim = h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === this.scrim && performance.now() - this.openedAt > 400) this.close(); } }, panel);
      this.root.append(this.scrim);
    }
    this.scrim.querySelector('h2')!.textContent = sheet.title;
    this.body!.scrollTop = 0;
    this.refresh(true);
  }

  close() {
    if (this.sheet?.beforeClose && !this.sheet.beforeClose()) return;
    if (this.sheet?.onClose) this.sheet.onClose();
    this.sheet = null; this.anims = []; this.live = []; this.editingName = false;
    if (this.scrim) sfx('close');
    this.scrim?.remove(); this.scrim = null; this.body = null;
    if (this.game.state.pendingReturns.length) setTimeout(() => { if (!this.sheet) this.showReturns(); }, 250);
    else if (sim.albumOver(this.game.state) > 0) setTimeout(() => { if (!this.sheet) this.openAlbumFull(); }, 250);
    else if (sim.momentsOver(this.game.state) > 0) setTimeout(() => { if (!this.sheet) this.openMomentsFull(); }, 250);
  }

  private refresh(force = false) {
    if (!this.sheet || !this.body) return;
    const active = document.activeElement;
    if (!force && active && this.body.contains(active) && ((active.tagName === 'INPUT' && ['text', 'range'].includes((active as HTMLInputElement).type)) || (active.tagName === 'TEXTAREA' && !(active as HTMLTextAreaElement).readOnly))) return;
    const top = this.body.scrollTop;
    this.anims = []; this.live = [];
    const out = this.sheet.render();
    this.body.replaceChildren(...([out].flat().filter((k) => k !== null && k !== undefined && k !== false) as (Node | string)[]));
    this.body.scrollTop = top;
    this.live.forEach((f) => f());
  }

  private countdown(until: () => number, done = '到了') {
    const el = h('span');
    this.live.push(() => { const left = until() - this.game.state.clock; el.textContent = left > 0 ? fmtDur(left) : done; });
    return el;
  }

  private petAnim(set: SpriteSet | undefined | (() => SpriteSet | null), action: () => ActionName, size = 208) {
    const cv = h('canvas', { width: size, height: size }) as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const get = typeof set === 'function' ? set : () => set ?? null;
    this.anims.push((t) => { const s = get(); if (!s) return; const a = action(); ctx.clearRect(0, 0, size, size); drawFrame(ctx, s, a, frameIndex(a, t), 0, 0, size); });
    return cv;
  }

  // ---------- 场景里点到东西 ----------

  /** 喂、洗、摸、陪玩：宠物面板和猫头上的「想要」气泡共用。满足了它冒着的那个「想要」，亲密度额外加一点 */
  careAct(id: string, fn: (st: GameState) => Result, anim: ActionName, food?: string) {
    const p = this.game.state.pets.find((x) => x.id === id); if (!p) return;
    // 正在吃、洗、玩的时候不接新的指令，等它做完
    const busy = this.scene.busy(id);
    if (busy && anim !== 'happy') { this.toast(`${p.name}正在${busy === 'eat' ? '吃东西' : busy === 'bath' ? '洗澡' : '玩'}，等它一下`); sfx('error'); return; }
    const r = this.game.act(fn);
    if (!r.ok) { this.say(r); sfx('error'); if (!r.ok && r.full) this.scene.refuseFood(id); return; }
    sfx(anim === 'eat' ? 'eat' : anim === 'bath' ? 'bath' : anim === 'play' ? 'play' : 'purr'); if (anim !== 'bath') meow(anim === 'eat' ? 'happy' : 'short');
    this.fulfillWant(id, anim === 'eat' ? ['food'] : anim === 'bath' ? ['bath'] : anim === 'happy' ? ['pet'] : anim === 'play' ? ['play', 'ball', 'scratcher', 'autoball'] : []);
    if (anim === 'happy') {
      // 摸摸：面板不关，直接在面板里看它开心
      this.preview = { petId: id, action: anim, until: performance.now() + 2600 }; this.scene.perform(id, anim, false); this.say(r);
    } else {
      // 喂食、洗澡、玩耍：收起面板，镜头跟着它走到饭碗、浴缸、玩具那里
      this.close(); this.scene.perform(id, anim, true, food); if (r.msg) this.scene.floatText(id, r.msg);
    }
  }
  /** 它头上冒着的「想要」正好是这几种之一：算满足了（亲密度 +一点，气泡收起来） */
  private fulfillWant(id: string, kinds: sim.WantKind[]) {
    const w = this.scene.wantShown(id); if (!w || !kinds.includes(w)) return;
    this.game.act((st) => sim.fulfillWant(st, id)); this.scene.clearWant(id);
  }
  /** 点了猫头上的「想要」气泡：饿了打开宠物面板让你挑吃的；洗澡、摸摸、陪玩直接做；想玩球、猫抓板就让它去玩那样东西 */
  onWant(id: string, kind: sim.WantKind) {
    const p = this.game.state.pets.find((x) => x.id === id); if (!p) return;
    if (kind === 'food') { this.petTab = 'care'; this.openPet(id); this.toast(`${p.name}饿了，挑一种吃的给它`); return; }
    if (kind === 'bath') return this.careAct(id, (st) => sim.bath(st, id), 'bath');
    if (kind === 'pet') return this.careAct(id, (st) => sim.petPet(st, id), 'happy');
    if (kind === 'play') return this.careAct(id, (st) => sim.play(st, id), 'play');
    const busy = this.scene.busy(id);
    if (busy) { this.toast(`${p.name}正在${busy === 'eat' ? '吃东西' : busy === 'bath' ? '洗澡' : '玩'}，等它一下`); sfx('error'); return; }
    const r = this.game.act((st) => sim.playToy(st, id, kind));
    if (!r.ok) { this.say(r); sfx('error'); return; }
    if (!this.scene.goToy(id, kind)) { this.scene.perform(id, 'play'); } // 那样东西正被别的猫占着：就地陪它玩一下
    sfx('play'); meow('short'); this.fulfillWant(id, [kind]); if (r.msg) this.scene.floatText(id, r.msg);
  }

  onObject(kind: ObjectKind, id?: string) {
    if (kind === 'visitor' && id) { this.openVisitor(id); return; }
    if (kind === 'neighbor') { this.openNeighbors(); return; }
    if (kind === 'gift' && id) { const r = this.game.act((st) => sim.collectGift(st, id)); this.say(r); sfx(r.ok ? 'coin' : 'error'); return; }
    if (kind === 'find' && id) { const r = this.game.act((st) => sim.collectFind(st, id)); this.say(r); sfx(r.ok ? 'coin' : 'error'); return; }
    if (kind === 'door') this.openDoor();
    else if (kind === 'album') this.openAlbumHub('cards');
    else if (kind === 'cabinet') this.openCollectHub('souvenirs');
    else if (kind === 'pond') this.openPond();
    else if (kind === 'npc') this.openRescue();
    else if (kind === 'cattree') this.openCatTree();
    // 木梯子：在阳台点它问要不要上屋顶，在屋顶上点梯子顶端问要不要回阳台
    else if (kind === 'ladder') {
      const onRoof = this.scene.layer === 'roof';
      this.confirmBox(onRoof ? '回阳台' : '上屋顶', onRoof ? '顺着木梯子回阳台吗？' : '顺着木梯子去屋顶看看吗？', onRoof ? '回阳台' : '去屋顶', () => {
        if (onRoof) this.scene.scrollToZone(ZONES.findIndex((z) => z.id === 'balcony')); else this.scene.goRoof();
      });
    }
  }
  /** 一个小小的确认框：确定 / 算了 */
  private confirmBox(title: string, text: string, ok: string, onOk: () => void) {
    this.open({ title, render: () => [h('p', null, text), h('div', { class: 'grid2' },
      h('button', { class: 'btn', onclick: () => this.close() }, '算了'),
      h('button', { class: 'btn primary', onclick: () => { this.close(); sfx('open'); onOk(); } }, ok))] });
  }

  // ---------- 猫爬架：指定谁待在哪一层 ----------

  // ---------- 第一次打开的聚光灯引导：屏幕变暗，只亮出这一步要点的东西，其他地方点不了 ----------
  // 1 欢迎 → 2 点房间里的猫 → 3 点「猫粮」 → 4 点「摸摸」 → 5 点顶部的「引导」按钮。做完就解锁，后面的在任务清单里
  private tut: { root: HTMLElement; blocks: HTMLElement[]; hole: HTMLElement; tip: HTMLElement; raf: number; nextFocus: number } | null = null;
  private startTutorial() {
    const s = this.game.state; if (s.tutorial >= 99 || !sim.homePets(s).length || this.tut) return;
    const blocks = [0, 1, 2, 3].map(() => h('div', { class: 'tut-block' }));
    const hole = h('div', { class: 'tut-hole' }); const tip = h('div', { class: 'tut-tip' });
    const root = h('div', { class: 'tut' }, ...blocks, hole, tip); document.body.appendChild(root);
    this.tut = { root, blocks, hole, tip, raf: 0, nextFocus: 0 };
    const loop = () => { this.tutFrame(); if (this.tut) this.tut.raf = requestAnimationFrame(loop); }; loop();
  }
  private tutSet(step: number) { this.game.state.tutorial = step; this.game.touch(); }
  private tutEnd() { if (!this.tut) return; cancelAnimationFrame(this.tut.raf); this.tut.root.remove(); this.tut = null; this.tutSet(99); }
  private tutFrame() {
    const t = this.tut!; const s = this.game.state; const pet = sim.homePets(s)[0];
    if (!pet) { this.tutEnd(); return; }
    let rect: { x: number; y: number; w: number; h: number } | null = null; let text = ''; let card: HTMLElement | null = null;
    const el = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; };
    const step = s.tutorial;
    // 要点的是猫：猫走出画面（或者快走到边上）时镜头跟过去，不然屏幕全暗又滑不动，就卡住了
    const petRect = () => {
      const r = this.scene.petScreenRect(pet.id); const now = performance.now();
      if ((!r || r.x < 0 || r.x + r.w > window.innerWidth) && now > t.nextFocus) { t.nextFocus = now + 600; this.scene.focusPet(pet.id); }
      return r;
    };
    if (step === 0) {
      text = `欢迎！这是${pet.name}，以后就由你照顾它啦。\n跟着提示做几步，马上就会玩。`;
      card = h('button', { class: 'btn primary', onclick: () => { this.tutSet(1); this.scene.focusPet(pet.id); } }, '开始');
    } else if (step === 1) {
      rect = petRect(); text = `点一下${pet.name}，看看它现在怎么样`;
      if (document.querySelector('[data-tut="pet"]')) this.tutSet(2); // 宠物面板打开了
    } else if (step === 2) {
      // 宠物面板开着就亮「猫粮」，被关掉了就再亮一次猫
      rect = el('[data-tut="feed-kibble"]'); text = rect ? '喂它一碗猫粮' : `再点一下${pet.name}，喂它一碗猫粮`; rect ??= petRect();
      if (s.quests.guide.includes('feed') || s.quests.guideDone) this.tutSet(3);
    } else if (step === 3) {
      // 喂完它会走去饭碗吃：再点它一下，打开面板摸摸它
      rect = el('[data-tut="pet"]'); text = rect ? '再摸摸它' : `${pet.name}去吃饭了。再点它一下，摸摸它`; rect ??= petRect();
      if (s.quests.guide.includes('pet') || s.quests.guideDone) { this.close(); this.tutSet(4); }
    } else if (step === 4) {
      rect = el('.hud-top .pill.quest'); text = '还有一些可以做的事，都在这里。每做完一件可以领小鱼干';
      if (document.querySelector('.sheet')) { this.tutEnd(); return; } // 任务面板打开了：引导结束
    } else { this.tutEnd(); return; }
    // 洞的位置：有目标就在目标周围留一圈，没有就全暗
    const W = window.innerWidth, H = window.innerHeight, pad = 8;
    const r = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : { x: W / 2, y: H / 2, w: 0, h: 0 };
    const [top, left, right, bottom] = t.blocks;
    Object.assign(top.style, { left: '0px', top: '0px', width: W + 'px', height: Math.max(0, r.y) + 'px' });
    Object.assign(bottom.style, { left: '0px', top: r.y + r.h + 'px', width: W + 'px', height: Math.max(0, H - r.y - r.h) + 'px' });
    Object.assign(left.style, { left: '0px', top: r.y + 'px', width: Math.max(0, r.x) + 'px', height: r.h + 'px' });
    Object.assign(right.style, { left: r.x + r.w + 'px', top: r.y + 'px', width: Math.max(0, W - r.x - r.w) + 'px', height: r.h + 'px' });
    Object.assign(t.hole.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', display: rect ? '' : 'none' });
    const key = step + '|' + text;
    if (t.tip.dataset.key !== key) { t.tip.dataset.key = key; t.tip.replaceChildren(h('p', null, text), ...(card ? [card] : [])); }
    // 提示放在洞的上面或下面，哪边空间大放哪边
    const below = !rect || r.y + r.h / 2 < H / 2; const tipY = !rect ? H * 0.38 : below ? r.y + r.h + 14 : r.y - 14;
    Object.assign(t.tip.style, { top: tipY + 'px', transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' });
  }

  // ---------- 任务：新手引导和每日任务（同一个入口） ----------

  openQuests() {
    this.open({ title: sim.questStatus(this.game.state).mode === 'guide' ? '新手引导' : '今天的任务', render: () => {
      const s = this.game.state; const st = sim.questStatus(s); const pet = sim.alivePets(s)[0]?.name ?? '它';
      const intro = st.mode === 'guide' ? '跟着做一遍，就会玩了。每做完一步领一点小鱼干，全部领完以后，每天会有几个小任务。' : `每天 ${QUESTS.dailyCount} 个小任务，做完领小鱼干；全部领完再加 ${QUESTS.dailyBonus}。第二天换新的。`;
      const row = (q: (typeof st.items)[number]) => h('div', { class: 'item' },
        h('span', { class: 'ico' }, q.claimed ? '✅' : q.done ? '🎁' : '⬜'),
        h('div', { class: 'txt' }, h('b', null, q.text.replace('{pet}', pet)), h('span', { class: 'soft' }, `${st.mode === 'daily' && q.need > 1 ? `${q.got}/${q.need}　` : ''}🐟 +${q.reward}`)),
        q.claimed ? h('button', { class: 'btn small', disabled: true }, '已领')
          : q.done ? h('button', { class: 'btn small primary', onclick: () => { const r = this.game.act((x) => sim.claimQuest(x, q.id)); this.say(r); sfx(r.ok ? 'checkin' : 'error'); if (r.ok && sim.questStatus(this.game.state).mode !== st.mode) this.openQuests(); else this.refresh(true); } }, '领取')
          : h('button', { class: 'btn small', onclick: () => this.questGo(q.go) }, '去做'));
      return [h('p', { class: 'soft' }, intro), h('div', { class: 'card' }, st.items.map(row)),
        st.mode === 'daily' ? h('p', null, h('button', { class: 'btn block' + (st.bonusReady ? ' primary' : ''), disabled: !st.bonusReady, onclick: () => { const r = this.game.act((x) => sim.claimDailyBonus(x)); this.say(r); sfx(r.ok ? 'checkin' : 'error'); this.refresh(true); } }, st.bonusClaimed ? '今天的额外奖励已经领了' : `全部完成再领 🐟 +${QUESTS.dailyBonus}`)) : null];
    } });
  }
  /** 任务的「去做」：带玩家到要做这件事的地方 */
  private questGo(go: string) {
    const s = this.game.state;
    if (go === 'pet') { const p = sim.homePets(s)[0]; if (p) this.openPet(p.id); else this.toast('宠物都出门了，等它回来再做'); return; }
    if (go === 'checkin') { const r = this.game.act((x) => sim.checkin(x)); this.say(r); sfx(r.ok ? 'checkin' : 'error'); this.refresh(true); return; }
    if (go === 'shop') { this.openShop(); return; }
    if (go === 'album') { this.toast('出门的宠物回来时会带回明信片，可以在菜单的「纪念相册」里看'); return; }
    this.close();
    if (go === 'door') { this.scene.scrollToZone(0); this.openDoor(); }
    else if (go === 'decor') this.startDecor();
    else if (go === 'roof') this.scene.goRoof();
    else if (go === 'pond') { this.scene.scrollToZone(ZONES.findIndex((z) => z.id === 'garden')); this.openPond(); }
  }

  openCatTree() {
    this.open({ title: '猫爬架', render: () => {
      const s = this.game.state; const pets = sim.alivePets(s);
      return [h('p', { class: 'soft' }, '给每一层指定一只宠物，它没事的时候就爱回自己的位置待着，晚上也睡在那里。没指定的那一层谁都可以上去。'),
        ...sim.CATTREE_LEVELS.map((name, i) => [h('h3', null, name),
          h('div', { class: 'seg' }, h('button', { class: 'chip' + (s.cattree[i] === null ? ' on' : ''), onclick: () => { this.game.act((st) => sim.setCatTree(st, i, null)); sfx('click'); } }, '谁都可以'),
            pets.map((p) => h('button', { class: 'chip' + (s.cattree[i] === p.id ? ' on' : ''), onclick: () => { this.say(this.game.act((st) => sim.setCatTree(st, i, p.id))); sfx('ok'); } }, p.name)))]).flat(),
        h('p', null, h('button', { class: 'btn primary block', onclick: () => this.close() }, '好了'))];
    } });
  }

  // ---------- 访客 ----------

  // ---------- 瞬间相册 ----------

  private momentCache = new Map<string, HTMLCanvasElement>();
  momentCaught(id: string) {
    const m = this.game.state.moments.find((x) => x.id === id); if (!m) return;
    this.toast(`📷 抓拍到了：${sim.momentTitle(m)}（在相册的「瞬间」里）`); sfx('ok');
    // 放不下了：没有面板开着就马上请主人整理；开着的话等关掉面板时再弹
    if (sim.momentsOver(this.game.state) > 0) setTimeout(() => { if (!this.sheet) this.openMomentsFull(); }, 1200);
  }
  private momentsWarned = false;
  /** 瞬间相册放不下了：和明信片一样，请主人自己删；不整理就退出的话，新拍的那几张不保存 */
  openMomentsFull() {
    const s = this.game.state;
    if (sim.momentsOver(s) <= 0) return;
    this.momentsWarned = false;
    this.open({ title: '瞬间相册放不下了',
      beforeClose: () => {
        const over = sim.momentsOver(s); if (over <= 0) return true;
        if (!this.momentsWarned) { this.momentsWarned = true; this.refresh(true); if (this.body) this.body.scrollTop = 0; sfx('error'); return false; }
        const n = this.game.act((st) => ({ ok: true as const, msg: String(sim.discardMomentOverflow(st)) }));
        this.toast(`没有整理，新拍的 ${n.msg} 张没有保存`); return true;
      },
      render: () => {
        const over = sim.momentsOver(s);
        if (over <= 0) return [h('p', { class: 'center' }, '整理好了，新拍的瞬间已经收进相册。'), h('button', { class: 'btn primary block', onclick: () => this.close() }, '好')];
        const newest = new Set(s.moments.slice(0, over).map((m) => m.id));
        const out: Kid[] = [];
        if (this.momentsWarned) out.push(h('div', { class: 'card warn' }, h('b', null, '确认退出？'), h('p', null, `现在退出的话，新拍的 ${over} 张将无法保存。`),
          h('div', { class: 'grid2' }, h('button', { class: 'btn primary', onclick: () => { this.momentsWarned = false; this.refresh(true); } }, '继续整理'), h('button', { class: 'btn danger', onclick: () => this.close() }, '不保存，退出'))));
        out.push(h('p', { class: 'soft' }, `瞬间相册最多放 ${CONFIG.moments.max} 张，现在多了 ${over} 张。请删掉 ${over} 张不想留的（新的旧的都可以删）。`));
        out.push(h('div', { class: 'postgrid moments' }, s.moments.map((m) => h('div', { class: 'postcard pick' }, this.momentCopy(m), h('span', null, (newest.has(m.id) ? '新 · ' : '') + sim.momentTitle(m)),
          h('button', { class: 'btn small danger', onclick: () => { this.game.act((st) => sim.deleteMoment(st, m.id)); sfx('click'); this.refresh(true); } }, '删除')))));
        return out;
      } });
  }
  private momentCanvas(m: Moment): HTMLCanvasElement {
    const s = this.game.state; const key = `${m.id}|${JSON.stringify(s.skins)}|${s.room}|${this.game.avatarRev}|${JSON.stringify(s.decor.filter((d) => d.zone === MOMENTS[m.kind]?.zone))}`;
    let cv = this.momentCache.get(key);
    if (!cv) {
      const guest = m.extra && NEIGHBORS[m.extra] ? this.game.sprites.get(NEIGHBORS[m.extra].look) : undefined;
      // 照片里的猫按它现在的大小画（宠物不在了就按一般成年猫），邻居按它自己的大小
      const sizes = m.petIds.map((id) => { const p = s.pets.find((x) => x.id === id); return p ? sim.bodySize(p) : 0.85; });
      if (m.extra && NEIGHBORS[m.extra]) sizes.push(NEIGHBORS[m.extra].size);
      const zone = MOMENTS[m.kind]?.zone; const decor = s.decor.filter((d) => d.zone === zone);
      cv = renderMoment(m, m.sprites.map((id) => this.game.sprites.get(id)), { guest, sizes, decor, skin: (k) => sim.skinOf(s, k), room: sim.roomOf(s) });
      if (this.momentCache.size > 80) this.momentCache.clear(); this.momentCache.set(key, cv);
    }
    return cv;
  }
  /** 纪念册的一张照片（只存了时间、季节、那时候多大，用瞬间照片的画法现画） */
  private firstCanvas(petId: string, kind: string): HTMLCanvasElement {
    const s = this.game.state; const p = s.pets.find((x) => x.id === petId); const f = s.firsts[petId]?.[kind];
    const zone = FIRSTS[kind]?.zone; const key = `first|${petId}|${kind}|${p?.spriteId}|${JSON.stringify(s.skins)}|${s.room}|${this.game.avatarRev}|${JSON.stringify(s.decor.filter((d) => d.zone === zone))}`;
    let cv = this.momentCache.get(key);
    if (!cv && f && p) {
      const nb = kind === 'friend' && f.extra ? NEIGHBORS[f.extra] : undefined;
      cv = renderMoment({ kind: 'first_' + kind, season: f.season, time: f.time }, [this.game.sprites.get(p.spriteId)], { guest: nb ? this.game.sprites.get(nb.look) : undefined, sizes: nb ? [f.size, nb.size] : [f.size], decor: s.decor.filter((d) => d.zone === zone), skin: (k) => sim.skinOf(s, k), room: sim.roomOf(s) });
      if (this.momentCache.size > 80) this.momentCache.clear(); this.momentCache.set(key, cv);
    }
    return cv ?? (h('canvas', { width: 480, height: 640 }) as HTMLCanvasElement);
  }
  /** 一只猫的「第一次」纪念册：拍到的按时间排，没拍到的显示问号 */
  openFirsts(petId: string) {
    const p = this.game.pet(petId); if (!p) return;
    this.open({ title: `${p.name}的纪念册`, render: () => {
      const s = this.game.state; const got = sim.firstsOf(s, petId); const missing = Object.keys(FIRSTS).filter((k) => !s.firsts[petId]?.[k]);
      const copy = (k: string) => { const src = this.firstCanvas(petId, k); const cv = h('canvas', { width: src.width, height: src.height }) as HTMLCanvasElement; cv.getContext('2d')!.drawImage(src, 0, 0); return cv; };
      return [h('p', { class: 'soft' }, `已经记下 ${got.length} / ${Object.keys(FIRSTS).length} 个「第一次」。照片按它当时的样子画，换了正式素材也会跟着变。`),
        h('div', { class: 'postgrid moments', style: 'margin-top:12px' },
          got.map((f) => { const title = FIRSTS[f.kind].title.replace('{pet}', p.name); return h('button', { class: 'postcard', onclick: () => this.open({ title: `${FIRSTS[f.kind].icon} ${fmtDate(f.at)}`, render: () => [copy(f.kind), h('p', { class: 'center' }, title)] }) }, copy(f.kind), h('span', null, `${title}`), h('small', { class: 'soft' }, fmtDate(f.at))); }),
          missing.map((k) => h('div', { class: 'postcard dim' }, h('div', { class: 'first-q' }, '？'), h('span', { class: 'soft' }, FIRSTS[k].title.replace('{pet}', p.name)), h('small', { class: 'soft' }, '还没发生'))))];
    } });
  }
  private momentCopy(m: Moment) { const src = this.momentCanvas(m); const cv = h('canvas', { width: src.width, height: src.height }) as HTMLCanvasElement; cv.getContext('2d')!.drawImage(src, 0, 0); return cv; }
  openMoments() {
    if (sim.momentsOver(this.game.state) > 0) { this.openMomentsFull(); return; }
    this.open({ title: '瞬间', render: () => {
      const s = this.game.state;
      const out: Kid[] = [h('p', { class: 'soft' }, `宠物们在家做了有意思的事，游戏会自己抓拍下来。同一种瞬间隔几天才会再拍一张。最多放 ${CONFIG.moments.max} 张，满了会请你自己删几张（${s.moments.length} / ${CONFIG.moments.max}）。`)];
      if (!s.moments.length) out.push(h('p', { class: 'soft center', style: 'padding:24px 0' }, '还没有抓拍到。多开着游戏看看它们在做什么吧。'));
      else out.push(h('div', { class: 'postgrid moments', style: 'margin-top:12px' }, s.moments.map((m) => h('button', { class: 'postcard', onclick: () => this.open({ title: `${MOMENTS[m.kind]?.icon ?? '📷'} ${fmtDate(m.at)}`, render: () => [
        h('div', { class: 'center' }, (() => { const cv = this.momentCopy(m); cv.style.cssText = 'width:100%;max-width:360px;border-radius:10px;box-shadow:0 2px 10px rgba(90,70,54,.18)'; return cv; })()),
        h('p', { class: 'center' }, sim.momentTitle(m)), h('p', { class: 'soft center' }, `${SEASON_NAMES[m.season as keyof typeof SEASON_NAMES] ?? ''}天的${TIME_NAMES[m.time as keyof typeof TIME_NAMES] ?? ''}`),
        h('div', { class: 'grid2' }, h('button', { class: 'btn', onclick: async () => { const blob = await canvasToBlob(this.momentCanvas(m)); if (!blob) { this.toast('生成图片失败'); return; } const msg = saveMessage(await saveBlob(`moment-${m.kind}-${fmtDate(m.at)}.png`, blob), '请长按图片保存'); if (msg) this.toast(msg); } }, '保存到手机'),
          h('button', { class: 'btn', onclick: () => { this.game.act((st) => sim.deleteMoment(st, m.id)); this.openMoments(); } }, '删掉')),
        h('p', null, h('button', { class: 'btn block', onclick: () => this.openMoments() }, '返回'))] }) },
        this.momentCopy(m), h('span', null, sim.momentTitle(m))))));
      out.push(h('p', null, h('button', { class: 'btn block', onclick: () => this.openAlbum() }, '看明信片')));
      return out;
    } });
  }

  // ---------- 季节活动 ----------

  openSeasonEvent() {
    this.open({ title: '季节活动', render: () => {
      const s = this.game.state; const ev = sim.seasonEventStatus(s); const info = sim.seasonInfo(s); const reward = DECOR[ev.reward];
      const lying = s.finds.filter((f) => SEASON_FINDS[f.kind]).length;
      return [h('div', { class: 'card center' }, h('b', { style: 'font-size:18px' }, ev.name), h('div', { class: 'soft' }, `${SEASON_NAMES[ev.season]}天还有 ${info.daysLeft} 天`)),
        h('p', { class: 'soft' }, `这一季，院子里每隔一阵会冒出三种小东西。每种捡够 ${ev.need} 个就算完成，换季后重新开始。`),
        h('div', { class: 'card' }, ev.items.map((it) => h('div', { class: 'item' }, h('span', { class: 'ico' }, it.icon), h('div', { class: 'txt' }, h('b', null, it.name), h('div', { class: 'fbar' }, h('i', { style: `width:${(it.have / ev.need) * 100}%` }))), h('span', { class: 'soft' }, `${it.have} / ${ev.need}`)))),
        h('div', { class: 'card' }, h('div', { class: 'item' }, h('span', { class: 'ico' }, ev.rewardNew ? reward?.icon ?? '🎁' : '🐟'), h('div', { class: 'txt' }, h('b', null, ev.done ? '这一季已经完成' : '完成的奖励'),
          h('span', { class: 'soft' }, `小鱼干 +${ev.fish}` + (ev.rewardNew ? `，这一季限定的装饰「${reward?.name ?? ''}」` : `（「${reward?.name ?? ''}」以前已经拿到了）`))))),
        ev.done ? null : h('p', { class: 'soft' }, lying ? `院子里现在有 ${lying} 样等着捡。` : '院子里现在没有，过一会儿再来看看。'),
        ev.done || !lying ? null : h('p', null, h('button', { class: 'btn primary block', onclick: () => { this.close(); this.scene.scrollToZone(ZONES.findIndex((z) => z.id === 'garden')); } }, '去院子')),
        h('p', { class: 'soft' }, `已经收集过的季节装饰：${s.seasonalClaimed.length} / 4`)];
    } });
  }

  // ---------- 邻居 ----------

  openNeighbors() {
    this.open({ title: '邻居', render: () => {
      const s = this.game.state; const NB = CONFIG.neighbors; const home = sim.homePets(s).filter((p) => !sim.isWeak(p));
      const out: Kid[] = [h('p', { class: 'soft' }, '住在附近的三只猫。你开着游戏的时候，它们偶尔会来串门（麻薯从院子的栅栏进来，大黑和花卷从别人家的屋顶过来、顺着阳台的木梯下来），和家里的宠物玩一会儿、蹭口饭再走。来得多了就成了朋友，可以让宠物去它家回访。')];
      for (const [id, nb] of Object.entries(NEIGHBORS)) {
        const bond = sim.bondOf(s, id), friend = sim.isNeighborFriend(s, id), here = s.hood.now?.id === id; const set = this.game.sprites.get(nb.look);
        const keeps = (['flower', 'note'] as const).map((k) => [k, sim.keepsakeCount(s, k, id)] as const).filter(([, n]) => n > 0);
        out.push(h('div', { class: 'card' },
          h('div', { class: 'pethead' }, set ? this.petAnim(set, () => (here ? 'happy' : 'sit')) : null, h('div', { style: 'flex:1;min-width:0' },
            h('b', { style: 'font-size:18px' }, nb.name, h('span', { class: 'soft' }, `  ${nb.home}` + (here ? ' · 正在你家' : ''))), h('p', { class: 'soft' }, nb.desc),
            h('div', { class: 'bar' }, h('span', null, friend ? '朋友' : '熟悉'), h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(bond / NB.best) * 100}%;background:${friend ? 'var(--coral)' : 'var(--mustard)'}` })), h('span', { class: 'num' }, String(Math.round(bond)))),
            keeps.length ? h('p', { class: 'soft' }, '它留下的：', keeps.map(([k, n]) => `${FIND_KINDS[k].icon} ×${n}`).join('  ')) : null)),
          friend
            ? h('div', { class: 'seg' }, h('span', { class: 'soft', style: 'align-self:center' }, `去它家玩 ${Math.round(NB.outing / MIN)} 分钟：`), home.length ? home.map((p) => h('button', { class: 'chip', disabled: here, onclick: () => { const r = this.game.act((st) => sim.visitNeighbor(st, p.id, id)); this.say(r); sfx(r.ok ? 'door' : 'error'); } }, p.name)) : h('span', { class: 'soft', style: 'align-self:center' }, '家里现在没有能出门的宠物'))
            : h('p', { class: 'soft' }, `再熟 ${Math.ceil(NB.friendAt - bond)} 点就是朋友了（它每来一次 +${NB.bondPerVisit}，和一只宠物玩一次 +${NB.bondPerPlay}）。`)));
      }
      const outs = s.pets.filter((p) => p.outing);
      if (outs.length) out.push(h('h3', null, '正在串门'), ...outs.map((p) => h('p', null, `${p.name} 在${NEIGHBORS[p.outing!.neighborId]?.name ?? '邻居'}家，`, this.countdown(() => p.outing?.until ?? 0, '马上到家'), '后回来')));
      if (s.hood.stories.length) out.push(h('h3', null, '串门回来讲的'), ...s.hood.stories.map((st) => h('p', { class: 'soft' }, `· ${st.text}`)));
      out.push(h('p', { class: 'soft' }, `今天还会来 ${s.hood.quota} 次。`));
      return out;
    } });
  }

  openVisitor(id: string) {
    const s = this.game.state; const v0 = s.visitors.find((x) => x.id === id); if (!v0) return;
    const who = VISITORS[v0.who]; meow('short');
    const answer = (yes: boolean) => { const r = this.game.act((st) => sim.answerVisitor(st, id, yes)); this.say(r); if (r.ok) { sfx(yes ? 'coin' : 'close'); this.close(); } else sfx('error'); };
    this.open({ title: who.name, render: () => {
      const v = s.visitors.find((x) => x.id === id);
      if (!v) return [h('p', { class: 'center soft' }, '它已经走了。'), h('button', { class: 'btn block', onclick: () => this.close() }, '好')];
      const set = this.game.sprites.get(who.look); const name = (item: string) => [...FOODS, ...TOOLS, ...GOODS, FRY, TREAT].find((x) => x.id === item)?.name ?? item;
      const fav = sim.favorStatus(s, v.who);
      const out: Kid[] = [h('div', { class: 'pethead' }, set ? this.petAnim(set, () => 'idle') : null, h('div', { style: 'flex:1' }, h('p', null, `「${who.hello}」`), h('p', { class: 'soft' }, '再过 ', this.countdown(() => v.leaveAt, '马上'), ' 它就走了'),
        h('p', { class: 'soft' }, `帮过它 ${fav.have} 次` + (fav.next !== null ? `，再帮 ${Math.max(1, fav.next - fav.have)} 次它会送回礼` : '，已经是老朋友了'))))];
      if (v.kind === 'gift') {
        out.push(h('div', { class: 'card' }, h('div', { class: 'item' }, h('span', { class: 'ico' }, '🎁'), h('div', { class: 'txt' }, h('b', null, '带了一份小礼物'), h('span', { class: 'soft' }, v.item ? `${name(v.item)} ×1` : `小鱼干 ${v.fish}`)))));
        out.push(h('p', null, h('button', { class: 'btn primary block', onclick: () => answer(true) }, '收下，谢谢')));
      } else if (v.kind === 'trade') {
        const sv = v.gives && v.gives !== 'fish' ? SOUVENIRS[v.gives] : null; const have = sim.count(s, v.wants!);
        out.push(h('div', { class: 'card' }, h('div', { class: 'item' }, h('span', { class: 'ico' }, sv ? sv.icon : '🐟'), h('div', { class: 'txt' }, h('b', null, `想用一件东西换你的${name(v.wants!)}`),
          h('span', { class: 'soft' }, sv ? `它带来的是稀有纪念品「${sv.name}」：${sv.desc}` : `它带来的是 ${CONFIG.visitors.tradeFallbackFish} 小鱼干`), h('span', { class: 'soft' }, `家里现在有 ${have} 份${name(v.wants!)}`)))));
        out.push(h('div', { class: 'grid2' }, h('button', { class: 'btn primary', disabled: have < 1, onclick: () => answer(true) }, have < 1 ? `没有${name(v.wants!)}` : '换'), h('button', { class: 'btn', onclick: () => answer(false) }, '这次不换')));
        if (have < 1) out.push(h('p', { class: 'soft' }, '可以先去商店买，它走之前回来换。'));
      } else {
        const d = DESTS.find((x) => x.id === v.destId)!; const tier = ['', '任何便当都能到', '要带鱼罐头或更好的便当', '要带豪华便当'][d.tier];
        out.push(h('div', { class: 'card' }, h('div', { class: 'item' }, h('span', { class: 'ico' }, '✉️'), h('div', { class: 'txt' }, h('b', null, `想托你家宠物送一封信到${d.name}`),
          h('span', { class: 'soft' }, `${tier}。接下之后，派宠物出门时选「顺路送信」，回来有谢礼。${fmtDur(CONFIG.visitors.errandExpire)}内没送就作废。`)))));
        out.push(h('div', { class: 'grid2' }, h('button', { class: 'btn primary', disabled: !!s.errand, onclick: () => answer(true) }, s.errand ? '手上已经有一封信' : '接下这封信'), h('button', { class: 'btn', onclick: () => answer(false) }, '帮不上忙')));
      }
      return out;
    } });
  }

  // ---------- 狸花猫：找回离家出走的宠物 ----------

  openRescue() {
    meow('short');
    this.open({ title: '狸花猫', render: () => {
      const s = this.game.state; const lost = sim.lostPets(s);
      if (!lost.length) return [h('p', { class: 'soft center', style: 'padding:20px 0' }, '狸花猫打了个哈欠：现在没有谁需要找。')];
      return [h('div', { class: 'card soft' }, `「喵。有猫条吗？」狸花猫认识附近所有的猫。给它一根猫条，它出去找 ${fmtDur(CONFIG.runaway.searchTime)}，${Math.round((1 - CONFIG.runaway.failChance) * 100)}% 能带回来。一次只能找一只。你有 ${sim.count(s, TREAT.id)} 根猫条。`),
        h('div', { class: 'card', style: 'margin-top:10px' }, lost.map((p) => h('div', { class: 'item' }, h('span', { class: 'ico' }, h('span', { class: 'chip', style: 'padding:0;box-shadow:none;background:none' }, this.avatarCanvas(p, 56))),
          h('div', { class: 'txt' }, h('b', null, p.name), p.searchUntil !== null ? h('span', { class: 'soft' }, '正在找，还要 ', this.countdown(() => p.searchUntil ?? 0, '马上回来')) : h('span', { class: 'soft' }, '离家出走了')),
          p.searchUntil === null ? h('button', { class: 'btn small primary', onclick: () => { const r = this.game.act((st) => sim.sendSearch(st, p.id)); this.say(r); sfx(r.ok ? 'buy' : 'error'); } }, '请它去找') : null))),
        h('p', null, h('button', { class: 'btn block', onclick: () => this.openShop() }, `去商店买猫条（🐟 ${TREAT.price}）`))];
    } });
  }

  // ---------- 宠物面板 ----------

  openPet(id: string) {
    this.editingName = false; this.petTab = 'care';
    // 点到它时叫一声：饿了、不开心、平时，叫法不一样
    const pet = this.game.pet(id); const low = CONFIG.stats.lowThreshold;
    if (pet && !pet.dead && !sim.isLost(pet) && !pet.tripId) meow(pet.food < low ? 'hungry' : pet.mood < low ? 'sad' : 'short');
    this.open({ title: '宠物', render: () => this.renderPet(id) });
  }

  private renderPet(id: string): Kid[] {
    const s = this.game.state; const p = this.game.pet(id);
    if (!p) return [h('p', null, '找不到这只宠物')];
    const set = this.game.spriteOf(p);
    if (p.dead) return [
      h('div', { class: 'pethead' }, this.avatarCanvas(p, 208), h('div', null, h('b', null, p.name), h('p', { class: 'soft' }, `陪伴了 ${fmtDur(p.age)}`), h('p', { class: 'soft' }, `${fmtDate(p.adoptedAt)} – ${fmtDate(p.diedAt ?? s.clock)}`))),
      h('div', { class: 'banner grey' }, `${p.name}已经离开了。它的明信片还留在相册里。`),
    ];
    // 住在别处的家人（送养的、走失后被收养的）：不在串门时只能看看它和它的纪念册
    if (p.rehomed && !p.visit) return [
      h('div', { class: 'pethead' }, this.avatarCanvas(p, 208), h('div', null, h('b', null, p.name), h('p', { class: 'soft' }, `${p.rehomed.lost ? '被' : '搬去'}${p.rehomed.home}${p.rehomed.lost ? '收留了' : '住了'}`), h('p', { class: 'soft' }, `${fmtDate(p.rehomed.at)} 起`))),
      h('div', { class: 'banner grey' }, p.rehomed.far ? `${p.name}跟着新家人搬去了远方，偶尔会寄信回来。` : `${p.name}过得很好，偶尔会回来串门。`),
      h('p', null, h('button', { class: 'btn block', onclick: () => this.openFirsts(p.id) }, `翻开${p.name}的纪念册`)),
    ];
    if (sim.isLost(p)) {
      const searching = p.searchUntil !== null;
      return [h('div', { class: 'pethead' }, this.avatarCanvas(p, 208), h('div', null, h('b', { style: 'font-size:20px' }, p.name), h('p', { class: 'soft' }, `${sim.stageName(p)} · 离家出走了`))),
        h('div', { class: 'banner' }, `${p.name}饿了太久，自己跑出去了。门口的狸花猫认识附近所有的猫，给它一根猫条，它会出去找 ${fmtDur(CONFIG.runaway.searchTime)}，有 ${Math.round(CONFIG.runaway.failChance * 100)}% 的可能找不到。找回来的时候它会又饿又脏又不开心。`),
        searching ? h('div', { class: 'banner grey' }, '狸花猫正在外面找，还要 ', this.countdown(() => p.searchUntil ?? 0, '马上回来'))
          : h('button', { class: 'btn primary block', onclick: () => { const r = this.game.act((st) => sim.sendSearch(st, id)); this.say(r); sfx(r.ok ? 'buy' : 'error'); if (r.ok) meow('short'); } }, `给狸花猫一根猫条（有 ${sim.count(s, TREAT.id)} 根）`),
        !searching && sim.count(s, TREAT.id) < 1 ? h('p', null, h('button', { class: 'btn block', onclick: () => this.openShop() }, `去商店买猫条（🐟 ${TREAT.price}）`)) : null];
    }
    const trip = s.trips.find((t) => t.id === p.tripId);
    const action = (): ActionName => (this.preview && this.preview.petId === id && performance.now() < this.preview.until ? this.preview.action : sim.isWeak(p) ? 'sleep' : 'idle');
    const nameEl = this.editingName
      ? h('div', { class: 'row' }, h('input', { type: 'text', maxlength: 8, value: p.name, id: 'rename', style: 'flex:1;width:auto' }),
        h('button', { class: 'btn small primary', onclick: () => { const v = (document.getElementById('rename') as HTMLInputElement).value; this.editingName = false; if (!this.say(this.game.act((st) => sim.rename(st, id, v)))) this.refresh(true); } }, '保存'))
      : h('div', { class: 'row' }, h('b', { style: 'font-size:20px' }, p.name), h('button', { class: 'btn small', onclick: () => { this.editingName = true; this.refresh(true); } }, '改名'),
        h('div', { class: 'btn small file' }, '换头像', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
          try { await this.game.setPetAvatar(id, imageToAvatar(await loadImage(await fileToDataUrl(file)))); this.stripSig = ''; this.updateHud(); this.toast('头像换好了'); sfx('ok'); }
          catch { this.toast('这张图读不出来'); }
        } })));
    const ageEl = h('p', { class: 'soft' });
    this.live.push(() => {
      const st = sim.stageOf(p); const next = (st + 1) * CONFIG.growth.stageDuration - p.age;
      ageEl.textContent = `${sim.stageName(p)} · 已陪伴 ${fmtDur(p.age)}` + (st < 2 ? ` · 再过 ${fmtDur(next / Math.max(1, s.dev.growth))} 长大` : '');
    });
    const out: Kid[] = [h('div', { class: 'pethead' }, this.petAnim(() => this.game.spriteOf(p) ?? null, action), h('div', { style: 'flex:1;min-width:0' }, nameEl, ageEl))];
    // 毛色（换了以后很少再动，放在「更多」里）
    const colorRow = !p.spriteId.startsWith('custom:') ? h('div', { class: 'seg' }, Object.entries(FUR_COLORS).map(([k, v]) => h('button', { class: 'chip mini' + (p.spriteId === 'default:' + k ? ' on' : ''), onclick: async () => {
        await this.game.ensureSprite('default:' + k); this.cardCache.clear(); this.stripSig = '';
        this.say(this.game.act((st) => sim.setColor(st, id, k)));
      } }, v.name)), h('button', { class: 'chip mini' + (p.spriteId.startsWith('look:') ? ' on' : ''), onclick: () => this.openMaker(decodeLook(p.spriteId) ?? this.lookOfCoat(p.spriteId.slice(8)), `给${p.name}换个样子`, async (look) => {
        const sid = encodeLook(look); await this.game.ensureSprite(sid); this.cardCache.clear(); this.stripSig = '';
        this.say(this.game.act((st) => sim.setColor(st, id, sid))); this.openPet(id);
      }) }, '自己捏')) : null;
    // 三页：照顾（默认）/ 关于它 / 更多
    const tab = this.petTab;
    out.push(h('div', { class: 'seg tabs' }, ([['care', '照顾'], ['about', '关于它'], ['more', '更多']] as const).map(([v, n]) => h('button', { class: 'chip' + (tab === v ? ' on' : ''), onclick: () => { this.petTab = v; this.refresh(true); } }, n))));
    if (p.visit) out.push(h('div', { class: 'banner' }, `${p.name}从${p.rehomed?.home ?? '新家'}回来串门了，过一会儿就回去。`));
    if (tab === 'care') {
    for (const k of ['food', 'mood', 'clean'] as const) {
      const fill = h('div', { class: 'fill', style: `background:${STAT_COLOR[k]}` }); const num = h('span', { class: 'num' });
      this.live.push(() => { fill.style.width = `${p[k]}%`; num.textContent = String(Math.round(p[k])); });
      out.push(h('div', { class: 'bar' }, h('span', null, STAT_NAME[k]), h('div', { class: 'track' }, fill), num));
    }

    if (p.outing) {
      const nb = NEIGHBORS[p.outing.neighborId];
      out.push(h('div', { class: 'banner' }, `去${nb?.home ?? '邻居家'}找${nb?.name ?? '邻居'}玩了，`, this.countdown(() => p.outing?.until ?? 0, '马上到家'), '后回来。在邻居家有人照顾，状态不会下降。'));
      return out;
    }
    if (trip) {
      out.push(h('div', { class: 'banner' }, '出门中，', this.countdown(() => trip.returnAt, '马上到家'), '后回家。旅途中靠便当，状态不会下降。'));
      return out;
    }
    if (sim.isWeak(p)) {
      const left = h('b'); this.live.push(() => { left.textContent = fmtDur(sim.weakTimeLeft(s, p)); });
      out.push(h('div', { class: 'banner' }, `${p.name}饿得很虚弱，还能撑 `, left, `。喂食可以救回来，但心情会掉 ${CONFIG.weak.rescueMoodPenalty}。`));
    }

    const mult = (k: 'feed' | 'pet' | 'bath' | 'play') => { const m = sim.peekMult(s, p, k); return m < 1 ? h('small', null, `连续做，效果 ×${m}`) : null; };
    const doAct = (fn: (st: typeof s) => Result, anim: ActionName, food?: string) => this.careAct(id, fn, anim, food);
    out.push(h('h3', null, '喂食'));
    out.push(h('div', { class: 'grid3' }, FOODS.map((f) => h('button', { class: 'act', 'data-tut': `feed-${f.id}`, disabled: sim.count(s, f.id) < 1, onclick: () => doAct((st) => sim.feed(st, id, f.id), 'eat', f.id) },
      h('span', { class: 'big' }, f.icon), `${f.name} ×${sim.count(s, f.id)}`, h('small', null, `饱食 +${f.restore}`)))));
    const fm = mult('feed'); if (fm) out.push(h('p', { class: 'soft' }, '短时间内连续喂食，每次效果减半；', `下一次 ×${sim.peekMult(s, p, 'feed')}`));
    if (FOODS.every((f) => sim.count(s, f.id) < 1)) out.push(h('button', { class: 'btn block', onclick: () => this.openShop() }, '食物吃完了，去商店'));
    out.push(h('h3', null, '互动'));
    out.push(h('div', { class: 'grid3' },
      h('button', { class: 'act', 'data-tut': 'pet', onclick: () => doAct((st) => sim.petPet(st, id), 'happy') }, '摸摸', mult('pet') ?? h('small', null, `心情 +${CONFIG.actions.petMood}`)),
      h('button', { class: 'act', onclick: () => doAct((st) => sim.bath(st, id), 'bath') }, '洗澡', mult('bath') ?? h('small', null, `干净 +${CONFIG.actions.bathClean}`)),
      // 逗猫棒小玩法要先买逗猫棒：没买时点一下去商店
      s.owned.wand
        ? h('button', { class: 'act', onclick: () => this.openMiniGame('wand', id) }, '陪它玩', h('small', null, sim.minigameLeft(s).wand ? `小玩法 · 今天还有 ${sim.minigameLeft(s).wand} 局奖励` : '小玩法 · 加心情'))
        : h('button', { class: 'act', style: 'opacity:.7', onclick: () => { this.say({ ok: false, msg: '要先买一根逗猫棒才能陪它玩' }); this.openShop(); } }, '陪它玩', h('small', null, '🔒 需要逗猫棒')),
      h('button', { class: 'act', onclick: () => doAct((st) => sim.play(st, id), 'play') }, '玩耍', mult('play') ?? h('small', null, s.owned.wand ? `逗猫棒 · 心情 +${CONFIG.actions.playMoodWand}` : `心情 +${CONFIG.actions.playMoodHand}`))));
    if (sim.isProtected(s, p)) out.push(h('p', { class: 'soft' }, '新手保护：它还小，是家里的第一只，长大前饿得比较慢。'));
    if (!s.owned.wand) out.push(this.hint(`现在是空手逗它。`, `商店里有逗猫棒，买了以后能玩「陪它玩」小玩法，平时的玩耍也变成心情 +${CONFIG.actions.playMoodWand}。`));
    return out;
    }
    if (tab === 'about') {
    // 亲密度和纪念册
    const bl = sim.bondLevel(p); const B = CONFIG.bond; const nf = sim.firstsOf(s, id).length;
    const unlock = bl.value < B.greetAt ? `到 ${B.greetAt} 它会在你回来时跑过来迎接。` : bl.value < B.rubAt ? `你回来时它会跑过来迎接；到 ${B.rubAt} 还会蹭蹭你。` : '你回来时它会跑过来蹭蹭你。';
    const waitNote = '家里最亲你的那只，会在你上次离开时看着的地方等你。';
    out.push(h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'item' }, h('span', { class: 'ico' }, '💗'), h('div', { class: 'txt' }, h('b', null, `亲密度 ${Math.floor(bl.value)} · ${bl.name}`, h('span', { class: 'hearts' }, '♥'.repeat(bl.level + 1) + '♡'.repeat(B.levels.length - 1 - bl.level))), this.hint('照顾它、陪它玩、带它出门都会涨，不会掉。', `${unlock}${waitNote}`))),
      h('div', { class: 'item' }, h('span', { class: 'ico' }, '📔'), h('div', { class: 'txt' }, h('b', null, `纪念册 ${nf} / ${Object.keys(FIRSTS).length}`), h('span', { class: 'soft' }, '它的每一个「第一次」都会拍一张照片留下来')), h('button', { class: 'btn small', onclick: () => this.openFirsts(id) }, '翻开'))));
    // 性格和朋友
    const tr = TRAITS[p.trait]; const friends = sim.friendsOf(s, id);
    out.push(h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'item' }, h('span', { class: 'ico' }, tr.icon), h('div', { class: 'txt' }, h('b', null, `性格：${tr.name}`), h('span', { class: 'soft' }, tr.desc))),
      h('div', { class: 'item' }, h('span', { class: 'ico' }, SEXES[p.sex].icon), h('div', { class: 'txt' }, h('b', null, SEXES[p.sex].name), h('span', { class: 'soft' }, p.sex === 'm' ? '长大后个子稍大一些' : '长大后个子稍小一些'))),
      friends.map((f) => h('div', { class: 'item' }, h('span', { class: 'ico' }, h('span', { class: 'chip', style: 'padding:0;box-shadow:none;background:none' }, this.avatarCanvas(f.pet, 56))),
        h('div', { class: 'txt' }, h('b', null, f.best ? `和${f.pet.name}是好朋友 ❤` : `和${f.pet.name}`),
          f.best ? h('span', { class: 'soft' }, `一起玩心情加倍，结伴出门更容易带回纪念品`) : h('span', { class: 'soft' }, `友情 ${Math.round(f.value)} / ${CONFIG.friendship.best}　一起出门、一起玩会增加`),
          h('div', { class: 'fbar' }, h('i', { style: `width:${(f.value / CONFIG.friendship.best) * 100}%` })))))));
    return out;
    }
    // 更多：换毛色、派它出门、送养
    if (colorRow) out.push(h('h3', null, '换个样子'), colorRow);
    if (p.visit) return out; // 回来串门的老家人：不能派出门、不能再送养
    out.push(h('p', null, h('button', { class: 'btn block', onclick: () => { this.plan = { petIds: [id], bento: this.plan.bento, tool: null, goods: [] }; this.openDoor(); } }, '派它出门')));
    // 为它找个新家（只有成年；确认两次才生效）
    if (sim.stageOf(p) === 2) {
      const chk = sim.rehomeCheck(s, id); const step = this.rehomeStep?.id === id ? this.rehomeStep.n : 0;
      if (step === 0) out.push(h('p', null, h('button', { class: 'btn block', disabled: !chk.ok, onclick: () => { this.rehomeStep = { id, n: 1 }; this.refresh(true); } }, '为它找个新家'), chk.ok ? null : h('small', { class: 'soft' }, chk.msg)));
      else out.push(h('div', { class: 'card', style: 'padding:12px' },
        h('b', null, step === 1 ? `要让${p.name}搬去邻居那边住吗？` : `真的确定吗？`),
        h('p', { class: 'soft' }, step === 1 ? `家里会空出一个位置。它以后会偶尔回来串门，纪念册和日记都会留着。这不会给你任何奖励。` : `${p.name}走了以后，不能把它接回来。`),
        h('div', { class: 'grid2' }, h('button', { class: 'btn', onclick: () => { this.rehomeStep = null; this.refresh(true); } }, '再想想'),
          h('button', { class: 'btn' + (step === 2 ? ' primary' : ''), onclick: () => { if (step === 1) { this.rehomeStep = { id, n: 2 }; this.refresh(true); return; } this.rehomeStep = null; const r = this.game.act((st) => sim.rehome(st, id)); this.say(r); if (r.ok) this.close(); } }, step === 1 ? '是的' : `送${p.name}去新家`))));
    }
    return out;
  }
  private rehomeStep: { id: string; n: number } | null = null;
  private petTab: 'care' | 'about' | 'more' = 'care';

  /** 说明文字：默认只显示第一句，点「?」展开完整说明（第一次看有用，之后不占地方） */
  private hint(short: string, more: string): HTMLElement {
    const el = h('p', { class: 'soft hint' }, short, ' ') as HTMLElement; const full = h('span', { class: 'hint-more' }, more) as HTMLElement;
    const btn = h('button', { class: 'hint-q', onclick: (e: Event) => { e.stopPropagation(); el.classList.toggle('open'); } }, '?');
    el.append(btn, full); return el;
  }

  // ---------- 门口：派宠物出门 ----------

  openDoor() { this.open({ title: '门口', render: () => this.renderDoor() }); }

  private renderDoor(): Kid[] {
    const s = this.game.state; const t = CONFIG.travel; const plan = this.plan;
    plan.petIds = plan.petIds.filter((id) => sim.homePets(s).some((p) => p.id === id));
    if (!FOODS.some((f) => f.id === plan.bento && sim.count(s, f.id) > 0)) plan.bento = FOODS.find((f) => sim.count(s, f.id) > 0)?.id ?? '';
    if (plan.tool && sim.count(s, plan.tool) < 1) plan.tool = null;
    const out: Kid[] = [];

    if (s.trips.length) {
      out.push(h('h3', null, '正在路上'));
      out.push(h('div', { class: 'card' }, s.trips.map((trip) => h('div', { class: 'item' },
        h('div', { class: 'txt' }, h('b', null, trip.petIds.map((id) => this.game.pet(id)?.name).join(' 和 ')), h('span', { class: 'soft' }, '还有 ', this.countdown(() => trip.returnAt, '马上到家'))),
        s.dev.enabled ? h('button', { class: 'btn small', onclick: () => this.game.runEvents((st) => sim.finishTripNow(st, trip.id)) }, '立刻回家') : null))));
    }

    out.push(h('h3', null, `① 选谁出门（结伴最多 ${t.maxCompanions} 只，共用一张明信片）`));
    const home = sim.homePets(s);
    if (!home.length) out.push(h('p', { class: 'soft' }, '家里没有宠物了，等它们回来吧。'));
    out.push(h('div', { class: 'row' }, home.map((p) => {
      const bad = sim.isWeak(p) ? '虚弱' : p.mood < t.moodRefuseBelow ? '不想出门' : '';
      const on = plan.petIds.includes(p.id);
      return h('button', { class: 'chip' + (on ? ' on' : ''), disabled: !!bad, onclick: () => {
        if (on) plan.petIds = plan.petIds.filter((x) => x !== p.id);
        else { plan.petIds.push(p.id); if (plan.petIds.length > t.maxCompanions) plan.petIds.shift(); }
        this.refresh(true);
      } }, this.avatarCanvas(p, 56), p.name, bad ? `（${bad}）` : '');
    })));

    out.push(h('h3', null, '② 便当：决定走多久、走多远'));
    out.push(h('div', { class: 'grid3' }, FOODS.map((f) => h('button', { class: 'act' + (plan.bento === f.id ? ' btn on' : ''), disabled: sim.count(s, f.id) < 1, onclick: () => { plan.bento = f.id; this.refresh(true); } },
      h('span', { class: 'big' }, f.icon), `${f.name} ×${sim.count(s, f.id)}`, h('small', { style: plan.bento === f.id ? 'color:#fff' : '' }, `${['', '近处', '中等', '远方'][f.tier]} · ${fmtDur(f.tripTime)}`)))));

    out.push(h('h3', null, '③ 行李：影响去哪类地方、带回什么（可以不带）'));
    const tools = TOOLS.filter((x) => sim.count(s, x.id) > 0);
    out.push(h('div', { class: 'row' }, h('button', { class: 'chip' + (!plan.tool ? ' on' : ''), onclick: () => { plan.tool = null; this.refresh(true); } }, '不带'),
      tools.map((x) => h('button', { class: 'chip' + (plan.tool === x.id ? ' on' : ''), onclick: () => { plan.tool = x.id; this.refresh(true); } }, `${x.icon} ${x.name}`))));
    if (!tools.length) out.push(h('p', { class: 'soft' }, '还没有行李道具，商店里可以买。'));

    const cap = sim.goodsCapacity(Math.max(1, plan.petIds.length));
    if (plan.goods.length > cap) plan.goods.length = cap; // 少带了一只猫：多出来的货放回去
    out.push(h('h3', null, `④ 货物：路上随机卖掉，换成小鱼干（${Math.max(1, plan.petIds.length)} 只猫最多带 ${cap} 件，每多一只多 ${t.goodsPerExtraPet} 件）`));
    const goodsRows = GOODS.filter((g) => sim.count(s, g.id) > 0 || plan.goods.includes(g.id)).map((g) => {
      const n = plan.goods.filter((x) => x === g.id).length;
      return h('div', { class: 'item' }, h('span', { class: 'ico' }, g.icon), h('div', { class: 'txt' }, h('b', null, g.name), h('span', { class: 'soft' }, `有 ${sim.count(s, g.id)} 件 · 卖 ${g.sellMin}–${g.sellMax}`)),
        h('button', { class: 'btn small', disabled: n < 1, onclick: () => { const i = plan.goods.indexOf(g.id); if (i >= 0) plan.goods.splice(i, 1); this.refresh(true); } }, '−'),
        h('b', { style: 'width:22px;text-align:center' }, n),
        h('button', { class: 'btn small', disabled: plan.goods.length >= cap || n >= sim.count(s, g.id), onclick: () => { plan.goods.push(g.id); this.refresh(true); } }, '+'));
    });
    out.push(goodsRows.length ? h('div', { class: 'card' }, goodsRows) : h('p', { class: 'soft' }, '还没有货物，商店里可以买。'));

    if (s.errand) {
      const d = DESTS.find((x) => x.id === s.errand!.destId)!; const can = sim.errandReachable(s, plan.bento); if (!can) plan.errand = false;
      out.push(h('h3', null, '顺路送信'));
      out.push(h('div', { class: 'card' }, h('div', { class: 'item' }, h('span', { class: 'ico' }, '✉️'), h('div', { class: 'txt' }, h('b', null, `${VISITORS[s.errand.from].name}托的信：送到${d.name}`),
        h('span', { class: 'soft' }, can ? `选了就一定去${d.name}，回来有谢礼 🐟 ${s.errand.reward}` : `这份便当到不了${d.name}，要换好一点的便当`)),
        h('button', { class: 'btn small' + (plan.errand ? ' on' : ''), disabled: !can, onclick: () => { plan.errand = !plan.errand; this.refresh(true); } }, plan.errand ? '顺路送' : '不送'))));
    }
    const chk = sim.checkDispatch(s, plan);
    if (plan.petIds.length && sim.kittenOnly(s, plan.petIds)) out.push(h('p', { class: 'soft' }, `幼年的猫自己只能去近处（${DESTS.filter((d) => d.tier <= CONFIG.growth.kittenMaxTier).map((d) => d.name).join('、')}），带的便当再好也只是走得久一些。带一只成年猫一起去就不限了。`));
    out.push(h('p', { style: 'margin-top:16px' }, h('button', { class: 'btn primary block', disabled: !chk.ok, onclick: () => {
      const r = this.game.act((st) => sim.dispatch(st, plan)); this.say(r);
      if (r.ok) { this.plan = { petIds: [], bento: plan.bento, tool: null, goods: [] }; this.close(); sfx('door'); meow('short'); } else sfx('error');
    } }, chk.ok ? '出发' : chk.msg)));
    out.push(h('p', { class: 'row' }, h('button', { class: 'btn small', onclick: () => this.openShop() }, '去商店')));
    return out;
  }

  // ---------- 回家 ----------

  private cardCanvas(card: Postcard) {
    let cv = this.cardCache.get(card.id);
    if (!cv) { cv = renderPostcard(card, card.petIds.map((id) => this.game.spriteOf(this.game.pet(id))), this.game.assets.get(`postcard.${card.destId}`), !!this.game.state.dev.debugBoxes && this.game.state.dev.enabled); this.cardCache.set(card.id, cv); }
    return cv;
  }
  private cardCopy(card: Postcard) {
    const src = this.cardCanvas(card); const cv = h('canvas', { width: src.width, height: src.height }) as HTMLCanvasElement;
    cv.getContext('2d')!.drawImage(src, 0, 0); return cv;
  }
  private cardDetail(card: Postcard, brief = false): Kid[] {
    const dest = DESTS.find((d) => d.id === card.destId)!; const names = card.petIds.map((id) => this.game.pet(id)?.name ?? '？').join(' 和 ');
    const out: Kid[] = [h('div', { class: 'postcard' }, this.cardCopy(card), h('span', null, `${dest.name} · ${names} · ${fmtDate(card.at)}` + (card.kind === 'letter' ? ' · 路上寄来' : '')))];
    if (card.season && card.time) out.push(h('p', { class: 'soft center', style: 'margin:6px 0 0' }, `${SEASON_NAMES[card.season]} · ${TIME_NAMES[card.time]}`));
    if (card.diary) out.push(h('p', { class: 'diary' }, card.diary, h('span', null, `—— ${names}`)));
    const pinned = sim.shownPostcards(this.game.state).some((c) => c.id === card.id);
    out.push(h('p', null, h('button', { class: 'btn block' + (pinned ? ' on' : ''), onclick: () => { const r = this.game.act((st) => sim.toggleDisplayPostcard(st, card.id)); if (!r.ok) this.say(r); sfx(r.ok ? 'click' : 'error'); } }, pinned ? '挂在相册墙上（点一下取下）' : `挂到相册墙上（最多 ${CONFIG.travel.displayPostcards} 张）`)));
    out.push(h('div', { class: 'grid2' },
      h('button', { class: 'btn', onclick: async () => { const blob = await canvasToBlob(this.cardCanvas(card)); if (!blob) { this.toast('生成图片失败'); return; } const msg = saveMessage(await saveBlob(`postcard-${dest.id}-${card.id.slice(-5)}.png`, blob), '请长按图片保存'); if (msg) this.toast(msg); } }, isNative ? '保存到手机相册' : '下载这张图'),
      h('button', { class: 'btn danger', onclick: () => {
        if (this.deleteArmed !== card.id) { this.deleteArmed = card.id; this.refresh(true); return; }
        this.deleteArmed = null; const r = this.game.act((st) => sim.deletePostcard(st, card.id)); this.cardCache.delete(card.id); this.say(r);
        if (sim.albumOver(this.game.state) > 0) this.openAlbumFull(); else this.open({ title: '纪念相册', render: () => this.renderAlbum() });
      } }, this.deleteArmed === card.id ? '再点一次，确认删除' : '删除这张')));
    if (brief || card.kind === 'letter') return out;
    const sv = card.souvenir ? SOUVENIRS[card.souvenir] : null;
    out.push(h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'item' }, h('span', { class: 'ico' }, sv ? sv.icon : '·'), h('div', { class: 'txt' }, h('b', null, sv ? `带回纪念品：${sv.name}` : '这次没带回纪念品'), h('span', { class: 'soft' }, sv ? '已经摆进收藏柜' : '心情好、带对行李，更容易带回来'))),
      card.sold.length + card.unsold.length ? h('div', { class: 'item' }, h('span', { class: 'ico' }, '🐟'), h('div', { class: 'txt' }, h('b', null, `卖货收入 +${card.income}`), h('span', { class: 'soft' }, `卖掉 ${card.sold.length} 件` + (card.unsold.length ? `，${card.unsold.length} 件没卖掉，带回来了` : '')))) : null));
    return out;
  }

  showReturns() {
    const s = this.game.state;
    const id = s.pendingReturns[0]; if (!id) return;
    const card = s.postcards.find((c) => c.id === id);
    if (!card) { s.pendingReturns.shift(); return; }
    const names = card.petIds.map((pid) => this.game.pet(pid)?.name ?? '？').join(' 和 ');
    if (card.kind === 'letter') {
      this.open({ title: `${names}寄来了一张明信片`, onClose: () => { const i = s.pendingReturns.indexOf(id); if (i >= 0) s.pendingReturns.splice(i, 1); this.game.save(); },
        render: () => [...this.cardDetail(card, true), h('button', { class: 'btn primary block', onclick: () => this.close() }, '收进相册')] });
      return;
    }
    this.open({ title: `${names}回家了`, onClose: () => { const i = s.pendingReturns.indexOf(id); if (i >= 0) s.pendingReturns.splice(i, 1); this.game.save(); },
      render: () => [...this.cardDetail(card), h('p', { class: 'soft center' }, `旅行回来有点脏，干净值 −${CONFIG.travel.cleanDropOnReturn}`), h('button', { class: 'btn primary block', onclick: () => this.close() }, '收进相册')] });
  }

  private notifyStatusText = '';
  private loadNotifyStatus() { void notifyStatus().then((lines) => { this.notifyStatusText = lines.join('\n'); if (this.sheet?.title === '开发者面板') this.refresh(true); }); }

  // ---------- 相册满了：请主人自己挑着删 ----------

  private deleteArmed: string | null = null;
  private albumWarned = false;
  /** 相册超出上限时弹出来。删到不超为止；不想删就关掉——第一次关会提醒，再关一次就放弃新带回来的那几张 */
  openAlbumFull() {
    const s = this.game.state;
    if (sim.albumOver(s) <= 0) return;
    this.albumWarned = false;
    this.open({ title: '相册放不下了',
      beforeClose: () => {
        const over = sim.albumOver(s); if (over <= 0) return true;
        if (!this.albumWarned) { this.albumWarned = true; this.refresh(true); if (this.body) this.body.scrollTop = 0; sfx('error'); return false; }
        const n = this.game.act((st) => ({ ok: true as const, msg: String(sim.discardOverflow(st)) })); this.cardCache.clear();
        this.toast(`没有整理，新带回来的 ${n.msg} 张没有保存`); return true;
      },
      render: () => {
        const over = sim.albumOver(s);
        if (over <= 0) return [h('p', { class: 'center' }, '整理好了，新的明信片已经收进相册。'), h('button', { class: 'btn primary block', onclick: () => this.close() }, '好')];
        const newest = new Set(s.postcards.slice(-over).map((c) => c.id));
        const out: Kid[] = [];
        if (this.albumWarned) out.push(h('div', { class: 'card warn' }, h('b', null, '确认退出？'), h('p', null, `现在退出的话，新带回来的 ${over} 张明信片将无法保存。纪念品和小鱼干不受影响。`),
          h('div', { class: 'grid2' }, h('button', { class: 'btn primary', onclick: () => { this.albumWarned = false; this.refresh(true); } }, '继续整理'), h('button', { class: 'btn danger', onclick: () => this.close() }, '不保存，退出'))));
        out.push(h('p', { class: 'soft' }, `相册最多放 ${sim.albumLimit()} 张，现在多了 ${over} 张。请删掉 ${over} 张不想留的（新的旧的都可以删）。`));
        out.push(h('div', { class: 'postgrid' }, s.postcards.slice().reverse().map((c) => {
          const dest = DESTS.find((d) => d.id === c.destId)!;
          return h('div', { class: 'postcard pick' }, this.cardCopy(c), h('span', null, (newest.has(c.id) ? '新 · ' : '') + `${dest.name} · ${fmtDate(c.at)}`),
            h('button', { class: 'btn small danger', onclick: () => { this.game.act((st) => sim.deletePostcard(st, c.id)); this.cardCache.delete(c.id); sfx('click'); this.refresh(true); } }, '删除'));
        })));
        return out;
      } });
  }

  // ---------- 相册、收藏柜 ----------

  openAlbum() { this.albumFilter = 'all'; this.open({ title: '纪念相册', render: () => this.renderAlbum() }); }

  private renderAlbum(): Kid[] {
    const s = this.game.state; const f = this.albumFilter;
    const chip = (key: string, label: string) => h('button', { class: 'chip' + (f === key ? ' on' : ''), onclick: () => { this.albumFilter = key; this.refresh(true); } }, label);
    const petsIn = s.pets.filter((p) => s.postcards.some((c) => c.petIds.includes(p.id)));
    const destsIn = DESTS.filter((d) => s.postcards.some((c) => c.destId === d.id));
    const cards = s.postcards.filter((c) => f === 'all' || c.petIds.includes(f.slice(4)) || c.destId === f.slice(5)).slice().reverse();
    const out: Kid[] = [h('p', { class: 'soft' }, `${s.postcards.length} / ${sim.albumLimit()} 张。点开一张可以保存到手机，或者删掉。相册满了不会自动删，新带回来的会请你自己挑。`), h('div', { class: 'row' }, chip('all', '全部'), petsIn.map((p) => chip('pet:' + p.id, p.name)), destsIn.map((d) => chip('dest:' + d.id, d.name)))];
    out.push(h('p', null, h('button', { class: 'btn block', onclick: () => this.openMoments() }, `📷 瞬间：游戏自己抓拍的照片（${s.moments.length}）`)));
    out.push(cards.length ? h('div', { class: 'postgrid', style: 'margin-top:12px' }, cards.map((c) => {
      const dest = DESTS.find((d) => d.id === c.destId)!;
      return h('button', { class: 'postcard', onclick: () => this.open({ title: dest.name, onClose: () => { this.deleteArmed = null; }, render: () => [...this.cardDetail(c), h('p', null, h('button', { class: 'btn block', onclick: () => this.open({ title: '纪念相册', render: () => this.renderAlbum() }) }, '回到相册'))] }) },
        this.cardCopy(c), h('span', null, `${dest.name} · ${fmtDate(c.at)}`));
    })) : h('p', { class: 'soft center', style: 'padding:24px 0' }, '还没有明信片。到门口派宠物出门，它会带一张回来。'));
    const dead = s.pets.filter((p) => p.dead);
    if (dead.length) {
      out.push(h('h3', null, '纪念'));
      out.push(h('div', { class: 'row' }, dead.map((p) => h('button', { class: 'chip', onclick: () => this.openPet(p.id) }, this.avatarCanvas(p, 56), p.name))));
    }
    return out;
  }

  // ---------- 图鉴 ----------

  openCodex() {
    this.open({ title: '图鉴', render: () => {
      const s = this.game.state; const ms = sim.milestoneStatus(s);
      const out: Kid[] = [h('div', { class: 'grid2' },
        h('div', { class: 'card center' }, h('b', { style: 'font-size:22px' }, `${sim.variantTotal(s)} / ${DESTS.length * sim.VARIANTS_PER_DEST}`), h('div', { class: 'soft' }, '明信片变体')),
        h('div', { class: 'card center' }, h('b', { style: 'font-size:22px' }, `${sim.souvenirTotal(s)} / ${Object.keys(SOUVENIRS).length}`), h('div', { class: 'soft' }, '纪念品')))];
      out.push(h('p', { class: 'soft' }, '同一个地方，四季和白天、傍晚、夜晚拍出来的明信片颜色都不一样，一共 12 种。删掉明信片不会丢图鉴记录。'));
      out.push(h('h3', null, '里程碑'));
      out.push(h('div', { class: 'card' }, ms.map((m) => h('div', { class: 'item' + (m.claimed ? ' dim' : '') }, h('span', { class: 'ico' }, m.decor ? SPECIAL_DECOR[m.decor].icon : '🐟'),
        h('div', { class: 'txt' }, h('b', null, `${m.kind === 'variants' ? '明信片变体' : '纪念品'} ${Math.min(m.have, m.need)} / ${m.need}`), h('span', { class: 'soft' }, `小鱼干 +${m.fish}` + (m.decor ? `，特殊装饰「${SPECIAL_DECOR[m.decor].name}」` : '') + (m.skin ? `，一款家具皮肤（${SKINS.find((k) => k.id === m.skin![1])?.name ?? ''}）` : '')),
          h('div', { class: 'fbar' }, h('i', { style: `width:${Math.min(1, m.have / m.need) * 100}%` }))),
        h('button', { class: 'btn small' + (m.ready ? ' primary' : ''), disabled: !m.ready, onclick: () => { const r = this.game.act((st) => sim.claimMilestone(st, m.id)); this.say(r); sfx(r.ok ? 'checkin' : 'error'); } }, m.claimed ? '已领' : m.ready ? '领取' : '未达成')))));
      for (const d of DESTS) {
        const got = sim.variantsOf(s, d.id);
        out.push(h('h3', null, `${d.name} · ${got.length} / ${sim.VARIANTS_PER_DEST}`));
        out.push(h('div', { class: 'card' },
          h('div', { class: 'vgrid' }, h('span'), TIME_IDS.map((t) => h('span', { class: 'soft' }, TIME_NAMES[t])),
            SEASON_IDS.flatMap((se) => [h('span', { class: 'soft' }, SEASON_NAMES[se]), ...TIME_IDS.map((t) => { const on = got.includes(sim.variantKey(se, t)); return h('i', { class: on ? 'on' : '', style: on ? `background:${CONFIG.cardTint.season[se].color};filter:brightness(${t === 'night' ? 0.55 : t === 'dusk' ? 0.85 : 1})` : '' }, on ? '✓' : ''); })])),
          h('div', { class: 'row', style: 'margin-top:10px' }, d.souvenirs.map((id) => { const have = !!s.souvenirs[id]; return h('span', { class: 'tagchip' + (SOUVENIRS[id].rare ? ' rare' : ''), style: have ? '' : 'opacity:.45' }, have ? `${SOUVENIRS[id].icon} ${SOUVENIRS[id].name}` : '？ 还没带回来'); }))));
      }
      return out;
    } });
  }

  // ---------- 猫的日记、猫的宝贝 ----------

  private diaryKey = ''; private diaryPet = 'all';
  openDiary() {
    const days = sim.diaryDays(this.game.state); this.diaryKey = days[0] ?? sim.diaryDay(this.game.state.clock); this.diaryPet = 'all';
    this.game.act((st) => { sim.markDiarySeen(st); return { ok: true, msg: '' }; });
    this.open({ title: '猫的日记', render: () => {
      const s = this.game.state; const days = sim.diaryDays(s); const i = days.indexOf(this.diaryKey);
      if (!days.length) return [h('p', { class: 'soft' }, '还没有日记。照顾它们、派它们出门、或者离开一会儿再回来，它们做过的事会写在这里。')];
      const pg = sim.diaryPage(s, this.diaryKey);
      const [y, m, d] = this.diaryKey.split('-').map(Number); const wk = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
      const today = sim.diaryDay(s.clock); const label = this.diaryKey === today ? '今天' : this.diaryKey === sim.diaryDay(s.clock - DAY) ? '昨天' : `${m} 月 ${d} 日`;
      const pets = [...new Set((s.diary.days[this.diaryKey] ?? []).map((f) => f.p))];
      const show = (p: string) => this.diaryPet === 'all' || this.diaryPet === p;
      const out: Kid[] = [
        h('div', { class: 'grid2', style: 'grid-template-columns:auto 1fr auto;align-items:center' },
          h('button', { class: 'btn small', disabled: i >= days.length - 1, onclick: () => { this.diaryKey = days[i + 1]; this.refresh(true); } }, '‹ 前一天'),
          h('b', { style: 'text-align:center' }, `${label} · 星期${wk}`),
          h('button', { class: 'btn small', disabled: i <= 0, onclick: () => { this.diaryKey = days[i - 1]; this.refresh(true); } }, '后一天 ›')),
      ];
      if (pets.length > 1) out.push(h('div', { class: 'seg', style: 'margin-top:8px' }, [['all', '全部'] as [string, string], ...pets.map((p) => [p, s.pets.find((x) => x.id === p)?.name ?? '它'] as [string, string])].map(([v, n]) => h('button', { class: 'chip' + (this.diaryPet === v ? ' on' : ''), onclick: () => { this.diaryPet = v; this.refresh(true); } }, n))));
      const card: Kid[] = [];
      for (const f of pg.featured) if (show(f.petId)) card.push(h('div', { class: 'diary-pet' }, h('b', null, f.name), ...f.lines.map((l) => h('p', null, l))));
      const rest = pg.others.filter((o) => show(o.petId));
      if (rest.length) card.push(h('div', { class: 'diary-pet' }, ...rest.map((o) => h('p', null, o.line))));
      out.push(h('div', { class: 'card diary' }, card.length ? card : [h('p', { class: 'soft' }, '这一天它没有什么特别的事。')]));
      out.push(h('button', { class: 'btn block' + (pg.starred ? ' on' : ''), onclick: () => { const r = this.game.act((st) => sim.starDiary(st, this.diaryKey)); this.say(r); sfx(r.ok ? 'click' : 'error'); } }, pg.starred ? '★ 已收藏这一页' : '☆ 收藏这一页（不会被翻过去）'));
      out.push(h('p', { class: 'soft' }, `只留最近 ${CONFIG.diary.keepDays} 天，收藏的页一直留着（最多 ${CONFIG.diary.maxStarred} 页，现在 ${s.diary.starred.length} 页）。`));
      return out;
    } });
  }

  openTreasures() {
    this.open({ title: '猫的宝贝', render: () => {
      const s = this.game.state; const all = Object.entries(TREASURES); const got = all.filter(([k]) => s.treasures[k]).length;
      const out: Kid[] = [this.hint(`已经收到 ${got} / ${all.length} 种。`, '你离开一段时间再回来，它们有时会在门口放一样东西。标「能摆出来」的是稀有的，收到后在「布置房间」里能摆出来。')];
      out.push(h('div', { class: 'card' }, all.map(([k, def]) => {
        const t = s.treasures[k]; const who = t ? s.pets.find((p) => p.id === t.petId)?.name : '';
        const when = t ? new Date(t.first) : null;
        return h('div', { class: 'item' + (t ? '' : ' dim') }, h('span', { class: 'ico' }, t ? def.icon : '？'),
          h('div', { class: 'txt' }, h('b', null, t ? def.name : '还没收到', def.rare ? h('span', { class: 'tagchip rare' }, '能摆出来') : def.season ? h('span', { class: 'tagchip' }, SEASON_NAMES[def.season]) : null),
            t ? h('span', { class: 'soft' }, `${def.desc}　第一次是${who ? who + '在' : ''}${when!.getMonth() + 1} 月 ${when!.getDate()} 日叼回来的` + (t.n > 1 ? `，一共 ${t.n} 次` : '')) : null));
      })));
      return out;
    } });
  }

  openCabinet() {
    this.open({ title: '收藏柜', render: () => {
      const s = this.game.state; const shown = sim.shownSouvenirs(s); const max = CONFIG.travel.displaySouvenirs;
      const out: Kid[] = [h('p', { class: 'soft' }, `已收集 ${Object.keys(s.souvenirs).length} / ${Object.keys(SOUVENIRS).length} 件。每个地方两件，一件普通一件稀有，不会重复。点「摆出来」可以挑哪 ${max} 件放在收藏柜上（现在摆着 ${shown.length} 件）。`)];
      for (const d of DESTS) {
        out.push(h('h3', null, `${d.name} · ${d.country}`));
        out.push(h('div', { class: 'card' }, d.souvenirs.map((id) => {
          const def = SOUVENIRS[id]; const have = !!s.souvenirs[id]; const on = shown.includes(id);
          return h('div', { class: 'item' + (have ? '' : ' dim') }, h('span', { class: 'ico' }, have ? def.icon : '？'),
            h('div', { class: 'txt' }, h('b', null, have ? def.name : '还没带回来', h('span', { class: 'tagchip' + (def.rare ? ' rare' : '') }, def.rare ? '稀有' : '普通')), have ? h('span', { class: 'soft' }, def.desc) : null),
            have ? h('button', { class: 'btn small' + (on ? ' on' : ''), onclick: () => { const r = this.game.act((st) => sim.toggleDisplaySouvenir(st, id)); if (!r.ok) this.say(r); sfx(r.ok ? 'click' : 'error'); } }, on ? '摆着' : '摆出来') : null);
        })));
      }
      return out;
    } });
  }

  // ---------- 鱼塘 ----------

  // ---------- 小玩法 ----------

  private mini: { kind: 'wand' | 'fishing'; petId: string; game: MiniGame | null; result: string | null } | null = null;
  /** 陪它玩（逗猫棒）或陪它捞鱼。一局结束后显示结果，可以再来一局 */
  /** 捞鱼开局前写清楚：捞的是哪一批、捞到一条给多少 */
  private fishNote(ripe: boolean) {
    const F = CONFIG.minigame.fishing;
    return ripe ? `这局捞鱼塘里长大的一批：每捞到一条小鱼干 +${F.ripeEach}（最多 ${F.ripeMax}）。捞到了这批就没了，一条没捞到鱼还在塘里。`
      : `这局捞还没长大的一批（鱼小，难捞一点）：每捞到一条小鱼干 +${F.fishEach}（最多 ${F.fishMax}）。捞到了这批就没了，一条没捞到鱼还在塘里。`;
  }
  /** 逗猫棒小玩法开局前写清楚的奖励（跟着今天还剩几局有小鱼干） */
  private wandNote() {
    const W = CONFIG.minigame.wand; const left = sim.minigameLeft(this.game.state).wand;
    return `每扑中一次：心情 +${W.mood}` + (left ? `、小鱼干 +${W.fishEach}（今天还有 ${left} 局有小鱼干，每局最多 ${W.fishMax} 条）` : '（今天的小鱼干奖励领完了）');
  }
  openMiniGame(kind: 'wand' | 'fishing', petId: string) {
    const p = this.game.pet(petId); const set = p ? this.game.sprites.get(p.spriteId) : null;
    const ok = this.game.state && (kind === 'wand' ? sim.canWandGame(this.game.state, petId) : sim.canFish(this.game.state, petId)); if (!p || !set || !ok.ok) { this.say(ok.ok ? { ok: false, msg: '找不到它' } : ok); sfx('error'); return; }
    const start = () => {
      this.mini?.game?.stop();
      // 捞鱼：这一局捞的是鱼塘里的第一批（先长大的），开局时就定下来
      const batch = kind === 'fishing' ? sim.pondBatches(this.game.state)[0] : undefined;
      if (kind === 'fishing' && !batch) { this.mini = { kind, petId, game: null, result: '鱼塘里没有能捞的鱼了，先放鱼苗' }; return; }
      const done = (n: number) => { const r = this.game.act((st) => kind === 'wand' ? sim.finishWand(st, petId, n) : sim.finishFishing(st, petId, n, batch?.slot)); sfx(r.ok && n ? 'coin' : 'click'); if (this.mini) { this.mini.result = r.msg ?? ''; this.mini.game = null; } this.refresh(true); };
      this.mini = { kind, petId, game: kind === 'wand' ? wandGame(set, p.name, done, this.wandNote()) : fishingGame(set, p.name, done, batch!.ripe, this.fishNote(batch!.ripe)), result: null };
    };
    start();
    // 房间里的这只猫也跟着：逗猫棒就在原地陪你玩，捞鱼就跑去鱼塘边，面板关了才去做别的
    this.scene.holdForMini(petId, kind);
    this.open({ title: kind === 'wand' ? `陪${p.name}玩` : `陪${p.name}捞鱼`, onClose: () => { this.mini?.game?.stop(); this.mini = null; this.scene.holdForMini(petId, null); }, render: () => {
      const m = this.mini; if (!m) return [];
      if (m.game) return [m.game.el];
      const left = sim.minigameLeft(this.game.state)[kind];
      const more = kind === 'wand' ? (left ? `今天还有 ${left} 局有小鱼干奖励。` : '今天的小鱼干奖励领完了，再玩只加心情。')
        : left ? `鱼塘里还有 ${left} 批鱼可以捞。` : '鱼塘里没有能捞的鱼了，去放鱼苗吧。';
      const again = kind === 'wand' || left > 0;
      return [h('div', { class: 'card', style: 'padding:14px' }, h('b', null, m.result ?? ''), h('p', { class: 'soft' }, more)),
        h('div', { class: 'grid2' }, h('button', { class: 'btn primary', disabled: !again, onclick: () => { start(); this.refresh(true); } }, '再来一局'), h('button', { class: 'btn', onclick: () => this.close() }, '不玩了'))];
    } });
  }

  /** 鱼塘面板里「让它去捞几批」现在选的是哪个（null = 用上次选的） */
  private autoPick: number | null = null;
  openPond() {
    this.open({ title: '鱼塘', render: () => {
      const s = this.game.state; const A = CONFIG.minigame.auto;
      const batches = sim.pondBatches(s).length; const choices = sim.autoFishChoices(s);
      const pick = Math.max(1, Math.min(choices.length || 1, this.autoPick ?? s.minigame.pick ?? 1));
      return [h('p', { class: 'soft' }, `鱼苗 ${fmtDur(CONFIG.pond.growTime)}长大，每条收获 ${CONFIG.pond.fishPerFry} 小鱼干。手上有 ${sim.count(s, FRY.id)} 条鱼苗。`),
        h('div', { class: 'card' }, s.pond.map((p, i) => h('div', { class: 'item' }, h('span', { class: 'ico' }, p == null ? '◌' : '🐟'),
          h('div', { class: 'txt' }, h('b', null, `位置 ${i + 1}`), p == null ? h('span', { class: 'soft' }, '空着') : sim.pondReady(s, i) ? h('span', { class: 'soft' }, '长大了，可以收获') : h('span', { class: 'soft' }, '还要 ', this.countdown(() => p + CONFIG.pond.growTime, '长大了'))),
          p == null ? h('button', { class: 'btn small', disabled: sim.count(s, FRY.id) < 1, onclick: () => this.say(this.game.act((st) => sim.plantFry(st, i))) }, '放鱼苗')
            : sim.pondTakenBy(s, i) ? h('span', { class: 'soft' }, `${sim.pondTakenBy(s, i)!.name}在捞`)
            : h('button', { class: 'btn small primary', disabled: !sim.pondReady(s, i), 'data-ready': i, onclick: () => { const r = this.game.act((st) => sim.harvest(st, i)); this.say(r); sfx(r.ok ? 'coin' : 'error'); } }, '收获')))),
        h('p', null, h('button', { class: 'btn block', disabled: s.fish < FRY.price, onclick: () => this.say(this.game.act((st) => sim.buy(st, FRY.id))) }, `买一条鱼苗（🐟 ${FRY.price}）`)),
        // 捞鱼：捞的是上面放的鱼。自己陪它玩一局（捞一批），或者选几批让它自己去
        h('h3', null, '捞鱼'),
        this.hint(batches ? `鱼塘里有 ${batches} 批鱼可以捞（先捞长大的）。` : s.pond.some((x) => x != null) ? '鱼塘里的鱼正有猫在捞，等它回来。' : '鱼塘里还没有能捞的鱼，先放鱼苗。',
          `「陪它捞」是个小玩法，一局捞一批，捞到了那批就没了，一条没捞到鱼还在塘里；长大的那批给得多。「让它去」不用玩：选捞几批，它先走到鱼塘边，到了才开始算时间（${A.minutes.map((m, i) => `${i + 1} 批 ${m} 分钟`).join('、')}），捞完带小鱼干回来。下雨天去不了。`),
        choices.length ? h('p', { class: 'soft', style: 'margin:6px 0 4px' }, '「让它去」捞几批：') : null,
        choices.length ? h('div', { class: 'grid3' }, choices.map((c) => h('button', { class: 'btn small' + (c.n === pick ? ' primary' : ''), onclick: () => { this.autoPick = c.n; this.refresh(true); } }, `${c.n} 批 · ${Math.round(c.ms / MIN)} 分钟`))) : null,
        h('div', { class: 'card' }, sim.homePets(s).map((p) => {
          const can = sim.canFish(s, p.id);
          const status = p.fishing ? (p.fishing.until == null ? `正往鱼塘走，要捞 ${p.fishing.slots.length || 1} 批` : ['在鱼塘边捞着，还要 ', this.countdown(() => p.fishing?.until ?? 0, '马上回来')]) : `心情 ${Math.round(p.mood)}`;
          return h('div', { class: 'item' }, this.avatarCanvas(p),
            h('div', { class: 'txt' }, h('b', null, p.name), h('span', { class: 'soft' }, status)),
            h('button', { class: 'btn small primary', disabled: !can.ok, onclick: () => this.openMiniGame('fishing', p.id) }, '陪它捞'),
            h('button', { class: 'btn small', disabled: !can.ok || !choices.length, onclick: () => {
              const r = this.game.act((st) => sim.startAutoFish(st, p.id, pick)); this.say(r); sfx(r.ok ? 'click' : 'error');
              // 放下手上的事，先往鱼塘走（到了才开始计时）
              if (r.ok) { this.scene.perform(p.id, 'fish'); this.autoPick = null; }
            } }, `让它去`));
        }))];
    } });
    // 鱼长大的那一刻，把「收获」按钮点亮
    const tick = () => { if (this.sheet?.title === '鱼塘') { const s = this.game.state; const stale = [...(this.body?.querySelectorAll('[data-ready]') ?? [])].some((b) => (b as HTMLButtonElement).disabled && sim.pondReady(s, Number((b as HTMLElement).dataset.ready))); if (stale) this.refresh(true); setTimeout(tick, 700); } };
    setTimeout(tick, 700);
  }

  // ---------- 商店 ----------

  openShop() {
    this.open({ title: '商店', render: () => {
      const s = this.game.state;
      const row = (id: string, icon: string, name: string, desc: string, price: number, owned?: boolean) => h('div', { class: 'item' }, h('span', { class: 'ico' }, icon),
        h('div', { class: 'txt' }, h('b', null, name, owned === undefined ? h('span', { class: 'soft' }, `  有 ${sim.count(s, id)}`) : null), h('span', { class: 'soft' }, desc)),
        h('button', { class: 'btn small' + (owned ? '' : ' primary'), disabled: owned || s.fish < price, onclick: () => { const r = this.game.act((st) => sim.buy(st, id)); this.say(r); sfx(r.ok ? 'buy' : 'error'); } }, owned ? '已拥有' : `🐟 ${price}`));
      return [h('p', null, `你有 🐟 ${s.fish} 小鱼干`),
        h('h3', null, '食物（也可以当出门的便当）'), h('div', { class: 'card' }, FOODS.map((f) => row(f.id, f.icon, f.name, f.desc, f.price))),
        h('h3', null, '行李道具（回家后会还回来）'), h('div', { class: 'card' }, TOOLS.map((t) => row(t.id, t.icon, t.name, t.desc, t.price))),
        h('h3', null, '行商货物（宠物带出门卖）'), h('div', { class: 'card' }, GOODS.map((g) => row(g.id, g.icon, g.name, `卖 ${g.sellMin}–${g.sellMax}，${Math.round(g.sellChance * 100)}% 能卖掉`, g.price))),
        h('h3', null, '鱼塘'), h('div', { class: 'card' }, row(FRY.id, FRY.icon, FRY.name, `${fmtDur(CONFIG.pond.growTime)}后收获 ${CONFIG.pond.fishPerFry} 小鱼干`, FRY.price)),
        h('h3', null, '其他'), h('div', { class: 'card' }, row(TREAT.id, TREAT.icon, TREAT.name, TREAT.desc, TREAT.price)),
        h('h3', null, '家里的东西（买一次就一直在）'), h('div', { class: 'card' }, GEAR.map((g) => row(g.id, g.icon, g.name, g.desc, g.price, !!s.owned[g.id]))),
        h('h3', null, '房间装饰（买了到「布置房间」里摆）'),
        h('div', { class: 'card' }, Object.entries(DECOR).filter(([, d]) => !d.special).map(([k, d]) => { const n = sim.decorCount(s, k); const full = n >= CONFIG.decor.maxPerKind;
          return h('div', { class: 'item' }, h('span', { class: 'ico' }, d.icon), h('div', { class: 'txt' }, h('b', null, d.name), h('span', { class: 'soft' }, `${d.desc}${n ? ` · 已有 ${n} 件` : ''}`)),
            h('button', { class: 'btn small', disabled: full || s.fish < d.price, onclick: () => { const r = this.game.act((st) => sim.buyDecor(st, k)); this.say(r); sfx(r.ok ? 'buy' : 'error'); } }, full ? '买满了' : `🐟 ${d.price}`)); })),
        h('h3', null, '房间风格（整套背景一起换）'),
        h('div', { class: 'card' }, ROOM_THEMES.filter((r) => r.price > 0).map((r) => { const own = sim.ownsRoom(s, r.id);
          return h('div', { class: 'item' }, h('span', { class: 'ico' }, r.icon), h('div', { class: 'txt' }, h('b', null, r.name), h('span', { class: 'soft' }, r.desc)),
            h('button', { class: 'btn small' + (own ? '' : ' primary'), disabled: own || s.fish < r.price, onclick: () => { const res = this.game.act((st) => sim.buyRoom(st, r.id)); this.say(res); sfx(res.ok ? 'buy' : 'error'); } }, own ? '已拥有' : `🐟 ${r.price}`)); })),
        h('p', { class: 'soft' }, `家具皮肤：每件家具和装饰都有 ${SKINS.length} 款（${SKINS.map((k) => k.name).join('、')}），在「布置房间」里点一下家具就能买和换。小件 🐟 ${SKIN_PRICE.S}，中件 🐟 ${SKIN_PRICE.M}，大件 🐟 ${SKIN_PRICE.L}。`),
        h('p', null, h('button', { class: 'btn block', onclick: () => this.startDecor() }, '去布置房间'))];
    } });
  }

  // ---------- 菜单、家庭成员、领养 ----------

  openMenu() {
    this.open({ title: '菜单', render: () => {
      const s = this.game.state; const btn = (label: string, fn: () => void, cls = '') => h('button', { class: 'btn' + (cls ? ' ' + cls : ''), onclick: fn }, label);
      return [
        h('div', { class: 'menu-sec' }, '回忆'),
        h('div', { class: 'grid3' },
          btn('猫的日记', () => this.openDiary(), sim.diaryUnread(s) ? 'primary has-dot' : ''),
          btn('相册', () => this.openAlbumHub()),
          btn('收藏', () => this.openCollectHub(), sim.milestoneStatus(s).some((m) => m.ready) ? 'primary' : '')),
        h('div', { class: 'menu-sec' }, '家'),
        h('div', { class: 'grid3' },
          btn('家庭成员', () => this.openFamily()), btn('出门', () => { this.scene.scrollToZone(0); this.openDoor(); }), btn('布置房间', () => this.startDecor()),
          btn('鱼塘', () => this.openPond()), btn('邻居', () => this.openNeighbors()), btn('季节活动', () => this.openSeasonEvent())),
        h('p', { style: 'margin-top:18px' }, btn('⚙ 设置', () => this.openSettings(), 'block')),
        h('div', { class: 'ver', onclick: () => {
          if (++this.verTaps >= 5) { this.verTaps = 0; s.dev.enabled = !s.dev.enabled; this.game.changed(); this.toast(s.dev.enabled ? '开发者模式已打开' : '开发者模式已关闭'); }
        } }, `喵屋 Meow House ${CONFIG.version}`)];
    } });
  }

  /** 拿到某个面板的内容（不真的打开它），给「相册」「收藏」这种分页面板用：原来的面板都不用改 */
  private contentOf(openFn: () => void): () => Kid[] {
    const real = this.open; let got: (() => Kid[]) | null = null;
    (this as any).open = (o: { render: () => Kid[] }) => { got = o.render; };
    try { openFn(); } finally { (this as any).open = real; }
    return got ?? (() => []);
  }
  /** 一个带分页的面板：上面一排分页按钮，下面是那一页原来的内容 */
  private openTabbed(title: string, tabs: [string, string, () => void][], first: string) {
    let cur = tabs.some((t) => t[0] === first) ? first : tabs[0][0];
    let body = this.contentOf(tabs.find((t) => t[0] === cur)![2]);
    this.open({ title, render: () => [
      h('div', { class: 'seg tabs' }, tabs.map(([id, label, fn]) => h('button', { class: 'chip' + (cur === id ? ' on' : ''), onclick: () => { cur = id; body = this.contentOf(fn); this.refresh(true); } }, label))),
      ...body()] });
  }
  /** 相册：明信片、瞬间、每只猫的纪念册 */
  openAlbumHub(tab = 'cards') {
    const n = this.game.state.moments.length;
    this.openTabbed('相册', [['cards', '明信片', () => this.openAlbum()], ['moments', n ? `瞬间（${n}）` : '瞬间', () => this.openMoments()], ['firsts', '纪念册', () => this.openFirstsList()]], tab);
  }
  /** 收藏：纪念品（收藏柜）、图鉴、猫的宝贝 */
  openCollectHub(tab = 'souvenirs') {
    this.openTabbed('收藏', [['souvenirs', '纪念品', () => this.openCabinet()], ['codex', '图鉴', () => this.openCodex()], ['treasures', '猫的宝贝', () => this.openTreasures()]], tab);
  }
  /** 纪念册：先选一只猫（家里的和住在别处的） */
  openFirstsList() {
    this.open({ title: '纪念册', render: () => {
      const s = this.game.state; const cats = [...sim.alivePets(s), ...sim.formerPets(s)]; const total = Object.keys(FIRSTS).length;
      return [h('p', { class: 'soft' }, '每只猫的「第一次」都会拍一张照片留下来。'),
        h('div', { class: 'card' }, cats.map((p) => h('div', { class: 'item' }, h('span', { class: 'ico' }, h('span', { class: 'chip', style: 'padding:0;box-shadow:none;background:none' }, this.avatarCanvas(p, 56))),
          h('div', { class: 'txt' }, h('b', null, p.name), h('span', { class: 'soft' }, `${sim.firstsOf(s, p.id).length} / ${total}` + (p.rehomed ? ` · 住在${p.rehomed.home}` : ''))),
          h('button', { class: 'btn small', onclick: () => this.openFirsts(p.id) }, '翻开'))))];
    } });
  }

  /** 设置：声音、界面大小、提醒、季节、光影、背屏预览、开发者面板、清空存档 */
  openSettings() {
    this.resetArmed = false;
    this.open({ title: '设置', render: () => {
      const s = this.game.state;
      return [
        h('h3', null, '声音'),
        h('label', { class: 'volume' }, '音乐', h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(audioSettings.music * 100)), oninput: (e: Event) => setVolume('music', Number((e.target as HTMLInputElement).value) / 100) })),
        h('label', { class: 'volume' }, '音效和猫叫', h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(audioSettings.sound * 100)), oninput: (e: Event) => setVolume('sound', Number((e.target as HTMLInputElement).value) / 100), onchange: () => meow('short') })),
        h('h3', null, '界面大小'),
        h('div', { class: 'seg' }, ([[0.9, '小'], [1, '标准'], [1.15, '大'], [1.3, '特大']] as [number, string][]).map(([v, label]) => h('button', { class: 'chip' + (Math.abs(this.uiScale - v) < 0.01 ? ' on' : ''), onclick: () => { this.applyUiScale(v); this.refresh(true); } }, label))),
        h('p', null, h('button', { class: 'btn block', onclick: async () => {
          if (!s.settings.notify) {
            s.settings.notify = true;
            if (isNative && !(await notifyPermission(true))) this.toast('系统没有允许通知，请到手机设置里给这个 App 打开通知权限');
          } else s.settings.notify = false;
          this.game.changed();
        } }, `提醒（饿了、回家了）：${s.settings.notify ? '开' : '关'}`)),
        isNative ? null : h('p', { class: 'soft center' }, '离开游戏后的提醒只在安卓 App 里有效，网页版只在开着的时候提示。'),
        h('h3', null, '季节'),
        h('div', { class: 'seg' }, ([['cycle', `游戏里的四季（每季 ${CONFIG.season.days} 天）`], ['real', '跟现实的月份']] as ['cycle' | 'real', string][]).map(([v, label]) => h('button', { class: 'chip' + (s.settings.seasonMode === v ? ' on' : ''), onclick: () => { s.settings.seasonMode = v; this.game.changed(); } }, label))),
        h('p', { class: 'soft' }, `现在：${this.seasonLine()}`),
        h('p', null, h('button', { class: 'btn block', onclick: () => { s.settings.showSeason = !s.settings.showSeason; this.game.changed(); } }, `在主界面显示季节：${s.settings.showSeason ? '开' : '关'}`)),
        h('h3', null, '光影效果'),
        h('div', { class: 'seg' }, ([['ultra', '超高'], ['high', '高'], ['simple', '简单'], ['off', '关']] as const).map(([v, label]) => h('button', { class: 'chip' + (s.settings.light === v ? ' on' : ''), onclick: () => { s.settings.light = v; this.game.changed(); } }, label))),
        this.hint('越高越好看，也越费电。', s.settings.light === 'ultra' ? '最拟真：每个房间按离窗户、离灯的远近有亮有暗，白天窗户、夜里每盏灯都会让附近的家具和猫往背离光的方向投影子，几盏灯一起照就有几道影子。最费电，手机卡的话调低一档。' : s.settings.light === 'high' ? '光色、影子和窗户光都跟着手机的时间变，阳台、院子、屋顶上有跟着太阳转的影子。手机卡的话调到「简单」。' : s.settings.light === 'simple' ? '光色跟着手机的时间变，有脚下的影子和不动的窗户光，没有跟着太阳转的影子。' : '只分白天、傍晚、夜晚三种颜色，最省电。'),
        h('h3', null, '背屏'), h('p', null, h('button', { class: 'btn block', onclick: () => this.openBack() }, '背屏预览')),
        s.dev.enabled ? h('p', null, h('button', { class: 'btn block', onclick: () => this.openDev() }, '开发者面板')) : null,
        h('p', { style: 'margin-top:20px' }, h('button', { class: 'btn block danger', onclick: async () => {
          if (!this.resetArmed) { this.resetArmed = true; this.refresh(true); return; }
          await this.game.reset(); this.cardCache.clear(); this.close(); this.toast('存档已经清空，重新开始');
        } }, this.resetArmed ? '再点一次，确认清空全部存档' : '清空存档，重新开始'))];
    } });
  }

  openFamily() {
    this.open({ title: '家庭成员', render: () => {
      const s = this.game.state; const alive = sim.alivePets(s); const cost = sim.nextSlotCost(s);
      const out: Kid[] = [h('p', { class: 'soft' }, `现在养着 ${alive.length} 只，有 ${s.slots} 个位置（最多 ${CONFIG.maxPets} 个）。`)];
      out.push(h('div', { class: 'card' }, alive.map((p) => h('div', { class: 'item' }, h('span', { class: 'ico' }, h('span', { class: 'chip', style: 'padding:0;box-shadow:none;background:none' }, this.avatarCanvas(p, 56))),
        h('div', { class: 'txt' }, h('b', null, p.name), h('span', { class: 'soft' }, `${sim.stageName(p)}${p.tripId ? ' · 出门中' : sim.isWeak(p) ? ' · 虚弱' : ''}`)),
        h('button', { class: 'btn small', onclick: () => this.openPet(p.id) }, '看看')))));
      if (alive.length < s.slots) out.push(h('p', null, h('button', { class: 'btn primary block', onclick: () => this.openAdopt() }, '有空位：领养一只新宠物')));
      else if (cost !== null) out.push(h('p', null, h('button', { class: 'btn block', disabled: s.fish < cost, onclick: () => this.say(this.game.act((st) => sim.unlockSlot(st))) }, `解锁下一个空位（🐟 ${cost}）`)));
      else out.push(h('p', { class: 'soft center' }, '位置已经全部解锁。'));
      // 住在别处的家人
      const former = sim.formerPets(s);
      if (former.length) {
        out.push(h('h3', null, '住在别处的家人'));
        out.push(h('div', { class: 'card' }, former.map((p) => h('div', { class: 'item' }, h('span', { class: 'ico' }, h('span', { class: 'chip', style: 'padding:0;box-shadow:none;background:none' }, this.avatarCanvas(p, 56))),
          h('div', { class: 'txt' }, h('b', null, p.name), h('span', { class: 'soft' }, p.visit ? '正在家里串门' : p.rehomed!.far ? `跟着新家人搬去了远方（${p.rehomed!.home}）` : `住在${p.rehomed!.home}，偶尔回来串门`)),
          h('button', { class: 'btn small', onclick: () => this.openPet(p.id) }, '看看')))));
      }
      return out;
    } });
  }

  /** 内置毛色大致对应的「捏猫」起点 */
  private lookOfCoat(key: string): Look {
    const c = FUR_COLORS[key] ?? FUR_COLORS.orange;
    return { pattern: c.pattern ?? 'stripes', body: c.body, c2: c.c2 ?? DEFAULT_LOOK.c2, c3: c.c3 ?? DEFAULT_LOOK.c3, eye: c.eye ?? DEFAULT_LOOK.eye, long: !!c.long };
  }
  private previews = new Map<string, SpriteSet>();
  private previewSet(spriteId: string) {
    if (!this.previews.has(spriteId)) { if (this.previews.size > 8) this.previews.clear(); this.previews.set(spriteId, buildSet('preview:' + spriteId, drawDefaultSheet(spriteId.startsWith('default:') ? spriteId.slice(8) : spriteId))); }
    return this.previews.get(spriteId)!;
  }

  /** 捏猫的那几样选项：照片取色、花纹、颜色、眼睛、长短毛。改了就调用 changed */
  private lookEditor(look: Look, changed: () => void): Kid[] {
    const color = (label: string, key: 'body' | 'c2' | 'c3' | 'eye') => h('label', { class: 'swatch' }, h('input', { type: 'color', value: look[key], onchange: (e: Event) => { look[key] = (e.target as HTMLInputElement).value; changed(); } }), label);
    const uses2 = look.pattern !== 'stripes' && look.pattern !== 'solid', uses3 = look.pattern === 'calico' || look.pattern === 'tortie';
    return [
      h('label', { class: 'btn block file' }, '从照片取色（选一张猫的照片）', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        try { const img = await loadImage(await fileToDataUrl(file)); Object.assign(look, lookFromPhoto(img)); changed(); this.toast(`从照片里看，像是「${PATTERN_NAMES[look.pattern]}」。不对的话在下面改`); }
        catch { this.toast('这张图片读不了，换一张试试'); }
      } })),
      h('p', { class: 'soft' }, '只在手机上取颜色，照片不会上传。猫在照片中间、背景干净时最准；取到的只是颜色和花纹，不是长相。'),
      h('h3', null, '花纹'),
      h('div', { class: 'seg' }, (Object.entries(PATTERN_NAMES) as [CoatPattern, string][]).map(([k, v]) => h('button', { class: 'chip' + (look.pattern === k ? ' on' : ''), onclick: () => { look.pattern = k; changed(); } }, v))),
      h('h3', null, '颜色'),
      h('div', { class: 'row' }, color('主色', 'body'), uses2 ? color(look.pattern === 'point' ? '脸和四肢' : '花斑', 'c2') : null, uses3 ? color('第二种花斑', 'c3') : null, color('眼睛', 'eye')),
      h('div', { class: 'seg', style: 'margin-top:10px' }, h('button', { class: 'chip' + (!look.long ? ' on' : ''), onclick: () => { look.long = false; changed(); } }, '短毛'), h('button', { class: 'chip' + (look.long ? ' on' : ''), onclick: () => { look.long = true; changed(); } }, '长毛')),
    ];
  }

  /** 单独的捏猫面板（给已经领养的宠物换样子用） */
  openMaker(initial: Look, title: string, done: (look: Look) => void) {
    const look = { ...initial };
    this.open({ title, render: () => [
      h('div', { class: 'pethead' }, this.petAnim(this.previewSet(encodeLook(look)), () => 'idle'), h('div', { style: 'flex:1' }, h('p', { class: 'soft' }, '改一样，左边就跟着变。'))),
      ...this.lookEditor(look, () => this.refresh(true)),
      h('p', null, h('button', { class: 'btn primary block', onclick: () => done(look) }, '就用这个样子'))] });
  }

  openAdopt() {
    const keys = Object.keys(FUR_COLORS);
    this.adoptForm = { name: '', color: keys[sim.alivePets(this.game.state).length % keys.length] };
    let look: Look | null = null; let trait: Trait | null = null; let sex: Sex | null = null;
    this.open({ title: '领养新宠物', render: () => {
      const f = this.adoptForm; const sid = look ? encodeLook(look) : 'default:' + f.color;
      return [
        h('div', { class: 'pethead' }, this.petAnim(this.previewSet(sid), () => 'idle'),
          h('div', { style: 'flex:1' }, h('p', null, h('input', { type: 'text', maxlength: 8, placeholder: '取个名字（最多 8 个字）', value: f.name, oninput: (e: Event) => { f.name = (e.target as HTMLInputElement).value; } })))),
        h('h3', null, '挑一种'),
        h('div', { class: 'seg' }, Object.entries(FUR_COLORS).map(([k, v]) => h('button', { class: 'chip' + (!look && f.color === k ? ' on' : ''), onclick: () => { f.color = k; look = null; this.refresh(true); } }, v.name)),
          h('button', { class: 'chip' + (look ? ' on' : ''), onclick: () => { look = look ?? this.lookOfCoat(f.color); this.refresh(true); } }, '自己捏一只')),
        ...(look ? this.lookEditor(look, () => this.refresh(true)) : []),
        h('h3', null, '性格'),
        h('div', { class: 'seg' }, h('button', { class: 'chip' + (trait === null ? ' on' : ''), onclick: () => { trait = null; this.refresh(true); } }, '随缘'), TRAIT_IDS.map((k) => h('button', { class: 'chip' + (trait === k ? ' on' : ''), onclick: () => { trait = k; this.refresh(true); } }, `${TRAITS[k].icon} ${TRAITS[k].name}`))),
        h('p', { class: 'soft' }, trait ? TRAITS[trait].desc : '不选的话，领回家才知道它是什么性格。'),
        h('h3', null, '公猫还是母猫'),
        h('div', { class: 'seg' }, h('button', { class: 'chip' + (sex === null ? ' on' : ''), onclick: () => { sex = null; this.refresh(true); } }, '随缘'), SEX_IDS.map((k) => h('button', { class: 'chip' + (sex === k ? ' on' : ''), onclick: () => { sex = k; this.refresh(true); } }, `${SEXES[k].icon} ${SEXES[k].name}`))),
        h('p', { class: 'soft' }, '公猫长大后个子稍大，母猫稍小。'),
        h('p', null, h('button', { class: 'btn primary block', onclick: async () => {
          await this.game.ensureSprite(sid);
          const r = this.game.act((s) => sim.adopt(s, f.name, sid, trait ?? undefined, sex ?? undefined)); this.say(r);
          if (r.ok && r.petId) this.openPet(r.petId);
        } }, '领养')),
        h('p', { class: 'soft' }, '领养之后还可以再换样子，也可以在宠物面板里给它换一张自己的头像。')];
    } });
  }

  // ---------- 导入上传的精灵图 ----------

  openImport() {
    this.imp = { removeWhite: true, name: '' };
    this.open({ title: '上传宠物', render: () => this.renderImport() });
  }

  private async reprocess() {
    const imp = this.imp; if (!imp.srcUrl) return;
    imp.busy = true; this.refresh(true);
    try {
      const img = await loadImage(imp.srcUrl);
      const r = normalizeSheet(img, imp.removeWhite);
      if (!r.ok) { imp.error = r.msg; imp.sheet = undefined; imp.set = undefined; }
      else { imp.error = undefined; imp.sheet = r.sheet; imp.rows = r.rows; imp.set = buildSet('import-preview', r.sheet!, imp.avatar); }
    } catch { imp.error = '这张图片读不出来，换一张 PNG 试试'; }
    imp.busy = false; this.refresh(true);
  }

  private renderImport(): Kid[] {
    const imp = this.imp;
    const out: Kid[] = [
      h('div', { class: 'card soft' }, h('b', null, '格式'), h('br'), `一张 PNG，${SPRITE.framesPerRow} 列，每格 ${SPRITE.cell}×${SPRITE.cell}（其他大小会自动缩放），宠物面朝右。`, h('br'),
        '每行一个动作，从上到下：', SPRITE.rows.map((r, i) => `${SPRITE.rowNames[r]}${i < SPRITE.requiredRows ? '' : '（可选）'}`).join('、'), '。'),
      h('h3', null, '① 选图片'),
      h('div', { class: 'btn block file' }, imp.srcUrl ? '换一张图片' : '选择精灵图 PNG', h('input', { type: 'file', accept: 'image/png,image/webp,image/*', onchange: async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        imp.srcUrl = await fileToDataUrl(file); await this.reprocess();
      } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: imp.removeWhite, onchange: (e: Event) => { imp.removeWhite = (e.target as HTMLInputElement).checked; void this.reprocess(); } }), '自动去掉白色背景（Gemini 生成的图一般需要）'),
    ];
    if (imp.busy) out.push(h('p', { class: 'soft' }, '正在按格子切开……'));
    if (imp.error) out.push(h('div', { class: 'banner' }, imp.error));
    if (imp.set && !imp.busy) {
      const set = imp.set;
      out.push(h('h3', null, '② 逐个看看动作对不对'));
      out.push(h('div', { class: 'actgrid' }, SPRITE.rows.map((r) => {
        const has = hasRow(set, r);
        return h('div', { class: 'cell' }, this.petAnim(set, () => r, 128), SPRITE.rowNames[r].replace('（被摸）', ''), h('br'), h('span', { class: 'soft', style: 'font-size:11px' }, has ? '' : `用「${SPRITE.rowNames[SPRITE.fallback[r]].replace('（被摸）', '')}」代替`));
      })));
      out.push(h('h3', null, '③ 头像（可选）和名字'));
      out.push(h('div', { class: 'row' }, h('div', { class: 'btn small file' }, imp.avatar ? '换头像' : '上传头像', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        try { imp.avatar = imageToAvatar(await loadImage(await fileToDataUrl(file))); imp.set = buildSet('import-preview', imp.sheet!, imp.avatar); } catch { this.toast('头像读不出来'); }
        this.refresh(true);
      } })), h('span', { class: 'soft' }, imp.avatar ? '已选头像' : '不传的话，用待机第 1 帧当头像')));
      out.push(h('p', null, h('input', { type: 'text', maxlength: 8, placeholder: '取个名字（最多 8 个字）', value: imp.name, oninput: (e: Event) => { imp.name = (e.target as HTMLInputElement).value; } })));
      out.push(h('button', { class: 'btn primary block', onclick: async () => {
        if (!imp.name.trim()) { this.toast('先取个名字'); return; }
        if (sim.alivePets(this.game.state).length >= this.game.state.slots) { this.toast('没有空位了，先到「家庭成员」解锁'); return; }
        const { spriteId, persisted } = await this.game.saveCustomSprite(imp.sheet!, imp.avatar ?? null);
        const r = this.game.act((s) => sim.adopt(s, imp.name, spriteId)); this.say(r);
        if (!persisted) this.toast('这个浏览器存不下图片，关掉页面后要重新上传');
        if (r.ok && r.petId) this.openPet(r.petId);
      } }, '保存并领养'));
    }
    return out;
  }

  // ---------- 背屏预览（976×596） ----------

  openBack() {
    const B = CONFIG.backScreen;
    this.open({ title: '背屏预览', render: () => {
      const s = this.game.state; const alive = sim.alivePets(s);
      if (!alive.some((p) => p.id === this.backPet)) this.backPet = alive[0]?.id ?? '';
      const cv = h('canvas', { width: B.width, height: B.height }) as HTMLCanvasElement; const ctx = cv.getContext('2d')!;
      cv.addEventListener('click', () => {
        if (this.backCard && performance.now() < this.backCard.until) { this.backCard = null; return; }
        if (this.backMode !== 'pet') return;
        const p = this.game.pet(this.backPet); if (!p || p.tripId || p.outing) return;
        const r = sim.petPet(s, p.id, B.petMood); if (r.ok) { this.backHappy = performance.now() + 1600; this.game.save(); }
      });
      this.anims.push((t) => this.drawBack(ctx, t));
      const idx = alive.findIndex((p) => p.id === this.backPet);
      const sw = (d: number) => { if (alive.length) { this.backPet = alive[(idx + d + alive.length) % alive.length].id; this.refresh(true); } };
      const last = s.postcards[s.postcards.length - 1];
      return [h('div', { class: 'seg', style: 'margin-bottom:8px' }, BACK_MODES.map((m) => h('button', { class: 'chip' + (this.backMode === m.id ? ' on' : ''), onclick: () => { this.backMode = m.id; this.refresh(true); } }, m.name))),
        h('div', { class: 'backwrap' }, cv),
        h('p', { class: 'soft center' }, BACK_MODES.find((m) => m.id === this.backMode)?.desc ?? '', this.backMode === 'pet' ? '' : '（预览：只是先确定背屏上放什么，画面之后还会改）'),
        h('p', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn small', disabled: alive.length < 2, onclick: () => sw(-1) }, '上一只'), h('button', { class: 'btn small', disabled: alive.length < 2, onclick: () => sw(1) }, '下一只'),
          h('button', { class: 'btn small', disabled: !last, onclick: () => { if (last) this.backCard = { id: last.id, until: performance.now() + 9000 }; } }, '重看回家画面')),
        h('p', { class: 'soft' }, `按 ${B.width}×${B.height} 的实际比例模拟。点一下宠物 = 摸摸（心情 +${B.petMood}）。宠物回家时这里会展示明信片。左边灰色是摄像头占位，具体位置要以实机截图为准。`)];
    } });
  }

  private drawBack(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.game.state; const now = performance.now();
    const card = this.backCard && now < this.backCard.until ? s.postcards.find((c) => c.id === this.backCard!.id) : undefined;
    const pet = this.game.pet(this.backPet);
    drawBackScreen(ctx, t, { state: s, pet, set: this.game.spriteOf(pet), happy: now < this.backHappy, mode: this.backMode, setOf: (p) => this.game.spriteOf(p) ?? undefined, doing: (p) => this.scene.doingOf(p.id),
      card: card ? { image: this.cardCanvas(card), text: `${card.petIds.map((id) => this.game.pet(id)?.name).join(' 和 ')}从${DESTS.find((d) => d.id === card.destId)?.name ?? ''}回来了` } : null });
  }

  // ---------- 素材替换（在页面里直接上传图片预览） ----------

  private assetRemoveWhite: Record<string, boolean> = {};
  assetsChanged() { this.cardCache.clear(); this.stripSig = ''; this.updateHud(); this.refresh(true); }

  openAssets() {
    const A = this.game.assets;
    this.open({ title: '素材替换', render: () => {
      const out: Kid[] = [h('p', null, h('button', { class: 'btn block primary', onclick: () => this.openSheetCut() }, '整张切图：一张白底图切成很多件')),
        // 导入素材包：一个 zip 里按 public/assets/ 的文件夹和文件名放好，一次换掉一整套（只存在这台设备里，不进仓库）
        h('div', { class: 'grid2' },
          h('div', { class: 'btn file' }, '导入素材包（zip）', h('input', { type: 'file', accept: '.zip,application/zip', onchange: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.importPack(f); } })),
          h('button', { class: 'btn', disabled: !this.packKeys().length, onclick: () => this.clearPack() }, `清空导入的素材包${this.packKeys().length ? `（${this.packKeys().length}）` : ''}`)),
        this.hint('素材包只存在这台设备里，不进仓库。', 'zip 里的图片按 public/assets/ 下的文件夹和文件名放（和 docs/素材模板.md 一样，外面套几层文件夹都行）。没有的图继续用占位图；清空后整套回到占位图。适合先在手机上试看一整套素材，比如授权不允许放进公开仓库的免费素材。'), h('div', { class: 'grid2' }, h('button', { class: 'btn primary', onclick: () => this.startEdit() }, '调整点击区域'), h('button', { class: 'btn primary', onclick: () => this.startBgEdit() }, '调整背景')),
        h('p', { class: 'soft' }, '调整点击区域：拖动每件物品的位置和大小。调整背景：上传背景长图后，拖地板线和 5 个区域的分界线，宠物和物品会跟着对齐。'),
        h('p', { class: 'soft' }, '给任意一项上传图片，马上就能在游戏里看到。上传的图只存在这个浏览器里；要正式放进游戏，把文件按下面的文件名放到 public/assets/ 文件夹。没有图片的项目用代码画的占位图。')];
      let group = '';
      for (const slot of A.slots()) {
        if (slot.group !== group) { group = slot.group; out.push(h('h3', null, group)); }
        const st = A.status(slot.key); const pic = A.get(slot.key);
        const rw = this.assetRemoveWhite[slot.key] ?? (slot.kind === 'pet');
        const thumb = h('canvas', { width: 72, height: 72, style: 'width:36px;height:36px;border-radius:8px;background:#fff;flex:none' }) as HTMLCanvasElement;
        if (pic) { const k = Math.min(72 / pic.width, 72 / pic.height); thumb.getContext('2d')!.drawImage(pic, (72 - pic.width * k) / 2, (72 - pic.height * k) / 2, pic.width * k, pic.height * k); }
        out.push(h('div', { class: 'item' }, thumb,
          h('div', { class: 'txt' }, h('b', null, slot.name, h('span', { class: 'soft' }, st === 'upload' ? '  已上传' : st === 'file' ? '  用的是文件' : '  占位图')), h('span', { class: 'soft' }, `${slot.src} · ${slot.hint}`),
            slot.kind === 'pet' || slot.kind === 'object' ? h('label', { class: 'check', style: 'margin:4px 0 0;font-size:12px' }, h('input', { type: 'checkbox', checked: rw, onchange: (e: Event) => { this.assetRemoveWhite[slot.key] = (e.target as HTMLInputElement).checked; } }), '上传时去掉白色背景') : null),
          st === 'upload' ? h('button', { class: 'btn small', onclick: () => void A.clear(slot.key) }, '撤销') : null,
          h('div', { class: 'btn small file' }, '上传', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
            const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
            const saved = await A.upload(slot.key, file, this.assetRemoveWhite[slot.key] ?? (slot.kind === 'pet'));
            this.toast(saved ? `${slot.name}已换上` : `${slot.name}已换上（这个浏览器存不下，刷新后要重传）`);
          } }))));
      }
      return out;
    } });
  }

  // ---------- 导入素材包 ----------

  private packKeys(): string[] { try { return JSON.parse(localStorage.getItem('meow-pack-keys') ?? '[]'); } catch { return []; } }
  private setPackKeys(keys: string[]) { try { localStorage.setItem('meow-pack-keys', JSON.stringify(keys)); } catch { /* 存不了就算了 */ } }
  /** 读一个 zip，按路径对上素材格子，一张张换进去（存在这台设备里） */
  private async importPack(file: File) {
    this.toast('正在读素材包……');
    try {
      const A = this.game.assets; const slots = A.slots(); const srcs = slots.map((sl) => sl.src);
      const files = (await readZip(new Uint8Array(await file.arrayBuffer()))).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
      const done = new Set(this.packKeys()); const missed: string[] = []; let n = 0;
      for (const f of files) {
        const src = matchAssetPath(f.name, srcs); const slot = src ? slots.find((sl) => sl.src === src) : null;
        if (!slot) { missed.push(f.name.split('/').pop()!); continue; }
        const type = /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : 'image/jpeg';
        const url = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(new Blob([f.data as BlobPart], { type })); });
        if (await A.uploadDataUrl(slot.key, url, false)) { done.add(slot.key); n++; }
      }
      this.setPackKeys([...done]); this.assetsChanged?.();
      this.toast(n ? `换上了 ${n} 张` + (missed.length ? `，${missed.length} 张对不上文件名（比如 ${missed.slice(0, 3).join('、')}）` : '') : '一张也没对上：图片要按素材模板的文件夹和文件名放');
      this.refresh(true);
    } catch (e) { this.toast('这个 zip 读不出来' + (e instanceof Error && e.message ? `：${e.message}` : '')); }
  }
  /** 把导入的整套素材都撤掉，回到占位图（或者仓库里的正式图） */
  private async clearPack() {
    const keys = this.packKeys(); for (const k of keys) await this.game.assets.clear(k);
    this.setPackKeys([]); this.assetsChanged?.(); this.toast(`撤掉了 ${keys.length} 张，回到原来的图`); this.refresh(true);
  }

  // ---------- 整张切图：一张白底、画了好几件东西的图 → 自动切开、去白底、选文件名 → 预览 / 打包 zip ----------

  private cut: { sheet: CutSheet; file: string; pieces: { ids: number[]; cv: HTMLCanvasElement; key: string; sel: boolean }[] } | null = null;
  /** 一件切好的图最后的样子：窗户按比例挖空玻璃 */
  private cutFinal(p: { cv: HTMLCanvasElement; key: string }) { const g = glassOf(p.key); return g ? cutGlass(p.cv, g) : p.cv; }

  openSheetCut() {
    const A = this.game.assets;
    // 能选的文件名：家具、装饰、皮肤、季节图、明信片、头像……（宠物精灵图用「精灵图拼装」，背景整张图直接在素材替换里传）
    const slots = A.slots().filter((s) => s.kind !== 'pet' && s.kind !== 'room');
    this.open({ title: '整张切图', render: () => {
      const c = this.cut; const out: Kid[] = [
        h('p', { class: 'soft' }, '上传一张白底、画了好几件东西的图：程序按内容自动找出每一件，去掉白底、裁掉空白。给每一件选一个文件名（和 docs/素材模板.md 一样），被切碎的可以勾上几块合并，不要的丢掉。窗户会按素材模板的比例自动挖空玻璃。'),
        h('div', { class: 'btn block file' }, c ? '换一张图' : '上传一张白底图', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
          this.toast('正在找图里的每一件……');
          try {
            const img = await loadImage(await fileToDataUrl(file)); const sheet = readSheet(img);
            const pieces = sheet.labels.blobs.map((_, i) => ({ ids: [i], cv: cropPieces(sheet, [i]), key: '', sel: false }));
            this.cut = { sheet, file: file.name, pieces }; this.toast(pieces.length ? `找到 ${pieces.length} 件` : '图里没找到东西：要白底、物品之间留点空隙');
          } catch { this.toast('这张图读不出来'); }
          this.refresh(true);
        } })),
      ];
      if (!c) return out;
      const used = new Map<string, number>(); for (const p of c.pieces) if (p.key) used.set(p.key, (used.get(p.key) ?? 0) + 1);
      const dup = [...used].filter(([, n]) => n > 1).map(([k]) => slots.find((s) => s.key === k)?.name ?? k);
      const sel = c.pieces.filter((p) => p.sel); const named = c.pieces.filter((p) => p.key);
      out.push(h('p', { class: 'soft' }, `${c.file}：${c.pieces.length} 件，已经选好文件名 ${named.length} 件。` + (dup.length ? `有重复的文件名（${dup.join('、')}），后面的会盖掉前面的。` : '')));
      out.push(h('div', { class: 'grid2' },
        h('button', { class: 'btn', disabled: sel.length < 2, onclick: () => {
          const keep = sel[0]; keep.ids = sel.flatMap((p) => p.ids); keep.cv = cropPieces(c.sheet, keep.ids); keep.key = sel.find((p) => p.key)?.key ?? ''; keep.sel = false;
          c.pieces = c.pieces.filter((p) => p === keep || !p.sel); this.refresh(true);
        } }, `合并勾选的 ${sel.length || ''} 块`),
        h('button', { class: 'btn', disabled: !sel.length, onclick: () => { c.pieces = c.pieces.filter((p) => !p.sel); this.refresh(true); } }, '丢掉勾选的')));
      // 每一件：缩略图（棋盘格底，看得出透明）、大小、文件名下拉框、勾选、丢掉
      const groups = [...new Set(slots.map((s) => s.group))];
      c.pieces.forEach((p, i) => {
        const fin = this.cutFinal(p); const T = 96;
        const thumb = h('canvas', { width: T, height: T, style: 'width:64px;height:64px;border-radius:8px;flex:none;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/12px 12px' }) as HTMLCanvasElement;
        const k = Math.min(T / fin.width, T / fin.height); thumb.getContext('2d')!.drawImage(fin, (T - fin.width * k) / 2, (T - fin.height * k) / 2, fin.width * k, fin.height * k);
        const select = h('select', { style: 'width:100%;margin-top:4px;font-size:13px', onchange: (e: Event) => { p.key = (e.target as HTMLSelectElement).value; this.refresh(true); } },
          h('option', { value: '' }, '— 选它是哪个文件 —'),
          groups.map((g) => h('optgroup', { label: g }, slots.filter((s) => s.group === g).map((s) => h('option', { value: s.key, selected: s.key === p.key }, `${(used.get(s.key) ?? 0) > 0 && s.key !== p.key ? '✓ ' : ''}${s.name}（${s.src}）`)))));
        out.push(h('div', { class: 'item', style: 'align-items:flex-start' }, thumb,
          h('div', { class: 'txt' },
            h('b', null, `第 ${i + 1} 件`, h('span', { class: 'soft' }, `  ${p.cv.width}×${p.cv.height}` + (p.ids.length > 1 ? `，${p.ids.length} 块合并的` : '') + (glassOf(p.key) ? '，玻璃已挖空' : ''))),
            select,
            h('label', { class: 'check', style: 'margin:4px 0 0;font-size:12px' }, h('input', { type: 'checkbox', checked: p.sel, onchange: (e: Event) => { p.sel = (e.target as HTMLInputElement).checked; this.refresh(true); } }), '勾选（合并或丢掉）')),
          h('button', { class: 'btn small', onclick: () => { c.pieces = c.pieces.filter((x) => x !== p); this.refresh(true); } }, '丢掉')));
      });
      out.push(h('div', { class: 'grid2' },
        h('button', { class: 'btn primary', disabled: !named.length, onclick: async () => {
          let n = 0; for (const p of named) { await A.uploadDataUrl(p.key, this.cutFinal(p).toDataURL('image/png'), false); n++; }
          this.toast(`${n} 件已经换到游戏里了（只存在这个浏览器里；正式放进游戏用下面的打包）`);
        } }, '全部应用到游戏里预览'),
        h('button', { class: 'btn primary', disabled: !named.length, onclick: async () => {
          // 同一个文件名选了好几次：用最后一件
          const files = new Map<string, Uint8Array>();
          for (const p of named) { const slot = slots.find((s) => s.key === p.key); if (slot) files.set(`public/assets/${slot.src}`, await canvasBytes(this.cutFinal(p))); }
          const zip = makeZip([...files].map(([name, data]) => ({ name, data })));
          const d = new Date(); const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
          const r = await saveBlob(`喵屋素材-${stamp}.zip`, new Blob([zip as BlobPart], { type: 'application/zip' }));
          this.toast(r === 'saved' || r === 'unknown' ? `打包好了：${files.size} 个文件。在仓库根目录解压，会放进 public/assets/ 里对应的文件夹` : saveMessage(r, '换个浏览器试试'));
        } }, '打包成 zip')));
      return out;
    } });
  }

  // ---------- 调整点击区域 ----------

  // ---------- 布置房间 ----------

  private decorBar: HTMLElement | null = null;
  /** 点了一款还没买的皮肤或房间风格：先记下来，再点一次才真的买（避免误触） */
  private buyArmed = '';
  startDecor() {
    this.close(); if (this.decorBar) return;
    this.decorBar = h('div', { class: 'editbar decorbar' }); this.root.append(this.decorBar); this.root.classList.add('editing');
    this.buyArmed = ''; this.scene.setDecorMode(true); this.renderDecorBar();
  }
  stopDecor() {
    this.decorBar?.remove(); this.decorBar = null; this.root.classList.remove('editing');
    this.scene.setDecorMode(false); this.game.save();
  }
  /** 场景里选中、拖动了装饰时调用 */
  decorChanged(_id: string | null, msg?: string) { if (msg) this.toast(msg); this.buyArmed = ''; this.renderDecorBar(); }
  /** 一排可以点的款式。有的直接换；没买的第一次点显示价格确认，再点一次才买 */
  private pickRow(label: string, key: string, items: { id: string; name: string; on: boolean; owned: boolean; price: number }[], apply: (id: string) => Result) {
    const s = this.game.state;
    return h('div', { class: 'decor-tray skins' }, h('span', { class: 'soft tray-label' }, label), items.map((it) => {
      const armed = this.buyArmed === `${key}:${it.id}`;
      return h('button', { class: 'chip' + (it.on ? ' on' : '') + (armed ? ' armed' : ''), disabled: !it.owned && s.fish < it.price, onclick: () => {
        if (it.on) return;
        if (!it.owned && !armed) { this.buyArmed = `${key}:${it.id}`; this.renderDecorBar(); return; }
        this.buyArmed = ''; const r = this.game.act(() => apply(it.id)); this.say(r); sfx(r.ok ? (it.owned ? 'ok' : 'buy') : 'error'); this.renderDecorBar();
      } }, it.owned ? it.name : armed ? `再点一次买下 🐟 ${it.price}` : `${it.name} 🐟 ${it.price}`);
    }));
  }
  private renderDecorBar() {
    const bar = this.decorBar; if (!bar) return;
    const s = this.game.state; const sel = s.decor.find((d) => d.id === this.scene.decorSelected && d.zone !== null);
    const stored = sim.storedDecor(s); const kinds = [...new Set(stored.map((d) => d.kind))];
    // 选中的东西（摆好的装饰，或者一件固定家具）：可以换皮肤
    const furn = sel ? null : this.scene.furnSelected; const target = sel?.kind ?? furn; const price = target ? sim.skinPrice(target) : null;
    const targetName = sel ? DECOR[sel.kind].name : furn ? ASSETS.objects[furn]?.label ?? furn : '';
    bar.replaceChildren(...([
      h('div', { class: 'editbar-text' }, h('b', null, '布置房间'), h('span', { class: 'soft' }, sel ? `选中了：${targetName}。拖动可以挪位置，也可以拖到别的房间；下面可以换皮肤` : furn ? `选中了：${targetName}。固定的家具不能挪，可以在下面换皮肤` : '点家具或摆好的装饰可以换皮肤；装饰还可以拖动。点下面收着的装饰摆出来')),
      sel ? h('button', { class: 'btn small', onclick: () => { this.game.act((st) => sim.storeDecor(st, sel.id)); this.scene.selectDecor(null); this.renderDecorBar(); sfx('close'); } }, '收起来') : null,
      h('button', { class: 'btn small on', onclick: () => this.stopDecor() }, '完成'),
      target && price !== null
        ? this.pickRow('皮肤', `skin:${target}`, SKINS.map((k) => ({ id: k.id, name: k.name, on: sim.skinOf(s, target) === k.id, owned: sim.ownsSkin(s, target, k.id), price })), (id) => sim.setSkin(this.game.state, target, id))
        : this.pickRow('房间风格', 'room', ROOM_THEMES.map((r) => ({ id: r.id, name: `${r.icon} ${r.name}`, on: sim.roomOf(s) === r.id, owned: sim.ownsRoom(s, r.id), price: r.price })), (id) => (sim.ownsRoom(this.game.state, id) ? sim.setRoom(this.game.state, id) : sim.buyRoom(this.game.state, id))),
      h('div', { class: 'decor-tray' }, kinds.length ? kinds.map((k) => h('button', { class: 'chip', onclick: () => {
        // 在现在看着的这个房间里找一个放得下的位置（不和家具、别的装饰叠，不挡路）
        const it = stored.find((d) => d.kind === k)!; const spot = this.scene.findDecorSpot(it.id, k);
        if (!spot) { this.toast(`这个房间放不下${DECOR[k].name}了，换个房间试试`); sfx('error'); return; }
        const r = this.game.act((st) => sim.placeDecor(st, it.id, spot.zone, spot.x, spot.y));
        if (!r.ok) { this.say(r); sfx('error'); return; }
        sfx('open'); this.scene.selectDecor(it.id); this.renderDecorBar();
      } }, `${DECOR[k].icon} ${DECOR[k].name}` + (stored.filter((d) => d.kind === k).length > 1 ? ` ×${stored.filter((d) => d.kind === k).length}` : '')))
        : h('span', { class: 'soft' }, s.decor.length ? '装饰都摆出来了。商店里还有别的。' : '还没有装饰。到商店的「房间装饰」里买。'))].filter(Boolean) as HTMLElement[]));
  }

  private editBar: HTMLElement | null = null; private editInfo: HTMLElement | null = null;

  startEdit() {
    this.close();
    this.editInfo = h('span', { class: 'soft' }, '拖框移动，拖右上角的圆点改大小');
    this.editBar = h('div', { class: 'editbar' }, h('div', { class: 'editbar-text' }, h('b', null, '调整点击区域'), this.editInfo),
      h('button', { class: 'btn small primary', onclick: () => this.openExport() }, '导出配置'),
      h('button', { class: 'btn small', onclick: () => { resetObjects(); this.scene.refreshLayout(); this.toast('已还原成默认位置'); } }, '全部还原'),
      h('button', { class: 'btn small on', onclick: () => this.stopEdit() }, '完成'));
    this.root.append(this.editBar); this.root.classList.add('editing');
    this.scene.setEditMode(true); this.scene.relayout();
  }
  stopEdit() {
    this.editBar?.remove(); this.editBar = null; this.root.classList.remove('editing');
    this.scene.setEditMode(false); this.scene.relayout();
  }
  /** 场景里拖动时调用：kind = 正在调的物品；null = 松手了，存一下 */
  editChanged(kind: string | null) {
    if (kind === null) { saveLayout(); return; }
    const d = ASSETS.objects[kind];
    if (this.editInfo && d) this.editInfo.textContent = `${d.label}：x ${d.x}，y ${d.y}，height ${d.height}${isChanged(kind) ? '（已调整）' : ''}`;
  }
  // ---------- 调整背景：地板线和区域分界线 ----------

  startBgEdit() {
    if (!this.scene.hasStrip()) { this.toast('先在「素材替换」里上传背景长图或整张图'); return; }
    this.close();
    this.editInfo = h('span', { class: 'soft' });
    const pct = h('span', { class: 'soft' }, `${Math.round(ASSETS.petScale * 100)}%`);
    const slider = h('input', { type: 'range', min: '40', max: '250', step: '2', value: String(Math.round(ASSETS.petScale * 100)), oninput: (e: Event) => {
      ASSETS.petScale = Number((e.target as HTMLInputElement).value) / 100; pct.textContent = `${Math.round(ASSETS.petScale * 100)}%`; this.scene.geometryChanged(); saveLayout();
    } }) as HTMLInputElement;
    this.editBar = h('div', { class: 'editbar' }, h('div', { class: 'editbar-text' }, h('b', null, '调整背景'), this.editInfo),
      h('button', { class: 'btn small primary', onclick: () => this.openExport() }, '导出配置'),
      h('button', { class: 'btn small', onclick: () => { resetBackground(); slider.value = String(Math.round(ASSETS.petScale * 100)); pct.textContent = `${slider.value}%`; this.scene.geometryChanged(); this.bgChanged(false); this.toast('已还原'); } }, '还原'),
      h('button', { class: 'btn small on', onclick: () => this.stopBgEdit() }, '完成'),
      h('label', { class: 'editbar-slider' }, '宠物大小', slider, pct));
    this.root.append(this.editBar); this.root.classList.add('editing');
    this.scene.setBgMode(true); this.scene.relayout(); this.bgChanged(false);
  }
  stopBgEdit() {
    this.editBar?.remove(); this.editBar = null; this.root.classList.remove('editing');
    this.scene.setBgMode(false); this.scene.relayout();
  }
  /** 场景里拖线时调用；done = 松手了，存一下 */
  bgChanged(done: boolean) {
    if (done) saveLayout();
    const s = bgCfg();
    if (this.editInfo) this.editInfo.textContent = `红线 = 地板线，蓝线 = 区域分界线，拖圆点或线都行。地板线 ${(s.floor * 100).toFixed(1)}%`;
  }

  // ---------- 精灵图拼装：每个动作一张横排 4 帧的图 ----------

  private asm: { parts: Partial<Record<ActionName, StripPart>>; out: Assembled | null; set: SpriteSet | null; name: string; color: string; avatar: HTMLCanvasElement | null } = { parts: {}, out: null, set: null, name: '', color: 'orange', avatar: null };

  private asmRecompose() {
    const a = this.asm;
    a.out = Object.keys(a.parts).length ? composeSheet(a.parts) : null;
    a.set = a.out ? previewSet(a.out.sheet) : null;
  }

  /** mode = 'tool'：开发者工具（可以下载、设成默认宠物）；'adopt'：玩家上传自定义宠物 */
  openAssembler(mode: 'tool' | 'adopt') {
    this.asm = { parts: {}, out: null, set: null, name: '', color: 'orange', avatar: null };
    this.open({ title: mode === 'tool' ? '精灵图拼装' : '上传宠物', render: () => this.renderAssembler(mode) });
  }

  private renderAssembler(mode: 'tool' | 'adopt'): Kid[] {
    const a = this.asm;
    const out: Kid[] = [h('div', { class: 'card soft' }, '每个动作上传一张图：', h('b', null, '白色背景，同一只宠物横着排 4 帧，面朝右'), '，帧和帧之间留一点空白。尺寸不用精确，程序会自动切成 4 帧、去掉白底、裁掉空白、统一大小、把脚底对齐。',
      h('br'), `前 ${SPRITE.requiredRows} 个动作必须有，后 3 个可以不传。`)];
    SPRITE.rows.forEach((act, idx) => {
      const part = a.parts[act]; const required = idx < SPRITE.requiredRows;
      const name = SPRITE.rowNames[act].replace('（被摸）', '');
      const pick = h('div', { class: 'btn small file' }, part ? '换一张' : '上传', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
        try { a.parts[act] = splitStrip(await loadImage(await fileToDataUrl(file)), act); this.asmRecompose(); }
        catch { this.toast('这张图读不出来，换一张试试'); }
        this.refresh(true);
      } }));
      const preview = part && a.set ? this.petAnim(() => this.asm.set, () => act, 128) : h('div', { class: 'asm-empty' }, required ? '必须' : '可选');
      preview.classList.add('asm-prev');
      const row = h('div', { class: 'asm-row' }, preview, h('div', { class: 'txt' }, h('b', null, `${idx + 1}. ${name}`),
        part ? h('label', { class: 'asm-size' }, '大小', h('input', { type: 'range', min: '25', max: '95', step: '1', value: String(Math.round(part.size * 100)),
          oninput: (e: Event) => { part.size = Number((e.target as HTMLInputElement).value) / 100; ((e.target as HTMLElement).nextSibling as HTMLElement).textContent = `${Math.round(part.size * 100)}%`; this.asmRecompose(); this.asmSwap(); },
        }), h('span', null, `${Math.round(part.size * 100)}%`)) : h('span', { class: 'soft' }, required ? '还没上传' : `不传的话用「${SPRITE.rowNames[SPRITE.fallback[act]].replace('（被摸）', '')}」代替`),
        part ? h('label', { class: 'asm-size' }, h('input', { type: 'checkbox', checked: part.keepHeight, style: 'flex:none;min-width:0', onchange: (e: Event) => { part.keepHeight = (e.target as HTMLInputElement).checked; this.asmRecompose(); this.refresh(true); } }), h('span', { style: 'white-space:nowrap' }, '保留跳跃高度'),
          part.keepHeight && (part.lift ?? 1) < 0.99 ? h('span', { class: 'asm-warn' }, `跳得太高格子放不下，高度压到了 ${Math.round((part.lift ?? 1) * 100)}%（把大小调小一点能跳得更高）`) : null) : null,
        part?.warn ? h('span', { class: 'asm-warn' }, part.warn) : null), pick,
        part ? h('button', { class: 'btn small', 'aria-label': '去掉', onclick: () => { delete a.parts[act]; this.asmRecompose(); this.refresh(true); } }, '×') : null);
      out.push(row);
    });

    if (a.out) {
      out.push(h('h3', null, `拼好的精灵图（${a.out.sheet.width}×${a.out.sheet.height}，${a.out.rows} 行）`));
      const img = h('img', { class: 'asm-sheet', alt: '拼好的精灵图', src: a.out.sheet.toDataURL('image/png') });
      out.push(h('div', { class: 'asm-sheetwrap' }, img));
      if (!a.out.complete) out.push(h('div', { class: 'banner' }, `还差：${a.out.missing.join('、')}`));
    }
    out.push(h('h3', null, '头像（可选）'));
    out.push(h('div', { class: 'row' }, h('div', { class: 'btn small file' }, a.avatar ? '换头像' : '上传头像', h('input', { type: 'file', accept: 'image/*', onchange: async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
      try { a.avatar = imageToAvatar(await loadImage(await fileToDataUrl(file))); } catch { this.toast('头像读不出来'); }
      this.refresh(true);
    } })), a.avatar ? (() => { const c = h('canvas', { width: 96, height: 96, style: 'width:48px;height:48px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--line)' }) as HTMLCanvasElement; c.getContext('2d')!.drawImage(a.avatar, 0, 0, 96, 96); return c; })() : null,
      h('span', { class: 'soft' }, a.avatar ? '头像已选好，领养或替换后生效' : '不传的话，用待机第 1 帧当头像')));
    const ready = !!a.out?.complete;
    if (mode === 'tool') {
      out.push(h('p', null, h('button', { class: 'btn primary block', disabled: !ready, onclick: async () => {
        const blob = await canvasToBlob(a.out!.sheet); if (!blob) { this.toast('生成图片失败'); return; }
        const msg = saveMessage(await saveBlob('pet-sheet.png', blob), '请长按上面的图片保存'); if (msg) this.toast(msg);
      } }, '下载 PNG')));
      out.push(h('div', { class: 'row' }, h('span', { class: 'soft' }, '或者直接用作默认宠物：'), Object.entries(FUR_COLORS).map(([k, v]) => h('button', { class: 'chip' + (a.color === k ? ' on' : ''), onclick: () => { a.color = k; this.refresh(true); } }, v.name))));
      out.push(h('p', null, h('button', { class: 'btn block', disabled: !ready, onclick: async () => {
        if (a.avatar) await this.game.assets.uploadDataUrl(`avatar.${a.color}`, a.avatar.toDataURL('image/png'), false);
        const saved = await this.game.assets.uploadDataUrl(`pet.${a.color}`, a.out!.sheet.toDataURL('image/png'), false);
        this.toast(saved ? `已换成「${FUR_COLORS[a.color].name}」默认宠物的样子` : '已换上（这个浏览器存不下，刷新后要重来）');
      } }, `用它替换「${FUR_COLORS[a.color].name}」默认宠物`)));
    }
    out.push(h('h3', null, mode === 'tool' ? '也可以直接领养' : '名字'));
    out.push(h('p', null, h('input', { type: 'text', maxlength: 8, placeholder: '名字（最多 8 个字）', value: a.name, oninput: (e: Event) => { a.name = (e.target as HTMLInputElement).value; } })));
    out.push(h('button', { class: 'btn block' + (mode === 'adopt' ? ' primary' : ''), disabled: !ready, onclick: async () => {
      if (!a.name.trim()) { this.toast('先取个名字'); return; }
      if (sim.alivePets(this.game.state).length >= this.game.state.slots) { this.toast('没有空位了，先到「家庭成员」解锁'); return; }
      const { spriteId, persisted } = await this.game.saveCustomSprite(a.out!.sheet, a.avatar);
      const r = this.game.act((s) => sim.adopt(s, a.name, spriteId)); this.say(r);
      if (!persisted) this.toast('这个浏览器存不下图片，关掉页面后要重新上传');
      if (r.ok && r.petId) this.openPet(r.petId);
    } }, '保存并领养'));
    if (mode === 'adopt') out.push(h('p', null, h('button', { class: 'btn small', onclick: () => this.openImport() }, '我已经有拼好的整张精灵图')));
    return out;
  }

  /** 拖大小滑块时只换预览用的图，不重画整个面板（不然滑块会断） */
  private asmSwap() {
    const a = this.asm; if (!a.out) return;
    // 预览动画读的是 a.set 的图：把新的画到同一张画布上
    const img = this.body?.querySelector('.asm-sheet') as HTMLImageElement | null;
    if (img) img.src = a.out.sheet.toDataURL('image/png');
  }

  private openExport() {
    const text = exportLayout();
    const area = h('textarea', { readonly: 'readonly', class: 'export', rows: 13 }) as HTMLTextAreaElement; area.value = text;
    this.open({ title: '导出配置', render: () => [h('p', { class: 'soft' }, '把下面这段文字复制给 Claude，或者对照着改 src/assets.config.ts。调整结果已经存在这个浏览器里，刷新后还在。'), area,
      h('p', null, h('button', { class: 'btn primary block', onclick: async () => {
        try { await navigator.clipboard.writeText(text); this.toast('已复制'); } catch { area.focus(); area.select(); this.toast('复制不了，请长按上面的文字手动复制'); }
      } }, '复制'))] });
  }

  // ---------- 数值模拟 ----------

  private simOpt = { days: 14, pets: 1, feeder: false, travel: true }; private simOut: SimResult[] | null = null;

  openSim() {
    this.simOut = null;
    this.open({ title: '数值模拟', render: () => {
      const o = this.simOpt;
      const seg = <T extends number | boolean>(opts: [T, string][], cur: T, set: (v: T) => void) => h('div', { class: 'seg' }, opts.map(([v, label]) => h('button', { class: 'chip' + (cur === v ? ' on' : ''), onclick: () => { set(v); this.simOut = null; this.refresh(true); } }, label)));
      const out: Kid[] = [h('p', { class: 'soft' }, '用现在的数值和真正的游戏规则快进，不会动你的存档。主人的习惯是固定的：签到、收鱼塘再放鱼苗、把每只喂饱、摸一次、玩一次、脏了就洗。'),
        h('h3', null, '模拟几天'), seg([[7, '7 天'], [14, '14 天'], [30, '30 天'], [60, '60 天']], o.days, (v) => { o.days = v; }),
        h('h3', null, '养几只'), seg([[1, '1 只'], [2, '2 只'], [3, '3 只'], [5, '5 只']], o.pets, (v) => { o.pets = v; }),
        h('h3', null, '条件'), h('div', { class: 'seg' },
          h('button', { class: 'chip' + (o.feeder ? ' on' : ''), onclick: () => { o.feeder = !o.feeder; this.simOut = null; this.refresh(true); } }, '有自动喂食机'),
          h('button', { class: 'chip' + (o.travel ? ' on' : ''), onclick: () => { o.travel = !o.travel; this.simOut = null; this.refresh(true); } }, '每天派一只出门带货')),
        h('p', null, h('button', { class: 'btn primary block', onclick: () => { this.simOut = simulateAll(o.days, o.pets, o.feeder, o.travel); this.refresh(true); } }, `模拟 ${o.days} 天`))];
      for (const r of this.simOut ?? []) {
        out.push(h('h3', null, r.label));
        out.push(h('div', { class: 'card simcard' },
          h('div', null, h('b', null, '首次虚弱 '), hoursToText(r.firstWeakHour), '　', h('b', null, '首次离家出走 '), hoursToText(r.firstDeathHour), r.deaths ? `（共 ${r.deaths} 只）` : '', r.rescues ? `　救回 ${r.rescues} 次` : ''),
          h('div', null, h('b', null, '在家时间里 '), `饿 ${r.hungryPct}%　闷 ${r.sadPct}%　脏 ${r.dirtyPct}%`),
          h('div', null, h('b', null, '小鱼干 '), `${r.fishStart} → ${r.fishEnd}（平均每天 ${r.fishPerDay >= 0 ? '+' : ''}${r.fishPerDay}）`),
          h('div', { class: 'soft' }, `签到 +${r.earned.checkin}　鱼塘 ${r.earned.pond >= 0 ? '+' : ''}${r.earned.pond}　行商 ${r.earned.trade >= 0 ? '+' : ''}${r.earned.trade}　买食物 −${r.spentOnFood}`),
          h('div', null, h('b', null, '成长 '), `青年：${r.stageDays[1] === null ? '没到' : '第 ' + r.stageDays[1] + ' 天'}　壮年：${r.stageDays[2] === null ? '没到' : '第 ' + r.stageDays[2] + ' 天'}　明信片 ${r.postcards} 张`),
          h('div', { class: 'simtable' }, h('table', null,
            h('tr', null, ['天', '饱食', '心情', '干净', '最低饱食', '最低心情', '小鱼干', '阶段', '发生了什么'].map((t) => h('th', null, t))),
            r.rows.map((x) => h('tr', null, [x.day, x.food, x.mood, x.clean, x.minFood, x.minMood, x.fish, x.stage, x.note].map((v) => h('td', null, v))))))));
      }
      if (this.simOut) out.push(h('p', { class: 'soft' }, '饱食、心情、干净是每天第一次照顾之前看到的平均值（不照顾就是当天结束时）；「最低」是这一天里最差的那只的最低点。出门和卖货有随机性，每次结果会略有不同。'));
      return out;
    } });
  }

  // ---------- 存档：导出、导入 ----------

  private importArmed = false; private importText = '';

  openSaves() {
    this.importArmed = false; this.importText = '';
    this.open({ title: '存档', render: () => {
      const g = this.game;
      const savedEl = h('span'); this.live.push(() => { savedEl.textContent = g.lastSavedAt ? `${Math.max(0, Math.round((Date.now() - g.lastSavedAt) / 1000))} 秒前` : '还没有'; });
      const doImport = async (text: string) => {
        const r = await g.importText(text);
        if (r.ok) { this.cardCache.clear(); this.stripSig = ''; this.close(); this.toast(r.from < g.saveVersion ? `导入成功（旧存档 v${r.from} 已自动升级）` : '导入成功'); }
        else this.toast('导入失败：' + r.reason);
      };
      return [
        h('div', { class: 'card soft' }, `存档版本 v${g.saveVersion}。游戏每隔几秒、切到后台、关掉页面时都会自动保存，另外每分钟留一份备份。`, h('br'),
          '上次保存：', savedEl, '　', g.saveOk ? '保存正常' : h('b', { style: 'color:#b3493a' }, '这个浏览器存不了档，请用下面的导出')),
        h('h3', null, '导出'),
        h('p', { class: 'soft' }, '包含全部进度、自定义宠物的图片和你调过的布局。不包含「素材替换」里上传的图片。'),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn primary', onclick: async () => {
            const text = await g.exportText(); const d = new Date();
            const r = await saveBlob(`pet-save-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`, new Blob([text], { type: 'application/json' }));
            const msg = saveMessage(r, '请用「复制存档文字」'); if (msg) this.toast(msg);
          } }, '下载存档文件'),
          h('button', { class: 'btn', onclick: async () => {
            const text = await g.exportText();
            try { await navigator.clipboard.writeText(text); this.toast(`已复制（${Math.ceil(text.length / 1024)} KB）`); } catch { this.toast('复制不了，请用「下载存档文件」'); }
          } }, '复制存档文字')),
        h('h3', null, '导入（会覆盖现在的进度）'),
        h('div', { class: 'btn block file' }, '选择存档文件', h('input', { type: 'file', accept: '.json,application/json,text/plain', onchange: async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
          this.importText = await file.text(); this.importArmed = true; this.refresh(true);
        } })),
        h('p', { class: 'soft' }, '或者把存档文字贴在这里：'),
        h('textarea', { class: 'export', rows: 4, placeholder: '{"format":"pet-game-save",…', oninput: (e: Event) => { this.importText = (e.target as HTMLTextAreaElement).value; } }, this.importArmed ? '' : this.importText),
        h('p', null, h('button', { class: 'btn block danger', onclick: () => {
          if (!this.importText.trim()) { this.toast('先选文件或贴上存档文字'); return; }
          if (!this.importArmed) { this.importArmed = true; this.refresh(true); return; }
          void doImport(this.importText);
        } }, this.importArmed ? '确认导入，覆盖现在的进度' : '导入')),
      ];
    } });
  }

  // ---------- 开发者面板 ----------

  openDev() {
    this.loadNotifyStatus();
    this.open({ title: '开发者面板', render: () => {
      const s = this.game.state; const d = s.dev; const D = CONFIG.dev;
      const seg = (opts: number[], cur: number, set: (v: number) => void, fmt = (v: number) => `×${v}`) => h('div', { class: 'seg' }, opts.map((v) => h('button', { class: 'chip' + (cur === v ? ' on' : ''), onclick: () => { set(v); this.game.changed(); } }, fmt(v))));
      const clockEl = h('span'); this.live.push(() => { clockEl.textContent = new Date(s.clock).toLocaleString('zh-CN', { hour12: false }); });
      return [h('div', { class: 'grid2' }, h('button', { class: 'btn primary', onclick: () => this.openAssets() }, '素材替换'), h('button', { class: 'btn primary', onclick: () => this.openAssembler('tool') }, '精灵图拼装'),
        h('button', { class: 'btn', onclick: () => this.openSaves() }, '存档：导出 / 导入'), h('button', { class: 'btn', onclick: () => this.openSim() }, '数值模拟')),
        h('p', { class: 'soft' }, '游戏里的时间：', clockEl),
        h('h3', null, '时间倍速（出门、鱼塘、状态下降、成长都会一起变快）'), seg(D.speedOptions, d.speed, (v) => { d.speed = v; }),
        h('div', { class: 'seg', style: 'margin-top:8px' }, h('button', { class: 'chip' + (d.background ? ' on' : ''), onclick: () => { d.background = !d.background; this.game.changed(); } }, `退到桌面、关掉再开的那段时间也按倍速：${d.background ? '开' : '关'}`)),
        h('p', { class: 'soft' }, d.background ? '注意：倍速开得很高时，离开一会儿宠物就可能饿坏。测完记得关掉。' : '现在倍速只在游戏开着的时候生效，离开期间按真实时间算。'),
        h('h3', null, '昼夜'), h('div', { class: 'seg' }, (['auto', 'day', 'dusk', 'night'] as const).map((v) => h('button', { class: 'chip' + (d.time === v && d.hour == null ? ' on' : ''), onclick: () => { d.time = v; d.hour = null; this.game.changed(); } }, v === 'auto' ? '跟着时间' : TIME_NAMES[v]))),
        (() => {
          // 手动拖时间：光影和昼夜都按拖到的时间（点上面任何一个按钮就不拖了）
          const now = sim.lightHour(s); const fmt = (v: number) => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60) % 60).padStart(2, '0')} ${phaseName(v)}`;
          const label = h('span', { style: 'flex:none;min-width:86px' }, d.hour != null ? fmt(d.hour) : '拖动预览');
          return h('label', { class: 'asm-size', style: 'margin-top:8px' }, '拖时间', h('input', { type: 'range', min: '0', max: '23.75', step: '0.25', value: String(Math.min(23.75, Math.round(now * 4) / 4)),
            // 拖的时候画面每一帧都读这个值，直接跟着变；松手再存（存的时候面板会重画，拖着重画会把滑块换掉）
            oninput: (e: Event) => { d.hour = Number((e.target as HTMLInputElement).value); label.textContent = fmt(d.hour); }, onchange: () => { this.game.changed(); this.refresh(true); } }), label);
        })(),
        h('h3', null, '季节'), h('div', { class: 'seg' }, (['auto', 'spring', 'summer', 'autumn', 'winter'] as const).map((v) => h('button', { class: 'chip' + (d.season === v ? ' on' : ''), onclick: () => { d.season = v; this.game.changed(); } }, v === 'auto' ? '自动（按设置）' : SEASON_NAMES[v]))),
        h('h3', null, '天气'), h('div', { class: 'seg' }, (['auto', 'clear', 'rain'] as const).map((v) => h('button', { class: 'chip' + (d.weather === v ? ' on' : ''), onclick: () => { d.weather = v; this.game.changed(); } }, v === 'auto' ? '自动' : v === 'clear' ? '晴' : '下雨（冬天是大雪）'))),
        h('p', { class: 'soft' }, `现在是${SEASON_NAMES[sim.season(s)]}天的${TIME_NAMES[sim.dayTime(s)]}，${sim.weather(s) === 'rain' ? (sim.season(s) === 'winter' ? '下大雪' : '下雨') : '晴'}。到阳台和院子看效果最明显。`),
        h('h3', null, '访客'),
        h('div', { class: 'seg' }, (['gift', 'trade', 'errand'] as const).map((k) => h('button', { class: 'chip', onclick: () => { this.game.act((st) => { st.visitors.push(sim.makeVisitor(st, undefined, k)); return { ok: true }; }); this.close(); this.toast('门口来了一位访客'); } }, `叫一个来：${{ gift: '送礼', trade: '换东西', errand: '托送信' }[k]}`))),
        h('p', { class: 'soft' }, `今天还会来 ${s.visitorQuota} 个（每天第一次打开时随机定 0–2 个，回到游戏时出现）。`),
        h('h3', null, '邻居'),
        h('div', { class: 'seg' }, Object.entries(NEIGHBORS).map(([nid, nb]) => h('button', { class: 'chip', onclick: () => { const ev = sim.openDoorToNeighbors(s, nid); this.game.changed(); this.close(); this.toast(ev.length ? `${nb.name}来了，去院子和客厅看看` : '已经有一只邻居在了'); } }, `叫${nb.name}来`)),
          h('button', { class: 'chip', onclick: () => { sim.sendNeighborHome(s); this.game.changed(); } }, '让它回去'),
          h('button', { class: 'chip', onclick: () => { for (const nid of Object.keys(NEIGHBORS)) s.hood.bonds[nid] = CONFIG.neighbors.friendAt; this.game.changed(); this.toast('三只邻居都成了朋友'); } }, '都变成朋友')),
        h('h3', null, '范围框'),
        h('button', { class: 'btn block' + (d.debugBoxes ? ' on' : ''), onclick: () => { d.debugBoxes = !d.debugBoxes; this.cardCache.clear(); this.game.changed(); if (d.debugBoxes) { this.close(); this.toast('范围框已打开：蓝=物品，绿=站位，橙=遮挡线，红=宠物，紫=地板'); } } }, `显示范围框：${d.debugBoxes ? '开' : '关'}`),
        h('p', { class: 'soft' }, '蓝框 = 物品的图片范围（也是点击范围）；绿点 = 宠物用这件家具时站的位置；橙线 = 遮挡线，线以下盖在宠物前面；黄点 = 发光的位置；红框 = 宠物的图片范围，红点 = 脚底；紫线 = 地板线和每只宠物走的线。明信片上会标出所有落脚点。；棕色块 = 家具和地上装饰的脚底（摆装饰时不能叠）；红色块 = 门前的路和猫用家具时站的地方（摆装饰时不能挡）'),
        h('h3', null, '通知'),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn', onclick: async () => { const err = await testNotification(0); this.toast(err || '已经发出一条，看屏幕上方有没有弹出来'); this.loadNotifyStatus(); } }, '马上发一条'),
          h('button', { class: 'btn', onclick: async () => { const err = await testNotification(60); this.toast(err || '已安排。现在退到桌面等：大约 1 分钟，系统省电时可能晚几分钟'); this.loadNotifyStatus(); } }, '1 分钟后发一条')),
        h('p', { class: 'soft', style: 'white-space:pre-line' }, this.notifyStatusText || '正在读取通知状态……'),
        h('h3', null, '直接跳过一段时间'), h('div', { class: 'seg' }, ([['10 分钟', 10 * MIN], ['1 小时', HOUR], ['6 小时', 6 * HOUR], ['1 天', DAY], ['7 天', 7 * DAY]] as [string, number][]).map(([n, ms]) => h('button', { class: 'chip', onclick: () => { this.game.skip(ms); this.toast(`跳过了 ${n}`); } }, n))),
        h('h3', null, '成长速度'), seg(D.growthOptions, d.growth, (v) => { d.growth = v; }),
        h('h3', null, '饱食下降速度'), seg(D.decayOptions, d.decay.food, (v) => { d.decay.food = v; }),
        h('h3', null, '心情下降速度'), seg(D.decayOptions, d.decay.mood, (v) => { d.decay.mood = v; }),
        h('h3', null, '干净下降速度'), seg(D.decayOptions, d.decay.clean, (v) => { d.decay.clean = v; }),
        h('h3', null, `小鱼干（现在 ${s.fish}）`), h('div', { class: 'seg' }, [0, 100, 500, 2000, 9999].map((v) => h('button', { class: 'chip', onclick: () => { s.fish = v; this.game.changed(); } }, `设为 ${v}`))),
        h('h3', null, '出门'), h('button', { class: 'btn block', disabled: !s.trips.length, onclick: () => { this.game.runEvents((st) => st.trips.slice().flatMap((t) => sim.finishTripNow(st, t.id))); } }, `一键结束所有出门等待（${s.trips.length} 趟）`),
        h('h3', null, '宠物状态'), h('div', { class: 'seg' },
          h('button', { class: 'chip', onclick: () => { sim.alivePets(s).forEach((p) => { p.food = p.mood = p.clean = 100; p.weakSince = null; }); this.game.changed(); } }, '全部回满'),
          h('button', { class: 'chip', onclick: () => { sim.homePets(s).forEach((p) => { p.food = 26; p.mood = 26; p.clean = 26; }); this.game.changed(); } }, '全部降到 26'),
          h('button', { class: 'chip', onclick: () => { sim.homePets(s).forEach((p) => { p.food = 0.5; }); this.game.changed(); } }, '饱食降到快归零'),
          h('button', { class: 'chip', onclick: () => { s.lastCheckin = ''; this.game.changed(); } }, '重置今日签到')),
        h('h3', null, '任务'), h('div', { class: 'seg' },
          h('button', { class: 'chip', onclick: () => { s.quests = sim.newQuests(false); s.tutorial = 0; this.game.changed(); this.close(); this.startTutorial(); } }, '重新开始新手引导（连同第一次打开的聚光灯）'),
          h('button', { class: 'chip', onclick: () => { s.quests.guideDone = true; s.quests.day = ''; this.game.changed(); this.toast('换了一批今天的任务'); } }, '跳过引导 / 重新抽今天的任务')),
        h('h3', null, '成长阶段（直接设成某个阶段，看体型）'),
        ...sim.alivePets(s).map((p) => h('div', { class: 'seg', style: 'margin-bottom:6px;align-items:center' },
          h('span', { class: 'soft', style: 'min-width:9em' }, `${p.name} ${SEXES[p.sex].icon} 成年 ${Math.round(p.size * 100)}%`),
          CONFIG.growth.stageNames.map((n, i) => h('button', { class: 'chip' + (sim.stageOf(p) === i ? ' on' : ''), onclick: () => { this.say(sim.devSetStage(s, p.id, i)); this.game.changed(); this.refresh(true); } }, n)))),
        h('p', { class: 'soft', style: 'margin-top:16px' }, '关闭开发者模式：菜单最下面的版本号连点 5 次。')];
    } });
  }
}
