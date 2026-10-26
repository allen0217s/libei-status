// 本地私用集成：分页注册方式源自 ST-BaiBai-Book/src/pages/registry.ts。
import type { Component } from 'vue';
import State from './state/index.vue';
import Rules from './rules/index.vue';
import Settings from './settings/index.vue';

export interface PageDef {
  id: string;
  label: string;
  component: Component;
}

export const PAGES: PageDef[] = [
  { id: 'state', label: '当前状态', component: State },
  { id: 'rules', label: '变量规则', component: Rules },
  { id: 'context', label: '上下文', component: Rules },
  { id: 'settings', label: '设置', component: Settings },
];

export function getPage(id: string): PageDef {
  return PAGES.find(p => p.id === id) ?? PAGES[0];
}
