import { shallowRef, ref } from 'vue';
export const engineView = shallowRef<any>({ state: null, previous: null, presets: [], history: [], config: {}, floors: [], busy: false, generating: false, writerReady: false, status: '等待状态引擎载入。', error: '', canUpdate: false });
export const operationError = ref('');
let engine: any = null, scope = '';
const token = (view: any) => JSON.stringify([view.profileKey, view.chatId]);
export function refreshEngine() {
  if (!engine) return;
  const next = engine.snapshot(), nextScope = token(next);
  if (nextScope !== scope) operationError.value = '';
  scope = nextScope; engineView.value = next;
}
export function attachEngine(api: any): () => void {
  engine = api; refreshEngine(); window.addEventListener('libei:engine-changed', refreshEngine);
  return () => { window.removeEventListener('libei:engine-changed', refreshEngine); engine = null; scope = ''; };
}
export async function runEngine(name: string, ...args: any[]) {
  operationError.value = '';
  const origin = scope;
  try {
    if (!engine || typeof engine[name] !== 'function') throw Error('状态引擎尚未就绪。');
    const result = await engine[name](...args); refreshEngine(); return result;
  } catch (error) {
    refreshEngine();
    if (origin === scope && !(error instanceof DOMException && error.name === 'AbortError')) operationError.value = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
export function act(name: string, ...args: any[]) { void runEngine(name, ...args).catch(() => {}); }
