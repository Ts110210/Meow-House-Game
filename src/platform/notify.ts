// 提醒的平台层。网页版只在游戏里弹一条提示。
// 打包成安卓 App 后，把 scheduleHungryReminder 换成 @capacitor/local-notifications，
// 就能在 App 关掉时也提醒主人。

export interface HungryReminder { petName: string; at: number }

let handler: (text: string) => void = () => {};

export function setToastHandler(fn: (text: string) => void) { handler = fn; }

export function notifyNow(text: string) { handler(text); }

/** 预留给本地通知：at = 预计饱食度降到提醒线的真实时间 */
export function scheduleHungryReminder(_r: HungryReminder) {
  // 网页版不做任何事。安卓版在这里调用 LocalNotifications.schedule(...)
}
