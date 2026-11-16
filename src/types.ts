import type { DayTime, Season } from './config';
import type { StatKey } from './config';

export type RepeatKey = 'feed' | 'pet' | 'bath' | 'play';

export interface Pet {
  id: string;
  name: string;
  /** 精灵图的编号：default:<毛色> 或 custom:<id> */
  spriteId: string;
  /** 已经活了多久（游戏时间，受成长速度影响） */
  age: number;
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
  /** 狸花猫正在找它：什么时候有结果；null = 没在找 */
  searchUntil: number | null;
  tripId: string | null;
  repeats: Partial<Record<RepeatKey, { n: number; last: number }>>;
  hungryNotified: boolean;
  adoptedAt: number;
}

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
  settings: { notify: boolean };
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
  display: { souvenirs: string[]; postcards: string[] };
  /** 还没给主人看过的回家明信片 */
  pendingReturns: string[];
  dev: DevSettings;
}

export type GameEvent =
  | { type: 'return'; postcardId: string }
  | { type: 'letter'; postcardId: string }
  | { type: 'weak'; petId: string }
  | { type: 'ranAway'; petId: string }
  | { type: 'found'; petId: string }
  | { type: 'notFound'; petId: string }
  | { type: 'stage'; petId: string; stage: number }
  | { type: 'hungry'; petId: string };

export type Result = { ok: true; msg?: string } | { ok: false; msg: string };
