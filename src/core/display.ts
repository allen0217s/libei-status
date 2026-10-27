import { getContext } from '../st/context';
import { apiSettings, engineActiveHere } from '../api/settings';
import { extractStatus, parseUpdate } from './parser';

/** Cosmetic only: never edits chat[].mes, swipes, regex settings or character data. */
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
        if (!block) { restore(element); return; }
        parseUpdate(message.mes, true);
        const saved = hidden.get(element);
        if (saved && element.innerHTML === saved.rendered) return;
        const original = element.innerHTML;
        const rendered = ctx.messageFormatting!(block.body, message.name, message.is_system, message.is_user, id);
        element.innerHTML = rendered;
        hidden.set(element, { original, rendered: element.innerHTML });
      } catch { restore(element); }
    });
  }
  window.addEventListener('libei:engine-changed', refresh);
  refresh();
  return () => { window.removeEventListener('libei:engine-changed', refresh); for (const element of hidden.keys()) restore(element); };
}
