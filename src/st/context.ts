/** Host APIs verified against SillyTavern f63399a4f9c5ef0f311b305e82b8734333375ab2. */
export interface STMessage {
  name: string; is_user: boolean; is_system: boolean; mes: string;
  swipes?: string[]; swipe_id?: number; extra?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface STCharacter { name: string; avatar: string; data?: Record<string, unknown>; [key: string]: unknown }
export interface STContext {
  chat: STMessage[]; chatMetadata?: Record<string, unknown>;
  characters?: STCharacter[]; characterId?: string | number; groupId?: string;
  name1: string; name2: string;
  getCurrentChatId: () => string | undefined;
  getRequestHeaders: () => Record<string, string>;
  extensionSettings?: Record<string, unknown>;
  saveSettingsDebounced?: () => void;
  saveMetadata?: () => Promise<void>;
  setExtensionPrompt?: (id: string, content: string, position: number, depth: number, scan?: boolean, role?: number) => void;
  messageFormatting?: (text: string, name: string, isSystem: boolean, isUser: boolean, id: number) => string;
  generateRaw?: (params: { prompt: Array<{ role: string; content: string }> | string; api?: string | null; systemPrompt?: string; responseLength?: number | null; prefill?: string; jsonSchema?: unknown }) => Promise<string>;
  eventSource?: { on(event: string, cb: (...args: any[]) => void): void; removeListener?(event: string, cb: (...args: any[]) => void): void; off?(event: string, cb: (...args: any[]) => void): void };
  eventTypes?: Record<string, string>;
}
export function getContext(): STContext | null {
  try { return (window as unknown as { SillyTavern?: { getContext?: () => STContext } }).SillyTavern?.getContext?.() ?? null; }
  catch { return null; }
}
