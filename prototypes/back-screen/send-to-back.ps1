# 把背屏原型的窗口挪到小米背屏（Windows PowerShell）。手机要用数据线连着电脑，并且开着 USB 调试。
# 用法：powershell -ExecutionPolicy Bypass -File prototypes\back-screen\send-to-back.ps1
#       加上 home 参数：挪回主屏并关掉
param([string]$mode = "")
$pkg = "com.uermm.meowhouse"
$act = "$pkg/.BackScreenActivity"
$rear = 1   # 背屏的显示编号。不确定的话运行：adb shell dumpsys display | findstr mDisplayId

function Find-Task {
  $line = adb shell am stack list | Select-String "BackScreenActivity" | Select-Object -First 1
  if ($line -and $line.ToString() -match "taskId=(\d+)") { return $Matches[1] }
  return $null
}

if ($mode -eq "home") {
  $task = Find-Task
  if ($task) { adb shell am display move-stack $task 0 }
  adb shell am force-stop $pkg
  Write-Host "已挪回主屏并关闭。"; exit 0
}

adb shell am start -n $act | Out-Null
Start-Sleep -Seconds 2
$task = Find-Task
if (-not $task) {
  Write-Host "没找到背屏窗口的任务编号。请手动运行：adb shell am stack list"
  Write-Host "在输出里找到带 BackScreenActivity 的那一行，记下 taskId= 后面的数字，然后运行："
  Write-Host "  adb shell am display move-stack <那个数字> $rear"
  exit 1
}
Write-Host "任务编号 $task，挪到显示 $rear ..."
adb shell am display move-stack $task $rear
