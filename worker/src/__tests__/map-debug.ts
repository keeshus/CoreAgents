import { FlowExecutor } from '../executor/engine.js';
import type { FlowDefinition } from 'core-agents-shared';

async function main() {
  const flow: FlowDefinition = {id:'test',name:'test',description:'',nodes:[
    {id:'t1',type:'trigger',position:{x:0,y:0},data:{type:'trigger' as any,label:'T',config:{triggerType:'manual'}}},
    {id:'m1',type:'map',position:{x:300,y:0},data:{type:'map' as any,label:'M',config:{fields:[{name:'g',type:'string',value:'trigger.message'}],mode:'replace'}}},
    {id:'o1',type:'output',position:{x:600,y:0},data:{type:'output' as any,label:'O',config:{format:'json' as const, inputFields:[] as string[]}}}
  ],edges:[{id:'e1',source:'t1',target:'m1',sourceHandle:'output-0',targetHandle:'input-0'},{id:'e2',source:'m1',target:'o1',sourceHandle:'output-0',targetHandle:'input-0'}],version:1,createdAt:'',updatedAt:''};

  const exec = new FlowExecutor();
  try {
    const result = await exec.execute(flow, {message:'world'}, () => {}, {sandboxExecutionId:'test'});
    console.log('Output:', JSON.stringify(result.output?.m1));
  } catch(e: any) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack?.split('\n').slice(0,5).join('\n'));
  }
}
main();
