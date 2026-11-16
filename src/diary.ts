// 旅行日记：每张明信片背面的一句话。用模板拼出来——地点一句，再从季节、时段、同伴、行李里挑一句接上。
// 要加句子：在下面对应的表里加一行就行。{we} 会换成「我」或「我们」，{pal} 换成同伴的名字。
import type { DayTime, Season } from './config';

/** 每个地点至少 3 句 */
const PLACE: Record<string, string[]> = {
  singapore: ['鱼尾狮一直在喷水，{we}看了很久，胡子都湿了。', '这里的楼好高，{we}仰着头数，数到脖子酸了也没数完。', '在小贩中心门口坐了一会儿，每一阵风都是香的。'],
  penang: ['老街的墙上画着一只很大的猫，{we}在它旁边站了站，比了比谁的尾巴长。', '巷子里有人在煮白咖啡，{we}闻着闻着就走不动了。', '骑楼下面很阴凉，{we}找了块干净的地砖趴了一下午。'],
  langkawi: ['海水一层一层推上来，又悄悄退回去，像在跟{we}玩。', '沙子细细的，踩上去会留下一串梅花印。', '有一只老鹰在天上转圈，{we}假装没看见它。'],
  bangkok: ['河上的船来来往往，{we}蹲在码头看了好几班。', '寺庙的屋顶在太阳下面亮闪闪的，{we}眯着眼睛看。', '夜市的灯一盏一盏亮起来，像一条会发光的河。'],
  chiangmai: ['古城的墙是暖暖的砖红色，靠上去晒太阳刚刚好。', '山上的风里有树叶的味道，{we}深深吸了一口。', '有人在放天灯，一点一点升上去，变成了星星。'],
  bali: ['稻田一层一层的，像给山坡盖了绿色的被子。', '海边的石门后面是一整片天，{we}在门口坐了很久。', '花掉在水面上，漂啊漂，{we}用爪子轻轻碰了一下。'],
  cameron: ['茶园一眼望不到边，{we}在里面走，只露出一截尾巴。', '高原上有雾，凉凉的，贴在毛上像小水珠。', '草莓园的阿姨给了{we}一颗，红的，很甜。'],
  angkor: ['石头上长了好大的树，树根像在抱着它们。', '{we}在很老很老的台阶上坐了一会儿，听风从走廊里穿过去。', '墙上刻着好多跳舞的人，{we}学着摆了一个姿势。'],
  halong: ['海里立着一座一座小山，船从它们中间慢慢穿过去。', '水是绿色的，很静，{we}趴在船边看自己的影子。', '渔船上亮着一盏小灯，一晃一晃的，看着就困了。'],
  borneo: ['林子里到处是没听过的声音，{we}竖着耳朵听了一路。', '树上有只红毛的大家伙看了{we}一眼，{we}也看了它一眼。', '叶子大得可以当伞，雨打在上面咚咚响。'],
};

const SEASON: Record<Season, string[]> = {
  spring: ['路边开了好多小花。', '风软软的，是春天的味道。'],
  summer: ['太阳很大，影子缩成小小一团。', '知了叫个不停，{we}找了片树荫。'],
  autumn: ['叶子黄了，踩上去沙沙响。', '天很高，云走得很慢。'],
  winter: ['有点冷，{we}把爪子揣了起来。', '呼出来的气白白的，很快就散了。'],
};
const TIME: Record<DayTime, string[]> = {
  day: ['今天天气很好。', '走了好多路，一点也不累。'],
  dusk: ['太阳快落下去了，什么都是橘色的。', '傍晚的风吹过来，很舒服。'],
  night: ['天黑了，星星很多。', '夜里很安静，能听见自己的呼噜声。'],
};
const TOOL: Record<string, string[]> = {
  camera: ['拍了好多照片，回家给你看。', '相机挂在脖子上，走起路来一晃一晃的。'],
  float: ['套着泳圈漂了一会儿，一点也不怕水了。', '泳圈带对了，水凉凉的很舒服。'],
  umbrella: ['幸好带了伞，雨点落在上面像在敲小鼓。', '撑着伞走，一根毛都没湿。'],
  boots: ['穿着雨靴踩了好几个水坑。', '有了靴子，泥地也不怕了。'],
  tent: ['搭了小帐篷，躺在里面听外面的声音。', '晚上就睡在帐篷里，很暖和。'],
};
const PAL = ['和{pal}一起走，路好像变短了。', '{pal}走得比我快，但会停下来等我。', '跟{pal}分着吃了便当。'];
const ALONE = ['有点想家了。', '回去讲给你听。', '下次想带你一起来。'];

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export interface DiaryInput { destId: string; season: Season; time: DayTime; tool: string | null; names: string[]; letter: boolean; /** 同一趟已经写过的那句（路上寄的信），回家那张不重复 */ avoid?: string }

/** 拼一句日记。先说地点，再从同伴、行李、季节、时段里随机挑一样接上（有同伴或带了行李的时候更常说它们）。 */
export function writeDiary(d: DiaryInput): string {
  const we = d.names.length > 1 ? '我们' : '我';
  const pools: string[][] = [SEASON[d.season], TIME[d.time]];
  if (d.tool && TOOL[d.tool]) pools.push(TOOL[d.tool], TOOL[d.tool]);
  if (d.names.length > 1) pools.push(PAL, PAL); else pools.push(ALONE);
  const fill = (t: string) => t.split('{we}').join(we).split('{pal}').join(d.names[1] ?? '');
  const fresh = <T extends string>(list: T[]) => { const ok = list.filter((t) => !d.avoid || !d.avoid.includes(fill(t))); return ok.length ? ok : list; };
  return fill(pick(fresh(PLACE[d.destId] ?? PLACE.singapore))) + fill(pick(fresh(pick(pools))));
}

/** 给测试用：每个地点有几句 */
export const diaryPlaceCount = (destId: string) => (PLACE[destId] ?? []).length;
