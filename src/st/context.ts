/** 对酒馆宿主的单点适配；黎北配置不接触柏宝书的命名空间。 */
export interface STMessage {
  name: string; is_user: boolean; is_system: boolean; mes: string;
  swipes?: string[]; swipe_id?: number; extra?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface STCharacter { name: string; avatar: string; [key: string]: unknown }
export interface STContext {
  chat: STMessage[];
  characters?: STCharacter[];
  characterId?: string | number;
  groupId?: string;
  name1: string; name2: string;
  getCurrentChatId: () => string | undefined;
  getRequestHeaders: () => Record<string, string>;
  extensionSettings?: Record<string, unknown>;
  saveSettingsDebounced?: () => void;
  generateRaw?: (params: {
    prompt: Array<{ role: string; content: string }> | string;
    api?: string | null; systemPrompt?: string;
    responseLength?: number | null; prefill?: string; jsonSchema?: unknown;
  }) => Promise<string>;
  substituteParams?: (content: string) => string;
  getWorldInfoNames?: () => string[];
  getWorldInfoPrompt?: (chat: string[], maxContext: number, isDryRun: boolean, globalScanData?: Record<string, unknown>) => Promise<{
    worldInfoBefore?: string; worldInfoAfter?: string; worldInfoString?: string;
    worldInfoDepth?: Array<{ depth?: number; role?: number; entries?: string[] }>;
    anBefore?: string[]; anAfter?: string[];
  }>;
  eventSource?: { on(event: string, cb: (...args: any[]) => void): void; off?(event: string, cb: (...args: any[]) => void): void };
  eventTypes?: Record<string, string>;
  [key: string]: any;
}
export function getContext(): STContext | null {
  try {
    const st = (window as unknown as { SillyTavern?: { getContext?: () => STContext } }).SillyTavern;
    return st?.getContext?.() ?? null;
  } catch { return null; }
}
export interface WorldInfoEntry {
  world?: string; comment?: string; content?: string;
  order?: number; position?: number; depth?: number;
  [key: string]: unknown;
}
export interface CheckWorldInfoResult {
  allActivatedEntries?: Set<WorldInfoEntry> | Map<string, WorldInfoEntry>;
  [key: string]: unknown;
}
export type CheckWorldInfoFn = (chat: string[], maxContext: number, isDryRun: boolean, globalScanData?: Record<string, unknown>) => Promise<CheckWorldInfoResult>;
async function importWorldInfo(): Promise<Record<string, any> | null> {
  try {
    const wiPath = '/scripts/world-info.js';
    return await import(/* @vite-ignore */ wiPath);
  } catch { return null; }
}
/** 此接口未在 getContext 稳定暴露，缺失时由调用方决定安全降级。 */
export async function getCheckWorldInfo(): Promise<CheckWorldInfoFn | null> {
  const mod = await importWorldInfo();
  return typeof mod?.checkWorldInfo === 'function' ? mod.checkWorldInfo as CheckWorldInfoFn : null;
}
export interface WorldInfoReader {
  loadWorldInfo: (name:string) => Promise<{entries?:Record<string,WorldInfoEntry>} | null | undefined>;
  charLore: Array<{name:string;extraBooks?:string[]}>;
}
/** Read-only host capability, verified against ST source f63399a4; never writes or activates entries. */
export async function getWorldInfoReader(): Promise<WorldInfoReader | null> {
  const mod = await importWorldInfo();
  if (typeof mod?.loadWorldInfo !== 'function') return null;
  return {loadWorldInfo:mod.loadWorldInfo,get charLore() { return Array.isArray(mod.world_info?.charLore) ? mod.world_info.charLore : []; }};
}
export interface EjsTemplateApi {
  prepareContext: (context?: Record<string, unknown>, end?: number) => Promise<Record<string, unknown>>;
  evalTemplate: (code: string, context?: Record<string, unknown> | null, options?: Record<string, unknown>) => Promise<string | null>;
}
export function getEjsTemplate(): EjsTemplateApi | null {
  const api = (globalThis as { EjsTemplate?: Partial<EjsTemplateApi> }).EjsTemplate;
  return api && typeof api.prepareContext === 'function' && typeof api.evalTemplate === 'function' ? api as EjsTemplateApi : null;
}
