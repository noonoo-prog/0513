/* 상어 레이더: 원문 근거 기반 수동 참가자격 검토와 투찰 시나리오 (브라우저 저장). */
"use strict";
(function(){
  const KEY="0513-eligibility-verifications-v1";
  const PRICE_KEY="0513-bid-price-scenarios-v1";
  const SCORE_KEY="0513-bid-score-scenarios-v1";
  const CHECKS=[
    ["region","서울 본점으로 지역제한 충족 확인"],
    ["license","건축사사무소/해체·석면 해당 등록·지정 자격 확인"],
    ["performance","해당 업무의 보유실적·필수실적·평가배점 확인 (설계·감리 별도)"],
    ["staffing","건축사·특급·중급·초급 인력의 경력·등급·배치기간 확인"],
    ["process","PQ·공동도급·현장설명·계약조건 확인"],
    ["documents","최신 공고문·과업지침서 및 정정공고 직접 검토"]
  ];
  function load(key){try{const a=JSON.parse(localStorage.getItem(key)||"{}");return a&&typeof a==="object"&&!Array.isArray(a)?a:{}}catch{return {}}}
  const reviews=load(KEY), prices=load(PRICE_KEY), scores=load(SCORE_KEY);
  let history=[];
  let historyUpdatedAt="";
  let historyReady=false;
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
  function brief(x){
    const current=status(x);
    const evidence=Array.isArray(x.eligibility_evidence)?x.eligibility_evidence.map(String):[];
    const regionFromDocument=evidence.map(v=>{
      const m=v.match(/^공고문\s*(?:지역 제한 확인|본점 지역제한|명시 지역제한)\s*:\s*([^/·,\n]{2,28})/);
      return m?m[1].trim():"";
    }).find(Boolean);
    const apiRegion=String(x.region||"");
    let reason="";
    if(current==="참가 불가"){
      if(regionFromDocument)reason="지역제한 "+regionFromDocument+" — 서울 소재 사무소 참가 불가";
      else if(apiRegion&&!/미확인|서울|전국|제한없음/.test(apiRegion))
        reason="참가지역 "+apiRegion+" — 서울 소재 사무소 제한";
      else reason="지역 등 참가요건 불일치 — 공고문 재확인 필요";
    }else if(current.startsWith("참가 가능")){
      reason="공고문 자격요건 직접 확인 기록 완료 (정정공고 재확인)";
    }else{
      const missing=Array.isArray(x.eligibility_missing)?x.eligibility_missing:[];
      const flags=[];
      if(missing.some(v=>/지역/.test(v))||/미확인/.test(apiRegion))flags.push("지역제한");
      if(/설계/.test(x.category||""))flags.push("설계실적·추가 자격·제출물");else flags.push("감리실적 0원 배점","면허·감리원 배치");
      reason=flags.join(" · ")+" 확인 필요";
    }
    const cat=String(x.category||"건축감리");
    let requirements="";
    if(/설계/.test(cat))requirements="참가 지역 · 건축사사무소 등록 · 설계실적(별도 확인) · 협업 자격 · 제출물·일정";
    else if(cat==="해체감리")requirements="본점 소재지 · 해체공사감리자 지정·자격 · 감리원 배치 · 업체실적";
    else if(cat==="석면감리")requirements="본점 소재지 · 석면해체작업 감리인 등록·교육 · 배치인력 · 업체실적";
    else requirements="본점 소재지 · 건축사사무소 등록 · 업체실적·적격심사 · 감리원 등급·배치";
    return {reasonTitle:current==="참가 불가"?"불가 사유":current.startsWith("참가 가능")?"검토 결과":"확인 필요 사유",
            reason,requirements};
  }
  function median(values){
    const v=values.filter(x=>Number.isFinite(x)&&x>=60&&x<=110).sort((a,b)=>a-b);
    if(v.length<5)return {median:null,n:v.length};
    let mid=Math.floor(v.length/2);
    return {median:v.length%2?v[mid]:(v[mid-1]+v[mid])/2,n:v.length};
  }
  function statsFor(cat,minBidders=0){
    return median(history.filter(x=>x.category===cat&&Number(x.bidder_count)>=minBidders)
      .map(x=>x.award_rate===null||x.award_rate===undefined?NaN:Number(x.award_rate)));
  }
  // 낙찰정보의 참가업체 수가 2명 이상인 유효 건만 가격경쟁 모형에 투입한다.
  // 공고별 하한율 데이터가 낙찰정보에 없으므로, 최근 낙찰률이
  // 현재 공고 하한율부터 +1.00%p 안에 있는 사례로 유사도를 제한한다.
  function empiricalPool(category,floor){
    return history.filter(x=>{
      const rate=Number(x.award_rate),bidderCount=Number(x.bidder_count);
      return x.category===category&&Number.isInteger(bidderCount)&&bidderCount>=2&&
        x.award_rate!==null&&x.award_rate!==undefined&&Number.isFinite(rate)&&
        rate+0.0000001>=floor&&rate<=floor+1.0000001;
    }).map(x=>({rate:Number(x.award_rate),count:Number(x.bidder_count)}));
  }
  function observedSurvival(pool,rate){
    const wins=pool.reduce((sum,item)=>sum+(item.rate>rate+0.0000001?1:item.rate<rate-0.0000001?0:0.5),0);
    // Jeffreys 계열 완화: 0%/100% 확정 예측 금지.
    return (wins+0.5)/(pool.length+1);
  }
  // 과거 결과는 'n_i개 경쟁자 중 가장 낮은 유효입찰'이라고 단순 가정.
  // 관측 생존 비중 E[s^n_i]에서 업체별 생존확률 s를 역산한다.
  // 새 입찰에서 상대방은 참가 예상 수 - 1개로 계산한다.
  function modeledAdvantage(pool,rate,participants){
    const observed=observedSurvival(pool,rate);
    let lo=0,hi=1;
    for(let i=0;i<34;i++){
      const mid=(lo+hi)/2;
      const survival=pool.reduce((sum,item)=>sum+Math.pow(mid,item.count),0)/pool.length;
      if(survival>observed)hi=mid;else lo=mid;
    }
    return Math.pow((lo+hi)/2,participants-1);
  }
  // 목표 가격 경쟁 우위 확률을 충족하는 범위 내 가장 높은 추정 투찰률.
  function chooseRate(pool,floor,participants,target){
    const min=floor+0.001,max=Math.min(100,floor+1);
    if(modeledAdvantage(pool,min,participants)<target)return min;
    if(modeledAdvantage(pool,max,participants)>=target)return max;
    let lo=min,hi=max;
    for(let i=0;i<26;i++){
      const mid=(lo+hi)/2;
      if(modeledAdvantage(pool,mid,participants)>=target)lo=mid;else hi=mid;
    }
    return Math.max(min,Math.floor(lo*1000)/1000);
  }
  function section(title,body){const open=/^1\./.test(title)?" open":"";return '<details class="review-section"'+open+' style="border-top:1px solid #e1e7ed;margin-top:10px"><summary style="font-size:15px;font-weight:800;padding:13px 3px;cursor:pointer;list-style:auto">'+esc(title)+'</summary><div style="padding:0 3px 12px">'+body+'</div></details>'}
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
    const base=stored.base!==undefined?stored.base:(x.base_amount||api.base_amount||(x.custom&&x.amount?x.amount:""));
    const floor=stored.floor!==undefined?stored.floor:(x.floor_rate||api.floor_rate||"");
    const adjust=stored.adjust!==undefined?stored.adjust:100;
    const bidders=stored.bidders!==undefined?stored.bidders:5;
    const autoBase=Number(x.base_amount||api.base_amount||(x.custom&&x.amount?x.amount:0))>0;
    const autoFloor=Number(x.floor_rate||api.floor_rate)>0;
    const sample=Number(floor)>0?empiricalPool(x.category,Number(floor)):history.filter(a=>a.category===x.category&&Number(a.bidder_count)>=2);
    const dataNote=autoBase&&autoFloor
      ?"해당 공고의 수집된 기초금액·낙찰하한율을 자동 입력했습니다."
      :"공고에서 확인된 항목만 자동 입력했습니다. "+(!autoBase?"기초금액 ":"")+(!autoFloor?"낙찰하한율 ":"")+"확인이 필요합니다.";
    return '<p class="sub" style="margin-top:0">'+esc(dataNote)+' 배정예산과 추정가격은 기초금액으로 대체하지 않습니다.</p>'+
      '<div class="form-grid" style="margin-top:12px">'+
      '<div class="form-item"><label for="scenarioBase">기초금액 (원)</label><input class="field" id="scenarioBase" type="number" min="1" step="1" placeholder="미확인 시 공고에서 입력" value="'+esc(base)+'"></div>'+
      '<div class="form-item"><label for="scenarioFloor">공고 낙찰하한율 (%)</label><input class="field" id="scenarioFloor" type="number" min="75" max="100" step="0.001" placeholder="공고별 하한율" value="'+esc(floor)+'"></div>'+
      '<div class="form-item"><label for="scenarioAdjust">예정가격 사정률 가정 (%)</label><input class="field" id="scenarioAdjust" type="number" min="90" max="110" step="0.01" value="'+esc(adjust)+'"></div>'+
      '<div class="form-item"><label for="scenarioBidders">예상 참가업체 수 (2개 이상)</label><input class="field" id="scenarioBidders" type="number" min="2" max="500" step="1" value="'+esc(bidders)+'"></div></div>'+
      '<p class="sub" style="margin:0 0 9px">낙찰자료: <a href="./awards.html" class="source" target="_blank" rel="noopener noreferrer">실제 낙찰정보 보기</a> · 참가업체 1개인 건 제외 ·'+
      (Number(floor)>0?" 하한율 유사 사례 "+sample.length+"건":" 같은 분야 2개 이상 경쟁 사례 "+sample.length+"건")+'</p>'+
      '<div class="actions" style="margin-top:5px"><button class="btn primary" id="scenarioCalc" type="button">투찰금액 시나리오 계산</button></div>'+
      '<div id="scenarioResult" class="calc" aria-live="polite" style="margin-top:13px">버튼 한 번으로 실제 낙찰정보 기반 2·3·5·10·15개 업체 시나리오를 계산합니다. 낙찰사례 5건 미만은 확률을 산출하지 않습니다.</div>';
  }
  function show(x){
    const current=status(x);
    const short=brief(x);
    let html='<div class="tags" style="margin-top:12px"><span class="tag '+(current==="참가 불가"?"bad":current.startsWith("참가 가능")?"good":"caution")+'">'+esc(current)+'</span><span class="tag">'+esc(x.category||"감리 분야 미확인")+'</span></div>'+
      '<div class="note" style="margin:12px 0;font-size:13px;line-height:1.7;white-space:normal"><strong>'+esc(short.reasonTitle)+'</strong> · '+esc(short.reason)+'<div style="margin-top:5px"><strong>확인할 자격</strong> · '+esc(short.requirements)+'</div></div>'+
      '<div class="viewgrid">'+
      '<div class="vcell"><span>API 표시금액 종류</span><b>'+esc(x.amountType||"금액 유형 미확인")+'</b><div>'+esc(amount(x.amount))+'</div></div>'+
      '<div class="vcell"><span>'+esc(x.base_amount_source||"기초금액 (API·원문 확인 필요)")+'</span><b>'+esc(amount(x.base_amount))+'</b></div>'+
      '<div class="vcell"><span>마감일시</span><b>'+esc(typeof dt==="function"?dt(x.deadline):x.deadline)+'</b></div>'+
      '<div class="vcell"><span>참가가능지역 (원문 우선)</span><b>'+esc(typeof regionDisplay==="function"?regionDisplay(x):x.region||"미확인")+'</b></div></div>'+
      section("1. 자동 자격 분석",'<div class="note" style="white-space:normal;font-size:12px">'+
        '<strong>현재 판정:</strong> '+esc(current)+'<div style="margin-top:7px">'+esc(summary(x))+'</div>'+
        ((x.eligibility_missing||[]).length?'<div style="margin-top:7px;color:#9b5a14"><strong>미확인</strong> · '+esc(x.eligibility_missing.join(" / "))+'</div>':"")+
        '</div>')+
      section("2. 원문 근거 및 첨부 분석",evidenceHtml(x))+
      section("3. 직접 참가자격 확인 · 체크리스트",checklistHtml(x))+
      (/설계/.test(x.category||"")?section("4. 설계·공모 검토", "설계실적은 감리실적과 별도 확인합니다. "+esc(x.collaboration_status||"단독·공동 참여 자격 원문 확인 필요")+" · "+esc(x.workload_status||"제출물·설계비·면적·기간 원문 확인 필요")):section("4. 적격심사 점수 계산",scoreHtml(x)))+
      (x.category==="설계공모"?section("5. 공모 일정", "참가등록: "+esc(x.registration_deadline||"원문 확인 필요")+" · 작품제출: "+esc(x.submission_deadline||"원문 확인 필요")):section("5. 투찰금액 시나리오",priceHtml(x)))+
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
    if(q("#scenarioCalc"))q("#scenarioCalc").onclick=()=>calculate(x);
    if(q("#scoreCalc"))q("#scoreCalc").onclick=()=>calculateScore(x);
  }
  async function calculate(x){
    const q=id=>document.querySelector(id),result=q("#scenarioResult");
    if(!result)return;
    const b=q("#scenarioBase"),f=q("#scenarioFloor"),a=q("#scenarioAdjust"),c=q("#scenarioBidders");
    const base=Number(b.value),floor=Number(f.value),adjust=Number(a.value),bidders=Number(c.value);
    const missing=[];
    if(!b.value.trim())missing.push("공식 기초금액");
    if(!f.value.trim())missing.push("공고 낙찰하한율");
    if(missing.length){
      result.innerHTML='<strong>자동계산에 필요한 공고 정보: '+esc(missing.join(" · "))+'</strong>'+
        '<div class="lead" style="margin-top:8px">확인된 값은 자동 입력했습니다. 나머지는 공고에서 확인하여 입력해 주세요. 배정예산이나 임의 하한율을 사용하지 않습니다.</div>';
      return;
    }
    if(!Number.isFinite(base)||base<=0||!Number.isFinite(floor)||floor<75||floor>100||
       !Number.isFinite(adjust)||adjust<90||adjust>110||
       !Number.isInteger(bidders)||bidders<2||bidders>500){
      result.textContent="기초금액 1원 이상, 하한율 75~100%, 사정률 90~110%, 참가업체 수는 정수 2~500개로 입력해 주세요.";
      return;
    }
    prices[x.id]={base,floor,adjust,bidders,updatedAt:new Date().toISOString()};
    localStorage.setItem(PRICE_KEY,JSON.stringify(prices));
    if(!historyReady){
      result.textContent="낙찰정보를 읽어 분석하고 있습니다.";
      await loadHistory();
      // 사용자가 그 사이에 모달을 닫거나 다른 공고를 연 경우 기존 계산 노출 방지.
      if(document.querySelector("#scenarioResult")!==result)return;
    }
    const estimated=base*adjust/100;
    const threshold=Math.ceil(estimated*floor/100);
    const pool=empiricalPool(x.category,floor);
    const competitors=[...new Set([2,3,5,10,15,bidders])].sort((l,r)=>l-r);
    const verified=status(x).startsWith("참가 가능");
    const sourceInfo=historyUpdatedAt?historyUpdatedAt.slice(0,10)+" 수집":"최신 수집 시각 미확인";
    const fmtRate=n=>n.toFixed(3)+"%";
    const at=rate=>amount(Math.max(threshold,Math.ceil(estimated*rate/100)));
    const header='<div class="lead">'+(verified?"참가자격 직접 확인 기록 있음":"참가자격 미확인 · 참고 계산")+
      ' · 낙찰정보 '+esc(sourceInfo)+' · '+esc(x.category||"감리")+'</div>'+
      '<div class="viewgrid" style="margin-top:9px">'+
        '<div class="vcell"><span>예정가격 가정</span><b>'+amount(Math.round(estimated))+'</b></div>'+
        '<div class="vcell"><span>가정 낙찰하한선</span><b>'+amount(threshold)+'</b></div>'+
      '</div>';
    if(!historyReady){
      result.innerHTML=header+'<div class="lead">낙찰정보를 불러오지 못해 확률 추정은 중단했습니다. 원문 기준금액 계산만 표시합니다.</div>';
      return;
    }
    const sampleInfo='<div class="lead" style="margin-top:8px"><strong>분석 표본: '+pool.length+'건</strong> · '+
      '같은 분야 · 참가업체 2개 이상 · 낙찰률 '+fmtRate(floor)+'~'+fmtRate(Math.min(100,floor+1))+
      ' 사례만 비교 · <a class="source" href="./awards.html" target="_blank" rel="noopener noreferrer">낙찰 원자료 보기</a></div>';
    if(pool.length<5){
      const near=at(Math.min(100,floor+0.01)),mid=at(Math.min(100,floor+0.05)),far=at(Math.min(100,floor+0.10));
      result.innerHTML=header+sampleInfo+
        '<div style="margin:12px 0;font-weight:800">유사 낙찰사례 5건 미만 · 확률 산출 보류</div>'+
        '<div class="viewgrid">'+
        '<div class="vcell"><span>하한율 +0.010%p</span><b>'+near+'</b></div>'+
        '<div class="vcell"><span>하한율 +0.050%p</span><b>'+mid+'</b></div>'+
        '<div class="vcell"><span>하한율 +0.100%p</span><b>'+far+'</b></div>'+
        '</div><div class="lead">위 금액은 산술 예시일 뿐 추천 투찰금액이나 확률 예측이 아닙니다. 타 분야 및 1개 업체 낙찰 사례를 가져와 확률을 임의 생성하지 않습니다.</div>';
      return;
    }
    const targets=[
      ["가격경쟁 우위 80% 가정",0.8],
      ["가격경쟁 우위 60% 가정",0.6],
      ["가격경쟁 우위 40% 가정",0.4]
    ];
    const chosen=targets.map(([name,target])=>{
      const rate=chooseRate(pool,floor,bidders,target),p=modeledAdvantage(pool,rate,bidders);
      return '<div class="vcell"><span>'+name+' · '+fmtRate(rate)+'</span>'+
        '<b>'+at(rate)+'</b><div class="lead">모형 추정 '+(p*100).toFixed(1)+'%'+
        (p+0.0001<target?" · 목표 미달":"")+'</div></div>';
    }).join("");
    const grid=competitors.map(n=>{
      const rate=chooseRate(pool,floor,n,0.6),p=modeledAdvantage(pool,rate,n);
      return '<tr'+(n===bidders?' style="background:#eaf6fb;font-weight:800"':'')+'>'+
        '<td style="padding:9px 6px;border-bottom:1px solid #e1e7ed">'+n+'개'+(n===bidders?' · 선택':'')+'</td>'+
        '<td style="padding:9px 6px;border-bottom:1px solid #e1e7ed;text-align:right">'+fmtRate(rate)+'</td>'+
        '<td style="padding:9px 6px;border-bottom:1px solid #e1e7ed;text-align:right;white-space:nowrap">'+at(rate)+'</td>'+
        '<td style="padding:9px 6px;border-bottom:1px solid #e1e7ed;text-align:right">'+(p*100).toFixed(0)+'%</td></tr>';
    }).join("");
    result.innerHTML=header+sampleInfo+
      '<div style="margin:14px 0 7px;font-weight:800">참가업체 '+bidders+'개일 때 · 가격경쟁 3가지</div>'+
      '<div class="viewgrid">'+chosen+'</div>'+
      '<div style="margin:13px 0 7px;font-weight:800">업체 수별 비교 · 모형상 60% 가격우위 수준</div>'+
      '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:390px;font-size:12px">'+
      '<thead><tr><th style="padding:8px 5px;text-align:left;border-bottom:2px solid #c5d6e2">경쟁</th>'+
      '<th style="padding:8px 5px;text-align:right;border-bottom:2px solid #c5d6e2">투찰률</th>'+
      '<th style="padding:8px 5px;text-align:right;border-bottom:2px solid #c5d6e2">금액</th>'+
      '<th style="padding:8px 5px;text-align:right;border-bottom:2px solid #c5d6e2">추정</th></tr></thead><tbody>'+grid+'</tbody></table></div>'+
      '<div class="lead" style="margin-top:12px"><strong>모형 가정:</strong> 역사상 해당 분야 낙찰률·참가업체 수에서 승자 가격분포를 관측하고, 경쟁업체의 투찰이 서로 독립·동일 분포이며 적격업체 중 최저가가 낙찰된다고 가정합니다. 참가업체 1개인 사례는 계산에 전혀 사용하지 않았습니다. 과거 공고의 실제 하한율은 자료에 없어 근접 낙찰률로만 선별합니다.</div>'+
      '<div class="lead" style="margin-top:7px"><strong>중요:</strong> 표시된 %는 가정한 예정가격과 자격 충족을 전제로 한 <strong>가격경쟁 우위 모형 확률</strong>이며, 실제 낙찰확률이 아닙니다. 사정률 변동, 복수예비가격, 적격심사 점수, 낙찰제외 요건, 비용 및 공고별 산식은 별도 검토가 필요합니다. 소수 표본이므로 추정 불확실성이 큽니다.</div>';
  }
  async function loadHistory(){
    try{
      const r=await fetch("./data/awards.json?ts="+Date.now(),{cache:"no-store"});
      if(!r.ok)throw new Error("낙찰정보 HTTP "+r.status);
      const d=await r.json();
      if(d.status!=="ready"||!Array.isArray(d.items))throw new Error("낙찰정보 수집 상태 불완전");
      history=d.items;
      historyUpdatedAt=String(d.updated_at||"");
      historyReady=true;
    }catch(e){console.warn("유사 낙찰정보 일시 불러오기 실패",e)}
  }
  window.BidReview={status,summary,brief,show,calculate};
  loadHistory();
  if(typeof render==="function")render();
})();
