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
  /** 点击时显示的名字 */
  label: string;
  /** 背景图里通常已经画了它：换上背景图而它自己没有图片时，就只保留点击区域，不再画占位图 */
  partOfBackground?: boolean;
  /** 需要先在商店买了才出现 */
  needsOwned?: string;
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
      bedroom: 'room/bedroom.png', shelf: 'room/shelf.png', balcony: 'room/balcony.png', garden: 'room/garden.png',
    } as Record<ZoneId, string>,
  },

  // ---------- 家具和可互动物品：每件一张透明背景的 PNG ----------
  objects: {
    door: { src: 'objects/door.png', zone: 'door', x: 216, y: 562, height: 392, label: '门', partOfBackground: true },
    bowl: { src: 'objects/bowl.png', zone: 'kitchen', x: 340, y: 634, height: 44, label: '饭碗' },
    feeder: { src: 'objects/feeder.png', zone: 'kitchen', x: 262, y: 564, height: 128, label: '自动喂食机', needsOwned: 'feeder' },
    scratcher: { src: 'objects/scratcher.png', zone: 'living', x: 374, y: 568, height: 160, label: '猫抓板', needsOwned: 'scratcher' },
    ball: { src: 'objects/ball.png', zone: 'living', x: 120, y: 690, height: 32, label: '玩具球', needsOwned: 'ball' },
    tub: { src: 'objects/tub.png', zone: 'bath', x: 216, y: 576, height: 128, label: '浴缸', partOfBackground: true },
    bed: { src: 'objects/bed.png', zone: 'bedroom', x: 240, y: 566, height: 150, label: '小床', partOfBackground: true },
    cabinet: { src: 'objects/cabinet.png', zone: 'shelf', x: 130, y: 564, height: 280, label: '收藏柜', partOfBackground: true },
    album: { src: 'objects/album.png', zone: 'shelf', x: 318, y: 384, height: 170, label: '相册', partOfBackground: true },
    pond: { src: 'objects/pond.png', zone: 'garden', x: 230, y: 690, height: 104, label: '鱼塘', partOfBackground: true },
  } as Record<string, ObjectDef>,

  // ---------- 默认宠物的精灵图（上传规范：4 列，每格 256×256，每行一个动作） ----------
  pets: {
    orange: 'pets/orange.png', grey: 'pets/grey.png', cream: 'pets/cream.png', black: 'pets/black.png',
  } as Record<string, string>,

  // ---------- 明信片背景（3:2，建议 1200×800），宠物由程序贴上去 ----------
  postcards: {
    singapore: 'postcards/singapore.png', penang: 'postcards/penang.png', langkawi: 'postcards/langkawi.png', bangkok: 'postcards/bangkok.png', chiangmai: 'postcards/chiangmai.png',
    bali: 'postcards/bali.png', cameron: 'postcards/cameron.png', angkor: 'postcards/angkor.png', halong: 'postcards/halong.png', borneo: 'postcards/borneo.png',
  } as Record<string, string>,
};
