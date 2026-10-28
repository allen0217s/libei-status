# 第三方组件与来源

ST-BaiBai-Book 的界面/渠道提取来源与授权待确认状态见 [REFERENCE_NOTICE.md](<REFERENCE_NOTICE.md>)。以下许可仅覆盖列出的依赖，**不将 MIT/ISC 许可扩张到未标许可的参考界面源码**。

## Vue.js 3.5.35

```text
The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## yaml 2.9.1

```text
yaml@2.9.1 (ISC), bundled via the package dependency
Copyright Eemeli Aro <eemeli@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## AlbusKen/shujuku 输出模式参考（2.x 历史）

参考提交 0d9cc1a50417398f1e96834b6a3be684f94839f2 的可读表格构造、最新数据标签与表格默认深度，已针对本插件状态字段适配。用户声明已取得作者授权，详见 docs/STORY_OUTPUT_REFERENCE.md。没有复制其打包文件或远程执行模块。

3.x 通用引擎已替换 2.x 的表格输出与字段筛选流程；上述来源说明继续作为历史记录保留。

## MVU 格式参考（3.1）

JSONPatch 与 stat_data 格式核对自 MagicalAstrogy/MagVarUpdate 固定提交 d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc。通用引擎使用独立实现，没有引入该项目的运行时脚本；完整依据和兼容子集见 docs/UNIVERSAL_ENGINE.md。
