import { createApp, watch, unref } from 'vue';
import App from './App.vue';
import './styles/theme.css';
import './styles/base.css';
import { apiSettings, hydrateSettings, migrationPending, validateChannel, engineActiveHere, ready } from './api/settings';
import { requestCompletion, requestViaMainApi, mainApiAvailable } from './api/client';
import { getContext } from './st/context';
import { collectWorldbookContext } from './worldbooks';
import { openBook, closeBook } from './state/ui';
import { attachEngine, invalidateEngine } from './state/engine';
import { mountEntries } from './entries';
import { startEngine } from './engine/legacy-adapter.js';

type Messages = { role: 'system' | 'user' | 'assistant'; content: string }[];
const clone = <T,>(value:T):T => JSON.parse(JSON.stringify(value));
const globals = window as any;

function ensureReady() {
  if (unref(migrationPending)) throw Error('检测到旧版 API 设置，请先在设置页确认迁移或选择跟随主 API。');
  if (!apiSettings.enabled) throw Error('男主状态状态引擎已停用。');
  const ctx = getContext();
  if (!ctx || !engineActiveHere()) throw Error('当前角色已排除或不是可用的单角色聊天。');
  const id = apiSettings.assignments.summary;
  if (id) {
    const channel=apiSettings.channels.find(c=>c.id===id);
    if(!channel)throw Error('已指派的副渠道不存在，请重新选择；不会自动切到主 API。');
    const error = validateChannel(channel); if (error) throw Error(error);
    if(!channel.url.trim() || !channel.model.trim())throw Error('副 API 渠道缺少地址或模型。');
  } else if (!mainApiAvailable()) throw Error('当前酒馆版本没有可用的主 API generateRaw 接口。');
}

async function preparePrompt(messages:Messages, options:any) {
  if (options.preview && apiSettings.exclusions.renderWorldInfoTemplates) throw Error('世界书模板执行已开启。为避免预览执行 EJS 或写变量，本次不扫描；可先关闭模板执行再预览。');
  const worldInfo = await collectWorldbookContext({signal:options.signal,chat:options.chat,targets:options.targetId >= 0 ? [options.targetId] : []});
  if (!options.valid()) throw Error('收集世界书期间聊天或配置改变，请求未发送。');
  if (worldInfo.length > 200000) throw Error('世界书参考内容超过 20 万字，请排除不需要的世界书后再试。');
  const prompt:Messages = worldInfo ? [{role:'system',content:worldInfo},...messages] : messages;
  return {worldInfo,prompt};
}
async function request(messages:Messages, options:any) {
  ensureReady();
  const selectedId=apiSettings.assignments.summary;
  const channel=selectedId?clone(apiSettings.channels.find(c=>c.id===selectedId)!):null;
  const fingerprint=JSON.stringify({channels:apiSettings.channels,assignments:apiSettings.assignments,exclusions:apiSettings.exclusions,enabled:apiSettings.enabled});
  const valid=()=>options.valid() && !options.signal.aborted && fingerprint===JSON.stringify({channels:apiSettings.channels,assignments:apiSettings.assignments,exclusions:apiSettings.exclusions,enabled:apiSettings.enabled});
  const {prompt} = await preparePrompt(messages,{...options,valid});
  const result=channel?await requestCompletion(channel,prompt,{signal:options.signal}):await requestViaMainApi(prompt,{signal:options.signal});
  if(!valid())throw Error('请求已取消或上下文已改变，结果未写入。');
  return result;
}

async function boot() {
  if(globals.__libeiV2App)throw Error('男主状态新版界面已经运行，请勿重复加载。');
  for(let i=0;i<120 && !getContext()?.extensionSettings;i++)await new Promise(resolve=>setTimeout(resolve,250));
  await hydrateSettings(); if(!ready)throw Error('酒馆设置未就绪，请待页面加载完成后刷新；未启动状态引擎。');
  const nativeExports=globals.__LIBEI_NATIVE_PREVIEW__ ?? await import(/* @vite-ignore */ new URL('../../../../script.js',import.meta.url).href);
  const api=startEngine(nativeExports,{ensureReady,request,preparePrompt,enabled:()=>apiSettings.enabled && !unref(migrationPending) && engineActiveHere() && !getContext()?.groupId,open:()=>openBook()});
  const detachEngine=attachEngine(api);
  const host=document.createElement('div');host.id='libei-v2-shadow-host';
  host.style.cssText='all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:10000!important;pointer-events:none!important;';
  const shadow=host.attachShadow({mode:'open'});
  const mount=document.createElement('div');mount.style.pointerEvents='auto';shadow.append(mount);
  document.body.append(host);
  if(globals.__LIBEI_PREVIEW_STYLES__){const style=document.createElement('style');style.textContent=globals.__LIBEI_PREVIEW_STYLES__;shadow.prepend(style)}
  else {const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./index.css',import.meta.url).href+'?v=2.0.0-local.1';shadow.prepend(link)}
  const app=createApp(App);app.mount(mount);
  const detachEntries=mountEntries();
  const stopSettings=watch(()=>({channels:apiSettings.channels,assignments:apiSettings.assignments,exclusions:apiSettings.exclusions,enabled:apiSettings.enabled,migration:unref(migrationPending)}),()=>invalidateEngine(),{deep:true});
  const legacyDestroy=globals.__libeiStatusPopupV1.destroy;
  const destroy=()=>{closeBook();stopSettings();detachEntries();detachEngine();app.unmount();host.remove();legacyDestroy();delete globals.__libeiV2App;window.removeEventListener('pagehide',destroy)};
  globals.__libeiStatusPopupV1.destroy=destroy;
  globals.__libeiV2App={version:'2.0.0-local.1',open:openBook,close:closeBook,destroy,api};
  window.addEventListener('pagehide',destroy,{once:true});
  api.refresh();
  if(globals.__LIBEI_NATIVE_PREVIEW__)openBook('state');
  window.dispatchEvent(new CustomEvent('libei:v2-ready'));
}
boot().catch((error:unknown)=>{if(!globals.__libeiV2App && globals.__libeiStatusPopupV1?.version===2){globals.__libeiStatusPopupV1.destroy();document.getElementById('libei-v2-shadow-host')?.remove()}const message=error instanceof Error?error.message:String(error);console.error('[男主状态 v2]',message);globals.toastr?.error?.(message,'男主状态界面未启动')});
