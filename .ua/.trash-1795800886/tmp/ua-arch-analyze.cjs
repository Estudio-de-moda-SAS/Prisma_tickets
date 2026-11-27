const fs=require('fs');
try{
const inp=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const N=inp.fileNodes,I=inp.importEdges,A=inp.allEdges;
const grp=p=>{const s=p.split('/');if(s.length===1)return'(root)';if(s[0]==='src'&&s.length>2){if(s[1]==='features'&&s.length>3)return'src/features/'+s[2]+'/'+s[3];return'src/'+s[1];}if(s[0]==='src')return'src(root)';if(s[0]==='supabase'&&s.length>4)return'supabase/api/'+s[3];if(s[0]==='supabase')return'supabase(root)';if(s[0]==='prisma-migrations')return'prisma-migrations';return s[0];};
const byId={};N.forEach(x=>byId[x.id]=x);
const dg={},ng={};N.forEach(x=>{const g=grp(x.filePath);(dg[g]=dg[g]||[]).push(x.id);(ng[x.type]=ng[x.type]||[]).push(x.id)});
const G=id=>byId[id]?grp(byId[id].filePath):'?';
const fi={},fo={},ig={},intra={};
I.forEach(ed=>{fo[ed.source]=(fo[ed.source]||0)+1;fi[ed.target]=(fi[ed.target]||0)+1;const a=G(ed.source),b=G(ed.target);
 intra[a]=intra[a]||{internalEdges:0,totalEdges:0};intra[b]=intra[b]||{internalEdges:0,totalEdges:0};
 if(a===b){intra[a].internalEdges++;intra[a].totalEdges++;}else{intra[a].totalEdges++;intra[b].totalEdges++;const k=a+'->'+b;ig[k]=(ig[k]||0)+1;}});
Object.values(intra).forEach(v=>v.density=v.totalEdges?+(v.internalEdges/v.totalEdges).toFixed(2):0);
const cc={};A.forEach(ed=>{const s=byId[ed.source],t=byId[ed.target];if(!s||!t)return;if(s.type===t.type&&s.type==='file')return;const k=s.type+'|'+t.type+'|'+ed.type;cc[k]=(cc[k]||0)+1});
const dd=[];const seen=new Set();Object.keys(ig).forEach(k=>{const[a,b]=k.split('->');const r=ig[b+'->'+a]||0;const key=[a,b].sort().join('|');if(seen.has(key))return;seen.add(key);dd.push(ig[k]>=r?{dependent:a,dependsOn:b}:{dependent:b,dependsOn:a})});
const sorted=o=>Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,25));
const out={scriptCompleted:true,directoryGroups:dg,nodeTypeGroups:ng,
crossCategoryEdges:Object.entries(cc).map(([k,c])=>{const[f,t,y]=k.split('|');return{fromType:f,toType:t,edgeType:y,count:c}}),
interGroupImports:Object.entries(ig).map(([k,c])=>({from:k.split('->')[0],to:k.split('->')[1],count:c})).sort((a,b)=>b.count-a.count),
intraGroupDensity:intra,
deploymentTopology:{hasDockerfile:false,hasCompose:false,hasK8s:false,hasTerraform:false,hasCI:N.some(x=>x.filePath.startsWith('.github/workflows')),infraFiles:N.filter(x=>/^\.github|staticwebapp|_redirects|config\.toml/.test(x.filePath)).map(x=>x.filePath)},
dependencyDirection:dd,
fileStats:{totalFileNodes:N.length,filesPerGroup:Object.fromEntries(Object.entries(dg).map(([k,v])=>[k,v.length])),nodeTypeCounts:Object.fromEntries(Object.entries(ng).map(([k,v])=>[k,v.length]))},
fileFanIn:sorted(fi),fileFanOut:sorted(fo)};
fs.writeFileSync(process.argv[3],JSON.stringify(out,null,1));process.exit(0);
}catch(err){console.error(err);process.exit(1)}
