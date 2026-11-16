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
  /** 背景图里通常已经画了它：换上背景图而它自己没有图片时，就只保留点击区域，不再画占位图 */
  partOfBackground?: boolean;
  /** 需要先在商店买了才出现 */
  needsOwned?: string;
  /** 遮挡线（0–1，从图片顶部算）：这条线以下的部分会盖在宠物前面。浴缸用它让宠物看起来泡在里面 */
  frontFrom?: number;
  /** 会发光的位置（0–1，相对图片的宽和高）。天黑了在这里画一团暖光，物品挪到哪光跟到哪 */
  light?: [number, number];
}

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
      bedroom: 'room/bedroom.png', shelf: 'room/shelf.png', balcony: 'room/balcony.png', garden: 'room/garden.png', roof: 'room/roof.png',
    } as Record<ZoneId, string>,
  },

  // ---------- 家具和可互动物品：每件一张透明背景的 PNG ----------
  objects: {
    door: { src: 'objects/door.png', zone: 'door', x: 216, y: 562, height: 392, label: '门', partOfBackground: true },
    bowl: { src: 'objects/bowl.png', zone: 'kitchen', x: 340, y: 634, height: 44, label: '饭碗' },
    feeder: { src: 'objects/feeder.png', zone: 'kitchen', x: 262, y: 564, height: 128, label: '自动喂食机', needsOwned: 'feeder' },
    pendantDoor: { src: 'objects/pendantDoor.png', zone: 'door', x: 66, y: 194, height: 194, label: '门口吊灯', needsOwned: 'pendantDoor', light: [0.5, 0.88] },
    counter: { src: 'objects/counter.png', zone: 'kitchen', x: 122, y: 548, height: 190, label: '橱柜', partOfBackground: true },
    sofa: { src: 'objects/sofa.png', zone: 'living', x: 132, y: 562, height: 144, label: '沙发', partOfBackground: true },
    cattree: { src: 'objects/cattree.png', zone: 'living', x: 330, y: 566, height: 340, label: '猫爬架', needsOwned: 'cattree' },
    scratcher: { src: 'objects/scratcher.png', zone: 'living', x: 390, y: 652, height: 160, label: '猫抓板', needsOwned: 'scratcher' },
    ball: { src: 'objects/ball.png', zone: 'living', x: 120, y: 690, height: 32, label: '玩具球', needsOwned: 'ball' },
    tub: { src: 'objects/tub.png', zone: 'bath', x: 216, y: 576, height: 128, label: '浴缸', partOfBackground: true, frontFrom: 0.2 },
    nightstand: { src: 'objects/nightstand.png', zone: 'bedroom', x: 49, y: 548, height: 70, label: '床头柜', partOfBackground: true },
    bedlamp: { src: 'objects/bedlamp.png', zone: 'bedroom', x: 49, y: 482, height: 74, label: '床头灯', needsOwned: 'bedlamp', light: [0.5, 0.28] },
    bed: { src: 'objects/bed.png', zone: 'bedroom', x: 240, y: 566, height: 150, label: '小床', partOfBackground: true },
    cabinet: { src: 'objects/cabinet.png', zone: 'shelf', x: 130, y: 564, height: 280, label: '收藏柜', partOfBackground: true },
    album: { src: 'objects/album.png', zone: 'shelf', x: 318, y: 384, height: 170, label: '相册', partOfBackground: true },
    pendantShelf: { src: 'objects/pendantShelf.png', zone: 'shelf', x: 340, y: 194, height: 194, label: '收藏柜吊灯', needsOwned: 'pendantShelf', light: [0.5, 0.88] },
    pond: { src: 'objects/pond.png', zone: 'garden', x: 262, y: 700, height: 84, label: '鱼塘', partOfBackground: true },
    box: { src: 'objects/box.png', zone: 'door', x: 340, y: 654, height: 92, label: '纸箱', needsOwned: 'box', frontFrom: 0.42 },
    basket: { src: 'objects/basket.png', zone: 'bath', x: 370, y: 652, height: 96, label: '洗衣篮', needsOwned: 'basket', frontFrom: 0.3 },
    heater: { src: 'objects/heater.png', zone: 'bedroom', x: 100, y: 656, height: 112, label: '小暖炉', needsOwned: 'heater', light: [0.5, 0.6] },
    autoball: { src: 'objects/autoball.png', zone: 'shelf', x: 250, y: 680, height: 34, label: '自动逗猫球', needsOwned: 'autoball' },
    tunnel: { src: 'objects/tunnel.png', zone: 'balcony', x: 170, y: 672, height: 80, label: '猫隧道', needsOwned: 'tunnel', frontFrom: 0 },
    catgrass: { src: 'objects/catgrass.png', zone: 'garden', x: 50, y: 608, height: 64, label: '猫草盆', needsOwned: 'catgrass' },
  } as Record<string, ObjectDef>,

  // ---------- 不是家具的落脚点：窗台。猫会跳上去看外面 ----------
  // x = 离所在区域左边多远（按 432 宽的区域算），y = 窗台的高度（按地板线在 560 算）。换了背景图、窗户位置变了，改这里。
  perches: {
    kitchenWindow: { zone: 'kitchen', x: 121, y: 306, label: '厨房窗台' },
    bedroomWindow: { zone: 'bedroom', x: 320, y: 312, label: '卧室窗台' },
    // 院子里扑蝴蝶的地方、屋顶上看星星的两个位置（这三个是站在地上，不用跳）
    butterfly: { zone: 'garden', x: 190, y: 600, label: '扑蝴蝶' },
    roofA: { zone: 'roof', x: 140, y: 626, label: '屋顶看星星' }, roofB: { zone: 'roof', x: 262, y: 660, label: '屋顶看星星' },
  } as Record<string, { zone: ZoneId; x: number; y: number; label: string }>,

  // ---------- 屋里的窗户：下雨时在这几块玻璃上画雨丝 ----------
  // x、y = 玻璃左上角，w、h = 玻璃的大小（按 432 宽的区域、地板线在 560 算）。换了背景图、窗户位置变了，改这里。
  windows: [
    { zone: 'kitchen', x: 46, y: 174, w: 150, h: 124 },
    { zone: 'bedroom', x: 250, y: 174, w: 140, h: 130 },
  ] as { zone: ZoneId; x: number; y: number; w: number; h: number }[],

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
    lamp: 'decor/lamp.png', sidelamp: 'decor/sidelamp.png', nightlight: 'decor/nightlight.png', bigplant: 'decor/bigplant.png', shelf: 'decor/shelf.png', globe: 'decor/globe.png', goldframe: 'decor/goldframe.png', trophy: 'decor/trophy.png',
  } as Record<string, string>,
  postcards: {
    singapore: 'postcards/singapore.png', penang: 'postcards/penang.png', langkawi: 'postcards/langkawi.png', bangkok: 'postcards/bangkok.png', chiangmai: 'postcards/chiangmai.png',
    bali: 'postcards/bali.png', cameron: 'postcards/cameron.png', angkor: 'postcards/angkor.png', halong: 'postcards/halong.png', borneo: 'postcards/borneo.png',
  } as Record<string, string>,
};
