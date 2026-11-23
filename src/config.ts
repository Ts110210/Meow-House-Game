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
// 屋顶不是一个区域：它是房子上面的一层（从门口一直盖到阳台），点底部的「屋顶」切过去。几何见 assets.config.ts 的 roof
export type ZoneId = (typeof ZONES)[number]['id'];

export type DestType = 'city' | 'sea' | 'forest' | 'rain' | 'mountain';
export type DayTime = 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const TIME_NAMES: Record<DayTime, string> = { day: '白天', dusk: '傍晚', night: '夜晚' };
export const SEASON_NAMES: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

export const CONFIG = {
  version: '0.7.0',

  // ---------- 宠物数量 ----------
  maxPets: 5,
  /** 猫的日记：留最近几天、收藏最多几页；每页最多几只猫写得详细（其他的各一句）、每只写几句；
   *  多久没当过主角的猫优先（天）；你离开多久以上，日记里补几件你不在时它做的小事（awayFacts 件以内） */
  diary: {
    keepDays: 30, maxStarred: 50, featured: 3, linesEach: 3, rotateDays: 6, awayMin: 2 * 60 * 60 * 1000, awayFacts: 3,
    /** 挑主角和挑写哪几句时，每种事有多重要（越大越先写）；没当主角超过 rotateDays 天的猫再加 rotateBonus */
    weight: { rehome: 9, adoptedAway: 9, visitBack: 8, letter: 6, first: 8, wandGame: 5, fishGame: 5, autoFish: 5, tripBack: 9, grew: 9, found: 9, lost: 9, gift: 7, souvenir: 7, moment: 6, neighbor: 6, outing: 6, tripGo: 6, visitor: 5, awayMiss: 4, awayRain: 3, awayMorning: 3, awayNoon: 3, awayEvening: 3, awayNight: 3, feed: 2, pet: 2, bath: 2, play: 2 } as Record<string, number>,
    rotateBonus: 8,
  },
  /** 猫叼回来的礼物：你离开多久以上才会有；每只在家的猫叼回来的几率（心情好再加 moodBonus）；一次最多几件；
   *  稀有礼物（能摆出来的装饰）的几率；放在门口多久没捡会被它叼走 */
  gifts: { minAway: 4 * 60 * 60 * 1000, chance: 0.35, moodBonus: 0.15, moodGood: 60, maxPerReturn: 2, rareChance: 0.08, expire: 3 * 24 * 60 * 60 * 1000 },
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
    /** 饱食到这里就吃不下了：再喂它闻一下就走开，粮不扣 */
    fullAt: 95,
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
    /** 到这个数，两只凑在一起时除了打闹，还会互相舔毛、蹭头，白天也爱挨着睡 */
    close: 30,
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
    { id: 'v10', kind: 'variants', need: 10, fish: 50, skin: ['album', 'mint'] },
    { id: 'v30', kind: 'variants', need: 30, fish: 120, decor: 'globe' },
    { id: 'v60', kind: 'variants', need: 60, fish: 250, skin: ['sofa', 'navy'] },
    { id: 'v120', kind: 'variants', need: 120, fish: 600, decor: 'goldframe' },
    { id: 's5', kind: 'souvenirs', need: 5, fish: 80, skin: ['cabinet', 'cream'] },
    { id: 's10', kind: 'souvenirs', need: 10, fish: 200, skin: ['cattree', 'berry'] },
    { id: 's20', kind: 'souvenirs', need: 20, fish: 500, decor: 'trophy' },
  ] as { id: string; kind: 'variants' | 'souvenirs'; need: number; fish: number; decor?: string; /** 送一款家具皮肤 [家具, 皮肤]，不用再买 */ skin?: [string, string] }[],

  // ---------- 房间装饰 ----------
  decor: {
    /** 同一种装饰最多买几件 */
    maxPerKind: 4,
    /** 每个区域最多摆几件 */
    maxPerZone: 8,
    // 开局自带的装饰（摆在哪见 assets.config.ts 的 starterDecor）不算在「最多买几件」里
    // ---- 摆放规则（见 sim.decorProblem）----
    /** 不能摆装饰的区域（院子以后有专门的户外装饰） */
    noDecorZones: ['garden'] as string[],
    /** 没有实体墙、挂不了画的区域 */
    noWallZones: ['balcony', 'garden'] as string[],
    /** 阳台上能摆的（户外也合适的东西）；别的只能摆在屋里 */
    outdoorOK: ['plant', 'bigplant', 'lantern', 'snowman', 'jar', 'vase'] as string[],
    /** 墙上能挂的范围：离天花板至少多远、离地板线至少多远（踢脚线） */
    wallTop: 12, wallBottom: 14,
    /** 摆在地上的装饰脚底占多深（前后方向），宽度是图片宽的 80% */
    footDepth: 22,
    /** 家具脚底占多深，宽度是图片宽的 90% */
    furnitureDepth: 34,
    /** 猫用家具时站的地方（起跳、吃饭、抓板…）周围留多大的空地：左右、前后各多少 */
    keepClear: [40, 14] as [number, number],
    /** 门前留一条路：门两边各多出多少、从地板线往前多深 */
    doorPath: [10, 80] as [number, number],
  },

  // ---------- 访客 ----------
  visitors: {
    /** 每天来 0、1、2 个访客的可能性（加起来是 1） */
    perDayChance: [0.25, 0.5, 0.25],
    /** 没人理的话，待多久自己走 */
    stay: 4 * HOUR,
    /** 同一天两个访客之间至少隔多久 */
    gap: 2 * HOUR,
    /** 开始玩之后多久才会有访客来（游戏时间）。第一天不来，免得以为家里多了一只猫 */
    firstAfter: DAY,
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
    /** 常客：每帮一位访客办成一件事（收礼、换东西、接信），它的好感 +1。到了下面的数会送回礼。
     *  skin = 送一款家具皮肤（[家具, 皮肤]，不用再买）；decor = 送一件商店里买不到的装饰 */
    favor: {
      tabby: [{ need: 3, fish: 40, skin: ['bowl', 'berry'] }, { need: 7, fish: 80, decor: 'bell' }],
      neighbor: [{ need: 3, fish: 40, skin: ['bed', 'cream'] }, { need: 7, fish: 80, decor: 'lantern' }],
      courier: [{ need: 3, fish: 40, skin: ['door', 'navy'] }, { need: 7, fish: 80, decor: 'parcel' }],
    } as Record<string, { need: number; fish: number; skin?: [string, string]; decor?: string }[]>,
  },

  // ---------- 季节活动 ----------
  seasonEvent: {
    /** 每天最多冒出几样小东西；两样之间至少隔多久（离开游戏的时候也会攒着，但院子里最多同时放 neighbors.maxFinds 样） */
    perDay: 4, gap: 40 * MIN,
  },

  // ---------- 瞬间相册 ----------
  moments: {
    /** 同一种瞬间隔多久才会再抓拍一次；相册里最多留几张（和明信片一样：满了照样收下，再请主人自己删） */
    cooldown: 3 * DAY, max: 60,
  },

  // ---------- 邻居猫 ----------
  /** 邻居猫和访客：几点到几点不来（深夜，前一个数到后一个数，跨过半夜）；下雨天也不来，邻居猫在的时候下起雨就先回家 */
  guests: { quiet: [22, 7] as [number, number] },
  neighbors: {
    /** 每天来串门 0、1、2 次的可能性（加起来是 1）。只在你开着游戏的时候来 */
    perDayChance: [0.3, 0.45, 0.25],
    /** 两次串门之间至少隔多久 */
    gap: 90 * MIN,
    /** 开始玩之后多久才会有邻居来（游戏时间）。第一天不来，免得以为家里多了一只猫 */
    firstAfter: DAY,
    /** 来了之后待多久 */
    stay: [4 * MIN, 7 * MIN] as [number, number],
    /** 每来一次，和这个家熟一点；每和一只宠物玩一次，再熟一点 */
    bondPerVisit: 8, bondPerPlay: 3,
    /** 熟到这个数算「朋友」：可以让宠物去它家回访，它走的时候更常留下小东西。满了是 best */
    friendAt: 30, best: 100,
    /** 和邻居玩一次，宠物加多少心情 */
    playMood: 6,
    /** 走的时候留下小东西的可能性：还不熟 / 已经是朋友 */
    giftChance: 0.35, giftChanceFriend: 0.7,
    /** 留下的是什么：小鱼、小花、脚印纸条各占多少 */
    giftWeight: { fish: 0.45, flower: 0.3, note: 0.25 },
    /** 捡到小鱼换多少小鱼干 */
    giftFish: [6, 14] as [number, number],
    /** 院子里的小东西最多同时有几样；多久没捡就不见了 */
    maxFinds: 4, findExpire: 2 * DAY,
    /** 回访：去多久，回来加多少心情，和邻居熟多少 */
    outing: 30 * MIN, outingMood: 12, outingBond: 6,
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
    /** 睡着的时候被叫（摸、喂、洗、陪玩）：先伸懒腰醒过来要多久，再去做 */
    wakeUp: 1_150,
    /** 闲着自己去鱼塘边坐着看鱼（只看不捞） */
    fish: [10_000, 20_000] as [number, number],
    /** 跳到沙发、床、窗台、猫爬架上待多久 */
    perch: [9_000, 18_000] as [number, number],
    /** 扑蝴蝶 */
    butterfly: [6_000, 10_000] as [number, number],
    /** 夜里到屋顶看星星 */
    stargaze: [14_000, 24_000] as [number, number],
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
    /** 吃一口猫草加多少心情；同一只隔多久才能再加 */
    grassMood: 4, grassCooldown: HOUR,
    /** 同一动作效果递减：每连续做一次，效果乘以这个数 */
    repeatFactor: 0.5,
    /** 距离上次同一动作超过这么久，效果恢复正常 */
    repeatCooldown: 30 * MIN,
  },

  // ---------- 成长 ----------
  growth: {
    stageNames: ['幼年', '青年', '成年'],
    /** 每个阶段持续多久 */
    stageDuration: 7 * DAY,
    /** 三个阶段在房间里的体型（共用一套序列帧），按这只猫自己成年的大小算。
     *  2026-11-22 主人定：成年 = 原来青年的 1.2 倍（整体缩到原来的 80%，见 room.petHeightOfDoor），幼年 = 原来幼年的 1.1 倍。
     *  所以青年 = 成年的 1/1.2，幼年 = 原来的 0.5 × 1.1 ÷ 0.8 */
    stageScale: [0.55 / 0.8, 1 / 1.2, 1],
    /** 成年后有多大（按最初设计的大小算，1 = 最初设计）。领养时在范围里随机定一次，之后不变。公猫稍大，母猫稍小 */
    adultSize: { m: [0.85, 0.9], f: [0.8, 0.85] } as Record<Sex, [number, number]>,
    /** 长大的意义：幼年自己出门最远只到第几档（带着成年猫一起就不限）；有成年猫同行时带回稀有纪念品的几率乘多少 */
    kittenMaxTier: 1, adultRareMult: 1.6,
    /** 两只猫凑一起时，有成年也有幼年，大的去给小的舔毛的几率（不看友情） */
    adultGroomChance: 0.6,
    /** 背屏上的体型。背屏只有 2.86 寸，按房间里的比例幼年会太小，所以单独一套 */
    backScale: [0.8, 0.9, 1],
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

  // ---------- 亲密度（和主人亲不亲） ----------
  /** 0–100，只涨不掉（很久没来会闹脾气，见 greet，但不扣亲密度）。每次照顾涨多少；每只猫一天最多涨 dayMax；
   *  levels = 几级的门槛和名字；greetAt = 到这一级会在你回来时跑过来迎接；waitAt = 最亲近的那只到这一级会在你上次离开的地方等你；rubAt = 迎接完会蹭你 */
  bond: {
    gain: { feed: 1, pet: 1.5, bath: 0.5, play: 1, wand: 2, fishing: 2, gift: 1, trip: 3 } as Record<string, number>,
    dayMax: 12,
    levels: [[0, '陌生'], [20, '熟悉'], [50, '亲近'], [80, '形影不离']] as [number, string][],
    greetAt: 20, rubAt: 50, waitAt: 20,
  },

  // ---------- 送养、走失的猫被收养 ----------
  /** 只有成年猫能送养，两次送养至少隔 gap；会回来串门的「老家人」最多 maxVisitors 只（更早送走的「搬去远方」，只偶尔寄信）；
   *  回来串门：离上一次老家人串门至少隔 visitGap、打开游戏时有 visitChance 的几率、待多久；远方的寄信几率；
   *  走失多久没找回来，就被好心人收养（空出位置，之后和送养的一样偶尔回来）；搬去的人家 */
  rehome: {
    gap: 7 * 24 * 60 * 60 * 1000, maxVisitors: 3, visitGap: 2 * 24 * 60 * 60 * 1000, visitChance: 0.4, visitFor: [30 * MIN, 60 * MIN] as [number, number], letterChance: 0.05,
    lostAdoptAfter: 7 * 24 * 60 * 60 * 1000,
    homes: ['隔壁奶茶店', '巷子口的书店', '楼上的老奶奶家', '街角的花店', '河边的面包店'],
  },

  // ---------- 小玩法（可玩可不玩：原来的「玩耍」按钮照旧一点就加心情） ----------
  minigame: {
    /** 陪它玩（逗猫棒）：玩多久；每扑中一次心情加多少（一局最多 maxMood）；每天前 rewardPlays 局每扑中一次给 fishEach 小鱼干（一局最多 fishMax）；
     *  逗猫棒离猫多近算扑中（格子的比例）；逗猫棒要一直动它才有兴趣（速度低于 lively 超过 boredAfter 毫秒它就坐下不玩了）；
     *  晃得太快（高于 tooFast 超过 dizzyAfter 毫秒）它看花了眼、停下来不追；隔多久扑一次；蹲下（头上冒「！」）到扑出去有多久。
     *  要先买逗猫棒才能玩（没买时只有原来的「玩耍」按钮） */
    wand: { time: 20_000, mood: 3, maxMood: 24, fishEach: 1, fishMax: 8, rewardPlays: 3, reach: 0.32, lively: 220, boredAfter: 1500, tooFast: 1600, dizzyAfter: 700, pounceEvery: [900, 1800] as [number, number], crouchMs: 650 },
    /** 陪它捞鱼：要先往鱼塘里放鱼苗，一局捞的是鱼塘里的一批（先捞长大的）；没捞到就不算，那批鱼还在塘里。不再按天限次数，鱼苗有几批就能捞几局。
     *  玩多久；水里同时游几条；捞到一条给多少小鱼干（长大的 ripeEach、一局最多 ripeMax；没长大的 fishEach、最多 fishMax）、心情加 mood（一局最多 maxMood）；
     *  点下去之后爪子多久落下；爪子多大（池塘宽度的比例）；拍完一下要等多久才能再拍（乱点没用） */
    fishing: { time: 20_000, fish: 4, ripeEach: 3, ripeMax: 24, fishEach: 1, fishMax: 8, mood: 2, maxMood: 12, strikeDelay: 220, paw: 0.075, cooldown: 650 },
    /** 让它自己去捞：主人选让它捞几批（1–3，记住上次选的），捞 1 批 minutes[0] 分钟、2 批 minutes[1]、3 批 minutes[2]。
     *  它先走到鱼塘边（放下手上的事），到了才开始计时；没开着游戏走不到的话，最多等 maxWalk 就当它到了。
     *  每批带回多少小鱼干（长大的 ripe、没长大的 young，都比自己陪它捞少一点、和直接收获差不多）；心情太差不愿意去；下雨了提前回来，没捞完的那几批还在塘里 */
    auto: { minutes: [2, 4, 5], maxWalk: 3 * MIN, ripe: [15, 18] as [number, number], young: [4, 7] as [number, number], moodMin: 30 },
  },

  // ---------- 吃饭的演出 ----------
  /** 屋顶：晚上偶尔顺着阳台的木梯爬上去看星星，有时就在上面睡了。概率故意设得低，不然一群猫都在外面不回家 */
  roof: {
    /** 夜里每次想下一件事时，上屋顶的概率（爱冒险的用后一个） */
    chance: 0.04, chanceAdventurer: 0.1,
    /** 屋顶上同时最多几只（包括正在往梯子那边走的） */
    max: 2,
    /** 一只上去之后，至少隔多久才会有下一只想上去 */
    gap: 10 * 60_000,
    /** 看完星星，接着在屋顶上睡一觉的概率，和睡多久 */
    sleepChance: 0.3, sleep: [120_000, 300_000] as [number, number],
    /** 爬一趟梯子多久、在屋顶上走路的速度（每秒多少像素） */
    climbMs: 2_200, walkSpeed: 80,
  },
  eating: {
    /** 饭碗里的粮分几档画（满 → 快吃完）：档数越多变少得越平滑 */
    bowlSteps: 6,
    /** 罐头、便当吃完后，空罐、空盒在地上留多久再消失（毫秒） */
    emptyLinger: 30_000,
    /** 消失时淡出用多久 */
    fadeMs: 1_000,
    /** 位置被占着时最多等多久（毫秒）；等不到就算了，不会对着空气吃 */
    maxWait: 120_000,
  },

  // ---------- 面板 ----------
  ui: {
    /** 面板刚弹出来的这段时间（毫秒）里，面板里的按钮点了不响应。
     *  点房间里的猫、家具打开面板时，面板从下往上滑，按钮会正好经过手指的位置；手快点第二下就会误点（比如连着喂食） */
    tapGuardMs: 500,
  },

  // ---------- 天气 ----------
  weather: {
    /** 每隔多久换一次天气 */
    block: 3 * HOUR,
    /** 每个季节下雨的概率（冬天是下大雪） */
    rainChance: { spring: 0.28, summer: 0.3, autumn: 0.25, winter: 0.22 } as Record<string, number>,
  },

  // ---------- 宠物对主人的反应 ----------
  greet: {
    /** 离开超过这么久再打开，在家的宠物会跑过来迎接 */
    after: 10 * MIN,
    /** 离开超过这么久，黏人的（没有黏人的就是心情最差的那只）会背对着你闹脾气，摸一下才好 */
    sulkAfter: 24 * HOUR,
    /** 闹脾气最多闹多久 */
    sulkFor: 5 * MIN,
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
    // 上面的 dusk、night、duskStrength 只在「光影效果：关」时用（老的三段式）。高、简单用下面跟着真实时间平滑变化的这套

    /** 一天里的几个关键时刻（几点，0–24），两个时刻之间平滑过渡，24 点接回 0 点。
     *  indoor / outdoor = 屋里 / 阳台、院子、屋顶整个画面乘上的颜色（白色 = 不变）；
     *  sun = 太阳有多强（0–1，管室外影子和窗户光的浓淡，0 = 没有）；win = 窗户光的颜色；glow = 灯的光圈有多亮（0–1） */
    keys: [
      { h: 0, indoor: '#A9A7BE', outdoor: '#9AA2CC', sun: 0, win: '#FFD6B8', glow: 1 },
      { h: 4.6, indoor: '#A9A7BE', outdoor: '#9AA2CC', sun: 0, win: '#FFD6B8', glow: 1 },
      { h: 6, indoor: '#F4DCD8', outdoor: '#F2D2D6', sun: 0.55, win: '#FFC9B4', glow: 0.25 },
      { h: 9, indoor: '#FFF8F0', outdoor: '#FFFAF2', sun: 0.9, win: '#FFE7C6', glow: 0 },
      { h: 12.5, indoor: '#FFFFFF', outdoor: '#FFFFFF', sun: 1, win: '#FFFDF6', glow: 0 },
      { h: 15.5, indoor: '#FFF6EA', outdoor: '#FFF4E6', sun: 0.9, win: '#FFE8C2', glow: 0 },
      { h: 18, indoor: '#F8D9BE', outdoor: '#F6CBA8', sun: 0.55, win: '#FFAE6A', glow: 0.4 },
      { h: 19.5, indoor: '#A9A7BE', outdoor: '#9AA2CC', sun: 0, win: '#FFD6B8', glow: 1 },
      { h: 24, indoor: '#A9A7BE', outdoor: '#9AA2CC', sun: 0, win: '#FFD6B8', glow: 1 },
    ] as { h: number; indoor: string; outdoor: string; sun: number; win: string; glow: number }[],
    /** 时段的名字（开发者面板显示用）：从几点开始 */
    phases: [[5, '清晨'], [7, '上午'], [11, '中午'], [14, '下午'], [17, '黄昏'], [19, '夜晚']] as [number, string][],
    /** 太阳几点出来、几点落下：早上在左边（影子往右拉长），中午在头顶（影子短），傍晚在右边（影子往左拉长） */
    sunrise: 5.5, sunset: 19.2,
    /** 下雨（冬天是大雪）：没有太阳影子和窗户光，室外再乘上这个偏冷偏灰的颜色；屋里只轻轻乘 rainIndoor（屋里有灯，不能跟着外面一起暗下去） */
    rain: '#C6CCD6', rainIndoor: '#E6E8EC',
    /** 下雨天白天，买了的灯和屋里的固定光源也开着（0–1，和夜里的 1 比） */
    rainLamps: 0.7,
    /** 屋里的固定光源（不用买、看不见灯具，像天花板上的灯）：每个室内区域正中一盏，从天花板往下 y 的位置。
     *  base = 白天也一直开着的一点点补光；on = 天暗了（傍晚、夜里、下雨）再加多少。只照亮、不投影 */
    roomLight: { y: 150, color: '#FFE6C4', radius: 420, base: 0.22, on: 0.3 },
    /** 室外影子：浓淡（乘以 sun）；压扁成多高（中午 short、早晚 long，按物品高度的比例）；早晚最多往旁边斜出去多少（按物品高度的比例） */
    shadow: { alpha: 0.28, short: 0.14, long: 0.3, lean: 1.3 },
    /** 接触阴影（屋里屋外都有，脚底下一小块柔和的暗影）：浓淡、宽度（按物品宽度的比例）、厚度（按宽度的比例）；猫的宽度按格子的比例；
     *  perch = 猫待在椅子、窗台等家具上时，脚底下那一块是平常的几倍宽（坐着的猫把中间盖住了，要比身子宽一点才看得到） */
    contact: { alpha: 0.22, width: 0.86, depth: 0.16, pet: 0.42, perch: 1.7 },
    /** 不画接触阴影和室外影子的东西：挂着的、贴墙的、平铺在地上的 */
    noShadow: ['pendantDoor', 'pendantShelf', 'bedlamp', 'album', 'door', 'ladder', 'pond', 'deckEdge'] as string[],
    /** 窗户光：最亮处的浓淡（乘以 sun）；落在地板上的那块多深（中午 near、早晚 far）；早晚最多往旁边斜出去多少（按玻璃宽度的比例） */
    windowLight: { alpha: 0.32, beam: 0.12, near: 46, far: 110, lean: 0.9 },
    /** 光影效果「超高」：每个房间按离窗户、离灯的远近算亮暗（光照图），每个光源单独投影。
     *  cell = 光照图一格多大（越小越细、越费）；dimDay / dimNight = 屋里离光源远的地方白天 / 夜里有多暗（1 = 不暗）；
     *  leak = 灯光透过墙照到隔壁房间还剩多少；window = 窗户光照亮屋里的强度、照多远；
     *  lamp = 灯光的颜色、强度、照多远（radius 可以按物品单独写在 lampRadius）；
     *  shadow = 灯和窗户投的影子：浓淡、最多往旁边斜多少（按物品高度）、压扁成多高（灯在头顶 short，斜照 long）、太弱的光不投影、比照亮的范围远多少 */
    ultra: {
      cell: 16, dimDay: 0.84, dimNight: 0.62, leak: 0.1,
      /** 家具挡光：被挡住的地方还剩多少光；哪些家具挡光（框往里缩 inset，镂空的猫爬架、栅栏、椅子不挡） */
      block: 0.3, inset: 0.1,
      occluders: ['bed', 'cabinet', 'sofa', 'counter', 'tub', 'nightstand', 'box', 'basket', 'feeder', 'shelf'] as string[],
      /** 家具朝光的一面亮、背光的一面暗：最亮加多少、最暗压多少（按照到它身上的光的强弱） */
      rim: { lit: 0.55, dark: 0.32 },
      /** 不做朝光面亮暗的东西 */
      noRim: ['kitchenWindow', 'bedroomWindow', 'deckEdge', 'pond'] as string[],
      /** 家具本身当光源：at = 在图片上的位置；by = sun 白天亮（反光）、night 天黑亮；cast = 会不会让别的东西投影 */
      extra: {
        pond: { at: [0.5, 0.35], color: '#D6F0FF', power: 0.3, radius: 230, by: 'sun', cast: false },
        feeder: { at: [0.62, 0.22], color: '#9ED6FF', power: 0.4, radius: 100, by: 'night', cast: false },
      } as Record<string, { at: [number, number]; color: string; power: number; radius: number; by: 'sun' | 'night'; cast: boolean }>,
      /** 火光、萤火虫会闪：光晕的亮度上下浮动多少 */
      flicker: { heater: 0.22, jar: 0.3, lantern: 0.12 } as Record<string, number>,
      window: { power: 0.5, radius: 560 },
      lamp: { color: '#FFC27A', power: 0.95, radius: 330 },
      lampColor: { heater: '#FF9C55', jar: '#DFFFA6', lantern: '#FFAA6A' } as Record<string, string>,
      lampRadius: { bedlamp: 240, heater: 250, nightlight: 170, jar: 150, lantern: 220, sidelamp: 280 } as Record<string, number>,
      shadow: { alpha: 0.36, maxLean: 2.2, short: 0.12, long: 0.34, min: 0.06, reach: 1.4 },
      /** 灯的光晕（叠加变亮那一层）在超高里乘这个：亮暗主要交给光照图 */
      glowScale: 0.6,
    },
  },

  // ---------- 每日签到 ----------
  checkinFish: 60,

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
    /** 每个区域的宽度。一共 9 个区域 = 3888；其中前 5 个（门口到卧室）= 2160，配 720 的高度正好是 3:1 的背景长图 */
    zoneWidth: 432,
    height: 720,
    /** 一张贴图最大多少像素（很多手机的上限是 4096）。背景图比这个大时切成小块分别做贴图 */
    maxTexture: 4096,
    floorY: 560,
    /** 横屏时把墙的最上面裁掉这么多，让画面放大一些 */
    landscapeCropTop: 60,
    /** 门的高度（只用来换算宠物大小；调整门的点击区域不会影响宠物） */
    doorHeight: 392,
    /** 「最初设计」的猫身高大约是门高的多少。实际大小再乘每只猫的成年大小（growth.adultSize，最大 0.9）和成长阶段（stageScale） */
    petHeightOfDoor: 0.36 * 0.8 * 1.05, // 2026-11-22 成年猫缩到原来的 80%，三个阶段再一起放大 5%（青年、幼年的比例见 growth.stageScale）
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
  { id: 'box', name: '纸箱', icon: '📦', price: 40, desc: '放在门口。猫见了纸箱就想钻进去' },
  { id: 'basket', name: '洗衣篮', icon: '🧺', price: 60, desc: '放在浴室。软软的，适合窝在里面' },
  { id: 'catgrass', name: '猫草盆', icon: '🌿', price: 90, desc: '放在院子里。宠物路过会啃两口，心情 +4' },
  { id: 'tunnel', name: '猫隧道', icon: '🕳️', price: 120, desc: '放在阳台。钻进去，从另一头探出脑袋' },
  { id: 'autoball', name: '自动逗猫球', icon: '🔮', price: 150, desc: '放在收藏柜那一间，自己会滚，宠物会追着扑' },
  { id: 'heater', name: '小暖炉', icon: '🔥', price: 180, desc: '放在卧室。天冷的时候宠物爱围着它睡' },
  { id: 'wand', name: '逗猫棒', icon: '🪶', price: 60, desc: '买了才能玩「陪它玩」小玩法（扑中有心情和小鱼干）；平时的玩耍也从 +10 心情变成 +24' },
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
  /** 「吃东西」那一行里，宠物的嘴在格子里的位置（面朝右，按 256 的格子算）。吃饭时用它把嘴对准碗口、出粮口、罐头。
   *  换了正式的精灵图，嘴的位置不一样时改这里 */
  mouth: [198, 187] as [number, number],
  /** 行的顺序。前 5 行必须有，后面的可以没有（缺了用 fallback 里写的动作代替）。
   *  一共 16 行 = 4096 像素高，这是很多手机一张贴图能放下的上限，所以不要再往后加行；要加新动作先和我商量拆成两张图。 */
  rows: ['idle', 'walk', 'eat', 'sleep', 'happy', 'bath', 'lick', 'play', 'jump', 'fish', 'yawn', 'stretch', 'sit', 'groom', 'scratch', 'beg'] as const,
  rowNames: { idle: '待机', walk: '走路', eat: '吃东西', sleep: '睡觉', happy: '开心（被摸）', bath: '洗澡', lick: '舔毛', play: '玩耍',
    jump: '跳跃（上下家具）', fish: '伸爪子捞', yawn: '打哈欠', stretch: '伸懒腰', sit: '端坐着看', groom: '给同伴舔毛、蹭头', scratch: '抓猫抓板', beg: '站起来讨要、迎接' } as Record<string, string>,
  requiredRows: 5,
  /** 可选动作缺了时用哪个代替 */
  fallback: { bath: 'idle', lick: 'idle', play: 'happy', jump: 'play', fish: 'play', yawn: 'idle', stretch: 'idle', sit: 'idle', groom: 'lick', scratch: 'play', beg: 'happy' } as Record<string, string>,
  /** 拼装精灵图时：宠物最高的一帧占格子高度的多少（默认值，工具里每个动作可以单独调） */
  cellFill: 0.7,
  /** 趴着或低头的动作本来就矮，默认小一些，不然会被放得比站着还大 */
  assembleSize: { idle: 0.7, walk: 0.7, eat: 0.56, sleep: 0.42, happy: 0.7, bath: 0.7, lick: 0.66, play: 0.7, jump: 0.7, fish: 0.62, yawn: 0.7, stretch: 0.66, sit: 0.74, groom: 0.66, scratch: 0.84, beg: 0.84 } as Record<string, number>,
  /** 脚底对齐到格子高度的这个位置 */
  footLine: 0.9,
  /** 精灵图拼装时默认「保留跳跃高度」的动作：不把每帧的脚底拉回地面，保留原图里 4 帧之间的上下位置（最低的一帧当地面）。
   *  2026-11-21 定了跳跃用「原地跳」，高度只由程序的弧线负责，所以默认都不保留（开关还在） */
  keepHeight: [] as string[],
  /** 第二张精灵图 pets/<毛色>-2.png：格式和第一张一样（每格 256，每行 4 帧，面朝右）。
   *  第 1 行是爬梯子（上下屋顶），后面的行留给以后的新动作。没有这张图时，爬梯子用「跳跃」那一行代替 */
  rows2: ['climb'] as const,
  rowNames2: { climb: '爬梯子（上下屋顶）' } as Record<string, string>,
  fps2: { climb: 6 } as Record<string, number>,
  /** 每秒播几帧 */
  fps: { idle: 3, walk: 7, eat: 5, sleep: 1.5, happy: 5, bath: 4, lick: 4, play: 7, jump: 8, fish: 5, yawn: 3, stretch: 3.5, sit: 2, groom: 5, scratch: 8, beg: 5 } as Record<string, number>,
};

export type ActionName = (typeof SPRITE.rows)[number];
/** 第二张精灵图里的动作 */
export type ExtraAction = (typeof SPRITE.rows2)[number];

/** 四种性格。数值在 CONFIG.traits 里 */
export type Trait = 'glutton' | 'clingy' | 'tidy' | 'adventurer';
export const TRAITS: Record<Trait, { name: string; icon: string; desc: string }> = {
  glutton: { name: '贪吃', icon: '🍚', desc: '饿得快一些，但吃东西的时候特别开心' },
  clingy: { name: '黏人', icon: '🤍', desc: '被摸的时候格外开心；太久没人理，心情掉得快' },
  tidy: { name: '爱干净', icon: '✨', desc: '不容易脏，自己会把毛舔得更干净' },
  adventurer: { name: '爱冒险', icon: '🧭', desc: '更爱去远的地方，更容易带回纪念品' },
};
export const TRAIT_IDS = Object.keys(TRAITS) as Trait[];

/** 任务：新手引导（一次性，按顺序列出，做完一步领一步的奖励）和每日任务（引导全部领完后开始，每天随机抽几个）。
 *  key = 做了哪件事算进度（规则那边 questEvent 记的事）；go = 「去做」按钮带你去哪；{pet} 换成第一只宠物的名字 */
export interface QuestDef { id: string; text: string; key: string; need: number; reward: number; go: string }
export const QUESTS = {
  guide: [
    { id: 'pet', text: '摸一摸{pet}', key: 'pet', need: 1, reward: 10, go: 'pet' },
    { id: 'feed', text: '给{pet}喂一顿饭', key: 'feed', need: 1, reward: 10, go: 'pet' },
    { id: 'bath', text: '给{pet}洗个澡', key: 'bath', need: 1, reward: 10, go: 'pet' },
    { id: 'play', text: '陪{pet}玩一会儿', key: 'play', need: 1, reward: 10, go: 'pet' },
    { id: 'checkin', text: '每日签到', key: 'checkin', need: 1, reward: 10, go: 'checkin' },
    { id: 'trip', text: '到门口派{pet}出门旅行', key: 'trip', need: 1, reward: 20, go: 'door' },
    { id: 'postcard', text: '等它回来，收到第一张明信片', key: 'postcard', need: 1, reward: 20, go: 'album' },
    { id: 'buy', text: '在商店买一样东西', key: 'buy', need: 1, reward: 20, go: 'shop' },
    { id: 'decor', text: '在「布置房间」里挪一件装饰', key: 'decor', need: 1, reward: 20, go: 'decor' },
    { id: 'roof', text: '点底部的「屋顶」去屋顶看看', key: 'roof', need: 1, reward: 10, go: 'roof' },
  ] as QuestDef[],
  /** 每日任务的池子：每天从里面随机抽 dailyCount 个（不重复）。2026-11-23 主人要每天收入 250–350 起步：签到、每日任务、全部完成的奖励都调高了 */
  daily: [
    { id: 'feed3', text: '喂 3 次饭', key: 'feed', need: 3, reward: 45, go: 'pet' },
    { id: 'pet5', text: '摸摸 5 次', key: 'pet', need: 5, reward: 40, go: 'pet' },
    { id: 'bath1', text: '洗 1 次澡', key: 'bath', need: 1, reward: 40, go: 'pet' },
    { id: 'play2', text: '陪玩 2 次', key: 'play', need: 2, reward: 40, go: 'pet' },
    { id: 'checkin', text: '每日签到', key: 'checkin', need: 1, reward: 40, go: 'checkin' },
    { id: 'trip1', text: '派宠物出门 1 次', key: 'trip', need: 1, reward: 60, go: 'door' },
    { id: 'plant1', text: '往鱼塘放 1 条鱼苗', key: 'plant', need: 1, reward: 50, go: 'pond' },
    { id: 'buy1', text: '在商店买 1 样东西', key: 'buy', need: 1, reward: 50, go: 'shop' },
    { id: 'decor1', text: '在「布置房间」里挪 1 件装饰', key: 'decor', need: 1, reward: 40, go: 'decor' },
  ] as QuestDef[],
  dailyCount: 3,
  /** 当天的每日任务全部领完，再给这么多 */
  dailyBonus: 60,
};

/** 公猫、母猫。现在只决定成年后的大小（见 CONFIG.growth.adultSize） */
export type Sex = 'm' | 'f';
export const SEXES: Record<Sex, { name: string; icon: string }> = { m: { name: '公猫', icon: '♂' }, f: { name: '母猫', icon: '♀' } };
export const SEX_IDS = Object.keys(SEXES) as Sex[];

/** 访客。look = 用捏猫系统画的占位样子（以后可以换成图片） */
export type VisitorWho = 'tabby' | 'neighbor' | 'courier';
/** sex、size = 公母和大小（按最初设计算，和家里成年猫的范围一样） */
export const VISITORS: Record<VisitorWho, { name: string; look: string; hello: string; sex: Sex; size: number }> = {
  tabby: { name: '狸花猫', look: 'look:stripes|#A89A82|#EDE6D8|#4A4550|#8DAA4E|0', hello: '路过，顺便来看看你们。', sex: 'm', size: 0.88 },
  neighbor: { name: '邻居家的猫', look: 'look:point|#F3E6D0|#8A6A58|#4A4550|#5E9BD6|1', hello: '我就住隔壁，过来串个门。', sex: 'f', size: 0.83 },
  courier: { name: '快递猫', look: 'look:cow|#FBF8F2|#3F6FA8|#4A4550|#3B2A22|0', hello: '有你家的东西，签收一下。', sex: 'm', size: 0.86 },
};

/** 住在附近的三只邻居猫。会自己来串门，和家里的宠物玩一会儿、蹭口饭再走；熟了之后宠物也可以去它家回访。
 *  look = 用捏猫系统画的占位样子；notes = 它留下的脚印纸条上写的话；stories = 宠物去它家回来讲的小见闻（{pet} 换成宠物的名字） */
export interface NeighborDef { name: string; home: string; look: string; desc: string; hello: string; notes: string[]; stories: string[]; /** 公母和大小（按最初设计算） */ sex: Sex; size: number; /** 从哪来：roof = 从左边的屋檐过来、顺着阳台的木梯下来；fence = 从院子的栅栏进出 */ route: 'roof' | 'fence' }
export const NEIGHBORS: Record<string, NeighborDef> = {
  mochi: { route: 'fence', sex: 'f', size: 0.84, name: '麻薯', home: '隔壁奶茶店', look: 'look:solid|#F6F1E7|#E9DFCB|#4A4550|#6FA8DC|1', desc: '隔壁奶茶店的白猫，慢吞吞的，最爱蹭饭和晒太阳', hello: '喵——（慢慢地走了进来）',
    notes: ['今天的太阳很好，谢谢你家的地板。', '饭很好吃。下次还来。', '我把最舒服的位置留给你们了。'],
    stories: ['{pet}在奶茶店的柜台上趴了一下午，回来身上有一股奶香。', '麻薯带{pet}看了后门的那只大纸箱，两只挤在里面睡了一觉。', '{pet}学会了在收银机旁边装招财猫。'] },
  dahei: { route: 'roof', sex: 'm', size: 0.9, name: '大黑', home: '巷子口', look: 'look:solid|#3C3A40|#5A5660|#4A4550|#E3B341|0', desc: '巷子口的黑猫，胆子大，爱追着跑、爱打闹', hello: '喵！（从屋顶上顺着梯子溜了下来）',
    notes: ['你们家的球不错。', '巷子口新来了一只麻雀，改天带你们去看。', '下次比谁跑得快。'],
    stories: ['大黑带{pet}爬上了巷子口的矮墙，在上面看了很久的自行车。', '{pet}跟着大黑追了一路落叶，回来累得直喘。', '{pet}和大黑在巷子里发现了一个会滚的瓶盖。'] },
  huajuan: { route: 'roof', sex: 'f', size: 0.81, name: '花卷', home: '楼上', look: 'look:calico|#FBF8F2|#E29A4B|#4A4550|#8DAA4E|0', desc: '楼上的三花，爱干净，见了谁都想给它舔舔毛', hello: '喵～（先把爪子舔干净才进门）',
    notes: ['你家那只的耳朵后面，我帮它舔干净了。', '窗台上的花开了，给你们带了一朵。', '记得天天梳毛哦。'],
    stories: ['花卷把{pet}从头到尾巴舔了一遍，回来毛都是顺的。', '{pet}在楼上的窗台看见了自己家的院子。', '花卷教了{pet}怎么把爪子洗得最干净。'] },
};
/** 季节活动：每个季节在院子和阳台上会出现三种小东西，每种捡够 need 个，就能领这一季限定的装饰。
 *  每一轮季节都可以重新收集；装饰领过一次之后，再完成只给小鱼干。 */
export interface SeasonEventDef { name: string; items: { id: string; name: string; icon: string; color: string }[]; need: number; reward: string; fish: number }
export const SEASON_EVENTS: Record<Season, SeasonEventDef> = {
  spring: { name: '春天的花信', need: 2, reward: 'vase', fish: 60, items: [{ id: 'petalPink', name: '粉色花瓣', icon: '🌸', color: '#F2A9BC' }, { id: 'petalWhite', name: '白色花瓣', icon: '🤍', color: '#FBF6EC' }, { id: 'sprout', name: '嫩芽', icon: '🌱', color: '#9CC987' }] },
  summer: { name: '夏夜的收藏', need: 2, reward: 'jar', fish: 60, items: [{ id: 'firefly', name: '萤火虫', icon: '✨', color: '#F3E77A' }, { id: 'shell', name: '小贝壳', icon: '🐚', color: '#F4D9C6' }, { id: 'clover', name: '四叶草', icon: '🍀', color: '#7FB870' }] },
  autumn: { name: '秋天的落叶', need: 2, reward: 'wreath', fish: 60, items: [{ id: 'leafRed', name: '红枫叶', icon: '🍁', color: '#D9603F' }, { id: 'leafYellow', name: '银杏叶', icon: '🍂', color: '#E3B341' }, { id: 'acorn', name: '橡果', icon: '🌰', color: '#A97B50' }] },
  winter: { name: '冬天的小礼物', need: 2, reward: 'snowman', fish: 60, items: [{ id: 'snowflake', name: '雪花', icon: '❄️', color: '#DCEBF5' }, { id: 'pinecone', name: '松果', icon: '🌲', color: '#8A6A4E' }, { id: 'holly', name: '冬青果', icon: '🔴', color: '#C9404A' }] },
};
export const SEASON_FINDS: Record<string, { name: string; icon: string; color: string; season: Season }> = Object.fromEntries(
  (Object.entries(SEASON_EVENTS) as [Season, SeasonEventDef][]).flatMap(([se, ev]) => ev.items.map((it) => [it.id, { name: it.name, icon: it.icon, color: it.color, season: se }])));

/** 瞬间相册：游戏自己抓拍的有趣时刻。title = 相册里显示的标题（{pets} 换成宠物的名字）；zone = 画这张照片用哪个区域当背景 */
/** zone = 照片的背景（'roof' = 屋顶那一层） */
export const MOMENTS: Record<string, { title: string; zone: ZoneId | 'roof'; icon: string }> = {
  bedFull: { title: '{pets}挤在一张床上睡着了', zone: 'bedroom', icon: '🛏️' },
  treeFull: { title: '猫爬架住满了：{pets}', zone: 'living', icon: '🗼' },
  fishing: { title: '{pets}在鱼塘边伸爪子捞鱼', zone: 'garden', icon: '🎣' },
  stargaze: { title: '{pets}爬上屋顶看星星', zone: 'roof', icon: '✨' },
  groom: { title: '{pets}凑在一起舔毛', zone: 'living', icon: '💗' },
  box: { title: '{pets}钻进了纸箱', zone: 'door', icon: '📦' },
  rainWatch: { title: '下雨天，{pets}趴在窗台上看雨', zone: 'kitchen', icon: '🌧️' },
  heater: { title: '{pets}围着暖炉取暖', zone: 'bedroom', icon: '🔥' },
  sulk: { title: '{pets}闹脾气了，背对着不理人', zone: 'living', icon: '😾' },
  neighbor: { title: '{pets}和来串门的邻居玩在了一起', zone: 'living', icon: '🐾' },
  butterfly: { title: '{pets}在院子里扑蝴蝶', zone: 'garden', icon: '🦋' },
  tunnel: { title: '{pets}从隧道里探出了脑袋', zone: 'balcony', icon: '🕳️' },
};

/** 邻居留在院子里的小东西 */
export const FIND_KINDS: Record<string, { name: string; icon: string }> = {
  fish: { name: '一条小鱼', icon: '🐟' }, flower: { name: '一朵小花', icon: '🌼' }, note: { name: '脚印纸条', icon: '🐾' },
};

// ============================================================
// 猫的日记、猫叼回来的礼物
// ============================================================

/** 猫叼回来的小东西（「猫的宝贝」图鉴，只进图鉴不进房间）。season = 只在这个季节叼回来。
 *  rare = 稀有礼物，是一件能摆出来的装饰（DECOR 里同名），收到后进「布置房间」的仓库 */
export const TREASURES: Record<string, { name: string; icon: string; desc: string; season?: Season; rare?: boolean }> = {
  feather: { name: '一根羽毛', icon: '🪶', desc: '不知道是哪只鸟掉的，被叼得有点弯。' },
  bottlecap: { name: '瓶盖', icon: '🔘', desc: '汽水瓶的盖子，在地上拍着玩了很久。' },
  pebble: { name: '圆石子', icon: '🪨', desc: '很圆很滑的一颗，大概是院子里捡的。' },
  ribbon: { name: '一截红绳', icon: '🎀', desc: '从哪里扯下来的？它不肯说。' },
  button: { name: '纽扣', icon: '🟤', desc: '一颗木纽扣，你好像也不知道是哪件衣服的。' },
  cork: { name: '软木塞', icon: '🍾', desc: '咬起来软软的，它很喜欢。' },
  marble: { name: '玻璃珠', icon: '🔵', desc: '在太阳底下会发光的小珠子。' },
  twig: { name: '小树枝', icon: '🌿', desc: '刚好能叼住的长度。' },
  dandelion: { name: '蒲公英', icon: '🌼', desc: '叼回来的路上被风吹掉了一半。', season: 'spring' },
  cicada: { name: '蝉蜕', icon: '🦗', desc: '空空的，很轻。它好像很得意。', season: 'summer' },
  foxtail: { name: '狗尾巴草', icon: '🌾', desc: '毛茸茸的，用来逗它正好。', season: 'autumn' },
  yarnend: { name: '毛线头', icon: '🧶', desc: '从围巾上拆下来的，你的围巾还好吗？', season: 'winter' },
  featherCharm: { name: '羽毛挂饰', icon: '🪶', desc: '一串编好的羽毛，不像是猫能做出来的……', rare: true },
  paperBoat: { name: '小纸船', icon: '⛵', desc: '折得很整齐的纸船，上面有个小小的脚印。', rare: true },
  shellBox: { name: '贝壳小盒', icon: '🐚', desc: '能打开的贝壳，里面是空的。', rare: true },
};

/** 日记里每种事怎么写。{n} = 猫的名字，{x} = 相关的东西（吃的、去的地方、邻居、礼物…），{c} = 今天第几次。
 *  all = 通用的几种写法（随机挑一句，同一天同一只猫挑的都一样）；按性格的写法有的话优先用；many = 同一件事今天做了好几次 */
export const DIARY_LINES: Record<string, { all: string[]; many?: string[] } & Partial<Record<Trait, string[]>>> = {
  feed: { all: ['{n}吃了{x}。', '{n}埋头吃了一碗{x}。'], many: ['{n}今天吃了 {c} 顿。'], glutton: ['{n}把{x}吃得干干净净，还把碗舔了好几遍。', '{n}吃完{x}，又在碗边守了很久。'] },
  pet: { all: ['{n}被摸了摸头，呼噜了好一会儿。'], many: ['{n}今天被摸了 {c} 次，很满足。'], clingy: ['{n}被摸的时候一直往你手里蹭。', '{n}被摸完还跟着你转了好几圈。'] },
  bath: { all: ['{n}洗了个澡，湿漉漉的样子有点委屈。'], tidy: ['{n}洗完澡，又把自己从头到尾舔了一遍。'] },
  play: { all: ['{n}玩得很开心。', '{n}扑来扑去玩了好一阵。'], adventurer: ['{n}玩得满屋子乱跑。'] },
  tripGo: { all: ['{n}带着便当出发去{x}了。'], adventurer: ['{n}迫不及待地出发去{x}，头都没回。'], clingy: ['{n}出发去{x}之前，在门口回头看了你好几次。'] },
  tripBack: { all: ['{n}从{x}回来了，看起来很累，但是很满足。'], clingy: ['{n}从{x}回来，一进门就来找你。'] },
  souvenir: { all: ['{n}还从路上带回了{x}。'] },
  neighbor: { all: ['{x}来家里串门，{n}陪它玩了一会儿。', '{x}来了，{n}和它在院子里待了好久。'] },
  outing: { all: ['{n}去找{x}玩了。'] },
  visitor: { all: ['门口来了{x}，{n}躲在后面偷偷看。'], adventurer: ['门口来了{x}，{n}第一个跑过去闻了闻。'] },
  grew: { all: ['{n}好像又长大了一点，今天开始是{x}了。'] },
  lost: { all: ['{n}离家出走了……希望它快点回来。'] },
  found: { all: ['{n}被狸花猫找回来了，一进门就钻进了窝里。'] },
  gift: { all: ['{n}叼回来一样东西：{x}。'], clingy: ['{n}叼回来{x}，放在你常坐的地方。'] },
  // 瞬间：用瞬间相册里那张照片的标题（MOMENTS 的 title），这里是找不到标题时的写法
  moment: { all: ['{n}有个可爱的瞬间被拍下来了。'] },
  // 你不在的时候（按时间和天气挑）
  awayMorning: { all: ['早上{n}趴在窗台晒太阳。', '早上{n}在屋里巡逻了一圈。'], glutton: ['早上{n}在饭碗旁边坐了很久。'] },
  awayNoon: { all: ['中午{n}睡了一个长长的午觉。', '中午{n}追着一只小虫跑了半天，没追到。'], tidy: ['中午{n}把自己的毛舔得整整齐齐。'] },
  awayEvening: { all: ['傍晚{n}在窗边看外面的鸟。', '傍晚{n}把毛线球拍到了沙发底下。'], adventurer: ['傍晚{n}在门口闻了很久，好像想出去。'] },
  awayNight: { all: ['夜里{n}在客厅里走来走去。', '夜里{n}团成一团睡得很香。'] },
  awayRain: { all: ['外面下雨，{n}一直盯着窗户上的水珠。'] },
  awayMiss: { all: ['{n}在你上次待的地方坐了一会儿。'], clingy: ['{n}在门口等了你好久。', '{n}一直在等你回来。'] },
  // 纪念册：用 FIRSTS 的 title；这里是找不到时的写法
  first: { all: ['今天是{n}值得记住的一天。'] },
  // 小玩法
  wandGame: { all: ['{n}追着逗猫棒扑了 {x} 次，玩得气喘吁吁。', '你陪{n}玩逗猫棒，它扑中了 {x} 次。'], clingy: ['你陪{n}玩了逗猫棒，它玩完还一直跟着你。'] },
  fishGame: { all: ['你陪{n}在鱼塘边捞鱼，捞到了 {x} 条。', '{n}在鱼塘边伸爪子，捞上来 {x} 条小鱼。'], glutton: ['{n}捞到 {x} 条鱼，眼睛一直盯着不放。'] },
  autoFish: { all: ['{n}自己去鱼塘待了一会儿，带回来 {x} 条小鱼。'], adventurer: ['{n}在鱼塘边守了好久，叼回来 {x} 条小鱼。'] },
  // 送养、走失被收养、回来串门、来信
  rehome: { all: ['{n}搬去{x}住了。走的时候回头看了好几次。'] },
  adoptedAway: { all: ['狸花猫带回消息：{n}被{x}收留了，过得挺好。'] },
  visitBack: { all: ['{n}从{x}回来串门了，在家里转了一圈，每个角落都闻了闻。', '{n}回来看你了，还记得自己以前最爱待的地方。'] },
  letter: { all: ['收到{n}从{x}寄来的信，上面按了一个小小的爪印。'] },
};

/** 「第一次」纪念册：每只猫每件事只记一次，记的时候拍一张照片（照片不存图，看的时候用 art/moment.ts 按 LAYOUT 画）。
 *  title 里的 {pet} 换成猫的名字；zone = 照片在哪个区域 */
export const FIRSTS: Record<string, { title: string; zone: ZoneId | 'roof'; icon: string }> = {
  meal: { title: '{pet}在家里吃的第一顿饭', zone: 'kitchen', icon: '🍚' },
  pet: { title: '第一次被摸头的{pet}', zone: 'living', icon: '🤚' },
  treeTop: { title: '{pet}第一次跳上猫爬架顶层', zone: 'living', icon: '🗼' },
  roof: { title: '{pet}第一次爬上屋顶', zone: 'roof', icon: '🏠' },
  trip: { title: '{pet}第一次出远门回来', zone: 'door', icon: '🧳' },
  friend: { title: '{pet}交到了第一个邻居朋友', zone: 'living', icon: '🐾' },
  grewYouth: { title: '{pet}长成了青年', zone: 'living', icon: '🌱' },
  grewAdult: { title: '{pet}长成了大猫', zone: 'living', icon: '🌳' },
  bond: { title: '{pet}第一次主动来蹭你', zone: 'living', icon: '💞' },
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
  // 开局自带的几件（从背景里拆出来的），商店里也有卖
  bigrug: { name: '大地毯', icon: '🟦', price: 160, height: 66, layer: 'floor', desc: '椭圆的大地毯，门口和客厅铺的就是它' },
  midrug: { name: '中地毯', icon: '🟩', price: 100, height: 48, layer: 'floor', desc: '中等大小的椭圆地毯' },
  leafpic: { name: '叶子小画', icon: '🌱', price: 60, height: 96, layer: 'wall', desc: '一枝叶子的小画' },
  sunpic: { name: '太阳小画', icon: '🌞', price: 60, height: 64, layer: 'wall', desc: '一颗太阳的小画' },
  duopic: { name: '两幅组合画', icon: '🖼️', price: 150, height: 156, layer: 'wall', desc: '远山和小鱼，上下挂在一起' },
  triopic: { name: '三幅组合画', icon: '🖼️', price: 220, height: 182, layer: 'wall', desc: '远山、太阳和小鱼，三幅挂成一组' },
  lamp: { name: '落地灯', icon: '💡', price: 80, height: 250, layer: 'stand', desc: '摆在地上，天黑了会亮', light: [0.5, 0.14] },
  sidelamp: { name: '小落地灯', icon: '🕯️', price: 60, height: 200, layer: 'stand', desc: '细细的一盏，放沙发旁边正好', light: [0.5, 0.12] },
  nightlight: { name: '小夜灯', icon: '🌙', price: 180, height: 70, layer: 'stand', desc: '天黑了会亮', light: [0.5, 0.4] },
  bigplant: { name: '龟背竹', icon: '🌿', price: 200, height: 210, layer: 'stand', desc: '一大盆，很占地方' },
  shelf: { name: '小书架', icon: '📚', price: 300, height: 190, layer: 'stand', desc: '摆满了书和小东西' },
  globe: { name: '小地球仪', icon: '🌏', price: 0, height: 96, layer: 'stand', desc: '图鉴里程碑的奖励', special: true },
  goldframe: { name: '金边相框', icon: '🖼️', price: 0, height: 130, layer: 'wall', desc: '图鉴里程碑的奖励', special: true },
  vase: { name: '樱花花瓶', icon: '🌸', price: 0, height: 120, layer: 'stand', desc: '春天活动的奖励', special: true },
  jar: { name: '萤火虫玻璃罐', icon: '✨', price: 0, height: 84, layer: 'stand', desc: '夏天活动的奖励，天黑了会亮', special: true, light: [0.5, 0.5] },
  wreath: { name: '落叶花环', icon: '🍁', price: 0, height: 110, layer: 'wall', desc: '秋天活动的奖励', special: true },
  snowman: { name: '雪人摆件', icon: '⛄', price: 0, height: 110, layer: 'stand', desc: '冬天活动的奖励', special: true },
  bell: { name: '铃铛挂饰', icon: '🔔', price: 0, height: 90, layer: 'wall', desc: '狸花猫的回礼：常客才有', special: true },
  lantern: { name: '小灯笼', icon: '🏮', price: 0, height: 110, layer: 'stand', desc: '邻居家的猫的回礼：常客才有，天黑了会亮', special: true, light: [0.5, 0.45] },
  parcel: { name: '快递纸箱摆件', icon: '📦', price: 0, height: 80, layer: 'stand', desc: '快递猫的回礼：常客才有', special: true },
  trophy: { name: '收藏家奖杯', icon: '🏆', price: 0, height: 100, layer: 'stand', desc: '图鉴里程碑的奖励', special: true },
  // 猫叼回来的稀有礼物（见 TREASURES 的 rare）
  featherCharm: { name: '羽毛挂饰', icon: '🪶', price: 0, height: 86, layer: 'wall', desc: '猫叼回来的稀有礼物', special: true },
  paperBoat: { name: '小纸船', icon: '⛵', price: 0, height: 44, layer: 'stand', desc: '猫叼回来的稀有礼物', special: true },
  shellBox: { name: '贝壳小盒', icon: '🐚', price: 0, height: 40, layer: 'stand', desc: '猫叼回来的稀有礼物', special: true },
};
/** 兼容旧名字：里程碑奖励的特殊装饰 */
export const SPECIAL_DECOR: Record<string, { name: string; icon: string }> = Object.fromEntries(Object.entries(DECOR).filter(([, d]) => d.special).map(([k, d]) => [k, { name: d.name, icon: d.icon }]));

// ============================================================
// 家具皮肤和房间风格
// ============================================================

/** 皮肤：5 套贯穿全屋的主题，每件家具和装饰都有这 5 款（造型一样，换的是配色和材质）。第一套是默认款，不用买。
 *  palette = 代码画占位图时，把默认调色板里的这些颜色换掉。正式图片的文件名见 docs/素材模板.md。 */
export interface SkinDef { id: string; name: string; palette: Partial<typeof PALETTE> }
export const SKINS: SkinDef[] = [
  { id: 'wood', name: '原木', palette: {} },
  { id: 'cream', name: '奶油', palette: { sage: '#EADFC6', mist: '#F1E4CE', coral: '#E8BCA2', mustard: '#EBD7A2', wood: '#DDC7A5', woodDark: '#B89C79', white: '#FFF9EA' } },
  { id: 'mint', name: '薄荷', palette: { sage: '#9FD3BE', mist: '#BFE3DB', coral: '#F2B8A2', mustard: '#CFE0A3', wood: '#C3CFA6', woodDark: '#7FA08C', white: '#F3FBF6' } },
  { id: 'berry', name: '莓果', palette: { sage: '#D99BB0', mist: '#E7BFD0', coral: '#C9577A', mustard: '#F0B7C4', wood: '#C58FA0', woodDark: '#8E5468', white: '#FCEFF3' } },
  { id: 'navy', name: '夜蓝', palette: { sage: '#5F7FA8', mist: '#8FA9C9', coral: '#E0A458', mustard: '#D9B45A', wood: '#7386A8', woodDark: '#3F4F74', white: '#E7EDF6' } },
];
export const DEFAULT_SKIN = SKINS[0].id;
/** 每款皮肤的价格：小件、中件、大件 */
export const SKIN_PRICE = { S: 40, M: 70, L: 120 };
/** 哪些东西有皮肤，各算小件、中件还是大件。固定家具和「家里的东西」写在这里；「房间装饰」按它自己的价格自动分档（见 skinSize） */
export const SKIN_SIZE: Record<string, 'S' | 'M' | 'L'> = {
  door: 'L', tub: 'L', bed: 'L', sofa: 'L', cabinet: 'L', pond: 'L', counter: 'L', cattree: 'L',
  album: 'M', scratcher: 'M', feeder: 'M', pendantDoor: 'M', pendantShelf: 'M', nightstand: 'M',
  bowl: 'S', ball: 'S', bedlamp: 'S', ladder: 'M',
  // 从背景里拆出来的固定家具（院子的树跟着季节换，没有皮肤）
  kitchenWindow: 'M', bedroomWindow: 'M', fence: 'M', hooks: 'S', umbrella: 'S', kitchenShelf: 'S', mirror: 'S', bathShelf: 'S', towel: 'S', shelfRack: 'S', chair: 'S',
  box: 'S', catgrass: 'S', autoball: 'S', basket: 'M', tunnel: 'M', heater: 'L',
};
/** 一件东西的皮肤算哪一档；没有皮肤的东西返回 null。装饰：70 以内小件，180 以内（和里程碑奖励）中件，再贵的大件 */
export function skinSize(kind: string): 'S' | 'M' | 'L' | null {
  if (SKIN_SIZE[kind]) return SKIN_SIZE[kind];
  const d = DECOR[kind]; if (!d) return null;
  return d.special ? 'M' : d.price <= 70 ? 'S' : d.price <= 180 ? 'M' : 'L';
}
/** 所有有皮肤的东西 */
export const SKINNABLE = [...Object.keys(SKIN_SIZE), ...Object.keys(DECOR)];

/** 房间风格：整套房间背景（墙、地板、墙上的画、地毯、盆栽这些画在背景里的东西一起换）。第一套是默认的，不用买。
 *  palette = 代码画占位背景时换掉的颜色。正式图片：room/strip-<id>.png 和 room/<区域>-<id>.png */
export interface RoomThemeDef { id: string; name: string; icon: string; price: number; desc: string; palette: Partial<typeof PALETTE> }
export const ROOM_THEMES: RoomThemeDef[] = [
  { id: 'classic', name: '暖木小屋', icon: '🏠', price: 0, desc: '奶白的墙，暖木色的地板', palette: {} },
  { id: 'seaside', name: '海盐小屋', icon: '🌊', price: 400, desc: '浅蓝灰的墙，浅色木地板，蓝白的小物',
    palette: { wall: '#E6EFF1', floor: '#CDBB9E', floorLine: '#A9977B', ceiling: '#D6E2E6', post: '#CBD9DE', sage: '#8FB7C0', mist: '#7FA3C4', coral: '#E7A08A', mustard: '#E3C877', wood: '#C8AE86', woodDark: '#8C7A62' } },
  { id: 'sakura', name: '樱粉小屋', icon: '🌸', price: 400, desc: '淡粉的墙，红棕色的地板，粉紫的小物',
    palette: { wall: '#F8E7E3', floor: '#C58E78', floorLine: '#A56E5A', ceiling: '#EED7D1', post: '#E9CEC8', sage: '#C7B0C9', mist: '#E3B4BE', coral: '#D97B8A', mustard: '#E8C48A', wood: '#B98A72', woodDark: '#8A5E50' } },
];
export const DEFAULT_ROOM = ROOM_THEMES[0].id;
