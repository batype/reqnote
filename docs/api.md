# Node API

Node22.14+，ESM，类型声明随包提供。CLI使用同一核心逻辑，不依赖React。

`convertCurl(input, options?)`同步返回：

```ts
interface ConvertOptions {
  target?: 'fetch'|'axios'|'python'|'http'|'curl'; // 默认fetch
  redact?: boolean; // 默认true；false返回原始值
  customKeys?: string[]; // 在默认规则外增加字段，最多64个、每个80字符
}
interface Conversion {
  code: string;
  extension: string;
  target: string;
  request: {
    method: string; url: string;
    headers: {name:string; value:string}[];
    body: string|null;
    bodyKind: 'none'|'json'|'form'|'text';
    followRedirects: boolean;
  };
  redacted: boolean;
  redactedCount: number;
  warnings: string[];
}
```

`redact:true`返回的request和code均经过相同规则处理，不在附加字段里保留原始请求。请求体JSON仅对选中值的文本区间替换，避免重写其他数字。业务信息、URL路径和规则未覆盖的字段仍需核对。

`parseCurl(input)`返回`{request,warnings}`，**包含未脱敏原始值**，用于程序内部检查。`tokenizeCurl(input)`只进行受限Bash词法解析。两者都不执行命令、不读取@files，不进行变量替换。错误不回显输入全文。

`VERSION`与`MAX_BYTES`也可导入。超限、不支持语法、无效URL/头或不支持目标会抛Error。

CLI默认只写代码；`--json`写完整Conversion。`--raw`关闭脱敏，`--redact-key email`可多次指定额外字段。`--out`必须是不存在的新文件。没有覆盖开关。

Node包只需要jsonc-parser运行时依赖；React/Vite用于网页开发和构建，不参与CLI执行。
