import { useEffect, useRef, useState } from "react";
import { MAX_BYTES } from "./core/index";
import type { Conversion, Target } from "./core/index";
import { examples } from "./examples";
import type { ExampleKey } from "./examples";
import { CodeView } from "./components/CodeView";
import { Inspector } from "./components/Inspector";

const targets: { id: Target; label: string }[] = [
  { id: "fetch", label: "Fetch" },
  { id: "axios", label: "Axios" },
  { id: "python", label: "Python" },
  { id: "http", label: "HTTP" },
  { id: "curl", label: "cURL" },
];
type Theme = "system" | "light" | "dark";
const initialTheme = (): Theme => {
  try {
    const t = localStorage.getItem("reqnote-theme-v1");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "system";
};
export default function App() {
  const [input, setInput] = useState(examples.json),
    [submitted, setSubmitted] = useState(examples.json),
    [result, setResult] = useState<Conversion | null>(null),
    [target, setTarget] = useState<Target>("fetch"),
    [redact, setRedact] = useState(true),
    [custom, setCustom] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [theme, setTheme] = useState<Theme>(initialTheme);
  const worker = useRef<Worker | null>(null),
    sequence = useRef(0),
    inputRef = useRef<HTMLTextAreaElement>(null),
    inputVersion = useRef(0),
    fileVersion = useRef(0);
  const dirty = input !== submitted,
    copyable = Boolean(result) && !dirty && !busy && !error;
  useEffect(() => {
    const w = new Worker(
      new URL("./workers/convert.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = ({
      data,
    }: MessageEvent<{ id: number; result?: Conversion; error?: string }>) => {
      if (data.id !== sequence.current) return;
      setBusy(false);
      setError(data.error ?? "");
      setResult(data.result ?? null);
      if (data.error) inputRef.current?.focus();
    };
    w.onerror = () => {
      setBusy(false);
      setError("本地处理线程发生错误，请重新打开页面。");
    };
    return () => w.terminate();
  }, []);
  useEffect(() => {
    const id = ++sequence.current;
    setNotice("");
    if (!submitted.trim()) {
      setBusy(false);
      setResult(null);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    worker.current?.postMessage({
      id,
      input: submitted,
      options: {
        target,
        redact,
        customKeys: custom
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean),
      },
    });
  }, [submitted, target, redact, custom]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#171d23" : "#f7f6f2");
    };
    apply();
    try {
      localStorage.setItem("reqnote-theme-v1", theme);
    } catch {}
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const convert = () => {
    if (new TextEncoder().encode(input).length > MAX_BYTES) {
      setError("输入最多 256 KiB，请拆分请求");
      inputRef.current?.focus();
      return;
    }
    if (input === submitted) {
      const id = ++sequence.current;
      setBusy(true);
      setError("");
      worker.current?.postMessage({
        id,
        input,
        options: {
          target,
          redact,
          customKeys: custom
            .split(/[,，]/)
            .map((v) => v.trim())
            .filter(Boolean),
        },
      });
    } else setSubmitted(input);
  };
  const loadExample = (key: ExampleKey) => {
    if (
      input.trim() &&
      !Object.values(examples).includes(input) &&
      !window.confirm("载入示例会替换当前输入，是否继续？")
    )
      return;
    inputVersion.current++;
    setInput(examples[key]);
    setSubmitted(examples[key]);
    setError("");
  };
  const clear = () => {
    sequence.current++;
    inputVersion.current++;
    setInput("");
    setSubmitted("");
    setResult(null);
    setError("");
    setNotice("输入和处理结果已从当前页面清空。");
    setBusy(false);
  };
  const copy = async () => {
    if (!copyable || !result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setNotice("代码已复制。");
    } catch {
      setNotice("无法访问剪贴板，请手动选中代码复制。");
    }
  };
  const download = () => {
    if (!copyable || !result) return;
    const url = URL.createObjectURL(
        new Blob([result.code], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `request${result.redacted ? "-redacted" : ""}.${result.extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("代码已下载。");
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("文件最多 256 KiB。");
      return;
    }
    const current = inputVersion.current,
      fileId = ++fileVersion.current;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (current !== inputVersion.current || fileId !== fileVersion.current)
        return;
      inputVersion.current++;
      setInput(text);
      setNotice("文件已读入；点击“转换请求”继续。");
    } catch {
      setError("文件需为有效的 UTF-8 文本。");
    }
  };
  const byteCount = new TextEncoder().encode(input).length;
  return (
    <>
      <a className="skip" href="#workbench">
        跳到工作台
      </a>
      <header className="topbar" id="top">
        <a className="brand" href="#top">
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            width="36"
            height="36"
            alt=""
          />
          <span>
            ReqNote<small>请求便笺</small>
          </span>
        </a>
        <nav aria-label="站点导航">
          <a href="#workbench">工作台</a>
          <a href="#limits">使用边界</a>
          <a
            href="https://github.com/batype/reqnote"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <div className="header-end">
          <span className="local-badge">
            <i /> 本地转换 · 不发送请求
          </span>
          <label className="sr-only" htmlFor="theme">
            界面主题
          </label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            <option value="system">跟随系统</option>
            <option value="light">亮色模式</option>
            <option value="dark">暗色模式</option>
          </select>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span>DAILY TOOLS / 004</span> LESS COPY. MORE CLARITY.
            </div>
            <h1>
              把 cURL，
              <br />
              写成清楚的<span>请求。</span>
            </h1>
            <p>
              粘贴一条命令，看懂请求结构，生成代码。
              <br className="desktop-break" />
              分享之前，把密钥和凭据留在自己这里。
            </p>
            <div className="hero-tags">
              <span>5 种代码输出</span>
              <span>按规则脱敏</span>
              <span>MIT 开源</span>
            </div>
          </div>
          <div className="hero-note" aria-hidden="true">
            <div className="note-top">
              <span>FROM COMMAND</span>
              <b>↘</b>
            </div>
            <div className="mini-command">
              <em>$</em> curl https://api.example.com
              <br />
              <span> -H 'Authorization: Bearer …'</span>
            </div>
            <div className="note-bottom">
              <div>
                <strong>一条请求，五种表达。</strong>
                <small>浏览器里的小小接口笔记本</small>
              </div>
              <span className="note-symbol">{`{↗}`}</span>
            </div>
          </div>
        </section>
        <section className="privacy-bar">
          <div>
            <span className={"privacy-icon " + (!redact ? "raw" : "")}>
              {redact ? "◉" : "◎"}
            </span>
            <div>
              <strong>
                {redact ? "分享脱敏已开启" : "当前包含原始请求数据"}
              </strong>
              <span>
                {redact
                  ? "识别认证头、Cookie、敏感查询参数与请求体字段。"
                  : "复制与下载将包含原始值，请确认接收方。"}
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={redact}
            aria-label="分享脱敏"
            className={"toggle " + (redact ? "on" : "")}
            onClick={() => setRedact(!redact)}
          >
            <span />
          </button>
        </section>
        <div className="workspace" id="workbench">
          <section className="input-panel" aria-labelledby="input-title">
            <div className="panel-heading">
              <h2 id="input-title">
                <span>01</span> 输入 cURL
              </h2>
              <div className="input-tools">
                <label className="import-file">
                  导入
                  <input
                    type="file"
                    accept=".txt,.curl,.sh,text/*"
                    onChange={(e) => {
                      void importFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="sr-only" htmlFor="example">
                  载入示例
                </label>
                <select
                  id="example"
                  value=""
                  onChange={(e) => loadExample(e.target.value as ExampleKey)}
                >
                  <option value="" disabled>
                    载入示例
                  </option>
                  <option value="json">JSON POST</option>
                  <option value="get">搜索 GET</option>
                  <option value="form">表单 POST</option>
                  <option value="cookie">Cookie 请求</option>
                </select>
              </div>
            </div>
            <label className="sr-only" htmlFor="curl-input">
              cURL 命令
            </label>
            <textarea
              ref={inputRef}
              id="curl-input"
              value={input}
              onChange={(e) => {
                inputVersion.current++;
                setInput(e.target.value);
                setError("");
                setNotice("");
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  convert();
                }
              }}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-invalid={Boolean(error)}
              aria-describedby="input-error"
              placeholder={"curl 'https://api.example.com/users'…"}
            />
            <div className="editor-meta">
              <span>UTF-8 · {(byteCount / 1024).toFixed(1)} KiB / 256 KiB</span>
              <span>⌘ / Ctrl + Enter</span>
            </div>
            <div className="input-actions">
              <button type="button" className="text-button" onClick={clear}>
                清空
              </button>
              <span className="subtle">只在当前页面内存中处理</span>
              <button
                type="button"
                className="primary"
                onClick={convert}
                disabled={busy || !input.trim()}
              >
                {busy ? "转换中…" : "转换请求"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <p id="input-error" role="alert" className="error-message">
              {error}
            </p>
          </section>
          <section className="output-panel" aria-labelledby="output-title">
            <div className="language-tabs" role="group" aria-label="代码语言">
              <h2 id="output-title" className="sr-only">
                生成代码
              </h2>
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={target === t.id}
                  className={target === t.id ? "active" : ""}
                  onClick={() => setTarget(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <span className="output-state">
                {dirty
                  ? "输入已更新"
                  : busy
                    ? "转换中…"
                    : !result
                      ? "等待转换"
                      : result.redacted
                        ? "脱敏预览"
                        : "原始预览"}
              </span>
            </div>
            <div className="terminal-top">
              <div className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <span>request.{result?.extension ?? "js"}</span>
              <span>
                {target === "axios" ? "NODE.JS" : target.toUpperCase()}
              </span>
            </div>
            {result ? (
              <CodeView code={result.code} />
            ) : (
              <div className="empty-output">
                <span aria-hidden="true">{"{ }"}</span>
                <strong>
                  {error ? "修正输入后，再试一次" : "代码将在这里出现"}
                </strong>
                <p>粘贴 cURL，或载入一个示例开始。</p>
              </div>
            )}
            <div className="output-actions">
              <span className={!redact ? "raw-label" : ""}>
                {dirty
                  ? "请重新转换，复制与下载暂不可用"
                  : !result
                    ? "转换后可复制或下载"
                    : result.redacted
                      ? `已替换 ${result.redactedCount} 处敏感值`
                      : "原始数据 · 注意分享范围"}
              </span>
              <div>
                <button type="button" onClick={download} disabled={!copyable}>
                  下载
                </button>
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => void copy()}
                  disabled={!copyable}
                >
                  复制代码 <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </section>
        </div>
        <div className="status-line" role="status" aria-live="polite">
          {notice || (dirty ? "输入已修改，结果仍对应上一次转换。" : "")}
        </div>
        {result?.warnings.length !== undefined &&
          result.warnings.length > 0 && (
            <aside className="warnings" aria-label="转换提示">
              {result.warnings.map((w, i) => (
                <p key={i}>ⓘ {w}</p>
              ))}
            </aside>
          )}
        <details className="redaction-settings">
          <summary>
            脱敏字段设置 <span>＋</span>
          </summary>
          <div>
            <label htmlFor="custom-keys">额外字段名（用逗号分隔）</label>
            <input
              id="custom-keys"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="email, phone, 手机号"
              autoComplete="off"
              spellCheck={false}
            />
            <p>
              默认处理 Authorization、Cookie、token、password、secret、api_key
              等字段。业务字段、URL 路径和无法识别的内容仍需人工核对。
            </p>
          </div>
        </details>
        <Inspector result={result} />
        <section className="how-it-works">
          <article>
            <span>01 / INSPECT</span>
            <h3>先看清，再复制。</h3>
            <p>URL、查询参数、请求头和请求体，整理成可以逐项核对的便笺。</p>
          </article>
          <article>
            <span>02 / TRANSFORM</span>
            <h3>表达不同，核心一致。</h3>
            <p>
              保留请求体原文，包括长整数。转换差异会明确提示，不执行生成代码。
            </p>
          </article>
          <article>
            <span>03 / SHARE</span>
            <h3>分享知识，留住凭据。</h3>
            <p>
              按规则替换敏感值，再复制或导出。只保存主题偏好，没有云端历史。
            </p>
          </article>
        </section>
        <details className="limits" id="limits">
          <summary>
            使用边界与支持的 cURL 选项 <span>↗</span>
          </summary>
          <div>
            <p>
              支持 Bash 单/双引号、反斜杠续行、单个 HTTP(S)
              URL、GET/POST/自定义方法、请求头、JSON/表单文本、Basic
              Auth、Cookie 和重定向标记。
            </p>
            <p>
              <code>
                -X -H -d -G -I -L -u -b -A -e --url --json --data-raw
                --data-binary --data-urlencode --url-query --compressed
              </code>
            </p>
            <p>
              不读取文件，不发送请求，不执行 shell。暂不支持 ANSI-C
              引号、PowerShell/cmd、变量替换、管道、multipart、文件上传、多请求及所有
              cURL 选项；不支持的输入会报错。Axios 代码面向
              Node.js。脱敏是规则匹配，分享前请检查 URL 路径和其他业务信息。
            </p>
          </div>
        </details>
        <footer>
          <span>
            ReqNote · 每天一个开源小工具 <b>NO. 004</b>
          </span>
          <div>
            <a
              href="https://github.com/batype/reqnote"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <a
              href="https://github.com/batype/reqnote/issues"
              target="_blank"
              rel="noreferrer"
            >
              反馈与建议 ↗
            </a>
            <span>MIT © 2026 batype</span>
          </div>
        </footer>
      </main>
    </>
  );
}
