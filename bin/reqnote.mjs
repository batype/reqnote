#!/usr/bin/env node
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {convertCurl,MAX_BYTES,VERSION} from '../lib/core/index.js';
const help=`ReqNote ${VERSION} — local cURL inspector and code generator

Usage: reqnote [--in request.curl] [--to fetch|axios|python|http|curl]
               [--out request.js] [--raw] [--json] [--redact-key email]

Reads UTF-8 cURL from a file or stdin. Redaction is ON by default.
--raw includes original values; --json returns metadata as well as code.
--out creates a 0600 file and never overwrites existing files or links.
Never put a real cURL command, password or token in CLI arguments.
This tool does not execute cURL, read @files or send HTTP requests.
`;
try{
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--version'){console.log(VERSION);process.exit(0);}if(args.includes('--help')||!args.length&&process.stdin.isTTY){console.log(help);process.exit(0);}
 let inputFile,outputFile,target='fetch',redact=true,json=false;const customKeys=[];
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(flag==='--raw'){redact=false;continue;}if(flag==='--json'){json=true;continue;}
  if(!['--in','--out','--to','--redact-key'].includes(flag)||args[i+1]===undefined||args[i+1].startsWith('--'))throw Error('参数无效或缺少值；cURL 原文请通过 --in 或 stdin 提供，使用 --help 查看用法');
  const value=args[++i];if(flag==='--in'){if(inputFile)throw Error('--in 重复');inputFile=value;}else if(flag==='--out'){if(outputFile)throw Error('--out 重复');outputFile=value;}else if(flag==='--to')target=value;else customKeys.push(value);
 }
 let buffer;
 if(inputFile){const handle=await open(inputFile,'r');try{const info=await handle.stat();if(!info.isFile()||info.size>MAX_BYTES)throw Error('输入需为不超过 256 KiB 的普通文件');buffer=await handle.readFile();}finally{await handle.close();}}
 else{const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>MAX_BYTES)throw Error('输入最多 256 KiB');chunks.push(chunk);}buffer=Buffer.concat(chunks);}
 if(buffer.length>MAX_BYTES)throw Error('输入最多 256 KiB');let input;try{input=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{throw Error('输入必须是有效 UTF-8 文本');}
 const result=convertCurl(input,{target,redact,customKeys}),output=json?JSON.stringify(result,null,2)+'\n':result.code;
 if(!outputFile)process.stdout.write(output);else{const handle=await open(outputFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await handle.writeFile(output);}finally{await handle.close();}}
}catch(error){console.error('ReqNote: '+(error.code==='EEXIST'?'输出已存在，不覆盖文件、符号链接或硬链接；请选择新路径':error.message));process.exitCode=1;}
