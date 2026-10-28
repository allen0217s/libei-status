import type { UniversalConfig } from '../core/parser';

/** One fixed universal configuration. No selectable presets or per-card preset IDs. */
export const UNIVERSAL_CONFIG: Readonly<UniversalConfig> = {
  initialVariables: '场景:\n  时间: 未记录\n  地点: 未记录\n角色:\n  心情: 未记录\n  当前目标: 未记录\n  衣着: []\n  随身物品: []\n  想法: 未记录\n',
  updateRules: '按已发生的剧情维护 stat_data，不替玩家决定行动。没有依据时保留原值或“未记录”。只提交实际变化的路径；未变化输出空 JSONPatch 数组。衣着和随身物品只记录当前持有内容。想法只写被跟踪角色已经表现或明确设定的想法。',
};
