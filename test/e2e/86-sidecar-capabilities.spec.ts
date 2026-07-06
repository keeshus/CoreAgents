import { test, expect } from '@playwright/test';
import { uniqueFlowName } from './helpers/api';
import { getAuthCookie } from './helpers/auth';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001/api';
const cookie = getAuthCookie() || undefined;

function makeFlow(name, code, inputFields) {
  return {
    name,
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Trigger', type: 'trigger', config: { triggerType: 'manual' } } },
      { id: 'c1', type: 'code', position: { x: 300, y: 0 }, data: { label: 'Node', type: 'code', config: { code } } },
      { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'Output', type: 'output', config: { inputFields } } },
    ],
    edges: [
      { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
      { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
    ],
  };
}

test.describe('Sidecar real-world capabilities', () => {
  const cleanupFlowIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of cleanupFlowIds) {
      await request.delete(`${API_URL}/flows/${id}`).catch(() => {});
    }
    cleanupFlowIds.length = 0;
  });

  test('git clone public repo', async ({ request }) => {
    const code = ['var cp = require("child_process"); var result = {};',
      'try {',
      '  var r = cp.execSync("cd $HOME && rm -rf CoreTemplate && git clone https://github.com/keeshus/CoreTemplate.git 2>&1", { encoding: "utf-8", timeout: 30000 });',
      '  var ls = cp.execSync("cd $HOME/CoreTemplate && ls -la", { encoding: "utf-8", timeout: 5000 });',
      '  result.ok = true; result.out = r; result.files = ls;',
      '} catch(e) {',
      '  result.ok = false; result.msg = e.message.substring(0, 500);',
      '  if (e.stdout) result.stdout = e.stdout.substring(0, 500);',
      '  if (e.stderr) result.stderr = e.stderr.substring(0, 500);',
      '}',
      'return result;'
    ].join('\n');
    const flow = makeFlow(uniqueFlowName('Git-Clone'), code, []);
    const res = await request.post(API_URL + '/flows', { data: flow }).then(r => r.json());
    cleanupFlowIds.push(res.id);
    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(res.id, {}, cookie);
    const c = events.find(e => e.type === 'execution.completed');
    expect(c).toBeDefined();
    var o = c.data.output;
    var r = (o.c1 || o.node || {});
    expect(r.ok).toBe(true);
    expect(r.files).toContain('README.md');
    expect(r.files).toContain('package.json');
  });

  test('edit file and run with node', async ({ request }) => {
    const code = ['var cp = require("child_process");',
      'var cmd = "cd $HOME && mkdir -p project && echo \\"console.log(42)\\" > project/test.js && node project/test.js";',
      'var r = cp.execSync(cmd, { encoding: "utf-8", timeout: 15000 });',
      'return { stdout: r };'
    ].join('\n');
    const flow = makeFlow(uniqueFlowName('Edit-Run'), code, ['node.stdout']);
    const res = await request.post(API_URL + '/flows', { data: flow }).then(r => r.json());
    cleanupFlowIds.push(res.id);
    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(res.id, {}, cookie);
    const c = events.find(e => e.type === 'execution.completed');
    expect(c).toBeDefined();
    var o = c.data.output;
    var t = (o.c1 || o.node || {}).stdout || '';
    expect(t).toContain('42');
  });

  test('npm install on cloned repo', async ({ request }) => {
    const code = ['var cp = require("child_process");',
      'cp.execSync("cd $HOME && rm -rf CoreTemplate && git clone https://github.com/keeshus/CoreTemplate.git 2>&1", { encoding: "utf-8", timeout: 30000 });',
      'cp.execSync("cd $HOME/CoreTemplate && npm install 2>&1", { encoding: "utf-8", timeout: 120000 });',
      'var r = cp.execSync("cd $HOME/CoreTemplate && ls package.json node_modules/.package-lock.json 2>&1", { encoding: "utf-8", timeout: 5000 });',
      'return { stdout: r };'
    ].join('\n');
    const flow = makeFlow(uniqueFlowName('Npm-Clone'), code, ['node.stdout']);
    const res = await request.post(API_URL + '/flows', { data: flow }).then(r => r.json());
    cleanupFlowIds.push(res.id);
    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(res.id, {}, cookie);
    const c = events.find(e => e.type === 'execution.completed');
    expect(c).toBeDefined();
    var o = c.data.output;
    var t = (o.c1 || o.node || {}).stdout || '';
    expect(t).toContain('package.json');
    expect(t).toContain('node_modules');
  });

  test('full project workflow clone build check', async ({ request }) => {
    const code = ['var cp = require("child_process"); var steps = [];',
      'try { cp.execSync("cd $HOME && rm -rf CoreTemplate && git clone https://github.com/keeshus/CoreTemplate.git 2>&1", { encoding: "utf-8", timeout: 30000 }); steps.push("clone:OK"); } catch(e) { steps.push("clone:" + e.message.slice(0,50)); }',
      'try { cp.execSync("cd $HOME/CoreTemplate && npm install 2>&1", { encoding: "utf-8", timeout: 120000 }); steps.push("npm:OK"); } catch(e) { steps.push("npm:" + e.message.slice(0,50)); }',
      'try { var f = cp.execSync("ls package.json README.md index.js", { cwd: process.env.HOME + "/CoreTemplate", encoding: "utf-8", timeout: 5000 }); steps.push("files:" + f.trim().replace(/\\n/g, ",")); } catch(e) { steps.push("files:" + e.message.slice(0,50)); }',
      'return { steps: steps.join(" | ") };'
    ].join('\n');
    const flow = makeFlow(uniqueFlowName('Full-Workflow'), code, ['node.steps']);
    const res = await request.post(API_URL + '/flows', { data: flow }).then(r => r.json());
    cleanupFlowIds.push(res.id);
    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(res.id, {}, cookie);
    const c = events.find(e => e.type === 'execution.completed');
    expect(c).toBeDefined();
    var o = c.data.output;
    var t = (o.c1 || o.node || {}).steps || '';
    expect(t).toContain('clone:OK');
    expect(t).toContain('npm:OK');
    expect(t).toContain('package.json');
    expect(t).toContain('README.md');
    expect(t).toContain('index.js');
  });

  test('python3 available', async ({ request }) => {
    const code = 'var cp = require("child_process"); var r = cp.execSync("python3 --version 2>&1", { encoding: "utf-8", timeout: 10000 }); return { stdout: r };';
    const flow = makeFlow(uniqueFlowName('Python'), code, ['node.stdout']);
    const res = await request.post(API_URL + '/flows', { data: flow }).then(r => r.json());
    cleanupFlowIds.push(res.id);
    const { debugExecute } = await import('./helpers/stream');
    const events = await debugExecute(res.id, {}, cookie);
    const c = events.find(e => e.type === 'execution.completed');
    expect(c).toBeDefined();
    var o = c.data.output;
    var t = (o.c1 || o.node || {}).stdout || '';
    expect(t).toContain('Python 3');
  });

  test('files isolated between executions', async ({ request }) => {
    const code = ['var cp = require("child_process");',
      'var id = cp.execSync("echo $RANDOM-$RANDOM", { encoding: "utf-8", timeout: 5000 }).trim();',
      'return { wid: id };'
    ].join('\n');
    const flow1 = makeFlow(uniqueFlowName('Isolation-1'), code, []);
    const f1 = await request.post(API_URL + '/flows', { data: flow1 }).then(r => r.json());
    cleanupFlowIds.push(f1.id);
    const { debugExecute } = await import('./helpers/stream');
    const ev1 = await debugExecute(f1.id, {}, cookie);
    const cc1 = ev1.find(e => e.type === 'execution.completed');
    var o1 = cc1.data.output;
    var id1 = (o1.c1 || o1.node || {}).wid || '';

    const flow2 = makeFlow(uniqueFlowName('Isolation-2'), code, []);
    const f2 = await request.post(API_URL + '/flows', { data: flow2 }).then(r => r.json());
    cleanupFlowIds.push(f2.id);
    const ev2 = await debugExecute(f2.id, {}, cookie);
    const cc2 = ev2.find(e => e.type === 'execution.completed');
    var o2 = cc2.data.output;
    var id2 = (o2.c1 || o2.node || {}).wid || '';

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});
