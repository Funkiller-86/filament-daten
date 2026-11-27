package de.filament.bestand;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Zeigt die Filament-Web-App (GitHub Pages) als richtige App. Die Web-App merkt sich den letzten Stand selbst (Offline-Betrieb). */
public class MainActivity extends Activity {
    // Adresse der Web-App: Benutzername.github.io/Repository
    private static final String ADRESSE = "https://funkiller-86.github.io/filament-daten/";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#14171C"));
        getWindow().setNavigationBarColor(Color.parseColor("#14171C"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#14171C"));
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        // Brücke für die LED-Leisten am Regal: die Web-App ruft FilamentApp.wled(adresse, json) auf, die App schickt es an den
        // WLED-Controller im Heim-WLAN (http, deshalb nicht direkt aus der https-Seite möglich).
        web.addJavascriptInterface(new LedBruecke(), "FilamentApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("funkiller-86.github.io".equals(u.getHost())) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, u));
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(ADRESSE);
        }
    }

    /** Nur Adressen im Heimnetz (192.168.x.x, 10.x.x.x, 172.16–31.x.x), optional mit Port – sonst wird nichts gesendet. */
    private static final Pattern HEIMNETZ = Pattern.compile(
            "^(192\\.168\\.\\d{1,3}\\.\\d{1,3}|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})(:\\d{1,5})?$");

    private static class LedBruecke {
        @JavascriptInterface
        public int version() {
            return 2;
        }

        @JavascriptInterface
        public void wled(final String adresse, final String json) {
            if (adresse == null || json == null || json.length() > 20000 || !HEIMNETZ.matcher(adresse).matches()) {
                return;
            }
            new Thread(() -> {
                HttpURLConnection v = null;
                try {
                    v = (HttpURLConnection) new URL("http://" + adresse + "/json/state").openConnection();
                    v.setConnectTimeout(1500);
                    v.setReadTimeout(1500);
                    v.setRequestMethod("POST");
                    v.setDoOutput(true);
                    v.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream o = v.getOutputStream()) {
                        o.write(json.getBytes(StandardCharsets.UTF_8));
                    }
                    v.getResponseCode();
                } catch (Exception ignoriert) {
                    // Controller nicht erreichbar (nicht im Heim-WLAN): still ignorieren
                } finally {
                    if (v != null) {
                        v.disconnect();
                    }
                }
            }).start();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
