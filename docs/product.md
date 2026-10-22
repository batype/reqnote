# 需求与选题 · 2026-10-22

目标用户：需要从浏览器网络面板复制请求、整理联调示例、贴到工单或文档的开发者。

一句话任务：把一段拥挤的cURL命令，变成可检查、可转换、可按规则脱敏的请求便笺。

## 三个候选

| 方向 | 价值判断 | 本次取舍 |
|---|---|---|
| cURL检查与转换 | 接口联调和示例分享可能反复发生，十几秒即可展示输入输出变化 | 选中 |
| JSON生成类型 | 类型生成实用，quicktype已提供成熟方案；与现有JSON Harbor方向接近 | 暂缓 |
| Cron解释与预览 | 定时任务排错明确，cRonstrue等已有基础库 | 暂缓 |

同类资料：[curlconverter](https://github.com/curlconverter/curlconverter)、[quicktype](https://github.com/glideapps/quicktype)、[cRonstrue](https://github.com/bradymholt/cRonstrue)。同类存在不能证明本项目有高留存；本项目尚无流量或复用数据。

## 为什么还做

curlconverter已提供多语言转换，本项目不以语言数竞争。首版聚焦中文请求速览、默认分享脱敏、清楚的原始模式、保持JSON数字原文，以及相同核心的CLI/API。脱敏仅是规则替换，不能保证自动识别所有秘密。

## 完整主流程

1. 粘贴/导入cURL或载入合成示例。
2. 本地解析，明确展示不支持的语法；不静默丢弃未知选项。
3. 查看请求头、查询、正文，选择代码目标。
4. 开启规则脱敏或明确查看原始值，按需添加额外字段。
5. 复制或下载。输入修改后保留旧结果并标明过期，禁止误复制。

首版不做请求发送、账户、云端历史、所有curl语法、文件上传或API响应展示。未知/文件/动态shell语法拒绝转换，核心不执行输入。只持久化主题。

React + Vite + TypeScript；分离App状态、代码展示、请求速览、Worker与纯核心。dist不是源码目录。Vite生产资产带哈希，Pages配置`/reqnote/` base。部署依据[Vite官方说明](https://vite.dev/guide/static-deploy.html#github-pages)。

## 下一步如何验证价值

先让真实用户用自己的合成联调场景完成一次转换和分享，观察未知选项、复制前回改和重复使用情况。先解决实际遇到的兼容路径，不继续堆语言数。没有偷偷加入追踪脚本。
