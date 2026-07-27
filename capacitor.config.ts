import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.highlandscafemotelinn.pos',
  appName: 'Highlands Cafe & Motel Inn POS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*.insforge.app'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      spinnerColor: '#e94560',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    CapacitorUpdater: {
      autoUpdate: true,
      // Capgo production URL — set your app-specific URL after creating the app
      // in the Capgo dashboard. Example:
      // updateUrl: 'https://capgo.app/api/auto_update/com.highlandscafemotelinn.pos',
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
