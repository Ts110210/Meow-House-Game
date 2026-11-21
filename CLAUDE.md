# 接手说明（给接着做这个项目的 AI 对话）

这个文件是写给新对话看的：读完它、README 的功能清单和 `src/config.ts`，就可以直接开工，不需要再翻旧对话。
给人看的介绍在 `README.md`，出图和换素材的规范在 `docs/素材模板.md`。

## 主人的工作方式（一直有效）

- 开工前先读 README、`src/config.ts`，用几句话说明你理解的现状，等确认后再动手。
- **只改被要求的部分**，不顺手重构，不改没提到的功能。代码和设计文档有冲突时以代码为准。
- 需求不清楚先问清楚再改；有更好的想法可以提，由主人决定要不要。主人明确说「直接做、不用再确认」的那一批除外。
- 分步做、每一步跑测试并推送到 main，方便出问题时回退。全部做完后简短说明改了什么、哪里没验证到。
- 用中文交流；代码注释用中文；提交信息用英文。
- 所有数值放 `src/config.ts`，素材路径和位置放 `src/assets.config.ts`，规则放 `src/sim.ts`（不碰画面）。
- 美术全是代码画的占位图。**每加一样看得见的东西（家具、动作、特效、小物件），都要同步更新 `docs/素材模板.md`**，主人靠它准备正式素材。
- 每做完一项，在 README 的「更新记录」最上面加一行（时间 UTC+8、build 号 = 这次推送的 Actions 运行编号、做了什么）。

## 名字

游戏叫 **喵屋**，英文名 **Meow House**（2026-11-18 定的；之前叫过「背屏宠物」「uermm meow」）。手机语言是英文时桌面上显示 Meow House（`android/app/src/main/res/values-en/strings.xml`）。
应用编号 `com.uermm.meowhouse`，安卓代码在 `android/app/src/main/java/com/uermm/meowhouse/`。GitHub 仓库是 `Ts110210/Meow-House-Game`（2026-11-18 主人从 `back-screen-pet` 改过来的，旧地址会自动跳转）。网页版的发布见 `docs/网页版发布.md`。存档的内部键名（`pet-game-…`）也没改。

## 现在做到哪

v0.7.0，存档格式第 8 版。README 的「功能清单」是完整的现状。最近一批（2026-11-17）加的是：
16 行宠物动作、睡前睡后的过渡、宠物之间的亲密互动、性格影响行为、迎接和闹脾气、天气、邻居猫和回访、院子里的小东西、访客好感、
屋顶、能钻进去的家具、暖炉和自动球、季节活动、瞬间相册、背屏的小剧场和时钟预览。

**还没做的事和等主人决定的事，完整清单在 `README.md` 的「待办与待决策」**（比例方案 A/B/C、互动频率、新手引导、院子图标、经济平衡、真机性能、网页部署）。接手后先看那一节；做完一项就把那一行删掉或改状态。

主人还没确认、可能要改的：

1. **宠物和家具的比例**：2026-11-18 主人定了，家具不动。成年公猫是最初设计的 85%–90%、母猫 80%–85%（每只领养时随机，存在 `pet.size`），青年 = 自己成年的 2/3，幼年 = 一半；邻居和访客同一范围。三个阶段叫幼年、青年、成年。不要再自己改体型。
2. 新家具的摆放位置（纸箱在门口、洗衣篮在浴室、暖炉在卧室、自动球在收藏柜、隧道在阳台、猫草在院子）和客厅的布局（沙发、猫爬架、猫抓板挤在一起）是上一个对话定的，主人说过固定家具的位置要定稿，改之前先问。
3. 概率触发的行为（互相舔毛、讨吃的、上屋顶看星星）只验证过能触发，频率合不合适没调过。
4. 院子里的小东西用表情符号占位；麻薯从院子右边的栅栏进出（走到尽头直接消失）；大黑、花卷从屋顶左边的屋檐出现、走过屋顶、爬木梯下来，原路回去（`NEIGHBORS.route`，`updateGuest()` 里的 `roof`、`climb`）。
5. 皮肤全部买齐约 17,360 小鱼干，另加两套房间风格 800；每天净收入大约 55–95，加上每日任务约 130–200。任务奖励也是暂定的。价格是暂定的。

## 代码地图

| 文件 | 管什么 |
|---|---|
| `src/config.ts` | 所有数值和内容表：`CONFIG`、`ZONES`（8 个区域，屋顶不算）、`roof`（上屋顶的概率和时长）、`GEAR`（家里的东西）、`DECOR`（装饰）、`SKINS`、`ROOM_THEMES`、`NEIGHBORS`、`SEASON_EVENTS`、`MOMENTS`、`QUESTS`（新手引导和每日任务）、`SPRITE`（16 行动作） |
| `src/assets.config.ts` | 每件家具的图片路径、所在区域、位置、高度、遮挡线 `frontFrom`、发光点 `light`；`perches`（扑蝴蝶的落脚点；窗台跟着窗户这件固定家具走）；`starterDecor`（开局自带的装饰和位置）；`roof`（屋顶那一层的轮廓、猫走的线、看星星的位置） |
| `src/sim.ts` | 全部规则，纯函数改 `GameState`，返回 `Result` 或事件。有 `npm test` 覆盖 |
| `src/save.ts` | 存档版本、迁移、`repair()`（读档时把每个字段修成合法值；**加了新字段一定要在这里补默认值**） |
| `src/scene.ts` | PixiJS 画面。`STATIONS` = 每件家具的站位和落脚点；`think()` = 宠物空闲时决定做什么；`update()` 里的状态机 = 走、跳、做动作；`updateGuest()` = 邻居猫；`watchMoments()` = 抓拍 |
| `src/ui.ts` | 所有面板（DOM，不是 Pixi） |
| `src/light.ts` | 光影：几点（`sim.lightHour`）→ 整体光色、太阳方向、影子形状、窗户光（纯函数，有测试）。画在 `scene.ts` 的 `drawShade`、`drawShadows`、`drawWindowLight`；档位在 `settings.light`（high / simple / off） |
| `src/art/` | 占位图：`room.ts` 区域背景和家具、`decor.ts` 装饰、`defaultPet.ts` 宠物的 16 行动作（`POSES`）、`postcard.ts`、`moment.ts` 瞬间照片 |
| `src/backscreen.ts`、`src/backscreenModes.ts` | 背屏画面；新的背屏画面加在 `BACK_MODES` 里 |

几个容易踩的地方：

- **前后遮挡**：家具、摆在地上的装饰、宠物、邻居都在 `scene.objects` 这一层里，按 `zIndex` = 脚底的 y 排序。宠物的根节点带 `isActor` 标记，重建家具时不会被清掉。
- **宠物的位置**：`a.x、a.y` 是它站在地上的位置；跳到家具上时这两个数不变，画的位置用 `perchSpot()`。`a.station` = 占着哪件家具的位置，`a.perch` = 真的已经在上面了，`a.hop` = 正在跳。
- **加一件猫能上去的家具**：`assets.config.ts` 加物品 → `art/room.ts` 的 `OBJECT_ART` 画占位 → `scene.ts` 的 `STATIONS` 加落脚点（要进 `LOUNGE` 才会自己去）→ `config.ts` 的 `GEAR` 和 `SKIN_SIZE` → `ObjectKind` 类型 → 素材模板。
- **皮肤**：占位图靠换调色板（`art/room.ts` 里的 `P` 是临时切换的）；图片文件名 = 默认名加 `-皮肤 id`。
- **精灵图最多 16 行**（4096 像素是很多手机贴图的上限）。再加动作要拆成两张图。
- **背景只画墙和地板**（2026-11-18 拆的）：窗户、置物架、镜子、挂钩等是固定家具（`wall: true`），窗户的 `glass` 是挖空的玻璃，后面的风景和雨丝在 `syncWindowViews()` 里画；地毯、挂画、盆栽是开局自带的装饰（`decor.starter`）。不要再往背景里画东西。
- **装饰的摆放规则**：判断在 `sim.decorProblem()`（纯函数，有测试），区域的样子（墙上的框、脚底、要留空的地方）由 `scene.placeWorld()` 量好传进去，数值在 `CONFIG.decor`。加了新家具或新的猫站位，规则会自动带上；开局自带的装饰位置（`starterDecor`）要能通过规则，不然读档时会被收起来。
- **整张背景图** `room/full.png`（3456×1440）：切成上下两半，下半张当长图（`room.full` 自己的 floor、9 条 lines，`geo.bg.full` / `bgCfg()`），上半张当屋顶那一层，横向和下面线性对齐。构图底稿 `docs/构图底稿.png` 是用 Python 按配置画的，家具位置改了要重画。
- **任务**：规则在 `sim.ts` 的 `questEvent / questStatus / claimQuest`；新加一种玩家行为想算进任务，在那个规则函数成功时调 `questEvent(s, key)`，再在 `QUESTS` 里加任务。面板在 `ui.openQuests()`，「去做」的去处在 `questGo()`。
- **屋顶那一层**：世界坐标 y 在 -720 到 0（地面这一层是 0 到 720）。上层图的坐标 u 每 432 对应下面一个区域，用 `topToWorld` / `worldToTop` 换算。
  猫在屋顶上时 `a.roof` 有值、爬梯子时 `a.climb` 有值，这时地上的逻辑全部跳过（`roofStep()`），`a.x、a.y` 停在梯子底下。镜头切层用 `layer` 和 `lift`。
- `think()` 之后如果已经定了下一件事（`a.pending`），不要再把动作设回 idle，否则睡觉的猫会抽一下（修过一次）。
- **安排通知一定要带 `isExactNotification: false`**（`src/platform/native.ts` 的 `NOT_EXACT`）。通知插件 8.3 起，想要精确闹钟又没权限时 `schedule()` 会自己跳到系统的「闹钟和提醒」设置页；而 AndroidManifest 故意去掉了这个权限，不带这个参数就会每次都跳，荣耀手机上卡死在设置页（build-31 修过）。
- 测试里有随机的地方要么循环很多次看比例，要么把随机数固定住；出现过偶发失败。

## 怎么验证

```bash
npm test            # 规则、存档、提醒
npm run build       # 类型检查 + 打包（推送后 GitHub Actions 也会跑这两步，再打 APK）
npm run sim 30 3    # 数值模拟
```

推送到 main 后用 `gh run list --repo Ts110210/Meow-House-Game --limit 3` 确认 Actions 成功。

如果所在的环境装不了依赖（上一个对话就是这样，`npm install` 连不上）：

- `npm test` 可以用全局的 `tsx tests/run.ts` 跑，`@capacitor/*` 在 `node_modules` 里放几个只导出空对象的替身就行（`node_modules` 不进仓库）。
- 画面可以这样看：写一个只用 Canvas 2D 的 `pixi.js` 替身（`Container`、`Sprite`、`Graphics`、`Text`、`Texture`、`Application`，支持 `zIndex` 排序、`blendMode` 和点击），
  用 esbuild 把 `src/main.ts` 打成一个包并把 `pixi.js` 指到替身，再用无头 Chrome 打开截图。页面上有 `window.__game`、`__scene`、`__sim`，可以直接改存档、指挥宠物。
  这样能发现运行时报错和布局问题，但混合模式、性能、真机触摸都验证不到，要在汇报里说清楚。
- 真正的类型检查以 Actions 为准。

## 汇报时要说清楚的

哪些是在替身环境里看的、哪些完全没验证；自己替主人做了哪些决定（位置、价格、概率）；和原来说法不一样的地方。
