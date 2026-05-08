import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.happyplantsclub.android',
  appName: 'Happy Plants Club',
  webDir: 'dist',
  server: {
    url: 'https://happyplants.club',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      '*.base44.app',
      'base44.app',
      'accounts.google.com',
      '*.google.com',
      'happyplants.club',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
