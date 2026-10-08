import { defineConfig } from '@playwright/test';
import { existsSync } from 'fs';

// Chromium préinstallé de l'environnement si présent, sinon celui de Playwright.
const chromium = process.env.PW_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: chromium,
      // Micro et caméra simulés par Chromium : vrais flux WebRTC, contenu synthétique.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
    trace: 'retain-on-failure',
  },
  // E2E_PROD=1 : rejoue les scénarios sur le bundle de production (vite build + preview).
  webServer: {
    command: process.env.E2E_PROD ? 'npx vite build && npx vite preview --port 3100 --strictPort' : 'npx vite --port 3100 --strictPort',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
