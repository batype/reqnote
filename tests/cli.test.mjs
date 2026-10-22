import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,stat,symlink,link,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const cli=new URL('../bin/reqnote.mjs',import.meta.url).pathname;
const command="curl 'https://example.com?token=private-token' --json '{\"password\":\"private-password\",\"id\":1234567890123456789}'";
const run=(args=[],input=command)=>spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8'});
test('CLI uses redaction by default and original values only with --raw',()=>{
 const a=run(['--to','python']);assert.equal(a.status,0);assert.equal(a.stdout.includes('private-password'),false);assert.match(a.stdout,/1234567890123456789/);
 const b=run(['--raw','--json']);assert.equal(b.status,0);assert.equal(JSON.parse(b.stdout).request.body.includes('private-password'),true);
 assert.equal(run([],"curl 'private-invalid-url'").stderr.includes('private-invalid-url'),false);assert.equal(run(['--unexpected']).status,1);
});
test('CLI protects input, existing output, symlinks and hardlinks; new output is 0600',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'reqnote-test-'));try{
  const input=path.join(dir,'in.curl'),output=path.join(dir,'out.js'),symbolic=path.join(dir,'symbolic'),hard=path.join(dir,'hard');await writeFile(input,command);
  assert.equal(run(['--in',input,'--out',output]).status,0);assert.equal((await stat(output)).mode&0o777,0o600);
  assert.equal(run(['--in',input,'--out',output]).status,1);assert.equal(run(['--in',input,'--out',input]).status,1);
  await symlink(input,symbolic);await link(input,hard);assert.equal(run(['--in',input,'--out',symbolic]).status,1);assert.equal(run(['--in',input,'--out',hard]).status,1);assert.equal(await readFile(input,'utf8'),command);
 }finally{await rm(dir,{recursive:true});}
});
