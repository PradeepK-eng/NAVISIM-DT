// NAVSIM-DT v11 — ProximaED Physics Engine + Study Mode + Socratic AI + CSV Export
// Extracted for reference. Run NAVSIM_DT_v11.html as a self-contained simulator.
// © ProximaED 2025. Educational use only. Public-domain parameters (Type-209/Foxtrot).


// ════════════════════════════════════════════════════════════════
// NAVSIM-DT v4 · ProximaED · Complete Physics + Learning Engine
// Public-domain parameters only · All equations textbook-sourced
// ════════════════════════════════════════════════════════════════

const SUB={LOA:64.4,BEAM:6.5,MASS_S:1500000,MASS_D:1810000,MAX_D:250,CRUSH:375,MAX_V:10.3,Cd:0.12,F_MAX:250000,HY80:550,R:3.25,T_HULL:0.025};
const G=9.81,P0=101325;

const SCENARIOS=[
  {name:'Bay of Bengal Patrol',   SST:28.4,S:33.2,thermo:65, SS:3,wh:1.4,NL:62,curr:0.35},
  {name:'Arabian Sea Deep Dive',  SST:27.1,S:36.5,thermo:120,SS:2,wh:0.9,NL:58,curr:0.20},
  {name:'Andaman Sea Shallow',    SST:29.5,S:32.0,thermo:45, SS:4,wh:2.1,NL:67,curr:0.55},
  {name:'Structural Stress Test', SST:26.0,S:34.0,thermo:90, SS:2,wh:1.0,NL:60,curr:0.15},
];

// ── STATE ──────────────────────────────────────────────────────
let running=false,simSpeed=1,elapsed=0,loopId=null,rafTs=null;
let depth=0,vel=0,pitch=0,yaw=0;
let cAProb=0.60,cARange=18000;
let cBProb=0.0,cBRange=12000;
let pingTimer=0,scenIdx=0,ocean={...SCENARIOS[0]};
let mGoals=[false,false,false,false,false];
const depHist=new Array(700).fill(null);
let histIdx=0;
let blips=[]; // {bearing,rangeFrac,conf,age,maxAge,active}

// Session stats for debrief
let stats={thermoTime:0,minSHI:1,maxPd:0,maxDepth:0,maxSpeed:0,startTime:0};

// Spotlight gate
let spotFired=false,spotPaused=false;

// Telemetry
const telLog=[];

// ── PHYSICS ────────────────────────────────────────────────────
function T_at(d){return ocean.SST-Math.min(Math.pow(Math.max(d,0)/Math.max(ocean.thermo,1),1.4)*16,16)}
function rho(d){return 1000+0.75*ocean.S-0.20*T_at(d)}
function mack(T,S,Z){return 1448.96+4.591*T-0.05304*T*T+0.0002374*T*T*T+0.016*Z+(1.340-0.01025*T)*(S-35)+1.675e-7*Z*Z-7.139e-13*T*Z*Z*Z}
function pressMPa(d){return(P0+rho(d)*G*d)/1e6}
function hoopMPa(d){return(P0+rho(d)*G*d)*SUB.R/(SUB.T_HULL*1e6)}
function SHI(d){return Math.max(0,1-d/SUB.CRUSH)}
function pFail(t){return(1-Math.exp(-0.0002*t))*100}
function SL(v){if(v<0.05)return 110;return 110+Math.max(0,30*Math.log10(v*1.94384))}
function TLoss(R){return R<=1?0:20*Math.log10(R)+0.003*R}
function snrP(v,R){return SL(v)-TLoss(R)-(ocean.NL-20)}
function snrA(v,R){return SL(v)-2*TLoss(R)+10*Math.log10(SUB.LOA/4)-(ocean.NL-20)}
function detPd(snr){return 1/(1+Math.exp(-0.5*(snr-10)))}
function Pd(snr){return detPd(snr)}
function bayesUp(pr,pd){const pD=pd*pr+(1-pd)*(1-pr);if(pD<1e-9)return pr;return pd*pr/pD}
function sonarMode(){return document.getElementById('sel-sonar').value}
function getSNR(){const m=sonarMode();return m==='passive'?snrP(vel,cARange):m==='active'?snrA(vel,cARange):-99}

// ── PHYSICS TICK ───────────────────────────────────────────────
function tick(dt){
  const thr=+document.getElementById('sl-thr').value;
  const dive=+document.getElementById('sl-dive').value;
  const ball=+document.getElementById('sl-ball').value;
  const rud=+document.getElementById('sl-rud').value;
  const r=rho(depth);
  const effM=SUB.MASS_S+(SUB.MASS_D-SUB.MASS_S)*(ball/100);
  const Ft=(thr/100)*SUB.F_MAX;
  const Fd=0.5*r*SUB.Cd*Math.PI*(SUB.BEAM/2)**2*vel*vel;
  const acc=(Ft-Fd)/effM;
  vel=Math.max(0,Math.min(vel+acc*dt,SUB.MAX_V));
  pitch+=(dive*0.05)*(vel/5+0.01)*dt;
  pitch=Math.max(-35,Math.min(35,pitch));
  yaw+=rud*0.008*vel*dt;
  const vz=-vel*Math.sin(pitch*Math.PI/180);
  depth=Math.max(0,depth+vz*dt);
  cARange=Math.max(1200,cARange-vel*0.28*dt);
  cBRange=Math.max(1800,cBRange-vel*0.13*dt);

  // Pings
  pingTimer+=dt;
  const interval=sonarMode()==='passive'?10:sonarMode()==='active'?5:999999;
  if(pingTimer>=interval){
    const snr=getSNR();const pd=detPd(snr);
    if(sonarMode()!=='off'){
      cAProb=Math.max(0.05,Math.min(0.99,bayesUp(cAProb,pd)));
      if(depth>100) cBProb=Math.max(0.05,Math.min(0.99,bayesUp(cBProb||0.28,pd*0.62)));
      // Add blip
      blips.push({bearing:145,rangeFrac:Math.min(0.92,(18000-cARange)/17000*0.78+0.12),conf:pd,age:0,maxAge:55,active:sonarMode()==='active'});
      if(cBProb>0.2) blips.push({bearing:220,rangeFrac:Math.min(0.88,(12000-cBRange)/11000*0.68+0.1),conf:pd*0.6,age:0,maxAge:45,active:false});
    }
    pingTimer=0;
  }
  blips.forEach(b=>b.age++);
  blips=blips.filter(b=>b.age<b.maxAge);

  elapsed+=dt;
  // Missions
  mGoals[0]|=depth>50;
  mGoals[1]|=vel*1.944>10;
  mGoals[2]|=cAProb>0.80;
  mGoals[3]|=SHI(depth)>0.7;
  mGoals[4]|=depth<10&&elapsed>60;

  // Stats
  if(depth>ocean.thermo) stats.thermoTime+=dt;
  stats.minSHI=Math.min(stats.minSHI,SHI(depth));
  stats.maxPd=Math.max(stats.maxPd,cAProb);
  stats.maxDepth=Math.max(stats.maxDepth,depth);
  stats.maxSpeed=Math.max(stats.maxSpeed,vel*1.944);

  // Depth history
  depHist[histIdx%700]=depth;histIdx++;

  // Telemetry log
  if(Math.floor(elapsed)%5===0&&Math.floor(elapsed)!==telLog._last){
    telLog._last=Math.floor(elapsed);
    telLog.push({t:Math.floor(elapsed),d:+depth.toFixed(1),v:+(vel*1.944).toFixed(1),p:+pitch.toFixed(1),pres:+pressMPa(depth).toFixed(3),rho:+rho(depth).toFixed(2),cs:+mack(T_at(depth),ocean.S,depth).toFixed(1),sl:+SL(vel).toFixed(1),tl:+TLoss(cARange).toFixed(1),shi:+SHI(depth).toFixed(3),snr:+getSNR().toFixed(1),pd:cAProb,sigma:+hoopMPa(depth).toFixed(1),pf:+pFail(elapsed).toFixed(3),range:cARange,mode:sonarMode()});
    if(telLog.length>200)telLog.shift();
  }

  // Spotlight trigger
  if(!spotFired&&SHI(depth)<0.6&&running){
    spotFired=true;fireSpotlight();
  }
}

// ── CANVASES ───────────────────────────────────────────────────
const sCv=document.getElementById('sonar-cv');
const sCtx=sCv.getContext('2d');
const dCv=document.getElementById('depth-cv');
const dCtx=dCv.getContext('2d');

function sizeCanvases(){
  const sw=document.getElementById('sonar-wrap');
  sCv.width=sw.offsetWidth;sCv.height=sw.offsetHeight;
  const dp=document.getElementById('dprofile');
  dCv.width=dp.offsetWidth;dCv.height=dp.offsetHeight;
}

// ── SONAR DRAW ─────────────────────────────────────────────────
// PPI: bearing 0°=North=top, clockwise. x=cx+R·sin(b), y=cy-R·cos(b)
// Full 360° circle. cx=W/2, cy=H/2 (centre of canvas)
function drawSonar(){
  const W=sCv.width,H=sCv.height;
  if(W<20||H<20)return;
  const cx=W/2, cy=H/2;
  const maxR=Math.min(W,H)*0.44;

  sCtx.fillStyle='#001a0d';
  sCtx.fillRect(0,0,W,H);

  // ── Range rings (full circles) — HIGH CONTRAST ──
  for(let i=1;i<=5;i++){
    const r=i/5*maxR;
    sCtx.beginPath();sCtx.arc(cx,cy,r,0,Math.PI*2);
    sCtx.strokeStyle=`rgba(0,255,120,${0.25+i*0.06})`;sCtx.lineWidth=i===5?1.6:1;sCtx.stroke();
    // Range label at 3 o'clock position
    sCtx.fillStyle='rgba(180,255,200,0.95)';sCtx.font='bold 11px Share Tech Mono,monospace';
    sCtx.fillText((i/5*25).toFixed(0)+'km',cx+r+4,cy+4);
  }

  // ── Bearing lines (every 30°) — HIGH CONTRAST ──
  for(let b=0;b<360;b+=30){
    const rad=b*Math.PI/180;
    const inner=maxR*0.07;
    sCtx.beginPath();
    sCtx.moveTo(cx+inner*Math.sin(rad),cy-inner*Math.cos(rad));
    sCtx.lineTo(cx+maxR*Math.sin(rad),cy-maxR*Math.cos(rad));
    sCtx.strokeStyle=b%90===0?'rgba(0,255,140,0.75)':'rgba(0,220,110,0.4)';
    sCtx.lineWidth=b%90===0?1.6:0.9;sCtx.stroke();
    // Bearing labels
    if(b%90===0){
      const lx=cx+(maxR+16)*Math.sin(rad),ly=cy-(maxR+16)*Math.cos(rad);
      sCtx.fillStyle='#aaffcc';sCtx.font='bold 13px Share Tech Mono,monospace';
      const labels={0:'N',90:'E',180:'S',270:'W'};
      sCtx.fillText(labels[b]||b+'°',lx-5,ly+5);
    } else {
      const lx=cx+(maxR+12)*Math.sin(rad),ly=cy-(maxR+12)*Math.cos(rad);
      sCtx.fillStyle='rgba(160,255,190,0.85)';sCtx.font='bold 10px Share Tech Mono,monospace';
      sCtx.fillText(b+'°',lx-10,ly+4);
    }
  }

  // ── Sweep line (rotates with elapsed time) — BRIGHTER ──
  const sweepRad=(elapsed*0.7%(Math.PI*2));
  for(let i=12;i>=0;i--){
    const gr=sweepRad-i*0.04;
    const a=i===0?0.95:Math.max(0,(0.18-i*0.012));
    sCtx.beginPath();
    sCtx.moveTo(cx,cy);
    sCtx.lineTo(cx+maxR*Math.sin(gr),cy-maxR*Math.cos(gr));
    sCtx.strokeStyle=`rgba(120,255,140,${a})`;
    sCtx.lineWidth=i===0?2.2:1.1;sCtx.stroke();
  }

  // ── Thermocline visualisation ──
  const thermoFrac=Math.min(ocean.thermo/400,0.95);
  const thermoR=thermoFrac*maxR;
  sCtx.beginPath();sCtx.arc(cx,cy,thermoR,0,Math.PI*2);
  sCtx.strokeStyle='rgba(80,210,255,0.85)';sCtx.lineWidth=1.5;
  sCtx.setLineDash([5,5]);sCtx.stroke();sCtx.setLineDash([]);
  sCtx.fillStyle='#7ad8ff';sCtx.font='bold 10px Share Tech Mono,monospace';
  sCtx.fillText('THERMO '+ocean.thermo+'m',cx+thermoR+4,cy-4);

  // Sub depth ring
  const depthR=Math.min(depth/400,0.98)*maxR;
  if(depth>5){
    sCtx.beginPath();sCtx.arc(cx,cy,depthR,0,Math.PI*2);
    sCtx.strokeStyle='rgba(120,240,255,0.55)';sCtx.lineWidth=1;sCtx.stroke();
  }

  // Shadow zone indicator
  if(depth>ocean.thermo){
    sCtx.fillStyle='rgba(0,120,180,0.12)';
    sCtx.beginPath();sCtx.arc(cx,cy,depthR,0,Math.PI*2);sCtx.fill();
    sCtx.fillStyle='#7ad8ff';sCtx.font='bold 10px Share Tech Mono,monospace';
    sCtx.fillText('SHADOW ZONE',cx-36,cy+depthR*0.5);
  }

  // ── Always-visible ghost blip for Contact Alpha ──
  const aFrac=Math.min(0.93,(18000-cARange)/17000*0.76+0.12);
  const aRad=145*Math.PI/180;
  const aPx=cx+aFrac*maxR*Math.sin(aRad);
  const aPy=cy-aFrac*maxR*Math.cos(aRad);
  sCtx.beginPath();sCtx.arc(aPx,aPy,6,0,Math.PI*2);
  sCtx.strokeStyle=`rgba(120,255,140,${0.55+cAProb*0.4})`;sCtx.lineWidth=1.8;sCtx.stroke();
  sCtx.fillStyle=`rgba(120,255,140,${0.2+cAProb*0.3})`;sCtx.fill();
  sCtx.fillStyle='#b6ffc6';sCtx.font='bold 12px Share Tech Mono,monospace';
  sCtx.fillText('α '+(cAProb*100).toFixed(0)+'%',aPx+9,aPy-4);

  // Contact Beta ghost (when discovered)
  if(cBProb>0.15){
    const bFrac=Math.min(0.88,(12000-cBRange)/11000*0.65+0.1);
    const bRad=220*Math.PI/180;
    const bPx=cx+bFrac*maxR*Math.sin(bRad);
    const bPy=cy-bFrac*maxR*Math.cos(bRad);
    sCtx.beginPath();sCtx.arc(bPx,bPy,5,0,Math.PI*2);
    sCtx.strokeStyle=`rgba(255,210,80,${0.55+cBProb*0.4})`;sCtx.lineWidth=1.8;sCtx.stroke();
    sCtx.fillStyle='rgba(255,210,80,0.2)';sCtx.fill();
    sCtx.fillStyle='#ffe28a';sCtx.font='bold 12px Share Tech Mono,monospace';
    sCtx.fillText('β '+(cBProb*100).toFixed(0)+'%',bPx+8,bPy-4);
  }

  // ── Sonar blips (ping echoes) ──
  blips.forEach(b=>{
    const a=1-b.age/b.maxAge;
    const bRad=b.bearing*Math.PI/180;
    const px=cx+b.rangeFrac*maxR*Math.sin(bRad);
    const py=cy-b.rangeFrac*maxR*Math.cos(bRad);
    const col=b.active?[255,180,40]:[120,255,140];
    const ringR=(b.age/b.maxAge)*22;
    sCtx.beginPath();sCtx.arc(px,py,ringR,0,Math.PI*2);
    sCtx.strokeStyle=`rgba(${col},${a*0.6})`;sCtx.lineWidth=1.5;sCtx.stroke();
    sCtx.beginPath();sCtx.arc(px,py,5+b.conf*8,0,Math.PI*2);
    sCtx.fillStyle=`rgba(${col},${a*0.45})`;sCtx.fill();
    sCtx.strokeStyle=`rgba(${col},${a})`;sCtx.lineWidth=2.5;sCtx.stroke();
    sCtx.fillStyle=`rgba(${col},${a})`;sCtx.font='bold 13px Share Tech Mono,monospace';
    const lbl=b.bearing===145?'α':'β';
    sCtx.fillText(lbl,px+8,py-5);
    sCtx.fillStyle=`rgba(${col},${a*0.85})`;sCtx.font='bold 10px Share Tech Mono,monospace';
    sCtx.fillText((b.conf*100).toFixed(0)+'%',px+8,py+8);
  });

  // ── Own vessel (centre dot) ──
  sCtx.beginPath();sCtx.arc(cx,cy,9,0,Math.PI*2);
  sCtx.fillStyle='#7ff0ff';sCtx.fill();
  sCtx.strokeStyle='rgba(120,240,255,0.35)';sCtx.lineWidth=12;sCtx.stroke();
  // Heading line
  const hRad=yaw*Math.PI/180;
  sCtx.beginPath();sCtx.moveTo(cx,cy);sCtx.lineTo(cx+24*Math.sin(hRad),cy-24*Math.cos(hRad));
  sCtx.strokeStyle='#9ffaff';sCtx.lineWidth=2.5;sCtx.stroke();

  // ── Depth sidebar (right edge) ──
  const sbH=H-20,sbX=W-22,sbTop=10;
  sCtx.fillStyle='rgba(0,0,0,0.55)';sCtx.fillRect(sbX,sbTop,12,sbH);
  sCtx.strokeStyle='rgba(120,255,140,0.5)';sCtx.lineWidth=0.8;sCtx.strokeRect(sbX,sbTop,12,sbH);
  [250,375].forEach((dm,i)=>{
    const y2=sbTop+(dm/400)*sbH;
    sCtx.fillStyle=i===0?'#ffb04d':'#ff6060';
    sCtx.fillRect(sbX,y2,12,2);
    sCtx.font='bold 9px Share Tech Mono,monospace';
    sCtx.fillText(dm+'m',sbX-28,y2+4);
  });
  const dY=sbTop+(Math.min(depth,400)/400)*sbH;
  sCtx.fillStyle='#7ff0ff';sCtx.fillRect(sbX-2,dY-3,14,6);
  sCtx.font='bold 9px Share Tech Mono,monospace';
  sCtx.fillText(depth.toFixed(0)+'m',sbX-30,dY+3);
}

// ── DEPTH CHART ────────────────────────────────────────────────
function drawDepth(){
  const W=dCv.width,H=dCv.height;
  if(W<20||H<20)return;
  dCtx.fillStyle='#020810';dCtx.fillRect(0,0,W,H);
  const PAD=42,maxD=420;
  [50,100,150,200,250,300,375].forEach(d=>{
    const y=(d/maxD)*(H-16)+8;
    dCtx.strokeStyle=d===250?'rgba(255,149,0,0.4)':d===375?'rgba(255,77,77,0.4)':'rgba(0,80,120,0.22)';
    dCtx.lineWidth=d===250||d===375?1:.5;
    dCtx.setLineDash(d===250||d===375?[4,4]:[]);
    dCtx.beginPath();dCtx.moveTo(PAD,y);dCtx.lineTo(W,y);dCtx.stroke();
    dCtx.setLineDash([]);
    dCtx.fillStyle='rgba(90,143,173,0.6)';dCtx.font='7px Share Tech Mono,monospace';
    dCtx.fillText(d,2,y+3);
  });
  const count=Math.min(histIdx,700);
  if(count<2)return;
  dCtx.beginPath();
  for(let i=0;i<count;i++){
    const v=depHist[(histIdx-count+i)%700];
    if(v===null)continue;
    const x=PAD+i*(W-PAD)/700;
    const y=(v/maxD)*(H-16)+8;
    i===0?dCtx.moveTo(x,y):dCtx.lineTo(x,y);
  }
  dCtx.strokeStyle='rgba(0,200,230,0.85)';dCtx.lineWidth=1.5;dCtx.stroke();
  const lv=depHist[(histIdx-1+700)%700]||0;
  const lx=PAD+Math.min(count-1,699)*(W-PAD)/700;
  const ly=(lv/maxD)*(H-16)+8;
  dCtx.lineTo(lx,H);dCtx.lineTo(PAD,H);dCtx.closePath();
  dCtx.fillStyle='rgba(0,100,160,0.1)';dCtx.fill();
  dCtx.beginPath();dCtx.arc(lx,ly,4,0,Math.PI*2);dCtx.fillStyle='#00c8e0';dCtx.fill();
  dCtx.fillStyle='rgba(90,143,173,0.5)';dCtx.font='7px Share Tech Mono,monospace';
  dCtx.fillText('DEPTH HISTORY',PAD+4,11);
}

// ── UI UPDATE ──────────────────────────────────────────────────
function sv(id,v){const e=document.getElementById(id);if(e)e.textContent=v}
function sb(id,v,mx,col){const e=document.getElementById(id);if(!e)return;e.style.width=Math.max(0,Math.min(v/mx*100,100))+'%';if(col)e.style.background=col}
function scl(id,c){const e=document.getElementById(id);if(e)e.className='mv '+c}

function updateUI(){
  const r=rho(depth),T=T_at(depth);
  const cs=mack(T,ocean.S,depth);
  const P=pressMPa(depth),sigma=hoopMPa(depth),shi=SHI(depth);
  const sl=SL(vel),tl=TLoss(cARange);
  const m=sonarMode(),snr=getSNR(),pd=detPd(snr),pf=pFail(elapsed);
  const vKt=vel*1.94384;

  // Metrics
  sv('mv-d',depth.toFixed(0));sv('mv-v',vKt.toFixed(1));sv('mv-p',pitch.toFixed(1)+'°');
  sv('mv-pr',P.toFixed(2));sv('mv-shi',shi.toFixed(2));sv('mv-pd',(cAProb*100).toFixed(0)+'%');
  sv('mv-snr',m!=='off'?snr.toFixed(1):'—');sv('mv-cs',cs.toFixed(0));

  scl('mv-shi',shi>0.7?'cg':shi>0.4?'ca':'cr');
  scl('mv-pd',cAProb>0.7?'cg':cAProb>0.4?'ca':'cr');
  scl('mv-snr',m==='off'?'ct':snr>10?'cg':snr>0?'ca':'cr');

  // Bars
  const dc=depth>SUB.MAX_D?'var(--red)':depth>SUB.MAX_D*0.7?'var(--amber)':'var(--teal)';
  sb('bf-pr',P,4,dc);sb('bf-rho',r-1010,20,'var(--teal)');sb('bf-cs',cs-1460,100,'var(--teal)');
  sb('bf-dep',depth,SUB.CRUSH,dc);sb('bf-spd',vel,SUB.MAX_V,'var(--green)');sb('bf-ptch',Math.abs(pitch),35,'var(--amber)');
  sb('bf-sl',sl-100,60,'var(--teal)');sb('bf-tl',tl,120,'var(--amber)');
  sb('bf-snr',Math.max(0,snr+10),70,snr>10?'var(--green)':'var(--amber)');
  sb('bf-pd',cAProb*100,100,cAProb>0.7?'var(--green)':'var(--amber)');
  const sc=shi>0.7?'var(--green)':shi>0.4?'var(--amber)':'var(--red)';
  sb('bf-shi',shi*100,100,sc);
  sb('bf-str',sigma,SUB.HY80,sigma>400?'var(--red)':sigma>200?'var(--amber)':'var(--teal)');
  sb('bf-pf',pf,100,pf>30?'var(--red)':'var(--green)');

  // Readouts
  sv('bv-pr',P.toFixed(2)+' MPa');sv('bv-rho',r.toFixed(1));sv('bv-cs',cs.toFixed(0)+' m/s');
  sv('bv-dep',depth.toFixed(0)+' m');sv('bv-spd',vKt.toFixed(1)+' kt');sv('bv-ptch',pitch.toFixed(1)+'°');
  sv('bv-sl',sl.toFixed(0)+' dB');sv('bv-tl',tl.toFixed(0)+' dB');
  sv('bv-snr',m!=='off'?snr.toFixed(1)+' dB':'— dB');sv('bv-pd',(cAProb*100).toFixed(0)+'%');
  sv('bv-shi',shi.toFixed(2));sv('bv-str',sigma.toFixed(0)+' MPa');sv('bv-pf',pf.toFixed(2)+'%');

  // Sonar overlay
  const inShadow=depth>ocean.thermo;
  document.getElementById('sol-l').innerHTML=`BEARING: 145°<br>RANGE: ${(cARange/1000).toFixed(1)} km<br>MODE: ${m.toUpperCase()}<br>c: ${cs.toFixed(0)} m/s<br>THERMO: ${ocean.thermo} m`;
  document.getElementById('sol-r').innerHTML=`SHADOW: ${inShadow?'<span style="color:#00c8e0">ACTIVE</span>':'OFF'}<br>SNR: ${m!=='off'?snr.toFixed(1)+' dB':'—'}<br>Pd: ${m!=='off'?(pd*100).toFixed(0)+'%':'—'}<br>LOCK: ${snr>10?'<span style="color:#00e87a">YES</span>':'NO'}<br>CONTACT β: ${cBProb>0.2?'<span style="color:#f5a623">YES</span>':'NO'}`;

  // Pills
  setPill('pill-hull',shi,'HULL',['NOMINAL','WARNING','CRITICAL'],[0.6,0.3]);
  setPill('pill-mis',mGoals.filter(Boolean).length/5,'MISSION',['COMPLETE','ACTIVE','STANDBY'],[0.9,0.1]);
  const sp=document.getElementById('pill-son');
  sp.textContent=m==='passive'?'SONAR: PASSIVE':m==='active'?'SONAR: ACTIVE':'SONAR: SILENT';
  sp.className='pill '+(m==='off'?'wn':'ok');
  sv('sonar-mode-lbl',m.toUpperCase());

  // Clock
  const hh=Math.floor(elapsed/3600),mm=Math.floor(elapsed%3600/60),ss=Math.floor(elapsed%60);
  sv('clock',`T+ ${pad(hh)}:${pad(mm)}:${pad(ss)}`);

  // Mission list
  const mlbls=['Dive below 50 m','Reach 10 knots','Contact Pd > 80%','SHI maintained > 0.7','Ascend safely'];
  mGoals.forEach((g,i)=>{const e=document.getElementById('mg'+i);if(e){e.textContent=mlbls[i];e.className='mi '+(g?'done':'pend')}});
  sv('mscore',Math.round(mGoals.filter(Boolean).length/5*100)+'%');
  sv('cc-a',(cAProb*100).toFixed(0)+'%');
  if(cBProb>0.15){document.getElementById('cc-b-row').style.display='flex';sv('cc-b',(cBProb*100).toFixed(0)+'%')}

  // AI Instructor
  updateAI(shi,snr,vKt,depth,cAProb,m,inShadow,sigma,cs);
}

function setPill(id,val,prefix,lbls,thr){
  const e=document.getElementById(id);if(!e)return;
  if(val<=thr[1]){e.textContent=prefix+': '+lbls[2];e.className='pill er'}
  else if(val<=thr[0]){e.textContent=prefix+': '+lbls[1];e.className='pill wn'}
  else{e.textContent=prefix+': '+lbls[0];e.className='pill ok'}
}
function pad(n){return String(n).padStart(2,'0')}

// ── AI INSTRUCTOR (Socratic + reactive hybrid) ─────────────────
// Per-rule fired flags prevent same rule re-firing after dismiss
let socraticActive=false, socraticPending=null;
// Fired-once guards: keyed by rule id; reset on resetSim
const socraticFired={s1:false,s2:false,s3:false};
let lastSocraticDepth=-999;

const aiRules=[
  // SOCRATIC 1 — thermocline crossing (fires once per session)
  {id:'s1',
   c:s=>!socraticActive&&!socraticFired.s1&&s.d>ocean.thermo&&s.d<ocean.thermo+60,
   socratic:true,
   q:s=>`You just crossed the thermocline (${ocean.thermo}m). Predict: will sound speed INCREASE or DECREASE below it? Type "increase" or "decrease", or estimate c in m/s.`,
   reveal:s=>`Below the thermocline T drops sharply → c falls. Actual c = ${mack(T_at(s.d),ocean.S,s.d).toFixed(0)} m/s vs ${mack(ocean.SST,ocean.S,0).toFixed(0)} m/s at surface. Rays refract downward — acoustic shadow zone formed.`,
   check:(val)=>{const v=val.toLowerCase();return v.includes('decr')||v.includes('lower')||v.includes('less')||(!isNaN(parseFloat(v))&&parseFloat(v)<1520);},
   eq:'c = Mackenzie(T,S,Z)  →  lower T = lower c'},
  // SOCRATIC 2 — hoop stress at 150m (fires once per session)
  {id:'s2',
   c:s=>!socraticActive&&!socraticFired.s2&&s.d>148&&s.d<165,
   socratic:true,
   q:s=>`Passing 150m. Using σ = P·R/t (R=3.25m, t=0.025m), predict the hoop stress σ in MPa. HY-80 yields at 550 MPa.`,
   reveal:s=>`σ = ${hoopMPa(s.d).toFixed(0)} MPa at ${s.d.toFixed(0)} m. Safety margin = ${((SUB.HY80-hoopMPa(s.d))/SUB.HY80*100).toFixed(0)}% vs HY-80 yield. SHI = ${SHI(s.d).toFixed(2)} — watch it approach 0.6.`,
   check:(val)=>{const n=parseFloat(val);return !isNaN(n)&&n>50&&n<450;},
   eq:'σ = P·R/t   (thin-wall Barlow)'},
  // SOCRATIC 3 — speed-SNR tradeoff (fires once per session)
  {id:'s3',
   c:s=>!socraticActive&&!socraticFired.s3&&s.vKt>11.5&&s.vKt<15,
   socratic:true,
   q:s=>`Speed is ${s.vKt.toFixed(1)} kt. Predict: will passive SNR get BETTER or WORSE vs 8 kts? Type "better" or "worse".`,
   reveal:s=>{const sl12=SL(vel);const sl8=110+30*Math.log10(8);const delta=(sl12-sl8).toFixed(1);return `WORSE by ~${delta} dB. Higher speed raises self-noise SL = 110+30·log₁₀(v). At ${s.vKt.toFixed(1)} kt: SL=${sl12.toFixed(0)} dB vs ${sl8.toFixed(0)} dB at 8 kt. You become louder → easier to detect.`;},
   check:(val)=>{const v=val.toLowerCase();return v.includes('wors')||v.includes('bad')||v.includes('decr')||v.includes('lower');},
   eq:'SL = 110 + 30·log₁₀(v_kt) → ↑speed = ↑self-noise'},
  // REACTIVE rules
  {c:s=>s.shi<0.35,t:s=>`🚨 CRITICAL: SHI=${s.shi.toFixed(2)}. Hull near crush depth (375m). ASCEND NOW — apply +dive planes immediately.`,eq:'SHI = 1 − D/D_crush'},
  {c:s=>s.d>SUB.MAX_D,t:s=>`⚠ Exceeded 250m ops limit. σ=${s.sigma.toFixed(0)} MPa vs HY-80 yield 550 MPa. Reduce depth.`,eq:'σ = P·R/t (hoop stress)'},
  {c:s=>s.m==='active',t:s=>`Active ping SNR=${s.snr.toFixed(1)}dB vs passive ${snrP(vel,cARange).toFixed(1)}dB. Two-way TL + TS advantage. But you reveal yourself.`,eq:'SNR_a = SL−2TL+TS−(NL−DI)'},
  {c:s=>s.cAP>0.88,t:s=>`Contact α confidence ${(s.cAP*100).toFixed(0)}%. Bayesian posterior converged. All pings consistent — track locked.`,eq:'P(H|D) = P(D|H)·P(H)/P(D)'},
  {c:s=>s.snr>10&&s.snr<20,t:s=>`SNR ${s.snr.toFixed(1)}dB ≥ DT(10dB). Pd=${(Pd(s.snr)*100).toFixed(0)}%. Closing range will raise confidence.`,eq:'Pd = 1/(1+e^(−0.5(SNR−DT)))'},
  {c:s=>s.m==='off',t:()=>'Running silent. No sonar emissions. Bayesian probability frozen. Ideal for covert approach.',eq:'NL = ambient + self-noise'},
  {c:s=>s.d>80&&s.d<130,t:s=>`Mid-layer. ρ=${rho(s.d).toFixed(1)}kg/m³. c=${mack(T_at(s.d),ocean.S,s.d).toFixed(0)}m/s. Observe density increase with depth.`,eq:'ρ = 1000 + 0.75S − 0.20T'},
  {c:()=>true,t:()=>'All nominal. Monitor SHI>0.33, SNR vs DT=10dB, contact confidence. Complete all 5 mission objectives.',eq:'F_net = F_t + F_b − F_w − F_d'},
];

function updateAI(shi,snr,vKt,d,cAP,m,inShadow,sigma,cs){
  if(spotPaused||socraticActive)return;
  const state={shi,snr,vKt,d,cAP,m,inShadow,sigma,cs};
  const rule=aiRules.find(r=>r.c(state));
  if(!rule)return;
  if(rule.socratic){
    triggerSocratic(rule,state);
  } else {
    sv('aitxt',rule.t(state));sv('aieq',rule.eq);
  }
}

function triggerSocratic(rule,state){
  // Mark this rule as fired immediately — prevents re-trigger on next tick
  if(rule.id) socraticFired[rule.id]=true;
  socraticActive=true;
  const wasRunning=running;
  if(wasRunning){running=false;cancelAnimationFrame(loopId);}
  socraticPending={rule,state,wasRunning};
  sv('aitxt','⚡ SOCRATIC — sim paused. Answer below, then press CHECK or SKIP.');
  sv('aieq',rule.eq);
  document.getElementById('ai-socratic-q').textContent=rule.q(state);
  document.getElementById('ai-socratic-in').value='';
  document.getElementById('ai-socratic-fb').textContent='';
  document.getElementById('ai-socratic-row').style.display='block';
  document.getElementById('ai-socratic-in').focus();
}

function checkSocratic(){
  if(!socraticPending)return;
  const val=document.getElementById('ai-socratic-in').value.trim();
  if(!val){document.getElementById('ai-socratic-fb').textContent='Please type an answer first.';return;}
  const {rule,state,wasRunning}=socraticPending;
  const correct=rule.check(val,state);
  const reveal=typeof rule.reveal==='function'?rule.reveal(state):rule.reveal;
  const fb=document.getElementById('ai-socratic-fb');
  fb.style.color=correct?'var(--green)':'var(--amber)';
  fb.textContent=(correct?'✓ Good prediction! ':'○ Review: ')+reveal;
  sv('aitxt', correct?'✓ Correct! Simulation resuming in 3s…':'○ Good try — explanation shown. Resuming in 3s…');
  sv('aieq', rule.eq);
  // Capture wasRunning NOW before clearing socraticPending
  const wr=wasRunning;
  // Disable CHECK/SKIP while countdown runs
  const checkBtn=document.querySelector('#aibar .btn.bt');
  const skipBtn=document.querySelector('#aibar .btn.ba');
  if(checkBtn)checkBtn.disabled=true;
  if(skipBtn)skipBtn.disabled=true;
  setTimeout(()=>{
    _clearSocratic(wr);
  },3000);
}

function dismissSocratic(){
  // Called by SKIP button — capture wasRunning before clearing
  if(!socraticPending)return;
  const wr=socraticPending.wasRunning;
  sv('aitxt','Skipped. Simulation resuming…');
  _clearSocratic(wr);
}

function _clearSocratic(resumeSim){
  // Central cleanup — called by both checkSocratic timeout and dismissSocratic
  socraticActive=false;
  socraticPending=null;
  document.getElementById('ai-socratic-row').style.display='none';
  document.getElementById('ai-socratic-fb').textContent='';
  // Re-enable buttons
  const checkBtn=document.querySelector('#aibar .btn.bt');
  const skipBtn=document.querySelector('#aibar .btn.ba');
  if(checkBtn)checkBtn.disabled=false;
  if(skipBtn)skipBtn.disabled=false;
  // Resume sim if it was running before the question
  if(resumeSim&&!running){
    running=true;rafTs=null;loopId=requestAnimationFrame(loop);
    const btn=document.getElementById('btn-run');
    if(btn){btn.textContent='⏸ PAUSE';btn.classList.add('on');}
  }
}

// ── STUDY MODE ─────────────────────────────────────────────────
let studyModeOn=false, studyStep=0, studyUnlocked=[true,...Array(9).fill(false)];

const STUDY_STEPS=[
  {id:'s1',title:'Step 1 — Hydrostatic Pressure',
   concept:'Every 10m you descend, pressure increases by ~0.1 MPa (1 atm). The equation is:\n\nP = P₀ + ρ·g·h\n\nwhere P₀ = 0.101 MPa (surface), ρ ≈ 1019 kg/m³, g = 9.81 m/s².',
   eq:'P = P₀ + ρ · g · h',
   question:'Predict: what will the pressure be at exactly 100m depth? (P₀=0.101, ρ=1019, g=9.81)',
   answer_check:(v)=>Math.abs(parseFloat(v)-1.103)<0.1,
   answer_hint:'≈ 1.10 MPa  →  0.101 + 1019×9.81×100/1e6',
   action:'Set Dive Planes to −20°, Throttle to 60%, Ballast 100%. Press ▶ START and dive to 100m. Check the Pressure metric.',
   verify:(s)=>s.d>95&&s.d<110},

  {id:'s2',title:'Step 2 — Seawater Density',
   concept:'Seawater density depends on temperature and salinity:\n\nρ = 1000 + 0.75·S − 0.20·T\n\nWarmer water is less dense. Saltier water is denser.',
   eq:'ρ = 1000 + 0.75·S − 0.20·T',
   question:'For SST=28°C, Salinity=33 PSU — calculate ρ (kg/m³):',
   answer_check:(v)=>Math.abs(parseFloat(v)-1019.15)<2,
   answer_hint:'1000 + 0.75×33 − 0.20×28 = 1019.15 kg/m³',
   action:'Open Controls → Ocean tab. Observe the density value in the Physics Table (🔬 button in AI Tutor).',
   verify:(s)=>true},

  {id:'s3',title:'Step 3 — Sound Speed (Mackenzie)',
   concept:'Sound speed in seawater follows the Mackenzie (1981) equation:\n\nc = 1448.96 + 4.591T − 0.05304T² + 2.374×10⁻⁴T³ + 1.340(S−35) + 0.01630Z + ...\n\nSimplified: c increases ~4.6 m/s per °C. Below the thermocline, T drops → c drops.',
   eq:'c = Mackenzie(T, S, Z)  [1981]',
   question:'At surface (T=28°C), estimate sound speed c (m/s) using the simplified form c ≈ 1449 + 4.6·T:',
   answer_check:(v)=>Math.abs(parseFloat(v)-1577.8)<30,
   answer_hint:'1449 + 4.6×28 = 1577.8 m/s (full Mackenzie gives ~1528 m/s)',
   action:'Observe the "Sound Speed" metric in the top strip. Note how it changes as you dive through the thermocline.',
   verify:(s)=>s.d>ocean.thermo+10},

  {id:'s4',title:'Step 4 — Acoustic Shadow Zone',
   concept:'Below the thermocline, sound speed decreases. By Snell\'s Law, acoustic rays bend toward the region of lower speed — DOWNWARD. This creates a shadow zone above the submarine where surface ships cannot hear you.',
   eq:'Snell: cos(θ)/c = constant → rays bend toward lower c',
   question:'Are you currently in the acoustic shadow zone? (Yes/No — check the sonar overlay SHADOW indicator)',
   answer_check:(v)=>v.toLowerCase().startsWith('y')||v.toLowerCase().includes('yes'),
   answer_hint:'Yes — dive below the thermocline depth shown in the sonar overlay to enter shadow zone.',
   action:'Dive below the thermocline. Look at the sonar overlay: "SHADOW: ACTIVE" confirms you are hidden.',
   verify:(s)=>s.d>ocean.thermo+5},

  {id:'s5',title:'Step 5 — Passive Sonar Equation',
   concept:'SNR = SL − TL − (NL − DI)\n\nSL = Source Level (target noise)\nTL = Transmission Loss = 20·log₁₀(R) + α·R\nNL = Ambient noise, DI = Array gain\n\nA higher SNR means better detection.',
   eq:'SNR = SL − TL − (NL − DI)',
   question:'If SL=145 dB, TL=87 dB, NL=62 dB, DI=15 dB — what is SNR?',
   answer_check:(v)=>Math.abs(parseFloat(v)-11)<3,
   answer_hint:'SNR = 145 − 87 − (62−15) = 145 − 87 − 47 = 11 dB',
   action:'Set sonar to Passive. Observe SNR in the metrics strip and on the sonar overlay. Try varying speed.',
   verify:(s)=>s.snr>5},

  {id:'s6',title:'Step 6 — Detection Probability',
   concept:'Detection probability follows a logistic model:\n\nPd = 1 / (1 + exp(−0.5·(SNR − DT)))\n\nDT = Detection Threshold = 0 dB. Pd = 50% when SNR = 0 dB. Pd > 90% when SNR > 4.4 dB.',
   eq:'Pd = 1 / (1 + exp(−0.5·(SNR − DT)))',
   question:'At SNR = 10 dB, DT = 0 dB — calculate Pd (as a %). Use exp(−5) ≈ 0.0067.',
   answer_check:(v)=>Math.abs(parseFloat(v)-99.3)<5,
   answer_hint:'Pd = 1/(1+exp(−0.5×10)) = 1/(1+0.0067) ≈ 99.3%',
   action:'Observe "Contact Pd" in the metrics strip. Run simulation and watch how Pd changes with depth and speed.',
   verify:(s)=>s.pd>0.5},

  {id:'s7',title:'Step 7 — Bayesian Contact Tracking',
   concept:'Each sonar detection updates contact confidence using Bayes\' theorem:\n\nP(H|D) = P(D|H)·P(H) / P(D)\n\nStarting at P=0.60, each consistent ping increases confidence. This is how the military-grade tracker works — pure probability theory.',
   eq:'P(H|D) = P(D|H)·P(H) / P(D)  [Bayes]',
   question:'If prior confidence is 0.60 and likelihood P(D|H)=0.9, P(D|¬H)=0.1 — what is the posterior?',
   answer_check:(v)=>Math.abs(parseFloat(v)-0.931)<0.05||Math.abs(parseFloat(v)-93.1)<5,
   answer_hint:'P(D)=0.9×0.60+0.1×0.40=0.58; posterior=0.9×0.60/0.58=0.931 (93.1%)',
   action:'Watch the "Contact Pd %" metric in the header strip rise as you run passive sonar. Note when it crosses 80%.',
   verify:(s)=>s.pd>0.75},

  {id:'s8',title:'Step 8 — Hoop Stress & SHI',
   concept:'The pressure hull experiences circumferential (hoop) stress:\n\nσ = P·R/t\n\nR = hull radius (3.25m), t = wall thickness (0.025m). HY-80 steel yields at 550 MPa. SHI = 1 − D/D_crush tracks safety.',
   eq:'σ = P·R/t   SHI = 1 − D/D_crush',
   question:'At depth 200m, P≈2.10 MPa. Calculate σ (MPa) using R=3.25, t=0.025:',
   answer_check:(v)=>Math.abs(parseFloat(v)-273)<25,
   answer_hint:'σ = 2.10 × 3.25 / 0.025 = 273 MPa (margin vs 550 MPa HY-80 yield)',
   action:'Dive to 200m and observe σ in the Physics Table and SHI in the metrics strip. Note the color change.',
   verify:(s)=>s.d>190},

  {id:'s9',title:'Step 9 — 6-DoF Dynamics',
   concept:'Submarine motion is governed by 6 degrees of freedom. The depth equation:\n\ndz/dt = v·sin(θ)\n\nThrust minus drag determines acceleration:\n\nm·dv/dt = F_thrust − F_drag − F_buoyancy_net\n\nBallast tanks control net buoyancy.',
   eq:'m·dv/dt = F_t − F_d − F_b_net',
   question:'If thrust = 120,000 N, drag = 85,000 N, net buoyancy = 20,000 N — what is net force (N)?',
   answer_check:(v)=>Math.abs(parseFloat(v)-15000)<5000,
   answer_hint:'F_net = 120,000 − 85,000 − 20,000 = 15,000 N (acceleration upward)',
   action:'Try setting throttle to 80% and observe the speed response. Compare with ballast at 50% vs 100%.',
   verify:(s)=>s.v>4},

  {id:'s10',title:'Step 10 — Mission Integration',
   concept:'You have now worked through all 7 physics layers:\n1. Hydrostatics → 2. Density → 3. Sound speed → 4. Shadow zone → 5. Sonar equation → 6. Detection Pd → 7. Bayesian tracker → 8. Structural health → 9. Dynamics\n\nComplete all 5 mission objectives to finish the integrated exercise.',
   eq:'All 7 layers coupled: Ocean → Vehicle → Sonar → Structure → AI',
   question:'How many mission objectives have you completed? (0–5)',
   answer_check:(v)=>{const n=parseInt(v);return !isNaN(n)&&n>=0&&n<=5;},
   answer_hint:'Check the right panel Mission Status. Goal: complete all 5 before SHI < 0.5.',
   action:'Run a full mission: dive below 50m, reach 10 kts, achieve Pd > 80%, maintain SHI > 0.7, ascend safely. Then press 📋 MISSION DEBRIEF.',
   verify:(s)=>true},
];

function toggleStudyMode(){
  if(!studyModeOn){
    studyModeOn=true;
    if(running){running=false;cancelAnimationFrame(loopId);}
    studyStep=0;
    document.getElementById('study-overlay').classList.add('show');
    document.getElementById('btn-study').textContent='📖 STUDY MODE: ON';
    document.getElementById('btn-study').classList.add('on');
    renderStudyStep();
    toast('Study Mode activated — sim paused for guided learning');
  } else {
    closeStudyMode();
  }
}

function closeStudyMode(){
  studyModeOn=false;
  document.getElementById('study-overlay').classList.remove('show');
  document.getElementById('btn-study').textContent='📖 STUDY MODE: OFF';
  document.getElementById('btn-study').classList.remove('on');
  toast('Study Mode closed. Return to Free Play.');
}

function renderStudyStep(){
  const step=STUDY_STEPS[studyStep];
  if(!step)return;
  const total=STUDY_STEPS.length;
  const pct=((studyStep+1)/total*100);
  document.getElementById('study-progress-fill').style.width=pct+'%';
  document.getElementById('study-progress-txt').textContent=`Step ${studyStep+1} of ${total} — ${step.title}`;

  document.getElementById('study-step-container').innerHTML=`
    <div class="study-step-title">${step.title}</div>
    ${studyUnlocked[studyStep]&&studyStep>0?'<div class="study-unlock-badge">✓ UNLOCKED</div>':''}
    <div class="study-concept" style="white-space:pre-line">${step.concept}</div>
    <div class="study-eq-box">${step.eq}</div>
    <div class="study-predict">
      <div class="study-predict-q">🔢 Predict: ${step.question}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
        <input class="study-predict-inp" id="study-ans-input" placeholder="Enter your answer…"
          style="flex:1" onkeydown="if(event.key==='Enter')checkStudyAnswer()">
        <button class="btn bg" style="width:auto;padding:4px 14px;margin:0;font-size:10px"
          onclick="checkStudyAnswer()">CHECK ✓</button>
      </div>
      <div id="study-ans-feedback" style="font-family:var(--mono);font-size:9px;margin-top:5px;min-height:14px"></div>
    </div>
    <div style="background:rgba(0,200,224,.05);border:1px solid var(--b1);border-radius:3px;padding:7px 10px;font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:6px;line-height:1.6">
      <b style="color:var(--teal)">▶ ACTION:</b> ${step.action}
    </div>
  `;
  // Focus the input after render
  setTimeout(()=>{const inp=document.getElementById('study-ans-input');if(inp)inp.focus();},50);

  const prevBtn=document.getElementById('study-prev-btn');
  const nextBtn=document.getElementById('study-next-btn');
  const runBtn=document.getElementById('study-run-btn');
  prevBtn.style.display=studyStep>0?'inline-block':'none';
  nextBtn.textContent=studyStep<total-1?'NEXT ▶':'🏁 FINISH';
  // Grey out NEXT if next step not yet unlocked
  const nextIdx=studyStep+1;
  nextBtn.disabled=(nextIdx<total&&!studyUnlocked[nextIdx]);
  nextBtn.style.opacity=(nextIdx<total&&!studyUnlocked[nextIdx])?'0.4':'1';
  runBtn.style.display='inline-block';
  runBtn.textContent=running?'⏸ PAUSE SIM':'▶ RUN SIM';
  document.getElementById('study-feedback').style.display='none';
}

function checkStudyAnswer(){
  const step=STUDY_STEPS[studyStep];
  const inp=document.getElementById('study-ans-input');
  const val=inp?inp.value.trim():'';
  if(!val){
    const fb=document.getElementById('study-ans-feedback');
    if(fb){fb.style.color='var(--amber)';fb.textContent='Please type an answer first.';}
    return;
  }
  const correct=step.answer_check(val);
  const fb=document.getElementById('study-ans-feedback');
  if(correct){
    fb.style.color='var(--green)';
    fb.textContent='✓ Correct! '+step.answer_hint;
    if(studyStep+1<STUDY_STEPS.length&&!studyUnlocked[studyStep+1]){
      studyUnlocked[studyStep+1]=true;
      setTimeout(()=>toast('Step '+(studyStep+2)+' unlocked! Press NEXT ▶'),400);
    }
    // Enable NEXT button immediately after correct answer
    const nextBtn=document.getElementById('study-next-btn');
    if(nextBtn){nextBtn.disabled=false;nextBtn.style.opacity='1';}
  } else {
    fb.style.color='var(--amber)';
    fb.textContent='○ Not quite. Hint: '+step.answer_hint;
  }
}

function studyNav(dir){
  const next=studyStep+dir;
  if(next<0||next>=STUDY_STEPS.length)return;
  if(dir>0&&!studyUnlocked[next]){
    toast('Answer the prediction question correctly to unlock this step.');
    return;
  }
  studyStep=next;
  renderStudyStep();
}

function studyRunVerify(){
  if(!running){
    running=true;rafTs=null;loopId=requestAnimationFrame(loop);
    document.getElementById('study-run-btn').textContent='⏸ PAUSE SIM';
    document.getElementById('btn-run').textContent='⏸ PAUSE';
    document.getElementById('btn-run').classList.add('on');
  } else {
    running=false;cancelAnimationFrame(loopId);
    document.getElementById('study-run-btn').textContent='▶ RUN SIM';
    document.getElementById('btn-run').textContent='▶ RESUME';
    document.getElementById('btn-run').classList.remove('on');
  }
}

// ── TELEMETRY CSV EXPORT ────────────────────────────────────────
function exportCSV(){
  if(!telLog||telLog.length===0){toast('No telemetry data — run the simulation first.');return;}
  const header=['time_s','depth_m','speed_kt','pitch_deg','pressure_MPa','density_kgm3',
    'sound_speed_ms','source_level_dB','transmission_loss_dB','passive_SNR_dB',
    'detection_Pd_pct','contact_confidence_pct','contact_range_km',
    'SHI','hoop_stress_MPa','failure_prob_pct','sonar_mode'];
  const rows=telLog.map(r=>[
    r.t.toFixed(1), r.d.toFixed(2), r.v.toFixed(2), r.p.toFixed(2),
    r.pres.toFixed(4), r.rho.toFixed(2), r.cs.toFixed(1),
    r.sl.toFixed(1), r.tl.toFixed(1), r.snr.toFixed(2),
    (r.pd*100).toFixed(1), (r.pd*100).toFixed(1),
    (r.range/1000).toFixed(3), r.shi.toFixed(4),
    r.sigma.toFixed(1), r.pf.toFixed(4), r.mode||'passive'
  ].join(','));

  const meta=[
    '# NAVSIM-DT v11 Telemetry Export — ProximaED',
    '# Scenario: '+SCENARIOS[scenIdx].name,
    '# SST: '+ocean.SST+'°C  Salinity: '+ocean.S+' PSU  Thermocline: '+ocean.thermo+' m',
    '# Exported: '+new Date().toISOString(),
    '# Regulatory: Public-domain Type-209 SSK parameters. Educational use only.',
    '# Equations: Mackenzie(1981) sound speed; Barlow hoop stress; logistic Pd; Bayesian P(H|D)',
    '#'
  ].join('\n');

  const csvContent=meta+'\n'+header.join(',')+'\n'+rows.join('\n');
  const blob=new Blob([csvContent],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='NAVSIM_DT_Telemetry_'+SCENARIOS[scenIdx].name.replace(/\s/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported — '+telLog.length+' samples, '+header.length+' columns');
}





// ── MAIN LOOP ──────────────────────────────────────────────────
function loop(ts){
  if(!running)return;
  if(!rafTs)rafTs=ts;
  const rawDt=Math.min((ts-rafTs)/1000,0.1);
  rafTs=ts;
  const steps=Math.max(1,simSpeed);
  const dt=rawDt/steps;
  for(let i=0;i<steps;i++)tick(dt);
  if(demoRunning) advanceDemo(rawDt);
  updateUI();drawSonar();drawDepth();
  loopId=requestAnimationFrame(loop);
}

// Idle loop — keeps sonar and canvas alive when paused
let idleId;
function idleLoop(ts){
  if(!running){drawSonar();drawDepth()}
  idleId=requestAnimationFrame(idleLoop);
}

function toggleRun(){
  running=!running;
  const btn=document.getElementById('btn-run');
  if(running){
    rafTs=null;
    if(elapsed===0){stats.startTime=Date.now();stats.thermoTime=0;stats.minSHI=1;stats.maxPd=0;stats.maxDepth=0;stats.maxSpeed=0;}
    loopId=requestAnimationFrame(loop);
    btn.textContent='⏸ PAUSE';btn.classList.add('on');
    toast('Simulation running — '+SCENARIOS[scenIdx].name);
  } else {
    cancelAnimationFrame(loopId);
    btn.textContent='▶ RESUME';btn.classList.remove('on');
    toast('Paused at T+ '+Math.floor(elapsed)+'s');
  }
}

function resetSim(){
  const wasRun=running;
  if(running){running=false;cancelAnimationFrame(loopId)}
  depth=vel=pitch=yaw=elapsed=pingTimer=histIdx=0;
  cAProb=0.60;cARange=18000;cBProb=0;cBRange=12000;
  blips=[];mGoals.fill(false);depHist.fill(null);
  telLog.length=0;delete telLog._last;
  spotFired=false;spotPaused=false;
  socraticFired.s1=false;socraticFired.s2=false;socraticFired.s3=false;
  socraticActive=false;socraticPending=null;
  document.getElementById('ai-socratic-row').style.display='none';
  stats={thermoTime:0,minSHI:1,maxPd:0,maxDepth:0,maxSpeed:0,startTime:0};
  const sliderMap={'sl-thr':'lv-thr','sl-dive':'lv-dive','sl-ball':'lv-ball','sl-rud':'lv-rud'};
  ['sl-thr','sl-dive','sl-ball','sl-rud'].forEach(id=>{
    document.getElementById(id).value=0;
    if(sliderMap[id])sv(sliderMap[id],'0');
  });
  const btn=document.getElementById('btn-run');
  btn.textContent='▶ START SIMULATION';btn.classList.remove('on');
  document.getElementById('cc-b-row').style.display='none';
  updateUI();drawSonar();drawDepth();
  toast('Reset complete');
}

function loadScenario(idx){
  scenIdx=idx;ocean={...SCENARIOS[idx]};
  document.querySelectorAll('.scard').forEach((c,i)=>c.classList.toggle('on',i===idx));
  sv('ev-sst',ocean.SST);sv('ev-sal',ocean.S);sv('ev-thr',ocean.thermo);
  sv('ev-ss',ocean.SS);sv('ev-wh',ocean.wh);sv('ev-nl',ocean.NL);sv('ev-cu',ocean.curr);
  resetSim();toast('Loaded: '+SCENARIOS[idx].name);
}

function switchTab(t){
  document.getElementById('tab-sc').classList.toggle('on',t==='sc');
  document.getElementById('tab-oc').classList.toggle('on',t==='oc');
  document.getElementById('pane-sc').style.display=t==='sc'?'block':'none';
  document.getElementById('pane-oc').style.display=t==='oc'?'block':'none';
}

function onSonarChange(){
  const m=sonarMode();
  sv('sonar-mode-lbl',m.toUpperCase());
  document.getElementById('pill-son').className='pill '+(m==='off'?'wn':'ok');
}

// ── AUTO DEMO ──────────────────────────────────────────────────
let demoRunning=false,demoTime=0,demoStepIdx=0;
const DEMO=[
  {t:0,   thr:0,  dive:0,  ball:0,  rud:0, sonar:'passive', msg:'DEMO: Platform surfaced. Flooding ballast tanks to submerge…'},
  {t:2,   thr:40, dive:0,  ball:100,rud:0, sonar:'passive', msg:'DEMO: Ballast 100% — submerged mass 1,810 t. Throttle up, applying dive planes…'},
  {t:5,   thr:65, dive:-14,ball:100,rud:0, sonar:'passive', msg:'DEMO: Diving! Pitch −14°. Watch depth meter and pressure rise. F_net = F_t + F_b − F_w − F_d'},
  {t:18,  thr:60, dive:-6, ball:100,rud:0, sonar:'passive', msg:'DEMO: Approaching thermocline ('+ocean.thermo+'m). Sound speed about to drop — acoustic shadow zone activating.'},
  {t:32,  thr:55, dive:0,  ball:100,rud:0, sonar:'passive', msg:'DEMO: Level at ops depth. Passive sonar pinging every 10s — watch Contact α blip appear at 145°.'},
  {t:48,  thr:55, dive:0,  ball:100,rud:8, sonar:'passive', msg:'DEMO: Rudder right — yaw change. Bayesian tracker updating contact confidence with each ping.'},
  {t:62,  thr:72, dive:-4, ball:100,rud:0, sonar:'active',  msg:'DEMO: Switched to ACTIVE sonar. Watch SNR jump! Two-way TL + Target Strength advantage. Contact β may appear.'},
  {t:80,  thr:45, dive:0,  ball:100,rud:0, sonar:'active',  msg:'DEMO: Contact lock established. Pd rising. Below 100m — Contact β detected at 220°.'},
  {t:98,  thr:35, dive:6,  ball:100,rud:0, sonar:'passive', msg:'DEMO: Ascending — positive dive planes. Watch SHI recover as pressure drops.'},
  {t:114, thr:20, dive:10, ball:50, rud:0, sonar:'passive', msg:'DEMO: Reducing ballast 50%, slowing. Safe ascent profile — buoyancy increasing.'},
  {t:130, thr:10, dive:6,  ball:0,  rud:0, sonar:'passive', msg:'DEMO: Surface approach. Mission objectives ticking off. Check debrief for your session grade!'},
  {t:148, thr:0,  dive:0,  ball:0,  rud:0, sonar:'passive', msg:'DEMO complete! All 7 physics layers demonstrated. Press RESET then try manual control.'},
];

function setSlider(id,val){
  const el=document.getElementById(id);if(!el)return;
  el.value=val;
  const lv={'sl-thr':'lv-thr','sl-dive':'lv-dive','sl-ball':'lv-ball','sl-rud':'lv-rud'}[id];
  if(lv)sv(lv,val);
}

function applyDemo(step){
  setSlider('sl-thr',step.thr);
  setSlider('sl-dive',step.dive);
  setSlider('sl-ball',step.ball);
  setSlider('sl-rud',step.rud);
  document.getElementById('sel-sonar').value=step.sonar;
  onSonarChange();
  sv('aitxt',step.msg);
  sv('aieq','AUTO-DEMO STEP '+(demoStepIdx+1)+'/'+DEMO.length);
}

function advanceDemo(rawDt){
  demoTime+=rawDt;
  const next=DEMO[demoStepIdx+1];
  if(next&&demoTime>=next.t){
    demoStepIdx++;
    applyDemo(DEMO[demoStepIdx]);
    if(demoStepIdx>=DEMO.length-1) stopDemo();
  }
}

function toggleDemo(){
  if(demoRunning){stopDemo();return;}
  resetSim();
  demoRunning=true;demoTime=0;demoStepIdx=0;
  const btn=document.getElementById('btn-demo');
  btn.textContent='■ STOP DEMO';btn.classList.add('on');
  applyDemo(DEMO[0]);
  if(!running)toggleRun();
  toast('Auto-demo running — watch all systems activate automatically');
}

function stopDemo(){
  demoRunning=false;
  const btn=document.getElementById('btn-demo');
  btn.textContent='▷ AUTO DEMO';btn.classList.remove('on');
  toast('Demo finished — try manual control');
}

// ── SPOTLIGHT ──────────────────────────────────────────────────
function fireSpotlight(){
  const sigma=hoopMPa(depth);
  const margin=((SUB.HY80-sigma)/SUB.HY80*100).toFixed(1);
  spotPaused=true;
  if(running){running=false;cancelAnimationFrame(loopId);document.getElementById('btn-run').textContent='▶ RESUME';document.getElementById('btn-run').classList.remove('on')}
  document.getElementById('spot-eq').textContent='σ = P·R / t_hull  (thin-wall hoop stress)';
  document.getElementById('spot-body').textContent=`Hull stress is now ${sigma.toFixed(0)} MPa at depth ${depth.toFixed(0)} m.\nHY-80 steel yield strength = 550 MPa.\nHydrostatic pressure P = ${pressMPa(depth).toFixed(2)} MPa.\nHull radius R = ${SUB.R} m, thickness t = ${SUB.T_HULL} m.`;
  document.getElementById('spot-q').textContent=`Q: What is the safety margin? (yield − current stress) / yield × 100 = ?%`;
  document.getElementById('spot-in').value='';
  document.getElementById('spot-feedback').textContent='';
  document.getElementById('spot-overlay').classList.add('show');
  toast('Equation Spotlight activated — answer to resume simulation');
}

function checkSpotlight(){
  const sigma=hoopMPa(depth);
  const correct=((SUB.HY80-sigma)/SUB.HY80*100);
  const ans=parseFloat(document.getElementById('spot-in').value);
  const fb=document.getElementById('spot-feedback');
  if(isNaN(ans)){fb.style.color='var(--red)';fb.textContent='Please enter a number.';return;}
  if(Math.abs(ans-correct)<5){
    fb.style.color='var(--green)';
    fb.textContent=`✓ Correct! Safety margin ≈ ${correct.toFixed(1)}%. SHI = ${SHI(depth).toFixed(2)}. You may resume simulation — ascend immediately.`;
    setTimeout(dismissSpotlight,2000);
  } else {
    fb.style.color='var(--red)';
    fb.textContent=`✗ Not quite. Hint: (550 − ${sigma.toFixed(0)}) / 550 × 100 = ${correct.toFixed(1)}%. Try again.`;
  }
}

function dismissSpotlight(){
  document.getElementById('spot-overlay').classList.remove('show');
  spotPaused=false;
  if(!running)toggleRun();
}

// ── GUIDED LABS ────────────────────────────────────────────────
const LABS=[
  {
    title:'Lab 1 — Hydrostatic Pressure',
    steps:[
      {type:'inst',text:'Set Ballast → 100%, Throttle → 50%, Dive Planes → −12°. Start the simulation and dive to approximately 200 m.',eq:'P = P₀ + ρgh',hint:'Watch the Pressure metric in the top strip. It should reach ~2.0 MPa at 200 m.'},
      {type:'obs',text:'Observe the values when depth ≈ 200 m:',fields:['Depth (m)','Pressure (MPa)','Seawater density ρ (kg/m³)']},
      {type:'q',q:'Calculate: P = P₀ + ρ × g × h. Use P₀=0.101 MPa, ρ=1025 kg/m³, g=9.81, h=200 m. What is P in MPa?',correct:2.11,tol:0.15,eq:'P = 0.101 + 1025 × 9.81 × 200 / 1e6 = 2.113 MPa'},
    ]
  },
  {
    title:'Lab 2 — Sonar: Passive vs Active',
    steps:[
      {type:'inst',text:'Dive to 80–120 m. Set Throttle → 30% (slow, quiet). Note the passive SNR when contact range ≈ 8 km. Then switch to Active sonar and observe SNR again.',eq:'SNR_p = SL−TL−(NL−DI)  vs  SNR_a = SL−2TL+TS−(NL−DI)',hint:'The active sonar adds Target Strength (TS ≈ 12 dB for SSK hull) but doubles the transmission loss TL.'},
      {type:'obs',text:'Record both SNR values at similar range:',fields:['Range (km)','Passive SNR (dB)','Active SNR (dB)','Difference (dB)']},
      {type:'q',q:'At 8 km range, TL = 20×log₁₀(8000) + 0.003×8000 = 97.9 + 24 = 121.9 dB. TS ≈ 12 dB. By how much (dB) does active sonar differ from passive in theory? (Hint: passive uses 1×TL, active uses 2×TL − TS)',correct:-109.9,tol:15,eq:'Active gain vs passive = TS − TL = 12 − 121.9 ≈ −110 dB net (active actually worse at long range!)'},
    ]
  },
  {
    title:'Lab 3 — Thermocline & Acoustic Shadow',
    steps:[
      {type:'inst',text:'In the sonar display, find the dashed blue circle — that is the thermocline depth ring. Dive through it slowly (Throttle 30%, Dive −6°). Note the sound speed before and after crossing.',eq:'c = Mackenzie(T, S, Z)',hint:'The thermocline for Bay of Bengal is at 65 m. Sound speed drops significantly there due to temperature decrease.'},
      {type:'obs',text:'Record sound speed values:',fields:['Sound speed at surface (m/s)','Sound speed at thermocline (m/s)','Sound speed at 150 m (m/s)','Thermocline depth (m)']},
      {type:'q',q:'The Mackenzie formula at surface (T=28.4°C, S=33.2 PSU, Z=0) gives c ≈ ? m/s. Choose closest: (A) 1521  (B) 1534  (C) 1548',correct:1,tol:0.4,eq:'c = 1448.96 + 4.591×28.4 − 0.05304×28.4² + 0.016×0 + (1.34−0.01025×28.4)×(33.2−35) ≈ 1534 m/s → Answer B',choiceMode:true,choices:['A','B','C']},
    ]
  }
];

let labIdx=0,labStepIdx=0,labObs={};

function showLab(){
  labStepIdx=0;
  renderLab();
  document.getElementById('lab-overlay').classList.add('show');
}
function hideLab(){document.getElementById('lab-overlay').classList.remove('show')}
function selectLab(i){
  labIdx=i;labStepIdx=0;
  renderLab();
}
function togglePanel(side){
  const el=document.getElementById(side);
  el.classList.toggle('collapsed');
  const btn=document.getElementById('tg-'+side);
  if(side==='left') btn.textContent=el.classList.contains('collapsed')?'▶':'◀';
  else btn.textContent=el.classList.contains('collapsed')?'◀':'▶';
}


function renderLab(){
  const lab=LABS[labIdx];
  const step=lab.steps[labStepIdx];
  sv('lab-prog',`Lab ${String.fromCharCode(65+labIdx)} — Step ${labStepIdx+1}/${lab.steps.length}`);
  document.querySelectorAll('.lab-tab').forEach(t=>t.classList.toggle('on',+t.dataset.lab===labIdx));


  let html=`<div class="lab-step-title">${lab.title}</div>`;
  html+=`<div class="lab-step-eq">${step.eq||''}</div>`;

  if(step.type==='inst'){
    html+=`<div class="lab-step-body">${step.text}</div>`;
    html+=`<div class="lab-hint">💡 Hint: ${step.hint}</div>`;
    // Live readings
    const cs=mack(T_at(depth),ocean.S,depth);
    html+=`<div class="lab-obs"><b>Current sim state:</b><br>Depth: <b>${depth.toFixed(0)} m</b> · Pressure: <b>${pressMPa(depth).toFixed(2)} MPa</b> · Sound speed: <b>${cs.toFixed(0)} m/s</b> · SNR: <b>${getSNR().toFixed(1)} dB</b></div>`;
  }
  else if(step.type==='obs'){
    html+=`<div class="lab-step-body">${step.text}</div>`;
    step.fields.forEach((f,i)=>{
      const key='obs_'+labIdx+'_'+i;
      html+=`<div style="margin-bottom:6px"><div class="lab-q">${f}</div><input class="lab-input" id="${key}" placeholder="Enter your observed value…" value="${labObs[key]||''}"></div>`;
    });
  }
  else if(step.type==='q'){
    html+=`<div class="lab-q">${step.q}</div>`;
    if(step.choiceMode){
      html+=`<div style="display:flex;gap:8px;margin-bottom:8px">`;
      step.choices.forEach((c,i)=>{
        html+=`<button class="btn bt" style="width:auto;padding:5px 14px;margin:0" onclick="checkLabChoice(${i})">${c}</button>`;
      });
      html+='</div>';
    } else {
      html+=`<input class="lab-input" id="lab-ans" placeholder="Your numerical answer…" onkeydown="if(event.key==='Enter')checkLab()">`;
      html+=`<button class="btn bt" style="width:auto;padding:5px 14px;margin:0" onclick="checkLab()">SUBMIT</button>`;
    }
    html+=`<div class="lab-feedback" id="lab-fb"></div>`;
  }

  document.getElementById('lab-content').innerHTML=html;

  // Nav buttons
  let nav=``;
  if(labIdx>0||labStepIdx>0) nav+=`<button class="btn ba" style="width:auto;padding:5px 14px;margin:0" onclick="labBack()">◀ BACK</button>`;
  if(step.type!=='q') nav+=`<button class="btn bt" style="width:auto;padding:5px 14px;margin:0;margin-left:auto" onclick="labNext()">NEXT ▶</button>`;
  nav+=`<button class="btn ba" style="width:auto;padding:5px 10px;margin:0;margin-left:auto" onclick="hideLab()">CLOSE</button>`;
  document.getElementById('lab-nav').innerHTML=nav;
}

function labNext(){
  // Save obs inputs
  const step=LABS[labIdx].steps[labStepIdx];
  if(step.type==='obs'){
    step.fields.forEach((f,i)=>{
      const key='obs_'+labIdx+'_'+i;
      const el=document.getElementById(key);
      if(el)labObs[key]=el.value;
    });
  }
  labStepIdx++;
  if(labStepIdx>=LABS[labIdx].steps.length){
    labStepIdx=LABS[labIdx].steps.length-1;
    toast(`Lab ${String.fromCharCode(65+labIdx)} complete! Pick another tab to try a different lab.`);
    return;
  }
  renderLab();
}

function labBack(){
  labStepIdx=Math.max(0,labStepIdx-1);
  renderLab();
}

function checkLab(){
  const step=LABS[labIdx].steps[labStepIdx];
  const ans=parseFloat(document.getElementById('lab-ans').value);
  const fb=document.getElementById('lab-fb');fb.style.display='block';
  if(isNaN(ans)){fb.className='lab-feedback err';fb.textContent='Please enter a number.';return;}
  if(Math.abs(ans-step.correct)<step.tol){
    fb.className='lab-feedback ok';
    fb.innerHTML=`✓ Correct! ${step.eq}<br>Well done — proceed to next step.`;
    setTimeout(labNext,2200);
  } else {
    fb.className='lab-feedback err';
    fb.innerHTML=`✗ Not quite (you entered ${ans}, expected ≈ ${step.correct}). Hint: ${step.eq.split('→')[0]}`;
  }
}

function checkLabChoice(i){
  const step=LABS[labIdx].steps[labStepIdx];
  let fb=document.getElementById('lab-fb');
  if(!fb){fb=document.createElement('div');fb.id='lab-fb';fb.className='lab-feedback';document.getElementById('lab-content').appendChild(fb)}
  fb.style.display='block';
  if(i===step.correct){
    fb.className='lab-feedback ok';
    fb.innerHTML=`✓ Correct! ${step.eq}`;
    setTimeout(labNext,2500);
  } else {
    fb.className='lab-feedback err';
    fb.textContent=`✗ Not quite. ${step.eq}`;
  }
}

// ── DEBRIEF ────────────────────────────────────────────────────
function showDebrief(){
  if(elapsed<10){toast('Run the simulation first!');return;}
  const done=mGoals.filter(Boolean).length;
  const mPct=done/5;
  const shiScore=stats.minSHI>0.7?1:stats.minSHI>0.4?0.6:0.2;
  const pdScore=stats.maxPd>0.8?1:stats.maxPd>0.5?0.6:0.2;
  const thermoBonus=Math.min(stats.thermoTime/60,1)*0.5;
  const raw=mPct*0.4+shiScore*0.25+pdScore*0.2+thermoBonus*0.15;
  const grade=raw>=0.9?'A+':raw>=0.8?'A':raw>=0.7?'B+':raw>=0.6?'B':raw>=0.5?'C':'D';
  const gradCol=raw>=0.8?'var(--green)':raw>=0.6?'var(--amber)':'var(--red)';

  sv('dbr-sub',`Scenario: ${SCENARIOS[scenIdx].name} · Duration: T+ ${pad(Math.floor(elapsed/3600))}:${pad(Math.floor(elapsed%3600/60))}:${pad(Math.floor(elapsed%60))}`);
  document.getElementById('dbr-gval').textContent=grade;
  document.getElementById('dbr-gval').style.color=gradCol;

  const cells=[
    ['Max Depth',stats.maxDepth.toFixed(0)+' m',stats.maxDepth>50?'cg':'ca'],
    ['Max Speed',stats.maxSpeed.toFixed(1)+' kt',stats.maxSpeed>10?'cg':'ca'],
    ['Min SHI',stats.minSHI.toFixed(2),stats.minSHI>0.7?'cg':stats.minSHI>0.4?'ca':'cr'],
    ['Peak Contact Pd',(stats.maxPd*100).toFixed(0)+'%',stats.maxPd>0.8?'cg':'ca'],
    ['Time in Shadow',stats.thermoTime.toFixed(0)+' s',stats.thermoTime>30?'cg':'ca'],
    ['Objectives Done',done+'/5',done>=4?'cg':done>=2?'ca':'cr'],
  ];
  document.getElementById('dbr-grid').innerHTML=cells.map(([k,v,c])=>
    `<div class="dbr-cell"><div class="dbr-key">${k}</div><div class="dbr-val ${c}">${v}</div></div>`
  ).join('');

  const feedback=raw>=0.9?'Outstanding mission! All objectives achieved with excellent hull integrity and sonar tracking performance.'
    :raw>=0.8?'Very good mission. Strong sonar performance and safe depth management. Try reaching deeper with SHI maintained above 0.7.'
    :raw>=0.6?'Solid run. Work on contact confidence — try switching between passive and active sonar to see the SNR difference.'
    :raw>=0.4?'Developing skills. Focus on crossing the thermocline and maintaining passive sonar contact for longer periods.'
    :'Early stage. Use the Guided Lab to understand the physics equations, then run Auto Demo to see optimal technique.';

  sv('dbr-ai',`Grade ${grade} (${(raw*100).toFixed(0)}%) — ${feedback}\n\nPhysics summary: σ_max=${hoopMPa(stats.maxDepth).toFixed(0)} MPa at max depth ${stats.maxDepth.toFixed(0)} m. Safety margin vs HY-80 yield (550 MPa) = ${((SUB.HY80-hoopMPa(stats.maxDepth))/SUB.HY80*100).toFixed(1)}%.`);

  document.getElementById('dbr-overlay').classList.add('show');
}
function hideDebrief(){document.getElementById('dbr-overlay').classList.remove('show')}

// ── AI CHAT (Claude API) ───────────────────────────────────────
function showChat(){document.getElementById('chat-overlay').classList.add('show')}
function hideChat(){document.getElementById('chat-overlay').classList.remove('show')}

function simContext(){
  return `Current NAVSIM-DT simulation state:
Scenario: ${SCENARIOS[scenIdx].name} (SST ${ocean.SST}°C, Salinity ${ocean.S} PSU, Thermocline ${ocean.thermo}m)
Depth: ${depth.toFixed(0)}m | Speed: ${(vel*1.944).toFixed(1)}kt | Pitch: ${pitch.toFixed(1)}°
Pressure: ${pressMPa(depth).toFixed(2)} MPa | Sound speed: ${mack(T_at(depth),ocean.S,depth).toFixed(0)} m/s
SHI: ${SHI(depth).toFixed(2)} | Hoop stress: ${hoopMPa(depth).toFixed(0)} MPa | HY-80 yield: 550 MPa
Sonar mode: ${sonarMode()} | SNR: ${getSNR().toFixed(1)} dB | Contact Pd: ${(cAProb*100).toFixed(0)}%
Contact range: ${(cARange/1000).toFixed(1)} km | In acoustic shadow: ${depth>ocean.thermo}
All parameters public-domain (Type-209 SSK). Educational platform.`;
}

// ── Provider switch + persisted keys ──
let aiProvider='claude';
function setAIProvider(p){
  aiProvider=p;
  document.getElementById('prov-claude').classList.toggle('on',p==='claude');
  document.getElementById('prov-gemini').classList.toggle('on',p==='gemini');
  document.getElementById('claude-key').style.display=p==='claude'?'block':'none';
  document.getElementById('gemini-key').style.display=p==='gemini'?'block':'none';
}
['claude-key','gemini-key'].forEach(id=>{
  document.addEventListener('DOMContentLoaded',()=>{
    const el=document.getElementById(id);if(!el)return;
    el.value=localStorage.getItem('navsim_'+id)||'';
    el.addEventListener('input',()=>localStorage.setItem('navsim_'+id,el.value));
  });
});

async function sendChat(){
  const inp=document.getElementById('chat-in');
  const q=inp.value.trim();
  if(!q)return;
  inp.value='';

  const msgs=document.getElementById('chat-msgs');
  msgs.innerHTML+=`<div class="chat-msg user"><div class="chat-avatar av-user">YOU</div><div class="chat-bubble bubble-user">${q}</div></div>`;
  const typingId='typing-'+Date.now();
  msgs.innerHTML+=`<div class="chat-msg" id="${typingId}"><div class="chat-avatar av-ai">AI</div><div class="chat-bubble bubble-ai chat-typing">Thinking… (${aiProvider})</div></div>`;
  msgs.scrollTop=msgs.scrollHeight;

  const system=`You are an expert naval physics tutor for the NAVSIM-DT educational simulator (ProximaED). Answer questions about submarine physics, oceanography, acoustics, sonar equations, structural mechanics, and Bayesian tracking — always grounded in the equations used in the simulator. Keep answers educational and concise (3–6 sentences). Use the simulation state provided. Never discuss classified information — all parameters are public-domain educational values. Regulatory: Official Secrets Act 1923 compliant.`;
  const userMsg=`${simContext()}\n\nStudent question: ${q}`;
  const bubble=()=>document.getElementById(typingId).querySelector('.chat-bubble');
  const finish=(txt)=>{const b=bubble();b.textContent=txt;b.classList.remove('chat-typing');msgs.scrollTop=msgs.scrollHeight;};

  try{
    let reply='';
    if(aiProvider==='claude'){
      const key=document.getElementById('claude-key').value.trim();
      if(!key){finish('⚠ Enter your Claude API key (sk-ant-…) in the field above.');return;}
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':key,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:800,
          system,
          messages:[{role:'user',content:userMsg}]
        })
      });
      const data=await res.json();
      reply=data.content?.[0]?.text || data.error?.message || 'No response from Claude.';
    } else {
      const key=document.getElementById('gemini-key').value.trim();
      if(!key){finish('⚠ Enter your Gemini API key (AIza…) in the field above.');return;}
      const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          contents:[{parts:[{text:system+'\n\n'+userMsg}]}],
          generationConfig:{maxOutputTokens:800,temperature:0.4}
        })
      });
      const data=await res.json();
      reply=data.candidates?.[0]?.content?.parts?.[0]?.text || data.error?.message || 'No response from Gemini.';
    }
    finish(reply);
  }catch(e){
    finish('API error: '+e.message+' — check key & network. (Browser CORS may block; try from a server proxy.)');
  }
}

// ── Physics state table modal ──
function getPhysRows(){
  const d=depth, v=vel*1.944, p=pitch;
  const Pmpa=pressMPa(d), rhoV=rho(d), c=mack(T_at(d),ocean.S,d);
  const sl=SL(vel), tl=TLoss(cARange), snr=getSNR(), pd=detPd(snr)*100;
  return [
    ['Depth',d.toFixed(1),'m','z = z₀ + ∫ v·sin(θ) dt'],
    ['Speed',v.toFixed(1),'kn','v_kt = v_ms × 1.94384'],
    ['Pitch',p.toFixed(1),'°','dive-plane + buoyancy moment'],
    ['Pressure',Pmpa.toFixed(3),'MPa','P = P₀ + ρ·g·h'],
    ['Density ρ',rhoV.toFixed(1),'kg/m³','ρ = 1000 + 0.75·S − 0.20·T (UNESCO)'],
    ['Sound speed c',c.toFixed(1),'m/s','c = Mackenzie(T,S,z) [1981]'],
    ['Source level SL',sl.toFixed(1),'dB','SL = 110 + 30·log₁₀(v_kt)'],
    ['Transmission loss TL',tl.toFixed(1),'dB','TL = 20·log₁₀(R) + α·R'],
    ['Passive SNR',snr.toFixed(1),'dB','SNR = SL − TL − (NL − DI)'],
    ['Detection Pd',pd.toFixed(1),'%','Pd = 1/(1+exp(−0.5·(SNR−DT)))'],
    ['Contact confidence',(cAProb*100).toFixed(1),'%','P(H|D)=P(D|H)P(H)/P(D) (Bayes)'],
    ['SHI',SHI(d).toFixed(3),'—','SHI = 1 − D/D_crush, D_crush=400 m'],
    ['Hoop stress σ',hoopMPa(d).toFixed(1),'MPa','σ = P·R/t (HY-80 thin-wall)'],
    ['Failure prob P_f',pFail(elapsed).toFixed(2),'%','P_f=(1−exp(−λ·t))·100, λ=2e-4'],
  ];
}
let _physTimer=null;
function renderPhysTable(){
  const tb=document.getElementById('phys-tbody');if(!tb)return;
  tb.innerHTML=getPhysRows().map(([n,v,u,e])=>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #0e2a44;color:#9ffaff">${n}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #0e2a44;text-align:right;font-family:var(--mono);color:#fff">${v}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #0e2a44;color:#7fb4cc">${u}</td>
     <td style="padding:4px 8px;border-bottom:1px solid #0e2a44;font-family:var(--mono);font-size:10px;color:#bfe">${e}</td></tr>`
  ).join('');
}
function showPhysTable(){
  document.getElementById('phys-overlay').classList.add('show');
  renderPhysTable();
  _physTimer=setInterval(renderPhysTable,500);
}
function hidePhysTable(){
  document.getElementById('phys-overlay').classList.remove('show');
  if(_physTimer){clearInterval(_physTimer);_physTimer=null;}
}

// ── HELP ───────────────────────────────────────────────────────
function showHelp(){document.getElementById('help-overlay').classList.add('show')}
function hideHelp(){document.getElementById('help-overlay').classList.remove('show')}

// ── TOAST ──────────────────────────────────────────────────────
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;el.style.opacity=1;
  clearTimeout(el._t);el._t=setTimeout(()=>el.style.opacity=0,2800);
}

// ── PDF EXPORT ─────────────────────────────────────────────────
async function exportPDF(){
  try{
  toast('Generating PDF…');await new Promise(r=>setTimeout(r,80));
  if(!window.jspdf||!window.jspdf.jsPDF){toast('PDF library failed to load — check your network');return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const PW=210,PH=297,M=18;let y=M;
  // ── Reference-matched B&W theme ──
  const BLACK=[0,0,0], DARK=[55,55,55], MID=[110,110,110], LINE=[160,160,160], SOFT=[210,210,210];
  const HDR=[225,225,225], ZEBRA=[244,244,244], BG=[255,255,255];
  const bg=()=>{doc.setFillColor(...BG);doc.rect(0,0,PW,PH,'F')};
  const hr=(yy,w)=>{doc.setDrawColor(...BLACK);doc.setLineWidth(w||0.5);doc.line(M,yy,PW-M,yy)};
  const setF=(sz,bold,mono,rgb)=>{doc.setFontSize(sz);doc.setFont(mono?'courier':'helvetica',bold?'bold':'normal');doc.setTextColor(...(rgb||BLACK))};
  const need=(h)=>{if(y+h>PH-M-8){doc.addPage();bg();y=M}};
  bg();

  // ───── COVER / TITLE BLOCK (centered, ref-style) ─────
  setF(26,true);doc.text('NAVSIM-DT',PW/2,y+8,{align:'center'});
  setF(10,false,false,DARK);doc.text('ProximaED Naval Digital Twin · Educational Simulation Report',PW/2,y+15,{align:'center'});
  setF(9,true,false,BLACK);doc.text('v10 · Educational Research Only · Study Mode + Socratic AI + CSV Export',PW/2,y+20,{align:'center'});
  y+=26;
  // Regulatory box
  doc.setFillColor(245,245,245);doc.setDrawColor(...LINE);doc.setLineWidth(0.3);
  doc.rect(M,y,PW-2*M,12,'FD');
  setF(8,false,false,BLACK);
  doc.text('REGULATORY: Official Secrets Act 1923 (India) · IT Act 2000 · Wassenaar Arrangement · Public-domain Type-209 SSK / Foxtrot-class',M+2.5,y+4.5);
  setF(8,true);doc.text('Not a weapons-control or operational military system.',M+2.5,y+8.8);
  setF(8,false);doc.text(' ProximaED educational use only.',M+2.5+58,y+8.8);
  y+=16;hr(y,0.6);y+=6;

  // ───── SCENARIO ─────
  setF(12,true);doc.text('SCENARIO: '+SCENARIOS[scenIdx].name,M,y);y+=5;
  const hh=Math.floor(elapsed/3600),mm=Math.floor(elapsed%3600/60),ss2=Math.floor(elapsed%60);
  const scenRows=[
    ['Duration','T+ '+pad(hh)+':'+pad(mm)+':'+pad(ss2),'SST',ocean.SST+' °C'],
    ['Salinity',ocean.S+' PSU','Thermocline',ocean.thermo+' m'],
    ['Noise Level (NL)',ocean.NL+' dB','',''],
  ];
  const scCW=(PW-2*M)/4, scH=6.5;
  scenRows.forEach((r,i)=>{
    if(i%2===1){doc.setFillColor(...ZEBRA);doc.rect(M,y,PW-2*M,scH,'F')}
    doc.setDrawColor(...LINE);doc.setLineWidth(0.2);doc.rect(M,y,PW-2*M,scH);
    setF(8.5,true);doc.text(r[0],M+2,y+4.4);
    setF(8.5,false);doc.text(r[1],M+scCW*2-2,y+4.4,{align:'right'});
    setF(8.5,true);doc.text(r[2],M+scCW*2+2,y+4.4);
    setF(8.5,false);doc.text(r[3],PW-M-2,y+4.4,{align:'right'});
    y+=scH;
  });
  y+=4;hr(y,0.6);y+=6;

  // ───── PHYSICS STATE TABLE ─────
  setF(12,true);doc.text('PHYSICS STATE — ALL DIGITAL TWINS',M,y);y+=5;
  const CW=PW-2*M;
  const cw=[48,22,16,CW-86];
  const cx=[M,M+cw[0],M+cw[0]+cw[1],M+cw[0]+cw[1]+cw[2]];
  const physRows=[
    ['Depth',depth.toFixed(1),'m','z = z0 + v*sin(theta)*dt  (6-DoF integrator)'],
    ['Speed',(vel*1.944).toFixed(1),'knots','v_kt = v_ms * 1.94384'],
    ['Pitch angle',pitch.toFixed(1),'deg','Dive planes + buoyancy moment'],
    ['Hydrostatic pressure',pressMPa(depth).toFixed(3),'MPa','P = P0 + rho*g*h'],
    ['Seawater density',rho(depth).toFixed(1),'kg/m^3','rho = 1000 + 0.75*S - 0.20*T  (UNESCO)'],
    ['Sound speed (Mackenzie)',mack(T_at(depth),ocean.S,depth).toFixed(1),'m/s','c = Mackenzie(T,S,Z) - 1981 formula'],
    ['Source Level (SL)',SL(vel).toFixed(1),'dB','SL = 110 + 30*log10(v_kt)'],
    ['Transmission Loss (TL)',TLoss(cARange).toFixed(1),'dB','TL = 20*log10(R) + alpha*R   (alpha=0.003 dB/m)'],
    ['Passive SNR',getSNR().toFixed(1),'dB','SNR_p = SL - TL - (NL - DI)'],
    ['Detection Probability',(Pd(getSNR())*100).toFixed(0),'%','Pd = 1 / (1 + exp(-0.5*(SNR-DT)))'],
    ['Contact confidence',(cAProb*100).toFixed(1),'%','P(H|D) = P(D|H)*P(H) / P(D)   [Bayesian]'],
    ['Contact range',(cARange/1000).toFixed(2),'km','Closing rate = v * 0.28 m/s'],
    ['SHI',SHI(depth).toFixed(3),'—','SHI = 1 - D / D_crush   (D_crush = 375 m)'],
    ['Hoop stress (sigma)',hoopMPa(depth).toFixed(1),'MPa','sigma = P*R / t_hull   (thin-wall, HY-80)'],
    ['Failure probability',pFail(elapsed).toFixed(2),'%','P_f = (1 - exp(-lambda*t)) * 100   (lambda=0.0002)'],
  ];
  // header
  const hH=7;
  doc.setFillColor(...HDR);doc.rect(M,y,CW,hH,'F');
  doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.rect(M,y,CW,hH);
  setF(8,true);
  ['PARAMETER','VALUE','UNIT','GOVERNING EQUATION'].forEach((h,j)=>{
    const ax = j===1 ? cx[j]+cw[j]-2 : cx[j]+2;
    const al = j===1 ? 'right' : 'left';
    doc.text(h,ax,y+4.7,{align:al});
  });
  // vertical sep in header
  doc.setDrawColor(...LINE);[cx[1],cx[2],cx[3]].forEach(xx=>doc.line(xx,y,xx,y+hH));
  y+=hH;
  // rows
  physRows.forEach((row,i)=>{
    const eqLines=doc.splitTextToSize(row[3], cw[3]-4);
    const rH=Math.max(6.4, eqLines.length*3.4+3);
    need(rH);
    if(i%2===1){doc.setFillColor(...ZEBRA);doc.rect(M,y,CW,rH,'F')}
    doc.setDrawColor(...SOFT);doc.setLineWidth(0.15);doc.rect(M,y,CW,rH);
    [cx[1],cx[2],cx[3]].forEach(xx=>doc.line(xx,y,xx,y+rH));
    setF(8,false,false,BLACK);
    doc.text(String(row[0]),cx[0]+2,y+4.4);
    doc.text(String(row[1]),cx[1]+cw[1]-2,y+4.4,{align:'right'});
    doc.text(String(row[2]),cx[2]+2,y+4.4);
    setF(7.6,false,true,BLACK);
    eqLines.forEach((ln,li)=>doc.text(ln,cx[3]+2,y+4.4+li*3.4));
    y+=rH;
  });
  y+=4;hr(y,0.6);y+=6;

  // ───── MISSION OBJECTIVES ─────
  need(60);
  setF(12,true);doc.text('MISSION OBJECTIVES',M,y);y+=5;
  const mlbls=['Dive below 50 m','Reach 10 knots','Contact Pd > 80%','SHI maintained > 0.7','Ascend safely'];
  const moW=[14,CW-14-40-30,40,30];
  const mox=[M,M+moW[0],M+moW[0]+moW[1],M+moW[0]+moW[1]+moW[2]];
  // header
  doc.setFillColor(...HDR);doc.rect(M,y,CW,hH,'F');
  doc.setDrawColor(...LINE);doc.rect(M,y,CW,hH);
  setF(8,true);['#','Objective','Status','Result'].forEach((h,j)=>{
    const al = (j===2||j===3)?'center':'left';
    const ax = al==='center'? mox[j]+moW[j]/2 : mox[j]+2;
    doc.text(h,ax,y+4.7,{align:al});
  });
  [mox[1],mox[2],mox[3]].forEach(xx=>doc.line(xx,y,xx,y+hH));
  y+=hH;
  mGoals.forEach((g,i)=>{
    const rh=7;
    if(i%2===1){doc.setFillColor(...ZEBRA);doc.rect(M,y,CW,rh,'F')}
    doc.setDrawColor(...SOFT);doc.rect(M,y,CW,rh);
    [mox[1],mox[2],mox[3]].forEach(xx=>doc.line(xx,y,xx,y+rh));
    setF(8.5,false);doc.text(String(i+1),mox[0]+moW[0]/2,y+4.7,{align:'center'});
    doc.text(mlbls[i],mox[1]+2,y+4.7);
    setF(8.5,true);doc.text(g?'COMPLETE':'PENDING',mox[2]+moW[2]/2,y+4.7,{align:'center'});
    doc.text(g?'PASS':'—',mox[3]+moW[3]/2,y+4.7,{align:'center'});
    y+=rh;
  });
  y+=4;
  // Score banner
  const mS=Math.round(mGoals.filter(Boolean).length/5*100);
  doc.setDrawColor(...BLACK);doc.setLineWidth(0.5);doc.rect(M,y,CW,9);
  setF(11,true);doc.text(`MISSION SCORE:  ${mS}%  —  ${mGoals.filter(Boolean).length} / 5 objectives complete`,PW/2,y+6,{align:'center'});
  y+=13;hr(y,0.6);y+=6;

  // ───── SONAR & DEPTH PROFILE (B&W canvas snapshots) ─────
  need(80);
  setF(12,true);doc.text('SONAR DISPLAY & DEPTH PROFILE',M,y);y+=4;
  const toBW=(srcCv)=>{
    const tmp=document.createElement('canvas');tmp.width=srcCv.width;tmp.height=srcCv.height;
    const tctx=tmp.getContext('2d');
    tctx.fillStyle='#ffffff';tctx.fillRect(0,0,tmp.width,tmp.height);tctx.drawImage(srcCv,0,0);
    const img=tctx.getImageData(0,0,tmp.width,tmp.height);const d=img.data;
    for(let i=0;i<d.length;i+=4){let lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];lum=255-lum;lum=Math.max(0,Math.min(255,(lum-30)*1.35));d[i]=d[i+1]=d[i+2]=lum;d[i+3]=255}
    tctx.putImageData(img,0,0);return tmp;
  };
  try{
    const sBW=toBW(sCv);const si=sBW.toDataURL('image/jpeg',0.85);
    const halfW=(CW-4)/2;
    const sH=halfW*(sBW.height/sBW.width);
    doc.addImage(si,'JPEG',M,y,halfW,sH);
    doc.setDrawColor(...BLACK);doc.setLineWidth(0.3);doc.rect(M,y,halfW,sH);
    const dBW=toBW(dCv);const di=dBW.toDataURL('image/jpeg',0.85);
    const dH=halfW*(dBW.height/dBW.width);
    doc.addImage(di,'JPEG',M+halfW+4,y,halfW,dH);
    doc.rect(M+halfW+4,y,halfW,dH);
    y+=Math.max(sH,dH)+4;
  }catch(e){setF(8,false,false,MID);doc.text('[Canvas snapshot N/A]',M,y);y+=8}
  hr(y,0.6);y+=6;

  // ───── TELEMETRY LOG ─────
  if(telLog.length>1){
    need(40);
    setF(12,true);doc.text('TELEMETRY LOG (5-second intervals, last 20 entries)',M,y);y+=5;
    const th=[['T(s)',''],['Depth','(m)'],['Spd','(kts)'],['Pitch','(deg)'],['Pres','(MPa)'],['SHI',''],['SNR','(dB)'],['Pd','(%)']];
    const nc=th.length, cW2=CW/nc, hH2=9;
    doc.setFillColor(...HDR);doc.rect(M,y,CW,hH2,'F');
    doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.rect(M,y,CW,hH2);
    setF(7.5,true);
    th.forEach((h2,i)=>{
      doc.text(h2[0],M+cW2*i+cW2/2,y+3.8,{align:'center'});
      if(h2[1])doc.text(h2[1],M+cW2*i+cW2/2,y+7.2,{align:'center'});
    });
    for(let i=1;i<nc;i++)doc.line(M+cW2*i,y,M+cW2*i,y+hH2);
    y+=hH2;
    setF(7.5,false,true);
    const rows=telLog.slice(-20);
    const rH2=5.2;
    rows.forEach((row,ri)=>{
      need(rH2);
      if(ri%2===1){doc.setFillColor(...ZEBRA);doc.rect(M,y,CW,rH2,'F')}
      doc.setDrawColor(...SOFT);doc.setLineWidth(0.15);doc.rect(M,y,CW,rH2);
      for(let i=1;i<nc;i++)doc.line(M+cW2*i,y,M+cW2*i,y+rH2);
      const cells=[row.t,row.d,row.v,row.p,row.pres,row.shi,row.snr,row.pd];
      cells.forEach((v2,j)=>doc.text(String(v2),M+cW2*j+cW2-2.5,y+3.6,{align:'right'}));
      y+=rH2;
    });
    y+=4;
  }

  // ═══════════════════════════════════════════════════════════════
  //   RESEARCH & EDUCATION INSIGHTS  (10 study directions)
  // ═══════════════════════════════════════════════════════════════
  doc.addPage();bg();y=M;
  setF(22,true);doc.text('RESEARCH & EDUCATION INSIGHTS',PW/2,y+6,{align:'center'});
  setF(9,false,false,DARK);doc.text('Ten Digital-Twin-derived study directions',PW/2,y+12,{align:'center'});
  setF(8,false,false,MID);doc.text('Each section: live values · governing equations · methodology · research extensions · references',PW/2,y+17,{align:'center'});
  y+=24;hr(y,0.6);y+=6;

  const papers=[
    {n:1,t:'Hydrostatics — Depth vs. Pressure Profiling',
     abs:'Quantifies the hydrostatic loading regime experienced by the hull as a function of depth, sea-water density and temperature stratification — the foundation for fatigue, buoyancy and ballast calculations.',
     vals:[['Depth',depth.toFixed(2)+' m'],['Pressure',pressMPa(depth).toFixed(4)+' MPa'],['Equivalent',(pressMPa(depth)*9.869).toFixed(2)+' atm'],['Sea-water rho',rho(depth).toFixed(2)+' kg/m^3'],['Temperature T(z)',T_at(depth).toFixed(2)+' °C'],['Thermocline base',ocean.thermo+' m']],
     eqs:['P(h)  = P0 + rho(h) * g * h','rho   = 1000 + 0.75*S - 0.20*T(h)','dP/dz = rho(z) * g          (hydrostatic balance)'],
     met:'Integrate dP/dz over depth bins of 1 m using a depth-dependent density model. Compare against UNESCO TEOS-10 reference for validation. Plot P(h) vs. h and overlay measured CTD profiles.',
     ext:['Compare measured pressure vs. UNESCO TEOS-10 reference equation of state.','Pressure-time loading curves for cyclic-dive fatigue analysis.','Cross-validate with INCOIS Argo float CTD profiles in the Bay of Bengal.','Derive isopycnal layers; compute Mixed-Layer Depth (MLD) for monsoon vs. non-monsoon.','Sensitivity sweep: vary salinity 30-36 PSU and observe density gradient impact.'],
     ref:'Fofonoff & Millard (1983); UNESCO TEOS-10 (2010); INCOIS Argo program.'},

    {n:2,t:'Hull Integrity — Fatigue & Crush-Depth Margin',
     abs:'Couples hoop-stress hydrostatic loading to Basquin / Miner fatigue accumulation, providing a quantitative margin from operating depth to catastrophic crush.',
     vals:[['Crush depth',SUB.CRUSH+' m'],['Margin to crush',(SUB.CRUSH-depth).toFixed(1)+' m'],['Hoop stress sigma',hoopMPa(depth).toFixed(1)+' MPa'],['sigma / sigma_yield',(hoopMPa(depth)/SUB.HY80*100).toFixed(2)+' %'],['SHI',SHI(depth).toFixed(3)],['Failure prob.',pFail(elapsed).toFixed(3)+' %']],
     eqs:['sigma_hoop = P * R / t            (thin-wall cylinder)','SHI        = 1 - D / D_crush','N_f        = (sigma_y / sigma)^b   (Basquin, b ~ 3.2 HY-80)','D_total    = SUM_i ( n_i / N_i )    (Miner rule)'],
     met:'Record load reversals per mission from telLog. Apply Basquin S-N to each cycle, then accumulate via Miner. Plot cumulative damage vs. mission count; identify duty cycles that exceed D >= 1.',
     ext:['Count load reversals per mission for cumulative fatigue accounting.','Apply Miner rule: cumulative damage Sigma(n_i / N_i) with cycle counting.','Hull-thickness sensitivity sweep t = 0.018 - 0.035 m.','FEA-coupled stress concentration around penetrators, frames and torpedo tubes.','Corrosion-fatigue coupling: marine-environment knockdown factor on S-N curve.','Probabilistic reliability: Weibull failure model with mission-life prediction.'],
     ref:'Basquin (1910); Miner (1945); ASME BPVC Sec. VIII; NAVSEA T9074-AD-GIB-010.'},

    {n:3,t:'Acoustics — TL, SOFAR Channel & Shadow-Zone Study',
     abs:'Quantifies passive-sonar detection budget through transmission loss, ambient noise and array directivity, and explores SOFAR convergence and shadow zones generated by thermal stratification.',
     vals:[['Source Level',SL(vel).toFixed(1)+' dB'],['Range',cARange.toFixed(0)+' m'],['Transmission Loss',TLoss(cARange).toFixed(1)+' dB'],['SNR',getSNR().toFixed(1)+' dB'],['Sound speed',mack(T_at(depth),ocean.S,depth).toFixed(1)+' m/s'],['Thermocline base',ocean.thermo+' m']],
     eqs:['TL    = 20*log10(R) + alpha*R         (alpha ~ 0.003 dB/m)','SNR_p = SL - TL - (NL - DI)','c     = 1449 + 4.6*T - 0.055*T^2 + 1.34*(S-35) + 0.016*z','Snell:  cos(theta)/c = const'],
     met:'Ray-trace Snell refraction across the thermocline at 1 deg launch increments. Map convergence-zone (~50 km) and shadow-zone (~10-30 km) annuli. Compute figure-of-merit FOM = SL - (NL - DI) - DT.',
     ext:['Ray-trace Snell-law refraction across the thermocline (Bellhop comparison).','Plot SOFAR convergence-zone ranges for long-range detection budgets.','Vary salinity / temperature; observe shadow-zone shift with season.','Compare passive vs. active (monostatic & bistatic) detection budgets.','Frequency-dependent absorption: Thorp / Francois-Garrison alpha(f).','Reverberation-limited vs. noise-limited regime classification.'],
     ref:'Urick (1983) Principles of Underwater Sound; Jensen et al. (2011) Comp. Ocean Acoustics; Bellhop ray-tracer.'},

    {n:4,t:'Bayesian Inference — Contact Classification',
     abs:'Frames sonar-contact identification as recursive Bayesian updating: combines prior class probabilities with likelihood from each detection event to yield posterior confidence.',
     vals:[['Prior P(H)','0.50'],['Likelihood P(D|H)',detPd(getSNR()).toFixed(3)],['Posterior P(H|D)',cAProb.toFixed(3)],['Confidence',(cAProb*100).toFixed(1)+' %'],['SNR',getSNR().toFixed(1)+' dB']],
     eqs:['P(H|D) = P(D|H)*P(H) / [P(D|H)*P(H) + P(D|~H)*P(~H)]','LLR    = log( P(D|H) / P(D|~H) )       (log-likelihood ratio)','H(p)   = -SUM p_i * log2(p_i)            (Shannon entropy)'],
     met:'Update posterior every 5-s telemetry tick. Maintain hypothesis set {submarine, surface ship, biologic, false alarm}. Track information gain ΔH per detection; flag classification when posterior crosses 0.85.',
     ext:['Multi-Hypothesis Tracking (MHT): submarine vs. whale vs. merchant vs. false alarm.','Sequential Monte Carlo (particle filter) over bearing, range, depth.','Kalman-filtered Pd with sensor-noise covariance R; EKF for nonlinear models.','Information gain  Delta H = H(prior) - H(posterior)  per ping.','Hidden-Markov state evolution: track-quality regime switching.','ROC-curve analysis: operating point selection vs. cost asymmetry.'],
     ref:'Bar-Shalom & Fortmann (1988); Stone, Streit, Corwin & Bell (2014) Bayesian Multiple Target Tracking.'},

    {n:5,t:'Hydrodynamics — Thrust / Drag / Buoyancy Balance',
     abs:'Resolves the 6-DoF force balance — thrust, form drag, buoyancy and weight — to characterise speed-power curves and ballast strategy.',
     vals:[['Speed',(vel*1.944).toFixed(2)+' kn'],['Drag F_d',(0.5*rho(depth)*vel*vel*SUB.Cd*Math.PI*SUB.R*SUB.R/1e3).toFixed(2)+' kN'],['Mass m',(SUB.MASS_S/1e3).toFixed(0)+' t'],['Reynolds Re',((vel*SUB.L)/1.05e-6).toExponential(2)],['Froude Fr',(vel/Math.sqrt(9.81*SUB.L)).toFixed(3)]],
     eqs:['F_d  = 0.5 * rho * v^2 * C_d * A      (A = pi * R^2)','F_b  = rho * g * V_hull','m * dv/dt = F_t - F_d - (W - F_b) * sin(theta)','Re   = v * L / nu        Fr = v / sqrt(g*L)'],
     met:'Sweep speed 2-20 kn; record F_d, propulsive power P = F_t * v. Fit P = k * v^3 (cubic drag law) and quantify deviation near surface (wave-making drag).',
     ext:['Vary C_d (0.08-0.20); quantify boundary-layer and appendage sensitivity.','Compute Froude number; identify wave-making drag regime near surface.','Energy budget: kinetic ↔ thrust work ↔ drag dissipation per mission.','Propeller efficiency curve eta(J) via advance ratio analysis.','Cavitation inception: speed-depth envelope for silent running.','Coupled pitch-heave-surge dynamics under sea-state forcing.'],
     ref:'Hoerner (1965) Fluid-Dynamic Drag; Lewis (1988) Principles of Naval Architecture; Newman (1977) Marine Hydrodynamics.'},

    {n:6,t:'Thermocline Impact on Sonar Performance',
     abs:'Examines how diurnal and seasonal temperature stratification reshapes the sound-speed profile and therefore the detection envelope of the passive sonar.',
     vals:[['SST',ocean.SST+' °C'],['T at depth',T_at(depth).toFixed(1)+' °C'],['Thermocline base',ocean.thermo+' m'],['Below thermocline?',depth>ocean.thermo?'YES':'no'],['Sound speed surface',mack(ocean.SST,ocean.S,0).toFixed(1)+' m/s'],['Sound speed at depth',mack(T_at(depth),ocean.S,depth).toFixed(1)+' m/s']],
     eqs:['T(z) = SST - min( (z / z_thermo)^1.4 * 16 , 16 )','Snell:  cos(theta)/c = const   (rays bend toward lower c)','dc/dz < 0  =>  downward refraction => shadow zone'],
     met:'Compute Pd grid over (target_depth × range). Overlay the sound-speed profile and ray-bundle envelopes. Compare monsoon (strong thermocline) vs. winter (mixed) BoB conditions.',
     ext:['Map detection probability vs. depth across the thermocline.','Diurnal SST cycling effect on shallow-water acoustic propagation.','Compare monsoon vs. non-monsoon BoB profiles using INCOIS reanalysis.','Couple to bottom-bounce and surface-duct ray families.','Internal-wave perturbation of TL via Garrett-Munk spectrum.','Eddy / front interaction with the deep sound channel.'],
     ref:'Mackenzie (1981) J. Acoust. Soc. Am. 70(3); Apel (1987) Principles of Ocean Physics; INCOIS regional reanalysis.'},

    {n:7,t:'Mission Analytics — SA, MS & Decision Logs',
     abs:'Quantifies operator situation awareness (SA), mission success (MS) and after-action reviewability through structured telemetry replay.',
     vals:[['Elapsed',elapsed.toFixed(0)+' s'],['Mission Score',Math.round(mGoals.filter(Boolean).length/5*100)+' %'],['Max depth',stats.maxDepth.toFixed(1)+' m'],['Min SHI',stats.minSHI.toFixed(2)],['Peak Pd',(stats.maxPd*100).toFixed(0)+' %'],['Decision events',String(telLog.length)]],
     eqs:['SA = SUM_i P(contact_i) / N             (level-1 awareness)','MS = goals_done / goals_total','Efficiency  E = MS / (mission_time * energy)'],
     met:'Parse telLog into decision events; align with mGoal completion timestamps. Compute SA score per Endsley levels (perception, comprehension, projection). Plot decision-latency histogram.',
     ext:['Endsley 3-level SA model — perception, comprehension, projection scoring.','Decision-tree replay from telLog for after-action review (AAR) sessions.','Cognitive-workload proxy: control-input rate (Hz) and entropy.','Mission-effectiveness curves vs. crew experience cohorts.','Markov decision process (MDP) abstraction of mission phases.','Anomaly detection on telemetry: change-point analysis (CUSUM).'],
     ref:'Endsley (1995) Human Factors 37(1); Salas & Cannon-Bowers (2001); MIL-STD-1472 design criteria.'},

    {n:8,t:'Human Factors — Control Response & Reaction',
     abs:'Studies pilot-loop dynamics: command-to-effect latency, control-effort entropy and pilot-induced oscillation risk under varying workload.',
     vals:[['Pitch response',pitch.toFixed(2)+' °'],['Speed',(vel*1.944).toFixed(2)+' kn'],['Rudder gain','0.008'],['Control inputs (log)',String(telLog.length)]],
     eqs:['yaw_rate ~ rudder * 0.008 * v','Control-effort index CEI = SUM |Delta u| / Delta t','PIO risk:  phase_lag(omega) > 180 deg  at  |G| > 1'],
     met:'Record stick-input time series; compute Welch PSD; identify dominant pilot-loop frequencies. Apply Cooper-Harper handling-qualities rating and NASA-TLX subjective workload survey.',
     ext:['Reaction-time histogram: command-to-effect latency analysis.','Control-effort index Sigma|du|/dt — pilot-induced oscillation (PIO) risk.','NASA-TLX subjective workload survey integration with telemetry events.','Eye-tracking overlay to study operator attention distribution.','Cooper-Harper handling-qualities rating across pilot cohorts.','Adaptive control gains based on detected operator fatigue.'],
     ref:'Cooper & Harper (1969) NASA TN D-5153; Hart & Staveland (1988) NASA-TLX; McRuer & Krendel (1974).'},

    {n:9,t:'AI Tutoring — Claude / Gemini Explanations',
     abs:'Uses dual-API retrieval-augmented generation (RAG) over live telemetry to produce just-in-time pedagogical explanations and Socratic prompts.',
     vals:[['Claude key',localStorage.getItem('navsim_claude_key')?'set':'not set'],['Gemini key',localStorage.getItem('navsim_gemini_key')?'set':'not set'],['Context','D '+depth.toFixed(0)+' m · SNR '+getSNR().toFixed(0)+' dB'],['Telemetry window',String(Math.min(20,telLog.length))+' samples']],
     eqs:['RAG_prompt = system + telLog_window + user_query','Score      = correctness * clarity * pedagogical_depth','Tutor_gain = post_test - pre_test       (learning delta)'],
     met:'Inject the last 20 telemetry samples plus current physics state into the system prompt. Compare answers from Claude and Gemini side-by-side. Score against an expert-authored rubric.',
     ext:['RAG over INCOIS / NIO datasets for region-specific tutoring content.','A/B trial: tutored vs. untutored learner outcomes on physics quizzes.','Auto-generate Socratic questions from telLog event triggers.','Multi-agent debate (Claude vs. Gemini) on dive decisions and trade-offs.','Personalised learning paths driven by misconception detection.','Hallucination audit: cross-check AI outputs against governing equations.'],
     ref:'Lewis et al. (2020) RAG NeurIPS; Anthropic Claude Sonnet 4 technical report; Google Gemini API docs.'},

    {n:10,t:'PDF Research Report — Graphs + Telemetry',
     abs:'Delivers a reproducible educational research artifact: cover, physics snapshot, telemetry, figures and ten study directions in a single printable PDF.',
     vals:[['Telemetry samples',String(telLog.length)],['Elapsed',elapsed.toFixed(0)+' s'],['Sample rate','1 every 5 s'],['Report version','v4 B&W']],
     eqs:['Report = cover + physics + telemetry + figures + 10 insights','Reproducibility = scenario_seed + ocean_state + control_log'],
     met:'Capture canvas snapshots, normalise to grayscale, embed alongside live physics tables. Append a reproducibility manifest (scenario seed, ocean state, control history) so any run can be replayed exactly.',
     ext:['CSV / JSON export for MATLAB / Python post-processing pipelines.','Reproducibility manifest (scenario seed, ocean state, control history).','Cohort comparison reports aggregating multiple student runs.','LaTeX export for thesis / journal-quality figures with vector output.','DOI-minted dataset deposit for open educational resource (OER) re-use.','Interactive HTML companion with linked telemetry replays.'],
     ref:'Stodden et al. (2016) Enhancing reproducibility for computational methods; FAIR data principles (Wilkinson et al. 2016).'},
  ];

  papers.forEach((p,idx)=>{
    const eqLinesAll = p.eqs.map(e=>doc.splitTextToSize(e,CW-6));
    const eqLineCount = eqLinesAll.reduce((a,b)=>a+b.length,0);
    const valRows = Math.ceil(p.vals.length/2);
    const absLines = doc.splitTextToSize(p.abs, CW-4);
    const metLines = doc.splitTextToSize(p.met, CW-4);
    const extLines = p.ext.map(e=>doc.splitTextToSize('• '+e,CW-6));
    const extLineCount = extLines.reduce((a,b)=>a+b.length,0);
    const refLines = doc.splitTextToSize('References: '+p.ref, CW-4);
    const est = 9 + absLines.length*3.6 + 5 + valRows*5.5 + 5 + eqLineCount*3.6+4 + 5 + metLines.length*3.6 + 5 + extLineCount*3.6 + 5 + refLines.length*3.4 + 6;
    if(y+est>PH-M-10){doc.addPage();bg();y=M}

    // Title bar
    doc.setFillColor(...HDR);doc.rect(M,y,CW,8,'F');
    doc.setDrawColor(...BLACK);doc.setLineWidth(0.4);doc.rect(M,y,CW,8);
    setF(11,true);doc.text(`${p.n}.  ${p.t}`,M+3,y+5.6);
    y+=10;

    // Abstract
    setF(8,true,false,DARK);doc.text('ABSTRACT',M,y);y+=3.6;
    setF(8.5,false,false,BLACK);
    absLines.forEach(ln=>{doc.text(ln,M,y);y+=3.8});
    y+=2;

    // Live values 2-col table
    setF(8,true,false,DARK);doc.text('LIVE VALUES',M,y);y+=3.6;
    const vCols=2, vCW=CW/vCols, vH=5.4;
    for(let i=0;i<p.vals.length;i++){
      const col=i%vCols, row=Math.floor(i/vCols);
      const xx=M+col*vCW, yy=y+row*vH;
      if(row%2===0){doc.setFillColor(...ZEBRA);doc.rect(xx,yy,vCW,vH,'F')}
      doc.setDrawColor(...SOFT);doc.setLineWidth(0.15);doc.rect(xx,yy,vCW,vH);
      setF(8,true,false,BLACK);doc.text(p.vals[i][0],xx+2,yy+3.7);
      setF(8,false,true,BLACK);doc.text(p.vals[i][1],xx+vCW-2,yy+3.7,{align:'right'});
    }
    y+=valRows*vH+3;

    // Governing equations (monospace, single bordered block)
    setF(8,true,false,DARK);doc.text('GOVERNING EQUATIONS',M,y);y+=3.6;
    const eqBoxH = eqLineCount*3.8 + 3;
    doc.setFillColor(248,248,248);doc.setDrawColor(...LINE);doc.setLineWidth(0.2);
    doc.rect(M,y,CW,eqBoxH,'FD');
    setF(7.8,false,true,BLACK);
    let yy=y+3.4;
    eqLinesAll.forEach(grp=>{grp.forEach(ln=>{doc.text(ln,M+3,yy);yy+=3.8})});
    y+=eqBoxH+3;

    // Methodology
    setF(8,true,false,DARK);doc.text('METHODOLOGY',M,y);y+=3.6;
    setF(8.5,false,false,BLACK);
    metLines.forEach(ln=>{need(4);doc.text(ln,M,y);y+=3.8});
    y+=2;

    // Research extensions
    setF(8,true,false,DARK);doc.text('RESEARCH EXTENSIONS',M,y);y+=3.6;
    setF(8.5,false,false,BLACK);
    extLines.forEach(grp=>{grp.forEach(ln=>{need(4);doc.text(ln,M+2,y);y+=3.8})});
    y+=2;

    // References
    setF(7.5,false,false,MID);
    refLines.forEach(ln=>{need(4);doc.text(ln,M,y);y+=3.4});
    y+=3;

    // separator
    if(idx<papers.length-1){
      doc.setDrawColor(...LINE);doc.setLineWidth(0.25);doc.line(M,y,PW-M,y);y+=4;
    }
  });

  // ───── FOOTER on every page ─────
  const total=doc.getNumberOfPages();
  const stamp=new Date().toISOString().slice(0,19).replace('T',' ');
  for(let i=1;i<=total;i++){
    doc.setPage(i);
    doc.setDrawColor(...BLACK);doc.setLineWidth(0.3);doc.line(M,PH-10,PW-M,PH-10);
    setF(7,false,false,MID);
    doc.text(`ProximaED · NAVSIM-DT v11 · ${stamp} UTC · Educational research only · Not for operational military use`,M,PH-6);
    doc.text(`Page ${i} / ${total}`,PW-M,PH-6,{align:'right'});
  }

  doc.save('NAVSIM_DT_Report_BW_'+new Date().toISOString().slice(0,10)+'.pdf');
  toast('PDF saved (B&W)!');
  }catch(err){
    console.error('exportPDF failed:',err);
    toast('PDF export failed: '+(err&&err.message?err.message:err));
    alert('PDF export error:\n\n'+(err&&err.stack?err.stack:err));
  }
}

// ── SUBMARINE 3D VIEW ──────────────────────────────────────────
let currentView='sonar';
const subCv=document.getElementById('sub3d-cv');
const subCtx=subCv.getContext('2d');
let subZoom=1.0;
function setSubZoom(z){subZoom=Math.max(0.4,Math.min(2.5,z));const l=document.getElementById('zoom-lbl');if(l)l.textContent=Math.round(subZoom*100)+'%';drawSub3D();}
(function(){const bi=document.getElementById('zoom-in'),bo=document.getElementById('zoom-out'),br=document.getElementById('zoom-reset');
  if(bi)bi.onclick=()=>setSubZoom(subZoom*1.15);
  if(bo)bo.onclick=()=>setSubZoom(subZoom/1.15);
  if(br)br.onclick=()=>setSubZoom(1.0);
  subCv.addEventListener('wheel',e=>{e.preventDefault();setSubZoom(subZoom*(e.deltaY<0?1.08:1/1.08));},{passive:false});
  ['in-callsign','in-class'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',drawSub3D);});
  // Side-expansion drawers: click tab to open/close. Start with all collapsed.
  document.querySelectorAll('#infoDrawers .idr').forEach(dr=>{
    const tab=dr.querySelector('.idr-tab');
    if(tab)tab.addEventListener('click',()=>{dr.classList.toggle('open');tab.classList.toggle('active',dr.classList.contains('open'));});
  });
})();
function sizeSubCv(){const w=document.getElementById('subview');if(w.offsetWidth)subCv.width=w.offsetWidth,subCv.height=w.offsetHeight;}
function switchView(v){
  currentView=v;
  document.getElementById('sonar-wrap').style.display=(v==='sonar')?'block':'none';
  document.getElementById('subview').style.display=(v==='sub')?'block':'none';
  document.getElementById('vt-sonar').classList.toggle('on',v==='sonar');
  document.getElementById('vt-sub').classList.toggle('on',v==='sub');
  if(v==='sub'){sizeSubCv();drawSub3D();}else{sizeCanvases();drawSonar();drawDepth();}
}
function hdgCardinal(h){const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return dirs[Math.round(((h%360)+360)%360/22.5)%16];}
function drawSub3D(){
  const W=subCv.width,H=subCv.height;if(W<20||H<20)return;
  // Sea / depth gradient bg
  const g=subCtx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0a4a72');g.addColorStop(0.35,'#053454');g.addColorStop(1,'#01060e');
  subCtx.fillStyle=g;subCtx.fillRect(0,0,W,H);
  // Surface line
  const surfY=Math.min(80,H*0.18);
  subCtx.strokeStyle='rgba(120,200,255,.35)';subCtx.lineWidth=1;
  subCtx.beginPath();for(let x=0;x<W;x+=6){const y=surfY+Math.sin((x+performance.now()/600)*0.04)*3;x===0?subCtx.moveTo(x,y):subCtx.lineTo(x,y);}subCtx.stroke();
  subCtx.fillStyle='rgba(40,90,140,.18)';subCtx.fillRect(0,0,W,surfY);
  // particle drift
  subCtx.fillStyle='rgba(180,220,255,.35)';
  const t=performance.now()/1000;
  for(let i=0;i<60;i++){const px=((i*73.3+t*8)%W);const py=surfY+((i*51.7+t*4)%(H-surfY));subCtx.fillRect(px,py,1.2,1.2);}
  // Depth ladder on right
  subCtx.strokeStyle='rgba(95,234,255,.4)';subCtx.fillStyle='rgba(189,217,236,.8)';
  subCtx.font='10px Share Tech Mono,monospace';subCtx.lineWidth=1;
  const lx=W-58;subCtx.beginPath();subCtx.moveTo(lx,surfY);subCtx.lineTo(lx,H-30);subCtx.stroke();
  const maxLad=Math.max(50,Math.ceil((depth+30)/50)*50);
  for(let d=0;d<=maxLad;d+=25){const y=surfY+(d/maxLad)*(H-30-surfY);
    subCtx.beginPath();subCtx.moveTo(lx,y);subCtx.lineTo(lx+8,y);subCtx.stroke();
    if(d%50===0)subCtx.fillText(d+'m',lx+12,y+3);}
  // Submarine drawing — professional Type-209 silhouette
  const cx=W*0.42,cy=surfY+(depth/maxLad)*(H-30-surfY);
  const L=Math.min(W*0.55,360)*subZoom,hH=L*0.16;
  subCtx.save();subCtx.translate(cx,cy);subCtx.rotate(pitch*Math.PI/180);
  // shadow
  subCtx.fillStyle='rgba(0,0,0,.45)';subCtx.beginPath();subCtx.ellipse(0,hH*0.85,L*0.46,6,0,0,Math.PI*2);subCtx.fill();
  // main hull gradient
  const hg=subCtx.createLinearGradient(0,-hH,0,hH);
  hg.addColorStop(0,'#3a5566');hg.addColorStop(0.45,'#1a2a36');hg.addColorStop(1,'#070d14');
  subCtx.fillStyle=hg;subCtx.strokeStyle='#5feaff';subCtx.lineWidth=1.2;
  subCtx.beginPath();
  // teardrop-like hull
  subCtx.moveTo(-L*0.5,0);
  subCtx.bezierCurveTo(-L*0.48,-hH*0.95,-L*0.2,-hH,L*0.15,-hH);
  subCtx.bezierCurveTo(L*0.38,-hH,L*0.49,-hH*0.55,L*0.5,0);
  subCtx.bezierCurveTo(L*0.49,hH*0.55,L*0.38,hH,L*0.15,hH);
  subCtx.bezierCurveTo(-L*0.2,hH,-L*0.48,hH*0.95,-L*0.5,0);
  subCtx.closePath();subCtx.fill();subCtx.stroke();
  // hull highlight
  subCtx.strokeStyle='rgba(180,220,255,.35)';subCtx.lineWidth=1;
  subCtx.beginPath();subCtx.moveTo(-L*0.4,-hH*0.4);subCtx.bezierCurveTo(-L*0.1,-hH*0.75,L*0.25,-hH*0.7,L*0.42,-hH*0.3);subCtx.stroke();
  // sail (conning tower)
  const sw=L*0.13,sh=hH*1.1;
  const sg=subCtx.createLinearGradient(0,-hH-sh,0,-hH);
  sg.addColorStop(0,'#2a4050');sg.addColorStop(1,'#0e1820');
  subCtx.fillStyle=sg;subCtx.strokeStyle='#5feaff';
  subCtx.beginPath();
  subCtx.moveTo(-sw*0.5,-hH);subCtx.lineTo(-sw*0.35,-hH-sh);
  subCtx.lineTo(sw*0.35,-hH-sh);subCtx.lineTo(sw*0.55,-hH);subCtx.closePath();
  subCtx.fill();subCtx.stroke();
  // periscope mast
  subCtx.strokeStyle='#9ad9ee';subCtx.lineWidth=1.5;
  subCtx.beginPath();subCtx.moveTo(0,-hH-sh);subCtx.lineTo(0,-hH-sh-14);subCtx.stroke();
  subCtx.fillStyle='#5feaff';subCtx.fillRect(-2,-hH-sh-16,4,3);
  // bow planes (fore)
  subCtx.fillStyle='#1a2a36';subCtx.strokeStyle='#5feaff';
  subCtx.beginPath();subCtx.moveTo(L*0.28,-hH*0.2);subCtx.lineTo(L*0.42,-hH*0.9);subCtx.lineTo(L*0.34,-hH*0.2);subCtx.closePath();subCtx.fill();subCtx.stroke();
  // stern X-planes
  subCtx.beginPath();subCtx.moveTo(-L*0.46,-hH*0.1);subCtx.lineTo(-L*0.58,-hH*0.95);subCtx.lineTo(-L*0.5,-hH*0.1);subCtx.closePath();subCtx.fill();subCtx.stroke();
  subCtx.beginPath();subCtx.moveTo(-L*0.46,hH*0.1);subCtx.lineTo(-L*0.58,hH*0.95);subCtx.lineTo(-L*0.5,hH*0.1);subCtx.closePath();subCtx.fill();subCtx.stroke();
  // propeller wash
  const prop=performance.now()/60;
  subCtx.strokeStyle='rgba(150,220,255,.5)';subCtx.lineWidth=1;
  subCtx.beginPath();subCtx.ellipse(-L*0.5,0,5,hH*0.55,0,0,Math.PI*2);subCtx.stroke();
  subCtx.strokeStyle=`rgba(180,230,255,${0.25+0.25*Math.sin(prop*0.3)})`;
  for(let i=1;i<=4;i++){subCtx.beginPath();subCtx.ellipse(-L*0.5-i*9,0,2,hH*0.4*(1+i*0.15),0,0,Math.PI*2);subCtx.stroke();}
  // markings
  // markings — read from inputs
  const _cs=(document.getElementById('in-callsign')?.value||'INS VARUNA').toUpperCase();
  const _cl=(document.getElementById('in-class')?.value||'Type-209');
  subCtx.fillStyle='#ffffff';subCtx.font='bold 13px Rajdhani,sans-serif';subCtx.textAlign='center';
  subCtx.shadowColor='rgba(0,0,0,.9)';subCtx.shadowBlur=3;
  subCtx.fillText(_cs,-L*0.05,4);
  subCtx.fillStyle='#9ffaff';subCtx.font='bold 9px Share Tech Mono,monospace';
  subCtx.fillText(_cl.toUpperCase()+' · LOA 64.4m',-L*0.05,15);
  subCtx.shadowBlur=0;
  // Update header title with callsign + class
  const _ht=document.getElementById('hud-title');if(_ht)_ht.textContent='NAVSIM-DT · '+_cs+' · '+_cl;
  subCtx.restore();
  // heading arrow (top-left of sub)
  const hdg=((yaw%360)+360)%360;
  subCtx.save();subCtx.translate(cx,cy-hH-30);
  subCtx.strokeStyle='rgba(95,234,255,.7)';subCtx.lineWidth=1;subCtx.setLineDash([3,3]);
  subCtx.beginPath();subCtx.arc(0,0,20,0,Math.PI*2);subCtx.stroke();subCtx.setLineDash([]);
  subCtx.rotate(hdg*Math.PI/180);
  subCtx.strokeStyle='#4dff9a';subCtx.lineWidth=2;
  subCtx.beginPath();subCtx.moveTo(0,0);subCtx.lineTo(0,-22);subCtx.stroke();
  subCtx.fillStyle='#4dff9a';subCtx.beginPath();subCtx.moveTo(0,-26);subCtx.lineTo(-4,-18);subCtx.lineTo(4,-18);subCtx.closePath();subCtx.fill();
  subCtx.restore();
  subCtx.fillStyle='#4dff9a';subCtx.font='10px Share Tech Mono,monospace';subCtx.textAlign='center';
  subCtx.fillText('HDG '+hdg.toFixed(0)+'°',cx,cy-hH-58);
  // Pitch indicator (left)
  subCtx.save();subCtx.translate(60,H/2);
  subCtx.strokeStyle='rgba(95,234,255,.5)';subCtx.lineWidth=1;
  subCtx.beginPath();subCtx.arc(0,0,32,-Math.PI/3,Math.PI/3);subCtx.stroke();
  subCtx.rotate(pitch*Math.PI/180);
  subCtx.strokeStyle='#ffc14d';subCtx.lineWidth=2;
  subCtx.beginPath();subCtx.moveTo(-30,0);subCtx.lineTo(30,0);subCtx.stroke();
  subCtx.restore();
  subCtx.fillStyle='#ffc14d';subCtx.font='10px Share Tech Mono,monospace';subCtx.textAlign='center';
  subCtx.fillText('PITCH '+pitch.toFixed(1)+'°',60,H/2+50);
  // Update HUD text panels
  const ball=document.getElementById('sl-ball')?.value||0;
  const sm=document.getElementById('hud-mis');if(sm)sm.textContent=(SCENARIOS[scenIdx]?.name||'—');
  const st=document.getElementById('hud-state');if(st){st.textContent=running?'UNDERWAY':(elapsed>0?'PAUSED':'STANDBY');st.className='v '+(running?'acc':'wn');}
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('hud-hdg',hdg.toFixed(0).padStart(3,'0')+'°');
  set('hud-hdgC',hdgCardinal(hdg));
  set('hud-pit',pitch.toFixed(1)+'°');
  set('hud-yr',(+document.getElementById('sl-rud').value*0.008*vel).toFixed(2)+'°/s');
  set('hud-dep',depth.toFixed(1)+' m');
  set('hud-spd',(vel*1.944).toFixed(1)+' kn');
  set('hud-pr',pressMPa(depth).toFixed(3)+' MPa');
  set('hud-shi',SHI(depth).toFixed(2));
  set('hud-bal',ball+'%');
  // simulated lat/lon drift from start position
  const lat0=13.05,lon0=80.27;
  const dx=vel*Math.sin(yaw*Math.PI/180)*elapsed/111000;
  const dy=vel*Math.cos(yaw*Math.PI/180)*elapsed/111000;
  set('hud-ll',(lat0+dy).toFixed(3)+'°N · '+(lon0+dx).toFixed(3)+'°E');
  // compass needle
  const ndl=document.getElementById('cmp-needle');if(ndl)ndl.setAttribute('transform','rotate('+hdg+')');
  set('hud-cmpTxt','HDG '+hdg.toFixed(0)+'° · '+hdgCardinal(hdg)+' · TRUE');
}
// Hook into existing draw cycle
const _origDrawSonar=drawSonar;
// keep both views drawing together
drawSonar=function(){_origDrawSonar();drawSub3D();};

// ── v5: Dropdown panels, quick-bar mirroring, dual-view sizing ──
function toggleMenu(side){
  const el=document.getElementById(side);
  const btn=document.getElementById('mb-'+side);
  const open=el.classList.toggle('open');
  btn.classList.toggle('on',open);
  // close the other side if both would overlap on narrow screens
  if(open && window.innerWidth<1000){
    const other=side==='left'?'right':'left';
    document.getElementById(other).classList.remove('open');
    document.getElementById('mb-'+other).classList.remove('on');
  }
}
// Close panels when clicking outside
document.addEventListener('mousedown',e=>{
  ['left','right'].forEach(s=>{
    const el=document.getElementById(s);
    const btn=document.getElementById('mb-'+s);
    if(el.classList.contains('open') && !el.contains(e.target) && !btn.contains(e.target)){
      el.classList.remove('open');btn.classList.remove('on');
    }
  });
});

// Mirror quick-bar sliders ↔ panel sliders
(function setupMirror(){
  const map=[['thr','%'],['dive','°'],['ball','%'],['rud','°']];
  map.forEach(([k,u])=>{
    const q=document.getElementById('qsl-'+k);
    const p=document.getElementById('sl-'+k);
    const qv=document.getElementById('qv-'+k);
    const sync=(src,dst,val)=>{dst.value=val;dst.dispatchEvent(new Event('input',{bubbles:true}));};
    q.addEventListener('input',()=>{qv.textContent=q.value+u;sync(q,p,q.value);});
    p.addEventListener('input',()=>{q.value=p.value;qv.textContent=p.value+u;});
    qv.textContent=q.value+u;
  });
  // Sync START/PAUSE label on quickbar with main button
  const obs=new MutationObserver(()=>{
    const main=document.getElementById('btn-run');
    const qb=document.getElementById('qb-run');
    if(main && qb){qb.textContent=main.textContent.replace('SIMULATION','').trim();
      qb.classList.toggle('on',main.classList.contains('on'));}
  });
  const mr=document.getElementById('btn-run');
  if(mr) obs.observe(mr,{childList:true,characterData:true,subtree:true,attributes:true});
})();

// Resize so sonar canvas tracks the new flex-row width
const _origSizeCanvases=sizeCanvases;
sizeCanvases=function(){
  _origSizeCanvases();
  sizeSubCv();
};

window.addEventListener('resize',()=>{sizeCanvases();drawSonar();drawDepth();drawSub3D();});

// Drive the sub3D continuously even when idle (replace idleLoop in place)
const _origIdleBody=idleLoop;
function idleLoopV5(ts){drawSub3D();_origIdleBody(ts);}
// re-init
window.addEventListener('load',()=>{
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    sizeCanvases();sizeSubCv();
    updateUI();drawSonar();drawDepth();drawSub3D();
    requestAnimationFrame(idleLoopV5);
  }));
});

/* ═══════════════════════════════════════════════════════════════
   RESEARCH & EDUCATION INSIGHTS — Analytics modals
   Each insight computes live metrics from the Digital Twin state,
   shows governing equations, current values, a mini sparkline of
   the recent telemetry log, and educational/research extensions.
   ═══════════════════════════════════════════════════════════════ */
/* Enhanced high-contrast sparkline with grid, axis ticks, dot markers, and SNAP-to-PNG control */
let _chartUID=0;
function _spark(arr,w,h,col,label){
  if(!arr||arr.length<2)return '<div style="color:#ffb84d;font-size:12px;padding:10px;background:rgba(40,20,0,.4);border:1px dashed rgba(255,184,77,.5);border-radius:4px;text-align:center">⚠ No telemetry yet — press ▶ START to record data.</div>';
  const id='tch'+(++_chartUID);
  const mn=Math.min(...arr),mx=Math.max(...arr),sp=Math.max(mx-mn,1e-6);
  const padL=42,padR=10,padT=16,padB=20,cw=w-padL-padR,ch=h-padT-padB;
  const pts=arr.map((v,i)=>[padL+(i/(arr.length-1))*cw,padT+ch-((v-mn)/sp)*ch]);
  const poly=pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area=`${padL},${(padT+ch).toFixed(1)} ${poly} ${(padL+cw).toFixed(1)},${(padT+ch).toFixed(1)}`;
  let grid='';
  for(let i=0;i<=4;i++){const yy=padT+(i/4)*ch;const v=mx-(i/4)*sp;
    grid+=`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(padL+cw).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="rgba(95,234,255,.22)" stroke-width="0.6" stroke-dasharray="2,3"/>`;
    grid+=`<text x="${padL-5}" y="${(yy+3).toFixed(1)}" fill="#dff2ff" font-family="monospace" font-size="10" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  for(let i=0;i<=4;i++){const xx=padL+(i/4)*cw;
    grid+=`<line x1="${xx.toFixed(1)}" y1="${padT}" x2="${xx.toFixed(1)}" y2="${(padT+ch).toFixed(1)}" stroke="rgba(95,234,255,.12)" stroke-width="0.5"/>`;
  }
  const dots=pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${col}" stroke="#001018" stroke-width="0.9"/>`).join('');
  const last=arr[arr.length-1];
  const svg=`<svg id="${id}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#020812;border-radius:4px">
    <defs><linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${col}" stop-opacity="0.55"/><stop offset="100%" stop-color="${col}" stop-opacity="0.02"/></linearGradient></defs>
    ${grid}
    <polygon points="${area}" fill="url(#${id}g)"/>
    <polyline points="${poly}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 4px ${col})"/>
    ${dots}
    <text x="${(padL+cw).toFixed(1)}" y="${(padT-4).toFixed(1)}" fill="${col}" font-family="monospace" font-size="12" font-weight="bold" text-anchor="end">${(label||'')} ${last.toFixed(2)}</text>
    <text x="${padL}" y="${(h-5).toFixed(1)}" fill="#8fb8d0" font-family="monospace" font-size="9">samples 1 → ${arr.length}</text>
  </svg>`;
  return `<div class="tchart-wrap" style="border-color:${col}66"><button class="tchart-snap" onclick="snapChart('${id}','${(label||'chart').replace(/[^a-z0-9]/gi,'_')}')">📷 SNAP</button>${svg}</div>`;
}

/* Multi-series toggleable chart with per-series checkbox legend */
function _multiChart(seriesList,w,h){
  if(!seriesList||!seriesList.length||!seriesList[0].data||seriesList[0].data.length<2)
    return '<div style="color:#ffb84d;font-size:12px;padding:12px;background:rgba(40,20,0,.4);border:1px dashed rgba(255,184,77,.5);border-radius:4px;text-align:center">⚠ No telemetry yet — press ▶ START to record data.</div>';
  const uid='mch'+(++_chartUID);
  const padL=46,padR=12,padT=16,padB=24,cw=w-padL-padR,ch=h-padT-padB;
  const seriesSVG=seriesList.map((s,si)=>{
    const a=s.data;const mn=Math.min(...a),mx=Math.max(...a),sp=Math.max(mx-mn,1e-6);
    const pts=a.map((v,i)=>[padL+(i/(a.length-1))*cw,padT+ch-((v-mn)/sp)*ch]);
    const poly=pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
    const dots=pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2" fill="${s.color}" stroke="#000" stroke-width="0.6"/>`).join('');
    return `<g class="${uid}-s${si}" data-key="${s.key}"><polyline points="${poly}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 3px ${s.color})"/>${dots}<text x="${(padL+cw-4).toFixed(1)}" y="${(padT+14+si*15).toFixed(1)}" fill="${s.color}" font-family="monospace" font-size="11" font-weight="bold" text-anchor="end">${s.label}: ${a[a.length-1].toFixed(2)} ${s.unit||''}</text></g>`;
  }).join('');
  let grid='';
  for(let i=0;i<=4;i++){const yy=padT+(i/4)*ch;
    grid+=`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(padL+cw).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="rgba(95,234,255,.22)" stroke-width="0.6" stroke-dasharray="2,3"/>`;
    grid+=`<text x="${padL-5}" y="${(yy+3).toFixed(1)}" fill="#dff2ff" font-family="monospace" font-size="10" text-anchor="end">${(100-i*25)}%</text>`;
  }
  for(let i=0;i<=5;i++){const xx=padL+(i/5)*cw;
    grid+=`<line x1="${xx.toFixed(1)}" y1="${padT}" x2="${xx.toFixed(1)}" y2="${(padT+ch).toFixed(1)}" stroke="rgba(95,234,255,.12)" stroke-width="0.5"/>`;
  }
  const legend=seriesList.map((s,si)=>`<label><input type="checkbox" checked onchange="document.querySelectorAll('.${uid}-s${si}').forEach(g=>g.style.display=this.checked?'':'none')"><span class="swatch" style="background:${s.color};color:${s.color}"></span><span style="color:${s.color};font-weight:700">${s.label}</span><span style="color:#7aa8c8">(${s.unit||'—'})</span></label>`).join('');
  return `<div class="tchart-wrap">
    <button class="tchart-snap" onclick="snapChart('${uid}','telemetry_multi')">📷 SNAP</button>
    <div class="tchart-legend">${legend}</div>
    <svg id="${uid}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#020812;border-radius:4px">
      ${grid}
      ${seriesSVG}
      <text x="${padL}" y="${(h-6).toFixed(1)}" fill="#8fb8d0" font-family="monospace" font-size="9">normalised 0-100% per series · n=${seriesList[0].data.length} samples</text>
    </svg>
  </div>`;
}

/* Save an SVG chart as PNG */
function snapChart(id,name){
  const svg=document.getElementById(id);if(!svg){toast('Chart not found');return;}
  const clone=svg.cloneNode(true);
  if(!clone.getAttribute('xmlns'))clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const xml=new XMLSerializer().serializeToString(clone);
  const w=svg.viewBox.baseVal.width||svg.clientWidth||600;
  const h=svg.viewBox.baseVal.height||svg.clientHeight||200;
  const blob=new Blob(['<?xml version="1.0"?>'+xml],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement('canvas');cv.width=w*2;cv.height=h*2;
    const cx=cv.getContext('2d');cx.fillStyle='#020812';cx.fillRect(0,0,cv.width,cv.height);
    cx.drawImage(img,0,0,cv.width,cv.height);
    cv.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='NAVSIM_'+name+'_'+Date.now()+'.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),800);toast('Chart snapshot saved ✓');},'image/png');
    URL.revokeObjectURL(url);
  };
  img.onerror=()=>{toast('Snap failed — chart not serialisable');URL.revokeObjectURL(url);};
  img.src=url;
}

/* Snap first chart inside the insight modal */
function snapInsight(){
  const body=document.getElementById('ins-body');
  const svgs=body.querySelectorAll('svg');
  if(!svgs.length){toast('No chart in this view to snap');return;}
  const title=(document.getElementById('ins-title').textContent||'insight').replace(/[^a-z0-9]/gi,'_').slice(0,40);
  if(!svgs[0].id)svgs[0].id='snap'+Date.now();
  snapChart(svgs[0].id,title);
}

/* Enlarge / restore insight modal — re-renders with bigger charts */
function toggleInsightEnlarge(){
  const box=document.getElementById('ins-box');
  const en=box.classList.toggle('enlarged');
  document.getElementById('ins-enlarge').textContent=en?'⛶ RESTORE':'⛶ ENLARGE';
  if(window._lastInsightKey)showInsight(window._lastInsightKey,true);
}

function _row(k,v,u){return `<tr><td style="color:#bdd9ec;padding:4px 12px 4px 0;font-size:13px">${k}</td><td style="color:#fff;font-weight:700;text-align:right;font-size:13px">${v}</td><td style="color:#7aa8c8;padding-left:6px;font-size:12px">${u||''}</td></tr>`;}
function _section(t){return `<div style="color:#5feaff;font-family:monospace;font-size:12px;letter-spacing:.14em;margin:16px 0 7px;text-transform:uppercase;border-bottom:1px solid rgba(95,234,255,.4);padding-bottom:4px;font-weight:700">${t}</div>`;}
function _eq(s){return `<div style="font-family:monospace;font-size:13px;color:#b8e0fa;background:rgba(0,0,0,.65);padding:8px 12px;border-radius:4px;margin:5px 0;border-left:3px solid #5feaff">${s}</div>`;}
function _list(items){return '<ul style="margin:5px 0 0 20px;padding:0;color:#eaf6ff;font-size:13px;line-height:1.75">'+items.map(i=>`<li style="margin-bottom:3px">${i}</li>`).join('')+'</ul>';}

const INSIGHTS={
  hydro:()=>{
    const d=depth,P=pressMPa(d),r=rho(d),Pat=P*9.869;
    const hist=telLog.slice(-60).map(x=>x.pres);
    return {title:'Hydrostatics — Depth vs. Pressure Profiling',
      body:_section('Live measurements')+
      `<table style="font-family:monospace;font-size:13px">${_row('Depth',d.toFixed(2),'m')}${_row('Pressure (abs)',P.toFixed(4),'MPa')}${_row('Pressure',(P*1000).toFixed(1),'kPa')}${_row('Equivalent',Pat.toFixed(2),'atm')}${_row('Sea-water ρ',r.toFixed(2),'kg/m³')}${_row('Gauge force/m²',((P-0.101325)*1e6).toFixed(0),'N/m²')}</table>`+
      _section('Governing equation')+_eq('P(h) = P₀ + ρ(h)·g·h ,   ρ = 1000 + 0.75·S − 0.20·T(h)')+
      _section('Recent pressure trend (MPa)')+_spark(hist,300,80,'#5feaff')+
      _section('Research extensions')+_list([
        'Compare measured pressure vs. UNESCO TEOS-10 reference EOS.',
        'Pressure-time loading curves for cyclic-dive fatigue studies.',
        'Cross-validate with INCOIS Argo float CTD profiles.',
        'Derive isopycnal layers and compute mixed-layer depth (MLD).'
      ])};
  },
  hull:()=>{
    const d=depth,shi=SHI(d),P=pressMPa(d)*1e6,sigma=P*SUB.R/SUB.T_HULL/1e6;
    const margin=(SUB.CRUSH-d),util=d/SUB.CRUSH*100;
    const Pf=Math.max(0,Math.min(1,(sigma/SUB.HY80-0.5)*2));
    const cycles=Math.max(1,Math.round(Math.pow(SUB.HY80/Math.max(sigma,10),3.2)*1e4));
    const hist=telLog.slice(-60).map(x=>x.shi);
    return {title:'Hull Integrity — Fatigue &amp; Crush-Depth Margin',
      body:_section('Structural state')+
      `<table style="font-family:monospace;font-size:13px">${_row('Depth',d.toFixed(1),'m')}${_row('Crush depth',SUB.CRUSH,'m')}${_row('Margin to crush',margin.toFixed(1),'m')}${_row('Depth utilisation',util.toFixed(1),'%')}${_row('Hoop stress σ',sigma.toFixed(1),'MPa')}${_row('Yield (HY-80)',SUB.HY80,'MPa')}${_row('σ / σ_yield',(sigma/SUB.HY80*100).toFixed(2),'%')}${_row('SHI',shi.toFixed(3),'')}${_row('Failure Pf',(Pf*100).toFixed(2),'%')}${_row('Est. dive cycles to failure',cycles.toLocaleString(),'')}</table>`+
      _section('Governing equations')+_eq('σ_hoop = P·R / t   ·   SHI = 1 − D/D_crush')+_eq('Basquin (S-N): N_f ≈ (σ_y/σ)^b ,  b≈3.2 for HY-80')+
      _section('SHI history')+_spark(hist,300,80,'#4dff9a')+
      _section('Research extensions')+_list([
        'Cyclic ascent/dive fatigue logging — count load reversals per mission.',
        'Compute Miner&apos;s rule cumulative damage Σ(nᵢ/Nᵢ).',
        'Hull-thickness sensitivity sweep (T_HULL 0.018–0.035 m).',
        'FEA-coupled stress concentration around penetrators &amp; frames.'
      ])};
  },
  acoustic:()=>{
    const v=vel,R=cARange,SLv=SL(v),TL=TLoss(R),snr=getSNR(),cs=1449+4.6*T_at(d=depth)-0.055*Math.pow(T_at(d),2);
    const sofarMin=ocean.thermo+300;
    const hist=telLog.slice(-60).map(x=>x.snr);
    return {title:'Acoustics — TL, SOFAR &amp; Shadow-Zone Study',
      body:_section('Acoustic state')+
      `<table style="font-family:monospace;font-size:13px">${_row('Mode',sonarMode().toUpperCase(),'')}${_row('Source level SL',SLv.toFixed(1),'dB')}${_row('Range to ALPHA',R.toFixed(0),'m')}${_row('Transmission loss',TL.toFixed(1),'dB')}${_row('SNR',snr.toFixed(1),'dB')}${_row('Sound speed (Mackenzie)',cs.toFixed(1),'m/s')}${_row('Thermocline base',ocean.thermo,'m')}${_row('SOFAR axis ≈',sofarMin,'m')}${_row('In shadow zone?',(depth>ocean.thermo&&depth<sofarMin)?'YES':'no','')}</table>`+
      _section('Governing equations')+_eq('TL = 20·log₁₀(R) + α·R       (α≈0.003 dB/m)')+_eq('SNR_passive = SL − TL − (NL − DI)')+_eq('c = 1449 + 4.6T − 0.055T² + 1.34(S−35) + 0.016z')+
      _section('SNR trend (dB)')+_spark(hist,300,80,'#ffc14d')+
      _section('Research extensions')+_list([
        'Ray-trace Snell&apos;s law refraction across the thermocline.',
        'Plot SOFAR convergence-zone ranges for long-range detection.',
        'Vary salinity / temperature and observe shadow-zone shift.',
        'Compare passive vs. active (bistatic) detection budgets.'
      ])};
  },
  bayes:()=>{
    const pri=0.5,pd=detPd(getSNR()),post=cAProb;
    const seq=telLog.slice(-30).map(x=>x.pd/100);
    return {title:'Bayesian Inference — Contact Classification',
      body:_section('Belief state — CONTACT ALPHA')+
      `<table style="font-family:monospace;font-size:13px">${_row('Prior P(H)',pri.toFixed(2),'')}${_row('Likelihood P(D|H) = Pd',pd.toFixed(3),'')}${_row('Posterior P(H|D)',post.toFixed(3),'')}${_row('Confidence',(post*100).toFixed(1),'%')}${_row('Bayes factor',(pd/(1-pd+1e-6)).toFixed(2),'')}</table>`+
      _section('Update rule')+_eq('P(H|D) = P(D|H)·P(H) / [P(D|H)·P(H) + P(D|¬H)·P(¬H)]')+
      _section('Posterior evolution')+_spark(seq,300,80,'#5feaff')+
      _section('Research extensions')+_list([
        'Multi-hypothesis tracking (MHT): submarine vs. whale vs. merchant.',
        'Sequential Monte Carlo (particle filter) over bearing &amp; range.',
        'Kalman-filtered Pd with sensor-noise covariance R.',
        'Information gain ΔH = H(prior) − H(posterior) per ping.'
      ])};
  },
  hydrodyn:()=>{
    const thr=+document.getElementById('sl-thr').value,bal=+document.getElementById('sl-bal').value;
    const Ft=thr/100*SUB.F_MAX,Fd=0.5*rho(depth)*vel*vel*SUB.Cd*Math.PI*SUB.R*SUB.R;
    const m=SUB.MASS_S+(SUB.MASS_D-SUB.MASS_S)*bal/100;
    const W=m*9.81,Vh=Math.PI*SUB.R*SUB.R*SUB.LOA,Fb=rho(depth)*9.81*Vh;
    const Fnet=Ft-Fd,acc=Fnet/m;
    return {title:'Hydrodynamics — Thrust / Drag / Buoyancy Balance',
      body:_section('Force balance (current)')+
      `<table style="font-family:monospace;font-size:13px">${_row('Throttle',thr,'%')}${_row('Speed',(vel*1.944).toFixed(2),'kn')}${_row('Thrust F_t',(Ft/1e3).toFixed(1),'kN')}${_row('Drag F_d',(Fd/1e3).toFixed(2),'kN')}${_row('Mass m',(m/1e3).toFixed(0),'t')}${_row('Weight W',(W/1e6).toFixed(2),'MN')}${_row('Buoyancy F_b',(Fb/1e6).toFixed(2),'MN')}${_row('Net horizontal F',(Fnet/1e3).toFixed(1),'kN')}${_row('Acceleration',acc.toFixed(3),'m/s²')}${_row('Ballast',bal,'%')}</table>`+
      _section('Governing equations')+_eq('F_d = ½·ρ·v²·C_d·A   (A = π·R²)')+_eq('F_b = ρ·g·V_hull   ·   m·v̇ = F_t − F_d')+
      _section('Research extensions')+_list([
        'Vary C_d (0.08–0.20) — quantify boundary-layer sensitivity.',
        'Compute Froude number and wavemaking-drag regime near surface.',
        'Energy budget: kinetic ↔ thrust work ↔ drag dissipation.',
        'Propeller efficiency curve η(J) using advance ratio.'
      ])};
  },
  thermo:()=>{
    const Tsurf=ocean.SST,Td=T_at(depth),cSurf=1449+4.6*Tsurf,cD=1449+4.6*Td;
    const grad=(cD-cSurf)/Math.max(depth,1);
    const inShadow=depth>ocean.thermo;
    return {title:'Thermocline Impact on Sonar Performance',
      body:_section('Water-column state')+
      `<table style="font-family:monospace;font-size:13px">${_row('SST',Tsurf.toFixed(1),'°C')}${_row('T at depth',Td.toFixed(1),'°C')}${_row('Salinity',ocean.S,'PSU')}${_row('Thermocline base',ocean.thermo,'m')}${_row('Sub depth',depth.toFixed(1),'m')}${_row('c surface',cSurf.toFixed(0),'m/s')}${_row('c at depth',cD.toFixed(0),'m/s')}${_row('dc/dz',grad.toFixed(3),'(m/s)/m')}${_row('Sub below thermocline?',inShadow?'YES — refractive shadow likely':'no','')}</table>`+
      _section('Governing equations')+_eq('T(z) = SST − min((z/z_thermo)^1.4 · 16 , 16)')+_eq('Snell: cos(θ)/c = const   (rays bend toward lower c)')+
      _section('Research extensions')+_list([
        'Map detection probability vs. depth across thermocline.',
        'Diurnal SST cycling effect on shallow-water acoustics.',
        'Compare monsoon vs. non-monsoon BoB profiles (INCOIS).',
        'Couple to bottom bounce / surface duct ray families.'
      ])};
  },
  mission:(big)=>{
    const done=mGoals.filter(Boolean).length,total=mGoals.length;
    const SA=Math.min(1,(cAProb+(window.cBProb||0))/2);
    const MS=done/total;
    const dec=telLog.length;
    const N=Math.min(80,telLog.length);
    const tail=telLog.slice(-N);
    const series=[
      {key:'d',label:'Depth',unit:'m',color:'#5feaff',data:tail.map(x=>x.d)},
      {key:'v',label:'Speed',unit:'kn',color:'#4dff9a',data:tail.map(x=>x.v)},
      {key:'pres',label:'Pressure',unit:'MPa',color:'#ffc14d',data:tail.map(x=>x.pres)},
      {key:'shi',label:'SHI',unit:'',color:'#ff7aa8',data:tail.map(x=>x.shi)},
      {key:'snr',label:'SNR',unit:'dB',color:'#c08bff',data:tail.map(x=>x.snr)},
      {key:'pd',label:'Pd',unit:'%',color:'#ffae33',data:tail.map(x=>x.pd)}
    ];
    const cw=big?900:560,chH=big?320:230;
    return {title:'Mission Analytics — SA, MS &amp; Decision Logs',
      body:_section('Mission KPIs')+
      `<table style="font-family:monospace;font-size:13px">${_row('Elapsed',elapsed.toFixed(0),'s')}${_row('Goals completed',done+' / '+total,'')}${_row('Mission Score (MS)',(MS*100).toFixed(0),'%')}${_row('Situational Awareness (SA)',(SA*100).toFixed(0),'%')}${_row('Decision events logged',dec,'')}${_row('Max depth',stats.maxDepth.toFixed(1),'m')}${_row('Max speed',(stats.maxSpeed*1.944).toFixed(1),'kn')}${_row('Min SHI',stats.minSHI.toFixed(2),'')}${_row('Peak Pd',(stats.maxPd*100).toFixed(0),'%')}${_row('Time below thermocline',stats.thermoTime.toFixed(0),'s')}</table>`+
      _section('Telemetry analytics — toggle any element')+_multiChart(series,cw,chH)+
      _section('Equations')+_eq('SA = Σ P(contact_i) / N      MS = goals_done / goals_total')+
      _section('Research extensions')+_list([
        'Endsley 3-level SA model — perception/comprehension/projection.',
        'Decision-tree replay from telLog for after-action review.',
        'Cognitive workload proxy: control-input rate (Hz).',
        'Mission-effectiveness curves vs. crew experience cohorts.'
      ])};
  },
  human:()=>{
    const thr=+document.getElementById('sl-thr').value,rud=+document.getElementById('sl-rud').value,div=+document.getElementById('sl-div').value;
    const pHist=telLog.slice(-40).map(x=>x.p);
    return {title:'Human Factors — Control Response &amp; Reaction',
      body:_section('Current operator inputs')+
      `<table style="font-family:monospace;font-size:13px">${_row('Throttle',thr,'%')}${_row('Rudder',rud,'°')}${_row('Dive planes',div,'°')}${_row('Pitch response',pitch.toFixed(2),'°')}${_row('Yaw rate',(rud*0.008*vel).toFixed(2),'°/s')}${_row('Speed',(vel*1.944).toFixed(2),'kn')}</table>`+
      _section('Pitch response trace')+_spark(pHist,300,80,'#ffae33')+
      _section('Research extensions')+_list([
        'Reaction-time histogram: command-to-effect latency.',
        'Control-effort index Σ|Δu|/Δt — pilot-induced oscillation risk.',
        'NASA-TLX subjective workload survey integration.',
        'Eye-tracking overlay to study attention distribution.'
      ])};
  },
  ai:()=>{
    const haveC=!!localStorage.getItem('navsim_claude_key');
    const haveG=!!localStorage.getItem('navsim_gemini_key');
    return {title:'AI Tutoring — Claude / Gemini Explanations',
      body:_section('Provider status')+
      `<table style="font-family:monospace;font-size:13px">${_row('Claude (Sonnet)',haveC?'KEY SET ✓':'no key','')}${_row('Gemini 1.5 Flash',haveG?'KEY SET ✓':'no key','')}${_row('Current sim context','depth '+depth.toFixed(0)+' m · SNR '+getSNR().toFixed(0)+' dB · SHI '+SHI(depth).toFixed(2),'')}</table>`+
      _section('What the tutor can explain')+_list([
        'Why pressure rises non-linearly with depth (ρ feedback).',
        'When to switch passive→active sonar (shadow-zone reasoning).',
        'How Bayesian updates change contact confidence.',
        'Trade-offs between speed, drag and acoustic stealth.',
        'Hull-fatigue implications of repeated deep excursions.'
      ])+
      _section('Research extensions')+_list([
        'RAG over INCOIS / NIO data for region-specific tutoring.',
        'A/B trial: tutored vs. untutored learner outcomes.',
        'Auto-generate Socratic questions from telLog events.',
        'Multi-agent debate (Claude vs. Gemini) on dive decisions.'
      ])+
      `<div style="margin-top:12px"><button class="btn" onclick="hideInsight();showChat()" style="cursor:pointer">Open AI Tutor →</button></div>`};
  },
  pdf:()=>{
    return {title:'PDF Research Report — Graphs + Telemetry Log',
      body:_section('Report contents (auto-generated)')+_list([
        'Cover page with mission scenario, date, operator.',
        'Live telemetry table (depth, speed, pressure, SHI, SNR, Pd).',
        'Depth-vs-time and SHI-vs-time embedded graphs.',
        'Sonar contact log with Bayesian confidence trace.',
        'Physics equations used, with substituted values.',
        'AI Instructor commentary at key decision points.',
        'Mission scorecard (SA, MS, max-depth, min-SHI, peak Pd).'
      ])+
      _section('Current log size')+
      `<table style="font-family:monospace;font-size:13px">${_row('Telemetry samples',telLog.length,'')}${_row('Elapsed',elapsed.toFixed(0),'s')}${_row('Sample rate','1 every 5 s','')}</table>`+
      _section('Research extensions')+_list([
        'CSV / JSON export for MATLAB / Python post-processing.',
        'Reproducibility manifest (scenario seed, ocean state, controls).',
        'Cohort comparison reports across multiple student runs.',
        'LaTeX export for thesis / journal-quality figures.'
      ])+
      `<div style="margin-top:12px;display:flex;gap:8px"><button class="btn" onclick="hideInsight();exportPDF()" style="cursor:pointer">Generate PDF →</button></div>`};
  }
};

function showInsight(k,keepEnlarge){
  const m=INSIGHTS[k];if(!m)return;
  window._lastInsightKey=k;
  const box=document.getElementById('ins-box');
  const big=box.classList.contains('enlarged');
  const data=m(big);
  document.getElementById('ins-title').innerHTML=data.title;
  document.getElementById('ins-body').innerHTML=data.body;
  document.getElementById('ins-overlay').classList.add('show');
}
function hideInsight(){document.getElementById('ins-overlay').classList.remove('show');}
