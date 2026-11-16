// 把存档、规则、精灵图串在一起。画面（scene）和界面（ui）都只和它打交道。
import { CONFIG, DAY, FUR_COLORS, NPC_COLORS, VISITORS } from './config';
import { drawDefaultAvatar, drawDefaultSheet } from './art/defaultPet';
import { blobs } from './platform/storage';
import { notifyNow } from './platform/notify';
import * as sim from './sim';
import { buildSet, loadImage, normalizeSheet, type SpriteSet } from './sprites';
import type { AssetStore } from './assets';
import { buildExport, clearSave, loadSave, parseImport, SAVE_VERSION, writeSave } from './save';
import type { GameEvent, GameState, Pet, Result } from './types';
import { kv } from './platform/storage';

const MAX_CATCHUP = 60 * DAY;

type Listener = () => void;
type EventListener = (e: GameEvent) => void;

export class Game {
  state!: GameState;
  sprites = new Map<string, SpriteSet>();
  /** 离线期间过了多久（毫秒），给开场提示用 */
  awayMs = 0;
  /** 这次是不是全新的存档 */
  isNew = false;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  /** 离线期间发生的事，开场时讲给主人听 */
  awayEvents: GameEvent[] = [];
  /** 这次打开时存档的情况：从哪个版本升上来的、是不是用了备份 */
  loadInfo: { from: number; source: 'main' | 'backup' } | null = null;
  /** 上一次保存有没有真的写进去 */
  saveOk = true; lastSavedAt = 0;
  private saveWarned = false;
  private dirty = false;
  private lastSave = 0;

  constructor(public assets: AssetStore) {}

  async init() {
    const now = Date.now();
    const loaded = loadSave(now);
    this.state = loaded ? loaded.state : sim.newState(now);
    this.isNew = !loaded;
    this.loadInfo = loaded ? { from: loaded.from, source: loaded.source } : null;
    for (const p of this.state.pets) await this.ensureSprite(p.spriteId);
    await this.ensureSprite('npc:tabby'); // 狸花猫
    for (const v of Object.values(VISITORS)) await this.ensureSprite(v.look); // 访客（用捏猫系统画的占位样子）
    await this.loadPetAvatars();
    if (loaded) {
      // 关掉 App 期间的变化，打开时一次算清。系统时间被往回调时不倒着算。
      this.awayMs = Math.min(MAX_CATCHUP, Math.max(0, now - this.state.lastReal) * sim.awaySpeed(this.state));
      this.awayEvents = sim.advance(this.state, this.awayMs);
      this.state.lastReal = now;
    }
    this.save();
  }

  // ---------- 精灵图 ----------

  async ensureSprite(spriteId: string): Promise<SpriteSet> {
    const had = this.sprites.get(spriteId);
    if (had) return had;
    let set: SpriteSet | null = null;
    if (spriteId.startsWith('custom:')) {
      try {
        const raw = await blobs.get(spriteId);
        if (raw) {
          const { sheet, avatar } = JSON.parse(raw) as { sheet: string; avatar: string | null };
          const img = await loadImage(sheet);
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
          cv.getContext('2d')!.drawImage(img, 0, 0);
          let av: HTMLCanvasElement | null = null;
          if (avatar) { const a = await loadImage(avatar); av = document.createElement('canvas'); av.width = a.width; av.height = a.height; av.getContext('2d')!.drawImage(a, 0, 0); }
          set = buildSet(spriteId, cv, av);
        }
      } catch { set = null; }
    }
    if (!set && spriteId.startsWith('look:')) { const sheet = drawDefaultSheet(spriteId); set = buildSet(spriteId, sheet, drawDefaultAvatar(sheet)); }
    if (!set) {
      const color = spriteId.startsWith('default:') ? spriteId.slice(8) : spriteId.startsWith('npc:') ? spriteId.slice(4) : 'orange';
      // 默认宠物：assets.config.ts 里配了精灵图就用图片，否则用代码画的占位图
      const pic = this.assets.get(`pet.${color}`);
      const r = pic ? normalizeSheet(pic, false) : null;
      if (r && r.ok && r.sheet) set = buildSet(spriteId, r.sheet, this.assets.get(`avatar.${color}`));
      else { const sheet = drawDefaultSheet(FUR_COLORS[color] || NPC_COLORS[color] ? color : 'orange'); set = buildSet(spriteId, sheet, drawDefaultAvatar(sheet)); }
    }
    this.sprites.set(spriteId, set);
    return set;
  }

  /** 保存一只上传的宠物的精灵图，返回它的编号 */
  async saveCustomSprite(sheet: HTMLCanvasElement, avatar: HTMLCanvasElement | null): Promise<{ spriteId: string; persisted: boolean }> {
    const spriteId = `custom:${sim.newId('s')}`;
    const persisted = await blobs.set(spriteId, JSON.stringify({ sheet: sheet.toDataURL('image/png'), avatar: avatar ? avatar.toDataURL('image/png') : null }));
    this.sprites.set(spriteId, buildSet(spriteId, sheet, avatar));
    return { spriteId, persisted };
  }

  /** 默认宠物的素材换了之后，重新读一遍精灵图 */
  async reloadDefaultSprites() {
    for (const id of [...this.sprites.keys()]) if (id.startsWith('default:')) this.sprites.delete(id);
    for (const p of this.state.pets) await this.ensureSprite(p.spriteId);
    this.changed();
  }

  // ---------- 主人给宠物换的头像 ----------

  private petAvatars = new Map<string, HTMLCanvasElement>();
  /** 头像每换一次加 1，界面用它判断要不要重画 */
  avatarRev = 0;

  avatarOf(pet: Pet | undefined): HTMLCanvasElement | undefined { return pet ? this.petAvatars.get(pet.id) ?? this.sprites.get(pet.spriteId)?.avatar : undefined; }

  async setPetAvatar(petId: string, avatar: HTMLCanvasElement) {
    this.petAvatars.set(petId, avatar); this.avatarRev++;
    await blobs.set('avatar:' + petId, avatar.toDataURL('image/png'));
    this.changed();
  }

  private async loadPetAvatars() {
    this.petAvatars.clear();
    for (const p of this.state.pets) {
      try { const url = await blobs.get('avatar:' + p.id); if (!url) continue; const img = await loadImage(url); const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); this.petAvatars.set(p.id, cv); } catch { /* 读不出来就用默认头像 */ }
    }
    this.avatarRev++;
  }

  spriteOf(pet: Pet | undefined): SpriteSet | undefined { return pet ? this.sprites.get(pet.spriteId) : undefined; }
  pet(id: string) { return this.state.pets.find((p) => p.id === id); }

  // ---------- 时间 ----------

  /** 每帧调用。用真实时钟算过了多久，所以页面切到后台再回来也不会漏算。 */
  tick() {
    const nowReal = Date.now();
    const real = Math.max(0, nowReal - this.state.lastReal);
    // 间隔很长说明页面被挂起过（退到桌面等）：默认按正常速度补算；开发者面板里可以改成也乘倍速
    const dt = real > 5000 ? Math.min(real * sim.awaySpeed(this.state), MAX_CATCHUP) : real * this.state.dev.speed;
    this.state.lastReal = nowReal;
    const events = sim.advance(this.state, dt);
    if (events.length) { events.forEach((e) => this.emitEvent(e)); this.changed(); }
    const now = performance.now();
    if (now - this.lastSave > (this.dirty ? 1500 : 10000)) this.save();
  }

  /** 主人打开 App、或者从后台回来：看看今天有没有访客上门 */
  welcome() {
    const events = sim.openDoorToVisitors(this.state);
    if (events.length) { events.forEach((e) => this.emitEvent(e)); this.changed(); }
  }

  /** 开发者模式：直接跳过一段时间 */
  skip(ms: number) {
    const events = sim.advance(this.state, ms);
    events.forEach((e) => this.emitEvent(e));
    this.changed();
  }

  // ---------- 操作 ----------

  /** 执行一个会改存档的操作，然后通知界面刷新 */
  act<T extends Result>(fn: (s: GameState) => T): T {
    const r = fn(this.state);
    if (r.ok) this.changed();
    return r;
  }

  runEvents(fn: (s: GameState) => GameEvent[]) {
    fn(this.state).forEach((e) => this.emitEvent(e));
    this.changed();
  }

  changed() { this.dirty = true; this.listeners.forEach((l) => l()); }
  onChange(l: Listener) { this.listeners.add(l); }
  onEvent(l: EventListener) { this.eventListeners.add(l); }

  /** 标记有变化要保存，但不刷新界面（场景里的小变化用） */
  touch() { this.dirty = true; }

  private emitEvent(e: GameEvent) {
    const p = 'petId' in e ? this.pet(e.petId) : undefined;
    if (e.type === 'hungry' && p) notifyNow(`${p.name}饿了，快去喂点东西`);
    if (e.type === 'weak' && p) notifyNow(`${p.name}饿得没力气了，变得很虚弱`);
    if (e.type === 'ranAway' && p) notifyNow(`${p.name}饿太久，离家出走了……去门口找狸花猫帮忙`);
    if (e.type === 'found' && p) notifyNow(`狸花猫把${p.name}带回来了！它又饿又脏，快照顾一下`);
    if (e.type === 'notFound' && p) notifyNow(`狸花猫这次没找到${p.name}，再给它一根猫条试试`);
    if (e.type === 'stage' && p) notifyNow(`${p.name}长大了，现在是${CONFIG.growth.stageNames[e.stage]}`);
    this.eventListeners.forEach((l) => l(e));
  }

  save() {
    this.state.lastReal = Date.now();
    this.saveOk = writeSave(this.state);
    if (this.saveOk) this.lastSavedAt = Date.now();
    else if (!this.saveWarned) { this.saveWarned = true; notifyNow('这个浏览器存不了档：关掉页面后进度会丢。可以到开发者面板导出存档。'); }
    this.dirty = false; this.lastSave = performance.now();
    this.afterSave?.();
  }
  /** 每次保存之后调用（安卓上用来重新安排本地通知） */
  afterSave: (() => void) | null = null;

  async reset() {
    // 只删存档和这份存档里的自定义宠物，不动「素材替换」里上传的图片和布局
    const mine = this.state.pets.map((p) => p.spriteId).filter((id) => id.startsWith('custom:'));
    clearSave();
    for (const id of mine) await blobs.remove(id);
    for (const id of [...this.sprites.keys()]) if (id.startsWith('custom:')) this.sprites.delete(id);
    this.state = sim.newState(Date.now());
    for (const p of this.state.pets) await this.ensureSprite(p.spriteId);
    this.save();
    this.changed();
  }

  // ---------- 导出、导入存档 ----------

  /** 导出成一段文字：存档本体 + 自定义宠物的图片 + 布局 */
  async exportText(): Promise<string> {
    this.save();
    const sprites: Record<string, string> = {};
    for (const p of this.state.pets) if (p.spriteId.startsWith('custom:') && !sprites[p.spriteId]) { const raw = await blobs.get(p.spriteId); if (raw) sprites[p.spriteId] = raw; }
    return JSON.stringify(buildExport(this.state, sprites, kv.get('pet-game-layout-v2')));
  }

  /** 用一段导出的文字覆盖现在的存档 */
  async importText(text: string): Promise<{ ok: true; from: number } | { ok: false; reason: string }> {
    const r = parseImport(text);
    if (!r.ok) return r;
    for (const [id, raw] of Object.entries(r.sprites)) await blobs.set(id, raw);
    for (const id of [...this.sprites.keys()]) if (id.startsWith('custom:')) this.sprites.delete(id);
    this.state = r.state;
    for (const p of this.state.pets) await this.ensureSprite(p.spriteId);
    this.save();
    this.changed();
    return { ok: true, from: r.from };
  }

  get saveVersion() { return SAVE_VERSION; }
}
