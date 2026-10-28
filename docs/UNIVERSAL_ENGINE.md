# 固定通用 MVU 引擎：实现与验证

日期：2026-10-28；版本：3.1.0-preview.1。

## 本轮范围

用户要求“只保留通用这一种预设，不能切换预设，按照 mvu 的格式”。实现锁定为唯一通用初值和更新规则，移除预设选择/名称/另存/删除及相应 API，保留浮窗、独立面板、渠道、主题和聊天隔离。采用现代纯值 stat_data 与 UpdateVariable / JSONPatch，不引入完整 MVU 运行时或恢复世界书操作。

基线：8a00920，工作区干净，上一版已记录 57 项模块及 25 项隔离浏览器通过。改动前完整备份在 _backups/single-universal-mvu-20261028-143814/。本轮只修改扩展格式、配置、存储、对应界面与回归，不改其他卡工程或全局设置；历史测试保留。

## 模块与契约

- src/presets/builtin.ts：仅一个 UNIVERSAL_CONFIG，不存在数组或其他内置预设。
- src/core/parser.ts：InitVar/stat_data 解析、MVU 标签和 JSONPatch、原子操作、固定通用配置文本。不再解析旧 full/delta 为状态更新。
- src/core/injector.ts：唯一配置提示词、生成与生命周期，只公开 saveUniversalConfig，不公开 selectPreset / savePreset / deletePreset。配置更改保留状态。
- src/core/storage.ts：version 2 的 stat_data 与历史，version 1 只读转换及首次写入备份；旧 presetId 不再决定活动状态或配置。
- src/pages/rules/UniversalRules.vue：初始变量与更新规则，固定标签“通用”，页面复制粘贴；拒绝名称和预设列表。
- src/pages/state/index.vue：固定“通用 · MVU”标签，无预设下拉框，保留状态历史和手动 stat_data 修订。
- src/core/display.ts：显示隐藏，不修改源消息；旧格式仅在已保存匹配快照时保留只读显示兼容。

迁移保证：旧值与快照不自动清空；旧预设定义成为 inactive legacyPresets；原聊天文档在下一次写入前复制到 libei_status_data_v1_backup，失败回滚，不覆盖已有备份。导入旧存档不能重新引入活动预设，也不覆盖通用规则或 API 设置。

本轮范围预算：最多 50 个相关文件、25000 行已知变更（含生成资源）；任何旧测试文件删除、其他工程改动或凭据输出均不在范围内。生成的根目录 JS/CSS 只能经构建脚本更新。

## MVU 格式依据

2026-10-28 核对 MagVarUpdate 的 master 与 beta，二者当时均指向固定提交 [d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc](https://github.com/MagicalAstrogy/MagVarUpdate/tree/d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc)。

| 依据 | 核对结果 |
| --- | --- |
| [src/variable_def.ts](https://github.com/MagicalAstrogy/MagVarUpdate/blob/d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc/src/variable_def.ts) | MvuData 使用 stat_data；本实现维护纯值对象 |
| [src/function/update_variables.ts](https://github.com/MagicalAstrogy/MagVarUpdate/blob/d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc/src/function/update_variables.ts) | JSON Pointer 解码；replace、delta、insert/add、remove、move |
| [tests/helpers/json_patch_suite.ts](https://github.com/MagicalAstrogy/MagVarUpdate/blob/d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc/tests/helpers/json_patch_suite.ts) | 数值 delta、数组 /-、字面点号路径等回归场景 |
| example/理理/变量输出.yaml | status_current_variable 作为当前变量资料包装 |
| example/理理/[mvu_update]格式强调-变量更新规则.md | UpdateVariable、Analysis 外层结构 |

该来源用于格式与操作语义核对，不证明目标宿主安装了 MVU。本插件不下载或执行该脚本；采用独立实现，并有意收敛为单块、严格 JSON、安全路径和整轮原子拒绝。不执行其旧脚本命令或 Schema 系统。

宿主接口继续基于 SillyTavern [f63399a4f9c5ef0f311b305e82b8734333375ab2](https://github.com/SillyTavern/SillyTavern/tree/f63399a4f9c5ef0f311b305e82b8734333375ab2)：getContext、chatMetadata、saveMetadata、generateRaw、setExtensionPrompt、messageFormatting 与导出的事件常量。启动会核对能力；真实安装版本仍未观测。

## 验证与边界

- 当前命令：pnpm run typecheck、pnpm test、pnpm run build、pnpm run test:browser。
- 模块记录：validation/mvu-unit-20261028.json，63 项；包含 MVU 路径与六种操作、禁止原型路径、原子失败、无切换 API、旧配置备份、版本转换、取消/分支/聊天保护、存档恢复和 API 传输。
- 浏览器记录：validation/mvu-browser-20261028.json，27 项；检查真实构建资源中的固定通用界面、MVU 解析与隐藏、备份、复制粘贴、拒绝预设列表、只读页面、重载、手机与夜间主题。
- 浏览器用虚构聊天、模拟保存/请求及独立 profile；有两个同源页面验证原生 Web Locks，未连接真实酒馆和供应商。
- 图片在 screenshots/mvu-status-desktop.png、mvu-rules-desktop.png、mvu-status-mobile.png、mvu-status-night.png，交付前视觉核对。
- 真实宿主的服务端保存、流式事件次序、跨扩展影响、真实模型格式稳定性和原生 MVU 脚本联动仍待验收。

TW 回执沿用扩展开发/API 核验路由，已读 A0、D5、E5 与 B1 的 JSONPatch/纯值部分；库快照 2026-08-18。专用格式事实以上面的固定上游源码为准，未采用设计目录候选。
