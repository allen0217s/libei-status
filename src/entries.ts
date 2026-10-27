// 本地私用集成：菜单/顶栏/聊天上方入口范式源自 ST-BaiBai-Book/src/{menu,topbar,quickReply}.ts。
// 书签本体仍由 App/FloatingOrb 渲染；这里只管理酒馆 light DOM 内的入口与销毁。
import { watch } from 'vue';
import { openBook, ui } from '@/state/ui';
import { getContext } from '@/st/context';

const TOP_ID = 'libei-v2-topbar-button';
const QR_ID = 'libei-v2-qr-button';
const MENU_ID = 'libei-v2-menu-item';
const MENU_WRAP_ID = 'libei-v2-menu-wrapper';
const SETTINGS_ID = 'libei-v2-extension-settings';
const STYLE_ID = 'libei-v2-entry-style';
const FLOOR_CLASS = 'libei-v2-floor-entry';
const BAR_CLASS = 'libei-v2-qr-bar';

type EngineOwner = { api?: { setFloor: (id: number) => unknown } };

function bookIcon(): HTMLElement {
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-book-bookmark';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

/** 可重复挂载：先清理上一套入口，不触碰参考插件的任何节点/开关。 */
let activeDispose: (() => void) | null = null;
export function mountEntries(): () => void {
  activeDispose?.();
  let disposed = false;
  let queued = false;
  const doc = document;
  const listeners: Array<() => void> = [];
  const bind = (target: EventTarget, name: string, fn: EventListener) => {
    target.addEventListener(name, fn);
    listeners.push(() => target.removeEventListener(name, fn));
  };

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#top-settings-holder #${TOP_ID} .drawer-icon.fa-solid::before {
  content: '\\e0bb' !important;
  width: auto !important; height: auto !important;
  font-size: inherit !important; color: inherit !important; background: none !important;
}
.${FLOOR_CLASS} {
  display: flex; align-items: center; gap: 7px; width: 100%; margin: 8px 0 0;
  padding: 8px 12px; border: 1px solid var(--SmartThemeBorderColor, #7776);
  border-radius: 10px; background: var(--SmartThemeChatTintColor, transparent);
  color: var(--SmartThemeBodyColor, inherit); font: inherit; font-size: 12px;
  text-align: left; cursor: pointer;
}
#${SETTINGS_ID} .libei-v2-native-toggle { display: flex; align-items: center; gap: 8px; }
`;
  doc.head.appendChild(style);

  function activate(el: HTMLElement, callback: () => void, keyboard = false): void {
    const handler = (e: Event) => { e.preventDefault(); e.stopPropagation(); callback(); };
    // 元素被移除时其监听器随节点回收；销毁时同时移除残留引用。
    bind(el, 'click', handler);
    if (keyboard) bind(el, 'keydown', e => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') handler(e);
    });
  }

  function syncMenu(): void {
    const menu = doc.getElementById('extensionsMenu');
    if (!menu || doc.getElementById(MENU_ID)) return;
    const wrap = doc.createElement('div');
    wrap.id = MENU_WRAP_ID;
    wrap.className = 'extension_container interactable';
    wrap.tabIndex = 0;
    const item = doc.createElement('a');
    item.id = MENU_ID;
    item.className = 'list-group-item';
    item.href = '#';
    item.title = '通用状态';
    const label = doc.createElement('span');
    label.textContent = '通用状态';
    item.append(bookIcon(), label);
    wrap.appendChild(item);
    activate(wrap, () => { openBook(); menu.style.display = 'none'; }, true);
    menu.appendChild(wrap);
  }

  function syncTopBar(): void {
    if (!ui.showTopBar) { doc.getElementById(TOP_ID)?.remove(); return; }
    const holder = doc.getElementById('top-settings-holder');
    if (!holder || doc.getElementById(TOP_ID)) return;
    const btn = doc.createElement('div');
    btn.id = TOP_ID;
    btn.className = 'drawer';
    const toggle = doc.createElement('div');
    toggle.className = 'drawer-toggle';
    toggle.setAttribute('role', 'button');
    toggle.tabIndex = 0;
    toggle.setAttribute('aria-label', '打开通用状态');
    const icon = doc.createElement('div');
    icon.className = 'drawer-icon fa-solid fa-book-bookmark fa-fw closedIcon';
    icon.title = '通用状态';
    toggle.appendChild(icon);
    btn.appendChild(toggle);
    activate(toggle, () => openBook(), true);
    const persona = holder.querySelector('#persona-management-button');
    if (persona) persona.before(btn);
    else holder.appendChild(btn);
  }

  function removeQuickReply(): void {
    doc.getElementById(QR_ID)?.remove();
    // #qr--bar 是酒馆原生结构 ID；只回收自己建的空条，不动原生或其它扩展的条。
    const ownBar = doc.querySelector(`#qr--bar.${BAR_CLASS}`);
    if (ownBar && !ownBar.querySelector('.qr--buttons')?.children.length) ownBar.remove();
  }

  function syncQuickReply(): void {
    if (!ui.showQuickReply) { removeQuickReply(); return; }
    const sendForm = doc.getElementById('send_form');
    if (!sendForm || doc.getElementById(QR_ID)) return;
    let bar = sendForm.querySelector<HTMLElement>('[id="qr--bar"]');
    if (!bar) {
      bar = doc.createElement('div');
      bar.id = 'qr--bar';
      bar.className = `${BAR_CLASS} flex-container flexGap5`;
      sendForm.prepend(bar);
    }
    let holder = bar.querySelector<HTMLElement>('.qr--buttons');
    if (!holder) {
      holder = doc.createElement('div');
      holder.className = 'qr--buttons';
      bar.appendChild(holder);
    }
    const btn = doc.createElement('div');
    btn.id = QR_ID;
    btn.className = 'qr--button menu_button interactable';
    btn.tabIndex = 0;
    btn.title = '打开通用状态';
    btn.textContent = '通用状态';
    activate(btn, () => openBook(), true);
    holder.appendChild(btn);
  }

  function syncExtensionSettings(): void {
    const holder = doc.getElementById('extensions_settings') ?? doc.getElementById('extensions_settings2');
    if (!holder) return;
    let root = doc.getElementById(SETTINGS_ID);
    if (!root) {
      root = doc.createElement('div');
      root.id = SETTINGS_ID;
      root.className = 'extension_container';
      const details = doc.createElement('details');
      const summary = doc.createElement('summary');
      summary.textContent = '通用状态 · 独立状态面板';
      const note = doc.createElement('p');
      note.textContent = '独立状态引擎；主题、入口和主副 API 渠道均在面板设置中管理。';
      const open = doc.createElement('button');
      open.type = 'button';
      open.className = 'menu_button';
      open.textContent = '打开通用状态设置';
      activate(open, () => openBook('settings'));
      details.append(summary, note, open);
      for (const [key, label] of [
        ['showOrb', '显示悬浮书签'],
        ['showTopBar', '在酒馆顶栏显示按钮'],
        ['showQuickReply', '在聊天框上方显示按钮'],
        ['showFloorPanel', '在 AI 楼层显示状态入口'],
      ] as const) {
        const row = doc.createElement('label');
        row.className = 'libei-v2-native-toggle';
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.dataset.libeiPreference = key;
        bind(input, 'change', () => { ui[key] = input.checked; });
        row.append(input, doc.createTextNode(label));
        details.appendChild(row);
      }
      root.appendChild(details);
      holder.appendChild(root);
    }
    root.querySelectorAll<HTMLInputElement>('[data-libei-preference]').forEach(input => {
      const key = input.dataset.libeiPreference as 'showOrb' | 'showTopBar' | 'showQuickReply' | 'showFloorPanel';
      input.checked = ui[key];
    });
  }

  function syncFloors(): void {
    const ctx = getContext();
    doc.querySelectorAll<HTMLElement>('.mes[mesid]').forEach(mes => {
      const id = Number(mes.getAttribute('mesid'));
      const message = ctx?.chat?.[id];
      const eligible = ui.showFloorPanel && Number.isSafeInteger(id) && id >= 0
        && !!message && !message.is_user && !message.is_system;
      const existing = mes.querySelector<HTMLButtonElement>(`.${FLOOR_CLASS}`);
      if (!eligible) { existing?.remove(); return; }
      if (existing) {
        // 酒馆可能复用 .mes 节点；选楼标记跟随新的 mesid，避免点进旧楼。
        if (existing.dataset.libeiFloor !== String(id)) {
          existing.dataset.libeiFloor = String(id);
          existing.replaceChildren(bookIcon(), doc.createTextNode(`#${id} · 查看通用状态状态`));
        }
        return;
      }
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = FLOOR_CLASS;
      btn.dataset.libeiFloor = String(id);
      btn.append(bookIcon(), doc.createTextNode(`#${id} · 查看通用状态状态`));
      const text = mes.querySelector('.mes_text');
      if (text) text.insertAdjacentElement('afterend', btn);
      else mes.appendChild(btn);
    });
  }

  // 只接通用状态独立引擎的选楼接口，不调用参考摘要/番外/写回逻辑。
  bind(doc, 'click', e => {
    const target = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(`.${FLOOR_CLASS}`) : null;
    if (!target) return;
    const id = Number(target.dataset.libeiFloor);
    if (!Number.isSafeInteger(id) || id < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const owner = (window as unknown as { __libeiV2App?: EngineOwner }).__libeiV2App;
    try {
      owner?.api?.setFloor(id);
      openBook('state');
    } catch (error) {
      console.warn('[通用状态] 楼层状态入口暂不可用', error);
    }
  });

  function sync(): void {
    if (disposed) return;
    syncMenu();
    syncTopBar();
    syncQuickReply();
    syncExtensionSettings();
    syncFloors();
  }
  function enqueue(): void {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  }
  const observer = new MutationObserver(enqueue);
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['mesid'] });
  const stop = watch(
    () => [ui.showTopBar, ui.showQuickReply, ui.showFloorPanel, ui.showOrb],
    sync,
    { immediate: true },
  );
  // 宿主可能比扩展晚就绪；保留原入口约 20 秒兜底，不常驻空转。
  // 之后靠 DOM 变化/独立引擎通知补挂，绝不执行参考记忆引擎。
  let attempts = 0;
  const timer = window.setInterval(() => {
    enqueue();
    if (++attempts >= 40) window.clearInterval(timer);
  }, 500);
  bind(window, 'libei:engine-changed', enqueue);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
    observer.disconnect();
    window.clearInterval(timer);
    for (const unbind of listeners.splice(0)) unbind();
    for (const id of [TOP_ID, MENU_WRAP_ID, SETTINGS_ID]) doc.getElementById(id)?.remove();
    removeQuickReply();
    doc.querySelectorAll(`.${FLOOR_CLASS}`).forEach(el => el.remove());
    style.remove();
    if (activeDispose === dispose) activeDispose = null;
  };
  activeDispose = dispose;
  return dispose;
}
