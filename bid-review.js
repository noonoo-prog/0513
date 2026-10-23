/* 10억 벌기: 원문 근거 기반 수동 참가자격 검토와 투찰 시나리오 (브라우저 저장). */
"use strict";
(function(){
  const KEY="0513-eligibility-verifications-v1";
  const PRICE_KEY="0513-bid-price-scenarios-v1";
  const SCORE_KEY="0513-bid-score-scenarios-v1";
  const CHECKS=[
    ["region","서울 본점으로 지역제한 충족 확인"],
    ["license","건축사사무소/해체·석면 해당 등록·지정 자격 확인"],
    ["performance","업체 실적 0원 기준 필수실적 및 적격심사 배점 확인"],
    ["staffing","건축사·특급·중급·초급 인력의 경력·등급·배치기간 확인"],
    ["process","PQ·공동도급·현장설명·계약조건 확인"],
    ["documents","최신 공고문·과업지침서 및 정정공고 직접 검토"]
  ];
  function load(key){try{const a=JSON.parse(localStorage.getItem(key)||"{}");return a&&typeof a==="object"&&!Array.isArray(a)?a:{}}catch{return {}}}
  const reviews=load(KEY), prices=load(PRICE_KEY), scores=load(SCORE_KEY);
  let history=[];
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const format=new Intl.NumberFormat("ko-KR");
  function amount(n){return Number.isFinite(+n)&&+n>0?format.format(+n)+"원":"원문 확인 필요"}
  function fingerprint(x){return [x.title,x.region,x.deadline,x.method,x.source].join("|")}
  function status(x){
    if(x.eligibility_status==="참가 불가")return "참가 불가";
    const r=reviews[x.id];
    if(r&&r.fingerprint===fingerprint(x)&&r.complete&&r.note&&r.note.trim().length>=10&&CHECKS.every(([key])=>r.checks&&r.checks[key])){
      return "참가 가능 (직접 검토)";
    }
    return "자격 확인 필요";
  }
  function summary(x){
    const s=status(x);
    if(s==="참가 불가")return (x.eligibility_evidence||[]).filter(Boolean).slice(0,2).join(" / ")||"서울 사무소 기준 참가 제한 의심 — 원문 확인";
    if(s.startsWith("참가 가능"))return "최신 공고문을 직접 검토해 참가요건 확인 완료로 기록했습니다. 증빙·경력·법정 지정은 최종적으로 발주처에서 확인하세요.";
    const found=(x.eligibility_evidence||[]).filter(Boolean).slice(0,2).join(" / ");
    const missing=(x.eligibility_missing||[]).slice(0,4).join(", ");
    const risk=x.fit==="risk"?"업체실적 0원으로 적격심사 통과 어려울 수 있습니다. ":"";
    return risk+(found?found+" · ":"")+(missing?"미확인: "+missing:"참가자격·실적·인력·낙찰하한율 원문 검토 필요");
  }
  function median(values){
    const v=values.filter(x=>Number.isFinite(x)&&x>=60&&x<=110).sort((a,b)=>a-b);
    if(v.length<5)return {median:null,n:v.length};
    let mid=Math.floor(v.length/2);
    return {median:v.length%2?v[mid]:(v[mid-1]+v[mid])/2,n:v.length};
  }
  function statsFor(cat){return median(history.filter(x=>x.category===cat).map(x=>x.award_rate===null||x.award_rate===undefined?NaN:Number(x.award_rate)))}
  function section(title,body){return '<h3 style="font-size:15px;margin:22px 0 10px">'+title+'</h3>'+body}
  function evidenceHtml(x){
    const doc=x.document_analysis||{};
    const rows=Object.entries(doc.evidence||{}).map(([k,v])=>{
      const names={
        region_clause:"지역·본점 제한",license_clause:"면허·참가자격",performance_clause:"업체 실적",
        staffing_clause:"감리원 등급·배치",floor_evidence:"낙찰하한율",base_evidence:"기초금액",score_clause:"적격심사"
      };
      return '<div class="vcell" style="margin:6px 0"><span>'+esc(names[k]||k)+'</span><div style="font-size:12px;line-height:1.7;overflow-wrap:anywhere">'+esc(v)+'</div></div>';
    }).join("");
    const files=(doc.files||[]).map(f=>'<div class="sub">• '+esc(f.name)+" — "+esc(f.status)+"</div>").join("");
    const links=(x.attachments||[]).slice(0,10).map(f=>{
      let safe="https://www.g2b.go.kr/";
      try{const u=new URL(f.url);if(u.protocol==="https:"&&["www.g2b.go.kr","g2b.go.kr","apis.data.go.kr"].includes(u.hostname))safe=u.href}catch{}
      return '<a class="source" target="_blank" rel="noopener noreferrer" href="'+esc(safe)+'">'+esc(f.name||"첨부문서")+' ↗</a>'
    }).join("<div style='height:6px'></div>");
    return '<div class="note" style="white-space:normal"><strong>자동 분석 상태:</strong> '+esc(doc.status||"원문 미확인")+
      '<p class="sub" style="margin:8px 0">공개 문서의 텍스트 일부를 추출했습니다. 누락된 표·스캔 PDF·첨부별 충돌사항이 있을 수 있습니다.</p>'+
      (rows||'<span class="sub">자동 추출된 자격조항이 없습니다. 원문을 열어 확인해 주세요.</span>')+
      (files?'<div style="margin-top:10px">'+files+'</div>':"")+
      (links?'<div style="margin-top:12px">'+links+'</div>':"")+
      '</div>';
  }
  function checklistHtml(x){
    const r=reviews[x.id]||{checks:{},note:""};
    return '<p class="sub" style="margin-top:0">자동 판정은 확정이 아닙니다. 실제 공고문과 사무소 보유 자격을 확인한 뒤에만 체크하세요. 확인 기록은 현재 브라우저에 저장됩니다.</p>'+
      '<div style="display:grid;gap:8px">'+CHECKS.map(([key,label])=>
        '<label style="font-size:13px;display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-review-check="'+key+'" '+(r.checks&&r.checks[key]?"checked":"")+' style="margin-top:3px;accent-color:#008CC0"><span>'+esc(label)+'</span></label>'
      ).join("")+'</div>'+
      '<div class="form-item full" style="margin-top:12px"><label for="reviewNote">확인한 공고문·항목·결과 메모 (10자 이상)</label><textarea id="reviewNote" class="field" rows="3" placeholder="예: 공고문 3쪽 지역제한 서울, 실적제한 없음, 배치표 확인...">'+esc(r.note||"")+'</textarea></div>'+
      '<div class="actions"><button class="btn primary" id="reviewSave" type="button">검토 결과 저장</button><button class="btn" id="reviewClear" type="button">검토 기록 초기화</button></div>'+
      '<p class="sub" style="margin-top:6px">검토 저장은 법적 참가자격을 보증하지 않습니다. 공고 변경 시 재확인해야 합니다.</p>';
  }
  function scoreHtml(x){
    const saved=scores[x.id]||{};
    const input=(id,label,value,placeholder)=>'<div class="form-item"><label for="'+id+'">'+label+'</label><input class="field" type="number" min="0" max="100" step="0.01" id="'+id+'" value="'+esc(value!==undefined?value:"")+'" placeholder="'+placeholder+'"></div>';
    return '<p class="sub" style="margin-top:0">적격심사표의 실제 배점을 입력하면, 업체실적 0원에 따른 <strong>이론적 최대점수</strong>를 확인할 수 있습니다. 자동으로 95점, 100점을 가정하지 않습니다.</p>'+
      '<div class="form-grid">'+
      input("scoreTotal","종합평가 만점",saved.total,"원문 확인")+
      input("scorePass","적격심사 통과점수",saved.pass,"원문 확인")+
      input("scorePerformanceMax","업체 실적 항목 만점",saved.performanceMax,"원문 확인")+
      input("scorePerformanceEarned","업체실적 0원일 때 해당 항목 점수",saved.performanceEarned,"평가표 기준 확인")+
      '</div><div class="actions"><button class="btn" type="button" id="scoreCalc">적격심사 최대점수 검토</button></div>'+
      '<div id="scoreResult" class="calc" aria-live="polite" style="margin-top:11px">적격심사 배점이 모두 확인되면 상한점수를 계산합니다. 개인 기술인 경력 및 신인도 등 다른 점수는 모두 만점으로 가정하는 상한선입니다.</div>';
  }
  function calculateScore(x){
    const q=id=>document.querySelector(id),p=q("#scoreResult");
    const names=["scoreTotal","scorePass","scorePerformanceMax","scorePerformanceEarned"];
    if(names.some(id=>q("#"+id).value.trim()==="")){p.textContent="원문에서 확인한 네 가지 배점을 모두 입력해야 계산할 수 있습니다.";return}
    const [total,pass,performanceMax,performanceEarned]=names.map(id=>Number(q("#"+id).value));
    if([total,pass,performanceMax,performanceEarned].some(n=>!Number.isFinite(n)||n<0||n>100)||
       total<=0||pass>total||performanceMax>total||performanceEarned>performanceMax){
      p.textContent="배점 범위를 확인해 주세요. 실적항목 득점 ≤ 실적항목 만점 ≤ 전체 만점, 통과점수 ≤ 전체 만점이어야 합니다.";
      return;
    }
    scores[x.id]={total,pass,performanceMax,performanceEarned,updatedAt:new Date().toISOString()};
    localStorage.setItem(SCORE_KEY,JSON.stringify(scores));
    const max=total-performanceMax+performanceEarned;
    const impossible=max+1e-8<pass;
    p.innerHTML='<strong>실적 0원 기준 이론적 최대점수: '+max.toFixed(2)+' / '+total.toFixed(2)+'점</strong>'+
      '<div style="margin-top:7px;font-weight:800;color:'+(impossible?"#a23b43":"#996006")+'">'+
      (impossible?"입력된 조건이 정확하다면 통과점수 "+pass.toFixed(2)+"점에 미달합니다.":"상한선상으로는 통과점수 "+pass.toFixed(2)+"점에 도달할 수 있습니다. 실제 통과 여부는 확인 필요합니다.")+
      '</div><div class="lead" style="margin-top:7px">실제 결과는 기술인 배치, 경영상태, 신인도, 지역, 감점 및 발주처 평가기준에 따라 달라집니다. 자동 참가자격 확정 또는 법률상 판정이 아닙니다.</div>';
  }
  function priceHtml(x){
    const stored=prices[x.id]||{},api=x.price_analysis||{};
    const base=stored.base!==undefined?stored.base:(x.base_amount||api.base_amount||"");
    const floor=stored.floor!==undefined?stored.floor:(x.floor_rate||api.floor_rate||"");
    const adjust=stored.adjust!==undefined?stored.adjust:100;
    const stats=statsFor(x.category);
    return '<p class="sub">기초금액은 <strong>배정예산·추정가격과 다릅니다.</strong> 공식 기초금액을 확인한 뒤 입력하세요. 낙찰하한율은 공고별 기준을 확인해야 하며, 사정률은 계산 가정입니다.</p>'+
      '<div class="form-grid" style="margin-top:12px">'+
      '<div class="form-item"><label for="scenarioBase">기초금액 (원)</label><input class="field" id="scenarioBase" type="number" min="1" step="1" placeholder="공식 기초금액" value="'+esc(base)+'"></div>'+
      '<div class="form-item"><label for="scenarioFloor">해당 공고 낙찰하한율 (%)</label><input class="field" id="scenarioFloor" type="number" min="75" max="100" step="0.001" placeholder="원문 하한율" value="'+esc(floor)+'"></div>'+
      '<div class="form-item"><label for="scenarioAdjust">예정가격 사정률 가정 (%)</label><input class="field" id="scenarioAdjust" type="number" min="90" max="110" step="0.01" value="'+esc(adjust)+'"></div>'+
      '<div class="form-item"><label>과거 같은 분야 낙찰률</label><div class="field" style="background:#f6f8fb">'+(stats.median!==null?stats.median.toFixed(3)+"% · "+stats.n+"건":"유효 표본 "+stats.n+"건 · 통계 보류")+'</div></div></div>'+
      '<div class="actions" style="margin-top:5px"><button class="btn primary" id="scenarioCalc" type="button">투찰금액 시나리오 계산</button></div>'+
      '<div id="scenarioResult" class="calc" aria-live="polite" style="margin-top:13px">공식 기초금액과 해당 공고의 하한율을 입력하면, 사정률 가정에 따른 금액을 계산합니다.</div>';
  }
  function show(x){
    const current=status(x);
    let html='<div class="tags" style="margin-top:12px"><span class="tag '+(current==="참가 불가"?"bad":current.startsWith("참가 가능")?"good":"caution")+'">'+esc(current)+'</span><span class="tag">'+esc(x.category||"감리 분야 미확인")+'</span></div>'+
      '<div class="viewgrid">'+
      '<div class="vcell"><span>API 표시금액 종류</span><b>'+esc(x.amountType||"금액 유형 미확인")+'</b><div>'+esc(amount(x.amount))+'</div></div>'+
      '<div class="vcell"><span>공식 기초금액</span><b>'+esc(amount(x.base_amount))+'</b></div>'+
      '<div class="vcell"><span>마감일시</span><b>'+esc(typeof dt==="function"?dt(x.deadline):x.deadline)+'</b></div>'+
      '<div class="vcell"><span>참가가능지역</span><b>'+esc(x.region||"미확인")+'</b></div></div>'+
      section("1. 자동 자격 분석",'<div class="note" style="white-space:normal;font-size:12px">'+
        '<strong>현재 판정:</strong> '+esc(current)+'<div style="margin-top:7px">'+esc(summary(x))+'</div>'+
        ((x.eligibility_missing||[]).length?'<div style="margin-top:7px;color:#9b5a14"><strong>미확인</strong> · '+esc(x.eligibility_missing.join(" / "))+'</div>':"")+
        '</div>')+
      section("2. PDF·HWP·HWPX 공고문 분석",evidenceHtml(x))+
      section("3. 직접 참가자격 확인",checklistHtml(x))+
      section("4. 실적 0원 적격심사 상한 계산",scoreHtml(x))+
      section("5. 투찰금액 시나리오",priceHtml(x))+
      '<div class="actions"><a class="btn" target="_blank" rel="noopener noreferrer" href="'+esc(x.source&&/^https:\/\//.test(x.source)?x.source:"https://www.g2b.go.kr/")+'">공고 원문 ↗</a><button class="btn" type="button" id="reviewClose">닫기</button></div>';
    if(typeof modal!=="function")return;
    modal(x.title,x.id+" · "+x.agency,html);
    const q=id=>document.querySelector(id);
    q("#reviewClose").onclick=()=>{if(typeof close==="function")close()};
    q("#reviewSave").onclick=()=>{
      const checks={};for(const [key] of CHECKS)checks[key]=!!q('[data-review-check="'+key+'"]').checked;
      const note=q("#reviewNote").value.trim(),complete=CHECKS.every(([key])=>checks[key])&&note.length>=10;
      if(complete&&x.eligibility_status==="참가 불가"){
        alert("API/공고문에서 참가 불가 조건이 확인됐습니다. 원문을 다시 확인한 뒤 별도로 판단하세요.");
        return;
      }
      reviews[x.id]={checks,note,complete,verifiedAt:new Date().toISOString(),source:x.source||"",fingerprint:fingerprint(x)};
      localStorage.setItem(KEY,JSON.stringify(reviews));
      if(typeof render==="function")render();
      if(!complete)alert("검토 내역은 저장했습니다. '참가 가능'은 전체 항목과 확인 메모를 충족한 후에만 표시됩니다.");
      show(x);
    };
    q("#reviewClear").onclick=()=>{
      delete reviews[x.id];localStorage.setItem(KEY,JSON.stringify(reviews));
      if(typeof render==="function")render();show(x);
    };
    q("#scenarioCalc").onclick=()=>calculate(x);
    q("#scoreCalc").onclick=()=>calculateScore(x);
  }
  function calculate(x){
    const q=id=>document.querySelector(id),result=q("#scenarioResult");
    const base=Number(q("#scenarioBase").value),floor=Number(q("#scenarioFloor").value),adjust=Number(q("#scenarioAdjust").value);
    if(!Number.isFinite(base)||base<=0||!Number.isFinite(floor)||floor<75||floor>100||
       !Number.isFinite(adjust)||adjust<90||adjust>110){
      result.textContent="공식 기초금액(1원 이상), 공고 하한율(75~100%), 사정률 가정(90~110%)을 확인해 주세요.";
      return;
    }
    prices[x.id]={base,floor,adjust,updatedAt:new Date().toISOString()};
    localStorage.setItem(PRICE_KEY,JSON.stringify(prices));
    const estimated=base*adjust/100,threshold=Math.round(estimated*floor/100);
    const stats=statsFor(x.category),verified=status(x).startsWith("참가 가능");
    const scenario=(n)=>amount(Math.round(base*n/100*floor/100));
    let historical="";
    if(stats.median!==null){
      historical='<div class="lead">유사 분야 과거 낙찰률 중앙값 '+stats.median.toFixed(3)+'% ('+stats.n+'건) · 예정가격 대비</div>';
      if(verified&&stats.median>=floor){
        historical+='<div><strong>비교용 참고 후보금액: '+amount(Math.round(estimated*stats.median/100))+'</strong></div>';
      }else{
        historical+='<div class="lead">원문 참가자격/해당 하한율 조건이 검증되기 전에는 과거 낙찰률로 투찰 후보를 추천하지 않습니다.</div>';
      }
    }else{historical='<div class="lead">유사 낙찰 사례 5건 미만 · 통계기반 참고금액 없음</div>'}
    result.innerHTML='<div class="lead">'+(verified?"직접 참가조건 확인 기록 있음":"자격 확인 전 · 계산값은 추천 투찰가 아님")+'</div>'+
      '<div style="margin:7px 0"><strong>예정가격 가정: '+amount(Math.round(estimated))+'</strong></div>'+
      '<div style="margin:7px 0"><strong>가정 하한선: '+amount(threshold)+'</strong></div>'+
      '<div class="lead">사정률 99% 하한선 '+scenario(99)+' / 101% 하한선 '+scenario(101)+'</div>'+
      '<div class="lead" style="margin:8px 0">기초금액 × 사정률 가정 × 공고 하한율입니다. 예상 예정가격을 확정하지 않으며 낙찰을 보장하지 않습니다.</div>'+
      historical+
      '<div class="lead" style="margin-top:8px">실제 투찰 전 원문, 법령, 최신 정정공고, PQ·적격심사 점수, 보험료 등 금액 조정항목을 확인하세요.</div>';
  }
  async function loadHistory(){
    try{
      const r=await fetch("./data/awards.json?ts="+Date.now(),{cache:"no-store"});
      if(!r.ok)return;
      const d=await r.json();if(d.status==="ready"&&Array.isArray(d.items))history=d.items;
    }catch(e){console.warn("유사 낙찰정보 일시 불러오기 실패",e)}
  }
  window.BidReview={status,summary,show,calculate};
  loadHistory();
  if(typeof render==="function")render();
})();
