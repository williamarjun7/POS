import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Network } from '@capacitor/network';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();
export const isAndroid = platform === 'android';
export const isIOS = platform === 'ios';

let backHandlerCallback: (() => void) | null = null;

export function setBackHandler(callback: () => void) {
  backHandlerCallback = callback;
}

export async function initializeCapacitor() {
  if (!isNative) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
  } catch (e) {
    console.warn('StatusBar setup failed:', e);
  }

  try {
    await SplashScreen.hide();
  } catch (e) {
    console.warn('SplashScreen hide failed:', e);
  }

  App.addListener('backButton', ({ canGoBack }) => {
    if (backHandlerCallback) {
      backHandlerCallback();
    } else if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  App.addListener('appStateChange', ({ isActive }) => {
    console.log('App state changed. Is active:', isActive);
  });

  Keyboard.addListener('keyboardWillShow', (info) => {
    document.body.style.paddingBottom = `${info.keyboardHeight}px`;
  });

  Keyboard.addListener('keyboardWillHide', () => {
    document.body.style.paddingBottom = '0';
  });
}

export async function getNetworkStatus() {
  if (!isNative) {
    return { connected: navigator.onLine, connectionType: 'unknown' };
  }
  return await Network.getStatus();
}

export async function addNetworkListener(callback: (status: { connected: boolean }) => void) {
  if (!isNative) {
    window.addEventListener('online', () => callback({ connected: true }));
    window.addEventListener('offline', () => callback({ connected: false }));
    return { remove: () => {} };
  }
  return await Network.addListener('networkStatusChange', callback);
}
