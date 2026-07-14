import { useEffect, useCallback } from 'react';
import { isNative, setBackHandler, addNetworkListener } from './index';

export function useCapacitorBackButton(handler: () => void) {
  useEffect(() => {
    if (!isNative) return;
    setBackHandler(handler);
    return () => setBackHandler(null as unknown as () => void);
  }, [handler]);
}

export function useNetworkStatus(onStatusChange: (connected: boolean) => void) {
  useEffect(() => {
    const remove = addNetworkListener(onStatusChange);
    return () => {
      if (typeof remove === 'function') {
        remove();
      } else if (remove && typeof remove.then === 'function') {
        remove.then((r: { remove: () => void }) => r.remove());
      }
    };
  }, [onStatusChange]);
}

export function useSafeAreaPadding() {
  if (!isNative) {
    return { top: '0px', bottom: '0px' };
  }

  return {
    top: 'env(safe-area-inset-top)',
    bottom: 'env(safe-area-inset-bottom)',
  };
}

export function useAndroidBackButton(handler: () => void) {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    if (!isNative) return;
    setBackHandler(stableHandler);
    return () => setBackHandler(null as unknown as () => void);
  }, [stableHandler]);
}
