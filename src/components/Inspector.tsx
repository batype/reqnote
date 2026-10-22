import { useState } from "react";
import type { Conversion } from "../core/index";
export function Inspector({ result }: { result: Conversion | null }) {
  const [tab, setTab] = useState<"query" | "headers" | "body">("headers");
  if (!result) return null;
  const request = result.request,
    url = new URL(request.url),
    query = [...url.searchParams.entries()];
  return (
    <section className="inspector" aria-labelledby="inspector-title">
      <div className="inspector-heading">
        <h2 id="inspector-title">
          <span>02</span> 请求速览
        </h2>
        <span className="subtle">
          与代码使用相同的{result.redacted ? "脱敏" : "原始数据"}设置
        </span>
      </div>
      <div className="request-line">
        <span className={"method method-" + request.method.toUpperCase()}>
          {request.method}
        </span>
        <span className="url-text">
          {url.origin}
          {url.pathname}
        </span>
        <span className="request-tag">
          {request.followRedirects ? "跟随重定向" : "不跟随重定向"}
        </span>
      </div>
      <div className="inspector-tabs" role="group" aria-label="请求详情">
        <button
          type="button"
          aria-pressed={tab === "headers"}
          onClick={() => setTab("headers")}
        >
          请求头 <b>{request.headers.length}</b>
        </button>
        <button
          type="button"
          aria-pressed={tab === "query"}
          onClick={() => setTab("query")}
        >
          查询参数 <b>{query.length}</b>
        </button>
        <button
          type="button"
          aria-pressed={tab === "body"}
          onClick={() => setTab("body")}
        >
          请求体 <b>{request.bodyKind.toUpperCase()}</b>
        </button>
      </div>
      {tab === "body" ? (
        <pre className="body-preview">
          {request.body ?? "此请求没有请求体。"}
        </pre>
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              {tab === "headers" ? "请求头" : "查询参数"}
            </caption>
            <thead>
              <tr>
                <th scope="col">NAME</th>
                <th scope="col">VALUE</th>
              </tr>
            </thead>
            <tbody>
              {(tab === "headers"
                ? request.headers.map((h) => [h.name, h.value])
                : query
              ).map(([name, value], i) => (
                <tr key={i}>
                  <td>{name}</td>
                  <td>
                    <span
                      className={value.includes("REDACTED") ? "masked" : ""}
                    >
                      {value}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(tab === "headers" ? request.headers.length : query.length) ===
            0 && (
            <p className="empty-row">
              没有{tab === "headers" ? "显式请求头" : "查询参数"}。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
