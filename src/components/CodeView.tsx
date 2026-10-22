function pieces(line: string) {
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|await|import|from|True|False|true|false|None)\b)/g;
  return line.split(pattern).map((value, index) => <span key={index} className={/^["']/.test(value) ? 'syntax-string' : /^(const|await|import|from|True|False|true|false|None)$/.test(value) ? 'syntax-keyword' : undefined}>{value}</span>);
}
export function CodeView({code}: {code: string}) {
  return <div className="code-view" role="region" aria-label="生成代码" tabIndex={0}><pre><code>{code.trimEnd().split('\n').map((line,index) => <span className="code-line" key={index}><span className="line-number" aria-hidden="true">{index+1}</span><span>{pieces(line)}{'\n'}</span></span>)}</code></pre></div>;
}
