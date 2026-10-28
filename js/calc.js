/*
 * 年末調整の判定と計算。画面に依存しない純粋な関数だけを置く。
 * 年度ごとの数字は data/r*.js から受け取る（引数 Y）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NenchoCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function num(v) {
    var n = Math.floor(Number(v) || 0);
    return n > 0 ? n : 0;
  }

  // [上限, 値] の表から、x が上限以下になる最初の値を返す
  function lookup(table, x) {
    for (var i = 0; i < table.length; i++) if (x <= table[i][0]) return table[i][1];
    return null;
  }

  // 給与所得（年末調整等のための給与所得控除後の給与等の金額の表に沿った計算）
  function kyuyoShotoku(revenue, Y) {
    var k = Y.kyuyo;
    var r = num(revenue);
    if (r < k.zeroBelow) return 0;
    if (r < k.flatUntil) return r - k.flatDeduction;
    for (var i = 0; i < k.steps.length; i++) if (r < k.steps[i][0]) return k.steps[i][1];
    if (r < 6600000) {
      // 660万円未満は収入を4,000円単位に切り捨ててから計算する（所得税法別表第五）
      var a = Math.floor(r / 4000) * 4000;
      return a < 3600000 ? (a * 7) / 10 - 80000 : (a * 8) / 10 - 440000;
    }
    if (r < 8500000) return Math.floor((r * 9) / 10) - 1100000;
    return r - 1950000;
  }

  function goukei(p, Y) {
    return kyuyoShotoku(p.salary, Y) + num(p.other);
  }

  // 改正前の給与所得控除（最低65万円）で見た合計所得。改正で新たに対象になった人を見つけるために使う
  function oldGoukei(p, Y) {
    var o = Y.oldKyuyo;
    var r = num(p.salary);
    var k = r >= o.until ? kyuyoShotoku(r, Y) : Math.max(0, r - o.min);
    return k + num(p.other);
  }

  function bornFlags(birth, Y) {
    var B = Y.born;
    var b = birth || '';
    return {
      known: !!b,
      under16: !!b && b > B.age16,
      tokuteiAge: !!b && b >= B.tokuteiFrom && b <= B.tokuteiTo,
      under23: !!b && b >= B.under23From,
      elderly: !!b && b <= B.elderly
    };
  }

  function shogaiAmount(kind, together, Y) {
    if (kind === 'special') return together ? Y.shogai.dokyoSpecial : Y.shogai.special;
    if (kind === 'normal') return Y.shogai.normal;
    return 0;
  }

  // 親族1人の判定
  // category: nensho（16歳未満） / ippan / tokuteiFuyo / rojin / dokyoRoshin / tokuteiShinzoku / none / unknown
  function classifyPerson(p, Y) {
    var F = Y.fuyo;
    var f = bornFlags(p.birth, Y);
    var inc = goukei(p, Y);
    var r = {
      income: inc, kyuyo: kyuyoShotoku(p.salary, Y), flags: f,
      category: 'none', fuyoAmount: 0, tokuteiAmount: 0, shogaiAmount: 0,
      fuyoShinzoku: false, inFormB: false, tokuteiCheck: false, newByReform: false
    };
    if (!f.known) { r.category = 'unknown'; return r; }

    if (inc <= F.max) {
      r.fuyoShinzoku = true;
      r.newByReform = oldGoukei(p, Y) > F.oldMax;
      if (f.under16) r.category = 'nensho';
      else if (f.tokuteiAge) { r.category = 'tokuteiFuyo'; r.fuyoAmount = F.tokutei; }
      else if (f.elderly && p.lineal && p.together) { r.category = 'dokyoRoshin'; r.fuyoAmount = F.dokyoRoshin; }
      else if (f.elderly) { r.category = 'rojin'; r.fuyoAmount = F.rojin; }
      else { r.category = 'ippan'; r.fuyoAmount = F.ippan; }
      r.inFormB = !f.under16;
      r.shogaiAmount = shogaiAmount(p.shogai, p.together, Y);
    } else if (f.tokuteiAge) {
      var t = lookup(Y.tokuteiShinzoku, inc);
      if (t !== null) {
        r.category = 'tokuteiShinzoku';
        r.tokuteiAmount = t;
        r.inFormB = inc <= Y.gensenTokuteiMax;
        r.tokuteiCheck = r.inFormB;
      }
    }
    return r;
  }

  function classifySpouse(s, selfTotal, kubun1, Y) {
    var H = Y.haigu;
    var f = bornFlags(s.birth, Y);
    var inc = goukei(s, Y);
    var r = {
      income: inc, kyuyo: kyuyoShotoku(s.salary, Y), flags: f,
      excluded: !!s.senju, doitsu: false, kubun2: null, kind: null, amount: 0,
      gensenA: false, shogaiAmount: 0, newByReform: false
    };
    if (r.excluded) return r;

    r.doitsu = inc <= Y.fuyo.max;
    r.newByReform = r.doitsu && oldGoukei(s, Y) > Y.fuyo.oldMax;
    if (r.doitsu) r.shogaiAmount = shogaiAmount(s.shogai, s.together, Y);
    r.gensenA = selfTotal <= Y.gensenSpouse.selfMax && inc <= Y.gensenSpouse.spouseMax;

    if (r.doitsu && f.elderly) r.kubun2 = '①';
    else if (r.doitsu) r.kubun2 = '②';
    else if (inc <= H.tokubetsu[0][0]) r.kubun2 = '③';
    else if (inc <= H.tokubetsu[H.tokubetsu.length - 1][0]) r.kubun2 = '④';

    if (!kubun1 || !r.kubun2) return r;
    var col = { A: 0, B: 1, C: 2 }[kubun1];
    if (r.kubun2 === '①') { r.kind = 'haigu'; r.amount = H.rojinHaigu[col]; }
    else if (r.kubun2 === '②') { r.kind = 'haigu'; r.amount = H.haigu[col]; }
    else { r.kind = 'tokubetsu'; r.amount = lookup(H.tokubetsu, inc)[col]; }
    return r;
  }

  // 保険料の計算式に当てはめる（1円未満は切り上げ）
  function formula(table, paid) {
    var x = num(paid);
    if (!x) return 0;
    for (var i = 0; i < table.length; i++) {
      if (x <= table[i][0]) return Math.ceil(x * table[i][1] + table[i][2]);
    }
    return 0;
  }

  // 新・旧の両方があるときは ①②③（④⑤⑥）のうち最も大きい額
  function pairDeduction(newAmt, oldAmt, newPaid, oldPaid, max) {
    var r = { newAmt: newAmt, oldAmt: oldAmt, both: 0, amount: 0, used: null };
    if (num(newPaid) && num(oldPaid)) {
      r.both = Math.min(max, newAmt + oldAmt);
      r.amount = Math.max(r.both, oldAmt);
      r.used = r.amount === r.both ? 'both' : 'old';
    } else if (num(newPaid)) { r.amount = newAmt; r.used = 'new'; }
    else if (num(oldPaid)) { r.amount = oldAmt; r.used = 'old'; }
    return r;
  }

  /*
   * h = { seimeiNew, seimeiOld, kaigo, nenkinNew, nenkinOld, jishin, kyuChoki, shakai, shokibo }
   * tokurei: 23歳未満の扶養親族がいるか
   */
  function hokenKojo(h, tokurei, Y) {
    h = h || {};
    var S = Y.seimei;
    var J = Y.jishin;
    var ippan = pairDeduction(
      formula(tokurei ? S.shiki2 : S.shiki1, h.seimeiNew), formula(S.shiki3, h.seimeiOld),
      h.seimeiNew, h.seimeiOld, tokurei ? S.pairMaxTokurei : S.pairMax);
    var kaigo = formula(S.shiki1, h.kaigo);
    var nenkin = pairDeduction(
      formula(S.shiki1, h.nenkinNew), formula(S.shiki3, h.nenkinOld),
      h.nenkinNew, h.nenkinOld, S.pairMax);
    var seimeiSum = ippan.amount + kaigo + nenkin.amount;
    var quake = Math.min(J.quakeMax, num(h.jishin));
    var choki = formula(J.kyuChoki, h.kyuChoki);
    return {
      tokurei: !!tokurei,
      ippan: ippan, kaigo: kaigo, nenkin: nenkin,
      seimeiSum: seimeiSum,
      seimei: Math.min(S.totalMax, seimeiSum),
      quake: quake, choki: choki,
      jishin: Math.min(J.totalMax, quake + choki),
      shakai: num(h.shakai),
      shokibo: num(h.shokibo)
    };
  }

  function percent(v, dflt) {
    var n = v === '' || v == null ? dflt : Number(v);
    if (!isFinite(n)) n = dflt;
    return Math.min(100, Math.max(0, n));
  }

  /*
   * 住宅借入金等特別控除（税額控除）
   * j = { has, period, type, zandaka, futan(%), taika, kyoju(%), customLimit, customRate(千分率), customCap }
   * 計算の順序は ⑴連帯債務の負担分 → ⑵取得対価等の額と比べて少ない方 → ⑶居住用割合
   */
  function jutakuKojo(j, total, Y) {
    if (!j || !j.has) return null;
    var J = Y.jutaku;
    var period = J.periods.filter(function (p) { return p.id === j.period; })[0] || J.periods[0];
    var type = period.types.filter(function (t) { return t[0] === j.type; })[0];
    var custom = !type;
    var limit = custom ? num(j.customLimit) : type[2];
    var rate = custom ? num(j.customRate) : period.rate;
    var cap = custom ? num(j.customCap) : type[3];

    var zandaka = num(j.zandaka);
    var futan = percent(j.futan, 100);
    var kyoju = percent(j.kyoju, 100);
    var share = Math.floor((zandaka * futan) / 100);
    var taika = num(j.taika);
    var base = taika ? Math.min(share, taika) : share;
    var residential = Math.floor((base * kyoju) / 100);
    var target = limit ? Math.min(residential, limit) : residential;
    var computed = Math.floor((target * rate) / 100000) * 100;   // 100円未満切り捨て
    var amount = cap ? Math.min(cap, computed) : computed;

    var incomeMax = period.from >= 2022 ? J.incomeMax.from2022 : J.incomeMax.before2022;
    var overIncome = total > incomeMax;
    return {
      period: period, typeLabel: custom ? '申告書の印字に合わせて入力' : type[1], custom: custom,
      limit: limit, rate: rate, cap: cap,
      zandaka: zandaka, futan: futan, share: share, taika: taika, base: base,
      kyoju: kyoju, residential: residential, target: target, computed: computed,
      incomeMax: incomeMax, overIncome: overIncome,
      amount: overIncome ? 0 : amount
    };
  }

  /*
   * input = {
   *   self:   { salary, other, shogai: 'none'|'normal'|'special', status: 'none'|'kafu'|'hitorioya', student },
   *   spouse: { has, birth, salary, other, senju, shogai, together },
   *   people: [{ name, rel, birth, salary, other, lineal, together, shogai }]
   * }
   */
  function calculate(input, Y) {
    var self = input.self || {};
    var people = (input.people || []).map(function (p) { return classifyPerson(p, Y); });
    var spouseIn = input.spouse && input.spouse.has ? input.spouse : null;

    // 所得金額調整控除の要件（23歳未満の扶養親族・特別障害者）
    var spouseInc = spouseIn ? goukei(spouseIn, Y) : null;
    var spouseDoitsu = spouseIn && !spouseIn.senju && spouseInc <= Y.fuyo.max;
    var choseiReasons = [];
    if (self.shogai === 'special') choseiReasons.push('あなた自身が特別障害者');
    if (spouseDoitsu && spouseIn.shogai === 'special') choseiReasons.push('同一生計配偶者が特別障害者');
    if (people.some(function (r, i) { return r.fuyoShinzoku && input.people[i].shogai === 'special'; })) choseiReasons.push('扶養親族が特別障害者');
    if (people.some(function (r) { return r.fuyoShinzoku && r.flags.under23; })) choseiReasons.push('扶養親族が年齢23歳未満');

    var salary = num(self.salary);
    var kyuyo = kyuyoShotoku(salary, Y);
    var chosei = 0;
    if (salary > Y.chosei.salaryOver && choseiReasons.length) {
      chosei = Math.min(Y.chosei.max, Math.ceil((Math.min(salary, Y.chosei.cap) - Y.chosei.salaryOver) / 10));
    }
    var total = Math.max(0, kyuyo - chosei) + num(self.other);
    var kiso = lookup(Y.kiso, total) || 0;
    var kubun1 = lookup(Y.kubun1, total);

    var me = {
      salary: salary, kyuyo: kyuyo, chosei: chosei, choseiReasons: choseiReasons,
      other: num(self.other), total: total, kiso: kiso,
      kisoRow: lookup(Y.kisoRows, total) || '2,500万円超',
      kubun1: kubun1,
      shogaiAmount: self.shogai === 'special' ? Y.shogai.special : self.shogai === 'normal' ? Y.shogai.normal : 0,
      kafu: self.status === 'kafu' && total <= Y.kafu.incomeMax ? Y.kafu.amount : 0,
      hitorioya: self.status === 'hitorioya' && total <= Y.hitorioya.incomeMax ? Y.hitorioya.amount : 0,
      kinro: self.student && total <= Y.kinro.incomeMax && num(self.other) <= Y.kinro.otherMax ? Y.kinro.amount : 0,
      kinroNew: !!self.student && total <= Y.kinro.incomeMax && oldGoukei(self, Y) > Y.kinro.oldIncomeMax
    };

    var spouse = spouseIn ? classifySpouse(spouseIn, total, kubun1, Y) : null;

    // 23歳未満の扶養親族がいると、一般生命保険料控除の特例が使える
    var lifeInsuranceTokurei = people.some(function (r) { return r.fuyoShinzoku && r.flags.under23; });

    var deductions = [];
    function add(label, amount, form) { if (amount > 0) deductions.push({ label: label, amount: amount, form: form }); }
    add('基礎控除', kiso, 'kiso');
    if (spouse) add(spouse.kind === 'haigu' ? '配偶者控除' : '配偶者特別控除', spouse.amount, 'haigu');
    people.forEach(function (r, i) {
      var who = input.people[i].name || input.people[i].rel || '親族' + (i + 1);
      add('扶養控除（' + who + '）', r.fuyoAmount, 'fuyo');
      add('特定親族特別控除（' + who + '）', r.tokuteiAmount, 'tokutei');
      add('障害者控除（' + who + '）', r.shogaiAmount, 'fuyo');
    });
    if (spouse) add('障害者控除（配偶者）', spouse.shogaiAmount, 'fuyo');
    add('障害者控除（あなた）', me.shogaiAmount, 'fuyo');
    add('寡婦控除', me.kafu, 'fuyo');
    add('ひとり親控除', me.hitorioya, 'fuyo');
    add('勤労学生控除', me.kinro, 'fuyo');

    var hoken = hokenKojo(input.hoken, lifeInsuranceTokurei, Y);
    add('生命保険料控除', hoken.seimei, 'hoken');
    add('地震保険料控除', hoken.jishin, 'hoken');
    add('社会保険料控除（申告分）', hoken.shakai, 'hoken');
    add('小規模企業共済等掛金控除（申告分）', hoken.shokibo, 'hoken');

    return {
      year: Y.label, me: me, spouse: spouse, people: people, hoken: hoken,
      jutaku: jutakuKojo(input.jutaku, total, Y),
      deductions: deductions,
      deductionTotal: deductions.reduce(function (s, d) { return s + d.amount; }, 0),
      lifeInsuranceTokurei: lifeInsuranceTokurei
    };
  }

  return {
    kyuyoShotoku: kyuyoShotoku, goukei: goukei, classifyPerson: classifyPerson,
    classifySpouse: classifySpouse, calculate: calculate, lookup: lookup,
    formula: formula, hokenKojo: hokenKojo, jutakuKojo: jutakuKojo
  };
});
