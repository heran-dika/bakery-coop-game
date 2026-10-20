const {run}=require('./bot');
const stars=s=>s>=900?3:s>=600?2:s>=300?1:0;
function batch(label,opts,n=30){
  const rs=[];for(let i=1;i<=n;i++)rs.push(run({...opts,seed:i*7919}));
  const avg=k=>(rs.reduce((a,r)=>a+r[k],0)/n).toFixed(1);const sc=rs.map(r=>r.score).sort((a,b)=>a-b);
  const dist=[0,1,2,3].map(s=>rs.filter(r=>stars(r.score)===s).length);
  console.log(label.padEnd(34),'skor avg',avg('score').padStart(7),'min/med/max',sc[0],sc[n>>1],sc[n-1],'| served',avg('served'),'/spawn',avg('spawned'),'| exp',avg('expired'),'burnt',avg('burnt'),'idle%',avg('idlePct'),'| ★0-3',dist.join('/'),'mismatch',avg('mismatch'));
}
module.exports={batch};
if(require.main===module){
  const file=process.argv[2]||'orig.html';
  batch(file+' efisien',{file,latency:.25});
  batch(file+' santai',{file,latency:1.0,distract:.08});
}
