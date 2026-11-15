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
  { id: 'bath', name: '浴室' }, { id: 'bedroom', name: '卧室' }, { id: 'shelf', name: '收藏柜' }, { id: 'pond', name: '鱼塘' },
] as const;
export type ZoneId = (typeof ZONES)[number]['id'];

export type DestType = 'park' | 'sea' | 'forest' | 'rain' | 'snow' | 'mountain';

export const CONFIG = {
  version: 'v0.1 预览版',

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

  // ---------- 互动 ----------
  actions: {
    petMood: 15,
    bathClean: 60,
    playMood: 20,
    playBonusBall: 8,
    playBonusScratcher: 12,
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

  // ---------- 虚弱与死亡 ----------
  weak: {
    /** 饱食归零后，各阶段能撑多久 */
    timeToDeath: [3 * DAY, 5 * DAY, 7 * DAY],
    /** 虚弱时被喂食救回，心情扣多少 */
    rescueMoodPenalty: 40,
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
    /** 每个区域的宽度。5 个区域 = 2160，配 720 的高度正好是 3:1 的长图 */
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
  { id: 'umbrella', name: '雨伞', icon: '☂️', price: 30, type: 'rain', desc: '更容易去下雨的地方' },
  { id: 'float', name: '泳圈', icon: '🛟', price: 35, type: 'sea', desc: '更容易去海边' },
  { id: 'tent', name: '小帐篷', icon: '⛺', price: 40, type: 'forest', desc: '更容易去森林' },
  { id: 'boots', name: '登山靴', icon: '🥾', price: 45, type: 'mountain', desc: '更容易去山里' },
  { id: 'scarf', name: '围巾', icon: '🧣', price: 45, type: 'snow', desc: '更容易去下雪的地方' },
];

export const GOODS: GoodsDef[] = [
  { id: 'cookie', name: '小饼干', icon: '🍪', price: 10, sellMin: 14, sellMax: 22, sellChance: 0.8 },
  { id: 'bell', name: '手工铃铛', icon: '🔔', price: 30, sellMin: 40, sellMax: 65, sellChance: 0.65 },
  { id: 'yarn', name: '毛线团', icon: '🧶', price: 60, sellMin: 80, sellMax: 130, sellChance: 0.5 },
];

export const FRY = { id: 'fry', name: '鱼苗', icon: '🐟', price: 6 };

/** 只买一次的东西 */
export const GEAR: GearDef[] = [
  { id: 'feeder', name: '自动喂食机', icon: '⚙️', price: 180, desc: '放在厨房，饱食度不会低于 35，不会再挨饿' },
  { id: 'scratcher', name: '猫抓板', icon: '🪵', price: 120, desc: '玩耍多加 12 心情；宠物会自己玩，心情不会低于 15' },
  { id: 'ball', name: '玩具球', icon: '⚽', price: 40, desc: '玩耍多加 8 心情；宠物会自己玩，心情不会低于 15' },
];

// ============================================================
// 目的地与纪念品
// ============================================================

export interface DestDef { id: string; name: string; type: DestType; tier: 1 | 2 | 3; souvenirs: string[] }

export const DESTS: DestDef[] = [
  { id: 'park', name: '街角公园', type: 'park', tier: 1, souvenirs: ['leaf', 'acorn'] },
  { id: 'bridge', name: '河边小桥', type: 'rain', tier: 1, souvenirs: ['pebble', 'paperboat'] },
  { id: 'seatown', name: '海边小镇', type: 'sea', tier: 2, souvenirs: ['shell', 'starfish'] },
  { id: 'cabin', name: '森林小屋', type: 'forest', tier: 2, souvenirs: ['mushroom', 'pinecone'] },
  { id: 'alley', name: '雨巷', type: 'rain', tier: 2, souvenirs: ['lantern', 'teacup'] },
  { id: 'lake', name: '高山湖', type: 'mountain', tier: 3, souvenirs: ['crystal', 'edelweiss'] },
  { id: 'lighthouse', name: '灯塔岬角', type: 'sea', tier: 3, souvenirs: ['bottle', 'compass'] },
  { id: 'onsen', name: '雪山温泉', type: 'snow', tier: 3, souvenirs: ['snowglobe', 'woodbadge'] },
];

export const SOUVENIRS: Record<string, { name: string; icon: string }> = {
  leaf: { name: '红叶书签', icon: '🍁' },
  acorn: { name: '橡果', icon: '🌰' },
  pebble: { name: '圆石头', icon: '🪨' },
  paperboat: { name: '纸船', icon: '⛵' },
  shell: { name: '贝壳', icon: '🐚' },
  starfish: { name: '海星', icon: '⭐' },
  mushroom: { name: '小蘑菇', icon: '🍄' },
  pinecone: { name: '松果', icon: '🌲' },
  lantern: { name: '纸灯笼', icon: '🏮' },
  teacup: { name: '茶杯', icon: '🍵' },
  crystal: { name: '水晶', icon: '💎' },
  edelweiss: { name: '雪绒花', icon: '🌼' },
  bottle: { name: '漂流瓶', icon: '🍾' },
  compass: { name: '旧指南针', icon: '🧭' },
  snowglobe: { name: '雪花球', icon: '🔮' },
  woodbadge: { name: '温泉木牌', icon: '🪧' },
};

/** 默认宠物可选的毛色 */
export const FUR_COLORS: Record<string, { name: string; body: string; shade: string; belly: string; line: string }> = {
  orange: { name: '橘色', body: '#F0994A', shade: '#D67A30', belly: '#FBE6CB', line: '#9A5A2E' },
  grey: { name: '灰色', body: '#A9B0B8', shade: '#868E98', belly: '#EEF0F2', line: '#6B6F78' },
  cream: { name: '奶白', body: '#F6E7CF', shade: '#E3CBA6', belly: '#FFF8EC', line: '#B08A5A' },
  black: { name: '黑色', body: '#5A5560', shade: '#3F3B45', belly: '#8B8590', line: '#2E2A33' },
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
