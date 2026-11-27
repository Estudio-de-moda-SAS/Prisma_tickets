const fs=require('fs');
try{
const inp=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const nodes=inp.nodes,edges=inp.edges,layers=inp.layers;
const ids=new Set(nodes.map(n=>n.id));
const fin={},fout={};nodes.forEach(n=>{fin[n.id]=new Set();fout[n.id]=new Set();});
edges.forEach(e=>{if(!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)return;fout[e.source].add(e.target);fin[e.target].add(e.source);});
const byName=n=>n.name;
const fanIn=nodes.map(n=>({id:n.id,fanIn:fin[n.id].size,name:n.name})).sort((a,b)=>b.fanIn-a.fanIn);
const fanOut=nodes.map(n=>({id:n.id,fanOut:fout[n.id].size,name:n.name})).sort((a,b)=>b.fanOut-a.fanOut);
const foT=fanOut[Math.floor(nodes.length*0.1)].fanOut;
const fis=fanIn.map(x=>x.fanIn).sort((a,b)=>a-b);const fiB=fis[Math.floor(nodes.length*0.25)];
const entryNames=new Set(['index.ts','index.js','main.ts','main.js','app.ts','app.js','server.ts','server.js','main.tsx','index.tsx','App.tsx']);
const cands=nodes.map(n=>{let s=0;const fp=n.filePath||'';const depth=fp.split('/').length-1;
if(n.type==='document'){if(fp==='README.md')s+=5;else if(depth===0&&fp.endsWith('.md'))s+=2;}
else if(n.type==='file'){if(entryNames.has(n.name))s+=3;if(depth<=1)s+=1;if(fout[n.id].size>=foT&&foT>0)s+=1;if(fin[n.id].size<=fiB)s+=1;}
return {id:n.id,score:s,name:n.name,summary:n.summary};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
const codeEntry=nodes.find(n=>n.filePath==='src/main.tsx')||nodes.find(n=>cands.find(c=>c.id===n.id&&n.type==='file'));
const order=[],depthMap={};const q=[codeEntry.id];depthMap[codeEntry.id]=0;
while(q.length){const c=q.shift();order.push(c);edges.filter(e=>e.source===c&&(e.type==='imports'||e.type==='calls')&&ids.has(e.target)).forEach(e=>{if(!(e.target in depthMap)){depthMap[e.target]=depthMap[c]+1;q.push(e.target);}});}
const byDepth={};order.forEach(i=>{(byDepth[depthMap[i]]=byDepth[depthMap[i]]||[]).push(i);});
const cat={documentation:[],infrastructure:[],data:[],config:[]};
nodes.forEach(n=>{const o={id:n.id,name:n.name,type:n.type,summary:n.summary};if(n.type==='document')cat.documentation.push(o);else if(['service','pipeline','resource'].includes(n.type))cat.infrastructure.push(o);else if(['table','schema','endpoint'].includes(n.type))cat.data.push(o);else if(n.type==='config')cat.config.push(o);});
// clusters
const clusters=[];const seen=new Set();
nodes.forEach(a=>{fout[a.id].forEach(b=>{if(fout[b]&&fout[b].has(a.id)){const k=[a.id,b].sort().join('|');if(seen.has(k))return;seen.add(k);const cl=new Set([a.id,b]);
nodes.forEach(c=>{if(cl.size>=5||cl.has(c.id))return;let cnt=0;cl.forEach(m=>{if(fout[c.id].has(m)||fin[c.id].has(m))cnt++;});if(cnt>=2)cl.add(c.id);});
const arr=[...cl];let ec=0;arr.forEach(x=>arr.forEach(y=>{if(x!==y&&fout[x].has(y))ec++;}));clusters.push({nodes:arr,edgeCount:ec});}});});
clusters.sort((a,b)=>b.edgeCount-a.edgeCount);
const idx={};nodes.forEach(n=>idx[n.id]={name:n.name,type:n.type,summary:n.summary,filePath:n.filePath});
fs.writeFileSync(process.argv[3],JSON.stringify({scriptCompleted:true,entryPointCandidates:cands,fanInRanking:fanIn.slice(0,20),fanOutRanking:fanOut.slice(0,20),bfsTraversal:{startNode:codeEntry.id,order,depthMap,byDepth},nonCodeFiles:cat,clusters:clusters.slice(0,10),layers:{count:layers.length,list:layers},nodeSummaryIndex:idx,totalNodes:nodes.length,totalEdges:edges.length},null,1));
}catch(e){console.error(e.stack);process.exit(1);}
