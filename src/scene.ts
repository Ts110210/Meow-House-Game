// 房间画面：一个可以左右滑动的长房间，7 个区域，宠物自己在里面活动。
// 背景和物品都是贴图：有图片就用图片（见 assets.config.ts），没有就用 art/room.ts 里代码画的占位图。
import 'pixi.js/unsafe-eval';
import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { ASSETS, type ObjectDef } from './assets.config';
import type { AssetStore } from './assets';
import { drawObject, drawZone, groundColor, objectAspect, type Env } from './art/room';
import { renderPostcard } from './art/postcard';
import { CONFIG, PALETTE, SOUVENIRS, SPRITE, VISITORS, ZONES, type ActionName } from './config';
import type { Game } from './game';
import { BASE_FY, BASE_ZW, geo, recompute } from './geo';
import * as sim from './sim';
import { frameIndex, rowFor } from './sprites';

export type ObjectKind = 'door' | 'bowl' | 'tub' | 'bed' | 'cabinet' | 'album' | 'pond' | 'scratcher' | 'feeder' | 'ball' | 'npc' | 'visitor';

/** 家具旁边的位置：每件家具能同时容纳几只、各自站在哪（离家具中心的距离）、脸朝哪边。
 *  有位置才过去，位置满了就不去挤，所以不会重叠，也不会互相打断。 */
const STATIONS: Record<string, [number, 1 | -1][]> = {
  bowl: [[-72, 1], [72, -1], [-138, 1], [138, -1]], // 围着饭碗，最多四只一起吃
  tub: [[-44, 1], [44, -1]],           // 浴缸够大，两只可以一起泡
  bed: [[-46, 1], [24, 1], [92, -1]],  // 床上能睡三只
  scratcher: [[-50, 1]],               // 猫抓板一次一只
  ball: [[-46, 1], [46, -1]],          // 玩具球可以两只一起玩
};
/** 自己找玩具玩之后，至少隔这么久才会再去，免得一直卡在玩的动作里 */
const SELF_PLAY_COOLDOWN = 45_000;
const D = CONFIG.durations;
const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);

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
const walkMin = () => 70, walkMax = () => worldW() - 70;
const hex = (c: string) => parseInt(c.slice(1), 16);
/** 壮年宠物在画面里的缩放：身高约为门高的 petHeightOfDoor */
const PET_BASE = (CONFIG.room.petHeightOfDoor * CONFIG.room.doorHeight) / (SPRITE.cell * CONFIG.room.petCellFill);

interface Actor {
  id: string; root: Container; sprite: Sprite; tag: Container; tagText: Text; fx: Graphics;
  x: number; lane: number; tx: number; dir: 1 | -1; action: ActionName; t0: number; until: number;
  pending: { action: ActionName; dur: number; ball?: boolean } | null; fast: boolean;
  /** 正在追球：到什么时候为止、是不是带球的那只、刚跑到位要不要先扑一下 */
  ball: { until: number; leader: boolean; hop: boolean } | null;
  /** 主人正在陪它玩（逗猫棒）到什么时候 */
  wandUntil: number;
  /** 正占着哪件家具的第几个位置 */
  station: string | null; slot: number; selfPlayAt: number;
  /** 想用的家具现在满了：先在旁边等，空出来再过去 */
  want: { kind: string; since: number } | null;
}

export interface SceneHooks { onPet(id: string): void; onObject(kind: ObjectKind, id?: string): void; onZone(index: number): void; onEdit?(kind: string | null): void; onBgEdit?(done: boolean): void }
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
  private weather = new Graphics(); private shade = new Graphics(); private frontLayer = new Container();
  private tubFront: Sprite | null = null; private npc: Sprite | null = null; private visitorSprites = new Map<string, Sprite>(); private fishes: Graphics[] = [];
  private floats: { t: Text; t0: number }[] = [];
  private follow: { id: string; until: number } | null = null;
  private envSig = ''; private ownedSig: string | null = null;
  /** 玩具球现在在哪（宠物玩完丢在哪就留在哪）；null = 还在原来的位置 */
  private ballX: number | null = null;
  private glow = new Graphics(); private debug = new Graphics(); private debugLabels = new Map<string, Text>();
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
    this.weather.eventMode = 'none'; this.shade.eventMode = 'none'; this.frontLayer.eventMode = 'none'; this.glow.eventMode = 'none'; this.debug.eventMode = 'none';
    this.glow.blendMode = 'add';
    this.world.addChild(this.fill, this.bgLayer, this.weather, this.objects, this.petLayer, this.frontLayer, this.shade, this.glow, this.overlay, this.debug);
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
    const env = this.env(); this.envSig = env.time + env.season;
    const cover = Math.min(N, ASSETS.room.strip.coverZones);
    this.stripSprite = strip ? new Sprite(this.tex(strip)) : null;
    if (this.stripSprite) this.bgLayer.addChild(this.stripSprite);
    this.zoneSprites = ZONES.map((z, i) => {
      const img = this.assets.get(`room.zone.${z.id}`);
      if (!img && strip && i < cover) return null;
      const sp = new Sprite(this.tex(img ?? drawZone(z.id, i, env))); this.bgLayer.addChild(sp);
      return { sp, code: !img };
    });
    this.placeArt();
    this.rebuildObjects();
    if (this.names.length) this.applyCam();
    if (this.bgMode) this.setBgMode(true);
  }

  private env(): Env { return { time: sim.dayTime(this.game.state), season: sim.season(this.game.state) }; }

  /** 昼夜或季节变了：只重画代码画的那些区域（窗外、阳台、院子会变样） */
  private redrawForEnv() {
    const env = this.env();
    this.zoneSprites.forEach((z, i) => { if (z && z.code) { const old = z.sp.texture; z.sp.texture = this.tex(drawZone(ZONES[i].id, i, env)); this.textures = this.textures.filter((t) => t !== old); old.destroy(true); } });
    this.placeArt();
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
    // 屏幕底部往下延伸的地面：院子是草地，其他是木地板
    const env = this.env();
    ZONES.forEach((z, i) => { const c = groundColor(z.id, env); if (c !== PALETTE.floor && this.zoneSprites[i]?.code) g.rect(zx(i), H - 2, zw(i) + (i === N - 1 ? 3000 : 0), 3000).fill(c.startsWith('#') ? hex(c) : c); });
    // 傍晚偏暖、夜里偏暗：整个画面盖一层颜色
    this.shade.clear();
    if (env.time !== 'day') this.shade.rect(-3000, -3000, W + 6000, 6000 + H).fill(env.time === 'night' ? { color: 0x1b2444, alpha: 0.34 } : { color: 0xd9824a, alpha: 0.1 });
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
    if (kind === 'album') return `相册 ${s.postcards.length}/${sim.albumLimit()} 张`;
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
    const sig = JSON.stringify([this.editMode, s.owned, sim.shownSouvenirs(s), sim.shownPostcards(s).map((c) => c.id), s.pets.map((p) => p.spriteId), sim.lostPets(s).length, s.pets.some((p) => p.searchUntil !== null), s.visitors.map((v) => v.id), s.pond.map((p, i) => (p == null ? 0 : sim.pondReady(s, i) ? 2 : 1))]);
    if (sig === this.objSig) return;
    this.objSig = sig;
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true })); this.objSprites.clear(); this.editBoxes.clear();
    this.frontLayer.removeChildren().forEach((c) => c.destroy()); this.tubFront = null; this.npc = null; this.visitorSprites.clear(); this.fishes = [];

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
      if (kind === 'ball' && this.ballX !== null && !this.editMode) sp.x = this.ballX;
      this.objects.addChild(sp); this.objSprites.set(kind, sp);
      if (this.editMode) continue;

      const left = sp.x - sp.width / 2, top = sp.y - sp.height;
      if (kind === 'cabinet') sim.shownSouvenirs(s).forEach((id, i) => {
        const t = new Text({ text: SOUVENIRS[id]?.icon ?? '?', style: { fontSize: 30 } });
        t.anchor.set(0.5); t.position.set(left + sp.width * (0.26 + (i % 3) * 0.24), top + sp.height * (0.2 + Math.floor(i / 3) * 0.307));
        t.eventMode = 'none'; // 摆着的纪念品不挡点击，点到它等于点收藏柜
        this.objects.addChild(t);
      });
      // 鱼塘里的鱼：画在自己的小图层里，每帧让它来回游
      if (kind === 'pond') s.pond.forEach((p, i) => {
        if (p == null) return;
        const ready = sim.pondReady(s, i); const f = new Graphics(); const k = ready ? 1 : 0.55;
        const col = ready ? hex(PALETTE.coral) : 0xf2d2c6;
        f.ellipse(0, 0, 18 * k, 8 * k).fill(col).poly([-16 * k, 0, -28 * k, -7 * k, -28 * k, 7 * k]).fill(col).circle(10 * k, -2 * k, 1.6).fill(0x5b4634);
        f.position.set(left + sp.width * (0.3 + i * 0.2), top + sp.height * (0.42 + (i % 2) * 0.16));
        (f as any).homeX = f.x; (f as any).range = sp.width * 0.09; (f as any).phase = i * 2.1;
        f.eventMode = 'none'; this.objects.addChild(f); this.fishes.push(f);
      });
      // 浴缸的前半边单独再画一层，盖在宠物上面，这样宠物看起来是泡在浴缸里
      if (kind === 'tub' && src) {
        const base = this.tex(src); const from = def.frontFrom ?? 0.2;
        const front = new Sprite(new Texture({ source: base.source, frame: new Rectangle(0, src.height * from, src.width, src.height * (1 - from)) }));
        front.anchor.set(0.5, 1); front.width = sp.width; front.height = sp.height * (1 - from); front.position.set(sp.x, sp.y); front.visible = false;
        this.frontLayer.addChild(front); this.tubFront = front;
      }
      // 相册墙：占位图的四个相框里放最近的四张明信片（换成自己的相册墙图片后不放，因为不知道相框在哪）
      if (kind === 'album' && !img && src) {
        const FRAMES = [[11, 27, 58, 42], [93, 11, 44, 60], [19, 95, 42, 56], [85, 99, 54, 40]]; const kx = sp.width / 150, ky = sp.height / 170;
        sim.shownPostcards(s).forEach((card, i) => {
          const [fx, fy, fw, fh] = FRAMES[i];
          const full = renderPostcard(card, card.petIds.map((id) => this.game.spriteOf(this.game.pet(id))), this.assets.get(`postcard.${card.destId}`));
          const thumb = document.createElement('canvas'); thumb.width = fw * 4; thumb.height = fh * 4;
          const k = Math.max(thumb.width / full.width, thumb.height / full.height); const dw = full.width * k, dh = full.height * k;
          thumb.getContext('2d')!.drawImage(full, (thumb.width - dw) / 2, (thumb.height - dh) / 2, dw, dh);
          const ps = new Sprite(this.tex(thumb)); ps.position.set(left + fx * kx, top + fy * ky); ps.width = fw * kx; ps.height = fh * ky; ps.eventMode = 'none';
          this.objects.addChild(ps);
        });
      }
    }
    // 狸花猫：有宠物离家出走、而它没在外面找的时候，会坐在门口等你
    const tabby = this.game.sprites.get('npc:tabby');
    if (!this.editMode && tabby && sim.lostPets(s).length && !s.pets.some((p) => p.searchUntil !== null)) {
      const door = objPos(ASSETS.objects.door); const sc = PET_BASE * ASSETS.petScale * 0.95;
      const n = new Sprite(tabby.tex[0][0]); n.anchor.set(0.5, 0.9); n.scale.set(-sc, sc);
      n.position.set(door.x + 118 * door.k, geo.floorY + (H - geo.floorY) * 0.3);
      n.eventMode = 'static'; n.cursor = 'pointer'; n.on('pointertap', this.tap(() => this.hooks.onObject('npc')));
      this.objects.addChild(n); this.npc = n;
    }
    // 访客：站在门口，头顶有个小气泡，点一下看它来干什么
    if (!this.editMode) s.visitors.forEach((v, i) => {
      const set = this.game.sprites.get(VISITORS[v.who].look); if (!set) return;
      const door = objPos(ASSETS.objects.door); const sc = PET_BASE * ASSETS.petScale * 0.95;
      const n = new Sprite(set.tex[0][0]); n.anchor.set(0.5, 0.9); n.scale.set(-sc, sc);
      n.position.set(door.x + (this.npc ? -118 - i * 90 : 118 - i * 236) * door.k, geo.floorY + (H - geo.floorY) * (0.34 + i * 0.06));
      n.eventMode = 'static'; n.cursor = 'pointer'; n.on('pointertap', this.tap(() => this.hooks.onObject('visitor', v.id)));
      const bubble = new Text({ text: v.kind === 'gift' ? '🎁' : v.kind === 'trade' ? '🔁' : '✉️', style: { fontSize: 64 } });
      bubble.anchor.set(0.5, 1); bubble.scale.set(-1 / sc * 0.42, 1 / sc * 0.42); bubble.position.set(0, -256 * 0.86); bubble.eventMode = 'none'; n.addChild(bubble);
      this.objects.addChild(n); this.visitorSprites.set(v.id, n);
    });
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
    // 用实际显示出来的高度（界面大小调过之后也对）
    const bottom = (document.querySelector('.hud-bottom') as HTMLElement | null)?.getBoundingClientRect().height ?? 100;
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
    return { id, root, sprite, tag, tagText, fx, x, lane: index, tx: x, dir: 1, action: 'idle', t0: this.now, until: this.now + 1500, pending: null, fast: false, ball: null, wandUntil: 0, want: null, station: null, slot: 0, selfPlayAt: -SELF_PLAY_COOLDOWN };
  }

  private setAction(a: Actor, action: ActionName, dur: number) {
    if (a.action !== action) { a.action = action; a.t0 = this.now; }
    a.until = this.now + dur;
  }

  /** 去占一件家具旁边的位置。满了、或者这件家具现在不在房间里，就返回 false */
  private reserve(a: Actor, kind: string): boolean {
    const sp = this.objSprites.get(kind); const slots = STATIONS[kind]; if (!sp || !slots) return false;
    const taken = new Set([...this.actors.values()].filter((o) => o !== a && o.station === kind).map((o) => o.slot));
    const i = slots.findIndex((_, k) => !taken.has(k)); if (i < 0) return false;
    const pos = objPos(ASSETS.objects[kind]);
    a.station = kind; a.slot = i; a.tx = Math.max(walkMin(), Math.min(walkMax(), this.stationX(kind) + slots[i][0] * pos.k));
    return true;
  }
  /** 家具的中心在哪。玩具球会被宠物带着跑，所以用它现在的位置 */
  private stationX(kind: string) { return kind === 'ball' && this.ballX !== null ? this.ballX : objPos(ASSETS.objects[kind]).x; }
  private release(a: Actor) { a.station = null; a.ball = null; }
  /** 这只宠物是不是正忙着（吃、洗、玩到一半，或者正赶过去）。忙的时候不接新的指令。 */
  busy(petId: string): ActionName | null {
    const a = this.actors.get(petId); if (!a) return null;
    if (a.pending && a.fast) return a.pending.action;
    if ((a.action === 'eat' || a.action === 'bath') && a.station && this.now < a.until) return a.action;
    if (a.wandUntil > this.now) return 'play';
    return null;
  }
  /** 占位置；满了就走到家具旁边等着 */
  private reserveOrWait(a: Actor, kind: string) {
    if (this.reserve(a, kind) || !this.objSprites.get(kind)) return;
    const pos = objPos(ASSETS.objects[kind]); const side = a.x < pos.x ? -1 : 1;
    a.want = { kind, since: this.now }; a.tx = Math.max(walkMin(), Math.min(walkMax(), pos.x + side * (210 + a.lane * 26) * pos.k));
  }

  /** 让一只宠物去做某个动作（主人喂食、洗澡、玩耍时调用）。会走到对应的家具旁边；镜头跟着它。 */
  perform(petId: string, action: ActionName, follow = true) {
    const a = this.actors.get(petId); if (!a) return;
    this.release(a); a.pending = null; a.want = null; a.tx = a.x; a.wandUntil = 0;
    if (action === 'eat') this.reserveOrWait(a, 'bowl');
    else if (action === 'bath') this.reserveOrWait(a, 'tub');
    // 主人陪玩：就在原地逗它，不用走到玩具那里（猫抓板和球是它自己玩的）
    const dur = action === 'eat' ? D.eat : action === 'bath' ? D.bath : action === 'play' ? D.wand : D.pet;
    if (action === 'play') { a.wandUntil = this.now + dur; a.selfPlayAt = this.now; }
    a.fast = true;
    a.pending = { action, dur };
    if (follow && action !== 'happy') this.follow = { id: petId, until: this.now + dur + 4000 };
  }

  /** 宠物头顶飘一行字（「饱食 +25」之类），给操作一个看得见的反馈 */
  floatText(petId: string, text: string) {
    const a = this.actors.get(petId); if (!a || !text) return;
    const t = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 30, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x5b4634, width: 6 } } });
    t.anchor.set(0.5); t.scale.set(0.5 / this.scale); (t as any).petId = petId;
    this.overlay.addChild(t); this.floats.push({ t, t0: this.now });
  }

  focusPet(petId: string) {
    const a = this.actors.get(petId); if (!a) return;
    if (this.viewW < maxZW() * 1.3) this.scrollToZone(zoneAt(a.x));
    else { this.camTarget = Math.max(0, Math.min(this.maxCam(), a.x - this.viewW / 2)); this.vel = 0; }
  }

  private think(a: Actor) {
    const s = this.game.state; const p = this.game.pet(a.id)!;
    this.release(a); // 上一件事做完了，把位置让出来
    const near = (x: number) => Math.abs(a.x - x) < 40;
    const goNear = (kind: string, dx: number) => { const pos = objPos(ASSETS.objects[kind]); return Math.max(walkMin(), Math.min(walkMax(), pos.x + dx * pos.k)); };
    const night = sim.dayTime(s) === 'night';
    a.fast = false;
    const low = CONFIG.stats.lowThreshold;
    if (p.food < low) {
      // 饿了：去饭碗旁边蹲着等
      const spot = goNear('bowl', -150 - a.lane * 30);
      if (near(spot)) { a.dir = 1; this.setAction(a, 'idle', 3000); } else a.tx = spot;
    } else if (s.owned.feeder && p.food < CONFIG.stats.feederFoodFloor + 12 && Math.random() < 0.4 && this.reserve(a, 'bowl')) {
      // 自动喂食机出粮了：自己去吃两口
      a.pending = { action: 'eat', dur: 5000 };
    } else if (night) {
      // 晚上：床上有位置就上床，没有就在旁边的地上睡
      if (this.reserve(a, 'bed')) a.pending = { action: 'sleep', dur: 9000 };
      else { const spot = goNear('bed', 170 + a.lane * 26); if (near(spot)) this.setAction(a, 'sleep', 9000); else a.tx = spot; }
    } else if (p.clean < low) {
      // 脏了：去浴缸旁边等，一边自己舔毛
      const spot = goNear('tub', -170 - a.lane * 24);
      if (near(spot)) this.setAction(a, 'lick', 3200); else a.tx = spot;
    } else if (p.clean < low + 15 && Math.random() < 0.4) {
      this.setAction(a, 'lick', 3200);
    } else {
      const r = Math.random();
      // 家里有猫抓板或玩具球：隔一阵子自己去玩一会儿。有冷却时间，位置被占了就不去，所以不会卡在里面。
      const toys = ['scratcher', 'ball'].sort(() => Math.random() - 0.5);
      if (sim.hasToy(s) && r > 0.78 && this.now - a.selfPlayAt > SELF_PLAY_COOLDOWN && (this.reserve(a, toys[0]) || this.reserve(a, toys[1]))) {
        a.selfPlayAt = this.now;
        a.pending = a.station === 'ball' ? { action: 'play', dur: between(D.ball), ball: true } : { action: 'play', dur: between(D.scratcher) };
      } else if (r < 0.45) {
        const z = Math.random() < 0.6 ? 2 : Math.floor(Math.random() * N);
        a.tx = Math.max(walkMin(), Math.min(walkMax(), zx(z) + zw(z) * (0.14 + Math.random() * 0.72)));
      } else if (r < 0.57) this.setAction(a, 'sleep', 5000 + Math.random() * 4000);
      else this.setAction(a, 'idle', 2000 + Math.random() * 3500);
    }
  }

  /** 两只闲着的宠物凑在一起玩。有玩具球就一起去玩球，没有就在原地闹一会儿。 */
  private tryCompanionPlay() {
    const s = this.game.state;
    const free = [...this.actors.values()].filter((a) => !a.pending && !a.station && Math.abs(a.tx - a.x) < 4 && a.action === 'idle' && this.now - a.selfPlayAt > SELF_PLAY_COOLDOWN);
    const ok = free.filter((a) => { const p = this.game.pet(a.id); return p && !sim.isWeak(p) && p.mood >= 30 && p.food >= CONFIG.stats.lowThreshold; });
    if (ok.length < 2 || Math.random() > 0.3) return;
    const a = ok[0]; const b = ok.slice(1).sort((m, n) => Math.abs(m.x - a.x) - Math.abs(n.x - a.x))[0];
    if (Math.abs(a.x - b.x) > zw(2) * 1.5) return; // 离得太远就算了
    if (s.owned.ball && this.reserve(a, 'ball') && this.reserve(b, 'ball')) { const dur = between(D.ball); a.pending = { action: 'play', dur, ball: true }; b.pending = { action: 'play', dur, ball: true }; }
    else { this.release(a); this.release(b); a.tx = a.x; b.tx = b.x; a.dir = a.x < b.x ? 1 : -1; b.dir = a.dir === 1 ? -1 : 1; this.setAction(a, 'play', 6000); this.setAction(b, 'play', 6000); }
    a.selfPlayAt = b.selfPlayAt = this.now;
    sim.companionPlay(s, a.id, b.id); this.game.touch();
  }

  /** 新买了一件家具：让一两只闲着的宠物走过去看看 */
  private curiosity(kind: string) {
    const sp = this.objSprites.get(kind); if (!sp) return;
    const idle = [...this.actors.values()].filter((a) => !a.pending && !a.station && !sim.isWeak(this.game.pet(a.id)!)).slice(0, 2);
    idle.forEach((a, i) => { a.tx = Math.max(walkMin(), Math.min(walkMax(), sp.x + (i ? 80 : -80))); a.fast = true; a.pending = { action: 'happy', dur: 2400 }; });
    if (idle.length) this.follow = { id: idle[0].id, until: this.now + 5000 };
  }

  /** 天黑了，会发光的物品（落地灯）周围画一团暖光。光的位置跟着物品走，物品挪到哪光到哪。 */
  private drawGlow(env: Env) {
    const g = this.glow.clear(); if (env.time === 'day') return;
    const strength = env.time === 'night' ? 1 : 0.4;
    for (const [kind, sp] of this.objSprites) {
      const light = ASSETS.objects[kind]?.light; if (!light || sp.alpha === 0) continue;
      const x = sp.x - sp.width / 2 + sp.width * light[0], y = sp.y - sp.height + sp.height * light[1];
      // 很多层很淡的圆叠起来，越靠近灯越亮，边缘看不出一圈一圈
      for (let i = 30; i >= 1; i--) g.ellipse(x, y + 40 + i * 2, 12 * i, 11 * i).fill({ color: 0xffc977, alpha: 0.016 * strength });
    }
  }

  /** 开发者用：把看不见的范围都画出来，方便找穿模。
   *  蓝框 = 物品的图片范围（也是点击范围）；绿点 = 宠物用这件家具时站的位置，短线是脸朝的方向；
   *  橙线 = 遮挡线（线以下盖在宠物前面）；黄点 = 发光的位置；红框 = 宠物的图片范围（也是点击范围），红点 = 脚底；
   *  紫线 = 地板线和各只宠物走的那条线。 */
  private drawDebug() {
    const on = this.game.state.dev.enabled && !!this.game.state.dev.debugBoxes && !this.editMode;
    const g = this.debug.clear(); const used = new Set<string>();
    const label = (key: string, text: string, x: number, y: number, color: number) => {
      let t = this.debugLabels.get(key);
      if (!t) { t = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 22, fill: color, fontWeight: '700', stroke: { color: 0xffffff, width: 5 } } }); t.eventMode = 'none'; this.world.addChild(t); this.debugLabels.set(key, t); }
      if (t.text !== text) t.text = text;
      t.position.set(x, y); t.scale.set(0.5 / this.scale); t.visible = true; used.add(key);
    };
    if (on) {
      const band = H - geo.floorY;
      g.moveTo(0, geo.floorY).lineTo(worldW(), geo.floorY).stroke({ width: 2, color: 0x9b59d0 });
      label('floor', '地板线', this.camX + 8, geo.floorY - 16, 0x9b59d0);
      for (let i = 0; i < Math.max(1, this.actors.size); i++) { const y = geo.floorY + band * 0.36 + i * band * 0.125; g.moveTo(0, y).lineTo(worldW(), y).stroke({ width: 1, color: 0x9b59d0, alpha: 0.5 }); }
      for (let i = 0; i <= N; i++) g.moveTo(zx(i), 0).lineTo(zx(i), H).stroke({ width: 1, color: 0x9b59d0, alpha: 0.5 });
      for (const [kind, sp] of this.objSprites) {
        const def = ASSETS.objects[kind]; const l = sp.x - sp.width / 2, t = sp.y - sp.height;
        g.rect(l, t, sp.width, sp.height).stroke({ width: 2, color: 0x2f7fd0 });
        label('o:' + kind, def.label + (sp.alpha === 0 ? '（只有点击范围）' : ''), l + 3, t + 2, 0x2f7fd0);
        if (def.frontFrom != null) { const y = t + sp.height * def.frontFrom; g.moveTo(l - 12, y).lineTo(l + sp.width + 12, y).stroke({ width: 3, color: 0xf08a24 }); label('f:' + kind, '遮挡线', l + sp.width + 14, y - 8, 0xf08a24); }
        if (def.light) g.circle(l + sp.width * def.light[0], t + sp.height * def.light[1], 7).fill(0xf5c518).stroke({ width: 2, color: 0x7a5a00 });
        const k = objPos(def).k; const cx = this.stationX(kind);
        (STATIONS[kind] ?? []).forEach(([dx, dir], i) => {
          const x = cx + dx * k, y = geo.floorY + band * 0.36;
          const taken = [...this.actors.values()].some((a) => a.station === kind && a.slot === i);
          g.circle(x, y, 7).fill(taken ? 0x1f8a3a : 0x6fd08a).stroke({ width: 2, color: 0x0f5a22 }).moveTo(x, y).lineTo(x + dir * 26, y).stroke({ width: 3, color: 0x0f5a22 });
        });
      }
      if (this.npc) g.rect(this.npc.x - this.npc.width / 2, this.npc.y - this.npc.height * 0.9, this.npc.width, this.npc.height).stroke({ width: 2, color: 0x2f7fd0 });
      for (const a of this.actors.values()) {
        const w = Math.abs(a.sprite.width), h = a.sprite.height;
        g.rect(a.root.x - w / 2, a.root.y - h * 0.9, w, h).stroke({ width: 2, color: 0xd03a3a });
        g.circle(a.root.x, a.root.y, 6).fill(0xd03a3a);
        label('p:' + a.id, `${a.action}${a.station ? ' @' + a.station + '#' + a.slot : ''}${a.want ? ' 等' + a.want.kind : ''}${a.ball ? ' 追球' : ''}`, a.root.x - w / 2 + 3, a.root.y - h * 0.9 + 2, 0xd03a3a);
      }
    }
    for (const [key, t] of this.debugLabels) if (!used.has(key)) t.visible = false;
  }

  /** 室外（阳台和院子）飘的东西：春天花瓣、秋天落叶、冬天雪；夏天的夜里有萤火虫 */
  private drawWeather(env: Env) {
    const g = this.weather.clear();
    const first = zoneIndex('balcony'); if (first < 0) return;
    const kind = env.season === 'spring' ? 'petal' : env.season === 'autumn' ? 'leaf' : env.season === 'winter' ? 'snow' : env.time === 'night' ? 'firefly' : '';
    if (!kind) return;
    const x0 = zx(first) + 18, x1 = worldW(), w = x1 - x0, top = 40, bottom = geo.floorY + 60; const t = this.now / 1000;
    for (let i = 0; i < 34; i++) {
      const seed = i * 127.1; const speed = kind === 'snow' ? 26 + (i % 5) * 6 : kind === 'firefly' ? 0 : 40 + (i % 7) * 9;
      let x = x0 + ((seed * 3.7 + Math.sin(t * 0.7 + i) * 30 + t * (kind === 'leaf' ? 14 : 5)) % w + w) % w;
      let y = top + ((seed * 1.9 + t * speed) % (bottom - top));
      if (kind === 'firefly') { x = x0 + ((seed * 3.7) % w) + Math.sin(t * 0.6 + i) * 22; y = geo.floorY - 60 - ((seed * 1.3) % 240) + Math.cos(t * 0.8 + i * 2) * 14; }
      // 阳台有屋檐：屋檐下面那一块不飘
      if (zoneAt(x) === first && y > 430) continue;
      if (kind === 'snow') g.circle(x, y, 2.5 + (i % 3)).fill({ color: 0xffffff, alpha: 0.9 });
      else if (kind === 'petal') g.ellipse(x, y, 5, 3).fill({ color: 0xf2b8c6, alpha: 0.9 });
      else if (kind === 'leaf') g.ellipse(x, y, 6, 3.5).fill({ color: i % 2 ? 0xe0914f : 0xd9a94a, alpha: 0.9 });
      else g.circle(x, y, 3).fill({ color: 0xf6ec9a, alpha: 0.5 + 0.5 * Math.sin(t * 3 + i) });
    }
  }

  private update(dt: number) {
    this.now += dt;
    this.game.tick();
    const env = this.env();
    if (env.time + env.season !== this.envSig) { this.envSig = env.time + env.season; this.redrawForEnv(); }
    this.rebuildObjects();
    // 新买的家具
    const owned = Object.keys(this.game.state.owned).sort().join(',');
    if (this.ownedSig !== null && owned !== this.ownedSig) for (const k of owned.split(',')) if (k && !this.ownedSig.split(',').includes(k)) this.curiosity(k);
    this.ownedSig = owned;
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
    let bathing = false;
    home.forEach((p, i) => {
      let a = this.actors.get(p.id);
      if (!a) { a = this.makeActor(p.id, i); this.actors.set(p.id, a); }
      a.lane = i;
      const set = this.game.spriteOf(p); if (!set) return;
      const weak = sim.isWeak(p);
      if (weak) { a.pending = null; a.want = null; a.tx = a.x; this.release(a); this.setAction(a, 'sleep', 1000); }
      else if (Math.abs(a.tx - a.x) > 4) {
        a.dir = a.tx > a.x ? 1 : -1;
        const step = (a.fast ? 520 : a.ball ? 230 : 95) * (dt / 1000);
        a.x += a.dir * Math.min(step, Math.abs(a.tx - a.x));
        if (a.action !== 'walk') { a.action = 'walk'; a.t0 = this.now; }
      } else if (a.ball && !a.pending) {
        // 追球：跑一段，扑一下，再跑。时间到了球就留在原地
        if (this.now >= a.ball.until) { this.release(a); this.setAction(a, 'idle', 1500); }
        else if (!a.ball.hop) { a.ball.hop = true; this.setAction(a, 'play', 1100); }
        else if (this.now >= a.until) {
          a.ball.hop = false;
          const lo = zx(1) + 80, hi = zx(Math.min(N, 5)) - 80; // 只在屋里跑，不出阳台
          if (a.ball.leader) a.tx = Math.max(lo, Math.min(hi, a.x + (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 200)));
          else { const lead = [...this.actors.values()].find((o) => o.ball?.leader); a.tx = lead ? Math.max(lo, Math.min(hi, lead.tx - lead.dir * 84)) : a.x; }
          if (Math.abs(a.tx - a.x) <= 4) this.setAction(a, 'play', 900);
        }
      } else if (a.pending && a.want && this.now - a.want.since < 40_000 && !this.reserve(a, a.want.kind)) {
        // 位置还被占着：面朝家具等一等（最多等 40 秒，再等不到就原地做）
        const pos = objPos(ASSETS.objects[a.want.kind]); a.dir = pos.x >= a.x ? 1 : -1;
        if (a.action !== 'idle') { a.action = 'idle'; a.t0 = this.now; }
      } else if (a.pending && a.want && a.station) {
        a.want = null; // 空出来了，走过去（下一帧开始走）
      } else if (a.pending) {
        a.want = null;
        // 走到了：转向家具，开始做动作
        if (a.station) a.dir = STATIONS[a.station][a.slot][1];
        if (a.pending.ball && a.station === 'ball') { a.ball = { until: this.now + a.pending.dur, leader: ![...this.actors.values()].some((o) => o !== a && o.ball?.leader), hop: true }; this.setAction(a, 'play', 1100); }
        else this.setAction(a, a.pending.action, a.pending.dur);
        if (a.wandUntil) a.wandUntil = a.until;
        a.pending = null; a.fast = false;
      }
      else if (this.now >= a.until) { if (a.action === 'walk') { a.action = 'idle'; a.t0 = this.now; } this.think(a); if (Math.abs(a.tx - a.x) <= 4 && this.now >= a.until) this.setAction(a, 'idle', 1200); }
      else if (a.action === 'walk') { a.action = 'idle'; a.t0 = this.now; }

      const sc = PET_BASE * ASSETS.petScale * CONFIG.growth.stageScale[sim.stageOf(p)];
      a.sprite.texture = set.tex[rowFor(set, a.action)][frameIndex(a.action, this.now - a.t0)];
      a.sprite.scale.set(sc * a.dir, sc);
      a.sprite.alpha = weak ? 0.75 : 1;
      // 宠物踩在地板带里：位置跟着地板线走
      const band = H - geo.floorY;
      const inTub = a.station === 'tub' && a.action === 'bath' && this.objSprites.get('tub');
      if (inTub) {
        // 泡在浴缸里：下巴大约在浴缸边沿（遮挡线）的位置，身体被浴缸前面那一层挡住
        const rim = inTub.y - inTub.height * (1 - (ASSETS.objects.tub.frontFrom ?? 0.2));
        a.root.position.set(inTub.x + STATIONS.tub[a.slot][0] * (inTub.width / 260), rim + (0.9 * 256 - 152) * sc); bathing = true;
      }
      else a.root.position.set(a.x, geo.floorY + band * 0.36 + a.lane * band * 0.125);
      a.root.zIndex = inTub ? -1 : a.lane;

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
      if (a.action === 'play' && a.wandUntil > this.now) {
        // 逗猫棒（没买的时候是主人的一根手指头那么短的小草）
        const wand = !!s.owned.wand; const sw = Math.sin(this.now / 170) * 0.5; const len = (wand ? 150 : 70) * sc;
        const hx = a.dir * (wand ? 150 : 110) * sc, hy = -250 * sc; const tx = hx - a.dir * len * Math.sin(0.5 + sw) * 0.9, ty = hy + len * Math.cos(0.5 + sw) * 0.75;
        a.fx.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: 3, color: wand ? 0x8a5b3c : 0x7fa884 });
        if (wand) a.fx.ellipse(tx, ty + 8, 9, 15).fill(hex(PALETTE.coral)).ellipse(tx - 7, ty + 6, 5, 11).fill(hex(PALETTE.mustard));
        else a.fx.ellipse(tx, ty + 4, 5, 8).fill(0x93b893);
      }
      if (a.action === 'bath') {
        for (let k = 0; k < 7; k++) {
          const ph = (this.now / 900 + k * 0.37) % 1;
          a.fx.circle(Math.sin(k * 2.4) * 60 * sc * 1.4, -20 - ph * 150 * sc * 1.3 - (k % 3) * 14, 6 + (k % 3) * 4).fill({ color: 0xffffff, alpha: 0.85 * (1 - ph) }).stroke({ width: 2, color: 0x8fc3da, alpha: 1 - ph });
        }
      }
    });

    if (this.tubFront) this.tubFront.visible = bathing;

    // 玩具球：被带着跑的时候跟在带球那只的脚前面，一蹦一蹦；没人玩就留在原地
    const ballSp = this.objSprites.get('ball');
    if (ballSp && !this.editMode) {
      const lead = [...this.actors.values()].find((o) => o.ball?.leader);
      const baseY = objPos(ASSETS.objects.ball).y;
      if (lead) { this.ballX = lead.x + lead.dir * 62; ballSp.x += (this.ballX - ballSp.x) * Math.min(1, dt / 90); ballSp.y = baseY - Math.abs(Math.sin(this.now / 160)) * 16; }
      else { if (this.ballX !== null) ballSp.x = this.ballX; ballSp.y = baseY; }
    }
    this.drawGlow(env);
    this.drawDebug();

    // 镜头跟着刚被照顾的那只走一会儿
    if (this.follow) {
      const a = this.actors.get(this.follow.id);
      if (!a || this.now > this.follow.until || this.drag.on) this.follow = null;
      else if (this.viewW < maxZW() * 1.3) { const z = zoneAt(a.x); if (z !== this.zone) this.scrollToZone(z); }
      else this.camTarget = Math.max(0, Math.min(this.maxCam(), a.x - this.viewW / 2));
    }

    // 飘字
    this.floats = this.floats.filter((f) => {
      const age = (this.now - f.t0) / 1400; const a = this.actors.get((f.t as any).petId);
      if (age >= 1 || !a) { f.t.destroy(); return false; }
      f.t.position.set(a.root.x, a.root.y - 150 * (a.sprite.scale.y / 0.75) - age * 46); f.t.alpha = age < 0.7 ? 1 : (1 - age) / 0.3; f.t.scale.set(0.5 / this.scale);
      return true;
    });

    // 小鱼来回游
    for (const f of this.fishes) { const ph = this.now / 1300 + (f as any).phase; f.x = (f as any).homeX + Math.sin(ph) * (f as any).range; f.scale.x = Math.cos(ph) >= 0 ? 1 : -1; f.y += Math.sin(this.now / 500 + (f as any).phase) * 0.05; }

    // 狸花猫的待机动画
    const tabby = this.game.sprites.get('npc:tabby');
    if (this.npc && tabby) this.npc.texture = tabby.tex[0][frameIndex('idle', this.now)];
    for (const v of s.visitors) { const sp = this.visitorSprites.get(v.id), set = this.game.sprites.get(VISITORS[v.who].look); if (sp && set) sp.texture = set.tex[0][frameIndex('idle', this.now + 300)]; }

    this.drawWeather(env);

    this.nextPair -= dt;
    if (this.nextPair <= 0) { this.nextPair = 4000; this.tryCompanionPlay(); }
  }
}
