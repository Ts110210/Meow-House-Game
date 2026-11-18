package com.uermm.meowhouse;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

/**
 * 背屏原型：一个单独的窗口，只显示游戏的背屏画面（网页地址带 #back-screen）。
 *
 * 它本身只是普通的安卓窗口，启动后出现在主屏上。
 * 要用电脑上的 adb（或 Shizuku）把它「挪」到背屏：am display move-stack <任务编号> 1
 * 见 docs/背屏调研.md 和 prototypes/back-screen/send-to-back.sh。
 *
 * 没有在真机上验证过。
 */
public class BackScreenActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 和主画面用同一套网页，只是从背屏专用的地址开始
        this.config = new CapConfig.Builder(this).setStartPath("/index.html#back-screen").create();
        super.onCreate(savedInstanceState);
        // 显示期间不让这块屏幕熄灭
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
