import type { StatusPreset } from '../core/parser';

const instruction = '模板仅是结构示例。根据角色设定和已发生的对话记录状态；没有依据的内容保留为“未记录”或 null，不替玩家作决定。首次用 full，之后优先只输出变化字段的 delta。';
export const BUILTIN_PRESETS: readonly StatusPreset[] = [
  { id: 'universal', name: '万用通用', instruction, template: '场景:\n  时间: 未记录\n  地点: 未记录\n角色:\n  心情: 未记录\n  当前目标: 未记录\n  衣着: []\n  随身物品: []\n  想法: 未记录\n' },
  { id: 'romance', name: '日常恋爱', instruction: instruction + '\n好感度使用 0–100；只按实际互动渐进变化。想法只写被跟踪角色的想法。', template: '场景:\n  时间: 未记录\n  地点: 未记录\n角色:\n  好感度: null\n  心情: 未记录\n  衣着: []\n  关系: 未记录\n  想法: 未记录\n' },
  { id: 'rpg', name: 'RPG 冒险', instruction: instruction + '\nHP、MP 用“当前值/上限”表示，未知上限时用 null；背包只列当前持有物品。数值变化须有剧情依据。', template: '场景:\n  地点: 未记录\n  当前任务: 未记录\n角色:\n  HP: null\n  MP: null\n  等级: null\n  金币: null\n  装备: []\n  背包: []\n' },
  { id: 'cultivation', name: '修仙历程', instruction: instruction + '\n境界与灵力只依设定和剧情更新；灵力已知时用“当前值/上限”，不可自行突破。', template: '场景:\n  时间: 未记录\n  地点: 未记录\n角色:\n  境界: 未记录\n  灵力: null\n  功法: []\n  法宝: []\n  当前目标: 未记录\n' },
];
