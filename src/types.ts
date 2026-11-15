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
  dead: boolean;
  diedAt?: number;
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
}

export interface Postcard {
  id: string;
  destId: string;
  petIds: string[];
  at: number;
  souvenir: string | null;
  income: number;
  sold: string[];
  unsold: string[];
}

export interface DevSettings {
  enabled: boolean;
  speed: number;
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
  /** 还没给主人看过的回家明信片 */
  pendingReturns: string[];
  dev: DevSettings;
}

export type GameEvent =
  | { type: 'return'; postcardId: string }
  | { type: 'weak'; petId: string }
  | { type: 'died'; petId: string }
  | { type: 'stage'; petId: string; stage: number }
  | { type: 'hungry'; petId: string };

export type Result = { ok: true; msg?: string } | { ok: false; msg: string };
