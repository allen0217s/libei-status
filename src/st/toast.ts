/** 宿主 toastr 不可用时仅记日志，提示失败不影响主流程。 */
type ToastType = 'info' | 'success' | 'warning' | 'error';
interface Toastr { info: (msg: string, title?: string) => void; success: (msg: string, title?: string) => void; warning: (msg: string, title?: string) => void; error: (msg: string, title?: string) => void }
export function toast(message: string, type: ToastType = 'info'): void {
  try {
    const t = (window as unknown as { toastr?: Toastr }).toastr;
    if (t && typeof t[type] === 'function') { t[type](message, '男主状态'); return; }
  } catch { /* 降级为日志 */ }
  console.log('[男主状态]', message);
}
