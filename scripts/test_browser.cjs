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
    console.log("Browser regression passed:",{feedItems:feed.items.length,visibleCandidates:visible.length,renderedCards:cards,desktopErrors:errors.length,mobileErrors:mobileErrors.length});
  }finally {
    if(browser)await browser.close();
    server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
