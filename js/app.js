/*
 * 画面の入出力。計算は js/calc.js、年度の数字は data/r8.js にある。
 */
(function () {
  'use strict';

  var Y = window.NENCHO_YEARS.r8;
  var C = window.NenchoCalc;
  var LINEAL = ['父', '母', '祖父', '祖母', '義父', '義母'];

  var EMPTY = {
    self: { salary: '', other: '', shogai: 'none', status: 'none', student: false },
    spouse: { has: false, birth: '', salary: '', other: '', shogai: 'none', together: true, senju: false },
    people: [],
    hoken: { seimeiNew: '', seimeiOld: '', kaigo: '', nenkinNew: '', nenkinOld: '', jishin: '', kyuChoki: '', shakai: '', shokibo: '' },
    jutaku: { has: false, period: 'r6-r7', type: 'ippan', zandaka: '', futan: 100, taika: '', kyoju: 100, customLimit: '', customRate: '7', customCap: '' }
  };
  var SAMPLE = {
    jutaku: { has: true, period: 'r6-r7', type: 'shoene_t', zandaka: 32000000, futan: 100, taika: 38000000, kyoju: 100, customLimit: '', customRate: '7', customCap: '' },
    hoken: { seimeiNew: 96000, seimeiOld: '', kaigo: 36000, nenkinNew: '', nenkinOld: 120000, jishin: 18000, kyuChoki: '', shakai: '', shokibo: 144000 },
    self: { salary: 4800000, other: '', shogai: 'none', status: 'none', student: false },
    spouse: { has: true, birth: '1988-07-14', salary: 1500000, other: '', shogai: 'none', together: true, senju: false },
    people: [
      { name: '長男', rel: '子', birth: '2005-06-10', salary: 1300000, other: '', shogai: 'none', together: false },
      { name: '長女', rel: '子', birth: '2012-04-01', salary: '', other: '', shogai: 'none', together: true },
      { name: '母', rel: '母', birth: '1950-03-03', salary: '', other: 400000, shogai: 'none', together: true }
    ]
  };
  var NEW_PERSON = { name: '', rel: '子', birth: '', salary: '', other: '', shogai: 'none', together: true };

  var CATEGORY = {
    nensho: '16歳未満の扶養親族',
    ippan: '一般の控除対象扶養親族',
    tokuteiFuyo: '特定扶養親族',
    rojin: '老人扶養親族（同居老親等以外）',
    dokyoRoshin: '老人扶養親族（同居老親等）',
    tokuteiShinzoku: '特定親族',
    none: '対象外',
    unknown: '判定できません'
  };
  var KUBUN2 = {
    '①': '62万円以下かつ年齢70歳以上（昭32.1.1以前生）',
    '②': '62万円以下',
    '③': '62万円超95万円以下',
    '④': '95万円超133万円以下'
  };

  var form = document.getElementById('input');
  var peopleBox = document.getElementById('people');
  var tpl = document.getElementById('person-tpl');
  var result = document.getElementById('result');
  var banner = document.getElementById('sample-banner');
  var spouseFields = document.getElementById('spouse-fields');

  var state;
  var isSample;
  var copyText = '';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) { return Number(n || 0).toLocaleString('ja-JP') + '円'; }
  function man(v) {
    var n = Number(v) || 0;
    return n ? '＝ ' + (n / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 4 }) + '万円' : '';
  }
  function wareki(iso) {
    if (!iso) return '';
    var p = iso.split('-').map(Number);
    var era, y;
    if (iso >= '2019-05-01') { era = '令和'; y = p[0] - 2018; }
    else if (iso >= '1989-01-08') { era = '平成'; y = p[0] - 1988; }
    else if (iso >= '1926-12-25') { era = '昭和'; y = p[0] - 1925; }
    else { era = '大正'; y = p[0] - 1911; }
    return era + (y === 1 ? '元' : y) + '年' + p[1] + '月' + p[2] + '日生';
  }
  function ageAtYearEnd(iso) { return iso ? Y.year - Number(iso.slice(0, 4)) : null; }
  function personName(p) { return p.name || p.rel || '家族'; }

  // ── ことばの解説 ─────────────────────────
  // 画面の文章から用語を見つけて、区画ごとに最初の1回だけ解説ボタンにする

  var G = window.NENCHO_GLOSSARY;
  var pop = document.getElementById('gloss-pop');
  var words = Object.keys(G.terms).concat(Object.keys(G.aliases))
    .sort(function (a, b) { return b.length - a.length; });   // 長い語を先に当てる（「合計所得金額」＞「所得」）
  var wordRe = new RegExp(words.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g');
  var SKIP = 'h1,h2,h3,button,select,option,textarea,script,style,.term,.write';
  var openTerm = null;

  function linkTerms(scope, used) {
    var seen = {};
    var nodes = [];
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.parentElement && !n.parentElement.closest(SKIP)) nodes.push(n);
    }
    nodes.forEach(function (node) {
      var text = node.data;
      var frag = null;
      var last = 0;
      var m;
      wordRe.lastIndex = 0;
      while ((m = wordRe.exec(text))) {
        var key = G.aliases[m[0]] || m[0];
        if (seen[key]) continue;
        seen[key] = true;
        if (used) used[key] = true;
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'term';
        b.dataset.key = key;
        b.setAttribute('aria-expanded', 'false');
        b.textContent = m[0];
        frag.appendChild(b);
        last = m.index + m[0].length;
      }
      if (frag) {
        frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    });
  }

  function closePop() {
    if (openTerm) openTerm.setAttribute('aria-expanded', 'false');
    openTerm = null;
    pop.hidden = true;
  }
  function openPop(btn) {
    var key = btn.dataset.key;
    pop.innerHTML = '<p class="gloss-word">' + esc(key) + '</p><p>' + esc(G.terms[key]) + '</p>';
    pop.hidden = false;
    var r = btn.getBoundingClientRect();
    var maxLeft = window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8;
    pop.style.left = Math.max(window.scrollX + 8, Math.min(r.left + window.scrollX, maxLeft)) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    openTerm = btn;
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.term');
    if (t) {
      e.preventDefault();
      var same = openTerm === t;
      closePop();
      if (!same) openPop(t);
      return;
    }
    if (!pop.contains(e.target)) closePop();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !openTerm) return;
    var t = openTerm;
    closePop();
    t.focus();
  });
  window.addEventListener('resize', closePop);

  function glossaryItems(keys) {
    return keys.map(function (k) { return '<div><dt>' + esc(k) + '</dt><dd>' + esc(G.terms[k]) + '</dd></div>'; }).join('');
  }

  // ── 印刷用の画面 ─────────────────────────

  var printbar = document.getElementById('printbar');
  function enterPrint() {
    closePop();
    document.body.classList.add('printing');
    printbar.hidden = false;
    window.scrollTo(0, 0);
  }
  function exitPrint() {
    document.body.classList.remove('printing');
    printbar.hidden = true;
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.open-print')) enterPrint();
  });
  document.getElementById('do-print').addEventListener('click', function () { window.print(); });
  document.getElementById('exit-print').addEventListener('click', exitPrint);

  // ── 入力欄 ───────────────────────────────

  function getPath(path) {
    var k = path.split('.');
    return state[k[0]][k[1]];
  }
  function setPath(path, v) {
    var k = path.split('.');
    state[k[0]][k[1]] = v;
  }
  function setControl(el, v) {
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v == null ? '' : v;
  }
  function readControl(el) {
    return el.type === 'checkbox' ? el.checked : el.value;
  }
  function refreshMan(input) {
    var out = input.closest('.field') && input.closest('.field').querySelector('.man');
    if (out) out.textContent = man(input.value);
  }

  // 住宅ローン控除：入居時期と住宅の種類の選択肢は data/r8.js から作る
  var periodSel = document.getElementById('j-period');
  var typeSel = document.getElementById('j-type');
  var jutakuFields = document.getElementById('jutaku-fields');
  var jutakuCustom = document.getElementById('jutaku-custom');

  function option(value, label) {
    var o = document.createElement('option');
    o.value = value; o.textContent = label;
    return o;
  }
  function buildPeriodOptions() {
    periodSel.innerHTML = '';
    Y.jutaku.periods.forEach(function (p) { periodSel.appendChild(option(p.id, p.label)); });
  }
  function buildTypeOptions() {
    var p = Y.jutaku.periods.filter(function (x) { return x.id === state.jutaku.period; })[0] || Y.jutaku.periods[0];
    typeSel.innerHTML = '';
    p.types.forEach(function (t) { typeSel.appendChild(option(t[0], t[1])); });
    typeSel.appendChild(option('custom', '申告書の印字に合わせて入力'));
    var ids = p.types.map(function (t) { return t[0]; }).concat('custom');
    if (ids.indexOf(state.jutaku.type) < 0) state.jutaku.type = ids[0];
    typeSel.value = state.jutaku.type;
  }
  function refreshJutaku() {
    jutakuFields.hidden = !state.jutaku.has;
    jutakuCustom.hidden = state.jutaku.type !== 'custom';
  }

  function fillForm() {
    buildTypeOptions();
    form.querySelectorAll('[data-k]').forEach(function (el) {
      setControl(el, getPath(el.dataset.k));
      refreshMan(el);
    });
    renderPeople();
    spouseFields.hidden = !state.spouse.has;
    refreshJutaku();
    banner.hidden = !isSample;
  }

  function renderPeople() {
    peopleBox.innerHTML = '';
    state.people.forEach(function (p, i) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.i = i;
      node.querySelector('.person-no').textContent = '家族 ' + (i + 1);
      node.querySelectorAll('[data-p]').forEach(function (el) {
        el.id = 'person-' + i + '-' + el.dataset.p;
        setControl(el, p[el.dataset.p]);
        refreshMan(el);
      });
      peopleBox.appendChild(node);
      linkTerms(node);
    });
  }

  function onEdit(e) {
    var el = e.target;
    if (el.dataset.k) {
      setPath(el.dataset.k, readControl(el));
      if (el.dataset.k === 'spouse.has') spouseFields.hidden = !el.checked;
      if (el.dataset.k === 'jutaku.period') buildTypeOptions();
      if (el.dataset.k.indexOf('jutaku.') === 0) refreshJutaku();
    } else if (el.dataset.p) {
      var i = Number(el.closest('.person').dataset.i);
      state.people[i][el.dataset.p] = readControl(el);
    } else {
      return;
    }
    refreshMan(el);
    if (isSample) { isSample = false; banner.hidden = true; }
    render();
  }

  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  peopleBox.addEventListener('click', function (e) {
    if (!e.target.classList.contains('remove')) return;
    state.people.splice(Number(e.target.closest('.person').dataset.i), 1);
    renderPeople();
    render();
  });
  document.getElementById('add-person').addEventListener('click', function () {
    state.people.push(clone(NEW_PERSON));
    renderPeople();
    render();
    var last = peopleBox.lastElementChild;
    if (last) last.querySelector('input').focus();
  });
  document.getElementById('load-sample').addEventListener('click', function () {
    state = clone(SAMPLE); isSample = true; fillForm(); render();
  });
  document.getElementById('clear-all').addEventListener('click', function () {
    state = clone(EMPTY); isSample = false; fillForm(); render();
    document.getElementById('self-salary').focus();
  });

  // ── 書き方 ───────────────────────────────

  function toInput() {
    return {
      self: state.self,
      spouse: state.spouse,
      hoken: state.hoken,
      jutaku: state.jutaku,
      people: state.people.map(function (p) {
        var q = clone(p);
        q.lineal = LINEAL.indexOf(p.rel) >= 0;
        return q;
      })
    };
  }

  function w(v) { return '<span class="write">' + esc(v) + '</span>'; }
  function note(t) { return '<span class="cell-note">' + t + '</span>'; }
  function row(label, html) { return '<div class="lab">' + label + '</div><div>' + html + '</div>'; }

  function sheet(title, pill, body, opts) {
    opts = opts || {};
    var pills = { must: '必ず提出', yes: '書いて提出', no: '書く欄なし', maybe: '該当があれば提出' };
    var cls = pill === 'must' ? 'must' : pill === 'yes' ? 'yes' : 'no';
    return '<article class="sheet' + (pill === 'no' ? ' is-none' : '') + '">' +
      '<div class="sheet-head"><h3>' + title + '</h3><span class="pill ' + cls + '">' + pills[pill] + '</span></div>' +
      (opts.group ? '<p class="group-note">' + opts.group + '</p>' : '') +
      body +
      (opts.foot ? '<p class="sheet-foot">' + opts.foot + '</p>' : '') +
      '</article>';
  }

  function render() {
    var input = toInput();
    var R = C.calculate(input, Y);
    var me = R.me;
    var sp = R.spouse;
    var lines = [];

    // 控除の見込み
    var rows = R.deductions.map(function (d) {
      return '<tr><td>' + esc(d.label) + '</td><td>' + yen(d.amount) + '</td></tr>';
    }).join('');
    if (me.chosei) rows += '<tr><td>所得金額調整控除 <small>（給与所得から差し引き）</small></td><td>' + yen(me.chosei) + '</td></tr>';
    rows += '<tr class="total"><td>所得から差し引かれる額の合計</td><td>' + yen(R.deductionTotal) + '</td></tr>';
    if (R.jutaku) {
      rows += '<tr class="credit"><td>住宅借入金等特別控除 <small>（所得税の額から直接差し引き）</small></td><td>' + yen(R.jutaku.amount) + '</td></tr>';
    }

    lines.push('【' + Y.label + ' 年末調整 記入メモ】');
    lines.push('合計所得金額の見積額: ' + yen(me.total));
    R.deductions.forEach(function (d) { lines.push(d.label + ': ' + yen(d.amount)); });
    if (R.jutaku) lines.push('住宅借入金等特別控除額（税額控除）: ' + yen(R.jutaku.amount));

    // 注意
    var notes = [];
    if (me.salary === 0) notes.push('まず左の「今年1年間の給与の収入金額」を入れてください。');
    R.people.forEach(function (r, i) {
      var p = input.people[i];
      if (r.category === 'unknown') notes.push(esc(personName(p)) + 'の生年月日を入れると判定できます。');
      if (r.newByReform) notes.push('<b>改正で新たに対象</b> ' + esc(personName(p)) + 'は、所得要件が58万円から62万円に上がったことで、今年から' + CATEGORY[r.category] + 'になります。年初に出した扶養控除等申告書に書いていなければ追記してください。');
    });
    if (sp && sp.newByReform) notes.push('<b>改正で新たに対象</b> 配偶者は、所得要件の引上げで今年から同一生計配偶者（合計所得62万円以下）になります。');
    if (me.kinroNew) notes.push('<b>改正で新たに対象</b> 勤労学生の所得要件が85万円から89万円に上がったので、今年は勤労学生控除を受けられます。');
    if (state.self.student && !me.kinro) notes.push('勤労学生控除は合計所得89万円以下（給与だけなら年収163万円以下）が条件なので、今年は受けられません。');
    if (R.jutaku && R.jutaku.overIncome) notes.push('<b>住宅ローン控除</b> あなたの合計所得の見積額が' + yen(R.jutaku.incomeMax) + 'を超えるので、今年は住宅ローン控除を受けられません。');
    if (R.lifeInsuranceTokurei) notes.push('<b>生命保険料控除の特例</b> 23歳未満の扶養親族がいるので、保険料控除申告書で新生命保険料（一般）の控除額を最高6万円まで計算できます（これまでは4万円）。');

    var summary = '<section class="summary">' +
      '<h2>受けられる控除の見込み</h2>' +
      '<table class="ded"><tbody>' + rows + '</tbody></table>' +
      (notes.length ? '<ul class="notes">' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="copybar"><button type="button" class="btn ghost" id="copy">書き方をテキストでコピー</button>' +
      '<button type="button" class="btn ghost open-print">印刷用の画面</button><span class="copied" id="copied" role="status"></span></div>' +
      '</section>';

    var html = summary + fuyoSheet(R, input, lines) + kisoSheets(R, input, lines) + hokenSheet(R, input, lines) + jutakuSheet(R, lines);
    var d = new Date();
    var printHead = '<header class="print-only print-head"><p class="eyebrow">' + Y.label + '</p><h2>年末調整 記入メモ</h2>' +
      '<p>作成日 ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日。色のついた金額や項目を、会社から配られた申告書に書き写してください。</p></header>';
    var printGloss = '<section class="print-only print-gloss"><h2>このメモに出てくることば</h2><dl id="print-gloss"></dl></section>';

    closePop();
    result.innerHTML = printHead + html + printGloss;
    var used = {};
    result.querySelectorAll('.summary, .sheet').forEach(function (s) {
      linkTerms(s, s.classList.contains('is-none') ? null : used);
    });
    document.getElementById('print-gloss').innerHTML = glossaryItems(Object.keys(G.terms).filter(function (k) { return used[k]; }));
    copyText = lines.join('\n');
    document.getElementById('copy').addEventListener('click', copyNow);
  }

  // 扶養控除等（異動）申告書
  function fuyoSheet(R, input, lines) {
    var sp = R.spouse;
    var body = '<div class="grid">';
    lines.push('', '■ 扶養控除等（異動）申告書');

    // A 源泉控除対象配偶者
    if (sp && sp.gensenA) {
      var a = w('配偶者の氏名・生年月日・個人番号') + note(wareki(input.spouse.birth)) +
        '<div>令和8年中の所得の見積額 ' + w(yen(sp.income)) + '</div>' +
        (sp.doitsu && sp.flags.elderly ? '<div class="chk">老人控除対象配偶者</div>' : '') +
        note('配偶者の合計所得が95万円以下で、あなたの合計所得が900万円以下なので記入します。');
      body += row('A 源泉控除対象配偶者', a);
      lines.push('A欄: 配偶者（所得の見積額 ' + yen(sp.income) + '）');
    } else {
      body += row('A 源泉控除対象配偶者', '<span class="dim">書きません</span>' +
        (sp ? note('配偶者の合計所得が95万円超、またはあなたの合計所得が900万円超のため。') : ''));
    }

    // B 源泉控除対象親族
    var b = [];
    R.people.forEach(function (r, i) {
      if (!r.inFormB) return;
      var p = input.people[i];
      var checks = [];
      if (r.category === 'tokuteiFuyo') checks.push('特定扶養親族');
      if (r.category === 'rojin') checks.push('老人扶養親族「その他」');
      if (r.category === 'dokyoRoshin') checks.push('老人扶養親族「同居老親等」');
      if (r.tokuteiCheck) checks.push('特定親族');
      b.push('<div class="entry">' + w(personName(p) + '（' + p.rel + '）') + note(wareki(p.birth)) +
        checks.map(function (c) { return '<div class="chk">' + c + '</div>'; }).join('') +
        '<div>令和8年中の所得の見積額 ' + w(yen(r.income)) + '</div>' +
        (!p.together ? note('別居なので、住所又は居所の欄に家族の住所を書きます。') : '') +
        '</div>');
      lines.push('B欄: ' + personName(p) + ' ' + (checks.join('・') || '一般') + '（所得の見積額 ' + yen(r.income) + '）');
    });
    body += row('B 源泉控除対象親族（16歳以上）', b.length ? b.join('') : '<span class="dim">書きません</span>');

    // C 障害者・寡婦・ひとり親・勤労学生
    var c = [];
    var me = R.me;
    if (me.shogaiAmount) c.push((state.self.shogai === 'special' ? '特別障害者' : '一般の障害者') + '：本人');
    if (sp && sp.shogaiAmount) c.push((state.spouse.shogai === 'special' ? (state.spouse.together ? '同居特別障害者' : '特別障害者') : '一般の障害者') + '：同一生計配偶者');
    R.people.forEach(function (r, i) {
      if (!r.shogaiAmount) return;
      var p = input.people[i];
      c.push((p.shogai === 'special' ? (p.together ? '同居特別障害者' : '特別障害者') : '一般の障害者') + '：扶養親族（' + personName(p) + '）');
    });
    if (me.kafu) c.push('寡婦');
    if (me.hitorioya) c.push('ひとり親');
    if (me.kinro) c.push('勤労学生');
    body += row('C 障害者・寡婦・ひとり親・勤労学生', c.length
      ? c.map(function (t) { return '<div class="chk">' + esc(t) + '</div>'; }).join('') + note('障害者の場合は、手帳の種類や等級を「障害の状態又は勤労学生の内容」に書きます。')
      : '<span class="dim">書きません</span>');
    c.forEach(function (t) { lines.push('C欄: ' + t); });

    // 住民税に関する事項
    var n = [];
    R.people.forEach(function (r, i) {
      if (r.category !== 'nensho') return;
      var p = input.people[i];
      n.push('<div class="entry">' + w(personName(p) + '（' + p.rel + '）') + note(wareki(p.birth) + '・控除はありませんが記入が必要です'));
      n[n.length - 1] += '</div>';
      lines.push('住民税欄: ' + personName(p) + '（16歳未満）');
    });
    body += row('住民税に関する事項（16歳未満の扶養親族）', n.length ? n.join('') : '<span class="dim">書きません</span>');
    body += '</div>';

    return sheet('給与所得者の扶養控除等（異動）申告書', 'must', body, {
      foot: '年末調整を受けるには、この申告書を出していることが前提です。年初に出した内容から変わった場合は、変わった箇所を書き足し「異動月日及び事由」欄に日付と理由を書きます。'
    });
  }

  // 基礎控除申告書 兼 配偶者控除等申告書 兼 特定親族特別控除申告書 兼 所得金額調整控除申告書
  function kisoSheets(R, input, lines) {
    var me = R.me;
    var sp = R.spouse;
    var group = 'ここから下の4つは、国税庁の様式では1枚の用紙（兼用様式）にまとまっています。';

    // 基礎控除申告書
    var kyuyoAfter = Math.max(0, me.kyuyo - me.chosei);
    var body = '<div class="grid">' +
      row('給与所得 収入金額', w(yen(me.salary))) +
      row('給与所得 所得金額', w(yen(kyuyoAfter)) + (me.chosei ? note('所得金額調整控除 ' + yen(me.chosei) + ' を差し引いた額です。') : note('収入金額から給与所得控除を引いた額です。'))) +
      row('給与所得以外の所得の合計額', w(yen(me.other))) +
      row('あなたの本年中の合計所得金額の見積額', w(yen(me.total))) +
      row('判定', '<div class="chk">' + esc(me.kisoRow) + '</div>') +
      row('区分Ⅰ', sp && me.kubun1 ? w(me.kubun1) : '<span class="dim">空欄</span>' + note('配偶者控除・配偶者特別控除を受けない場合は書きません。')) +
      row('基礎控除の額', w(yen(me.kiso))) +
      '</div>';
    lines.push('', '■ 基礎控除申告書', '合計所得金額の見積額: ' + yen(me.total), '判定: ' + me.kisoRow, '基礎控除の額: ' + yen(me.kiso));
    if (sp && me.kubun1) lines.push('区分Ⅰ: ' + me.kubun1);
    var out = sheet('基礎控除申告書', 'yes', body, { group: group });

    // 配偶者控除等申告書
    if (!sp) {
      out += sheet('配偶者控除等申告書', 'no', '<p class="group-note">配偶者がいないので書きません。</p>');
    } else {
      var reason = sp.excluded ? '事業専従者として給与を受けている配偶者は対象外です。'
        : !me.kubun1 ? 'あなたの合計所得が1,000万円を超えるので、配偶者控除・配偶者特別控除は受けられません。'
        : !sp.kubun2 ? '配偶者の合計所得が133万円を超えるので対象外です。' : '';
      if (reason) {
        out += sheet('配偶者控除等申告書', 'no', '<p class="group-note">' + reason + '</p>');
      } else {
        var isHaigu = sp.kind === 'haigu';
        body = '<div class="grid">' +
          row('配偶者の氏名・生年月日', w('氏名・個人番号') + note(wareki(input.spouse.birth))) +
          row('給与所得 収入金額', w(yen(input.spouse.salary || 0))) +
          row('給与所得 所得金額', w(yen(sp.kyuyo))) +
          row('給与所得以外の所得の合計額', w(yen(Number(input.spouse.other) || 0))) +
          row('配偶者の本年中の合計所得金額の見積額', w(yen(sp.income))) +
          row('判定', '<div class="chk">' + KUBUN2[sp.kubun2] + '</div>') +
          row('区分Ⅱ', w(sp.kubun2)) +
          row(isHaigu ? '配偶者控除の額' : '配偶者特別控除の額', w(yen(sp.amount)) + note('区分Ⅰ「' + me.kubun1 + '」と区分Ⅱ「' + sp.kubun2 + '」を表に当てはめた額です。')) +
          '</div>';
        out += sheet('配偶者控除等申告書', 'yes', body);
        lines.push('', '■ 配偶者控除等申告書', '配偶者の合計所得金額の見積額: ' + yen(sp.income), '区分Ⅱ: ' + sp.kubun2,
          (isHaigu ? '配偶者控除の額: ' : '配偶者特別控除の額: ') + yen(sp.amount));
      }
    }

    // 特定親族特別控除申告書
    var t = [];
    R.people.forEach(function (r, i) {
      if (r.category !== 'tokuteiShinzoku') return;
      var p = input.people[i];
      t.push('<div class="grid">' +
        row('特定親族の氏名', w(personName(p) + '（' + p.rel + '）') + note(wareki(p.birth))) +
        row('給与所得 収入金額', w(yen(p.salary || 0))) +
        row('給与所得 所得金額', w(yen(r.kyuyo))) +
        row('給与所得以外の所得の合計額', w(yen(Number(p.other) || 0))) +
        row('特定親族の本年中の合計所得金額の見積額', w(yen(r.income))) +
        row('特定親族特別控除の額', w(yen(r.tokuteiAmount))) +
        '</div>');
      lines.push('', '■ 特定親族特別控除申告書（' + personName(p) + '）', '合計所得金額の見積額: ' + yen(r.income), '控除の額: ' + yen(r.tokuteiAmount));
    });
    out += t.length
      ? sheet('特定親族特別控除申告書', 'yes', t.join(''), { foot: '19歳以上23歳未満で、合計所得が62万円超123万円以下（給与だけなら年収136万円超197万円以下）の家族が対象です。' })
      : sheet('特定親族特別控除申告書', 'no', '<p class="group-note">対象になる家族（19歳以上23歳未満で、合計所得62万円超123万円以下）がいないので書きません。</p>');

    // 所得金額調整控除申告書
    if (me.salary <= Y.chosei.salaryOver) {
      out += sheet('所得金額調整控除申告書', 'no', '<p class="group-note">給与の収入金額が850万円以下なので書きません。</p>');
    } else if (!me.choseiReasons.length) {
      out += sheet('所得金額調整控除申告書', 'no', '<p class="group-note">要件（23歳未満の扶養親族・特別障害者）に当てはまらないので書きません。</p>');
    } else {
      body = '<div class="grid">' +
        row('要件', me.choseiReasons.map(function (x) { return '<div class="chk">' + esc(x) + '</div>'; }).join('')) +
        row('控除額', '<span class="dim">会社が計算します</span>' + note('見込みは ' + yen(me.chosei) + ' です。')) +
        '</div>';
      out += sheet('所得金額調整控除申告書', 'yes', body, { foot: '扶養控除と違い、夫婦の両方が給与850万円超なら、同じ子どもについて2人とも受けられます。' });
      lines.push('', '■ 所得金額調整控除申告書', '要件: ' + me.choseiReasons.join('、'));
    }
    return out;
  }

  // 保険料控除申告書。記号（A〜E、①〜⑥）は申告書の生命保険料控除欄に合わせている
  function hokenSheet(R, input, lines) {
    var H = R.hoken;
    var h = input.hoken || {};
    var n = function (k) { return Number(h[k]) || 0; };
    var anySeimei = n('seimeiNew') || n('seimeiOld') || n('kaigo') || n('nenkinNew') || n('nenkinOld');
    var anyJishin = n('jishin') || n('kyuChoki');
    if (!anySeimei && !anyJishin && !H.shakai && !H.shokibo) {
      return sheet('保険料控除申告書', 'no', '<p class="group-note">今年あなたが払った保険料・掛金がなければ書きません。左の欄に控除証明書の金額を入れると、書く金額が出ます。</p>');
    }
    var usedLabel = { both: '③（①＋②）', old: '②', 'new': '①' };
    var usedLabel2 = { both: '⑥（④＋⑤）', old: '⑤', 'new': '④' };
    var shiki = H.tokurei ? '計算式Ⅱ' : '計算式Ⅰ';
    var body = '<div class="grid">';
    lines.push('', '■ 保険料控除申告書');

    if (anySeimei) {
      body += '<div class="sec">生命保険料控除</div>';
      if (n('seimeiNew') || n('seimeiOld')) {
        var ip = H.ippan;
        var t = '';
        if (n('seimeiNew')) t += '<div>新保険料等の合計（A） ' + w(yen(n('seimeiNew'))) + '</div><div>① Aを' + shiki + 'に当てはめた額 ' + w(yen(ip.newAmt)) + '</div>';
        if (n('seimeiOld')) t += '<div>旧保険料等の合計（B） ' + w(yen(n('seimeiOld'))) + '</div><div>② Bを計算式Ⅲに当てはめた額 ' + w(yen(ip.oldAmt)) + '</div>';
        if (n('seimeiNew') && n('seimeiOld')) t += '<div>③ ①＋② ' + w(yen(ip.both)) + note('最高' + (H.tokurei ? '6万円（23歳未満の扶養親族がいるため）' : '4万円') + 'です。')  + '</div>';
        t += '<div>一般の生命保険料の控除額 ' + w(yen(ip.amount)) + note(usedLabel[ip.used] + 'の額を使います。') + '</div>';
        if (H.tokurei && n('seimeiNew')) t += note('令和8年の特例で、新生命保険料は' + shiki + '（最高6万円）で計算します。');
        body += row('一般の生命保険料', t);
        lines.push('一般の生命保険料の控除額: ' + yen(ip.amount));
      }
      if (n('kaigo')) {
        body += row('介護医療保険料', '<div>新保険料等の合計（C） ' + w(yen(n('kaigo'))) + '</div><div>Cを計算式Ⅰに当てはめた額 ' + w(yen(H.kaigo)) + '</div>');
        lines.push('介護医療保険料の控除額: ' + yen(H.kaigo));
      }
      if (n('nenkinNew') || n('nenkinOld')) {
        var nk = H.nenkin;
        var u = '';
        if (n('nenkinNew')) u += '<div>新保険料等の合計（D） ' + w(yen(n('nenkinNew'))) + '</div><div>④ Dを計算式Ⅰに当てはめた額 ' + w(yen(nk.newAmt)) + '</div>';
        if (n('nenkinOld')) u += '<div>旧保険料等の合計（E） ' + w(yen(n('nenkinOld'))) + '</div><div>⑤ Eを計算式Ⅲに当てはめた額 ' + w(yen(nk.oldAmt)) + '</div>';
        if (n('nenkinNew') && n('nenkinOld')) u += '<div>⑥ ④＋⑤ ' + w(yen(nk.both)) + note('最高4万円です。') + '</div>';
        u += '<div>個人年金保険料の控除額 ' + w(yen(nk.amount)) + note(usedLabel2[nk.used] + 'の額を使います。') + '</div>';
        body += row('個人年金保険料', u);
        lines.push('個人年金保険料の控除額: ' + yen(nk.amount));
      }
      body += row('生命保険料控除額 計', w(yen(H.seimei)) +
        (H.seimeiSum > H.seimei ? note('3つの合計は ' + yen(H.seimeiSum) + ' ですが、上限の12万円になります。') : note('最高12万円です。')));
      lines.push('生命保険料控除額: ' + yen(H.seimei));
    }

    if (anyJishin) {
      body += '<div class="sec">地震保険料控除</div>';
      var j = '';
      if (n('jishin')) j += '<div>地震保険料の合計（A） ' + w(yen(n('jishin'))) + '</div><div>① Aの金額（最高5万円） ' + w(yen(H.quake)) + '</div>';
      if (n('kyuChoki')) j += '<div>旧長期損害保険料の合計（B） ' + w(yen(n('kyuChoki'))) + '</div><div>② Bを計算式に当てはめた額（最高1万5千円） ' + w(yen(H.choki)) + '</div>';
      body += row('保険料の金額', j);
      body += row('地震保険料控除額', w(yen(H.jishin)) + note((n('jishin') && n('kyuChoki') ? '①＋② の額で、' : '') + '最高5万円です。'));
      lines.push('地震保険料控除額: ' + yen(H.jishin));
    }

    if (H.shakai) {
      body += '<div class="sec">社会保険料控除</div>' +
        row('あなたが本年中に支払った保険料の金額', w(yen(H.shakai)) + note('保険料の種類・支払先・負担する人ごとに行を分けて書き、合計を出します。'));
      lines.push('社会保険料控除（申告分）: ' + yen(H.shakai));
    }
    if (H.shokibo) {
      body += '<div class="sec">小規模企業共済等掛金控除</div>' +
        row('あなたが本年中に支払った掛金の金額', w(yen(H.shokibo)) + note('iDeCoは「個人型年金加入者掛金」の欄に書きます。'));
      lines.push('小規模企業共済等掛金控除（申告分）: ' + yen(H.shokibo));
    }
    body += '</div>';

    return sheet('保険料控除申告書', 'yes', body, {
      foot: '控除証明書は申告書と一緒に会社へ出します（旧生命保険料は1契約9,000円以下なら不要）。国民年金保険料と小規模企業共済等掛金も証明書が必要です。'
    });
  }

  // 給与所得者の住宅借入金等特別控除申告書
  function jutakuSheet(R, lines) {
    var J = R.jutaku;
    var title = '住宅借入金等特別控除申告書';
    if (!J) {
      return sheet(title, 'no', '<p class="group-note">住宅ローン控除を受けないので書きません。2年目以降の人は、税務署から10〜11月ごろに届く申告書を使います。</p>');
    }
    var pct = function (v) { return (Math.round(v * 10) / 10) + '%'; };
    var body = '<div class="grid">' +
      row('住み始めた時期・住宅の種類', esc(J.period.label) + note(esc(J.typeLabel))) +
      row('住宅借入金等の年末残高', w(yen(J.zandaka)) + note('年末残高等証明書（または控除証明書）の金額です。'));
    if (J.futan < 100) body += row('連帯債務の負担分', w(yen(J.share)) + note('年末残高 × 負担割合 ' + pct(J.futan) + '。備考欄に、ほかの連帯債務者から負担額の記入を受けます（控除証明書に負担割合が書かれていれば不要）。'));
    if (J.taika) body += row('取得対価等の額', w(yen(J.taika)) + note(J.base < J.share ? '年末残高の方が多いので、取得対価等の額までが対象です。' : '年末残高の方が少ないので、年末残高をそのまま使います。'));
    if (J.kyoju < 100) body += row('居住用部分の年末残高', w(yen(J.residential)) + note('居住用の割合 ' + pct(J.kyoju) + ' を掛けた額です。'));
    body += row('控除の対象になる残高', w(yen(J.target)) + note(J.limit && J.residential > J.limit ? '借入限度額 ' + yen(J.limit) + ' までが対象です。' : '借入限度額は ' + (J.limit ? yen(J.limit) : '未入力') + ' です。'));
    body += row('住宅借入金等特別控除額', J.overIncome
      ? '<span class="dim">今年は受けられません</span>' + note('合計所得の見積額が' + yen(J.incomeMax) + 'を超えるためです。')
      : w(yen(J.amount)) + note('対象の残高 × 控除率 ' + (J.rate / 10) + '%（100円未満切り捨て）＝ ' + yen(J.computed) +
        (J.cap ? '。各年の控除限度額は ' + yen(J.cap) + (J.computed > J.cap ? 'なので、限度額になります。' : ' です。') : '。')));
    body += '</div>';
    lines.push('', '■ 住宅借入金等特別控除申告書', '年末残高: ' + yen(J.zandaka), '住宅借入金等特別控除額: ' + yen(J.amount));

    return sheet(title, 'yes', body, {
      foot: '申告書の「住宅借入金等特別控除額」欄に金額がすでに印字されている場合（調書方式）は、その額が上の計算と合っているか確かめるだけで大丈夫です。繰上返済などで残高が変わったときは、実際の年末残高で書き直します。証明書方式の人は年末残高等証明書を添付します。所得税から引ききれなかった分は、翌年の住民税から差し引かれることがあります。'
    });
  }

  function copyNow() {
    var done = document.getElementById('copied');
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = copyText;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copyText).then(function () { done.textContent = 'コピーしました'; }, fallback);
    } else {
      fallback();
    }
  }

  buildPeriodOptions();
  form.querySelectorAll('fieldset').forEach(function (f) { linkTerms(f); });
  document.getElementById('glossary-list').innerHTML = glossaryItems(Object.keys(G.terms));
  state = clone(SAMPLE);
  isSample = true;
  fillForm();
  render();
})();
