/* 실제 Chromium에서 공고가 표시되는지와 주요 클릭 흐름을 확인한다. */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const assert = require("node:assert/strict");

(async () => {
  const server = spawn("python", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], {stdio:"ignore"});
  let browser;
  try {
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:1280,height:800},timezoneId:"Asia/Seoul"});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => {if(msg.type()==="error")errors.push(msg.text())});
    let loaded = false;
    for(let attempt=0;attempt<30;attempt++){
      try{const res=await page.goto("http://127.0.0.1:8765/index.html", {waitUntil:"domcontentloaded"});if(res && res.ok()){loaded=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert(loaded,"local static test server must start");
    await page.waitForFunction(() => document.querySelector("#sourceNotice")?.textContent.includes("수집 연결됨"),{timeout:15000});
    const feed=JSON.parse(fs.readFileSync("data/bids.json","utf8"));
    assert.equal(feed.status,"ready","fixture collection must be ready");
    const now=Date.now();
    const visible=feed.items.filter(x=>{
      if(x.eligibility_status==="참가 불가")return false;
      if(!x.deadline)return true;
      return new Date(String(x.deadline).replace(" ","T")+"+09:00").getTime()>now;
    });
    const cards=await page.locator("#cards article.bid").count();
    if(visible.length>0)assert(cards>0,"nonempty eligible-to-review feed must render nonempty cards");
    assert.match(await page.locator("#count").innerText(),/건 표시/);
    assert.equal(errors.length,0,"initial render errors: "+errors.join(" | "));

    await page.locator('[data-quick="priority"]').click();
    await page.locator('[data-quick="all"]').click();
    await page.locator("#regionFilter").selectOption("unknown");
    await page.locator("#regionFilter").selectOption("all");
    await page.locator("#sort").selectOption("deadline");
    await page.locator("#resetFilters").click();
    await page.locator("#refreshDataBtn").click();
    await page.waitForFunction(()=>!document.querySelector("#refreshDataBtn").disabled);
    if(await page.locator("#cards article.bid").count()){
      await page.locator('[data-view]').first().click();
      assert(await page.locator("#modalBg").evaluate(node=>node.classList.contains("show")),"detail modal should open");
      await page.locator("#closeModal").click();
    }
    assert.equal(errors.length,0,"interaction errors: "+errors.join(" | "));

    const mobile=await browser.newPage({viewport:{width:390,height:844},timezoneId:"Asia/Seoul",isMobile:true,hasTouch:true});
    const mobileErrors=[];
    mobile.on("pageerror",e=>mobileErrors.push(e.message));
    await mobile.goto("http://127.0.0.1:8765/index.html",{waitUntil:"domcontentloaded"});
    await mobile.waitForFunction(()=>document.querySelector("#sourceNotice")?.textContent.includes("수집 연결됨"));
    await mobile.locator("#mobileFiltersToggle").click();
    assert.equal(await mobile.locator("#mobileFiltersToggle").getAttribute("aria-expanded"),"true");
    assert.equal(mobileErrors.length,0,"mobile runtime errors: "+mobileErrors.join(" | "));
    // Synthetic fixtures exercise new categories even before the first expanded API run.
    const scopePage=await browser.newPage({timezoneId:"Asia/Seoul"});
    const scopeErrors=[];scopePage.on("pageerror",e=>scopeErrors.push(e.message));
    const fixtures=[
      {id:"SCOPE-D",number:"SCOPE-D",title:"학교 화장실 개선 설계용역",category:"설계용역",deadline:"2099-12-01 10:00",budget:20000000},
      {id:"SCOPE-C",number:"SCOPE-C",title:"도서관 간이 설계공모",category:"설계공모",deadline:"2099-12-02 10:00",budget:30000000}
    ];
    await scopePage.route("**/data/bids.json?*",route=>route.fulfill({json:{status:"ready",scope_version:2,items:fixtures}}));
    await scopePage.goto("http://127.0.0.1:8765/index.html");
    await scopePage.locator('[data-work="design"]').click();
    assert.equal(await scopePage.locator("#cards article").count(),1);
    await scopePage.locator('[data-view]').click();
    assert(!(await scopePage.locator("#modalBody").innerText()).includes("실적 0원 기준 이론적"));
    await scopePage.locator("#closeModal").click();
    await scopePage.locator('[data-work="competition"]').click();
    assert.equal(await scopePage.locator("#cards article").count(),1);
    assert((await scopePage.locator("#cards").innerText()).includes("작품제출: 원문 확인 필요"));
    await scopePage.locator('[data-view]').click();
    assert.equal(await scopePage.locator("#scenarioCalc").count(),0);
    assert.equal(scopeErrors.length,0,scopeErrors.join(" | "));

    console.log("Browser regression passed:",{feedItems:feed.items.length,visibleCandidates:visible.length,renderedCards:cards,desktopErrors:errors.length,mobileErrors:mobileErrors.length});
  }finally {
    if(browser)await browser.close();
    server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
