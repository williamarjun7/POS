declare module 'auto-launch' {
  interface AutoLaunchOptions {
    name: string;
    path?: string;
    isHidden?: boolean;
    mac?: {
      useLaunchAgent?: boolean;
    };
  }

  interface AutoLaunch {
    enable(): Promise<void>;
    disable(): Promise<void>;
    isEnabled(): Promise<boolean>;
  }

  interface AutoLaunchConstructor {
    new (options: AutoLaunchOptions): AutoLaunch;
  }

  const autoLaunch: AutoLaunchConstructor;
  export default autoLaunch;
}
