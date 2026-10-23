
"use strict";
const FEED="./data/bids.json";
const STORE="arch-bid-0513-v1";
const fmt=new Intl.NumberFormat("ko-KR");
const getState=()=>{try{return JSON.parse(localStorage.getItem(STORE)||"{}")}catch{return {}}};
const persisted=getState();
let notices=[],feed=null,tab="all",query="",sort="priority",saved=new Set(persisted.saved||[]),alerts=!!persisted.alerts,known=new Set(persisted.known||[]),firstLoad=true;
const $=s=>document.querySelector(s);
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
const writeState=()=>localStorage.setItem(STORE,JSON.stringify({saved:[...saved],alerts,known:[...known].slice(-500)}));
const toast=(message)=>{const t=$("#toast");t.textContent=message;t.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("visible"),3200)};
function dateVal(s){if(!s)return null;let x=s.trim().replace(" ","T");if(!/[Zz]|[+-]\d\d:\d\d$/.test(x))x+="+09:00";const d=new Date(x);return Number.isNaN(d.getTime())?null:d}
function shortDate(s){let d=dateVal(s);return d?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d):"미확인"}
function price(n){const v=Number(String(n||"").replace(/[^\d.]/g,""));if(!v)return "금액 미공개";if(v>=1e8)return (v/1e8).toLocaleString("ko-KR",{maximumFractionDigits:2})+"억원";if(v>=1e4)return Math.round(v/1e4).toLocaleString("ko-KR")+"만원";return fmt.format(v)+"원"}
function remaining(s){const d=dateVal(s);if(!d)return {label:"마감 미확인",days:999,closed:false};const ms=d-new Date();if(ms<=0)return {label:"마감",days:-1,closed:true};const days=Math.ceil(ms/86400000);return {label:days<=1?"24시간 이내":("D-"+days),days,closed:false}}
function safeUrl(input){try{const u=new URL(input);return u.protocol==="https:"?u.href:null}catch{return null}}
function statusMark(value){const badge=$("#feedStatus");badge.classList.toggle("live",value==="ready");badge.classList.toggle("fail",value==="error");$("#feedStatusText").textContent=value==="ready"?"자동수집 연결됨":value==="not_configured"?"API 연결 대기":"연결 확인 필요"}
function renderStats(){
  const active=notices.filter(n=>!remaining(n.deadline).closed);
  $("#countAll").textContent=fmt.format(active.length);
  $("#countPriority").textContent=fmt.format(active.filter(n=>n.priority==="우선 검토").length);
  $("#countSoon").textContent=fmt.format(active.filter(n=>remaining(n.deadline).days<=3).length);
  $("#countSaved").textContent=fmt.format(active.filter(n=>saved.has(n.id)).length);
  $("#lastSync").textContent=feed?.updated_at?"최종 수집 "+shortDate(feed.updated_at):"연결 전 · 수집 내역 없음";
  const status=feed?.status||"not_configured";
  statusMark(status);
  const warning=$("#connectionNotice"),hint=$("#connectionHint");
  if(status==="ready"){warning.classList.remove("hidden");hint.textContent="공고를 자동 수집 중입니다. '우선 검토'는 소액수의 등 공고명 기준의 추천이며 참가·낙찰 가능 확정이 아닙니다."}
  else {warning.classList.remove("hidden");hint.textContent="실시간 데이터 연결 전입니다. 아래의 공식 API 연결 절차가 완료되면 공고가 자동으로 표시됩니다."}
}
function filtered(){
  let xs=notices.filter(n=>!remaining(n.deadline).closed);
  if(tab==="priority")xs=xs.filter(n=>n.priority==="우선 검토");
  if(tab==="review")xs=xs.filter(n=>n.priority!=="우선 검토");
  if(tab==="saved")xs=xs.filter(n=>saved.has(n.id));
  if(query.trim()){const q=query.trim().toLocaleLowerCase();xs=xs.filter(n=>[n.title,n.agency,n.number,n.region].some(v=>String(v||"").toLocaleLowerCase().includes(q)))}
  if(sort==="deadline")xs.sort((a,b)=>(dateVal(a.deadline)||0)-(dateVal(b.deadline)||0));
  else if(sort==="recent")xs.sort((a,b)=>(dateVal(b.notice_at)||0)-(dateVal(a.notice_at)||0));
  else if(sort==="amount")xs.sort((a,b)=>Number(b.budget||0)-Number(a.budget||0));
  else xs.sort((a,b)=>(a.priority==="우선 검토"?0:1)-(b.priority==="우선 검토"?0:1)||(dateVal(a.deadline)||0)-(dateVal(b.deadline)||0));
  return xs;
}
function renderBids(){
  const list=$("#bidList");list.replaceChildren();
  const all=filtered();
  $("#listCount").textContent=all.length+"건";
  if(!all.length){
    const empty=el("div","empty");
    empty.append(el("div","empty-art","⌕"));
    const h=el("h3","",!feed||feed.status!=="ready"?"입찰 데이터 연결을 기다리고 있습니다":tab==="saved"?"저장한 공고가 없습니다":"현재 조건과 일치하는 공고가 없습니다");
    empty.append(h,el("p","",!feed||feed.status!=="ready"?"나라장터 공식 API를 연결하면 서울 건축사사무소가 검토할 만한 감리용역을 정기적으로 수집합니다.":tab==="saved"?"관심 있는 공고의 저장 버튼을 누르면 여기에 모입니다.":"새 공고가 등록되면 자동수집 일정에 맞춰 업데이트됩니다. 다른 분류나 검색어도 확인해 보세요."));
    if(!feed||feed.status!=="ready"){const button=el("button","cta","연결 방법 확인 ↓");button.onclick=()=>$("#howto").scrollIntoView({behavior:"smooth"});empty.append(button)}
    list.append(empty);return;
  }
  for(const n of all){
    const r=remaining(n.deadline),card=el("article","bid"),main=el("div","");
    const head=el("div","bid-head");
    const tier=el("span","pill "+(n.priority==="우선 검토"?"good":"review"),n.priority==="우선 검토"?"● 우선 검토":"● 조건 확인");
    head.append(tier,el("span","pill gray","자격 미확정"));
    if(r.days<=3)head.append(el("span","pill review","마감 임박"));
    main.append(head,el("h3","",n.title||"제목 없음"));
    const meta=el("div","meta");
    [n.agency||"발주기관 미확인","공고 "+(n.number||"미확인"),"지역 "+(n.region||"확인 필요"),"게시 "+shortDate(n.notice_at)].forEach(s=>meta.append(el("span","",s)));
    main.append(meta);
    const reasons=el("div","reasons");
    for(const text of (n.reasons||[]).slice(0,3))reasons.append(el("span","reason",text));
    main.append(reasons);
    const side=el("div","actions"),amount=el("div","price",price(n.budget));
    amount.append(el("small","",n.budget_type||"기초금액 여부 확인"));
    side.append(amount,el("div","clock",r.label+" · "+shortDate(n.deadline)));
    const link=el("a","actionlink","원문 공고 확인 ↗");link.href=safeUrl(n.url)||"https://www.g2b.go.kr/";link.target="_blank";link.rel="noopener noreferrer";
    side.append(link);
    const isSaved=saved.has(n.id),star=el("button","save"+(isSaved?" saved":""),isSaved?"★ 저장됨":"☆ 관심 저장");
    star.setAttribute("aria-label",(isSaved?"관심 해제: ":"관심 저장: ")+n.title);
    star.onclick=()=>{isSaved?saved.delete(n.id):saved.add(n.id);writeState();renderStats();renderBids()};
    side.append(star);
    card.append(main,side);list.append(card);
  }
}
async function fetchBids(){
  const refresh=$("#refresh");refresh.disabled=true;
  try{
    const res=await fetch(FEED+"?v="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw Error("HTTP "+res.status);
    const obj=await res.json();
    if(!Array.isArray(obj.items))throw Error("Invalid data");
    feed=obj;notices=obj.items;
    const latest=notices.filter(n=>!known.has(n.id)&&n.priority==="우선 검토"&&!remaining(n.deadline).closed);
    if(alerts&&known.size&&latest.length&&"Notification" in window&&Notification.permission==="granted"){
      try{new Notification("새 건축감리 입찰 후보 "+latest.length+"건",{body:latest[0].title+"\n※ 참가자격·실적 원문 확인 필요",tag:"architect-bid-radar"})}catch{}
    }
    for(const n of notices)known.add(n.id);
    writeState();
  }catch(err){
    if(!feed)feed={status:"error",items:[],updated_at:null};
    console.warn("Data request failed:",err);
    if(!firstLoad)toast("데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
  }finally{firstLoad=false;refresh.disabled=false;renderStats();renderBids()}
}
function bind(){
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
    tab=b.dataset.tab;
    document.querySelectorAll(".tab").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-selected",String(x===b))});
    renderBids()
  });
  $("#search").addEventListener("input",e=>{query=e.target.value;renderBids()});
  $("#sort").addEventListener("change",e=>{sort=e.target.value;renderBids()});
  $("#refresh").onclick=()=>fetchBids();
  $("#notify").onclick=async()=>{
    if(!("Notification" in window)){toast("이 브라우저에서는 알림을 지원하지 않습니다.");return}
    if(!alerts){
      let result=Notification.permission;
      if(result==="default")result=await Notification.requestPermission();
      if(result!=="granted"){toast("브라우저 알림 권한이 필요합니다.");return}
      alerts=true;for(const n of notices)known.add(n.id);toast("사이트가 열려 있는 동안 신규 공고 알림을 표시합니다.");
    }else{alerts=false;toast("브라우저 알림을 껐습니다.")}
    writeState();updateNotify();
  };
  $("#goSetup").onclick=()=>$("#howto").scrollIntoView({behavior:"smooth"});
  updateNotify();
}
function updateNotify(){$("#notify").textContent=alerts?"알림 켜짐 ✓":"브라우저 알림 켜기"}
window.addEventListener("DOMContentLoaded",()=>{bind();fetchBids();setInterval(fetchBids,180000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)fetchBids()})});
