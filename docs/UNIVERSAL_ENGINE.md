# 通用状态引擎：实现与验收记录

日期：2026-10-27；版本：3.0.0-preview.1。

## 授权与范围

用户明确要求按其通用状态引擎方案简化插件，范围涵盖生成、解析、按聊天保存、模板预设与通用展示。这是有意改变配置和状态协议的功能替换。保留当前未提交改动的备份后实施；没有推送仓库、安装真实酒馆或请求真实供应商。

开工先做只读核查。旧世界书模块实际上只读；旧引擎已经使用 setExtensionPrompt。实际修改依据是把预设/字段/专用结算和本地时间线合在一起的核心依赖，改为模板与聊天元数据。重构前类型检查及 153 项旧模块检查通过。

- 生成/生命周期：批准替换旧适配器，由 src/core/injector.ts 负责提示词、生成模式、取消、事件和公开操作。
- 解析：批准用 src/core/parser.ts 统一 JSON / YAML、full / delta 和纯文本预设；保留数据安全校验。
- 存储：批准将当前数据所有权改到 chatMetadata，旧 localStorage 只提供显式只读迁移。
- 展示：保留已有浮窗、主题和渠道界面；替换专属状态展示及逐字段编辑。
- 删除核查：生产源码的旧模块导入、页面注册、设置操作均已替换；构建根目录 JS/CSS 通过构建脚本更新。
- 原测试文件未删除；增加新协议回归。旧协议检查依赖 2.x 源码，只能用于对应快照，不计作当前新版验证。

本轮范围预算：仅扩展源码、构建入口/锁文件、相关文档与新回归；不改其他卡工程、全局配置、远程仓库和真实宿主。生成资源的大幅行数差异来自移除旧引擎及重新打包，不按小修补预算解释。

备份位于 _backups/universal-status-20261027-172424/，含原 src、tests、docs、入口资源、依赖清单与开工前差异。回退时按该快照恢复到单独副本检查，避免覆盖后来新增的用户工作。

## 模块

```text
src/
  core/
    injector.ts    提示词、独立生成、生命周期和操作协调
    parser.ts      安全数据解析、状态合并、预设文本与显示推断
    storage.ts     聊天元数据、分支指纹与旧状态只读迁移
    display.ts     状态块的显示隐藏与还原
  presets/builtin.ts
  ui/AutoRenderer.vue
  pages/state/    当前状态、历史、手动修订
  pages/rules/    模板预设与页面复制粘贴
  pages/settings/生成选项、渠道、界面和存档管理
```

没有为了“百行”把安全校验、请求隔离和生命周期清理压进不透明的单体。yaml 2.9.1 替代旧引擎内嵌的同版本解析器，显式列为依赖；其他依赖版本未升级。世界书、EJS、字段 Schema 和专用数值结算不再进入运行路径。

## 接口依据

宿主版本未知，未连接真实酒馆。源码核对基于 SillyTavern 固定提交 [f63399a4f9c5ef0f311b305e82b8734333375ab2](https://github.com/SillyTavern/SillyTavern/tree/f63399a4f9c5ef0f311b305e82b8734333375ab2)，不能把固定源码核验当成目标安装的运行证明。

| 符号/行为 | 所属与来源 | 当前证据 |
| --- | --- | --- |
| getContext、chatMetadata、extensionSettings、saveMetadata、messageFormatting、generateRaw | 宿主提供；[st-context.js](https://github.com/SillyTavern/SillyTavern/blob/f63399a4f9c5ef0f311b305e82b8734333375ab2/public/scripts/st-context.js) | 源码核对、启动能力检查及模拟回归；真实宿主待核验 |
| setExtensionPrompt(key,value,position,depth,scan,role)、IN_CHAT=1、SYSTEM=0 | 宿主提供；[script.js](https://github.com/SillyTavern/SillyTavern/blob/f63399a4f9c5ef0f311b305e82b8734333375ab2/public/script.js) | 源码核对；不导入宿主私有模块 |
| CHAT_CHANGED、GENERATION_*、MESSAGE_RECEIVED、CHARACTER_MESSAGE_RENDERED、编辑/删除/swipe 事件 | 宿主提供；[events.js](https://github.com/SillyTavern/SillyTavern/blob/f63399a4f9c5ef0f311b305e82b8734333375ab2/public/scripts/events.js) | 使用宿主导出的事件常量；真实流式时序待验收 |
| messageFormatting(text,name,isSystem,isUser,id) | 同上 script.js | 仅传去掉状态块后的正文；缺少接口则保持可见 |
| #chat .mes[mesid] .mes_text | 该源码的显示结构 | 与模拟宿主对照检查；其他主题/显示扩展仍待核验 |

只有 SillyTavern 宿主和打包的 Vue/YAML 是运行依赖。Tavern Helper、MVU、CDN、数据库均不需要；开发工具仅用于本地构建和回归。

## 验证与边界

- 新引擎检查：validation/universal-unit-20261027.json，覆盖安全解析、合并、模板、元数据写回、失败回滚、分支匹配、聊天/配置切换、取消、重复事件、旧状态迁移和 API 传输。
- 浏览器检查：validation/universal-browser-20261027.json，覆盖实际构建资源的面板、模板复制粘贴、只隐藏显示、主题、移动布局、重新载入和销毁。使用独立 Chromium profile、虚构聊天和模拟请求。
- 截图：screenshots/universal-status-desktop.png、universal-presets-desktop.png、universal-status-mobile.png、universal-status-night.png；已人工视觉核对。
- 当前验证命令为 pnpm run typecheck、pnpm test、pnpm run build、pnpm run test:browser。保留的旧命令 test:fields / test:references / test:context 等面向已移除的 2.x 交互，不适用当前协议。
- 缺少真实宿主安装、服务端持久化、跨扩展兼容、真实流式、真实输出质量与费用证据。主 API 的取消与截断限制保持明示。
- 保留原生 Web Locks 的单页面写入保护；并已用两个同源隔离页面验证第二页只读。锁不跨设备协调，群聊不在本轮验收范围。

TW 路由回执：sillytavern-extension-dev、code-quality-workflow；已读 ST-A0、ST-D5 与 ST-E5 的扩展边界部分；库快照 2026-08-18；没有采用设计目录候选。API 正式依据仍是上面的固定宿主源码。
