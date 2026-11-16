// ============================================================
// 所有数值都集中在这个文件里。改完保存，重新打包就生效。
// 时间单位：毫秒。用下面的 MIN / HOUR / DAY 来写会比较好读。
// ============================================================

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type StatKey = 'food' | 'mood' | 'clean';
/** 占位图的配色。墙奶白、地板暖木，点缀用鼠尾草绿、雾蓝、珊瑚红、芥末黄，整体低饱和。 */
export const PALETTE = {
  wall: '#F3E9DA', floor: '#C99A6B', floorLine: '#A87B4F', ceiling: '#E6D8C2', post: '#E4D5BE',
  sage: '#A8B89A', mist: '#9FB4C7', coral: '#E08E79', mustard: '#D9A94A',
  ink: '#8A5A3C', wood: '#BC8E62', woodDark: '#9C7048', white: '#FBF6EC', glass: '#CFDDE6', sky: '#D5E3EA',
};

export const ZONES = [
  { id: 'door', name: '门口' }, { id: 'kitchen', name: '厨房' }, { id: 'living', name: '客厅' },
  { id: 'bath', name: '浴室' }, { id: 'bedroom', name: '卧室' }, { id: 'shelf', name: '收藏柜' },
  { id: 'balcony', name: '阳台' }, { id: 'garden', name: '院子' },
] as const;
export type ZoneId = (typeof ZONES)[number]['id'];

export type DestType = 'city' | 'sea' | 'forest' | 'rain' | 'mountain';
export type DayTime = 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const TIME_NAMES: Record<DayTime, string> = { day: '白天', dusk: '傍晚', night: '夜晚' };
export const SEASON_NAMES: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

export const CONFIG = {
  version: '0.4.0 (build-4)',

  // ---------- 宠物数量 ----------
  maxPets: 5,
  /** 第 N 个空位的解锁价格（小鱼干）。第 1 个免费。 */
  slotUnlockCost: [0, 80, 200, 400, 800],

  // ---------- 开局 ----------
  startFish: 60,
  startItems: { kibble: 4, can: 1, cookie: 1 } as Record<string, number>,
  startPet: { name: '小橘', color: 'orange' },

  // ---------- 三个状态值（0–100） ----------
  stats: {
    start: { food: 80, mood: 80, clean: 80 },
    /** 每小时下降多少 */
    decayPerHour: { food: 3, mood: 1.25, clean: 1.75 },
    /** 新手保护：第一只宠物在幼年期，饱食下降速度乘以这个数 */
    starterFoodDecay: 0.5,
    /** 低于这个值算「饿」或「脏」 */
    lowThreshold: 30,
    /** 饿的时候，心情下降额外加快的比例（0.75 = 快 75%） */
    moodDecayExtraWhenHungry: 0.75,
    /** 脏的时候，心情下降额外加快的比例 */
    moodDecayExtraWhenDirty: 0.5,
    /** 保底线：放了自动喂食机后，饱食度不低于这个值（要比 lowThreshold 高，否则有喂食机也一直算饿） */
    feederFoodFloor: 35,
    /** 保底线：家里有同伴时，心情不低于这个值 */
    companionMoodFloor: 15,
    /** 保底线：没有同伴，但家里有猫抓板或玩具球时，宠物会自己玩，心情不低于这个值 */
    toyMoodFloor: 15,
    /** 保底线：宠物自己舔毛，干净值不低于这个值 */
    selfGroomCleanFloor: 15,
    /** 饱食度低于这个值时提醒主人 */
    notifyFoodBelow: 25,
  },

  // ---------- 性格 ----------
  traits: {
    /** 贪吃：饱食掉得快，吃东西时额外加心情 */
    glutton: { foodDecay: 1.2, eatMood: 6 },
    /** 黏人：被摸时心情加得多；超过 lonelyAfter 没人理，心情掉得快 */
    clingy: { petMood: 1.5, lonelyAfter: 3 * HOUR, lonelyMoodDecay: 1.3 },
    /** 爱干净：干净值掉得慢，自己舔毛的保底线更高 */
    tidy: { cleanDecay: 0.7, cleanFloorBonus: 15 },
    /** 爱冒险：更容易去远的地方（高一档的目的地权重乘以 farWeight），纪念品概率更高 */
    adventurer: { farWeight: 2.5, souvenirBonus: 0.1 },
  },

  // ---------- 友情 ----------
  friendship: {
    /** 一起出门一趟 */
    perTrip: 25,
    /** 自己凑在一起玩一次 */
    perPlay: 5,
    /** 到这个数就是好朋友（也是上限） */
    best: 100,
    /** 好朋友一起玩，加的心情乘以这个数 */
    bestPlayMult: 2,
    /** 好朋友结伴出门，纪念品概率再加这么多 */
    bestSouvenirBonus: 0.1,
  },

  // ---------- 明信片的色调（季节 × 时段 = 12 种变体，用代码调色，不用新图） ----------
  cardTint: {
    /** 季节：盖一层这个颜色（柔光），alpha 越大越明显 */
    season: {
      spring: { color: '#ff9fb8', alpha: 0.34 },
      summer: { color: '#fff1a8', alpha: 0.30 },
      autumn: { color: '#ff8a2a', alpha: 0.36 },
      winter: { color: '#7fb0ff', alpha: 0.36 },
    },
    /** 时段：warm = 暖色柔光；dark = 压暗（正片叠底）；stars = 画多少颗星星 */
    time: {
      day: { warm: 0, dark: 0, darkColor: '#000000', stars: 0 },
      dusk: { warm: 0.42, dark: 0.16, darkColor: '#7a3b2a', stars: 0 },
      night: { warm: 0, dark: 0.58, darkColor: '#1b2a5c', stars: 26 },
    },
    warmColor: '#ff7a3c',
  },

  // ---------- 图鉴里程碑 ----------
  /** need：要收集到多少；fish：奖励的小鱼干；decor：奖励的特殊装饰（不在商店卖） */
  milestones: [
    { id: 'v10', kind: 'variants', need: 10, fish: 50 },
    { id: 'v30', kind: 'variants', need: 30, fish: 120, decor: 'globe' },
    { id: 'v60', kind: 'variants', need: 60, fish: 250 },
    { id: 'v120', kind: 'variants', need: 120, fish: 600, decor: 'goldframe' },
    { id: 's5', kind: 'souvenirs', need: 5, fish: 80 },
    { id: 's10', kind: 'souvenirs', need: 10, fish: 200 },
    { id: 's20', kind: 'souvenirs', need: 20, fish: 500, decor: 'trophy' },
  ] as { id: string; kind: 'variants' | 'souvenirs'; need: number; fish: number; decor?: string }[],

  // ---------- 房间装饰 ----------
  decor: {
    /** 同一种装饰最多买几件 */
    maxPerKind: 4,
    /** 每个区域最多摆几件 */
    maxPerZone: 8,
  },

  // ---------- 访客 ----------
  visitors: {
    /** 每天来 0、1、2 个访客的可能性（加起来是 1） */
    perDayChance: [0.25, 0.5, 0.25],
    /** 没人理的话，待多久自己走 */
    stay: 4 * HOUR,
    /** 同一天两个访客之间至少隔多久 */
    gap: 2 * HOUR,
    /** 三类事各占多少（送礼、换东西、托送信） */
    kindWeight: { gift: 0.45, trade: 0.3, errand: 0.25 },
    /** 小礼物：小鱼干的范围；或者有这么大的可能送一样东西 */
    giftFish: [8, 20] as [number, number],
    giftItemChance: 0.4,
    giftItems: ['kibble', 'can', 'fry', 'treat'],
    /** 换东西：想要的食物；全部稀有纪念品都有了，就改给这么多小鱼干 */
    tradeWants: ['can', 'feast'],
    tradeFallbackFish: 60,
    /** 托送信：送到之后的奖励；接了信之后多久没送就作废 */
    errandFish: [40, 70] as [number, number],
    errandExpire: 3 * DAY,
  },

  // ---------- 动作要做多久（毫秒，真实时间） ----------
  durations: {
    eat: 10_000,
    bath: 15_000,
    /** 主人用逗猫棒（或空手）陪玩 */
    wand: 10_000,
    /** 自己抓猫抓板：在这个范围里随机 */
    scratcher: [5_000, 15_000] as [number, number],
    /** 追球：带着球到处跑，玩完球留在原地 */
    ball: [18_000, 22_000] as [number, number],
    /** 被摸 */
    pet: 2_200,
    /** 在鱼塘边用爪子捞鱼 */
    fish: [10_000, 20_000] as [number, number],
    /** 跳到沙发、床、窗台、猫爬架上待多久 */
    perch: [9_000, 18_000] as [number, number],
  },

  // ---------- 互动 ----------
  actions: {
    petMood: 15,
    bathClean: 60,
    /** 主人陪玩：空手逗只加一点，买了逗猫棒加得多 */
    playMoodHand: 10,
    playMoodWand: 24,
    /** 两只宠物自己一起玩时，各自加多少心情 */
    companionPlayMood: 3,
    /** 同一动作效果递减：每连续做一次，效果乘以这个数 */
    repeatFactor: 0.5,
    /** 距离上次同一动作超过这么久，效果恢复正常 */
    repeatCooldown: 30 * MIN,
  },

  // ---------- 成长 ----------
  growth: {
    stageNames: ['幼年', '青年', '壮年'],
    /** 每个阶段持续多久 */
    stageDuration: 7 * DAY,
    /** 三个阶段的体型缩放（共用一套序列帧） */
    stageScale: [0.8, 0.9, 1],
  },

  // ---------- 虚弱与离家出走 ----------
  weak: {
    /** 饱食归零后，各阶段能撑多久；撑不住就离家出走 */
    timeToDeath: [3 * DAY, 5 * DAY, 7 * DAY],
    /** 虚弱时被喂食救回，心情扣多少 */
    rescueMoodPenalty: 40,
  },

  // ---------- 离家出走：请狸花猫找回来 ----------
  runaway: {
    /** 狸花猫出去找一趟要多久 */
    searchTime: 2 * HOUR,
    /** 找不到的概率 */
    failChance: 0.2,
    /** 找回来时，三个状态各自是这个范围里的随机数 */
    returnStatMin: 1,
    returnStatMax: 30,
  },

  // ---------- 出门 ----------
  travel: {
    /** 结伴出门一趟最多几只 */
    maxCompanions: 2,
    /** 行李箱最多放几件货物 */
    goodsCapacity: 3,
    /** 回家时干净值降多少 */
    cleanDropOnReturn: 20,
    /** 心情低于这个值不愿意出门 */
    moodRefuseBelow: 20,
    /** 心情低于这个值，带回纪念品的概率减半 */
    moodFewerBelow: 50,
    souvenirBaseChance: 0.5,
    /** 带回纪念品时，是稀有那一件的概率 */
    souvenirRareChance: 0.25,
    /** 相册上限 = 地点数 × 这个数（现在 10 个地方就是 50 张）。每趟出门有 2 张明信片：路上寄 1 张 + 带回 1 张 */
    albumPerDest: 5,
    /** 路上寄明信片的时间点：行程进行到这个比例之间的随机一刻 */
    letterWindow: [0.3, 0.7] as [number, number],
    /** 收藏柜上最多摆几件、相册墙上最多挂几张 */
    displaySouvenirs: 9,
    displayPostcards: 4,
    souvenirToolMatchBonus: 0.25,
    souvenirCompanionBonus: 0.1,
    /** 选目的地时的权重 */
    destWeightSameTier: 3,
    destWeightToolMatch: 6,
  },

  // ---------- 鱼塘 ----------
  pond: {
    slots: 3,
    growTime: 6 * HOUR,
    fishPerFry: 18,
  },

  // ---------- 季节 ----------
  season: {
    /** 每个季节持续现实里的几天。4 季一轮，从春天开始：春 → 夏 → 秋 → 冬 → 春…… */
    days: 7,
  },

  // ---------- 傍晚和夜晚的光线 ----------
  light: {
    /** 整个画面乘上这个颜色（正片叠底，不是盖一层半透明的颜色，所以不会发灰）：越接近白色变化越小。
     *  indoor = 屋里，outdoor = 阳台和院子 */
    dusk: { indoor: '#F8E2CC', outdoor: '#F8E0CC' },
    night: { indoor: '#B8A59F', outdoor: '#A6ACD2' },
    /** 灯周围的暖色光晕：颜色、半径、最亮处的强度（0–1）；傍晚灯刚亮，强度再乘以 duskStrength */
    glow: { color: '#FFC977', radius: 180, strength: 0.5, duskStrength: 0.35 },
  },

  // ---------- 每日签到 ----------
  checkinFish: 30,

  // ---------- 背屏（小米 17 Pro Max） ----------
  backScreen: {
    width: 976,
    height: 596,
    /** 摄像头占掉的区域：左边 296 像素。这是社区项目 Back Screen Studio 实测的数字，我没有在实机上核对过 */
    cameraArea: { x: 0, y: 0, w: 296, h: 596 },
    petMood: 5,
  },

  // ---------- 开发者模式默认值 ----------
  dev: {
    speedOptions: [1, 10, 60, 600, 3600],
    growthOptions: [1, 10, 100, 1000],
    decayOptions: [0, 0.5, 1, 2, 5, 20],
  },

  // ---------- 房间 ----------
  room: {
    /** 每个区域的宽度。一共 8 个区域 = 3456；其中前 5 个（门口到卧室）= 2160，配 720 的高度正好是 3:1 的背景长图 */
    zoneWidth: 432,
    height: 720,
    floorY: 560,
    /** 横屏时把墙的最上面裁掉这么多，让画面放大一些 */
    landscapeCropTop: 60,
    /** 门的高度（只用来换算宠物大小；调整门的点击区域不会影响宠物） */
    doorHeight: 392,
    /** 壮年宠物的身高大约是门高的多少（幼年、青年再按 stageScale 缩小） */
    petHeightOfDoor: 0.36,
    /** 宠物在 256 的格子里大约占多高（用来换算上面的比例） */
    petCellFill: 0.7,
    /** 几点到几点宠物会去睡觉 */
    sleepFromHour: 22,
    sleepToHour: 7,
  },
};

// ============================================================
// 商店里的东西
// ============================================================

export interface FoodDef { id: string; name: string; icon: string; price: number; restore: number; tripTime: number; tier: 1 | 2 | 3; desc: string }
export interface ToolDef { id: string; name: string; icon: string; price: number; type: DestType; desc: string }
export interface GoodsDef { id: string; name: string; icon: string; price: number; sellMin: number; sellMax: number; sellChance: number }
export interface GearDef { id: string; name: string; icon: string; price: number; desc: string }

/** 食物同时也是出门的便当：tripTime = 能走多久，tier = 能走多远 */
export const FOODS: FoodDef[] = [
  { id: 'kibble', name: '猫粮', icon: '🥣', price: 5, restore: 25, tripTime: 30 * MIN, tier: 1, desc: '饱食 +25｜便当：近处，30 分钟' },
  { id: 'can', name: '鱼罐头', icon: '🥫', price: 9, restore: 50, tripTime: 2 * HOUR, tier: 2, desc: '饱食 +50｜便当：中等距离，2 小时' },
  { id: 'feast', name: '豪华便当', icon: '🍱', price: 15, restore: 90, tripTime: 6 * HOUR, tier: 3, desc: '饱食 +90｜便当：远方，6 小时' },
];

export const TOOLS: ToolDef[] = [
  { id: 'camera', name: '小相机', icon: '📷', price: 30, type: 'city', desc: '更容易去城市' },
  { id: 'float', name: '泳圈', icon: '🛟', price: 35, type: 'sea', desc: '更容易去海边' },
  { id: 'umbrella', name: '雨伞', icon: '☂️', price: 35, type: 'rain', desc: '更容易去多雨的高原和雨林' },
  { id: 'boots', name: '登山靴', icon: '🥾', price: 45, type: 'mountain', desc: '更容易去山里' },
  { id: 'tent', name: '小帐篷', icon: '⛺', price: 45, type: 'forest', desc: '更容易去丛林里的古迹' },
];

/** 请狸花猫帮忙找回离家出走的宠物时要给它的东西 */
export const TREAT = { id: 'treat', name: '猫条', icon: '🍢', price: 40, desc: '给狸花猫，请它把离家出走的宠物找回来' };

export const GOODS: GoodsDef[] = [
  { id: 'cookie', name: '小饼干', icon: '🍪', price: 10, sellMin: 14, sellMax: 22, sellChance: 0.8 },
  { id: 'bell', name: '手工铃铛', icon: '🔔', price: 30, sellMin: 40, sellMax: 65, sellChance: 0.65 },
  { id: 'yarn', name: '毛线团', icon: '🧶', price: 60, sellMin: 80, sellMax: 130, sellChance: 0.5 },
];

export const FRY = { id: 'fry', name: '鱼苗', icon: '🐟', price: 6 };

/** 只买一次的东西 */
export const GEAR: GearDef[] = [
  { id: 'feeder', name: '自动喂食机', icon: '⚙️', price: 180, desc: '放在厨房，饱食度不会低于 35，不会再挨饿' },
  { id: 'wand', name: '逗猫棒', icon: '🪶', price: 60, desc: '陪它玩的时候用：玩耍从 +10 心情变成 +24' },
  { id: 'scratcher', name: '猫抓板', icon: '🪵', price: 120, desc: '放在客厅，宠物会自己去抓，心情不会低于 15' },
  { id: 'ball', name: '玩具球', icon: '⚽', price: 40, desc: '宠物会自己追着玩，两只还会一起玩；心情不会低于 15' },
  { id: 'cattree', name: '猫爬架', icon: '🗼', price: 260, desc: '放在客厅，三层，最多三只一起待着；点它可以指定谁待在哪一层' },
  { id: 'pendantDoor', name: '门口吊灯', icon: '💡', price: 100, desc: '挂在门口的天花板上，天黑了会亮' },
  { id: 'pendantShelf', name: '收藏柜吊灯', icon: '🏮', price: 100, desc: '挂在收藏柜那一间，天黑了会亮' },
  { id: 'bedlamp', name: '床头灯', icon: '🛋️', price: 70, desc: '放在卧室的床头柜上，天黑了会亮' },
];

// ============================================================
// 目的地与纪念品
// ============================================================

export interface DestDef { id: string; name: string; country: string; type: DestType; tier: 1 | 2 | 3; /** [普通, 稀有] */ souvenirs: [string, string] }

/** 目的地：先做东南亚的 10 个。tier = 要多大的便当才走得到。更远的地区以后配合交通工具再加。 */
export const DESTS: DestDef[] = [
  { id: 'singapore', name: '新加坡', country: '新加坡', type: 'city', tier: 1, souvenirs: ['merlion', 'kaya'] },
  { id: 'penang', name: '槟城', country: '马来西亚', type: 'city', tier: 1, souvenirs: ['whitecoffee', 'kuihmould'] },
  { id: 'langkawi', name: '兰卡威', country: '马来西亚', type: 'sea', tier: 1, souvenirs: ['shellchime', 'eaglefeather'] },
  { id: 'bangkok', name: '曼谷', country: '泰国', type: 'city', tier: 2, souvenirs: ['thaitea', 'elephant'] },
  { id: 'chiangmai', name: '清迈', country: '泰国', type: 'mountain', tier: 2, souvenirs: ['paperumbrella', 'krathong'] },
  { id: 'bali', name: '巴厘岛', country: '印度尼西亚', type: 'sea', tier: 2, souvenirs: ['frangipani', 'mask'] },
  { id: 'cameron', name: '金马仑高原', country: '马来西亚', type: 'rain', tier: 2, souvenirs: ['blacktea', 'strawberryjam'] },
  { id: 'angkor', name: '吴哥窟', country: '柬埔寨', type: 'forest', tier: 3, souvenirs: ['rubbing', 'lotusincense'] },
  { id: 'halong', name: '下龙湾', country: '越南', type: 'sea', tier: 3, souvenirs: ['nonla', 'pearl'] },
  { id: 'borneo', name: '婆罗洲雨林', country: '马来西亚', type: 'rain', tier: 3, souvenirs: ['pitcherplant', 'hornbill'] },
];

export interface SouvenirDef { name: string; icon: string; rare: boolean; desc: string }

/** 纪念品：每个地方两件，一件普通一件稀有，不会重复获得。icon 现在是占位的表情符号。 */
export const SOUVENIRS: Record<string, SouvenirDef> = {
  merlion: { name: '鱼尾狮摆件', icon: '🦁', rare: false, desc: '巴掌大的鱼尾狮，据说对着它许愿会有好天气。' },
  kaya: { name: '咖椰酱', icon: '🍯', rare: true, desc: '椰奶和斑斓叶熬的酱，抹在烤面包上是新加坡的早晨。' },
  whitecoffee: { name: '白咖啡', icon: '☕', rare: false, desc: '槟城老街咖啡店的招牌，香而不苦。' },
  kuihmould: { name: '娘惹糕模具', icon: '🥮', rare: true, desc: '刻着花纹的木头模子，压出来的糕点每一块都一样好看。' },
  shellchime: { name: '贝壳风铃', icon: '🐚', rare: false, desc: '海风一吹就叮叮响，像把兰卡威的海带回了家。' },
  eaglefeather: { name: '巨鹰羽毛书签', icon: '🪶', rare: true, desc: '兰卡威是鹰的岛。这片羽毛是它在沙滩上捡到的。' },
  thaitea: { name: '泰式奶茶罐', icon: '🧋', rare: false, desc: '橙红色的茶叶罐，泡出来又甜又浓。' },
  elephant: { name: '小象木雕', icon: '🐘', rare: true, desc: '手心大的柚木小象，鼻子向上翘，寓意好运。' },
  paperumbrella: { name: '手工纸伞', icon: '🏮', rare: false, desc: '清迈博桑村的油纸伞，伞面是手画的花。' },
  krathong: { name: '水灯', icon: '🪷', rare: true, desc: '水灯节放进河里的莲花灯。它舍不得放，带回来了。' },
  frangipani: { name: '鸡蛋花发夹', icon: '🌼', rare: false, desc: '巴厘岛到处都是鸡蛋花，别在耳朵边刚刚好。' },
  mask: { name: '木雕面具', icon: '🎭', rare: true, desc: '巴龙舞用的面具，眼睛瞪得圆圆的，其实是守护神。' },
  blacktea: { name: '高原红茶', icon: '🍵', rare: false, desc: '云雾里的茶园采下来的茶，带一点花香。' },
  strawberryjam: { name: '草莓果酱', icon: '🍓', rare: true, desc: '金马仑高原凉快，草莓长得好。这一罐是当天现熬的。' },
  rubbing: { name: '砂岩拓片', icon: '🗿', rare: false, desc: '从吴哥的浮雕上拓下来的花纹，一千年前的手艺。' },
  lotusincense: { name: '莲花香', icon: '🪔', rare: true, desc: '寺庙门口的老奶奶送的，点起来满屋都是清香。' },
  nonla: { name: '斗笠', icon: '👒', rare: false, desc: '越南的尖顶斗笠，遮太阳也挡雨。它戴着有点大。' },
  pearl: { name: '下龙湾珍珠', icon: '🦪', rare: true, desc: '海湾里养出来的珍珠，对着光看有淡淡的粉色。' },
  pitcherplant: { name: '猪笼草画片', icon: '🪴', rare: false, desc: '雨林里会吃虫子的植物。真的不能带，只好带一张画。' },
  hornbill: { name: '犀鸟木雕', icon: '🦜', rare: true, desc: '婆罗洲的神鸟，大大的嘴上顶着一个头盔。' },
};

/** 默认宠物可选的毛色 */
/** 花纹：条纹、纯色、三花、玳瑁、奶牛、重点色（暹罗那种脸和四肢深色） */
export type CoatPattern = 'stripes' | 'solid' | 'calico' | 'tortie' | 'cow' | 'point';
export const PATTERN_NAMES: Record<CoatPattern, string> = { stripes: '条纹', solid: '纯色', calico: '三花', tortie: '玳瑁', cow: '奶牛', point: '重点色' };
export interface Coat {
  name: string; body: string; shade: string; belly: string; line: string;
  /** 不写 = 条纹 */
  pattern?: CoatPattern;
  /** 花斑的第二、第三种颜色；重点色的脸和四肢用 c2 */
  c2?: string; c3?: string;
  /** 眼睛颜色，不写 = 深棕 */
  eye?: string;
  /** 长毛 */
  long?: boolean;
}
/** 内置的毛色和品种。加新的：在这里加一行，再到 assets.config.ts 的 pets 里配上图片路径（没有图片就用代码画的占位图）。 */
export const FUR_COLORS: Record<string, Coat> = {
  orange: { name: '橘猫', body: '#F0994A', shade: '#D67A30', belly: '#FBE6CB', line: '#9A5A2E' },
  grey: { name: '灰猫', body: '#A9B0B8', shade: '#868E98', belly: '#EEF0F2', line: '#6B6F78' },
  cream: { name: '奶白', body: '#F6E7CF', shade: '#E3CBA6', belly: '#FFF8EC', line: '#B08A5A' },
  black: { name: '黑猫', body: '#5A5560', shade: '#3F3B45', belly: '#8B8590', line: '#2E2A33', pattern: 'solid', eye: '#E0B040' },
  tabby: { name: '狸花', body: '#A89A82', shade: '#5F5444', belly: '#EDE6D8', line: '#4E4436', eye: '#8DAA4E' },
  calico: { name: '三花', body: '#FBF6EC', shade: '#E4DACA', belly: '#FFFFFF', line: '#7A6A5A', pattern: 'calico', c2: '#F0994A', c3: '#4A4550' },
  tortie: { name: '玳瑁', body: '#4E434A', shade: '#3A3138', belly: '#8A7A78', line: '#2A2228', pattern: 'tortie', c2: '#D98A3D', c3: '#F2C078', eye: '#E0B040' },
  cow: { name: '奶牛', body: '#FBF8F2', shade: '#E2DDD2', belly: '#FFFFFF', line: '#5A5560', pattern: 'cow', c2: '#3F3B45' },
  siamese: { name: '暹罗', body: '#F3E6D0', shade: '#DDCBAE', belly: '#FBF3E4', line: '#6B5143', pattern: 'point', c2: '#6B5143', eye: '#5E9BD6' },
  persian: { name: '波斯', body: '#FAF7F0', shade: '#E3DDD0', belly: '#FFFFFF', line: '#9A8F80', pattern: 'solid', long: true, eye: '#E0A83A' },
};

/** 自己捏的猫：花纹 + 三种颜色 + 眼睛颜色 + 长短毛。存在 spriteId 里：look:花纹|主色|第二色|第三色|眼睛|长毛 */
export interface Look { pattern: CoatPattern; body: string; c2: string; c3: string; eye: string; long: boolean }
export const DEFAULT_LOOK: Look = { pattern: 'stripes', body: '#F0994A', c2: '#FBF6EC', c3: '#4A4550', eye: '#3B2A22', long: false };
export const encodeLook = (l: Look) => `look:${[l.pattern, l.body, l.c2, l.c3, l.eye, l.long ? 1 : 0].join('|')}`;
export function decodeLook(spriteId: string): Look | null {
  if (!spriteId.startsWith('look:')) return null;
  const [pattern, body, c2, c3, eye, long] = spriteId.slice(5).split('|'); const ok = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c ?? '');
  if (!(pattern in PATTERN_NAMES) || ![body, c2, c3, eye].every(ok)) return null;
  return { pattern: pattern as CoatPattern, body, c2, c3, eye, long: long === '1' };
}
const mix = (hex: string, to: number, t: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + to * t).toString(16).padStart(2, '0')).join('');
/** 把捏出来的样子补成一套完整的颜色（阴影、肚皮、描线是从主色算出来的） */
export function coatOfLook(l: Look): Coat {
  return { name: '自定义', body: l.body, shade: mix(l.body, 0, 0.2), belly: mix(l.body, 255, 0.6), line: mix(l.body, 0, 0.55), pattern: l.pattern, c2: l.c2, c3: l.c3, eye: l.eye, long: l.long };
}

/** 不能领养的角色用的毛色：狸花猫（帮忙找回离家出走的宠物） */
export const NPC_COLORS: Record<string, Coat> = {
  tabby: { name: '狸花猫', body: '#A89A82', shade: '#6F6351', belly: '#EDE6D8', line: '#4E4436' },
};

// ============================================================
// 上传规范：精灵图每格 256×256，每行一个动作，每行 4 帧
// ============================================================

export const SPRITE = {
  cell: 256,
  framesPerRow: 4,
  /** 行的顺序。前 5 行必须有，后 3 行可以没有。 */
  rows: ['idle', 'walk', 'eat', 'sleep', 'happy', 'bath', 'lick', 'play'] as const,
  rowNames: { idle: '待机', walk: '走路', eat: '吃东西', sleep: '睡觉', happy: '开心（被摸）', bath: '洗澡', lick: '舔毛', play: '玩耍' } as Record<string, string>,
  requiredRows: 5,
  /** 可选动作缺了时用哪个代替 */
  fallback: { bath: 'idle', lick: 'idle', play: 'happy' } as Record<string, string>,
  /** 拼装精灵图时：宠物最高的一帧占格子高度的多少（默认值，工具里每个动作可以单独调） */
  cellFill: 0.7,
  /** 趴着或低头的动作本来就矮，默认小一些，不然会被放得比站着还大 */
  assembleSize: { idle: 0.7, walk: 0.7, eat: 0.56, sleep: 0.42, happy: 0.7, bath: 0.7, lick: 0.66, play: 0.7 } as Record<string, number>,
  /** 脚底对齐到格子高度的这个位置 */
  footLine: 0.9,
  /** 每秒播几帧 */
  fps: { idle: 3, walk: 7, eat: 5, sleep: 1.5, happy: 5, bath: 4, lick: 4, play: 7 } as Record<string, number>,
};

export type ActionName = (typeof SPRITE.rows)[number];

/** 四种性格。数值在 CONFIG.traits 里 */
export type Trait = 'glutton' | 'clingy' | 'tidy' | 'adventurer';
export const TRAITS: Record<Trait, { name: string; icon: string; desc: string }> = {
  glutton: { name: '贪吃', icon: '🍚', desc: '饿得快一些，但吃东西的时候特别开心' },
  clingy: { name: '黏人', icon: '🤍', desc: '被摸的时候格外开心；太久没人理，心情掉得快' },
  tidy: { name: '爱干净', icon: '✨', desc: '不容易脏，自己会把毛舔得更干净' },
  adventurer: { name: '爱冒险', icon: '🧭', desc: '更爱去远的地方，更容易带回纪念品' },
};
export const TRAIT_IDS = Object.keys(TRAITS) as Trait[];

/** 访客。look = 用捏猫系统画的占位样子（以后可以换成图片） */
export type VisitorWho = 'tabby' | 'neighbor' | 'courier';
export const VISITORS: Record<VisitorWho, { name: string; look: string; hello: string }> = {
  tabby: { name: '狸花猫', look: 'look:stripes|#A89A82|#EDE6D8|#4A4550|#8DAA4E|0', hello: '路过，顺便来看看你们。' },
  neighbor: { name: '邻居家的猫', look: 'look:point|#F3E6D0|#8A6A58|#4A4550|#5E9BD6|1', hello: '我就住隔壁，过来串个门。' },
  courier: { name: '快递猫', look: 'look:cow|#FBF8F2|#3F6FA8|#4A4550|#3B2A22|0', hello: '有你家的东西，签收一下。' },
};

export const SEASON_IDS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const TIME_IDS: DayTime[] = ['day', 'dusk', 'night'];
/** 房间装饰。layer：wall 挂在墙上；floor 铺在地上（宠物踩在上面）；stand 摆在地上。
 *  height = 显示高度；light = 天黑了发光的位置（相对图片）；special = 里程碑奖励，商店不卖（price 0）。
 *  加一件新的：在这里加一行，在 art/decor.ts 里画个占位图（或者直接放 PNG）。 */
export interface DecorDef { name: string; icon: string; price: number; height: number; layer: 'wall' | 'floor' | 'stand'; desc: string; light?: [number, number]; special?: boolean }
export const DECOR: Record<string, DecorDef> = {
  cushion: { name: '靠垫', icon: '🟨', price: 50, height: 46, layer: 'stand', desc: '软软的，放在哪都行' },
  mat: { name: '小圆垫', icon: '🔵', price: 60, height: 40, layer: 'floor', desc: '铺在地上的小垫子' },
  poster: { name: '小鱼挂画', icon: '🐟', price: 70, height: 80, layer: 'wall', desc: '挂在墙上的小画' },
  plant: { name: '小盆栽', icon: '🪴', price: 80, height: 90, layer: 'stand', desc: '一小盆绿叶' },
  rug: { name: '编织地毯', icon: '🧶', price: 120, height: 64, layer: 'floor', desc: '椭圆的大地毯' },
  painting: { name: '风景挂画', icon: '🖼️', price: 150, height: 120, layer: 'wall', desc: '远山和太阳' },
  lamp: { name: '落地灯', icon: '💡', price: 80, height: 250, layer: 'stand', desc: '摆在地上，天黑了会亮', light: [0.5, 0.14] },
  sidelamp: { name: '小落地灯', icon: '🕯️', price: 60, height: 200, layer: 'stand', desc: '细细的一盏，放沙发旁边正好', light: [0.5, 0.12] },
  nightlight: { name: '小夜灯', icon: '🌙', price: 180, height: 70, layer: 'stand', desc: '天黑了会亮', light: [0.5, 0.4] },
  bigplant: { name: '龟背竹', icon: '🌿', price: 200, height: 210, layer: 'stand', desc: '一大盆，很占地方' },
  shelf: { name: '小书架', icon: '📚', price: 300, height: 190, layer: 'stand', desc: '摆满了书和小东西' },
  globe: { name: '小地球仪', icon: '🌏', price: 0, height: 96, layer: 'stand', desc: '图鉴里程碑的奖励', special: true },
  goldframe: { name: '金边相框', icon: '🖼️', price: 0, height: 130, layer: 'wall', desc: '图鉴里程碑的奖励', special: true },
  trophy: { name: '收藏家奖杯', icon: '🏆', price: 0, height: 100, layer: 'stand', desc: '图鉴里程碑的奖励', special: true },
};
/** 兼容旧名字：里程碑奖励的特殊装饰 */
export const SPECIAL_DECOR: Record<string, { name: string; icon: string }> = Object.fromEntries(Object.entries(DECOR).filter(([, d]) => d.special).map(([k, d]) => [k, { name: d.name, icon: d.icon }]));
