import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ar.com.revolucionmotos.app',
  appName: 'Revolución Motos',
  webDir: 'out',
  server: {
    url: 'https://revolucionmotos.com.ar/admin/login',
    cleartext: false,
  },
  plugins: {
    Camera: {
      presentationStyle: 'fullscreen',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
