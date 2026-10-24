import { shallowRef, ref } from 'vue';
export const engineView = shallowRef<any>({ state: null, rules: null, config: {}, floors: [], pending: [], busy: false, writerReady: false, status: '等待状态引擎载入。', error: '', canUpdate: false });
export const operationError = ref('');
let engine: any = null;
export function refreshEngine() { if (engine) engineView.value = engine.snapshot(); }
export function attachEngine(api: any): () => void {
  engine = api; refreshEngine();
  window.addEventListener('libei:engine-changed', refreshEngine);
  return () => { window.removeEventListener('libei:engine-changed', refreshEngine); engine = null; };
}
export async function runEngine(name: string, ...args: any[]) {
  operationError.value = '';
  try {
    if (!engine || typeof engine[name] !== 'function') throw Error('状态引擎尚未就绪。');
    const result = await engine[name](...args); refreshEngine(); return result;
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : String(error); refreshEngine(); throw error;
  }
}
export function act(name: string, ...args: any[]) { void runEngine(name, ...args).catch(() => {}); }
export function invalidateEngine() { engine?.invalidate(); refreshEngine(); }
