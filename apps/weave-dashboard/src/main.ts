/**
 * main.ts — Weave Dashboard Entry Point
 *
 * Bootstraps the DashboardApp on DOMContentLoaded.
 */

import { DashboardApp } from './app';

window.addEventListener('DOMContentLoaded', () => {
  const app = new DashboardApp();
  app.init();
});
