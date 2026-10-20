// Bot solo: A* di grid + joystick nyata (collision/hazard asli), aturan prioritas sederhana.
const {load}=require('./sim');
const STAND={dough:[1,1.75],prep:[3,1.75],oven:[5,1.75],serve:[7,1.75],butter:[1,4.25],salt:[3,4.25],trash:[7,4.25],counter1:[2,3.75],counter2:[6,3.75]};
function astar(S,sx,sy,gx,gy){
  const st=.25,key=(i,j)=>i*100+j;const I=v=>Math.round(v/st);
  const s=[I(sx),I(sy)],g=[I(gx),I(gy)];const open=[[0,...s]],came=new Map(),cost=new Map([[key(...s),0]]);
  while(open.length){open.sort((a,b)=>a[0]-b[0]);const [,i,j]=open.shift();if(i===g[0]&&j===g[1])break;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const ni=i+di,nj=j+dj;
      if(S.isBlocked(ni*st,nj*st)&&!(ni===g[0]&&nj===g[1]))continue;
      const c=cost.get(key(i,j))+Math.hypot(di,dj);if(!cost.has(key(ni,nj))||c<cost.get(key(ni,nj))){cost.set(key(ni,nj),c);came.set(key(ni,nj),[i,j]);open.push([c+Math.hypot(ni-g[0],nj-g[1]),ni,nj]);}}}
  const path=[];let cur=g;while(cur&&key(...cur)!==key(...s)){path.unshift([cur[0]*st,cur[1]*st]);cur=came.get(key(...cur));}return path;
}
function run({file,seed,latency=.25,distract=0,cfg={},size,dt=1/30}){
  const w=load(file,seed,size),S=w.__sim;Object.assign(S.CONFIG,cfg);
  const hasCounter=!!S.stationById.counter1;const counters=hasCounter?['counter1','counter2']:[];
  const rec=new Map();let wait=0,idle=0,ticks=0,tgtId=null,path=[],stall=0,heldTime=0,trashed=0,mismatch=0;
  S.startGame();
  const rnd=()=>w.Math.random();
  const demand=()=>{ // order yang belum ditutup item di pipeline
    const items=[S.held,S.stationById.prep.item,S.stationById.oven.item,...counters.map(c=>S.stationById[c].item)].filter(Boolean);
    const cov={plain_bread:0,salt_bread:0};for(const it of items){const r=rec.get(it.id)||(it.type==='plain_bread'||it.type==='salt_bread'?it.type:null);if(r&&!['burnt_bread','failed_bread'].includes(it.type))cov[r]++;}
    const need=[];const tmp={...cov};for(const o of S.orders){if(tmp[o.type]>0)tmp[o.type]--;else need.push(o.type);}return need;};
  const freeCounter=()=>counters.find(c=>!S.stationById[c].item);
  const fullCounter=()=>counters.find(c=>S.stationById[c].item);
  function decide(){
    const h=S.held,prep=S.stationById.prep,oven=S.stationById.oven;
    if(h){
      if(['burnt_bread','failed_bread'].includes(h.type))return'trash';
      if(h.type==='plain_bread'||h.type==='salt_bread'){
        if(S.orders.some(o=>o.type===h.type))return'serve';
        const c=freeCounter();if(c)return c;heldTime+=0;return heldTimeCheck()?'trash':'serve';}
      if(h.type==='prepared_dough'){if(oven.status==='empty')return'oven';const c=freeCounter();return c||'wait';}
      if(h.type==='dough'){if(!prep.item&&!prep.processing)return'prep';const c=freeCounter();return c||'wait';}
      if(h.type==='butter'||h.type==='salt'){const want=rec.get(prep.item?.id);const mod=h.type;
        if(prep.item?.type==='prepared_dough'&&want==='salt_bread'&&!prep.item.mods.includes(mod))return'prep';
        const c=freeCounter();return c||'wait';}
    }
    if(oven.status==='ready'||oven.status==='burnt')return'oven';
    if(prep.processing)return fetchNext()||'wait';
    if(prep.item?.type==='dough')return'prep';
    if(prep.item?.type==='prepared_dough'){const want=rec.get(prep.item.id);
      if(want==='salt_bread'){if(!prep.item.mods.includes('butter'))return'butter';if(!prep.item.mods.includes('salt'))return'salt';}
      if(oven.status==='empty')return'prep';  // ambil
      return fetchNext()||'wait';}
    const fc=fullCounter();if(fc&&!prep.item&&oven.status==='empty'){return fc;}
    return fetchNext()||'wait';
  }
  let holdSince=null;function heldTimeCheck(){if(holdSince===null)holdSince=S.elapsed;return S.elapsed-holdSince>8;}
  function fetchNext(){const prep=S.stationById.prep;if(prep.item||prep.processing)return null;const need=demand();if(!need.length)return null;return'dough';}
  while(S.mode==='running'&&ticks<20000){
    ticks++;
    if(!S.held)holdSince=null;
    if(stall>0){stall-=dt;S.joystick.active=false;S.update(dt);idle+=dt;continue;}
    const id=decide();
    if(id==='wait'){S.joystick.active=false;S.joystick.x=S.joystick.y=0;idle+=dt;S.update(dt);continue;}
    const [tx,ty]=STAND[id];const p=S.player;const d=Math.hypot(tx-p.x,ty-p.y);
    if(d>.12){
      if(tgtId!==id||!path.length){path=astar(S,p.x,p.y,tx,ty);tgtId=id;}
      while(path.length&&Math.hypot(path[0][0]-p.x,path[0][1]-p.y)<.18)path.shift();
      const wp=path[0]||[tx,ty];const gx=wp[0]-p.x,gy=wp[1]-p.y;
      let sx=(gx-gy)*2/5.4,sy=(gx+gy)/5.4;const m=Math.hypot(sx,sy)||1;
      S.joystick.active=true;S.joystick.x=sx/m;S.joystick.y=sy/m;wait=0;S.update(dt);continue;
    }
    S.joystick.active=false;S.joystick.x=S.joystick.y=0;tgtId=null;path=[];
    wait+=dt;
    if(wait<latency){S.update(dt);continue;}
    if(distract&&rnd()<distract){stall=3;wait=0;continue;}
    const t=S.getTargetStation();
    if(!t||t.id!==id){mismatch++;S.player.facingX=0;S.player.facingY=-1;}
    const before=S.held?.id,beforeType=S.held?.type;
    if(id==='prep'&&S.stationById.prep.item?.type==='dough'&&!S.held&&!S.stationById.prep.processing){S.interact();}
    else S.interact();
    // catat resep pipeline
    if(id==='dough'&&S.held)rec.set(S.held.id,demand()[0]||'plain_bread');
    wait=0;S.update(dt);
  }
  // dough dicatat setelah ambil: demand() sudah menghitung item itu, jadi ambil resep sebelum ambil
  return{score:Math.round(S.score),served:S.served,expired:S.expired,burnt:S.burnt,spawned:S.orderSerial-1,idlePct:Math.round(idle/240*100),mismatch};
}
module.exports={run};
