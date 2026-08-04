package ar.com.revolucionmotos.app;

import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    // Sin esto, el WebView de Capacitor nunca le concede al sitio web el acceso al
    // micrófono (getUserMedia falla con NotAllowedError) aunque el permiso de Android
    // ya esté otorgado — el permiso del sistema operativo y el permiso del WebView
    // para ese sitio son cosas separadas.
    @Override
    public void onStart() {
        super.onStart();
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }
}
