import { reactive, ref, watch } from 'vue';
import { getContext } from '@/st/context';
import { validateUniversalConfig, type UniversalConfig } from '../core/parser';
import { UNIVERSAL_CONFIG } from '../presets/builtin';

/** 本地集成自柏宝书的渠道协议；存储完全独立，不读取其设置或共享渠道。 */
export interface ApiChannel {
  id: string; name: string; url: string; key: string; model: string;
  temperature: number; maxTokens: number; timeoutSec: number;
  stream: boolean; excludeParams: string[]; reasoningEffort: string;
}
export type TaskType = 'summary' | 'resummary';
export interface UiPrefs {
  theme: string; navPosition: string; navTapClose: boolean;
  showTopBar: boolean; showQuickReply: boolean; showFloorPanel: boolean;
  showOrb: boolean; orbImage: string; orbShape: string; orbOpacity: number; orbSize: number;
}
export interface Exclusions { excludedChars: string[] }
export interface GenerationOptions { mode: 'inline' | 'background'; automatic: boolean; contextMessages: number; depth: number }
export interface ApiSettings {
  enabled: boolean;
  universal: UniversalConfig;
  legacyPresets: unknown[];
  generation: GenerationOptions;
  ui: UiPrefs;
  channels: ApiChannel[];
  assignments: Record<TaskType, string>;
  exclusions: Exclusions;
  legacyMigrationResolved: boolean;
}
export const SETTINGS_KEY = 'libei_status_v2';
export const LEGACY_STORAGE_KEY = 'libei.independent-status.v1.621746c1:settings';
const PROTECTED_PARAMS = new Set([
  'chat_completion_source', 'reverse_proxy', 'proxy_password', 'custom_url',
  'custom_include_headers', 'custom_include_body', 'custom_exclude_body',
  'model', 'messages', 'stream',
]);
let chanSeq = 0;
export function newChannel(): ApiChannel {
  return {
    id: `ch_${Date.now()}_${++chanSeq}`, name: '新渠道', url: '', key: '', model: '',
    temperature: 1, maxTokens: 65535, timeoutSec: 180, stream: false,
    excludeParams: [], reasoningEffort: '',
  };
}
function defaults(): ApiSettings {
  return {
    enabled: true, universal: { ...UNIVERSAL_CONFIG }, legacyPresets: [], generation: { mode: 'inline', automatic: true, contextMessages: 3, depth: 0 },
    ui: {
      theme: 'day', navPosition: 'auto', navTapClose: true, showTopBar: false,
      showQuickReply: false, showFloorPanel: false, showOrb: true,
      orbImage: '', orbShape: 'bookmark', orbOpacity: 62, orbSize: 48,
    },
    channels: [], assignments: { summary: '', resummary: '' }, legacyMigrationResolved: false,
    exclusions: { excludedChars: [] },
  };
}
function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))]
    : [];
}
function normalizeChannel(raw: unknown): ApiChannel {
  const d = newChannel();
  const c = raw && typeof raw === 'object' ? raw as Partial<ApiChannel> : {};
  return {
    id: typeof c.id === 'string' && c.id ? c.id : d.id,
    name: typeof c.name === 'string' ? c.name : d.name,
    url: typeof c.url === 'string' ? c.url : '', key: typeof c.key === 'string' ? c.key : '',
    model: typeof c.model === 'string' ? c.model : '',
    temperature: typeof c.temperature === 'number' && Number.isFinite(c.temperature) ? c.temperature : d.temperature,
    maxTokens: typeof c.maxTokens === 'number' && Number.isFinite(c.maxTokens) && c.maxTokens > 0 ? Math.floor(c.maxTokens) : d.maxTokens,
    timeoutSec: typeof c.timeoutSec === 'number' && Number.isFinite(c.timeoutSec) && c.timeoutSec > 0 ? Math.floor(c.timeoutSec) : d.timeoutSec,
    stream: typeof c.stream === 'boolean' ? c.stream : false,
    // 非法排除项保留给校验报错，绝不静默删除路由字段后发送。
    excludeParams: strings(c.excludeParams),
    reasoningEffort: typeof c.reasoningEffort === 'string' ? c.reasoningEffort.trim() : '',
  };
}
export function validateChannel(channel: ApiChannel): string | null {
  if (!channel.url.trim() || !channel.model.trim()) return '请填写 API 地址与模型。';
  try {
    const u = new URL(channel.url.trim());
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return '仅支持不含地址内嵌凭据的 HTTP(S) 地址。';
  } catch { return 'API 地址格式无效。'; }
  if (!Number.isFinite(channel.temperature) || channel.temperature < 0 || channel.temperature > 2) return '温度应为 0–2。';
  if (!Number.isSafeInteger(channel.maxTokens) || channel.maxTokens < 1) return '最大 token 应为正整数。';
  if (!Number.isSafeInteger(channel.timeoutSec) || channel.timeoutSec < 1) return '超时秒数应为正整数。';
  const blocked = channel.excludeParams.find(p => PROTECTED_PARAMS.has(p.trim()));
  return blocked ? `不可排除固定路由/凭据字段：${blocked}` : null;
}
export function normalizeSettings(raw: unknown): ApiSettings {
  const d = defaults();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const r = raw as Partial<ApiSettings>;
  const ru = r.ui && typeof r.ui === 'object' ? r.ui : {} as Partial<UiPrefs>;
  for (const key of Object.keys(d.ui) as (keyof UiPrefs)[]) {
    if (typeof ru[key] === typeof d.ui[key]) (d.ui as unknown as Record<string, unknown>)[key] = ru[key];
  }
  if (!Number.isFinite(d.ui.orbOpacity)) d.ui.orbOpacity = 62;
  if (!Number.isFinite(d.ui.orbSize)) d.ui.orbSize = 48;
  d.ui.orbOpacity = Math.min(100, Math.max(20, Math.round(d.ui.orbOpacity)));
  d.ui.orbSize = Math.min(80, Math.max(32, Math.round(d.ui.orbSize)));
  d.enabled = typeof r.enabled === 'boolean' ? r.enabled : true;
  d.channels = Array.isArray(r.channels) ? r.channels.filter(c => c && typeof c === 'object').map(normalizeChannel) : [];
  const ids = new Set<string>();
  d.channels.forEach(c => { if (ids.has(c.id)) c.id = newChannel().id; ids.add(c.id); });
  for (const task of ['summary', 'resummary'] as const) {
    const id = r.assignments?.[task];
    // 保留失效的非空指派，由请求层显式报错，不能悄悄转用主 API。
    d.assignments[task] = typeof id === 'string' ? id : '';
  }
  d.legacyMigrationResolved = r.legacyMigrationResolved === true;
  if (r.exclusions && typeof r.exclusions === 'object') d.exclusions.excludedChars = strings(r.exclusions.excludedChars);
  if (r.universal !== undefined) d.universal = validateUniversalConfig(r.universal);
  const legacy = r.legacyPresets ?? (r as { presets?: unknown[] }).presets;
  if (Array.isArray(legacy)) d.legacyPresets = JSON.parse(JSON.stringify(legacy));
  const g = r.generation;
  if (g && typeof g === 'object') {
    d.generation.mode = g.mode === 'background' ? 'background' : 'inline';
    d.generation.automatic = typeof g.automatic === 'boolean' ? g.automatic : true;
    d.generation.contextMessages = Number.isInteger(g.contextMessages) && g.contextMessages >= 1 && g.contextMessages <= 30 ? g.contextMessages : 3;
    d.generation.depth = Number.isInteger(g.depth) && g.depth >= 0 && g.depth <= 10 ? g.depth : 0;
  }
  return d;
}
export const apiSettings = reactive<ApiSettings>(defaults());
export let ready = false;
export const migrationPending = ref(false);
const readyCbs: Array<() => void> = [];
export function onSettingsReady(cb: () => void): void {
  if (ready) cb(); else readyCbs.push(cb);
}
/** 不自动把旧版本地密钥上传。这里只检测是否存在，导入也先进入草稿。 */
export function detectLegacySettings(): boolean {
  try { migrationPending.value = !apiSettings.legacyMigrationResolved && !!localStorage.getItem(LEGACY_STORAGE_KEY); }
  catch { migrationPending.value = false; }
  return migrationPending.value;
}
export function resolveLegacyMigration(): void {
  apiSettings.legacyMigrationResolved = true;
  migrationPending.value = false;
}
export function importLegacySettings(): ApiChannel | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  const old = JSON.parse(raw) as { version?: number; config?: Record<string, unknown>; rememberedKey?: unknown };
  if (old.version !== 1 || !old.config || typeof old.config !== 'object') throw new Error('旧版配置格式不兼容。');
  const c = normalizeChannel({
    ...old.config, id: newChannel().id, name: '从旧版导入（待保存）',
    key: typeof old.rememberedKey === 'string' ? old.rememberedKey : '',
    timeoutSec: old.config.timeout,
  });
  return c;
}
export function hydrateSettings(): void {
  if (ready) return;
  const ctx = getContext();
  if (!ctx?.extensionSettings) return;
  Object.assign(apiSettings, normalizeSettings(ctx.extensionSettings[SETTINGS_KEY]));
  detectLegacySettings();
  ready = true;
  for (const cb of readyCbs.splice(0)) {
    try { cb(); } catch (e) { console.warn('[黎北] 设置订阅异常', e); }
  }
}
function persist(): void {
  if (!ready) return;
  const ctx = getContext();
  if (!ctx?.extensionSettings) return;
  ctx.extensionSettings[SETTINGS_KEY] = JSON.parse(JSON.stringify(apiSettings));
  ctx.saveSettingsDebounced?.();
}
// 同步观察确保 hydrate 期间的赋值不会排队到 ready=true 后写回默认值。
watch(apiSettings, persist, { deep: true, flush: 'sync' });
export function getChannelForTask(task: TaskType): ApiChannel | null {
  const id = apiSettings.assignments[task];
  return id ? apiSettings.channels.find(c => c.id === id) ?? null : null;
}
export function currentCharName(): string | null {
  const ctx = getContext();
  if (!ctx || ctx.groupId) return null;
  const id = ctx.characterId;
  if (id === undefined || id === null || id === '') return null;
  return ctx.characters?.[Number(id)]?.name ?? ctx.name2 ?? null;
}
export function isCurrentChatExcluded(): boolean {
  const name = currentCharName();
  return name !== null && apiSettings.exclusions.excludedChars.includes(name);
}
export function engineActiveHere(): boolean {
  return apiSettings.enabled && !isCurrentChatExcluded();
}
