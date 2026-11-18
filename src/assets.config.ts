// ============================================================
// 素材配置：所有图片的路径都在这个文件里。
//
// 用法：把图片按下面写的文件名放进 public/assets/ 文件夹，重新打开页面就能看到效果。
// 某个文件不存在时，游戏会自动用代码画的占位图，不会出错。
// 也可以不动文件：打开开发者面板 →「素材替换」，直接在页面里上传图片预览。
// ============================================================
import type { ZoneId } from './config';

export interface ObjectDef {
  /** 图片路径（相对 public/assets/） */
  src: string;
  /** 放在哪个区域 */
  zone: ZoneId;
  /** 中心点离这个区域左边多远（每个区域宽 432） */
  x: number;
  /** 底边的位置（房间高 720，地板从 560 开始） */
  y: number;
  /** 显示出来多高；宽度按图片比例自动算 */
  height: number;
  /** 能钻进去的东西（浴缸、纸箱、洗衣篮、隧道）：从顶部往下这个比例开始是「前面一层」，会盖在宠物身上。0 = 整件都在宠物前面 */
  // （frontFrom 写在下面）
  /** 点击时显示的名字 */
  label: string;
  /** 固定家具（以前表示「背景图里已经画了它」，现在背景只画墙和地板，这个标记不再影响显示） */
  partOfBackground?: boolean;
  /** 需要先在商店买了才出现 */
  needsOwned?: string;
  /** 遮挡线（0–1，从图片顶部算）：这条线以下的部分会盖在宠物前面。浴缸用它让宠物看起来泡在里面 */
  frontFrom?: number;
  /** 会发光的位置（0–1，相对图片的宽和高）。天黑了在这里画一团暖光，物品挪到哪光跟到哪 */
  light?: [number, number];
  /** 吃饭时嘴要对准的那一块（0–1，相对图片：左、上、右、下）。饭碗 = 碗口，自动喂食机 = 出粮口。和图片的范围框不是一回事 */
  mouth?: [number, number, number, number];
  /** 挂在墙上的固定家具（窗户、置物架、镜子、毛巾架、挂钩）：排在地上所有东西的后面 */
  wall?: boolean;
  /** 窗户的玻璃（0–1，相对图片：左、上、右、下）。图片里这一块要挖空（透明），程序在后面画窗外的天空、雨丝 */
  glass?: [number, number, number, number];
  /** 跟着季节换图（院子的树）：图片文件名 = 默认名加 -spring / -summer / -autumn / -winter，没有皮肤 */
  seasonal?: boolean;
}

/** 吃饭时临时摆在地上的东西（罐头、便当，和吃完的空罐、空盒）。height = 显示多高；mouth = 嘴要对准的点（0–1，相对图片） */
export interface PropDef { src: string; height: number; mouth: [number, number]; label: string }

export const ASSETS = {
  base: 'assets/',

  /** 宠物整体放大或缩小（背景图里的门和家具比例不一样时用） */
  petScale: 1,

  /** 自动去掉和图片边缘连着的白色背景（Gemini 生成的图一般是白底） */
  removeWhiteBackground: { pets: true, objects: false },

  // ---------- 房间背景 ----------
  // 两种方式可以混用：有单独的区域图就用区域图，否则用长图，都没有就用代码画。
  room: {
    /** 方式一：一张长图。高度对应房间高度，从最左边开始盖住 coverZones 个区域。
     *  5 个区域（门口、厨房、客厅、浴室、卧室）正好是 3:1，建议 2160×720 或它的倍数。 */
    strip: {
      src: 'room/strip.png', coverZones: 5,
      /** 图片的尺寸不用很精确：下面两项告诉程序图里的地板线和区域分界线在哪（0–1）。
       *  在开发者面板 →「素材替换」→「调整背景」里拖出来，再导出抄到这里。 */
      floor: 560 / 720,
      lines: [0, 0.2, 0.4, 0.6, 0.8, 1],
    },
    /** 方式二：每个区域一张图，比例 3:5（432×720 或它的倍数）。 */
    zones: {
      door: 'room/door.png', kitchen: 'room/kitchen.png', living: 'room/living.png', bath: 'room/bath.png',
      bedroom: 'room/bedroom.png', shelf: 'room/shelf.png', balcony: 'room/balcony.png', garden: 'room/garden.png',
    } as Record<ZoneId, string>,
    /** 上面那一层（屋顶和天空）：一张 3456×720 的图，横向 8 等分，每一份正好在下面一个区域的正上方。
     *  没有这张图就用代码画（屋顶跟着四季、昼夜、天气变；换成图片后是固定的一张，只有整体压暗和雨雪是程序加的）。 */
    top: 'room/top.png',
    /** 方式三：整张图（上下两层一起），3456×1440：上半张是屋顶和天空，下半张是 8 个区域（门口到院子）。
     *  有这张图就优先用它（区域图、长图、上层图都不用了）。floor = 地板线在下半张高度的位置，lines = 8 个区域的 9 条分界线（0–1），
     *  都可以在「调整背景」里拖。用 docs/构图底稿.png 当构图参考生成，位置会比较准 */
    full: {
      src: 'room/full.png', coverZones: 8,
      floor: 560 / 720,
      lines: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    },
  },

  // ---------- 屋顶（上面那一层）：坐标按上层图 3456×720 算，x 每 432 对应下面一个区域 ----------
  roof: {
    /** 屋顶的外轮廓（梯形）：左屋檐、左上角、右上角、右屋檐。右屋檐在阳台的右边（3024 = 7 个区域宽） */
    outline: [[-30, 724], [380, 430], [2644, 430], [3054, 724]] as [number, number][],
    /** 猫走的线（脚底）：顺着两边的斜坡和中间的平顶。斜坡上的猫会跟着坡度歪一点 */
    walk: [[20, 700], [380, 440], [2644, 440], [2994, 700]] as [number, number][],
    /** 看星星的两个位置（x）：平顶的右端，挨着坐、一起朝左边的月亮看。点「屋顶」落地的那一屏（梯子在右边）正好看得到 */
    spots: [2592, 2640],
  },

  // ---------- 家具和可互动物品：每件一张透明背景的 PNG ----------
  objects: {
    door: { src: 'objects/door.png', zone: 'door', x: 216, y: 562, height: 392, label: '门', partOfBackground: true },
    bowl: { src: 'objects/bowl.png', zone: 'kitchen', x: 135, y: 661, height: 44, label: '饭碗', mouth: [0.08, 0.1, 0.92, 0.45] },
    feeder: { src: 'objects/feeder.png', zone: 'kitchen', x: 330, y: 591, height: 128, label: '自动喂食机', needsOwned: 'feeder', mouth: [0.12, 0.8, 0.88, 0.9] },
    pendantDoor: { src: 'objects/pendantDoor.png', zone: 'door', x: 66, y: 194, height: 194, label: '门口吊灯', needsOwned: 'pendantDoor', light: [0.5, 0.88] },
    counter: { src: 'objects/counter.png', zone: 'kitchen', x: 117, y: 573, height: 190, label: '橱柜', partOfBackground: true },
    sofa: { src: 'objects/sofa.png', zone: 'living', x: 134, y: 579, height: 144, label: '沙发', partOfBackground: true },
    cattree: { src: 'objects/cattree.png', zone: 'living', x: 320, y: 612, height: 380, label: '猫爬架', needsOwned: 'cattree' },
    scratcher: { src: 'objects/scratcher.png', zone: 'living', x: 109, y: 678, height: 136, label: '猫抓板', needsOwned: 'scratcher' },
    ball: { src: 'objects/ball.png', zone: 'living', x: 34, y: 629, height: 34, label: '玩具球', needsOwned: 'ball' },
    tub: { src: 'objects/tub.png', zone: 'bath', x: 159, y: 582, height: 149, label: '浴缸', partOfBackground: true, frontFrom: 0.2 },
    nightstand: { src: 'objects/nightstand.png', zone: 'bedroom', x: 49, y: 572, height: 70, label: '床头柜', partOfBackground: true },
    bedlamp: { src: 'objects/bedlamp.png', zone: 'bedroom', x: 49, y: 505, height: 73, label: '床头灯', needsOwned: 'bedlamp', light: [0.5, 0.28] },
    bed: { src: 'objects/bed.png', zone: 'bedroom', x: 256, y: 575, height: 163, label: '小床', partOfBackground: true },
    cabinet: { src: 'objects/cabinet.png', zone: 'shelf', x: 122, y: 579, height: 280, label: '收藏柜', partOfBackground: true },
    album: { src: 'objects/album.png', zone: 'shelf', x: 318, y: 384, height: 170, label: '相册', partOfBackground: true },
    pendantShelf: { src: 'objects/pendantShelf.png', zone: 'shelf', x: 340, y: 194, height: 194, label: '收藏柜吊灯', needsOwned: 'pendantShelf', light: [0.5, 0.88] },
    pond: { src: 'objects/pond.png', zone: 'garden', x: 268, y: 678, height: 89, label: '鱼塘', partOfBackground: true },
    box: { src: 'objects/box.png', zone: 'door', x: 340, y: 649, height: 92, label: '纸箱', needsOwned: 'box', frontFrom: 0.42 },
    basket: { src: 'objects/basket.png', zone: 'bath', x: 347, y: 637, height: 96, label: '洗衣篮', needsOwned: 'basket', frontFrom: 0.3 },
    heater: { src: 'objects/heater.png', zone: 'bedroom', x: 238, y: 656, height: 129, label: '小暖炉', needsOwned: 'heater', light: [0.5, 0.6] },
    autoball: { src: 'objects/autoball.png', zone: 'shelf', x: 161, y: 681, height: 34, label: '自动逗猫球', needsOwned: 'autoball' },
    // ---- 从背景里拆出来的固定家具（2026-11-18）：背景只剩墙、地板和窗外的远景 ----
    hooks: { src: 'objects/hooks.png', zone: 'door', x: 368, y: 382, height: 116, label: '挂钩', wall: true },
    umbrella: { src: 'objects/umbrella.png', zone: 'door', x: 64, y: 588, height: 136, label: '伞桶' },
    kitchenWindow: { src: 'objects/kitchenWindow.png', zone: 'kitchen', x: 122, y: 312, height: 156, label: '厨房的窗户', wall: true, glass: [0.096, 0.115, 0.894, 0.91] },
    kitchenShelf: { src: 'objects/kitchenShelf.png', zone: 'kitchen', x: 322, y: 342, height: 160, label: '置物架', wall: true },
    mirror: { src: 'objects/mirror.png', zone: 'bath', x: 112, y: 288, height: 124, label: '镜子', wall: true },
    bathShelf: { src: 'objects/bathShelf.png', zone: 'bath', x: 258, y: 258, height: 64, label: '肥皂架', wall: true },
    towel: { src: 'objects/towel.png', zone: 'bath', x: 370, y: 264, height: 92, label: '毛巾架', wall: true },
    bedroomWindow: { src: 'objects/bedroomWindow.png', zone: 'bedroom', x: 321, y: 318, height: 162, label: '卧室的窗户', wall: true, glass: [0.101, 0.111, 0.888, 0.914] },
    shelfRack: { src: 'objects/shelfRack.png', zone: 'shelf', x: 321, y: 446, height: 76, label: '装饰架', wall: true },
    chair: { src: 'objects/chair.png', zone: 'balcony', x: 286, y: 580, height: 132, label: '阳台的椅子' },
    tree: { src: 'objects/tree.png', zone: 'garden', x: 92, y: 552, height: 356, label: '大树', seasonal: true },
    fence: { src: 'objects/fence.png', zone: 'garden', x: 216, y: 560, height: 82, label: '栅栏' },
    // 木梯子：固定家具，从阳台的地上一直搭到屋檐（顶端伸出天花板，进到上面那一层）。猫顺着它上下屋顶
    ladder: { src: 'objects/ladder.png', zone: 'balcony', x: 368, y: 598, height: 632, label: '木梯子', partOfBackground: true },
    tunnel: { src: 'objects/tunnel.png', zone: 'balcony', x: 156, y: 666, height: 80, label: '猫隧道', needsOwned: 'tunnel', frontFrom: 0 },
    catgrass: { src: 'objects/catgrass.png', zone: 'garden', x: 165, y: 580, height: 64, label: '猫草盆', needsOwned: 'catgrass' },
  } as Record<string, ObjectDef>,

  // ---------- 吃饭时摆在地上的东西 ----------
  props: {
    can: { src: 'props/can.png', height: 36, mouth: [0.5, 0.18], label: '鱼罐头' },
    canEmpty: { src: 'props/can-empty.png', height: 36, mouth: [0.5, 0.18], label: '空罐头' },
    feast: { src: 'props/feast.png', height: 34, mouth: [0.5, 0.22], label: '豪华便当' },
    feastEmpty: { src: 'props/feast-empty.png', height: 34, mouth: [0.5, 0.22], label: '空便当盒' },
  } as Record<string, PropDef>,
  /** 吃鱼罐头、豪华便当的地方：厨房里饭碗周围的一块长方形，在这里面随便找个空位（x、y = 宠物脚底，按 432 宽、地板线 560 算） */
  eatArea: { zone: 'kitchen' as ZoneId, x: [40, 420] as [number, number], y: [614, 700] as [number, number] },

  // ---------- 不是家具的落脚点：窗台。猫会跳上去看外面 ----------
  // x = 离所在区域左边多远（按 432 宽的区域算），y = 窗台的高度（按地板线在 560 算）。换了背景图、窗户位置变了，改这里。
  // 窗台已经跟着窗户（固定家具 kitchenWindow、bedroomWindow）走，不在这里了
  perches: {
    // 院子里扑蝴蝶的地方（站在地上，不用跳）。屋顶上看星星的位置在上面的 roof.spots
    butterfly: { zone: 'garden', x: 190, y: 600, label: '扑蝴蝶' },
  } as Record<string, { zone: ZoneId; x: number; y: number; label: string }>,

  // 下雨时画雨丝的窗玻璃：现在用窗户（固定家具）的 glass

  // ---------- 开局自带的装饰：原来画在背景里的地毯、挂画、盆栽，拆出来变成可以挪、可以收起来的装饰 ----------
  // x = 中心离区域左边多远，y = 底边（和自己摆的装饰一样）。新存档一开始就有；旧存档读档时补上一次
  starterDecor: [
    { kind: 'leafpic', zone: 'door', x: 67, y: 332 }, { kind: 'bigrug', zone: 'door', x: 216, y: 663 },
    { kind: 'mat', zone: 'kitchen', x: 330, y: 668 },
    { kind: 'triopic', zone: 'living', x: 155, y: 358 }, { kind: 'bigrug', zone: 'living', x: 210, y: 679 },
    { kind: 'midrug', zone: 'bath', x: 216, y: 684 },
    { kind: 'duopic', zone: 'bedroom', x: 119, y: 356 }, { kind: 'midrug', zone: 'bedroom', x: 250, y: 680 },
    { kind: 'sunpic', zone: 'shelf', x: 84, y: 234 }, { kind: 'plant', zone: 'shelf', x: 318, y: 582 }, { kind: 'midrug', zone: 'shelf', x: 216, y: 676 },
    { kind: 'plant', zone: 'balcony', x: 52, y: 578 }, { kind: 'plant', zone: 'balcony', x: 132, y: 582 },
  ] as { kind: string; zone: ZoneId; x: number; y: number }[],

  // ---------- 默认宠物的精灵图（上传规范：4 列，每格 256×256，每行一个动作） ----------
  pets: {
    orange: 'pets/orange.png', grey: 'pets/grey.png', cream: 'pets/cream.png', black: 'pets/black.png', tabby: 'pets/tabby.png',
    calico: 'pets/calico.png', tortie: 'pets/tortie.png', cow: 'pets/cow.png', siamese: 'pets/siamese.png', persian: 'pets/persian.png',
  } as Record<string, string>,

  // ---------- 明信片背景（3:2，建议 1200×800），宠物由程序贴上去 ----------
  /** 装饰的图片。没有图片就用代码画的占位图。加新装饰时在这里加一行 */
  decor: {
    cushion: 'decor/cushion.png', mat: 'decor/mat.png', poster: 'decor/poster.png', plant: 'decor/plant.png', rug: 'decor/rug.png', painting: 'decor/painting.png',
    vase: 'decor/vase.png', jar: 'decor/jar.png', wreath: 'decor/wreath.png', snowman: 'decor/snowman.png',
    bell: 'decor/bell.png', lantern: 'decor/lantern.png', parcel: 'decor/parcel.png',
    bigrug: 'decor/bigrug.png', midrug: 'decor/midrug.png', leafpic: 'decor/leafpic.png', sunpic: 'decor/sunpic.png', duopic: 'decor/duopic.png', triopic: 'decor/triopic.png',
    lamp: 'decor/lamp.png', sidelamp: 'decor/sidelamp.png', nightlight: 'decor/nightlight.png', bigplant: 'decor/bigplant.png', shelf: 'decor/shelf.png', globe: 'decor/globe.png', goldframe: 'decor/goldframe.png', trophy: 'decor/trophy.png',
  } as Record<string, string>,
  postcards: {
    singapore: 'postcards/singapore.png', penang: 'postcards/penang.png', langkawi: 'postcards/langkawi.png', bangkok: 'postcards/bangkok.png', chiangmai: 'postcards/chiangmai.png',
    bali: 'postcards/bali.png', cameron: 'postcards/cameron.png', angkor: 'postcards/angkor.png', halong: 'postcards/halong.png', borneo: 'postcards/borneo.png',
  } as Record<string, string>,
};
