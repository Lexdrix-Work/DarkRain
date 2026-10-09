import { mkdir, writeFile } from 'node:fs/promises';
import { compileExamples } from '../src/systems/destruction/GraphExamples.ts';
const directory=new URL('../src/data/structures/',import.meta.url);await mkdir(directory,{recursive:true});
for(const graph of compileExamples()){
    const filename=graph.id.split(':')[1]+'.json';await writeFile(new URL(filename,directory),JSON.stringify(graph,null,2)+'\n');
    console.log(filename+': '+graph.nodes.length+' members, '+graph.edges.length+' connections');
}
