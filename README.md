# ReqNote · 请求便笺

把 cURL 写成清楚的请求：本地解析请求结构，生成五种代码，按规则脱敏后分享。**不执行 cURL，不发送 HTTP 请求，不读取命令中的 @files。**

[在线使用](https://batype.github.io/reqnote/) · [需求分析](docs/product.md) · [API](docs/api.md) · [使用边界](docs/limits.md)

![ReqNote](https://raw.githubusercontent.com/batype/reqnote/main/docs/preview-light.png)

## 功能

- 粘贴或导入UTF-8 cURL，查看方法、URL、查询参数、请求头与请求体。
- 生成浏览器Fetch、Node.js Axios、Python Requests、HTTP和cURL示例。
- 默认脱敏认证头、Cookie、敏感查询参数、JSON/表单字段；支持额外字段名。
- JSON脱敏通过原文区间替换，保留其他数字文本，包括长整数和小数尾零。
- 支持亮色/暗色/系统主题、手机布局、复制下载、输入更新后的过期结果提示。
- React + Vite + TypeScript；核心运行在Worker，也可由Node API/CLI调用。

## 本地开发

Node22.14+：

```sh
git clone https://github.com/batype/reqnote.git
cd reqnote
npm ci
npm test
npm run build
npm run dev
# http://127.0.0.1:4182/reqnote/
```

`npm run preview`在4183端口预览正式构建。Vite base为`/reqnote/`；源码在src，dist只存构建产物。推送main后Actions执行安装、测试、类型检查、构建及Pages部署。

## Node API / CLI

已发布到[npm：@batype/reqnote](https://www.npmjs.com/package/@batype/reqnote)。也可从[GitHub Release](https://github.com/batype/reqnote/releases)下载tarball。

```sh
npm install @batype/reqnote
npx --yes --package=@batype/reqnote reqnote --in request.curl --to python --out request-redacted.py
```

在源码中运行：

```sh
npm run build:core
node bin/reqnote.mjs --in request.curl --to python --out request-redacted.py
# 默认脱敏。--raw明确输出原始值；--json同时输出请求元数据
```

安装包使用方式：

```js
import {convertCurl} from '@batype/reqnote';
const result=convertCurl("curl 'https://example.com/users?token=demo'", {
  target:'fetch',
  redact:true,
  customKeys:['email','phone']
});
console.log(result.code);
```

CLI只从文件或stdin读取命令，避免把凭据放入shell参数/历史。输出文件以0600创建，不覆盖输入、已有文件或链接。API返回值与限制见[docs/api.md](docs/api.md)。

## 数据与边界

只持久化主题；输入、结果和额外字段设置仅留在当前页面内存。没有历史记录、遥测或远程处理接口；正式构建CSP禁止网络连接。复制/下载由用户触发。刷新后回到合成示例；清空会移除当前输入与结果。共享电脑仍需留意剪贴板和下载文件。

**脱敏是已知字段规则匹配，不是敏感信息识别保证。** URL路径、业务字段和字段名称自身可能含信息，分享前需核对。非JSON/表单正文默认整体替换；脱敏示例含占位值，实际调用前需要用户自行填写。原始模式会保留凭据。

每次处理一条请求，最多256KiB，最多256个显式请求头。支持Bash单/双引号、反斜杠续行及常用选项；不支持ANSI-C引号、PowerShell/cmd、变量/命令替换、管道、multipart、文件上传和所有cURL选项。未知选项会报错，详情见[使用边界](docs/limits.md)。

转换为其他客户端会受到默认头、重定向、Cookie及运行环境差异影响。Fetch会移除受限/浏览器管理的头并提示，GET/HEAD请求体不能生成Fetch；Axios示例面向Node。Python/Axios会合并重复头并提示。工具不声称完整复现curl的线上行为。

## 验证与反馈

`npm test`验证引号与选项、查询与请求体、脱敏、长整数、代码字面量、cURL往返、Fetch行为模拟，以及CLI文件保护。另做生成代码语法检查与浏览器实际操作，见[验证记录](docs/validation.md)。

问题请提交到[Issues](https://github.com/batype/reqnote/issues)，使用合成示例，不上传生产Cookie、令牌、私钥或个人数据。

MIT © 2026 batype。运行时许可见[THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt)。
