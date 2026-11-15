// 在命令行里跑数值模拟：npm run sim [天数] [宠物数]
import { simulateAll, hoursToText } from '../src/simulate';
const days = Number(process.argv[2] ?? 14), pets = Number(process.argv[3] ?? 1);
for (const feeder of [false, true]) for (const r of simulateAll(days, pets, feeder, true)) {
  console.log(`\n== ${pets} 只｜${feeder ? '有' : '没有'}喂食机｜${r.label}`);
  console.log(`首次虚弱 ${hoursToText(r.firstWeakHour)}｜首次死亡 ${hoursToText(r.firstDeathHour)}｜死亡 ${r.deaths}｜救回 ${r.rescues} 次｜饿 ${r.hungryPct}% 闷 ${r.sadPct}% 脏 ${r.dirtyPct}%`);
  console.log(`小鱼干 ${r.fishStart}→${r.fishEnd}（每天 ${r.fishPerDay}）｜买食物 ${r.spentOnFood}｜签到 ${r.earned.checkin} 鱼塘 ${r.earned.pond} 行商 ${r.earned.trade}｜明信片 ${r.postcards} 纪念品 ${r.souvenirs}｜长大 ${r.stageDays.join(' / ')}`);
  console.log(r.rows.filter((_, i) => i < 5 || i % 7 === 6 || i === r.rows.length - 1).map((x) => `  第${x.day}天 饱${x.food} 心${x.mood} 净${x.clean} 最低饱${x.minFood} 最低心${x.minMood} 鱼${x.fish} ${x.stage} ${x.note}`).join('\n'));
}
