# 素材文件夹

把图片按下面的文件名放进来，重新打开页面就生效。缺哪张，哪张就继续用代码画的占位图。
文件名、位置和缩放都在 `src/assets.config.ts` 里，可以改。

## room/ 房间背景（正侧面、没有透视，地板是下方一条水平带）

房间高 720，地板从 560 开始（下方 160 是地板）。两种方式可以混用，有单独的区域图时优先用区域图。

- `strip.png`：一张长图，从左到右是门口、厨房、客厅、浴室、卧室。建议约 3:1（2160×720），但尺寸不用精确：
  图片按高度铺满房间，地板线和 5 个区域的分界线在开发者面板 →「素材替换」→「调整背景」里拖着对齐，
  宠物走的地面、区域的宽度、物品的位置都会跟着走。调好后「导出配置」，把 floor、lines、petScale 抄进 `src/assets.config.ts`。
- `door.png` `kitchen.png` `living.png` `bath.png` `bedroom.png` `shelf.png` `balcony.png` `garden.png` `roof.png`：每个区域一张，3:5（432×720 的倍数）。

收藏柜、阳台、院子、屋顶四个区域不在长图里，需要单独的区域图，否则继续用占位图。

## objects/ 家具和可互动物品（透明背景 PNG，每件一张）

`door.png` `pendantDoor.png` `counter.png` `bowl.png` `feeder.png` `sofa.png` `cattree.png` `scratcher.png` `ball.png` `tub.png`
`nightstand.png` `bedlamp.png` `bed.png` `cabinet.png` `album.png` `pendantShelf.png` `pond.png`
`box.png` `basket.png` `heater.png` `autoball.png` `tunnel.png` `catgrass.png`

每件的显示高度、特别的要求（坐垫高度、遮挡线、发光点）见 `docs/素材模板.md` 第 2 节。
门、橱柜、沙发、浴缸、床头柜、床、收藏柜、相册墙、鱼塘是固定家具：所在区域换了背景图、而它们没有自己的图片时，占位图自动隐藏，只保留点击区域。
建议正式素材里把它们都单独出图、不画进背景——这样才有前后遮挡、能换皮肤，猫也才能跳到沙发和床上。

## decor/ 房间装饰（透明背景 PNG）

`cushion.png` `mat.png` `poster.png` `plant.png` `rug.png` `painting.png` `lamp.png` `sidelamp.png` `nightlight.png` `bigplant.png` `shelf.png`
奖励（商店不卖）：`globe.png` `goldframe.png` `trophy.png` `bell.png` `lantern.png` `parcel.png` `vase.png` `jar.png` `wreath.png` `snowman.png`

## 皮肤和房间风格

每件家具和装饰有 5 款皮肤：默认款不加后缀，其余四款在文件名后面加 `-cream` `-mint` `-berry` `-navy`（比如 `objects/bed-mint.png`）。
房间背景有 3 套：默认的不加后缀，另外两套加 `-seaside` `-sakura`（比如 `room/strip-seaside.png`、`room/kitchen-sakura.png`）。
详细的规则见 `docs/素材模板.md` 第 3 节和第 8 节。

## pets/ 默认宠物的精灵图

`orange.png` `grey.png` `cream.png` `black.png`：4 列，每格 256×256，每行一个动作，
从上到下是待机、走路、吃东西、睡觉、开心、洗澡（可选）、舔毛（可选）、玩耍（可选）。面朝右。

不用自己拼：开发者面板 →「精灵图拼装」里，每个动作上传一张「白底、横排 4 帧」的图，
程序会自动切帧、去白底、裁空白、统一大小（最高的一帧约占格子 70%）、脚底对齐到格子 90% 处，拼好后可以下载 PNG。

## postcards/ 明信片背景（3:2，建议 1200×800）

`singapore.png` `penang.png` `langkawi.png` `bangkok.png` `chiangmai.png` `bali.png` `cameron.png` `angkor.png` `halong.png` `borneo.png`
画面下方中间留一块空地，宠物由程序贴上去。
