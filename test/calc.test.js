// node test/calc.test.js で実行。期待値は国税庁「令和8年分 年末調整のしかた」の表と境目の金額。
const assert = require('assert');
const Y = require('../data/r8.js');
const C = require('../js/calc.js');

const cases = [];
function test(name, fn) { cases.push([name, fn]); }

test('給与所得：改正後の境目（収入が給与だけの場合の目安）', () => {
  const k = (r) => C.kyuyoShotoku(r, Y);
  assert.strictEqual(k(740999), 0);
  assert.strictEqual(k(741000), 1000);
  assert.strictEqual(k(1360000), 620000);   // 扶養親族 62万円
  assert.strictEqual(k(1630000), 890000);   // 勤労学生 89万円
  assert.strictEqual(k(1970000), 1230000);  // 特定親族 123万円
  assert.strictEqual(k(2060000), 1320000);  // 基礎控除 132万円
  assert.strictEqual(k(2070000), 1330000);  // 配偶者特別控除 133万円
  assert.strictEqual(k(2192000), 1451000);
  assert.strictEqual(k(2194000), 1453000);
  assert.strictEqual(k(2199999), 1456000);
  assert.strictEqual(k(2200000), 1460000);
  assert.ok(k(4751999) <= 3360000);         // 336万円以下
  assert.ok(k(4752000) > 3360000);
  assert.strictEqual(k(6655556), 4890000);  // 489万円
  assert.strictEqual(k(8500000), 6550000);  // 655万円
  assert.strictEqual(k(11950000), 10000000);
});

test('基礎控除', () => {
  const kiso = (t) => C.lookup(Y.kiso, t);
  assert.strictEqual(kiso(1320000), 1040000);
  assert.strictEqual(kiso(4890000), 1040000);
  assert.strictEqual(kiso(4890001), 670000);
  assert.strictEqual(kiso(6550001), 620000);
  assert.strictEqual(kiso(23500001), 480000);
  assert.strictEqual(kiso(25000001), null);
});

test('配偶者控除・配偶者特別控除', () => {
  const sp = (salary, birth, selfTotal) =>
    C.classifySpouse({ salary, birth }, selfTotal, C.lookup(Y.kubun1, selfTotal), Y);
  let r = sp(1360000, '1980-01-01', 5000000);
  assert.deepStrictEqual([r.kubun2, r.kind, r.amount], ['②', 'haigu', 380000]);
  r = sp(1360000, '1957-01-01', 5000000);
  assert.deepStrictEqual([r.kubun2, r.amount], ['①', 480000]);
  r = sp(1360001, '1980-01-01', 5000000);
  assert.deepStrictEqual([r.kubun2, r.kind, r.amount], ['③', 'tokubetsu', 380000]);
  r = sp(1740000, '1980-01-01', 5000000);   // 所得100万円
  assert.deepStrictEqual([r.kubun2, r.amount], ['④', 360000]);
  r = sp(2070000, '1980-01-01', 9200000);   // 所得133万円・区分B
  assert.deepStrictEqual([r.kubun2, r.amount], ['④', 20000]);
  r = sp(2070001, '1980-01-01', 5000000);
  assert.strictEqual(r.kubun2, null);
  r = sp(1000000, '1980-01-01', 10000001);  // 本人1,000万円超
  assert.strictEqual(r.amount, 0);
  assert.ok(r.doitsu);
});

test('扶養親族と特定親族', () => {
  const p = (birth, salary, extra) => C.classifyPerson(Object.assign({ birth, salary }, extra), Y);
  assert.strictEqual(p('2011-01-01', 0).category, 'ippan');       // 16歳
  assert.strictEqual(p('2011-01-02', 0).category, 'nensho');
  assert.strictEqual(p('2008-01-01', 0).category, 'tokuteiFuyo');  // 19歳
  assert.strictEqual(p('2004-01-01', 0).category, 'ippan');        // 23歳
  assert.strictEqual(p('1957-01-01', 0).category, 'rojin');
  assert.strictEqual(p('1957-01-01', 0, { lineal: true, together: true }).fuyoAmount, 580000);

  let r = p('2005-06-10', 1360000);
  assert.deepStrictEqual([r.category, r.fuyoAmount], ['tokuteiFuyo', 630000]);
  r = p('2005-06-10', 1360001);
  assert.deepStrictEqual([r.category, r.tokuteiAmount, r.tokuteiCheck], ['tokuteiShinzoku', 630000, true]);
  r = p('2005-06-10', 1750000);   // 所得101万円：控除31万円、扶養控除等申告書には書かない
  assert.deepStrictEqual([r.tokuteiAmount, r.inFormB], [310000, false]);
  r = p('2005-06-10', 1970000);
  assert.strictEqual(r.tokuteiAmount, 30000);
  assert.strictEqual(p('2005-06-10', 1970001).category, 'none');
});

test('改正で新たに対象になった人', () => {
  assert.ok(C.classifyPerson({ birth: '1990-01-01', salary: 1300000 }, Y).newByReform);   // 旧65万・新56万
  assert.ok(!C.classifyPerson({ birth: '1990-01-01', salary: 1200000 }, Y).newByReform);  // 旧55万で元から対象
});

test('記入例の合計', () => {
  const R = C.calculate({
    self: { salary: 4800000 },
    spouse: { has: true, birth: '1988-07-14', salary: 1500000 },
    people: [
      { rel: '子', birth: '2005-06-10', salary: 1300000 },
      { rel: '子', birth: '2012-04-01' },
      { rel: '母', birth: '1950-03-03', other: 400000, lineal: true, together: true }
    ]
  }, Y);
  assert.strictEqual(R.me.total, 3400000);
  assert.strictEqual(R.me.kiso, 1040000);
  assert.strictEqual(R.spouse.amount, 380000);
  assert.strictEqual(R.deductionTotal, 1040000 + 380000 + 630000 + 580000);
  assert.ok(R.lifeInsuranceTokurei);
});

test('所得金額調整控除', () => {
  const R = C.calculate({ self: { salary: 9500000 }, people: [{ birth: '2015-01-01' }] }, Y);
  assert.strictEqual(R.me.chosei, 100000);
  const R2 = C.calculate({ self: { salary: 12000000 }, people: [{ birth: '2015-01-01' }] }, Y);
  assert.strictEqual(R2.me.chosei, 150000);
});

test('保険料の計算式（1円未満切り上げ）', () => {
  const S = Y.seimei;
  assert.strictEqual(C.formula(S.shiki1, 20000), 20000);
  assert.strictEqual(C.formula(S.shiki1, 20001), 20001);   // 20000.5 → 切り上げ
  assert.strictEqual(C.formula(S.shiki1, 50000), 32500);
  assert.strictEqual(C.formula(S.shiki1, 80001), 40000);
  assert.strictEqual(C.formula(S.shiki2, 30000), 30000);
  assert.strictEqual(C.formula(S.shiki2, 96000), 54000);
  assert.strictEqual(C.formula(S.shiki2, 120001), 60000);
  assert.strictEqual(C.formula(S.shiki3, 30000), 27500);
  assert.strictEqual(C.formula(S.shiki3, 100001), 50000);
  assert.strictEqual(C.formula(Y.jishin.kyuChoki, 15000), 12500);
  assert.strictEqual(C.formula(S.shiki1, 0), 0);
});

test('生命保険料控除：新旧の組み合わせと特例', () => {
  let r = C.hokenKojo({ seimeiNew: 50000, seimeiOld: 30000 }, false, Y);
  assert.deepStrictEqual([r.ippan.amount, r.ippan.used], [40000, 'both']);     // ③ 最高4万円
  r = C.hokenKojo({ seimeiNew: 10000, seimeiOld: 100000 }, false, Y);
  assert.deepStrictEqual([r.ippan.amount, r.ippan.used], [50000, 'old']);      // ② の方が大きい
  r = C.hokenKojo({ seimeiNew: 10000, seimeiOld: 100000 }, true, Y);
  assert.deepStrictEqual([r.ippan.amount, r.ippan.used], [60000, 'both']);     // 特例なら③（最高6万円）
  r = C.hokenKojo({ seimeiNew: 200000 }, true, Y);
  assert.strictEqual(r.ippan.amount, 60000);
  r = C.hokenKojo({ seimeiNew: 200000 }, false, Y);
  assert.strictEqual(r.ippan.amount, 40000);
  r = C.hokenKojo({ seimeiNew: 96000, kaigo: 36000, nenkinOld: 120000 }, true, Y);
  assert.deepStrictEqual([r.seimeiSum, r.seimei], [132000, 120000]);           // 合計は最高12万円
});

test('地震保険料控除', () => {
  assert.strictEqual(C.hokenKojo({ jishin: 18000 }, false, Y).jishin, 18000);
  assert.strictEqual(C.hokenKojo({ jishin: 60000, kyuChoki: 15000 }, false, Y).jishin, 50000);
  assert.strictEqual(C.hokenKojo({ kyuChoki: 30000 }, false, Y).jishin, 15000);
});

test('記入例の保険料を含めた合計', () => {
  const R = C.calculate({
    self: { salary: 4800000 },
    people: [{ rel: '子', birth: '2005-06-10', salary: 1300000 }],
    hoken: { seimeiNew: 96000, kaigo: 36000, nenkinOld: 120000, jishin: 18000, shokibo: 144000 }
  }, Y);
  assert.strictEqual(R.hoken.seimei, 120000);
  assert.ok(R.deductions.some((d) => d.label === '小規模企業共済等掛金控除（申告分）' && d.amount === 144000));
  assert.strictEqual(R.deductionTotal, 1040000 + 630000 + 120000 + 18000 + 144000);
});

test('住宅借入金等特別控除', () => {
  const j = (o, total = 5000000) => C.jutakuKojo(Object.assign({ has: true }, o), total, Y);
  assert.strictEqual(C.jutakuKojo({ has: false }, 0, Y), null);
  // 記入例：令和6・7年入居、省エネ（子育て）、借入限度額4,000万円・0.7%
  assert.strictEqual(j({ period: 'r6-r7', type: 'shoene_t', zandaka: 32000000, taika: 38000000 }).amount, 224000);
  // 借入限度額2,000万円で頭打ち → 14万円
  let r = j({ period: 'r6-r7', type: 'ippan', zandaka: 30000000 });
  assert.deepStrictEqual([r.target, r.amount], [20000000, 140000]);
  // 1%・100円未満切り捨て
  assert.strictEqual(j({ period: 'h29-r3', type: 'ippan', zandaka: 25555555 }).amount, 255500);
  // 連帯債務 → 取得対価 の順
  r = j({ period: 'r4-r5', type: 'ippan', zandaka: 40000000, futan: 50, taika: 18000000 });
  assert.deepStrictEqual([r.share, r.base, r.amount], [20000000, 18000000, 126000]);
  // 居住用割合
  assert.strictEqual(j({ period: 'r4-r5', type: 'ippan', zandaka: 30000000, kyoju: 60 }).amount, 126000);
  // 所得要件：令和4年以後の入居は2,000万円、それより前は3,000万円
  assert.strictEqual(j({ period: 'r4-r5', type: 'ippan', zandaka: 30000000 }, 20000001).amount, 0);
  assert.strictEqual(j({ period: 'h29-r3', type: 'ippan', zandaka: 30000000 }, 25000000).amount, 300000);
  // 申告書の印字に合わせて入力
  assert.strictEqual(j({ period: 'r6-r7', type: 'custom', zandaka: 50000000, customLimit: 45000000, customRate: 9, customCap: 405000 }).amount, 405000);
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
console.log(failed ? `\n${failed} 件失敗` : '\nすべて成功');
process.exit(failed ? 1 : 0);
