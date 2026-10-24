# 黎北 · 独立状态面板 v2（预览版）

按需求从 ST-BaiBai-Book 固定版本提取界面与渠道交互，业务仍为黎北原独立状态引擎：

- 原版 Vue/Shadow DOM 窗口、五套主题、桌面顶部胶囊导航、手机底部导航与抽屉。
- 状态更新可「跟随主 API」（酒馆主界面当前连接）或显式选择独立副渠道。没有失败自动换渠道。
- 添加/编辑/删除渠道、草稿关闭丢弃、拉模型/搜索、测试、温度/token/超时/思考强度/流式与排除参数。
- 世界书整本排除和条目备注名规则过滤，仅作用于本插件请求；不会禁用原书或正文注入。
- 悬浮书签、顶栏、聊天输入框上方、魔杖菜单、每楼状态查看入口。
- 原状态链、规则、初值、分支核对与导入导出格式保留。

## 安装或从 v1 更新

1. **先在旧版导出完整状态存档和规则，备份酒馆设置。** 停用角色卡内旧状态脚本；不要同时启用两份黎北扩展。
2. 新用户在酒馆「扩展 → 安装扩展」粘贴：

   `https://github.com/allen0217s/libei-status`

   已安装此仓库的用户，在扩展管理中点「更新」，然后刷新酒馆页面。
3. 在魔杖扩展菜单打开「黎北」。书签、顶栏、输入框上方和楼层入口可在「设置 → 基本设置」开启；它们默认与参考原版一样关闭。
4. 检测到旧版 API 配置时，明确选择导入草稿并检查后完成，或选择「不导入，明确跟随主 API」。不自动上传旧密钥，不删除旧数据。
5. 打开名称为「黎北的府邸生活」的单角色聊天；仅支持此角色，不支持群聊。建议 SillyTavern 1.19.0+，通过 localhost 或 HTTPS 访问，以提供状态写入所需的 Web Locks。普通局域网 HTTP 可能只读。

手动安装时将仓库放入酒馆第三方扩展目录；[manifest.json](<manifest.json>)、[index.js](<index.js>)、[index.css](<index.css>) 保持在根目录。普通用户**不需要安装 Node、pnpm 或构建**。CSS 由插件内部载入 Shadow DOM。

### 界面（模拟数据）

![设置与主副 API](<docs/screenshots/settings.png>)

![渠道编辑](<docs/screenshots/channel.png>)

![世界书排除](<docs/screenshots/worldbooks.png>)

## 设置及隐私

- 渠道、主题、入口与排除名单保存到当前 ST 账户的 `extensionSettings.libei_status_v2`，可能跨设备同步。
- **渠道密钥在点完成后按参考实现以明文写入酒馆设置，并非 ST secrets 加密保险库。仅在可信服务器使用。** 测试/拉模型会将草稿密钥经酒馆发给指定服务，但不保存草稿。关闭渠道弹窗丢弃未完成的修改。
- 不读写柏宝其他扩展的共享渠道或排除名单；安装两者不会互删渠道。
- 状态链与规则仍在原浏览器 localStorage 命名空间中，**不会随新设置自动同步**。换设备请导出完整状态存档。
- 状态/规则导出不含新旧 API 密钥。
- 世界书名单勾选即时保存；关闭名单弹窗不回滚。条目规则匹配 comment，不匹配正文内容。已进入历史正文的同样文字不会被追溯删除。
- 模板渲染默认关闭；打开后可能通过模板插件执行 EJS、读写变量，只对可信世界书开启。有排除规则却无法获得逐条世界书元数据时拒绝发送，而非无过滤降级。
- 主 API 沿用 generateRaw，无法保证独立即时中止，也不能观测其 finish_reason。取消/切聊天/切配置会丢弃过期结果，不强停酒馆主生成。副 API 可网络取消并拒绝 length 截断响应。

## 验证范围

本地 `vue-tsc --noEmit` 与 Vite 构建通过；36 项 API/设置/世界书模块测试、19 项真实 Chrome 渲染的模拟宿主交互测试通过。覆盖主副路由、渠道草稿/删除、世界书过滤、截断/取消、延迟 Web Locks、移动布局与入口销毁。

**尚未在用户真实酒馆/真实供应商 API 中测试。** 建议先手动更新一个楼层确认后再启用自动更新。

## 来源与公开发布

参考：<https://github.com/baibai-git/ST-BaiBai-Book>，作者柏柏，提交 `21f7488d8083f6293c3d4db654216f49fc35ea85`。

该固定版本未找到 LICENSE/COPYING，package.json 未声明许可。本仓库不是官方作品；按维护者明确要求提交，不代表已取得原作者授权，亦不将引用部分伪标为 MIT/ISC。详细来源与限制见 [来源说明](<REFERENCE_NOTICE.md>)，依赖授权见 [第三方声明](<THIRD_PARTY_NOTICES.md>)。

## 源码与开发

运行资源位于仓库根目录，完整 Vue/TypeScript 源码在 [src](<src/>)。旧状态适配器已固定为源码，不依赖原开发工作区重新生成。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:browser
```

浏览器测试需要已安装 Chromium；可通过 `LIBEI_BROWSER_PATH` 指定浏览器路径，只使用新建隔离 profile 与内存数据。测试产物、依赖和浏览器缓存不提交。当前 v2 报告见 [模块测试](<validation/unit_test_report.json>)、[浏览器测试](<validation/browser_test_report.json>)；原 v1 报告作为历史证据保留。
