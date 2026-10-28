'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const modulePath='../inference/skin-reference/picker-cap.cjs';

// 对应 LIVE 140a1f750 的真实语义：按顺序取第一个 >0 的候选，
// 再做 cmp 0x801 / mov 0x7d0 / cmovge 的下限规则。所有候选必须由调用方显式供应。

test('picker cap takes the first positive candidate in native precedence order',()=>{
 const {resolveSuppliedPickerCap:run}=require(modulePath);
 // 首候选 >0 即胜出，即使后续候选更大（原版不比较大小，只取首个正值）。
 assert.deepEqual(run({primary:'3000',secondary:5000,tertiary:9999}),{cap:3000,source:'primary'});
 assert.deepEqual(run({primary:120,secondary:5000}),{cap:2000,source:'primary'});
 // 首候选非正/空/不可用才落到次候选。
 assert.deepEqual(run({primary:'0',secondary:'4096'}),{cap:4096,source:'secondary'});
 assert.deepEqual(run({primary:'-5',secondary:'2049'}),{cap:2049,source:'secondary'});
 assert.deepEqual(run({primary:'',secondary:'3000'}),{cap:3000,source:'secondary'});
 assert.deepEqual(run({primary:null,secondary:2500}),{cap:2500,source:'secondary'});
 // 前两者都不可用才用第三候选（原版读全局+0x50，产品侧由调用方显式供应）。
 assert.deepEqual(run({primary:0,secondary:0,tertiary:'5000'}),{cap:5000,source:'tertiary'});
});

test('picker cap applies the native 2049 floor and reports it as a floor result',()=>{
 const {resolveSuppliedPickerCap:run}=require(modulePath);
 // 恰好 2049 保留原值；2001..2048 与 1..2000 一样返回 2000，不能写 max(2000,v)。
 assert.equal(run({primary:'2049'}).cap,2049);
 assert.equal(run({primary:'2048'}).cap,2000);
 assert.equal(run({primary:'2001'}).cap,2000);
 assert.equal(run({primary:'2000'}).cap,2000);
 assert.equal(run({primary:'1'}).cap,2000);
 assert.equal(run({primary:'2049'}).source,'primary');
 // 全部候选不可用时原版返回 2000；明确标为 floor，不伪装成某个候选。
 assert.deepEqual(run({primary:0,secondary:0,tertiary:0}),{cap:2000,source:'floor'});
 assert.deepEqual(run({primary:'',secondary:null,tertiary:0}),{cap:2000,source:'floor'});
});

test('picker cap does not invent a cap when no candidate slot is supplied at all',()=>{
 const {resolveSuppliedPickerCap:run}=require(modulePath);
 // 原版第三候选来自运行时全局；产品侧缺供应必须报错，不能凭空给 2000 或 3000。
 assert.throws(()=>run(),TypeError);
 assert.throws(()=>run({}),TypeError);
 assert.throws(()=>run({primary:undefined,secondary:undefined,tertiary:undefined}),TypeError);
 assert.throws(()=>run({unrelated:1}),TypeError);
 // 给出槽位即按原版规则解析。
 assert.equal(run({primary:null}).cap,2000);
 assert.equal(run({tertiary:0}).source,'floor');
});

test('picker cap rejects out-of-range or malformed candidates instead of clamping silently',()=>{
 const {resolveSuppliedPickerCap:run}=require(modulePath);
 assert.throws(()=>run({primary:32767}),RangeError);
 assert.throws(()=>run({primary:100000}),RangeError);
 assert.throws(()=>run({primary:-1.5}),TypeError);
 assert.throws(()=>run({primary:2000.5}),TypeError);
 assert.throws(()=>run({primary:true}),TypeError);
 assert.throws(()=>run({primary:'3000x'}),TypeError);
 assert.throws(()=>run({primary:'abc'}),TypeError);
 assert.throws(()=>run({primary:{}}),TypeError);
 // 观测到的本机配置值 3000 必须能通过并保留，不能被当作默认值硬编码。
 assert.deepEqual(run({primary:'3000'}),{cap:3000,source:'primary'});
 assert.deepEqual(run({primary:3000}),{cap:3000,source:'primary'});
});
