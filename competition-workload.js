/* Local, evidence-backed workload review. Not an eligibility judgment. */
window.CompetitionWorkload=(()=>{
 const key='shark-competition-workload-v1';let records={};try{records=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
 const fingerprint=x=>[x.title,x.source,x.deadline,x.registration_deadline,x.submission_deadline].join('|');
 function get(x){const r=records[x.id];if(!r||r.fingerprint!==fingerprint(x))return {rank:1,label:'준비 부담 미확인'};const low=r.pages<=10&&r.panels<=1&&r.model==='no'&&r.presentation==='no'&&r.visit==='no';return {...r,rank:low?0:2,label:low?'준비 부담 적음 · 직접 확인':'준비 부담 있음 · 직접 확인'};}
 function edit(x){const r=get(x);const select=(id,label)=>'<label>'+label+'<select class="field" id="wl-'+id+'"><option value="">확인 필요</option><option value="no" '+(r[id]==='no'?'selected':'')+'>없음 확인</option><option value="yes" '+(r[id]==='yes'?'selected':'')+'>있음</option></select></label>';
 modal('공모 준비 부담 확인',x.title,'<p>사무소 내부 비교 기준: 설명서 10쪽 이하·패널 1매 이하, 모형·발표·필수 현장설명 없음. 도면 난도·작업시간·참가자격을 보장하는 평가는 아닙니다. 최신 지침서와 질의답변을 확인해 입력하세요.</p><p>이 브라우저에만 저장됩니다. 미확인 항목은 낮은 부담으로 분류하지 않습니다.</p><div class="form-grid"><label>설명서 총 쪽수 (없음 확인 시 0)<input id="wl-pages" class="field" type="number" min="0" value="'+(r.pages??'')+'"></label><label>설계 패널 매수 (없음 확인 시 0)<input id="wl-panels" class="field" type="number" min="0" value="'+(r.panels??'')+'"></label>'+select('model','실물·디지털 모형 제출')+select('presentation','발표·면접')+select('visit','필수 현장설명')+'</div><label>확인 근거 · 지침서 쪽수·확인일<textarea class="field" id="wl-proof" rows="3"></textarea></label><div class="actions"><button class="btn" id="wl-clear">기록 초기화</button><button class="btn primary" id="wl-save">확인 후 저장</button></div>');
 document.querySelector('#wl-proof').value=r.proof||'';
 document.querySelector('#wl-clear').onclick=()=>{delete records[x.id];localStorage.setItem(key,JSON.stringify(records));close();render()};
 document.querySelector('#wl-save').onclick=()=>{const v=id=>document.querySelector('#wl-'+id).value;const pages=v('pages'),panels=v('panels');if(pages===''||panels===''||![pages,panels].every(n=>Number.isInteger(Number(n))&&Number(n)>=0)||!v('model')||!v('presentation')||!v('visit')||v('proof').trim().length<10){alert('모든 항목과 확인 근거(10자 이상)를 입력하세요.');return}records[x.id]={pages:Number(pages),panels:Number(panels),model:v('model'),presentation:v('presentation'),visit:v('visit'),proof:v('proof').trim(),fingerprint:fingerprint(x),verified_at:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(records));close();render()};
 }
 return {get,edit};
})();
