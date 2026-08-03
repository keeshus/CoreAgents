# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 90-node-types.spec.ts >> All node types >> delay node with future delay pauses and resumes to completion
- Location: test/e2e/90-node-types.spec.ts:909:3

# Error details

```
Error: expect(received).toBeDefined()

Received: undefined
```

# Test source

```ts
  842  |     const res = await createFlow(request, {
  843  |       name,
  844  |       nodes: [
  845  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  846  |         { id: 'h1', type: 'http', position: { x: 300, y: 0 }, data: { label: 'Fetch', type: 'http', config: { method: 'GET', url: `${MOCK_CYBERARK_INTERNAL}/api/secrets/dev/variable/prod%2Fdb%2Fpassword`, headers: '{"Authorization":"Token token=\\"{{env.CYB_TOKEN}}\\""}', timeout: 5000 } } },
  847  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: ['Fetch.status', 'Fetch.body'] } } },
  848  |       ],
  849  |       edges: [
  850  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'h1', targetHandle: 'input-0' },
  851  |         { id: 'e2', source: 'h1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  852  |       ],
  853  |     });
  854  |     const flow = await res.json();
  855  |     // sandboxEnv is populated from the input's __env map
  856  |     const events = await debugExecute(flow.id, { __env: { CYB_TOKEN: token } }, cookie);
  857  |     const completed = events.find(e => e.type === 'execution.completed');
  858  |     expect(completed).toBeDefined();
  859  |     const fetchStep = completed!.data?.output?.h1;
  860  |     expect(fetchStep?.status).toBe(200);
  861  |     expect(fetchStep?.body).toBe('sup3r-s3cr3t-db-pass!');
  862  |     await deleteFlow(request, flow.id);
  863  |   });
  864  | 
  865  |   // ── Delay: edge cases ───────────────────────────────────────
  866  | 
  867  |   test('delay node with ISO 8601 duration', async ({ request }) => {
  868  |     const name = uniqueFlowName('DelayDurTest');
  869  |     const res = await createFlow(request, {
  870  |       name,
  871  |       nodes: [
  872  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  873  |         { id: 'd1', type: 'delay', position: { x: 300, y: 0 }, data: { label: 'D', type: 'delay', config: { type: 'duration', duration: 'PT0S' } } },
  874  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  875  |       ],
  876  |       edges: [
  877  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'd1', targetHandle: 'input-0' },
  878  |         { id: 'e2', source: 'd1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  879  |       ],
  880  |     });
  881  |     const flow = await res.json();
  882  |     const events = await debugExecute(flow.id, {}, cookie);
  883  |     const completed = events.find(e => e.type === 'execution.completed');
  884  |     expect(completed).toBeDefined();
  885  |     await deleteFlow(request, flow.id);
  886  |   });
  887  | 
  888  |   test('delay node with past timestamp passes through', async ({ request }) => {
  889  |     const name = uniqueFlowName('DelayTsTest');
  890  |     const res = await createFlow(request, {
  891  |       name,
  892  |       nodes: [
  893  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  894  |         { id: 'd1', type: 'delay', position: { x: 300, y: 0 }, data: { label: 'D', type: 'delay', config: { type: 'timestamp', timestamp: '2020-01-01T00:00:00Z' } } },
  895  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  896  |       ],
  897  |       edges: [
  898  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'd1', targetHandle: 'input-0' },
  899  |         { id: 'e2', source: 'd1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  900  |       ],
  901  |     });
  902  |     const flow = await res.json();
  903  |     const events = await debugExecute(flow.id, {}, cookie);
  904  |     const completed = events.find(e => e.type === 'execution.completed');
  905  |     expect(completed).toBeDefined();
  906  |     await deleteFlow(request, flow.id);
  907  |   });
  908  | 
  909  |   test('delay node with future delay pauses and resumes to completion', async ({ request }) => {
  910  |     const name = uniqueFlowName('DelayFutureTsTest');
  911  |     const res = await createFlow(request, {
  912  |       name,
  913  |       nodes: [
  914  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  915  |         { id: 'd1', type: 'delay', position: { x: 300, y: 0 }, data: { label: 'D', type: 'delay', config: { type: 'fixed', seconds: 3 } } },
  916  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  917  |       ],
  918  |       edges: [
  919  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'd1', targetHandle: 'input-0' },
  920  |         { id: 'e2', source: 'd1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  921  |       ],
  922  |     });
  923  |     const flow = await res.json();
  924  | 
  925  |     const { readSSE, pollExecution } = await import('./helpers/stream');
  926  |     const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  927  |     if (cookie) headers['Cookie'] = cookie;
  928  |     const runRes = await fetch(`${API_URL}/flows/${flow.id}/execute`, {
  929  |       method: 'POST',
  930  |       headers,
  931  |       body: JSON.stringify({ input: {}, _debug: false }),
  932  |     });
  933  |     expect(runRes.ok).toBe(true);
  934  |     const events = await readSSE(runRes);
  935  |     const started = events.find(e => e.type === 'execution.started');
  936  |     expect(started).toBeDefined();
  937  |     const executionId = started?.executionId as string;
  938  |     expect(executionId).toBeTruthy();
  939  | 
  940  |     // The delay pauses the execution and schedules a delayed resume (~3s)
  941  |     const paused = events.find(e => e.type === 'execution.paused');
> 942  |     expect(paused).toBeDefined();
       |                    ^ Error: expect(received).toBeDefined()
  943  |     expect(paused?.data?.delayMs).toBeGreaterThanOrEqual(2500);
  944  | 
  945  |     const start = Date.now();
  946  |     const exec = await pollExecution(request, executionId, 30000);
  947  |     const elapsed = Date.now() - start;
  948  |     expect(exec.status).toBe('completed');
  949  |     expect(elapsed).toBeGreaterThanOrEqual(2500);
  950  |     expect(JSON.stringify(exec.output)).toContain('delayed');
  951  |     await deleteFlow(request, flow.id);
  952  |   });
  953  | 
  954  |   // ── AI Action: error cases ──────────────────────────────────
  955  | 
  956  |   test('ai-action node fails when endpointId is missing', async ({ request }) => {
  957  |     const name = uniqueFlowName('AIActionNoEp');
  958  |     const res = await createFlow(request, {
  959  |       name,
  960  |       nodes: [
  961  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  962  |         { id: 'a1', type: 'ai-action', position: { x: 300, y: 0 }, data: { label: 'AI', type: 'ai-action', config: { endpointId: '', model: 'mock', prompt: 'test' } } },
  963  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  964  |       ],
  965  |       edges: [
  966  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'a1', targetHandle: 'input-0' },
  967  |         { id: 'e2', source: 'a1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  968  |       ],
  969  |     });
  970  |     const flow = await res.json();
  971  |     const events = await debugExecute(flow.id, {}, cookie);
  972  |     const failed = events.find(e => e.type === 'execution.failed');
  973  |     expect(failed).toBeDefined();
  974  |     expect(failed!.data?.error).toContain('endpointId is required');
  975  |     await deleteFlow(request, flow.id);
  976  |   });
  977  | 
  978  |   test('ai-action node fails when prompt is missing', async ({ request }) => {
  979  |     const name = uniqueFlowName('AIActionNoPrompt');
  980  |     const res = await createFlow(request, {
  981  |       name,
  982  |       nodes: [
  983  |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  984  |         { id: 'a1', type: 'ai-action', position: { x: 300, y: 0 }, data: { label: 'AI', type: 'ai-action', config: { endpointId: 'ep-1', model: 'mock', prompt: '' } } },
  985  |         { id: 'o1', type: 'output', position: { x: 600, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  986  |       ],
  987  |       edges: [
  988  |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'a1', targetHandle: 'input-0' },
  989  |         { id: 'e2', source: 'a1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  990  |       ],
  991  |     });
  992  |     const flow = await res.json();
  993  |     const events = await debugExecute(flow.id, {}, cookie);
  994  |     const failed = events.find(e => e.type === 'execution.failed');
  995  |     expect(failed).toBeDefined();
  996  |     expect(failed!.data?.error).toContain('prompt is required');
  997  |     await deleteFlow(request, flow.id);
  998  |   });
  999  | 
  1000 |   // ── Multi-node advanced flow ─────────────────────────────────
  1001 | 
  1002 |   test('advanced: trigger → code → map → loop → output', async ({ request }) => {
  1003 |     const name = uniqueFlowName('AdvMultiNode');
  1004 |     const res = await createFlow(request, {
  1005 |       name,
  1006 |       nodes: [
  1007 |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  1008 |         { id: 'c1', type: 'code', position: { x: 250, y: 0 }, data: { label: 'Prep', type: 'code', config: { code: 'const vals = [1, 2, 3]; return { numbers: vals.map(n => ({ original: n })) };' } } },
  1009 |         { id: 'm1', type: 'map', position: { x: 500, y: 0 }, data: { label: 'Mapper', type: 'map', config: { fields: [{ name: 'transformed', type: 'object', value: 'prep.numbers' }], mode: 'replace' } } },
  1010 |         { id: 'l1', type: 'loop', position: { x: 750, y: 0 }, data: { label: 'Looper', type: 'loop', config: { itemsField: 'mapper.transformed', itemVariable: 'item', subNodes: [{ id: 's1', type: 'code', position: { x: 0, y: 0 }, data: { label: 'D', type: 'code', config: { code: 'return { result: input.item.original * 10 };' } } }], subEdges: [], collectResults: true } } },
  1011 |         { id: 'o1', type: 'output', position: { x: 1000, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  1012 |       ],
  1013 |       edges: [
  1014 |         { id: 'e1', source: 't1', sourceHandle: 'output-0', target: 'c1', targetHandle: 'input-0' },
  1015 |         { id: 'e2', source: 'c1', sourceHandle: 'output-0', target: 'm1', targetHandle: 'input-0' },
  1016 |         { id: 'e3', source: 'm1', sourceHandle: 'output-0', target: 'l1', targetHandle: 'input-0' },
  1017 |         { id: 'e4', source: 'l1', sourceHandle: 'output-0', target: 'o1', targetHandle: 'input-0' },
  1018 |       ],
  1019 |     });
  1020 |     const flow = await res.json();
  1021 |     const events = await debugExecute(flow.id, { message: 'start' }, cookie);
  1022 |     const completed = events.find(e => e.type === 'execution.completed');
  1023 |     expect(completed).toBeDefined();
  1024 |     // Verify the full pipeline: code → map → loop
  1025 |     expect(completed!.data?.output?.c1?.numbers).toHaveLength(3);
  1026 |     expect(completed!.data?.output?.m1?.transformed).toHaveLength(3);
  1027 |     expect(completed!.data?.output?.l1?.count).toBe(3);
  1028 |     expect(completed!.data?.output?.l1?.results[0]?.s1?.result).toBe(10);
  1029 |     expect(completed!.data?.output?.l1?.results[2]?.s1?.result).toBe(30);
  1030 |     await deleteFlow(request, flow.id);
  1031 |   });
  1032 | 
  1033 |   test('advanced: trigger → http → map → output', async ({ request }) => {
  1034 |     const name = uniqueFlowName('AdvHttpMap');
  1035 |     const res = await createFlow(request, {
  1036 |       name,
  1037 |       nodes: [
  1038 |         { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'T', type: 'trigger', config: { triggerType: 'manual' } } },
  1039 |         { id: 'h1', type: 'http', position: { x: 250, y: 0 }, data: { label: 'Fetcher', type: 'http', config: { method: 'GET', url: 'http://backend-e2e:3001/api/health', timeout: 5000 } } },
  1040 |         { id: 'm1', type: 'map', position: { x: 500, y: 0 }, data: { label: 'Mapper', type: 'map', config: { fields: [{ name: 'httpStatus', type: 'number', value: 'fetcher.status' }, { name: 'healthy', type: 'boolean', value: 'fetcher.ok' }], mode: 'replace' } } },
  1041 |         { id: 'o1', type: 'output', position: { x: 750, y: 0 }, data: { label: 'O', type: 'output', config: { inputFields: [] } } },
  1042 |       ],
```