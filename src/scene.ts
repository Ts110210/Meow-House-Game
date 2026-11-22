// 房间画面：一个可以左右滑动的长房间，9 个区域，宠物自己在里面活动。
// 前后关系：家具、摆在地上的装饰、宠物都放在同一层里，按「脚底的位置」排序——脚底越靠下（离镜头越近）越盖在前面。
// 背景和物品都是贴图：有图片就用图片（见 assets.config.ts），没有就用 art/room.ts 里代码画的占位图。
import 'pixi.js/unsafe-eval';
import { TREASURES } from './config';
import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from 'pixi.js';
import { ASSETS, type ObjectDef } from './assets.config';
import type { AssetStore } from './assets';
import { drawObject, drawTop, drawWindowView, drawZone, groundColor, objectAspect, roomPalette, skyFor, type Env } from './art/room';
import { renderPostcard } from './art/postcard';
import { CONFIG, DECOR, PALETTE, SOUVENIRS, SPRITE, VISITORS, ZONES, type ActionName , NEIGHBORS, FIND_KINDS, SEASON_FINDS } from './config';
import { drawDecor } from './art/decor';
import type { Game } from './game';
import { BASE_FY, BASE_ZW, bg, bgCfg, geo, recompute } from './geo';
import * as sim from './sim';
import { lampShadow, lightAt, lightDir, lightMap, sunShadow, type Light, type LightSource, type Occluder } from './light';
import { extraFrame, frameIndex, rowFor } from './sprites';

export type ObjectKind = 'neighbor' | 'find' | 'gift' | 'ladder' | 'deckEdge' | 'hooks' | 'umbrella' | 'kitchenWindow' | 'bedroomWindow' | 'kitchenShelf' | 'mirror' | 'bathShelf' | 'towel' | 'shelfRack' | 'chair' | 'tree' | 'fence' | 'door' | 'bowl' | 'tub' | 'bed' | 'cabinet' | 'album' | 'pond' | 'scratcher' | 'feeder' | 'ball' | 'sofa' | 'counter' | 'nightstand' | 'bedlamp' | 'pendantDoor' | 'pendantShelf' | 'cattree' | 'npc' | 'visitor';

/** 家具的位置：每件家具能同时容纳几只、各自在哪、脸朝哪边。
 *  有位置才过去，位置满了就不去挤，所以不会重叠，也不会互相打断。
 *  dx = 离家具中心多远（按 432 宽的区域算）；
 *  at = 站在地上时，脚底在家具底边往上多少（按家具高度的比例；负数 = 在家具前面）。不写 = 贴着墙根；
 *  perch = 跳到家具上：落脚点在图片里的位置 [横向 −0.5…0.5，从底边往上 0…1]。先走到 dx 的位置，再跳上去。 */
interface Station { dx: number; dir: 1 | -1; at?: number; perch?: [number, number];
  /** 吃饭的位置：把嘴对准家具的「嘴要对准的那一块」（assets.config 的 mouth）里的这一点 [横向 0–1, 纵向 0–1]。
   *  纵向可以是负数（高过碗沿）。back = 一定站在家具后面，脚底至少比家具底边靠后这么多（从后面探头吃，家具挡住它的下半身）。有 eat 时 dx、at 不用 */
  eat?: { at: [number, number]; back?: number }; /** 钻到里面去（纸箱、洗衣篮、隧道）：排在家具和它「前面一层」之间 */ inside?: boolean }
const STATIONS: Record<string, Station[]> = {
  // 饭碗：最多三只一起吃。左边一只、右边一只，嘴伸进碗口；第三只站在碗后面探头吃
  bowl: [{ dx: 0, dir: 1, eat: { at: [0.14, 0.6] } }, { dx: 0, dir: -1, eat: { at: [0.86, 0.6] } }, { dx: 0, dir: 1, eat: { at: [0.5, -0.5], back: 12 } }],
  feeder: [{ dx: 0, dir: 1, eat: { at: [0.18, 0.45] } }], // 自动喂食机：一次只能一只在出粮口吃，其他的排队
  tub: [{ dx: -44, dir: 1, perch: [-0.17, 0] }, { dx: 44, dir: -1, perch: [0.17, 0] }], // 浴缸够大，两只可以一起泡（位置按遮挡线另算）
  bed: [{ dx: -62, dir: 1, perch: [-0.22, 0.5] }, { dx: 20, dir: 1, perch: [0.06, 0.5] }, { dx: 98, dir: -1, perch: [0.34, 0.5] }], // 床上能睡三只
  sofa: [{ dx: -64, dir: 1, perch: [-0.25, 0.33] }, { dx: 36, dir: -1, perch: [0.13, 0.33] }], // 沙发上两只
  cattree: [{ dx: -40, dir: 1, perch: [-0.24, 0.862] }, { dx: 46, dir: -1, perch: [0.25, 0.547] }, { dx: -30, dir: 1, perch: [-0.2, 0.232] }], // 猫爬架：顶层、中层、底层
  kitchenWindow: [{ dx: 0, dir: 1, perch: [0, 0.05] }], // 窗台（窗户图片最下面那一条）：一次一只，看外面
  bedroomWindow: [{ dx: 0, dir: -1, perch: [0, 0.05] }],
  chair: [{ dx: -70, dir: 1, perch: [-0.05, 0.59] }], // 阳台的小椅子：一次一只，趴着睡或者蹲着看外面
  scratcher: [{ dx: -50, dir: 1, at: -0.03 }], // 猫抓板一次一只
  ball: [{ dx: -46, dir: 1, at: -0.1 }, { dx: 46, dir: -1, at: -0.1 }], // 玩具球可以两只一起玩
  box: [{ dx: -78, dir: 1, perch: [0, 0.05], inside: true }], // 纸箱里一只，只露出脑袋
  basket: [{ dx: -74, dir: 1, perch: [0, 0.08], inside: true }], // 洗衣篮里一只
  tunnel: [{ dx: -140, dir: 1, perch: [0.37, 0.03], inside: true }], // 隧道：从左边钻进去，脑袋从右边洞口探出来
  counter: [{ dx: -128, dir: 1, perch: [0, 0.768] }], // 橱柜台面上一只
  cabinet: [{ dx: -124, dir: 1, perch: [0, 1] }], // 收藏柜顶上一只
  catgrass: [{ dx: 48, dir: -1, at: -0.1 }], // 猫草盆旁边啃草
  autoball: [{ dx: -52, dir: 1, at: -0.2 }, { dx: 52, dir: -1, at: -0.2 }], // 追自动逗猫球，最多两只
  heater: [{ dx: 92, dir: -1, at: -0.04 }, { dx: 158, dir: -1, at: -0.2 }, { dx: 124, dir: -1, at: -0.42 }], // 围着暖炉，最多三只
  butterfly: [{ dx: -34, dir: 1, at: 0 }, { dx: 44, dir: -1, at: 0 }], // 院子里扑蝴蝶
  pond: [{ dx: -178, dir: 1, at: 0.45 }, { dx: -72, dir: 1, at: 1.12 }, { dx: 72, dir: -1, at: 1.12 }], // 鱼塘边捞鱼：左边一只、后面两只，都在岸上
};
/** 猫会自己跳上去待着的地方（猫爬架另算：可以指定谁待在哪一层） */
/** 露天的区域：下雨时宠物不去 */
const OUTDOOR: string[] = ['balcony', 'garden'];
const LOUNGE = ['sofa', 'bed', 'kitchenWindow', 'bedroomWindow', 'chair', 'cattree', 'box', 'basket', 'tunnel', 'counter', 'cabinet'];
/** 钻进去只露出脑袋的那几样：在里面只会待着或者睡，不舔毛 */
const HIDEY = ['box', 'basket', 'tunnel'];
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
/** 「最初设计」的猫在画面里的缩放：身高约为门高的 petHeightOfDoor。实际的猫再乘自己的大小（sim.bodySize） */
// ---------- 屋顶那一层：画在地面这一层的正上方（世界坐标 y 从 -720 到 0） ----------
// 上层图的坐标（u）每 432 对应下面一个区域；区域宽度变了（背景长图），上层跟着每一段拉伸
const RF = ASSETS.roof;
/** 有整张图时上下两层用同一套横向对齐（线性）；否则上层每 432 对应一个区域 */
const TOP_W = 8 * BASE_ZW;
const topToWorld = (u: number) => { if (bg.full && geo.strip) return geo.strip.x + (u / TOP_W) * geo.strip.w; const i = Math.max(0, Math.min(N - 1, Math.floor(u / BASE_ZW))); return zx(i) + (u - i * BASE_ZW) * (zw(i) / BASE_ZW); };
const worldToTop = (x: number) => { if (bg.full && geo.strip) return ((x - geo.strip.x) / geo.strip.w) * TOP_W; const i = zoneAt(x); return i * BASE_ZW + (x - zx(i)) * (BASE_ZW / zw(i)); };
/** 屋顶上 u 这个位置，猫的脚底在上层图里的高度，和那一段的坡度（弧度，画的时候猫跟着歪） */
function roofWalk(u: number): { y: number; tilt: number } {
  const w = RF.walk; u = Math.max(w[0][0], Math.min(w[w.length - 1][0], u));
  for (let i = 1; i < w.length; i++) if (u <= w[i][0] || i === w.length - 1) {
    const [x0, y0] = w[i - 1], [x1, y1] = w[i]; const t = (u - x0) / (x1 - x0 || 1);
    const k = zw(Math.max(0, Math.min(N - 1, Math.floor(u / BASE_ZW)))) / BASE_ZW;
    return { y: y0 + (y1 - y0) * t, tilt: Math.atan2(y1 - y0, (x1 - x0) * k) };
  }
  return { y: w[0][1], tilt: 0 };
}
/** 屋顶在世界里的右边（= 院子的左边）；屋顶那一层左右滑只能滑到这里 */
const roofW = () => { const g = zoneIndex('garden'); return g > 0 ? zx(g) : worldW(); };

/** 最大的成年猫（公猫的上限，0.9）：算家具站位时用 */
const ADULT_MAX = CONFIG.growth.adultSize.m[1];
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
  pending: { action: ActionName; dur: number; ball?: boolean; meet?: string; partner?: ActionName; dish?: string; /** 要上屋顶：走到梯子底下就开始爬，数字 = 看星星的第几个位置 */ roof?: number } | null;
  /** 正在去吃（或正在吃）的那份罐头、便当 */
  dishId?: string; fast: boolean;
  /** 正在追球：到什么时候为止、是不是带球的那只、刚跑到位要不要先扑一下 */
  ball: { until: number; leader: boolean; hop: boolean } | null;
  /** 主人正在陪它玩（逗猫棒）到什么时候 */
  wandUntil: number;
  /** 正占着哪件家具的第几个位置 */
  station: string | null; slot: number; selfPlayAt: number;
  /** 想用的家具现在满了：先在旁边等，空出来再过去 */
  want: { kind: string; since: number } | null;
  /** 正在爬梯子（上屋顶或下来）。stay = 上去之后看星星看多久，slot = 看星星的第几个位置 */
  climb?: { t0: number; up: boolean; stay: number; slot: number } | null;
  /** 在屋顶上：u = 在上层图里的位置，tu = 要走去哪；home = 要回去了（走回梯子爬下来） */
  roof?: { u: number; tu: number; slot: number; home: boolean; slept: boolean; stay: number } | null;
}

export interface SceneHooks { /** 抓拍到了一个瞬间 */ onMoment?(id: string): void; onPet(id: string): void; onObject(kind: ObjectKind, id?: string): void; onZone(index: number): void; onEdit?(kind: string | null): void; onBgEdit?(done: boolean): void; /** 布置房间时：选中了哪件装饰（null = 没选中），或者摆放被拒绝的原因 */ onDecor?(id: string | null, msg?: string): void }
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
  /** 能钻进去的家具的「前面一层」：有宠物在里面时才显示，盖在宠物身上 */
  /** 窗外的风景：每扇窗户后面一张，win = 窗户本身（拖动调整时跟着走） */
  private windowViews: { box: Container; sp: Sprite; rain: Graphics; win: Sprite; glass: [number, number, number, number]; sig: string }[] = [];
  private fronts = new Map<string, Sprite>(); private npc: Sprite | null = null; private visitorSprites = new Map<string, Sprite>(); private fishes: Graphics[] = [];
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
  /** 光影（在背景上面、物品下面）：影子一层（接触阴影、室外的太阳影子），窗户光一层（叠加变亮） */
  private lightLayer = new Container(); private shadowLayer = new Container(); private winLayer = new Container();
  private shadowPool: Sprite[] = []; private contactTex: Texture | null = null; private winTex: Texture[] = [];
  private lightSig = ''; private light: Light = lightAt(12, 'clear');
  /** 超高：光照图（正片叠底盖在整个画面上）和这一刻的光源 */
  private lightMapSp = new Sprite(); private lightMapTex: Texture | null = null; private lightSrc: LightSource[] = [];
  /** 超高：投在家具上的影子（和家具在同一层，按脚底排前后）；每件家具朝光面的亮、背光面的暗 */
  private objShadowPool: Sprite[] = [];
  private rims: { key: string; lit: Sprite; dark: Sprite; tex: Texture[] }[] = [];
  private objSprites = new Map<string, Sprite>();
  private objArt = new Map<string, HTMLCanvasElement | null>();
  private zoneSprites: ({ sp: Sprite; code: boolean } | null)[] = [];
  private camX = 0; private camTarget: number | null = null; private vel = 0;
  /** 现在看的是哪一层：地面（屋里、阳台、院子）还是屋顶。lift = 镜头往上抬了多少（0 = 地面，720 = 屋顶），切换时慢慢抬 */
  layer: 'ground' | 'roof' = 'ground'; private lift = 0; private baseY = 0;
  private topSprites: Sprite[] = []; private topCode = true; private roofNext = 0;
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
    this.lightLayer.eventMode = 'none'; this.winLayer.blendMode = 'add'; this.lightMapSp.blendMode = 'multiply'; this.lightMapSp.eventMode = 'none'; this.lightMapSp.visible = false; this.lightLayer.addChild(this.shadowLayer, this.winLayer);
    this.decorBox.eventMode = 'none';
    this.world.addChild(this.fill, this.bgLayer, this.lightLayer, this.weather, this.objects, this.frontLayer, this.shade, this.lightMapSp, this.glow, this.overlay, this.decorBox, this.debug);
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
    return bg.full || !!this.roomPic(`room.zone.${ZONES[i].id}`) || (!!this.roomPic('room.strip') && i < ASSETS.room.strip.coverZones);
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

    const room = this.room(); this.roomSig = room;
    // 整张图：切成上下两半，下半张当长图（盖住 8 个区域），上半张当上面一层
    const full = this.roomPic('room.full'); bg.full = !!full; this.fullPic = full ?? null;
    const strip = this.activeStrip();
    recompute(this.stripSize());
    const env = this.env(); this.envSig = this.envKey(env);
    const cover = Math.min(N, bgCfg().coverZones);
    // 整张图的下半张，或者长图：按原图的清晰度做贴图（太大的切成小块）
    const half = full ? Math.round(full.height / 2) : 0;
    this.stripArt = full ? this.tiled(full, full.height - half, half) : strip ? this.tiled(strip, 0, strip.height) : null;
    if (this.stripArt) this.bgLayer.addChild(this.stripArt.c);
    this.zoneSprites = ZONES.map((z, i) => {
      const img = bg.full ? null : this.roomPic(`room.zone.${z.id}`);
      if (!img && strip && i < cover) return null;
      const sp = new Sprite(this.tex(img ?? drawZone(z.id, i, env, room))); this.bgLayer.addChild(sp);
      return { sp, code: !img };
    });
    // 上面那一层：有上层图就切成 8 段（每段在一个区域的正上方），没有就用代码画
    const top = this.roomPic('room.top'); this.topCode = !top && !full;
    this.fullTop = full ? this.tiled(full, 0, half) : null; this.topSprites = [];
    if (this.fullTop) this.bgLayer.addChild(this.fullTop.c);
    else this.topSprites = ZONES.map((_, i) => { const sp = new Sprite(this.tex(top ? this.topPiece(top, i) : drawTop(i * BASE_ZW, BASE_ZW, env, room))); this.bgLayer.addChild(sp); return sp; });
    this.placeArt();
    this.rebuildObjects();
    if (this.names.length) this.applyCam();
    if (this.bgMode) this.setBgMode(true);
  }

  private fullPic: HTMLCanvasElement | HTMLImageElement | null = null;
  /** 背景长图（或整张图的下半张）、整张图的上半张：c 里是切好的小块，w、h = 原图那一段的像素大小 */
  private stripArt: { c: Container; w: number; h: number } | null = null;
  private fullTop: { c: Container; w: number; h: number } | null = null;
  /** 图片从 y0 开始、高 h 的一段，切成每块不超过 CONFIG.room.maxTexture 的小块，按原图像素摆在一个容器里。
   *  每块往右、往下多带 2 像素，盖住下一块边上的接缝 */
  private tiled(img: HTMLCanvasElement | HTMLImageElement, y0: number, h: number) {
    const c = new Container(); const M = CONFIG.room.maxTexture, PAD = 2, w = img.width;
    const nx = Math.ceil(w / M), ny = Math.ceil(h / M), tw = Math.ceil(w / nx), th = Math.ceil(h / ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = i * tw, y = j * th; const cw = Math.min(w - x, tw + (i < nx - 1 ? PAD : 0)), ch = Math.min(h - y, th + (j < ny - 1 ? PAD : 0));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d')!.drawImage(img, x, y0 + y, cw, ch, 0, 0, cw, ch);
      const t = this.tex(cv);
      // 大图缩小看（全屋视图）时不闪：生成多级缩小图
      if (t.source) { t.source.autoGenerateMipmaps = true; t.source.mipLevelCount = Math.floor(Math.log2(Math.max(cv.width, cv.height))) + 1; t.source.updateMipmaps?.(); }
      const sp = new Sprite(t); sp.position.set(x, y); c.addChild(sp);
    }
    return { c, w, h };
  }
  /** 把切好的一段摆到世界里 (x, y)，拉成 w×h */
  private placeTiled(t: { c: Container; w: number; h: number }, x: number, y: number, w: number, h: number) { t.c.position.set(x, y); t.c.scale.set(w / t.w, h / t.h); }
  /** 现在当「长图」用的那张：整张图的下半张，或者长图 */
  private activeStrip() { return this.fullPic ?? this.roomPic('room.strip'); }
  /** 算地板线、分界线用的长图大小：整张图一律按 ASSETS.room.full.size 的下半张算（多大的图都一样，对齐不用重来） */
  private stripSize() { const s = ASSETS.room.full.size; return this.fullPic ? { width: s[0], height: s[1] / 2 } : this.roomPic('room.strip') ?? null; }
  /** 上层图的第 i 段（横向 8 等分） */
  private topPiece(img: HTMLCanvasElement | HTMLImageElement, i: number): HTMLCanvasElement {
    const cw = img.width / N, cv = document.createElement('canvas'); cv.width = Math.round(cw); cv.height = img.height;
    cv.getContext('2d')!.drawImage(img, i * cw, 0, cw, img.height, 0, 0, cw, img.height); return cv;
  }

  private env(): Env { return { time: sim.dayTime(this.game.state), season: sim.season(this.game.state), weather: sim.weather(this.game.state) }; }
  private envKey(env: Env) { return env.time + env.season + env.weather; }

  /** 昼夜或季节变了：只重画代码画的那些区域（窗外、阳台、院子会变样） */
  private redrawForEnv() {
    const env = this.env();
    const swap = (sp: Sprite, cv: HTMLCanvasElement) => { const old = sp.texture; sp.texture = this.tex(cv); this.textures = this.textures.filter((t) => t !== old); old.destroy(true); };
    this.zoneSprites.forEach((z, i) => { if (z && z.code) swap(z.sp, drawZone(ZONES[i].id, i, env, this.room())); });
    if (this.topCode) this.topSprites.forEach((sp, i) => swap(sp, drawTop(i * BASE_ZW, BASE_ZW, env, this.room())));
    this.placeArt();
  }

  /** 按当前的地板线和分界线，把背景摆到位（不重画贴图，拖动时也能跟手） */
  private placeArt() {
    const W = worldW(), fy = geo.floorY;
    // 房间外面的填充：上面是天花板，下面和两边接着墙和地板的颜色
    const g = this.fill.clear();
    const rp = roomPalette(this.room());
    const env = this.env();
    // 上层图再往上（很高的屏幕才看得到）接着天空
    g.rect(-3000, -3000 - H, W + 6000, 3000 + 2).fill(hex(skyFor(env)));
    g.rect(-3000, -H, W + 6000, H).fill(hex(rp.ceiling));
    g.rect(-3000, 0, W + 6000, fy).fill(hex(rp.wall));
    g.rect(-3000, fy, W + 6000, 3000).fill(hex(rp.floor));
    g.rect(-3000, -5, W + 6000, 5).fill({ color: hex(PALETTE.ink), alpha: 0.25 });
    // 屏幕底部往下延伸的地面：院子是草地，其他是木地板
    ZONES.forEach((z, i) => { const c = groundColor(z.id, env, this.room()); if (c !== rp.floor && this.zoneSprites[i]?.code) g.rect(zx(i), H - 2, zw(i) + (i === N - 1 ? 3000 : 0), 3000).fill(c.startsWith('#') ? hex(c) : c); });
    this.drawShade();
    if (this.stripArt && geo.strip) this.placeTiled(this.stripArt, geo.strip.x, 0, geo.strip.w, H);
    // 整张图的上半张和下半张用同一套横向位置；否则上层每一段在对应区域的正上方
    if (this.fullTop && geo.strip) this.placeTiled(this.fullTop, geo.strip.x, -H, geo.strip.w, H);
    else this.topSprites.forEach((sp, i) => { sp.position.set(zx(i), -H); sp.width = zw(i); sp.height = H; });
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
    recompute(this.stripSize());
    this.placeArt(); this.placeObjects();
    for (const a of this.actors.values()) { a.x = clampX(a.x); a.tx = clampX(a.tx); a.y = clampY(a.y); a.ty = clampY(a.ty); }
    this.applyCam();
  }

  private labelFor(kind: string): string {
    const s = this.game.state;
    if (kind === 'door') return s.trips.length ? `门 · 出门中 ×${s.trips.length}` : '门 · 派宠物出门';
    if (kind === 'cabinet') return `收藏柜 ${Object.keys(s.souvenirs).length}/${Object.keys(SOUVENIRS).length}`;
    if (kind === 'ladder') return '木梯子 · 通往屋顶';
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
    const sig = JSON.stringify([this.editMode, this.decorMode, sim.season(s), s.decor, s.owned, s.skins, s.finds.map((f) => f.id), s.gifts.map((g) => g.id), sim.shownSouvenirs(s), sim.shownPostcards(s).map((c) => c.id), s.pets.map((p) => p.spriteId), sim.lostPets(s).length, s.pets.some((p) => p.searchUntil !== null), s.visitors.map((v) => v.id), s.pond.map((p, i) => (p == null ? 0 : sim.pondReady(s, i) ? 2 : 1))]);
    if (sig === this.objSig) return;
    this.objSig = sig;
    this.clearObjects(); this.objSprites.clear(); this.editBoxes.clear(); this.findSprites = [];
    this.fronts.clear(); this.windowViews = []; this.npc = null; this.visitorSprites.clear(); this.decorSprites.clear(); this.fishes = [];

    // 装饰：墙上的和地上铺的永远在最后面；摆在地上的和家具、宠物一起按脚底的位置排前后
    if (!this.editMode) s.decor.forEach((d, i) => { const sp = this.makeDecor(d); if (!sp) return; const layer = DECOR[d.kind].layer; this.addSorted(sp, layer === 'wall' ? -3000 + i : layer === 'floor' ? -2000 + sp.y / 10 : sp.y); });
    for (const [kind, def] of Object.entries(ASSETS.objects) as [ObjectKind, ObjectDef][]) {
      if (def.needsOwned && !s.owned[def.needsOwned] && !this.editMode) continue;
      const pos = objPos(def); const zi = pos.zi;
      // 院子的大树跟着季节换图（图片名 tree-spring.png 这样），别的按皮肤
      const skin = def.seasonal ? sim.season(s) : sim.skinOf(s, kind); const img = this.assets.getSkinned(`object.${kind}`, skin);
      // 背景只画墙和地板（2026-11-18 起），家具永远单独画：没有图片就用占位图
      const hidden = false;
      const artKey = `${kind}@${skin}`; if (!this.objArt.has(artKey)) this.objArt.set(artKey, drawObject(kind, skin));
      const src = img ?? (hidden ? null : this.objArt.get(artKey)!);
      const sp = new Sprite(src ? this.tex(src) : Texture.WHITE);
      const aspect = src ? src.width / src.height : objectAspect(kind);
      sp.anchor.set(0.5, 1); sp.height = def.height; sp.width = def.height * aspect; sp.position.set(pos.x, pos.y);
      if (!src) sp.alpha = 0; else (sp as any).art = src; // 原图留着：超高光影按它的轮廓画朝光面
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
      this.addSorted(sp, def.flat ? -1000 + pos.y / 10 : pos.y); this.objSprites.set(kind, sp);
      // 窗户：玻璃是透明的，后面放一张窗外的风景（跟着昼夜、天气重画）
      if (def.glass) { const box = new Container(); const v = new Sprite(Texture.EMPTY); const rain = new Graphics(); box.addChild(v, rain); box.eventMode = 'none'; this.addSorted(box, pos.y - 0.5); this.windowViews.push({ box, sp: v, rain, win: sp, glass: def.glass, sig: '' }); }
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
      // 能钻进去的家具（浴缸、纸箱、洗衣篮、隧道）：前半边单独再画一层，盖在宠物上面，这样宠物看起来是待在里面
      if (def.frontFrom != null && src && !this.editMode) {
        const base = this.tex(src); const from = def.frontFrom;
        const front = new Sprite(new Texture({ source: base.source, frame: new Rectangle(0, src.height * from, src.width, src.height * (1 - from)) }));
        front.anchor.set(0.5, 1); front.width = sp.width; front.height = sp.height * (1 - from); front.position.set(sp.x, sp.y); front.visible = false;
        this.addSorted(front, pos.y + 0.2); this.fronts.set(kind, front); // 里面的宠物排在家具和这一层之间
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
      const door = objPos(ASSETS.objects.door); const sc = PET_BASE * ASSETS.petScale * VISITORS.tabby.size;
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
    // 猫叼回来放在门口的礼物：点一下收起来（图标是占位的表情符号）
    if (!this.editMode && !this.decorMode) s.gifts.forEach((g, i) => {
      const door = objPos(ASSETS.objects.door); const icon = TREASURES[g.kind]?.icon ?? '🎁';
      const n = new Text({ text: icon, style: { fontSize: 40 } }); n.anchor.set(0.5, 1);
      n.position.set(door.x + 70 + (i % 3) * 46, Math.min(depthMax(), depthMin() + 18 + Math.floor(i / 3) * 26));
      n.eventMode = 'static'; n.cursor = 'pointer'; n.hitArea = new Rectangle(-30, -54, 60, 64);
      n.on('pointertap', this.tap(() => this.hooks.onObject('gift', g.id)));
      this.addSorted(n, n.y); this.findSprites.push(n);
    });
    // 访客：站在门口，头顶有个小气泡，点一下看它来干什么
    if (!this.editMode) s.visitors.forEach((v, i) => {
      const set = this.game.sprites.get(VISITORS[v.who].look); if (!set) return;
      const door = objPos(ASSETS.objects.door); const sc = PET_BASE * ASSETS.petScale * VISITORS[v.who].size;
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

  hasStrip() { return !!this.roomPic('room.full') || !!this.roomPic('room.strip'); }

  setBgMode(on: boolean) {
    this.bgMode = on && this.hasStrip(); this.bgDrag = null;
    this.objects.interactiveChildren = !this.bgMode;
    this.bgLayerEdit.removeChildren().forEach((c) => c.destroy()); this.bgHandles = [];
    if (!this.bgMode) { this.objSig = ''; this.rebuildObjects(); return; }
    this.bgLines = new Graphics(); this.bgLines.eventMode = 'none'; this.bgLayerEdit.addChild(this.bgLines);
    // 0..n-1 = 分界线，最后一个 = 地板线（放在最上面，交叉的地方优先拖地板线）
    const n = bgCfg().lines.length;
    for (let i = 0; i <= n; i++) {
      const h = new Graphics(); h.eventMode = 'static'; h.cursor = i === n ? 'ns-resize' : 'ew-resize';
      h.on('pointerdown', (e) => {
        e.stopPropagation();
        this.bgDrag = { which: i, gx: e.global.x, gy: e.global.y, orig: i === n ? bgCfg().floor : bgCfg().lines[i], cam: this.camX };
      });
      this.bgLayerEdit.addChild(h); this.bgHandles.push(h);
    }
    if (!this.bgLayerEdit.parent) this.overlay.addChild(this.bgLayerEdit);
    this.drawBgEdit();
  }

  private drawBgEdit() {
    if (!this.bgMode || !geo.strip) return;
    const k = 1 / this.scale; const cfg = bgCfg(); const n = cfg.lines.length;
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
    const d = this.bgDrag!; const cfg = bgCfg(); const n = cfg.lines.length; if (!geo.strip) return;
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
    this.baseY = avail - H * this.scale; this.world.y = this.baseY + this.lift * this.scale;
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);
    // 区域名字：天花板够高就写在天花板上，否则和顶部按钮排在同一行（被按钮挡住的会隐藏）
    this.nameScreenY = this.baseY >= 88 ? 56 + (this.baseY - 56) / 2 : landscape ? 23 : 29;
    this.readHud();
    this.applyCam();
  }
  private readHud() {
    this.hudSpans = [...document.querySelectorAll('.hud-top > .pill')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [r.left - 10, r.right + 10] as [number, number]; });
  }
  relayout() { this.layout(); for (const k of this.editBoxes.keys()) this.updateEditBox(k); this.drawBgEdit(); }

  /** 能滑多远：地面是整个房子加院子，屋顶只到屋顶的右边 */
  private spanW() { return this.layer === 'roof' ? roofW() : worldW(); }
  private maxCam() { return Math.max(0, this.spanW() - this.viewW); }
  private applyCam() {
    this.camX = Math.max(0, Math.min(this.maxCam(), this.camX));
    const offset = this.viewW > this.spanW() ? (this.viewW - this.spanW()) / 2 : -this.camX;
    this.world.x = offset * this.scale; this.world.y = this.baseY + this.lift * this.scale;
    // 屋顶那一层对应底部按钮里最后的「屋顶」（编号 = 区域个数）
    const z = this.layer === 'roof' ? N : zoneAt(this.camX + this.viewW / 2);
    if (z !== this.zone) { this.zone = z; this.hooks.onZone(z); }
    const inHudRow = this.nameScreenY < 50;
    this.names.forEach((t, i) => {
      if (this.lift > 1) { t.visible = false; return; } // 在屋顶上不显示下面各个区域的名字
      t.position.set(zx(i) + zw(i) / 2, (this.nameScreenY - this.world.y) / this.scale); t.scale.set(0.5 / this.scale);
      const sx = this.world.x + t.x * this.scale, half = t.width / 2;
      t.visible = !(inHudRow && this.hudSpans.some(([l, r]) => sx + half > l && sx - half < r));
    });
  }
  /** 切到屋顶那一层：镜头往上抬，落在最右边（木梯子那里）。镜头不跟着猫走 */
  goRoof(instant = false) {
    if (this.editMode || this.decorMode || this.bgMode) return;
    this.layer = 'roof'; this.follow = null; this.vel = 0;
    this.game.act((st) => { sim.questEvent(st, 'roof'); return { ok: true }; }); // 新手引导：去屋顶看看
    const target = Math.max(0, Math.min(this.maxCam(), this.ladder().x + 40 - this.viewW)); // 梯子顶在这一屏的右边
    if (instant) { this.lift = H; this.camX = target; this.camTarget = null; } else this.camTarget = target;
    this.applyCam();
  }
  scrollToZone(i: number, instant = false) {
    if (i >= N) { this.goRoof(instant); return; }
    if (this.layer === 'roof') { this.layer = 'ground'; if (instant) this.lift = 0; }
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
    if (this.drag.moved && this.layer === 'ground' && this.viewW < maxZW() * 1.3) {
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
    const sp = new Sprite(this.tex(src)); sp.anchor.set(0.5, 1); sp.height = def.height; sp.width = def.height * (src.width / src.height); (sp as any).art = src;
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
  // ---------- 装饰的摆放规则：量出这个区域现在的样子，交给 sim.decorProblem 判断 ----------

  /** 一件装饰画出来多大（还没摆出来的也能算） */
  private decorSize(kind: string): [number, number] {
    const def = DECOR[kind]; const skin = sim.skinOf(this.game.state, kind); const artKey = `${kind}@${skin}`;
    if (!this.decorArt.has(artKey)) this.decorArt.set(artKey, drawDecor(kind, skin));
    const src = this.assets.getSkinned(`decor.${kind}`, skin) ?? this.decorArt.get(artKey); const h = def?.height ?? 80;
    return [src ? (h * src.width) / src.height : h, h];
  }
  /** 第 zi 个区域现在的样子：墙上的东西、地上家具和装饰的脚底、要留空的地方（不算 skipId 这件装饰） */
  private placeWorld(zi: number, skipId?: string): sim.PlaceWorld {
    const s = this.game.state, C = CONFIG.decor, x0 = zx(zi), fy = geo.floorY;
    const wall: sim.PlaceBox[] = [], foot: sim.PlaceBox[] = [], keepClear: sim.PlaceBox[] = [];
    const WALLISH = ['door', 'album', 'pendantDoor', 'pendantShelf'];
    for (const [kind, sp] of this.objSprites) {
      const def = ASSETS.objects[kind]; if (!def || zoneIndex(def.zone) !== zi || !sp.visible) continue;
      const l = sp.x - sp.width / 2 - x0, r = sp.x + sp.width / 2 - x0, label = def.label.split(' · ')[0];
      if (def.wall || WALLISH.includes(kind)) wall.push({ x0: l, y0: sp.y - sp.height, x1: r, y1: sp.y, label });
      if (kind === 'door') keepClear.push({ x0: l - C.doorPath[0], y0: fy, x1: r + C.doorPath[0], y1: fy + C.doorPath[1], label: '门前的路' });
      else if (!def.wall && !WALLISH.includes(kind) && kind !== 'ball' && kind !== 'autoball' && sp.y >= fy) foot.push({ x0: sp.x - sp.width * 0.45 - x0, y0: sp.y - C.furnitureDepth, x1: sp.x + sp.width * 0.45 - x0, y1: sp.y, label });
      // 猫用这件家具时站的地方（起跳、吃饭、抓板、追球…）
      (STATIONS[kind] ?? []).forEach((_, i) => { const f = this.floorSpot(kind, i); if (f) keepClear.push({ x0: f[0] - C.keepClear[0] - x0, y0: f[1] - C.keepClear[1], x1: f[0] + C.keepClear[0] - x0, y1: f[1] + C.keepClear[1], label: `${label}旁边猫要站的地方` }); });
    }
    for (const d of s.decor) {
      if (d.id === skipId || d.zone !== ZONES[zi].id) continue; const def = DECOR[d.kind]; if (!def) continue;
      const sp = this.decorSprites.get(d.id); const [w, h] = sp ? [sp.width, sp.height] : this.decorSize(d.kind);
      if (def.layer === 'wall') wall.push({ x0: d.x - w / 2, y0: d.y - h, x1: d.x + w / 2, y1: d.y, label: def.name });
      else if (def.layer === 'stand') foot.push({ x0: d.x - w * 0.4, y0: d.y - C.footDepth, x1: d.x + w * 0.4, y1: d.y, label: def.name });
    }
    return { zoneW: zw(zi), floorY: fy, height: H, wall, foot, keepClear };
  }
  /** 这件装饰摆在世界坐标 (wx, wy) 行不行：行返回区域和区域里的位置，不行返回原因 */
  private checkDecor(id: string, kind: string, wx: number, wy: number): { ok: true; zone: string; x: number; y: number } | { ok: false; msg: string } {
    let zi = 0; for (let i = 0; i < N; i++) if (wx >= zx(i)) zi = i;
    const [w, h] = this.decorSize(kind); const x = wx - zx(zi);
    const why = sim.decorProblem(kind, ZONES[zi].id, x, wy, w, h, this.placeWorld(zi, id));
    return why ? { ok: false, msg: why } : { ok: true, zone: ZONES[zi].id, x, y: wy };
  }
  /** 从收纳里摆出来：先试现在看着的这个区域的默认位置，不行就在这个区域里找最近的空位；找不到返回 null */
  findDecorSpot(id: string, kind: string): { zone: string; x: number; y: number } | null {
    const want = this.defaultDecorSpot(kind); const zi = zoneIndex(want.zone); const ok = (x: number, y: number) => this.checkDecor(id, kind, zx(zi) + x, y).ok;
    if (ok(want.x, want.y)) return want;
    const [w, h] = this.decorSize(kind); const layer = DECOR[kind]?.layer; const fy = geo.floorY;
    const [ylo, yhi] = layer === 'wall' ? [h + CONFIG.decor.wallTop, fy - CONFIG.decor.wallBottom] : layer === 'floor' ? [fy + h + 2, H] : [fy + 8, H - 4];
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = ylo; y <= yhi; y += 10) for (let x = w / 2; x <= zw(zi) - w / 2; x += 12) {
      const dd = Math.hypot(x - want.x, (y - want.y) * 1.5); if (best && dd >= best.d) continue;
      if (ok(x, y)) best = { x, y, d: dd };
    }
    return best ? { zone: want.zone, x: Math.round(best.x), y: Math.round(best.y) } : null;
  }
  /** 读档后检查一遍：位置不合规的装饰（旧版本摆的、家具挪过的）收起来，返回收了几件 */
  private decorChecked = false;
  private tidyDecor() {
    const s = this.game.state; const bad = s.decor.filter((d) => d.zone && ZONES.some((z) => z.id === d.zone) && !this.checkDecor(d.id, d.kind, zx(zoneIndex(d.zone)) + d.x, d.y).ok);
    if (!bad.length) return;
    this.game.act((st) => { for (const d of bad) sim.storeDecor(st, d.id); return { ok: true }; });
    this.hooks.onDecor?.(null, `有 ${bad.length} 件装饰的位置和家具冲突（挂到了窗户上、叠在家具后面之类），先收起来了，可以在「布置房间」里重新摆`);
  }
  private decorBad = '';

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
    const c = this.checkDecor(d.id, kind, sp.x, sp.y); this.decorBad = c.ok ? '' : c.msg; // 放不下：框变红
    this.drawDecorBox();
  }
  private decorUp() {
    const d = this.decorDrag!; this.decorDrag = null; const sp = this.decorSprites.get(d.id); if (!sp || !d.moved) return;
    const kind = this.game.state.decor.find((x) => x.id === d.id)?.kind ?? '';
    const c = this.checkDecor(d.id, kind, sp.x, sp.y); this.decorBad = '';
    const r = c.ok ? this.game.act((st) => sim.placeDecor(st, d.id, c.zone, c.x, c.y)) : { ok: false, msg: c.msg };
    if (!r.ok) { sp.position.set(d.x, d.y); this.hooks.onDecor?.(d.id, r.msg); } // 放不下：回到原来的位置，说一下原因
    this.drawDecorBox();
  }
  private drawDecorBox() {
    const g = this.decorBox.clear(); const sp = this.decorSelected ? this.decorSprites.get(this.decorSelected) : this.furnSelected ? this.objSprites.get(this.furnSelected) : null;
    if (!this.decorMode || !sp) return;
    g.roundRect(sp.x - sp.width / 2 - 6, sp.y - sp.height - 6, sp.width + 12, sp.height + 12, 10).stroke({ width: 3, color: this.decorDrag && this.decorBad ? 0xd9443a : hex(PALETTE.coral) });
    if (this.decorDrag && this.decorBad) g.roundRect(sp.x - sp.width / 2 - 6, sp.y - sp.height - 6, sp.width + 12, sp.height + 12, 10).fill({ color: 0xd9443a, alpha: 0.18 });
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
    return [...this.actors.values()].find((o) => o !== a && o.action === 'sleep' && !o.perch && !o.hop && !o.roof && !o.climb && !this.far(o) && Math.abs(o.x - a.x) < zw(2) * 2 && !this.isOutdoor(o.x)
      && (winter || sim.friendship(s, a.id, o.id) >= CONFIG.friendship.close) && ![...this.actors.values()].some((q) => q !== a && q !== o && Math.abs(q.x - o.x) < 90 && Math.abs(q.y - o.y) < 20)) ?? null;
  }
  /** 主人回来了。离开得够久：在家的宠物跑到屏幕中间站起来迎接；离开太久：黏人的那只（没有就是心情最差的）背对着你闹脾气 */
  greet(awayMs: number) {
    const s = this.game.state; if (awayMs < CONFIG.greet.after || this.editMode) return;
    const free = [...this.actors.values()].filter((a) => { const p = this.game.pet(a.id); return p && !a.roof && !a.climb && !sim.isWeak(p) && !this.busy(a.id) && p.food >= CONFIG.stats.lowThreshold; });
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

  // ---------- 罐头、便当：摆在厨房地上，吃完留下空罐、空盒，过一会儿消失 ----------
  private dishes = new Map<string, { id: string; kind: 'can' | 'feast'; owner: string; x: number; y: number; dir: 1 | -1; sp: Sprite; started: boolean; endAt: number; emptyUntil: number }>();
  private dishSeq = 0;
  private propTex(kind: string): Texture {
    const img = this.assets.get(`prop.${kind}`); if (img) return this.tex(img);
    if (!this.objArt.has(kind)) this.objArt.set(kind, drawObject(kind));
    return this.tex(this.objArt.get(kind)!);
  }
  /** 在厨房的吃饭区域里找个空地，地上摆好罐头或便当，让宠物走过去吃 */
  private serveDish(a: Actor, kind: 'can' | 'feast') {
    const area = ASSETS.eatArea; const zi = zoneIndex(area.zone); if (zi < 0) { this.reserveOrWait(a, 'bowl'); return; }
    const k = zw(zi) / BASE_ZW, oy = geo.floorY - BASE_FY; const sc = this.scaleOf(a); const [ox, oyM] = this.mouthOffset(sc); const def = ASSETS.props[kind];
    // 别人正在吃的地方（饭碗、出粮口、别的罐头便当）都要躲开
    const busy: [number, number][] = [...[...this.actors.values()].filter((o) => o !== a && o.station).map((o) => [o.tx, o.ty] as [number, number]), ...[...this.dishes.values()].map((d) => [d.x, d.y] as [number, number])];
    for (const kind2 of ['bowl', 'feeder']) { const sp = this.objSprites.get(kind2); if (sp) busy.push([sp.x - 60, sp.y], [sp.x, sp.y], [sp.x + 60, sp.y]); }
    let best: { x: number; y: number; dir: 1 | -1 } | null = null, bestGap = -1;
    for (let i = 0; i < 40; i++) {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const fx = zx(zi) + (area.x[0] + Math.random() * (area.x[1] - area.x[0])) * k, fy = clampY(area.y[0] + oy + Math.random() * (area.y[1] - area.y[0]));
      // 猫又长又高：前后错开一点没用，要左右拉开（大约一只猫的身长）才不会叠在一起
      const gap = Math.min(...busy.map(([bx, by]) => Math.max(Math.abs(bx - fx), Math.abs(by - fy) * 1.2)), 999);
      if (gap > bestGap) { bestGap = gap; best = { x: clampX(fx), y: fy, dir }; } if (gap > 130) break;
    }
    const spot = best!; const id = `dish${++this.dishSeq}`;
    // 罐头摆在嘴的正下方：嘴对准罐口
    const mx = spot.x + ox * spot.dir, my = spot.y + oyM; const h = def.height, img = this.propTex(kind); const w = (h * img.width) / img.height;
    const sp = new Sprite(img); sp.anchor.set(0.5, 1); sp.width = w; sp.height = h; sp.position.set(mx + (0.5 - def.mouth[0]) * w, my + (1 - def.mouth[1]) * h); (sp as any).isActor = true; sp.eventMode = 'none';
    this.addSorted(sp, sp.y + 0.05);
    this.dishes.set(id, { id, kind, owner: a.id, x: spot.x, y: spot.y, dir: spot.dir, sp, started: false, endAt: 0, emptyUntil: 0 });
    a.station = 'dish'; a.slot = -1; a.dishId = id; a.tx = spot.x; a.ty = spot.y;
  }
  private updateDishes() {
    for (const d of [...this.dishes.values()]) {
      const owner = this.actors.get(d.owner);
      // 吃完了（或者它被叫去做别的事了，没吃上也算吃过：饱食已经加过了）：换成空罐、空盒
      const gone = !owner || (!d.started && owner.pending?.dish !== d.id);
      if (!d.emptyUntil && ((d.started && this.now >= d.endAt) || gone)) {
        d.emptyUntil = this.now + CONFIG.eating.emptyLinger; d.sp.texture = this.propTex(d.kind === 'can' ? 'canEmpty' : 'feastEmpty');
        if (owner?.dishId === d.id) owner.dishId = undefined;
      }
      if (d.emptyUntil) {
        const left = d.emptyUntil - this.now; d.sp.alpha = Math.max(0, Math.min(1, left / CONFIG.eating.fadeMs));
        if (left <= 0) { d.sp.destroy(); this.dishes.delete(d.id); }
      }
    }
  }
  /** 这只宠物此刻在做什么（给背屏的「小剧场」用）。不在家就是 null */
  doingOf(petId: string): { action: ActionName; text: string } | null {
    const a = this.actors.get(petId); if (!a) return null;
    const where: Record<string, string> = { bed: '床上', sofa: '沙发上', cattree: '猫爬架上', kitchenWindow: '厨房的窗台上', bedroomWindow: '卧室的窗台上', chair: '阳台的椅子上', box: '纸箱里', basket: '洗衣篮里', tunnel: '隧道里', counter: '橱柜台面上', cabinet: '收藏柜顶上', tub: '浴缸里' };
    const act = a.inter?.action ?? (a.hop ? 'jump' : a.action); const at = a.perch ? where[a.perch.kind] ?? '' : '';
    const text = a.climb ? (a.climb.up ? '在爬梯子上屋顶' : '在爬梯子下来') : a.roof ? (act === 'sleep' ? '在屋顶上睡觉' : act === 'sit' ? '在屋顶上看星星' : act === 'walk' ? '在屋顶上走' : '在屋顶上') : a.sulkUntil > this.now ? '在闹脾气' : act === 'sleep' ? `在${at || '地上'}睡觉` : act === 'fish' ? (a.station === 'pond' ? '在鱼塘边捞鱼' : '在院子里扑蝴蝶') : act === 'scratch' ? '在抓猫抓板' : act === 'eat' ? (a.station === 'catgrass' ? '在啃猫草' : '在吃饭') : act === 'bath' ? '在泡澡'
      : act === 'groom' ? '在和同伴蹭来蹭去' : act === 'play' ? '在玩' : act === 'lick' ? '在舔毛' : act === 'beg' ? '站起来讨吃的' : act === 'yawn' ? '打了个哈欠' : act === 'stretch' ? '在伸懒腰' : act === 'jump' ? '跳了一下'
      : act === 'sit' ? (at ? `蹲在${at}` : '端坐着') : act === 'walk' ? '在家里走来走去' : at ? `待在${at}` : '在发呆';
    return { action: act, text };
  }
  /** 瞬间相册：每两秒看一眼家里有没有值得抓拍的画面（同一种瞬间多久拍一次由规则那边管） */
  private momentAt = 0;
  private snap(kind: string, list: Actor[], extra?: string) {
    if (!list.length) return; const m = sim.recordMoment(this.game.state, kind, list.map((a) => a.id), extra);
    if (m) { this.game.touch(); this.hooks.onMoment?.(m.id); }
  }
  private watchMoments() {
    if (this.now - this.momentAt < 2000 || this.editMode || this.decorMode) return; this.momentAt = this.now;
    const A = [...this.actors.values()]; const on = (kind: string) => A.filter((a) => a.perch?.kind === kind && !a.hop);
    if (on('bed').filter((a) => a.action === 'sleep' && !a.inter).length >= 3) this.snap('bedFull', on('bed'));
    if (on('cattree').length >= 3) this.snap('treeFull', on('cattree'));
    this.snap('fishing', A.filter((a) => a.action === 'fish' && a.station === 'pond'));
    this.snap('butterfly', A.filter((a) => a.action === 'fish' && a.station === 'butterfly'));
    this.snap('stargaze', A.filter((a) => a.roof && !a.roof.home && a.action === 'sit'));
    const groomers = A.filter((a) => a.action === 'groom' && !a.inter);
    if (groomers.length) this.snap('groom', A.filter((a) => groomers.includes(a) || (a.action === 'happy' && groomers.some((o) => Math.abs(o.x - a.x) < 130))));
    this.snap('box', on('box')); this.snap('tunnel', on('tunnel'));
    if (sim.weather(this.game.state) === 'rain') this.snap('rainWatch', [...on('kitchenWindow'), ...on('bedroomWindow')]);
    const warm = A.filter((a) => a.station === 'heater' && !this.far(a) && !a.pending); if (warm.length >= 2) this.snap('heater', warm);
    this.snap('sulk', A.filter((a) => a.sulkUntil > this.now));
  }
  /** 自动逗猫球：有宠物在追的时候一直滚；没人追时每隔一阵自己滚一小会儿，勾它们过来 */
  private rollAutoBall(_dt: number) {
    const sp = this.objSprites.get('autoball'); if (!sp || this.editMode) return;
    const pos = objPos(ASSETS.objects.autoball); const chased = [...this.actors.values()].some((a) => a.station === 'autoball');
    const active = chased || (this.now % 45_000) < 9_000;
    const target = active ? pos.x + Math.sin(this.now / 1100) * 118 * pos.k : sp.x;
    sp.x += (target - sp.x) * 0.08; sp.y = pos.y - (active ? Math.abs(Math.sin(this.now / 240)) * 5 : 0);
  }

  // ---------- 邻居猫：来串门的那只 ----------
  private guest: { id: string; root: Container; sprite: Sprite; x: number; y: number; tx: number; ty: number; dir: 1 | -1; action: ActionName; t0: number; until: number; step: 'enter' | 'meet' | 'snack' | 'roam' | 'leave'; buddy: string | null; did: number;
    /** 走屋顶那条路的（大黑、花卷）：在屋顶上走（u = 上层图里的位置，tu = 要去哪），或者在爬梯子 */
    roof?: { u: number; tu: number } | null; climb?: { t0: number; up: boolean } | null } | null = null;
  /** 邻居的做派：麻薯爱蹭饭和打盹，大黑爱打闹，花卷见谁都舔 */
  private static GUEST_STYLE: Record<string, { meet: [ActionName, ActionName]; rest: ActionName }> = {
    mochi: { meet: ['groom', 'groom'], rest: 'sleep' }, dahei: { meet: ['play', 'play'], rest: 'sit' }, huajuan: { meet: ['groom', 'happy'], rest: 'lick' },
  };
  private updateGuest(dt: number) {
    const s = this.game.state; const now = s.hood.now; let g = this.guest;
    const gz = zoneIndex('garden'); const exitX = gz >= 0 ? zx(gz) + zw(gz) - 14 : worldW() - 10; // 从院子的栅栏那边进出
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
      // 大黑、花卷：从左边的屋檐（别人家的屋顶那边）出现，走过屋顶，顺着阳台的木梯下来
      if (fresh && NEIGHBORS[now.id]?.route === 'roof') { const L = this.ladder(); g.x = L.x; g.y = L.y; g.roof = { u: RF.walk[0][0], tu: L.u }; g.dir = 1; }
      (g as any).tag = tag;
    }
    if (!g) return;
    g.root.visible = true;
    const set = this.game.sprites.get(NEIGHBORS[g.id]?.look ?? ''); if (!set) return;
    const style = Scene.GUEST_STYLE[g.id] ?? Scene.GUEST_STYLE.dahei;
    const goTo = (x: number, y: number) => { g!.tx = clampX(x); g!.ty = Math.min(clampY(y), this.depthLimit(g!.tx)); };
    const viaRoof = NEIGHBORS[g.id]?.route === 'roof';
    // 该走了（串门时间到了，或者存档里已经没有它了）：麻薯往院子外面走，走到头就消失；大黑、花卷走到梯子底下，爬上屋顶，从左边的屋檐走掉
    if ((!now || now.id !== g.id) && g.step !== 'leave') { g.step = 'leave'; const L = this.ladder(); if (viaRoof && g.roof) g.roof.tu = RF.walk[0][0]; else if (viaRoof && !g.climb) { g.tx = L.x; g.ty = L.y; } else if (!viaRoof) { g.tx = exitX; g.ty = depthMin() + 24; } g.until = 0; }
    const far = Math.abs(g.tx - g.x) > 4 || Math.abs(g.ty - g.y) > 4;
    let rx: number | null = null, ry = 0, tilt = 0, climbing = false;
    if (g.climb) {
      // 爬梯子：爬完了，上去的接着在屋顶上往左走，下来的往客厅走
      const L = this.ladder(), t = Math.min(1, (this.now - g.climb.t0) / CONFIG.roof.climbMs), e = g.climb.up ? t : 1 - t;
      rx = L.x; ry = L.y + (L.topY - L.y) * e; climbing = true;
      if (t >= 1) { if (g.climb.up) g.roof = { u: L.u, tu: RF.walk[0][0] }; else { g.x = L.x; g.y = L.y; if (g.step === 'enter') { g.tx = SPOT.living + 60; g.ty = depthMin() + 40; } } g.climb = null; }
    } else if (g.roof) {
      const r = g.roof, d = r.tu - r.u;
      if (Math.abs(d) > 2) { g.dir = d > 0 ? 1 : -1; r.u += g.dir * Math.min(Math.abs(d), CONFIG.roof.walkSpeed * 2.2 * (dt / 1000)); if (g.action !== 'walk') { g.action = 'walk'; g.t0 = this.now; } }
      else if (g.step === 'leave') { g.root.destroy({ children: true }); this.guest = null; return; } // 走到左边的屋檐：回别人家去了
      else { g.roof = null; g.climb = { t0: this.now, up: false }; }
      if (g.roof) { const w = roofWalk(r.u); rx = topToWorld(r.u); ry = w.y - H; tilt = w.tilt; }
    } else if (far) {
      const dx = g.tx - g.x, dy = g.ty - g.y, dist = Math.hypot(dx, dy); if (Math.abs(dx) > 2) g.dir = dx > 0 ? 1 : -1;
      const step = Math.min(dist, (g.step === 'leave' || g.step === 'enter' ? 170 : 105) * (dt / 1000));
      g.x += (dx / dist) * step; g.y += (dy / dist) * step; if (g.step !== 'leave') g.y = Math.min(g.y, this.depthLimit(g.x));
      if (g.action !== 'walk') { g.action = 'walk'; g.t0 = this.now; }
    } else if (g.step === 'leave') {
      if (viaRoof) { g.climb = { t0: this.now, up: true }; return; } // 到梯子底下了：往上爬
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
          this.snap('neighbor', [b], g.id);
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
    const sc = PET_BASE * ASSETS.petScale * (NEIGHBORS[g.id]?.size ?? 0.85);
    g.sprite.texture = (climbing ? extraFrame(set, 'climb', this.now) ?? set.tex[rowFor(set, 'jump')][Math.floor(this.now / 150) % 4] : null) ?? set.tex[rowFor(set, g.action)][frameIndex(g.action, this.now - g.t0)];
    g.sprite.scale.set(sc * g.dir, sc); g.sprite.rotation = g.roof && g.action === 'walk' ? tilt : 0;
    if (rx !== null) { g.root.position.set(rx, ry); g.root.zIndex = 9000 + ry; } else { g.root.position.set(g.x, g.y); g.root.zIndex = g.y; }
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
    if (kind === 'autoball') return { x: sp.x, y: pos.y, w: sp.width, h: sp.height, k: pos.k }; // 自己会滚：用它现在的位置
    return { x: ball ? this.ballX! : pos.x, y: ball ? this.ballY ?? pos.y : pos.y, w: sp.width, h: sp.height, k: pos.k };
  }
  /** 用这件家具的第几个位置时，脚站在地上的哪里（要跳上去的家具：这里是起跳的地方） */
  /** 这只宠物现在画多大 */
  // ---------- 屋顶：顺着阳台的木梯爬上去，在平顶上看星星，有时就睡在上面 ----------

  /** 梯子底下（宠物站在地上开始爬的地方）和顶端（屋顶那一层里落脚的地方，u = 上层图坐标） */
  private ladder() { const p = objPos(ASSETS.objects.ladder); const u = worldToTop(p.x); return { x: p.x, y: depthMin() + 4, u, topY: roofWalk(u).y - H }; }
  /** 正在屋顶上、在爬梯子、或者正往梯子走的宠物 */
  private roofers() { return [...this.actors.values()].filter((o) => o.roof || o.climb || o.pending?.roof != null); }
  /** 夜里想不想上屋顶：概率低、有间隔、最多两只 */
  private wantsRoof(a: Actor, adv: boolean) {
    const R = CONFIG.roof; const up = this.roofers();
    if (up.length >= R.max || this.now < this.roofNext || this.now - a.selfPlayAt < SELF_PLAY_COOLDOWN * 3 || Math.random() >= (adv ? R.chanceAdventurer : R.chance)) return false;
    const slot = [0, 1].find((k) => !up.some((o) => (o.roof?.slot ?? o.climb?.slot ?? o.pending?.roof) === k)) ?? 0;
    const L = this.ladder(); this.go(a, L.x, L.y); a.pending = { action: 'sit', dur: between(D.stargaze), roof: slot };
    a.selfPlayAt = this.now; this.roofNext = this.now + R.gap; return true;
  }
  /** 爬梯子、屋顶上走路和待着。返回 true = 这一帧已经处理过了 */
  private roofStep(a: Actor, dt: number, weak: boolean): boolean {
    const R = CONFIG.roof;
    if (a.climb) {
      if (this.now - a.climb.t0 < R.climbMs) return true;
      const c = a.climb; a.climb = null;
      if (c.up) { const L = this.ladder(); a.roof = { u: L.u, tu: RF.spots[c.slot] ?? RF.spots[0], slot: c.slot, home: false, slept: false, stay: c.stay }; a.action = 'walk'; a.t0 = this.now; }
      else if (!a.pending) this.setAction(a, 'idle', 800);
      return true;
    }
    const r = a.roof; if (!r) return false;
    const s = this.game.state;
    // 天亮了、下雨了、饿得没力气了、主人叫它（喂饭、洗澡）：走回梯子爬下来
    if (!r.home && (weak || a.pending || sim.weather(s) === 'rain' || sim.dayTime(s) !== 'night')) { r.home = true; a.inter = null; }
    const to = r.home ? this.ladder().u : r.tu;
    if (Math.abs(to - r.u) > 2) {
      const step = Math.min(Math.abs(to - r.u), (R.walkSpeed * (a.pending?.action && a.fast ? 2 : 1) * dt) / 1000);
      a.dir = to > r.u ? 1 : -1; r.u += a.dir * step;
      if (a.action !== 'walk') { a.action = 'walk'; a.t0 = this.now; }
      return true;
    }
    if (r.home) { a.roof = null; a.climb = { t0: this.now, up: false, stay: 0, slot: r.slot }; return true; }
    if (a.action === 'walk') { a.dir = -1; this.setAction(a, 'sit', r.stay); return true; } // 朝左边的月亮看
    if (this.now >= a.until) {
      if (a.action === 'happy') this.setAction(a, 'sit', r.stay / 2); // 被摸完了接着看
      else if (a.action === 'sit' && !r.slept && Math.random() < R.sleepChance) { r.slept = true; a.inter = { action: 'yawn', t0: this.now, until: this.now + 1200 }; this.setAction(a, 'sleep', between(R.sleep)); }
      else r.home = true;
    }
    return true;
  }

  private scaleOf(a: Actor) { const p = this.game.pet(a.id); return PET_BASE * ASSETS.petScale * (p ? sim.bodySize(p) : 0.85); }
  /** 嘴在世界里离脚底多远（面朝右；朝左时 x 取反） */
  private mouthOffset(sc: number): [number, number] { return [(SPRITE.mouth[0] - SPRITE.cell / 2) * sc, (SPRITE.mouth[1] - SPRITE.cell * 0.9) * sc]; }
  private floorSpot(kind: string, slot: number, sc = PET_BASE * ASSETS.petScale * ADULT_MAX): [number, number] | null {
    const A = this.anchor(kind), st = STATIONS[kind]?.[slot]; if (!A || !st) return null;
    const box = ASSETS.objects[kind]?.mouth;
    if (st.eat && box) {
      // 嘴对准碗口（或出粮口）里的那一点，反推脚站在哪
      const mx = A.x - A.w / 2 + A.w * (box[0] + (box[2] - box[0]) * st.eat.at[0]), my = A.y - A.h + A.h * (box[1] + (box[3] - box[1]) * st.eat.at[1]);
      const [ox, oy] = this.mouthOffset(sc); const x = clampX(mx - ox * st.dir);
      return [x, clampY(st.eat.back != null ? Math.min(my - oy, A.y - st.eat.back) : my - oy)];
    }
    const x = clampX(A.x + st.dx * A.k); const y = st.at != null ? A.y - A.h * st.at : depthMin() + 4 + slot * 7;
    return [x, Math.min(clampY(y), this.depthLimit(x))];
  }
  /** 跳上去之后脚在哪；z = 排前后用的位置（比家具自己靠前一点点）。浴缸按遮挡线算：下巴大约在浴缸边沿 */
  private perchSpot(kind: string, slot: number, sc: number): { x: number; y: number; z: number } | null {
    const A = this.anchor(kind), st = STATIONS[kind]?.[slot]; if (!A || !st?.perch) return null;
    if (kind === 'tub') { const rim = A.y - A.h * (1 - (ASSETS.objects.tub.frontFrom ?? 0.2)); return { x: A.x + st.dx * (A.w / 260), y: rim + (0.9 * 256 - 152) * sc, z: A.y + 0.1 }; }
    return { x: A.x + st.perch[0] * A.w, y: A.y - st.perch[1] * A.h, z: st.inside ? A.y + 0.1 : A.y + 0.3 + slot * 0.01 };
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
    const spot = this.floorSpot(kind, i, this.scaleOf(a))!;
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
  /** food = 吃的是什么（kibble 猫粮在饭碗吃；can 鱼罐头、feast 豪华便当在厨房里找个空地，地上摆出罐头或便当） */
  perform(petId: string, action: ActionName, follow = true, food?: string) {
    const a = this.actors.get(petId); if (!a) return;
    // 在屋顶上被摸：就在上面开心一下，接着看星星。喂饭、洗澡等：先走回梯子爬下来再去（见 roofStep）
    if (a.roof && !a.roof.home && action === 'happy') { if (a.sulkUntil > this.now) a.sulkUntil = 0; a.inter = null; this.setAction(a, 'happy', D.pet); return; }
    if (a.roof || a.climb) follow = false;
    // 待在沙发、床、猫爬架上被摸：不用跳下来
    if (!(action === 'happy' && a.perch && a.perch.kind !== 'tub')) this.release(a);
    a.pending = null; a.want = null; this.stop(a); a.wandUntil = 0; a.inter = null;
    if (a.sulkUntil > this.now) { a.sulkUntil = 0; if (action === 'happy') this.floatText(petId, '哼……原谅你了'); }
    if (action === 'eat' && (food === 'can' || food === 'feast')) this.serveDish(a, food);
    else if (action === 'eat') this.reserveOrWait(a, 'bowl');
    else if (action === 'bath') this.reserveOrWait(a, 'tub');
    // 主人陪玩：就在原地逗它，不用走到玩具那里（猫抓板和球是它自己玩的）
    const dur = action === 'eat' ? D.eat : action === 'bath' ? D.bath : action === 'play' ? D.wand : D.pet;
    if (action === 'play') { a.wandUntil = this.now + dur; a.selfPlayAt = this.now; }
    a.fast = true;
    a.pending = { action, dur, ...(a.station === 'dish' ? { dish: a.dishId } : {}) };
    if (follow && action !== 'happy') this.follow = { id: petId, until: this.now + dur + 4000 };
  }

  /** 宠物头顶飘一行字（「饱食 +25」之类），给操作一个看得见的反馈 */
  floatText(petId: string, text: string) {
    const a = this.actors.get(petId); if (!a || !text) return;
    const t = new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 30, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x5b4634, width: 6 } } });
    t.anchor.set(0.5); t.scale.set(0.5 / this.scale); (t as any).petId = petId;
    this.overlay.addChild(t); this.floats.push({ t, t0: this.now });
  }

  /** 一只宠物现在在屏幕上的位置（CSS 像素，给新手引导的聚光灯用）；不在画面里返回 null */
  petScreenRect(petId: string): { x: number; y: number; w: number; h: number } | null {
    const a = this.actors.get(petId); if (!a || !a.root.visible) return null;
    const c = this.app.canvas.getBoundingClientRect(); const sp = a.sprite; const w = Math.abs(sp.width) * this.scale * 0.8, h = Math.abs(sp.height) * this.scale * 0.75;
    const x = c.left + this.world.x + a.root.x * this.scale, y = c.top + this.world.y + a.root.y * this.scale;
    if (x < c.left || x > c.right || y - h > c.bottom || y < c.top) return null; // 不在画面里（走出去了、镜头在另一层）
    return { x: x - w / 2, y: y - h, w, h: h + 8 };
  }

  focusPet(petId: string) {
    const a = this.actors.get(petId); if (!a) return;
    // 在屋顶上（或正在爬梯子）：切到屋顶，对准它
    if (a.roof || a.climb) { this.goRoof(); this.camTarget = Math.max(0, Math.min(this.maxCam(), (a.roof ? topToWorld(a.roof.u) : this.ladder().x) - this.viewW / 2)); return; }
    if (this.layer === 'roof') { this.scrollToZone(zoneAt(a.x)); return; }
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
    } else if (p.fishing && !rain && lounge('pond', 'fish', 8000)) {
      // 主人让它自己去鱼塘捞鱼：一直守在鱼塘边伸爪子，到点了自己回来（结算在 sim）
    } else if (p.food < low) {
      // 饿了：去饭碗旁边蹲着等
      const spot = goNear('bowl', -150 - a.lane * 30);
      if (near(spot)) { a.dir = 1; this.setAction(a, 'idle', 3000); } else this.go(a, spot);
    } else if (s.owned.feeder && p.food < CONFIG.stats.feederFoodFloor + 12 && Math.random() < 0.4 && this.anchor('feeder')) {
      // 自动喂食机出粮了：自己去出粮口吃两口。一次只能一只，有别的猫在吃就在旁边排队
      this.reserveOrWait(a, 'feeder'); a.pending = { action: 'eat', dur: 5000 };
    } else if (night) {
      // 晚上：先睡自己在猫爬架上的那一层；没有就上床、上沙发；都满了在床边的地上睡
      const adv = p.trait === 'adventurer'; const winter = sim.season(s) === 'winter';
      if (was && was.kind !== 'tub' && lounge(was.kind, 'sleep', 9000, was.slot)) { /* 已经睡在床、沙发、猫爬架或窗台上了：接着睡，不换地方 */ }
      // 天气好的夜里，偶尔爬到屋顶上看一会儿星星再回来睡（爱冒险的更常去）
      // 概率低，同时最多两只，一只上去之后隔一阵才有下一只（见 CONFIG.roof）
      else if (!rain && this.wantsRoof(a, adv)) { /* 往阳台的木梯走 */ }
      // 冬天有暖炉：围着暖炉睡
      else if (winter && lounge('heater', 'sleep', 9000)) { /* 暖炉边 */ }
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
      const bugs = !rain && sim.dayTime(s) === 'day' && ['spring', 'summer'].includes(sim.season(s)); // 春夏的晴天白天，院子里有蝴蝶
      const fun = [...(s.owned.scratcher ? ['scratcher'] : []), ...(s.owned.ball ? ['ball'] : []), ...(s.owned.autoball ? ['autoball'] : []), ...(bugs ? ['butterfly'] : []), ...(s.pond.some((x) => x != null) && !rain ? ['pond'] : [])].sort(() => Math.random() - 0.5);
      const rest = (): ActionName => (['idle', 'sleep', 'lick'] as ActionName[])[Math.floor(Math.random() * 3)];
      const trait = p.trait;
      const sleeper = this.napBuddy(a);
      if (was && LOUNGE.includes(was.kind) && Math.random() < 0.4 && lounge(was.kind, was.kind.endsWith('Window') ? 'sit' : 'idle', between(D.perch), was.slot)) { /* 还想在上面再待一会儿 */ }
      // 下雨天爱趴在窗台上看雨
      else if (rain && Math.random() < 0.35 && ['kitchenWindow', 'bedroomWindow'].sort(() => Math.random() - 0.5).some((k) => lounge(k, 'sit', between(D.perch) * 1.5))) { /* 看雨 */ }
      // 冬天有暖炉：爱凑到暖炉边待着
      else if (sim.season(s) === 'winter' && Math.random() < 0.35 && lounge('heater', Math.random() < 0.5 ? 'sleep' : 'sit', between(D.perch) * 1.5)) { /* 烤火 */ }
      // 院子里有猫草：偶尔去啃两口（下雨不去）
      else if (s.owned.catgrass && !rain && Math.random() < 0.1 && this.reserve(a, 'catgrass')) { a.pending = { action: 'eat', dur: 4200 }; if (sim.nibbleGrass(s, p.id)) this.game.touch(); }
      // 性格：贪吃的没事就去饭碗边站起来讨吃的；爱干净的动不动就舔毛；黏人的走到屏幕中间坐下看着你
      else if (trait === 'glutton' && Math.random() < 0.2) { this.go(a, goNear('bowl', -110 - a.lane * 26), objPos(ASSETS.objects.bowl).y + 6); a.pending = { action: 'beg', dur: 3200 }; }
      else if (trait === 'tidy' && Math.random() < 0.2) this.setAction(a, 'lick', 3600);
      else if (trait === 'clingy' && Math.random() < 0.2 && !this.isOutdoor(this.viewCenter())) { this.go(a, this.viewCenter() + (a.lane - 2) * 60, depthMax() - 14 - a.lane * 6); a.pending = { action: 'sit', dur: 5000 }; }
      // 关系好的（冬天不管关系）白天也爱挨着睡
      else if (sleeper && Math.random() < 0.3) { this.go(a, sleeper.x + (a.x < sleeper.x ? -66 : 66), sleeper.y + 3); a.pending = { action: 'sleep', dur: 7000 + Math.random() * 4000 }; }
      else if (mine >= 0 && Math.random() < 0.4 && lounge('cattree', rest(), between(D.perch), mine)) { /* 回自己在猫爬架上的位置 */ }
      else if (fun.length && r > 0.78 && this.now - a.selfPlayAt > SELF_PLAY_COOLDOWN && fun.some((k) => this.reserve(a, k))) {
        a.selfPlayAt = this.now;
        a.pending = a.station === 'ball' || a.station === 'autoball' ? { action: 'play', dur: between(D.ball), ball: true } : a.station === 'pond' ? { action: 'fish', dur: between(D.fish) } : a.station === 'butterfly' ? { action: 'fish', dur: between(D.butterfly) } : { action: 'scratch', dur: between(D.scratcher) };
      } else if (r < 0.4) {
        // 随便走走：客厅去得多一些，也会自己走到阳台和院子里
        // 爱冒险的更爱往外跑；下雨天谁都不出门
        const inside = ZONES.map((_, i) => i).filter((i) => !OUTDOOR.includes(ZONES[i].id)), out = ZONES.map((_, i) => i).filter((i) => OUTDOOR.includes(ZONES[i].id));
        const pool = rain ? inside : trait === 'adventurer' && Math.random() < 0.5 && out.length ? out : ZONES.map((_, i) => i);
        const z = Math.random() < (trait === 'adventurer' ? 0.2 : 0.45) ? 2 : pool[Math.floor(Math.random() * pool.length)];
        this.go(a, zx(z) + zw(z) * (0.14 + Math.random() * 0.72), depthMin() + Math.random() * (depthMax() - depthMin()));
      } else if (r < 0.6 && LOUNGE.filter((k) => !(rain && k === 'chair')).sort(() => Math.random() - 0.5).some((k) => lounge(k, k.endsWith('Window') ? 'sit' : HIDEY.includes(k) ? (Math.random() < 0.5 ? 'idle' : 'sleep') : k === 'counter' || k === 'cabinet' ? (Math.random() < 0.5 ? 'sit' : 'idle') : rest(), between(D.perch)))) { /* 跳到沙发、床、窗台、猫爬架、台面、柜顶上，或者钻进纸箱、洗衣篮、隧道里待一会儿 */ }
      else if (r < 0.68) this.setAction(a, 'sleep', 5000 + Math.random() * 4000);
      else this.setAction(a, 'idle', 2000 + Math.random() * 3500);
    }
  }

  /** 两只闲着的宠物凑在一起玩。有玩具球就一起去玩球，没有就在原地闹一会儿。 */
  private tryCompanionPlay() {
    const s = this.game.state;
    const free = [...this.actors.values()].filter((a) => !a.pending && !a.station && !a.perch && !a.hop && !a.roof && !a.climb && !this.far(a) && a.action === 'idle' && this.now - a.selfPlayAt > SELF_PLAY_COOLDOWN);
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
    const idle = [...this.actors.values()].filter((a) => !a.pending && !a.station && !a.roof && !a.climb && !sim.isWeak(this.game.pet(a.id)!)).slice(0, 2);
    idle.forEach((a, i) => { this.go(a, sp.x + (i ? 80 : -80), Math.max(sp.y + 8, depthMin() + 10 + i * 12)); a.fast = true; a.pending = { action: 'happy', dur: 2400 }; });
    if (idle.length) this.follow = { id: idle[0].id, until: this.now + 5000 };
  }

  // ---------- 光影：跟着真实时间变 ----------

  private lightLevel() { return this.game.state.settings.light; }

  /** 整个画面乘上一个颜色（正片叠底）。屋里和室外（阳台、院子、屋顶）各用各的颜色。
   *  光影效果「关」：老的三段式（傍晚偏暖、夜里压暗）；高、简单：跟着时间平滑变（清晨偏粉、中午自然、黄昏偏橙、夜里偏蓝暗），下雨偏冷偏灰 */
  private drawShade() {
    const W = worldW(), fy = geo.floorY; this.shade.clear();
    if (this.lightLevel() === 'ultra') return; // 超高用光照图
    let tone: { indoor: string; outdoor: string } | null;
    if (this.lightLevel() === 'off') { const t = this.env().time; tone = t === 'day' ? null : CONFIG.light[t]; }
    else tone = this.light.indoor === '#FFFFFF' && this.light.outdoor === '#FFFFFF' ? null : this.light;
    if (!tone) return;
    ZONES.forEach((z, i) => {
      const x0 = i === 0 ? -3000 : zx(i), x1 = i === N - 1 ? W + 3000 : zx(i + 1);
      const outdoor = OUTDOOR.includes(z.id);
      // 阳台有屋檐，木地板和屋里连着：地板以下用屋里的颜色，不然和隔壁的地板接不上
      // 天花板以上（屋顶那一层）都是露天
      const split = z.id === 'balcony' ? fy : outdoor ? 6000 + H : 0;
      this.shade.rect(x0, -3000 - H, x1 - x0, split + 3000 + H).fill(hex(tone!.outdoor));
      if (split < 6000 + H) this.shade.rect(x0, split, x1 - x0, 6000 + H - split).fill(hex(tone!.indoor));
    });
  }

  /** 每一帧看一下：时间、天气、光影档位、窗户位置变了，就重算这一刻的光（大约 3 分钟变一次，拖时间时跟手） */
  private updateLight() {
    const s = this.game.state; const level = this.lightLevel(); const hour = sim.lightHour(s); const weather = sim.weather(s);
    const wins = ['kitchenWindow', 'bedroomWindow'].map((k) => { const sp = this.objSprites.get(k); return sp ? `${Math.round(sp.x)},${Math.round(sp.y)},${Math.round(sp.width)}` : ''; }).join(';');
    const lamps = level === 'ultra' ? this.lampSpots().map((p) => `${p.kind}${Math.round(p.x)},${Math.round(p.y)}`).join(';') : '';
    const sig = `${level}|${Math.round(hour * 20)}|${weather}|${wins}|${lamps}|${Math.round(geo.floorY)}|${Math.round(worldW())}|${level === 'ultra' ? this.objSig + this.furnSig() : ''}`;
    if (sig === this.lightSig) return;
    this.lightSig = sig; this.light = lightAt(hour, weather);
    this.drawShade(); this.drawWindowLight(); this.drawLightMap(); this.drawRims();
  }
  /** 家具和装饰现在的位置（挪了要重算挡光和朝光面） */
  private furnSig() {
    let s = ''; for (const [k, sp] of this.objSprites) s += `${k}${Math.round(sp.x)},${Math.round(sp.y)},${Math.round(sp.height)};`;
    for (const [k, sp] of this.decorSprites) s += `${k}${Math.round(sp.x)},${Math.round(sp.y)};`; return s;
  }
  /** 超高里算光影的家具和装饰：[名字, 图片, 原图] */
  private lightThings(): [string, Sprite, HTMLCanvasElement | HTMLImageElement][] {
    const out: [string, Sprite, HTMLCanvasElement | HTMLImageElement][] = [];
    for (const [kind, sp] of this.objSprites) if ((sp as any).art && sp.alpha !== 0 && !sp.destroyed) out.push([kind, sp, (sp as any).art]);
    for (const d of this.game.state.decor) { const sp = this.decorSprites.get(d.id); if (sp && (sp as any).art && !sp.destroyed && DECOR[d.kind]?.layer !== 'floor') out.push([d.kind, sp, (sp as any).art]); }
    return out;
  }

  /** 超高：每件家具朝着光的那一面亮、背着光的那一面暗。按它自己的轮廓画两层（亮的一层叠加、暗的一层盖上去），
   *  放在家具正上面一点点（同一层，宠物走到前面会挡住它）。光变了才重画 */
  private drawRims() {
    for (const r of this.rims) { r.lit.destroy(); r.dark.destroy(); for (const t of r.tex) { this.textures = this.textures.filter((x) => x !== t); t.destroy(true); } } this.rims = [];
    if (this.lightLevel() !== 'ultra') return;
    const U = CONFIG.light.ultra, l = this.light;
    // 室外的太阳也算一个从侧上方照来的光
    const sun: LightSource[] = l.sun > 0.01 ? [{ x: 0, y: 0, zone: -1, power: 0, radius: 1, color: l.win }] : [];
    for (const [kind, sp, art] of this.lightThings()) {
      if (U.noRim.includes(kind)) continue;
      const z = this.zoneOfPoint(sp.x, sp.y - 2); const cx = sp.x, cy = sp.y - sp.height / 2;
      let dir = lightDir(this.lightSrc, cx, cy, z, (q) => this.openZone(q));
      // 露天：太阳从侧上方照（早上在左、傍晚在右、中午在头顶）
      if (sun.length && this.openZone(z)) { const sx = l.side * 0.85, sy = -Math.max(0.3, l.high); const len = Math.hypot(sx, sy); const sd = { dx: sx / len, dy: sy / len, power: l.sun * 0.6, color: l.win }; dir = !dir || dir.power < sd.power ? sd : dir; }
      if (!dir) continue;
      const w = Math.max(2, Math.round(sp.width)), h = Math.max(2, Math.round(sp.height));
      const paint = (stops: [number, string][]) => {
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!;
        c.drawImage(art, 0, 0, w, h); c.globalCompositeOperation = 'source-in';
        const R = Math.hypot(w, h) / 2; const g = c.createLinearGradient(w / 2 + dir!.dx * R, h / 2 + dir!.dy * R, w / 2 - dir!.dx * R, h / 2 - dir!.dy * R);
        for (const [at, col] of stops) g.addColorStop(at, col); c.fillStyle = g; c.fillRect(0, 0, w, h); return cv;
      };
      const [r, gg, b] = [1, 3, 5].map((i) => parseInt(dir!.color.slice(i, i + 2), 16));
      const litA = U.rim.lit * dir.power, darkA = U.rim.dark * dir.power;
      const litCv = paint([[0, `rgba(${r},${gg},${b},${litA})`], [0.45, `rgba(${r},${gg},${b},0)`], [1, `rgba(${r},${gg},${b},0)`]]);
      const darkCv = paint([[0, 'rgba(30,22,40,0)'], [0.5, 'rgba(30,22,40,0)'], [1, `rgba(30,22,40,${darkA})`]]);
      const t1 = this.tex(litCv), t2 = this.tex(darkCv);
      const mk = (t: Texture, add: boolean) => { const s2 = new Sprite(t); s2.anchor.set(0.5, 1); s2.eventMode = 'none'; (s2 as any).isActor = true; if (add) s2.blendMode = 'add'; this.objects.addChild(s2); return s2; };
      this.rims.push({ key: kind, lit: mk(t1, true), dark: mk(t2, false), tex: [t1, t2] });
      (this.rims[this.rims.length - 1] as any).src = sp;
    }
    this.syncRims();
  }
  /** 每一帧：朝光面那两层跟着家具走（拖动调整时也跟手） */
  private syncRims() {
    for (const r of this.rims) {
      const sp = (r as any).src as Sprite; const ok = !sp.destroyed && sp.visible && !!sp.parent;
      for (const [o, dz] of [[r.dark, 0.002], [r.lit, 0.003]] as [Sprite, number][]) { o.visible = ok; if (!ok) continue; o.position.set(sp.x, sp.y); o.width = sp.width; o.height = sp.height; o.zIndex = sp.zIndex + dz; }
    }
  }

  /** 会发光的东西现在在哪：买了的吊灯、床头灯、暖炉，摆出来的落地灯、小夜灯、萤火虫罐、灯笼 */
  private lampSpots(): { x: number; y: number; kind: string }[] {
    const out: { x: number; y: number; kind: string }[] = [];
    for (const [kind, sp] of this.objSprites) { const light = ASSETS.objects[kind]?.light; if (light && sp.alpha !== 0) out.push({ x: sp.x - sp.width / 2 + sp.width * light[0], y: sp.y - sp.height + sp.height * light[1], kind }); }
    for (const d of this.game.state.decor) { const sp = this.decorSprites.get(d.id), light = DECOR[d.kind]?.light; if (sp && light) out.push({ x: sp.x - sp.width / 2 + sp.width * light[0], y: sp.y - sp.height + sp.height * light[1], kind: d.kind }); }
    return out;
  }
  /** 这一点在哪个区域：天花板以上是屋顶那一层（-1） */
  private zoneOfPoint(x: number, y: number) { return y < 0 ? -1 : zoneAt(x); }
  private openZone(z: number) { return z === -1 || OUTDOOR.includes(ZONES[z]?.id); }

  /** 超高：这一刻的光源（白天的窗户、天黑后的灯），再算一张光照图盖在整个画面上（正片叠底，屋角暗、窗边和灯周围亮） */
  private drawLightMap() {
    if (this.lightMapTex) { this.textures = this.textures.filter((t) => t !== this.lightMapTex); this.lightMapTex.destroy(true); this.lightMapTex = null; this.lightMapSp.texture = Texture.EMPTY; }
    this.lightSrc = []; this.lightMapSp.visible = false;
    if (this.lightLevel() !== 'ultra') return;
    const U = CONFIG.light.ultra, l = this.light;
    if (l.sun > 0.01) for (const kind of ['kitchenWindow', 'bedroomWindow']) {
      const sp = this.objSprites.get(kind), glass = ASSETS.objects[kind]?.glass; if (!sp || !glass || sp.alpha === 0) continue;
      const left = sp.x - sp.width / 2, top = sp.y - sp.height; const x = left + (glass[0] + glass[2]) / 2 * sp.width, y = top + (glass[1] + glass[3]) / 2 * sp.height;
      this.lightSrc.push({ x, y, zone: this.zoneOfPoint(x, y), power: U.window.power * l.sun, radius: U.window.radius, color: l.win });
    }
    // 屋里的固定光源：每个室内区域正中一盏（看不见灯具），白天一直有一点补光，天暗了更亮
    const RL = CONFIG.light.roomLight, roomOn = RL.base + RL.on * l.glow;
    ZONES.forEach((z, i) => { if (OUTDOOR.includes(z.id)) return; const x = (zx(i) + zx(i + 1)) / 2; this.lightSrc.push({ x, y: RL.y, zone: i, power: roomOn, radius: RL.radius, color: RL.color, cast: false }); });
    if (l.glow > 0.01) for (const p of this.lampSpots()) this.lightSrc.push({ x: p.x, y: p.y, zone: this.zoneOfPoint(p.x, p.y), power: U.lamp.power * l.glow, radius: U.lampRadius[p.kind] ?? U.lamp.radius, color: U.lampColor[p.kind] ?? U.lamp.color });
    // 家具本身当光源：鱼塘白天反光，喂食机夜里亮着指示灯（只照亮、不让别的东西投影）
    for (const [kind, e] of Object.entries(U.extra)) {
      const sp = this.objSprites.get(kind); const k = e.by === 'sun' ? l.sun : l.glow; if (!sp || sp.alpha === 0 || k < 0.01) continue;
      const x = sp.x - sp.width / 2 + sp.width * e.at[0], y = sp.y - sp.height + sp.height * e.at[1];
      this.lightSrc.push({ x, y, zone: this.zoneOfPoint(x, y), power: e.power * k, radius: e.radius, color: e.color, cast: e.cast });
    }
    // 挡光的家具：图片的框往里缩一点（家具不是方的）
    const occ: Occluder[] = [];
    for (const [kind, sp] of this.lightThings()) {
      if (!U.occluders.includes(kind)) continue; const ix = sp.width * U.inset, iy = sp.height * U.inset;
      occ.push({ x0: sp.x - sp.width / 2 + ix, x1: sp.x + sp.width / 2 - ix, y0: sp.y - sp.height + iy, y1: sp.y - 2, zone: this.zoneOfPoint(sp.x, sp.y - 2) });
    }
    const pad = 600, W = worldW(); const grid = { x0: -pad, y0: -2 * H, cell: U.cell, cols: Math.ceil((W + pad * 2) / U.cell), rows: Math.ceil((4 * H) / U.cell) };
    const data = lightMap(l, grid, (x, y) => this.zoneOfPoint(x, y), (z) => this.openZone(z), this.lightSrc, occ);
    const cv = document.createElement('canvas'); cv.width = grid.cols; cv.height = grid.rows; cv.getContext('2d')!.putImageData(new ImageData(data, grid.cols, grid.rows), 0, 0);
    this.lightMapTex = this.tex(cv); this.lightMapSp.texture = this.lightMapTex;
    this.lightMapSp.position.set(grid.x0, grid.y0); this.lightMapSp.width = grid.cols * grid.cell; this.lightMapSp.height = grid.rows * grid.cell; this.lightMapSp.visible = true;
  }

  /** 一块软边的椭圆（接触阴影用），画一次反复用 */
  private contactTexture() {
    if (this.contactTex) return this.contactTex;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32; const c = cv.getContext('2d')!;
    c.translate(64, 16); c.scale(1, 0.25); const g = c.createRadialGradient(0, 0, 0, 0, 0, 64);
    g.addColorStop(0, 'rgba(40,28,20,1)'); g.addColorStop(0.55, 'rgba(40,28,20,0.6)'); g.addColorStop(1, 'rgba(40,28,20,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 64, 0, Math.PI * 2); c.fill();
    return (this.contactTex = this.tex(cv));
  }

  /** 窗户光：从窗户斜着照进来，落在墙上和地板上的一块柔和的光。早上往右斜、中午短、傍晚往左斜；夜里和下雨没有。
   *  光影效果「简单」时形状不动（只跟着时间变颜色和浓淡），「关」没有。
   *  画法：在很小的画布上画好再放大，边缘自然就是软的 */
  private drawWindowLight() {
    for (const c of this.winLayer.removeChildren()) c.destroy();
    for (const t of this.winTex) { this.textures = this.textures.filter((x) => x !== t); t.destroy(true); } this.winTex = [];
    const level = this.lightLevel(), l = this.light, WL = CONFIG.light.windowLight;
    const strength = WL.alpha * l.sun; if (level === 'off' || strength < 0.01) return;
    const moving = level === 'high' || level === 'ultra'; const side = moving ? l.side : -0.25, high = moving ? l.high : 0.85;
    const fy = geo.floorY, R = 10;
    for (const kind of ['kitchenWindow', 'bedroomWindow']) {
      const sp = this.objSprites.get(kind), glass = ASSETS.objects[kind]?.glass; if (!sp || !glass || sp.alpha === 0) continue;
      const left = sp.x - sp.width / 2, top = sp.y - sp.height;
      const gx0 = left + glass[0] * sp.width, gx1 = left + glass[2] * sp.width, gy0 = top + glass[1] * sp.height, gy1 = top + glass[3] * sp.height;
      const gw = gx1 - gx0, shift = -side * WL.lean * gw, depth = WL.near + (WL.far - WL.near) * (1 - high);
      // 地板上的那块：靠墙的一边和离墙远的一边都往太阳的反方向挪，离墙越远挪得越多
      const floor: [number, number][] = [[gx0 + shift * 0.55, fy + 4], [gx1 + shift * 0.55, fy + 4], [gx1 + shift, fy + depth], [gx0 + shift, fy + depth]];
      // 从窗户斜着落到地板上的一道淡淡的光（经过下面的墙）
      const beam: [number, number][] = [[gx0, gy0], [gx1, gy0], [gx1 + shift, fy + depth], [gx0 + shift, fy + depth]];
      const pts = [...floor, ...beam]; const pad = 3 * R;
      const bx = Math.min(...pts.map((p) => p[0])) - pad, by = gy0 - pad, bw = Math.max(...pts.map((p) => p[0])) + pad - bx, bh = fy + depth + pad - by;
      const cv = document.createElement('canvas'); cv.width = Math.max(2, Math.ceil(bw / R)); cv.height = Math.max(2, Math.ceil(bh / R)); const c = cv.getContext('2d')!;
      const poly = (p: [number, number][], a: number) => { c.globalAlpha = a; c.beginPath(); p.forEach(([x, y], i) => (i ? c.lineTo((x - bx) / R, (y - by) / R) : c.moveTo((x - bx) / R, (y - by) / R))); c.closePath(); c.fill(); };
      c.fillStyle = l.win; poly(beam, WL.beam / WL.alpha * 0.9); poly(floor, 0.75); poly(floor, 0.25);
      const t = this.tex(cv); this.winTex.push(t);
      const s2 = new Sprite(t); s2.position.set(bx, by); s2.width = bw; s2.height = bh; s2.alpha = strength / 0.75; this.winLayer.addChild(s2);
    }
  }

  /** 每一帧：脚底下的接触阴影（屋里屋外都有），室外（阳台、院子、屋顶）跟着太阳的影子（只有「高」才有） */
  private drawShadows() {
    const level = this.lightLevel(); let n = 0;
    const get = () => { let sp = this.shadowPool[n]; if (!sp) { sp = new Sprite(); this.shadowPool.push(sp); this.shadowLayer.addChild(sp); } n++; sp.visible = true; sp.skew.set(0, 0); sp.tint = 0xffffff; return sp; };
    // 超高：太阳和灯投的影子放进家具那一层，排在投影子的东西后面一点点，这样能落在它后面的家具上（猫的影子落在沙发上），前面的家具照样盖住它
    let m = 0; const ultraLayer = level === 'ultra';
    const getObj = (z: number) => { let sp = this.objShadowPool[m]; if (!sp) { sp = new Sprite(); sp.eventMode = 'none'; (sp as any).isActor = true; this.objShadowPool.push(sp); this.objects.addChild(sp); } m++; sp.visible = true; sp.zIndex = z; return sp; };
    if (level !== 'off') {
      const C = CONFIG.light.contact, S = CONFIG.light.shadow; const l = this.light;
      const sun = (level === 'high' || level === 'ultra') && l.sun > 0.01 ? sunShadow(l) : null; const ctex = this.contactTexture();
      const lamps = level === 'ultra' ? this.lightSrc : [];
      /** src = 投影子的那张图；x, y = 脚底；w = 接触阴影多宽；outdoor = 有没有太阳影子 */
      // 影子 = 自己的轮廓压扁、斜切：顶端往旁边挪 dx、高度压成 dy（都按自己的高度算）
      const silhouette = (src: Sprite, x: number, y: number, dx: number, dy: number, alpha: number) => {
        const sh = ultraLayer ? getObj(y - 0.5) : get(); sh.texture = src.texture; sh.anchor.set(src.anchor.x, src.anchor.y); sh.tint = 0x000000; sh.alpha = alpha;
        // 光都从后面（窗户、墙边的灯、天上）照过来，影子往前（画面下方、朝着看的人）倒在地上：
        // 轮廓上下翻过来、压扁成 dy、往旁边斜 dx（都按自己的高度算）
        const sy = Math.abs(src.scale.y); sh.scale.set(src.scale.x, -sy * Math.hypot(dx, dy)); sh.skew.set(Math.atan2(dx, dy), 0); sh.position.set(x, y);
      };
      const cast = (src: Sprite, x: number, y: number, w: number, outdoor: boolean) => {
        const real = src.texture && src.texture !== Texture.EMPTY;
        if (sun && outdoor && real) silhouette(src, x, y, sun.dx, sun.dy, S.alpha * l.sun);
        // 超高：同一个区域里的每个光源（窗户、灯）各投一道影子，背离光源；露天的地方互相都算同一片
        if (real && lamps.length) {
          const z = this.zoneOfPoint(x, y - 2);
          for (const s of lamps) {
            if (s.cast === false) continue;
            if (s.zone !== z && !(this.openZone(s.zone) && this.openZone(z))) continue;
            const t = lampShadow(s, x, y); if (t.alpha > 0) silhouette(src, x, y, t.dx, t.dy, t.alpha);
          }
        }
        const c = get(); c.texture = ctex; c.anchor.set(0.5, 0.5); c.width = w * C.width; c.height = w * C.width * C.depth; c.position.set(x, y); c.alpha = C.alpha;
      };
      const none = CONFIG.light.noShadow;
      for (const [kind, sp] of this.objSprites) {
        const def = ASSETS.objects[kind]; if (!def || def.wall || def.flat || none.includes(kind) || !sp.visible || sp.alpha === 0) continue;
        cast(sp, sp.x, sp.y, sp.width, this.isOutdoor(sp.x));
      }
      for (const d of this.game.state.decor) { const sp = this.decorSprites.get(d.id); if (sp && sp.visible && DECOR[d.kind]?.layer === 'stand') cast(sp, sp.x, sp.y, sp.width, this.isOutdoor(sp.x)); }
      const petW = (sp: Sprite) => 256 * Math.abs(sp.scale.y) * C.pet;
      for (const a of this.actors.values()) {
        if (!a.root.visible || a.perch || a.hop || a.climb) continue; // 在家具上、跳着、爬梯子：地上没有影子
        cast(a.sprite, a.root.x, a.root.y, petW(a.sprite), !!a.roof || this.isOutdoor(a.root.x));
      }
      const g = this.guest; if (g && g.root.visible && !g.climb) cast(g.sprite, g.root.x, g.root.y, petW(g.sprite), g.root.y < 0 || this.isOutdoor(g.root.x));
      if (this.npc && this.npc.visible) cast(this.npc, this.npc.x, this.npc.y, petW(this.npc), this.isOutdoor(this.npc.x));
      for (const sp of this.visitorSprites.values()) if (sp.visible) cast(sp, sp.x, sp.y, petW(sp), this.isOutdoor(sp.x));
    }
    // 用不上的藏起来，并放开原来的图（家具重建时旧图会被销毁）
    for (let i = n; i < this.shadowPool.length; i++) { const sp = this.shadowPool[i]; if (sp.visible || sp.texture !== Texture.EMPTY) { sp.visible = false; sp.texture = Texture.EMPTY; } }
    for (let i = m; i < this.objShadowPool.length; i++) { const sp = this.objShadowPool[i]; if (sp.visible || sp.texture !== Texture.EMPTY) { sp.visible = false; sp.texture = Texture.EMPTY; } }
    this.syncRims();
  }

  /** 天黑了，灯的周围画一圈暖色光晕：买了的吊灯和床头灯、摆出来的落地灯和小夜灯。
   *  光跟着物品走，物品挪到哪光到哪；没买、没摆出来的灯不会亮。 */
  private drawGlow(env: Env) {
    const g = this.glow.clear(); const G = CONFIG.light.glow; const ultra = this.lightLevel() === 'ultra';
    // 光影效果「关」：老的三段式；高、简单：跟着时间慢慢亮起来（黄昏开始，夜里最亮）。光圈叠加在宠物上面，猫走进去会被照亮
    const strength = this.lightLevel() === 'off' ? (env.time === 'day' ? 0 : G.strength * (env.time === 'night' ? 1 : G.duskStrength)) : G.strength * this.light.glow * (ultra ? CONFIG.light.ultra.glowScale : 1);
    if (strength < 0.01) return; const color = hex(G.color);
    const lit: [number, number, string][] = this.lampSpots().map((p) => [p.x, p.y, p.kind]);
    const n = 26;
    const flick = CONFIG.light.ultra.flicker;
    for (const [x, y, kind] of lit) {
      // 超高：火光、萤火虫会闪（几个不同快慢的波叠起来，看不出规律）
      const f = ultra && flick[kind] ? 1 + flick[kind] * (Math.sin(this.now / 97 + x) * 0.5 + Math.sin(this.now / 263 + y) * 0.35 + Math.sin(this.now / 41) * 0.15) : 1;
      // 很多层很淡的圆叠起来：越靠近灯越亮，边缘慢慢淡出，看不出一圈一圈；光稍微往下落一点
      for (let i = n; i >= 1; i--) { const r = G.radius * Math.pow(i / n, 1.5); g.circle(x, y + r * 0.2, r).fill({ color, alpha: (strength * f) / n }); }
    }
  }

  /** 开发者用：把看不见的范围都画出来，方便找穿模。
   *  蓝框 = 物品的图片范围（也是点击范围）；绿点 = 宠物用这件家具时站的位置，短线是脸朝的方向；
   *  橙线 = 遮挡线（线以下盖在宠物前面）；黄点 = 发光的位置；红框 = 宠物的图片范围（也是点击范围），红点 = 脚底；
   *  紫线 = 地板线和各只宠物走的那条线。 */
  private placeCache: { at: number; worlds: sim.PlaceWorld[] } | null = null;
  private drawDebug() {
    const on = this.game.state.dev.enabled && !!this.game.state.dev.debugBoxes && !this.editMode;
    const g = this.debug.clear(); const used = new Set<string>();
    // 摆放规则用的框：棕色 = 家具和装饰的脚底，红色 = 要留空的地方（门前的路、猫的站位）。半秒量一次
    if (on) {
      if (!this.placeCache || this.now - this.placeCache.at > 500) this.placeCache = { at: this.now, worlds: ZONES.map((_, i) => this.placeWorld(i)) };
      this.placeCache.worlds.forEach((w, i) => {
        for (const b of w.foot) g.rect(zx(i) + b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).fill({ color: 0x8a5a3c, alpha: 0.25 }).stroke({ width: 1.5, color: 0x8a5a3c, alpha: 0.8 });
        for (const b of w.keepClear) g.rect(zx(i) + b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).fill({ color: 0xd9443a, alpha: 0.15 }).stroke({ width: 1.5, color: 0xd9443a, alpha: 0.7 });
      });
    }
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
        const pt = this.perchSpot(kind, i, PET_BASE * ASSETS.petScale * ADULT_MAX); if (pt) g.moveTo(x, y).lineTo(pt.x, pt.y).stroke({ width: 2, color: 0x1aa7b8, alpha: 0.8 }).circle(pt.x, pt.y, 6).fill(0x1aa7b8);
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
  /** 窗外的风景摆在玻璃后面：窗户挪了跟着挪，昼夜、天气、季节变了重画 */
  private syncWindowViews(env: Env) {
    for (const v of this.windowViews) {
      const w = v.win; const [a, b, c, d] = v.glass; const gw = w.width * (c - a), gh = w.height * (d - b);
      v.box.position.set(w.x - w.width / 2 + a * w.width, w.y - w.height + b * w.height);
      const sig = `${this.envKey(env)}|${Math.round(gw)}x${Math.round(gh)}`;
      if (sig !== v.sig) { v.sig = sig; const old = v.sp.texture; v.sp.texture = this.tex(drawWindowView(gw, gh, env, Math.round(w.x))); if (old !== Texture.EMPTY) { this.textures = this.textures.filter((t) => t !== old); old.destroy(true); } }
      v.sp.width = gw; v.sp.height = gh; v.box.visible = w.visible && w.alpha > 0;
      // 下雨（冬天是下雪，不画雨丝）：玻璃上的雨丝
      const g = v.rain.clear();
      if (env.weather === 'rain' && env.season !== 'winter') {
        const t = this.now / 1000;
        for (let i = 0; i < 12; i++) {
          const x = (i * 37.1 + t * 14) % gw, y = (i * 29.3 + t * (190 + (i % 4) * 30)) % Math.max(1, gh - 16);
          g.moveTo(x, y).lineTo(x - 2, y + 13).stroke({ width: 1.4, color: 0xe6f0f6, alpha: 0.8 });
        }
      }
    }
  }

  private drawWeather(env: Env) {
    const g = this.weather.clear();
    const first = zoneIndex('balcony'); if (first < 0) return;
    const rain = env.weather === 'rain';
    // 雨雪花瓣只落在露天的地方：屋顶那一层里屋顶上面的天空、院子、阳台屋檐下面以外的地方
    const rx = roofW(), bal = zoneIndex('balcony');
    const open = (x: number, y: number) => y < 0 ? x >= rx || y < roofWalk(worldToTop(x)).y - H - 14 : zoneAt(x) === bal ? y <= 430 : x >= rx;
    // 下雨：院子和阳台上的雨丝，还有屋里窗玻璃上的雨丝。冬天不下雨，改成雪下得更大
    if (rain && env.season !== 'winter') {
      const t = this.now / 1000, w = worldW(), bottom = geo.floorY + 110, top = -H;
      for (let i = 0; i < 700; i++) {
        const x = (i * 97.3 + t * 60) % w, y = top + ((i * 53.7 + t * (520 + (i % 5) * 40)) % (bottom - top));
        if (!open(x, y)) continue;
        g.moveTo(x, y).lineTo(x - 5, y + 20).stroke({ width: 1.6, color: 0xdfeaf2, alpha: 0.75 });
      }
      // 窗玻璃上的雨丝跟着窗户画（syncWindowViews）
      return;
    }
    // 春夏晴天的白天：院子里有两只蝴蝶（夏天其中一只是蜻蜓，在鱼塘上面转）
    const gi = zoneIndex('garden');
    if (gi >= 0 && env.time === 'day' && !rain && (env.season === 'spring' || env.season === 'summer')) {
      const t = this.now / 1000, k = zw(gi) / BASE_ZW;
      for (let i = 0; i < 2; i++) {
        const dragon = env.season === 'summer' && i === 1;
        const x = zx(gi) + (dragon ? 262 + Math.cos(t * 0.9) * 110 : 130 + i * 150 + Math.sin(t * 0.5 + i * 2) * 80) * k, y = geo.floorY + (dragon ? 60 + Math.sin(t * 1.8) * 16 : -40 + Math.sin(t * 1.3 + i) * 50 - i * 30);
        const flap = Math.abs(Math.sin(t * (dragon ? 30 : 12) + i)) * 9 + 3;
        if (dragon) g.moveTo(x - 12, y).lineTo(x + 12, y).stroke({ width: 3, color: 0x4f8fa8 }).ellipse(x, y - flap * 0.6, 9, 3).fill({ color: 0xdff1f7, alpha: 0.85 }).ellipse(x, y + flap * 0.6, 9, 3).fill({ color: 0xdff1f7, alpha: 0.85 });
        else g.poly([x, y, x - flap, y - 9, x - flap, y + 7]).fill(i ? 0xf2b84a : 0xe98aa6).poly([x, y, x + flap, y - 9, x + flap, y + 7]).fill(i ? 0xf6d06a : 0xf2b8c6).circle(x, y, 1.8).fill(0x5b4634);
      }
    }
    const kind = env.season === 'spring' ? 'petal' : env.season === 'autumn' ? 'leaf' : env.season === 'winter' ? 'snow' : env.time === 'night' ? 'firefly' : '';
    if (!kind) return;
    const x0 = zx(first) + 18, w0 = worldW() - x0, w = worldW(), top = -H + 40, bottom = geo.floorY + 60; const t = this.now / 1000;
    for (let i = 0; i < (rain && kind === 'snow' ? 700 : 300); i++) {
      const seed = i * 127.1; const speed = kind === 'snow' ? 26 + (i % 5) * 6 : kind === 'firefly' ? 0 : 40 + (i % 7) * 9;
      let x = ((seed * 3.7 + Math.sin(t * 0.7 + i) * 30 + t * (kind === 'leaf' ? 14 : 5)) % w + w) % w;
      let y = top + ((seed * 1.9 + t * speed) % (bottom - top));
      // 萤火虫只在阳台和院子那一带、地面上方飞（数量和原来一样）
      if (kind === 'firefly') { if (i >= 34) break; x = x0 + ((seed * 3.7) % w0) + Math.sin(t * 0.6 + i) * 22; y = geo.floorY - 60 - ((seed * 1.3) % 240) + Math.cos(t * 0.8 + i * 2) * 14; if (zoneAt(x) === first && y > 430) continue; }
      else if (!open(x, y)) continue; // 阳台有屋檐：屋檐下面那一块不飘；屋顶下面是屋里
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

    // 镜头：切层的时候上下抬（布置房间、调整位置时只能在地面）
    if (this.layer === 'roof' && (this.editMode || this.decorMode || this.bgMode)) this.scrollToZone(Math.max(0, zoneAt(this.camX + this.viewW / 2)));
    const lt = this.layer === 'roof' ? H : 0;
    if (this.lift !== lt) { this.lift += (lt - this.lift) * Math.min(1, dt / 140); if (Math.abs(lt - this.lift) < 0.5) this.lift = lt; this.applyCam(); }
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
    const inUse = new Set<string>();
    home.forEach((p, i) => {
      let a = this.actors.get(p.id);
      if (!a) { a = this.makeActor(p.id, i); this.actors.set(p.id, a); }
      a.lane = i;
      const set = this.game.spriteOf(p); if (!set) return;
      const weak = sim.isWeak(p);
      const sc = PET_BASE * ASSETS.petScale * sim.bodySize(p);
      if (a.inter && this.now >= a.inter.until) a.inter = null;
      if (this.roofStep(a, dt, weak)) { /* 在爬梯子或在屋顶上 */ }
      else if (a.inter && !weak) { /* 正在打哈欠或伸懒腰：做完再说 */ }
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
          else if (a.station === 'autoball') { const f = this.floorSpot('autoball', a.slot, this.scaleOf(a)); if (f) this.go(a, f[0], f[1]); else this.stop(a); } // 追着自己滚的球
          else { const lead = [...this.actors.values()].find((o) => o.ball?.leader); if (lead) this.go(a, Math.max(lo, Math.min(hi, lead.tx - lead.dir * 84)), lead.ty + 8); else this.stop(a); }
          if (!this.far(a)) this.setAction(a, 'play', 900);
        }
      } else if (a.pending && a.want && a.pending.action === 'eat' && this.now - a.want.since >= CONFIG.eating.maxWait && !this.reserve(a, a.want.kind)) {
        // 等太久还是没空位：不吃了（不会对着空气吃）
        a.pending = null; a.want = null; a.fast = false; this.setAction(a, 'idle', 1500);
      } else if (a.pending && a.want && this.now - a.want.since < (a.pending.action === 'eat' ? CONFIG.eating.maxWait : 40_000) && !this.reserve(a, a.want.kind)) {
        // 位置还被占着：面朝家具等一等（吃饭会一直等到有空位；别的最多等 40 秒，再等不到就原地做）
        const pos = objPos(ASSETS.objects[a.want.kind]); a.dir = pos.x >= a.x ? 1 : -1;
        if (a.action !== 'idle') { a.action = 'idle'; a.t0 = this.now; }
      } else if (a.pending && a.want && a.station) {
        a.want = null; // 空出来了，走过去（下一帧开始走）
      } else if (a.pending?.roof != null) {
        // 走到梯子底下了：开始往上爬
        a.climb = { t0: this.now, up: true, stay: a.pending.dur, slot: a.pending.roof }; a.pending = null; a.fast = false; a.want = null;
      } else if (a.pending) {
        a.want = null;
        const st = a.station ? STATIONS[a.station]?.[a.slot] ?? null : null;
        if (st?.perch && !(a.perch && a.perch.kind === a.station && a.perch.slot === a.slot) && this.perchSpot(a.station!, a.slot, sc)) {
          // 走到家具跟前了：先跳上去，落稳了再开始做动作
          a.dir = st.dir; a.hop = { t0: this.now, up: true, kind: a.station!, slot: a.slot }; a.t0 = this.now;
        } else {
          // 到位了：转向家具，开始做动作
          if (st) a.dir = st.dir;
          if (a.pending.dish) { const d = this.dishes.get(a.pending.dish); if (d) { a.dir = d.dir; d.started = true; d.endAt = this.now + a.pending.dur; } }
          if (a.pending.ball && a.station === 'ball') { a.ball = { until: this.now + a.pending.dur, leader: ![...this.actors.values()].some((o) => o !== a && o.ball?.leader), hop: true }; this.setAction(a, 'play', 1100); }
          else if (a.pending.ball && a.station === 'autoball') { a.ball = { until: this.now + a.pending.dur, leader: false, hop: true }; this.setAction(a, 'play', 1100); }
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
      let px = a.x, py = a.y, z = a.y, tilt = 0; let shown: ActionName = a.action;
      const on = a.hop ?? a.perch; const spot = on ? this.perchSpot(on.kind, on.slot, sc) : null;
      if (a.hop && spot) {
        const t0 = Math.min(1, (this.now - a.hop.t0) / HOP_MS), t = a.hop.up ? t0 : 1 - t0, e = t * t * (3 - 2 * t);
        px = a.x + (spot.x - a.x) * e; py = a.y + (spot.y - a.y) * e - Math.sin(Math.PI * t) * 46;
        // 跳的时候排在前面；进浴缸的后半程要落到浴缸前面那一层的后面
        z = (a.hop.kind === 'tub' || STATIONS[a.hop.kind]?.[a.hop.slot]?.inside) && t > 0.5 ? spot.z : Math.max(a.y, spot.z); shown = 'jump';
        if (Math.abs(spot.x - a.x) > 6) a.dir = (spot.x > a.x) === a.hop.up ? 1 : -1;
      } else if (a.perch && spot) { px = spot.x; py = spot.y; z = spot.z; }
      else if (a.climb) {
        // 爬梯子：贴着梯子从地上升到屋檐（第二张精灵图的爬梯动作做好之前，先用跳跃的四帧循环）
        const L = this.ladder(), t = Math.min(1, (this.now - a.climb.t0) / CONFIG.roof.climbMs), e = a.climb.up ? t : 1 - t;
        px = L.x; py = L.y + (L.topY - L.y) * e; z = 9000 + py; shown = 'jump';
      }
      else if (a.roof) { const w = roofWalk(a.roof.u); px = topToWorld(a.roof.u); py = w.y - H; z = 9000 + py; tilt = w.tilt; }
      else if (on) { a.perch = null; a.hop = null; } // 家具不在了（收起来了、进了调整模式）：回到地上
      if (spot && this.fronts.has(on!.kind)) inUse.add(on!.kind);
      if (a.inter && !a.hop) shown = a.inter.action;
      // 跳跃的四帧跟着跳的进度走（蹲、蹬、腾空、落地），不是按时间循环
      const frame = a.hop ? Math.min(3, Math.floor(((this.now - a.hop.t0) / HOP_MS) * 4)) : a.climb ? Math.floor(this.now / 150) % 4 : frameIndex(shown, this.now - (a.inter ? a.inter.t0 : a.t0));
      // 爬梯子：用第二张精灵图里的「爬梯子」；没有就用跳跃的四帧循环
      a.sprite.texture = (a.climb ? extraFrame(set, 'climb', this.now) : null) ?? set.tex[rowFor(set, shown)][frame];
      a.sprite.scale.set(sc * a.dir, sc); a.sprite.rotation = a.roof && a.action === 'walk' ? tilt : a.roof ? tilt * 0.5 : 0; // 斜坡上跟着坡度歪
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
      if (a.action === 'fish' && a.station === 'butterfly') {
        // 扑蝴蝶：一只蝴蝶在爪子前面上下翻飞
        const tt = this.now / 1000, bx = a.dir * (86 + Math.sin(tt * 2.3) * 22) * sc, by = (-120 + Math.sin(tt * 3.1) * 46) * sc, flap = Math.abs(Math.sin(tt * 14)) * 10 + 3;
        a.fx.poly([bx, by, bx - flap, by - 9, bx - flap, by + 7]).fill(0xf2b84a).poly([bx, by, bx + flap, by - 9, bx + flap, by + 7]).fill(0xf6d06a).circle(bx, by, 2).fill(0x5b4634);
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

    this.updateGuest(dt); this.watchMoments(); this.updateDishes();
    if (!this.decorChecked && this.objSprites.size && this.now > 1500 && !this.editMode) { this.decorChecked = true; this.tidyDecor(); }
    for (const [kind, front] of this.fronts) front.visible = inUse.has(kind);
    this.rollAutoBall(dt);

    // 玩具球：被带着跑的时候跟在带球那只的脚前面，一蹦一蹦；没人玩就留在原地
    const ballSp = this.objSprites.get('ball');
    if (ballSp && !this.editMode) {
      const lead = [...this.actors.values()].find((o) => o.ball?.leader);
      const base = objPos(ASSETS.objects.ball);
      if (lead) { this.ballX = lead.x + lead.dir * 62; this.ballY = lead.y + 6; ballSp.x += (this.ballX - ballSp.x) * Math.min(1, dt / 90); ballSp.y = this.ballY - Math.abs(Math.sin(this.now / 160)) * 16; }
      else { if (this.ballX !== null) ballSp.x = this.ballX; ballSp.y = this.ballY ?? base.y; }
      ballSp.zIndex = this.ballY ?? base.y;
    }
    this.updateLight(); this.drawShadows();
    this.drawGlow(env);
    this.syncWindowViews(env);
    this.drawDebug();

    // 镜头跟着刚被照顾的那只走一会儿
    if (this.follow) {
      const a = this.actors.get(this.follow.id);
      if (!a || this.now > this.follow.until || this.drag.on || this.layer === 'roof' || a.roof || a.climb) this.follow = null;
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
