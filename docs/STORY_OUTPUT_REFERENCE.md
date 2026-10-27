# 正文输出参考与边界

上游：AlbusKen/shujuku（龙血玄黄·数据库），提交 0d9cc1a50417398f1e96834b6a3be684f94839f2。用户于 2026-10-27 表示已取得作者的代码借用授权；授权依据是用户声明，本工程不补充推定上游许可证。

参考来源：
- src/service/runtime/helpers-data-merge.ts 的 formatJsonToReadable_ACU：分组标题与 Markdown 表格。
- src/service/worldbook/pipeline.ts 的最新数据包裹条目。
- src/service/worldbook/injection-engine-config.ts 的表格默认位置：system、聊天深度 2。上游全局世界书条目另有默认位置，不能混为所有路径统一默认。

本地适配：
- 状态字段按分组整理成“字段 / 当前状态”表，转义单元格竖线、换行和标签边界。
- 包裹说明限定当前记录与旧状态/背景默认值的关系；未添加模型安全限制绕过指令。
- 使用原有 setExtensionPrompt 接口；没有搬入上游世界书写入、SQL、随机模板、Agent 接管、零层或网络拦截机制。
- sendToStory 可选布尔值，缺省 true；storyRule 可选文字，缺省为空。面板显示 visible 与发送开关独立。原字段预设格式携带这两项。
- 完整字段类型、维护规则和写入权限仅供状态更新请求。正文只接收选中的状态值与显式叙事约束。
- {state_table} 输出分组表格，{state_json} 和旧 stat_data 占位符仍可使用，均遵守正文筛选；替换不执行宏或 EJS。
- storyDepth 为当前角色上下文配置（0～100，缺省 2），不随字段预设传递。原自定义模板和职责原文保留，两个旧内置模板升级为参考表格模板。上下文页“使用数据库参考格式”只载入草稿，保存后生效。
- 状态存档不迁移或重算，历史快照行为保持原样。

本地单元、构建和模拟宿主浏览器检查不能代替真实酒馆最终请求核对。仍只依赖 SillyTavern 原生事件和扩展提示接口，未新增 Tavern Helper、MVU、CDN 或外部数据库依赖。

来源链接：[上游固定版本](https://github.com/AlbusKen/shujuku/tree/0d9cc1a50417398f1e96834b6a3be684f94839f2)。发送开关只筛选本插件的注入段，不会删除聊天历史、角色卡或其他世界书中的同名内容。
