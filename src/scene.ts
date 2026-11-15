// 房间画面：一个可以左右滑动的长房间，7 个区域，宠物自己在里面活动。
// 背景和物品都是贴图：有图片就用图片（见 assets.config.ts），没有就用 art/room.ts 里代码画的占位图。
import 'pixi.js/unsafe-eval';
import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { ASSETS, type ObjectDef } from './assets.config';
import type { AssetStore } from './assets';
import { drawObject, drawZone, objectAspect } from './art/room';
import { CONFIG, PALETTE, SOUVENIRS, SPRITE, ZONES, type ActionName } from './config';
import type { Game } from './game';
import { BASE_FY, BASE_ZW, geo, recompute } from './geo';
import * as sim from './sim';
import { frameIndex, rowFor } from './sprites';

export type ObjectKind = 'door' | 'bowl' | 'tub' | 'bed' | 'cabinet' | 'album' | 'pond' | 'scratcher' | 'feeder' | 'ball';

const H = CONFIG.room.height;
const N = ZONES.length;
const zx = (i: number) => geo.bounds[i];
const zw = (i: number) => geo.bounds[i + 1] - geo.bounds[i];
const worldW = () => geo.bounds[N];
const maxZW = () => Math.max(...ZONES.map((_, i) => zw(i)));
const zoneAt = (x: number) => { for (let i = N - 1; i > 0; i--) if (x >= zx(i)) return i; return 0; };
const zoneIndex = (id: string) => ZONES.findIndex((z) => z.id === id);
/** 物品在房间里的实际位置：配置里的 x 按 432 宽的区域写，y 按地板线在 560 写，这里换算到当前的背景 */
const objPos = (def: ObjectDef) => { const zi = zoneIndex(def.zone); const k = zw(zi) / BASE_ZW; return { x: zx(zi) + def.x * k, y: def.y + geo.floorY - BASE_FY, k, zi }; };
const objX = (k: string) => objPos(ASSETS.objects[k]).x;
const SPOT = { get bowl() { return objX('bowl') - 78; }, get living() { return zx(2) + zw(2) / 2; }, get tub() { return objX('tub'); }, get bed() { return objX('bed') + 20; } };
const walkMin = () => 70, walkMax = () => zx(6) - 30;
const hex = (c: string) => parseInt(c.slice(1), 16);
/** 壮年宠物在画面里的缩放：身高约为门高的 petHeightOfDoor */
const PET_BASE = (CONFIG.room.petHeightOfDoor * CONFIG.room.doorHeight) / (SPRITE.cell * CONFIG.room.petCellFill);

interface Actor {
  id: string; root: Container; sprite: Sprite; tag: Container; tagText: Text; fx: Graphics;
  x: number; lane: number; tx: number; dir: 1 | -1; action: ActionName; t0: number; until: number;
  pending: { action: ActionName; dur: number } | null; fast: boolean;
}

export interface SceneHooks { onPet(id: string): void; onObject(kind: ObjectKind): void; onZone(index: number): void; onEdit?(kind: string | null): void; onBgEdit?(done: boolean): void }
interface EditBox { sp: Sprite; frame: Graphics; handle: Graphics; label: Text }

export class Scene {
  app = new Application();
  private world = new Container();
  private fill = new Graphics();
  private bgLayer = new Container();
  private objects = new Container();
  private petLayer = new Container();
  private overlay = new Container();
  private names: Container[] = [];
  private bubble = new Container(); private bubbleText!: Text; private bubbleUntil = 0;
  private actors = new Map<string, Actor>();
  private textures: Texture[] = [];
  private objSprites = new Map<string, Sprite>();
  private objArt = new Map<string, HTMLCanvasElement | null>();
  private stripSprite: Sprite | null = null;
  private zoneSprites: ({ sp: Sprite; code: boolean } | null)[] = [];
  private camX = 0; private camTarget: number | null = null; private vel = 0;
  private scale = 1; private viewW = 400; private nameScreenY = 30; private hudSpans: [number, number][] = [];
  private drag = { on: false, moved: false, startX: 0, lastX: 0, lastT: 0 };
  bgMode = false;
  private bgLayerEdit = new Container(); private bgLines = new Graphics(); private bgHandles: Graphics[] = [];
  private bgDrag: { which: number; gx: number; gy: number; orig: number; cam: number } | null = null;
  editMode = false; editSelected: string | null = null;
  private editBoxes = new Map<string, EditBox>();
  private editDrag: { kind: string; mode: 'move' | 'size'; gx: number; gy: number; x: number; y: number; height: number } | null = null;
  private zone = -1; private objSig = ''; private now = 0; private nextPair = 4000; private nextHud = 0;

  constructor(private game: Game, private assets: AssetStore, private hooks: SceneHooks) {}

  async init(el: HTMLElement) {
    await this.app.init({ resizeTo: el, background: hex(PALETTE.wall), antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    el.appendChild(this.app.canvas);
    this.world.addChild(this.fill, this.bgLayer, this.objects, this.petLayer, this.overlay);
    this.petLayer.sortableChildren = true;
    this.app.stage.addChild(this.world);
    ZONES.forEach((z) => {
      // 区域名字做成一块小牌子，压在装饰上也看得清
      const t = new Text({ text: z.name, style: { fontFamily: 'system-ui, sans-serif', fontSize: 28, fill: hex(PALETTE.ink), fontWeight: '600' } });
      t.anchor.set(0.5); const w = t.width + 40;
      const plate = new Graphics().roundRect(-w / 2, -24, w, 48, 24).fill({ color: hex(PALETTE.white), alpha: 0.92 }).stroke({ width: 2, color: hex(PALETTE.ink), alpha: 0.45 });
      const c = new Container(); c.addChild(plate, t); this.names.push(c); this.overlay.addChild(c);
    });
    const bg = new Graphics();
    this.bubbleText = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 28, fill: 0xffffff, fontWeight: '600' } });
    this.bubbleText.anchor.set(0.5); this.bubble.addChild(bg, this.bubbleText); this.bubble.visible = false; this.overlay.addChild(this.bubble);
    this.rebuildArt();
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointerdown', (e) => this.onDown(e));
    this.app.stage.on('pointermove', (e) => this.onMove(e));
    this.app.stage.on('pointerup', () => this.onUp());
    this.app.stage.on('pointerupoutside', () => this.onUp());
    this.app.renderer.on('resize', () => this.layout());
    this.layout();
    this.scrollToZone(2, true);
    this.app.ticker.add((t) => this.update(t.deltaMS));
  }

  // ---------- 贴图：背景和物品 ----------

  private tex(src: HTMLCanvasElement) { const t = Texture.from(src); this.textures.push(t); return t; }

  private zoneHasImage(i: number) {
    return !!this.assets.get(`room.zone.${ZONES[i].id}`) || (!!this.assets.get('room.strip') && i < ASSETS.room.strip.coverZones);
  }

  /** 素材变了之后重建所有贴图 */
  rebuildArt() {
    this.bgLayer.removeChildren().forEach((c) => c.destroy());
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.textures.forEach((t) => t.destroy(true)); this.textures = []; this.objSprites.clear(); this.objArt.clear(); this.objSig = '';

    const strip = this.assets.get('room.strip');
    recompute(strip);
    const cover = Math.min(N, ASSETS.room.strip.coverZones);
    this.stripSprite = strip ? new Sprite(this.tex(strip)) : null;
    if (this.stripSprite) this.bgLayer.addChild(this.stripSprite);
    this.zoneSprites = ZONES.map((z, i) => {
      const img = this.assets.get(`room.zone.${z.id}`);
      if (!img && strip && i < cover) return null;
      const sp = new Sprite(this.tex(img ?? drawZone(z.id, i))); this.bgLayer.addChild(sp);
      return { sp, code: !img };
    });
    this.placeArt();
    this.rebuildObjects();
    if (this.names.length) this.applyCam();
    if (this.bgMode) this.setBgMode(true);
  }

  /** 按当前的地板线和分界线，把背景摆到位（不重画贴图，拖动时也能跟手） */
  private placeArt() {
    const W = worldW(), fy = geo.floorY;
    // 房间外面的填充：上面是天花板，下面和两边接着墙和地板的颜色
    const g = this.fill.clear();
    g.rect(-3000, -3000, W + 6000, 3000).fill(hex(PALETTE.ceiling));
    g.rect(-3000, 0, W + 6000, fy).fill(hex(PALETTE.wall));
    g.rect(-3000, fy, W + 6000, 3000).fill(hex(PALETTE.floor));
    g.rect(-3000, -5, W + 6000, 5).fill({ color: hex(PALETTE.ink), alpha: 0.25 });
    if (this.stripSprite && geo.strip) { this.stripSprite.position.set(geo.strip.x, 0); this.stripSprite.width = geo.strip.w; this.stripSprite.height = H; }
    this.zoneSprites.forEach((z, i) => {
      if (!z) return;
      // 代码画的占位区域：整体上下挪，让它的地板线和背景图的对齐
      z.sp.position.set(zx(i), z.code ? fy - BASE_FY : 0); z.sp.width = zw(i); z.sp.height = H;
    });
  }

  private placeObjects() {
    for (const [kind, sp] of this.objSprites) { const p = objPos(ASSETS.objects[kind]); sp.position.set(p.x, p.y); }
  }

  /** 地板线或分界线变了：重新算一遍，所有东西跟着走 */
  private applyGeometry() {
    recompute(this.assets.get('room.strip'));
    this.placeArt(); this.placeObjects();
    for (const a of this.actors.values()) { a.x = Math.max(walkMin(), Math.min(walkMax(), a.x)); a.tx = Math.max(walkMin(), Math.min(walkMax(), a.tx)); }
    this.applyCam();
  }

  private labelFor(kind: string): string {
    const s = this.game.state;
    if (kind === 'door') return s.trips.length ? `门 · 出门中 ×${s.trips.length}` : '门 · 派宠物出门';
    if (kind === 'cabinet') return `收藏柜 ${Object.keys(s.souvenirs).length}/${Object.keys(SOUVENIRS).length}`;
    if (kind === 'album') return `相册 ${s.postcards.length} 张`;
    return ASSETS.objects[kind]?.label ?? '';
  }

  /** 物品上的名字平时不显示，点一下才冒出来 */
  private showBubble(kind: string) {
    const sp = this.objSprites.get(kind); if (!sp) return;
    const text = this.labelFor(kind); if (!text) return;
    this.bubbleText.text = text;
    const w = this.bubbleText.width + 36;
    (this.bubble.children[0] as Graphics).clear().roundRect(-w / 2, -26, w, 52, 26).fill({ color: 0x4b3a2c, alpha: 0.92 });
    this.bubble.position.set(sp.x, Math.max(sp.y - sp.height - 34 / this.scale, (this.nameScreenY + 70 - this.world.y) / this.scale));
    this.bubble.scale.set(0.5 / this.scale); this.bubble.visible = true; this.bubbleUntil = this.now + 2200;
  }

  private rebuildObjects() {
    const s = this.game.state;
    const sig = JSON.stringify([this.editMode, s.owned, Object.keys(s.souvenirs), s.pond.map((p, i) => (p == null ? 0 : sim.pondReady(s, i) ? 2 : 1))]);
    if (sig === this.objSig) return;
    this.objSig = sig;
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true })); this.objSprites.clear(); this.editBoxes.clear();

    for (const [kind, def] of Object.entries(ASSETS.objects) as [ObjectKind, ObjectDef][]) {
      if (def.needsOwned && !s.owned[def.needsOwned] && !this.editMode) continue;
      const pos = objPos(def); const zi = pos.zi;
      const img = this.assets.get(`object.${kind}`);
      // 背景图里已经画了的东西（门、浴缸、床、收藏柜、相册墙、鱼塘）：没有自己的图片时只留点击区域
      const hidden = !img && !!def.partOfBackground && this.zoneHasImage(zi);
      if (!this.objArt.has(kind)) this.objArt.set(kind, drawObject(kind));
      const src = img ?? (hidden ? null : this.objArt.get(kind)!);
      const sp = new Sprite(src ? this.tex(src) : Texture.WHITE);
      const aspect = src ? src.width / src.height : objectAspect(kind);
      sp.anchor.set(0.5, 1); sp.height = def.height; sp.width = def.height * aspect; sp.position.set(pos.x, pos.y);
      if (!src) sp.alpha = 0;
      if (kind !== 'ball' || this.editMode) {
        sp.eventMode = 'static'; sp.cursor = this.editMode ? 'move' : 'pointer';
        sp.on('pointertap', this.tap(() => { if (this.editMode) return; this.showBubble(kind); this.hooks.onObject(kind); }));
        sp.on('pointerdown', (e) => this.editDown(e, kind, 'move'));
      }
      this.objects.addChild(sp); this.objSprites.set(kind, sp);
      if (this.editMode) continue;

      const left = sp.x - sp.width / 2, top = sp.y - sp.height;
      if (kind === 'cabinet') Object.keys(s.souvenirs).slice(0, 9).forEach((id, i) => {
        const t = new Text({ text: SOUVENIRS[id]?.icon ?? '?', style: { fontSize: 30 } });
        t.anchor.set(0.5); t.position.set(left + sp.width * (0.26 + (i % 3) * 0.24), top + sp.height * (0.2 + Math.floor(i / 3) * 0.307)); this.objects.addChild(t);
      });
      if (kind === 'pond') s.pond.forEach((p, i) => {
        if (p == null) return;
        const ready = sim.pondReady(s, i); const f = new Graphics(); const fx = left + sp.width * (0.3 + i * 0.2), fy = top + sp.height * 0.5; const k = ready ? 1 : 0.5;
        const col = ready ? hex(PALETTE.coral) : 0xf2d2c6;
        f.ellipse(fx, fy, 18 * k, 8 * k).fill(col).poly([fx - 16 * k, fy, fx - 28 * k, fy - 7 * k, fx - 28 * k, fy + 7 * k]).fill(col);
        this.objects.addChild(f);
      });
    }
    if (this.editMode) for (const [kind, sp] of this.objSprites) {
      const frame = new Graphics(); const handle = new Graphics();
      const label = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 24, fill: 0xffffff, fontWeight: '600' } });
      frame.eventMode = 'none'; label.eventMode = 'none'; // 框和文字不接收点击，否则会挡住下面的物品
      handle.eventMode = 'static'; handle.cursor = 'nesw-resize'; handle.on('pointerdown', (e) => this.editDown(e, kind, 'size'));
      this.objects.addChild(frame, label, handle);
      this.editBoxes.set(kind, { sp, frame, handle, label }); this.updateEditBox(kind);
    }
  }

  // ---------- 调整背景：拖地板线和区域分界线 ----------

  hasStrip() { return !!this.assets.get('room.strip'); }

  setBgMode(on: boolean) {
    this.bgMode = on && this.hasStrip(); this.bgDrag = null;
    this.objects.interactiveChildren = !this.bgMode; this.petLayer.interactiveChildren = !this.bgMode;
    this.bgLayerEdit.removeChildren().forEach((c) => c.destroy()); this.bgHandles = [];
    if (!this.bgMode) { this.objSig = ''; this.rebuildObjects(); return; }
    this.bgLines = new Graphics(); this.bgLines.eventMode = 'none'; this.bgLayerEdit.addChild(this.bgLines);
    // 0..n-1 = 分界线，最后一个 = 地板线（放在最上面，交叉的地方优先拖地板线）
    const n = ASSETS.room.strip.lines.length;
    for (let i = 0; i <= n; i++) {
      const h = new Graphics(); h.eventMode = 'static'; h.cursor = i === n ? 'ns-resize' : 'ew-resize';
      h.on('pointerdown', (e) => {
        e.stopPropagation();
        this.bgDrag = { which: i, gx: e.global.x, gy: e.global.y, orig: i === n ? ASSETS.room.strip.floor : ASSETS.room.strip.lines[i], cam: this.camX };
      });
      this.bgLayerEdit.addChild(h); this.bgHandles.push(h);
    }
    if (!this.bgLayerEdit.parent) this.overlay.addChild(this.bgLayerEdit);
    this.drawBgEdit();
  }

  private drawBgEdit() {
    if (!this.bgMode || !geo.strip) return;
    const k = 1 / this.scale; const cfg = ASSETS.room.strip; const n = cfg.lines.length;
    const midY = (this.app.screen.height * 0.4 - this.world.y) * k, midX = (this.app.screen.width * 0.5 - this.world.x) * k;
    const g = this.bgLines.clear(); const blue = 0x3a7bd5, coral = hex(PALETTE.coral);
    cfg.lines.forEach((f, i) => {
      const x = geo.strip!.x + f * geo.strip!.w; const active = this.bgDrag?.which === i;
      g.moveTo(x, -200).lineTo(x, H + 400).stroke({ width: (active ? 4 : 3) * k, color: blue, alpha: 0.9 });
      g.circle(x, midY, 13 * k).fill(0xffffff).stroke({ width: 3 * k, color: blue });
      this.bgHandles[i].hitArea = new Rectangle(x - 20 * k, -2000, 40 * k, 6000);
    });
    const fy = geo.floorY;
    g.moveTo(geo.strip.x, fy).lineTo(geo.strip.x + geo.strip.w, fy).stroke({ width: (this.bgDrag?.which === n ? 4 : 3) * k, color: coral });
    g.circle(midX, fy, 13 * k).fill(0xffffff).stroke({ width: 3 * k, color: coral });
    this.bgHandles[n].hitArea = new Rectangle(-5000, fy - 20 * k, worldW() + 10000, 40 * k);
  }

  private bgMove(e: FederatedPointerEvent) {
    const d = this.bgDrag!; const cfg = ASSETS.room.strip; const n = cfg.lines.length; if (!geo.strip) return;
    if (d.which === n) cfg.floor = Math.max(0.3, Math.min(0.97, d.orig + (e.global.y - d.gy) / this.scale / H));
    else {
      const lo = d.which === 0 ? 0 : cfg.lines[d.which - 1] + 0.03, hi = d.which === n - 1 ? 1 : cfg.lines[d.which + 1] - 0.03;
      const v = Math.max(lo, Math.min(hi, d.orig + (e.global.x - d.gx) / this.scale / geo.strip.w));
      cfg.lines[d.which] = v;
      // 拖最左边那条线时房间的起点跟着变，把镜头挪回来，画面才不会跳
      if (d.which === 0) this.camX = d.cam - (v - d.orig) * geo.strip.w;
    }
    this.applyGeometry(); this.drawBgEdit(); this.hooks.onBgEdit?.(false);
  }

  /** 宠物大小变了（调整背景时的滑块） */
  geometryChanged() { this.applyGeometry(); this.drawBgEdit(); }

  // ---------- 调整点击区域 ----------

  setEditMode(on: boolean) {
    this.editMode = on; this.editSelected = null; this.editDrag = null; this.objSig = '';
    this.petLayer.visible = !on; this.bubble.visible = false;
    this.rebuildObjects();
  }

  /** 素材或配置变了之后，按配置重新摆一遍 */
  refreshLayout() { this.objSig = ''; this.rebuildObjects(); }

  private updateEditBox(kind: string) {
    const b = this.editBoxes.get(kind); const def = ASSETS.objects[kind]; if (!b || !def) return;
    const sp = b.sp; const aspect = sp.width / sp.height;
    const pos = objPos(def); sp.height = def.height; sp.width = def.height * aspect; sp.position.set(pos.x, pos.y);
    const l = sp.x - sp.width / 2, t = sp.y - sp.height; const sel = this.editSelected === kind; const k = 1 / this.scale;
    const col = sel ? hex(PALETTE.coral) : 0x3a7bd5;
    b.frame.clear().rect(l, t, sp.width, sp.height).fill({ color: col, alpha: sel ? 0.22 : 0.12 }).stroke({ width: 2 * k, color: col });
    b.frame.moveTo(sp.x - 8 * k, sp.y).lineTo(sp.x + 8 * k, sp.y).moveTo(sp.x, sp.y - 8 * k).lineTo(sp.x, sp.y + 8 * k).stroke({ width: 2 * k, color: col });
    // 右上角的圆点：拖它改大小。点击范围比看到的大，手指好按
    b.handle.clear().circle(l + sp.width, t, 9 * k).fill(0xffffff).stroke({ width: 3 * k, color: col });
    b.handle.hitArea = new Circle(l + sp.width, t, 22 * k);
    b.label.text = `${def.label}  x ${def.x}  y ${def.y}  高 ${def.height}`;
    b.label.scale.set(0.5 * k); b.label.style.fill = col;
    const zr = zx(pos.zi + 1) - 8; // 名字不要伸到区域外面
    b.label.position.set(Math.max(zx(pos.zi) + 8, Math.min(l, zr - b.label.width)), t - 16 * k);
  }

  private editDown(e: FederatedPointerEvent, kind: string, mode: 'move' | 'size') {
    if (!this.editMode) return;
    e.stopPropagation();
    const def = ASSETS.objects[kind]; const prev = this.editSelected;
    this.editSelected = kind;
    this.editDrag = { kind, mode, gx: e.global.x, gy: e.global.y, x: def.x, y: def.y, height: def.height };
    if (prev && prev !== kind) this.updateEditBox(prev);
    this.updateEditBox(kind); this.hooks.onEdit?.(kind);
  }

  private editMove(e: FederatedPointerEvent) {
    const d = this.editDrag!; const def = ASSETS.objects[d.kind];
    const dx = (e.global.x - d.gx) / this.scale, dy = (e.global.y - d.gy) / this.scale;
    const zk = objPos(def).k;
    if (d.mode === 'move') { def.x = Math.round(d.x + dx / zk); def.y = Math.round(d.y + dy); }
    else def.height = Math.max(16, Math.round(d.height - dy)); // 底边不动，往上拖变大
    this.updateEditBox(d.kind); this.hooks.onEdit?.(d.kind);
  }

  // ---------- 镜头和布局 ----------

  /** 竖屏：一个区域正好占满屏幕宽度，多出来的高度当作天花板。
   *  横屏：按高度放大，墙的最上面裁掉一点，让宠物和家具更大。 */
  private layout() {
    const w = this.app.screen.width, h = this.app.screen.height;
    const bottom = (document.querySelector('.hud-bottom') as HTMLElement | null)?.offsetHeight ?? 100;
    const avail = Math.max(120, h - bottom);
    const landscape = w > h;
    const crop = landscape ? CONFIG.room.landscapeCropTop : 0;
    this.scale = Math.min(avail / (H - crop), landscape ? Infinity : w / maxZW());
    this.viewW = w / this.scale;
    this.world.scale.set(this.scale);
    this.world.y = avail - H * this.scale;
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);
    // 区域名字：天花板够高就写在天花板上，否则和顶部按钮排在同一行（被按钮挡住的会隐藏）
    this.nameScreenY = this.world.y >= 88 ? 56 + (this.world.y - 56) / 2 : landscape ? 23 : 29;
    this.readHud();
    this.applyCam();
  }
  private readHud() {
    this.hudSpans = [...document.querySelectorAll('.hud-top > .pill')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [r.left - 10, r.right + 10] as [number, number]; });
  }
  relayout() { this.layout(); for (const k of this.editBoxes.keys()) this.updateEditBox(k); this.drawBgEdit(); }

  private maxCam() { return Math.max(0, worldW() - this.viewW); }
  private applyCam() {
    this.camX = Math.max(0, Math.min(this.maxCam(), this.camX));
    const offset = this.viewW > worldW() ? (this.viewW - worldW()) / 2 : -this.camX;
    this.world.x = offset * this.scale;
    const z = zoneAt(this.camX + this.viewW / 2);
    if (z !== this.zone) { this.zone = z; this.hooks.onZone(z); }
    const inHudRow = this.nameScreenY < 50;
    this.names.forEach((t, i) => {
      t.position.set(zx(i) + zw(i) / 2, (this.nameScreenY - this.world.y) / this.scale); t.scale.set(0.5 / this.scale);
      const sx = this.world.x + t.x * this.scale, half = t.width / 2;
      t.visible = !(inHudRow && this.hudSpans.some(([l, r]) => sx + half > l && sx - half < r));
    });
  }
  scrollToZone(i: number, instant = false) {
    const target = Math.max(0, Math.min(this.maxCam(), zx(i) + zw(i) / 2 - this.viewW / 2));
    if (instant) { this.camX = target; this.camTarget = null; this.applyCam(); } else { this.camTarget = target; this.vel = 0; }
  }
  private onDown(e: FederatedPointerEvent) { this.drag = { on: true, moved: false, startX: e.global.x, lastX: e.global.x, lastT: performance.now() }; this.camTarget = null; this.vel = 0; }
  private onMove(e: FederatedPointerEvent) {
    if (this.bgDrag) { this.bgMove(e); return; }
    if (this.editDrag) { this.editMove(e); return; }
    if (!this.drag.on) return;
    const x = e.global.x, t = performance.now();
    if (Math.abs(x - this.drag.startX) > 8) this.drag.moved = true;
    if (this.drag.moved) {
      const dx = (x - this.drag.lastX) / this.scale;
      this.camX -= dx; this.vel = -dx / Math.max(1, t - this.drag.lastT);
      this.applyCam();
    }
    this.drag.lastX = x; this.drag.lastT = t;
  }
  private onUp() {
    if (this.bgDrag) { this.bgDrag = null; this.drawBgEdit(); this.hooks.onBgEdit?.(true); return; }
    if (this.editDrag) { this.editDrag = null; this.hooks.onEdit?.(null); return; }
    if (!this.drag.on) return;
    this.drag.on = false; if (performance.now() - this.drag.lastT > 80) this.vel = 0;
    // 屏幕只放得下一个区域时，松手后自动对齐到最近的区域，家具不会被切掉一半
    if (this.drag.moved && this.viewW < maxZW() * 1.3) {
      const centre = this.camX + this.vel * 220 + this.viewW / 2;
      let best = 0; ZONES.forEach((_, i) => { if (Math.abs(zx(i) + zw(i) / 2 - centre) < Math.abs(zx(best) + zw(best) / 2 - centre)) best = i; });
      this.scrollToZone(best);
    }
  }
  private tap(fn: () => void) { return () => { if (!this.drag.moved) fn(); }; }

  // ---------- 宠物 ----------

  private makeActor(id: string, index: number): Actor {
    const root = new Container(); const sprite = new Sprite(); sprite.anchor.set(0.5, 0.9);
    const fx = new Graphics();
    const tag = new Container(); const tb = new Graphics(); const tagText = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fill: 0xffffff, fontWeight: '700' } });
    tagText.anchor.set(0.5); tag.addChild(tb, tagText);
    root.addChild(sprite, fx, tag);
    sprite.eventMode = 'static'; sprite.cursor = 'pointer';
    sprite.on('pointertap', this.tap(() => this.hooks.onPet(id)));
    this.petLayer.addChild(root);
    const x = SPOT.living - 120 + index * 70 + Math.random() * 40;
    return { id, root, sprite, tag, tagText, fx, x, lane: index, tx: x, dir: 1, action: 'idle', t0: this.now, until: this.now + 1500, pending: null, fast: false };
  }

  private setAction(a: Actor, action: ActionName, dur: number) {
    if (a.action !== action) { a.action = action; a.t0 = this.now; }
    a.until = this.now + dur;
  }

  /** 让一只宠物去做某个动作（主人喂食、洗澡、玩耍时调用） */
  perform(petId: string, action: ActionName) {
    const a = this.actors.get(petId); if (!a) return;
    const spot = action === 'eat' ? SPOT.bowl : action === 'bath' ? SPOT.tub : action === 'play' ? SPOT.living + 60 : a.x;
    a.tx = spot + (action === 'happy' ? 0 : a.lane * 16 - 30); a.fast = true;
    a.pending = { action, dur: action === 'happy' ? 2200 : 3500 };
  }

  focusPet(petId: string) {
    const a = this.actors.get(petId); if (!a) return;
    if (this.viewW < maxZW() * 1.3) this.scrollToZone(zoneAt(a.x));
    else { this.camTarget = Math.max(0, Math.min(this.maxCam(), a.x - this.viewW / 2)); this.vel = 0; }
  }

  private think(a: Actor) {
    const s = this.game.state; const p = this.game.pet(a.id)!;
    const near = (x: number) => Math.abs(a.x - x) < 60;
    const hour = new Date(s.clock).getHours();
    const night = hour >= CONFIG.room.sleepFromHour || hour < CONFIG.room.sleepToHour;
    a.fast = false;
    const low = CONFIG.stats.lowThreshold;
    if (p.food < low) {
      // 饿了：去饭碗旁边等
      if (near(SPOT.bowl)) { a.dir = 1; this.setAction(a, 'idle', 3000); } else a.tx = SPOT.bowl - 20 + a.lane * 14;
    } else if (night) {
      if (near(SPOT.bed)) this.setAction(a, 'sleep', 8000); else a.tx = SPOT.bed - 40 + a.lane * 26;
    } else if (p.clean < low) {
      // 脏了：去浴缸旁边等，一边自己舔毛
      if (near(SPOT.tub)) this.setAction(a, 'lick', 3200); else a.tx = SPOT.tub - 30 + a.lane * 18;
    } else if (p.clean < low + 15 && Math.random() < 0.4) {
      this.setAction(a, 'lick', 3200);
    } else {
      const r = Math.random();
      // 家里有猫抓板或玩具球：时不时自己去客厅玩一会儿
      if (sim.hasToy(s) && r > 0.86) {
        const toy = s.owned.scratcher ? objX('scratcher') - 46 : objX('ball') + 30;
        if (near(toy)) this.setAction(a, 'play', 3200); else a.tx = toy;
      } else if (r < 0.45) {
        const z = Math.random() < 0.65 ? 2 : Math.floor(Math.random() * 6);
        a.tx = Math.max(walkMin(), Math.min(walkMax(), zx(z) + zw(z) * (0.14 + Math.random() * 0.72)));
      } else if (r < 0.57) this.setAction(a, 'sleep', 5000 + Math.random() * 4000);
      else this.setAction(a, 'idle', 2000 + Math.random() * 3500);
    }
  }

  private tryCompanionPlay() {
    const free = [...this.actors.values()].filter((a) => !a.pending && Math.abs(a.tx - a.x) < 4 && a.action === 'idle' && a.x > zx(2) && a.x < zx(3));
    const ok = free.filter((a) => { const p = this.game.pet(a.id); return p && !sim.isWeak(p) && p.mood >= 30 && p.food >= CONFIG.stats.lowThreshold; });
    if (ok.length < 2 || Math.random() > 0.35) return;
    const [a, b] = ok;
    a.dir = a.x < b.x ? 1 : -1; b.dir = a.dir === 1 ? -1 : 1;
    this.setAction(a, 'play', 3500); this.setAction(b, 'play', 3500);
    sim.companionPlay(this.game.state, a.id, b.id); this.game.touch();
  }

  private update(dt: number) {
    this.now += dt;
    this.game.tick();
    this.rebuildObjects();
    if (this.bubble.visible && this.now > this.bubbleUntil) this.bubble.visible = false;
    if (this.bgMode && !this.bgDrag) this.drawBgEdit();
    if (this.now > this.nextHud) { this.nextHud = this.now + 1000; this.readHud(); }

    // 镜头
    if (this.camTarget !== null) {
      this.camX += (this.camTarget - this.camX) * Math.min(1, dt / 120);
      if (Math.abs(this.camTarget - this.camX) < 0.5) { this.camX = this.camTarget; this.camTarget = null; }
      this.applyCam();
    } else if (!this.drag.on && Math.abs(this.vel) > 0.02) {
      this.camX += this.vel * dt; this.vel *= Math.pow(0.994, dt); this.applyCam();
    }

    // 宠物
    const s = this.game.state;
    const home = sim.homePets(s);
    for (const [id, a] of this.actors) if (!home.some((p) => p.id === id)) { a.root.destroy({ children: true }); this.actors.delete(id); }
    home.forEach((p, i) => {
      let a = this.actors.get(p.id);
      if (!a) { a = this.makeActor(p.id, i); this.actors.set(p.id, a); }
      a.lane = i;
      const set = this.game.spriteOf(p); if (!set) return;
      const weak = sim.isWeak(p);
      if (weak) { a.pending = null; a.tx = a.x; this.setAction(a, 'sleep', 1000); }
      else if (Math.abs(a.tx - a.x) > 4) {
        a.dir = a.tx > a.x ? 1 : -1;
        const step = (a.fast ? 520 : 95) * (dt / 1000);
        a.x += a.dir * Math.min(step, Math.abs(a.tx - a.x));
        if (a.action !== 'walk') { a.action = 'walk'; a.t0 = this.now; }
      } else if (a.pending) { this.setAction(a, a.pending.action, a.pending.dur); a.pending = null; a.fast = false; }
      else if (this.now >= a.until) { if (a.action === 'walk') { a.action = 'idle'; a.t0 = this.now; } this.think(a); if (Math.abs(a.tx - a.x) <= 4 && this.now >= a.until) this.setAction(a, 'idle', 1200); }
      else if (a.action === 'walk') { a.action = 'idle'; a.t0 = this.now; }

      const sc = PET_BASE * ASSETS.petScale * CONFIG.growth.stageScale[sim.stageOf(p)];
      a.sprite.texture = set.tex[rowFor(set, a.action)][frameIndex(a.action, this.now - a.t0)];
      a.sprite.scale.set(sc * a.dir, sc);
      a.sprite.alpha = weak ? 0.75 : 1;
      // 宠物踩在地板带里：位置跟着地板线走
      const band = H - geo.floorY;
      a.root.position.set(a.x, geo.floorY + band * 0.36 + a.lane * band * 0.125);
      a.root.zIndex = a.lane;

      // 头顶的小提示
      const low = CONFIG.stats.lowThreshold;
      const text = weak ? '虚弱' : p.food < low ? '饿' : p.clean < low ? '脏' : p.mood < low ? '闷' : '';
      a.tag.visible = !!text;
      if (text && a.tagText.text !== text) {
        a.tagText.text = text;
        const g = a.tag.children[0] as Graphics; const w = text.length * 22 + 20;
        g.clear().roundRect(-w / 2, -17, w, 34, 17).fill(weak ? 0x8a8f99 : hex(PALETTE.coral));
      }
      a.tag.position.set(0, -256 * sc * 0.82);

      // 洗澡的泡泡（上传的宠物没有洗澡动作时，就是「待机 + 泡泡」）
      a.fx.clear();
      if (a.action === 'bath') {
        for (let k = 0; k < 7; k++) {
          const ph = (this.now / 900 + k * 0.37) % 1;
          a.fx.circle(Math.sin(k * 2.4) * 60 * sc * 1.4, -20 - ph * 150 * sc * 1.3 - (k % 3) * 14, 6 + (k % 3) * 4).fill({ color: 0xffffff, alpha: 0.85 * (1 - ph) }).stroke({ width: 2, color: 0x8fc3da, alpha: 1 - ph });
        }
      }
    });

    this.nextPair -= dt;
    if (this.nextPair <= 0) { this.nextPair = 4000; this.tryCompanionPlay(); }
  }
}
