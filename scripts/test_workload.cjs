const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const x={id:'test',title:'공모',source:'https://example.org',deadline:''};
const fp=[x.title,x.source,x.deadline,x.registration_deadline,x.submission_deadline].join('|');
function load(r){const ctx={window:{},localStorage:{getItem:()=>JSON.stringify(r)}};vm.runInNewContext(fs.readFileSync('competition-workload.js','utf8'),ctx);return ctx.window.CompetitionWorkload.get(x)}
assert.equal(load({}).rank,1);
const low={fingerprint:fp,pages:5,panels:1,model:'no',presentation:'no',visit:'no'};
assert.equal(load({test:low}).rank,0);
assert.equal(load({test:{...low,model:'yes'}}).rank,2);
assert.equal(load({test:{...low,fingerprint:'outdated'}}).rank,1);
assert.notEqual(load({test:{...low,model:undefined}}).rank,0);
console.log('Workload ranking checks passed');
