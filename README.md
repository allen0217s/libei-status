# 黎北状态 · 通用状态引擎

SillyTavern 前端扩展，版本 **3.1.0-preview.1**。固定保留“通用”这一份配置，使用 MVU 的初始变量与 JSONPatch 更新格式；悬浮入口、独立面板、状态历史、主题与两种生成方式继续保留。

## 使用

1. 打开单角色聊天，在“通用规则”填写初始变量和变量更新规则。
2. 初始变量使用 MVU InitVar 的 JSON / YAML 对象；也接受 stat_data 包装，插件会识别并去掉外层，不会多套一层。
3. 点击“保存通用规则”。所有角色共用这一份规则，每个聊天的状态独立保存。
4. 在“设置 → 状态生成方式”选择随正文生成或独立请求生成；继续聊天，也可手动建立初始状态。

没有预设选择器、预设名称编辑、另存、删除或切换功能。保存规则不会清空已有状态或历史，修改初值也不会自动覆盖已有 stat_data。

InitVar 示例：

```yaml
场景:
  时间: 未记录
  地点: 未记录
角色:
  心情: 未记录
  衣着: []
  随身物品: []
```

更新规则可以写“只按正文已经发生的变化更新，不替玩家决定行动；只提交发生变化的路径”。

插件自带的通用配置预置了一套 28 项的身体与生理字段：场景下 1 项，角色下 27 项，初值取自字段默认值，28 条字段规则并入变量更新规则。它只是初始内容，可以在页面上整体换成自己的字段表。要注意本版本的 Patch 只校验 JSON 结构，整数上下限、枚举取值和对象子键这些约定写在规则里约束模型，不会被程序拒绝。

## MVU 更新格式

```xml
<UpdateVariable>
<Analysis>心情因本轮互动变为平静。</Analysis>
<JSONPatch>
[
  {"op":"replace","path":"/角色/心情","value":"平静"},
  {"op":"insert","path":"/角色/随身物品/-","value":"地图"}
]
</JSONPatch>
</UpdateVariable>
```

路径相对 stat_data，不写 /stat_data 前缀。支持 replace、insert/add、remove、delta 数值增减、move；没有变化时输出空数组。delta 是数值加减操作，已取消旧版 mode: full / delta 对象合并协议。

随正文模式会在正常回复后追加 MVU 更新块，面板提取后只隐藏其显示，保留聊天原文。独立模式另请求一次更新，参考旧状态和最近 3 条消息（可设 1–30），可用当前主 API 或副渠道。随正文生成仍消耗状态部分的 token。

本插件适配上述 MVU 数据与更新格式，由自身维护 stat_data；运行不需要额外安装 MVU、Tavern Helper 或 Zod。没有执行 MVU 旧脚本命令、$meta Schema、世界书加载及生命周期回调。

## 通用规则复制与粘贴

“通用规则 → 复制与粘贴通用配置”提供导出文本、复制、粘贴解析。完整配置只含 stat_data 初值与变量更新规则：

```yaml
stat_data:
  角色:
    心情: 未记录
变量更新规则: 根据本轮已经发生的剧情更新。
```

解析先进入草稿，点击保存后生效。完整配置文本用于本插件复制粘贴；单独的初始变量栏是 InitVar 对象。配置文本不包含 API、密钥、消息内容或预设列表。

## 状态与升级

- stat_data、上一状态及最近 80 次快照保存在 chatMetadata.libei_status_data；换卡、换聊天自动隔离，编辑或切换回复分支后只显示匹配的快照。
- 通用规则、生成设置、主题与渠道保存于 extensionSettings.libei_status_v2。Web Locks 保持同源仅一个页面可写；缺少该能力时只读，请使用 localhost 或 HTTPS。
- 3.0 的聊天状态和历史读取时只在内存转换。首次保存前，把原 v1 文档保存在 libei_status_data_v1_backup；保存失败会回滚新状态和新建备份。旧的预设定义只作为 legacyPresets 备份，不可再选择或恢复为活动预设。
- 旧版状态存档可以导入，忽略预设选择和配置；新版存档只携带状态。2.x 的浏览器存档仍可经显式迁移入口复制当前状态，保留原存储。
- 已保存旧 <status> 块可继续隐藏显示，但不接受新回复使用该旧协议更新状态。MVU 解析或任一补丁操作失败时整轮拒绝，不写入一部分。
- 手动编辑和状态导出使用 stat_data 包装。原始字段、数值、快照及未修改的旁支数据不会因收敛为通用配置而自动清空。

## 构建与验证

酒馆加载根目录 manifest.json、index.js、index.css；源码在 src/，构建会同步根目录资源。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm run build
pnpm run test:browser
```

2026-10-28：类型检查、构建、63 项 MVU/存储/API 检查和 27 项隔离浏览器检查通过。报告见 [验证记录](validation/)。隔离浏览器使用虚构聊天、模拟持久化和模拟 API；真实酒馆、真实模型、原生 MVU 脚本联动仍待验收。

主 API 取消只能确保丢弃结果，不能保证立即停止请求，也无法获得可靠的截断原因；副渠道支持网络取消及 length 截断拒绝。渠道密钥仍以明文保存在酒馆账户设置中。

[协议与限制](docs/STATE_PROTOCOL.md) · [实现与来源依据](docs/UNIVERSAL_ENGINE.md)。旧版文档和测试保留为历史材料，不计作当前检查。

## 来源

保留原界面与渠道交互的 [来源说明](REFERENCE_NOTICE.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。MVU 格式依据来自 MagVarUpdate 固定提交 [d03b7dc](https://github.com/MagicalAstrogy/MagVarUpdate/tree/d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc) 的变量类型和 JSONPatch 操作定义；本次没有引入其运行时脚本。
