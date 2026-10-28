import { getContext } from '../st/context';
import { apiSettings, engineActiveHere } from '../api/settings';
import { checkedState, extractStatus, object, parseData, parseUpdate } from './parser';
import { readChat, transcriptKey } from './storage';

/** Display compatibility only. The retired <status> protocol never updates stat_data. */
function savedLegacyBody(text: string, id: number): string | null {
  const blocks = [...text.matchAll(/<status\s*>([\s\S]*?)<\/status\s*>/gi)];
  if (blocks.length !== 1) return null;
  const { data, scope } = readChat();
  if (!data.history.some(item => item.floor === id && item.source === transcriptKey(scope.chat, id))) return null;
  const value = parseData(blocks[0][1]);
  if (!['full', 'delta'].includes(String(value.mode)) || !object(value.state)) return null;
  checkedState(value.state);
  return text.replace(blocks[0][0], '').trim();
}
/** Never edits raw messages, swipes, character data or host regex settings. */
export function mountStatusDisplay(): () => void {
  const hidden = new Map<HTMLElement, { original: string; rendered: string }>();
  function restore(element: HTMLElement) {
    const saved = hidden.get(element);
    if (saved && element.innerHTML === saved.rendered) element.innerHTML = saved.original;
    hidden.delete(element);
  }
  function refresh() {
    const ctx = getContext();
    for (const element of hidden.keys()) if (!element.isConnected) hidden.delete(element);
    const enabled = ctx?.messageFormatting && engineActiveHere() && apiSettings.generation.mode === 'inline';
    if (!enabled) { for (const element of hidden.keys()) restore(element); return; }
    document.querySelectorAll<HTMLElement>('#chat .mes[mesid] .mes_text').forEach(element => {
      const id = Number(element.closest('.mes')?.getAttribute('mesid')), message = ctx.chat[id];
      if (!message || message.is_user || message.is_system) { restore(element); return; }
      try {
        const block = extractStatus(message.mes);
        let body: string | null;
        if (block) { parseUpdate(message.mes, true); body = block.body; }
        else body = savedLegacyBody(message.mes, id);
        if (body === null) { restore(element); return; }
        const saved = hidden.get(element);
        if (saved && element.innerHTML === saved.rendered) return;
        const original = element.innerHTML, rendered = ctx.messageFormatting!(body, message.name, message.is_system, message.is_user, id);
        element.innerHTML = rendered; hidden.set(element, { original, rendered: element.innerHTML });
      } catch { restore(element); }
    });
  }
  window.addEventListener('libei:engine-changed', refresh); refresh();
  return () => { window.removeEventListener('libei:engine-changed', refresh); for (const element of hidden.keys()) restore(element); };
}
