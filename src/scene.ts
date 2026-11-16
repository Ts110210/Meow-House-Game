// 房间画面：一个可以左右滑动的长房间，8 个区域，宠物自己在里面活动。
// 前后关系：家具、摆在地上的装饰、宠物都放在同一层里，按「脚底的位置」排序——脚底越靠下（离镜头越近）越盖在前面。
// 背景和物品都是贴图：有图片就用图片（见 assets.config.ts），没有就用 art/room.ts 里代码画的占位图。
import 'pixi.js/unsafe-eval';
import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { ASSETS, type ObjectDef } from './assets.config';
import type { AssetStore } from './assets';
import { drawObject, drawZone, groundColor, objectAspect, roomPalette, type Env } from './art/room';
import { renderPostcard } from './art/postcard';
import { CONFIG, DECOR, PALETTE, SOUVENIRS, SPRITE, VISITORS, ZONES, type ActionName , NEIGHBORS, FIND_KINDS, SEASON_FINDS } from './config';
import { drawDecor } from './art/decor';
import type { Game } from './game';
import { BASE_FY, BASE_ZW, geo, recompute } from './geo';
import * as sim from './sim';
import { frameIndex, rowFor } from './sprites';

export type ObjectKind = 'neighbor' | 'find' | 'door' | 'bowl' | 'tub' | 'bed' | 'cabinet' | 'album' | 'pond' | 'scratcher' | 'feeder' | 'ball' | 'sofa' | 'counter' | 'nightstand' | 'bedlamp' | 'pendantDoor' | 'pendantShelf' | 'cattree' | 'npc' | 'visitor';

/** 家具的位置：每件家具能同时容纳几只、各自在哪、脸朝哪边。
 *  有位置才过去，位置满了就不去挤，所以不会重叠，也不会互相打断。
 *  dx = 离家具中心多远（按 432 宽的区域算）；
 *  at = 站在地上时，脚底在家具底边往上多少（按家具高度的比例；负数 = 在家具前面）。不写 = 贴着墙根；
 *  perch = 跳到家具上：落脚点在图片里的位置 [横向 −0.5…0.5，从底边往上 0…1]。先走到 dx 的位置，再跳上去。 */
interface Station { dx: number; dir: 1 | -1; at?: number; perch?: [number, number] }
const STATIONS: Record<string, Station[]> = {
  bowl: [{ dx: -72, dir: 1, at: -0.1 }, { dx: 72, dir: -1, at: -0.1 }, { dx: -138, dir: 1, at: -0.4 }, { dx: 138, dir: -1, at: -0.4 }], // 围着饭碗，最多四只一起吃
  tub: [{ dx: -44, dir: 1, perch: [-0.17, 0] }, { dx: 44, dir: -1, perch: [0.17, 0] }], // 浴缸够大，两只可以一起泡（位置按遮挡线另算）
  bed: [{ dx: -62, dir: 1, perch: [-0.22, 0.5] }, { dx: 20, dir: 1, perch: [0.06, 0.5] }, { dx: 98, dir: -1, perch: [0.34, 0.5] }], // 床上能睡三只
  sofa: [{ dx: -64, dir: 1, perch: [-0.25, 0.33] }, { dx: 36, dir: -1, perch: [0.13, 0.33] }], // 沙发上两只
  cattree: [{ dx: -40, dir: 1, perch: [-0.24, 0.862] }, { dx: 46, dir: -1, perch: [0.25, 0.547] }, { dx: -30, dir: 1, perch: [-0.2, 0.232] }], // 猫爬架：顶层、中层、底层
  kitchenWindow: [{ dx: 0, dir: 1, perch: [0, 0] }], // 窗台：一次一只，看外面
  bedroomWindow: [{ dx: 0, dir: -1, perch: [0, 0] }],
  scratcher: [{ dx: -50, dir: 1, at: -0.03 }], // 猫抓板一次一只
  ball: [{ dx: -46, dir: 1, at: -0.1 }, { dx: 46, dir: -1, at: -0.1 }], // 玩具球可以两只一起玩
  pond: [{ dx: -178, dir: 1, at: 0.45 }, { dx: -72, dir: 1, at: 1.12 }, { dx: 72, dir: -1, at: 1.12 }], // 鱼塘边捞鱼：左边一只、后面两只，都在岸上
};
/** 猫会自己跳上去待着的地方（猫爬架另算：可以指定谁待在哪一层） */
/** 露天的区域：下雨时宠物不去 */
const OUTDOOR: string[] = ['balcony', 'garden'];
const LOUNGE = ['sofa', 'bed', 'kitchenWindow', 'bedroomWindow', 'cattree'];
/** 跳上、跳下家具的过渡动画要多久（毫秒） */
const HOP_MS = 460;
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
/** 宠物能走的前后范围（脚底的 y）：地板带里靠墙的一条到靠镜头的一条 */
const depthMin = () => geo.floorY + (H - geo.floorY) * 0.22, depthMax = () => geo.floorY + (H - geo.floorY) * 0.9;
const clampX = (x: number) => Math.max(walkMin(), Math.min(walkMax(), x)), clampY = (y: number) => Math.max(depthMin(), Math.min(depthMax(), y));
const hex = (c: string) => parseInt(c.slice(1), 16);
/** 壮年宠物在画面里的缩放：身高约为门高的 petHeightOfDoor */
const PET_BASE = (CONFIG.room.petHeightOfDoor * CONFIG.room.doorHeight) / (SPRITE.cell * CONFIG.room.petCellFill);

interface Actor {
  id: string; root: Container; sprite: Sprite; tag: Container; tagText: Text; fx: Graphics;
  /** x = 左右，y = 前后（脚底在地板带里的位置）；tx、ty = 要走去哪 */
  x: number; y: number; lane: number; tx: number; ty: number; dir: 1 | -1; action: ActionName; t0: number; until: number;
  /** 正待在哪件家具上（床、沙发、猫爬架、窗台、浴缸里）。这时 x、y 仍然是它跳上去之前站的地方 */
  perch: { kind: string; slot: number } | null;
  /** 正在跳上或跳下家具 */
  hop: { t0: number; up: boolean; kind: string; slot: number } | null;
  /** 插进来的一小段动作：睡前打哈欠、睡醒伸懒腰。做完之前不走也不跳 */
  inter: { action: ActionName; t0: number; until: number } | null;
  /** 闹脾气到什么时候（主人离开太久）。摸一下就好 */
  sulkUntil: number;
  /** meet = 走到这只同伴身边再开始；partner = 到了之后同伴做什么动作 */
  pending: { action: ActionName; dur: number; ball?: boolean; meet?: string; partner?: ActionName } | null; fast: boolean;
  /** 正在追球：到什么时候为止、是不是带球的那只、刚跑到位要不要先扑一下 */
  ball: { until: number; leader: boolean; hop: boolean } | null;
  /** 主人正在陪它玩（逗猫棒）到什么时候 */
  wandUntil: number;
  /** 正占着哪件家具的第几个位置 */
  station: string | null; slot: number; selfPlayAt: number;
  /** 想用的家具现在满了：先在旁边等，空出来再过去 */
  want: { kind: string; since: number } | null;
}

export interface SceneHooks { onPet(id: string): void; onObject(kind: ObjectKind, id?: string): void; onZone(index: number): void; onEdit?(kind: string | null): void; onBgEdit?(done: boolean): void; /** 布置房间时：选中了哪件装饰（null = 没选中），或者摆放被拒绝的原因 */ onDecor?(id: string | null, msg?: string): void }
interface EditBox { sp: Sprite; frame: Graphics; handle: Graphics; label: Text }

export class Scene {
  app = new Application();
  private world = new Container();
  private fill = new Graphics();
  private bgLayer = new Container();
  private objects = new Container();
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
  private ballX: number | null = null; private ballY: number | null = null;
  /** 布置房间：装饰可以拖动 */
  decorMode = false; decorSelected: string | null = null;
  /** 布置房间时选中的固定家具（换皮肤用） */
  furnSelected: string | null = null; private roomSig = '';
  private decorSprites = new Map<string, Sprite>(); private decorArt = new Map<string, HTMLCanvasElement | null>();
  private decorDrag: { id: string; gx: number; gy: number; x: number; y: number; moved: boolean } | null = null; private decorBox = new Graphics();
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
    this.glow.blendMode = 'add'; this.shade.blendMode = 'multiply';
    this.decorBox.eventMode = 'none';
    this.world.addChild(this.fill, this.bgLayer, this.weather, this.objects, this.frontLayer, this.shade, this.glow, this.overlay, this.decorBox, this.debug);
    this.objects.sortableChildren = true;
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
    return !!this.roomPic(`room.zone.${ZONES[i].id}`) || (!!this.roomPic('room.strip') && i < ASSETS.room.strip.coverZones);
  }
  /** 现在这套房间风格的背景图；这一套没有图片时用默认那一套的 */
  private room() { return sim.roomOf(this.game.state); }
  private roomPic(key: string) { return this.assets.getSkinned(key, this.room());
  }

  /** 素材变了之后重建所有贴图 */
  rebuildArt() {
    this.bgLayer.removeChildren().forEach((c) => c.destroy());
    this.clearObjects();
    this.textures.forEach((t) => t.destroy(true)); this.textures = []; this.objSprites.clear(); this.objArt.clear(); this.objSig = '';

    const strip = this.roomPic('room.strip'); const room = this.room(); this.roomSig = room;
    recompute(strip);
    const env = this.env(); this.envSig = this.envKey(env);
    const cover = Math.min(N, ASSETS.room.strip.coverZones);
    this.stripSprite = strip ? new Sprite(this.tex(strip)) : null;
    if (this.stripSprite) this.bgLayer.addChild(this.stripSprite);
    this.zoneSprites = ZONES.map((z, i) => {
      const img = this.roomPic(`room.zone.${z.id}`);
      if (!img && strip && i < cover) return null;
      const sp = new Sprite(this.tex(img ?? drawZone(z.id, i, env, room))); this.bgLayer.addChild(sp);
      return { sp, code: !img };
    });
    this.placeArt();
    this.rebuildObjects();
    if (this.names.length) this.applyCam();
    if (this.bgMode) this.setBgMode(true);
  }

  private env(): Env { return { time: sim.dayTime(this.game.state), season: sim.season(this.game.state), weather: sim.weather(this.game.state) }; }
  private envKey(env: Env) { return env.time + env.season + env.weather; }

  /** 昼夜或季节变了：只重画代码画的那些区域（窗外、阳台、院子会变样） */
  private redrawForEnv() {
    const env = this.env();
    this.zoneSprites.forEach((z, i) => { if (z && z.code) { const old = z.sp.texture; z.sp.texture = this.tex(drawZone(ZONES[i].id, i, env, this.room())); this.textures = this.textures.filter((t) => t !== old); old.destroy(true); } });
    this.placeArt();
  }

  /** 按当前的地板线和分界线，把背景摆到位（不重画贴图，拖动时也能跟手） */
  private placeArt() {
    const W = worldW(), fy = geo.floorY;
    // 房间外面的填充：上面是天花板，下面和两边接着墙和地板的颜色
    const g = this.fill.clear();
    const rp = roomPalette(this.room());
    g.rect(-3000, -3000, W + 6000, 3000).fill(hex(rp.ceiling));
    g.rect(-3000, 0, W + 6000, fy).fill(hex(rp.wall));
    g.rect(-3000, fy, W + 6000, 3000).fill(hex(rp.floor));
    g.rect(-3000, -5, W + 6000, 5).fill({ color: hex(PALETTE.ink), alpha: 0.25 });
    // 屏幕底部往下延伸的地面：院子是草地，其他是木地板
    const env = this.env();
    ZONES.forEach((z, i) => { const c = groundColor(z.id, env, this.room()); if (c !== rp.floor && this.zoneSprites[i]?.code) g.rect(zx(i), H - 2, zw(i) + (i === N - 1 ? 3000 : 0), 3000).fill(c.startsWith('#') ? hex(c) : c); });
    // 傍晚偏暖、夜里压暗但保留暖色：整个画面乘上一个颜色（正片叠底）。屋里和室外（阳台、院子）各用各的颜色
    this.shade.clear();
    if (env.time !== 'day') {
      const tone = CONFIG.light[env.time];
      ZONES.forEach((z, i) => {
        const x0 = i === 0 ? -3000 : zx(i), x1 = i === N - 1 ? W + 3000 : zx(i + 1);
        const outdoor = OUTDOOR.includes(z.id);
        // 阳台有屋檐，木地板和屋里连着：地板以下用屋里的颜色，不然和隔壁的地板接不上
        const split = z.id === 'balcony' ? fy : outdoor ? 6000 + H : -3000;
        if (split > -3000) this.shade.rect(x0, -3000, x1 - x0, split + 3000).fill(hex(tone.outdoor));
        if (split < 6000 + H) this.shade.rect(x0, split, x1 - x0, 6000 + H - split).fill(hex(tone.indoor));
      });
    }
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
    recompute(this.roomPic('room.strip'));
    this.placeArt(); this.placeObjects();
    for (const a of this.actors.values()) { a.x = clampX(a.x); a.tx = clampX(a.tx); a.y = clampY(a.y); a.ty = clampY(a.ty); }
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

  /** 清掉家具和装饰（宠物也在这一层里，留着不动） */
  private clearObjects() { for (const c of [...this.objects.children]) if (!(c as any).isActor) c.destroy({ children: true }); }
  /** 放进前后排序的那一层。z = 脚底的位置：越大越靠前 */
  private addSorted<T extends Container>(node: T, z: number): T { node.zIndex = z; this.objects.addChild(node); return node; }

  private rebuildObjects() {
    const s = this.game.state;
    const sig = JSON.stringify([this.editMode, this.decorMode, s.decor, s.owned, s.skins, s.finds.map((f) => f.id), sim.shownSouvenirs(s), sim.shownPostcards(s).map((c) => c.id), s.pets.map((p) => p.spriteId), sim.lostPets(s).length, s.pets.some((p) => p.searchUntil !== null), s.visitors.map((v) => v.id), s.pond.map((p, i) => (p == null ? 0 : sim.pondReady(s, i) ? 2 : 1))]);
    if (sig === this.objSig) return;
    this.objSig = sig;
    this.clearObjects(); this.objSprites.clear(); this.editBoxes.clear(); this.findSprites = [];
    this.tubFront = null; this.npc = null; this.visitorSprites.clear(); this.decorSprites.clear(); this.fishes = [];

    // 装饰：墙上的和地上铺的永远在最后面；摆在地上的和家具、宠物一起按脚底的位置排前后
    if (!this.editMode) s.decor.forEach((d, i) => { const sp = this.makeDecor(d); if (!sp) return; const layer = DECOR[d.kind].layer; this.addSorted(sp, layer === 'wall' ? -3000 + i : layer === 'floor' ? -2000 + sp.y / 10 : sp.y); });
    for (const [kind, def] of Object.entries(ASSETS.objects) as [ObjectKind, ObjectDef][]) {
      if (def.needsOwned && !s.owned[def.needsOwned] && !this.editMode) continue;
      const pos = objPos(def); const zi = pos.zi;
      const skin = sim.skinOf(s, kind); const img = this.assets.getSkinned(`object.${kind}`, skin);
      // 背景图里已经画了的东西（门、浴缸、床、收藏柜、相册墙、鱼塘）：没有自己的图片时只留点击区域
      const hidden = !img && !!def.partOfBackground && this.zoneHasImage(zi);
      const artKey = `${kind}@${skin}`; if (!this.objArt.has(artKey)) this.objArt.set(artKey, drawObject(kind, skin));
      const src = img ?? (hidden ? null : this.objArt.get(artKey)!);
      const sp = new Sprite(src ? this.tex(src) : Texture.WHITE);
      const aspect = src ? src.width / src.height : objectAspect(kind);
      sp.anchor.set(0.5, 1); sp.height = def.height; sp.width = def.height * aspect; sp.position.set(pos.x, pos.y);
      if (!src) sp.alpha = 0;
      if (kind !== 'ball' || this.editMode || this.decorMode) {
        sp.eventMode = 'static'; sp.cursor = this.editMode ? 'move' : 'pointer';
        sp.on('pointertap', this.tap(() => {
          if (this.editMode) return;
          // 布置房间时点家具 = 选中它换皮肤，不打开它平时的面板
          if (this.decorMode) { this.decorSelected = null; this.furnSelected = kind; this.drawDecorBox(); this.hooks.onDecor?.(null); return; }
          this.showBubble(kind); this.hooks.onObject(kind);
        }));
        sp.on('pointerdown', (e) => this.editDown(e, kind, 'move'));
      }
      if (kind === 'ball' && this.ballX !== null && !this.editMode) { sp.x = this.ballX; sp.y = this.ballY ?? sp.y; }
      this.addSorted(sp, pos.y); this.objSprites.set(kind, sp);
      if (this.editMode) continue;

      const left = sp.x - sp.width / 2, top = sp.y - sp.height;
      if (kind === 'cabinet') sim.shownSouvenirs(s).forEach((id, i) => {
        const t = new Text({ text: SOUVENIRS[id]?.icon ?? '?', style: { fontSize: 30 } });
        t.anchor.set(0.5); t.position.set(left + sp.width * (0.26 + (i % 3) * 0.24), top + sp.height * (0.2 + Math.floor(i / 3) * 0.307));
        t.eventMode = 'none'; // 摆着的纪念品不挡点击，点到它等于点收藏柜
        this.addSorted(t, pos.y + 0.05);
      });
      // 鱼塘里的鱼：画在自己的小图层里，每帧让它来回游
      if (kind === 'pond') s.pond.forEach((p, i) => {
        if (p == null) return;
        const ready = sim.pondReady(s, i); const f = new Graphics(); const k = ready ? 1 : 0.55;
        const col = ready ? hex(PALETTE.coral) : 0xf2d2c6;
        f.ellipse(0, 0, 18 * k, 8 * k).fill(col).poly([-16 * k, 0, -28 * k, -7 * k, -28 * k, 7 * k]).fill(col).circle(10 * k, -2 * k, 1.6).fill(0x5b4634);
        f.position.set(left + sp.width * (0.3 + i * 0.2), top + sp.height * (0.42 + (i % 2) * 0.16));
        (f as any).homeX = f.x; (f as any).range = sp.width * 0.09; (f as any).phase = i * 2.1;
        f.eventMode = 'none'; this.addSorted(f, pos.y + 0.05); this.fishes.push(f);
      });
      // 浴缸的前半边单独再画一层，盖在宠物上面，这样宠物看起来是泡在浴缸里
      if (kind === 'tub' && src) {
        const base = this.tex(src); const from = def.frontFrom ?? 0.2;
        const front = new Sprite(new Texture({ source: base.source, frame: new Rectangle(0, src.height * from, src.width, src.height * (1 - from)) }));
        front.anchor.set(0.5, 1); front.width = sp.width; front.height = sp.height * (1 - from); front.position.set(sp.x, sp.y); front.visible = false;
        this.addSorted(front, pos.y + 0.2); this.tubFront = front; // 泡澡的宠物排在浴缸和这一层之间
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
          this.addSorted(ps, pos.y + 0.05);
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
      this.addSorted(n, n.y); this.npc = n;
    }
    // 院子里等着捡的小东西（邻居留下的、季节活动的）：点一下捡起来
    if (!this.editMode && !this.decorMode) s.finds.forEach((f, i) => {
      const gi = zoneIndex('garden'); if (gi < 0) return;
      const icon = FIND_KINDS[f.kind]?.icon ?? SEASON_FINDS[f.kind]?.icon ?? '✨';
      const n = new Text({ text: icon, style: { fontSize: 44 } }); n.anchor.set(0.5, 1);
      n.position.set(zx(gi) + zw(gi) * Math.max(0.05, Math.min(0.95, f.x)), Math.min(depthMax(), depthMin() + 14 + (i % 3) * 22));
      n.eventMode = 'static'; n.cursor = 'pointer'; n.hitArea = new Rectangle(-34, -60, 68, 72);
      n.on('pointertap', this.tap(() => this.hooks.onObject('find', f.id)));
      this.addSorted(n, n.y); this.findSprites.push(n);
    });
    // 访客：站在门口，头顶有个小气泡，点一下看它来干什么
    if (!this.editMode) s.visitors.forEach((v, i) => {
      const set = this.game.sprites.get(VISITORS[v.who].look); if (!set) return;
      const door = objPos(ASSETS.objects.door); const sc = PET_BASE * ASSETS.petScale * 0.95;
      const n = new Sprite(set.tex[0][0]); n.anchor.set(0.5, 0.9); n.scale.set(-sc, sc);
      n.position.set(door.x + (this.npc ? -118 - i * 90 : 118 - i * 236) * door.k, geo.floorY + (H - geo.floorY) * (0.34 + i * 0.06));
      n.eventMode = 'static'; n.cursor = 'pointer'; n.on('pointertap', this.tap(() => this.hooks.onObject('visitor', v.id)));
      const bubble = new Text({ text: v.kind === 'gift' ? '🎁' : v.kind === 'trade' ? '🔁' : '✉️', style: { fontSize: 64 } });
      bubble.anchor.set(0.5, 1); bubble.scale.set(-1 / sc * 0.42, 1 / sc * 0.42); bubble.position.set(0, -256 * 0.86); bubble.eventMode = 'none'; n.addChild(bubble);
      this.addSorted(n, n.y); this.visitorSprites.set(v.id, n);
    });
    if (this.editMode) for (const [kind, sp] of this.objSprites) {
      const frame = new Graphics(); const handle = new Graphics();
      const label = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 24, fill: 0xffffff, fontWeight: '600' } });
      frame.eventMode = 'none'; label.eventMode = 'none'; // 框和文字不接收点击，否则会挡住下面的物品
      handle.eventMode = 'static'; handle.cursor = 'nesw-resize'; handle.on('pointerdown', (e) => this.editDown(e, kind, 'size'));
      this.addSorted(frame, 1e6); this.addSorted(label, 1e6); this.addSorted(handle, 1e6);
      this.editBoxes.set(kind, { sp, frame, handle, label }); this.updateEditBox(kind);
    }
    this.drawDecorBox();
  }

  // ---------- 调整背景：拖地板线和区域分界线 ----------

  hasStrip() { return !!this.roomPic('room.strip'); }

  setBgMode(on: boolean) {
    this.bgMode = on && this.hasStrip(); this.bgDrag = null;
    this.objects.interactiveChildren = !this.bgMode;
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
    for (const a of this.actors.values()) a.root.visible = !on; this.bubble.visible = false;
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
    if (this.decorDrag) { this.decorMove(e); return; }
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
    if (this.decorDrag) { this.decorUp(); return; }
    if (!this.drag.on) return;
    this.drag.on = false; if (performance.now() - this.drag.lastT > 80) this.vel = 0;
    // 屏幕只放得下一个区域时，松手后自动对齐到最近的区域，家具不会被切掉一半
    if (this.drag.moved && this.viewW < maxZW() * 1.3) {
      const centre = this.camX + this.vel * 220 + this.viewW / 2;
      let best = 0; ZONES.forEach((_, i) => { if (Math.abs(zx(i) + zw(i) / 2 - centre) < Math.abs(zx(best) + zw(best) / 2 - centre)) best = i; });
      this.scrollToZone(best);
    }
  }
  // ---------- 房间装饰 ----------

  private makeDecor(d: { id: string; kind: string; zone: string | null; x: number; y: number }): Sprite | null {
    const def = DECOR[d.kind]; const zi = ZONES.findIndex((z) => z.id === d.zone); if (!def || zi < 0) return null;
    const skin = sim.skinOf(this.game.state, d.kind); const artKey = `${d.kind}@${skin}`;
    if (!this.decorArt.has(artKey)) this.decorArt.set(artKey, drawDecor(d.kind, skin));
    const src = this.assets.getSkinned(`decor.${d.kind}`, skin) ?? this.decorArt.get(artKey); if (!src) return null;
    const sp = new Sprite(this.tex(src)); sp.anchor.set(0.5, 1); sp.height = def.height; sp.width = def.height * (src.width / src.height);
    sp.position.set(zx(zi) + d.x, d.y);
    if (this.decorMode) { sp.eventMode = 'static'; sp.cursor = 'move'; sp.on('pointerdown', (e) => this.decorDown(e, d.id)); } else sp.eventMode = 'none';
    this.decorSprites.set(d.id, sp);
    return sp;
  }
  setDecorMode(on: boolean) { this.decorMode = on; this.decorSelected = null; this.furnSelected = null; this.decorDrag = null; this.decorBox.clear(); this.objSig = ''; this.rebuildObjects(); }
  selectDecor(id: string | null) { this.decorSelected = id; this.furnSelected = null; this.drawDecorBox(); }
  /** 新摆出来的装饰放哪：现在看着的这个区域，按种类放在墙上、地上或地毯的位置 */
  defaultDecorSpot(kind: string): { zone: string; x: number; y: number } {
    const centre = this.camX + this.viewW / 2; let zi = 0; for (let i = 0; i < N; i++) if (centre >= zx(i)) zi = i;
    const layer = DECOR[kind]?.layer; const band = H - geo.floorY; const jitter = (Math.random() - 0.5) * 80;
    return { zone: ZONES[zi].id, x: Math.max(40, Math.min(zw(zi) - 40, centre - zx(zi) + jitter)), y: layer === 'wall' ? geo.floorY - 250 : layer === 'floor' ? geo.floorY + band * 0.62 : geo.floorY + band * 0.12 };
  }
  private decorDown(e: FederatedPointerEvent, id: string) {
    if (!this.decorMode) return;
    e.stopPropagation(); const sp = this.decorSprites.get(id)!;
    this.decorDrag = { id, gx: e.global.x, gy: e.global.y, x: sp.x, y: sp.y, moved: false };
    this.decorSelected = id; this.furnSelected = null; this.drawDecorBox(); this.hooks.onDecor?.(id);
  }
  private decorMove(e: FederatedPointerEvent) {
    const d = this.decorDrag!; const sp = this.decorSprites.get(d.id); if (!sp) return;
    const kind = this.game.state.decor.find((x) => x.id === d.id)?.kind ?? ''; const layer = DECOR[kind]?.layer;
    const dx = (e.global.x - d.gx) / this.scale, dy = (e.global.y - d.gy) / this.scale; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    // 墙上的只能在墙上，地上的只能在地板上
    const [lo, hi] = layer === 'wall' ? [sp.height + 70, geo.floorY - 6] : layer === 'floor' ? [geo.floorY + sp.height * 0.7, H - 8] : [geo.floorY - 4, H - 30];
    sp.x = Math.max(20, Math.min(worldW() - 20, d.x + dx)); sp.y = Math.max(lo, Math.min(hi, d.y + dy));
    this.drawDecorBox();
  }
  private decorUp() {
    const d = this.decorDrag!; this.decorDrag = null; const sp = this.decorSprites.get(d.id); if (!sp || !d.moved) return;
    let zi = 0; for (let i = 0; i < N; i++) if (sp.x >= zx(i)) zi = i;
    const r = this.game.act((st) => sim.placeDecor(st, d.id, ZONES[zi].id, sp.x - zx(zi), sp.y));
    if (!r.ok) { sp.position.set(d.x, d.y); this.hooks.onDecor?.(d.id, r.msg); }
    this.drawDecorBox();
  }
  private drawDecorBox() {
    const g = this.decorBox.clear(); const sp = this.decorSelected ? this.decorSprites.get(this.decorSelected) : this.furnSelected ? this.objSprites.get(this.furnSelected) : null;
    if (!this.decorMode || !sp) return;
    g.roundRect(sp.x - sp.width / 2 - 6, sp.y - sp.height - 6, sp.width + 12, sp.height + 12, 10).stroke({ width: 3, color: hex(PALETTE.coral) });
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
    (root as any).isActor = true; root.visible = !this.editMode; this.objects.addChild(root); // 和家具在同一层，按脚底的位置排前后
    const x = SPOT.living - 120 + index * 70 + Math.random() * 40, y = this.homeY(index);
    return { id, root, sprite, tag, tagText, fx, x, y, lane: index, tx: x, ty: y, perch: null, hop: null, inter: null, sulkUntil: 0, dir: 1, action: 'idle', t0: this.now, until: this.now + 1500, pending: null, fast: false, ball: null, wandUntil: 0, want: null, station: null, slot: 0, selfPlayAt: -SELF_PLAY_COOLDOWN };
  }

  private setAction(a: Actor, action: ActionName, dur: number) {
    // 刚要睡下：先打个哈欠（虚弱得直接倒下的不打）
    if (action === 'sleep' && a.action !== 'sleep' && dur > 1500) a.inter = { action: 'yawn', t0: this.now, until: this.now + 1300 };
    if (a.action !== action) { a.action = action; a.t0 = this.now; }
    a.until = this.now + dur;
  }

  // ---------- 走动：左右（x）和前后（y）都能走 ----------

  /** 没有特别要去的前后位置时，每只宠物有自己习惯站的那一条，这样并排等着的时候不会叠在一起 */
  private homeY(lane: number) { return clampY(depthMin() + 16 + lane * (H - geo.floorY) * 0.1); }
  /** 鱼塘是水，不能踩进去：走到它的左右范围里时只能待在它后面的岸上。返回在这个 x 上，脚底最靠前能到哪 */
  private depthLimit(x: number): number {
    const sp = this.objSprites.get('pond'); if (!sp || this.editMode) return depthMax();
    const out = Math.max(sp.x - sp.width / 2 - x, x - (sp.x + sp.width / 2), 0); const back = Math.max(depthMin(), sp.y - sp.height - 6);
    return out >= 60 ? depthMax() : back + (out / 60) * (depthMax() - back);
  }
  /** 屏幕正中间对应房间里的哪个位置 */
  private viewCenter() { return (this.app.screen.width / 2 - this.world.x) / this.scale; }
  private isOutdoor(x: number) { return OUTDOOR.includes(ZONES[zoneAt(x)]?.id); }
  /** 可以挨着睡的同伴：正在地上睡觉、离得不太远，而且关系够好（冬天怕冷，不管关系） */
  private napBuddy(a: Actor): Actor | null {
    const s = this.game.state; const winter = sim.season(s) === 'winter';
    return [...this.actors.values()].find((o) => o !== a && o.action === 'sleep' && !o.perch && !o.hop && !this.far(o) && Math.abs(o.x - a.x) < zw(2) * 2 && !this.isOutdoor(o.x)
      && (winter || sim.friendship(s, a.id, o.id) >= CONFIG.friendship.close) && ![...this.actors.values()].some((q) => q !== a && q !== o && Math.abs(q.x - o.x) < 90 && Math.abs(q.y - o.y) < 20)) ?? null;
  }
  /** 主人回来了。离开得够久：在家的宠物跑到屏幕中间站起来迎接；离开太久：黏人的那只（没有就是心情最差的）背对着你闹脾气 */
  greet(awayMs: number) {
    const s = this.game.state; if (awayMs < CONFIG.greet.after || this.editMode) return;
    const free = [...this.actors.values()].filter((a) => { const p = this.game.pet(a.id); return p && !sim.isWeak(p) && !this.busy(a.id) && p.food >= CONFIG.stats.lowThreshold; });
    let sulker: Actor | null = null;
    if (awayMs >= CONFIG.greet.sulkAfter && free.length) {
      const pets = free.map((a) => this.game.pet(a.id)!); const pick = pets.find((p) => p.trait === 'clingy') ?? [...pets].sort((m, n) => m.mood - n.mood)[0];
      sulker = this.actors.get(pick.id) ?? null;
      if (sulker) { this.release(sulker); sulker.pending = null; sulker.inter = null; this.stop(sulker); sulker.sulkUntil = this.now + CONFIG.greet.sulkFor; sulker.until = this.now; }
    }
    if (sim.dayTime(s) === 'night') return; // 夜里都睡了，不起来迎接
    const cx = this.isOutdoor(this.viewCenter()) && sim.weather(s) === 'rain' ? SPOT.living : this.viewCenter();
    free.filter((a) => a !== sulker).forEach((a, i) => { this.release(a); a.inter = null; this.go(a, cx + (i - (free.length - 1) / 2) * 96, depthMax() - 10 - (i % 2) * 14); a.fast = true; a.pending = { action: 'beg', dur: 2800 }; });
  }
  private lastFrameReal = 0; private greeted = false;
  private findSprites: Text[] = [];

  // ---------- 邻居猫：来串门的那只 ----------
  private guest: { id: string; root: Container; sprite: Sprite; x: number; y: number; tx: number; ty: number; dir: 1 | -1; action: ActionName; t0: number; until: number; step: 'enter' | 'meet' | 'snack' | 'roam' | 'leave'; buddy: string | null; did: number } | null = null;
  /** 邻居的做派：麻薯爱蹭饭和打盹，大黑爱打闹，花卷见谁都舔 */
  private static GUEST_STYLE: Record<string, { meet: [ActionName, ActionName]; rest: ActionName }> = {
    mochi: { meet: ['groom', 'groom'], rest: 'sleep' }, dahei: { meet: ['play', 'play'], rest: 'sit' }, huajuan: { meet: ['groom', 'happy'], rest: 'lick' },
  };
  private updateGuest(dt: number) {
    const s = this.game.state; const now = s.hood.now; let g = this.guest;
    const exitX = worldW() - 10;
    if (this.editMode) { if (g) g.root.visible = false; return; }
    if (now && !g) {
      const set = this.game.sprites.get(NEIGHBORS[now.id]?.look ?? ''); if (!set) return;
      const root = new Container(); const sprite = new Sprite(set.tex[0][0]); sprite.anchor.set(0.5, 0.9); root.addChild(sprite);
      const tag = new Text({ text: NEIGHBORS[now.id].name, style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fill: 0x5a4636, fontWeight: '700', stroke: { color: 0xfffaf0, width: 5 } } }); tag.anchor.set(0.5, 1); tag.eventMode = 'none'; root.addChild(tag);
      sprite.eventMode = 'static'; sprite.cursor = 'pointer'; const id = now.id; sprite.on('pointertap', this.tap(() => this.hooks.onObject('neighbor', id)));
      (root as any).isActor = true; this.objects.addChild(root);
      // 从院子最右边走进来（刚打开游戏时它已经来了一阵，就直接出现在客厅）
      const fresh = s.clock - now.arrivedAt < 20_000;
      g = this.guest = { id: now.id, root, sprite, x: fresh ? exitX : SPOT.living + 60, y: depthMin() + 30, tx: SPOT.living + 60, ty: depthMin() + 40, dir: -1, action: 'walk', t0: this.now, until: 0, step: 'enter', buddy: null, did: 0 };
      (g as any).tag = tag;
    }
    if (!g) return;
    g.root.visible = true;
    const set = this.game.sprites.get(NEIGHBORS[g.id]?.look ?? ''); if (!set) return;
    const style = Scene.GUEST_STYLE[g.id] ?? Scene.GUEST_STYLE.dahei;
    const goTo = (x: number, y: number) => { g!.tx = clampX(x); g!.ty = Math.min(clampY(y), this.depthLimit(g!.tx)); };
    // 该走了（串门时间到了，或者存档里已经没有它了）：往院子外面走，走到头就消失
    if ((!now || now.id !== g.id) && g.step !== 'leave') { g.step = 'leave'; g.tx = exitX + 60; g.ty = depthMin() + 24; g.until = 0; }
    const far = Math.abs(g.tx - g.x) > 4 || Math.abs(g.ty - g.y) > 4;
    if (far) {
      const dx = g.tx - g.x, dy = g.ty - g.y, dist = Math.hypot(dx, dy); if (Math.abs(dx) > 2) g.dir = dx > 0 ? 1 : -1;
      const step = Math.min(dist, (g.step === 'leave' || g.step === 'enter' ? 170 : 105) * (dt / 1000));
      g.x += (dx / dist) * step; g.y += (dy / dist) * step; if (g.step !== 'leave') g.y = Math.min(g.y, this.depthLimit(g.x));
      if (g.action !== 'walk') { g.action = 'walk'; g.t0 = this.now; }
    } else if (g.step === 'leave') {
      g.root.destroy({ children: true }); this.guest = null; return;
    } else if (g.until === 0) {
      // 走到了：开始做这一步的事
      const act = (a: ActionName, ms: number) => { g!.action = a; g!.t0 = this.now; g!.until = this.now + ms; };
      if (g.step === 'meet' && g.buddy) {
        const b = this.actors.get(g.buddy); const p = b ? this.game.pet(b.id) : null;
        if (b && p && !b.station && !b.pending && !b.perch && !b.hop && !sim.isWeak(p) && Math.abs(b.x - g.x) < 150) {
          g.dir = b.x >= g.x ? 1 : -1; b.dir = g.dir === 1 ? -1 : 1; b.inter = null; this.stop(b);
          act(style.meet[0], 6000); this.setAction(b, style.meet[1], 6000);
          if (sim.neighborMeet(s, b.id)) { this.game.touch(); this.floatText(b.id, `和${NEIGHBORS[g.id].name}玩 · 心情 +${CONFIG.neighbors.playMood}`); }
        } else act('idle', 900);
      } else if (g.step === 'snack') { g.dir = -1; act('eat', 5000); sim.neighborSnack(s); }
      else act(g.step === 'enter' ? 'beg' : style.rest, g.step === 'enter' ? 2200 : 5000 + Math.random() * 4000);
    } else if (this.now >= g.until) {
      // 这一步做完了，想想下一步：先找还没一起玩过的宠物，再去饭碗蹭一口，之后随便待着
      g.until = 0; g.did++;
      const free = [...this.actors.values()].filter((a) => { const p = this.game.pet(a.id); return p && !sim.isWeak(p) && !a.station && !a.pending && !a.perch && !a.hop && a.sulkUntil < this.now && !this.isOutdoor(a.x) && !this.busy(a.id) && a.action !== 'sleep'; });
      const fresh = free.filter((a) => !now?.met.includes(a.id));
      if (fresh.length && Math.random() < 0.8) { const b = fresh.sort((m, n) => Math.abs(m.x - g!.x) - Math.abs(n.x - g!.x))[0]; g.step = 'meet'; g.buddy = b.id; this.stop(b); this.setAction(b, 'idle', 9000); goTo(b.x + (g.x < b.x ? -78 : 78), b.y + 2); }
      else if (now && !now.ate && (g.id === 'mochi' || Math.random() < 0.5)) { const bowl = objPos(ASSETS.objects.bowl); g.step = 'snack'; goTo(bowl.x + 138 * bowl.k, bowl.y + 16); }
      else if (free.length && Math.random() < 0.35) { const b = free[Math.floor(Math.random() * free.length)]; g.step = 'meet'; g.buddy = b.id; this.stop(b); this.setAction(b, 'idle', 9000); goTo(b.x + (g.x < b.x ? -78 : 78), b.y + 2); }
      else { g.step = 'roam'; const z = 1 + Math.floor(Math.random() * 4); goTo(zx(z) + zw(z) * (0.2 + Math.random() * 0.6), depthMin() + 10 + Math.random() * (depthMax() - depthMin() - 10)); }
    }
    const sc = PET_BASE * ASSETS.petScale * 0.95;
    g.sprite.texture = set.tex[rowFor(set, g.action)][frameIndex(g.action, this.now - g.t0)];
    g.sprite.scale.set(sc * g.dir, sc); g.root.position.set(g.x, g.y); g.root.zIndex = g.y;
    (g as any).tag.position.set(0, -256 * sc * 0.8);
  }
  private go(a: Actor, x: number, y: number = this.homeY(a.lane)) { a.tx = clampX(x); a.ty = Math.min(clampY(y), this.depthLimit(a.tx)); }
  private stop(a: Actor) { a.tx = a.x; a.ty = a.y; }
  private far(a: Actor) { return Math.abs(a.tx - a.x) > 4 || Math.abs(a.ty - a.y) > 4; }

  // ---------- 家具的位置 ----------

  /** 一件家具（或者窗台这样的落脚点）现在在哪：中心 x、底边 y、宽高。不在房间里就是 null。玩具球会被带着跑，用它现在的位置 */
  private anchor(kind: string): { x: number; y: number; w: number; h: number; k: number } | null {
    const spot = ASSETS.perches[kind];
    if (spot) { const zi = zoneIndex(spot.zone); const k = zw(zi) / BASE_ZW; return { x: zx(zi) + spot.x * k, y: spot.y + geo.floorY - BASE_FY, w: 0, h: 0, k }; }
    const sp = this.objSprites.get(kind), def = ASSETS.objects[kind]; if (!sp || !def) return null;
    const pos = objPos(def); const ball = kind === 'ball' && this.ballX !== null;
    return { x: ball ? this.ballX! : pos.x, y: ball ? this.ballY ?? pos.y : pos.y, w: sp.width, h: sp.height, k: pos.k };
  }
  /** 用这件家具的第几个位置时，脚站在地上的哪里（要跳上去的家具：这里是起跳的地方） */
  private floorSpot(kind: string, slot: number): [number, number] | null {
    const A = this.anchor(kind), st = STATIONS[kind]?.[slot]; if (!A || !st) return null;
    const x = clampX(A.x + st.dx * A.k); const y = st.at != null ? A.y - A.h * st.at : depthMin() + 4 + slot * 7;
    return [x, Math.min(clampY(y), this.depthLimit(x))];
  }
  /** 跳上去之后脚在哪；z = 排前后用的位置（比家具自己靠前一点点）。浴缸按遮挡线算：下巴大约在浴缸边沿 */
  private perchSpot(kind: string, slot: number, sc: number): { x: number; y: number; z: number } | null {
    const A = this.anchor(kind), st = STATIONS[kind]?.[slot]; if (!A || !st?.perch) return null;
    if (kind === 'tub') { const rim = A.y - A.h * (1 - (ASSETS.objects.tub.frontFrom ?? 0.2)); return { x: A.x + st.dx * (A.w / 260), y: rim + (0.9 * 256 - 152) * sc, z: A.y + 0.1 }; }
    return { x: A.x + st.perch[0] * A.w, y: A.y - st.perch[1] * A.h, z: A.y + 0.3 + slot * 0.01 };
  }

  /** 去占一件家具的位置。满了、或者这件家具现在不在房间里，就返回 false。want = 只要这一个位置。
   *  猫爬架：主人指定了谁的那一层，只有那一只能用。 */
  private reserve(a: Actor, kind: string, want?: number): boolean {
    const slots = STATIONS[kind]; if (!slots || !this.anchor(kind)) return false;
    const taken = new Set([...this.actors.values()].filter((o) => o !== a && o.station === kind).map((o) => o.slot));
    const owner = kind === 'cattree' ? this.game.state.cattree : null;
    const free = (k: number) => k >= 0 && k < slots.length && !taken.has(k) && (!owner?.[k] || owner[k] === a.id);
    // 已经待在这件家具上：优先留在原来的位置，不用跳下来再跳上去
    const order = want != null ? [want] : [...(a.perch?.kind === kind ? [a.perch.slot] : []), ...slots.map((_, k) => k)];
    const i = order.find(free); if (i === undefined) return false;
    const spot = this.floorSpot(kind, i)!;
    a.station = kind; a.slot = i; a.tx = spot[0]; a.ty = spot[1];
    return true;
  }
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
    if (this.reserve(a, kind)) return;
    const A = this.anchor(kind); if (!A) return;
    a.want = { kind, since: this.now }; this.go(a, A.x + (a.x < A.x ? -1 : 1) * (210 + a.lane * 26) * A.k);
  }

  /** 让一只宠物去做某个动作（主人喂食、洗澡、玩耍时调用）。会走到对应的家具旁边；镜头跟着它。 */
  perform(petId: string, action: ActionName, follow = true) {
    const a = this.actors.get(petId); if (!a) return;
    // 待在沙发、床、猫爬架上被摸：不用跳下来
    if (!(action === 'happy' && a.perch && a.perch.kind !== 'tub')) this.release(a);
    a.pending = null; a.want = null; this.stop(a); a.wandUntil = 0; a.inter = null;
    if (a.sulkUntil > this.now) { a.sulkUntil = 0; if (action === 'happy') this.floatText(petId, '哼……原谅你了'); }
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
    const was = a.perch;
    this.release(a); // 上一件事做完了，把位置让出来
    const near = (x: number) => Math.abs(a.x - x) < 40;
    const goNear = (kind: string, dx: number) => { const pos = objPos(ASSETS.objects[kind]); return clampX(pos.x + dx * pos.k); };
    /** 跳到一件家具上待着（床、沙发、猫爬架、窗台）。没位置就返回 false */
    const lounge = (kind: string, action: ActionName, dur: number, want?: number) => { if (!this.reserve(a, kind, want)) return false; a.pending = { action, dur }; return true; };
    /** 主人在猫爬架上给它指定的那一层（没有就是 -1） */
    const mine = s.owned.cattree ? s.cattree.indexOf(p.id) : -1;
    const night = sim.dayTime(s) === 'night';
    a.fast = false;
    const low = CONFIG.stats.lowThreshold;
    const rain = sim.weather(s) === 'rain'; const outside = this.isOutdoor(a.x);
    if (a.sulkUntil > this.now) {
      // 闹脾气：背对着屏幕中间坐着不理人，直到被摸一下
      a.dir = a.x < this.viewCenter() ? -1 : 1; this.setAction(a, 'sit', 4000);
    } else if (rain && outside) {
      // 下雨了：在外面的赶紧跑回屋里
      a.fast = true; this.go(a, zx(2) + zw(2) * (0.2 + Math.random() * 0.6), depthMin() + Math.random() * (depthMax() - depthMin()));
    } else if (p.food < low) {
      // 饿了：去饭碗旁边蹲着等
      const spot = goNear('bowl', -150 - a.lane * 30);
      if (near(spot)) { a.dir = 1; this.setAction(a, 'idle', 3000); } else this.go(a, spot);
    } else if (s.owned.feeder && p.food < CONFIG.stats.feederFoodFloor + 12 && Math.random() < 0.4 && this.reserve(a, 'bowl')) {
      // 自动喂食机出粮了：自己去吃两口
      a.pending = { action: 'eat', dur: 5000 };
    } else if (night) {
      // 晚上：先睡自己在猫爬架上的那一层；没有就上床、上沙发；都满了在床边的地上睡
      if (was && was.kind !== 'tub' && lounge(was.kind, 'sleep', 9000, was.slot)) { /* 已经睡在床、沙发、猫爬架或窗台上了：接着睡，不换地方 */ }
      else if (mine >= 0 && lounge('cattree', 'sleep', 9000, mine)) { /* 睡在自己的位置 */ }
      else if (lounge('bed', 'sleep', 9000) || lounge('sofa', 'sleep', 9000)) { /* 睡在床上或沙发上 */ }
      else { const spot = goNear('bed', 170 + a.lane * 26); if (near(spot)) this.setAction(a, 'sleep', 9000); else this.go(a, spot); }
    } else if (p.clean < low) {
      // 脏了：去浴缸旁边等，一边自己舔毛
      const spot = goNear('tub', -170 - a.lane * 24);
      if (near(spot)) this.setAction(a, 'lick', 3200); else this.go(a, spot);
    } else if (p.clean < low + 15 && Math.random() < 0.4) {
      this.setAction(a, 'lick', 3200);
    } else {
      const r = Math.random();
      // 自己找乐子：猫抓板、玩具球，鱼塘里有鱼的时候还会去岸边用爪子捞鱼。
      // 三样共用一个冷却时间，位置被占了就不去，所以不会卡在里面，也不会挤在一起。
      const fun = [...(s.owned.scratcher ? ['scratcher'] : []), ...(s.owned.ball ? ['ball'] : []), ...(s.pond.some((x) => x != null) ? ['pond'] : [])].sort(() => Math.random() - 0.5);
      const rest = (): ActionName => (['idle', 'sleep', 'lick'] as ActionName[])[Math.floor(Math.random() * 3)];
      const trait = p.trait;
      const sleeper = this.napBuddy(a);
      if (was && LOUNGE.includes(was.kind) && Math.random() < 0.4 && lounge(was.kind, was.kind.endsWith('Window') ? 'sit' : 'idle', between(D.perch), was.slot)) { /* 还想在上面再待一会儿 */ }
      // 下雨天爱趴在窗台上看雨
      else if (rain && Math.random() < 0.35 && ['kitchenWindow', 'bedroomWindow'].sort(() => Math.random() - 0.5).some((k) => lounge(k, 'sit', between(D.perch) * 1.5))) { /* 看雨 */ }
      // 性格：贪吃的没事就去饭碗边站起来讨吃的；爱干净的动不动就舔毛；黏人的走到屏幕中间坐下看着你
      else if (trait === 'glutton' && Math.random() < 0.2) { this.go(a, goNear('bowl', -110 - a.lane * 26), objPos(ASSETS.objects.bowl).y + 6); a.pending = { action: 'beg', dur: 3200 }; }
      else if (trait === 'tidy' && Math.random() < 0.2) this.setAction(a, 'lick', 3600);
      else if (trait === 'clingy' && Math.random() < 0.2 && !this.isOutdoor(this.viewCenter())) { this.go(a, this.viewCenter() + (a.lane - 2) * 60, depthMax() - 14 - a.lane * 6); a.pending = { action: 'sit', dur: 5000 }; }
      // 关系好的（冬天不管关系）白天也爱挨着睡
      else if (sleeper && Math.random() < 0.3) { this.go(a, sleeper.x + (a.x < sleeper.x ? -66 : 66), sleeper.y + 3); a.pending = { action: 'sleep', dur: 7000 + Math.random() * 4000 }; }
      else if (mine >= 0 && Math.random() < 0.4 && lounge('cattree', rest(), between(D.perch), mine)) { /* 回自己在猫爬架上的位置 */ }
      else if (fun.length && r > 0.78 && this.now - a.selfPlayAt > SELF_PLAY_COOLDOWN && fun.some((k) => this.reserve(a, k))) {
        a.selfPlayAt = this.now;
        a.pending = a.station === 'ball' ? { action: 'play', dur: between(D.ball), ball: true } : a.station === 'pond' ? { action: 'fish', dur: between(D.fish) } : { action: 'scratch', dur: between(D.scratcher) };
      } else if (r < 0.4) {
        // 随便走走：客厅去得多一些，也会自己走到阳台和院子里
        // 爱冒险的更爱往外跑；下雨天谁都不出门
        const inside = ZONES.map((_, i) => i).filter((i) => !OUTDOOR.includes(ZONES[i].id)), out = ZONES.map((_, i) => i).filter((i) => OUTDOOR.includes(ZONES[i].id));
        const pool = rain ? inside : trait === 'adventurer' && Math.random() < 0.5 && out.length ? out : ZONES.map((_, i) => i);
        const z = Math.random() < (trait === 'adventurer' ? 0.2 : 0.45) ? 2 : pool[Math.floor(Math.random() * pool.length)];
        this.go(a, zx(z) + zw(z) * (0.14 + Math.random() * 0.72), depthMin() + Math.random() * (depthMax() - depthMin()));
      } else if (r < 0.6 && [...LOUNGE].sort(() => Math.random() - 0.5).some((k) => lounge(k, k.endsWith('Window') ? 'sit' : rest(), between(D.perch)))) { /* 跳到沙发、床、窗台或猫爬架上待一会儿 */ }
      else if (r < 0.68) this.setAction(a, 'sleep', 5000 + Math.random() * 4000);
      else this.setAction(a, 'idle', 2000 + Math.random() * 3500);
    }
  }

  /** 两只闲着的宠物凑在一起玩。有玩具球就一起去玩球，没有就在原地闹一会儿。 */
  private tryCompanionPlay() {
    const s = this.game.state;
    const free = [...this.actors.values()].filter((a) => !a.pending && !a.station && !a.perch && !a.hop && !this.far(a) && a.action === 'idle' && this.now - a.selfPlayAt > SELF_PLAY_COOLDOWN);
    const ok = free.filter((a) => { const p = this.game.pet(a.id); return p && !sim.isWeak(p) && p.mood >= 30 && p.food >= CONFIG.stats.lowThreshold; });
    if (ok.length < 2 || Math.random() > 0.3) return;
    const a = ok[0]; const b = ok.slice(1).sort((m, n) => Math.abs(m.x - a.x) - Math.abs(n.x - a.x))[0];
    if (Math.abs(a.x - b.x) > zw(2) * 1.5) return; // 离得太远就算了
    const close = sim.friendship(s, a.id, b.id) >= CONFIG.friendship.close;
    if (close && Math.random() < 0.6) {
      // 关系好：一只走到另一只身边，给它舔毛（被舔的眯着眼享受），或者互相蹭头
      const nuzzle = Math.random() < 0.45; const side = a.x < b.x ? -1 : 1;
      this.release(a); this.release(b); this.stop(b); b.dir = side === -1 ? -1 : 1; this.setAction(b, 'idle', 9000);
      this.go(a, b.x + side * 74, b.y + 2); a.pending = { action: 'groom', dur: nuzzle ? 3600 : 5600, meet: b.id, partner: nuzzle ? 'groom' : 'happy' };
    }
    else if (s.owned.ball && this.reserve(a, 'ball') && this.reserve(b, 'ball')) { const dur = between(D.ball); a.pending = { action: 'play', dur, ball: true }; b.pending = { action: 'play', dur, ball: true }; }
    else { this.release(a); this.release(b); this.stop(a); this.stop(b); a.dir = a.x < b.x ? 1 : -1; b.dir = a.dir === 1 ? -1 : 1; this.setAction(a, 'play', 6000); this.setAction(b, 'play', 6000); }
    a.selfPlayAt = b.selfPlayAt = this.now;
    sim.companionPlay(s, a.id, b.id); this.game.touch();
  }

  /** 新买了一件家具：让一两只闲着的宠物走过去看看 */
  private curiosity(kind: string) {
    const sp = this.objSprites.get(kind); if (!sp) return;
    const idle = [...this.actors.values()].filter((a) => !a.pending && !a.station && !sim.isWeak(this.game.pet(a.id)!)).slice(0, 2);
    idle.forEach((a, i) => { this.go(a, sp.x + (i ? 80 : -80), Math.max(sp.y + 8, depthMin() + 10 + i * 12)); a.fast = true; a.pending = { action: 'happy', dur: 2400 }; });
    if (idle.length) this.follow = { id: idle[0].id, until: this.now + 5000 };
  }

  /** 天黑了，灯的周围画一圈暖色光晕：买了的吊灯和床头灯、摆出来的落地灯和小夜灯。
   *  光跟着物品走，物品挪到哪光到哪；没买、没摆出来的灯不会亮。 */
  private drawGlow(env: Env) {
    const g = this.glow.clear(); if (env.time === 'day') return;
    const G = CONFIG.light.glow; const strength = G.strength * (env.time === 'night' ? 1 : G.duskStrength); const color = hex(G.color);
    const lit: [number, number][] = [];
    for (const [kind, sp] of this.objSprites) { const light = ASSETS.objects[kind]?.light; if (light && sp.alpha !== 0) lit.push([sp.x - sp.width / 2 + sp.width * light[0], sp.y - sp.height + sp.height * light[1]]); }
    for (const d of this.game.state.decor) { const sp = this.decorSprites.get(d.id), light = DECOR[d.kind]?.light; if (sp && light) lit.push([sp.x - sp.width / 2 + sp.width * light[0], sp.y - sp.height + sp.height * light[1]]); }
    const n = 26;
    for (const [x, y] of lit) {
      // 很多层很淡的圆叠起来：越靠近灯越亮，边缘慢慢淡出，看不出一圈一圈；光稍微往下落一点
      for (let i = n; i >= 1; i--) { const r = G.radius * Math.pow(i / n, 1.5); g.circle(x, y + r * 0.2, r).fill({ color, alpha: strength / n }); }
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
      for (const y of [depthMin(), depthMax()]) g.moveTo(0, y).lineTo(worldW(), y).stroke({ width: 1, color: 0x9b59d0, alpha: 0.5 }); // 宠物能走的前后范围
      for (let i = 0; i <= N; i++) g.moveTo(zx(i), 0).lineTo(zx(i), H).stroke({ width: 1, color: 0x9b59d0, alpha: 0.5 });
      for (const [kind, sp] of this.objSprites) {
        const def = ASSETS.objects[kind]; const l = sp.x - sp.width / 2, t = sp.y - sp.height;
        g.rect(l, t, sp.width, sp.height).stroke({ width: 2, color: 0x2f7fd0 });
        label('o:' + kind, def.label + (sp.alpha === 0 ? '（只有点击范围）' : ''), l + 3, t + 2, 0x2f7fd0);
        if (def.frontFrom != null) { const y = t + sp.height * def.frontFrom; g.moveTo(l - 12, y).lineTo(l + sp.width + 12, y).stroke({ width: 3, color: 0xf08a24 }); label('f:' + kind, '遮挡线', l + sp.width + 14, y - 8, 0xf08a24); }
        if (def.light) g.circle(l + sp.width * def.light[0], t + sp.height * def.light[1], 7).fill(0xf5c518).stroke({ width: 2, color: 0x7a5a00 });
      }
      // 站位：绿点 = 站在地上（或起跳）的位置；跳上去的家具再连一条线到落脚点（青色）
      for (const [kind, slots] of Object.entries(STATIONS)) slots.forEach((st, i) => {
        const f = this.floorSpot(kind, i); if (!f) return; const [x, y] = f;
        const taken = [...this.actors.values()].some((a) => a.station === kind && a.slot === i);
        g.circle(x, y, 7).fill(taken ? 0x1f8a3a : 0x6fd08a).stroke({ width: 2, color: 0x0f5a22 }).moveTo(x, y).lineTo(x + st.dir * 26, y).stroke({ width: 3, color: 0x0f5a22 });
        const pt = this.perchSpot(kind, i, PET_BASE * ASSETS.petScale); if (pt) g.moveTo(x, y).lineTo(pt.x, pt.y).stroke({ width: 2, color: 0x1aa7b8, alpha: 0.8 }).circle(pt.x, pt.y, 6).fill(0x1aa7b8);
      });
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
    const rain = env.weather === 'rain';
    // 下雨：院子和阳台上的雨丝，还有屋里窗玻璃上的雨丝。冬天不下雨，改成雪下得更大
    if (rain && env.season !== 'winter') {
      const t = this.now / 1000, x0 = zx(first) + 18, w = worldW() - x0, bottom = geo.floorY + 110;
      for (let i = 0; i < 90; i++) {
        const x = x0 + ((i * 97.3 + t * 60) % w), y = ((i * 53.7 + t * (520 + (i % 5) * 40)) % bottom);
        if (zoneAt(x) === first && y > 430) continue;
        g.moveTo(x, y).lineTo(x - 5, y + 20).stroke({ width: 1.6, color: 0xdfeaf2, alpha: 0.75 });
      }
      for (const win of ASSETS.windows) {
        const zi = zoneIndex(win.zone); if (zi < 0 || !this.zoneSprites[zi]) continue; const k = zw(zi) / BASE_ZW, oy = geo.floorY - BASE_FY;
        for (let i = 0; i < 12; i++) {
          const x = zx(zi) + (win.x + ((i * 37.1 + t * 14) % win.w)) * k, y = oy + win.y + ((i * 29.3 + t * (190 + (i % 4) * 30)) % (win.h - 16));
          g.moveTo(x, y).lineTo(x - 2, y + 13).stroke({ width: 1.4, color: 0xe6f0f6, alpha: 0.8 });
        }
      }
      return;
    }
    const kind = env.season === 'spring' ? 'petal' : env.season === 'autumn' ? 'leaf' : env.season === 'winter' ? 'snow' : env.time === 'night' ? 'firefly' : '';
    if (!kind) return;
    const x0 = zx(first) + 18, x1 = worldW(), w = x1 - x0, top = 40, bottom = geo.floorY + 60; const t = this.now / 1000;
    for (let i = 0; i < (rain && kind === 'snow' ? 90 : 34); i++) {
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
    if (this.room() !== this.roomSig) this.rebuildArt(); // 换了房间风格：背景整套重画
    if (this.envKey(env) !== this.envSig) { this.envSig = this.envKey(env); this.redrawForEnv(); }
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

    // 主人回来了（刚打开，或者从后台切回来隔了一阵）：迎接一下
    const real = Date.now(); const gap = this.lastFrameReal ? real - this.lastFrameReal : 0; this.lastFrameReal = real;
    if (!this.greeted && this.actors.size) { this.greeted = true; this.greet(this.game.awayMs); } else if (gap > 60_000) this.greet(gap);

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
      const sc = PET_BASE * ASSETS.petScale * CONFIG.growth.stageScale[sim.stageOf(p)];
      if (a.inter && this.now >= a.inter.until) a.inter = null;
      if (a.inter && !weak) { /* 正在打哈欠或伸懒腰：做完再说 */ }
      else if (a.hop) {
        // 正在跳上或跳下家具：跳完再做别的
        if (this.now - a.hop.t0 >= HOP_MS) { a.perch = a.hop.up ? { kind: a.hop.kind, slot: a.hop.slot } : null; a.hop = null; }
      } else if (a.perch && (weak || a.station !== a.perch.kind || a.slot !== a.perch.slot)) {
        // 要离开这件家具了（事情做完了、被叫去吃饭洗澡）：先跳下来
        a.hop = { t0: this.now, up: false, kind: a.perch.kind, slot: a.perch.slot }; a.t0 = this.now;
      } else if (weak) { a.pending = null; a.want = null; this.stop(a); this.release(a); this.setAction(a, 'sleep', 1000); }
      else if (this.far(a)) {
        const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > 2) a.dir = dx > 0 ? 1 : -1;
        const step = Math.min(dist, (a.fast ? 520 : a.ball ? 230 : 95) * (dt / 1000));
        a.x += (dx / dist) * step; a.y += (dy / dist) * step;
        a.y = Math.min(a.y, this.depthLimit(a.x)); // 路过鱼塘时从它后面绕
        if (a.action !== 'walk') { a.action = 'walk'; a.t0 = this.now; }
      } else if (a.ball && !a.pending) {
        // 追球：跑一段，扑一下，再跑。时间到了球就留在原地
        if (this.now >= a.ball.until) { this.release(a); this.setAction(a, 'idle', 1500); }
        else if (!a.ball.hop) { a.ball.hop = true; this.setAction(a, 'play', 1100); }
        else if (this.now >= a.until) {
          a.ball.hop = false;
          const lo = zx(1) + 80, hi = zx(Math.min(N, 5)) - 80; // 只在屋里跑，不出阳台
          if (a.ball.leader) this.go(a, Math.max(lo, Math.min(hi, a.x + (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 200))), depthMin() + 20 + Math.random() * (depthMax() - depthMin() - 20));
          else { const lead = [...this.actors.values()].find((o) => o.ball?.leader); if (lead) this.go(a, Math.max(lo, Math.min(hi, lead.tx - lead.dir * 84)), lead.ty + 8); else this.stop(a); }
          if (!this.far(a)) this.setAction(a, 'play', 900);
        }
      } else if (a.pending && a.want && this.now - a.want.since < 40_000 && !this.reserve(a, a.want.kind)) {
        // 位置还被占着：面朝家具等一等（最多等 40 秒，再等不到就原地做）
        const pos = objPos(ASSETS.objects[a.want.kind]); a.dir = pos.x >= a.x ? 1 : -1;
        if (a.action !== 'idle') { a.action = 'idle'; a.t0 = this.now; }
      } else if (a.pending && a.want && a.station) {
        a.want = null; // 空出来了，走过去（下一帧开始走）
      } else if (a.pending) {
        a.want = null;
        const st = a.station ? STATIONS[a.station][a.slot] : null;
        if (st?.perch && !(a.perch && a.perch.kind === a.station && a.perch.slot === a.slot) && this.perchSpot(a.station!, a.slot, sc)) {
          // 走到家具跟前了：先跳上去，落稳了再开始做动作
          a.dir = st.dir; a.hop = { t0: this.now, up: true, kind: a.station!, slot: a.slot }; a.t0 = this.now;
        } else {
          // 到位了：转向家具，开始做动作
          if (st) a.dir = st.dir;
          if (a.pending.ball && a.station === 'ball') { a.ball = { until: this.now + a.pending.dur, leader: ![...this.actors.values()].some((o) => o !== a && o.ball?.leader), hop: true }; this.setAction(a, 'play', 1100); }
          else this.setAction(a, a.pending.action, a.pending.dur);
          if (a.pending.meet) {
            // 走到同伴身边了：两只面对面，同伴做它那一半的动作
            const b = this.actors.get(a.pending.meet);
            if (b && !b.station && !b.pending && Math.abs(b.x - a.x) < 140) { a.dir = b.x >= a.x ? 1 : -1; b.dir = a.dir === 1 ? -1 : 1; b.inter = null; this.setAction(b, a.pending.partner ?? 'happy', a.pending.dur); }
            else this.setAction(a, 'idle', 800); // 同伴走开了，算了
          }
          if (a.wandUntil) a.wandUntil = a.until;
          a.pending = null; a.fast = false;
        }
      }
      else if (this.now >= a.until) {
        const wasAsleep = a.action === 'sleep';
        if (a.action === 'walk') { a.action = 'idle'; a.t0 = this.now; } this.think(a);
        // 睡醒了要去做别的：先伸个懒腰（接着睡的不伸）
        if (wasAsleep && (a.pending as Actor['pending'])?.action !== 'sleep' && !(a.action === 'sleep' && this.now < a.until)) a.inter = { action: 'stretch', t0: this.now, until: this.now + 1150 }; if (!this.far(a) && this.now >= a.until && !a.pending) this.setAction(a, 'idle', 1200); // 已经定好下一件事（比如接着睡）就不要先站起来一下
      }
      else if (a.action === 'walk') { a.action = 'idle'; a.t0 = this.now; }

      // 画在哪：平时在地板上；在家具上就用家具的落脚点；跳上跳下时沿一条弧线过去
      let px = a.x, py = a.y, z = a.y; let shown: ActionName = a.action;
      const on = a.hop ?? a.perch; const spot = on ? this.perchSpot(on.kind, on.slot, sc) : null;
      if (a.hop && spot) {
        const t0 = Math.min(1, (this.now - a.hop.t0) / HOP_MS), t = a.hop.up ? t0 : 1 - t0, e = t * t * (3 - 2 * t);
        px = a.x + (spot.x - a.x) * e; py = a.y + (spot.y - a.y) * e - Math.sin(Math.PI * t) * 46;
        // 跳的时候排在前面；进浴缸的后半程要落到浴缸前面那一层的后面
        z = a.hop.kind === 'tub' && t > 0.5 ? spot.z : Math.max(a.y, spot.z); shown = 'jump';
        if (Math.abs(spot.x - a.x) > 6) a.dir = (spot.x > a.x) === a.hop.up ? 1 : -1;
      } else if (a.perch && spot) { px = spot.x; py = spot.y; z = spot.z; }
      else if (on) { a.perch = null; a.hop = null; } // 家具不在了（收起来了、进了调整模式）：回到地上
      if (spot && on!.kind === 'tub') bathing = true;
      if (a.inter && !a.hop) shown = a.inter.action;
      // 跳跃的四帧跟着跳的进度走（蹲、蹬、腾空、落地），不是按时间循环
      const frame = a.hop ? Math.min(3, Math.floor(((this.now - a.hop.t0) / HOP_MS) * 4)) : frameIndex(shown, this.now - (a.inter ? a.inter.t0 : a.t0));
      a.sprite.texture = set.tex[rowFor(set, shown)][frame];
      a.sprite.scale.set(sc * a.dir, sc);
      a.sprite.alpha = weak ? 0.75 : 1;
      a.root.position.set(px, py); a.root.zIndex = z;

      // 头顶的小提示
      const low = CONFIG.stats.lowThreshold;
      const text = weak ? '虚弱' : a.sulkUntil > this.now ? '哼' : p.food < low ? '饿' : p.clean < low ? '脏' : p.mood < low ? '闷' : '';
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
      if (a.action === 'groom' && !a.inter) { // 给同伴舔毛、蹭头：头顶飘一颗小爱心
        const ph = (this.now / 1200) % 1, hx = a.dir * 96 * sc, hy = -210 * sc - ph * 26, al = 1 - ph;
        a.fx.circle(hx - 5, hy, 6).fill({ color: 0xf2788a, alpha: al }).circle(hx + 5, hy, 6).fill({ color: 0xf2788a, alpha: al }).poly([hx - 10, hy + 3, hx + 10, hy + 3, hx, hy + 14]).fill({ color: 0xf2788a, alpha: al });
      }
      if (a.action === 'fish' && a.station === 'pond' && !a.hop) {
        // 在鱼塘边用爪子捞鱼：溅起来的水珠和一圈圈水纹。站在后面岸上的两只，水花在它们脚前面（往下一点）
        const down = a.slot === 0 ? 0 : 26;
        for (let k = 0; k < 5; k++) {
          const ph = (this.now / 700 + k * 0.23) % 1;
          a.fx.circle(a.dir * (62 + k * 9) * sc, down - 12 * sc - Math.sin(ph * Math.PI) * (24 + k * 6) * sc, 3 + (k % 2) * 1.5).fill({ color: 0xd6ecf5, alpha: 0.95 * (1 - ph) });
        }
        const rp = (this.now / 900) % 1;
        a.fx.ellipse(a.dir * 80 * sc, down + 4, (12 + rp * 26) * sc, (4 + rp * 7) * sc).stroke({ width: 2, color: 0xffffff, alpha: 0.85 * (1 - rp) });
      }
      if (a.action === 'bath') {
        for (let k = 0; k < 7; k++) {
          const ph = (this.now / 900 + k * 0.37) % 1;
          a.fx.circle(Math.sin(k * 2.4) * 60 * sc * 1.4, -20 - ph * 150 * sc * 1.3 - (k % 3) * 14, 6 + (k % 3) * 4).fill({ color: 0xffffff, alpha: 0.85 * (1 - ph) }).stroke({ width: 2, color: 0x8fc3da, alpha: 1 - ph });
        }
      }
    });

    this.updateGuest(dt);
    if (this.tubFront) this.tubFront.visible = bathing;

    // 玩具球：被带着跑的时候跟在带球那只的脚前面，一蹦一蹦；没人玩就留在原地
    const ballSp = this.objSprites.get('ball');
    if (ballSp && !this.editMode) {
      const lead = [...this.actors.values()].find((o) => o.ball?.leader);
      const base = objPos(ASSETS.objects.ball);
      if (lead) { this.ballX = lead.x + lead.dir * 62; this.ballY = lead.y + 6; ballSp.x += (this.ballX - ballSp.x) * Math.min(1, dt / 90); ballSp.y = this.ballY - Math.abs(Math.sin(this.now / 160)) * 16; }
      else { if (this.ballX !== null) ballSp.x = this.ballX; ballSp.y = this.ballY ?? base.y; }
      ballSp.zIndex = this.ballY ?? base.y;
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
