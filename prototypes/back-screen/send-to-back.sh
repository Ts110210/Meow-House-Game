#!/bin/sh
# 把背屏原型的窗口挪到小米背屏（Mac / Linux）。手机要用数据线连着电脑，并且开着 USB 调试。
# 用法：sh prototypes/back-screen/send-to-back.sh        挪到背屏
#       sh prototypes/back-screen/send-to-back.sh home   挪回主屏并关掉
PKG=com.chen.backscreenpet
ACT=$PKG/.BackScreenActivity
REAR=1   # 背屏的显示编号。不确定的话运行：adb shell dumpsys display | grep mDisplayId

find_task() { adb shell am stack list | grep "BackScreenActivity" | sed -n 's/.*taskId=\([0-9][0-9]*\).*/\1/p' | head -n 1; }

if [ "$1" = "home" ]; then
  TASK=$(find_task); [ -n "$TASK" ] && adb shell am display move-stack "$TASK" 0
  adb shell am force-stop $PKG
  echo "已挪回主屏并关闭。"; exit 0
fi

adb shell am start -n "$ACT" >/dev/null
sleep 2
TASK=$(find_task)
if [ -z "$TASK" ]; then
  echo "没找到背屏窗口的任务编号。请手动运行：adb shell am stack list"
  echo "在输出里找到带 BackScreenActivity 的那一行，记下 taskId= 后面的数字，然后运行："
  echo "  adb shell am display move-stack <那个数字> $REAR"
  exit 1
fi
echo "任务编号 $TASK，挪到显示 $REAR ..."
adb shell am display move-stack "$TASK" "$REAR"
