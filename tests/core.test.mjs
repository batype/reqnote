import test from "node:test";
import assert from "node:assert/strict";
import {
  convertCurl,
  parseCurl,
  tokenizeCurl,
  MAX_BYTES,
} from "../lib/core/index.js";

test("Bash quoting, apostrophes, escaped characters and CRLF continuations", () => {
  assert.deepEqual(
    tokenizeCurl(
      `curl 'https://example.com' -H "X-Note: hello world" --data-raw 'it'\\''s literal $HOME; $(id)'`,
    ),
    [
      "curl",
      "https://example.com",
      "-H",
      "X-Note: hello world",
      "--data-raw",
      "it's literal $HOME; $(id)",
    ],
  );
  assert.equal(
    parseCurl("\n curl 'https://example.com' \\\r\n -H 'Accept: text/plain' \n")
      .request.headers[0].value,
    "text/plain",
  );
});
test("rejects execution syntax, files, unknown flags, multiple requests and malformed quoting", () => {
  for (const input of [
    "curl 'https://example.com' | cat",
    "curl $ENDPOINT",
    "curl $'https://example.com'",
    "curl `whoami`",
    "curl 'https://example.com' --data @private.json",
    "curl 'https://example.com' --form file=@secret",
    "curl 'https://example.com' --unknown secret",
    "curl 'https://example.com' 'https://other.example'",
    "curl 'https://example.com",
    "curl 'https://example.com'\n curl 'https://other.example'",
    "curl 'file:///etc/passwd'",
  ]) {
    assert.throws(() => convertCurl(input), undefined, input);
  }
});
test("single HTTP request method, short options and empty body semantics", () => {
  const r = parseCurl(
    "curl -sSLXPOST -H'X-Name: demo' --data-raw '' 'https://example.com/path'",
  ).request;
  assert.equal(r.method, "POST");
  assert.equal(r.body, "");
  assert.equal(r.followRedirects, true);
  assert.equal(r.headers[0].value, "demo");
  assert.equal(
    parseCurl("curl --head 'https://example.com'").request.method,
    "HEAD",
  );
  assert.equal(
    parseCurl("curl 'https://example.com' --request DELETE").request.method,
    "DELETE",
  );
});
test("URL encoding, query append and duplicate form values follow documented curl conventions", () => {
  const r = parseCurl(
    "curl --get 'https://example.com?q=old' --data-urlencode 'q=你好 + x' --data-urlencode 'tag=a' --data-urlencode 'tag=b'",
  ).request;
  const url = new URL(r.url);
  assert.deepEqual(url.searchParams.getAll("q"), ["old", "你好 + x"]);
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(r.body, null);
  assert.equal(r.method, "GET");
  assert.equal(
    parseCurl("curl 'https://example.com' -d a=1 -d b=2").request.body,
    "a=1&b=2",
  );
  assert.equal(
    parseCurl("curl 'https://example.com' --json '{\"id\":' --json '1}'")
      .request.body,
    '{"id":1}',
  );
});
test("explicit header defaults, suppression and empty-header syntax are respected", () => {
  const a = parseCurl(
    "curl 'https://example.com' --json '{}' -H 'Content-Type: text/custom'",
  ).request;
  assert.equal(
    a.headers.filter((h) => h.name.toLowerCase() === "content-type").length,
    1,
  );
  assert.equal(a.headers[0].value, "text/custom");
  const b = parseCurl(
    "curl 'https://example.com' -d x -H 'Content-Type:'",
  ).request;
  assert.equal(
    b.headers.some((h) => h.name.toLowerCase() === "content-type"),
    false,
  );
  const c = parseCurl(
    "curl 'https://example.com' -d x -H 'Content-Type;'",
  ).request;
  assert.equal(
    c.headers.filter((h) => h.name.toLowerCase() === "content-type").length,
    1,
  );
  assert.equal(c.headers[0].value, "");
});
test("Basic Auth and URL credentials become headers, never URL userinfo", () => {
  for (const curl of [
    "curl 'https://alice:demo-password@example.com/path'",
    "curl 'https://example.com/path' -u 'alice:demo-password'",
  ]) {
    const r = parseCurl(curl).request;
    assert.equal(new URL(r.url).username, "");
    assert.equal(
      r.headers.find((h) => h.name === "Authorization").value,
      "Basic " + Buffer.from("alice:demo-password").toString("base64"),
    );
    const safe = JSON.stringify(convertCurl(curl));
    assert.equal(safe.includes("demo-password"), false);
    assert.equal(
      safe.includes(Buffer.from("alice:demo-password").toString("base64")),
      false,
    );
  }
});
test("redaction covers headers, repeated query keys and nested JSON without exposing originals", () => {
  const body =
    '{"trace":1234567890123456789,"password":"body-secret","nested":[{"api_token":"nested-secret"}],"email":"private-email","手机号":"private-phone"}';
  const input = `curl 'https://example.com?token=query-secret&token=query-secret-2' -H 'Authorization: Bearer header-secret' -b 'session=cookie-secret' --json '${body}'`;
  for (const target of ["fetch", "axios", "python", "http", "curl"]) {
    const r = convertCurl(input, { target, customKeys: ["email", "手机号"] });
    const serialized = JSON.stringify(r);
    for (const secret of [
      "query-secret",
      "query-secret-2",
      "header-secret",
      "cookie-secret",
      "body-secret",
      "nested-secret",
      "private-email",
      "private-phone",
    ])
      assert.equal(serialized.includes(secret), false, secret);
    assert.match(r.request.body, /1234567890123456789/);
    assert.equal(r.redactedCount, 8);
  }
});
test("original mode preserves exact JSON numeric and string text", () => {
  const body =
    '{"large":1234567890123456789,"decimal":1.2300,"password":"keep-me","literal":"\\u4f60"}';
  const r = convertCurl(`curl 'https://example.com' --json '${body}'`, {
    redact: false,
  });
  assert.equal(r.request.body, body);
  assert.equal(r.redactedCount, 0);
  assert.equal(r.redacted, false);
});
test("form redaction preserves repeated public fields and removes stale Content-Length", () => {
  const r = convertCurl(
    "curl 'https://example.com' -H 'Content-Length: 44' -d 'tag=one&password=form-secret&tag=two'",
    { target: "http" },
  );
  assert.equal(r.code.includes("form-secret"), false);
  assert.deepEqual(new URLSearchParams(r.request.body).getAll("tag"), [
    "one",
    "two",
  ]);
  assert.equal(
    r.request.headers.some((h) => h.name.toLowerCase() === "content-length"),
    false,
  );
});
test("unstructured bodies are entirely replaced in sharing mode", () => {
  const r = convertCurl(
    "curl 'https://example.com' -H 'Content-Type: text/plain' --data-raw 'unknown-private-content'",
    { target: "http" },
  );
  assert.equal(r.request.body, "<REDACTED>");
  assert.equal(r.code.includes("unknown-private-content"), false);
  assert.ok(r.warnings.length);
});
test("Fetch omits browser-managed headers and rejects GET bodies explicitly", () => {
  const r = convertCurl(
    "curl 'https://example.com' -b 'session=secret' -H 'Host: example.com'",
    { redact: false },
  );
  assert.equal(r.code.includes("session=secret"), false);
  assert.ok(r.warnings.some((w) => w.includes("Fetch")));
  assert.throws(
    () => convertCurl("curl 'https://example.com' -X GET -d 'x=1'"),
    /GET \/ HEAD/,
  );
  assert.doesNotThrow(() =>
    convertCurl("curl 'https://example.com' -X GET -d 'x=1'", {
      target: "http",
    }),
  );
});
test("generated Fetch code actually sends the modeled values to a stub, not a network", async () => {
  const input = `curl 'https://example.com?q=hello' -H 'Content-Type: application/json' --data-raw '{"id":1234567890123456789,"text":"literal $(id) and \\"quoted\\""}'`;
  const r = convertCurl(input, { redact: false });
  let captured;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("fetch", "console", r.code)(
    async (url, options) => {
      captured = { url, options };
      return { status: 200, text: async () => "" };
    },
    { log() {} },
  );
  assert.equal(captured.options.body, r.request.body);
  assert.equal(captured.url, r.request.url);
  assert.equal(captured.options.redirect, "manual");
});
test("generated cURL can be parsed again without changing modeled request values", () => {
  const body = "an apostrophe: it's literal $HOME & safe";
  const source =
    "curl 'https://example.com' --data-raw '" +
    body.replace(/'/g, "'\\''") +
    "'";
  const r = convertCurl(source, { target: "curl", redact: false }),
    parsed = parseCurl(r.code).request;
  assert.equal(parsed.body, body);
  assert.equal(parsed.method, r.request.method);
  assert.equal(parsed.url, r.request.url);
});
test("duplicate headers remain visible and dictionary targets disclose merging", () => {
  const input = "curl 'https://example.com' -H 'X-Tag: one' -H 'X-Tag: two'";
  assert.equal(
    convertCurl(input, { target: "http" }).request.headers.length,
    2,
  );
  const py = convertCurl(input, { target: "python" });
  assert.ok(py.warnings.some((w) => w.includes("重复")));
  assert.match(py.code, /one, two/);
});
test("bounds and error messages do not echo payloads", () => {
  assert.throws(() => convertCurl("curl " + "a".repeat(MAX_BYTES)), /256 KiB/);
  try {
    convertCurl("curl 'secret-invalid-url'");
    assert.fail();
  } catch (e) {
    assert.equal(e.message.includes("secret-invalid-url"), false);
  }
  assert.throws(
    () =>
      convertCurl("curl 'https://example.com'", {
        customKeys: ["x".repeat(81)],
      }),
    /80/,
  );
});
