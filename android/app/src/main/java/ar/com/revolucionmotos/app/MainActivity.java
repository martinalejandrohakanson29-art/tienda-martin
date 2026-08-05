package ar.com.revolucionmotos.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    // RECORD_AUDIO es un permiso "peligroso": declararlo en el manifest no alcanza,
    // Android solo lo concede si la app lo pide en tiempo de ejecución (diálogo del
    // sistema). Sin esto, el WebView nunca tiene el permiso real por detrás aunque
    // onPermissionRequest() lo conceda del lado del WebView.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, 1001);
        }
    }

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
