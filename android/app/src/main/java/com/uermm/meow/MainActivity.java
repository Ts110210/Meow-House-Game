package com.uermm.meow;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自己写的小插件：把图片存进相册、把存档存进「下载」
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
