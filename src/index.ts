import { createApp, watch } from 'vue';
import App from './App.vue';
import './styles/theme.css';
import './styles/base.css';
import { apiSettings, hydrateSettings, migrationPending, ready } from './api/settings';
import { getContext } from './st/context';
import { openBook, closeBook } from './state/ui';
import { attachEngine } from './state/engine';
import { mountEntries } from './entries';
import { startEngine } from './core/injector';
import { mountStatusDisplay } from './core/display';

const globals = window as any;
let cleanup: (() => void) | null = null;
async function boot() {
  if (globals.__libeiV2App) throw Error('通用状态界面已经运行，请勿重复加载。');
  for (let i = 0; i < 120 && !getContext()?.extensionSettings; i++) await new Promise(resolve => setTimeout(resolve, 250));
  hydrateSettings();
  if (!ready) throw Error('酒馆设置尚未就绪，请待页面加载完成后刷新。');
  const api = startEngine();
  const disposers: Array<() => void> = [() => api.destroy()];
  cleanup = () => { for (const dispose of disposers.reverse()) dispose(); cleanup = null; };
  disposers.push(attachEngine(api));
  const host = document.createElement('div'); host.id = 'libei-v2-shadow-host';
  host.style.cssText = 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:10000!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  const mount = document.createElement('div'); mount.style.pointerEvents = 'auto'; shadow.append(mount); document.body.append(host);
  disposers.push(() => host.remove());
  if (globals.__LIBEI_PREVIEW_STYLES__) { const style = document.createElement('style'); style.textContent = globals.__LIBEI_PREVIEW_STYLES__; shadow.prepend(style); }
  else { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL(/* @vite-ignore */ './index.css', import.meta.url).href + '?v=3.1.0-preview.1'; shadow.prepend(link); }
  const app = createApp(App); app.mount(mount); disposers.push(() => app.unmount());
  disposers.push(mountEntries(), mountStatusDisplay());
  disposers.push(watch(() => [apiSettings.enabled, apiSettings.generation, apiSettings.channels, apiSettings.assignments, apiSettings.exclusions, apiSettings.universal, migrationPending.value], () => api.invalidate(), { deep: true }));
  const destroy = () => { closeBook(); window.removeEventListener('pagehide', destroy); cleanup?.(); delete globals.__libeiV2App; };
  globals.__libeiV2App = { version: '3.1.0-preview.1', open: openBook, close: closeBook, destroy, api };
  window.addEventListener('pagehide', destroy, { once: true });
  api.refresh();
  if (globals.__LIBEI_PREVIEW__) openBook('state');
  window.dispatchEvent(new CustomEvent('libei:v2-ready'));
}
boot().catch((cause: unknown) => {
  cleanup?.();
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error('[通用状态]', message); globals.toastr?.error?.(message, '通用状态界面未启动');
});
