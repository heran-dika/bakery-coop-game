const fs=require('fs');const {JSDOM}=require('jsdom');
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const HOOK="resetGame(true); resizeCanvas(); renderUI(); requestAnimationFrame(frame);";
const EXPOSE=`window.__sim={update,interact,getTargetStation,startGame,joystick,player,stations,stationById,isBlocked,CONFIG,HAZARD,resizeCanvas,render,
get mode(){return mode},get elapsed(){return elapsed},get score(){return score},get served(){return ordersServed},get expired(){return ordersExpired},get burnt(){return burntCount},
get held(){return heldItem},get orders(){return orders},get hazards(){return hazards},get orderSerial(){return orderSerial},get mapScale(){return mapScale},get tileH(){return tileH},get originY(){return originY},get canvasH(){return canvasH},get canvasW(){return canvasW}};`;
function load(file,seed,size={w:1000,h:500}){
  let html=fs.readFileSync(file,'utf8');
  if(!html.includes(HOOK)) throw new Error('hook missing');
  html=html.replace(HOOK,HOOK+EXPOSE);
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:false,beforeParse(w){
    w.__size=size;w.requestAnimationFrame=()=>0;w.ResizeObserver=class{observe(){}disconnect(){}};
    w.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return{width:w.__size.w,height:w.__size.h,left:0,top:0,right:w.__size.w,bottom:w.__size.h}};
    w.Math.random=mulberry(seed);
  }});
  return dom.window;
}
module.exports={load};
