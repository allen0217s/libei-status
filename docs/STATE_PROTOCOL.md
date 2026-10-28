# 通用 MVU 状态协议（插件 3.1）

## 一份固定配置

活动配置只有“通用”，字段是 initialVariables 与 updateRules，所有聊天共用；不存在可变的预设 ID、预设库或切换接口。初始变量可用 InitVar 对象、完整 InitVar 标签或单独 stat_data 包装的 JSON / YAML。首次更新以前保持空状态，更新时使用初始变量作为补丁基准；也可明确手动初始化。

已有状态以对应聊天的有效快照为准，不因保存通用规则或修改初值而重置。初始字段参考与当前 stat_data 都会进入状态请求，提示新字段应使用 insert，已有数据优先。

## 输出

```xml
<UpdateVariable>
<Analysis>一句可核对的变化摘要。</Analysis>
<JSONPatch>
[
  {"op":"replace","path":"/角色/心情","value":"平静"},
  {"op":"delta","path":"/角色/好感度","value":5},
  {"op":"insert","path":"/角色/随身物品/-","value":"地图"}
]
</JSONPatch>
</UpdateVariable>
```

Analysis 用于简短变更说明，不要求展开推理过程。无变化使用 []。解析大小写不敏感，兼容 VariableUpdate / update 外层及 json_patch 标签；独立请求可只返回 JSONPatch 标签或合法 JSON 数组。随正文模式要求完整外层标签。

补丁采用 MagVarUpdate 中六种操作的有界实现：

| 操作 | 行为 |
| --- | --- |
| replace | 替换已存在的字段或数组元素，null 是实际值 |
| insert / add | 写入对象键、插入数组元素；数组 /- 表示追加 |
| remove | 删除已存在字段或数组元素 |
| delta | 对有限数值增加或减少指定数字，不转换字符串 |
| move | 从 from 移动到 path，也接受 to 别名；不能移入自身内部 |

路径是相对 stat_data 的 JSON Pointer，不带 /stat_data 前缀。~0 转义波浪号，~1 转义斜杠；点号和方括号是字面键名。兼容缺少开头斜杠的路径，但生成时固定使用斜杠。父对象须先存在，禁止根路径、原型键、$meta 与 $internal 修改，禁止越界数组下标。

每条回复只接收一个更新块和一个补丁数组，最多 256 项。JSON 必须规范，重复键、额外操作参数、不支持的操作、非法类型、重复/嵌套/未闭合标签均拒绝。所有操作在副本执行；任一失败会报告操作序号与路径，原状态保持原样，不自动修复或重试。单份状态最多 25 万字符、16 层和 12000 个节点。

旧 <status> + mode: full/delta 不再是更新协议。仅已存在匹配快照的旧块具有只读显示兼容，不会继续执行其更新。

## stat_data 与迁移

| 数据 | 归属 |
| --- | --- |
| 唯一通用初值/规则、生成设置、界面与渠道 | extensionSettings.libei_status_v2 |
| stat_data、previous_stat_data、history、revision | chatMetadata.libei_status_data，version 2 |
| 首次升级前的原文档 | chatMetadata.libei_status_data_v1_backup |
| 原 3.0 预设定义 | 设置中的 legacyPresets，只备份，不参与提示词与选择 |

version 1 的 state / previous / history.state 在内存转换为 stat_data，不因旧 presetId 不存在而阻止读取。保留当前期次、原始字段值、历史楼层、分支和指纹；下一次写入前才保存原文档备份。备份已有值时不覆盖，保存抛错时回滚。导入旧存档只读取状态，不恢复预设选择或覆盖全局通用规则。

写入前核对角色、聊天、对话、元数据原值和请求配置；聊天重命名可正常读取，后续保存更新记录的聊天 ID。历史最多 80 条，活动文档最多 400 万字符；旧备份另保留。Web Locks 在同源下保护单页面写入，不跨设备协调。

## 宿主与展示

提示词通过宿主 setExtensionPrompt 注入，不操作世界书。独立生成使用现有主 API / 副渠道；quiet 事件不会递归触发状态请求。停止生成后不自动处理，取消/切换聊天/改配置会使旧响应失效。

面板按值类型显示进度、标签、嵌套折叠与数值变化。MVU 块隐藏仅经宿主 messageFormatting 改变显示，不编辑聊天原文、swipe、角色卡或正则设置。缺少格式化接口时保留可见，销毁时恢复显示、移除事件并清理自身注入。

这是 MVU 数据与补丁格式适配，状态由插件自己的聊天元数据保存。不执行旧 _.set 脚本、不实现 MVU Schema / $meta 运行语义、不调用 Mvu.*，不假定实际安装了 MVU。真实宿主及原生 MVU 联动需要单独验收。
