import { getContext, type STContext, type STMessage } from '../st/context';
import { checkedState, object, type State } from './parser';

export const newRecordId = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
export const CHAT_KEY = 'libei_status_data';
export const LEGACY_NAMESPACE = 'libei.independent-status.v1.621746c1';
export interface Scope { card: string; chatId: string; name: string; ctx: STContext; chat: STMessage[]; metadata: Record<string, unknown> }
export interface Checkpoint { id: string; epoch: number; presetId: string; floor: number; swipe: number; source: string; state: State; previous: State | null; createdAt: number }
export interface ChatData { version: 1; revision: number; card: string; chatId: string; presetId: string; epoch: number; state: State | null; previous: State | null; history: Checkpoint[] }
export interface StoredChat { scope: Scope; data: ChatData; raw: string | undefined }
export function currentScope(): Scope {
  const ctx = getContext();
  const id = ctx?.characterId;
  if (!ctx || ctx.groupId || id === undefined || id === null || id === '' || !Array.isArray(ctx.chat)) throw Error('请打开要跟踪的单角色聊天。');
  const card = ctx.characters?.[Number(id)];
  const chatId = ctx.getCurrentChatId?.();
  if (!card?.avatar || !chatId) throw Error('当前角色或聊天没有稳定标识。');
  if (!ctx.chatMetadata || typeof ctx.saveMetadata !== 'function') throw Error('酒馆缺少 chatMetadata / saveMetadata，无法随聊天保存状态。');
  return { card: card.avatar, chatId: String(chatId), name: card.name || ctx.name2, ctx, chat: ctx.chat, metadata: ctx.chatMetadata };
}
export function sameScope(scope: Scope): boolean {
  try { const now = currentScope(); return now.card === scope.card && now.chatId === scope.chatId && now.metadata === scope.metadata && now.chat === scope.chat; }
  catch { return false; }
}
export function latestAssistant(chat: STMessage[]): number {
  for (let i = chat.length - 1; i >= 0; i--) if (!chat[i].is_user && !chat[i].is_system) return i;
  return -1;
}
/** Non-security fingerprint, only used to match a saved state to a transcript branch. */
export function transcriptKey(chat: STMessage[], floor = chat.length - 1): string {
  const text = JSON.stringify(chat.slice(0, floor + 1).map(message => [!!message.is_user, !!message.is_system, message.swipe_id ?? 0, message.mes]));
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function empty(scope: Scope): ChatData {
  return { version: 1, revision: 0, card: scope.card, chatId: scope.chatId, presetId: 'universal', epoch: 0, state: null, previous: null, history: [] };
}
export function validateChat(value: unknown, scope: Pick<Scope, 'card' | 'chatId'>): ChatData {
  if (!object(value) || value.version !== 1 || value.card !== scope.card || value.chatId !== scope.chatId || typeof value.presetId !== 'string' || !Number.isSafeInteger(value.epoch) || Number(value.epoch) < 0 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.history) || value.history.length > 80) throw Error('聊天状态格式无效或不属于当前聊天；原数据未覆盖。');
  const history = value.history.map(item => {
    if (!object(item) || typeof item.id !== 'string' || typeof item.presetId !== 'string' || !Number.isSafeInteger(item.epoch) || Number(item.epoch) < 0 || !Number.isSafeInteger(item.floor) || Number(item.floor) < 0 || !Number.isSafeInteger(item.swipe) || Number(item.swipe) < 0 || typeof item.source !== 'string' || !/^[0-9a-f]{16}$/.test(item.source) || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) throw Error('状态历史记录损坏；原数据未覆盖。');
    return { ...item, state: checkedState(item.state), previous: item.previous === null ? null : checkedState(item.previous) } as unknown as Checkpoint;
  });
  if (new Set(history.map(item => item.id)).size !== history.length) throw Error('状态历史 ID 重复。');
  const data = { version: 1, revision: value.revision, card: value.card, chatId: value.chatId, presetId: value.presetId, epoch: value.epoch, state: value.state === null ? null : checkedState(value.state), previous: value.previous === null ? null : checkedState(value.previous), history } as ChatData;
  if (JSON.stringify(data).length > 4_000_000) throw Error('聊天状态存档超过 400 万字符，请先导出并清理历史。');
  return data;
}
export function readChat(): StoredChat {
  const scope = currentScope();
  const value = scope.metadata[CHAT_KEY];
  // Metadata already belongs to the open chat. A rename may change its file ID.
  const data = value === undefined ? empty(scope) : validateChat(value, { card: scope.card, chatId: object(value) && typeof value.chatId === 'string' ? value.chatId : scope.chatId });
  return { scope, data: { ...data, chatId: scope.chatId }, raw: JSON.stringify(value) };
}
export function activeCheckpoint(data: ChatData, chat: STMessage[], beforeFloor = chat.length): Checkpoint | null {
  return [...data.history].reverse().filter(item => item.epoch === data.epoch && item.presetId === data.presetId && item.floor < beforeFloor && item.floor < chat.length && !chat[item.floor].is_user && !chat[item.floor].is_system && item.source === transcriptKey(chat, item.floor)).sort((a, b) => b.floor - a.floor || b.createdAt - a.createdAt)[0] ?? null;
}
export async function writeChat(stored: StoredChat, data: ChatData, valid: () => boolean = () => true): Promise<void> {
  if (!sameScope(stored.scope) || !valid() || JSON.stringify(stored.scope.metadata[CHAT_KEY]) !== stored.raw) throw Error('聊天或状态已改变，结果未写入。');
  const previous = stored.scope.metadata[CHAT_KEY];
  const next = validateChat({ ...data, revision: stored.data.revision + 1 }, stored.scope);
  stored.scope.metadata[CHAT_KEY] = next;
  try { await stored.scope.ctx.saveMetadata!(); }
  catch (error) {
    if (stored.scope.metadata[CHAT_KEY] === next) {
      if (previous === undefined) delete stored.scope.metadata[CHAT_KEY]; else stored.scope.metadata[CHAT_KEY] = previous;
    }
    throw error;
  }
}
export function appendState(stored: StoredChat, state: State, previous: State | null, floor: number): ChatData {
  const { data, scope } = stored;
  const message = scope.chat[floor];
  if (!message || message.is_user || message.is_system) throw Error('状态只能记录到角色回复楼层。');
  const checkpoint: Checkpoint = { id: newRecordId(), epoch: data.epoch, presetId: data.presetId, floor, swipe: message.swipe_id ?? 0, source: transcriptKey(scope.chat, floor), state: checkedState(state), previous: previous === null ? null : checkedState(previous), createdAt: Date.now() };
  return { ...data, state: checkpoint.state, previous: checkpoint.previous, history: [...data.history, checkpoint].slice(-80) };
}
export function legacyChat(): { state: State; count: number; floor: number } | null {
  const scope = currentScope();
  const key = LEGACY_NAMESPACE + ':chat:' + encodeURIComponent(scope.card) + ':' + encodeURIComponent(scope.chatId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  if (raw.length > 6_500_000) throw Error('旧版存档过大，请先用旧版导出。');
  const data = JSON.parse(raw);
  if (!object(data) || data.format !== 'libei-independent-timeline-v1' || data.card !== scope.card || data.chatId !== scope.chatId || !Array.isArray(data.nodes)) throw Error('旧版存档格式或归属无效。');
  const current = data.current;
  if (!object(current) || typeof current.token !== 'string') return null;
  const nodes = data.nodes as Array<Record<string, any>>;
  const node = nodes.find(item => item.token === current.token);
  if (!node) throw Error('旧版当前状态缺少对应快照。');
  const chain: Array<Record<string, any>> = [];
  let cursor: Record<string, any> | undefined = node;
  while (cursor) {
    if (chain.includes(cursor) || !Array.isArray(cursor.source)) throw Error('旧版状态链损坏。');
    chain.push(cursor);
    for (const source of cursor.source) {
      const message = scope.chat[source.id];
      const clean = (text: string) => text.replace(/<(?:UpdateVariable|update)>[\s\S]*?<\/(?:UpdateVariable|update)>/gi, '').replace(/<StatusPlaceHolderImpl\s*\/>/gi, '').trim();
      if (!message || (message.swipe_id ?? 0) !== source.swipe || (message.is_system ? 'system' : message.is_user ? 'user' : 'assistant') !== source.role || clean(message.mes) !== clean(source.body)) throw Error('旧版快照与当前聊天不一致，请先在旧版核对分支后导出。');
    }
    if (cursor.parent === null) break;
    cursor = nodes.find(item => item.token === cursor!.parent);
    if (!cursor) throw Error('旧版状态链缺少父节点。');
  }
  return { state: checkedState(current.state), count: nodes.length, floor: node.id };
}

/** Keep one writable plugin page per origin; release the native lock on teardown. */
export function createWriterLease(notify: () => void) {
  let held = false, closed = false, reason = '正在获取页面写入权。';
  let release: (() => void) | undefined, readyResolve: () => void = () => {};
  const ready = new Promise<void>(resolve => { readyResolve = resolve; });
  const locks = globalThis.navigator?.locks;
  if (!locks) {
    reason = '当前环境缺少 Web Locks，仅可查看；请使用 localhost 或 HTTPS。';
    readyResolve(); queueMicrotask(notify);
  } else {
    void locks.request('libei-status-universal-writer', { ifAvailable: true }, async lock => {
      if (closed) { readyResolve(); return; }
      held = !!lock;
      reason = lock ? '' : '另一个页面正在写入状态，本页仅可查看；关闭该页面后刷新本页可重新获取写入权。';
      readyResolve(); queueMicrotask(notify);
      if (lock) await new Promise<void>(resolve => { release = resolve; if (closed) resolve(); });
      held = false;
    }).catch(() => { reason = '无法获取页面写入权，当前仅可查看。'; readyResolve(); if (!closed) notify(); });
  }
  return { get held() { return held; }, get reason() { return reason; }, ready, destroy() { closed = true; held = false; release?.(); readyResolve(); } };
}
