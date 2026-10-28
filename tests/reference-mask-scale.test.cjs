'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const load = () => require('../inference/skin-reference/mask-scale.cjs').scaleSuppliedReferenceMask;
// 12个全新Fraction oracle供给，独立RN64/RN32；不读取旧原版缓存或执行旧候选。
const goldens = [{"name":"unary-column","width":1,"height":5,"stride":4,"sourcePhotoWH":[1920,1080],"sourceHex":"1d466f98c1","destinationWH":[2,9],"scale":1.875,"expectedHex":"1d1d29293f3f55556b6b81819696adadc1c1","expectedSHA256":"ef8e4a665df6d12b0b50b1133fff2b2a940fae7ddd1ebe2526fa8fbea483f5e4","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":14},{"name":"half-right-tail","width":7,"height":4,"stride":10,"sourcePhotoWH":[512,300],"sourceHex":"1d66aff8418a0046a0fa54ae08016fda45b01b86f19814900c880480","destinationWH":[4,2],"scale":0.5,"expectedHex":"5abd60007d644bb8","expectedSHA256":"b1f756ceb5a59d807bf7f746f2eec02209e05c9f2335845c65be9886f0111853","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":0},{"name":"half-bottom-tail","width":4,"height":7,"stride":7,"sourcePhotoWH":[300,512],"sourceHex":"1d66aff846a0fa546fda45b09814900cc14edb68ea8826c400017120","destinationWH":[2,4],"scale":0.5,"expectedHex":"5abd7d64a08b0048","expectedSHA256":"9b0802640f68ccb3d27786f1806658fceca62b6fbb9e1e0fc1c8987ec39bcdc8","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":0},{"name":"half-corner","width":3,"height":3,"stride":6,"sourcePhotoWH":[512,100],"sourceHex":"1d66af46a0fa6fda45","destinationWH":[2,2],"scale":0.5,"expectedHex":"5ad4a445","expectedSHA256":"2b11dc42fe81ea6a30170a7428548eb3d07f583a39d090dc1a91de502d646ff4","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":0},{"name":"general-down","width":5,"height":5,"stride":8,"sourcePhotoWH":[800,600],"sourceHex":"1d66aff84146a0fa54ae6fda45b01b9814900c88c14edb68f5","destinationWH":[4,4],"scale":0.78125,"expectedHex":"2d8ed55365b48a7083614f66b08889f0","expectedSHA256":"3a8a2e60be11f030d58b5810c519606028deb800dcc5704a88d8176c6d616553","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":15},{"name":"original-scale","width":7,"height":9,"stride":10,"sourcePhotoWH":[1400,1000],"sourceHex":"1d66aff8418ad346a0fa54ae08626fda45b01b86f19814900c880480c14edb68f5820fea8826c462009e13c27120cf7e2d3cfcbc7c3cfcbc653607d8a97a4b","destinationWH":[10,12],"scale":1.3671875,"expectedHex":"1d487eb3e9985389bed33567a4d8a58c703d788f538cb7ba82786a32769171a9a24f9361397dccea8f5e537b3f515c207597ad645eb05681a2484545cb8977aa89a9b3624033e9af6832a2914b03709c508a955b51819a5b514d2592c48e586d98b6826d439cc49a906c75e2b9a861523722a9b699866255","expectedSHA256":"36e7597631ba01f2d280d1183e77c6f26949b8f353a8064d8de43038bb21204c","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":115},{"name":"sum2047","width":2,"height":2,"stride":5,"sourcePhotoWH":[10295,2],"sourceHex":"00004900","destinationWH":[20,20],"scale":10.0537109375,"expectedHex":"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003030303030303030202020101010000000000000b0b0b0b0b0a09080706050403020100000000001212121212110f0e0c0a080605030100000000001919191919181613100e0b09060401000000000020202020201f1c1815120f0c0805020000000000282828282826221e1a16120e0a060200000000002f2f2f2f2f2d28231f1a15110c070300000000003636363636342e29231e19130e090300000000003e3e3e3e3e3b352e28221c16100a0400000000004545454545423b342d261f18120b0400000000004949494949453e373028211a130b0400000000004949494949463e373028211a130b0400000000004949494949453e373029211a130b0400000000004949494949453e373028211a130b0400000000004949494949463e373028211a130b040000000000","expectedSHA256":"c251aafafc8cb7592fe417fb3a62319a49ecea48a432b6a77700178494edfe90","wrongNormalizedPairDifferentBytes":2,"wrongRoundedDimensionInverseDifferentBytes":54},{"name":"sum2049","width":2,"height":2,"stride":5,"sourcePhotoWH":[20185,2],"sourceHex":"00007f1d","destinationWH":[39,39],"scale":19.7119140625,"expectedHex":"0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000404040404040404040404040404030303030303020202020202010101010101010101010101010b0b0b0b0b0b0b0b0b0b0a0a0a09090808070707060605050504040303020202020202020202021111111111111111111111100f0f0e0d0d0c0b0b0a090908070706050504040404040404040404181818181818181818181716151413121110100f0e0d0c0b0a09080706050505050505050505051e1e1e1e1e1e1e1e1e1e1d1c1b1a19171615141311100f0e0d0c0a090807070707070707070707242424242424242424242322211f1e1c1b19181715141211100e0d0b0a080808080808080808082b2b2b2b2b2b2b2b2b2b2a2826252321201e1c1b1917161412110f0d0c0a0a0a0a0a0a0a0a0a0a31313131313131313131302e2c2a28262423211f1d1b19171513110f0d0b0b0b0b0b0b0b0b0b0b38383838383838383838363432302e2b29272523201e1c1a181613110f0d0d0d0d0d0d0d0d0d0d3e3e3e3e3e3e3e3e3e3e3d3a383533302e2c292724221f1d1b181613110e0e0e0e0e0e0e0e0e0e4545454545454545454543403d3b383533302d2b282523201d1b181513101010101010101010104b4b4b4b4b4b4b4b4b4b494643403d3a3835322f2c292623201d1a171411111111111111111111515151515151515151514f4c4946433f3c393633302c292623201c1916131313131313131313135858585858585858585856524f4b4845413e3a3733302c2926221f1b18141414141414141414145e5e5e5e5e5e5e5e5e5e5c5855514d4946423e3b3733302c2825211d191616161616161616161665656565656565656565625e5a56524f4b47433f3b37332f2b27231f1b171717171717171717176b6b6b6b6b6b6b6b6b6b6964605c58544f4b47433f3a36322e2a25211d19181818181818181818727272727272727272726f6a66615d5954504b47423e3935312c28231f1a1a1a1a1a1a1a1a1a1a7878787878787878787875706c67625e59544f4b46413d38332f2a25201c1b1b1b1b1b1b1b1b1b7f7f7f7f7f7f7f7f7f7f7b76716c68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d7f7f7f7f7f7f7f7f7f7f7c77726d68635e59544f4a45403b36312c27221d1d1d1d1d1d1d1d1d1d","expectedSHA256":"b3a63a37bbc05944a2aaf7dfc67fec1f683e150c538147e84e1fc6f8a11acd73","wrongNormalizedPairDifferentBytes":1,"wrongRoundedDimensionInverseDifferentBytes":586},{"name":"unary-pixel","width":1,"height":1,"stride":4,"sourcePhotoWH":[2048,2],"sourceHex":"1d","destinationWH":[2,2],"scale":2.0,"expectedHex":"1d1d1d1d","expectedSHA256":"ef46daaadb109c0b6983c0208db641275e4914a4354d0a2c1a588ac79c045a5b","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":0},{"name":"one-axis-same","width":2,"height":3,"stride":5,"sourcePhotoWH":[800,2],"sourceHex":"1d6646a06fda","destinationWH":[2,2],"scale":0.78125,"expectedHex":"2d6e65b8","expectedSHA256":"1ae63721c0e4001e05d339ae9bae90ecacb52fba9445a5a3c8d5e197df937411","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":3},{"name":"destination-one-row","width":3,"height":2,"stride":6,"sourcePhotoWH":[600,2],"sourceHex":"1d66af46a0fa","destinationWH":[2,1],"scale":0.5859375,"expectedHex":"47c9","expectedSHA256":"ce80913d4b6c4766ebe9f5897f35df680b3a300a0af292174da391223e2ea182","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":2},{"name":"rounded-copy","width":2,"height":2,"stride":5,"sourcePhotoWH":[800,2],"sourceHex":"1d497fff","destinationWH":[2,2],"scale":0.78125,"expectedHex":"1d497fff","expectedSHA256":"587a7f32150300f099892c762668d82689b82699e0291a4afb5dc21f367e184f","wrongNormalizedPairDifferentBytes":0,"wrongRoundedDimensionInverseDifferentBytes":0}];
const options = { rounding: 'nearest-even', math: 'native-code1-scalar' };
const request = (data, width, height, sourcePhotoWH, stride = width) => ({ data, width, height, stride, sourcePhotoWH, ...options });

test('12 independent Fraction fixtures: strided active rows, original scale, full BYTE output', () => {
  const scale = load();
  for (const g of goldens) {
    const logical = Buffer.from(g.sourceHex, 'hex');
    const span = (g.height - 1) * g.stride + g.width;
    const backing = new Uint8Array(span + 11).fill(213), data = backing.subarray(4, 4 + span);
    for (let y = 0; y < g.height; y++) data.set(logical.subarray(y * g.width, (y + 1) * g.width), y * g.stride);
    const before = backing.slice(), photo = Object.freeze([...g.sourcePhotoWH]);
    const out = scale(request(data, g.width, g.height, photo, g.stride));
    assert.deepEqual([out.width, out.height], g.destinationWH, g.name);
    assert.equal(out.stride, out.width); assert.equal(out.scale, g.scale);
    assert.equal(Buffer.from(out.data).toString('hex'), g.expectedHex, g.name);
    assert.equal(createHash('sha256').update(out.data).digest('hex'), g.expectedSHA256, g.name);
    assert.deepEqual(backing, before); assert.notEqual(out.data.buffer, data.buffer);
  }
});

test('independent coefficients with sum2047 and sum2049 must retain both rounded values', () => {
  const scale = load();
  const a = scale(request(Uint8Array.of(0, 0, 73, 0), 2, 2, [10295, 2]));
  const b = scale(request(Uint8Array.of(0, 0, 127, 29), 2, 2, [20185, 2]));
  assert.equal(a.data[8 * 20 + 8], 16); // 原1340/707；强制sum2048得到17。
  assert.equal(b.data[14 * 39 + 14], 25); // 原1566/483；强制sum2048得到24。
});

test('both rounded dimensions equal source: logical row copy with independent outputs', () => {
  const scale = load(), backing = Uint8Array.of(99, 29, 73, 211, 212, 127, 255, 88);
  const data = backing.subarray(1, 7), before = backing.slice();
  const r = request(data, 2, 2, [800, 600], 4), a = scale(r), b = scale(r);
  assert.equal(a.scale, .78125); assert.deepEqual([...a.data], [29, 73, 127, 255]);
  assert.deepEqual(a, b); a.data[0] = 0;
  assert.equal(b.data[0], 29); assert.deepEqual(backing, before);
});

test('halfscale complete boxes half-up; odd right/bottom partial boxes nearest-even', () => {
  const out = load()(request(Uint8Array.of(1, 1, 0, 0, 0, 1, 0, 1, 9), 3, 3, [512, 100]));
  assert.deepEqual([out.width, out.height, out.scale], [2, 2, .5]);
  assert.deepEqual([...out.data], [1, 0, 0, 9]);
  // 5*.5=2.5→2，3*.5=1.5→2；不能统一ceil/floor尺寸。
  const downTie = load()(request(new Uint8Array(25).fill(177), 5, 5, [512, 2]));
  assert.deepEqual([downTie.width, downTie.height], [2, 2]); assert.ok(downTie.data.every(v => v === 177));
});

test('unary sources, independent maxPhoto axis, neutral INT32 pair and upper source boundary', () => {
  const scale = load();
  const one = scale(request(Uint8Array.of(29), 1, 1, new Int32Array([2, 2048])));
  assert.deepEqual([one.width, one.height, one.scale], [2, 2, 2]); assert.deepEqual([...one.data], [29, 29, 29, 29]);
  const wide = scale(request(new Uint8Array(32766).fill(91), 32766, 1, [1024, 2]));
  assert.deepEqual([wide.width, wide.height, wide.stride, wide.scale], [32766, 1, 32766, 1]);
  assert.ok(wide.data.every(v => v === 91));
  const maximalPhoto = scale(request(Uint8Array.of(198), 1, 1, [32766, 2]));
  assert.equal(maximalPhoto.scale, 32766 / 1024); assert.deepEqual([maximalPhoto.width, maximalPhoto.height], [32, 32]);
  assert.ok(maximalPhoto.data.every(v => v === 198));
});

test('reject unsupported math, photo/source/destination domains before output allocation', () => {
  const scale = load(), base = request(Uint8Array.of(1, 2, 3, 4), 2, 2, [1024, 2]);
  const bad = [null, {}, { ...base, data: new Float32Array(4) }, { ...base, width: 0 }, { ...base, height: 1.5 },
    { ...base, width: 32767 }, { ...base, width: 10000, height: 10000 }, { ...base, sourcePhotoWH: [1, 1024] },
    { ...base, sourcePhotoWH: [1024, 2, 3] }, { ...base, sourcePhotoWH: [NaN, 2] }, { ...base, sourcePhotoWH: [32767, 2] },
    { ...base, sourcePhotoWH: [10000, 10000] }, { ...base, math: undefined }, { ...base, rounding: 'nearest' },
    { ...base, width: 1, height: 1, sourcePhotoWH: [512, 2] }, { ...base, width: 32766, height: 1, sourcePhotoWH: [2048, 2] },
    { ...base, width: 5000, height: 5000, sourcePhotoWH: [2048, 2] }];
  for (const r of bad) assert.throws(() => scale(r), { name: /^(TypeError|RangeError)$/ });
  assert.deepEqual([...base.data], [1, 2, 3, 4]);
});

test('last active row span only: reject missing active BYTE, unsafe or short stride', () => {
  const scale = load(), base = request(Uint8Array.of(1, 2, 99, 99, 3, 4), 2, 2, [1024, 2], 4);
  assert.deepEqual([...scale(base).data], [1, 2, 3, 4]); // 无末行尾padding仍合法。
  for (const r of [{ ...base, data: base.data.subarray(0, 5) }, { ...base, stride: 1 }, { ...base, stride: 2.5 },
    { ...base, stride: Number.MAX_SAFE_INTEGER }, { ...base, stride: Infinity }]) assert.throws(() => scale(r), RangeError);
});
