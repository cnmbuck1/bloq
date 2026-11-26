import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cnmbuckstudios.bloq',
  appName: 'BLOQ',
  webDir: 'dist',
  backgroundColor: '#141C2E',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#141C2E',
  },
};

export default config;
