# 接手说明（给接着做这个项目的 AI 对话）

这个文件是写给新对话看的：读完它、README 的功能清单和 `src/config.ts`，就可以直接开工，不需要再翻旧对话。
给人看的介绍在 `README.md`，出图和换素材的规范在 `docs/素材模板.md`，主人的出图计划和提示词在 `docs/出图清单.md`。
**每个决定为什么这样定，在 `docs/设计取舍.md`**——改规则、加功能之前先看一眼，别把讨论过的东西推翻了；新定的取舍也写进去。

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

v0.7.0，存档格式第 8 版（这几天加的新字段都靠 `repair()` 补默认值，没升版本）。README 的「功能清单」是完整的现状，「更新记录」是每一步改了什么。

最近两批：
- **2026-11-17**：16 行宠物动作、睡前睡后的过渡、宠物之间的亲密互动、性格影响行为、迎接和闹脾气、天气、邻居猫和回访、院子里的小东西、访客好感、屋顶、能钻进去的家具、暖炉和自动球、季节活动、瞬间相册、背屏的小剧场和时钟预览。
- **2026-11-18 到 11-22**：改名喵屋；新手聚光灯引导和任务；素材工具（「整张切图」、精灵图拼装的「保留跳跃高度」、高分辨率整张背景切块）；跟着真实时间的光影（简单 / 高 / 超高 / 关，超高有光照图、家具挡光、每个光源投影、朝光面）；体型重定；
  猫的日记和门口的礼物（「猫的宝贝」图鉴）；两个小玩法（逗猫棒、捞鱼，外加「让它自己去捞」）；「第一次」纪念册和亲密度（迎接、在上次离开的地方等你）；长大的意义（幼年只去近处、不上屋顶和猫爬架顶层，成年带队、稀有纪念品更多）；送养和老家人回来串门、走失 7 天被收养。
- **2026-11-23**（build-73 到 88）：界面整理（回忆 / 家两组菜单、⚙ 设置、宠物面板分页、顶上「出门」）；开发者面板「导入素材包」（zip 只存在手机上，见设计取舍）；
  影子从图里看得见的底边开始、猫在家具上也有影子；逗猫棒小玩法要先买逗猫棒、画面上有速度条和「！」；玩小玩法时房间里那只猫跟着（`scene.holdForMini`）；
  捞鱼跟着鱼塘的鱼苗走（一局一批，`sim.pondBatches`；让它去捞选 1–3 批、走到鱼塘才计时）；饭碗有空有满（`props/bowl-food.png`）；吃饱了不吃；睡着被叫醒先伸懒腰；
  客人深夜和下雨不来；闲着去鱼塘边改成坐着看；收入调高、猫多带货多；猫头上「想要」的小气泡（`sim.wantOf`，`scene.updateWants`，点了走 `ui.onWant` → `ui.careAct`）。

**还没做的事和等主人决定的事，完整清单在 `README.md` 的「待办与待决策」**。接手后先看那一节；做完一项就把那一行删掉或改状态。

主人定过、不要自己改的：

1. **宠物和家具的比例**：家具不动。2026-11-22 主人重定了一次：成年 = 原来青年的 1.2 倍，幼年 = 原来幼年的 1.1 倍，三个阶段再一起大 5%（基准 `room.petHeightOfDoor` = 0.36 × 0.8 × 1.05，`growth.stageScale` = [0.6875, 1/1.2, 1]）。每只猫自己的成年大小（公 0.85–0.9、母 0.8–0.85，存在 `pet.size`）和邻居、访客的 `size` 没动。三个阶段叫幼年、青年、成年。不要再自己改体型。
2. 新家具的摆放位置（纸箱在门口、洗衣篮在浴室、暖炉在卧室、自动球在收藏柜、隧道在阳台、猫草在院子）和客厅的布局（沙发、猫爬架、猫抓板挤在一起）是之前的对话定的，主人说过固定家具的位置要定稿，改之前先问。
3. 光影：光都从后面照来，影子往前（画面下方）倒；屋里用「超高」才按窗户和灯投影；跳跃是「原地跳」，高度只靠程序的弧线。
4. 送养只给成年猫、确认两次、没有奖励、两次至少隔 7 天、会回来串门的最多 3 只；礼物普通的进图鉴、稀有的是能摆的装饰；小玩法可玩可不玩（原来的「玩耍」按钮保留，「让它自己去捞」是不玩也有收益的选项）。
5. 2026-11-23 定的：逗猫棒小玩法要先买逗猫棒；捞鱼被鱼苗数量限制、不按天限（一局一批、没捞到不算）；让它去捞由主人选几批（1 批 2 分钟、2 批 4 分钟、3 批 5 分钟），记住上次选的，走到鱼塘才计时；
   「想要」气泡点了饿了是打开宠物面板挑吃的，其他直接做；收入是「基础调高 + 猫多靠出门多赚」；素材不用非同一个作者，画风统一就行。

替主人暂定、等他玩过再调的（数值都在 `config.ts`）：

1. 概率触发的行为（互相舔毛、讨吃的、上屋顶看星星）只验证过能触发，频率没调过。
2. 院子里的小东西和猫的礼物用表情符号占位；麻薯从院子右边的栅栏进出；大黑、花卷从屋顶左边的屋檐出现、走过屋顶、爬木梯下来，原路回去（`NEIGHBORS.route`，`updateGuest()` 里的 `roof`、`climb`）。
3. 经济：皮肤全部买齐约 17,360 小鱼干，另加两套房间风格 800；每天净收入约 55–95，签到 60，每日任务约 180–220（2026-11-23 主人要每天 250–350 起步，调高了），合计约 300–370；猫多了靠出门多带货多赚，逗猫棒小玩法每天最多约 24（前 3 局）；捞鱼不按天限，按鱼塘里的鱼苗：陪它捞一批长大的最多 24、没长大的最多 8，让它去捞每批 15–18 / 4–7（直接收获是 18）。价格和奖励都是暂定的。
4. 日记和礼物（`diary`、`gifts`、`TREASURES`、`DIARY_LINES`）、亲密度（`bond`）、小玩法（`minigame`）、送养（`rehome`）、超高光影（`light.ultra`、`light.roomLight`）的几率、次数、时长、文字。
5. 「想要」气泡的线和冷却（`want`）、吃饱的线（`stats.fullAt`）、客人不来的时段（`guests.quiet`）、逗猫棒的速度条（`minigame.wand.lively / tooFast`）、出门带货（`travel.goodsPerExtraPet`）。

## 代码地图

| 文件 | 管什么 |
|---|---|
| `src/config.ts` | 所有数值和内容表：`CONFIG`、`ZONES`（8 个区域，屋顶不算）、`roof`（上屋顶的概率和时长）、`GEAR`（家里的东西）、`DECOR`（装饰）、`SKINS`、`ROOM_THEMES`、`NEIGHBORS`、`SEASON_EVENTS`、`MOMENTS`、`QUESTS`（新手引导和每日任务）、`SPRITE`（16 行动作） |
| `src/assets.config.ts` | 每件家具的图片路径、所在区域、位置、高度、遮挡线 `frontFrom`、发光点 `light`；`perches`（扑蝴蝶的落脚点；窗台跟着窗户这件固定家具走）；`starterDecor`（开局自带的装饰和位置）；`roof`（屋顶那一层的轮廓、猫走的线、看星星的位置） |
| `src/sim.ts` | 全部规则，纯函数改 `GameState`，返回 `Result` 或事件。有 `npm test` 覆盖。日记 `note / diaryPage`、礼物 `welcomeBack / collectGift`、纪念册 `markFirst`、亲密度 `addPetBond`、送养 `rehome / formerCatsWelcome` 都在最后几节 |
| `src/save.ts` | 存档版本、迁移、`repair()`（读档时把每个字段修成合法值；**加了新字段一定要在这里补默认值**） |
| `src/scene.ts` | PixiJS 画面。`STATIONS` = 每件家具的站位和落脚点；`think()` = 宠物空闲时决定做什么；`update()` 里的状态机 = 走、跳、做动作；`updateGuest()` = 邻居猫；`watchMoments()` = 抓拍 |
| `src/ui.ts` | 所有面板（DOM，不是 Pixi） |
| `src/light.ts` | 光影：几点（`sim.lightHour`）→ 整体光色、太阳方向、影子形状、窗户光（纯函数，有测试）。画在 `scene.ts` 的 `drawShade`、`drawShadows`、`drawWindowLight`；档位在 `settings.light`（ultra / high / simple / off）。超高另有光照图 `drawLightMap`（`lightMap()`，家具挡光 `blocked()`）、家具朝光面 `drawRims`（`lightDir()`）、投在家具上的影子（`objShadowPool`，在家具那一层，带 `isActor` 不会被重建清掉），数值在 `CONFIG.light.ultra` |
| `src/art/` | 占位图：`room.ts` 区域背景和家具（也有碗里的粮 `bowlFood`）、`decor.ts` 装饰、`defaultPet.ts` 宠物的 16 行动作（`POSES`）、`postcard.ts`、`moment.ts` 瞬间照片、`want.ts` 「想要」气泡 |
| `src/minigames.ts` | 两个小玩法的画面（Canvas 2D，不进 Pixi）：`wandGame` 逗猫棒、`fishingGame` 捞鱼；结算在 `sim.finishWand / finishFishing`，「让它自己去捞」是 `sim.startAutoFish` |
| `src/sheetCut.ts` | 「整张切图」：按内容找出每一件（`labelPieces`）、去白底、窗户挖玻璃（`cutGlass`）、打 zip（`makeZip`），面板在 `ui.openSheetCut()`；「导入素材包」读 zip（`readZip`）、按路径对文件名（`matchAssetPath`），面板在 `ui.openAssets()` |
| `src/assemble.ts`、`src/assembleLift.ts` | 精灵图拼装：每个动作一张横排 4 帧的图 → 标准精灵图；「保留跳跃高度」的算法在 `assembleLift.ts`（默认都关） |
| `src/backscreen.ts`、`src/backscreenModes.ts` | 背屏画面；新的背屏画面加在 `BACK_MODES` 里。小米背屏还没开放给第三方，调研在 `docs/背屏调研.md` |

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
- **送养的猫**（`pet.rehomed`）还在 `s.pets` 里：`alivePets` / `homePets` 不算它们（不占位置、不在画面里）；回来串门时（`pet.visit`）画面用 `scenePets`，能摸能玩。新写遍历 `s.pets` 的地方记得跳过 `rehomed`。
- **幼年**自己出门只到近处（`kittenOnly`）、不上屋顶、不上猫爬架顶层；写测试要出远门或上顶层时，先把猫的 `age` 设成青年或成年。
- 测试里有随机的地方要么循环很多次看比例，要么把随机数固定住；出现过偶发失败。
- **天气和深夜跟着日期、时区变**：GitHub 上跑测试是 UTC 时区，和本地不一样。用到天气、几点的测试（捞鱼、客人、让它去）要把 `s.dev.enabled = true; s.dev.weather = 'clear'; s.dev.hour = 14` 定住；推之前用 `TZ=UTC tsx tests/run.ts` 再跑一次（build-79 就是这样挂的）。
- **一项一项推的时候要等上一次 Actions 跑完**：工作流开着 `cancel-in-progress`，新推送会取消还没跑完的旧构建，中间的 build 号就没有安装包（build-81、82 就是这样）。
- **自己缓存、一直被用着的贴图不要用 `this.tex()`**：`rebuildArt()`（换任何素材都会调）会销毁 `this.textures` 里的全部贴图。脚下的软影子、光照图、窗户光、「想要」气泡都用 `Texture.from` 自己管（build-75 修过影子画不出来）。
- **小玩法开着时**，那只猫的 `a.mini` 有值，`update()` 里会一直延长它手上的玩耍或捞鱼，关面板时 `holdForMini(id, null)` 收尾。新写让猫「放下手上的事去做别的」的地方，要跳过 `a.mini`。
- **鱼塘的一格 = 一批鱼**：`s.pond[i]` 有值就是有一批；陪它捞、让它去捞都从 `pondBatches()` 拿（先长大的、跳过正被猫守着的），捞到了把那一格清成 `null`。猫守着的那几批（`pet.fishing.slots`）不能收获。

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
