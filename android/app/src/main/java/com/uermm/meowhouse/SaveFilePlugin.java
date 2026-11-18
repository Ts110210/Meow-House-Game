package com.uermm.meowhouse;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * 把游戏里生成的文件直接存到手机上：图片进相册（Pictures/BackScreenPet），
 * 其他文件进「下载」（Download/BackScreenPet）。
 * 用系统的媒体库接口，安卓 10 及以上不需要任何存储权限。
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("filename");
        String data = call.getString("data");
        String mime = call.getString("mime", "application/octet-stream");
        if (name == null || data == null) { call.reject("missing filename or data"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("unsupported"); return; }
        boolean image = mime != null && mime.startsWith("image/");
        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            String folder = (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/BackScreenPet";
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri collection = image
                ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            uri = resolver.insert(collection, values);
            if (uri == null) { call.reject("could not create file"); return; }
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) throw new java.io.IOException("could not open file");
            try { out.write(bytes); } finally { out.close(); }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            JSObject ret = new JSObject();
            ret.put("folder", folder);
            ret.put("image", image);
            call.resolve(ret);
        } catch (Exception e) {
            if (uri != null) { try { resolver.delete(uri, null, null); } catch (Exception ignored) { } }
            call.reject(e.getMessage() == null ? "save failed" : e.getMessage());
        }
    }
}
