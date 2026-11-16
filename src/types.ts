import type { DayTime, Season, Trait, VisitorWho } from './config';
import type { StatKey } from './config';

export type RepeatKey = 'feed' | 'pet' | 'bath' | 'play';

export interface Pet {
  id: string;
  name: string;
  /** 精灵图的编号：default:<毛色> 或 custom:<id> */
  spriteId: string;
  /** 已经活了多久（游戏时间，受成长速度影响） */
  age: number;
  /** 性格 */
  trait: Trait;
  /** 上一次被照顾（喂、摸、洗、玩）的时刻 */
  lastCare: number;
  food: number;
  mood: number;
  clean: number;
  /** 进入虚弱的时刻；null = 没有虚弱 */
  weakSince: number | null;
  /** 旧版本里饿死的宠物（现在不会再死，只会离家出走）。留着是为了旧存档里的纪念 */
  dead: boolean;
  diedAt?: number;
  /** 离家出走的时刻；null = 在家或正常出门 */
  lostSince: number | null;
  /** 去邻居家回访了：去的是谁、什么时候回来；null = 没去 */
  outing?: { neighborId: string; until: number } | null;
  /** 狸花猫正在找它：什么时候有结果；null = 没在找 */
  searchUntil: number | null;
  tripId: string | null;
  repeats: Partial<Record<RepeatKey, { n: number; last: number }>>;
  hungryNotified: boolean;
  adoptedAt: number;
}

/** 访客想做的事：gift 送礼（fish 或 item）；trade 想用 wants 这种食物换 gives（纪念品编号，或 fish 小鱼干）；errand 托送信到 destId */
/** 院子里的一样小东西。x = 在院子里的左右位置（0–1） */
export interface Find { id: string; kind: string; from?: string; at: number; x: number; text?: string }

export interface Visitor {
  id: string; who: VisitorWho; kind: 'gift' | 'trade' | 'errand';
  arrivedAt: number; leaveAt: number;
  fish?: number; item?: string; wants?: string; gives?: string; destId?: string;
}

/** 一件装饰。x、y 是区域里的位置（和家具一样的坐标） */
export interface Decor { id: string; kind: string; zone: string | null; x: number; y: number }

export interface Trip {
  id: string;
  petIds: string[];
  bento: string;
  tool: string | null;
  goods: string[];
  startAt: number;
  returnAt: number;
  destId: string;
  /** 路上什么时候寄一张明信片回家（行程的 30%–70% 之间） */
  letterAt: number;
  letterSent: boolean;
  /** 这一趟顺路送信：送到之后的奖励 */
  errandReward?: number;
}

export interface Postcard {
  id: string;
  destId: string;
  petIds: string[];
  at: number;
  souvenir: string | null;
  /** letter = 路上寄回来的；不写 = 回家时带回来的 */
  kind?: 'letter';
  /** 背面的一句日记 */
  diary?: string;
  /** 拍下这张的季节和时段（决定明信片的色调） */
  season?: Season;
  time?: DayTime;
  /** 带出门的行李（影响明信片里的样子）；旧明信片没有 */
  tool?: string | null;
  /** 这张明信片的随机数：决定宠物站在哪、什么姿势。同一张明信片永远画成一样 */
  seed?: number;
  income: number;
  sold: string[];
  unsold: string[];
}

export interface DevSettings {
  enabled: boolean;
  speed: number;
  /** 离开游戏（退到桌面、关掉再开）的那段时间也按倍速算。默认关：只在游戏开着时加速 */
  background: boolean;
  /** 强制天气：auto = 跟着游戏里的天气 */
  weather: 'auto' | Weather;
  /** 强制的昼夜和季节；'auto' = 跟着游戏里的时间走 */
  time: 'auto' | 'day' | 'dusk' | 'night';
  season: 'auto' | 'spring' | 'summer' | 'autumn' | 'winter';
  /** 显示范围框：物品的图片范围、点击范围、站位、遮挡线、宠物脚底 */
  debugBoxes?: boolean;
  growth: number;
  decay: Record<StatKey, number>;
}

export interface GameState {
  /** 存档版本号，见 save.ts */
  v: number;
  /** 第一次打开游戏的时间 */
  createdAt: number;
  /** 季节循环的起点：这一刻是春天的第一天。之后每 CONFIG.season.days 天换一季 */
  seasonStart: number;
  /** notify = 提醒；showSeason = 主界面显示现在是什么季节第几天；seasonMode = 季节跟游戏里的循环走（cycle）还是跟现实的月份走（real） */
  settings: { notify: boolean; showSeason: boolean; seasonMode: 'cycle' | 'real' };
  /** 游戏里的「现在」。平时等于真实时间，开了倍速会跑得更快。 */
  clock: number;
  /** 上次存档时的真实时间，用来补算离线期间的变化 */
  lastReal: number;
  fish: number;
  slots: number;
  pets: Pet[];
  trips: Trip[];
  postcards: Postcard[];
  souvenirs: Record<string, number>;
  inv: Record<string, number>;
  owned: Record<string, boolean>;
  pond: (number | null)[];
  lastCheckin: string;
  /** 主人自己挑的展示内容：收藏柜上摆哪几件、相册墙上挂哪几张。空 = 自动用最新的 */
  /** 图鉴：每个地点收集过哪些变体（「季节-时段」）。明信片删了，这里的记录也还在 */
  variants: Record<string, string[]>;
  /** 已经领过的里程碑 */
  milestones: string[];
  /** 家里的装饰。zone = null 表示收起来了 */
  decor: Decor[];
  /** 现在在门口的访客 */
  visitors: Visitor[];
  /** 访客今天还会来几个（每天第一次打开时定下来）、是哪一天定的、上一个是什么时候来的 */
  visitorQuota: number; visitorDay: string; lastVisitorAt: number;
  /** 已经接下、还没送到的信 */
  errand: { destId: string; reward: number; from: VisitorWho; expiresAt: number } | null;
  /** 每两只宠物之间的友情值。键 = 两个编号按字母顺序用 | 连起来 */
  friends: Record<string, number>;
  display: { souvenirs: string[]; postcards: string[] };
  /** 家具和装饰的皮肤：skins = 每种东西现在用哪一款（没写 = 默认款）；skinsOwned = 买过哪些款（默认款不用买） */
  skins: Record<string, string>; skinsOwned: Record<string, string[]>;
  /** 房间风格：现在用哪一套、买过哪些（默认的不用买） */
  room: string; roomsOwned: string[];
  /** 邻居：now = 正在家里串门的那只（null = 没有）；bonds = 和每只邻居有多熟；day、quota、last = 今天还会来几次、上次什么时候来的 */
  hood: { now: { id: string; arrivedAt: number; leaveAt: number; met: string[]; ate: boolean } | null; bonds: Record<string, number>; day: string; quota: number; last: number;
    /** 宠物去邻居家回来讲的小见闻（留最近 12 条） */
    stories: { petId: string; neighborId: string; text: string; at: number }[] };
  /** 访客的好感：帮每位访客办成过几件事；领过哪些回礼（访客 + 第几档） */
  favor: Record<string, number>; favorClaimed: string[];
  /** 院子里等着捡的小东西（邻居留下的、季节活动的） */
  finds: Find[];
  /** 捡到的纪念：种类:来自谁 → 几个 */
  keepsakes: Record<string, number>;
  /** 猫爬架的三层（顶层、中层、底层）各指定给哪只宠物；null = 谁都可以上去 */
  cattree: (string | null)[];
  /** 还没给主人看过的回家明信片 */
  pendingReturns: string[];
  dev: DevSettings;
}

export type GameEvent =
  | { type: 'return'; postcardId: string }
  | { type: 'letter'; postcardId: string }
  | { type: 'visitor'; visitorId: string }
  | { type: 'visitorLeft'; who: VisitorWho }
  | { type: 'errandDone'; destId: string; reward: number }
  | { type: 'weak'; petId: string }
  | { type: 'ranAway'; petId: string }
  | { type: 'found'; petId: string }
  | { type: 'notFound'; petId: string }
  | { type: 'stage'; petId: string; stage: number }
  | { type: 'hungry'; petId: string }
  | { type: 'neighbor'; id: string }
  | { type: 'neighborLeft'; id: string; find?: string }
  | { type: 'outingBack'; petId: string; neighborId: string; text: string };

export type Result = { ok: true; msg?: string } | { ok: false; msg: string };

export type Weather = 'clear' | 'rain';
