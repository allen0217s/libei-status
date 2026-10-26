// 本地私用集成：界面状态源自 ST-BaiBai-Book/src/state/ui.ts，存储及品牌命名空间改为黎北。
import { apiSettings, onSettingsReady } from '@/api/settings';
import { reactive, ref, watch } from 'vue';

/** 弹层宿主留在 shadow 内，且在主内容滚动容器之外。 */
export const modalHost = ref<HTMLElement | null>(null);
export type NavPosition = 'top' | 'bottom' | 'auto';
export type ThemeName = 'day' | 'night' | 'pastel' | 'green' | 'st';
export interface ThemeDef {
  value: ThemeName;
  label: string;
  icon: string;
}
export const THEMES: ThemeDef[] = [
  { value: 'day', label: '日间', icon: 'sun' },
  { value: 'night', label: '夜间', icon: 'moon' },
  { value: 'pastel', label: '粉彩', icon: 'sparkles' },
  { value: 'green', label: '木白', icon: 'sparkles' },
  { value: 'st', label: '跟随ST', icon: 'plug' },
];
export type OrbShape = 'bookmark' | 'circle' | 'square';
export const ORB_SHAPES: { value: OrbShape; label: string }[] = [
  { value: 'bookmark', label: '书签' },
  { value: 'circle', label: '圆形' },
  { value: 'square', label: '方形' },
];
export interface UiState {
  open: boolean;
  activePage: string;
  theme: ThemeName;
  navPosition: NavPosition;
  navTapClose: boolean;
  showTopBar: boolean;
  showQuickReply: boolean;
  showFloorPanel: boolean;
  showOrb: boolean;
  orbImage: string;
  orbShape: OrbShape;
  orbOpacity: number;
  orbSize: number;
}

const PAGE_STORAGE_KEY = 'libei.v2.ui.page';
const PAGE_IDS = ['state', 'rules', 'context', 'settings'];
function loadActivePage(): string {
  try {
    const id = localStorage.getItem(PAGE_STORAGE_KEY) || 'state';
    return PAGE_IDS.includes(id) ? id : 'state';
  } catch {
    return 'state';
  }
}
function validTheme(t: string): ThemeName {
  return THEMES.some(x => x.value === t) ? (t as ThemeName) : 'day';
}
function validNav(n: string): NavPosition {
  return n === 'top' || n === 'bottom' || n === 'auto' ? n : 'auto';
}
function validOrbShape(s: string): OrbShape {
  return s === 'bookmark' || s === 'circle' || s === 'square' ? s : 'bookmark';
}

export const ui = reactive<UiState>({
  open: false,
  activePage: loadActivePage(),
  theme: validTheme(apiSettings.ui.theme),
  navPosition: validNav(apiSettings.ui.navPosition),
  navTapClose: apiSettings.ui.navTapClose,
  showTopBar: apiSettings.ui.showTopBar,
  showQuickReply: apiSettings.ui.showQuickReply,
  showFloorPanel: apiSettings.ui.showFloorPanel,
  showOrb: apiSettings.ui.showOrb,
  orbImage: apiSettings.ui.orbImage,
  orbShape: validOrbShape(apiSettings.ui.orbShape),
  orbOpacity: apiSettings.ui.orbOpacity,
  orbSize: apiSettings.ui.orbSize,
});

// hydrate 之前不把界面默认值反写成真实设置。
onSettingsReady(() => {
  ui.theme = validTheme(apiSettings.ui.theme);
  ui.navPosition = validNav(apiSettings.ui.navPosition);
  ui.navTapClose = apiSettings.ui.navTapClose;
  ui.showTopBar = apiSettings.ui.showTopBar;
  ui.showQuickReply = apiSettings.ui.showQuickReply;
  ui.showFloorPanel = apiSettings.ui.showFloorPanel;
  ui.showOrb = apiSettings.ui.showOrb;
  ui.orbImage = apiSettings.ui.orbImage;
  ui.orbShape = validOrbShape(apiSettings.ui.orbShape);
  ui.orbOpacity = apiSettings.ui.orbOpacity;
  ui.orbSize = apiSettings.ui.orbSize;
});
watch(
  () => [ui.theme, ui.navPosition, ui.navTapClose, ui.showTopBar, ui.showQuickReply,
    ui.showFloorPanel, ui.showOrb, ui.orbImage, ui.orbShape, ui.orbOpacity, ui.orbSize],
  () => {
    apiSettings.ui.theme = ui.theme;
    apiSettings.ui.navPosition = ui.navPosition;
    apiSettings.ui.navTapClose = ui.navTapClose;
    apiSettings.ui.showTopBar = ui.showTopBar;
    apiSettings.ui.showQuickReply = ui.showQuickReply;
    apiSettings.ui.showFloorPanel = ui.showFloorPanel;
    apiSettings.ui.showOrb = ui.showOrb;
    apiSettings.ui.orbImage = ui.orbImage;
    apiSettings.ui.orbShape = ui.orbShape;
    apiSettings.ui.orbOpacity = ui.orbOpacity;
    apiSettings.ui.orbSize = ui.orbSize;
  },
);
watch(() => ui.activePage, () => {
  try { localStorage.setItem(PAGE_STORAGE_KEY, ui.activePage); } catch { /* 本地导航态可不持久化。 */ }
});

/** 遮罩忽略刚打开时的合成点击，避免移动端“秒关”。 */
export let lastOpenedAt = 0;
export function openBook(page?: string) {
  if (page && PAGE_IDS.includes(page)) ui.activePage = page;
  ui.open = true;
  lastOpenedAt = performance.now();
}
export function closeBook() {
  ui.open = false;
}
export function cycleTheme() {
  const i = THEMES.findIndex(t => t.value === ui.theme);
  ui.theme = THEMES[(i + 1) % THEMES.length].value;
}
