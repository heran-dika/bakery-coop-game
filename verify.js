const {load}=require('./sim');const fs=require('fs');
// Bug 2: posisi layar titik terdalam yang bisa dijalani vs tinggi canvas
console.log('--- Bug 2: bawah pemain di pojok (7.55,6.55) vs tinggi canvas');
for(const [w,h] of [[1240,620],[1000,500],[844,264],[740,300],[640,250]]){
  const row=[];for(const f of ['orig.html','patched.html']){
    const win=load(f,1,{w,h});const S=win.__sim;S.resizeCanvas();
    const y=S.originY+(7.55+6.55)*S.tileH/2+3*S.mapScale; row.push(`${f.split('.')[0]}: scale ${S.mapScale.toFixed(2)} bawah=${y.toFixed(0)}px ${y>h?'KEPOTONG +'+(y-h).toFixed(0):'muat'}`);}
  console.log(`${w}x${h}  `+row.join('  |  '));
}
// Bug 4: spawn saat pemain tidak melayani sama sekali (antrean selalu penuh)
console.log('--- Bug 4: jumlah order spawn selama 240s tanpa pelayanan');
for(const f of ['orig.html','patched.html']){const w=load(f,3);const S=w.__sim;S.startGame();let t=0;while(S.mode==='running'&&t++<20000)S.update(1/30);console.log(f,'spawned',S.orderSerial-1,'expired',S.expired);}
// Bug 5: interact diabaikan saat overlay Kontrol terbuka
console.log('--- Bug 5: pause saat overlay Kontrol');
{const w=load('patched.html',1);const S=w.__sim;S.startGame();S.stationById.dough; S.player.x=1;S.player.y=1.75;
 w.document.getElementById('helpScreen').classList.remove('hidden');S.interact();console.log('held saat overlay terbuka:',S.held?S.held.type:'kosong (benar)');
 w.document.getElementById('helpScreen').classList.add('hidden');S.interact();console.log('held setelah ditutup:',S.held?S.held.type:'kosong');}
// Render
function shot(f,w,h,out){const win=load(f,1,{w,h});const S=win.__sim;S.startGame();S.resizeCanvas();
  S.player.x=7.5;S.player.y=6.5;if(S.stationById.counter1){S.stationById.counter1.item={id:99,type:'prepared_dough',mods:[]};S.stationById.counter2.item={id:98,type:'plain_bread',mods:[]};}
  S.render();const d=win.document.getElementById('gameCanvas').toDataURL('image/png').split(',')[1];fs.writeFileSync(out,Buffer.from(d,'base64'));}
shot('orig.html',844,264,'orig_844.png');shot('patched.html',844,264,'patched_844.png');shot('patched.html',1000,500,'patched_1000.png');
