# 支持范围

这是小型静态转换器，不是curl本体或完整shell解释器。首次输入失败时，请按错误提示缩小成单个字面量请求；不要为了通过解析而漏掉影响请求语义的参数。

| 类别 | 支持 |
|---|---|
| 语法 | Bash单/双引号、反斜杠转义与续行、连续拼接的引号片段 |
| 地址与方法 | 一个HTTP(S)绝对URL、--url、-X/--request、-G/--get、-I/--head |
| 请求头 | -H/--header，Name: value、Name;显式空值、Name:移除默认值 |
| 请求体 | -d/--data/--data-ascii、--data-raw、--data-binary字面量、--data-urlencode、--json |
| 认证等 | -u/--user username:password、-b/--cookie字面值、-A/--user-agent、-e/--referer |
| 其他 | -L/--location、--url-query、-s/-S；压缩、协议、globoff按边界提示处理 |

短选项可附着值或组合布尔选项，如`-XPOST`、`-H'X-Tag: one'`、`-sSL`。长选项支持等号值。

不支持：ANSI-C `$'...'`、环境变量、命令替换、shell注释/操作符/重定向、Windows PowerShell或cmd引号、multipart、@files、stdin引用、多个URL、curl配置文件和未列出的选项。URL按字面值解析，不展开curl URL通配符。输入空白URL字符需先编码。

--json的多次使用直接拼接正文；其他data选项按`&`拼接。首版不混用这两类。--head不与正文组合。Basic Auth只接受带冒号的显式字面值，不提示交互密码。URL内的凭据转换为认证头，默认脱敏。

脱敏字段大小写不敏感，忽略字段名中的标点，支持额外中文字段。Cookie整体替换。深层/标量JSON和不明确文本整体替换。默认字段包括Authorization、Proxy-Authorization、Cookie、Set-Cookie、password、secret、token、api_key、session、签名等英文常见形式；后缀匹配也覆盖api_token等名称。URL路径不会自动判断是否敏感。

正文脱敏后移除原Content-Length，避免旧长度与新正文冲突。Fetch受限头被移除并提示；Axios面向Node；Python/Axios的重复头合并需要核对服务端语义。转换只提供显式参数示例，不复制curl版本特有的默认头、连接/TLS行为或认证协商。

上限：输入256KiB、参数4096项、显式请求头256项；JSON字段遍历超过64层/20000节点时整体替换正文。复制、下载及Node返回结果均由调用者决定后续使用。

参数语义参考[curl官方手册](https://curl.se/docs/manpage.html)。
