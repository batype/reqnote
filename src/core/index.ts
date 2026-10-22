import { parseTree } from "jsonc-parser";
import type { Node as JsonNode, ParseError } from "jsonc-parser";

export const VERSION = "1.0.0";
export const MAX_BYTES = 256 * 1024;
export type Target = "fetch" | "axios" | "python" | "http" | "curl";
export interface Header {
  name: string;
  value: string;
}
export interface RequestNote {
  method: string;
  url: string;
  headers: Header[];
  body: string | null;
  bodyKind: "none" | "json" | "form" | "text";
  followRedirects: boolean;
}
export interface ConvertOptions {
  target?: Target;
  redact?: boolean;
  customKeys?: string[];
}
export interface Conversion {
  code: string;
  extension: string;
  target: Target;
  request: RequestNote;
  warnings: string[];
  redactedCount: number;
  redacted: boolean;
}
const fail = (message: string): never => {
  throw new Error(message);
};
const bytes = (text: string) => new TextEncoder().encode(text);
const normalize = (key: string) =>
  key.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const secretKeys = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "xapikey",
  "apikey",
  "xauthtoken",
  "xaccesstoken",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "password",
  "passwd",
  "pwd",
  "secret",
  "clientsecret",
  "privatekey",
  "credential",
  "credentials",
  "session",
  "sessionid",
  "signature",
  "xamzsignature",
  "xamzcredential",
  "xgoogsignature",
  "xgoogcredential",
]);
const sensitive = (key: string, custom: Set<string>) =>
  secretKeys.has(normalize(key)) ||
  /(?:token|secret|apikey|password|passwd|privatekey|credential|signature)$/.test(
    normalize(key),
  ) ||
  custom.has(normalize(key));
const marker = "<REDACTED>";

/** Tokenize one Bash-style command without expansion or execution. */
export function tokenizeCurl(input: string): string[] {
  if (typeof input !== "string" || !input.trim()) fail("请粘贴一条 cURL 命令");
  if (bytes(input).length > MAX_BYTES) fail("输入最多 256 KiB，请拆分请求");
  if (input.includes("\0")) fail("不支持 NUL 字节");
  input = input.trim();
  const tokens: string[] = [];
  let token = "",
    started = false,
    quote: "single" | "double" | null = null;
  const push = () => {
    if (started) tokens.push(token);
    token = "";
    started = false;
    if (tokens.length > 4096) fail("参数过多，最多 4096 项");
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote === "single") {
      if (c === "'") quote = null;
      else token += c;
      continue;
    }
    if (quote === "double") {
      if (c === '"') {
        quote = null;
        continue;
      }
      if (c === "\\") {
        const next = input[++i];
        if (next === undefined) fail("反斜杠后缺少字符");
        if (next === "\r" && input[i + 1] === "\n") {
          i++;
          continue;
        }
        if (next === "\n") continue;
        token += ["$", "`", '"', "\\"].includes(next) ? next : "\\" + next;
        continue;
      }
      if (c === "$" || c === "`")
        fail("不展开变量或命令替换；请先替换为字面量，或用单引号包裹字面文本");
      token += c;
      continue;
    }
    if (c === "\\") {
      const next = input[++i];
      if (next === undefined) fail("命令末尾的反斜杠不完整");
      if (next === "\r" && input[i + 1] === "\n") {
        i++;
        continue;
      }
      if (next === "\n") continue;
      started = true;
      token += next;
      continue;
    }
    if (c === "'" || c === '"') {
      started = true;
      quote = c === "'" ? "single" : "double";
      continue;
    }
    if (c === "$" || c === "`")
      fail("不支持变量、命令替换或 ANSI-C 引号；使用 Bash 单/双引号字面量");
    if (";&|<>()".includes(c) || (c === "#" && !started))
      fail("仅支持一条请求，不支持 shell 操作符、重定向或注释");
    if (/\s/.test(c)) {
      push();
      if ((c === "\n" || c === "\r") && input.slice(i).trim())
        fail("多行命令请使用反斜杠续行；不支持多条 shell 命令");
      continue;
    }
    started = true;
    token += c;
  }
  if (quote) fail("引号未闭合，请检查单引号或双引号");
  push();
  return tokens;
}

function formPart(value: string): string {
  const eq = value.indexOf("=");
  if (eq >= 0)
    return (
      (eq ? value.slice(0, eq) + "=" : "") +
      encodeURIComponent(value.slice(eq + 1)).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      )
    );
  if (value.includes("@")) fail("不读取本地文件；请将文件内容作为字面量输入");
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
const headerValue = (headers: Header[], key: string) => {
  for (let i = headers.length - 1; i >= 0; i--)
    if (headers[i].name.toLowerCase() === key) return headers[i].value;
  return undefined;
};
const tree = (body: string) => {
  try {
    const errors: ParseError[] = [];
    const root = parseTree(body, errors, {
      disallowComments: true,
      allowTrailingComma: false,
    });
    return errors.length ? undefined : root;
  } catch {
    return undefined;
  }
};

export function parseCurl(input: string): {
  request: RequestNote;
  warnings: string[];
} {
  const args = tokenizeCurl(input);
  if (!["curl", "curl.exe"].includes(args.shift() ?? ""))
    fail(
      "命令必须以 curl 开头；支持 Bash 风格引号，不支持 PowerShell 或 cmd 语法",
    );
  const headers: Header[] = [],
    removed = new Set<string>(),
    urls: string[] = [],
    data: string[] = [],
    queries: string[] = [],
    warnings: string[] = [];
  let explicitMethod: string | undefined,
    dataMode: "data" | "json" | undefined,
    basic: string | undefined,
    get = false,
    head = false,
    follow = false,
    end = false;
  const addHeader = (value: string) => {
    if (/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
      fail("请求头不能包含换行或控制字符");
    const at = value.indexOf(":");
    let name: string, content: string;
    if (at < 0 && value.endsWith(";")) {
      name = value.slice(0, -1).trim();
      content = "";
    } else {
      if (at < 1) fail("请求头格式应为 Name: value");
      name = value.slice(0, at).trim();
      content = value.slice(at + 1).trim();
      if (!content) {
        removed.add(name.toLowerCase());
        return;
      }
    }
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) fail("请求头名称无效");
    if (headers.length >= 256) fail("请求头最多 256 项");
    headers.push({ name, value: content });
  };
  const addData = (
    value: string,
    kind: "data" | "json",
    fileAllowed = false,
  ) => {
    if (!fileAllowed && value.startsWith("@"))
      fail("不读取 @file 或 stdin 引用；请粘贴字面请求体");
    if (dataMode && dataMode !== kind)
      fail("首版不混用 --json 与其他 data 选项；请合并成一份请求体");
    dataMode = kind;
    data.push(value);
  };
  const takesValue = new Set([
    "--url",
    "--request",
    "--header",
    "--data",
    "--data-ascii",
    "--data-raw",
    "--data-binary",
    "--data-urlencode",
    "--json",
    "--user",
    "--cookie",
    "--user-agent",
    "--referer",
    "--url-query",
  ]);
  const aliases: Record<string, string> = {
    X: "--request",
    H: "--header",
    d: "--data",
    u: "--user",
    b: "--cookie",
    A: "--user-agent",
    e: "--referer",
    G: "--get",
    I: "--head",
    L: "--location",
    s: "--silent",
    S: "--show-error",
  };
  const option = (name: string, value?: string) => {
    switch (name) {
      case "--url":
        urls.push(value!);
        break;
      case "--request":
        if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(value!)) fail("HTTP 方法格式无效");
        explicitMethod = value!;
        break;
      case "--header":
        addHeader(value!);
        break;
      case "--data":
      case "--data-ascii":
      case "--data-binary":
        addData(value!, "data");
        break;
      case "--data-raw":
        addData(value!, "data", true);
        break;
      case "--data-urlencode":
        addData(formPart(value!), "data", true);
        break;
      case "--json":
        addData(value!, "json");
        break;
      case "--url-query":
        queries.push(
          value!.startsWith("+") ? value!.slice(1) : formPart(value!),
        );
        break;
      case "--user":
        if (!value!.includes(":"))
          fail("--user 需要 username:password，不执行交互式密码提示");
        basic = value;
        break;
      case "--cookie":
        if (!value!.includes("="))
          fail("不读取 Cookie 文件；请输入 name=value");
        addHeader("Cookie: " + value);
        break;
      case "--user-agent":
        addHeader("User-Agent: " + value);
        break;
      case "--referer":
        addHeader("Referer: " + value);
        break;
      case "--get":
        get = true;
        break;
      case "--head":
        head = true;
        break;
      case "--location":
        follow = true;
        break;
      case "--silent":
      case "--show-error":
        break;
      case "--compressed":
        warnings.push("压缩协商由目标客户端处理；未固定 curl 的压缩行为。");
        break;
      case "--globoff":
        warnings.push("按单个字面 URL 解析，不展开 curl URL 通配符。");
        break;
      case "--http1.1":
      case "--http2":
        warnings.push("代码示例未强制 HTTP 协议版本。");
        break;
      default:
        fail(
          "包含首版不支持的选项；支持列表见使用边界。没有忽略未知参数或执行命令。",
        );
    }
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!end && arg === "--") {
      end = true;
      continue;
    }
    if (end || !arg.startsWith("-") || arg === "-") {
      urls.push(arg);
      continue;
    }
    if (arg.startsWith("--")) {
      const at = arg.indexOf("="),
        name = at < 0 ? arg : arg.slice(0, at);
      if (takesValue.has(name)) {
        const value = at < 0 ? args[++i] : arg.slice(at + 1);
        if (value === undefined) fail("选项缺少参数值");
        option(name, value);
      } else {
        if (at >= 0) fail("该选项不接受参数值");
        option(name);
      }
    } else {
      for (let j = 1; j < arg.length; j++) {
        const name = aliases[arg[j]];
        if (!name) fail("包含不支持的短选项；请查看使用边界");
        if (takesValue.has(name)) {
          const value = j + 1 < arg.length ? arg.slice(j + 1) : args[++i];
          if (value === undefined) fail("选项缺少参数值");
          option(name, value);
          break;
        }
        option(name);
      }
    }
  }
  if (urls.length !== 1) fail("每次只处理一个 URL，请拆分多请求命令");
  let url: URL;
  try {
    url = new URL(urls[0]);
  } catch {
    return fail("需要完整的 http:// 或 https:// URL");
  }
  if (/[\x00-\x20\x7f]/.test(urls[0]))
    fail("URL 不能包含空格或控制字符，请先进行 URL 编码");
  if (!["http:", "https:"].includes(url.protocol))
    fail("仅支持 HTTP / HTTPS 请求");
  if (url.hash) {
    url.hash = "";
    warnings.push("URL 片段不会传输给服务器，已移除。");
  }
  if (url.username || url.password) {
    try {
      basic ??=
        decodeURIComponent(url.username) +
        ":" +
        decodeURIComponent(url.password);
    } catch {
      fail("URL 凭据编码无效");
    }
    url.username = "";
    url.password = "";
    warnings.push("URL 内的凭据已转换为 Authorization 请求头。");
  }
  if (
    basic &&
    !headers.some((h) => h.name.toLowerCase() === "authorization") &&
    !removed.has("authorization")
  )
    headers.push({
      name: "Authorization",
      value:
        "Basic " +
        btoa(Array.from(bytes(basic), (b) => String.fromCharCode(b)).join("")),
    });
  if (head && data.length)
    fail("首版不组合 --head 和请求体；请明确请求方法并拆分输入");
  let body: string | null = data.length
    ? data.join(dataMode === "json" ? "" : "&")
    : null;
  if (get && body !== null) {
    queries.push(body);
    body = null;
  }
  if (queries.length)
    url.search =
      (url.search ? url.search.slice(1) + "&" : "") + queries.join("&");
  const addDefault = (name: string, value: string) => {
    if (
      !removed.has(name.toLowerCase()) &&
      !headers.some((h) => h.name.toLowerCase() === name.toLowerCase())
    )
      headers.push({ name, value });
  };
  if (body !== null)
    addDefault(
      "Content-Type",
      dataMode === "json"
        ? "application/json"
        : "application/x-www-form-urlencoded",
    );
  if (dataMode === "json") addDefault("Accept", "application/json");
  if (removed.size)
    warnings.push(
      "curl 的“移除默认请求头”不能保证在其他客户端完全重现，请核对目标运行环境。",
    );
  const bodyKind =
    body === null
      ? "none"
      : tree(body)
        ? "json"
        : headerValue(headers, "content-type")
              ?.toLowerCase()
              .startsWith("application/x-www-form-urlencoded") &&
            body.includes("=")
          ? "form"
          : "text";
  return {
    request: {
      method:
        explicitMethod ??
        (head ? "HEAD" : get ? "GET" : body !== null ? "POST" : "GET"),
      url: url.href,
      headers,
      body,
      bodyKind,
      followRedirects: follow,
    },
    warnings,
  };
}

function redactRequest(
  request: RequestNote,
  keys: string[],
): { request: RequestNote; count: number; warnings: string[] } {
  if (
    !Array.isArray(keys) ||
    keys.length > 64 ||
    keys.some((k) => typeof k !== "string" || k.length > 80)
  )
    fail("自定义脱敏字段最多 64 个，每个最多 80 字符");
  const custom = new Set(keys.map(normalize));
  let count = 0;
  const warnings: string[] = [];
  let headers = request.headers.map((h) =>
    sensitive(h.name, custom)
      ? (count++,
        {
          ...h,
          value: /^(Bearer|Basic)\s/i.test(h.value)
            ? h.value.split(/\s/, 1)[0] + " " + marker
            : marker,
        })
      : { ...h },
  );
  const url = new URL(request.url),
    query = [...url.searchParams.entries()];
  if (query.some(([key]) => sensitive(key, custom))) {
    url.search = "";
    for (const [key, value] of query)
      url.searchParams.append(
        key,
        sensitive(key, custom) ? (count++, marker) : value,
      );
  }
  let body = request.body;
  if (body !== null && request.bodyKind === "json") {
    const root = tree(body)!;
    const edits: { start: number; length: number }[] = [];
    let nodes = 0;
    const visit = (node: JsonNode, depth: number) => {
      if (depth > 64 || ++nodes > 20000) throw Error("complex");
      if (node.type === "object")
        for (const property of node.children ?? []) {
          const [key, value] = property.children!;
          if (sensitive(String(key.value), custom))
            edits.push({ start: value.offset, length: value.length });
          else visit(value, depth + 1);
        }
      else if (node.type === "array")
        for (const child of node.children ?? []) visit(child, depth + 1);
    };
    try {
      if (!["array", "object"].includes(root.type)) throw Error("scalar");
      visit(root, 0);
      for (const e of edits.sort((a, b) => b.start - a.start))
        body =
          body.slice(0, e.start) +
          JSON.stringify(marker) +
          body.slice(e.start + e.length);
      count += edits.length;
    } catch {
      body = JSON.stringify(marker);
      count++;
      warnings.push("请求体为标量或嵌套过深，已整体替换，请核对。");
    }
  } else if (body !== null && request.bodyKind === "form") {
    const form = new URLSearchParams(body),
      pairs = [...form];
    if (pairs.some(([key]) => sensitive(key, custom))) {
      const safe = new URLSearchParams();
      for (const [key, value] of pairs)
        safe.append(key, sensitive(key, custom) ? (count++, marker) : value);
      body = safe.toString();
    }
  } else if (body !== null) {
    body = marker;
    count++;
    warnings.push("非 JSON / 表单请求体已整体替换，防止把未识别内容直接导出。");
  }
  if (
    body !== request.body &&
    headers.some((h) => h.name.toLowerCase() === "content-length")
  ) {
    headers = headers.filter((h) => h.name.toLowerCase() !== "content-length");
    warnings.push(
      "脱敏改变了请求体，已移除原始 Content-Length，请由目标客户端重新计算。",
    );
  }
  return {
    request: { ...request, url: url.href, headers, body },
    count,
    warnings,
  };
}

const quote = (value: string) => JSON.stringify(value);
const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const forbidden =
  /^(cookie|cookie2|host|content-length|connection|accept-encoding|accept-charset|access-control-request-headers|access-control-request-method|date|dnt|expect|keep-alive|origin|referer|user-agent|permissions-policy|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*)$/i;
function generate(
  request: RequestNote,
  target: Target,
): { code: string; extension: string; warnings: string[] } {
  const warnings: string[] = [];
  let headers = request.headers;
  if (target === "fetch") {
    if (
      request.body !== null &&
      ["GET", "HEAD"].includes(request.method.toUpperCase())
    )
      fail(
        "Fetch 不支持 GET / HEAD 请求体；请选择 Axios、Python、HTTP 或 cURL 输出",
      );
    if (headers.some((h) => forbidden.test(h.name))) {
      headers = headers.filter((h) => !forbidden.test(h.name));
      warnings.push(
        "浏览器 Fetch 示例已移除 Cookie、Host 等受限或由浏览器管理的请求头；需要还原这些头时请选择 Python / HTTP / cURL。",
      );
    }
    return {
      extension: "js",
      warnings,
      code:
        "const response = await fetch(" +
        quote(request.url) +
        ", {\n  method: " +
        quote(request.method) +
        ",\n  headers: " +
        JSON.stringify(
          headers.map((h) => [h.name, h.value]),
          null,
          2,
        ).replace(/\n/g, "\n  ") +
        ",\n  redirect: " +
        quote(request.followRedirects ? "follow" : "manual") +
        (request.body !== null ? ",\n  body: " + quote(request.body) : "") +
        "\n});\n\nconsole.log(response.status);\nconsole.log(await response.text());\n",
    };
  }
  if (target === "axios" || target === "python") {
    const grouped: Record<string, string> = Object.create(null),
      names = new Map<string, string>();
    for (const h of headers) {
      const lower = h.name.toLowerCase(),
        name = names.get(lower) ?? h.name;
      if (names.has(lower)) {
        grouped[name] += (lower === "cookie" ? "; " : ", ") + h.value;
        warnings.push("目标字典不能表达重复请求头，已合并；请核对服务端语义。");
      } else {
        names.set(lower, name);
        grouped[name] = h.value;
      }
    }
    if (target === "axios") {
      warnings.push(
        "Axios 示例按 Node.js 运行环境生成；浏览器中的 Cookie、请求头与重定向限制不同。",
      );
      return {
        extension: "mjs",
        warnings,
        code:
          'import axios from "axios";\n\nconst response = await axios.request({\n  method: ' +
          quote(request.method) +
          ",\n  url: " +
          quote(request.url) +
          ",\n  headers: " +
          JSON.stringify(grouped, null, 2).replace(/\n/g, "\n  ") +
          ",\n  maxRedirects: " +
          (request.followRedirects ? "20" : "0") +
          ",\n  validateStatus: () => true" +
          (request.body !== null ? ",\n  data: " + quote(request.body) : "") +
          "\n});\n\nconsole.log(response.status);\nconsole.log(response.data);\n",
      };
    }
    return {
      extension: "py",
      warnings,
      code:
        "import requests\n\nheaders = " +
        JSON.stringify(grouped, null, 2) +
        "\n\nresponse = requests.request(\n    " +
        quote(request.method) +
        ",\n    " +
        quote(request.url) +
        ",\n    headers=headers,\n    allow_redirects=" +
        (request.followRedirects ? "True" : "False") +
        (request.body !== null
          ? ",\n    data=" + quote(request.body) + '.encode("utf-8")'
          : "") +
        "\n)\n\nprint(response.status_code)\nprint(response.text)\n",
    };
  }
  if (target === "http")
    return {
      extension: "http",
      warnings,
      code:
        request.method +
        " " +
        request.url +
        "\n" +
        headers.map((h) => h.name + ": " + h.value).join("\n") +
        "\n\n" +
        (request.body ?? "") +
        "\n",
    };
  return {
    extension: "sh",
    warnings,
    code:
      [
        "curl --request " + shellQuote(request.method),
        shellQuote(request.url),
        ...(request.followRedirects ? ["--location"] : []),
        ...headers.map(
          (h) =>
            "--header " +
            shellQuote(h.value ? h.name + ": " + h.value : h.name + ";"),
        ),
        ...(request.body !== null
          ? ["--data-raw " + shellQuote(request.body)]
          : []),
      ].join(" \\\n  ") + "\n",
  };
}

/** Convert only: never evaluates shell or sends an HTTP request. */
export function convertCurl(
  input: string,
  options: ConvertOptions = {},
): Conversion {
  const target = options.target ?? "fetch";
  if (!["fetch", "axios", "python", "http", "curl"].includes(target))
    fail("未知输出目标");
  const parsed = parseCurl(input),
    redact = options.redact !== false;
  const safe = redact
    ? redactRequest(parsed.request, options.customKeys ?? [])
    : { request: parsed.request, count: 0, warnings: [] };
  const generated = generate(safe.request, target);
  return {
    code: generated.code,
    extension: generated.extension,
    target,
    request: safe.request,
    redacted: redact,
    redactedCount: safe.count,
    warnings: [
      ...new Set([...parsed.warnings, ...safe.warnings, ...generated.warnings]),
    ],
  };
}
