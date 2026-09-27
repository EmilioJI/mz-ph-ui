"use strict";

(function(){
  const data = [
    {key:"Build", value:92, detail:"CI workflow success"},
    {key:"Code", value:88, detail:"commit / PR activity"},
    {key:"Quality", value:84, detail:"test and bug signals"},
    {key:"Progress", value:90, detail:"task completion"},
    {key:"Risk", value:76, detail:"lower risk is better"}
  ];

  function point(cx,cy,r,index,total){
    const a=-Math.PI/2+index*Math.PI*2/total;
    return [cx+Math.cos(a)*r,cy+Math.sin(a)*r];
  }

  function render(){
    const root=document.getElementById("mapleHealthChart");
    if(!root)return;
    const cx=180,cy=180,outer=120;
    const pts=data.map((x,i)=>point(cx,cy,outer*x.value/100,i,data.length));
    const bg=data.map((x,i)=>point(cx,cy,outer,i,data.length).join(",")).join(" ");
    const poly=pts.map(x=>x.join(",")).join(" ");
    root.innerHTML=`<svg viewBox="0 0 360 360" role="img" aria-label="巡检健康枫叶图">
      <polygon points="${bg}" class="maple-grid"/>
      <polygon points="${poly}" class="maple-leaf"/>
      ${data.map((x,i)=>{const p=point(cx,cy,outer+24,i,data.length);return `<text x="${p[0]}" y="${p[1]}" class="maple-label">${x.key}</text>`}).join("")}
      <circle cx="180" cy="180" r="46" class="maple-core"/>
      <text x="180" y="176" text-anchor="middle" class="maple-score">86</text>
      <text x="180" y="198" text-anchor="middle" class="maple-sub">HEALTH</text>
    </svg>`;
    const metrics=document.getElementById("inspectionMetrics");
    if(metrics){
      metrics.innerHTML=data.map(x=>`<div class="inspection-metric"><strong>${x.key}</strong><span>${x.value}</span><small>${x.detail}</small></div>`).join("");
    }
    const report=document.getElementById("dailyInspectionReport");
    if(report)report.textContent="昨日巡检：采集 GitHub commits / CI / issues 数据，等待后端 collector 接入真实快照。";
  }
  window.addEventListener("DOMContentLoaded",render);
})();
