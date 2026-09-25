// ══════════════════════════════════════════════════════════════
//  JSP — 日本社会党 1959-1993   盤面計算
//  .dry 側は  {! window.JSP.xxx(Q) !}  で呼ぶ。
//  ここはビルドで上書きされない（テンプレート外のファイル）。
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var LAYERS  = ['kokorou', 'minrou', 'mishoshiki', 'jieigyo', 'noson', 'shinchukan'];
  var PARTIES = ['jimin', 'shakai', 'minsha', 'komei', 'kyosan', 'other'];

  var LNAME = {
    kokorou: '官公劳', minrou: '民间工会', mishoshiki: '未组织受雇者',
    jieigyo: '自营工商', noson: '农村', shinchukan: '新中间层'
  };
  var PNAME = { jimin: '自民', shakai: '社会', minsha: '民社', komei: '公明', kyosan: '共产', other: '其他' };
  var PCOLOR = { jimin: '#3E6E8C', shakai: '#c00000', minsha: '#8A6A1E', komei: '#5B7F5B', kyosan: '#700000', other: '#888' };
  var FNAME = {
    uha: '右派（西尾派）', chuu: '中间右派（江田派）',
    chusa: '中间左派（铃木–佐佐木派）', saha: '左派（协会派）',
    //  合同で入ってきた側。もとの党の系譜が、そのまま党内の派閥になる。
    //  民社は右派、社民連は中間右派の系譜なので、ここには作らない。
    kyosan: '共产党系', hoshu: '保守派', jiyu: '自由派'
  };

  // 隣接派閥からの漏れ。史実の民社党 40 = 西尾派 30 + 中間右派 10 で校正
  var BLEED = 0.24;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function r1(v) { return Math.round(v * 10) / 10; }

  var JSP = {
    LAYERS: LAYERS, PARTIES: PARTIES,
    LNAME: LNAME, PNAME: PNAME, PCOLOR: PCOLOR, FNAME: FNAME,

    // ── 層ごとの得票上限。組織率が高いほど高い ──────────────
    capOf: function (Q, l) {
      var o = Q['org_' + l] || 0;
      return o * Q.CAP_ORG + (1 - o) * Q.CAP_FLOAT;
    },

    // ── 単独過半への理論最大値（％）。左翼統一路線の時計 ──────
    theoreticalMax: function (Q) {
      var t = 0, i, l;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        t += Q['pop_' + l] * this.capOf(Q, l) / 100;
      }
      return t;
    },

    // ── 得票率：層ごとに正規化 → 人口加重 → 再正規化 ──────────
    tally: function (Q) {
      var res = {}, total = 0, i, j, l, p, sum, v;
      for (j = 0; j < PARTIES.length; j++) res[PARTIES[j]] = 0;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        sum = 0;
        for (j = 0; j < PARTIES.length; j++) {
          p = PARTIES[j];
          v = Q['lean_' + l + '_' + p];
          if (!v || v < 0) { v = 0; Q['lean_' + l + '_' + p] = 0; }
          sum += v;
        }
        if (sum <= 0) { continue; }
        for (j = 0; j < PARTIES.length; j++) {
          p = PARTIES[j];
          res[p] += Q['pop_' + l] * (Q['lean_' + l + '_' + p] / sum);
        }
      }
      for (j = 0; j < PARTIES.length; j++) { total += res[PARTIES[j]]; }
      if (total <= 0) { return res; }
      for (j = 0; j < PARTIES.length; j++) { res[PARTIES[j]] = res[PARTIES[j]] / total * 100; }
      return res;
    },

    // ── 得票率 → 議席 ────────────────────────────────────────
    //  中選挙区制を三つの機構で近似する。曲線あてはめではない。
    //   ① 1票の格差   農村の1票は都市の約1.8倍の重み → 自民を押し上げた
    //   ② 組織票の集中 組織票は地域に固まるので議席に変換されやすい → 社会党を押し上げた
    //   ③ 小党の死票   一定率に届かない党は切り捨てられる → 共産・諸派を潰した
    //  1958年で校正：自民 288 / 社会 166 / 他 13（史実 287 / 166 / 13）
    SEAT_W: { kokorou: 0.92, minrou: 0.92, mishoshiki: 0.88,
              jieigyo: 1.10, noson: 1.40, shinchukan: 0.78 },
    ORG_SEAT_BONUS: 1.2,
    SEAT_THRESHOLD: 3.0,
    //  党ごとの票の集中度。中選挙区制では「どこに票があるか」が
    //  「何票あるか」と同じくらい効く。
    //   公明 = 創価学会の組織票を選挙区ごとに精密配分した。最も効率が高い
    //   民社 = 総評を失って基盤が薄く広がった。史実1960は 8.8%の票で 3.6%の議席
    //   共産 = 全国に薄く散っている
    PARTY_EFF: { jimin: 1.0, shakai: 1.0, minsha: 1.0, komei: 1.30, kyosan: 0.80, other: 1.0 },

    // ══════════════════════════════════════════════════════════
    //  選挙制度
    //
    //  senkyoku_seido は長らくどこからも読まれていなかった ──
    //  憲法で比例代表にしても、政治改革で小選挙区を通しても、
    //  議席の出方は中選挙区のままだった。事象の本文は「小選挙区に
    //  なれば第二党は議席を大きく減らす」と書いているのに、
    //  盤がそれを実装していなかった。
    //
    //  k は得票から議席への写像の傾き。1 より大きいと大きい党へ寄り、
    //  小さいと得票率どおりに近づく。thr は足切り（％）。
    //  0（中選挙区）は k=1.00 / thr=3.0 で、これまでの校正と同じ値である。
    // ══════════════════════════════════════════════════════════
    SEIDO: {
      0: { name: '中选区', k: 1.00, thr: 3.0 },
      1: { name: '小选区比例代表并立制', k: 1.35, thr: 4.0 },
      2: { name: '比例为主', k: 0.92, thr: 1.5 },
      3: { name: '比例代表', k: 0.85, thr: 1.0 },
      4: { name: '小选区比例代表并用制', k: 0.88, thr: 1.5 },
      5: { name: '小选区比例代表连用制', k: 0.90, thr: 1.5 },
      6: { name: '单纯小选区', k: 1.90, thr: 8.0 }
    },
    seidoOf: function (Q) {
      return this.SEIDO[Q.senkyoku_seido || 0] || this.SEIDO[0];
    },

    //  自民党の組織基盤（族議員・農協・特定郵便局長会・業界団体）。
    //  一〇〇が手つかず、〇まで削れる。ここは票そのものではなく、
    //  票を議席へ変える効率である ── 自民党が中選挙区で強かったのは
    //  「どこに票があるか」を組織で握っていたからで、その握りを外すと
    //  同じ得票でも議席が減る。政権を取らないと手が届かない。
    JIMIN_KIBAN_FLOOR: 0.65,
    kibanOf: function (Q) {
      var k = (Q.jimin_kiban === undefined) ? 100 : Q.jimin_kiban;
      k = Math.max(0, Math.min(100, k));
      return this.JIMIN_KIBAN_FLOOR + (1 - this.JIMIN_KIBAN_FLOOR) * (k / 100);
    },
    //  基盤を削る。政権にいるあいだしか効かない（法と人事が要る）。
    kibanCut: function (Q, amt) {
      if (!Q.in_power) { return 0; }
      var before = (Q.jimin_kiban === undefined) ? 100 : Q.jimin_kiban;
      Q.jimin_kiban = Math.max(0, before - amt);
      Q.kiban_cut_last = before - Q.jimin_kiban;
      return Q.kiban_cut_last;
    },

    allocate: function (Q) {
      var share = this.tally(Q);
      var pts = {}, tot = 0, i, j, l, p, sum, v;
      for (j = 0; j < PARTIES.length; j++) { pts[PARTIES[j]] = 0; }
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        sum = 0;
        for (j = 0; j < PARTIES.length; j++) { sum += Q['lean_' + l + '_' + PARTIES[j]] || 0; }
        if (sum <= 0) { continue; }
        var w = this.SEAT_W[l] * (1 + this.ORG_SEAT_BONUS * (Q['org_' + l] || 0));
        for (j = 0; j < PARTIES.length; j++) {
          p = PARTIES[j];
          //  自民党だけは組織基盤で効率が変わる（kibanOf）。
          //  政権を取って族議員・農協・特定局長会を外した分だけ、
          //  同じ票が議席に変わりにくくなる。
          var eff = this.PARTY_EFF[p] || 1;
          if (p === 'jimin') { eff *= this.kibanOf(Q); }
          pts[p] += Q['pop_' + l] * w * ((Q['lean_' + l + '_' + p] || 0) / sum) * eff;
        }
      }
      for (j = 0; j < PARTIES.length; j++) { tot += pts[PARTIES[j]]; }
      //  制度で足切りと傾きが変わる。中選挙区（既定）は従来と同じ値。
      var sd = this.seidoOf(Q);
      var adj = {}, t2 = 0;
      for (j = 0; j < PARTIES.length; j++) {
        p = PARTIES[j];
        adj[p] = Math.max(0, pts[p] / tot * 100 - sd.thr);
        //  k>1 は小選挙区の増幅、k<1 は比例の平坦化。
        if (adj[p] > 0 && sd.k !== 1) { adj[p] = Math.pow(adj[p], sd.k); }
        t2 += adj[p];
      }
      //  党ごとに別々に丸めると、合計が定数にならない
      //  （実測で 466/467、485/486、510/511 の行が出た）。
      //  議席図を出すようになってからは目に見えるので、
      //  最大剰余法で必ず定数に合わせる。
      var out = {}, frac = [], used = 0, want = Q.hr_total;
      for (j = 0; j < PARTIES.length; j++) {
        p = PARTIES[j];
        var exact = t2 > 0 ? adj[p] / t2 * want : 0;
        out[p] = Math.floor(exact);
        used += out[p];
        frac.push({ p: p, f: exact - out[p] });
      }
      frac.sort(function (a, b) { return b.f - a.f; });
      for (j = 0; used < want && j < frac.length * 4; j++) {
        out[frac[j % frac.length].p] += 1;
        used += 1;
      }
      return { share: share, seats: out };
    },

    //  議席の配分 → 代議員票の配分。
    //  議員は選挙区で勝つために中道へ寄り、代議員は労組と地方組織から
    //  来るので左へ寄る。DELEGATE_SHIFT はその差の幅であり、
    //  そのままゲームの難易度になる。
    //   0    = 議員団の意思がそのまま党大会の結論になる（党内対立が消える）
    //   14.4 = 開幕値。右へ動くには route >= 0 が要る
    //   26   = 党大会が完全に労組のもの。路線変更は事実上不可能
    DELEGATE_SHIFT: 14.4,

    // 議席配分から代議員配分を作る。root の初期値もこれで出す
    delegatesFromSeats: function (Q) {
      var tot = Q.seat_uha + Q.seat_chuu + Q.seat_chusa + Q.seat_muha;
      if (tot <= 0) { return Q; }
      var sh = {
        uha: Q.seat_uha / tot * 100, chuu: Q.seat_chuu / tot * 100,
        chusa: Q.seat_chusa / tot * 100, muha: Q.seat_muha / tot * 100
      };
      var k = this.DELEGATE_SHIFT;
      // 右から取り上げ、左と無派閥へ回す。比率は開幕値で校正
      var d = {
        uha: sh.uha - k * 0.562, chuu: sh.chuu - k * 0.438,
        chusa: sh.chusa + k * 0.722, muha: sh.muha + k * 0.278
      };
      var f;
      for (f in d) { if (d[f] < 0) { d[f] = 0; } }
      var sum = d.uha + d.chuu + d.chusa + d.muha;
      Q.del_uha = Math.round(d.uha / sum * 1000);
      Q.del_chuu = Math.round(d.chuu / sum * 1000);
      Q.del_chusa = Math.round(d.chusa / sum * 1000);
      Q.del_muha = Math.round(d.muha / sum * 1000);
      return Q;
    },

    //  総選挙のたびに大会は千人で開き直す。事象が代議員を積み上げ続けるので、
    //  放っておくと合計が千を大きく越え（実測 1883）、「計千」の表示が嘘になり、
    //  事象一件ぶんの重みも局が進むほど薄まっていた。比率は保つ。
    normDelegates: function (Q) {
      var ks = ['uha', 'chuu', 'chusa', 'muha', 'saha', 'kyosan', 'hoshu', 'jiyu'], i, s = 0;
      for (i = 0; i < ks.length; i++) { s += Q['del_' + ks[i]] || 0; }
      if (s <= 0) { return Q; }
      for (i = 0; i < ks.length; i++) {
        if (Q['del_' + ks[i]] !== undefined) { Q['del_' + ks[i]] = Math.round((Q['del_' + ks[i]] || 0) / s * 1000); }
      }
      return Q;
    },

    // ── 代議員票。協会が動かせる分を切り出す ──────────────────
    delegates: function (Q) {
      var ky = Math.round(Q.del_chusa * Q.kyokai_grip / 100);
      var ex = (Q.del_kyosan || 0) + (Q.del_hoshu || 0) + (Q.del_jiyu || 0);
      return {
        uha: Q.del_uha, chuu: Q.del_chuu, chusa: Q.del_chusa - ky,
        kyokai: ky, muha: Q.del_muha,
        kyosan: Q.del_kyosan || 0, hoshu: Q.del_hoshu || 0, jiyu: Q.del_jiyu || 0,
        total: Q.del_uha + Q.del_chuu + Q.del_chusa + Q.del_muha + ex
      };
    },

    // ══════════════════════════════════════════════════════════
    //  労働四団体
    //
    //  総評だけを rel_sohyo という一つの数で持っていた。それでは
    //  「右へ寄れば同盟が近づき、総評が離れる」という交換が盤面に出ない。
    //  四つの団体を、組合員数と党との距離でそれぞれ持つ。
    //
    //  肝心なのは大きさの差である。総評は同盟のおよそ二倍あり、
    //  官公労を握っている。だから右へ寄る取引は、
    //  失うほうが得るほうより大きい。左へ寄る取引はその逆にならない
    //  ── 同盟はもともと党の外にあるからである。
    //  右の線が左の線より苦しいのは、この非対称から出る。
    // ══════════════════════════════════════════════════════════
    UNIONS: {
      sohyo:    { name: '总评',     rel: 'rel_sohyo',    lean: -2.2, kokorou: 0.62, minrou: 0.30 },
      domei:    { name: '同盟',     rel: 'rel_domei',    lean:  2.6, kokorou: 0.10, minrou: 0.78 },
      churitsu: { name: '中立劳连', rel: 'rel_churitsu', lean:  0.2, kokorou: 0.05, minrou: 0.72 },
      shinsan:  { name: '新产别',   rel: 'rel_shinsan',  lean: -1.2, kokorou: 0.02, minrou: 0.66 },
      //  一九八九年、総評と同盟が解散して連合になる。八百万人。
      //  社会党と民社党の両方を推すので、党にとっては
      //  支持基盤ではなく交渉相手になる。lean は中央寄り。
      //  連合は社会党と民社党の両方を推す。党のものではないので、
      //  大きさのわりに党の組織にはならない。
      rengo:    { name: '连合',     rel: 'rel_rengo',    lean:  0.6, kokorou: 0.28, minrou: 0.62,
                  share: 0.55 },
      //  全労協は社会党左派の受け皿、全労連は共産党系。
      //  大きさは解散前の左右比から出る（unionReorg）。
      zenrokyo: { name: '全劳协',   rel: 'rel_zenrokyo', lean: -3.0, kokorou: 0.55, minrou: 0.35 },
      //  全労連は共産党系である。路線が近くても、共産党との距離が遠ければ
      //  党の資源にはならない。left の線が全労協を厚くする意味は、ここにある。
      zenroren: { name: '全劳连',   rel: 'rel_zenroren', lean: -3.4, kokorou: 0.50, minrou: 0.34,
                  via: 'rel_kyosan', share: 0.30 },
      //  片方だけ左のときは総評が残る。統一労組懇が抜けたぶん小さい。
      sohyo_after: { name: '总评（存续）', rel: 'rel_sohyo_after', lean: -2.0,
                     kokorou: 0.60, minrou: 0.32 }
    },
    //  組合員数（万人）。史実のおおよその推移を折れ線で持つ。
    //  末尾の 0 は解散（同盟・中立労連は1987、総評は1989、新産別は1988）。
    UNION_SIZE: {
      sohyo:    [[1955, 300], [1960, 370], [1970, 420], [1975, 455], [1985, 425], [1989, 0]],
      domei:    [[1955,  50], [1964, 140], [1970, 180], [1975, 220], [1985, 210], [1987, 0]],
      churitsu: [[1956,  40], [1965, 100], [1975, 135], [1985, 140], [1987, 0]],
      shinsan:  [[1955,   8], [1970,  10], [1985,   6], [1988, 0]],
      rengo:    [[1988,   0], [1989, 780], [1993, 800]]
    },
    //  再編後の三団体は unionReorg が決めた大きさを使う
    REORG_KEYS: { rengo: 'u_rengo', zenrokyo: 'u_zenrokyo', zenroren: 'u_zenroren',
                  sohyo_after: 'u_sohyo_after' },
    UNION_DRIFT: 0.10,   // 距離に応じて関係が動く速さ

    //  ══════════════════════════════════════════════════════
    //  労働戦線統一の帰結
    //
    //  一九八七年に同盟と中立労連が、一九八九年に総評が解散して
    //  連合ができる。だがそれで全部が一つになったわけではない。
    //  総評の左の部分は、共産系が全労連へ、社会党左派が全労協へ抜けた。
    //
    //  どこへどれだけ流れるかは、解散の前に決まっている。
    //  総評の中の左右の比、協会がどれだけ握っているか、
    //  中立労連と新産別がどちらへ傾いているか。
    //  そのすべてが、幕Ⅲ・Ⅳでの党の打ち方の結果である。
    //  左の線にとっては、これが最後に争うものになる。
    //  ══════════════════════════════════════════════════════
    //  各団体の「左の比率」の出発点（%）
    LR_START: { sohyo: 34, domei: 4, churitsu: 18, shinsan: 46 },
    LR_DRIFT: 0.06,
    //  史実の着地（万人）── 連合800 / 全労連140 / 全労協50
    REORG_YEAR: 1989,
    SPLIT_RATE: 0.70,    // 左に数えた分のうち、実際に連合から抜ける割合
    //  全労協が労戦を統一できる条件。総評の左が厚く、同盟の右が痩せていること。
    //  史実の値（総評の左 145万・同盟 210万）では届かない。
    //  幕Ⅲ・Ⅳで協会を握りオルグを積んで、初めて手が届く。
    REORG_LEFT_NEED: 170,
    REORG_DOMEI_MAX: 140,
    //  総評の中には、統一を右へ引く塊と、共産党へ引く塊がある。
    //  この二つを線の下まで落とさなければ、左で統一しても割れる。
    //   鉄鋼労連系  ── 早くから労戦統一を唱えた側。全電通・電機も近い。
    //   統一労組懇  ── 共産党系。のちに全労連の核になる。
    //  どちらも幕Ⅲ・Ⅳで押し下げておかなければならない。
    TEKKO_START: 62,      // 鉄鋼労連系右派（万人）
    ROSOKON_START: 44,    // 統一労組懇（万人）
    REORG_TEKKO_MAX: 34,
    REORG_ROSOKON_MAX: 26,
    //  二〇二六年九月（N2）に 0.0016 → 0.0011。金が余りすぎていた（下の維持費の注記）。
    DUES_RATE: 0.0011,   // 動員力 1 につき一手あたりの分担金
    //  党費。まず党員の関数である ── 地道に組織を作った党が後半に
    //  金を持っているのは筋が通る。ただし線形にすると、党員を倍にした
    //  だけで収入も倍になり、組織化が唯一の答えになってしまう。
    //  指数 0.6 で、四倍にして 2.3 倍。実際に届く幅は五万〜十五万人で、
    //  そのあいだ一手あたり 0.30 → 0.58 になる。
    MEMBER_DUES_BASE: 50000,
    MEMBER_DUES_K: 0.30,
    MEMBER_DUES_EXP: 0.6,
    //  都市の個人後援会から入る金の上限（一手あたり）。unionDues の urban。
    URBAN_DUES_MAX: 1.6,
    memberDues: function (Q) {
      var m = Math.max(0, Q.members || 0);
      if (m <= 0) { return 0; }
      return this.MEMBER_DUES_K * Math.pow(m / this.MEMBER_DUES_BASE, this.MEMBER_DUES_EXP);
    },

    //  各団体の中の左右の比を動かす。
    //  路線が左にあるほど、協会が強いほど、オルグを積むほど左が厚くなる。
    //  同盟だけは動きにくい ── 企業別で経営との協調が前提の組合だからである。
    unionLR: function (Q) {
      var k, u, cur, target, stiff;
      for (k in this.UNIONS) {
        if (!this.UNIONS.hasOwnProperty(k)) { continue; }
        if (k === 'rengo' || k === 'zenrokyo' || k === 'zenroren') { continue; }
        u = this.UNIONS[k];
        cur = (Q['lr_' + k] === undefined) ? this.LR_START[k] : Q['lr_' + k];
        //  路線 −5〜+5 が ±22、協会の掌握が ±14、積み上げが最大 +16
        target = this.LR_START[k] - (Q.route || 0) * 4.4
               + (((Q.kyokai_grip === undefined) ? 50 : Q.kyokai_grip) - 50) * 0.28
               + Math.min(16, (Q.left_unity_pts || 0) * 0.5);
        if (target < 0) { target = 0; }
        if (target > 92) { target = 92; }
        stiff = (k === 'domei') ? 0.3 : 1;
        Q['lr_' + k] = Math.round((cur + (target - cur) * this.LR_DRIFT * stiff) * 10) / 10;
      }
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  春闘の形
    //
    //  一九五九年に春闘共闘委員会をどう組むかで、
    //  その後の春闘が誰を動員できるかが決まる。
    //  官公労を軸にすれば数は出るが、民間は離れていく。
    //  民間の産別を軸にすれば額は取れるが、政治には使えない。
    //  ここで選んだ形が、以後の春闘カードの効きを決める。
    // ══════════════════════════════════════════════════════════
    SHUNTO_FORMS: {
      seiji:   { name: '跟政治斗争合成一体',   kokorou: 1.30, minrou: 0.62, mishoshiki: 0.70, pol: 1.35 },
      chingin: { name: '只谈工资',         kokorou: 0.78, minrou: 1.32, mishoshiki: 0.72, pol: 0.55 },
      jishu:   { name: '各产业工会自主',     kokorou: 1.00, minrou: 1.00, mishoshiki: 0.90, pol: 0.90 },
      chiiki:  { name: '地区共斗',         kokorou: 0.92, minrou: 0.80, mishoshiki: 1.55, pol: 1.05 }
    },

    //  春闘が動員できる規模。四団体の力に、選んだ形の重みを掛ける。
    //  春闘カードの効きと、そこから入る金は、この値で決まる。
    shuntoPower: function (Q) {
      var f = this.SHUNTO_FORMS[Q.shunto_form || 'jishu'];
      var p = this.unionPower(Q);
      var v = p.kokorou * f.kokorou + p.minrou * f.minrou;
      //  未組織へ広げた形は、組織の外からも人を呼べる
      v += (Q.union_power || p.total) * 0.06 * (f.mishoshiki - 0.9);
      Q.shunto_power = Math.round(v);
      Q.shunto_pol = f.pol;
      return Q.shunto_power;
    },

    // ── 闘争力 ─────────────────────────────────────────────
    //  労働戦線が一つの闘争に持ち出せる力。0〜100。
    //  動員できる人数だけでは決まらない。中に右の塊（鉄鋼系）と
    //  共産系（統一労組懇）を抱えていれば、同じ人数でも一つの要求で揃わない。
    //  そこに党の議席と路線と、協会が末端まで握っているかが乗る。
    //  乗るのであって足されるのではない ── 組合が動かなければ党だけでは何もできない。
    LABOR_LAYER: {
      kokorou: { pow: 'union_kokorou', norm: 280 },  //  官公労の闘争（スト権スト・国鉄・臨調）
      minrou:  { pow: 'union_minrou',  norm: 300 },  //  民間の闘争（春闘の額）
      all:     { pow: 'union_power',   norm: 520 }
    },

    laborForce: function (Q, layer) {
      var L = this.LABOR_LAYER[layer] || this.LABOR_LAYER.all;
      var base = Math.min(115, (Q[L.pow] || 0) / L.norm * 100);
      //  中の割れ。鉄鋼系は争議に乗らず、統一労組懇は別の旗で出る。
      var tekko = (Q.u_tekko === undefined) ? this.TEKKO_START : Q.u_tekko;
      var rosokon = (Q.u_rosokon === undefined) ? this.ROSOKON_START : Q.u_rosokon;
      var lr = (Q.lr_sohyo === undefined) ? this.LR_START.sohyo : Q.lr_sohyo;
      var unity = 1 + (lr - 34) * 0.006 - (tekko - 34) * 0.005 - (rosokon - 26) * 0.004;
      unity = Math.max(0.45, Math.min(1.40, unity));
      //  党が後ろに付いているか。議席と路線と、協会が職場まで握っているか。
      var support = 1.00
        + Math.max(0, Math.min(0.30, ((Q.seats_hr || 0) - 60) / 400))
        + Math.max(0, -(Q.route || 0)) * 0.035
        + ((Q.kyokai_grip === undefined ? 50 : Q.kyokai_grip) - 50) * 0.0035;
      var v = Math.round(Math.max(0, Math.min(100, base * unity * support)));
      Q['force_' + layer] = v;
      return v;
    },

    //  中間右（江田）の線の力。組合ではなく、
    //  都市の支持と社公民の枠が土台になる。
    //  ここが厚ければ組合を切っても回り、薄ければ切っただけで終わる。
    urbanForce: function (Q) {
      var sc = Math.min(1, (Q.lean_shinchukan_shakai || 0) / 30);
      var ms = Math.min(1, (Q.lean_mishoshiki_shakai || 0) / 28);
      var frame = Math.min(1, ((Q.rel_komei || 0) + (Q.rel_minsha || 0)) / 140);
      var mem = Math.min(1, (Q.members || 0) / 90000);
      var v = Math.round(sc * 34 + ms * 24 + frame * 28 + mem * 14);
      Q.force_urban = v;
      return v;
    },

    //  国会で法案を止める力。議席だけでは足りない。
    //  他の野党を巻き込めるか、自民の中に話の通じる相手がいるかで決まる。
    dietForce: function (Q) {
      var base = Math.min(100, (Q.seats_hr || 0) / 234 * 100);
      var allies = Math.max(0, Q.rel_komei || 0) * 0.10
                 + Math.max(0, Q.rel_minsha || 0) * 0.10
                 + Math.max(0, Q.rel_kyosan || 0) * 0.06;
      var crack = Math.max(0, Q.rel_jimin || 0) * 0.05;
      var v = base * 0.62 + Math.min(26, allies) + Math.min(6, crack)
            + Math.min(8, (Q.capital || 0) * 0.4) + Math.min(6, (Q.del_muha || 0) * 0.06);
      v = Math.round(Math.max(0, Math.min(100, v)));
      Q.force_diet = v;
      return v;
    },

    //  行革・民営化を止める力。国会と職場の両方が要る。
    //  片方がゼロなら止まらない ── 史実はそれを示している。
    //  国鉄は職場で八日間止めたが国会で止められず、
    //  国会の野党は職場を持っていなかった。
    reformResist: function (Q) {
      var l = this.laborForce(Q, 'kokorou');
      var d = this.dietForce(Q);
      var v = Math.round(Math.sqrt(Math.max(0, l) * Math.max(0, d)));
      Q.force_reform = v;
      return v;
    },

    //  闘争の帰結。要る力は闘争ごとに違う。
    //  3 = 勝つ / 2 = 部分的に取る / 1 = 史実どおり負ける / 0 = 崩れる
    tierOf: function (v, need) {
      if (v >= need + 16) { return 3; }
      if (v >= need) { return 2; }
      if (v >= need - 18) { return 1; }
      return 0;
    },
    laborTier: function (Q, layer, need) { return this.tierOf(this.laborForce(Q, layer), need); },
    reformTier: function (Q, need) { return this.tierOf(this.reformResist(Q), need); },

    // ── 闘争の帰結を盤面に落とす ────────────────────────────
    //  段位ごとの効果を一箇所にまとめておく。事象の側は段位を出すだけでよい。

    //  スト権スト（一九七五年）。勝てば公労法が動く。
    //  勝った場合、官公労は争議権を持ったまま八十年代に入る ──
    //  臨調も国鉄も、そこから先はまるで別の戦いになる。
    sutokenApply: function (Q, t) {
      Q.sutoken_r = t;
      if (t >= 3) {
        Q.sutoken_won = 1;
        this.push(Q, ['kokorou'], 10); this.push(Q, ['minrou'], 4);
        //  掌握度は 0 まで落ちる値なので || で 50 に読み替えない。
        //  協会を潰し切った盤でスト権を取ると、掌握が 10 ではなく 60 に跳ねていた。
        Q.rel_sohyo += 18;
        Q.kyokai_grip = Math.min(100, ((Q.kyokai_grip === undefined) ? 50 : Q.kyokai_grip) + 10);
        Q.lr_sohyo = Math.min(100, (Q.lr_sohyo === undefined ? 34 : Q.lr_sohyo) + 8);
        Q.members += 6000; this.push(Q, ['shinchukan'], -4);
      } else if (t === 2) {
        Q.sutoken_partial = 1;
        this.push(Q, ['kokorou'], 6); Q.rel_sohyo += 10;
        Q.lr_sohyo = Math.min(100, (Q.lr_sohyo === undefined ? 34 : Q.lr_sohyo) + 3);
        Q.members += 2000; this.push(Q, ['shinchukan'], -6); this.push(Q, ['jieigyo'], -4);
      } else if (t === 1) {
        this.push(Q, ['kokorou'], 4); Q.rel_sohyo += 8;
        this.push(Q, ['shinchukan'], -10); this.push(Q, ['jieigyo'], -8); this.push(Q, ['noson'], -4);
        Q.budget -= 2;
      } else {
        this.push(Q, ['kokorou'], -4); Q.rel_sohyo -= 6;
        this.push(Q, ['shinchukan'], -12); this.push(Q, ['jieigyo'], -9); this.push(Q, ['noson'], -5);
        Q.u_rosokon = (Q.u_rosokon === undefined ? this.ROSOKON_START : Q.u_rosokon) + 5;
        Q.budget -= 3; Q.mood_saha += 10;
      }
      return Q;
    },

    //  臨調（一九八一年）。骨抜きにできれば、国鉄も年金も別の話になる。
    rinchoApply: function (Q, t) {
      Q.rincho_r = t;
      if (t >= 3) {
        Q.rincho_blunted = 2;
        this.push(Q, ['kokorou'], 8); this.push(Q, ['mishoshiki'], 5);
        Q.rel_sohyo += 14; Q.capital += 3; this.push(Q, ['shinchukan'], -3);
      } else if (t === 2) {
        Q.rincho_blunted = 1;
        this.push(Q, ['kokorou'], 5); Q.rel_sohyo += 8; this.push(Q, ['mishoshiki'], 3);
      } else if (t === 1) {
        this.push(Q, ['kokorou'], 2); Q.rel_sohyo += 4;
        this.push(Q, ['shinchukan'], -4); Q.budget -= 1;
      } else {
        this.push(Q, ['kokorou'], -5); Q.rel_sohyo -= 8;
        this.push(Q, ['shinchukan'], -5); Q.budget -= 2; Q.mood_saha += 8;
      }
      return Q;
    },

    //  国鉄でどの道まで行けるか。スト権を取っていれば一段上がり、
    //  臨調を骨抜きにしていればもう一段上がる。
    kokutetsuReach: function (Q) {
      var v = this.reformResist(Q)
            + (Q.sutoken_won ? 10 : (Q.sutoken_partial ? 4 : 0))
            + (Q.rincho_blunted || 0) * 5
            + Math.min(12, Q.gyokaku_junbi || 0)
            + Math.min(this.FIGHT_BOOST_CAP, Q.fight_boost || 0);
      Q.fight_boost = 0;
      Q.force_last = Math.round(Math.min(100, v));
      return Q.force_last;
    },

    // ── 国鉄 ───────────────────────────────────────────────
    //  国鉄をどうするかは四通りある。難しい順に、改革しない、
    //  全国一社で民営化する、上下を分離して分割する、分割して民営化する。
    //  どれになるかで国労が何人残るかが決まり、
    //  国労が何人残るかで八九年の労戦統一が決まる。
    //   scale …… 官公労の動員力に残る倍率
    //   lr    …… 総評の中の左の比への増減
    //   rosokon … 統一労組懇への増減（国労が割れれば共産系が伸びる）
    //   debt  …… 毎手の国庫負担。改革しなければ払い続ける
    KOKUTETSU: {
      nochange: { name: '不改革',        scale: 1.00, lr:  7, rosokon: -6, debt: 3,
                  kokorou:  6, shinchukan: -9, jieigyo: -7, noson: -3 },
      minei:    { name: '并成一家公司民营化', scale: 0.90, lr:  2, rosokon: -2, debt: 1,
                  kokorou:  2, shinchukan: -2, jieigyo: -1, noson:  0 },
      jouge:    { name: '上下分离式拆分',   scale: 0.82, lr:  0, rosokon:  2, debt: 1,
                  kokorou:  0, shinchukan:  3, jieigyo:  2, noson:  2 },
      bunkatsu: { name: '拆分民营化',      scale: 0.52, lr: -9, rosokon:  8, debt: 0,
                  kokorou: -9, shinchukan:  6, jieigyo:  5, noson:  3 }
    },

    kokutetsuApply: function (Q, kind) {
      var k = this.KOKUTETSU[kind];
      if (!k || Q.kokutetsu_kind) { return Q; }
      Q.kokutetsu_kind = kind;
      //  表示用の数。難しい順に 3..0
      Q.kokutetsu_n = { nochange: 3, minei: 2, jouge: 1, bunkatsu: 0 }[kind];
      Q.kokutetsu_scale = k.scale;
      Q.kokutetsu_debt = k.debt;
      Q.lr_sohyo = Math.max(0, Math.min(100,
        (Q.lr_sohyo === undefined ? this.LR_START.sohyo : Q.lr_sohyo) + k.lr));
      Q.u_rosokon = Math.max(3, (Q.u_rosokon === undefined ? this.ROSOKON_START : Q.u_rosokon) + k.rosokon);
      this.push(Q, ['kokorou'], k.kokorou);
      this.push(Q, ['shinchukan'], k.shinchukan);
      this.push(Q, ['jieigyo'], k.jieigyo);
      this.push(Q, ['noson'], k.noson);
      return Q;
    },

    //  改革しなければ、赤字は毎手ぶんだけ国庫から出続ける。
    //  国庫から出るということは、党が守った雇用の値札が
    //  毎年ニュースに出るということでもある。
    //  赤字の一部は党が分担する。その分は維持費に入れて払う
    //  （upkeep の KOKUTETSU_PARTY_SHARE）。以前はここで党費から
    //  赤字の額をそのまま引いていたので、未払いの判定のあとで資金が負のまま次の手へ残った。
    //  turn_n は tickYear が毎手一つ進める（以前は誰も進めず、四手に一度のはずが毎手だった）。
    kokutetsuUpkeep: function (Q) {
      var d = Q.kokutetsu_debt || 0;
      if (!d) { return Q; }
      if ((Q.turn_n || 0) % 4 === 0) { this.push(Q, ['shinchukan', 'jieigyo'], -1); }
      return Q;
    },

    //  金と政治資源を積んで、その一戦だけ底上げする。
    //  オルグを雇い、宣伝を打ち、他党を口説く。積んだぶんは他の手に回らない。
    //  改革もせず組織も広げなければ、ここに積む金が無い。
    //  積める上限は 15。金はあと一歩ぶんの差しか買えない。
    //  一歩で足りるところまで来ているかどうかは、十年の積み上げが決める。
    FIGHT_BOOST_CAP: 15,
    laborBoost: function (Q, budget, capital) {
      Q.budget -= budget; Q.capital -= capital;
      Q.fight_boost = Math.min(this.FIGHT_BOOST_CAP,
        (Q.fight_boost || 0) + budget * 1.1 + capital * 1.4);
      return Q.fight_boost;
    },

    //  積んだ底上げを乗せた帰結。読んだら消える。
    boostedTier: function (Q, kind, layer, need) {
      var v = (kind === 'reform') ? this.reformResist(Q) : this.laborForce(Q, layer);
      v = Math.min(100, v + (Q.fight_boost || 0));
      Q.fight_boost = 0;
      Q.force_last = Math.round(v);
      return this.tierOf(v, need);
    },

    //  春闘カードの効き。一九五九年に選んだ形と、そのとき動かせる四団体の
    //  大きさで決まる。動員が薄ければカードは薄くしか効かない。
    shuntoScale: function (Q) {
      var p = Q.shunto_power;
      if (p === undefined) { p = this.shuntoPower(Q); }
      return Math.max(0.45, Math.min(1.55, 0.40 + p / 420));
    },

    //  春闘から党に入るもの。政治性の高い形ほど票と気分に効き、
    //  賃金一本の形ほど金とカンパに効く。
    shuntoYield: function (Q) {
      var s = this.shuntoScale(Q);
      var pol = (Q.shunto_pol === undefined) ? 0.9 : Q.shunto_pol;
      return { scale: s, pol: s * pol, money: s * (1.9 - pol) };
    },

    //  総評の中の二つの塊を動かす。
    //   鉄鋼系は、官公労を組織するほど、協会が強いほど、党が左にいるほど痩せる。
    //   統一労組懇は、共産党と遠いほど、協会が強いほど痩せる。
    //  どちらも一手では動かない。幕をまたいで押し続けるしかない。
    unionBlocs: function (Q) {
      var pts = Q.left_unity_pts || 0;
      var grip = (Q.kyokai_grip === undefined) ? 50 : Q.kyokai_grip;
      var r = Q.route || 0;
      var tT = this.TEKKO_START + r * 5.2 - (grip - 50) * 0.22 - Math.min(24, pts * 0.6);
      //  0 は「共産党と完全に切れている」という意味の値なので、|| で 40 に
      //  読み替えてはいけない。切ったのに切った得が出ない不具合だった。
      var rk = (Q.rel_kyosan === undefined) ? 40 : Q.rel_kyosan;
      //  統一労組懇は共産党系である。遠ざければ痩せる ── ここまでは前と同じ。
      //  ただし以前は右肩上がりで、共産党と組むほど太る一方だった。
      //  それだと社共共闘の線に乗ったまま左で労戦を統一する道が、数の上で
      //  存在しない（監査で rT が 36 を下回らず、門の 26 に永久に届かない）。
      //  深く組めば別の旗で出る理由のほうが無くなるので、共闘可能の線（五十）を
      //  頂点にした山にする。切るか、抱き込むか、どちらでも痩せる。
      var rkT = rk <= 50 ? (rk - 40) * 0.30 : 3 - (rk - 50) * 0.40;
      var rT = this.ROSOKON_START + rkT - (grip - 50) * 0.16
             - Math.min(12, pts * 0.25);
      if (tT < 4) { tT = 4; }
      if (rT < 3) { rT = 3; }
      var tc = (Q.u_tekko === undefined) ? this.TEKKO_START : Q.u_tekko;
      var rc = (Q.u_rosokon === undefined) ? this.ROSOKON_START : Q.u_rosokon;
      Q.u_tekko   = Math.round((tc + (tT - tc) * 0.05) * 10) / 10;
      Q.u_rosokon = Math.round((rc + (rT - rc) * 0.05) * 10) / 10;
      return Q;
    },

    //  一九八九年の再編がいま何になるか。四つの門と総評の二役で決まる。
    //  unionReorg はここを読むだけにして、判定を一箇所に集める。
    //  盤面（reorgBlock）も同じところから引くので、表示と結果がずれない。
    REORG_KIND_NAME: {
      zenrokyo_unify: '全劳协统一劳动战线',
      rename: '总评只是改名叫全劳协 ── 连合并不会变大',
      right_unify: '在右边统一 ── 官公劳整个搬去全劳协',
      sohyo_survive: '总评留下，统一劳组恳带走左边的一半',
      history: '史实的线 ── 四团体并进连合，全劳连与全劳协裂出去'
    },

    reorgOutlook: function (Q) {
      var sohyo = this.unionSize('sohyo', 1985);
      var domei = this.unionSize('domei', 1985);
      var lrS = (Q.lr_sohyo === undefined ? this.LR_START.sohyo : Q.lr_sohyo) / 100;
      var pts = Q.left_unity_pts || 0;
      var o = {
        sohyoLeft: sohyo * lrS,
        domeiHard: domei * (1 - Math.min(0.6, pts * 0.012)),
        tekko: (Q.u_tekko === undefined) ? this.TEKKO_START : Q.u_tekko,
        rosokon: (Q.u_rosokon === undefined) ? this.ROSOKON_START : Q.u_rosokon,
        chair: Q.sohyo_chair || 'chusa',
        secgen: Q.sohyo_secgen || 'chuu'
      };
      o.lefts  = (o.chair === 'saha' ? 1 : 0) + (o.secgen === 'saha' ? 1 : 0);
      o.rights = (o.chair === 'uha' ? 1 : 0) + (o.secgen === 'uha' ? 1 : 0);
      o.g_left    = o.sohyoLeft >= this.REORG_LEFT_NEED;
      o.g_domei   = o.domeiHard <= this.REORG_DOMEI_MAX;
      o.g_tekko   = o.tekko <= this.REORG_TEKKO_MAX;
      o.g_rosokon = o.rosokon <= this.REORG_ROSOKON_MAX;
      o.canLeft = o.g_left && o.g_domei && o.g_tekko && o.g_rosokon;
      o.gates = (o.g_left ? 1 : 0) + (o.g_domei ? 1 : 0)
              + (o.g_tekko ? 1 : 0) + (o.g_rosokon ? 1 : 0);
      o.kind = (o.lefts === 2 && o.canLeft) ? 'zenrokyo_unify'
             : (o.lefts === 2 ? 'rename'
             : (o.rights === 2 ? 'right_unify'
             : (o.lefts === 1 ? 'sohyo_survive' : 'history')));
      return o;
    },

    //  再編の形。決まっていればそれを、まだなら見込みを返す。
    //  一九八九年の事象は endturn（unionReorg）より先に立つので、
    //  事象の門と文面はこちらを読む。決まったあとは動かない。
    reorgKind: function (Q) {
      return Q.reorg_kind || this.reorgOutlook(Q).kind;
    },

    //  四つの門の進み具合。総評が解散するまで毎手見えている。
    reorgBlock: function (Q) {
      if (Q.reorg_done) {
        return '<b>' + (this.REORG_KIND_NAME[Q.reorg_kind] || '') + '</b>'
          + '　<span style="opacity:.6">一九八九年已经定了。</span>';
      }
      var o = this.reorgOutlook(Q);
      var FAC = { saha: '左派', chusa: '中间左派', chuu: '中间右派', uha: '右派' };
      //  四つの門は四つの欄の格子にする（N7。前は一つの門が脇柱の幅で二行に折れていた）。
      //  欄は 印・門・いまの人数・条件。人数の単位（万人）は見出しに一度だけ書く。
      var g = function (ok, label, now, need) {
        return '<span>' + (ok ? '<span style="color:#3E6E8C;">✓</span>'
                              : '<span style="color:#B23A34;">✗</span>') + '</span>'
          + '<span>' + label + '</span><span><b>' + (Math.round(now * 10) / 10) + '</b></span>'
          + '<span class="jsp-gd">' + need + '</span>';
      };
      //  二役は四つの門と並ぶ第五の条件である。印を付けずに並べていたので、
      //  門が四つとも通っているのに左で統一されない理由が読めなかった。
      return (o.lefts === 2 ? '<span style="color:#3E6E8C;">✓</span> '
                            : '<span style="color:#B23A34;">✗</span> ')
          + '总评的两个位子' + '　' + '议长' + ' <b>' + (FAC[o.chair] || o.chair) + '</b>　'
          + '事务局长' + ' <b>' + (FAC[o.secgen] || o.secgen) + '</b>'
          + ' <span style="opacity:.6">'
          + '要在左边统一，两个位子都得是左派。1983年的总评大会上定'
          + '</span>'
        + '<span class="jsp-grid jsp-rt">'
          + '<span class="jsp-gh jsp-g2">工会会员（万人）</span><span class="jsp-gh">现在</span><span class="jsp-gh">条件</span>'
          + g(o.g_left, '总评的左', o.sohyoLeft, this.REORG_LEFT_NEED + ' 以上')
          + g(o.g_domei, '同盟里硬的右', o.domeiHard, this.REORG_DOMEI_MAX + ' 以下')
          + g(o.g_tekko, '钢铁劳连一系的右派', o.tekko, this.REORG_TEKKO_MAX + ' 以下')
          + g(o.g_rosokon, '统一劳组恳', o.rosokon, this.REORG_ROSOKON_MAX + ' 以下')
        + '</span>'
        + '<span style="opacity:.6">照这样走到一九八九年 ──</span> <b>'
          + this.REORG_KIND_NAME[o.kind] + '</b>';
    },

    //  解散と再編。一度だけ走る。
    //  総評の左のうち、共産党に近い分が全労連へ、党に近い分が全労協へ抜ける。
    //  抜けなかった分と同盟・中立労連が連合になる。
    unionReorg: function (Q) {
      var J = this;
      if (Q.reorg_done) { return Q; }
      //  一九八九年より前でも、左で束ね切ったときだけ先に決着する。
      //  スト権ストに勝ち、総評の二役を左で押さえ、四つの門が開いている盤。
      //  reorg_force は太田薫の行動が立てる。
      if (this.yearOf(Q) < this.REORG_YEAR && !Q.reorg_force) { return Q; }
      Q.reorg_done = 1;
      //  解散の坂に入る前（1985年）の大きさで数える。
      //  1988年で採ると総評はもう 425→0 の途中で、四分の一しか残っていない。
      var sohyo = this.unionSize('sohyo', 1985);
      var domei = this.unionSize('domei', 1985);
      var chur  = this.unionSize('churitsu', 1985);
      var shin  = this.unionSize('shinsan', 1985);
      var lrS = (Q.lr_sohyo === undefined ? this.LR_START.sohyo : Q.lr_sohyo) / 100;
      var lrC = (Q.lr_churitsu === undefined ? this.LR_START.churitsu : Q.lr_churitsu) / 100;
      var lrN = (Q.lr_shinsan === undefined ? this.LR_START.shinsan : Q.lr_shinsan) / 100;
      var leftMass = sohyo * lrS + chur * lrC * 0.5 + shin * lrN;
      var split = leftMass * this.SPLIT_RATE;
      //  抜けた分が共産系（全労連）と社会党左派（全労協）にどう割れるか。
      //  党が共産党に近いほど、左の塊は全労連の側へ行く。
      var toKyosan = Math.min(0.8, Math.max(0.15, ((Q.rel_kyosan === undefined) ? 40 : Q.rel_kyosan) / 80));

      //  ── 誰が総評を率いていたかで、統一の形が変わる ──────────
      //  議長と事務局長。二人とも左なら左へ、二人とも右なら右へ、
      //  混ざれば史実どおり連合になる。総評の大会で決まっている。
      //  四つの門も含めて reorgOutlook が一箇所で持っている。
      //  盤面に出している値と、ここで読む値を同じにするため。
      var o = this.reorgOutlook(Q);
      var lefts = o.lefts, rights = o.rights, canLeft = o.canLeft;
      var sohyoLeft = o.sohyoLeft, tekko = o.tekko, rosokon = o.rosokon;
      Q.reorg_sohyo_left = Math.round(sohyoLeft);
      Q.reorg_domei_hard = Math.round(o.domeiHard);
      Q.reorg_tekko = Math.round(tekko);
      Q.reorg_rosokon = Math.round(rosokon);
      if (lefts === 2 && canLeft) {
        //  ① 全労協が労戦を統一する。総評も全労連も残らない。
        //     民社党はこの線には付いてこない ── 必ず出て行く。
        Q.reorg_kind = 'zenrokyo_unify';
        Q.u_zenrokyo = Math.round(sohyo + chur * 0.7 + shin + domei * 0.25 + 60);
        Q.u_zenroren = 0;
        Q.u_rengo    = 0;
        Q.minsha_exists = 1;
        Q.minsha_forced = 1;
      } else if (lefts === 2) {
        //  ② 二人とも左だが、力が足りない。総評が全労協に名を変えるだけ。
        //  総評は名前を変えるだけ。連合に入るのは総評の外の団体と、
        //  総評から出た鉄鋼系右派だけになる ── 大きくはならない。
        Q.reorg_kind = 'rename';
        Q.u_zenrokyo = Math.round(sohyo - tekko - rosokon);
        Q.u_zenroren = Math.round(rosokon + 40);
        Q.u_rengo    = Math.round(domei + tekko + chur + shin);
      } else if (rights === 2) {
        //  ③ 右へ完全に統一する。総評の官公労は付いていかず、
        //     まるごと全労協へ移る。残った右（鉄鋼労連の系統）と
        //     中立労連・新産別・同盟が連合になる。
        Q.reorg_kind = 'right_unify';
        var kanko = sohyo * 0.46;                 // 総評のうち官公労の比重
        Q.u_zenrokyo = Math.round(kanko);
        Q.u_zenroren = Math.round(split * toKyosan + 90);
        Q.u_rengo    = Math.round(sohyo - kanko + domei + chur + shin + 120 - Q.u_zenroren * 0.4);
      } else if (lefts === 1) {
        //  ④ 片方だけが左。総評は残る。だが統一労組懇は出て行き、
        //     左の半分を持っていく。
        Q.reorg_kind = 'sohyo_survive';
        Q.u_sohyo_after = Math.round(sohyo - leftMass * 0.5);
        Q.u_zenrokyo = Math.round(leftMass * 0.18);
        Q.u_zenroren = Math.round(leftMass * 0.5 + 60);
        Q.u_rengo    = Math.round(domei + chur + shin + 110);
      } else {
        //  ⑤ 史実の線。四団体が連合に合流し、全労連と全労協が分裂して出る。
        Q.reorg_kind = 'history';
        Q.u_zenroren = Math.round(split * toKyosan + 90);
        Q.u_zenrokyo = Math.round(split * (1 - toKyosan));
        Q.u_rengo    = Math.round(sohyo + domei + chur + shin + 120 - split);
      }
      if (Q.u_rengo < 0) { Q.u_rengo = 0; }
      Q.lr_sohyo_final = Math.round(lrS * 1000) / 10;
      //  新しい団体との関係は、その団体を作った古い団体との関係から引き継ぐ。
      //  連合は四団体の混合、全労協と総評存続は総評の後身。
      //  引き継がないと、左で統一した年に党の動員力が一度ゼロに落ちてしまう。
      //  ゼロから漂移で戻すには十年掛かる ── 第Ⅴ幕にその十年は無い。
      var lastRel = function (k) {
        var uu = J.UNIONS[k];
        return Math.max(0, Q[uu.rel] || Q[uu.rel + '_last'] || 0);
      };
      var rs = lastRel('sohyo');
      var rd = lastRel('domei');
      var rc = lastRel('churitsu');
      var rn = lastRel('shinsan');
      var w = domei + chur + shin;
      var rMix = w > 0 ? (rd * domei + rc * chur + rn * shin) / w : rd;
      //  連合の中で旧総評系が占める分だけ、総評との関係も混ざる
      var inRengo = Math.max(0, Math.min(1, (Q.u_rengo - w) / Math.max(1, Q.u_rengo)));
      Q.rel_rengo = Math.round((rMix * (1 - inRengo) + rs * inRengo) * 10) / 10;
      Q.rel_zenrokyo = Math.round(rs * 10) / 10;
      Q.rel_sohyo_after = Math.round(rs * 10) / 10;
      return Q;
    },

    unionSize: function (key, year, Q) {
      //  再編後の三団体は、解散前の左右比から出した大きさを使う
      var rk = this.REORG_KEYS[key];
      if (rk) {
        if (!Q || !Q.reorg_done) { return 0; }
        return Q[rk] || 0;
      }
      var t = this.UNION_SIZE[key], i;
      if (!t) { return 0; }
      if (year <= t[0][0]) { return t[0][1]; }
      for (i = 1; i < t.length; i++) {
        if (year <= t[i][0]) {
          var a = t[i - 1], b = t[i];
          return a[1] + (b[1] - a[1]) * (year - a[0]) / (b[0] - a[0]);
        }
      }
      return t[t.length - 1][1];
    },

    //  一手ぶん、四団体との距離を路線に合わせて動かす。
    //  近い団体は寄ってきて、遠い団体は離れる。
    unionDrift: function (Q) {
      var y = this.yearOf(Q), k, u, size, target, cur;
      for (k in this.UNIONS) {
        if (!this.UNIONS.hasOwnProperty(k)) { continue; }
        u = this.UNIONS[k];
        size = this.unionSize(k, y, Q);
        //  団体が消えるとき、消える直前の関係を控えておく。
        //  同盟は一九八七年に、中立労連も新産別も一九八八年に表から消える。
        //  控えを取らないと、八九年の再編がそれまでの関係を読めない。
        if (size <= 0) {
          if ((Q[u.rel] || 0) > 0) { Q[u.rel + '_last'] = Q[u.rel]; }
          Q[u.rel] = 0;
          continue;
        }
        //  路線との隔たりが 0 なら 100、隔たり 4 で 0 あたりに落ちる
        target = 100 - Math.abs((Q.route || 0) - u.lean) * 24;
        //  他党を通してしか付き合えない団体がある。全労連は共産党系で、
        //  党が共産党と遠ければ、路線が近くても資源にはならない。
        if (u.via) { target *= Math.max(0, Math.min(1, (Q[u.via] || 0) / 100)); }
        if (target < 0) { target = 0; }
        cur = (Q[u.rel] === undefined) ? target : Q[u.rel];
        Q[u.rel] = Math.round((cur + (target - cur) * this.UNION_DRIFT) * 10) / 10;
      }
      return Q;
    },

    //  分担金。党の金は組合から来る。四団体との距離が変われば、
    //  入る額もそのぶん変わる。右へ寄れば総評の分が消え、
    //  同盟が来ても総評ほどの大きさは無い。
    unionDues: function (Q) {
      var p = this.unionPower(Q);
      //  党費。組合の分担金とは別に、党員から直接入る。
      //  一九五九年の五万人で 0.30/手。組合が離れても残る金である。
      var fee = this.memberDues(Q);
      var mul = this.diff(Q).income;
      Q.dues_acc = (Q.dues_acc || 0) + (p.total * this.DUES_RATE + fee) * mul;
      var pay = Math.floor(Q.dues_acc);
      if (pay > 0) { Q.dues_acc = Math.round((Q.dues_acc - pay) * 100) / 100; Q.budget += pay; }
      //  組合以外の金。都市の個人後援会と、連立に入っている枠から来る。
      //  中間右の線は組合を切る代わりにこれを作らなければならない ──
      //  作れていれば、総評が離れても財政は回る。
      //  作れていなければ、切っただけで終わる。
      var dep = this.unionDependence(Q);
      //  掛け合わせ。都市の支持も党員も、片方だけでは金にならない。
      //  二乗にしてあるのは、半端に作った基盤はほとんど金を生まないから ──
      //  組合を切っておいて都市も作れていない党は、そこで干上がる。
      var built = Math.min(1, (Q.lean_shinchukan_shakai || 0) / 30) *
                  Math.min(1, (Q.members || 0) / 90000);
      var urban = built * built * (1 - dep) * this.URBAN_DUES_MAX;
      Q.dues_urban = Math.round(urban * 100) / 100;
      Q.dues_acc += urban;
      var pay2 = Math.floor(Q.dues_acc);
      if (pay2 > 0) { Q.dues_acc = Math.round((Q.dues_acc - pay2) * 100) / 100; Q.budget += pay2; }
      Q.dues_now = Math.round(((p.total * this.DUES_RATE + fee) * mul + urban) * 100) / 100;
      Q.union_power = p.total;
      Q.union_kokorou = p.kokorou;
      Q.union_minrou = p.minrou;
      return Q;
    },

    //  四団体の力を合わせた値。金と組織と代議員がここから出る。
    //  組合員数 × 関係。総評が離れれば、同盟が来ても足りない。
    unionPower: function (Q) {
      var y = this.yearOf(Q), k, u, size, out = { total: 0, kokorou: 0, minrou: 0, by: {} };
      for (k in this.UNIONS) {
        if (!this.UNIONS.hasOwnProperty(k)) { continue; }
        u = this.UNIONS[k];
        size = this.unionSize(k, y, Q);
        //  share は「その団体のうち、党のものと数えてよい分」。
        //  全労連は共産党の組織であり、連合は二つの党を推す。
        //  自分で育てた全労協だけが、まるごと党のものになる。
        var p = size * Math.max(0, Q[u.rel] || 0) / 100 * (u.share === undefined ? 1 : u.share);
        out.by[k] = Math.round(p);
        out.total += p;
        out.kokorou += p * u.kokorou;
        out.minrou += p * u.minrou;
      }
      //  国鉄をどうしたかが、官公労の動員力にそのまま残る。
      //  分割民営化されれば国労は二十万から二万になる。
      out.kokorou *= (Q.kokutetsu_scale === undefined ? 1 : Q.kokutetsu_scale);
      out.total = Math.round(out.total);
      out.kokorou = Math.round(out.kokorou);
      out.minrou = Math.round(out.minrou);
      return out;
    },

    // ── 1行動回ぶんの不満度ドリフト ───────────────────────────
    //  その派閥がまだ党の中にいるか。出て行った派閥に不満は無い。
    inParty: function (Q, f) {
      //  向こうの党へ移った派閥は、こちらにはもう居ない。
      if (Q['defect_' + f]) { return false; }
      if (f === 'uha') { return !Q.minsha_exists; }
      if (f === 'chuu') { return !Q.shamin_exists; }
      if (f === 'saha') { return !Q.shinsha_exists; }
      //  合同で入ってきた側は、合同したあとにだけ居る。
      if (f === 'kyosan') { return !!Q.kyosan_merged; }
      if (f === 'hoshu') { return !!Q.minshu_hoshu; }
      if (f === 'jiyu') { return !!Q.minshu_jiyu; }
      return true;
    },


    // ══════════════════════════════════════════════════════════
    //  憲法
    //
    //  原ゲームの constitutional_reform は、改革ごとに**別々の賛成連合**を
    //  組み直して数える ──
    //
    //      Q.reform_support = Q.spd_normalized;
    //      if (…) Q.reform_support += Q.z_normalized - 0.03;   渋る分を引く
    //      if (…) Q.reform_support += Q.kpd_normalized;
    //      choose-if: reform_support >= pass_threshold
    //
    //  つまり「何を出すかで、乗ってくる党が変わる」。同じ形にする。
    //  この党は単独で三分の二には決して届かないので、
    //  発議できるかどうかは**誰を乗せられたか**で決まる。
    // ══════════════════════════════════════════════════════════

    //  改憲の発議に要る線。衆院の三分の二。
    kaikenLine: function (Q) { return Math.ceil((Q.hr_total || 511) * 2 / 3); },
    //  改憲を止める線。三分の一。ここを割ると相手が発議できる。
    gokenLine: function (Q) { return Math.ceil((Q.hr_total || 511) / 3); },

    //  護憲の側に立つ議席。
    //  社会党と共産党は当然として、公明は関係が良ければ乗る（史実でも
    //  公明は護憲寄りだった）。民社は改憲の側なので入れない。
    //  さきがけと社民連系の新党は護憲側に立つ。
    gokenSeats: function (Q) {
      var n = (Q.seats_hr || 0) + (Q.res_kyosan || 0);
      if ((Q.rel_komei || 0) >= 0) { n += Q.res_komei || 0; }
      n += Q.res_sp_sakigake || 0;
      return n;
    },

    //  各党の議席比。原ゲームの *_normalized に当たる。
    partyShare: function (Q, key) {
      var t = Q.hr_total || 511;
      if (t <= 0) { return 0; }
      var n;
      if (key === 'shakai') { n = Q.seats_hr || 0; }
      else if (key === 'shinjiyu' || key === 'shinsei' ||
               key === 'sakigake' || key === 'nihonshin') { n = Q['res_sp_' + key] || 0; }
      else { n = Q['res_' + key] || 0; }
      return n / t;
    },

    //  改憲の中身ごとの賛成連合。
    //  乗るかどうかは「その党がその改革を欲しがるか」と「こちらとの関係」の両方。
    //  渋りは原ゲームと同じく小さく引く。
    REFORM: {
      //  九条 ── 自衛隊を憲法に書く。右の線でしか出せない。
      kyujo: { line: 'right' },
      //  選挙制度
      hirei: { line: 'both' },      //  比例代表
      heiyo: { line: 'both' },      //  小選挙区比例代表併用制（西独型）
      renyo: { line: 'both' },      //  小選挙区比例代表連用制
      heiritsu: { line: 'both' },   //  小選挙区比例代表並立制
      kensetsu: { line: 'both' },   //  建設的不信任
      gijutsu: { line: 'both' },    //  技術条項（会期・国会の召集など）
      //  国体 ── 天皇制の廃止。左の線でしか出せない。
      kokka: { line: 'left' }
    },

    reformSupport: function (Q, key) {
      var s = this.partyShare(Q, 'shakai');
      var komei = this.partyShare(Q, 'komei');
      var minsha = this.partyShare(Q, 'minsha');
      var kyosan = this.partyShare(Q, 'kyosan');
      var jimin = this.partyShare(Q, 'jimin');
      var shinsei = this.partyShare(Q, 'shinsei');
      var sakigake = this.partyShare(Q, 'sakigake');
      var nihonshin = this.partyShare(Q, 'nihonshin');
      var shinjiyu = this.partyShare(Q, 'shinjiyu');
      var rk = Q.rel_komei || 0, rm = Q.rel_minsha || 0;
      var rj = Q.rel_jimin || 0, rky = Q.rel_kyosan || 0;
      var v = s;

      if (key === 'kyujo') {
        //  九条を書き換える側。自民と民社は元から改憲派、公明は渋る。
        //  共産は絶対に乗らない。
        //  自民は元から改憲派である。こちらを好きか嫌いかではなく、
        //  中身が欲しいかどうかで乗る ── 関係で門をかけていたのは誤りで、
        //  rel_jimin は平常から −100 なのでどの改革も永久に通らなかった。
        v += jimin * 0.85;
        if (rm >= -40) { v += minsha; }
        if (rk >= 25) { v += komei - 0.04; }
        v += shinsei + shinjiyu;
      } else if (key === 'hirei') {
        //  比例代表。小さい党ほど欲しがる。自民は嫌がる。
        if (rk >= 0) { v += komei; }
        if (rm >= -10) { v += minsha; }
        if (rky >= -20) { v += kyosan; }
        v += sakigake + nihonshin;
        if (rj >= 20) { v += jimin * 0.35; }
      } else if (key === 'heiyo') {
        //  併用制。議席の総数を比例で決めるので、結果はほぼ完全比例になる。
        //  最大党がいちばん損をするので、自民は乗らない。
        //  江田三郎が西欧社民から持ち帰りたかった制度でもある。
        if (rk >= -10) { v += komei; }
        if (rm >= -20) { v += minsha - 0.02; }
        if (rky >= -30) { v += kyosan; }
        v += sakigake + nihonshin;
      } else if (key === 'renyo') {
        //  連用制。小選挙区で勝った分を比例の除数に使うので、
        //  小選挙区で勝つ大きい党ほど損をする。
        //  一九九三年に公明・民社が出した対案がこれである。
        //  自民は乗らない ── 乗せるなら中小を全部集めるしかない。
        if (rk >= -10) { v += komei; }
        if (rm >= -20) { v += minsha; }
        if (rky >= -30) { v += kyosan; }
        v += sakigake + nihonshin;
      } else if (key === 'heiritsu') {
        //  併立制。大きい党に有利なので自民と新生が乗り、中小は渋る。
        //  大きい党に有利なので、自民は関係に関わらず乗る。
        //  史実の一九九四年も、仲が良かったからではなく得だから呼んだ。
        v += jimin * 0.9;
        v += shinsei + shinjiyu;
        if (rm >= -40) { v += minsha - 0.03; }
        if (rk >= 40) { v += komei - 0.05; }
      } else if (key === 'kensetsu') {
        //  建設的不信任。政権を安定させる話なので、政権に就く気のある党が乗る。
        if (rk >= 0) { v += komei; }
        if (rm >= -10) { v += minsha; }
        //  政権を保ちたい党は、相手が誰であれ乗る。
        v += jimin * 0.7;
        v += shinsei + sakigake + nihonshin;
      } else if (key === 'gijutsu') {
        //  技術条項。誰も強く反対しない。
        //  誰も強く反対しないので、関係ではなく中身で決まる。
        if (rk >= -40) { v += komei; }
        if (rm >= -50) { v += minsha; }
        v += jimin * 0.8;
        if (rky >= -50) { v += kyosan; }
        v += shinsei + sakigake + nihonshin + shinjiyu;
      } else if (key === 'kokka') {
        //  天皇制の廃止。素では三分の二に絶対に届かない ──
        //  乗るのは共産と、関係が極端に良いときの公明くらいである。
        //
        //  届かせる道は一つだけ。**先に別の改正を通しておく**こと。
        //  一度でも改正を通せば、次の改正の心理的な壁は下がる。
        //  四つ通しておけば、国体に手を付ける卓に乗る。
        if (rky >= -10) { v += kyosan; }
        if (rk >= 60) { v += komei; }
        else if (rk >= 30) { v += komei * 0.4; }
        v += sakigake + nihonshin * 0.5;
        v += 0.075 * Math.min(4, Q.kenpou_count || 0);
      }
      return Math.max(0, v);
    },

    //  発議できるか。衆院の三分の二に届いているか。
    reformOk: function (Q, key) {
      return this.reformSupport(Q, key) >= (2 / 3);
    },

    //  ── こちらが出す改正も、憲法第九十六条の手続きで数える（D1） ───────────────
    //  reformSupport と同じ党の乗り方を、党ごとの重み w（1 なら全部乗る、0.85 なら一部）と
    //  渋りの差し引き adj に分けて持つ。衆院は reformSupport（前のまま）、参院は同じ重みを
    //  参院の議席（hc_*）に掛けて三分の二と比べ、国民投票は同じ重みを得票率に掛けて、
    //  乗る党に入れた有権者の REF.LOYAL・ほかの有権者の REF.CROSS が賛成すると読む（相手の改憲と同じ読み）。
    //  選択肢は三つとも越えられる見込みがあるときだけ選べ、選べばそこで成立したものとして扱う（場面の文で言う）。
    //  重みの分け方が reformSupport と同じであることは audit5 の第 4b 節が確かめる。
    reformWeights: function (Q, key) {
      var rk = Q.rel_komei || 0, rm = Q.rel_minsha || 0;
      var rj = Q.rel_jimin || 0, rky = Q.rel_kyosan || 0;
      var w = { shakai: 1 }, adj = 0;
      if (key === 'kyujo') {
        w.jimin = 0.85;
        if (rm >= -40) { w.minsha = 1; }
        if (rk >= 25) { w.komei = 1; adj -= 0.04; }
        w.shinsei = 1; w.shinjiyu = 1;
      } else if (key === 'hirei') {
        if (rk >= 0) { w.komei = 1; }
        if (rm >= -10) { w.minsha = 1; }
        if (rky >= -20) { w.kyosan = 1; }
        w.sakigake = 1; w.nihonshin = 1;
        if (rj >= 20) { w.jimin = 0.35; }
      } else if (key === 'heiyo') {
        if (rk >= -10) { w.komei = 1; }
        if (rm >= -20) { w.minsha = 1; adj -= 0.02; }
        if (rky >= -30) { w.kyosan = 1; }
        w.sakigake = 1; w.nihonshin = 1;
      } else if (key === 'renyo') {
        if (rk >= -10) { w.komei = 1; }
        if (rm >= -20) { w.minsha = 1; }
        if (rky >= -30) { w.kyosan = 1; }
        w.sakigake = 1; w.nihonshin = 1;
      } else if (key === 'heiritsu') {
        w.jimin = 0.9;
        w.shinsei = 1; w.shinjiyu = 1;
        if (rm >= -40) { w.minsha = 1; adj -= 0.03; }
        if (rk >= 40) { w.komei = 1; adj -= 0.05; }
      } else if (key === 'kensetsu') {
        if (rk >= 0) { w.komei = 1; }
        if (rm >= -10) { w.minsha = 1; }
        w.jimin = 0.7;
        w.shinsei = 1; w.sakigake = 1; w.nihonshin = 1;
      } else if (key === 'gijutsu') {
        if (rk >= -40) { w.komei = 1; }
        if (rm >= -50) { w.minsha = 1; }
        w.jimin = 0.8;
        if (rky >= -50) { w.kyosan = 1; }
        w.shinsei = 1; w.sakigake = 1; w.nihonshin = 1; w.shinjiyu = 1;
      } else if (key === 'kokka') {
        if (rky >= -10) { w.kyosan = 1; }
        if (rk >= 60) { w.komei = 1; } else if (rk >= 30) { w.komei = 0.4; }
        w.sakigake = 1; w.nihonshin = 0.5;
        adj += 0.075 * Math.min(4, Q.kenpou_count || 0);
      }
      return { w: w, adj: adj };
    },
    //  参院での賛成の割合（0〜1）。新党（新生・さきがけ・日本新・新自由クラブ）は参院の議席を持たない
    reformSupportHC: function (Q, key) {
      var r = this.reformWeights(Q, key), v = r.adj, p, n;
      var seat = { shakai: Q.seats_hc || 0, jimin: Q.hc_jimin || 0, minsha: Q.hc_minsha || 0,
                   komei: Q.hc_komei || 0, kyosan: Q.hc_kyosan || 0, other: Q.hc_other || 0 };
      for (p in r.w) {
        if (r.w.hasOwnProperty(p)) { n = seat[p] || 0; v += r.w[p] * n / this.HC_TOTAL; }
      }
      return Math.max(0, v);
    },
    //  国民投票の賛成（％、丸めない）。乗る党の得票率の重み付きの和を A として A×LOYAL＋(1−A)×CROSS
    reformRefYes: function (Q, key) {
      var R = this.KAIKEN.REF, r = this.reformWeights(Q, key), vs = this.voteShares(Q), A = r.adj, p;
      for (p in r.w) {
        if (r.w.hasOwnProperty(p)) { A += r.w[p] * (vs[p] || 0) / 100; }
      }
      A = Math.max(0, Math.min(1, A));
      return (A * R.LOYAL + (1 - A) * R.CROSS) * 100;
    },

    //  改憲の危機。
    //
    //  憲法の規則は「改憲の発議に三分の二が要る」である。
    //  だから見るべきは**改憲の側が三分の二に届いたか**であって、
    //  こちらが三分の一を持っているかではない。
    //
    //  初版は後者で見ていたので、四十局のうち二十五局がここで終わった。
    //  史実でも、社会党単独が三分の一を持っていたことは一度も無い
    //  （最高の一九五八年でさえ 166/467）。改憲が起きなかったのは、
    //  自民と改憲派が三分の二を集められなかったからである。
    //  ── 改憲の挿話（相手が発議する側）の数 ─────────────────────
    //  二〇二六年九月（N3）まで、改憲の側が三分の二に届くと「牛歩」の一択で
    //  九条を失い、局がそこで終わっていた。いまは三手の挿話である：
    //    発議（手段を一つ）→ 委員会（手段を一つ）→ 採決（臨むか、一度だけ引き延ばす）。
    //  採決のときに改憲の側が三分の二を割っていれば止まる。割っていなければ九条を失い、
    //  第Ⅲ・Ⅳ幕はその幕の結算へ、第Ⅴ幕はそのまま一九九三年まで続く。
    //  手段が引き離す議席は、幕をまたいで持ち越す値（公明・民社・総評との関係、
    //  動員力、党員）から出す。見込みは脇柱の「危機」の面に出し、本文には書かない。
    //  数はここに集める。KAIKEN.COST は N2 で締めた経済で打ち手に打たせて合わせる。
    KAIKEN: {
      ROUNDS: 3,               //  発議から採決までの手（発議・委員会・採決）
      KOMEI_LINE: -20,         //  公明はこちらとの関係がこれを割ると改憲の側に回る（前からの線）
      JIMIN_DOVE: 0.10,        //  自民の中で九条を改めることに慎重な議員の割合
      KOMEI_STEP: 15,          //  公明を説得すると関係がこれだけ戻る
      KOMEI_ABSTAIN: -35,      //  説得したあと関係がここまで戻っていれば、今期は賛成に回らない
      MINSHA_BASE: 0.25, MINSHA_MIN: 0.10, MINSHA_MAX: 0.60, MINSHA_AGAIN: 0.5,
      STREET_RATE: 0.35, STREET_UNION: 400, STREET_SOHYO_MIN: 20,
      KOKUMIN_RATE: 0.30, KOKUMIN_MEM: 200000,
      WARN_GAP: 20, DANGER_GAP: 8, WARN_KOMEI: 15, DANGER_KOMEI: 6,
      //  COST の民社（民社の議員を引き離す）は N8 で資金 3 → 1。金を締めた盤（N2）では、政治資源はあるのに資金が 0〜2 で
      //  手段が一つも選べず「今回は動かない」しか押せない挿話が cards の打ち方で 7〜12% あった。民社への働きかけは公明と同じく
      //  党どうしの交渉なので、主に政治資源で払うことにした。cards 種 1〜300 で本当の選択が二つ未満の挿話は best 20 → 5・random 31 → 20・
      //  wait 19 → 3、止めた割合は best 96.6 → 96.6%・random 84.4 → 84.8%・wait 30 → 30%（本当の脅威の挿話）で、結果はほとんど動かない。
      //  公明の説得を 5 → 7 にした試しも結果は動かなかったので、ほかの費用は前のまま（AUDIT の N8 の節）。
      COST: { komei: { capital: 5, again: 2 }, minsha: { capital: 4, budget: 1 },
              street: { budget: 4, capital: 2 }, kokumin: { budget: 6, capital: 1 },
              delay: { capital: 3, hc: 2 }, renritsu: { capital: 3, coalition: 25 } },
      LOSE: { capital: 0.5, rel_sohyo: 15, mood_saha: 20, mood_chusa: 12, members: 0.9 },
      WIN: { rel_sohyo: 6 },
      //  九条を失ったときの減点は SCORE_W.kaiken（-30）に置く
      //  ── 参院と国民投票（D1）。下の「憲法第九十六条の手続き」を見よ ──
      HC_OTHER: 0.5,           //  参院の「その他」のうち改憲の側に数える割合（衆院の kaikenBloc と同じ）
      REF: {
        LOYAL: 0.75,           //  改憲の側の党に入れた有権者のうち、国民投票で賛成する割合
        CROSS: 0.15,           //  ほかの党に入れた有権者のうち、賛成する割合
        OTHER: 0.5,            //  「その他」の党に入れた有権者のうち、改憲の側に数える割合
        UNION: 4, UNION_POWER: 400,   //  組合と総評を動かす手段の効き（賛成が減る点の上限）と、効き切る動員力
        KOKUMIN: 3,            //  護憲の国民運動の効き（上限。党員の数で 0.4〜1 倍）
        COST: { union: { budget: 4, capital: 2 }, kokumin: { budget: 6, capital: 1 }, komei: { capital: 5, again: 2 } }
      }
    },

    //  改憲の側の議席。S を省けば盤の議席（res_*）で数える。
    //  S.forecast のとき（総選挙の見込み）は、今期の国会で引き離した分（kk_*）を引かない ──
    //  kk_* は次の総選挙（runElection）で戻るので、見込みには効かない。
    kaikenBloc: function (Q, S) {
      var K = this.KAIKEN;
      if (!S) {
        S = { jimin: Q.res_jimin || 0, minsha: Q.res_minsha || 0, komei: Q.res_komei || 0,
              other: Q.res_other || 0, shinsei: Q.res_sp_shinsei || 0, shinjiyu: Q.res_sp_shinjiyu || 0 };
      }
      var n = (S.jimin || 0) + (S.minsha || 0) + (S.shinsei || 0) + (S.shinjiyu || 0);
      //  公明は護憲寄り。こちらとの関係が壊れているときだけ向こうへ行く。
      //  今期説得して外した公明（kk_komei_out）は、関係がまた冷えても戻らない。
      if (Q.komei_exists && (Q.rel_komei || 0) < K.KOMEI_LINE && (S.forecast || !Q.kk_komei_out)) {
        n += S.komei || 0;
      }
      //  その他の半分は保守系無所属である。
      n += Math.round((S.other || 0) * 0.5);
      if (!S.forecast) {
        n -= Math.min(S.minsha || 0, Q.kk_minsha_out || 0);
        n -= (Q.kk_float_out || 0);
      }
      return Math.max(0, n);
    },

    //  改憲の側の数と、脇柱・主画面・選挙の頁が読む値を焼く。refresh から毎回呼ぶ。
    //  総選挙の見込み（kaiken_fore）はここでは数えない（写しを作るので重い）。
    //  endturn（kaikenTurn）・候補者調整・脇柱の on-arrival で kaikenForecast が焼いたものを読む。
    kaikenRisk: function (Q) {
      var K = this.KAIKEN, C = K.COST;
      Q.goken_seats = this.gokenSeats(Q);
      Q.goken_line = this.gokenLine(Q);
      Q.goken_ratio = Math.round((Q.goken_seats / (Q.hr_total || 511)) * 1000) / 10;
      var line = this.kaikenLine(Q), bloc = this.kaikenBloc(Q), band = this.bandOf(Q);
      var ep = Q.kaiken_ep || 0;
      //  九条がもう改められている（相手に改められたか、こちらが右の線で改めたか）
      var nine = !!(Q.kyujo_ushinatta || Q.kyujo_kaisei);
      Q.kaiken_line = line;
      Q.kaiken_bloc = bloc;
      Q.kaiken_gap = line - bloc;
      //  あと何議席引き離せば三分の二を割るか。連立を条件にして取り下げさせたら 0。
      Q.kaiken_left = Q.kaiken_withdrawn ? 0 : Math.max(0, bloc - line + 1);
      var kin = (Q.komei_exists && (Q.rel_komei || 0) < K.KOMEI_LINE && !Q.kk_komei_out) ? 1 : 0;
      Q.kk_komei_in = kin;
      Q.komei_swing = (Q.komei_exists && !kin && !Q.kk_komei_out) ? (Q.res_komei || 0) : 0;
      //  関係があといくつ下がると公明が向こうへ回るか（komei_swing > 0 のときだけ意味がある）
      Q.komei_drop = Math.floor((Q.rel_komei || 0) - K.KOMEI_LINE) + 1;
      //  相手が三分の二を集めたときだけ。
      //  こちらが右の線に居るなら党が呑んだということなので危機にならない。
      Q.kaiken_danger = (bloc >= line && band !== 4 && !nine && !Q.kaiken_blocked) ? 1 : 0;
      //  届いているのにまだ挿話が始まっていない（選挙のあと・幕の頭・事象で公明が離れた手）。
      //  この手の終わりの kaikenTurn で発議が始まる。主画面が赤字で出す。
      Q.kaiken_imminent = (Q.kaiken_danger && (Q.act || 1) >= 3 && !Q.kaiken_term_used && !ep) ? 1 : 0;
      //  予警。第Ⅱ幕から、挿話の外でだけ出す。
      var warn = 0, kw = 0;
      if ((Q.act || 1) >= 2 && !nine && band !== 4 && !Q.kaiken_blocked && !ep) {
        var gap = Q.kaiken_gap;
        var kc = Q.komei_swing > 0 && Q.komei_swing >= gap && gap > 0;
        if (gap <= K.DANGER_GAP || (kc && Q.komei_drop <= K.DANGER_KOMEI)) { warn = 2; }
        else if (gap <= K.WARN_GAP || (kc && Q.komei_drop <= K.WARN_KOMEI)) { warn = 1; }
        kw = (kc && Q.komei_drop <= K.WARN_KOMEI) ? 1 : 0;
      }
      Q.kaiken_warn = warn;
      Q.kaiken_komei_warn = kw;
      //  脇柱の一行の出し分け：0 平時 1 挿話の中 2 今期は止めた 3 九条を失った 4 右の線 5 こちらで九条を改めた
      //  衆院を通ったあと参院と国民投票の頁にいるあいだ（kaiken_stage 2・3）も「挿話の中」（D1）
      var stg = Q.kaiken_stage || 0;
      Q.kaiken_state = Q.kyujo_ushinatta ? 3 : (Q.kyujo_kaisei ? 5 : ((ep > 0 || stg >= 2) ? 1
        : (Q.kaiken_blocked ? 2 : (band === 4 ? 4 : 0))));
      //  参院と国民投票の見込み（D1。脇柱の状況の面・危機の面、主画面が読む）
      this.kaikenOutlook(Q);
      Q.kaiken_to_vote = ep > 0 ? Math.max(0, (Q.kaiken_rounds || K.ROUNDS) - ep) : 0;
      //  手段の頁（発議と委員会）がまだ先にあるか、いまその頁にいるか。脇柱の「打てる手」はこのときだけ出す。
      //  委員会の回で手段を選んだあとは、採決（と一度だけの引き延ばし）しか残っていない。
      //  連立を条件にして取り下げさせたあと（kaiken_withdrawn）は、次の手の終わりに止まるので手段はもう無い。
      Q.kk_lever_ahead = (ep > 0 && ep < K.ROUNDS && !Q.kaiken_withdrawn
        && !(ep === K.ROUNDS - 1 && Q.kk_lever_ep === ep)) ? 1 : 0;
      //  手段の費用（選択肢の副題と choose-if が読む）
      Q.kk_cost_komei = C.komei.capital + C.komei.again * (Q.kk_uses_komei || 0);
      Q.kk_cost_minsha_c = C.minsha.capital; Q.kk_cost_minsha_b = C.minsha.budget;
      Q.kk_cost_street_b = C.street.budget; Q.kk_cost_street_c = C.street.capital;
      Q.kk_cost_kokumin_b = C.kokumin.budget; Q.kk_cost_kokumin_c = C.kokumin.capital;
      Q.kk_cost_renritsu = C.renritsu.capital;
      this.kaikenEstimate(Q);
      return Q.kaiken_danger;
    },

    //  引き離せる浮動票：自民の慎重派、保守系無所属（その他の半分）、新自由クラブ。
    //  街頭と国民運動はここから引く。引いた分（kk_float_out）は次の総選挙まで戻らない。
    kaikenPool: function (Q) {
      var K = this.KAIKEN;
      return Math.max(0, Math.round((Q.res_jimin || 0) * K.JIMIN_DOVE)
        + Math.round((Q.res_other || 0) * 0.5) + (Q.res_sp_shinjiyu || 0) - (Q.kk_float_out || 0));
    },
    //  総選挙の見込みでの改憲の側（opt.all。開票と同じ算術で党ごとの議席を出す）。
    //  k・year を省けば「いま総選挙なら」。写しで数えるので盤は触らない。
    //  重いので refresh では呼ばない（kaikenTurn・候補者調整・脇柱の on-arrival）。
    kaikenForecast: function (Q, k, year) {
      var f = this.seatForecast(Q, k, year, { all: true });
      var a = f.all || {};
      Q.kaiken_fore = this.kaikenBloc(Q, { jimin: a.jimin || 0, minsha: a.minsha || 0, komei: a.komei || 0,
        other: a.other || 0, shinsei: a.sp_shinsei || 0, shinjiyu: a.sp_shinjiyu || 0, forecast: 1 });
      //  その選挙の定数での三分の二（定数が変わる年がある）
      Q.kaiken_fore_line = Math.ceil((f.hr_total || Q.hr_total || 511) * 2 / 3);
      return Q.kaiken_fore;
    },
    //  手段ごとの見込み（脇柱の「危機」の面と、手段の頁の効き目）。
    kaikenEstimate: function (Q) {
      var K = this.KAIKEN;
      var cl = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
      var pool = this.kaikenPool(Q);
      Q.kk_pool = pool;
      var kin = Q.kk_komei_in || 0;
      Q.kk_est_komei = (kin && (Q.rel_komei || 0) + K.KOMEI_STEP >= K.KOMEI_ABSTAIN) ? (Q.res_komei || 0) : 0;
      Q.kk_komei_twice = (kin && !Q.kk_est_komei) ? 1 : 0;
      var ms = Math.max(0, (Q.res_minsha || 0) - (Q.kk_minsha_out || 0));
      Q.kk_est_minsha = Q.minsha_exists ? Math.round(ms
        * cl(K.MINSHA_BASE + (Q.rel_minsha || 0) / 200, K.MINSHA_MIN, K.MINSHA_MAX)
        * ((Q.kk_uses_minsha || 0) > 0 ? K.MINSHA_AGAIN : 1)) : 0;
      var rs = Q.rel_sohyo || 0;
      Q.kk_est_street = rs >= K.STREET_SOHYO_MIN ? Math.round(pool * K.STREET_RATE
        * Math.min(1, (Q.union_power || 0) / K.STREET_UNION) * (0.5 + cl(rs, 0, 100) / 200)) : 0;
      Q.kk_est_kokumin = Math.round(pool * K.KOKUMIN_RATE * cl(0.4 + (Q.members || 0) / K.KOKUMIN_MEM, 0.4, 1));
      //  参院で護憲の側が三分の一を持っていれば、引き延ばしは安く済む（判定は衆院だけ）
      var hc = (Q.seats_hc || 0) + (Q.hc_kyosan || 0) + (kin ? 0 : (Q.hc_komei || 0));
      Q.kk_hc_hold = hc >= Math.ceil(this.HC_TOTAL / 3) ? 1 : 0;
      Q.kk_cost_delay = Q.kk_hc_hold ? K.COST.delay.hc : K.COST.delay.capital;
      //  手段の頁がもう無ければ出さない（そのときは脇柱が「手段を打てる回はもう無い」と書く）
      Q.kaiken_hopeless = !Q.kk_lever_ahead || (Q.cab_kind === 4 && Q.in_power) || (Q.kaiken_left || 0) <= 0 ? 0
        : ((Q.kaiken_left || 0) > Q.kk_est_komei + Q.kk_est_minsha + Q.kk_est_street + Q.kk_est_kokumin ? 1 : 0);
      return Q;
    },

    //  endturn から毎手呼ぶ（前の「kaikenRisk して pending_kaiken を立てる」二行の代わり）。
    //  kaiken_page：1 発議 2 委員会 3 採決（引き延ばせるとき） 4 採決（そのまま） 5 止めた
    kaikenTurn: function (Q) {
      if ((Q.act || 1) >= 2) { this.kaikenForecast(Q); }
      this.kaikenRisk(Q);
      Q.pending_kaiken = 0; Q.kaiken_page = 0;
      if ((Q.kaiken_ep || 0) > 0) {
        //  挿話のあいだに党が右の線へ移ったら、何も罰さずに畳む
        if (this.bandOf(Q) === 4) {
          Q.kaiken_ep = 0;
          this.crisisRecheck(Q);
          this.kaikenRisk(Q);
          return 0;
        }
        Q.kaiken_ep += 1;
        this.kaikenRisk(Q);
        //  委員会の回は、改憲の側がもう三分の二を割っていても飛ばさない
        //  （割ったままなら採決の手に「取り下げ」として止まる）。設計書どおり割った手で
        //  すぐ止めると、差の小さい挿話は手段一つで終わり、選ぶ場面が一度しか無い。
        if (Q.kaiken_ep >= (Q.kaiken_rounds || this.KAIKEN.ROUNDS)) {
          Q.kaiken_page = Q.kaiken_left <= 0 ? 5 : (Q.kaiken_delay_used ? 4 : 3);
          if (Q.kaiken_page !== 5) { Q.kaiken_early = 0; }
        } else if (Q.kaiken_withdrawn) {
          //  連立を条件にして取り下げさせた手のあとは、委員会の頁を出さずにすぐ止める。
          //  上の「委員会の回は飛ばさない」は数で割れたときだけの話で、自民党が棚上げを
          //  呑んだあとに委員会の頁（審議を急いでいる）を出すと話が食い違う。
          Q.kaiken_page = 5;
          Q.kaiken_early = 1;
        } else {
          Q.kaiken_page = 2;
          //  委員会の時点で割れていれば、自民党は採決の前に取り下げる（@soshi の文の出し分け）
          Q.kaiken_early = Q.kaiken_left <= 0 ? 1 : 0;
        }
        Q.pending_kaiken = 1;
      } else if (Q.kaiken_danger && (Q.act || 1) >= 3 && !Q.kaiken_term_used && !Q.kyujo_ushinatta) {
        this.kaikenStart(Q);
        Q.kaiken_page = 1;
        Q.pending_kaiken = 1;
      }
      //  pending_kaiken が立っているのに頁が無いと、endturn の go-to がどれも立たず止まる
      if (Q.pending_kaiken && !(Q.kaiken_page >= 1 && Q.kaiken_page <= 5)) {
        //  開発者向けの印（audit-play が "Error" で拾う）。訳の対象にしないため英字で書く
        console.log('Error: kaikenTurn has no page, kaiken_page=' + Q.kaiken_page);
        Q.pending_kaiken = 0; Q.kaiken_page = 0; Q.kaiken_ep = 0;
      }
      return Q.pending_kaiken;
    },
    kaikenStart: function (Q) {
      Q.kaiken_ep = 1;
      Q.kaiken_rounds = this.KAIKEN.ROUNDS;
      Q.kaiken_delay_used = 0; Q.kaiken_early = 0; Q.kaiken_result = 0; Q.kaiken_dropped = 0;
      Q.kaiken_term_used = 1;
      Q.kk_uses_komei = 0; Q.kk_uses_minsha = 0; Q.kaiken_withdrawn = 0;
      Q.kk_last = ''; Q.kk_last_peel = 0; Q.kk_lever_ep = 0;
      Q.kaiken_stage = 0; Q.kaiken_block_stage = 0; Q.kaiken_hc_result = 0; Q.kaiken_ref_result = 0;
      Q.kk_ref_chosen = 0; Q.kk_ref_base = -1;
      Q.kaiken_start_year = Q.year || 0;
      //  危機に入れる。局面ごとの一度きりとは別で、使い済みでも入る。刻むのは一手分（+2 手）
      var r = this.crisisReasons(Q);
      if (!Q.crisis_on) { this.crisisEnter(Q, r, 1); } else { this.crisisRows(Q, r); }
      //  採決までに局面が閉じないよう、手を足す（暦は turns_left で測るので総手数も同じだけ）
      var need = Q.kaiken_rounds - 1;
      if ((Q.turns_left || 0) < need) {
        var d = need - (Q.turns_left || 0);
        Q.turns_left = (Q.turns_left || 0) + d;
        Q.phase_turns = (Q.phase_turns || 0) + d;
      }
      Q.crisis_turns_left = Math.max(Q.crisis_turns_left || 0, need + 1);
      this.kaikenRisk(Q);
      return Q;
    },
    //  手段の頁の on-arrival。先に費用を払い、効かせてから refresh。
    kaikenLever: function (Q, key) {
      var K = this.KAIKEN, C = K.COST, n = 0;
      this.tdStep(Q);
      this.kaikenRisk(Q);
      if (key === 'komei') {
        Q.capital = (Q.capital || 0) - Q.kk_cost_komei;
        Q.rel_komei = (Q.rel_komei || 0) + K.KOMEI_STEP;
        if (Q.rel_komei >= K.KOMEI_ABSTAIN && !Q.kk_komei_out) { Q.kk_komei_out = 1; n = Q.res_komei || 0; }
        Q.kk_uses_komei = (Q.kk_uses_komei || 0) + 1;
        Q.mood_saha = (Q.mood_saha || 0) + 6;
      } else if (key === 'minsha') {
        Q.capital = (Q.capital || 0) - C.minsha.capital;
        Q.budget = (Q.budget || 0) - C.minsha.budget;
        n = Q.kk_est_minsha || 0;
        Q.kk_minsha_out = (Q.kk_minsha_out || 0) + n;
        Q.kk_uses_minsha = (Q.kk_uses_minsha || 0) + 1;
        Q.rel_minsha = (Q.rel_minsha || 0) + 6;
        Q.rel_sohyo = (Q.rel_sohyo || 0) - 5;
        Q.mood_saha = (Q.mood_saha || 0) + 5;
      } else if (key === 'street') {
        Q.budget = (Q.budget || 0) - C.street.budget;
        Q.capital = (Q.capital || 0) - C.street.capital;
        n = Q.kk_est_street || 0;
        Q.kk_float_out = (Q.kk_float_out || 0) + n;
        Q.rel_sohyo = (Q.rel_sohyo || 0) + 4;
        this.push(Q, ['kokorou', 'minrou'], 3);
        this.push(Q, ['shinchukan'], -2);
      } else if (key === 'kokumin') {
        Q.budget = (Q.budget || 0) - C.kokumin.budget;
        Q.capital = (Q.capital || 0) - C.kokumin.capital;
        n = Q.kk_est_kokumin || 0;
        Q.kk_float_out = (Q.kk_float_out || 0) + n;
        this.push(Q, ['mishoshiki', 'shinchukan'], 3);
        Q.members = (Q.members || 0) + 2000;
      } else if (key === 'renritsu') {
        Q.kaiken_withdrawn = 1;
        Q.coalition_rel = (Q.coalition_rel || 0) - C.renritsu.coalition;
        Q.capital = (Q.capital || 0) - C.renritsu.capital;
      }
      Q.kk_last = key; Q.kk_last_peel = n; Q.kk_lever_ep = Q.kaiken_ep || 0;
      this.refresh(Q);
      this.tdClose(Q);
      return n;
    },
    //  採決を一手先へ送る。挿話ごとに一度だけ。
    kaikenDelay: function (Q) {
      this.tdStep(Q);
      this.kaikenRisk(Q);
      Q.capital = (Q.capital || 0) - (Q.kk_cost_delay || 0);
      Q.kaiken_rounds = (Q.kaiken_rounds || this.KAIKEN.ROUNDS) + 1;
      Q.kaiken_delay_used = 1;
      if ((Q.turns_left || 0) < 1) {
        Q.turns_left = (Q.turns_left || 0) + 1;
        Q.phase_turns = (Q.phase_turns || 0) + 1;
      }
      Q.crisis_turns_left = Math.max(Q.crisis_turns_left || 0, 2);
      Q.rel_jimin = (Q.rel_jimin || 0) - 10;
      if (!Q.kk_hc_hold) { this.push(Q, ['shinchukan'], -2); }
      Q.kk_last = 'delay'; Q.kk_last_peel = 0;
      this.refresh(Q);
      this.tdClose(Q);
      return Q;
    },
    //  衆院の採決。kaiken_result 1 止めた 0 衆院を通った。
    //  通ったら改正案は参院へ回る（kaiken_stage 2。@gyuho → @sanin。D1）。九条を失うのは国民投票で承認されたときだけ。
    kaikenResolve: function (Q) {
      this.kaikenRisk(Q);
      Q.kaiken_result = (Q.kaiken_left || 0) <= 0 ? 1 : 0;
      Q.kaiken_ep = 0; Q.kaiken_page = 0; Q.pending_kaiken = 0;
      Q.kaiken_stage = Q.kaiken_result === 0 ? 2 : 0;
      Q.kaiken_hc_result = 0; Q.kaiken_ref_result = 0; Q.kk_ref_chosen = 0; Q.kk_ref_base = -1;
      this.kaikenRisk(Q);
      return Q.kaiken_result;
    },
    //  stage：どこで止めたか（1 衆院 2 参院 3 国民投票。省けば 1）
    kaikenWin: function (Q, stage) {
      var K = this.KAIKEN;
      this.tdStep(Q);
      Q.kaiken_blocked = 1;
      Q.kaiken_block_n = (Q.kaiken_block_n || 0) + 1;
      Q.kaiken_block_stage = stage || 1;
      Q.kaiken_stage = 0;
      Q.rel_sohyo = (Q.rel_sohyo || 0) + K.WIN.rel_sohyo;
      this.push(Q, ['mishoshiki', 'kokorou'], 2);
      if (!Q.achievement_goken_mamotta) { this.award('goken_mamotta'); }
      this.crisisRecheck(Q);
      this.refresh(Q);
      this.tdClose(Q);
      return Q;
    },
    kaikenLose: function (Q) {
      var L = this.KAIKEN.LOSE;
      this.tdStep(Q);
      Q.kyujo_ushinatta = 1;
      Q.kaiken_lost_act = Q.act || 0;
      Q.kaiken_lost_year = Q.year || 0;
      Q.kaiken_ep = 0; Q.kaiken_page = 0; Q.pending_kaiken = 0; Q.kaiken_stage = 0;
      Q.capital = Math.floor((Q.capital || 0) * L.capital);
      Q.rel_sohyo = (Q.rel_sohyo || 0) - L.rel_sohyo;
      Q.mood_saha = (Q.mood_saha || 0) + L.mood_saha;
      Q.mood_chusa = (Q.mood_chusa || 0) + L.mood_chusa;
      Q.members = Math.round((Q.members || 0) * L.members);
      this.crisisRecheck(Q);
      this.refresh(Q);
      this.tdClose(Q);
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  憲法第九十六条の手続き（D1、駕駛員の決め 2026-09-25「修憲按実際程序改写」）
    //
    //  改正は、衆参それぞれ総議員の三分の二以上の賛成で国会が発議し、国民投票で過半数の
    //  賛成を得て成立する。一九六〇〜九三年には国民投票の手続きを定めた法律が無いので、
    //  改める側はその法律もあわせて通すことになる（これは場面の文で言う）。
    //  相手が発議する挿話は、衆院の採決（N3 の三手）→ 参院の採決 → 国民投票 と進み、
    //  三つとも越えられたときだけ九条を失う（kaikenLose。SCORE_W.kaiken の 30 点はこのときだけ）。
    //  参院と国民投票は衆院の採決と同じ手のうちに続けて起きる（手をまたがないので、解散で消える
    //  のは衆院の採決の前だけ。N3 の決まりのまま）。
    //    参院      改憲の側（自民・民社・公明（関係が KOMEI_LINE を割り、今期説得していなければ）・
    //              その他の HC_OTHER）が参院の三分の二に届いていなければ、参院で止まる。
    //              盤の hc_*（参院選のたびに hcElectOthers が書く。D2）で数える。衆院の手段（民社・街頭・国民運動）は
    //              衆院の議員に向けたものなので参院には効かない。公明の説得は党としての約束なので参院にも効く。
    //    国民投票  各党の得票率（tally と同じ数え方。盤は触らない）から、改憲の側の党に入れた有権者の LOYAL、
    //              ほかの党に入れた有権者の CROSS が賛成すると読む（kaikenRefBase）。運動の手段を一つ選び
    //              （何もしないこともできる）、その効きの分だけ賛成が減る。賛成が過半を超えれば承認。
    //              読みは運動の頁に着いたときに決める（kk_ref_base）。手段の副作用（押した票・党員）は
    //              この投票には効かず、そのあとの盤にだけ残る。見込み＝結果は audit-forecast が見る。
    // ══════════════════════════════════════════════════════════
    hcLine: function () { return Math.ceil(this.HC_TOTAL * 2 / 3); },
    //  公明がいま改憲の側に数えられるか（今期説得して外したら数えない）
    kaikenKomeiIn: function (Q) {
      return !!(Q.komei_exists && (Q.rel_komei || 0) < this.KAIKEN.KOMEI_LINE && !Q.kk_komei_out);
    },
    //  参院の改憲の側（盤の hc_* で数える）
    kaikenHcBloc: function (Q) {
      var K = this.KAIKEN;
      return Math.max(0, (Q.hc_jimin || 0) + (Q.hc_minsha || 0) + (this.kaikenKomeiIn(Q) ? (Q.hc_komei || 0) : 0)
        + Math.round((Q.hc_other || 0) * K.HC_OTHER));
    },
    //  各党の得票率（％）。tally と同じ数え方だが、負の傾向を盤へ書き戻さない（読むだけ）
    voteShares: function (Q) {
      var res = {}, total = 0, i, j, l, p, sum, v;
      for (j = 0; j < PARTIES.length; j++) { res[PARTIES[j]] = 0; }
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        sum = 0;
        for (j = 0; j < PARTIES.length; j++) { v = Q['lean_' + l + '_' + PARTIES[j]]; if (v > 0) { sum += v; } }
        if (sum <= 0) { continue; }
        for (j = 0; j < PARTIES.length; j++) {
          p = PARTIES[j]; v = Q['lean_' + l + '_' + p];
          if (v > 0) { res[p] += (Q['pop_' + l] || 0) * (v / sum); }
        }
      }
      for (j = 0; j < PARTIES.length; j++) { total += res[PARTIES[j]]; }
      if (total <= 0) { return res; }
      for (j = 0; j < PARTIES.length; j++) { res[PARTIES[j]] = res[PARTIES[j]] / total * 100; }
      return res;
    },
    //  国民投票の賛成（％、丸めない）。改憲の側の党の得票率を A として A×LOYAL＋(100−A)×CROSS
    kaikenRefBase: function (Q) {
      var R = this.KAIKEN.REF, v = this.voteShares(Q);
      var A = (v.jimin || 0) + (v.minsha || 0) + (this.kaikenKomeiIn(Q) ? (v.komei || 0) : 0) + (v.other || 0) * R.OTHER;
      A = Math.max(0, Math.min(100, A));
      return A * R.LOYAL + (100 - A) * R.CROSS;
    },
    //  国民投票の運動の手段ごとの効き（賛成が減る点。丸めない）
    kaikenRefEst: function (Q, key) {
      var K = this.KAIKEN, R = K.REF;
      var cl = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
      if (key === 'union') {
        var rs = Q.rel_sohyo || 0;
        return rs >= K.STREET_SOHYO_MIN
          ? R.UNION * Math.min(1, (Q.union_power || 0) / R.UNION_POWER) * (0.5 + cl(rs, 0, 100) / 200) : 0;
      }
      if (key === 'kokumin') { return R.KOKUMIN * cl(0.4 + (Q.members || 0) / K.KOKUMIN_MEM, 0.4, 1); }
      if (key === 'komei') {
        //  公明が改憲の側にいて、説得で関係が棄権の線まで戻るなら、公明に入れた有権者が反対に回る
        if (!this.kaikenKomeiIn(Q) || (Q.rel_komei || 0) + K.KOMEI_STEP < K.KOMEI_ABSTAIN) { return 0; }
        return (this.voteShares(Q).komei || 0) * (R.LOYAL - R.CROSS);
      }
      return 0;
    },
    //  参院と国民投票の見込みを焼く（kaikenRisk から毎回）
    kaikenOutlook: function (Q) {
      var K = this.KAIKEN, R = K.REF, C = R.COST;
      var r1 = function (x) { return Math.round(x * 10) / 10; };
      Q.kk_hc_line = this.hcLine();
      Q.kk_hc_bloc = this.kaikenHcBloc(Q);
      Q.kk_hc_pass = Q.kk_hc_bloc >= Q.kk_hc_line ? 1 : 0;
      Q.kk_hc_gap = Math.max(0, Q.kk_hc_line - Q.kk_hc_bloc);
      //  主画面の改憲の予警に「参院では届いていない」を添えるか
      Q.kk_hc_note = (!Q.kk_hc_pass && (Q.kaiken_warn >= 1 || Q.kaiken_imminent || ((Q.act || 1) === 2 && Q.kaiken_gap <= 0))) ? 1 : 0;
      //  公明が改憲の側に回ったら、参院でも三分の二に届くか（N8。主画面の公明の予警の言い方と、その赤の出し分け）
      //  （今期説得した公明 kk_komei_out は回らないので足さない）
      Q.kk_hc_komei_pass = (Q.kk_hc_pass || (Q.komei_exists && !this.kaikenKomeiIn(Q) && !Q.kk_komei_out &&
        Q.kk_hc_bloc + (Q.hc_komei || 0) >= Q.kk_hc_line)) ? 1 : 0;
      //  国民投票。運動の頁に着いたら読みはそこで決まる（kk_ref_base）。それまでは盤から毎回読む
      var frozen = (Q.kaiken_stage === 3 && typeof Q.kk_ref_base === 'number' && Q.kk_ref_base >= 0);
      var rb = frozen ? Q.kk_ref_base : this.kaikenRefBase(Q);
      Q.kk_ref_yes = r1(rb);
      Q.kk_ref_pass = rb > 50 ? 1 : 0;
      Q.kk_ref_est_union = r1(this.kaikenRefEst(Q, 'union'));
      Q.kk_ref_est_kokumin = r1(this.kaikenRefEst(Q, 'kokumin'));
      Q.kk_ref_est_komei = r1(this.kaikenRefEst(Q, 'komei'));
      //  「一度では動かない」は説得しても関係が棄権の線まで戻らないときだけ（D2。前は効きが 0 のときにも
      //  立っていたので、公明が改憲の側にいて得票率が 0 の盤（一九六四〜六六年）でも出ていた）
      Q.kk_ref_komei_twice = (this.kaikenKomeiIn(Q) && (Q.rel_komei || 0) + K.KOMEI_STEP < K.KOMEI_ABSTAIN) ? 1 : 0;
      Q.kk_ref_komei_in = this.kaikenKomeiIn(Q) ? 1 : 0;
      Q.kk_cost_ref_union_b = C.union.budget; Q.kk_cost_ref_union_c = C.union.capital;
      Q.kk_cost_ref_kokumin_b = C.kokumin.budget; Q.kk_cost_ref_kokumin_c = C.kokumin.capital;
      Q.kk_cost_ref_komei = C.komei.capital + C.komei.again * (Q.kk_uses_komei || 0);
      //  手段を選んだあと（結果の頁まで）は、その結果を出す
      Q.kk_ref_done = (Q.kaiken_stage === 3 && Q.kk_ref_chosen) ? 1 : 0;
      return Q;
    },
    //  衆院を通ったあとの参院（@sanin の on-arrival）。kaiken_hc_result 1 参院で止まった 0 参院も通った
    kaikenHcResolve: function (Q) {
      this.kaikenRisk(Q);
      Q.kaiken_hc_bloc_at = this.kaikenHcBloc(Q);
      Q.kaiken_hc_result = Q.kaiken_hc_bloc_at >= this.hcLine() ? 0 : 1;
      if (Q.kaiken_hc_result === 1) { this.kaikenWin(Q, 2); }
      else { Q.kaiken_stage = 3; Q.kk_ref_chosen = 0; Q.kk_ref_base = -1; this.refresh(Q); }
      return Q.kaiken_hc_result;
    },
    //  国民投票の運動の頁（@tohyo の on-arrival）。投票の読みをここで決める
    kaikenRefStart: function (Q) {
      Q.kaiken_stage = 3;
      Q.kk_ref_chosen = 0;
      Q.kk_ref_base = this.kaikenRefBase(Q);
      this.refresh(Q);
      return Q;
    },
    //  運動の手段の頁の on-arrival。効きを引いて投票の結果を決め、費用と副作用を掛ける
    kaikenRefLever: function (Q, key) {
      var K = this.KAIKEN, C = K.REF.COST;
      this.tdStep(Q);
      this.kaikenRisk(Q);
      var base = (typeof Q.kk_ref_base === 'number' && Q.kk_ref_base >= 0) ? Q.kk_ref_base : this.kaikenRefBase(Q);
      var e = this.kaikenRefEst(Q, key);
      var fin = base - e;
      Q.kk_ref_final = Math.round(fin * 10) / 10;
      Q.kk_ref_final_pass = fin > 50 ? 1 : 0;
      Q.kk_ref_peel = Math.round(e * 10) / 10;
      Q.kk_ref_lever = key;
      if (key === 'union') {
        Q.budget = (Q.budget || 0) - C.union.budget;
        Q.capital = (Q.capital || 0) - C.union.capital;
        Q.rel_sohyo = (Q.rel_sohyo || 0) + 4;
        this.push(Q, ['kokorou', 'minrou'], 3);
        this.push(Q, ['shinchukan'], -2);
      } else if (key === 'kokumin') {
        Q.budget = (Q.budget || 0) - C.kokumin.budget;
        Q.capital = (Q.capital || 0) - C.kokumin.capital;
        this.push(Q, ['mishoshiki', 'shinchukan'], 3);
        Q.members = (Q.members || 0) + 2000;
      } else if (key === 'komei') {
        Q.capital = (Q.capital || 0) - (C.komei.capital + C.komei.again * (Q.kk_uses_komei || 0));
        Q.rel_komei = (Q.rel_komei || 0) + K.KOMEI_STEP;
        if (Q.rel_komei >= K.KOMEI_ABSTAIN && !Q.kk_komei_out) { Q.kk_komei_out = 1; }
        Q.kk_uses_komei = (Q.kk_uses_komei || 0) + 1;
        Q.mood_saha = (Q.mood_saha || 0) + 6;
      }
      Q.kk_ref_chosen = 1;
      this.refresh(Q);
      this.tdClose(Q);
      return Q.kk_ref_final;
    },
    //  開票（@kr_kekka の on-arrival）。kaiken_ref_result 1 否決（止めた）0 承認
    kaikenRefResolve: function (Q) {
      if (!Q.kk_ref_chosen) { this.kaikenRefLever(Q, 'wait'); }
      Q.kaiken_ref_yes = Q.kk_ref_final;
      Q.kaiken_ref_result = Q.kk_ref_final_pass ? 0 : 1;
      return Q.kaiken_ref_result;
    },

    //  分裂の扉が開いているか。splitCheck と factionPressure の
    //  両方がこれを見る ── 二つが食い違うと、出て行けないのに
    //  分裂待ちになる派閣ができる。
    //  出口が開く条件は「怒っているか」ではなく「出た先があるか」である。
    //  怒りだけで扉を開けていたので、監査（三〇〇局）では
    //    左派が第Ⅰ幕で出て行った局 54、脱党時の route 中央値 −0.4、
    //    右へ一歩も寄っていない（route <= 0）のに出て行った局 64.5%
    //  という状態だった。新社会党は一九九六年、村山内閣が自衛隊を合憲と
    //  認めたあとの話である。協会は一九七七年の協会規制でも出て行かなかった。
    //  怒りの行き場は factionPressure（大会での抵抗）に回す。
    hasExit: function (Q, f) {
      //  民主社会党 一九六〇年一月。西尾は除名を待たずに出た。
      //  ここだけは早い。ただし西尾自身が退いたあとの幕では起こらない。
      if (f === 'uha') { return !Q.minsha_exists && !Q.minsha_merged && (Q.act || 1) <= 3; }
      //  社会市民連合 一九七七年／社民連 一九七八年。
      //  江田が出たのは党が左へ振り切ったからというより、協会が党を
      //  握ったからである。route だけを条件にしていたら第Ⅲ幕の
      //  route <= -2 は 3/79 局しかなく、史実の道そのものが通らなくなった。
      //  掌握度を主にして、極左の線でも開くようにする。
      //  協会規制で掌握度を落とせば、この扉は閉じられる ── それが史実の梃子である。
      if (f === 'chuu') {
        return !Q.shamin_exists && (Q.act || 1) >= 3 &&
               ((Q.kyokai_grip || 0) >= 60 || (Q.route || 0) <= -2);
      }
      //  新社会党 一九九六年。窓口の外なので、盤面では
      //  「党が民主社会主義の帯まで右へ出た」ことを条件に置く。
      //  独立派閥になっているだけでは出て行かない。
      if (f === 'saha') {
        return !!Q.saha_independent && !Q.shinsha_exists &&
               (Q.route || 0) >= 1.5 && (Q.act || 1) >= 4;
      }
      //  中間左派（鈴木–佐々木派）に出口はない。この派が党の重心であり、
      //  出て行けば党のほうが残らない。史実でもこの派は最後まで党にいた。
      return false;
    },

    //  怒りの出口。
    //
    //  100 を越えた派閣は、扉が開いていれば splitCheck が拾って出て行く。
    //  開いていないとき、以前は行き場が無かった ── mood は 160 に張り付いたまま
    //  永久に危機だけを鳴らし続け、監査では終局に 124/137/152/160 が
    //  党内に並んでいた。怒りには必ず行き場を与える。
    factionPressure: function (Q) {
      Q.congress_anger = Math.max(0, (Q.congress_anger || 0) - 4);
      //  左派（協会）の出口はまず「独立派閣になること」である。
      //  中央が右へ寄るほど協会は組織として固まっていった ── 史実の順序でもある。
      //  ここを閉じていたせいで、第Ⅲ幕の協会独立事象を踏まない局では
      //  左派が永久に出て行けなかった。
      //  ただし協会が独立した身体を持つのは一九七〇年代である。
      //  幕の門を掛けていなかったので、監査では独立の 150/174 が第Ⅰ幕に
      //  起きていた（＝一九五九年の社会主義協会が独立派閥として立っていた）。
      if (this.inParty(Q, 'saha') && (Q.mood_saha || 0) >= 100 &&
          !Q.saha_independent && (Q.act || 1) >= 3) {
        Q.saha_independent = 1;
        Q.del_chusa = (Q.del_chusa || 0) - 120;
        Q.del_saha = (Q.del_saha || 0) + 120;
        Q.kyokai_grip = Math.min(100, (Q.kyokai_grip || 0) + 10);
        //  独立しただけでは出て行かない。同じ手で分裂しないよう下げる。
        Q.mood_saha = Math.max(0, (Q.mood_saha || 0) - 30);
        Q.saha_forced_indep = 1;
      }
      //  扉が閉じている派閣の怒りは、分裂ではなく大会での抵抗として
      //  一度に出る。出したら収まる ── また積み上がるまでの間は平時である。
      var fs = this.FAC_KEYS, i, f;
      for (i = 0; i < fs.length; i++) {
        f = fs[i];
        if (!this.inParty(Q, f)) { continue; }
        if ((Q['mood_' + f] || 0) < 100) { continue; }
        if (this.hasExit(Q, f)) { continue; }   //  splitCheck の仕事
        Q['mood_' + f] = 70;
        Q.capital = Math.max(0, (Q.capital || 0) - 3);
        Q.congress_anger = 40;                  //  しばらく大会の引きが強くなる
        Q.teiko_count = (Q.teiko_count || 0) + 1;
        Q.teiko_faction = f;
      }
      return Q;
    },

    //  出て行った派閥の席を誰が継ぐか。
    //  一九六〇年一月に西尾が出たあと、党の右の端は中間右派（河上・江田）
    //  である。協会が出たあとの左の端は中間左派になる。
    //  事象やカードが「右派が怒る」と書いているとき、右派がもう党に
    //  居なければ、怒るのはこの派閥である ── refresh がここへ繰り上げる。
    MOOD_HEIR: { uha: 'chuu', chuu: 'chusa', saha: 'chusa' },

    //  出て行った派閥に積まれた不満を、席を継いだ派閥へ移す。
    //  以前はここが素の 0 潰しだったので、第Ⅱ幕以降の事象が書いている
    //  mood_uha は 62 箇所すべて空振りしていた ── 民社脱党は深い局の
    //  九割七分で起きるので、「右派が怒る」と書いてある選択肢は
    //  三十年ぶん一度も効かなかった。
    //  相続先も出ていれば、さらにその先へ送る（中間左派に出口はない）。
    moodInherit: function (Q) {
      var fs = ['uha', 'chuu', 'saha'], i, f, to, n, hop;
      for (i = 0; i < fs.length; i++) {
        f = fs[i];
        if (this.inParty(Q, f)) { continue; }
        n = Q['mood_' + f] || 0;
        Q['mood_' + f] = 0;
        //  なだめた側（負）も同じように継がせる。片道だけ継がせると
        //  「右派に役職を厚く配る」が効かず「放っておく」だけが効く。
        if (n === 0) { continue; }
        to = this.MOOD_HEIR[f]; hop = 0;
        while (to && !this.inParty(Q, to) && hop < 3) { to = this.MOOD_HEIR[to]; hop += 1; }
        if (to && this.inParty(Q, to)) {
          Q['mood_' + to] = Math.max(0, (Q['mood_' + to] || 0) + n);
        }
      }
      return Q;
    },

    moodDrift: function (Q) {
      var r = Q.route, i, k, f = this.FAC_KEYS;
      //  路線ドリフトは党に居る派閥にだけ積む。
      //  以前は出て行った派閥にも積んでから 0 に潰していたので、
      //  繰り上げを入れると「居ない右派の怒り」まで中間右派へ流れる。
      var live = {};
      for (i = 0; i < f.length; i++) { live[f[i]] = this.inParty(Q, f[i]); }
      // 右派：左にいるほど加速。route 0 で微増、+1 以上で沈静
      if (live.uha) { Q.mood_uha += (r < 0) ? (4 + (-r) * 3) : (r === 0 ? 1 : -6); }
      //  中間右派（江田の系譜）：極左で怒るのは前からのとおり。
      //  だが民主社会主義の線でも怒る。構造改革は党を新しくする話であって、
      //  党を第二保守党にする話ではなかった。江田は民社の路線を支持していない。
      //  ここを閉じていなかったので、右の線だけ分裂の圧が掛からず、
      //  左より楽な道になっていた。
      if (live.chuu) { Q.mood_chuu += (r < -3) ? 5 : (r > 2 ? (2 + (r - 2) * 3) : (r < -1 ? 2 : -1)); }
      //  中間左派：両端で怒るが、出口がない。右端のほうが深く怒る
      //  ── 左へ寄るのは党の内輪の話だが、右へ寄るのは党の看板を変える話である。
      Q.mood_chusa += (r > 3) ? 5 : (Math.abs(r) > 3 ? 3 : -1);
      //  左派：右に行くほど怒る。
      //  中間左（−2 〜 −0.5）は党が四十年いた場所であって、
      //  そこに座っているだけで協会が怒っていく理由はない。
      //  以前はこの帯でも毎手 +1 で、一三九手のあいだに何もしなくても
      //  百三十九たまった（閾値は 100）。据え置きに直す。
      if (live.saha) { Q.mood_saha += (r >= 1) ? (3 + r * 3) : (r > 0 ? 2 : (r > -2 ? 0 : -2)); }
      //  共産党系：合同の条件が左の帯だったので、右へ動けばすぐ怒る。
      if (live.kyosan) { Q.mood_kyosan += (r >= 0) ? (4 + r * 3) : (r > -2 ? 1 : -2); }
      //  保守派：自民を出てきた側である。左へ寄れば居場所が無くなる。
      if (live.hoshu) { Q.mood_hoshu += (r < 1) ? (3 + (1 - r) * 2) : -4; }
      //  自由派：両端で怒る。中道の右あたりが居心地の良い場所である。
      if (live.jiyu) { Q.mood_jiyu += (r < -1) ? (2 + (-1 - r) * 2) : (r > 4 ? 3 : -2); }
      //  出て行った派閥に積まれたぶんは、席を継いだ派閥へ繰り上げる。
      this.moodInherit(Q);
      for (i = 0; i < f.length; i++) {
        k = 'mood_' + f[i];
        if (!this.inParty(Q, f[i])) { Q[k] = 0; continue; }
        Q[k] = clamp(r1(Q[k]), 0, 160);
      }
      //  積み上げたあとで、出口の無い怒りを逃がす。
      this.factionPressure(Q);
    },

    // ── 指導部の役職が持つ受動効果 ────────────────────────────

    //  ── 毎手の維持費 ──────────────────────────────────────
    //  監査で「資金が門の9倍、政治資源が15倍たまり、第Ⅴ幕の高い選択肢が
    //  全部ただで通る」と出たので入れた。それまで党には収入だけがあって
    //  支出が無かった ── 史実の社会党の第一の問題（党財政）が、
    //  盤面のどこにも現れていなかった。
    //
    //    資金   専従と機関紙。党員が増えるほど高くつく。自治体を持てば更に。
    //    政治資源 貯まるものではない。床（CAPITAL_SOFT）より上は使わなければ散る（毎手 15%）。
    //  校正（実機139手の通しを6シードずつ）：
    //    維持費なし        careless hr111 / 資金峰34 / 政治資源峰83
    //    0.35 / 0.96      careless hr 61 / 資金峰18 / 政治資源峰28 / 未払23回
    //                     金に気を配る打ち手 hr103 / 資金峰45 / 未払0回
    //  金を見ない打ち手と見る打ち手で 42議席の差が付く。それまでは差が無かった。
    //  二〇二六年九月（N2）にもう一度締めた。それでも金は余っていて、札を打ち続ける打ち手
    //  （playtest の cards、普通、60局）で各手の初めの資金が中央値 53・p90 165、
    //  第Ⅲ幕以降は 90 前後あった。分担金・党費・都市の後援会を下げ、党員と自治体の
    //  維持費を上げ、国鉄の赤字の分担を維持費に入れ、30 を超えた分を毎手一割流す
    //  （BUDGET_SOFT）。政治資源も床 12 → 8、減衰 10% → 15%、入り 1/20 → 1/24。
    //  締めたあと（同じ種）：資金 中央値 12・p90 37、幕ごと 8/17/19/7/9、資金 3 以下の手 19%、
    //  払えなかった回数が残る手 7%、政治資源 中央値 16、選べない選択肢が出る頁 22%。
    //  難度ごとの資金中央値 簡単 24・普通 12・難しい 8（締める前 129・53・22）。
    //  専従と機関紙。党員に比例するが、こちらも線形ではない ──
    //  機関紙は一度刷れば部数が増えても割安になるし、県連の事務所は
    //  党員が倍になっても倍にはならない。指数は党費（0.6）より小さく、
    //  そのぶん「組織を作れば手元は楽になる、ただし楽になり方は鈍る」。
    //  五万人で 0.26、十五万五千人で 0.43。自治体の分は線形のまま
    //  （一つ持てば一つぶんの役所が要る）。
    UPKEEP_MEMBER_BASE: 50000,
    UPKEEP_MEMBER_K: 0.26,
    UPKEEP_MEMBER_EXP: 0.45,
    memberUpkeep: function (Q) {
      var m = Math.max(0, Q.members || 0);
      if (m <= 0) { return 0; }
      return this.UPKEEP_MEMBER_K *
        Math.pow(m / this.UPKEEP_MEMBER_BASE, this.UPKEEP_MEMBER_EXP);
    },
    UPKEEP_PER_CITY: 0.45,
    CAPITAL_DECAY: 0.85,
    CAPITAL_SOFT: 8,    // ここまでは減らない。上だけ削る
    //  国鉄を改革しなかった赤字のうち、党が維持費として負う割合（赤字 3 なら毎手 1.05）
    KOKUTETSU_PARTY_SHARE: 0.35,
    //  資金を貯め込めないようにする線。これを超えた分の一割が、毎手
    //  県連と専従へ回って消える（端数は budget_leak_acc に貯めて整数で引く）。
    BUDGET_SOFT: 30,
    BUDGET_LEAK: 0.10,
    //  毎手の維持費（資金）。専従・機関紙・自治体・国鉄の分担。脇柱の見込みと払いの両方がこれを使う。
    upkeepCost: function (Q) {
      return (this.memberUpkeep(Q) +
              this.localCount(Q) * this.UPKEEP_PER_CITY +
              (Q.kokutetsu_debt || 0) * this.KOKUTETSU_PARTY_SHARE) * this.diff(Q).upkeep;
    },
    // ══════════════════════════════════════════════════════════
    //  新左翼
    //
    //    nl_activity   街頭に出ている量
    //    nl_distance   党との距離（高いほど遠い。開幕 60）
    //    nl_revulsion  世間の忌避（開幕 5）
    //    nl_intake     党へ活動家を流し込んだ回数
    //    nl_intake_del そのぶんの代議員
    //
    //  この三つは脇柱に出るだけで、どの条件も読んでいなかった。
    //  一九七二年二月のあさま山荘までは、近づけば人が取れる ──
    //  社青同解放派も反戦青年委員会も、実際に党の若い活動家の供給源だった。
    //  そのあとは、近かったぶんだけ払う。窓は事件の日付で閉じる。
    NL_WINDOW: 1971,
    nlNear: function (Q) {
      return 100 - ((Q.nl_distance === undefined) ? 60 : Q.nl_distance);
    },
    //  活動家を党へ入れる。協会が独立していれば左派へ、していなければ
    //  中間左派へ入る ── 社青同は協会の学習会でもあったからである。
    //  受け入れられる回数の上限。無いと安保から七一年までの四十手を
    //  冷却二手で割った分だけ入れられ、党大会が新左翼の出身者で埋まる。
    NL_INTAKE_MAX: 6,

    //  街頭の活動家を県連へ入れる。
    //  県連は中間左派の代議員の出どころであり、協会はそこから自分の分を
    //  切り出す（delegates を見よ）。だから受け入れは中間左派の票を増やし、
    //  協会の掌握度も押し上げる ── 左の派閥の力が実際に増える。
    nlIntake: function (Q, n) {
      Q.del_chusa = (Q.del_chusa || 0) + n;
      if (Q.saha_independent) { Q.del_saha = (Q.del_saha || 0) + Math.round(n / 2); }
      Q.kyokai_grip = Math.min(100, (Q.kyokai_grip || 0) + 3);
      Q.mood_chusa = Math.max(0, (Q.mood_chusa || 0) - 3);
      Q.nl_intake = (Q.nl_intake || 0) + 1;
      Q.nl_intake_del = (Q.nl_intake_del || 0) + n;
      return n;
    },
    //  あさま山荘の請求書。近さと、入れた人数で決まる。
    //  近づかず、入れてもいなければ、決別の声明はそのまま得になる。
    //  あさま山荘の請求書。あさまは「幕の区切り（@rengo_sekigun）」と
    //  「札の事象（a3_asama）」の二か所から来る。両方から払わせると
    //  二重取りになるので、先に来たほうだけが払い、あとから来たほうは
    //  nl_hit を読んで文面を変えるだけにする。
    nlFallout: function (Q) {
      if (Q.nl_fallout_done) { return Q; }
      Q.nl_fallout_done = 1;
      var near = Math.max(0, Math.min(100, this.nlNear(Q))) / 100;
      var cap = this.NL_INTAKE_MAX;
      var taken = Math.min(cap, Q.nl_intake || 0);
      var w = near * 0.6 + (taken / cap) * 0.4;
      Q.nl_hit = Math.round(w * 100);
      Q.nl_revulsion = Math.min(100, (Q.nl_revulsion || 0) + Math.round(30 + 45 * w));
      this.push(Q, ['shinchukan'], -Math.round(2 + 10 * w));
      this.push(Q, ['mishoshiki'], -Math.round(1 + 7 * w));
      this.push(Q, ['jieigyo'], -Math.round(1 + 4 * w));
      Q.mood_chuu += Math.round(3 + 12 * w);
      Q.nl_distance = Math.min(100, (Q.nl_distance === undefined ? 60 : Q.nl_distance) + Math.round(20 + 20 * w));
      Q.nl_activity = Math.max(0, (Q.nl_activity || 0) - 40);
      //  入れた活動家は党に残る。残るが、党の重心を左へ引く。
      if (taken >= 3) { Q.route = Math.max(-5, (Q.route || 0) - 0.5); }
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  難度
    //
    //  見送り（@discard）は回を消費しない。山は尽きず、引くたびに
    //  その山の中から無作為に一枚出るので、気に入らなければ見送って
    //  引き直す、を繰り返せば毎手その時いちばん都合のいい札を選べた。
    //  引きの偶然が消え、手札という制約そのものが無くなる。
    //
    //  見送りに毎手の無料枠を置く。枠を使い切ったあとの見送りは
    //  回を食う ── 「札を探すのに一手使った」ということである。
    //
    //    0 簡単　1 普通　2 難しい　3 史実（控えを取れない）
    //  income は金と政治資源の入りに掛かる。upkeep は出に掛かる。
    //  以前は出だけを難度で振っていたので、簡単でも入りは同じだった。
    DIFF: [
      { id: 0, name: '简单',   discard: 3, budget:  6, capital:  4, upkeep: 0.7, income: 1.35, bar: 1.00, save: 1 },
      { id: 1, name: '普通',   discard: 2, budget:  0, capital:  0, upkeep: 1.0, income: 1.00, bar: 1.05, save: 1 },
      { id: 2, name: '困难', discard: 1, budget: -3, capital: -2, upkeep: 1.3, income: 0.80, bar: 1.12, save: 1 },
      { id: 3, name: '史实',   discard: 0, budget: -3, capital: -2, upkeep: 1.3, income: 0.80, bar: 1.12, save: 0 }
    ],
    diff: function (Q) {
      var i = (Q && Q.difficulty !== undefined && Q.difficulty !== null) ? Q.difficulty : 1;
      return this.DIFF[i] || this.DIFF[1];
    },

    //  史実の局では控えを取らせない。雛形の autosave を包んで黙らせ、
    //  頭の Save/Load も隠す。盤の進行には触れない。
    applySaveLock: function (Q) {
      try {
        var U = window.dendryUI;
        if (!U) { return; }
        if (this.diff(Q).save) { return; }
        if (!U.__jspNoSave) {
          U.__jspNoSave = 1;
          U.autosave = function () { return; };
        }
        if (typeof document === 'undefined') { return; }
        var links = document.querySelectorAll('#header-links a');
        for (var i = 0; i < links.length; i++) {
          if (/showSaveSlots/.test(links[i].getAttribute('onclick') || '')) {
            links[i].style.display = 'none';
          }
        }
      } catch (e) { return; }
    },

    // ══════════════════════════════════════════════════════════
    //  政治資源の入り
    //
    //  政治資源は「執行部が党を動かせる幅」である。ところが毎手の
    //  入りが一つも無く、事象で拾うしかなかった。実測すると開幕の
    //  役職で一手あたり ちょうど 0、減衰のぶんだけ −0.06 である。
    //  出るほうは事象の選択肢 487 か所が −2〜−5 を取っていく。
    //  第Ⅱ幕で何も打てなくなるという報告は、これが原因である。
    //
    //  入りは二つで決まる。
    //   ・六つの役職に、その職に向いた人を置けているか（適性の合計）
    //   ・党内が落ち着いているか（いちばん怒っている派閥を見る）
    //  開幕は適性合計 30（六人とも適任）で、一手あたり 1.0 前後になる。
    //  床（CAPITAL_SOFT）より上は毎手 15% 散るので、貯め込みは効かない。
    CAPITAL_PER_FIT: 24,
    //  議員団の大きさ。国会で使える手は議席の数で決まる。
    //  一九五九年の 166 議席で 1.15、九十議席で 0.9、単独過半（256）で 1.45。
    //  下は 0.8、上は 1.6 で止める ── 崩れても入りが枯れず、
    //  勝ちすぎても雪だるまにならない。
    seatScale: function (Q) {
      return Math.max(0.8, Math.min(1.6, 0.597 + (Q.seats_hr || 0) * 0.003333));
    },

    capitalIncome: function (Q) {
      var L = this.LEADERS;
      if (!L) { return 0; }
      var fit = 0, i, post, id, f;
      for (i = 0; i < L.POSTS.length; i++) {
        post = L.POSTS[i];
        id = Q['post_' + post];
        f = id ? L.FIG[id] : null;
        if (f && !L.gone(Q, id)) { fit += (f.fit && f.fit[post]) || 0; }
      }
      var anger = Math.max(Q.mood_uha || 0, Q.mood_chuu || 0,
                           Q.mood_chusa || 0, Q.mood_saha || 0);
      //  怒りが 85（開幕の右派）で約六割、100 を超えると五割五分で底を打つ
      var unity = 1 - Math.min(0.45, anger / 220);
      var inc = (fit / this.CAPITAL_PER_FIT) * unity * this.seatScale(Q) * this.diff(Q).income;
      //  研修機関・政策集団からの定常の入り。0.5 で「二手に一つ」。
      //  人事の当たり外れに関わらず入るので、線を保つ側の札になる。
      inc += (Q.capital_extra || 0);
      Q.capital_in = Math.round(inc * 100) / 100;
      Q.capital_acc = (Q.capital_acc || 0) + inc;
      var pay = Math.floor(Q.capital_acc);
      if (pay > 0) {
        Q.capital_acc = Math.round((Q.capital_acc - pay) * 100) / 100;
        Q.capital += pay;
      }
      return Q;
    },

    upkeep: function (Q) {
      var cost = this.upkeepCost(Q);
      Q.upkeep_acc = (Q.upkeep_acc || 0) + cost;
      var pay = Math.floor(Q.upkeep_acc);
      if (pay > 0) { Q.upkeep_acc = Math.round((Q.upkeep_acc - pay) * 100) / 100; Q.budget -= pay; }
      Q.upkeep_now = Math.round(cost * 10) / 10;
      //  貯め込んだ金は県連と専従に回る。線（BUDGET_SOFT）を超えた分の一割を毎手。
      //  端数は溜めておき、整数になった分だけ引く。脇柱に説明の行がある（budget_over）。
      Q.budget_leak_now = 0;
      if (Q.budget > this.BUDGET_SOFT) {
        Q.budget_leak_acc = (Q.budget_leak_acc || 0) + (Q.budget - this.BUDGET_SOFT) * this.BUDGET_LEAK;
        var lk = Math.floor(Q.budget_leak_acc);
        if (lk > 0) {
          Q.budget_leak_acc = Math.round((Q.budget_leak_acc - lk) * 100) / 100;
          Q.budget -= lk;
          Q.budget_leak_now = lk;
        }
      }
      //  払えなければ組織が痩せる。専従を切るということである。
      if (Q.budget < 0) {
        Q.budget = 0;
        Q.members = Math.max(10000, Math.round(Q.members * 0.98));
        Q.mood_chusa += 2;
        Q.arrears = (Q.arrears || 0) + 1;
      } else if ((Q.arrears || 0) > 0 && Q.budget >= 5) {
        //  未払いは、払える状態が続けば減っていく。以前は増える一方で、
        //  第Ⅰ幕で一度詰まると、その後どれだけ金があっても
        //  「専従の給料が二か月遅れている」という事象が出続けた。
        Q.arrears -= 1;
      }
      //  政治資源の減衰。以前は全額に 0.96 を掛けて丸めていたので、
      //  12 を超えると毎手 1 減り、入りがそのまま消えて 12 に張り付いた。
      //  貯め込みを止めるのが目的なので、床より上の分だけ削る。
      var soft = this.CAPITAL_SOFT;
      if (Q.capital > soft) {
        Q.capital_dec = (Q.capital_dec || 0) +
          (Q.capital - soft) * (1 - this.CAPITAL_DECAY);
        var lose = Math.floor(Q.capital_dec);
        if (lose > 0) {
          Q.capital_dec = Math.round((Q.capital_dec - lose) * 100) / 100;
          Q.capital = Math.max(soft, Q.capital - lose);
        }
      }
      return Q;
    },

    //  金庫の向き（脇柱の表示だけに使う。盤の算術には入らない）。
    //  endturn で、手番の入り・出（分担金・党費・維持費・流失・指導部の受動効果・
    //  自治体の負担）を払う前の資金 b0 と払ったあとの差を取り、
    //  前の値 0.75・今回 0.25 で均す。札や事象で使った金は入らない。
    budgetTrend: function (Q, b0) {
      var d = (Q.budget || 0) - (b0 || 0);
      var t = (Q.budget_trend_n || 0) > 0 ? (Q.budget_trend || 0) * 0.75 + d * 0.25 : d;
      Q.budget_trend_n = (Q.budget_trend_n || 0) + 1;
      Q.budget_trend = Math.round(t * 10) / 10;
      Q.budget_trend_abs = Math.abs(Q.budget_trend);
      Q.budget_trend_dir = (Q.budget_trend >= 0.2) ? 1 : ((Q.budget_trend <= -0.2) ? -1 : 0);
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  政策 ── 政権に入ったあとの盤。
    //
    //  原ゲーム（dynamic_social_democracy）の government_affairs は
    //  二十九枚あり、在野の party_affairs 二十四枚より厚い（287KB / 148KB）。
    //  中身は「互いに排他な政策の献立」で、選んだものは
    //  upper_tax_rate や working_hours のような**残る変数**を動かす。
    //  一度きりの ±budget ではない ── だから政権を取ったあとに
    //  もう一つ別のゲームが始まる。
    //
    //  本作の政権側は、監査の時点で
    //    ・大臣の札 十二枚 × 固定効果の行動一つ（uses 3）
    //    ・政権の山 五枚 × 三択
    //    ・残る政策変数 ゼロ
    //  しかなかった。選択肢の総数は約 35 で、原ゲームの十六枚分 204 に対して
    //  六分の一である。ここに軸を置いて、その差を埋めていく。
    //
    //  政策の効き方は三つに分けてある。混ぜると必ず暴走する。
    //    構造  lean の基線をずらす（毎回計算し直すので溜まらない）
    //    経常  毎手の国家予算・組織率を少し動かす（小さく、上下限つき）
    //    一度きり  不満・党際関係の増減。これは札の側で書く
    // ══════════════════════════════════════════════════════════
    POLICY: {
      zei_high: {
        name: '对高收入与法人征税', lo: -3, hi: 3,
        //  取れば国庫は太るが、自営業者と新中間層は離れる
        lean: { jieigyo: -2.4, shinchukan: -1.5, minrou: 0.4, mishoshiki: 0.4 },
        gain: 2.4
      },
      zei_low: {
        name: '消费与间接税', lo: -3, hi: 3,
        //  一般消費税（一九七九）・売上税（一九八七）・消費税（一九八九）。
        //  この党が三度とも反対した軸である。上げれば国庫は太り、勤労者は離れる。
        lean: { mishoshiki: -2.2, minrou: -1.6, noson: -1.2, kokorou: -1.0 },
        gain: 3.2
      },
      fukushi: {
        name: '养老金与医疗给付', lo: -2, hi: 3,
        //  革新自治体の老人医療無料化を国の側でやる、という話である
        lean: { mishoshiki: 2.4, noson: 1.6, minrou: 0.8, shinchukan: 0.6 },
        gain: -3.0
      },
      kyoiku: {
        name: '文部省与日教组', lo: -3, hi: 3,
        //  ＋が現場の裁量、−が上からの管理。勤評・学テ・主任制の軸。
        //  支持組織の相手側の長官席に座る、という矛盾がここに出る。
        lean: { shinchukan: 0.8, mishoshiki: 0.4 },
        org: { kokorou: 0.004 }, gain: -0.6
      },
      nosei: {
        name: '米价与粮食管理', lo: -3, hi: 3,
        //  ＋が生産者米価、−が消費者米価。農村はこの党がいちばん薄い層である。
        lean: { noson: 3.0, jieigyo: 0.5, mishoshiki: -1.4, shinchukan: -1.0 },
        gain: -2.2
      },
      kokutetsu: {
        name: '国铁的处置', lo: -3, hi: 3,
        //  ＋が雇用維持、−が合理化。国労・動労は総評の中核である。
        lean: { kokorou: 1.6, minrou: 0.4 },
        org: { kokorou: 0.005 }, gain: -2.6
      },
      sanmin: {
        name: '产业民主主义', lo: 0, hi: 3,
        //  労働者の経営参加。原ゲームの economic_democracy に当たる。
        //  経営の側は必ず反対する。中小の自営業者ほど強く反対する。
        lean: { minrou: 2.2, kokorou: 0.8, shinchukan: 0.4, jieigyo: -1.2 },
        org: { minrou: 0.006 }, gain: -1.0
      },
      boei: {
        name: '自卫队与安保的处置', lo: -3, hi: 3,
        //  ＋が現実路線（合憲・容認）、−が違憲堅持。
        //  非武装中立を掲げたまま防衛庁の書類に署名できるか、という軸。
        lean: { shinchukan: 1.8, jieigyo: 0.8, mishoshiki: -0.6 },
        gain: 0
      },
      keisatsu: {
        name: '警察与公安', lo: -3, hi: 3,
        //  ＋が民主的統制（公安調査の縮小・情報公開・自治体警察）、
        //  −が治安の強化。左の線で国体に手を付けるなら、
        //  警察を先に直しておかないと向こう側の道具になる。
        lean: { mishoshiki: 1.2, shinchukan: 0.9, jieigyo: -0.8, noson: -0.9 },
        gain: -0.8
      },
      kazoku: {
        name: '家族法（夫妇别姓・非婚生子）', lo: -3, hi: 3,
        //  ＋が民法改正の側。選択的夫婦別姓は法制審が一九九六年に答申するが、
        //  要求としては八十年代に出ている（女性差別撤廃条約の批准が一九八五年）。
        //  土井たか子が委員長になるのが一九八六年である。
        //  都市の新中間層は取れるが、農村と自営業の「家」の側は離れる。
        lean: { shinchukan: 2.2, mishoshiki: 1.4, noson: -2.0, jieigyo: -1.4 },
        gain: 0
      },
      seiteki: {
        name: '性少数者的权利', lo: 0, hi: 3,
        //  原ゲームの homosexual_rights に当たる軸。ただし向こうは
        //  §175 の廃止という現に在った運動で、SPD はその側に立っていた。
        //  日本でこれが政治の卓に載るのは一九九一年の府中青年の家事件
        //  （東京都の宿泊拒否、OCCUR が提訴し一九九四年に勝つ）からで、
        //  同性間のパートナーシップまで踏み込む党は一つも無かった。
        //  軸の遠い端はそういう場所である ── 取れば都市で少し、
        //  農村と自営業で多く失い、党内の右も落ち着かない。
        lean: { shinchukan: 1.6, mishoshiki: 0.6, noson: -1.6, jieigyo: -1.2 },
        gain: 0
      },
      shinei: {
        name: '与各阵营的距离', lo: -3, hi: 3,
        //  ＋が西側（日米安保の維持・運用）、−が東側（ソ連・中国との関係）。
        //  非武装中立を掲げた党が、外務省の実務で毎日答えを出す軸である。
        //  西へ寄れば都市の浮動層は戻り、官公労と未組織は党を選ぶ理由を失う。
        lean: { shinchukan: 1.8, jieigyo: 1.0, kokorou: -1.6, mishoshiki: -1.0 },
        gain: 0
      },
      ajia: {
        name: '亚洲外交的比重', lo: 0, hi: 3,
        //  日中国交正常化（一九七二）、賠償と円借款、アジア開発銀行（一九六六）。
        //  取れば貿易と雇用に効くが、国庫からは出ていく。
        //  賠償と円借款は国庫から出ていき、繊維と農産物は入ってくる。
        lean: { minrou: 1.6, mishoshiki: 1.0, shinchukan: 0.8, jieigyo: 0.4, noson: -0.8 },
        gain: -2.0
      },
      tsusho: {
        name: '通商的宽度', lo: 0, hi: 3,
        //  ココム規制の枠内に留まるか、社会主義圏との貿易を広げるか。
        //  日中貿易・日ソ貿易の拡大はこの党が一貫して求めていた。
        //  ただし自由化は農産物にも来る ── 農村はここでいちばん失う。
        lean: { minrou: 2.0, kokorou: 0.6, noson: -2.4, jieigyo: -1.0 },
        gain: 1.6
      }
    },
    POLICY_KEYS: ['zei_high', 'zei_low', 'fukushi', 'kyoiku', 'nosei',
                  'kokutetsu', 'sanmin', 'boei',
                  'kazoku', 'seiteki', 'shinei', 'ajia', 'tsusho', 'keisatsu'],

    //  領域ごとの冷却。原ゲームは fiscal_policy_timer / labor_rights_timer の
    //  ように札ごとに別々の時計を持っている。全体の action_timer 一本だと
    //  「今期は税制を触ったから福祉は来期」という選択が生まれない。
    POLICY_TIMERS: ['t_zei', 't_fukushi', 't_kyoiku', 't_nosei', 't_kokutetsu',
                    't_sanmin', 't_boei', 't_keizai', 't_gaikou', 't_rodo',
                    't_kazoku', 't_seiteki', 't_tsusho', 't_kyogi', 't_keisatsu'],


    // ══════════════════════════════════════════════════════════
    //  閣外の政策協議
    //
    //  監査で、政権に入るのは第Ⅳ・Ⅴ幕が 83% だった。組閣の門は
    //  史実どおり固い（自民は一九九三年まで過半を割らない）ので、
    //  そこを緩めると議席の膨張を直した意味が消える。
    //
    //  だから別の入口を作る。原ゲームの dealing_with_toleration が
    //  同じことをしている ── SPD は政権に入らずにブリューニング内閣を
    //  「容認」し、その札で九つの選択肢を持っていた。
    //
    //  この党の史実にも同じものがある：
    //    公害国会（一九七〇）      野党の修正要求が通って十四法案
    //    予算の修正協議            組み替え動議から実際の修正へ
    //    社公民路線（八十年代）    政策協定を先に作る
    //    議員立法                  野党が出して通した法律
    //
    //  てこの大きさは議席と、公明・民社との窓口で決まる。
    //  通るのは政権にいるときの半分で、相手の機嫌次第で通らない。
    // ══════════════════════════════════════════════════════════
    KYOGI_MIN_ACT: 3,
    kyogiPower: function (Q) {
      if (Q.in_power) { return 0; }
      if ((Q.act || 1) < this.KYOGI_MIN_ACT) { return 0; }
      //  卸は「過半に近いか」ではない。修正協議の卓に呼ばれるのは
      //  野党第一党であるかである ── 一九七〇年の公害国会でこの党は
      //  九十議席しか持っていなかったが、十四法案の修正を通している。
      //  （初版は過半の 55% を要求していて、議席の中央値 135 では
      //   ちょうど門の下に入り、七十二局で札が十四回しか出なかった。）
      var other = Math.max(Q.res_minsha || 0, Q.res_komei || 0, Q.res_kyosan || 0);
      if ((Q.seats_hr || 0) <= other) { return 0; }
      //  窓口。公明と民社のどちらかが開いていること
      var win = ((Q.rel_komei || 0) >= 10 ? 1 : 0) + ((Q.rel_minsha || 0) >= -10 ? 1 : 0);
      if (!win) { return 0; }
      var p = 1;
      if (win === 2) { p += 1; }
      //  議席の厚み。過半の半分を越えたら修正の重みが増す
      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      var share = (Q.seats_hr || 0) / maj;
      if (share >= 0.50) { p += 1; }
      if (share >= 0.70) { p += 1; }
      //  社公民の線に乗っているとさらに通りやすい
      if (Q.shakomin) { p += 1; }
      return Math.max(0, Math.min(4, p));
    },

    //  政策を実際に通す。政権にいれば書いたとおり、閣外の協議なら
    //  半分しか通らず、てこが細ければ突き返される。
    //  すべての政策の札はこれを通す ── 二つの入口で内容を共有するため。
    enact: function (Q, key, delta) {
      var p = this.POLICY[key];
      if (!p) { Q.enact_result = 0; return 0; }
      if (Q.in_power) {
        Q.enact_mode = 1;
        Q.enact_result = 1;
        Q.enact_moved = this.setPolicy(Q, key, delta);
        return Q.enact_moved;
      }
      var lev = this.kyogiPower(Q);
      Q.enact_mode = 2;
      Q.kyogi_power = lev;
      if (lev <= 0) { Q.enact_result = 0; Q.enact_moved = 0; return 0; }
      //  てこが 1 なら一目盛りに届かないことがある。2 以上なら半分は通る。
      var want = delta > 0 ? Math.ceil(delta / 2) : Math.floor(delta / 2);
      if (want === 0) { want = delta > 0 ? 1 : -1; }
      if (lev === 1 && Math.abs(delta) < 2) {
        //  一目盛りの要求を細いてこで出すと、通らずに資源だけ減る
        Q.enact_result = 0; Q.enact_moved = 0;
        Q.capital = Math.max(0, (Q.capital || 0) - 1);
        return 0;
      }
      Q.enact_result = 1;
      Q.enact_moved = this.setPolicy(Q, key, want);
      //  自民に呼んだ回数。一九九三年の分裂の大きさがこれを読む。
      Q.kyogi_won = (Q.kyogi_won || 0) + 1;
      //  相手の党の顔を立てないと次が無い
      Q.rel_komei = (Q.rel_komei || 0) + 1;
      Q.rel_minsha = (Q.rel_minsha || 0) + 1;
      return Q.enact_moved;
    },

    //  政策を動かす。挟んでから、動いた分だけ返す（札が一度きりの
    //  代償を書けるように）。
    setPolicy: function (Q, key, delta) {
      var p = this.POLICY[key];
      if (!p) { return 0; }
      var k = 'pol_' + key;
      var was = Q[k] || 0;
      var now = Math.max(p.lo, Math.min(p.hi, was + delta));
      Q[k] = now;
      Q.pol_moved = key;
      return now - was;
    },

    //  構造の効き ── その層の基線を政策の分だけずらす。
    //  baselineLean から呼ぶので、毎回計算し直しになる（溜まらない）。
    policyLean: function (Q, l) {
      var i, k, p, v, sum = 0;
      for (i = 0; i < this.POLICY_KEYS.length; i++) {
        k = this.POLICY_KEYS[i];
        v = Q['pol_' + k] || 0;
        if (!v) { continue; }
        p = this.POLICY[k];
        if (p.lean && p.lean[l]) { sum += p.lean[l] * v; }
      }
      return sum;
    },

    //  経常の効き ── 毎手の国庫と組織率。小さく、上下限つき。
    //  政権を降りても政策は残る（法律は残る）が、国庫の出入りは
    //  政権にいるあいだだけこちらの帳簿に載る。
    policyTick: function (Q) {
      var i, k, p, v, l, net = 0;
      for (i = 0; i < this.POLICY_TIMERS.length; i++) {
        k = this.POLICY_TIMERS[i];
        if ((Q[k] || 0) > 0) { Q[k] -= 1; }
      }
      for (i = 0; i < this.POLICY_KEYS.length; i++) {
        k = this.POLICY_KEYS[i];
        v = Q['pol_' + k] || 0;
        if (!v) { continue; }
        p = this.POLICY[k];
        if (p.gain) { net += p.gain * v; }
        if (p.org) {
          for (l in p.org) {
            if (!p.org.hasOwnProperty(l)) { continue; }
            Q['orgb_' + l] = Math.max(0, Math.min(0.75,
              (Q['orgb_' + l] || 0) + p.org[l] * v));
          }
        }
      }
      Q.pol_net = Math.round(net * 10) / 10;
      if (Q.in_power) {
        Q.national_budget = Math.max(-60, Math.min(120,
          (Q.national_budget || 0) + net));
      }
      return Q;
    },

    //  政策の目盛りを符号なしで言うための向きの語（N5 の手直し）。[＋の側, −の側]。
    //  どちらが＋かは上の POLICY の注のとおり。0 から上にしか動かない軸は＋の側だけ使う。
    POLICY_SIDE: {
      zei_high: ['偏向加重', '偏向减轻'],
      zei_low: ['偏向加重', '偏向减轻'],
      fukushi: ['偏向提高', '偏向削减'],
      kyoiku: ['偏向基层自主', '偏向上级管控'],
      nosei: ['偏向生产者米价', '偏向消费者米价'],
      kokutetsu: ['偏向保障就业', '偏向合理化'],
      sanmin: ['偏向推进', '偏向推进'],
      boei: ['偏向现实路线', '偏向违宪论'],
      keisatsu: ['偏向民主监督', '偏向强化治安'],
      kazoku: ['偏向修改民法', '偏向维持现行民法'],
      seiteki: ['偏向承认', '偏向承认'],
      shinei: ['偏向西方', '偏向东方'],
      ajia: ['偏向加大', '偏向加大'],
      tsusho: ['偏向扩大', '偏向扩大']
    },

    //  政策の一覧。サイドバーに出す。動いている軸だけ書く。
    //  目盛りは「重い側に 2」のように向きの語と数で言う（符号の付いた数は出さない）。
    policyBlock: function (Q) {
      var i, k, p, v, s, out = [], n = 0;
      for (i = 0; i < this.POLICY_KEYS.length; i++) {
        k = this.POLICY_KEYS[i];
        v = Q['pol_' + k] || 0;
        if (!v) { continue; }
        p = this.POLICY[k];
        s = this.POLICY_SIDE[k] || ['', ''];
        n += 1;
        out.push('<span style="opacity:.8">' + p.name + '</span>　'
          + (v > 0 ? '<span style="color:#3E6E8C;">' : '<span style="color:#B23A34;">')
          + (v > 0 ? s[0] : s[1]) + ' ' + Math.abs(v) + '</span>');
      }
      if (!n) { return '<span style="opacity:.5">尚无通过的法令。</span>'; }
      return out.join('<br>');
    },

    //  ── 協会の掌握度の天井 ────────────────────────────────
    //  組織局長が誰か、党がどの帯を走っているかで、協会が握れる高さは決まる。
    //  以前は毎手の増減だけで上限が 100 だったので、組織局長が左派なら
    //  帯4（民主社会主義）を走っていても +1/手 で、何もしない局でも
    //  三十八 → 一〇〇 に張り付いた（二十一手で上限。実測）。
    //  掌握度は 27 の事象の門であり、congressRoute の引きでもあり、
    //  中間右派の出口の条件でもあるので、張り付くと盤の半分が固定される。
    KYOKAI_CAP: { saha: 92, chusa: 66, muha: 55, chuu: 40, uha: 26 },
    kyokaiCap: function (Q) {
      var org = this.factionOf(Q.post_org);
      var cap = (this.KYOKAI_CAP[org] === undefined) ? 60 : this.KYOKAI_CAP[org];
      cap += ({ 1: 8, 2: 0, 3: -12, 4: -20 })[this.bandOf(Q)];
      //  独立した派閥になれば、同じ人事でももう少し高く握れる。
      if (Q.saha_independent) { cap += 8; }
      return clamp(cap, 0, 100);
    },

    postEffects: function (Q) {
      var org = this.factionOf(Q.post_org);
      if (org === 'saha') { Q.kyokai_grip += 3; }
      else if (org === 'chusa') { Q.kyokai_grip += 1; }
      else if (org === 'chuu') { Q.kyokai_grip -= 2; }
      else if (org === 'uha') { Q.kyokai_grip -= 3; }
      //  路線そのものも協会の掌握度を動かす。左に寄れば協会の言葉が党の言葉に
      //  なり、右に寄れば居場所が狭くなる。
      Q.kyokai_grip += ({ 1: 1.5, 2: 0, 3: -1, 4: -2 })[this.bandOf(Q)];
      //  天井を超えた分は毎手そこへ戻す。協会規制で下げたぶんは、
      //  天井までは自然に戻ってくるが、天井そのものは人事と路線でしか動かない。
      var cap = this.kyokaiCap(Q);
      Q.kyokai_cap = cap;
      if (Q.kyokai_grip > cap) { Q.kyokai_grip = Math.max(cap, Q.kyokai_grip - 3); }
      Q.kyokai_grip = clamp(r1(Q.kyokai_grip), 0, 100);

      //  新左派の活動度も同じ形。青年部長が協会系なら +2/手 で 100 に
      //  張り付いていた（脇柱に出るだけの値だが、出る以上は動くべきである）。
      var youth = this.factionOf(Q.post_youth);
      if (youth === 'saha') { Q.nl_activity += 2; }
      else if (youth === 'chuu') { Q.nl_activity -= 1; }
      var nlCap = ({ saha: 78, chusa: 55, muha: 45, chuu: 30, uha: 22 })[youth];
      if (nlCap === undefined) { nlCap = 50; }
      if (Q.nl_activity > nlCap) { Q.nl_activity = Math.max(nlCap, Q.nl_activity - 2); }
      Q.nl_activity = clamp(Q.nl_activity, 0, 100);

      // 委員長の派閥は、その派閥の不満をなだめる
      var chair = this.factionOf(Q.post_chair);
      if (chair) { Q['mood_' + chair] = clamp(Q['mood_' + chair] - 2, 0, 160); }
    },



    // ══════════════════════════════════════════════════════════
    //  時代の潮流。すべて実データで校正した。
    //   ・推定組織率  厚労省 労働組合基礎調査（1958=32.7 → 1969=35.2 → 1993=24.2）
    //   ・衆院定数    実際の各総選挙時の値
    //   ・傾向の基線  史実の得票率曲線から逆算（平均誤差 0.74 得票%）
    // ══════════════════════════════════════════════════════════
    ORG_RATE: { 1958: 32.7, 1960: 32.2, 1963: 34.7, 1967: 34.1, 1969: 35.2, 1972: 34.3,
                1976: 33.7, 1979: 31.6, 1980: 30.8, 1983: 29.7, 1986: 28.2, 1990: 25.2, 1993: 24.2 },
    HR_TOTAL:  { 1958: 467, 1960: 467, 1963: 467, 1967: 486, 1969: 486, 1972: 491,
                 1976: 511, 1979: 511, 1980: 511, 1983: 511, 1986: 512, 1990: 512, 1993: 511 },

    POP_1959: { noson: 30, jieigyo: 18, kokorou: 8, minrou: 12, mishoshiki: 18, shinchukan: 14 },
    POP_1993: { noson: 7, jieigyo: 13, kokorou: 6, minrou: 13, mishoshiki: 25, shinchukan: 36 },
    BASE_ORG: { kokorou: 0.90, minrou: 0.60, mishoshiki: 0.12, jieigyo: 0.00, noson: 0.03, shinchukan: 0.20 },
    LEAN_1959: { kokorou: 71, minrou: 59, mishoshiki: 41, jieigyo: 20, noson: 14, shinchukan: 37 },
    LEAN_1993: { kokorou: 38.4, minrou: 18.6, mishoshiki: 13.6, jieigyo: 7.4, noson: 6.2, shinchukan: 12.4 },

    FRONT: 0.55,          // 侵食は前倒し。1960年代に民社・公明が野党票を割った
    DECAY: 0.18,          // 毎手、基線へ引き戻される率。押した分は放っておくと溶ける
    //  組織した層は基線そのものが上がる。左翼統一路線の本体である。
    //
    //  監査で 40 は強すぎた。organise は orgb を上げて
    //    ① baselineLean を ORG_LEAN_PULL × orgb だけ持ち上げ（最大 +30）
    //    ② allocate の議席重みも ORG_SEAT_BONUS × org で上げる
    //  と二重に効き、しかも erode が引き戻す先の基線そのものが
    //  上がっているので「押した分が溶けない」唯一の梶子になっていた。
    //  結果、无作為に近い打ち手でも議席が史実の 1.5〜2.5 倍に膞らみ、
    //  一九七二年以降は自民が割れなくても非自民が過半を越えていた。
    ORG_LEAN_PULL: 22,
    ORGB_DECAY: 0.022,    // 築いた組織も潮に削られる（全期間）
    MEMBER_CAP: 300000,

    yearOf: function (Q) { return Q.year || 1959; },

    //  公明党。衆院初進出は1967年。史実の得票率をそのまま目標に置き、
    //  都市の層から社会55:自民45で取る。プレイヤーの手では動かない
    //  （動かせるのは rel_komei ＝ 連立の算術のほうだけ）。
    KOMEI_SHARE: { 1967: 5.4, 1969: 10.9, 1972: 8.5, 1976: 10.9, 1979: 9.8,
                   1980: 9.0, 1983: 10.1, 1986: 9.4, 1990: 8.0, 1993: 8.1 },
    KOMEI_LAYERS: { mishoshiki: 0.42, shinchukan: 0.34, minrou: 0.10, jieigyo: 0.14 },

    //  共産党。公明と同じ形で史実の得票率を目標に置く。
    //
    //  これを入れるまで、共産の得票率は 2.57〜3.16% に張り付いていた。
    //  SEAT_THRESHOLD が 3.0 なので adj = max(0, share - 3.0) がほとんど零になり、
    //  十二回の総選挙で**一議席も取らなかった**。
    //  史実の日共は一九七二年 38、一九七九年 39 議席である。
    //  議席図で共産の色が一度も出ないし、非自民の算術にも効いていた。
    KYOSAN_SHARE: { 1960: 2.9, 1963: 4.0, 1967: 4.8, 1969: 6.8, 1972: 10.5,
                    1976: 10.4, 1979: 10.4, 1980: 9.8, 1983: 9.3, 1986: 8.8,
                    1990: 8.0, 1993: 7.7 },
    //  日共の票は都市の未組織と新中間層が中心で、
    //  官公労の一部と中小の自営業者が続く。
    KYOSAN_LAYERS: { mishoshiki: 0.40, shinchukan: 0.30, kokorou: 0.15, jieigyo: 0.15 },

    applyKyosan: function (Q, year) {
      var want = this.KYOSAN_SHARE[year];
      if (!want) { return Q; }
      var l, w, popShare, target, cur, add;
      //  社共合同のあと。共産党は盤の外に無い。史実の得票率を置き直すと
      //  合同した党から票が出て行くので、ここで止める。
      if (Q.kyosan_merged) {
        for (l in this.KYOSAN_LAYERS) {
          if (this.KYOSAN_LAYERS.hasOwnProperty(l)) { Q['lean_' + l + '_kyosan'] = 0; }
        }
        return Q;
      }
      for (l in this.KYOSAN_LAYERS) {
        if (!this.KYOSAN_LAYERS.hasOwnProperty(l)) { continue; }
        w = this.KYOSAN_LAYERS[l];
        popShare = Q['pop_' + l] / 100;
        target = popShare > 0 ? (want * w / popShare) : 0;
        cur = Q['lean_' + l + '_kyosan'] || 0;
        add = target - cur;
        Q['lean_' + l + '_kyosan'] = target;
        //  共産が伸びる分は主に社会党から来る。
        //  左翼的受け皿の争いは、この盤でも同じである。
        //  自民からも引くと、正規化の希釈と二重になって
        //  自民が六十議席落ち、非自民の過半が一九六九年から常態になった。
        //  日共が伸びたのは主に社会党の側からである。
        if (add > 0) {
          Q['lean_' + l + '_shakai'] = Math.max(0, Q['lean_' + l + '_shakai'] - add * 0.95);
        }
      }
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  二つの新しい終わり方。
    //
    //  社共合同 ── 一九七六年の査問問題で共産党に党首の公選を促し、
    //  宮本顕治が退いて上田耕一郎が委員長になった盤でだけ、東欧のあとに
    //  開く。共産党の議席と票と党員をこちらへ畳む。畳み切れない分は
    //  「その他」へ落ちる（付いてこない党員は無所属で立つ）。
    //
    //  非自民の新党 ── 右の帯で、右寄りの委員長が居て、連合ができたあと。
    //  民社党と社民連を畳み、公明党とは統一会派を組む。党名は
    //  民主党か社会民主党で、民社党の側の付いてくる率が変わる。
    // ══════════════════════════════════════════════════════════
    mergeKyosan: function (Q, mode) {
      var neu = (mode !== 'absorb');
      var keep = neu ? 0.85 : 0.70;
      var i, l, v, k = Q.res_kyosan || 0, take = Math.round(k * keep);
      Q.seats_hr = (Q.seats_hr || 0) + take;
      Q.res_shakai = Q.seats_hr;
      Q.res_kyosan = 0;
      Q.res_other = (Q.res_other || 0) + (k - take);
      var hk = Q.hc_kyosan || 0, ht = Math.round(hk * keep);
      //  共産のその回（直前の参院選）の当選のうち付いてくる分。付いてくる ht のうちこれだけが次の参院選でも
      //  非改選として残り、残り（ht − wt）は前の回の当選なので次の参院選で改選になる（D3）
      var wk = this.hcNonup(Q, 'kyosan'), wt = Math.min(ht, Math.round(wk * keep));
      Q.seats_hc = (Q.seats_hc || 0) + ht;
      Q.hc_shakai = Q.seats_hc;
      Q.hc_kyosan = 0;
      Q.hc_other = (Q.hc_other || 0) + (hk - ht);
      //  非改選の控え：付いてきた分は社会党のその回の当選（hc_last_won）へ、付いてこない分は「その他」へ。
      //  D2 は全部を「その他」へ移し、社会党の hc_last_won を増やさなかったので、合同で来た参院議員が
      //  次の参院選で消えていた（D3 で直した）
      Q.hcw_other = this.hcNonup(Q, 'other') + (wk - wt); Q.hcw_kyosan = 0;
      Q.hc_last_won = (Q.hc_last_won || 0) + wt;
      Q.hc_mine_seen = Q.seats_hc;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        v = Q['lean_' + l + '_kyosan'] || 0;
        Q['lean_' + l + '_shakai'] = (Q['lean_' + l + '_shakai'] || 0) + v * keep;
        Q['lean_' + l + '_other'] = (Q['lean_' + l + '_other'] || 0) + v * (1 - keep);
        Q['lean_' + l + '_kyosan'] = 0;
        //  畳んだぶんは基線にも積む。押して積んだ分ではなく党の身体なので、
        //  erode で溶けてはいけない（溶けると合同前の支持率へ戻る）。
        Q['merged_' + l] = (Q['merged_' + l] || 0) + v * keep;
      }
      //  合同で入ってきた議員は、共産党系という派閥になる。
      //  協会に混ぜないのは、この人たちが持ってきた線が協会のものとは
      //  別だからである ── 大会でも、別の重みで数える。
      Q.seat_kyosan = (Q.seat_kyosan || 0) + take;
      //  共産党は議席の割に組織が大きい。入ってくる党員（六万〜九万）を
      //  党員千人で一票という他所と同じ換算で代議員に直して足す。
      Q.del_kyosan = (Q.del_kyosan || 0) + Math.round(take * 0.6) + (neu ? 90 : 60);
      Q.members = (Q.members || 0) + (neu ? 90000 : 60000);
      //  全労連は党の側の組織になる。
      if (Q.reorg_done) {
        Q.u_zenrokyo = (Q.u_zenrokyo || 0) + (Q.u_zenroren || 0);
        Q.u_zenroren = 0;
      }
      Q.kyosan_merged = 1;
      Q.gassho_new = neu ? 1 : 0;
      Q.gassho_kind = neu ? 'new' : 'absorb';
      Q.gassho_year = Q.year || 1990;
      Q.party_name = neu ? '统一社会党' : '社会党';
      Q.rel_kyosan = 100;
      Q.kyosan_haijo = 0;
      Q.rel_komei = (Q.rel_komei || 0) - 30;
      Q.rel_minsha = (Q.rel_minsha || 0) - 35;
      Q.rel_sohyo = (Q.rel_sohyo || 0) + 6;
      Q.mood_uha = (Q.mood_uha || 0) + (neu ? 30 : 24);
      Q.mood_chuu = (Q.mood_chuu || 0) + (neu ? 22 : 16);
      Q.mood_saha = Math.max(0, (Q.mood_saha || 0) - 20);
      Q.kyokai_grip = Math.min(100, (Q.kyokai_grip || 0) + 8);
      Q.route = (Q.route || 0) - 0.5;
      this.push(Q, ['shinchukan'], neu ? -3 : -4);
      this.push(Q, ['jieigyo'], -2);
      Q.gassho_take = take;
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  野党再編
    //
    //  こちらが結集の側に回らないまま、自民が割れ、選挙制度が小選挙区に
    //  寄ると、向こうの党が一つになる。小さい党のまま小選挙区に入れば
    //  全部落ちるからである ── 史実の新進党（一九九四年）と
    //  民主党（一九九六年）は、どちらもこの理屈で出来ている。
    //
    //  枠は新しく作らない。民社党の列をそのまま作り直して名前を変える。
    //  原ゲームが中央党の列を CVP に作り直したのと同じ形である。
    // ══════════════════════════════════════════════════════════

    //  この線より小さければ、単独では小選挙区に耐えられない
    OPP_MERGE_SHARE: 0.20,

    //  新党を一つ畳んで、行き先の党へ移す。議席だけでなく、
    //  母党から借りている票もその割合ぶん移さないと、次の総選挙で
    //  票が母党へ戻ってしまい、畳んだ党が消える。
    foldSplinter: function (Q, k, to) {
      var sp = this.SPLINTER[k];
      var n = Q['res_sp_' + k] || 0;
      Q['res_sp_' + k] = 0;
      Q['sp_' + k] = 0;
      Q['spseed_' + k] = 1;
      Q['spmerged_' + k] = 1;
      if (n <= 0 || !sp) { return 0; }
      Q['res_' + to] = (Q['res_' + to] || 0) + n;
      //  母党の票のうち、この党が持って出た割合ぶんを移す
      var share = n / Math.max(1, (Q['res_' + sp.parent] || 0) + n);
      var i, l;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        this.transfer(Q, l, sp.parent, to, (Q['lean_' + l + '_' + sp.parent] || 0) * share);
      }
      return n;
    },

    //  向こうが一つになる条件。どちらか一つで足りる。
    oppMergeReady: function (Q) {
      //  こちらが先に結集していれば、向こうにまとまる相手が残らない
      if (Q.opp_merged || Q.minshu_shinto || Q.kyosan_merged) { return 0; }
      if (!Q.minsha_exists) { return 0; }
      var sp = this.allySplinterSeats(Q);
      if (sp <= 0) { return 0; }                //  自民がまだ割れていない
      var n = sp + (Q.res_minsha || 0) + (Q.shamin_exists ? 4 : 0);
      var small = n < Math.round((Q.hr_total || 511) * this.OPP_MERGE_SHARE);
      //  小選挙区（単純）か、小選挙区比例代表並立制
      var seido = (Q.senkyoku_seido === 1 || Q.senkyoku_seido === 6);
      return (small || seido) ? 1 : 0;
    },

    //  どちらが主導するか。保守の側が大きければ新進党になる。
    oppMergeKind: function (Q) {
      var hoshu = (Q.res_sp_shinsei || 0) + (Q.res_minsha || 0);
      var jiyu = (Q.res_sp_nihonshin || 0) + (Q.res_sp_sakigake || 0);
      return hoshu > jiyu ? 'shinshin' : 'minshuto';
    },

    //  こちらの派閥が、出来た党へ移る。
    //  中間右派と右派が、不満を抱えたまま自由派主導の党を見れば動く。
    OPP_DEFECT_LINE: 55,
    defectToOpp: function (Q, f) {
      var seat = Q['seat_' + f] || 0;
      var take = Math.round(seat * this.followRate(Q, f));
      if (take > 0) {
        Q['seat_' + f] = seat - take;
        Q.seats_hr = Math.max(0, (Q.seats_hr || 0) - take);
        Q.res_shakai = Q.seats_hr;
        Q.res_minsha = (Q.res_minsha || 0) + take;
      }
      Q['del_' + f] = 0;
      Q['mood_' + f] = 0;
      Q['defect_' + f] = 1;
      Q.opp_defect = (Q.opp_defect || 0) + take;
      Q.splits = (Q.splits || 0) + 1;
      //  票も持って行く。都市の新中間層が中心である。
      this.transfer(Q, 'shinchukan', 'shakai', 'minsha', 5);
      this.transfer(Q, 'mishoshiki', 'shakai', 'minsha', 3);
      return take;
    },

    mergeOpposition: function (Q) {
      var kind = this.oppMergeKind(Q);
      var i, k, n = 0;
      for (i = 0; i < this.SPLINTER_KEYS.length; i += 1) {
        k = this.SPLINTER_KEYS[i];
        if (!this.SPLINTER[k] || !this.SPLINTER[k].ally) { continue; }
        n += this.foldSplinter(Q, k, 'minsha');
      }
      //  社民連は「その他」の中の四議席である。向こうへ行く。
      if (Q.shamin_exists) {
        var sm = Math.min(4, Q.res_other || 0);
        Q.res_other -= sm;
        Q.res_minsha = (Q.res_minsha || 0) + sm;
        n += sm;
        Q.shamin_exists = 0;
        Q.shamin_gone = 1;          //  こちらへは戻らない
        this.transfer(Q, 'shinchukan', 'other', 'minsha', 4);
      }
      Q.opp_merged = 1;
      Q.opp_kind = kind;
      Q.opp_take = n;
      Q.opp_year = Q.year || 1993;
      Q.minsha_name = kind === 'shinshin' ? '新进党' : '民主党';
      Q.minsha_short = kind === 'shinshin' ? '新进' : '民主';
      //  事象の門は式しか書けない。文字ではなく数で持つ。
      Q.opp_shinshin = kind === 'shinshin' ? 1 : 0;
      Q.opp_minshuto = kind === 'shinshin' ? 0 : 1;
      //  保守が主導する党は、こちらから遠い。自由派の党は近い。
      if (kind === 'shinshin') {
        Q.rel_minsha = Math.min(Q.rel_minsha || 0, 10);
        Q.rel_komei = (Q.rel_komei || 0) - 10;
        Q.mood_uha = (Q.mood_uha || 0) + 8;
        Q.mood_chuu = (Q.mood_chuu || 0) + 8;
      } else {
        Q.rel_minsha = Math.max(Q.rel_minsha || 0, 40);
        Q.mood_chuu = (Q.mood_chuu || 0) + 14;
        Q.mood_uha = (Q.mood_uha || 0) + 14;
        //  自由派が主導する党には、こちらの右の側が乗れてしまう。
        //  不満が線を越えていれば、そのまま出て行く。
        var fs = ['chuu', 'uha'], j, g;
        for (j = 0; j < fs.length; j++) {
          g = fs[j];
          if (!this.inParty(Q, g)) { continue; }
          if ((Q['mood_' + g] || 0) <= this.OPP_DEFECT_LINE) { continue; }
          this.defectToOpp(Q, g);
        }
      }
      return Q;
    },

    //  自社連立に入る。民社党化した党が、自民党が過半を割った選挙のあとに組む。
    //  首班は取れない。総評と協会は離れ、同盟の系譜と自民との窓口が残る。
    enterJisha: function (Q) {
      var C = this.CAB;
      Q.jisha_pact = 1; Q.jisha_cabinet = 1; Q.jisha_lost = 0;
      Q.jisha_year = Q.year || 1983;
      Q.cab_route = 4; Q.cab_nonldp = (Q.seats_hr || 0) + (Q.res_jimin || 0); Q.act_power = 1;
      if (C) { C.enterPower(Q, 4); }
      Q.rel_jimin = Math.max(Q.rel_jimin || 0, 40);
      Q.rel_kyosan = Math.min(Q.rel_kyosan || 0, -60);
      Q.rel_komei = (Q.rel_komei || 0) - 12;
      Q.rel_minsha = (Q.rel_minsha || 0) + 10;
      Q.rel_sohyo = (Q.rel_sohyo || 0) - 25;
      Q.rel_domei = (Q.rel_domei || 0) + 20;
      Q.mood_saha = (Q.mood_saha || 0) + 35;
      Q.mood_chusa = (Q.mood_chusa || 0) + 15;
      Q.mood_uha = Math.max(0, (Q.mood_uha || 0) - 15);
      Q.kyokai_grip = Math.max(0, (Q.kyokai_grip || 0) - 20);
      Q.route = (Q.route || 0) + 0.5;
      this.push(Q, ['minrou', 'jieigyo'], 3);
      this.push(Q, ['kokorou'], -4);
      return Q;
    },

    mergeMinshu: function (Q, name) {
      var wide = (name !== '社会民主党');
      var i, l, v, k, take = 0, keep = wide ? 0.85 : 0.65;
      //  民社党が乗るかどうかは関係で決まる。乗らなければ外に残る
      //  ── 右派の系譜もそのまま党の外である。
      if (Q.minsha_exists && this.cabRelOk(Q, 'minsha')) {
        k = Q.res_minsha || 0; take = Math.round(k * keep);
        Q.seats_hr = (Q.seats_hr || 0) + take;
        Q.res_shakai = Q.seats_hr;
        Q.res_minsha = 0;
        Q.res_other = (Q.res_other || 0) + (k - take);
        var hk = Q.hc_minsha || 0, ht = Math.round(hk * keep);
        //  民社のその回の当選のうち付いてくる分（mergeKyosan と同じ。D3）
        var wk = this.hcNonup(Q, 'minsha'), wt = Math.min(ht, Math.round(wk * keep));
        Q.seats_hc = (Q.seats_hc || 0) + ht;
        Q.hc_shakai = Q.seats_hc;
        Q.hc_minsha = 0;
        Q.hc_other = (Q.hc_other || 0) + (hk - ht);
        //  非改選の控え：付いてきた分は社会党の hc_last_won へ、付いてこない分は「その他」へ（D3。D2 は全部「その他」）
        Q.hcw_other = this.hcNonup(Q, 'other') + (wk - wt); Q.hcw_minsha = 0;
        Q.hc_last_won = (Q.hc_last_won || 0) + wt;
        Q.hc_mine_seen = Q.seats_hc;
        for (i = 0; i < LAYERS.length; i++) {
          l = LAYERS[i];
          v = Q['lean_' + l + '_minsha'] || 0;
          Q['lean_' + l + '_shakai'] = (Q['lean_' + l + '_shakai'] || 0) + v * keep;
          Q['lean_' + l + '_other'] = (Q['lean_' + l + '_other'] || 0) + v * (1 - keep);
          Q['lean_' + l + '_minsha'] = 0;
          Q['merged_' + l] = (Q['merged_' + l] || 0) + v * keep;
        }
        Q.seat_uha = (Q.seat_uha || 0) + take;
        Q.del_uha = (Q.del_uha || 0) + Math.round(take * 0.6);
        Q.minsha_exists = 0;
        Q.minsha_merged = 1;
        Q.mood_uha = 0;
      }
      //  社民連は「その他」の中に居る。四議席と都市の票を戻す。
      if (Q.shamin_exists) {
        var s = Math.min(4, Q.res_other || 0);
        Q.seats_hr += s; Q.res_shakai = Q.seats_hr; Q.res_other -= s;
        //  畳んだ票は基線にも積む。ここを積まないと、押して積んだ分と
        //  同じ扱いになって erode が毎手削り、合流した意味が消える。
        Q.merged_shinchukan = (Q.merged_shinchukan || 0)
          + this.transfer(Q, 'shinchukan', 'other', 'shakai', 5);
        Q.merged_mishoshiki = (Q.merged_mishoshiki || 0)
          + this.transfer(Q, 'mishoshiki', 'other', 'shakai', 3);
        Q.seat_chuu = (Q.seat_chuu || 0) + s;
        Q.shamin_exists = 0;
        Q.shamin_merged = 1;
        Q.mood_chuu = 0;
      }
      Q.rel_minsha = 100;
      Q.rel_komei = Math.max(Q.rel_komei || 0, 60);
      Q.komei_kaiha = 1;
      Q.rel_rengo = (Q.rel_rengo || 0) + 20;
      Q.rel_sohyo = (Q.rel_sohyo || 0) - 10;
      Q.rel_kyosan = Math.min(Q.rel_kyosan || 0, -40);
      Q.members = (Q.members || 0) + (wide ? 20000 : 12000);
      this.push(Q, ['shinchukan'], wide ? 8 : 6);
      this.push(Q, ['mishoshiki'], wide ? 5 : 4);
      this.push(Q, ['jieigyo'], wide ? 3 : 2);
      Q.mood_saha = (Q.mood_saha || 0) + (wide ? 28 : 18);
      Q.mood_uha = Math.max(0, (Q.mood_uha || 0) - 20);
      Q.mood_chuu = Math.max(0, (Q.mood_chuu || 0) - 15);
      Q.kyokai_grip = Math.max(0, (Q.kyokai_grip || 0) - 15);
      Q.route = (Q.route || 0) + (wide ? 0.5 : 0.3);
      Q.seiken_junbi = (Q.seiken_junbi || 0) + 3;
      Q.minshu_shinto = 1;
      Q.minshu_wide = wide ? 1 : 0;
      //  ── 自由派 ──────────────────────────────────────
      //  細川の日本新党と新党さきがけの系譜。地方の首長と改革派である。
      //  党名がどちらでも入る ── 社会民主党という名でも、この人たちの
      //  居場所は作れる。新党が既に立っていれば、その議席も畳む。
      var sj = this.absorbSplinter(Q, 'nihonshin') + this.absorbSplinter(Q, 'sakigake');
      Q.minshu_jiyu = 1;
      Q.del_jiyu = (Q.del_jiyu || 0) + 70 + Math.round(sj * 0.6);
      Q.seat_jiyu = (Q.seat_jiyu || 0) + sj;
      //  ── 保守派 ──────────────────────────────────────
      //  自民を出てきた側。乗るかどうかは向こうとの関係で決まる。
      //  新生党が既に立っていれば、その議席も畳む。
      if (this.cabRelOk(Q, 'jimin')) {
        var sh = this.absorbSplinter(Q, 'shinsei');
        Q.minshu_hoshu = 1;
        Q.del_hoshu = (Q.del_hoshu || 0) + 70 + Math.round(sh * 0.6);
        Q.seat_hoshu = (Q.seat_hoshu || 0) + sh;
      }
      //  民社は右派、社民連は中間右派の系譜なので、そちらへ戻す（復帰）。
      Q.minshu_kind = wide ? 'minshu' : 'shamin';
      Q.minshu_year = Q.year || 1991;
      Q.party_name = name;
      Q.shinto_name = name;
      Q.minshu_take = take;
      return Q;
    },

    applyKomei: function (Q, year) {
      var want = this.KOMEI_SHARE[year];
      if (!want) { return Q; }
      Q.komei_exists = 1;
      var l, w, popShare, target, cur, add;
      for (l in this.KOMEI_LAYERS) {
        if (!this.KOMEI_LAYERS.hasOwnProperty(l)) { continue; }
        w = this.KOMEI_LAYERS[l];
        popShare = Q['pop_' + l] / 100;
        // その層で必要な傾向値 = 全国目標 × その層の担当割合 ÷ その層の人口比
        target = popShare > 0 ? (want * w / popShare) : 0;
        cur = Q['lean_' + l + '_komei'] || 0;
        add = target - cur;
        Q['lean_' + l + '_komei'] = target;
        if (add > 0) {
          Q['lean_' + l + '_shakai'] = Math.max(0, Q['lean_' + l + '_shakai'] - add * 0.55);
          Q['lean_' + l + '_jimin'] = Math.max(0, Q['lean_' + l + '_jimin'] - add * 0.45);
        }
      }
      return Q;
    },

    //  旗艦は重い。革新自治体を保有していると、財政赤字と公害行政の
    //  責任が毎手たまっていく。一九七〇年代半ばに請求書が来る。
    LOCAL_BURDEN: { tokyo: 1.5, osaka: 1.2, aichi: 1.0, hokkaido: 0.9,
                    yokohama: 0.8, hiroshima: 0.5, kyoto: 0.5, nagasaki: 0.4 },



    // ══════════════════════════════════════════════════════════
    //  時間の粒度
    //  平時は 一手＝一四半期。危機に入るとその局面だけ 一手＝一か月 に
    //  落ちる ── 同じ暦の長さに三倍の手数が入る。原ゲームの rubicon
    //  （月→週）と同じ考え方である。
    //
    //  危機は局面ごとに一度きり。入ったら残り手数を三倍にして、
    //  局面が変わるまで戻さない。
    // ══════════════════════════════════════════════════════════
    GRAIN_FINE: 1,
    CRISIS_MAX_FINE: 4,
    GRAIN_COARSE: 3,
    //  危機の理由は、名前だけでなく「何をすれば抜けるか」も持つ。
    //  脇柱の危機の面がこの二つを並べて出す。
    crisisReasons: function (Q) {
      var r = [], f;
      var fs = this.FAC_KEYS;
      var worst = 0;
      //  改憲の挿話のあいだは、これがいちばん上に立つ（挿話が明ければ消える）
      if ((Q.kaiken_ep || 0) > 0) { r.push(['修宪发议', '在表决之前，从修宪阵营拉走足够的议席']); }
      for (var i = 0; i < fs.length; i++) {
        f = fs[i];
        if (this.inParty(Q, f) && (Q['mood_' + f] || 0) > worst) { worst = Q['mood_' + f]; }
      }
      if (worst >= 92) { r.push(['有派阀站在出口跟前', '去安抚火气最大的那个派阀']); }
      if (Q.in_power && Q.cab_kind !== 1 && (Q.coalition_rel || 0) <= 25) { r.push(['联合快要垮了', '把执政党内部的关系拉回来']); }
      if (Q.act === 1 && Q.phase === 2) { r.push(['安保国会', '一直持续到这个局面结束']); }
      if (Q.act === 5 && Q.phase === 3) { r.push(['政界重编', '一直持续到这个局面结束']); }
      if (Q.in_power && (Q.national_budget || 0) < 0) { r.push(['国家预算编不出来', '把国家预算拉回黑字']); }
      if ((Q.arrears || 0) >= 20 && (Q.budget || 0) <= 1) { r.push(['党的金库空了', '补进资金，止住欠付']); }
      return r;
    },
    //  危機は「挿話」である。局面ごとに一度きり、続くのは
    //  細かく刻んだぶんの手数だけで、刻み終わったら平時に戻る。
    //
    //  以前は「理由が立っているか」という水位で見ていた。ところが
    //  crisisReasons の主因「派閣が出口の前にいる」は、路線を保つかぎり
    //  毎手同じ符号で積み上がる量なので、一度 92 を越えると局の
    //  終わりまで戻らない。監査で危機の手が中央値 50%、最大 97% になっていた
    //  つまり非常事態が常態だった。幕ごとの背景と敷き曲がそのあいだ
    //  丸ごと出なくなるのもこれが原因である。
    crisisCheck: function (Q) {
      var r = this.crisisReasons(Q);
      var on = r.length > 0;
      if (Q.crisis_on) {
        //  改憲の挿話のあいだは、刻んだ手数が尽きても危機を畳まない
        if ((Q.kaiken_ep || 0) > 0) { Q.crisis_turns_left = Math.max(Q.crisis_turns_left || 0, 2); }
        //  刻んだ手数を使い切ったら、理由が消えていなくても平時に戻る
        Q.crisis_turns_left = Math.max(0, (Q.crisis_turns_left || 0) - 1);
        if (!on || Q.crisis_turns_left <= 0) {
          this.crisisOff(Q);
        } else {
          //  理由はいまのもので出し直す（挿話が明けたら改憲の行が消える）
          this.crisisRows(Q, r);
        }
      } else if (on && !Q.crisis_used) {
        //  局面ごとに一度だけ。crisis_used は局面の境で戻る
        this.crisisEnter(Q, r);
      }
      Q.grain = Q.crisis_on ? this.GRAIN_FINE : this.GRAIN_COARSE;
      Q.grain_name = Q.grain === this.GRAIN_FINE ? '一个月' : '一个季度';
      return Q.crisis_on;
    },
    //  危機に入る。cap は細かく刻む先の手数（省けば CRISIS_MAX_FINE）。
    //  改憲の挿話は cap = 1 で、使い済み（crisis_used）でも入る（kaikenStart）。
    crisisEnter: function (Q, r, cap) {
      Q.crisis_used = 1;
      Q.crisis_on = 1;
      this.crisisRows(Q, r);
      //  「暦は同じで手数が三倍」を素直にやると、第Ⅱ幕の12手局面で
      //  +24手になってしまう。危機として細かく刻むのは先の四手ぶんまで。
      var c = (cap === undefined || cap === null) ? this.CRISIS_MAX_FINE : cap;
      Q.crisis_gain = Math.min(Q.turns_left || 0, c) * (this.GRAIN_COARSE - 1);
      //  暦は turns_left で測るので、総手数も同じだけ増やす。
      //  そうしないと危機のあいだだけ暦が先へ走る（tickYear の①）。
      //  増やしたぶん一手あたりの月数が三分の一になる ── 危機の一手が
      //  一か月になるというのは、暦の側から見るとこのことである。
      var pcfg = this.ACTS[Q.act || 1];
      var pnow = Q.phase_turns || (pcfg && pcfg.phases[(Q.phase || 1) - 1]) || Q.turns_left;
      Q.phase_turns = pnow + Q.crisis_gain;
      Q.turns_left += Q.crisis_gain;
      //  増やした手数と同じだけ続く。危機そのものが「細かい手の束」である
      Q.crisis_turns_left = Math.max(1, Q.crisis_gain);
      Q.grain = this.GRAIN_FINE;
      Q.grain_name = '一个月';
      Q.crisis_shown = 0;
      return Q;
    },
    //  帯は横に短く畳む。脇柱の面は理由ごとに一行ずつ立てる ──
    //  理由が三つ重なったとき、点で繋いだ一行は読めない。
    crisisRows: function (Q, r) {
      Q.crisis_why = r.map(function (x) { return x[0]; }).join('・');
      Q.crisis_rows = r.map(function (x) {
        return '<span class="jsp-cr-item">' + x[0] + '</span>'
          + '<span class="jsp-cr-way">' + '脱出的路' + '　' + x[1] + '</span>';
      }).join('');
      Q.crisis_n = r.length;
      return Q;
    },
    crisisOff: function (Q) {
      Q.crisis_on = 0;
      Q.crisis_why = '';
      Q.crisis_rows = '';
      Q.crisis_n = 0;
      Q.crisis_turns_left = 0;
      return Q;
    },
    //  挿話が手の途中で明けたとき（止めた・失った）。ほかの理由が残っていれば
    //  理由の行だけ出し直し、無ければそこで平時に戻す。
    crisisRecheck: function (Q) {
      if (!Q.crisis_on) { return Q; }
      var r = this.crisisReasons(Q);
      if (r.length) { this.crisisRows(Q, r); }
      else {
        this.crisisOff(Q);
        Q.grain = this.GRAIN_COARSE;
        Q.grain_name = '一个季度';
      }
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  背景
    //
    //  幕で変わり、危機のあいだだけ差し替える。事象の頁は自分で
    //  set-bg: を持っているので、そのあいだだけ上書きされ、@main に
    //  戻ったときにここが幕の絵へ戻す。
    //
    //  絵の割り当ては tools/art/manifest.json にあり、apply-art が
    //  各シーンの set-bg: を書く。ここで持つのは「幕→絵」の対応だけで、
    //  道筋は同じ art/bg/ に揃えてある。
    //
    //  雛形の setBg は毎回 fadeOut→fadeIn する。同じ絵で呼ぶと
    //  一手ごとに画面が瞬くので、state.bg と違うときだけ呼ぶ。
    // ══════════════════════════════════════════════════════════
    //  道筋は art/ からの相対で持ち、掛けるときに JSP_ART を前に付ける
    //  （絵は出力の一番上に一組だけあり、中文版は ../art/ を読む）。
    BG: {
      1: 'bg/act1.jpg',
      2: 'bg/act2.jpg',
      3: 'motif/yokkaichi.jpg',
      4: 'bg/act4.jpg',
      5: 'bg/act5.jpg',
      crisis: 'bg/crisis.jpg'
    },
    //  危機の脇柱。原ゲームの emergency_tab と同じ置き方で、
    //  危機のあいだだけ脇柱の頭に一枚増える。開いた手で一度だけそこへ移り、
    //  そのあとは読み手が好きな面に戻ってよい（勝手に引き戻さない）。
    crisisTab: function (Q) {
      try {
        var d = (typeof document !== 'undefined') && document;
        if (!d) { return; }
        var btn = d.getElementById('crisis_tab');
        if (!btn) { return; }
        btn.style.display = Q.crisis_on ? 'block' : 'none';
        if (Q.crisis_on) {
          if (!Q.crisis_shown && window.changeTab) {
            Q.crisis_shown = 1;
            window.changeTab('status.crisis', 'crisis_tab');
          }
        } else if (window.statusTab === 'status.crisis' && window.changeTab) {
          //  危機が明けたら、その面は空になるので状況へ戻す
          window.changeTab('status', 'main_tab');
        }
      } catch (e) { /* 脇柱が出ないだけなので、盤面は止めない */ }
    },

    scenery: function (Q) {
      var art = window.JSP_ART || 'art/';
      var url = art + (Q.crisis_on ? this.BG.crisis : (this.BG[Q.act] || this.BG[1]));
      try {
        //  危機の見え方は css 側で切り替える（背景の締め方と、本文の縁）。
        var b = (typeof document !== 'undefined') && document.body;
        if (b) {
          var c = b.className.replace(/\s*jsp-crisis\b/g, '');
          b.className = Q.crisis_on ? (c + ' jsp-crisis') : c;
        }
        this.crisisTab(Q);
        var ui = (typeof window !== 'undefined') && window.dendryUI;
        if (!ui) { return url; }
        var st = ui.dendryEngine && ui.dendryEngine.state;
        var now = st ? st.bg : null;
        if (st) { st.bg = url; }
        if (now !== url && ui.setBg) {
          //  雛形の setBg は fadeOut→fadeIn を jQuery の待ち行列に積む。
          //  一手が速いと積み残しが出て、絵が何手も遅れて出る。
          //  掛ける前に前の分を畳んでおく。
          var $ = window.jQuery;
          if ($) { $('#bg1').stop(true, true); $('#bg2').stop(true, true); }
          ui.setBg(url);
        }
      } catch (e) { /* 背景が出ないだけなので、盤面は止めない */ }
      this.bgm(Q);
      return url;
    },

    // ══════════════════════════════════════════════════════════
    //  底に敷く一曲
    //
    //  幕では変えない。三十四年ずっと同じ一曲を敷く ── 変わるのは
    //  党の声（合図の歌）だけで、その下の国は変わらない、という並べ方。
    //
    //  loop は使わない。コモンズの ogg は長さの見出しを持っておらず
    //  （duration が Infinity になる）、頭へ戻る動作が当てにならない。
    //  代わりに、@main を通るたびに「底が止まっていたら掛け直す」。
    //  一曲終わってから次の手までの数秒が間になるので、
    //  切れ目なく回すよりむしろ息がつける。
    //
    //  危機のあいだは黙らせる。安保国会や浅沼の合図は、
    //  空場に落ちたほうが効く。
    // ══════════════════════════════════════════════════════════
    //  二曲を交替で敷く。掛け直すたびに前と違うほうを選ぶので、
    //  同じ曲が続けて来ることは無い。
    //  一曲だけにしたいときは配列を一つにすればよい。
    BEDS: ['chitei.mp3', 'bgm_shika.ogg'],
    bgm: function (Q) {
      try {
        var U = window.dendryUI;
        if (!U || U.disable_audio) { return; }
        var pre = window.JSP_AUDIO || 'audio/';
        var a = U.currentAudio;
        //  currentAudioURL は当てにならない。雛形がそれを書くのは
        //  `if (window.updateAudio)` の中で、この作品は updateAudio を
        //  定義していないので、一番最初に掛けた一曲は記録されないまま残る。
        //  要素の src を直に見る。
        var src = (a && a.src) ? String(a.src) : '';
        //  底かどうかは BEDS の名で見る。接頭辞（bgm_）で見ていたら、
        //  底を bgm_ で始まらない曲に替えた瞬間に危機の静音が効かなくなった。
        var beds = this.BEDS || [];
        var isBed = false, bi;
        for (bi = 0; bi < beds.length; bi += 1) {
          if (src.indexOf(beds[bi]) >= 0) { isBed = true; break; }
        }
        var live = a && !a.paused && !a.ended;

        if (Q && Q.crisis_on) {
          //  U.audio('none') は使わない。あれも animate で音量を落として
          //  その後始末で pause する作りなので、待ち行列が動かない状況では
          //  いつまでも止まらない。直に止める。
          //  currentAudioURL も空にしておく ── 残しておくと、危機明けに
          //  同じ道筋で掛け直したとき「同じ曲」と見なされて待ち行列へ
          //  積まれ、鳴らないまま終わる。
          //  live（実際に鳴っているか）で絞らない。掛けた直後はまだ
          //  読み込み中で paused のことがあり、そこを見逃すと読み込みが
          //  済んだあとに鳴り出してしまう。掛かっていれば無条件に止める。
          if (isBed) {
            flushAudioFx(U);
            if (U.currentAudio) { U.currentAudio.pause(); }
            U.currentAudioURL = '';
          }
          return;
        }
        //  合図がまだ鳴っているなら邪魔しない。底が鳴っていてもそのまま。
        if (live) { return; }
        if (!beds.length) { return; }
        //  前と違うほうを掛ける。交替なので同じ曲は続かない。
        bedIx = (bedIx + 1) % beds.length;
        var next = pre + beds[bedIx];
        U.audio(next + ' nofade');
        //  雛形が書き落とす分をこちらで入れておく。残しておかないと、
        //  次に同じ道筋で掛けたときの「同じ曲か」の判定が狂う。
        U.currentAudioURL = next;
      } catch (e) { /* 音が出ないだけなので、盤面は止めない */ }
    },

    //  保存を読み込んだ直後に呼ばれる。エンジンは state.bg を戻すが、
    //  危機の体裁（body の .jsp-crisis）は戻さない。危機の最中に
    //  保存した局を読み込むと、絵だけ危機で締めが平時のままになる。
    afterLoad: function () {
      //  控えの前置きは、何かを保存できるようになる前に確定させる。
      this.fixSavePrefix();
      try {
        var ui = window.dendryUI;
        var Q = ui && ui.dendryEngine && ui.dendryEngine.state &&
                ui.dendryEngine.state.qualities;
        if (Q) { this.scenery(Q); }
      } catch (e) { /* 見た目だけの話なので、読み込みは止めない */ }
    },

    // ══════════════════════════════════════════════════════════
    //  路線帯と共闘軸
    //  カードと事象の出し分けはこの二つで行う。社公民の線を走って
    //  いるのに社共のカードが出てくる、という状態を無くすため。
    // ══════════════════════════════════════════════════════════
    ROUTE_BANDS: [
      { id: 1, key: 'saha',  name: '左（协会）',           lo: -5.1, hi: -2.5 },
      { id: 2, key: 'chusa', name: '中间左（铃木–佐佐木）', lo: -2.5, hi: -0.5 },
      { id: 3, key: 'chuu',  name: '中间右（江田）',       lo: -0.5, hi: 1.5 },
      { id: 4, key: 'uha',   name: '右（民主社会主义）',   lo: 1.5,  hi: 5.1 }
    ],
    //  境目は「以下」で取る。qdisplay（route.qdisplay.dry）の区間は
    //  dendry の getUserQDisplay が max >= value で見る閉区間なので、
    //  こちらを r < hi にしておくと、路線がちょうど −2.5 のとき
    //  脇柱は「左（協会）」と出るのに札は中間左が配られていた。
    //  路線は 0.5 刻みで動くので、この境目は普通に踏む。
    //  帯は端を共有しているから、先に当たった側（左寄り）が勝つ。
    bandOf: function (Q) {
      var r = Q.route || 0, i, b;
      for (i = 0; i < this.ROUTE_BANDS.length; i++) {
        b = this.ROUTE_BANDS[i];
        if (r >= b.lo && r <= b.hi) { return b.id; }
      }
      return r < 0 ? 1 : 4;
    },
    //  共闘軸。共産の側か、公明・民社の側か。
    //    0 未定  1 社共  2 社公民
    //  差が BLOC_LINE を超えたところで「線に乗った」とみなす。
    BLOC_LINE: 25,
    blocOf: function (Q) {
      var l = Q.rel_kyosan || 0;
      var r = ((Q.rel_komei || 0) + (Q.rel_minsha || 0)) / 2;
      if (l - r > this.BLOC_LINE) { return 1; }
      if (r - l > this.BLOC_LINE) { return 2; }
      return 0;
    },

    //  ── 革新自治体の重み ──────────────────────────────────
    //  自治体カードの効果はこれで按分する。一つ持っていても三つ持っていても
    //  同じ数字が出ていたのを直した。東京都は人口も予算も突出しており、
    //  京都府は最小。全部持てば 3.3 倍になる。
    LOCAL_W: { tokyo: 1.6, osaka: 1.4, aichi: 1.1, hokkaido: 1.0,
               yokohama: 1.0, hiroshima: 0.7, kyoto: 0.7, nagasaki: 0.6 },
    localWeight: function (Q) {
      var c, w = 0;
      for (c in this.LOCAL_W) {
        if (this.LOCAL_W.hasOwnProperty(c) && Q['local_' + c]) { w += this.LOCAL_W[c]; }
      }
      return Math.round(w * 100) / 100;
    },
    localCount: function (Q) {
      var c, n = 0;
      for (c in this.LOCAL_W) {
        if (this.LOCAL_W.hasOwnProperty(c) && Q['local_' + c]) { n += 1; }
      }
      return n;
    },
    //  自治体の枠。保有しているかぎり、局面ごとに一度は必ず切らせる。
    localPending: function (Q) {
      Q.local_n = this.localCount(Q);
      Q.local_w = this.localWeight(Q);
      this.localMult(Q); this.localDir(Q);
      //  表示用：重みと取り方を合わせた実効倍率
      Q.local_eff = Math.round(Q.local_w * (Q.local_mult || 1) * 100) / 100;
      Q.jichitai_pending = (Q.local_n > 0 && !Q.jichitai_done_phase) ? 1 : 0;
      return Q.jichitai_pending;
    },
    //  効果の按分。整数で返す（表示にそのまま出す）
    //  自治体カードの効き。保有している重み × 取り方の倍率。
    //  単独で取った自治体は重く、放任で転がり込んだ自治体は軽い。
    lw: function (Q, base) {
      return Math.round(base * this.localWeight(Q) * (this.localMult(Q) || 1) * 10) / 10;
    },
    //  毎手の積み。負担の表と保有から出す。
    localBurden: function (Q) {
      var c, d = 0;
      for (c in this.LOCAL_BURDEN) {
        if (this.LOCAL_BURDEN.hasOwnProperty(c) && Q['local_' + c]) { d += this.LOCAL_BURDEN[c]; }
      }
      return Math.round(d * 10) / 10;
    },

    //  締めで抜ける量。以前は 8×重み の定数だった。局面は十二手から
    //  十六手まであり、幕が進むほど保有も増えるので、定数では積みに
    //  追いつかない ── 「どれだけ締めても無駄」という声はここから出る。
    //  一局面ぶんの積み（毎手の負担 × その局面の手数）を物差しにする。
    localCut: function (Q, mult) {
      var w = this.localWeight(Q);
      var span = (Q.local_burden_now !== undefined ? Q.local_burden_now : this.localBurden(Q))
                 * (Q.phase_turns || 12);
      return Math.round(Math.max(8 * w, span) * (mult || 1) * 10) / 10;
    },

    accrueLocalDebt: function (Q) {
      var c, d = 0;
      for (c in this.LOCAL_BURDEN) {
        if (this.LOCAL_BURDEN.hasOwnProperty(c) && Q['local_' + c]) { d += this.LOCAL_BURDEN[c]; }
      }
      Q.local_debt = Math.round(((Q.local_debt || 0) + d) * 10) / 10;
      return Q;
    },

    // その層の基線。プレイヤーが上積みした組織率のぶんだけ持ち上がる
    //  路線が票に効く重み。右へ寄って失う分は、労働の側に厚く出る。
    //  取り返す分は都市に出るが、失う側ほど大きくない。
    //  官公労は組織率が九割、新中間層は二割。同じ 1pt でも重さが違う。
    RIGHT_LOSE: { kokorou: 2.6, minrou: 1.8, mishoshiki: 1.6, noson: 0.6, jieigyo: 0.2, shinchukan: 0.2 },
    RIGHT_GAIN: { shinchukan: 1.4, jieigyo: 1.2, noson: 0.6, minrou: 0.4, mishoshiki: 0.3 },
    //  新中間層は一九九三年に人口の三十六%を占める。毎点 1.5 削ると、
    //  左へ振り切った盤ではこの層だけで得票が六%落ちた ── 取引としては
    //  重すぎるので 1.2 にする。取引そのものは残す。
    LEFT_LOSE:  { shinchukan: 1.2, jieigyo: 1.2, noson: 1.0, mishoshiki: 0.5, minrou: 0.3 },
    LEFT_GAIN:  { kokorou: 1.2, minrou: 0.6, mishoshiki: 0.4 },
    //  勤労者教育協会。左へ寄ると都市の層は基線から離れていくが、
    //  組合の外に講座を開いたぶんだけ、その離れ方を押し戻す。
    //  一回ぶんが路線一目盛りあたり 0.45、左の損の六割までしか戻せない ──
    //  取引そのものは残す。ここを持たないと、事象の効き目は一手で消えた。
    //  三段（協会 → 拡張 → 網）で、左へ寄ったぶん都市の層が離れる分を
    //  三分の一ずつ打ち消す。三段そろえば打ち消し切る。
    KEIMOU_STEPS: 3,
    //  政策協定。keimou_open と対になる、右へ寄る線の側の仕組み。
    //  同盟系との政策協定を積んだ段数だけ、右へ寄って労働の側を
    //  失う分が浅くなる。三段そろえば、失う分は消える。
    //  これを持たないと、民社化の線は労働の層の天井が下がったまま伸びず、
    //  組織を上限まで積んでも二三九議席（過半は二五七）で止まる。
    //  ── 層ごとの基線の上積み（capb） ──────────────────────
    //  組織率（orgb）とは別の口。研修機関や政策集団のように、
    //  組織の頭数を増やすのではなく「その層が党を選ぶ理由」を
    //  作る札はここに入る。baselineLean に直に足すので、
    //  その層の天井（cap）がそのぶん上がる。
    //
    //  路線の損（RIGHT_LOSE / LEFT_LOSE）を打ち消す形にはしない。
    //  打ち消す形にすると、右へ寄っても官公労を丸ごと保てることになり、
    //  取引そのものが消える。上積みは別勘定で乗せ、
    //  官公労のように路線の損が重い層は、上積みを足しても
    //  損のほうが勝つ ── そこは埋まらないままにしてある。
    CAPB_MAX: 14,
    capBonus: function (Q, layers, pts) {
      var i, k;
      for (i = 0; i < layers.length; i++) {
        k = 'capb_' + layers[i];
        Q[k] = Math.min(this.CAPB_MAX, Math.max(0, (Q[k] || 0) + pts));
      }
      return Q;
    },


    baselineLean: function (Q, l) {
      var t = Math.min(1, Math.max(0, (this.yearOf(Q) - 1959) / 34));
      var u = Math.pow(t, this.FRONT);
      var b = this.LEAN_1959[l] + (this.LEAN_1993[l] - this.LEAN_1959[l]) * u;
      b += this.ORG_LEAN_PULL * (Q['orgb_' + l] || 0);
      //  畳んだ党の票は、押して積んだ分ではなく党の身体そのものである。
      //  ここに足さないと erode が毎手それを基線まで削り、合同したのに
      //  何をしても合同前の支持率へ戻る（遊びの報告）。
      b += (Q['merged_' + l] || 0);
      //  研修機関・政策集団で積んだぶん。組織率とは別に天井を上げる。
      b += (Q['capb_' + l] || 0);
      //「日本における社会主義への道」を綱領にすると、都市の浮動層から
      //  見て党は理解不能になる。1969年の崩壊はここから来る。
      if (Q.michi_adopted && (l === 'shinchukan' || l === 'mishoshiki')) { b -= 7; }
      if (Q.kozo_kaikaku && (l === 'shinchukan' || l === 'mishoshiki')) { b += 4; }
      //  国の政策を動かした分。法律は政権を降りても残るので、
      //  ここは in_power で囲まない。取り消すには軸を戻すしかない。
      b += this.policyLean(Q, l);
      //  路線そのものが票に効く。ここが空いていたので、右へ寄る道には
      //  組織を失う以外の代償が無かった。
      //
      //  右へ寄ると、労働の側は党を選ぶ理由を失う。
      //  都市の浮動層はいくらか戻るが、全部は埋まらない ──
      //  自民党と同じことを、自民党より小さく、金も実績も無い党がやると
      //  言っているからである。「革新の保守派」に票を入れる理由が要る。
      //  左へ寄ると都市からは遠くなるが、労働の側が選ぶ理由は残る。
      var rr = Q.route || 0;
      if (rr > 0) {
        b -= (this.RIGHT_LOSE[l] || 0) * rr;
        b += (this.RIGHT_GAIN[l] || 0) * rr;
      } else if (rr < 0) {
        var loss = (this.LEFT_LOSE[l] || 0) * (-rr);
        //  組合の外へ講座を開いた段数だけ、新中間層の離れ方が浅くなる。
        //  三段そろうと、左へ寄ったぶんの損は消える（組織化の見返り）。
        if (Q.keimou_open && l === 'shinchukan') {
          var kk = Math.min(this.KEIMOU_STEPS, Q.keimou_open);
          loss -= loss * (kk / this.KEIMOU_STEPS);
        }
        b -= loss;
        b += (this.LEFT_GAIN[l] || 0) * (-rr);
      }
      return Math.min(92, Math.max(2, b));
    },

    // 毎手呼ぶ。押した分を基線へ引き戻し、1969年以降は組織の上積みも削る
    erode: function (Q) {
      var i, l, b, d;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        b = this.baselineLean(Q, l);
        d = (b - Q['lean_' + l + '_shakai']) * this.DECAY;
        Q['lean_' + l + '_shakai'] += d;
        Q['lean_' + l + '_jimin'] -= d;
      }
      //  以前は一九六九年より前を削らなかったので、第Ⅰ〜Ⅱ幕で積んだ
      //  組織は一切溶けず、そのまま三十四年分の議席になっていた。
      //  組織はいつの年代でも、放っておけば痩せる。
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        if (Q['orgb_' + l]) { Q['orgb_' + l] *= (1 - this.ORGB_DECAY); }
      }
      return Q;
    },

    // 選挙年に呼ぶ。人口・組織率の潮流・定数を更新する
    advanceYear: function (Q, year) {
      var t = Math.min(1, Math.max(0, (year - 1959) / 34)), i, l, tide, bonus;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        Q['pop_' + l] = Math.round((this.POP_1959[l] + (this.POP_1993[l] - this.POP_1959[l]) * t) * 10) / 10;
      }
      tide = (this.ORG_RATE[year] || 24.2) / this.ORG_RATE[1958];
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        bonus = Q['orgb_' + l] || 0;
        Q['org_' + l] = Math.min(0.92, this.BASE_ORG[l] * tide + bonus);
      }
      if (this.HR_TOTAL[year]) { Q.hr_total = this.HR_TOTAL[year]; }
      Q.year = year;
      //  一九九三年六月、宮沢内閣の不信任案が可決されて自民党が割れる。
      //  総選挙はその翌月である。割れを選挙の中でやると、選挙より前に引く
      //  札が「自民党が割れた」と書けない。年が来た時点で割る。
      if (year >= 1993 && !Q.ldp_split_done && (Q.res_jimin || 0) > 0) {
        this.splitLDPNow(Q, false);
      }
      this.applyKomei(Q, year);
      this.applyKyosan(Q, year);
      return Q;
    },


    // ══════════════════════════════════════════════════════════
    //  事象の連鎖
    //  エンジンの山札は一様乱数で引く（priority も frequency も見ない）。
    //  だから事象カードは「引かれるのを待つ」のではなく、
    //  通用カードの選択が溜めたカウンタが閾値を越えた時点で割り込ませる。
    //   通用カードの選択 → カウンタ++ → endturn で判定 → 事象シーンへ
    // ══════════════════════════════════════════════════════════
    //  閾値は幕の行動回数に対する割合で持つ。第Ⅰ幕は9手なので
    //  need 0.22 → 2手。第Ⅱ幕が20手なら同じ 0.22 が 4手になる。
    //  こうしておかないと、幕が長くなった途端に全部の事象が
    //  最初の数手で発火してしまう。
    EVENT_MIN: 2,
    //  閾値は「その筋を何回引いたか」＝関与の度合いであって、幕の長さではない。
    //  幕の手数にそのまま比例させると、長い幕ほど事象が出にくくなる（逆である）。
    //  一手＝一四半期に変えたとき、第Ⅴ幕の閾値が 3 から 5 に上がって
    //  一周に出る事象が増えなかったので、平方根で緩やかにだけ伸ばす形にした。
    //  基準は18手（旧・第Ⅱ幕の長さ）。
    //  実測: 一幕の tally 供給は合計 30 前後、counter 一本あたり 2〜4。
    //  10 だと閾値が 4〜9 になり、org 以外はどの counter も届かなかった。
    NEED_REF: 5,
    needOf: function (Q, frac) {
      var turns = Q.act_turns || this.NEED_REF;
      var scaled = this.NEED_REF * Math.sqrt(turns / this.NEED_REF);
      return Math.max(this.EVENT_MIN, Math.round(frac * scaled));
    },

    EVENTS: [
      // ── 第Ⅰ幕 ──────────────────────────────────────────────
      { n: 1, id: 'miike', name: '三井三池争議', acts: [1], need: { labor: 0.17 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.17) && Q.year <= 1961; } },
      { n: 2, id: 'zenro', name: '全労会議からの接触', acts: [1, 2], need: { rel: 0.17 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.17) && !Q.minsha_exists && !Q.domei_exists; } },
      { n: 3, id: 'anpo_gai', name: '国会前', acts: [1], need: { rally: 0.17, diet: 0.09 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.17) && Q.c_diet >= window.JSP.needOf(Q, 0.09); } },
      { n: 4, id: 'koryo_an', name: '綱領改定案', acts: [1], need: { koryo: 0.17 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.17); } },
      { n: 5, id: 'sokka', name: '創価学会の政界進出', acts: [1], need: { rel: 0.22 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.22) && !Q.komei_exists; } },

      // ── 第Ⅱ幕 ──────────────────────────────────────────────
      { n: 11, id: 'rosen_bunretsu', name: '労働戦線の分裂', acts: [2], need: { labor: 0.17 },
        when: function (Q) { return Q.domei_exists && Q.c_labor >= window.JSP.needOf(Q, 0.17); } },
      { n: 12, id: 'kakushin_kai', name: '全国革新市長会', acts: [2], need: { rel: 0.17 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.17) &&
                 ((Q.local_yokohama || 0) + (Q.local_tokyo || 0) + (Q.local_kyoto || 0)) >= 2; } },
      { n: 13, id: 'komei_kyori', name: '公明党との距離', acts: [2], need: { rel: 0.28 },
        when: function (Q) { return Q.komei_exists && Q.c_rel >= window.JSP.needOf(Q, 0.28); } },
      { n: 14, id: 'kaihoha', name: '社青同解放派の街頭', acts: [2], need: { rally: 0.17 },
        when: function (Q) { return Q.seiseido_kyokai && Q.c_rally >= window.JSP.needOf(Q, 0.17); } },
      { n: 15, id: 'zaisei', name: '党財政の危機', acts: [2], need: { fund: 0.22 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.22) && Q.budget < 14; } },

      // ── 第Ⅲ幕 ──────────────────────────────────────────────
      { n: 21, id: 'sutoken_suto', name: 'スト権スト', acts: [3], need: { labor: 0.17 },
        // 一九七五年の出来事。局面2（year >= 1972）に入ってから
        when: function (Q) { return Q.year >= 1972 && Q.c_labor >= window.JSP.needOf(Q, 0.17) && !Q.evdone_a3_suto_ken && !Q.evdone_suto_ken_sa; } },
      { n: 22, id: 'lockheed', name: 'ロッキード事件', acts: [3], need: { diet: 0.17 },
        // 一九七六年二月
        when: function (Q) { return Q.year >= 1972 && Q.c_diet >= window.JSP.needOf(Q, 0.17); } },
      { n: 23, id: 'shinjiyu', name: '新自由俱乐部', acts: [3], need: { rel: 0.17 },
        // 一九七六年六月
        when: function (Q) { return Q.year >= 1972 && Q.c_rel >= window.JSP.needOf(Q, 0.17) && !Q.evdone_a3_shinjiyu; } },
      { n: 24, id: 'narita_sangensoku', name: '野党共闘の三原則', acts: [3], need: { koryo: 0.17 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.17); } },
      { n: 25, id: 'sanrizuka', name: '三里塚', acts: [3], need: { rally: 0.17 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.17) && !Q.evdone_a3_sanrizuka; } },

      // ── 第Ⅳ幕 ──────────────────────────────────────────────
      { n: 31, id: 'kokutetsu', name: '国鉄再建論', acts: [4], need: { labor: 0.17 },
        // 分割民営化論が公然と出るのは臨調（1981）以降。局面3から
        when: function (Q) { return Q.year >= 1980 && Q.c_labor >= window.JSP.needOf(Q, 0.17); } },
      { n: 32, id: 'hankaku', name: '反核運動', acts: [4], need: { rally: 0.17 },
        // ヨーロッパの反核運動の波及は 1981–83
        when: function (Q) { return Q.year >= 1980 && Q.c_rally >= window.JSP.needOf(Q, 0.17); } },
      { n: 33, id: 'genjitsu', name: '現実路線論争', acts: [4], need: { koryo: 0.17 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.17); } },
      { n: 34, id: 'chihosen', name: '地方選の総崩れ', acts: [4], need: { rel: 0.17 },
        // 一九七九年の統一地方選以降
        when: function (Q) { return Q.year >= 1979 && Q.c_rel >= window.JSP.needOf(Q, 0.17); } },
      { n: 35, id: 'sohyo_taikou', name: '総評の後退', acts: [4], need: { fund: 0.17 },
        // 組織率が三〇%を割るのは 1983。労働戦線統一協議も 1981 以降
        when: function (Q) { return Q.year >= 1980 && Q.c_fund >= window.JSP.needOf(Q, 0.17); } },

      // ── 第Ⅴ幕 ──────────────────────────────────────────────
      { n: 41, id: 'rikuruto', name: 'リクルート事件', acts: [5], need: { diet: 0.17 },
        // 発覚は一九八八年六月。局面2から
        when: function (Q) { return Q.phase >= 2 && Q.c_diet >= window.JSP.needOf(Q, 0.17); } },
      { n: 42, id: 'rosen_toitsu', name: '労働戦線統一協議', acts: [5], need: { labor: 0.17 },
        // 連合が発足する前にしか起きない
        when: function (Q) { return !Q.rengo_formed && Q.c_labor >= window.JSP.needOf(Q, 0.17); } },
      { n: 43, id: 'shohizei', name: '消費税国会', acts: [5], need: { rally: 0.17 },
        // 消費税国会は一九八八年。局面2から
        when: function (Q) { return Q.phase >= 2 && Q.c_rally >= window.JSP.needOf(Q, 0.17); } },
      { n: 44, id: 'seiji_kaikaku', name: '政治改革', acts: [5], need: { koryo: 0.12 },
        // 小選挙区制が議題になるのは一九九一年以降。局面3から
        when: function (Q) { return Q.phase >= 3 && Q.c_koryo >= window.JSP.needOf(Q, 0.12) && !Q.evdone_a5_shosenkyoku; } },
      { n: 45, id: 'shinto_boom', name: '新党ブーム', acts: [5], need: { rel: 0.17 },
        // 日本新党は一九九二年。局面3から
        when: function (Q) { return Q.phase >= 3 && Q.c_rel >= window.JSP.needOf(Q, 0.17) && !Q.evdone_a5_hosokawa_boom; } },


      // ── 自治体選挙（脚本に無い六都市） ──────────────────────
      //  年が来ていて、まだ取っていないときだけ出る。落とした場合も
      //  evdone が立つので、その街は一度きりである。
      //  京都は開幕から持っている。これは取る選挙ではなく守る選挙である。
      { n: 56, id: 'kyoto', name: '京都府知事選', acts: [2], need: { org: 0.14 },
        when: function (Q) { return Q.year >= 1966 && !Q.kyoto66_done &&
                 Q.c_org >= window.JSP.needOf(Q, 0.14); } },
      { n: 51, id: 'osaka', name: '大阪府知事選', acts: [3], need: { rel: 0.14 },
        when: function (Q) { return Q.year >= 1971 && !Q.local_osaka &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.14); } },
      { n: 52, id: 'hiroshima', name: '広島市長選', acts: [2], need: { rally: 0.14 },
        when: function (Q) { return Q.year >= 1967 && !Q.local_hiroshima &&
                 Q.c_rally >= window.JSP.needOf(Q, 0.14); } },
      { n: 53, id: 'nagasaki', name: '長崎市長選', acts: [3], need: { labor: 0.14 },
        when: function (Q) { return Q.year >= 1971 && !Q.local_nagasaki &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.14); } },
      { n: 54, id: 'aichi', name: '愛知県知事選', acts: [3], need: { labor: 0.25 },
        when: function (Q) { return Q.year >= 1972 && !Q.local_aichi &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.25); } },
      { n: 55, id: 'hokkaido', name: '北海道知事選', acts: [4], need: { org: 0.14 },
        when: function (Q) { return Q.year >= 1983 && !Q.local_hokkaido &&
                 Q.c_org >= window.JSP.needOf(Q, 0.14); } },

      // ═══ generated:events start ═══
      // 勤評闘争　1958年〜・史実
      { n: 1001, id: 'a1_kinpyo', name: '勤評闘争', acts: [1], need: { labor: 0.15 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958 &&
                 !Q.evdone_a1_gyakkoro; } },
      // 警職法　1958年〜・史実
      { n: 1011, id: 'a1_keishokuho', name: '警職法', acts: [1], need: { diet: 0.2 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958 &&
                 !Q.evdone_keishokuho; } },
      // 長崎国旗事件　1958年〜・史実
      { n: 8101, id: 'a1_nagasaki_kokki', name: '长崎国旗事件', acts: [1], need: { rel: 0.12 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958; } },
      // 団地　1958年〜・史実
      { n: 8102, id: 'a1_danchi', name: '团地', acts: [1], need: { org: 0.12 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958; } },
      // 砂川・伊達判決　1959年〜・史実
      { n: 1002, id: 'a1_sunagawa', name: '砂川・伊達判決', acts: [1], need: { rally: 0.15 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 「日中共同の敵」　1959年〜・asanumaが在席・史実
      { n: 1003, id: 'a1_asanuma_hokyo', name: '「日中共同の敵」', acts: [1], need: { rel: 0.2 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959 &&
                 window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 原水協大会の対立　1959年〜・史実
      { n: 1005, id: 'a1_gensuikyo', name: '原水協大会の対立', acts: [1], need: { rally: 0.2 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 西尾処分　1959年〜・史実
      { n: 1012, id: 'a1_nishio_shobun', name: '西尾処分', acts: [1], need: { split: 0.2 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959 &&
                 !Q.minsha_exists; } },
      // 三池の前哨　1959年〜・史実
      { n: 1019, id: 'a1_miike_zensho', name: '三池の前哨', acts: [1], need: { labor: 0.3 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 春闘共闘委員会　1959年〜・史実
      { n: 8011, id: 'a1_shunto_kyoto', name: '春闘共闘委員会', acts: [1], need: { labor: 0.12 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 伊勢湾台風　1959年〜・史実
      { n: 1801, id: 'a1_isewan', name: '伊势湾台风', acts: [1], need: { org: 0.14 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 皇太子の結婚　1959年〜・史実
      { n: 1802, id: 'a1_kotaishi', name: '皇太子结婚', acts: [1], need: { name: 0.14 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 五月十九日　1960年〜・史実
      { n: 1007, id: 'a1_kishi_kyoko', name: '五月十九日', acts: [1], need: { diet: 0.35 }, year: 1960, fixed: true,
        when: function (Q) { return Q.year >= 1960; } },
      // 六月十五日　1960年〜・史実
      { n: 1008, id: 'a1_kanba', name: '六月十五日', acts: [1], need: { rally: 0.4 }, year: 1960, fixed: true,
        when: function (Q) { return Q.year >= 1960; } },
      // 所得倍増　1960年〜・史実
      { n: 1009, id: 'a1_ike_baizo', name: '所得倍増', acts: [1], need: { name: 0.2 }, year: 1960, fixed: true,
        when: function (Q) { return Q.year >= 1960; } },
      // 弔い合戦　1960年〜・asanumaが退場後・史実
      { n: 1010, id: 'a1_asanuma_shi', name: '弔い合戦', acts: [1], need: { name: 0.35 }, year: 1960, fixed: true,
        when: function (Q) { return Q.year >= 1960 &&
                 !window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 民社党結成　1960年〜・史実
      { n: 1013, id: 'a1_minsha_kessei', name: '民社党結成', acts: [1], need: { split: 0.3 }, year: 1960, fixed: true,
        when: function (Q) { return Q.year >= 1960 &&
                 Q.minsha_exists; } },
      // 十一月の総選挙　1960年〜・asanumaが退場後・史実
      { n: 1020, id: 'a1_senkyo60', name: '十一月の総選挙', acts: [1], need: { hr: 0.35 }, year: 1960, fixed: true,
        when: function (Q) { return Q.year >= 1960 &&
                 !window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 黒い霧のあと　史実
      { n: 9224, id: 'gov_kuroikiri_ato', name: '黒い霧のあと', acts: [2, 3], need: { diet: 0.18 }, fixed: true,
        when: function (Q) { return Q.kuroikiri_gov; } },
      // 政暴法　1961年〜・asanumaが退場後・史実
      { n: 2001, id: 'a2_seiboho', name: '政暴法', acts: [2], need: { diet: 0.15 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961 &&
                 !window.JSP.LEADERS.here(Q, 'asanuma') &&
                 !Q.evdone_seiboho; } },
      // 河上委員長　1961年〜・kawakamiが在席・asanumaが退場後・史実
      { n: 2002, id: 'a2_kawakami', name: '河上委員長', acts: [2], need: { chair: 0.15 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961 &&
                 window.JSP.LEADERS.here(Q, 'kawakami') &&
                 !window.JSP.LEADERS.here(Q, 'asanuma') &&
                 window.JSP.LEADERS.likely(Q, "kawakami"); } },
      // 国民皆保険　1961年〜・史実
      { n: 2165, id: 'a2_kokumin_kenko', name: '国民皆保険', acts: [2], need: { diet: 0.2 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961; } },
      // 農業基本法　1961年〜・史実
      { n: 8103, id: 'a2_nogyo_kihonho', name: '农业基本法', acts: [2], need: { org: 0.14 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961; } },
      // ソ連の核実験再開　1961年〜・史実
      { n: 8104, id: 'a2_kakujikken', name: '苏联恢复核试验', acts: [2], need: { rally: 0.14 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961; } },
      // キューバ危機　1962年〜・史実
      { n: 2801, id: 'a2_cuba', name: '古巴危机', acts: [2], need: { rally: 0.17 }, year: 1962, fixed: true,
        when: function (Q) { return Q.year >= 1962; } },
      // 新産業都市　1962年〜・史実
      { n: 2802, id: 'a2_shinsangyo', name: '新产业都市', acts: [2], need: { org: 0.2 }, year: 1962, fixed: true,
        when: function (Q) { return Q.year >= 1962; } },
      // 日韓基本条約　帯中間右/右・1963年〜・史実
      { n: 115, id: 'nikkan', name: '日韓基本条約', acts: [2], need: { diet: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_nikkan && !Q.in_power; } },
      // ベトナム戦争と北爆　帯中間右/右・1963年〜・史実
      { n: 116, id: 'vietnam', name: 'ベトナム戦争と北爆', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_vietnam && !Q.evdone_vietnam_sa; } },
      // 東京オリンピック　1963年〜・史実
      { n: 312, id: 'a2_tokyo_gorin', name: '東京オリンピック', acts: [2], need: { rally: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // 公害病と原因企業　帯中間右/右・1963年〜・史実
      { n: 313, id: 'a2_kougai_hajime', name: '公害病と原因企業', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_kogai && !Q.evdone_kougai_hajime_sa; } },
      // 憲法調査会の報告　1963年〜・史実
      { n: 316, id: 'a2_kenpo_chosa_hokoku', name: '憲法調査会の報告', acts: [2], need: { koryo: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // ILO八十七号条約　1963年〜・史実
      { n: 2004, id: 'a2_ilo87', name: 'ILO八十七号条約', acts: [2], need: { labor: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // 三川鉱の煙　1963年〜・史実
      { n: 2006, id: 'a2_miike_bakuhatsu', name: '三川鉱の煙', acts: [2], need: { labor: 0.25 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // 一九六三年総選挙　1963年〜・史実
      { n: 2013, id: 'a2_1963_senkyo', name: '一九六三年総選挙', acts: [2], need: { hr: 0.3 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // 松川事件の判決　1963年〜・史実
      { n: 2161, id: 'a2_matsukawa', name: '松川事件の判決', acts: [2], need: { rally: 0.15 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 !Q.evdone_matsukawa; } },
      // 日韓基本条約　帯左/中間左・1963年〜・史実
      { n: 7115, id: 'nikkan_sa', name: '日韓基本条約', acts: [2], need: { diet: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_nikkan && !Q.in_power; } },
      // ベトナム戦争と北爆　帯左/中間左・1963年〜・史実
      { n: 7116, id: 'vietnam_sa', name: 'ベトナム戦争と北爆', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_vietnam && !Q.evdone_a2_vietnam; } },
      // 各地の公害病　帯左/中間左・1963年〜・史実
      { n: 7313, id: 'kougai_hajime_sa', name: '各地の公害病', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_kogai && !Q.evdone_a2_kougai_hajime; } },
      // 公明党結成　1964年〜・史実
      { n: 2007, id: 'a2_komei_kessei', name: '公明党結成', acts: [2], need: { rel: 0.2 }, year: 1964, fixed: true,
        when: function (Q) { return Q.year >= 1964 &&
                 Q.komei_exists; } },
      // IMF・JC　1964年〜・史実
      { n: 2011, id: 'a2_imfjc', name: 'IMF・JC', acts: [2], need: { labor: 0.3 }, year: 1964, fixed: true,
        when: function (Q) { return Q.year >= 1964 &&
                 Q.minsha_exists; } },
      // 池田退陣　1964年〜・史実
      { n: 2163, id: 'a2_ikeda_taijin', name: '池田退陣', acts: [2], need: { name: 0.2 }, year: 1964, fixed: true,
        when: function (Q) { return Q.year >= 1964 &&
                 !Q.in_power; } },
      // 原潜寄港　1964年〜・史実
      { n: 2803, id: 'a2_gensen', name: '核潜艇停靠', acts: [2], need: { rally: 0.2 }, year: 1964, fixed: true,
        when: function (Q) { return Q.year >= 1964; } },
      // 佐々木更三　1965年〜・史実
      { n: 2008, id: 'a2_sasaki', name: '佐々木更三', acts: [2], need: { chair: 0.2 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965 &&
                 window.JSP.LEADERS.likely(Q, "sasaki"); } },
      // 日韓基本条約　1965年〜・史実
      { n: 2009, id: 'a2_nikkan', name: '日韓基本条約', acts: [2], need: { diet: 0.3 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965 &&
                 !Q.evdone_nikkan && !Q.evdone_nikkan_sa && !Q.in_power; } },
      // 北爆　1965年〜・史実
      { n: 2010, id: 'a2_vietnam', name: '北爆', acts: [2], need: { rally: 0.3 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965 &&
                 !Q.evdone_vietnam && !Q.evdone_vietnam_sa; } },
      // ベ平連　1965年〜・史実
      { n: 2804, id: 'a2_beheiren', name: '越平连', acts: [2], need: { youth: 0.17 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965; } },
      // 黒い霧解散　帯中間右/右・1966年〜・史実
      { n: 117, id: 'kuroikiri', name: '黒い霧解散', acts: [2], need: { diet: 0.22 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_kuroi_kiri && !Q.evdone_kuroikiri_sa && !Q.gov_ours; } },
      // 黒い霧　1966年〜・史実
      { n: 2016, id: 'a2_kuroi_kiri', name: '黒い霧', acts: [2], need: { name: 0.25 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 !Q.evdone_kuroikiri && !Q.evdone_kuroikiri_sa && !Q.gov_ours; } },
      // 中ソ対立　1966年〜・史実
      { n: 2036, id: 'a2_chuso', name: '中ソ対立', acts: [2], need: { rel: 0.35 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.kyokai_grip >= 35; } },
      // 黒い霧解散　帯左/中間左・1966年〜・史実
      { n: 7117, id: 'kuroikiri_sa', name: '黒い霧解散', acts: [2], need: { diet: 0.22 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_kuroikiri && !Q.evdone_a2_kuroi_kiri && !Q.gov_ours; } },
      // 総評の代替わり　1966年〜・史実
      { n: 8012, id: 'a2_sohyo_kotai66', name: '総評の代替わり', acts: [2], need: { labor: 0.2 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966; } },
      // 黒い霧（政権の側）　1966年〜・史実
      { n: 9223, id: 'gov_kuroikiri', name: '黒い霧（政権の側）', acts: [2, 3], need: { diet: 0.22 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.gov_ours; } },
      // 学園紛争　帯中間右/右・1967年〜・史実
      { n: 119, id: 'gakuen', name: '学園紛争', acts: [2], need: { rally: 0.28 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_gakusei_undo && !Q.evdone_gakuen_sa; } },
      // 一九六七年一月　1967年〜・史実
      { n: 2019, id: 'a2_1967', name: '一九六七年一月', acts: [2], need: { hr: 0.35 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967; } },
      // 公害　1967年〜・史実
      { n: 2027, id: 'a2_kogai', name: '公害', acts: [2], need: { org: 0.3 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967 &&
                 !Q.evdone_a2_kougai_hajime && !Q.evdone_kougai_hajime_sa; } },
      // 学園紛争　帯左/中間左・1967年〜・史実
      { n: 7119, id: 'gakuen_sa', name: '学園紛争', acts: [2], need: { rally: 0.28 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_gakusei_undo && !Q.evdone_gakuen; } },
      // 建国記念の日　1967年〜・史実
      { n: 2805, id: 'a2_kenkoku', name: '建国纪念日', acts: [2], need: { rally: 0.2 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967; } },
      // エンタープライズ　1968年〜・史実
      { n: 2020, id: 'a2_enterprise', name: 'エンタープライズ', acts: [2], need: { rally: 0.35 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
      // 社青同解放派　1968年〜・史実
      { n: 2034, id: 'a2_seinen_bunretsu', name: '社青同解放派', acts: [2], need: { youth: 0.35 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968 &&
                 Q.kyokai_grip >= 35 && !Q.evdone_a2_seiseido_kaiho; } },
      // プラハの春への軍事介入　1968年〜・史実
      { n: 2037, id: 'a2_praha', name: 'プラハの春への軍事介入', acts: [2], need: { rel: 0.4 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968 &&
                 Q.kyokai_grip >= 35; } },
      // 成田知巳　1968年〜・史実
      { n: 2042, id: 'a2_naritachi', name: '成田知巳', acts: [2], need: { chair: 0.35 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968 &&
                 window.JSP.LEADERS.likely(Q, "narita"); } },
      // 水俣　1968年〜・史実
      { n: 2166, id: 'a2_suigai', name: '水俣', acts: [2], need: { org: 0.25 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
      // 大学の紛争　1968年〜・史実
      { n: 2167, id: 'a2_gakusei_undo', name: '大学の紛争', acts: [2], need: { youth: 0.25 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968 &&
                 !Q.evdone_gakuen && !Q.evdone_gakuen_sa; } },
      // 一九六八年参院選　1968年〜・史実
      { n: 2179, id: 'a2_1968_sanin', name: '一九六八年参院選', acts: [2], need: { hc: 0.3 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
      // 安田講堂　1969年〜・史実
      { n: 2021, id: 'a2_todai', name: '安田講堂', acts: [2], need: { youth: 0.3 }, year: 1969, fixed: true,
        when: function (Q) { return Q.year >= 1969; } },
      // 大学立法　1969年〜・史実
      { n: 2022, id: 'a2_daigaku_ho', name: '大学立法', acts: [2], need: { diet: 0.35 }, year: 1969, fixed: true,
        when: function (Q) { return Q.year >= 1969; } },
      // 沖縄返還交渉　1969年〜・史実
      { n: 2023, id: 'a2_okinawa', name: '沖縄返還交渉', acts: [2], need: { rally: 0.3 }, year: 1969, fixed: true,
        when: function (Q) { return Q.year >= 1969; } },
      // 一九六九年十二月　1969年〜・史実
      { n: 2024, id: 'a2_1969_haiboku', name: '一九六九年十二月', acts: [2], need: { hr: 0.5 }, year: 1969, fixed: true,
        when: function (Q) { return Q.year >= 1969; } },
      // 七〇年安保への構え　1969年〜・史実
      { n: 2049, id: 'a2_anpo_jido', name: '七〇年安保への構え', acts: [2], need: { rally: 0.4 }, year: 1969, fixed: true,
        when: function (Q) { return Q.year >= 1969; } },
      // 自社連立の打診　史実
      { n: 4807, id: 'a4_jisha_dashin', name: '自社联合的试探', acts: [3, 4], need: { diet: 0.2 }, fixed: true,
        when: function (Q) { return Q.minsha_ka && !Q.jisha_pact && !Q.in_power && !Q.kyosan_merged && !Q.minshu_shinto && (Q.elec_year || 0) >= 1976 && (Q.res_jimin || 0) < Math.floor((Q.hr_total || 511) / 2) + 1 && (Q.res_jimin || 0) + (Q.seats_hr || 0) >= Math.floor((Q.hr_total || 511) / 2) + 1; } },
      // 自動延長　1970年〜・史実
      { n: 3001, id: 'a3_jido_encho', name: '自動延長', acts: [3], need: { rally: 0.2 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // 公害国会　1970年〜・史実
      { n: 3002, id: 'a3_kogai_kokkai', name: '公害国会', acts: [3], need: { diet: 0.2 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970 &&
                 (Q.local_n >= 1) && !Q.evdone_a3_kougai_kokkai; } },
      // 万国博　1970年〜・史実
      { n: 3161, id: 'a3_bankoku', name: '万国博', acts: [3], need: { name: 0.15 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // 市ヶ谷　1970年〜・史実
      { n: 3162, id: 'a3_mishima', name: '市ヶ谷', acts: [3], need: { name: 0.15 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // よど号　1970年〜・史実
      { n: 3201, id: 'a3_yodogo', name: 'よど号', acts: [3], need: { name: 0.15 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // 七〇年安保の自動延長　1970年〜・史実
      { n: 8105, id: 'a3_anpo_jido70', name: '七〇年安保的自动延长', acts: [3], need: { rally: 0.14 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // ウーマン・リブ　1970年〜・史実
      { n: 8113, id: 'a3_uman_ribu', name: '妇女解放运动', acts: [3], need: { org: 0.16 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // 三里塚　1971年〜・史実
      { n: 3003, id: 'a3_sanrizuka', name: '三里塚', acts: [3], need: { rally: 0.25 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971 &&
                 !Q.evdone_sanrizuka; } },
      // 大阪府知事　軸未定/社共・1971年〜・史実
      { n: 3004, id: 'a3_kuroda', name: '大阪府知事', acts: [3], need: { org: 0.25 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971 &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // ドル・ショック　1971年〜・史実
      { n: 3005, id: 'a3_dollar', name: 'ドル・ショック', acts: [3], need: { org: 0.2 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971; } },
      // マル生反対闘争　1971年〜・史実
      { n: 3106, id: 'a3_b1_kokutetsu_maru', name: 'マル生反対闘争', acts: [3], need: { labor: 0.3 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971; } },
      // 中国の国連代表権　1971年〜・史実
      { n: 3202, id: 'a3_kokuren_chugoku', name: '中国の国連代表権', acts: [3], need: { rel: 0.15 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971; } },
      // 四大公害裁判　1971年〜・史実
      { n: 3801, id: 'a3_kogai_saiban', name: '四大公害诉讼', acts: [3], need: { diet: 0.2 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971; } },
      // 民社党の委員長選　1971年〜・史実
      { n: 9230, id: 'minsha_toshu', name: '民社党の委員長選', acts: [3], need: { rel: 0.2 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971 &&
                 !Q.opp_merged && !Q.minshu_shinto && !Q.minsha_head_done && Q.minsha_exists; } },
      // 日中国交正常化　1972年〜・史実
      { n: 133, id: 'nicchu', name: '日中国交正常化', acts: [3], need: { rel: 0.14 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 !Q.evdone_a3_nicchu && !Q.gov_ours; } },
      // 金脈問題　1972年〜・史実
      { n: 135, id: 'kinmyaku', name: '金脈問題', acts: [3], need: { diet: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 !Q.evdone_a3_kaneda && !Q.in_power; } },
      // ニクソン訪中　1972年〜・史実
      { n: 322, id: 'a3_bei_chugoku', name: 'ニクソン訪中', acts: [3], need: { rel: 0.14 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // 列島改造と地価　1972年〜・史実
      { n: 323, id: 'a3_retto_kaizo', name: '列島改造と地価', acts: [3], need: { diet: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // あさま山荘事件　1972年〜・史実
      { n: 3006, id: 'a3_asama', name: 'あさま山荘事件', acts: [3], need: { name: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 !Q.evdone_sp_rengo_sekigun1972; } },
      // 日中国交正常化　1972年〜・史実
      { n: 3007, id: 'a3_nicchu', name: '日中国交正常化', acts: [3], need: { rel: 0.25 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 !Q.evdone_nicchu && !Q.gov_ours; } },
      // 一九七二年十二月　1972年〜・史実
      { n: 3008, id: 'a3_1972', name: '一九七二年十二月', acts: [3], need: { hr: 0.3 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 Q.komei_exists; } },
      // 五月十五日　1972年〜・史実
      { n: 3163, id: 'a3_okinawa_henkan', name: '五月十五日', acts: [3], need: { rally: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // 日本列島改造論　1972年〜・史実
      { n: 3164, id: 'a3_chika_toki', name: '日本列島改造論', acts: [3], need: { org: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // 狂乱物価　帯左/中間左・1972年〜・史実
      { n: 7134, id: 'kyoran_bukka_sa', name: '狂乱物価', acts: [3], need: { labor: 0.14 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 三角大福　1972年〜・史実
      { n: 9231, id: 'jimin_sosaisen', name: '三角大福', acts: [3], need: { rel: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972 &&
                 !Q.jimin_head_done && !Q.in_power; } },
      // 第一次石油危機　帯中間右/右・1973年〜・史実
      { n: 3009, id: 'a3_oil', name: '第一次石油危機', acts: [3], need: { org: 0.3 }, year: 1973, fixed: true,
        when: function (Q) { return Q.year >= 1973 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 金大中事件　1973年〜・史実
      { n: 3165, id: 'a3_kindaechu', name: '金大中事件', acts: [3], need: { rel: 0.2 }, year: 1973, fixed: true,
        when: function (Q) { return Q.year >= 1973; } },
      // 老人医療費無料化　1973年〜・史実
      { n: 3208, id: 'a3_rojin_iryo', name: '老人医療費無料化', acts: [3], need: { org: 0.25 }, year: 1973, fixed: true,
        when: function (Q) { return Q.year >= 1973 &&
                 Q.local_n >= 1; } },
      // 第一次石油危機　帯左/中間左・1973年〜・史実
      { n: 7309, id: 'oil_sa', name: '第一次石油危機', acts: [3], need: { org: 0.3 }, year: 1973, fixed: true,
        when: function (Q) { return Q.year >= 1973 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 狂乱物価　帯中間右/右・1974年〜・史実
      { n: 134, id: 'kyoran_bukka', name: '狂乱物価', acts: [3], need: { labor: 0.14 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 春闘三二・九%　1974年〜・史実
      { n: 324, id: 'a3_shunto_74', name: '春闘三二・九%', acts: [3], need: { labor: 0.2 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // 金脈問題　1974年〜・史実
      { n: 3010, id: 'a3_kaneda', name: '金脈問題', acts: [3], need: { name: 0.25 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974 &&
                 !Q.evdone_kinmyaku && !Q.in_power; } },
      // 企業ぐるみ選挙　1974年〜・史実
      { n: 3011, id: 'a3_kigyo_gurumi', name: '企業ぐるみ選挙', acts: [3], need: { hc: 0.3 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // 三木内閣　1974年〜・史実
      { n: 3012, id: 'a3_miki', name: '三木内閣', acts: [3], need: { diet: 0.25 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974 &&
                 !Q.in_power; } },
      // 原子力船むつ　1974年〜・史実
      { n: 3804, id: 'a3_mutsu', name: '核动力船陆奥', acts: [3], need: { org: 0.2 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // スト権スト　帯中間右/右・1975年〜・史実
      { n: 3013, id: 'a3_suto_ken', name: 'スト権スト', acts: [3], need: { labor: 0.35 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_sutoken_suto; } },
      // サイゴン陥落　1975年〜・史実
      { n: 3166, id: 'a3_vietnam_owari', name: 'サイゴン陥落', acts: [3], need: { rally: 0.2 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975; } },
      // 成長の終わり　帯中間右/右・1975年〜・史実
      { n: 3167, id: 'a3_seicho_owari', name: '成長の終わり', acts: [3], need: { org: 0.3 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 春闘の転換　帯中間右/右・1975年〜・史実
      { n: 3168, id: 'a3_shunto_tenkan', name: '春闘の転換', acts: [3], need: { labor: 0.3 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 赤字国債　1975年〜・史実
      { n: 3172, id: 'a3_kokusai_hakko', name: '赤字国債', acts: [3], need: { org: 0.3 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975; } },
      // スト権スト　帯左/中間左・1975年〜・史実
      { n: 7513, id: 'suto_ken_sa', name: 'スト権スト', acts: [3], need: { labor: 0.35 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_sutoken_suto; } },
      // 成長の終わり　帯左/中間左・1975年〜・史実
      { n: 7367, id: 'seicho_owari_sa', name: '成長の終わり', acts: [3], need: { org: 0.3 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 春闘の転換　帯左/中間左・1975年〜・史実
      { n: 7368, id: 'shunto_tenkan_sa', name: '春闘の転換', acts: [3], need: { labor: 0.3 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 保革伯仲　帯中間右/右・1976年〜・史実
      { n: 138, id: 'hokaku_hakuchu', name: '保革伯仲', acts: [3], need: { diet: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a3_hakuchu && !Q.in_power; } },
      // 中道連合の始まり　軸未定/社公民・1976年〜・史実
      { n: 140, id: 'shakomin_goi_zen', name: '中道連合の始まり', acts: [3], need: { rel: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 三木の政治改革　1976年〜・史実
      { n: 325, id: 'a3_miki_kaikaku', name: '三木の政治改革', acts: [3], need: { diet: 0.2 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists && !Q.gov_ours; } },
      // ロッキードのあと　1976年〜・史実
      { n: 432, id: 'a3_lockheed_ato', name: 'ロッキードのあと', acts: [3], need: { diet: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists && !Q.in_power; } },
      // 革新自治体の敗北　1976年〜・史実
      { n: 433, id: 'a3_kakushin_haiboku', name: '革新自治体の敗北', acts: [3], need: { rel: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists; } },
      // ロッキード　帯中間右/右・1976年〜・史実
      { n: 3015, id: 'a3_lockheed', name: 'ロッキード', acts: [3], need: { name: 0.35 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新自由クラブ　1976年〜・史実
      { n: 3016, id: 'a3_shinjiyu', name: '新自由俱乐部', acts: [3], need: { hr: 0.35 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 !Q.evdone_shinjiyu; } },
      // 保革伯仲　帯中間右/右・1976年〜・史実
      { n: 3017, id: 'a3_hakuchu', name: '保革伯仲', acts: [3], need: { hr: 0.4 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.minsha_exists && Q.seats_hr >= 110) && !Q.evdone_hokaku_hakuchu && !Q.evdone_hokaku_hakuchu_sa && !Q.in_power; } },
      // 一九七六年十二月の総選挙　1976年〜・史実
      { n: 3170, id: 'a3_1976_senkyo', name: '一九七六年十二月の総選挙', acts: [3], need: { hr: 0.4 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists && !Q.in_power; } },
      // 主任制　1976年〜・史実
      { n: 3171, id: 'a3_shunin_kyoiku', name: '主任制', acts: [3], need: { labor: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976; } },
      // 保革伯仲　帯左/中間左・1976年〜・史実
      { n: 7138, id: 'hokaku_hakuchu_sa', name: '保革伯仲', acts: [3], need: { diet: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.seats_hr >= 110) && !Q.evdone_a3_hakuchu && !Q.in_power; } },
      // ロッキード　帯左/中間左・1976年〜・史実
      { n: 7315, id: 'lockheed_sa', name: 'ロッキード', acts: [3], need: { name: 0.35 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 数の均衡　帯左/中間左・1976年〜・史実
      { n: 7317, id: 'hakuchu2_sa', name: '数の均衡', acts: [3], need: { hr: 0.4 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.seats_hr >= 110) && !Q.evdone_hokaku_hakuchu_sa && !Q.in_power; } },
      // 査問問題　1976年〜・史実
      { n: 3802, id: 'a3_miyamoto_samon', name: '查问问题', acts: [3], need: { rel: 0.2 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976; } },
      // 大福の密約　1976年〜・史実
      { n: 9233, id: 'jimin_sosai76', name: '大福の密約', acts: [3], need: { rel: 0.2 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 !Q.jimin_sosai76_done && !Q.in_power; } },
      // 飛鳥田一雄　1977年〜・史実
      { n: 3020, id: 'a3_asukata', name: '飛鳥田一雄', acts: [3], need: { chair: 0.3 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.local_n >= 1; } },
      // 社会市民連合　1977年〜・史実
      { n: 3210, id: 'a3_shakai_shiminren', name: '社会市民連合', acts: [3], need: { split: 0.35 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.gone_chuu || Q.shamin_exists; } },
      // 一九七七年参院選　1977年〜・史実
      { n: 3211, id: 'a3_1977_sanin', name: '一九七七年参院選', acts: [3], need: { hc: 0.35 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.local_n >= 1; } },
      // 共産党の党首公選　1977年〜・史実
      { n: 3803, id: 'a3_kyosan_kosen', name: '共产党的党首公选', acts: [3], need: { rel: 0.14 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 !Q.kyosan_merged && Q.kyosan_kosen; } },
      // 円高不況　1977年〜・史実
      { n: 3805, id: 'a3_endaka', name: '日元升值萧条', acts: [3], need: { labor: 0.2 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977; } },
      // 成田空港の開港　1978年〜・史実
      { n: 4001, id: 'a4_narita_kaiko', name: '成田空港の開港', acts: [4], need: { rally: 0.15 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978; } },
      // 日中平和友好条約　1978年〜・史実
      { n: 4161, id: 'a4_nicchu_yuko', name: '日中平和友好条約', acts: [4], need: { rel: 0.15 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978 &&
                 Q.kyokai_grip >= 35; } },
      // 社会民主連合　1978年〜・史実
      { n: 8106, id: 'a4_shaminren', name: '社会民主联合', acts: [4], need: { rel: 0.14 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978 &&
                 Q.shamin_exists; } },
      // 日米防衛協力の指針　1978年〜・史実
      { n: 8107, id: 'a4_guideline', name: '日美防卫合作指针', acts: [4], need: { diet: 0.16 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978 &&
                 !Q.gov_ours; } },
      // 超法規的行動　1978年〜・史実
      { n: 8108, id: 'a4_kurisu', name: '超法规行动', acts: [4], need: { diet: 0.14 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978 &&
                 !Q.gov_ours; } },
      // 牛肉・オレンジの輸入枠　1978年〜・史実
      { n: 4801, id: 'a4_gyuniku', name: '牛肉・オレンジの輸入枠', acts: [4], need: { diet: 0.2 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978; } },
      // 自治体からの撤退　1979年〜・史実
      { n: 441, id: 'a4_shakomin_jichitai', name: '自治体からの撤退', acts: [4], need: { org: 0.14 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 (Q.local_n >= 1) && !Q.evdone_a4_jichitai_hokai && !Q.evdone_jichitai_hokai_sa; } },
      // 美濃部引退　1979年〜・史実
      { n: 4002, id: 'a4_minobe_intai', name: '美濃部引退', acts: [4], need: { org: 0.2 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 Q.komei_exists; } },
      // 革新自治体の崩落　帯中間右/右・1979年〜・史実
      { n: 4003, id: 'a4_jichitai_hokai', name: '革新自治体の崩落', acts: [4], need: { org: 0.3 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.local_n >= 2) && !Q.evdone_a4_shakomin_jichitai && !Q.evdone_jichitai_hokai_sa; } },
      // 一般消費税　帯中間右/右・1979年〜・史実
      { n: 4004, id: 'a4_shohizei_1', name: '一般消費税', acts: [4], need: { diet: 0.2 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 元号法制化　1979年〜・史実
      { n: 4162, id: 'a4_gengo', name: '元号法制化', acts: [4], need: { diet: 0.15 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 !Q.evdone_gengo; } },
      // 一九七九年十月の総選挙　1979年〜・史実
      { n: 4163, id: 'a4_1979_senkyo', name: '一九七九年十月の総選挙', acts: [4], need: { hr: 0.25 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 !Q.gov_ours; } },
      // 革新自治体の崩落　帯左/中間左・1979年〜・史実
      { n: 7402, id: 'jichitai_hokai_sa', name: '革新自治体の崩落', acts: [4], need: { org: 0.3 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.local_n >= 2) && !Q.evdone_a4_shakomin_jichitai && !Q.evdone_a4_jichitai_hokai; } },
      // 一般消費税　帯左/中間左・1979年〜・史実
      { n: 7406, id: 'shohizei_1_sa', name: '一般消費税', acts: [4], need: { diet: 0.2 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 統一地方選（一九七九年）　1979年〜・史実
      { n: 8031, id: 'a4_touitsu_79', name: '統一地方選（一九七九年）', acts: [4], need: { org: 0.2 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 Q.local_n >= 1; } },
      // 臨調と行政改革　1980年〜・史実
      { n: 152, id: 'rincho', name: '臨調と行政改革', acts: [4], need: { labor: 0.14 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 !Q.gov_ours; } },
      // 教科書問題　1980年〜・史実
      { n: 153, id: 'kyokasho', name: '教科書問題', acts: [4], need: { rel: 0.14 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 !Q.evdone_a4_kyokashu; } },
      // 指紋押捺拒否　1980年〜・史実
      { n: 4301, id: 'a4_shimon', name: '拒绝按捺指纹', acts: [4], need: { rally: 0.2 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980; } },
      // 社公合意　軸未定/社公民・1980年〜・史実
      { n: 4005, id: 'a4_shako_goi', name: '社公合意', acts: [4], need: { rel: 0.3 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.evdone_sp_shako1980 && !Q.in_power; } },
      // ハプニング解散　1980年〜・史実
      { n: 4006, id: 'a4_happening', name: 'ハプニング解散', acts: [4], need: { diet: 0.3 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 !Q.gov_ours; } },
      // 選挙中の死　1980年〜・史実
      { n: 4164, id: 'a4_ohira_shi', name: '選挙中の死', acts: [4], need: { name: 0.2 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 !Q.gov_ours; } },
      // 一九八〇年六月　1980年〜・史実
      { n: 4176, id: 'a4_1980_senkyo', name: '一九八〇年六月', acts: [4], need: { hr: 0.3 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 !Q.gov_ours; } },
      // 第二臨調　帯中間右/右・1981年〜・史実
      { n: 4007, id: 'a4_rincho', name: '第二臨調', acts: [4], need: { labor: 0.25 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.gov_ours; } },
      // 第二臨調　帯左/中間左・1981年〜・史実
      { n: 7401, id: 'rincho_sa', name: '第二臨調', acts: [4], need: { labor: 0.25 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中国残留孤児　1981年〜・史実
      { n: 8109, id: 'a4_zanryu_koji', name: '中国残留孤儿', acts: [4], need: { diet: 0.14 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981; } },
      // 国際障害者年　1981年〜・史実
      { n: 8110, id: 'a4_shogaisha', name: '国际残疾人年', acts: [4], need: { org: 0.16 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 !Q.gov_ours; } },
      // ライシャワー発言　1981年〜・史実
      { n: 4802, id: 'a4_reischauer', name: '赖肖尔的发言', acts: [4], need: { rally: 0.2 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 !Q.gov_ours; } },
      // 行政改革（政権の側）　1981年〜・史実
      { n: 9221, id: 'gov_gyokaku', name: '行政改革（政権の側）', acts: [4, 5], need: { labor: 0.25 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 Q.gov_ours; } },
      // 労働戦線統一の民間先行　1982年〜・史実
      { n: 156, id: 'minkan_senko', name: '労働戦線統一の民間先行', acts: [4], need: { labor: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 Q.minsha_exists; } },
      // 難民条約と国民年金　1982年〜・史実
      { n: 4302, id: 'a4_nanmin', name: '难民条约与国民年金', acts: [4], need: { diet: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982; } },
      // 全民労協　帯中間右/右・1982年〜・史実
      { n: 4008, id: 'a4_zenmin_rokyo', name: '全民労協', acts: [4], need: { labor: 0.3 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a4_1985_toitsu && !Q.evdone_zenmin_rokyo_sa; } },
      // 中曽根内閣　帯中間右/右・1982年〜・史実
      { n: 4009, id: 'a4_nakasone', name: '中曽根内閣', acts: [4], need: { name: 0.25 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.gov_ours; } },
      // 教科書問題　1982年〜・史実
      { n: 4010, id: 'a4_kyokashu', name: '教科書問題', acts: [4], need: { rally: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 !Q.evdone_kyokasho; } },
      // 全民労協　帯左/中間左・1982年〜・史実
      { n: 7404, id: 'zenmin_rokyo_sa', name: '全民労協', acts: [4], need: { labor: 0.3 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a4_1985_toitsu && !Q.evdone_a4_zenmin_rokyo; } },
      // 中曽根内閣　帯左/中間左・1982年〜・史実
      { n: 7405, id: 'nakasone_sa', name: '中曽根内閣', acts: [4], need: { name: 0.25 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.gov_ours; } },
      // 共産党の綱領改定　1982年〜・史実
      { n: 4805, id: 'a4_kyosan_koryo', name: '共产党改纲领', acts: [4], need: { rel: 0.14 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 !Q.kyosan_merged && Q.kyosan_kaikaku; } },
      // 中曽根の登場　1982年〜・史実
      { n: 9234, id: 'jimin_sosai82', name: '中曽根の登場', acts: [4], need: { rel: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 !Q.gov_ours && !Q.jimin_sosai82_done; } },
      // 「不沈空母」発言　1983年〜・史実
      { n: 154, id: 'fuchinkubo', name: '「不沈空母」発言', acts: [4], need: { rally: 0.14 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 !Q.gov_ours; } },
      // 男女雇用機会均等法　1983年〜・史実
      { n: 155, id: 'kintou_ho', name: '男女雇用機会均等法', acts: [4], need: { diet: 0.2 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 !Q.evdone_a4_danjo && !Q.evdone_danjo_sa; } },
      // 電電と専売の民営化　1983年〜・史実
      { n: 332, id: 'a4_denden', name: '電電と専売の民営化', acts: [4], need: { labor: 0.14 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
      // 国鉄再建監理委員会　1983年〜・史実
      { n: 442, id: 'a4_kokutetsu_saiken', name: '国鉄再建監理委員会', acts: [4], need: { labor: 0.25 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
      // 連合への道　1983年〜・史実
      { n: 444, id: 'a4_rengo_junbi', name: '連合への道', acts: [4], need: { labor: 0.14 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 Q.minsha_exists; } },
      // 総評解散論　1983年〜・史実
      { n: 523, id: 'a4_sohyo_kaisan_ron', name: '総評解散論', acts: [4], need: { labor: 0.3 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 Q.minsha_exists; } },
      // 臨教審　1983年〜・史実
      { n: 526, id: 'a4_kyoiku_rinkyoshin', name: '臨教審', acts: [4], need: { org: 0.3 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 !Q.gov_ours; } },
      // 田中判決　帯中間右/右・1983年〜・史実
      { n: 4011, id: 'a4_tanaka_hanketsu', name: '田中判決', acts: [4], need: { diet: 0.3 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 石橋政嗣　1983年〜・史実
      { n: 4012, id: 'a4_ishibashi', name: '石橋政嗣', acts: [4], need: { chair: 0.25 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
      // 参院比例代表制　帯中間右/右・1983年〜・史実
      { n: 4013, id: 'a4_hirei', name: '参院比例代表制', acts: [4], need: { hc: 0.25 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 一九八三年十二月　帯中間右/右・1983年〜・史実
      { n: 4020, id: 'a4_1983_senkyo', name: '一九八三年十二月', acts: [4], need: { hr: 0.35 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.gov_ours && Q.prev_seats !== undefined; } },
      // 医療費の自己負担　1983年〜・史実
      { n: 4203, id: 'a4_iryohi', name: '医療費の自己負担', acts: [4], need: { diet: 0.2 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
      // 田中判決　帯左/中間左・1983年〜・史実
      { n: 7408, id: 'tanaka_hanketsu_sa', name: '田中判決', acts: [4], need: { diet: 0.3 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 参院比例代表制　帯左/中間左・1983年〜・史実
      { n: 7409, id: 'hirei_sa', name: '参院比例代表制', acts: [4], need: { hc: 0.25 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 一九八三年十二月　帯左/中間左・1983年〜・史実
      { n: 7410, id: 'senkyo83_sa', name: '一九八三年十二月', acts: [4], need: { hr: 0.35 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 総評の大会　1983年〜・史実
      { n: 8001, id: 'a4_sohyo_taikai', name: '総評の大会', acts: [4], need: { labor: 0.2 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
      // 国鉄の赤字　1984年〜・史実
      { n: 4169, id: 'a4_kokutetsu_akaji', name: '国鉄の赤字', acts: [4], need: { labor: 0.3 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 臨時教育審議会　1984年〜・史実
      { n: 8111, id: 'a4_rinkyoshin', name: '临时教育审议会', acts: [4], need: { labor: 0.16 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 健康保険の一割負担　1984年〜・史実
      { n: 8112, id: 'a4_kenpo_kaisei', name: '健保的一成自付', acts: [4], need: { labor: 0.18 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 被爆者援護法　1984年〜・史実
      { n: 4803, id: 'a4_hibakusha', name: '被爆者援护法', acts: [4], need: { diet: 0.2 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 国鉄の処理　帯中間右/右・1985年〜・史実
      { n: 4014, id: 'a4_kokutetsu_bunkatsu', name: '国鉄の処理', acts: [4], need: { labor: 0.4 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.gov_ours; } },
      // 男女雇用機会均等法　帯中間右/右・1985年〜・史実
      { n: 4015, id: 'a4_danjo', name: '男女雇用機会均等法', acts: [4], need: { diet: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_kintou_ho; } },
      // 電電と専売　1985年〜・史実
      { n: 4165, id: 'a4_denden_senbai', name: '電電と専売', acts: [4], need: { labor: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 公式参拝　1985年〜・史実
      { n: 4166, id: 'a4_yasukuni', name: '公式参拝', acts: [4], need: { rally: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 !Q.gov_ours; } },
      // プラザ合意　1985年〜・史実
      { n: 4167, id: 'a4_plaza', name: 'プラザ合意', acts: [4], need: { org: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 年金の改定　1985年〜・史実
      { n: 4204, id: 'a4_nenkin_kaisei', name: '年金の改定', acts: [4], need: { diet: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 「戦後政治の総決算」　1985年〜・史実
      { n: 4208, id: 'a4_sengo_seiji', name: '「戦後政治の総決算」', acts: [4], need: { koryo: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 !Q.gov_ours; } },
      // 指紋押捺　1985年〜・史実
      { n: 4210, id: 'a4_zainichi', name: '指紋押捺', acts: [4], need: { rally: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 労働戦線の詰め　1985年〜・史実
      { n: 4212, id: 'a4_1985_toitsu', name: '労働戦線の詰め', acts: [4], need: { labor: 0.35 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 (Q.minsha_exists) && !Q.evdone_a4_zenmin_rokyo && !Q.evdone_zenmin_rokyo_sa; } },
      // 国鉄の処理　帯左/中間左・1985年〜・史実
      { n: 7403, id: 'kokutetsu_bunkatsu_sa', name: '国鉄の処理', acts: [4], need: { labor: 0.4 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 男女雇用機会均等法　帯左/中間左・1985年〜・史実
      { n: 7407, id: 'danjo_sa', name: '男女雇用機会均等法', acts: [4], need: { diet: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_kintou_ho; } },
      // 補助金の一律削減　1985年〜・史実
      { n: 4804, id: 'a4_hojokin', name: '补助金一律削减', acts: [4], need: { diet: 0.2 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 自社連立の再打診　史実
      { n: 5807, id: 'a5_jisha_saido', name: '自社联合的再试探', acts: [5], need: { diet: 0.2 }, fixed: true,
        when: function (Q) { return Q.minsha_ka && Q.reorg_done && !Q.jisha_pact && !Q.in_power && !Q.kyosan_merged && !Q.minshu_shinto && Q.evdone_a4_jisha_dashin && (Q.elec_year || 0) >= 1986 && (Q.res_jimin || 0) < Math.floor((Q.hr_total || 511) / 2) + 1 && (Q.res_jimin || 0) + (Q.seats_hr || 0) >= Math.floor((Q.hr_total || 511) / 2) + 1; } },
      // 国民民主党　史実
      { n: 5808, id: 'a5_kokumin_minshu', name: '国民民主党', acts: [5], need: { koryo: 0.2 }, fixed: true,
        when: function (Q) { return Q.jisha_cabinet && Q.in_power && Q.cab_kind === 4 && Q.reorg_done && !Q.kokumin_minshu && !Q.kyosan_merged && !Q.minshu_shinto; } },
      // 野党再編　史実
      { n: 9236, id: 'opp_saihen', name: '野党再編', acts: [5], need: { rel: 0.2 }, fixed: true,
        when: function (Q) { return window.JSP.oppMergeReady(Q); } },
      // 向こうの党の党首選　史実
      { n: 9237, id: 'opp_toshu', name: '向こうの党の党首選', acts: [5], need: { rel: 0.2 }, fixed: true,
        when: function (Q) { return Q.opp_merged && !Q.opp_head_done; } },
      // 昭和が終わる　1986年〜・史実
      { n: 173, id: 'tenno', name: '昭和が終わる', acts: [5], need: { rel: 0.2 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 (Q.local_n >= 1) && !Q.evdone_a5_showa_owari; } },
      // マドンナたち　1986年〜・史実
      { n: 341, id: 'a5_madonna', name: 'マドンナたち', acts: [5], need: { org: 0.14 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 !Q.evdone_a5_b2_josei_koho; } },
      // 地価と株価　1986年〜・史実
      { n: 342, id: 'a5_baburu', name: '地価と株価', acts: [5], need: { diet: 0.14 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 !Q.evdone_a5_bubble; } },
      // 国鉄の後始末　1986年〜・史実
      { n: 343, id: 'a5_kokutetsu_saiyou', name: '国鉄の後始末', acts: [5], need: { labor: 0.14 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 押捺拒否一万人　1986年〜・史実
      { n: 5301, id: 'a5_shimon_zenkoku', name: '拒按者一万人', acts: [5], need: { rally: 0.22 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 !Q.kyosan_merged; } },
      // 一九八六年七月の同日選　1986年〜・史実
      { n: 5001, id: 'a5_doujitsu86', name: '一九八六年七月の同日選', acts: [5], need: { hr: 0.15 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 原発をどうするか　1986年〜・史実
      { n: 5207, id: 'a5_chernobyl', name: '原発をどうするか', acts: [5], need: { rally: 0.25 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 前川リポート　1986年〜・史実
      { n: 5801, id: 'a5_maekawa', name: '前川报告', acts: [5], need: { labor: 0.2 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 !Q.in_power; } },
      // 公明党の委員長交代　1986年〜・史実
      { n: 9232, id: 'komei_toshu', name: '公明党の委員長交代', acts: [5], need: { rel: 0.2 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 !Q.komei_head_done && Q.komei_exists; } },
      // 売上税　1987年〜・史実
      { n: 5003, id: 'a5_baiagezei', name: '売上税', acts: [5], need: { diet: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 !Q.gov_ours && !Q.evdone_uriagezei; } },
      // 民間連合　1987年〜・史実
      { n: 5004, id: 'a5_rengo_minkan', name: '民間連合', acts: [5], need: { labor: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 Q.minsha_exists; } },
      // 国労の最後　1987年〜・史実
      { n: 5102, id: 'a5_b1_kokurou_saigo', name: '国労の最後', acts: [5], need: { labor: 0.25 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987; } },
      // 一九八七年の地方選　1987年〜・史実
      { n: 5161, id: 'a5_chihosen87', name: '一九八七年の地方選', acts: [5], need: { org: 0.15 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 !Q.gov_ours; } },
      // 竹下内閣　1987年〜・史実
      { n: 5162, id: 'a5_takeshita', name: '竹下内閣', acts: [5], need: { name: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 !Q.gov_ours; } },
      // 統一地方選（一九八七年）　1987年〜・史実
      { n: 8032, id: 'a5_touitsu_87', name: '統一地方選（一九八七年）', acts: [5], need: { org: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 Q.local_n >= 1; } },
      // 国鉄改革（政権の側）　1987年〜・史実
      { n: 9222, id: 'gov_kokutetsu', name: '国鉄改革（政権の側）', acts: [5], need: { labor: 0.3 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 Q.gov_ours && !Q.kokutetsu_kind; } },
      // 安竹宮　1987年〜・史実
      { n: 9235, id: 'jimin_sosai87', name: '安竹宮', acts: [5], need: { rel: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 !Q.jimin_sosai87_done && !Q.in_power; } },
      // リクルート事件　帯中間右/右・1988年〜・史実
      { n: 5005, id: 'a5_recruit', name: 'リクルート事件', acts: [5], need: { name: 0.25 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 消費税成立　帯中間右/右・1988年〜・史実
      { n: 5006, id: 'a5_shohizei_seiritsu', name: '消費税成立', acts: [5], need: { diet: 0.3 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // リクルート　帯左/中間左・1988年〜・史実
      { n: 7602, id: 'recruit_sa', name: 'リクルート', acts: [5], need: { name: 0.25 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 消費税成立　帯左/中間左・1988年〜・史実
      { n: 7603, id: 'shohizei_seiritsu_sa', name: '消費税成立', acts: [5], need: { diet: 0.3 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 自粛　1988年〜・史実
      { n: 8114, id: 'a5_jishuku', name: '自肃', acts: [5], need: { diet: 0.16 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988; } },
      // 牛肉・オレンジの自由化　1988年〜・史実
      { n: 5802, id: 'a5_gyuniku_jiyuka', name: '牛肉和橙子的自由化', acts: [5], need: { org: 0.2 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988; } },
      // 宇野内閣　1989年〜・史実
      { n: 5007, id: 'a5_uno', name: '宇野内閣', acts: [5], need: { name: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 !Q.gov_ours; } },
      // 山が動いた　帯中間右/右・1989年〜・史実
      { n: 5008, id: 'a5_yama_ga_ugoita', name: '地动山摇', acts: [5], need: { hc: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.seats_hc >= 80) && !Q.evdone_a5_sanin_daishou && !Q.evdone_yama_ga_ugoita_sa; } },
      // 連合結成　帯中間右/右・1989年〜・史実
      { n: 5009, id: 'a5_rengo_kessei', name: '連合結成', acts: [5], need: { labor: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 ['history','right_unify'].indexOf(window.JSP.reorgKind(Q)) >= 0 && !Q.evdone_sp_rengo1989; } },
      // 自民党分裂　1989年〜・史実
      { n: 5021, id: 'a5_jimin_wareme', name: '自民党分裂', acts: [5], need: { rel: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.year <= 1992 &&
                 window.JSP.ldpWareReady(Q) && !Q.in_power; } },
      // 昭和が終わる　1989年〜・史実
      { n: 5163, id: 'a5_showa_owari', name: '昭和が終わる', acts: [5], need: { name: 0.2 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 !Q.evdone_tenno; } },
      // 四月一日　1989年〜・史実
      { n: 5164, id: 'a5_shohizei_jisshi', name: '四月一日', acts: [5], need: { diet: 0.25 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 「やるっきゃない」　1989年〜・史実
      { n: 5165, id: 'a5_doi_ninki', name: '「やるっきゃない」', acts: [5], need: { name: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.post_chair === "doi"; } },
      // 海部内閣　1989年〜・史実
      { n: 5166, id: 'a5_kaifu', name: '海部内閣', acts: [5], need: { name: 0.25 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 !Q.gov_ours; } },
      // 総評解散　1989年〜・史実
      { n: 5169, id: 'a5_sohyo_kaisan', name: '総評解散', acts: [5], need: { labor: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.kyokai_grip >= 35 && window.JSP.reorgKind(Q) !== 'sohyo_survive'; } },
      // 土地基本法　1989年〜・史実
      { n: 5204, id: 'a5_tochi_kihon', name: '土地基本法', acts: [5], need: { diet: 0.25 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 山が動いた　帯左/中間左・1989年〜・史実
      { n: 7604, id: 'yama_ga_ugoita_sa', name: '地动山摇', acts: [5], need: { hc: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.seats_hc >= 80) && !Q.evdone_a5_sanin_daishou && !Q.evdone_a5_yama_ga_ugoita && !Q.in_power; } },
      // 連合結成　帯左/中間左・1989年〜・史実
      { n: 7605, id: 'rengo_kessei_sa', name: '連合結成', acts: [5], need: { labor: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 ['history','right_unify'].indexOf(window.JSP.reorgKind(Q)) >= 0 && !Q.evdone_sp_rengo1989; } },
      // 労働戦線の帰結　1989年〜・史実
      { n: 8002, id: 'a5_roso_kiketsu', name: '労働戦線の帰結', acts: [5], need: { labor: 0.2 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 東欧革命　1990年〜・史実
      { n: 174, id: 'toou', name: '東欧革命', acts: [5], need: { koryo: 0.14 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 !Q.kyosan_merged; } },
      // コメ市場開放　1990年〜・史実
      { n: 175, id: 'kome', name: 'コメ市場開放', acts: [5], need: { labor: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 !Q.evdone_a5_kome_kaihou; } },
      // 佐川急便事件　1990年〜・史実
      { n: 176, id: 'sagawa', name: '佐川急便事件', acts: [5], need: { diet: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
      // 世代交代　1990年〜・史実
      { n: 179, id: 'yamahana', name: '世代交代', acts: [5], need: { org: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.komei_exists; } },
      // 参院選の大勝　1990年〜・史実
      { n: 452, id: 'a5_sanin_daishou', name: '参院選の大勝', acts: [5], need: { rally: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 ((Q.hc_diff || 0) >= 10 && (Q.seats_hc || 0) >= 60) && !Q.evdone_a5_yama_ga_ugoita && !Q.evdone_yama_ga_ugoita_sa; } },
      // 自衛隊の海外派遣　1990年〜・史実
      { n: 453, id: 'a5_kaigai_haken', name: '自衛隊の海外派遣', acts: [5], need: { diet: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.minsha_exists; } },
      // 連合の組合員　1990年〜・史実
      { n: 454, id: 'a5_rengo_kaiin', name: '連合の組合員', acts: [5], need: { labor: 0.14 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.minsha_exists; } },
      // 地球環境　1990年〜・史実
      { n: 542, id: 'a5_kankyo', name: '地球環境', acts: [5], need: { rally: 0.3 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
      // コメの部分開放　1990年〜・史実
      { n: 544, id: 'a5_kome_kaihou', name: 'コメの部分開放', acts: [5], need: { org: 0.3 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 !Q.evdone_kome; } },
      // 閣僚配分の交渉　軸社公民・1990年〜・史実
      { n: 633, id: 'c2_a5_kakuryo_haibun', name: '閣僚配分の交渉', acts: [5], need: { rel: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power && !Q.evdone_a5_hosokawa; } },
      // 一九九〇年二月　1990年〜・史実
      { n: 5010, id: 'a5_1990', name: '一九九〇年二月', acts: [5], need: { hr: 0.35 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 !Q.gov_ours; } },
      // 湾岸危機　帯中間右/右・1990年〜・史実
      { n: 5011, id: 'a5_wangan', name: '湾岸危機', acts: [5], need: { rally: 0.3 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 地価高騰　1990年〜・史実
      { n: 5167, id: 'a5_bubble', name: '地価高騰', acts: [5], need: { org: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 !Q.evdone_a5_baburu; } },
      // 湾岸戦争　帯左/中間左・1990年〜・史実
      { n: 7606, id: 'wangan_sa', name: '海湾战争', acts: [5], need: { rally: 0.3 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社共合同　1990年〜・史実
      { n: 5805, id: 'a5_shakyo_gassho', name: '社共合同', acts: [5], need: { rel: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.kyosan_kaikaku && Q.evdone_toou && !Q.kyosan_merged && !Q.minshu_shinto && window.JSP.bandOf(Q) <= 2 && (Q.rel_kyosan || 0) >= 50; } },
      // 日韓覚書と特別永住　1991年〜・史実
      { n: 5302, id: 'a5_tokubetsu_eiju', name: '日韩备忘录与特别永住', acts: [5], need: { rel: 0.25 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991; } },
      // ソ連が消えた　帯中間右/右・1991年〜・史実
      { n: 5012, id: 'a5_soren', name: 'ソ連が消えた', acts: [5], need: { koryo: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 一九九一年の統一地方選　1991年〜・史実
      { n: 5013, id: 'a5_chihosen91', name: '一九九一年の統一地方選', acts: [5], need: { org: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.local_n >= 1; } },
      // 田辺委員長　1991年〜・史実
      { n: 5017, id: 'a5_tanabe', name: '田辺委員長', acts: [5], need: { chair: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 !Q.gov_ours && window.JSP.LEADERS.likely(Q, "tanabe"); } },
      // 九十億ドル　1991年〜・史実
      { n: 5168, id: 'a5_wangan_kikin', name: '九十億ドル', acts: [5], need: { diet: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.komei_exists; } },
      // ソ連の消滅　帯左/中間左・1991年〜・史実
      { n: 7607, id: 'soren_sa', name: 'ソ連の消滅', acts: [5], need: { koryo: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 証券不祥事　1991年〜・史実
      { n: 5803, id: 'a5_shoken', name: '证券丑闻', acts: [5], need: { diet: 0.25 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991; } },
      // 育児休業法　1991年〜・史実
      { n: 5804, id: 'a5_ikuji', name: '育儿休业法', acts: [5], need: { diet: 0.2 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991; } },
      // 民主リベラル新党　1991年〜・史実
      { n: 5806, id: 'a5_minshu_kessei', name: '民主自由派新党', acts: [5], need: { rel: 0.2 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.rengo_formed && Q.reorg_done && !Q.minshu_shinto && !Q.kyosan_merged && !Q.jisha_pact && !Q.jisha_cabinet && window.JSP.bandOf(Q) === 4 && Q.ldp_split_done && (window.JSP.factionOf(Q.post_chair) === "uha" || window.JSP.factionOf(Q.post_chair) === "chuu"); } },
      // 湾岸戦争（政権の側）　1991年〜・史実
      { n: 9220, id: 'gov_gulf', name: '湾岸戦争（政権の側）', acts: [5], need: { diet: 0.2 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.gov_ours; } },
      // PKO国会　帯中間右/右・1992年〜・史実
      { n: 5014, id: 'a5_pko', name: 'PKO国会', acts: [5], need: { diet: 0.35 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 小選挙区制　帯中間右/右・1992年〜・史実
      { n: 5016, id: 'a5_shosenkyoku', name: '小選挙区制', acts: [5], need: { koryo: 0.35 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.senkyoku_seido && !Q.evdone_seiji_kaikaku; } },
      // 一九九二年参院選　1992年〜・史実
      { n: 5170, id: 'a5_1992_sanin', name: '一九九二年参院選', acts: [5], need: { hc: 0.3 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992; } },
      // PKO国会　帯左/中間左・1992年〜・史実
      { n: 7608, id: 'pko_sa', name: 'PKO国会', acts: [5], need: { diet: 0.35 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 小選挙区制　帯左/中間左・1992年〜・史実
      { n: 7609, id: 'shosenkyoku_sa', name: '小選挙区制', acts: [5], need: { koryo: 0.35 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.senkyoku_seido; } },
      // 東京佐川急便　1992年〜・史実
      { n: 8115, id: 'a5_sagawa', name: '东京佐川急便', acts: [5], need: { name: 0.16 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992; } },
      // 内閣不信任　1993年〜・史実
      { n: 5018, id: 'a5_fushinnin', name: '内閣不信任', acts: [5], need: { diet: 0.4 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 !Q.cab_kind && !Q.ldp_wareme; } },
      // 一九九三年七月　帯中間右/右・1993年〜・史実
      { n: 5019, id: 'a5_1993', name: '一九九三年七月', acts: [5], need: { hr: 0.5 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.was_in_power; } },
      // 山花委員長　1993年〜・史実
      { n: 5020, id: 'a5_yamahana', name: '山花委員長', acts: [5], need: { chair: 0.35 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.cab_kind > 0 && window.JSP.LEADERS.likely(Q, "yamahana"); } },
      // 政治改革関連法　1993年〜・史実
      { n: 5172, id: 'a5_seiji_kaikaku_ho', name: '政治改革関連法', acts: [5], need: { diet: 0.35 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.komei_exists && !Q.senkyoku_seido; } },
      // 米の開放　1993年〜・史実
      { n: 5173, id: 'a5_kome', name: '米の開放', acts: [5], need: { org: 0.3 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.cab_kind > 0; } },
      // 政党助成という話　1993年〜・史実
      { n: 5210, id: 'a5_seito_josei', name: '政党助成という話', acts: [5], need: { fund: 0.3 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993; } },
      // 細川内閣　1993年〜・史実
      { n: 5211, id: 'a5_hosokawa', name: '細川内閣', acts: [5], need: { cab: 0.15 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 !Q.minshu_shinto && Q.cab_kind !== 1 && Q.cab_kind !== 4 && !Q.has_souri && (Q.cab_kind > 0) && !Q.evdone_c2_a5_kakuryo_haibun; } },
      // 一九九三年七月　帯左/中間左・1993年〜・史実
      { n: 7610, id: 'senkyo93_sa', name: '一九九三年七月', acts: [5], need: { hr: 0.5 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.was_in_power; } },
      // 警職法の記憶
      { n: 101, id: 'keishokuho', name: '警職法の記憶', acts: [1], need: { rally: 0.12 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.12) &&
                 !Q.evdone_a1_keishokuho; } },
      // 機関紙の拡張運動
      { n: 102, id: 'kikanshi_kakucho', name: '機関紙の拡張運動', acts: [2], need: { fund: 0.12 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.12) &&
                 !Q.evdone_a2_kikanshi; } },
      // 原水禁世界大会
      { n: 103, id: 'gensuikin_59', name: '原水禁世界大会', acts: [3], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2); } },
      // 春闘の方針　帯中間右/右
      { n: 104, id: 'shunto_59', name: '春闘の方針', acts: [2], need: { labor: 0.12 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.12) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 憲法調査会　帯中間右/右
      { n: 105, id: 'kenpo_chosakai', name: '憲法調査会', acts: [2], need: { diet: 0.12 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.12) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 沖縄と小笠原
      { n: 106, id: 'okinawa_59', name: '沖縄と小笠原', acts: [2], need: { rel: 0.12 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.12); } },
      // 浅沼訪中　asanumaが在席
      { n: 107, id: 'asanuma_china', name: '浅沼訪中', acts: [1], need: { rel: 0.22 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.22) &&
                 window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 松川事件の判決
      { n: 108, id: 'matsukawa', name: '松川事件の判決', acts: [2], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2) &&
                 !Q.evdone_a2_matsukawa; } },
      // 全学連の突出　帯左/中間左
      { n: 109, id: 'zengakuren_59', name: '全学連の突出', acts: [2], need: { rally: 0.28 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.28) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政暴法　asanumaが退場後
      { n: 111, id: 'seiboho', name: '政暴法', acts: [2], need: { diet: 0.14 },
        when: function (Q) { return Q.year <= 1963 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 !window.JSP.LEADERS.here(Q, 'asanuma') &&
                 !Q.evdone_a2_seiboho; } },
      // 江田ビジョン　帯中間左/中間右・edaが在席
      { n: 112, id: 'eda_vision', name: '江田ビジョン', acts: [2], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [2, 3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda') &&
                 !Q.evdone_a2_eda_vision; } },
      // LT貿易
      { n: 113, id: 'lt_boeki', name: 'LT貿易', acts: [2], need: { rel: 0.14 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.14); } },
      // 部分的核実験停止条約　帯中間右/右
      { n: 114, id: 'ptbt', name: '部分的核実験停止条約', acts: [2], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 総評の政策転換要求
      { n: 118, id: 'sohyo_seisaku', name: '総評の政策転換要求', acts: [2], need: { labor: 0.14 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.14); } },
      // 長期政権構想　軸未定/社公民・1966年〜
      { n: 120, id: 'shakomin_kousou', name: '長期政権構想', acts: [2], need: { koryo: 0.2 }, year: 1966,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 革新統一の呼びかけ　軸未定/社共
      { n: 121, id: 'kakushin_toitsu', name: '革新統一の呼びかけ', acts: [2], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 党の人材難
      { n: 122, id: 'jinzai', name: '党の人材難', acts: [2], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14); } },
      // 安保の自動延長
      { n: 131, id: 'anpo_jido', name: '安保の自動延長', acts: [3], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14); } },
      // 沖縄返還協定　1972年〜
      { n: 132, id: 'okinawa_henkan', name: '沖縄返還協定', acts: [3], need: { diet: 0.14 }, year: 1972,
        when: function (Q) { return Q.year >= 1972 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.14); } },
      // 革新自治体の財政　帯中間右/右
      { n: 136, id: 'kakushin_shicho', name: '革新自治体の財政', acts: [3], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.local_n >= 1) && !Q.evdone_a3_jichitai_akaji && !Q.evdone_kakushin_shicho_sa; } },
      // 市民運動との距離　帯中間右
      { n: 137, id: 'shimin_undo', name: '市民運動との距離', acts: [3], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 協会規制論　帯中間右/右
      { n: 139, id: 'kyokai_kisei_ronso', name: '協会規制論', acts: [3], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 元号法制化
      { n: 151, id: 'gengo', name: '元号法制化', acts: [4], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 !Q.evdone_a4_gengo; } },
      // 「道」の廃棄論　帯中間右/右
      { n: 157, id: 'shakai_minshu', name: '「道」の廃棄論', acts: [4], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 反核署名運動　帯左/中間左
      { n: 158, id: 'hankaku_shomei', name: '反核署名運動', acts: [4], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 売上税
      { n: 171, id: 'uriagezei', name: '売上税', acts: [5], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 !Q.evdone_a5_baiagezei && !Q.in_power; } },
      // 土井委員長の登場　帯中間右/右
      { n: 172, id: 'doi_shunin', name: '土井委員長の登場', acts: [5], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, "doi"); } },
      // 連合の政権構想　軸未定/社公民・1990年〜
      { n: 177, id: 'rengo_seiken', name: '連合の政権構想', acts: [5], need: { labor: 0.25 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 新社会党の予兆　帯中間右/右
      { n: 178, id: 'shinsha_yocho', name: '新社会党の予兆', acts: [5], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 協会の学習会　帯左
      { n: 201, id: 'a1_saha_kyokai', name: '協会の学習会', acts: [2], need: { org: 0.12 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.12) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 全労系との復縁　帯中間右/右
      { n: 202, id: 'a1_uha_zenro', name: '全労系との復縁', acts: [2], need: { rel: 0.14 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共産党との最初の話　軸未定/社共
      { n: 203, id: 'a1_sakyo_hajime', name: '共産党との最初の話', acts: [1], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged; } },
      // 社青同の主導権　帯左/中間左
      { n: 211, id: 'a2_saha_seiseido', name: '社青同の主導権', acts: [2], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政策集団の設立　帯中間右
      { n: 212, id: 'a2_chuu_seisaku', name: '政策集団の設立', acts: [2], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中道両党との政策協議　軸社公民
      { n: 213, id: 'a2_shakomin_kyogi', name: '中道両党との政策協議', acts: [2], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 Q.komei_exists && !Q.in_power; } },
      // 革新自治体の波　軸社共
      { n: 214, id: 'a2_sakyo_jichitai', name: '革新自治体の波', acts: [2], need: { rel: 0.14 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 協会の全盛　帯左
      { n: 221, id: 'a3_saha_kyokai_zen', name: '協会の全盛', acts: [3], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 同盟との接近　帯右
      { n: 222, id: 'a3_uha_domei', name: '同盟との接近', acts: [3], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.domei_exists; } },
      // 社共共闘の限界　軸社共
      { n: 223, id: 'a3_sakyo_kyoto', name: '社共共闘の限界', acts: [3], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 協会の締め直し　帯左
      { n: 231, id: 'a4_saha_kaku', name: '協会の締め直し', acts: [4], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 現実路線の党内基盤　帯中間右/右・edaが退場後
      { n: 232, id: 'a4_uha_kaikaku', name: '現実路線の党内基盤', acts: [4], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !window.JSP.LEADERS.here(Q, 'eda'); } },
      // 社公民の政権協議　軸社公民・1980年〜
      { n: 233, id: 'a4_shakomin_seiken', name: '社公民の政権協議', acts: [4], need: { rel: 0.2 }, year: 1980,
        when: function (Q) { return Q.year >= 1980 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 全労協の準備　帯左・1988年〜
      { n: 241, id: 'a5_saha_zenrokyo', name: '全労協の準備', acts: [5], need: { labor: 0.2 }, year: 1988,
        when: function (Q) { return Q.year >= 1988 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新党構想　帯右・1990年〜
      { n: 242, id: 'a5_uha_shinto', name: '新党構想', acts: [5], need: { koryo: 0.2 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a5_uha_kaisan; } },
      // 社共共闘の最後　軸社共
      { n: 243, id: 'a5_sakyo_saigo', name: '社共共闘の最後', acts: [5], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged && !Q.evdone_a5_c1_kyodo_saigo && !Q.in_power; } },
      // 一六六議席のあと　asanumaが在席
      { n: 301, id: 'a1_1958_senkyo', name: '一六六議席のあと', acts: [1], need: { koryo: 0.12 },
        when: function (Q) { return Q.year <= 1959 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.12) &&
                 window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 勤評闘争
      { n: 302, id: 'a1_gyakkoro', name: '勤評闘争', acts: [1], need: { labor: 0.12 },
        when: function (Q) { return Q.year <= 1960 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.12) &&
                 !Q.evdone_a1_kinpyo; } },
      // 統一の条件
      { n: 303, id: 'a1_toitsu_joken', name: '統一の条件', acts: [1], need: { koryo: 0.2 },
        when: function (Q) { return Q.year <= 1960 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 !Q.minsha_exists; } },
      // 国鉄の労使
      { n: 304, id: 'a1_kokutetsu_58', name: '国鉄の労使', acts: [2], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2); } },
      // 安保改定の全容
      { n: 305, id: 'a1_anpo_kaitei', name: '安保改定の全容', acts: [1], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2); } },
      // 党改革の提案
      { n: 306, id: 'a1_shakaito_kaigi', name: '党改革の提案', acts: [2], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14); } },
      // 共産党の路線転換　軸未定/社共
      { n: 307, id: 'a1_kyosan_rokuzenkyo', name: '共産党の路線転換', acts: [1], need: { rel: 0.14 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged; } },
      // 所得倍増計画　帯中間右/右
      { n: 311, id: 'a2_shotoku_baizo', name: '所得倍増計画', acts: [2], need: { diet: 0.14 },
        when: function (Q) { return Q.year <= 1965 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 総評の路線　帯中間右/右
      { n: 314, id: 'a2_sohyo_ohta', name: '総評の路線', acts: [2], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 公明党の誕生　1963年〜
      { n: 315, id: 'a2_komeito_tanjo', name: '公明党の誕生', acts: [2], need: { rel: 0.14 }, year: 1963,
        when: function (Q) { return Q.year >= 1963 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 Q.komei_exists; } },
      // 公害国会
      { n: 321, id: 'a3_kougai_kokkai', name: '公害国会', acts: [3], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 !Q.evdone_a3_kogai_kokkai; } },
      // 党の宣伝機構
      { n: 326, id: 'a3_shakai_shinbun', name: '党の宣伝機構', acts: [3], need: { fund: 0.2 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.2); } },
      // 成田の引退　naritaが在席
      { n: 331, id: 'a4_narita_intai', name: '成田の引退', acts: [4], need: { org: 0.14 },
        when: function (Q) { return Q.year <= 1980 &&
                 Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 window.JSP.LEADERS.here(Q, 'narita') &&
                 Q.local_n >= 1; } },
      // 年金と医療の改革
      { n: 333, id: 'a4_shakai_hoken', name: '年金と医療の改革', acts: [4], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 Q.local_n >= 1; } },
      // 都市票の流出
      { n: 334, id: 'a4_toshi_hyou', name: '都市票の流出', acts: [4], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14) &&
                 Q.komei_exists; } },
      // 政治改革の協議会　1990年〜
      { n: 344, id: 'a5_seiji_kaikaku_kyogi', name: '政治改革の協議会', acts: [5], need: { rel: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 Q.minsha_exists && !Q.senkyoku_seido; } },
      // 党の名前　1990年〜
      { n: 345, id: 'a5_shakaito_saigo', name: '党の名前', acts: [5], need: { koryo: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 !Q.evdone_a5_shakai_minshu; } },
      // 西尾除名の前夜
      { n: 401, id: 'a1_nishio_choubatsu', name: '西尾除名の前夜', acts: [1], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 !Q.minsha_exists; } },
      // 全労会議の拡大
      { n: 402, id: 'a1_zenro_kessei', name: '全労会議の拡大', acts: [2], need: { labor: 0.14 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.14); } },
      // 岸内閣の経済政策
      { n: 403, id: 'a1_kishi_keizai', name: '岸内閣の経済政策', acts: [1], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14); } },
      // 文化人との距離
      { n: 404, id: 'a1_shakaito_bunka', name: '文化人との距離', acts: [3], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14); } },
      // 左派綱領の中身　帯左
      { n: 405, id: 'a1_saha_koryo', name: '左派綱領の中身', acts: [2], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 国民政党論　帯右
      { n: 406, id: 'a1_uha_kokumin', name: '国民政党論', acts: [1], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.minsha_exists; } },
      // 基地の周辺
      { n: 407, id: 'a1_gunji_kichi', name: '基地の周辺', acts: [2], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2); } },
      // 総評のカンパ
      { n: 408, id: 'a1_sohyo_kanpa', name: '総評のカンパ', acts: [4], need: { fund: 0.2 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.2); } },
      // 安保共闘の枠組み　軸未定/社共
      { n: 409, id: 'a1_sakyo_anpo', name: '安保共闘の枠組み', acts: [1], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 三池のあと
      { n: 411, id: 'a2_mitsui_ato', name: '三池のあと', acts: [2], need: { labor: 0.14 },
        when: function (Q) { return Q.year <= 1965 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.14); } },
      // 護憲連合の運営　帯中間左
      { n: 412, id: 'a2_kenpou_kaigi', name: '護憲連合の運営', acts: [2], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 党財政の危機
      { n: 413, id: 'a2_zaisei_kiki', name: '党財政の危機', acts: [2], need: { fund: 0.2 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.2) &&
                 (Q.budget || 0) <= 8 || (Q.arrears || 0) >= 2; } },
      // 国会の運営
      { n: 414, id: 'a2_kokkai_unei', name: '国会の運営', acts: [2], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2) &&
                 Q.komei_exists; } },
      // 農村に届かない
      { n: 421, id: 'a2_noson', name: '農村に届かない', acts: [2], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2); } },
      // 社青同の分裂　1963年〜
      { n: 422, id: 'a2_seiseido_kaiho', name: '社青同の分裂', acts: [2], need: { rally: 0.25 }, year: 1963,
        when: function (Q) { return Q.year >= 1963 &&
                 Q.c_rally >= window.JSP.needOf(Q, 0.25) &&
                 !Q.evdone_a2_seinen_bunretsu; } },
      // 社会保障の設計
      { n: 423, id: 'a2_shakai_hosho', name: '社会保障の設計', acts: [2], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25) &&
                 !Q.evdone_a2_b3_shakai_hoshou; } },
      // 炭鉱の閉山
      { n: 424, id: 'a2_hokkaido_tanko', name: '炭鉱の閉山', acts: [2], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 Q.local_n >= 1; } },
      // 社会主義インター　帯中間左/中間右/右
      { n: 425, id: 'a2_kokusai', name: '社会主義インター', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [2, 3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 青年組織の空洞化
      { n: 431, id: 'a3_seiseido_kaitai', name: '青年組織の空洞化', acts: [3], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 Q.kyokai_grip >= 35; } },
      // 協会規制の決議　帯中間左/中間右
      { n: 434, id: 'a3_kyokai_kisei_ketsugi', name: '協会規制の決議', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [2, 3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 党の資金源
      { n: 435, id: 'a3_seiji_shikin', name: '党の資金源', acts: [3], need: { fund: 0.14 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.14) &&
                 Q.local_n >= 1 && ((Q.budget || 0) <= 12 || (Q.arrears || 0) >= 1); } },
      // 公明党からの照会　軸未定/社公民
      { n: 436, id: 'a3_shakomin_shokai', name: '公明党からの照会', acts: [3], need: { rel: 0.14 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 政策集団と学者　帯中間左/中間右/右
      { n: 437, id: 'a3_gakusha', name: '政策集団と学者', acts: [3], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [2, 3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 核持ち込み疑惑
      { n: 443, id: 'a4_kaku_mochikomi', name: '核持ち込み疑惑', acts: [4], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25) &&
                 !Q.in_power; } },
      // 生活者の党へ　帯中間右
      { n: 445, id: 'a4_shakai_shimin', name: '生活者の党へ', acts: [4], need: { rally: 0.25 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 定数不均衡
      { n: 446, id: 'a4_giin_teisu', name: '定数不均衡', acts: [4], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14); } },
      // 協会系の離反　帯中間右/右
      { n: 447, id: 'a4_kyokai_ridatsu', name: '協会系の離反', acts: [4], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新宣言のあと
      { n: 451, id: 'a5_shinsengen_go', name: '新宣言のあと', acts: [5], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 Q.shin_sengen; } },
      // 日本新党ブーム　1990年〜
      { n: 455, id: 'a5_hosokawa_boom', name: '日本新党ブーム', acts: [5], need: { rally: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_rally >= window.JSP.needOf(Q, 0.14) &&
                 !Q.minshu_shinto && !Q.opp_merged && Q.komei_exists && !Q.evdone_shinto_boom; } },
      // 最後の組織化
      { n: 456, id: 'a5_soshiki_saigo', name: '最後の組織化', acts: [5], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 教育の争点
      { n: 501, id: 'a1_kyoiku', name: '教育の争点', acts: [3], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25); } },
      // 婦人部と女性候補
      { n: 502, id: 'a1_josei_giin', name: '婦人部と女性候補', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 国会での存在感
      { n: 503, id: 'a1_shakaito_kokkai', name: '国会での存在感', acts: [3], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 !Q.in_power; } },
      // 統一地方選
      { n: 504, id: 'a1_chihou_senkyo', name: '統一地方選', acts: [3], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3); } },
      // 反戦平和の運動　帯中間左
      { n: 505, id: 'a1_saha_hansen', name: '反戦平和の運動', acts: [4], need: { rally: 0.3 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 三里塚のあと
      { n: 511, id: 'a3_sanrizuka_ato', name: '三里塚のあと', acts: [3], need: { rally: 0.3 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.3); } },
      // 党の政策能力
      { n: 512, id: 'a3_seisaku_kenkyu', name: '党の政策能力', acts: [3], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3); } },
      // 蜷川府政の終わり
      { n: 513, id: 'a3_kyoto_chiji', name: '蜷川府政の終わり', acts: [3], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.local_kyoto; } },
      // 新自由クラブとの距離　帯中間右/右・1976年〜
      { n: 514, id: 'a3_uha_shinjiyu', name: '新自由クラブとの距離', acts: [3], need: { rel: 0.3 }, year: 1976,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 一般消費税の挫折
      { n: 521, id: 'a4_shohizei_zen', name: '一般消費税の挫折', acts: [4], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 !Q.gov_ours; } },
      // 軍縮の国際世論
      { n: 522, id: 'a4_kaku_gunshuku', name: '軍縮の国際世論', acts: [4], need: { rally: 0.3 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.3); } },
      // 政治不信の底
      { n: 524, id: 'a4_seiji_fushin', name: '政治不信の底', acts: [4], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14); } },
      // 韓国と中国
      { n: 525, id: 'a4_kokusai_kankei', name: '韓国と中国', acts: [4], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3); } },
      // 協会と国際情勢　帯左
      { n: 527, id: 'a4_saha_kokusai', name: '協会と国際情勢', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社公民の政権準備　軸社公民・1983年〜
      { n: 528, id: 'a4_uha_shakomin_seiken', name: '社公民の政権準備', acts: [4], need: { rel: 0.14 }, year: 1983,
        when: function (Q) { return Q.year >= 1983 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 都市政策
      { n: 529, id: 'a4_toshi_seisaku', name: '都市政策', acts: [4], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3); } },
      // 協会の弱体化　帯右
      { n: 530, id: 'a4_kyokai_jakutai', name: '協会の弱体化', acts: [4], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 高齢化という主題
      { n: 541, id: 'a5_kaigo', name: '高齢化という主題', acts: [5], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 Q.local_n >= 1; } },
      // 政権の準備　1990年〜
      { n: 543, id: 'a5_seiken_junbi', name: '政権の準備', acts: [5], need: { diet: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 !Q.cab_kind; } },
      // 協同組合との関係
      { n: 545, id: 'a5_soshiki_kyodo', name: '協同組合との関係', acts: [5], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14); } },
      // 協会の最後の抵抗　帯左
      { n: 546, id: 'a5_saha_shinsha', name: '協会の最後の抵抗', acts: [5], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.shin_sengen; } },
      // 解党論　帯右・1990年〜
      { n: 547, id: 'a5_uha_kaisan', name: '解党論', acts: [5], need: { koryo: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a5_uha_shinto; } },
      // 革新という語　軸社共
      { n: 548, id: 'a5_sakyo_owaru', name: '革新という語', acts: [5], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged; } },
      // 選挙協力の実務　軸未定/社公民・1990年〜
      { n: 549, id: 'a5_senkyo_kyoryoku', name: '選挙協力の実務', acts: [5], need: { rel: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 最後の総選挙の前に
      { n: 550, id: 'a5_saigo_no_toki', name: '最後の総選挙の前に', acts: [5], need: { diet: 0.35 },
        when: function (Q) { return Q.phase >= 3 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.35) &&
                 Q.minsha_exists && Q.ldp_split_done && !Q.in_power; } },
      // 協会の位置　帯左
      { n: 601, id: 'b1_a1_kyokai_saiken', name: '協会の位置', acts: [1], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 両端のあいだで　帯中間左
      { n: 602, id: 'b2_a1_chotei', name: '両端のあいだで', acts: [1], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 護憲の空洞　帯中間左
      { n: 603, id: 'b2_a3_goken_kudo', name: '護憲の空洞', acts: [3], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 最後の均衡　帯中間左
      { n: 604, id: 'b2_a5_saigo_kinkou', name: '最後の均衡', acts: [5], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 構造改革論の輸入　帯中間右・edaが在席
      { n: 605, id: 'b3_a1_kozo_yunyu', name: '構造改革論の輸入', acts: [1], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda'); } },
      // ニューウェーブ　帯中間右
      { n: 606, id: 'b3_a5_newwave', name: 'ニューウェーブ', acts: [5], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 民社党との距離　帯右
      { n: 607, id: 'b4_a2_minsha_kyori', name: '民社党との距離', acts: [2], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.opp_merged && !Q.minshu_shinto && Q.minsha_exists; } },
      // 労働学校の運営方針　帯左
      { n: 608, id: 'b1_a3_rodo_gakko', name: '労働学校の運営方針', acts: [3], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共闘の実務　軸社共
      { n: 621, id: 'c1_a1_kyodo_jitsumu', name: '共闘の実務', acts: [1], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 共闘の縮小　軸社共
      { n: 622, id: 'c1_a4_kyodo_shukusho', name: '共闘の縮小', acts: [4], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.evdone_a4_sakyo_saigo; } },
      // 中道勢力の台頭　軸社公民
      { n: 631, id: 'c2_a1_chudo_tanjo', name: '中道勢力の台頭', acts: [1], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 政策の一致点　軸社公民
      { n: 632, id: 'c2_a3_seisaku_itchi', name: '政策の一致点', acts: [3], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 全学連の分裂　1959年〜
      { n: 1004, id: 'a1_zengakuren_split', name: '全学連の分裂', acts: [1], need: { youth: 0.2 }, year: 1959,
        when: function (Q) { return Q.year >= 1959 &&
                 Q.c_youth >= window.JSP.needOf(Q, 0.2); } },
      // 春闘の確立
      { n: 1006, id: 'a1_shunto', name: '春闘の確立', acts: [1], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2); } },
      // 綱領論争　帯左/中間左
      { n: 1014, id: 'a1_koryo_ronso', name: '綱領論争', acts: [1], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 協会の組織化　帯左
      { n: 1015, id: 'a1_kyokai_soshiki', name: '協会の組織化', acts: [1], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 構造改革論　帯中間左/中間右・edaが在席
      { n: 1016, id: 'a1_kozo_kaikaku', name: '構造改革論', acts: [1], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [2, 3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda'); } },
      // 右派の党内基盤　帯中間右/右
      { n: 1017, id: 'a1_uha_chikara', name: '右派の党内基盤', acts: [1], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_exists; } },
      // 共産党との距離　軸未定/社共
      { n: 1018, id: 'a1_kyosan_kyoto', name: '共産党との距離', acts: [1], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged; } },
      // 最初の革新市長
      { n: 1021, id: 'a1_jichitai_hajime', name: '最初の革新市長', acts: [1], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.local_n >= 1; } },
      // 社青同
      { n: 1022, id: 'a1_seinen_bu', name: '社青同', acts: [1], need: { youth: 0.25 },
        when: function (Q) { return Q.c_youth >= window.JSP.needOf(Q, 0.25) &&
                 Q.kyokai_grip >= 35; } },
      // 江田ビジョン　帯中間左/中間右/右・1962年〜・edaが在席
      { n: 2003, id: 'a2_eda_vision', name: '江田ビジョン', acts: [2], need: { koryo: 0.2 }, year: 1962,
        when: function (Q) { return Q.year >= 1962 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [2, 3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda') &&
                 !Q.evdone_eda_vision; } },
      // 原水禁の分裂　1963年〜
      { n: 2005, id: 'a2_gensuikin_split', name: '原水禁の分裂', acts: [2], need: { rally: 0.25 }, year: 1963,
        when: function (Q) { return Q.year >= 1963 &&
                 Q.c_rally >= window.JSP.needOf(Q, 0.25); } },
      // 「道」第一次草案　帯左/中間左・1964年〜
      { n: 2012, id: 'a2_michi_1', name: '「道」第一次草案', acts: [2], need: { koryo: 0.3 }, year: 1964,
        when: function (Q) { return Q.year >= 1964 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_sp_michi1966; } },
      // 協会の理論誌　帯左
      { n: 2014, id: 'a2_kyokai_ron', name: '協会の理論誌', acts: [2], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 学者を担ぐ　軸未定/社共・1966年〜
      { n: 2015, id: 'a2_minobe_junbi', name: '学者を担ぐ', acts: [2], need: { org: 0.3 }, year: 1966,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 総評の重心
      { n: 2017, id: 'a2_sohyo_kanko', name: '総評の重心', acts: [2], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25); } },
      // 革新自治体の広がり
      { n: 2018, id: 'a2_kaku_jichitai', name: '革新自治体の広がり', acts: [2], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 Q.local_n >= 2; } },
      // 党本部の財政
      { n: 2025, id: 'a2_shakyo_jimu', name: '党本部の財政', acts: [2], need: { fund: 0.25 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.25); } },
      // 国鉄の組合
      { n: 2026, id: 'a2_kokutetsu', name: '国鉄の組合', acts: [2], need: { labor: 0.35 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.35); } },
      // 保革伯仲の予感
      { n: 2028, id: 'a2_hokakuhaku', name: '保革伯仲の予感', acts: [2], need: { hr: 0.2 },
        when: function (Q) { return Q.c_hr >= window.JSP.needOf(Q, 0.2) &&
                 Q.minsha_exists && Q.seats_hr >= 130 && !Q.in_power; } },
      // 「道」第二次草案　帯左・1966年〜
      { n: 2029, id: 'a2_michi_2', name: '「道」第二次草案', acts: [2], need: { koryo: 0.4 }, year: 1966,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.4) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 構造改革派の処遇　帯中間左/中間右
      { n: 2030, id: 'a2_kozo_zanto', name: '構造改革派の処遇', acts: [2], need: { koryo: 0.35 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.35) &&
                 [2, 3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社共の選挙協定　軸社共
      { n: 2031, id: 'a2_sakyo_kyotei', name: '社共の選挙協定', acts: [2], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 中道への打診　軸社公民
      { n: 2032, id: 'a2_shakomin_tane', name: '中道への打診', acts: [2], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 Q.komei_exists; } },
      // 党員百万
      { n: 2033, id: 'a2_soshiki_kakudai', name: '党員百万', acts: [2], need: { mem: 0.3 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.3); } },
      // 農村の票
      { n: 2035, id: 'a2_noson_hyo', name: '農村の票', acts: [2], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 政策審議会
      { n: 2038, id: 'a2_seisaku_shingi', name: '政策審議会', acts: [2], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35); } },
      // 機関紙拡張
      { n: 2039, id: 'a2_kikanshi', name: '機関紙拡張', acts: [2], need: { mem: 0.25 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.25) &&
                 !Q.evdone_kikanshi_kakucho; } },
      // 非武装中立の詰め
      { n: 2040, id: 'a2_hibuso_ron', name: '非武装中立の詰め', acts: [2], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 Q.minsha_exists; } },
      // 女性議員
      { n: 2041, id: 'a2_josei_giin', name: '女性議員', acts: [2], need: { mem: 0.35 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.35); } },
      // 右派の窓口　帯右
      { n: 2043, id: 'a2_taigai_uha', name: '右派の窓口', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_exists && Q.domei_exists; } },
      // 協会の全国化　帯左
      { n: 2044, id: 'a2_kyokai_seiryoku', name: '協会の全国化', acts: [2], need: { org: 0.4 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.4) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.kyokai_grip >= 55; } },
      // 与党の内紛
      { n: 2045, id: 'a2_hoshu_bunretsu', name: '与党の内紛', acts: [2], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25) &&
                 !Q.in_power; } },
      // 春闘相場
      { n: 2046, id: 'a2_shunto_soba', name: '春闘相場', acts: [2], need: { labor: 0.4 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.4); } },
      // 地方議員団
      { n: 2047, id: 'a2_chihou_giin', name: '地方議員団', acts: [2], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.local_n >= 1; } },
      // 参院選の候補者選び
      { n: 2048, id: 'a2_sanin', name: '参院選の候補者選び', acts: [2], need: { hc: 0.25 },
        when: function (Q) { return Q.c_hc >= window.JSP.needOf(Q, 0.25); } },
      // 国対政治
      { n: 2050, id: 'a2_kokutai', name: '国対政治', acts: [2], need: { diet: 0.4 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.4) &&
                 !Q.in_power; } },
      // 自治体の赤字
      { n: 3014, id: 'a3_jichitai_akaji', name: '自治体の赤字', acts: [3], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 (Q.local_n >= 1 && Q.local_debt >= 6) && !Q.evdone_kakushin_shicho && !Q.evdone_kakushin_shicho_sa; } },
      // 江田三郎の離党　帯中間右/右・1977年〜・edaが在席
      { n: 3018, id: 'a3_eda_ridatsu', name: '江田三郎の離党', acts: [3], need: { split: 0.3 }, year: 1977,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.c_split >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda') &&
                 Q.kyokai_grip >= 35; } },
      // 成田三原則　帯左/中間左・1977年〜
      { n: 3019, id: 'a3_narita_sangensoku', name: '成田三原則', acts: [3], need: { org: 0.4 }, year: 1977,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.c_org >= window.JSP.needOf(Q, 0.4) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 原発
      { n: 4016, id: 'a4_genpatsu', name: '原発', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 社公民の政権構想　軸社公民
      { n: 4017, id: 'a4_sankyo_tsume', name: '社公民の政権構想', acts: [4], need: { rel: 0.35 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 社共の最後の枠　軸社共
      { n: 4018, id: 'a4_sakyo_saigo', name: '社共の最後の枠', acts: [4], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.evdone_c1_a4_kyodo_shukusho; } },
      // 協会の後退　帯中間右/右
      { n: 4019, id: 'a4_kyokai_taisei', name: '協会の後退', acts: [4], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.kyokai_grip <= 55; } },
      // 新宣言　1986年〜
      { n: 5002, id: 'a5_shin_sengen', name: '新宣言', acts: [5], need: { koryo: 0.2 }, year: 1986,
        when: function (Q) { return Q.year >= 1986 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 Q.kyokai_grip >= 35 && !Q.evdone_sp_shin_sengen1986; } },
      // 日本新党　1992年〜
      { n: 5015, id: 'a5_nihon_shinto', name: '日本新党', acts: [5], need: { hr: 0.2 }, year: 1992,
        when: function (Q) { return Q.year >= 1992 &&
                 Q.c_hr >= window.JSP.needOf(Q, 0.2) &&
                 !Q.minshu_shinto && !Q.opp_merged && !Q.gov_ours && Q.komei_exists; } },
      // 職場の学習会　帯左
      { n: 3101, id: 'a3_b1_roudou_gakushu', name: '職場の学習会', acts: [3], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 反戦青年委員会　帯左
      { n: 3102, id: 'a3_b1_hansen_seinen', name: '反戦青年委員会', acts: [3], need: { youth: 0.25 },
        when: function (Q) { return Q.c_youth >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社会主義インターとの距離　帯左
      { n: 3103, id: 'a3_b1_kokusai', name: '社会主義インターとの距離', acts: [3], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 非核の港　帯左
      { n: 3104, id: 'a3_b1_hikaku', name: '非核の港', acts: [3], need: { rally: 0.25 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 協会の全国大会　帯左
      { n: 3105, id: 'a3_b1_kyokai_taikai', name: '協会の全国大会', acts: [3], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 市民運動とのつながり　帯中間左
      { n: 3111, id: 'a3_b2_shimin_undo', name: '市民運動とのつながり', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政策集団　帯中間左
      { n: 3112, id: 'a3_b2_seisaku_shudan', name: '政策集団', acts: [3], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 福祉国家という言葉　帯中間左
      { n: 3113, id: 'a3_b2_fukushi_kokka', name: '福祉国家という言葉', acts: [3], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 自治体政策集　帯中間左
      { n: 3114, id: 'a3_b2_jichitai_seisaku', name: '自治体政策集', acts: [3], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 民間労組との接触　帯中間右
      { n: 3121, id: 'a3_b3_minkan_sesshoku', name: '民間労組との接触', acts: [3], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中小企業政策　帯中間右
      { n: 3122, id: 'a3_b3_chusho', name: '中小企業政策', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 安保の現実論　帯中間右
      { n: 3123, id: 'a3_b3_anpo_genjitsu', name: '安保の現実論', acts: [3], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 民社との再合同論　帯右
      { n: 3131, id: 'a3_b4_minsha_fukugo', name: '民社との再合同論', acts: [3], need: { split: 0.25 },
        when: function (Q) { return Q.c_split >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.opp_merged && !Q.minshu_shinto && Q.minsha_exists; } },
      // 社会民主主義という語　帯右
      { n: 3132, id: 'a3_b4_shakai_minshu', name: '社会民主主義という語', acts: [3], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 財界との窓　帯右
      { n: 3133, id: 'a3_b4_zaikai', name: '財界との窓', acts: [3], need: { fund: 0.25 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 統一候補の首長　軸社共
      { n: 3141, id: 'a3_c1_toitsu_shusho', name: '統一候補の首長', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 共産党の伸長　軸社共
      { n: 3142, id: 'a3_c1_kyosan_nobiru', name: '共産党の伸長', acts: [3], need: { hr: 0.14 },
        when: function (Q) { return Q.c_hr >= window.JSP.needOf(Q, 0.14) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged; } },
      // 革新統一の政策協定　軸社共
      { n: 3143, id: 'a3_c1_kakushin_kyotei', name: '革新統一の政策協定', acts: [3], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 公明党との国会運営　軸社公民
      { n: 3151, id: 'a3_c2_komei_kokkai', name: '公明党との国会運営', acts: [3], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 創価学会という組織　軸社公民
      { n: 3152, id: 'a3_c2_soka', name: '創価学会という組織', acts: [3], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 民社党という壁　軸社公民
      { n: 3153, id: 'a3_c2_minsha_kabe', name: '民社党という壁', acts: [3], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.opp_merged && !Q.minshu_shinto && Q.minsha_exists; } },
      // 無党派という層
      { n: 3169, id: 'a3_kakusan_hyo', name: '無党派という層', acts: [3], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35); } },
      // 国際婦人年　1975年〜
      { n: 3173, id: 'a3_josei_undo', name: '国際婦人年', acts: [3], need: { mem: 0.25 }, year: 1975,
        when: function (Q) { return Q.year >= 1975 &&
                 Q.c_mem >= window.JSP.needOf(Q, 0.25); } },
      // 同和対策
      { n: 3174, id: 'a3_dojin', name: '同和対策', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 官僚機構
      { n: 3175, id: 'a3_kanryo', name: '官僚機構', acts: [3], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3); } },
      // 行革に抗う職場　帯左
      { n: 4101, id: 'a4_b1_gyokaku_hantai', name: '行革に抗う職場', acts: [4], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 協会の反撃　帯左
      { n: 4102, id: 'a4_b1_kyokai_hansen', name: '協会の反撃', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.saha_independent && Q.kyokai_grip >= 40; } },
      // 軍縮の国際行動　帯左
      { n: 4103, id: 'a4_b1_gunshuku', name: '軍縮の国際行動', acts: [4], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 党学校　帯左
      { n: 4104, id: 'a4_b1_shakai_shugi_kyoiku', name: '党学校', acts: [4], need: { mem: 0.25 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 「新宣言」への抵抗　帯左
      { n: 4105, id: 'a4_b1_saha_teikou', name: '「新宣言」への抵抗', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 地域からの政策　帯中間左
      { n: 4111, id: 'a4_b2_chiiki_seisaku', name: '地域からの政策', acts: [4], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 環境政策という新しい課題　帯中間左
      { n: 4112, id: 'a4_b2_kankyo', name: '環境政策という新しい課題', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 市民派の候補　帯中間左
      { n: 4113, id: 'a4_b2_shimin_koho', name: '市民派の候補', acts: [4], need: { mem: 0.25 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 統一への地ならし　帯中間右
      { n: 4121, id: 'a4_b3_rengo_junbi', name: '統一への地ならし', acts: [4], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 行革の対案　帯中間右
      { n: 4122, id: 'a4_b3_gyokaku_taian', name: '行革の対案', acts: [4], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 防衛費の議論　帯中間右
      { n: 4123, id: 'a4_b3_boei_ronsou', name: '防衛費の議論', acts: [4], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政権構想の起草　帯右
      { n: 4131, id: 'a4_b4_seiken_koso', name: '政権構想の起草', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 同盟との和解　帯右
      { n: 4132, id: 'a4_b4_doumei_wakai', name: '同盟との和解', acts: [4], need: { labor: 0.3 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.3) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_exists; } },
      // 京都を守る　軸社共
      { n: 4141, id: 'a4_c1_kyoto_mamoru', name: '京都を守る', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 共産党からの批判　軸社共
      { n: 4142, id: 'a4_c1_kyosan_hihan', name: '共産党からの批判', acts: [4], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged && Q.shako_goi; } },
      // 三党の実務者会議　軸社公民
      { n: 4151, id: 'a4_c2_santo_jimu', name: '三党の実務者会議', acts: [4], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 首班の扱い　軸社公民
      { n: 4152, id: 'a4_c2_shuhan', name: '首班の扱い', acts: [4], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 個人化する暮らし
      { n: 4168, id: 'a4_kojinka', name: '個人化する暮らし', acts: [4], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3); } },
      // 中流意識
      { n: 4170, id: 'a4_kakusa', name: '中流意識', acts: [4], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 Q.kyokai_grip >= 35; } },
      // 党の顔ぶれ
      { n: 4171, id: 'a4_gakureki', name: '党の顔ぶれ', acts: [4], need: { mem: 0.3 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.3); } },
      // 参院の存在感
      { n: 4172, id: 'a4_sanin_giin', name: '参院の存在感', acts: [4], need: { hc: 0.14 },
        when: function (Q) { return Q.c_hc >= window.JSP.needOf(Q, 0.14); } },
      // 老いていく国
      { n: 4173, id: 'a4_kaigo', name: '老いていく国', acts: [4], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3); } },
      // 少数与党の国会
      { n: 4174, id: 'a4_shosuha_kyoryoku', name: '少数与党の国会', acts: [4], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 Q.seats_hr >= 105 && !Q.in_power; } },
      // テレビの中の政治
      { n: 4175, id: 'a4_media', name: 'テレビの中の政治', acts: [4], need: { name: 0.3 },
        when: function (Q) { return Q.c_name >= window.JSP.needOf(Q, 0.3); } },
      // 海外の姉妹党
      { n: 4177, id: 'a4_kaigai', name: '海外の姉妹党', acts: [4], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 Q.kyokai_grip >= 35; } },
      // 新宣言への抵抗　帯左
      { n: 5101, id: 'a5_b1_shin_sengen_hantai', name: '新宣言への抵抗', acts: [5], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.shin_sengen; } },
      // 非武装中立を守る　帯左
      { n: 5103, id: 'a5_b1_hibuso_shishu', name: '非武装中立を守る', acts: [5], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 自治労という最後の柱　帯左
      { n: 5104, id: 'a5_b1_jichiro', name: '自治労という最後の柱', acts: [5], need: { labor: 0.3 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 生活者という呼び方　帯中間左・1989年〜
      { n: 5111, id: 'a5_b2_seikatsusha', name: '生活者という呼び方', acts: [5], need: { org: 0.2 }, year: 1989,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 女性候補の擁立　帯中間左
      { n: 5112, id: 'a5_b2_josei_koho', name: '女性候補の擁立', acts: [5], need: { mem: 0.25 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a5_madonna; } },
      // 生活クラブとネットワーク　帯中間左
      { n: 5113, id: 'a5_b2_netto', name: '生活クラブとネットワーク', acts: [5], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 連合の政治方針　帯中間右・1989年〜
      { n: 5121, id: 'a5_b3_rengo_seiji', name: '連合の政治方針', acts: [5], need: { labor: 0.25 }, year: 1989,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 財源を示す　帯中間右・1989年〜
      { n: 5122, id: 'a5_b3_zaisei_an', name: '財源を示す', acts: [5], need: { koryo: 0.25 }, year: 1989,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 自衛隊の位置づけ　帯中間右/右
      { n: 5123, id: 'a5_b3_jieitai_goken', name: '自衛隊の位置づけ', acts: [5], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新党論　帯右
      { n: 5131, id: 'a5_b4_shinto_ron', name: '新党論', acts: [5], need: { split: 0.25 },
        when: function (Q) { return Q.c_split >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 憲法をどう扱うか　帯右
      { n: 5132, id: 'a5_b4_kaiken_ron', name: '憲法をどう扱うか', acts: [5], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共闘の最後の枠　軸社共
      { n: 5141, id: 'a5_c1_kyodo_saigo', name: '共闘の最後の枠', acts: [5], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged && !Q.evdone_a5_sakyo_saigo; } },
      // 革新票の行方　軸社共
      { n: 5142, id: 'a5_c1_kaku_hyo', name: '革新票の行方', acts: [5], need: { hr: 0.2 },
        when: function (Q) { return Q.c_hr >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.kyosan_merged; } },
      // 非自民の枠　軸社公民
      { n: 5151, id: 'a5_c2_hijimin', name: '非自民の枠', acts: [5], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 閣僚の割り振り　軸社公民
      { n: 5152, id: 'a5_c2_kakuryo_wari', name: '閣僚の割り振り', acts: [5], need: { rel: 0.35 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 新党さきがけ　1993年〜
      { n: 5171, id: 'a5_sakigake', name: '新党先驱', acts: [5], need: { hr: 0.2 }, year: 1993,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.c_hr >= window.JSP.needOf(Q, 0.2) &&
                 !Q.minshu_shinto && !Q.opp_merged && !Q.cab_kind && !Q.ldp_wareme; } },
      // 政権に入るという仕事
      { n: 5174, id: 'a5_kanryo_naikaku', name: '政権に入るという仕事', acts: [5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 Q.cab_kind > 0; } },
      // 党内の分岐
      { n: 5175, id: 'a5_toubun', name: '党内の分岐', acts: [5], need: { split: 0.35 },
        when: function (Q) { return Q.c_split >= window.JSP.needOf(Q, 0.35) &&
                 Q.cab_kind > 0 && (Q.mood_saha >= 55 || Q.mood_uha >= 55); } },
      // 職場の細胞　帯左
      { n: 2101, id: 'a2_b1_kojo_ho', name: '職場の細胞', acts: [2], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 平和革命論　帯左
      { n: 2102, id: 'a2_b1_kakumei_ron', name: '平和革命論', acts: [2], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 東欧への派遣　帯左
      { n: 2103, id: 'a2_b1_soren_ryugaku', name: '東欧への派遣', acts: [2], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 統一戦線論　帯左
      { n: 2104, id: 'a2_b1_toitsu_sensen', name: '統一戦線論', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政策決定の手続き　帯中間左
      { n: 2111, id: 'a2_b2_seisaku_kettei', name: '政策決定の手続き', acts: [2], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 都市政策　帯中間左
      { n: 2112, id: 'a2_b2_toshi_seisaku', name: '都市政策', acts: [2], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 議員立法　帯中間左
      { n: 2113, id: 'a2_b2_giin_rippou', name: '議員立法', acts: [2], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 生産性運動をどう見るか　帯中間右
      { n: 2121, id: 'a2_b3_seisansei', name: '生産性運動をどう見るか', acts: [2], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社会保障の設計　帯中間右
      { n: 2122, id: 'a2_b3_shakai_hoshou', name: '社会保障の設計', acts: [2], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a2_shakai_hosho; } },
      // 民社党との対話　帯右
      { n: 2131, id: 'a2_b4_minsha_taiwa', name: '民社党との対話', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.opp_merged && !Q.minshu_shinto && Q.minsha_exists; } },
      // 現代資本主義論　帯右
      { n: 2132, id: 'a2_b4_gendai_shihon', name: '現代資本主義論', acts: [2], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共産党との共闘会議　軸社共
      { n: 2141, id: 'a2_c1_kyodo_kaigi', name: '共産党との共闘会議', acts: [2], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 機関紙の競争　軸社共
      { n: 2142, id: 'a2_c1_akahata', name: '機関紙の競争', acts: [2], need: { mem: 0.2 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 公明党との政策協議　軸社公民
      { n: 2151, id: 'a2_c2_komei_seisaku', name: '公明党との政策協議', acts: [2], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 Q.komei_exists; } },
      // 中道の票田　軸社公民
      { n: 2152, id: 'a2_c2_chudo_hyo', name: '中道の票田', acts: [2], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 Q.komei_exists; } },
      // 米価闘争
      { n: 2164, id: 'a2_kome_kaka', name: '米価闘争', acts: [2], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2); } },
      // 社会保障費
      { n: 2168, id: 'a2_shakai_hosho_hi', name: '社会保障費', acts: [2], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25); } },
      // 党の台所
      { n: 2169, id: 'a2_zaisei_nan', name: '党の台所', acts: [2], need: { fund: 0.3 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.3) &&
                 (Q.budget || 0) <= 8 || (Q.arrears || 0) >= 2; } },
      // 質問の質
      { n: 2170, id: 'a2_kokkai_shitsumon', name: '質問の質', acts: [2], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 !Q.cab_kind; } },
      // 地方の県本部
      { n: 2171, id: 'a2_chihou_seken', name: '地方の県本部', acts: [2], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.kyokai_grip >= 35; } },
      // テレビの時代
      { n: 2172, id: 'a2_terebi', name: 'テレビの時代', acts: [2], need: { name: 0.25 },
        when: function (Q) { return Q.c_name >= window.JSP.needOf(Q, 0.25) &&
                 Q.kyokai_grip >= 35; } },
      // 国対の金
      { n: 2173, id: 'a2_kokutai_ura', name: '国対の金', acts: [2], need: { fund: 0.3 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.3) &&
                 !Q.in_power; } },
      // 海外の労働運動
      { n: 2174, id: 'a2_kokusai_rodo', name: '海外の労働運動', acts: [2], need: { labor: 0.3 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.3) &&
                 Q.domei_exists; } },
      // 新人の擁立
      { n: 2175, id: 'a2_shinjin', name: '新人の擁立', acts: [2], need: { mem: 0.3 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.3); } },
      // 戦争責任
      { n: 2176, id: 'a2_kokusaku_sensou', name: '戦争責任', acts: [2], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3); } },
      // 女性の投票
      { n: 2177, id: 'a2_josei_hyo', name: '女性の投票', acts: [2], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35); } },
      // 自衛隊の海外派遣
      { n: 2178, id: 'a2_kaigai_haken', name: '自衛隊の海外派遣', acts: [2], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 Q.minsha_exists; } },
      // 公務員の政治活動
      { n: 3203, id: 'a3_hoshu_kaikin', name: '公務員の政治活動', acts: [3], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2); } },
      // 公安の監視
      { n: 3204, id: 'a3_kanshi', name: '公安の監視', acts: [3], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2); } },
      // 官報の裏
      { n: 3205, id: 'a3_kanpo', name: '官報の裏', acts: [3], need: { fund: 0.2 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.2); } },
      // 新幹線公害
      { n: 3206, id: 'a3_shinkansen', name: '新幹線公害', acts: [3], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 保育所づくり
      { n: 3207, id: 'a3_hoiku', name: '保育所づくり', acts: [3], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 Q.local_n >= 1; } },
      // 党大会の費用
      { n: 3209, id: 'a3_taikai_hiyou', name: '党大会の費用', acts: [3], need: { fund: 0.25 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.25); } },
      // 天下り
      { n: 3212, id: 'a3_kanryo_tenshin', name: '天下り', acts: [3], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25); } },
      // 生活保護の締め付け
      { n: 4201, id: 'a4_kyusai', name: '生活保護の締め付け', acts: [4], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 Q.local_n >= 1; } },
      // 三里塚の後
      { n: 4202, id: 'a4_sanrizuka_owari', name: '三里塚の後', acts: [4], need: { rally: 0.2 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.2); } },
      // 校内暴力
      { n: 4205, id: 'a4_gakko', name: '校内暴力', acts: [4], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2); } },
      // 働く女性
      { n: 4206, id: 'a4_josei_shinshutsu', name: '働く女性', acts: [4], need: { mem: 0.25 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.25); } },
      // 若い党員
      { n: 4207, id: 'a4_shakaito_seinen', name: '若い党員', acts: [4], need: { youth: 0.25 },
        when: function (Q) { return Q.c_youth >= window.JSP.needOf(Q, 0.25); } },
      // 外国人労働者
      { n: 4209, id: 'a4_kokusai_shakai', name: '外国人労働者', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 税をどう語るか
      { n: 4211, id: 'a4_shohi_zei_ron', name: '税をどう語るか', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3); } },
      // 地方分権
      { n: 5201, id: 'a5_chihou_bunken', name: '地方分権', acts: [5], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 Q.local_n >= 1; } },
      // 情報公開
      { n: 5202, id: 'a5_joho_kokai', name: '情報公開', acts: [5], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2) &&
                 Q.local_n >= 1; } },
      // 介護をどうするか
      { n: 5203, id: 'a5_kaigo_hoken', name: '介護をどうするか', acts: [5], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 女性議員が増える
      { n: 5205, id: 'a5_kokusei_josei', name: '女性議員が増える', acts: [5], need: { mem: 0.3 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.3) &&
                 Q.seats_hc >= 75; } },
      // 環境という争点
      { n: 5206, id: 'a5_kankyo_seito', name: '環境という争点', acts: [5], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25); } },
      // 国際貢献という言葉　1991年〜
      { n: 5208, id: 'a5_kokusai_koken', name: '国際貢献という言葉', acts: [5], need: { koryo: 0.3 }, year: 1991,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 Q.komei_exists; } },
      // 連合という壁　1989年〜
      { n: 5209, id: 'a5_rengo_no_kabe', name: '連合という壁', acts: [5], need: { labor: 0.3 }, year: 1989,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.3) &&
                 Q.minsha_exists; } },
      // 党を作り直す
      { n: 5212, id: 'a5_soshiki_saihen', name: '党を作り直す', acts: [5], need: { mem: 0.35 },
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.35); } },
      // 憲法調査の動き
      { n: 5213, id: 'a5_kaiken_giron', name: '憲法調査の動き', acts: [5], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 Q.kyokai_grip >= 35; } },
      // 党名の議論
      { n: 5214, id: 'a5_shakai_minshu', name: '党名の議論', acts: [5], need: { koryo: 0.35 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.35) &&
                 Q.kyokai_grip >= 35 && !Q.evdone_a5_shakaito_saigo; } },
      // 最後の党大会　1993年〜
      { n: 5215, id: 'a5_saigo_no_taikai', name: '最後の党大会', acts: [5], need: { koryo: 0.4 }, year: 1993,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.4); } },
      // 職場から　帯左
      { n: 6001, id: 'a1_b1_hansen_shokuba', name: '職場から', acts: [1], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 消費者の立場　帯中間右/右
      { n: 6002, id: 'a1_b3_shohisha', name: '消費者の立場', acts: [1], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 世界の革命　帯左
      { n: 6003, id: 'a2_b1_sekai_kakumei', name: '世界の革命', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 企業内の組合　帯中間右/右
      { n: 6004, id: 'a2_b3_kigyou_nai', name: '企業内の組合', acts: [2], need: { labor: 0.3 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 平和行進　軸社共
      { n: 6005, id: 'a2_c1_heiwa_kodo', name: '平和行進', acts: [2], need: { rally: 0.3 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 中道との政策協定　軸社公民
      { n: 6006, id: 'a2_c2_seisaku_kyotei', name: '中道との政策協定', acts: [2], need: { rel: 0.35 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 Q.komei_exists; } },
      // 原発立地への反対　帯左/中間左
      { n: 6007, id: 'a3_b1_genpatsu_hantai', name: '原発立地への反対', acts: [3], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 財政規律　帯中間右/右
      { n: 6008, id: 'a3_b3_zaisei_kiritsu', name: '財政規律', acts: [3], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 自治体の社共　軸社共
      { n: 6009, id: 'a3_c1_jichitai_kyodo', name: '自治体の社共', acts: [3], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 中道と国会で組む　軸社公民
      { n: 6010, id: 'a3_c2_kokkai_kyodo', name: '中道と国会で組む', acts: [3], need: { diet: 0.35 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 平和教育　帯左/中間左
      { n: 6011, id: 'a4_b1_heiwa_kyoiku', name: '平和教育', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政権の予行演習　帯中間右/右
      { n: 6012, id: 'a4_b4_seiken_kunren', name: '政権の予行演習', acts: [4], need: { koryo: 0.35 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.35) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 革新という言葉　軸社共
      { n: 6013, id: 'a4_c1_kakushin_saigo', name: '革新という言葉', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 連立の名簿　軸社公民
      { n: 6014, id: 'a4_c2_seiken_meibo', name: '連立の名簿', acts: [4], need: { rel: 0.35 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 最後の砦　帯左
      { n: 6015, id: 'a5_b1_saigo_no_toride', name: '最後の砦', acts: [5], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新党の協議　帯中間右/右
      { n: 6016, id: 'a5_b3_shinto_kyogi', name: '新党の協議', acts: [5], need: { split: 0.3 },
        when: function (Q) { return Q.c_split >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 春闘の方針　帯左/中間左
      { n: 7104, id: 'shunto_59_sa', name: '春闘の方針', acts: [2], need: { labor: 0.12 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.12) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 部分的核実験停止条約　帯左/中間左
      { n: 7114, id: 'ptbt_sa', name: '部分的核実験停止条約', acts: [2], need: { rally: 0.14 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.14) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 憲法調査会　帯左/中間左
      { n: 7105, id: 'kenpo_chosakai_sa', name: '憲法調査会', acts: [2], need: { diet: 0.12 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.12) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 所得倍増計画　帯左/中間左
      { n: 7311, id: 'shotoku_baizo_sa', name: '所得倍増計画', acts: [2], need: { diet: 0.14 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 総評の路線　帯左/中間左
      { n: 7314, id: 'sohyo_ohta_sa', name: '総評の路線', acts: [2], need: { labor: 0.2 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 革新自治体の財政　帯左/中間左
      { n: 7136, id: 'kakushin_shicho_sa', name: '革新自治体の財政', acts: [3], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a3_jichitai_akaji && !Q.evdone_kakushin_shicho; } },
      // 江田三郎の離党　帯左/中間左・1977年〜・edaが在席
      { n: 7318, id: 'eda_ridatsu_sa', name: '江田三郎の離党', acts: [3], need: { split: 0.3 }, year: 1977,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.c_split >= window.JSP.needOf(Q, 0.3) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda'); } },
      // 土井委員長の登場　帯左/中間左
      { n: 7601, id: 'doi_shunin_sa', name: '土井委員長の登場', acts: [5], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, "doi"); } },
      // 党大会の主導権　帯中間右
      { n: 8021, id: 'c3_taikai_shudo', name: '党大会の主導権', acts: [2, 3, 4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 連立政権の構想　帯中間右
      { n: 8022, id: 'c3_rengo_seiken', name: '連立政権の構想', acts: [4, 5], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.in_power; } },
      // 民主社会主義の党　帯右
      { n: 4806, id: 'a4_minsha_ka', name: '民主社会主义的党', acts: [3, 4, 5], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.year || 0) >= 1970 && Q.kyosan_haijo && !Q.minsha_ka && !Q.kyosan_merged && !Q.minshu_shinto && (!Q.minsha_exists || Q.minsha_merged || (Q.rel_minsha || 0) >= 30); } },
      // 与党の社会党
      { n: 4808, id: 'c4_jisha_yoto', name: '执政的社会党', acts: [4, 5], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2) &&
                 Q.in_power && Q.cab_kind === 4; } },
      // 福祉国家の設計
      { n: 9200, id: 'gov_minshu_fukushi', name: '福祉国家の設計', acts: [5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 Q.gov_ours && Q.minshu_shinto; } },
      // 防衛と若い世代
      { n: 9201, id: 'gov_minsha_boei', name: '防衛と若い世代', acts: [5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 Q.gov_ours && Q.minsha_ka; } },
      // 再分配と経済　帯中間右
      { n: 9202, id: 'gov_chuu_saibunpai', name: '再分配と経済', acts: [5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.gov_ours && !Q.minshu_shinto && !Q.minsha_ka; } },
      // 自民党の支持基盤　帯中間左
      { n: 9203, id: 'gov_chusa_kaitai', name: '自民党の支持基盤', acts: [5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.gov_ours && !Q.minshu_shinto && !Q.minsha_ka; } },
      // 相手の組織基盤を解体する　帯左
      { n: 9204, id: 'gov_saha_kaitai', name: '相手の組織基盤を解体する', acts: [5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.gov_ours && !Q.minshu_shinto && !Q.minsha_ka; } },
      // 勤労者教育協会　帯左/中間左
      { n: 9205, id: 'a3_shinchukan_keimou', name: '勤労者教育協会', acts: [3], need: { org: 0.22 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.22) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a3_shinchukan_keimou; } },
      // 労働大学の拡張
      { n: 9206, id: 'a3_rodo_daigaku', name: '労働大学の拡張', acts: [3, 4], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.evdone_a3_shinchukan_keimou && !Q.evdone_a3_rodo_daigaku; } },
      // 労働大学の網
      { n: 9207, id: 'a4_rodo_daigaku_mou', name: '労働大学の網', acts: [4], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 Q.evdone_a3_rodo_daigaku && !Q.evdone_a4_rodo_daigaku_mou; } },
      // 聖域なき政治改革
      { n: 9208, id: 'gov_minsha_seiiki', name: '聖域なき政治改革', acts: [4, 5], need: { cab: 0.2 },
        when: function (Q) { return Q.c_cab >= window.JSP.needOf(Q, 0.2) &&
                 Q.in_power && Q.cab_kind === 4 && Q.minsha_ka; } },
      // 富士社会教育センター　帯中間右/右
      { n: 9209, id: 'a3_fuji_center', name: '富士社会教育センター', acts: [3, 4], need: { labor: 0.24 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.24) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_ka && !Q.evdone_a3_fuji_center; } },
      // 富士政治大学校　帯中間右/右
      { n: 9210, id: 'a4_fuji_daigaku', name: '富士政治大学校', acts: [4], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_ka && Q.fuji && !Q.evdone_a4_fuji_daigaku; } },
      // 政策推進労組会議　帯中間右/右
      { n: 9211, id: 'a4_seisui_kaigi', name: '政策推進労組会議', acts: [4, 5], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_ka && Q.fuji_daigaku && !Q.evdone_a4_seisui_kaigi; } },
      // 地方議員のための政策室　帯中間左
      { n: 9212, id: 'a3_jichitai_seisakushitsu', name: '地方議員のための政策室', acts: [3], need: { org: 0.24 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.24) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a3_jichitai_seisakushitsu; } },
      // 自治体学校　帯中間左
      { n: 9213, id: 'a4_jichitai_gakko', name: '自治体学校', acts: [4], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.jichitai_shitsu && !Q.evdone_a4_jichitai_gakko; } },
      // 全国革新市長会　帯中間左
      { n: 9214, id: 'a5_kakushin_shichokai', name: '全国革新市長会', acts: [4, 5], need: { rel: 0.28 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.28) &&
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.jichitai_gakko && !Q.evdone_a5_kakushin_shichokai; } },
      // 『現代の理論』の編集部　帯中間右
      { n: 9215, id: 'a3_gendai_riron', name: '『現代の理論』の編集部', acts: [3], need: { koryo: 0.24 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.24) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 !Q.evdone_a3_gendai_riron; } },
      // 構造改革の研究会　帯中間右
      { n: 9216, id: 'a4_kozo_kenkyukai', name: '構造改革の研究会', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.gendai_riron && !Q.evdone_a4_kozo_kenkyukai; } },
      // 政策の研究所　帯中間右/右
      { n: 9217, id: 'a5_seisaku_kenkyujo', name: '政策の研究所', acts: [4, 5], need: { koryo: 0.34 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.34) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.kozo_kenkyu && !Q.minsha_ka && !Q.evdone_a5_seisaku_kenkyujo; } },
      // ═══ generated:events end ═══

      // ── 幕を選ばない ────────────────────────────────────────
      //  協会規制の決議は一九七七年二月。第Ⅲ幕からしか出さない。
      //  幕を選ばずに置いていたので、監査では協会の独立の 23/117 が第Ⅰ幕、
      //  56/117 が第Ⅱ幕に起きていた ── 一九五九年に社会主義協会を
      //  「党内党」として規制する決議が通る盤面になっていた。
      //  幕の節目の場面。以前は局面の終わり（＝総選挙の直前）に
      //  数珠つなぎで置いていた。そのため第Ⅲ幕の第二局面では
      //  「一九七三年 石油危機」「一九七四年 七人委員会」
      //  「一九七五年 革新自治体の財政危機」の三つが、
      //  盤面が一九七六年になってから続けて出ていた。
      //  題に年月が書いてあるのに盤面の日付と合わない ── これが
      //  「事象と時間が離れている」の中身である。
      //  参院選と同じで、日付が来たら割り込む形にする。手は消費しない。
      //  局面の終わりに残すのは総選挙だけになった。
      { n: 9101, id: 'sp_kozo1962', name: '構造改革論争', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1962, 1); } },
      { n: 9102, id: 'sp_yokohama1963', name: '横滨市长选', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1963, 4); } },
      { n: 9103, id: 'sp_year1964', name: '一九六四年', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1964, 11); } },
      { n: 9104, id: 'sp_michi1966', name: '日本走向社会主义之路', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1966, 1) && !Q.evdone_a2_michi_1; } },
      { n: 9105, id: 'sp_tokyo1967', name: '东京都知事选', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1967, 4); } },
      { n: 9111, id: 'sp_rengo_sekigun1972', name: 'あさま山荘', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1972, 2) && !Q.evdone_a3_asama; } },
      { n: 9112, id: 'sp_oil1973', name: '石油危机', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1973, 10); } },
      { n: 9113, id: 'sp_nanin1974', name: '七人委员会', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1974, 2); } },
      { n: 9114, id: 'sp_zaisei1975', name: '革新自治体的财政危机', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1975, 4); } },
      { n: 9115, id: 'sp_eda1977', name: '江田三郎', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1977, 2); } },
      { n: 9121, id: 'sp_jichitai1979', name: '革新自治体的崩落', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1979, 4); } },
      { n: 9122, id: 'sp_shako1980', name: '社公合意', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1980, 1) && !Q.evdone_a4_shako_goi; } },
      { n: 9123, id: 'sp_hibuso1984', name: '非武装中立', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1984, 1); } },
      { n: 9131, id: 'sp_shin_sengen1986', name: '新宣言', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1986, 1) && !Q.evdone_a5_shin_sengen; } },
      { n: 9132, id: 'sp_kokutetsu1987', name: '国铁分割民营化', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1987, 4) && !Q.gov_ours; } },
      //  消費税とマドンナは七月の参院選の結果を語る。参院選のあとに出す。
      { n: 9133, id: 'sp_madonna1989', name: '消费税与圣母', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1989, 7) && !!Q.evdone_hc1989 && !Q.gov_ours; } },
      //  連合の結成は十一月。参院選とマドンナのあと。
      { n: 9134, id: 'sp_rengo1989', name: '連合結成', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1989, 11) && !!Q.evdone_sp_madonna1989
          && !Q.evdone_a5_rengo_kessei && !Q.evdone_rengo_kessei_sa; } },
      { n: 9135, id: 'sp_gulf1991', name: '海湾战争', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1991, 1) && !Q.gov_ours; } },
      { n: 9136, id: 'sp_pko1992', name: 'PKO协力法', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1992, 6) && !Q.gov_ours; } },

      //  参院選。三年ごとの半数改選。手を消費しない割り込みとして出す。
      //  中身は一つの頁（hc.election）を年ごとに使い回す。
      { n: 7001, id: 'hc1962', name: '参院选', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1962, 7); } },
      { n: 7002, id: 'hc1965', name: '参院选', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1965, 7); } },
      { n: 7003, id: 'hc1968', name: '参院选', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1968, 7); } },
      { n: 7004, id: 'hc1971', name: '参院选', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1971, 6); } },
      { n: 7005, id: 'hc1974', name: '参院选', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1974, 7); } },
      { n: 7006, id: 'hc1977', name: '参院选', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1977, 7); } },
      { n: 7007, id: 'hc1980', name: '参院选', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1980, 6); } },
      { n: 7008, id: 'hc1983', name: '参院选', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1983, 6); } },
      { n: 7009, id: 'hc1986', name: '参院选', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1986, 7); } },
      { n: 7010, id: 'hc1989', name: '参院选', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1989, 7); } },
      { n: 7011, id: 'hc1992', name: '参院选', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1992, 7); } },

      { n: 6, id: 'kyokai', name: '協会規制問題', acts: [3, 4, 5], need: { org: 0.17 },
        when: function (Q) { return (Q.act || 1) >= 3 && Q.kyokai_grip >= 52 &&
                 Q.c_org >= window.JSP.needOf(Q, 0.17) && !Q.saha_independent; } }
    ],

    //  事象を一つ選ぶ。
    //
    //  ① 史実（fixed）は割り込む。石油危機もプラハも、党が何をしていようが
    //     日本に降ってくる。年が来たら必ず起きる。表は年の順に並んでいる。
    //  ② 年の来ている史実（year が盤面の年より前）を古い順に出す。
    //  ③ 残りは順ぐりに拾う。以前は表の先頭から最初に条件を満たした一件を
    //     返していたので、表の前のほうにある事象だけが出続け、後ろの事象は
    //     条件を満たしていても一度も出ないことがあった。
    checkEvents: function (Q) {
      var i, ev, pool = [];
      var act = Q.act || 1;
      for (i = 0; i < this.EVENTS.length; i++) {
        ev = this.EVENTS[i];
        if (ev.acts && ev.acts.indexOf(act) < 0) { continue; }
        if (Q['evdone_' + ev.id] || !ev.when(Q)) { continue; }
        if (ev.fixed) {
          Q.pending_event = ev.n;
          Q.pending_event_name = ev.name;
          return ev.n;
        }
        pool.push(ev);
      }
      if (!pool.length) { Q.pending_event = 0; return 0; }
      //  ③ 年の来ている史実を先に出す。順ぐりだけで回していると、
      //     出番の来た事象が山札の後ろで待たされる。実測では
      //     一九六三年の話が一九六八年に出ることがあった（最大六年）。
      //     いま年を過ぎているものが居れば、いちばん古いものから出す。
      //     追い着けば、あとは順ぐりに戻る。
      var late = null, y = Q.year || 0;
      for (i = 0; i < pool.length; i++) {
        if (!pool[i].year || pool[i].year >= y) { continue; }
        if (!late || pool[i].year < late.year) { late = pool[i]; }
      }
      if (late) {
        Q.pending_event = late.n;
        Q.pending_event_name = late.name;
        return late.n;
      }
      var cur = (Q.ev_cursor || 0) % pool.length;
      Q.ev_cursor = (Q.ev_cursor || 0) + 1;
      ev = pool[cur];
      Q.pending_event = ev.n;
      Q.pending_event_name = ev.name;
      return ev.n;
    },

    markEventDone: function (Q, n) {
      var i;
      for (i = 0; i < this.EVENTS.length; i++) {
        if (this.EVENTS[i].n === n) { Q['evdone_' + this.EVENTS[i].id] = 1; }
      }
      //  脇柱「この一手の変化」：事象の選択はここから決定として数える（after_event で閉じる）
      this.tdStep(Q);
      Q.pending_event = 0;
      return Q;
    },

    //  選挙の結果を「大勝／過半を守った／過半割れ」に畳む。
    //  結果の頁がこれを見ずに大勝と書いていたので、自民が百六十六でも
    //  大勝と出ていた。判定は議席そのものから取る。
    //    2 = 全議席の 55% 以上　1 = 過半以上　0 = 過半割れ
    jiminWin: function (Q) {
      var total = Q.hr_total || 511;
      var got = Q.res_jimin || 0;
      Q.jimin_win = got >= Math.floor(total * 0.55) ? 2
        : (got >= Math.floor(total / 2) + 1 ? 1 : 0);
      return Q;
    },

    // 通用カードを一枚処理したときに呼ぶ
    //  一手のあいだに続けて起こしてよい事象の数。
    //  事象は手を消費しない割り込みなので、ここが実質の密度の上限になる。
    //  原ゲームは 3.64 件/手。
    EV_PER_TURN: 6,

    MEM_STEP: 6000,      // 党員がこれだけ増えるごとに c_mem が一つ
    SPLIT_TALLY: 40,     // 在党派閥の不満がこれを超えている手は c_split が一つ

    tallyCounter: function (Q, key) {
      Q['c_' + key] = (Q['c_' + key] || 0) + 1;
      return Q;
    },

    //  盤面の状態から自動で溜まるカウンタ。一手に一度だけ呼ぶ。
    //
    //  c_hr / c_hc / c_name は選挙で、c_chair と c_youth はカードで足す。
    //  ここで見るのは「毎手その状態にあること自体が蓄積になる」三つだけ。
    //  これが無いと、これらのカウンタに載る事象が一件も出ない。
    //  一手ぶん時計を進める。
    //
    //  暦は局面ごとに置いた目印（ACTS の marks）のあいだを進む。
    //  目印はその局面が閉じる年 ── ふつうは総選挙の年である。
    //
    //  以前は幕全体の進み具合（act_turn / cfg.turns）で出していた。
    //  これには二つの穴があった。
    //
    //  ① 危機が手数を増やすのに、cfg.turns は増えない。
    //     crisisCheck は局面ごとに一度、turns_left を最大八手ふやす。
    //     act_turn で数えると、そのぶん暦が先へ走る。
    //     実測（四十局）で第Ⅰ幕は予定十二手に対して act_turn が最大二十五、
    //     全手の 48% が幕の終わりの年に張り付いていた。第Ⅱ幕は
    //     一九六一〜六八年が各一手、一九六九年だけが五・二手である。
    //     「年がいきなり後ろへ飛ぶ」というのはこれ。
    //     危機は一手が一か月に落ちる刻みなのだから、暦はむしろ
    //     ゆっくり進まなければならない。turns_left で数えればそうなる。
    //
    //  ② 局面の終わりと選挙の年が合わない。第Ⅳ幕は幕全体を
    //     一九七八〜八五年に伸ばしていたので、第三局面が閉じる時点で
    //     盤面が一九八五年になり、そこで一九八三年の総選挙をやっていた。
    //     目印で区切れば、選挙の年と盤面の年は必ず一致する。
    //  ③ 年でしか動かないと、一手ごとに何も変わらないか、
    //     いきなり一年跳ぶかのどちらかになる。月で持てば、
    //     ふつうの一手は三か月、危機の一手は一か月ぶん動く。
    tickYear: function (Q) {
      var cfg = this.ACTS[Q.act || 1];
      if (!cfg) { return Q; }
      Q.act_turn = (Q.act_turn || 0) + 1;
      //  通しの手数。幕をまたいでも戻さない（act_turn は幕ごとに 0 へ戻る）。
      //  国鉄の「四手に一度」（kokutetsuUpkeep）がこれを読む。
      Q.turn_n = (Q.turn_n || 0) + 1;
      var ph = Math.max(1, Q.phase || 1);
      var marks = cfg.marks || [[cfg.to, 12]];
      var a = (ph > 1) ? (marks[ph - 2] || [cfg.from, cfg.fromM || 1])
                       : [cfg.from, cfg.fromM || 1];
      var b = marks[ph - 1] || [cfg.to, 12];
      //  局面の進み具合。phase_turns は危機で増えた分を含む総手数で、
      //  turns_left と同じ時に同じだけ増える（crisisCheck）。
      var tot = Q.phase_turns || cfg.phases[ph - 1] || 1;
      var used = Math.max(0, tot - (Q.turns_left || 0));
      var am = this.ymOf(a[0], a[1]), bm = this.ymOf(b[0], b[1]);
      var m = Math.round(am + (bm - am) * Math.min(1, used / tot));
      var last = this.ymOf(cfg.to, 12);
      if (m > last) { m = last; }
      return this.setDate(Q, this.yearOfYm(m), this.monthOfYm(m));
    },

    tickCounters: function (Q) {
      if (Q.cab_kind > 0) { this.tallyCounter(Q, 'cab'); }
      if ((Q.members || 0) > (Q.mem_mark || 0) + this.MEM_STEP) {
        Q.mem_mark = Q.members;
        this.tallyCounter(Q, 'mem');
      }
      var i, f, worst = 0, fs = this.FAC_KEYS;
      for (i = 0; i < fs.length; i++) {
        f = fs[i];
        if (this.inParty(Q, f) && (Q['mood_' + f] || 0) > worst) { worst = Q['mood_' + f]; }
      }
      //  毎手ではなく、不満が新しい段に上がったときだけ数える。
      //  毎手だと一幕で 20 を超え、split に載る事象が幕頭で全部開いてしまう。
      if (worst >= this.SPLIT_TALLY) {
        var mark = Math.floor((worst - this.SPLIT_TALLY) / 15) + 1;
        if (mark > (Q.split_mark || 0)) { Q.split_mark = mark; this.tallyCounter(Q, 'split'); }
      }
      return Q;
    },


    // ══════════════════════════════════════════════════════════
    //  幕の定義と承継契約
    //  幕は「一局の独立したゲーム」であり、あいだで渡すのは
    //  ここに列挙した値だけ。これ以上を渡すと、幕を分けた意味がなくなる。
    // ══════════════════════════════════════════════════════════
    //  一手＝一四半期。幕の手数はその幕が覆う月数の三分の一である。
    //    Ⅰ 1958.01–1960.12  36か月 → 12手
    //       局面の締め： 6手→党大会(1959.9) / 4手→安保(1960.6) / 2手→総選挙(1960.11)
    //    Ⅱ 1961.01–1969.12 108か月 → 36手
    //    Ⅲ 1970.01–1977.12  96か月 → 32手
    //    Ⅳ 1978.01–1985.12  96か月 → 32手
    //    Ⅴ 1986.01–1993.08  92か月 → 31手
    //  合計 139手。事象の閾値は needOf が act_turns の割合で持っているので
    //  自動で追随するが、山の引きやすさは別に確かめること（tools/act5-deck.mjs）。
    //  marks は「その局面が閉じる年」＝暦の目印である。
    //  ふつうは総選挙の年。暦はこの目印のあいだを進む（tickYear）。
    //
    //  第Ⅲ・Ⅳ幕は最後の総選挙のあとに一局面を置いた。置かないと
    //  幕の終わりの年（第Ⅲ幕の一九七七年、第Ⅳ幕の一九八四〜八五年）に
    //  手が一つも立たず、その年の史実 ── 江田三郎の離党、社会市民連合、
    //  国鉄の分割民営化、男女雇用機会均等法、プラザ合意 ── が
    //  まるごと出ないか、さもなければ「盤面は一九八五年、しかしいま
    //  一九八三年の総選挙をやっている」という食い違いになる。
    //  手数の合計は変えていない（第Ⅲ幕 32、第Ⅳ幕 32）。
    //  marks は「その局面が閉じる年月」＝暦の目印である。ふつうは総選挙の日。
    //  暦はこの目印のあいだを月で進む（tickYear）。一手＝一四半期なので、
    //  局面の手数は「その局面が覆う月数 ÷ 三」に合わせてある。
    //
    //  第Ⅲ・Ⅳ幕は最後の総選挙のあとに一局面を置いた。置かないと
    //  幕の終わりの年（第Ⅲ幕の一九七七年、第Ⅳ幕の一九八四〜八五年）に
    //  手が一つも立たず、その年の史実 ── 江田三郎の離党、社会市民連合、
    //  国鉄の分割民営化、男女雇用機会均等法、プラザ合意 ── が
    //  まるごと出ないか、さもなければ「盤面は一九八五年、しかしいま
    //  一九八三年の総選挙をやっている」という食い違いになる。
    //  手数の合計は変えていない（第Ⅲ幕 32、第Ⅳ幕 32、第Ⅴ幕 31）。
    ACTS: {
      1: { from: 1958, fromM: 1, to: 1960, turns: 12, phases: [6, 4, 2],
           marks: [[1959, 9], [1960, 6], [1960, 11]],
           elections: [1960], pass: 130, title: '分裂と安保' },
      2: { from: 1961, fromM: 1, to: 1969, turns: 36, phases: [12, 12, 12],
           marks: [[1963, 11], [1967, 1], [1969, 12]],
           elections: [1963, 1967, 1969], pass: 110, title: '構造改革論争' },
      3: { from: 1970, fromM: 1, to: 1977, turns: 32, phases: [12, 16, 4],
           marks: [[1972, 12], [1976, 12], [1977, 12]],
           elections: [1972, 1976], pass: 115, title: '袋小路' },
      4: { from: 1978, fromM: 1, to: 1985, turns: 32, phases: [7, 4, 13, 8],
           marks: [[1979, 10], [1980, 6], [1983, 12], [1985, 12]],
           elections: [1979, 1980, 1983], pass: 105, title: '現実路線への漂流' },
      5: { from: 1986, fromM: 1, to: 1993, turns: 31, phases: [4, 14, 13],
           marks: [[1986, 7], [1990, 2], [1993, 7]],
           elections: [1986, 1990, 1993], pass: 100, title: '土井と崩壊' }
    },

    //  暦は「西暦×12＋月−1」という一本の数で持つ。年をまたぐ足し算が
    //  そのままできるので、事象の門も「一九七三年十月以降」と書ける。
    ymOf: function (y, m) { return y * 12 + ((m || 1) - 1); },
    yearOfYm: function (m) { return Math.floor(m / 12); },
    monthOfYm: function (m) { return (m % 12) + 1; },
    MONTH_JA: ['一月', '二月', '三月', '四月', '五月', '六月',
               '七月', '八月', '九月', '十月', '十一月', '十二月'],

    //  暦を進める。後ろへは戻さない。
    setDate: function (Q, year, month) {
      var m = this.ymOf(year, month || 1);
      if (m < (Q.ym || 0)) { m = Q.ym; }
      Q.ym = m;
      Q.month = this.monthOfYm(m);
      Q.quarter = Math.floor((Q.month - 1) / 3) + 1;
      Q.month_name = this.MONTH_JA[Q.month - 1];
      var y = this.yearOfYm(m);
      if (y > (Q.year || 0)) { this.advanceYear(Q, y); }
      return Q;
    },

    //  承継する値。30個以内に収める（設計案の承継契約）
    CARRY: [
      'difficulty',
      'route', 'seats_hr', 'seats_hc', 'budget', 'capital', 'members',
      'seat_uha', 'seat_chuu', 'seat_chusa', 'seat_muha', 'seat_saha',
      'del_uha', 'del_chuu', 'del_chusa', 'del_muha', 'del_saha',
      'kouho', 'sohyo_giin',
      'capital_acc', 'capital_dec',
      'hc_last_won',
      //  社会党の参院が参院選の外で動いたかを見る印（D3。hcSync）
      'hc_mine_seen',
      //  参院の他党（D2）：構成と非改選の控え。幕をまたいでそのまま残る
      'hc_jimin', 'hc_minsha', 'hc_komei', 'hc_kyosan', 'hc_other', 'hc_soka',
      'hcw_jimin', 'hcw_minsha', 'hcw_komei', 'hcw_kyosan', 'hcw_other',
      'kyokai_grip', 'saha_independent',
      'mood_uha', 'mood_chuu', 'mood_chusa', 'mood_saha',
      'rel_kyosan', 'rel_minsha', 'rel_komei', 'rel_jimin', 'rel_sohyo',
      'nl_activity', 'nl_revulsion', 'nl_distance', 'nl_intake', 'nl_intake_del', 'nl_hit', 'nl_fallout_done',
      'splits', 'minsha_exists', 'shamin_exists', 'shinsha_exists',
      'komei_exists', 'domei_exists', 'cabinet_posts',
      'local_kyoto', 'local_yokohama', 'local_tokyo', 'local_pop_share',
      'post_chair', 'post_secgen', 'post_policy', 'post_diet', 'post_org', 'post_youth',
      'michi_adopted', 'kozo_kaikaku', 'seiseido_kyokai', 'asanuma_dead',
      'shicho_kai', 'shakomin', 'local_debt', 'renseki_shock', 'oil_shock', 'nanin_iinkai',
      'shako_goi', 'hibuso_churitsu', 'zenyato', 'kokutetsu_debate', 'kokutetsu_guard',
      'shin_sengen', 'rengo_formed', 'madonna', 'pko_stance', 'gulf_stance',
      'won_majority_ever', 'left_unity', 'senkyoku_seido', 'zenrokyo',
      'gov_ours', 'gov_ldp',
      'reorg_force', 'roso_hidari', 'sandbox',
      'keimou_open', 'keimou_seinen', 'keimou_kakudai',
      'capital_extra',
      'capb_kokorou', 'capb_minrou', 'capb_mishoshiki',
      'capb_jieigyo', 'capb_noson', 'capb_shinchukan',
      'jimin_kiban',
      'orgb_kokorou', 'orgb_minrou', 'orgb_mishoshiki', 'orgb_jieigyo', 'orgb_noson', 'orgb_shinchukan',
      //  労働戦線。五九年の春闘の形、六六年と八三年の総評人事、
      //  総評の中の左右比と二つの塊。ここは幕をまたいで効き続ける。
      'shunto_form', 'sohyo66', 'sohyo_chair', 'sohyo_secgen',
      'lr_sohyo', 'lr_churitsu', 'lr_shinsan', 'u_tekko', 'u_rosokon', 'left_unity_pts',
      'rel_domei', 'rel_churitsu', 'rel_shinsan',
      //  闘争の帰結。七五年のスト権、八一年の臨調、八三年の国鉄。
      //  それぞれが次の闘争の土台になるので、幕をまたいで残す。
      'sutoken_won', 'sutoken_partial', 'rincho_blunted', 'gyokaku_junbi',
      'kokutetsu_kind', 'kokutetsu_n', 'kokutetsu_scale', 'kokutetsu_debt',
      'koku_kouyou', 'shunto_peak', 'shunto_jisei',
      //  改憲の挿話。一期の国会は幕をまたぐことがある（一九七七年に止めたら、
      //  一九七九年の総選挙までは止めたまま）。九条を失ったことは終わりまで残る。
      //  どれも carryOver では消さない。承継の約束として書いておく。
      'kyujo_ushinatta', 'kaiken_lost_year', 'kaiken_term_used', 'kaiken_blocked',
      'kk_komei_out', 'kk_minsha_out', 'kk_float_out'
    ],

    //  幕をまたぐときに呼ぶ。承継する値以外は捨て、盤面を新しい年へ進める。
    //  外盤（人口・組織率・傾向）は連続なので、そのまま持ち越す。
    carryOver: function (Q, nextAct) {
      var cfg = this.ACTS[nextAct];
      if (!cfg) { return Q; }
      var i, l, p;
      // 幕内でしか意味を持たない値を落とす
      var local = ['c_fund', 'c_org', 'c_rel', 'c_rally', 'c_diet', 'c_labor', 'c_koryo',
                   'c_hr', 'c_hc', 'c_name', 'c_mem', 'c_split', 'c_youth', 'c_chair', 'c_cab',
                   'mem_mark', 'split_mark', 'act_months', 'act_turn', 'phase_turns',
                   'ev_cursor', 'dues_acc',
                   'pending_event', 'pending_split', 'pending_faction',
                   'action_timer', 'jinji_timer', 'turns_left', 'phase',
                   //  改憲の挿話は幕をまたがせない（kaiken_lost_act は act_end が読むので残す）
                   'kaiken_ep', 'kaiken_page', 'kaiken_rounds', 'kaiken_delay_used',
                   'pending_kaiken', 'kaiken_withdrawn', 'kaiken_stage', 'kk_ref_chosen'];
      for (i = 0; i < local.length; i++) { Q[local[i]] = 0; }
      Q.pending_faction = '';
      // evdone は消さない。幕作用域があるので消す必要がなく、
      // 消すと一度きりの史実事象（三池など）が二度起きてしまう。
      if (this.LEADERS) {
        for (p in this.LEADERS.FIG) {
          if (this.LEADERS.FIG.hasOwnProperty(p)) { Q['cd_' + p] = 0; Q['uses_' + p] = 0; }
        }
      }
      Q.act = nextAct;
      //  この幕のあいだに新しく割れたかを見るための基準
      Q.splits_act_start = Q.splits || 0;
      Q.act_power = Q.in_power ? 1 : 0;
      Q.act_turns = cfg.turns;
      Q.phase = 1;
      Q.turns_left = cfg.phases[0];
      Q.phase_turns = cfg.phases[0];
      Q.pass_line = cfg.pass;
      Q.jichitai_done_phase = 0;
      Q.crisis_used = 0; Q.crisis_on = 0; Q.crisis_turns_left = 0;
      Q.next_election_idx = 0;
      this.setDate(Q, cfg.from, cfg.fromM || 1);
      Q.year = cfg.from;
      //  脇柱「この一手の変化」の控えを捨てる（幕の切り替えそのものを変化に数えない）
      this.tdReset(Q);
      this.refresh(Q);
      return Q;
    },

    //  その幕の次の選挙年
    nextElection: function (Q) {
      var cfg = this.ACTS[Q.act || 1];
      if (!cfg) { return 0; }
      var i = Q.next_election_idx || 0;
      return cfg.elections[i] || 0;
    },

    // ══════════════════════════════════════════════════════════
    //  擁立数
    //
    //  中選挙区制では定数三〜五の選挙区に各党が複数立てる。
    //  立てていない選挙区の議席は、どれだけ票があっても取れない。
    //
    //  社会党の三十四年でいちばん動かなかった数がこれである。
    //    一九五八年 246人 → 166議席（定数467、過半234）
    //    一九六〇年 186人 → 145議席
    //    一九九〇年 149人 → 136議席（定数512、過半257）
    //    一九九三年 142人 →  70議席
    //  一九五八年を除き、**全員当選しても過半に届かない数しか立てていない**。
    //  単独過半が一度も見えなかったのは得票率の問題ではなく、この数である。
    //
    //  以前はこれを nomination（−1/0/+1）という一回きりの旗にして
    //  議席へ ±7% を掛けていた。それでは、得票率を上げれば議席が
    //  いくらでも伸びる盤になる ── 実測で得票 59.6% → 299議席、
    //  つまり候補者を一人も増やさずに単独過半が取れていた。
    // ══════════════════════════════════════════════════════════
    //  史実の擁立数（衆院）
    HIST_NOM: { 1958: 246, 1960: 186, 1963: 198, 1967: 209, 1969: 183, 1972: 161,
                1976: 162, 1979: 157, 1980: 149, 1983: 144, 1986: 138, 1990: 149,
                1993: 142 },
    NOM_OPEN: 186,          // 一九六〇年に実際に立てた数

    //  候補を一人立てるには供託金と選挙区の事務所と、そこで働く人が要る。
    //  供託金は三十四年で上がり続けた（衆院 一九五九年 十万円 → 一九九二年 二百万円）。
    nomCost: function (Q, n) {
      var y = Q.year || 1959;
      return Math.max(1, Math.round(n / 20 * 2.4 * (1 + (y - 1959) / 22)));
    },

    //  立て続けられる数。党員と持っている自治体で決まる。
    //  ここを割ると、次の選挙までに勝手に戻ってくる（候補者は落ち続けない）。
    nomFloor: function (Q) {
      var m = (Q.members || 50000) / 50000;
      var l = 1 + (Q.local_n || 0) * 0.03;
      return clamp(Math.round(110 * m * l + 40), 80, 320);
    },

    //  立てた候補のうち何人が通るか。
    //  効くのは「得票率」そのものではなく、
    //  得票率 ÷（候補者数 ÷ 定数）── 一人あたりどれだけ票を回せるか。
    //  史実十二回に当てた（比 → 当選率）。折れ点は三つ：
    //    56 で 49%（共倒れの底）／64 で 65%／69.5 で 78%／83.8 で 91%
    //  比が 56 を割ると票を分け合って共倒れする。
    //  一九六九年（比 56.9、90議席）と一九九三年（比 55.5、70議席）がそれである。
    //  逆に一九九〇年は比 83.8 ── 立てた 149 人のうち 136 人が通った。
    //  平均のずれは十二回で 3.1 議席。
    nomWinRate: function (ratio) {
      var w;
      if (ratio <= 64) { w = 0.49 + (ratio - 56) * 0.0200; }
      else if (ratio <= 69.5) { w = 0.650 + (ratio - 64) * 0.0236; }
      else { w = 0.780 + (ratio - 69.5) * 0.0093; }
      return clamp(w, 0.18, 0.95);
    },

    //  この盤面で、いま立てている数だと最大何議席取れるか。
    //  kk を渡すと、その人数で数える（見込みの頁が選択肢ごとに使う）。
    //  渡さなければ Q.kouho ── runElection の呼び方はこちら。
    nomCeiling: function (Q, share, kk) {
      var k = (kk === undefined || kk === null) ? (Q.kouho || this.NOM_OPEN) : kk;
      var tot = Q.hr_total || 511;
      var dens = k / tot;
      var ratio = dens > 0 ? share / dens : 0;
      var win = this.nomWinRate(ratio);
      return { kouho: k, ratio: Math.round(ratio * 10) / 10,
               win: win, cap: Math.round(k * win) };
    },

    // ══════════════════════════════════════════════════════════
    //  議席の見込み
    //
    //  選挙の頁は、天井で切った分をすべて「候補を立てていない選挙区で
    //  捨てた」と書いていた。二〇二六年九月に打って数えると、そう書いた
    //  回の六割は逆で、立てすぎて同じ選挙区で票を分け合い、共倒れしていた。
    //
    //  天井は 人数 k × 当選率 w(得票率 ÷ (k / 定数))。w の折れ方から、
    //  天井は比が 69.5 のところで最も高い。比がそれより大きい（人が少ない）と
    //  票のある選挙区に人がいない。小さい（人が多い）と共倒れする。
    //  だから最適の人数は floor(得票率 × 定数 ÷ 69.5)。右側は一人につき
    //  0.86 議席ずつ落ち、左側は 0.13 議席ずつしか上がらないので、
    //  五の倍数に丸めずに切り捨てる（丸めると十六回に一回、二議席損をした）。
    //
    //  seatForecast は runElection と同じ順でなぞる ──
    //  暦を選挙の日へ進め、事象で積んだ候補（nom_bonus × 7）を足し、
    //  得票を配り（allocate）、擁立数の天井で切る。盤の算術は一字も変えていない。
    //  暦を進めるときと opt を使うときは写しの上で数えるので、Q は触らない。
    //  （opt を使わず暦も進めないときは Q の上で allocate する。tally が負の
    //  傾向を 0 に挟むのは、これまでの refresh と同じ場所・同じ作用である。）
    // ══════════════════════════════════════════════════════════
    NOM_BEST_RATIO: 69.5,
    NOM_WARN: 5,            // これより小さい取りこぼしは「ほぼ最適」と言う
    //  事象で積んだ候補の人数（runElection と同じ丸め）
    nomBonusK: function (Q) { return Q.nom_bonus ? Math.round(Q.nom_bonus * 7) : 0; },
    //  次の選挙で実際に立つ人数
    nomPlanned: function (Q) { return (Q.kouho || this.NOM_OPEN) + this.nomBonusK(Q); },
    //  この得票でいちばん多く取れる人数
    nomBestK: function (Q, share) {
      var tot = Q.hr_total || 511;
      return clamp(Math.floor(share * tot / this.NOM_BEST_RATIO), 60, tot);
    },
    //  取りこぼしの理由。0 無し／1 少なすぎ／2 多すぎ／3 ほぼ最適（それでも天井に当たった）
    nomVerdict: function (Q, share, vote, k) {
      var nc = this.nomCeiling(Q, share, k);
      var kb = this.nomBestK(Q, share);
      var best = Math.min(vote, this.nomCeiling(Q, share, kb).cap);
      var seats = Math.min(vote, nc.cap);
      var fix = Math.max(0, best - seats);
      var cause = (vote <= nc.cap) ? 0 : (fix < this.NOM_WARN ? 3 : (k > kb ? 2 : 1));
      return { kouho: k, ratio: nc.ratio, win: nc.win, cap: nc.cap, vote: vote, seats: seats,
               best_k: kb, best: best, fix: fix, cause: cause };
    },
    //  写し。盤の値はどれも一段の数か文字列なので、浅い写しで足りる
    //  （深い写しは refresh 一回の三倍かかる）。
    fcCopy: function (Q) {
      var c = {}, k;
      for (k in Q) { if (Object.prototype.hasOwnProperty.call(Q, k)) { c[k] = Q[k]; } }
      return c;
    },
    //  いま（year を渡せばその年の投票日に）総選挙をしたら何議席か。
    //    k     立てる人数。省けば nomPlanned（いまの人数＋事象の候補）
    //    opt.perm(c)   写しに先に永久の効果を掛ける（大きな決定の見込み用）
    //    opt.decay     'election' 押した票が残りの手数ぶん基線へ戻ってから数える
    //                  'base'     押した票がすべて基線へ戻ってから数える
    //    opt.turns     decay の手数（省けば turns_left）
    //    opt.all       各党の議席も出す（v.all）。runElection が配ったあとにやる
    //                  三つ ── 天井の余りを自民と諸派へ半々、一九八〇年の弔い合戦、
    //                  新党の切り出し ── まで写しの上でなぞる
    seatForecast: function (Q, k, year, opt) {
      opt = opt || {};
      var c = Q, i, l;
      var future = !!(year && year > (Q.year || 0));
      if (future || opt.perm || opt.decay || opt.all) { c = this.fcCopy(Q); }
      if (opt.perm) { opt.perm(c); }
      if (future) { this.setDate(c, year, this.HR_MONTH[year] || 12); }
      if (opt.decay) {
        var T = (opt.turns === undefined || opt.turns === null) ? (c.turns_left || 0) : opt.turns;
        var f = opt.decay === 'base' ? 0 : Math.pow(1 - this.DECAY, Math.max(0, T));
        for (i = 0; i < LAYERS.length; i++) {
          l = LAYERS[i];
          var b = this.baselineLean(c, l), s0 = c['lean_' + l + '_shakai'] || 0;
          var nl = b + (s0 - b) * f;
          c['lean_' + l + '_jimin'] = (c['lean_' + l + '_jimin'] || 0) - (nl - s0);
          c['lean_' + l + '_shakai'] = nl;
        }
      }
      var kk = (k === undefined || k === null) ? this.nomPlanned(c) : k;
      var r = this.allocate(c);
      var v = this.nomVerdict(c, r.share.shakai, r.seats.shakai, kk);
      v.share = r.share;
      v.year = c.year || 0;
      v.hr_total = c.hr_total || 0;   //  その選挙の定数（改憲の見込みの三分の二に使う）
      if (opt.all) { v.all = this.fcAll(c, r.seats, v, year || c.year || 0); }
      return v;
    },
    //  opt.all の本体。c は写し（runElection と同じ関数で書き換えてよい）。
    fcAll: function (c, seats, v, year) {
      var s = {}, p, j, out = {};
      for (j = 0; j < PARTIES.length; j++) { p = PARTIES[j]; s[p] = seats[p] || 0; }
      if (s.shakai > v.cap) {
        var diff = s.shakai - v.cap;
        s.shakai = v.cap;
        s.jimin += Math.round(diff * 0.5);
        s.other += diff - Math.round(diff * 0.5);
      }
      for (j = 0; j < PARTIES.length; j++) { p = PARTIES[j]; c['res_' + p] = s[p]; }
      if (year === 1980) {
        var small = ['komei', 'kyosan', 'other', 'minsha'], grab = 0, m, take;
        for (m = 0; m < small.length; m++) {
          take = Math.round(c['res_' + small[m]] * 0.12);
          c['res_' + small[m]] -= take; grab += take;
        }
        c.res_jimin += grab;
      }
      if (year >= 1993 && !c.ldp_split_done) { this.splitLDP1993(c); }
      this.seedSplinters(c, year);
      this.applySplinters(c, year);
      for (j = 0; j < PARTIES.length; j++) { p = PARTIES[j]; out[p] = c['res_' + p] || 0; }
      for (j = 0; j < this.SPLINTER_KEYS.length; j++) {
        p = this.SPLINTER_KEYS[j];
        out['sp_' + p] = c['res_sp_' + p] || 0;
      }
      return out;
    },
    //  脇柱・主画面・外盤・調整の頁が読む見込みを Q に焼く。
    //  fc を渡さなければ、ここで数える（主画面は写しで数えて盤を触らない）。
    fcFields: function (Q, fc) {
      if (!fc) { fc = this.seatForecast(this.fcCopy(Q)); }
      Q.nom_kouho = fc.kouho;
      Q.nom_ratio = fc.ratio;
      Q.nom_win = Math.round(fc.win * 100);
      Q.nom_cap = fc.cap;
      Q.nom_floor = this.nomFloor(Q);
      Q.nom_short = Math.max(0, (Math.floor((Q.hr_total || 511) / 2) + 1) - fc.cap);
      Q.fc_seats = fc.seats; Q.fc_vote = fc.vote; Q.fc_best_k = fc.best_k; Q.fc_best = fc.best;
      Q.fc_fix = fc.fix; Q.fc_cause = fc.cause;
      Q.fc_warn = (fc.cause === 1 || fc.cause === 2) ? fc.cause : 0;
      Q.fc_bonus_k = this.nomBonusK(Q); Q.fc_bonus_abs = Math.abs(Q.fc_bonus_k);
      Q.fc_year = this.nextElection(Q) || 0;
      Q.fc_floor_dir = (fc.kouho > Q.nom_floor) ? 2 : ((fc.kouho < Q.nom_floor) ? 1 : 0);
      //  総評から二十五人出してもらった場合（powers.sohyo_kouho の副題）。
      //  人数は得票の配り方に効かないので、同じ得票で天井だけ数え直せばよい。
      Q.fc_sohyo = this.nomVerdict(Q, fc.share.shakai, fc.vote, fc.kouho + 25).seats;
      return Q;
    },
    //  主画面の on-arrival から呼ぶ。endturn は refresh のあとで暦を進めるので、
    //  主画面の見込みが一手古くなり、直後に描き直す脇柱と食い違っていた。
    fcView: function (Q) { return this.fcFields(Q, null); },

    //  選挙を執行して結果を Q に焼く。どの年でも使える

    // ══════════════════════════════════════════════════════════
    //  図表 ── 議席図と選挙の履歴
    //
    //  原ゲーム（dynamic_social_democracy）は d3 v7（273KB）に
    //  d3-parliament.js と d3-linegraph.js を重ねて描いている。
    //  こちらは手で書く。理由は二つ：
    //    ・図一枚のために 290KB の依存を足す割に合わない
    //    ・欲しいのは衆参の二院を並べた形で、あの差し込みはそれをしない
    //  出すのは文字列（SVG）で、[+ disp_* +] からそのまま出る
    //  （tallyLine や policyBlock と同じ扱い。dendry は逃がさない）。
    // ══════════════════════════════════════════════════════════

    //  党の色と、議場での左右の並び。共産・社会・公明・民社・自民・諸派。
    //  「その他」は右端に置く（保守系無所属が多いため）。
    SEAT_LABEL: ' 的议席分布',
    //  議場での左右の並び。新党は母党の手前に置く。
    SEAT_COLOR: {
      kyosan: '#B23A34', shakai: '#c00000', sakigake: '#C08A3E',
      nihonshin: '#7FA0A8', komei: '#7B5EA7', minsha: '#3E6E8C',
      shinjiyu: '#8FA86B', shinsei: '#6B8E4E', jimin: '#4F6B3A', other: '#9A9A9A'
    },
    SEAT_NAME: {
      kyosan: '共产', shakai: '社会', sakigake: '先驱',
      nihonshin: '日本新党', komei: '公明', minsha: '民社',
      shinjiyu: '新自俱', shinsei: '新生', jimin: '自民', other: '其他'
    },

    //  半円環に n 個の席を並べる。内側から外側へ行を作り、
    //  行の長さに比例して配る ── いわゆる議場図の作り方である。
    seatLayout: function (n, W, H) {
      var outer = Math.min(W / 2, H) - 4;
      var inner = outer * 0.42;
      var rows = 1, i, r, cap, caps, total;
      //  席が収まる最小の行数を探す
      for (rows = 1; rows < 40; rows += 1) {
        caps = []; total = 0;
        var band = (outer - inner) / rows;
        var rad = band * 0.34;              // 席の半径
        for (i = 0; i < rows; i += 1) {
          r = inner + band * (i + 0.5);
          cap = Math.floor(Math.PI * r / (rad * 2.35)) + 1;
          caps.push({ r: r, cap: cap, rad: rad });
          total += cap;
        }
        if (total >= n) { break; }
      }
      //  行ごとの席数を、行の長さに比例して割る
      var out = [], left = n, sum = 0;
      for (i = 0; i < caps.length; i += 1) { sum += caps[i].cap; }
      for (i = 0; i < caps.length; i += 1) {
        var k = (i === caps.length - 1) ? left
              : Math.min(caps[i].cap, Math.round(n * caps[i].cap / sum));
        k = Math.max(0, Math.min(left, k));
        out.push({ r: caps[i].r, rad: caps[i].rad, n: k });
        left -= k;
      }
      if (left > 0 && out.length) { out[out.length - 1].n += left; }
      //  左（π）から右（0）へ、全部の席を一列に並べ直す。
      //  角度の順に並べると党の塊が扇形に切れるので、
      //  「角度が同じ席は内側から」で通し番号を振る。
      var pts = [];
      for (i = 0; i < out.length; i += 1) {
        var row = out[i];
        for (var j = 0; j < row.n; j += 1) {
          var t = (row.n === 1) ? 0.5 : j / (row.n - 1);
          pts.push({ t: t, r: row.r, rad: row.rad, row: i });
        }
      }
      pts.sort(function (a, b) { return (a.t - b.t) || (a.row - b.row); });
      return { pts: pts, outer: outer, inner: inner };
    },

    //  議席図。parties は [{key, n}] を左から右の順で。
    seatSvg: function (parties, title, W, H) {
      var i, p, n = 0;
      for (i = 0; i < parties.length; i += 1) { n += parties[i].n; }
      if (n <= 0) { return ''; }
      W = W || 300; H = H || 165;
      var L = this.seatLayout(n, W, H);
      var cx = W / 2, cy = H - 6;
      //  席を党へ割り当てる（左から順に塊で）
      var flat = [];
      for (i = 0; i < parties.length; i += 1) {
        p = parties[i];
        for (var j = 0; j < p.n; j += 1) { flat.push(p.key); }
      }
      var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" '
        + 'style="max-width:' + W + 'px;display:block;margin:0 auto" '
        + 'role="img" aria-label="' + title + this.SEAT_LABEL + '">'];
      for (i = 0; i < L.pts.length; i += 1) {
        var q = L.pts[i];
        var ang = Math.PI * (1 - q.t);
        var x = cx + q.r * Math.cos(ang);
        var y = cy - q.r * Math.sin(ang);
        var key = flat[i] || 'other';
        out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1)
          + '" r="' + q.rad.toFixed(1) + '" fill="' + (this.SEAT_COLOR[key] || '#999')
          + '" stroke="#00000022" stroke-width="0.5"/>');
      }
      out.push('</svg>');
      return out.join('');
    },

    //  凡例。議席数つき。
    seatLegend: function (parties) {
      var out = [], i, p;
      for (i = 0; i < parties.length; i += 1) {
        p = parties[i];
        if (!p.n) { continue; }
        out.push('<span style="white-space:nowrap">'
          + '<span style="display:inline-block;width:.7em;height:.7em;'
          + 'background:' + (this.SEAT_COLOR[p.key] || '#999') + ';'
          + 'border-radius:50%;vertical-align:baseline"></span> '
          + (this.SEAT_NAME[p.key] || p.key) + ' <b>' + p.n + '</b></span>');
      }
      return out.join('　');
    },

    //  衆院。1993年だけ自民が割れるので、その塊を別に置く。
    hrParties: function (Q) {
      var P = [
        { key: 'kyosan', n: Q.res_kyosan || 0 },
        { key: 'shakai', n: Q.seats_hr || 0 },
        { key: 'sakigake', n: Q.res_sp_sakigake || 0 },
        { key: 'nihonshin', n: Q.res_sp_nihonshin || 0 },
        { key: 'komei', n: Q.res_komei || 0 },
        { key: 'minsha', n: Q.res_minsha || 0 },
        { key: 'shinjiyu', n: Q.res_sp_shinjiyu || 0 },
        { key: 'shinsei', n: Q.res_sp_shinsei || 0 },
        { key: 'jimin', n: Q.res_jimin || 0 },
        { key: 'other', n: Q.res_other || 0 }
      ];
      return P.filter(function (x) { return x.n > 0; });
    },

    hcParties: function (Q) {
      var P = [
        { key: 'kyosan', n: Q.hc_kyosan || 0 },
        { key: 'shakai', n: Q.hc_shakai || Q.seats_hc || 0 },
        { key: 'komei', n: Q.hc_komei || 0 },
        { key: 'minsha', n: Q.hc_minsha || 0 },
        { key: 'jimin', n: Q.hc_jimin || 0 },
        { key: 'other', n: Q.hc_other || 0 }
      ];
      return P.filter(function (x) { return x.n > 0; });
    },

    //  選挙の履歴。実績と史実を重ねる ── 原ゲームの折れ線に当たるが、
    //  こちらは「史実の同じ年」を持っているので、その差を出すほうが役に立つ。
    elecRows: function (Q) {
      var log = String(Q.elec_log || '');
      if (!log) { return []; }
      return log.split('|').filter(Boolean).map(function (r) {
        var a = r.split(':').map(Number);
        return { year: a[0], shakai: a[1], jimin: a[2], minsha: a[3],
                 komei: a[4], kyosan: a[5], other: a[6], total: a[7],
                 hist: a[8], hc: a[9], sp: a[10] || 0 };
      });
    },

    //  選挙の履歴を文字で。図表（elecSvg）は文庫の奥にあるので、
    //  状況の頁にはこちらを置く ── 「今回いくつ取ったか」は
    //  選挙の頁でしか見られず、あとから確かめる場所が無かった。
    elecTable: function (Q) {
      var rows = this.elecRows(Q);
      if (!rows.length) { return '<span style="opacity:.6">还没有打过总选举。</span>'; }
      //  N7：一回の総選挙を表の一行にした（前は <br> で並べ、脇柱の幅で一回が三行に折れていた）。
      //  見出しは一つの文字列にしてある（中文の対照表が引用符ごと差し替えるため）。
      var out = ['<table class="jsp-et">', '<tr><th>年</th><th>众院</th><th>比上届</th><th>参院</th><th>史实</th></tr>'];
      var i, r, d, ds;
      for (i = 0; i < rows.length; i += 1) {
        r = rows[i];
        d = (i === 0) ? 0 : (r.shakai - rows[i - 1].shakai);
        //  前回との差は符号を付けずに「N 増／N 減」と言う（N5 の手直し）
        ds = (i === 0) ? '' : (d > 0 ? '<span style="color:#3E6E8C;">' + '多 {n} 席'.replace('{n}', d) + '</span>'
              : (d < 0 ? '<span style="color:#B23A34;">' + '少 {n} 席'.replace('{n}', -d) + '</span>'
              : '<span style="opacity:.5">' + '持平' + '</span>'));
        out.push('<tr><td>' + r.year + '</td><td><b>' + r.shakai + '</b>/' + r.total + '</td><td>' + ds
          + '</td><td>' + r.hc + '</td><td><span style="opacity:.6">' + (r.hist || '') + '</span></td></tr>');
        if (r.sp) {
          out.push('<tr><td></td><td colspan="4">' + '　<span style="opacity:.6">分出去的党 ' + r.sp + '</span>' + '</td></tr>');
        }
      }
      out.push('</table>');
      return out.join('');
    },

    elecSvg: function (Q, W, H) {
      var rows = this.elecRows(Q);
      if (!rows.length) { return ''; }
      W = W || 460; H = H || 220;
      var padL = 34, padR = 8, padT = 12, padB = 22;
      var iw = W - padL - padR, ih = H - padT - padB;
      var i, hi = 1;
      for (i = 0; i < rows.length; i += 1) {
        hi = Math.max(hi, rows[i].shakai, rows[i].hist);
      }
      hi = Math.ceil(hi / 50) * 50;
      var x = function (k) {
        return padL + (rows.length === 1 ? iw / 2 : iw * k / (rows.length - 1));
      };
      var y = function (v) { return padT + ih - ih * v / hi; };
      var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" '
        + 'style="max-width:' + W + 'px;display:block" role="img" '
        + 'aria-label="历次总选举的获得议席与史实的对照">'];
      //  横の目盛り
      for (var g = 0; g <= hi; g += 50) {
        out.push('<line x1="' + padL + '" y1="' + y(g).toFixed(1) + '" x2="' + (W - padR)
          + '" y2="' + y(g).toFixed(1) + '" stroke="currentColor" opacity=".13"/>');
        out.push('<text x="' + (padL - 5) + '" y="' + (y(g) + 3.5).toFixed(1)
          + '" font-size="9" text-anchor="end" fill="currentColor" opacity=".5">' + g + '</text>');
      }
      var line = function (key, color, dash) {
        var d = [];
        for (i = 0; i < rows.length; i += 1) {
          d.push((i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(rows[i][key]).toFixed(1));
        }
        out.push('<path d="' + d.join(' ') + '" fill="none" stroke="' + color
          + '" stroke-width="2"' + (dash ? ' stroke-dasharray="4 3"' : '') + '/>');
        for (i = 0; i < rows.length; i += 1) {
          out.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(rows[i][key]).toFixed(1)
            + '" r="2.6" fill="' + color + '"/>');
        }
      };
      line('hist', '#9A9A9A', true);
      line('shakai', '#c00000', false);
      //  年
      for (i = 0; i < rows.length; i += 1) {
        out.push('<text x="' + x(i).toFixed(1) + '" y="' + (H - 7)
          + '" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">'
          + String(rows[i].year).slice(2) + '</text>');
      }
      out.push('</svg>');
      return out.join('');
    },


    // ══════════════════════════════════════════════════════════
    //  分裂政党（新党）
    //
    //  原ゲーム（dynamic_social_democracy）は 379 の事象のうち 73 が
    //  政党の生成・分裂・合併である。仕掛けそのものは短い ──
    //
    //      Q.lvp_formed   = 1;
    //      Q.lvp_r        = (Q.ddp_r + Q.dvp_r);        支持率を足す
    //      Q.lvp_relation = (Q.ddp_relation + Q.dvp_relation) / 2;
    //      Q.ddp_r = 0; Q.dvp_r = 0;                    元の党を消す
    //
    //  分裂はその逆で、図表は spd_r − rdp_r のように**母党から切り出す**。
    //  そして分岐を決めるのは党首選挙で、こちらの行動がそこに効く。
    //
    //  本作には lean_<層>_<党> しか無く、新党に六層ぶんの列を持たせるのは
    //  重い。だから同じ「母党から切り出す」形を取る ── 新党は母党の議席の
    //  何割か、という一つの数（sp_*）だけを持つ。
    //
    //  新自由クラブ・日本新党・新生党・新党さきがけは、これまで事象の
    //  文章の中にしか居なかった（盤の議席には一切効いていなかった）。
    // ══════════════════════════════════════════════════════════
    SPLINTER: {
      //  一九七六、ロッキードのあと河野洋平ら六人が離党。史実 17 議席。
      //  一九八六年に自民へ復党して解党する ── 分裂して戻る唯一の例。
      //  ally は「自民を降ろす側に立つか」。新自由クラブは一九八三年に
      //  自民と連立を組み、八六年には復党しているので、受け皿には数えない。
      shinjiyu: { parent: 'jimin', name: '新自由俱乐部', born: 1976, back: 1986, ally: false },
      //  一九九二、細川護熙。史実は一九九三年に 35 議席。
      //  母党は自民にする。史実の三十五議席は都市の無党派と
      //  自民から来ていて、「その他」の四十議席からはその大きさが出ない
      //  （実測で中央値 9 議席にしかならなかった）。
      nihonshin: { parent: 'jimin', name: '日本新党', born: 1992, ally: true },
      //  一九九三、羽田・小沢。史実 55 議席。
      shinsei: { parent: 'jimin', name: '新生党', born: 1993, ally: true },
      //  一九九三、武村正義。史実 13 議席。
      sakigake: { parent: 'jimin', name: '新党先驱', born: 1993, ally: true }
    },
    //  切り出す順。一九九三年の自民の分裂を先に正確に取り、
    //  日本新党はその残りから取る。逆にすると ldp_split と
    //  実際に切り出した議席がずれる（新生党が 49 まで痩せた）。
    SPLINTER_KEYS: ['shinjiyu', 'shinsei', 'sakigake', 'nihonshin'],

    splinterOn: function (Q, k) { return (Q['sp_' + k] || 0) > 0; },

    //  生まれる年。早く割れた盤では、その年から数える。
    splinterBorn: function (Q, k) {
      return Q['spborn_' + k] || (this.SPLINTER[k] || {}).born || 0;
    },

    //  史実の見積もり。新自由クラブも日本新党も、
    //  こちらが何をしようと生まれて議席を取った。
    //  存在そのものを事象の選択に紐付けていたのは設計の誤りで、
    //  帯や資源の都合で事象を踏まないと世界から党が消えていた。
    //  基線をここで与え、事象の選択はそれを**上書き**するだけにする。
    //    新自由クラブ  一九七六年 17/249 ≒ 0.068
    //    日本新党      一九九三年 35 議席
    SPLINTER_BASE: { shinjiyu: 0.062, nihonshin: 0.13 },
    seedSplinters: function (Q, year) {
      var i, k, s;
      for (i = 0; i < this.SPLINTER_KEYS.length; i += 1) {
        k = this.SPLINTER_KEYS[i];
        s = this.SPLINTER[k];
        if (this.SPLINTER_BASE[k] === undefined) { continue; }
        if (year < this.splinterBorn(Q, k)) { continue; }
        //  戻ったあとは生え直さない
        if (s.back && year >= (Q['spback_' + k] || s.back)) { continue; }
        if (Q['spseed_' + k]) { continue; }
        Q['spseed_' + k] = 1;
        if (!(Q['sp_' + k] > 0)) { Q['sp_' + k] = this.SPLINTER_BASE[k]; }
      }
      return Q;
    },

    //  総選挙のたびに、母党の議席から切り出す。
    //  戻る年（back）を過ぎていたら、切り出さない＝母党へ畳まれる。
    applySplinters: function (Q, year) {
      var i, k, s, take, tot = 0;
      for (i = 0; i < this.SPLINTER_KEYS.length; i += 1) {
        k = this.SPLINTER_KEYS[i];
        s = this.SPLINTER[k];
        var frac = Q['sp_' + k] || 0;
        //  まだ生まれていない／もう戻った
        if (year < this.splinterBorn(Q, k)) { frac = 0; }
        if (s.back && year >= (Q['spback_' + k] || s.back)) { frac = 0; Q['sp_' + k] = 0; }
        if (frac <= 0) { Q['res_sp_' + k] = 0; continue; }
        var pk = 'res_' + s.parent;
        take = Math.round((Q[pk] || 0) * frac);
        take = Math.max(0, Math.min(Q[pk] || 0, take));
        Q[pk] -= take;
        Q['res_sp_' + k] = take;
        tot += take;
      }
      Q.splinter_seats = tot;
      return tot;
    },

    //  分裂して出た新党を、こちらへ畳む。議席を移すだけでなく
    //  切り出しの割合そのものを消さないと、次の総選挙でまた生えてくる。
    absorbSplinter: function (Q, k) {
      var n = Q['res_sp_' + k] || 0;
      Q['res_sp_' + k] = 0;
      Q['sp_' + k] = 0;
      Q['spseed_' + k] = 1;
      Q['spmerged_' + k] = 1;
      if (n > 0) {
        Q.seats_hr = (Q.seats_hr || 0) + n;
        Q.res_shakai = Q.seats_hr;
      }
      return n;
    },

    //  非自民の合計。分裂した新党はすべて非自民の側に立つ。
    //  一九九三年の非自民連立は、まさにこれが過半に届いたから成立した。
    nonLdpSeats: function (Q) {
      var n = (Q.seats_hr || 0) + (Q.res_komei || 0) + (Q.res_minsha || 0)
            + (Q.res_kyosan || 0) + (Q.res_other || 0);
      for (var i = 0; i < this.SPLINTER_KEYS.length; i += 1) {
        n += Q['res_sp_' + this.SPLINTER_KEYS[i]] || 0;
      }
      return n;
    },

    // ══════════════════════════════════════════════════════════
    //  組閣の受け皿
    //
    //  非自民の議席をぜんぶ足しても内閣にはならない。数のうしろに
    //  「一緒に組める」という関係が要る。関係の目盛りは relation の
    //  qdisplay と同じ切り方をする ── 五十以上が「共闘可能」である。
    //
    //  数えるのは
    //    ・我々の議席
    //    ・共闘可能まで来ている党（公明・民社・共産）
    //    ・自民から割れて出た新党のうち、自民を降ろす側に立つもの
    //  「その他」は名簿ではなく残余なので数えない。
    //  自民党とだけは、この道では組まない（自社連立は jisha_pact の別道）。
    KYOTOU_LINE: 50,
    //  公明も民社も、共産党と同じ内閣には入らない（社公民の線はそのために引かれた）。
    //  だから受け皿は二通りしか無い。
    //    ・社共だけで過半に届く　→ 共産党と組む内閣
    //    ・届かない　　　　　　 → 共産党を外し、公明・民社と組む内閣
    //  両方を一度に足すと、史実にも算術にも無い「公明・民社・共産の内閣」ができる。
    coalitionBloc: function (Q) {
      var line = this.KYOTOU_LINE;
      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      var mine = Q.seats_hr || 0, i, k, s, n;
      //  まず社共だけで届くかを見る
      var kyosanIn = !Q.kyosan_merged && (Q.rel_kyosan || 0) >= line && (Q.res_kyosan || 0) > 0;
      if (kyosanIn && mine + (Q.res_kyosan || 0) >= maj) {
        return { seats: mine + Q.res_kyosan, kind: 'sakyo',
          parties: [{ name: '共产党', seats: Q.res_kyosan, rel: Q.rel_kyosan }] };
      }
      //  届かないなら共産党は外れる。中道と分裂新党で数える
      var rows = [], seats = mine;
      var add = function (name, num, rel) {
        if (!(num > 0) || (rel || 0) < line) { return; }
        rows.push({ name: name, seats: num, rel: rel });
        seats += num;
      };
      if (Q.komei_exists) { add('公明党', Q.res_komei || 0, Q.rel_komei); }
      if (Q.minsha_exists) { add('民社党', Q.res_minsha || 0, Q.rel_minsha); }
      for (i = 0; i < this.SPLINTER_KEYS.length; i += 1) {
        k = this.SPLINTER_KEYS[i];
        s = this.SPLINTER[k];
        if (!s || !s.ally) { continue; }
        n = Q['res_sp_' + k] || 0;
        if (n <= 0) { continue; }
        //  自民から割れて出た党は、割れた理由がそのまま「組める」根拠になる。
        //  関係の目盛りを持っていないので、ここは議席だけで数える。
        rows.push({ name: s.name, seats: n, rel: null });
        seats += n;
      }
      return { seats: seats, kind: 'chudo', parties: rows };
    },

    //  受け皿を頁に出すための控え。行が無ければ「我々だけ」と書く。
    blocLine: function (Q, bloc) {
      var b = bloc || this.coalitionBloc(Q);
      var out = ['<b>' + (Q.party_name || '社会党') + '</b>　' + (Q.seats_hr || 0)];
      for (var i = 0; i < b.parties.length; i++) {
        out.push(b.parties[i].name + '　' + b.parties[i].seats);
      }
      return out.join('<br>');
    },

    //  一九九三年、自民党はどれだけ割れるか。
    //
    //  以前は 68 の決め打ちだった ── つまり三十四年何をしても終局は同じ
    //  大きさで割れた。割れる大きさは、こちらが積み上げたものに応えるべきである。
    //    ・公明と民社との窓口（社公民の線をどれだけ作ったか）
    //    ・閣外の政策協議で自民に何回呑ませたか
    //    ・自民との関係が悪いほど、離党の口実になる
    //  史実は新生党 55 ＋ さきがけ 13 ＝ 68。真ん中あたりに来るよう校正した。
    ldpSplitSize: function (Q) {
      var komei = Math.max(0, Math.min(60, Q.rel_komei || 0));
      var minsha = Math.max(0, Math.min(60, Q.rel_minsha || 0));
      var won = Math.max(0, Math.min(12, Q.kyogi_won || 0));
      var sour = Math.max(0, Math.min(40, -(Q.rel_jimin || 0)));
      var n = 22 + komei * 0.30 + minsha * 0.30 + won * 2.2 + sour * 0.25;
      return Math.max(8, Math.min(96, Math.round(n)));
    },

    //  ── 早く割れる道 ────────────────────────────────
    //
    //  羽田孜・小沢一郎・海部俊樹が自民党を出た理由は、金の事件そのもの
    //  ではない。選挙制度を変える話が、党内の主流派に二度潰されたことである。
    //  海部の政治改革関連法案は一九九一年に廃案になり、その一年半あと、
    //  宮沢内閣が同じ法案を出せずに不信任を受けた。
    //
    //  だから早く割れる条件も同じ形で書く。
    //    ・改革の議題が国会に立っていること（seiji_kaikaku_an か、
    //      東京佐川のあと選挙制度の協議に乗ったこと）
    //    ・出た先に受け皿があること ── 公明・民社との窓口、閣外協議で
    //      呑ませた回数、自民との距離。これは ldpSplitSize がそのまま持つ。
    //
    //  線は史実の 68 より少し下に置く。届けば、割れは一九九三年六月を
    //  待たずに起きる ── 議席はその場で動き、次の総選挙を待たない。
    LDP_WARE_LINE: 62,
    LDP_WARE_FROM: 1989,
    LDP_WARE_UNTIL: 1992,

    ldpWareReady: function (Q) {
      if (Q.ldp_split_done || Q.ldp_wareme) { return 0; }
      var y = Q.year || 0;
      if (y < this.LDP_WARE_FROM || y > this.LDP_WARE_UNTIL) { return 0; }
      //  改革の議題が立っていなければ、出る口実が無い
      if (!Q.seiji_kaikaku_an && !Q.sagawa_seido) { return 0; }
      return this.ldpSplitSize(Q) >= this.LDP_WARE_LINE ? 1 : 0;
    },

    //  札を出す前に、割れる大きさと顔ぶれだけ数えておく。
    //  文面がこの二つを読む ── 選択肢を選ぶ前に決まっている必要がある。
    wareSize: function (Q) {
      Q.ldp_split = Math.min(Q.res_jimin || 0, this.ldpSplitSize(Q));
      Q.ware_kaifu = (this.ldpHead(Q) === '海部俊树') ? 1 : 0;
      return Q.ldp_split;
    },

    //  割れをその場で起こす。総選挙を待たない ── 出て行った議員は
    //  現有の議席を持って出る。史実の一九九三年六月もそうだった。
    splitLDPNow: function (Q, early) {
      var total = this.ldpSplitSize(Q);
      var jimin = Q.res_jimin || 0;
      var take = Math.max(0, Math.min(jimin, total));
      var sg = Math.round(take * 0.19);
      var ss = take - sg;
      var y = Q.year || this.LDP_WARE_FROM;
      //  次の総選挙からは、母党の議席から同じ割合で切り出す
      var frac = jimin > 0 ? Math.max(0, Math.min(0.9, take / jimin)) : 0;
      Q.sp_shinsei = frac * 0.81;
      Q.sp_sakigake = frac * 0.19;
      Q.spborn_shinsei = y;
      Q.spborn_sakigake = y;
      Q.spseed_shinsei = 1;
      Q.spseed_sakigake = 1;
      //  いまの議席をその場で移す
      Q.res_jimin = jimin - take;
      Q.res_sp_shinsei = (Q.res_sp_shinsei || 0) + ss;
      Q.res_sp_sakigake = (Q.res_sp_sakigake || 0) + sg;
      Q.splinter_seats = this.allySplinterSeats(Q) + (Q.res_sp_shinjiyu || 0);
      Q.ldp_split = take;
      Q.ldp_split_done = 1;
      //  早く割れた盤の印。史実の年に割れたときは立てない ──
      //  立てると一九九三年の札（内閣不信任・新党さきがけ）が出なくなる。
      if (early) { Q.ldp_wareme = 1; }
      Q.ldp_ware_year = y;
      //  総裁が出て行く盤もある。海部俊樹は改革の側に立っていた。
      Q.ware_kaifu = (this.ldpHead(Q) === '海部俊树') ? 1 : 0;
      if (Q.ware_kaifu) {
        Q.jimin_head_name = '宫泽喜一';
        Q.jimin_head_from = y;
        Q.jimin_head_until = 1993;
      }
      //  出て行った側は自民と切れる。こちらとの距離は事象の選択が決める。
      Q.rel_jimin = (Q.rel_jimin || 0) - 10;
      return take;
    },

    //  一九九三年の分裂。中身は早い割れと同じで、印だけ立てない。
    splitLDP1993: function (Q) { return this.splitLDPNow(Q, false); },

    //  参院の定数。社会党の数は seats_hc（runHCElection の式）、他党は hc_*（hcElectOthers。D2）。
    HC_TOTAL: 252,

    // ── 参院の他党（D2、駕駛員の決め 2026-09-25「选C」） ────────────────
    //  D1 までは hcBreakdown が、社会党の seats_hc を除いた残りを衆院の得票率で他党に割っていた。
    //  参院選だけでなく総選挙のたびにも割り直していた。そのため自民は参院でも衆院の得票率の分しか
    //  取れず（N7・D1 の盤で 86〜111。史実は一九六〇〜八〇年代に 124〜143）、改憲の側（自民・民社・
    //  その他の半分）は参院の三分の二（168）に一度も届かず、相手の改憲はいつも参院で止まっていた。
    //  いまは参院の二つの区の性質を入れ、他党も社会党と同じく半数ずつ改選する。
    //    地方区  改選の地方区から社会党の当選（hc_chihou）を引いた残りを、得票率の E 乗に党ごとの重み
    //            CHIHOU を掛けて配る。一人区が多いので、E 乗で大きい党（自民）が太り、小さい党が痩せる。
    //    全国区  五十から社会党の当選（hc_zenkoku）を引いた残りを、得票率に党ごとの重み ZENKOKU を掛けて
    //            配る（八三年からの比例代表も同じ）。組織票の厚い公明（創価学会）は重く、自民は軽い。
    //            公明は衆院に出る前（一九六二・六五年）から全国区で取っていたので、得票率が KOMEI_ORG を
    //            割るときは KOMEI_ORG で数える。
    //    非改選  前回の当選（hcw_*）がそのまま残る。総選挙では参院を割り直さない。
    //  社会党の数はこれまでどおり runHCElection の式で決まり、他党はその残りを分ける。
    //  重みは、史実の入力（衆院の得票率を参院選の日付へ寄せたもの・社会党の当選）で史実の構成を
    //  なぞるように決めた（audit5 の 4c 節。一九八九・九二年は外れる。AUDIT の D2 を見よ）。
    //  公明党ができる（komei_exists）までは、創価学会系の議員（hc_soka）を「その他」に入れて見せる。
    HC_OTHERS: {
      P: ['jimin', 'minsha', 'komei', 'kyosan', 'other'],
      E: 1.4,
      CHIHOU:  { jimin: 1.2,  minsha: 0.7, komei: 0.8, kyosan: 0.5, other: 1.2 },
      ZENKOKU: { jimin: 0.85, minsha: 1.0, komei: 1.7, kyosan: 1.0, other: 0.8 },
      KOMEI_ORG: 10, KOMEI_FROM: 1962
    },
    //  史実の参院の他党。c は選挙のあとの構成、w はその回の当選（次の回の非改選）。並びは HC_OTHERS.P
    //  （自民・民社・公明・共産・その他）。社会党は HIST_HC。その他は 252 から社会党と四党を引いた残り。
    //  一九五九年の公明は創価学会系の無所属。自民・社会の他は、手元の記録で二、三議席の揺れがありうる。
    //  root の初期値（一九五九年）と砂場の始まり（hcHistStart）と audit5 の 4c 節が読む。
    HIST_HC_OTHERS: {
      1959: { c: [132, 0, 9, 3, 23],   w: [71, 0, 6, 1, 9] },
      1962: { c: [142, 11, 15, 4, 14], w: [69, 4, 9, 3, 5] },
      1965: { c: [140, 7, 20, 4, 8],   w: [71, 3, 11, 3, 3] },
      1968: { c: [137, 10, 24, 7, 9],  w: [69, 7, 13, 4, 5] },
      1971: { c: [131, 13, 23, 10, 9], w: [63, 6, 10, 6, 2] },
      1974: { c: [126, 10, 24, 20, 10], w: [62, 5, 14, 13, 7] },
      1977: { c: [124, 11, 28, 16, 17], w: [63, 6, 14, 5, 11] },
      1980: { c: [135, 12, 26, 12, 20], w: [69, 6, 12, 7, 10] },
      1983: { c: [137, 12, 27, 14, 18], w: [68, 6, 14, 7, 9] },
      1986: { c: [143, 12, 25, 16, 14], w: [72, 5, 10, 9, 10] },
      1989: { c: [109, 8, 21, 14, 34],  w: [36, 3, 10, 5, 26] },
      1992: { c: [107, 7, 24, 11, 32],  w: [68, 4, 14, 6, 13] }
    },
    //  n 議席を重み w で配る（最大剰余。同点は P の並び順）
    hcAllot: function (n, w, P) {
      var o = {}, tot = 0, got = 0, rem = [], i, x;
      for (i = 0; i < P.length; i++) { o[P[i]] = 0; tot += Math.max(0, w[P[i]] || 0); }
      if (n <= 0 || tot <= 0) { return o; }
      for (i = 0; i < P.length; i++) {
        x = n * Math.max(0, w[P[i]] || 0) / tot;
        o[P[i]] = Math.floor(x); got += o[P[i]]; rem.push([x - o[P[i]], i]);
      }
      rem.sort(function (a, b) { return (b[0] - a[0]) || (a[1] - b[1]); });
      for (i = 0; i < n - got; i++) { o[P[rem[i % rem.length][1]]] += 1; }
      return o;
    },
    //  その党の非改選（前回の当選）。D2 より前の控えには無いので、いまの構成の半分とみなす
    hcNonup: function (Q, p) {
      var v = Q['hcw_' + p];
      if (typeof v === 'number') { return Math.max(0, v); }
      var soka = Q.komei_exists ? 0 : (Q.hc_soka || 0);
      var cur = p === 'komei' ? (Q.hc_komei || 0) + soka : (Q['hc_' + p] || 0) - (p === 'other' ? soka : 0);
      return Math.round(Math.max(0, cur) / 2);
    },
    //  参院選で他党の当選を決め、非改選と足して構成を書く（runHCElection から。社会党の当選は先に決まっている）
    hcElectOthers: function (Q, year, share) {
      var H = this.HC_OTHERS, P = H.P, up = this.hcSeatsUp(year), i, p, s = {}, wc = {}, wz = {}, comp = {};
      var C = Math.max(0, up.chihou - (Q.hc_chihou || 0)), Z = Math.max(0, up.zenkoku - (Q.hc_zenkoku || 0));
      for (i = 0; i < P.length; i++) { p = P[i]; s[p] = Math.max(0, (share && share[p]) || 0); }
      if (year >= H.KOMEI_FROM) { s.komei = Math.max(s.komei, H.KOMEI_ORG); }
      for (i = 0; i < P.length; i++) {
        p = P[i];
        wc[p] = (H.CHIHOU[p] || 0) * Math.pow(s[p], H.E);
        wz[p] = (H.ZENKOKU[p] || 0) * s[p];
      }
      var c = this.hcAllot(C, wc, P), z = this.hcAllot(Z, wz, P);
      for (i = 0; i < P.length; i++) {
        p = P[i];
        comp[p] = this.hcNonup(Q, p) + c[p] + z[p];
        Q['hcw_' + p] = c[p] + z[p];
      }
      this.hcShow(Q, comp);
      return Q;
    },
    //  構成（公明を分けた数）を画面の hc_* にする。公明党ができるまでは創価学会系を「その他」に入れる。
    //  定数との差（改選 125 の年は 250 にしかならない、など）は「その他」で吸う。足りなければ比で詰める。
    hcShow: function (Q, comp) {
      var T = this.HC_TOTAL, mine = clamp(Q.seats_hc || 0, 0, T), kin = !!Q.komei_exists;
      Q.hc_jimin = comp.jimin || 0;
      Q.hc_minsha = comp.minsha || 0;
      Q.hc_kyosan = comp.kyosan || 0;
      Q.hc_komei = kin ? (comp.komei || 0) : 0;
      Q.hc_soka = kin ? 0 : (comp.komei || 0);
      Q.hc_other = (comp.other || 0) + Q.hc_soka;
      Q.hc_shakai = mine;
      var r = T - mine - (Q.hc_jimin + Q.hc_minsha + Q.hc_komei + Q.hc_kyosan + Q.hc_other);
      if (r > 0) { Q.hc_other += r; }
      else if (r < 0) { this.hcFit(Q); }
      return Q;
    },
    //  社会党の seats_hc が参院選の外で動いたとき（一九八九年の頁・事象・合同）、他党の数を比で詰めて
    //  定数に合わせる。非改選の控え（hcw_*）はここでは動かさない。控えのやりとりは hcCredit（D3）と
    //  合同（mergeKyosan・mergeMinshu）が受け持つので、次の参院選のあとも定数どおりになる
    hcFit: function (Q) {
      var P = this.HC_OTHERS.P, T = this.HC_TOTAL, target = T - clamp(Q.seats_hc || 0, 0, T), sum = 0, i, w = {};
      for (i = 0; i < P.length; i++) { w[P[i]] = Math.max(0, Q['hc_' + P[i]] || 0); sum += w[P[i]]; }
      if (sum === target) { return Q; }
      if (sum <= 0) { Q.hc_other = target; return Q; }
      var o = this.hcAllot(target, w, P), so = w.other;
      if ((Q.hc_soka || 0) > 0) { Q.hc_soka = so > 0 ? Math.min(o.other, Math.round(Q.hc_soka * o.other / so)) : 0; }
      for (i = 0; i < P.length; i++) { Q['hc_' + P[i]] = o[P[i]]; }
      return Q;
    },
    //  refresh から毎回：公明党ができたら創価学会系を「その他」から公明へ移し、定数に合わせる
    hcSync: function (Q) {
      //  社会党の参院が参院選の外で、hcGain を通らずに動いたとき（事象の fx が seats_hc を直接足す。
      //  一九九〇年の「参院選の大勝」など）は、その回の当選に数える（hcCredit。D3）。
      //  印（hc_mine_seen）が無い盤（新しい局・D3 より前の控え）では、いまの数を印にするだけ
      var mine = clamp(Q.seats_hc || 0, 0, this.HC_TOTAL);
      if (typeof Q.hc_mine_seen !== 'number') { Q.hc_mine_seen = mine; }
      else if (mine !== Q.hc_mine_seen) { this.hcCredit(Q, mine - Q.hc_mine_seen); Q.hc_mine_seen = mine; }
      if (Q.komei_exists && (Q.hc_soka || 0) > 0) {
        var s = Math.min(Q.hc_soka, Q.hc_other || 0);
        Q.hc_komei = (Q.hc_komei || 0) + s;
        Q.hc_other = (Q.hc_other || 0) - s;
        Q.hc_soka = 0;
      }
      this.hcFit(Q);
      Q.hc_shakai = clamp(Q.seats_hc || 0, 0, this.HC_TOTAL);
      return Q;
    },
    //  砂場：始める年より前の最後の参院選の史実の構成と当選を置く。社会党も史実のその回の構成
    //  （HIST_HC）と当選（HIST_HC_WON）にする（D3。前は root の 85 のままで、他党が残りに詰まっていた）
    hcHistStart: function (Q, year) {
      var H = this.HIST_HC_OTHERS, P = this.HC_OTHERS.P, y, best = 0, i, comp = {};
      for (y in H) { if (H.hasOwnProperty(y) && Number(y) < year && Number(y) > best) { best = Number(y); } }
      if (!best) { return Q; }
      if (this.HIST_HC[best] !== undefined && this.HIST_HC_WON[best]) {
        Q.seats_hc = this.HIST_HC[best];
        Q.hc_last_won = this.HIST_HC_WON[best][0] + this.HIST_HC_WON[best][1];
        Q.hc_shakai = Q.seats_hc;
        Q.hc_mine_seen = Q.seats_hc;
      }
      for (i = 0; i < P.length; i++) { comp[P[i]] = H[best].c[i]; Q['hcw_' + P[i]] = H[best].w[i]; }
      //  まだ無い党（民社が割れていない盤）の分は「その他」へ
      if (!Q.minsha_exists) { comp.other += comp.minsha; comp.minsha = 0; Q.hcw_other += Q.hcw_minsha; Q.hcw_minsha = 0; }
      this.hcShow(Q, comp);
      this.hcFit(Q);
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  参院
    //
    //  三年ごとに半数を改選する。以前は参院を衆院の得票率から
    //  一本の式で出していた（share/100 × 252 × 1.25）ので、
    //  参院は盤面の一部ではなく衆院の影だった。
    //  実際には性質の違う二つの区で出来ている。
    //
    //   地方区（七十六）　定数一〜四。一人区が多く、小さい党は落ちる。
    //   全国区（五十）　　全国が一つの区。名前と組織票で決まる。
    //                    八三年から拘束名簿式の比例代表になるが、
    //                    組織票で決まるという性質は変わらない。
    //
    //  社会党が参院で衆院より高く出ていたのは、全国区に労組の
    //  推薦名簿があったからである。だから組織が痩せると、
    //  参院のほうが先に落ちる ── 一九八〇年代がそれである。
    // ══════════════════════════════════════════════════════════
    HC_YEARS: [1962, 1965, 1968, 1971, 1974, 1977, 1980, 1983, 1986, 1989, 1992],
    //  史実の社会党の参院議席（その選挙のあとの総数）
    HIST_HC: { 1959: 85, 1962: 66, 1965: 73, 1968: 65, 1971: 66, 1974: 62,
               1977: 56, 1980: 47, 1983: 44, 1986: 42, 1989: 66, 1992: 71 },
    //  史実の社会党のその回の当選 [地方区, 全国区（八三年からは比例代表）]。
    //  砂場の始まり（hcHistStart）と audit5 の 4c 節（史実の入力でなぞる）が読む（D3）。
    //  一九五九年の当選 38 は root の hc_last_won と同じ。
    HIST_HC_WON: { 1959: [21, 17], 1962: [22, 15], 1965: [24, 12], 1968: [16, 12], 1971: [28, 11],
                   1974: [18, 10], 1977: [17, 10], 1980: [13, 9], 1983: [13, 9], 1986: [11, 9],
                   1989: [26, 20], 1992: [12, 10] },
    //  改選数。七一年に定数が二五〇→二五二になる
    hcSeatsUp: function (year) {
      var n = (year >= 1971) ? 126 : 125;
      return { chihou: n - 50, zenkoku: 50, total: n };
    },

    // ── 社会党の当選の式（D3、駕駛員の決め 2026-09-25「没问题」） ──────────
    //    地方区  改選の地方区 × 得票率 × CHIHOU
    //    全国区  五十 × 得票率 × （ZK_BASE ＋ ZK_ORG × 組織票の厚み）
    //  どちらも参院選の頁の手（名士・名簿・一人区）で 1 ＋ 上乗せ を掛ける。
    //  D2 までは全国区が 1 ＋ 0.9 × 厚み で、開幕の厚み 0.5 なら得票率の 1.45 倍を取っていた。
    //  史実の社会党の全国区は、衆院の得票率とほぼ同じ割合しか取っていない（一九六二〜八六年、
    //  全国区の議席 ÷（五十 × 得票率）は 0.85〜1.07、平均 0.95）。そのため史実の得票率を入れても
    //  一九八三年の全国区が 14（史実 9）になり、史実に近い打ち手の盤（idle）で一九八〇〜八六年の
    //  参院が 59〜63（史実 42〜47）、得票の多い盤（cards）で 81〜84 あった。
    //  いまは厚み 0.45 でちょうど得票率どおり（係数 1.0）になるようにし、厚みの効きを半分近くにした
    //  （厚み 0.3 で 0.925、0.6 で 1.075）。開票の頁の「厚み 45% 未満では、全国区で取れる数が衆院の
    //  得票率から期待される数に届かなくなった」という文もこれで盤と合う。地方区は変えていない。
    //  史実の入力でなぞった表は audit5 の 4c 節と AUDIT の D3 にある。
    HC_JSP: { CHIHOU: 0.92, ZK_BASE: 0.775, ZK_ORG: 0.5 },
    //  社会党のその回の当選。share は得票率（0..1）、org は組織票の厚み（0..1）、
    //  pc・pz は参院選の頁の手の上乗せ（地方区・全国区）。盤は触らない（audit5 の 4c 節も呼ぶ）
    hcJspWon: function (year, share, org, pc, pz) {
      var up = this.hcSeatsUp(year), K = this.HC_JSP;
      var chihou = Math.round(up.chihou * share * K.CHIHOU * (1 + (pc || 0)));
      var zenkoku = Math.round(up.zenkoku * share * (K.ZK_BASE + K.ZK_ORG * org) * (1 + (pz || 0)));
      return { chihou: clamp(chihou, 0, up.chihou), zenkoku: clamp(zenkoku, 0, up.zenkoku) };
    },
    //  一九八九年の頁（act5.madonna_1989）で上乗せする参院の議席。その回の当選に数える（hcGain）。
    //  ride は条件が揃って波に乗ったとき。史実の入力で式が出す一九八九年の当選（27）に足して
    //  史実の 46（構成 66）になる数にした（D3。前は 25 で、式の下げと合わせると構成 72 になる）。
    //  weak は揃わずに乗ったとき、steady は手堅くやったとき（どちらも前のまま）。
    MADONNA_HC: { ride: 19, weak: 5, steady: 10 },

    //  参院選の外で社会党の参院が増えたとき（一九八九年の頁・事象・砂場の下駄）。
    //  増えた分はその回（直前の参院選）の当選に数え、次の参院選でも非改選として残す（hc_last_won）。
    //  同じ数を他党のその回の当選（hcw_*）から比で引く。前回の当選の合計は改選の数のまま変わらない
    //  ので、次の参院選のあとも定数 252 になる。cap は上限（前の頁の書き方 Math.min(126, …) と同じ）。
    //  前は seats_hc だけを足していたので、一九八九年の上乗せも合同で来た議員も次の参院選で消えていた（D3）
    hcGain: function (Q, n, cap) {
      var now = Q.seats_hc || 0, top = Math.min(cap || this.HC_TOTAL, this.HC_TOTAL);
      var g = Math.max(0, Math.min(n || 0, top - now));
      Q.seats_hc = now + g;
      this.hcCredit(Q, g);
      Q.hc_mine_seen = Q.seats_hc;
      this.hcSync(Q);
      return g;
    },
    //  g 議席を社会党のその回の当選へ移す（他党のその回の当選から比で引く）。g が負なら控えを詰めるだけ
    hcCredit: function (Q, g) {
      var last = (typeof Q.hc_last_won === 'number') ? Q.hc_last_won : 0;
      if (g < 0) { Q.hc_last_won = Math.max(0, Math.min(last, Q.seats_hc || 0)); return Q; }
      if (!g) { return Q; }
      var P = this.HC_OTHERS.P, w = {}, tot = 0, i, cut;
      for (i = 0; i < P.length; i++) { w[P[i]] = this.hcNonup(Q, P[i]); tot += w[P[i]]; }
      cut = this.hcAllot(Math.min(g, tot), w, P);
      for (i = 0; i < P.length; i++) { Q['hcw_' + P[i]] = w[P[i]] - cut[P[i]]; }
      Q.hc_last_won = last + g;
      return Q;
    },

    //  組織票の厚み（0..1）。全国区はここで決まる。
    //  開幕の総評五五・同盟〇でおよそ 0.5。
    hcOrgVote: function (Q) {
      var p = this.unionPower(Q).total;
      //  一九八九年に総評と同盟が畳まれる。連合・全労協との関係をまだ
      //  結んでいない盤では unionPower が 0 を返し、全国区が消える。
      //  そこまで落ちないよう、総評との関係から下限を置く。
      var floor = Math.max(0, Q.rel_sohyo || 0) / 100 * 0.35;
      return clamp(Math.max(p / 900, floor), 0, 1);
    },

    //  参院選を執行する。半数改選なので、前回の当選分はそのまま残る。
    runHCElection: function (Q, year) {
      var sh = this.tally(Q).shakai / 100;
      var org = this.hcOrgVote(Q);
      //  比例代表は八三年から。名簿の順で決まるので、党の名前が効く
      var meibo = (year >= 1983) ? 1 : 0;
      //  地方区は一人区で小さい党が落ちるので得票率より低く出る。全国区は労組の推薦名簿の厚みで
      //  上下する（hcJspWon。係数は D3 で史実に合わせた）
      var jw = this.hcJspWon(year, sh, org, Q.hc_chihou_push || 0, Q.hc_zenkoku_push || 0);
      var chihou = jw.chihou, zenkoku = jw.zenkoku;
      var won = chihou + zenkoku;
      Q.hc_chihou = chihou;
      Q.hc_zenkoku = zenkoku;
      Q.hc_won = won;
      Q.hc_meibo = meibo;
      Q.hc_org_pct = Math.round(org * 100);
      Q.hc_prev = Q.seats_hc || 0;
      //  非改選は前回の当選分。ここを持っていないと半数改選にならない
      Q.seats_hc = clamp((Q.hc_last_won === undefined ? 47 : Q.hc_last_won) + won,
                         0, this.HC_TOTAL);
      Q.hc_last_won = won;
      //  参院選の外での増減を見張る印（hcSync）。ここで決めた数は増減に数えない（D3）
      Q.hc_mine_seen = Q.seats_hc;
      //  選挙の前の自民の参院（一九八九年の頁が「過半数を割った」かを盤で出し分ける。D3）
      Q.hc_jimin_prev = Q.hc_jimin || 0;
      Q.hc_diff = Q.seats_hc - Q.hc_prev;
      //  開票の頁は増減を符号なしで出す（N5 の手直し）：1 増えた・2 減った・0 増減なし
      Q.hc_diff_dir = Q.hc_diff > 0 ? 1 : (Q.hc_diff < 0 ? 2 : 0);
      Q.hc_diff_abs = Math.abs(Q.hc_diff);
      Q.hc_year = year;
      Q.hist_hc = this.HIST_HC[year] || 0;
      //  開票の頁の「史実のこの回」。hist_hc は refresh の finalScore が幕の史実の値で書き直すので、別の名で持つ（D2）
      Q.hc_hist = Q.hist_hc;
      Q.hc_chihou_push = 0; Q.hc_zenkoku_push = 0;
      //  他党の当選と構成（D2。前は hcBreakdown が衆院の得票率で残りを割っていた）
      this.hcElectOthers(Q, year, this.allocate(Q).share);
      //  参院の過半（一二七）を野党で越えているか
      Q.hc_majority_line = Math.floor(this.HC_TOTAL / 2) + 1;
      this.tallyCounter(Q, 'hc');
      this.tallyCounter(Q, 'name');
      this.refresh(Q);
      return Q;
    },

    //  選挙の控え。一行につき
    //    年:社会:自民:民社:公明:共産:その他:定数:史実:参院
    //  控え（getExportableState）に乗せるので、配列ではなく文字列で持つ。
    //  十二回しか無いので長さは知れている。
    //  史実の議席。以前は election.scene.dry が runElection の**あと**で
    //  立てていたので、控えには一回前の値が入っていた
    //  （一九六三年の行に一九六〇年の 145、一九九三年の行に一九九〇年の 136）。
    //  表をこちらへ移し、控えを書く前に立てる。
    HIST_HR: { 1960: 145, 1963: 144, 1967: 140, 1969: 90, 1972: 118, 1976: 123,
               1979: 107, 1980: 107, 1983: 112, 1986: 85, 1990: 136, 1993: 70 },

    //  投票日の月。暦をここへ合わせる（局面の目印と同じ日）
    HR_MONTH: { 1960: 11, 1963: 11, 1967: 1, 1969: 12, 1972: 12, 1976: 12,
                1979: 10, 1980: 6, 1983: 12, 1986: 7, 1990: 2, 1993: 7 },

    logElection: function (Q, year) {
      //  末尾に新党の合計を足す。前の控えには無いが、
      //  読む側は無ければ 0 として扱うので古い控えもそのまま読める。
      var row = [year, Q.res_shakai || 0, Q.res_jimin || 0, Q.res_minsha || 0,
                 Q.res_komei || 0, Q.res_kyosan || 0, Q.res_other || 0,
                 Q.hr_total || 511, Q.hist_seats || 0, Q.seats_hc || 0,
                 Q.splinter_seats || 0].join(':');
      var log = String(Q.elec_log || '');
      //  同じ年を二度書かない（控えを読み直して選挙をやり直したとき）
      var keep = log ? log.split('|').filter(function (x) {
        return x && Number(x.split(':')[0]) !== year;
      }) : [];
      keep.push(row);
      Q.elec_log = keep.join('|');
      Q.elec_n = keep.length;
      return Q;
    },

    runElection: function (Q, year) {
      //  暦を後ろへ戻さない。選挙は年の目印であって、時間の巻き戻しではない。
      this.setDate(Q, year, this.HR_MONTH[year] || 12);
      //  新しい国会。改憲の挿話で今期に引き離した分と「今期は止めた」を戻す。
      //  審議中の発議は解散で消える（kaiken_dropped）。末尾の refresh が新しい数で数え直す。
      Q.kaiken_term_used = 0; Q.kaiken_blocked = 0;
      Q.kk_komei_out = 0; Q.kk_minsha_out = 0; Q.kk_float_out = 0; Q.kaiken_withdrawn = 0;
      //  参院と国民投票は衆院の採決と同じ手のうちに済むので、選挙のときに残っていることは無い（念のため戻す。D1）
      Q.kaiken_stage = 0; Q.kk_ref_chosen = 0; Q.kk_ref_base = -1;
      if ((Q.kaiken_ep || 0) > 0) {
        Q.kaiken_ep = 0; Q.kaiken_page = 0; Q.pending_kaiken = 0; Q.kaiken_dropped = 1;
        //  危機の帯から「改憲の発議」の行を外す（ほかの理由が無ければ平時に戻る）
        this.crisisRecheck(Q);
      }
      //  事象で積んだ候補者の当て（nom_bonus）が、選挙のときに実際の
      //  擁立数になる。この値は五十二か所で書かれていたのに、
      //  どこからも読まれていなかった ── 新人を擁立しても盤面が動かない。
      if (Q.nom_bonus) {
        Q.nom_bonus_used = Q.nom_bonus;
        Q.kouho = (Q.kouho || this.NOM_OPEN) + Math.round(Q.nom_bonus * 7);
        Q.nom_bonus = 0;
      } else { Q.nom_bonus_used = 0; }
      var r = this.allocate(Q);
      //  立てていない選挙区は取れない。得票率が生む議席を、
      //  擁立数の天井で切る（nomCeiling）。切った分は他党へ回す。
      //  結果は res_ で持つ。nom_ のほうは refresh が持つ「次の見込み」で、
      //  runElection の最後の refresh がそれを上書きしてしまうため
      //  （実測で、選挙の頁に次回の天井が出ていた）。
      var nc = this.nomCeiling(Q, r.share.shakai);
      Q.res_kouho = nc.kouho;
      Q.res_nom_ratio = nc.ratio;
      Q.res_nom_win = Math.round(nc.win * 100);
      Q.res_nom_cap = nc.cap;
      //  取りこぼしの理由を控える（選挙の頁が読む）。議席の算術はこの下のまま。
      var nv = this.nomVerdict(Q, r.share.shakai, r.seats.shakai, nc.kouho);
      Q.res_vote_seats = nv.vote; Q.res_nom_best_k = nv.best_k; Q.res_nom_best = nv.best;
      Q.res_nom_fix = nv.fix; Q.res_nom_cause = nv.cause;
      Q.res_nom_bonus_k = Math.round((Q.nom_bonus_used || 0) * 7);
      Q.res_nom_bonus_abs = Math.abs(Q.res_nom_bonus_k);
      Q.nom_effect = Q.res_nom_win;      // 表示の名前は据え置く
      Q.res_nom_lost = 0;
      if (r.seats.shakai > nc.cap) {
        var diff = r.seats.shakai - nc.cap;
        Q.res_nom_lost = diff;
        r.seats.shakai = nc.cap;
        r.seats.jimin += Math.round(diff * 0.5);
        r.seats.other += diff - Math.round(diff * 0.5);
      }
      this.tallyCounter(Q, 'hr');
      this.tallyCounter(Q, 'name');   // 総選挙は党がいちばん人目に触れる機会である
      Q.prev_seats = Q.seats_hr;
      Q.seats_hr = r.seats.shakai;
      Q.res_jimin = r.seats.jimin;
      Q.res_shakai = r.seats.shakai;
      Q.res_minsha = r.seats.minsha;
      Q.res_komei = r.seats.komei;
      Q.res_kyosan = r.seats.kyosan;
      Q.res_other = r.seats.other;
      Q.sh_shakai = this.pct(r.share.shakai);
      Q.sh_jimin = this.pct(r.share.jimin);
      Q.sh_minsha = this.pct(r.share.minsha);
      Q.sh_komei = this.pct(r.share.komei);
      Q.elec_year = year;
      Q.majority_line = Math.floor(Q.hr_total / 2) + 1;
      Q.won_majority = (Q.seats_hr >= Q.majority_line) ? 1 : 0;
      if (Q.won_majority) { Q.won_majority_ever = 1; }
      // 議席の変動を派閥へ按分する（議員が減れば派閥も減る）
      var tot = Q.seat_uha + Q.seat_chuu + Q.seat_chusa + Q.seat_muha + (Q.seat_saha || 0);
      if (tot > 0) {
        var k = Q.seats_hr / tot;
        Q.seat_uha = Math.round(Q.seat_uha * k);
        Q.seat_chuu = Math.round(Q.seat_chuu * k);
        Q.seat_chusa = Math.round(Q.seat_chusa * k);
        Q.seat_muha = Math.round(Q.seat_muha * k);
        if (Q.seat_saha) { Q.seat_saha = Math.round(Q.seat_saha * k); }
      }
      //  大会は千人で開き直す（比率は保つ）
      this.normDelegates(Q);
      // 一九八〇年 ── 大平首相の急死による弔い合戦。自民が圧勝した。
      // 社会党は 107 で前回と同じ。伸びた分は中小政党から取られている。
      if (year === 1980) {
        var grab = 0, p2, small = ['komei', 'kyosan', 'other', 'minsha'];
        for (var m = 0; m < small.length; m++) {
          p2 = small[m];
          var take = Math.round(Q['res_' + p2] * 0.12);
          Q['res_' + p2] -= take; grab += take;
        }
        Q.res_jimin += grab;
        Q.tomurai = 1;
      }
      //  ── 参院 ────────────────────────────────────────────
      //  参院は参院選（runHCElection）が持つ。総選挙では社会党も他党も触らない。
      //  以前はここで share から一本の式で社会党の参院を作っていたので、参院が衆院の影になっていた。
      //  D1 までは他党の内訳（hcBreakdown）もここで衆院の得票率から割り直していた（D2 で外した）。
      //  史実の値は控えより先に立てる
      Q.hist_seats = this.HIST_HR[year] || 0;
      //  一九九三年、自民党が割れる。割れる**大きさ**は
      //  こちらが三十四年で積み上げたもので決まる（ldpSplitSize）。
      //  以前は 68 の決め打ちで、終局が盤に応えていなかった。
      if (year >= 1993 && !Q.ldp_split_done) { this.splitLDP1993(Q); }
      //  新党を母党の議席から切り出す（戻る年を過ぎていたら畳む）
      this.seedSplinters(Q, year);
      this.applySplinters(Q, year);
      //  ※ 切り出しは必ず logElection より前。あとにすると、控えに
      //  切り出す前の res_jimin と、一回前の splinter_seats が入る。
      //  （実測で 527/511 のように定数を超えた。）
      //  選挙の控え。図表はこれを読む。控えに乗るので文字列で持つ。
      this.logElection(Q, year);
      //  数えるだけ。組むかどうかは組閣の頁で決める。
      this.cabinetPre(Q);
      //  選挙が済むと擁立数は目減りする（落ちた候補は次に立たない）。
      //  党員と自治体で決まる床までは、放っておいても戻る。
      var fl = this.nomFloor(Q);
      Q.kouho = (Q.kouho || this.NOM_OPEN) > fl
        ? Math.max(fl, Math.round((Q.kouho || this.NOM_OPEN) * 0.94))
        : Math.min(fl, (Q.kouho || this.NOM_OPEN) + 6);
      Q.nomination = 0;
      //  解散で打った一回は別枠なので、予定の総選挙の番号は進めない。
      //  進めると幕の中の総選挙が一回減る。
      if (!Q.snap_election) { Q.next_election_idx = (Q.next_election_idx || 0) + 1; }
      this.refresh(Q);
      return r;
    },


    // ══════════════════════════════════════════════════════════
    //  地方盤。基礎得票率は外盤から派生させる ── 都市ごとに要るのは
    //  「その市の階層構成」だけで、傾向値は中央の行列を使い回す。
    //  だから中央でやったことが、その日のうちに市長選の情勢に出る。
    // ══════════════════════════════════════════════════════════
    //  都市の階層構成は、全国の人口階層表からその年の値を取り、
    //  都市ごとの「傾き」を掛けて出す。固定表ではない ──
    //  三十四年で農村は三十%から七%になり、新中間層は十四%から三十六%になる。
    //  一九六三年の横浜と一九八三年の横浜は、別の街である。
    CITIES: {
      yokohama: { name: '横滨市', year: 1963, incumbent: 1.10,
        tilt: { kokorou: 1.36, minrou: 1.79, mishoshiki: 1.28, jieigyo: 0.98, noson: 0.18, shinchukan: 1.04 } },
      tokyo: { name: '东京都', year: 1967, incumbent: 1.14,
        tilt: { kokorou: 1.63, minrou: 1.14, mishoshiki: 1.38, jieigyo: 1.10, noson: 0.09, shinchukan: 1.23 } },
      kyoto: { name: '京都府', year: 1966, incumbent: 0.86,
        tilt: { kokorou: 1.50, minrou: 1.30, mishoshiki: 1.18, jieigyo: 1.46, noson: 0.44, shinchukan: 0.71 } },
      //  ── 残り五都市（第Ⅱ〜Ⅳ幕の事象として出る） ──────────────
      osaka: { name: '大阪府', year: 1971, incumbent: 1.05,
        tilt: { kokorou: 1.22, minrou: 1.95, mishoshiki: 1.33, jieigyo: 1.34, noson: 0.18, shinchukan: 0.66 } },
      hiroshima: { name: '广岛市', year: 1967, incumbent: 1.00,
        tilt: { kokorou: 1.50, minrou: 1.79, mishoshiki: 1.18, jieigyo: 1.16, noson: 0.22, shinchukan: 0.90 } },
      nagasaki: { name: '长崎市', year: 1971, incumbent: 1.10,
        tilt: { kokorou: 1.36, minrou: 1.95, mishoshiki: 1.13, jieigyo: 1.34, noson: 0.27, shinchukan: 0.71 } },
      aichi: { name: '爱知县', year: 1975, incumbent: 1.15,
        tilt: { kokorou: 1.09, minrou: 2.43, mishoshiki: 0.99, jieigyo: 1.10, noson: 0.53, shinchukan: 0.57 } },
      hokkaido: { name: '北海道', year: 1983, incumbent: 0.95,
        tilt: { kokorou: 1.90, minrou: 1.14, mishoshiki: 0.99, jieigyo: 1.04, noson: 1.06, shinchukan: 0.52 } }
    },

    //  いま持っている自治体の名前。CITIES の表から作る。
    //  以前は場面ごとに京都・横浜・東京の三つを条件で並べていたので、
    //  大阪から先を取っても名前が出ず、数（local_n）と食い違っていた。
    localNames: function (Q) {
      var c, out = [];
      for (c in this.CITIES) {
        if (this.CITIES.hasOwnProperty(c) && Q['local_' + c]) { out.push(this.CITIES[c].name); }
      }
      return out.length ? out.join('・') : '没有';
    },

    //  その年・その都市の階層構成。全国表 × 傾き、合計 100% に正規化。
    cityPop: function (Q, city) {
      var c = this.CITIES[city];
      if (!c) { return null; }
      var t = Math.min(1, Math.max(0, (this.yearOf(Q) - 1959) / 34));
      var out = {}, l, sum = 0, v;
      for (l in c.tilt) {
        if (!c.tilt.hasOwnProperty(l)) { continue; }
        v = (this.POP_1959[l] + (this.POP_1993[l] - this.POP_1959[l]) * t) * c.tilt[l];
        out[l] = v; sum += v;
      }
      for (l in out) {
        if (out.hasOwnProperty(l)) { out[l] = Math.round(out[l] / sum * 1000) / 10; }
      }
      return out;
    },

    //  ── 候補の立て方 ──────────────────────────────────────
    //  難しい順に、単独／社共・社公民／放任。
    //
    //   cost   金と政治資源。単独が一番重い。放任は要らない。
    //   bonus  勝ったときの即時の効き。
    //   mult   以後この自治体で打つカードの倍率。
    //   dir    以後の自治体カードがどちらへ効くか。
    //          saha  …… 福祉と公害規制が効く。財政は重くなる。
    //          chuu  …… 行財政と都市経営が効く。福祉は薄くなる。
    //
    //  単独推薦は誰の票も乗らないので当選そのものが難しい。
    //  だが取れば、その自治体は丸ごと党のものになる ──
    //  他党と分けるものが無いぶん、打てる手の幅が違う。
    //  放任は取れることもある。取れても、党の手柄にはならない。
    //   off   その型の出発点。単独は誰の票も乗らないうえに、
    //         共産党が独自候補を立てて革新票が割れる ── 大きく削られる。
    //   self  党そのものの組織と党員がどれだけ効くか。
    //         単独推薦はここだけが頼りで、そのぶん振れ幅が大きい。
    //         党員十一万・労働戦線の力が満ちていれば届く。届かなければ落ちる。
    CAND: {
      tandoku:  { off: -0.45, kyosan: 0.00, komei: 0.00, minsha: 0.00, self: 0.62,
                  budget: 9, capital: 7, bonus: 1.45, mult: 1.35, dir: '',
                  label: '社会党单独推荐' },
      sakyo:    { off: 0.00, kyosan: 0.62, komei: -0.22, minsha: -0.40, self: 0.10,
                  budget: 6, capital: 5, bonus: 1.00, mult: 1.10, dir: 'saha',
                  label: '社共推薦' },
      shakomin: { off: 0.00, kyosan: -0.48, komei: 0.46, minsha: 0.48, self: 0.10,
                  budget: 6, capital: 5, bonus: 1.00, mult: 1.10, dir: 'chuu',
                  label: '社公民推薦' },
      hounin:   { off: -0.06, kyosan: 0.22, komei: 0.18, minsha: 0.16, self: -0.10,
                  budget: 0, capital: 0, bonus: 0.30, mult: 0.45, dir: '',
                  label: '撒手不管（不出推荐）' }
    },

    //  保有している自治体の、倍率の平均。
    //  単独で取った自治体が多いほど、自治体カードは重く効く。
    //  放任で転がり込んだだけの自治体は、ほとんど効かない。
    localMult: function (Q) {
      var n = this.localCount(Q);
      if (!n) { Q.local_mult = 0; return 0; }
      var m = (Q.local_mult_sum === undefined) ? n : Q.local_mult_sum;
      Q.local_mult = Math.round(m / n * 100) / 100;
      return Q.local_mult;
    },

    //  自治体カードの向き。社共で取った自治体が多ければ福祉と公害へ、
    //  社公民で取った自治体が多ければ行財政と都市経営へ寄る。
    localDir: function (Q) {
      var d = (Q.local_dir_sum || 0);
      Q.local_dir = d > 1 ? 'saha' : (d < -1 ? 'chuu' : '');
      Q.local_dir_n = d;
      return Q.local_dir;
    },

    localTally: function (Q, city, type, budget, capital) {
      var c = this.CITIES[city];
      if (!c) { return null; }
      var pop = this.cityPop(Q, city);
      var t = this.CAND[type] || this.CAND.hounin;
      if (budget === undefined) { budget = t.budget; }
      if (capital === undefined) { capital = t.capital; }
      var base = 0, opp = 0, l, sum, j;
      for (l in pop) {
        if (!pop.hasOwnProperty(l)) { continue; }
        sum = 0;
        for (j = 0; j < PARTIES.length; j++) { sum += Q['lean_' + l + '_' + PARTIES[j]] || 0; }
        if (sum <= 0) { continue; }
        base += pop[l] * ((Q['lean_' + l + '_shakai'] || 0) / sum);
        opp += pop[l] * ((Q['lean_' + l + '_jimin'] || 0) / sum);
      }
      //  他党の票が乗る分。中央での関係値に比例する。
      var sup = 1 + (t.off || 0), k;
      for (k in t) {
        if (['label', 'budget', 'capital', 'bonus', 'mult', 'dir', 'self', 'off'].indexOf(k) >= 0) { continue; }
        if (!t.hasOwnProperty(k)) { continue; }
        sup += t[k] * ((Q['rel_' + k] || 0) / 100) * 0.9;
      }
      //  自前の力。単独推薦は党そのものの組織と党員だけが頼りで、
      //  放任は逆に、党が動かないぶん目減りする。
      var own = Math.min(1, (Q.members || 0) / 110000) * 0.55
              + Math.min(1, (Q.union_power || 0) / 460) * 0.45;
      sup += t.self * own;
      if (sup < 0.25) { sup = 0.25; }
      //  社公民の候補は保守票の一部も食う。社共は逆に固める。
      if (type === 'shakomin') { opp *= 0.90; }
      if (type === 'sakyo') { opp *= 1.03; }
      //  党が候補を出さなければ、その場で担がれた無所属が出る。
      //  争点が党派でなくなるので、保守の側の票も締まらない ──
      //  現職が疲れている街では、これで革新首長が生まれることがある。
      //  生まれても、党の手柄にはならない。
      if (type === 'hounin') { opp *= 0.86; }
      //  投入は逓減。金だけでは勝てない。
      var inv = 6 * Math.sqrt(Math.max(0, budget) / 4) + 5 * Math.sqrt(Math.max(0, capital) / 4);
      var vote = base * sup + inv;
      opp = opp * c.incumbent;
      return { base: Math.round(base * 10) / 10, sup: Math.round(sup * 100) / 100,
               inv: Math.round(inv * 10) / 10, vote: Math.round(vote * 10) / 10,
               opp: Math.round(opp * 10) / 10, win: vote > opp, name: c.name,
               label: t.label, mult: t.mult, budget: budget, capital: capital };
    },

    //  勝っても負けても外盤は動く。負けても運動は残る ── これがないと
    //  地方盤は一回きりの賽の目に退化する。
    localResolve: function (Q, city, type, budget, capital) {
      var t = this.CAND[type] || this.CAND.hounin;
      if (budget === undefined) { budget = t.budget; }
      if (capital === undefined) { capital = t.capital; }
      var r = this.localTally(Q, city, type, budget, capital);
      if (!r) { return null; }
      Q.budget -= budget;
      Q.capital -= capital;
      var pop = this.cityPop(Q, city);
      var layers = ['mishoshiki', 'shinchukan', 'minrou'];
      if (r.win) {
        Q['local_' + city] = 1;
        Q['localtype_' + city] = type;
        Q.local_mult_sum = (Q.local_mult_sum || 0) + t.mult;
        Q.local_dir_sum = (Q.local_dir_sum || 0) +
          (t.dir === 'saha' ? 1 : (t.dir === 'chuu' ? -1 : 0));
        Q.local_pop_share = (Q.local_pop_share || 0) + Math.round(pop.mishoshiki / 4);
        this.push(Q, layers, Math.round(3 * t.bonus));
        Q.capital += Math.round(2 * t.bonus);
        if (type === 'tandoku') { Q.members += 2500; }
      } else {
        this.push(Q, layers, type === 'hounin' ? 0 : 1);
      }
      //  党内と他党への跳ね返り
      if (type === 'sakyo') { Q.mood_saha -= 8; Q.mood_chuu += 6; Q.rel_kyosan += 10; Q.rel_minsha -= 8; }
      if (type === 'shakomin') { Q.mood_saha += 10; Q.mood_uha -= 6; Q.rel_komei += 8; Q.rel_minsha += 8; Q.rel_kyosan -= 10; }
      if (type === 'tandoku') { Q.mood_chusa -= 6; Q.rel_kyosan -= 4; Q.rel_minsha -= 4; }
      if (type === 'hounin') { Q.mood_chusa += 5; Q.mood_saha += 4; }
      this.localMult(Q); this.localDir(Q);
      Q.local_result = r.win ? 1 : 0;
      Q.local_vote = r.vote; Q.local_opp = r.opp;
      Q.local_base = r.base; Q.local_sup = r.sup; Q.local_name = r.name;
      Q.local_label = r.label;
      this.refresh(Q);
      return r;
    },

    //  すでに持っている自治体の改選。負ければ手放す。
    //  京都は一九五〇年から持っている ── 取る選挙ではなく、守る選挙である。
    localDefendOne: function (Q, city, type) {
      var before = Q['local_' + city] ? 1 : 0;
      var old = Q['localtype_' + city];
      if (before) {
        //  いったん外して数え直す。負ければそのまま戻らない。
        var t0 = this.CAND[old] || this.CAND.hounin;
        Q['local_' + city] = 0;
        Q.local_mult_sum = Math.max(0, (Q.local_mult_sum || 0) - t0.mult);
        Q.local_dir_sum = (Q.local_dir_sum || 0) -
          (t0.dir === 'saha' ? 1 : (t0.dir === 'chuu' ? -1 : 0));
      }
      var r = this.localResolve(Q, city, type);
      Q.local_defended = before;
      return r;
    },

    //  保有している自治体をすべて手放す。
    //  三都市だけを名指しで消していると、事象で取った五都市が残り、
    //  取り方の倍率も残ったままになる。まとめてここで消す。
    localClear: function (Q) {
      var c, n = 0;
      for (c in this.CITIES) {
        if (!this.CITIES.hasOwnProperty(c)) { continue; }
        if (Q['local_' + c]) { n += 1; }
        Q['local_' + c] = 0;
        Q['localtype_' + c] = '';
      }
      Q.local_mult_sum = 0; Q.local_dir_sum = 0;
      Q.local_pop_share = 0; Q.local_debt = 0; Q.shicho_kai = 0;
      this.localMult(Q); this.localDir(Q);
      Q.local_cleared = n;
      return n;
    },

    //  統一地方選。保有している自治体を、いまの盤面でもう一度問う。
    //  推薦の型はそのまま。守るには、取ったときと同じだけの力が要る。
    //  一九七九年に美濃部も黒田も落ちたのは、相手が強くなったからではない。
    localDefend: function (Q, budget, capital) {
      var c, kept = [], lost = [], n = this.localCount(Q);
      if (!n) { Q.defend_kept = 0; Q.defend_lost = 0; return Q; }
      var per = { budget: Math.floor((budget || 0) / n), capital: Math.floor((capital || 0) / n) };
      Q.budget -= (budget || 0); Q.capital -= (capital || 0);
      for (c in this.CITIES) {
        if (!this.CITIES.hasOwnProperty(c) || !Q['local_' + c]) { continue; }
        var type = Q['localtype_' + c] || 'hounin';
        var t = this.CAND[type] || this.CAND.hounin;
        var r = this.localTally(Q, c, type, per.budget, per.capital);
        if (r && r.win) { kept.push(this.CITIES[c].name); }
        else {
          lost.push(this.CITIES[c].name);
          Q['local_' + c] = 0;
          Q.local_mult_sum = Math.max(0, (Q.local_mult_sum || 0) - t.mult);
          Q.local_dir_sum = (Q.local_dir_sum || 0) -
            (t.dir === 'saha' ? 1 : (t.dir === 'chuu' ? -1 : 0));
        }
      }
      Q.defend_kept = kept.length; Q.defend_lost = lost.length;
      Q.defend_kept_names = kept.join('・') || '没有';
      Q.defend_lost_names = lost.join('・') || '没有';
      this.localMult(Q); this.localDir(Q);
      this.refresh(Q);
      return Q;
    },


    // ══════════════════════════════════════════════════════════
    //  勝利点と評価（N4 で組み直した）
    //
    //  勝利点 ＝（衆院の通算 ＋ 参院 ＋ 政権の段 − 分裂 − 九条 ＋ 基盤）× 路線の係数
    //    衆院の通算  これまでの総選挙の議席を、史実の値がある回だけ平均したもの。
    //                一回の山や谷ではなく、三十四年の積み上げで数える。
    //    政権の段    GOV_PTS。入っていない／入った／主導した／選挙をまたいで保った。
    //    党員        直には数えない。基盤（BASE_BY_BAND）の一部としてだけ効く。
    //                基盤の中の党員は線ごとに 85k〜130k で頭打ちなので、
    //                党員を積むだけで取れるのは基盤の三分の一までである。
    //                以前は十万人ごとに 30 点で、党員を刷るだけで勝てた。
    //  史実の線 ＝ 同じ物差しで史実の党を測った点 × 難度の上乗せ（histLine）。
    //  評価（四つの題）は政権がどこまで行ったかで決まり、勝ち負けは線を越えたかで決まる。
    //  三十四年の勝ち負けは、一九九三年まで打つか、選挙をまたいで政権を保ったときにだけ出す。
    // ══════════════════════════════════════════════════════════
    //  kaiken：九条を失った（改憲の挿話で採決を止められなかった）。一度の分裂より重い。
    //  分裂と同じく路線の係数の前で引く。局は負けにしない（駕駛員の決め、N3・N4）。
    //  local：自治体の財政負担（local_debt）1 につき引く点（D1、駕駛員の決め 2026-09-25「自治体財政負担計入勝利点」）。
    //  分裂・九条と同じく路線の係数の前で引き、LOCAL_CAP で頭を打つ（負担が暴走した局でも九条を失ったのと同じ 30 点まで）。
    //  重みは打ち手の終局の負担（D1 の盤、普通・種 1〜50。AUDIT の D1 の四の 3）から決めた：idle 中央値 0・p90 42、
    //  random 36・122、cards 19・59、cabinet 13・59、seatgreedy 143・170。負担を積み上げる局（random・seatgreedy の
    //  p90、負担 120〜170）で 12〜17 点、ふつうの局（cards・cabinet・idle の中央値）で 0〜2 点になる。
    SCORE_W: { hr: 100, hc: 40, split: -25, kaiken: -30, local: -0.1 },
    LOCAL_CAP: 30,
    //  政権の段の点。0 入っていない　1 政権に入った　2 連立を主導した（閣僚の累計 4 以上か首班）
    //  3 選挙をまたいで政権を保った（民社党化の線では衆院 MINSHA_WIN_SEATS も要る）
    GOV_PTS: [0, 25, 35, 50],
    //  史実の党の政権の段。第Ⅴ幕だけ、細川内閣の第一党・閣僚六人で「主導」。
    HIST_GOV: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2 },
    //  党の統一の目標（ck_unity）で許す分裂の回数（D1）。
    UNITY_MAX_SPLITS: 1,
    //  政権に入らずに「野党の維持」を名乗れる線。政権の点を抜いた勝利点が、
    //  政権の点を抜いた史実の線のこの割合に届いていれば維持、届かなければ喪失。
    OPP_HOLD: 0.85,
    //  各総選挙の定数。一九九三年の線（十二回ぶんの史実の平均）を出すときに使う。
    HIST_TOTAL: { 1960: 467, 1963: 467, 1967: 486, 1969: 486, 1972: 491, 1976: 511,
                  1979: 511, 1980: 511, 1983: 511, 1986: 512, 1990: 512, 1993: 511 },

    //  史実の終値（1993年）。衆院70/511、参院約70、党員約5万、
    //  分裂2（民社党・社民連）、細川内閣での閣僚6。
    HIST_FINAL: { hr: 70, hr_total: 511, hc: 70, members: 50000, splits: 2, cabinet: 6, route: -1, local: 13 },

    //  各幕の終わりにおける史実の値。プレイヤーが途中で降りたときは、
    //  一九九三年ではなく「そこまでの史実」と比べる。
    //    Ⅰ 1960総選挙 145/467・参院85     Ⅱ 1969総選挙 90/486・参院65
    //    Ⅲ 1976総選挙 123/511・参院56     Ⅳ 1983総選挙 112/511・参院44
    //    Ⅴ 1993総選挙  70/511・参院71・細川内閣で閣僚6
    //  route は、その幕で史実の党が実際に立っていた線。
    //  比較は同じ線の物差しでやらないと意味が無い ──
    //  中間右の線は易しく点も低いので、史実を中間右で測ると
    //  「史実が勝つ」ことになってしまう。
    //  local は、その幕の終わりに史実の党が抱えていたであろう自治体の財政負担（D1）。史実の自治体の
    //  出入り（京都・横浜・東京・大阪…）は事象がなぞるので、史実の筋に沿って打つ打ち手（idle・random・cards、
    //  N7 の盤、普通・種 1〜50）が幕の結算で抱えていた負担の中央値を丸めて置いた（Ⅴは終局の値）。
    HIST_ACT: {
      1: { hr: 145, hr_total: 467, hc: 85, members: 50000, splits: 1, cabinet: 0, route: -2, local: 12 },
      2: { hr: 90,  hr_total: 486, hc: 65, members: 50000, splits: 1, cabinet: 0, route: -1, local: 37 },
      3: { hr: 123, hr_total: 511, hc: 56, members: 50000, splits: 1, cabinet: 0, route: -1, local: 27 },
      4: { hr: 112, hr_total: 511, hc: 44, members: 50000, splits: 2, cabinet: 0, route: -1, local: 9 },
      5: { hr: 70,  hr_total: 511, hc: 71, members: 50000, splits: 2, cabinet: 6, route: -1, local: 13 }
    },

    // ══════════════════════════════════════════════════════════
    //  実績
    //
    //  名は史実の言葉、説明は一行の平叙文にする。
    //  盤の比喩は使わない。何をしたか、あるいは何が真になったかだけを書く。
    //  絵は game/art/ にあるもので、その実績の中身に当たるものを当てる。
    //
    //  when を持つものは checkAchievements が毎手見て渡す。
    //  持たないものは、渡す場所が決まっている（幕末・結末・全局結算）。
    //  end: true は「その局が終わったとき」にしか成り立たない条件で、
    //  endings と act_end からしか見ない。
    // ══════════════════════════════════════════════════════════
    ACH: [
      { id: 'tandoku_kahan', art: 'motif/chuo_hiroma.jpg',
        name: '单独过半', desc: '在众议院取得单独过半数。',
        when: function (Q) { return !!Q.won_majority_ever; } },
      { id: 'saikou_koushin', art: 'motif/senkyoka52.jpg',
        name: '最高纪录', desc: '超过了一九五八年的一百六十六席。',
        when: function (Q) { return (Q.seats_hr || 0) > 166; } },
      { id: 'seiken_iri', art: 'motif/sokaku.jpg',
        name: '入阁', desc: '进入了内阁。',
        when: function (Q) { return !!Q.ever_in_power || (Q.cabinet_posts_ever || 0) > 0; } },
      { id: 'shuhan', art: 'motif/honkaigi.jpg',
        name: '首班', desc: '内阁总理大臣出自社会党内。',
        when: function (Q) { return !!Q.has_souri; } },
      { id: 'nishio_nokotta', art: 'motif/minsha60.jpg',
        name: '保卫团结', desc: '民主社会党没有成立。',
        when: function (Q) { return (Q.act || 1) >= 2 && !Q.minsha_exists; } },
      { id: 'eda_nokotta', art: 'motif/ryouha50.png',
        name: '统一的铃木派', desc: '社会民主连合没有成立。',
        when: function (Q) { return (Q.act || 1) >= 4 && !Q.shamin_exists; } },
      { id: 'mada_warete_inai', art: 'motif/touitsu55.jpg',
        name: '大同团结的无产政党', desc: '没有任何派阀从党内分裂。',
        when: function (Q) { return (Q.splits || 0) === 0 && (Q.act || 1) >= 2; } },
      { id: 'hibuso_kanto', art: 'motif/kenpou.jpg',
        name: '非武装中立', desc: '始终坚持非武装中立原则。',
        end: true, when: function (Q) { return !!Q.hibuso_churitsu; } },
      { id: 'kokumin_seito', art: 'motif/shotengai.jpg',
        name: '国民政党', desc: '社会党是一个国民政党。',
        end: true, when: function (Q) { return window.JSP.bandOf(Q) === 4; } },
      { id: 'shinsayoku_orgu', art: 'events/kaihoha.jpg',
        name: '组织员', desc: '从街头招募活动家把县联的办公室都塞满了。',
        when: function (Q) { return (Q.nl_intake || 0) >= window.JSP.NL_INTAKE_MAX; } },
      { id: 'asama_no_ato', art: 'motif/yokkaichi.jpg',
        name: '反向的打入主义', desc: '跟新左翼合过手，但浅间山庄之后没有失去城市劳动者的支持。',
        when: function (Q) { return !!Q.nl_fallout_done && (Q.nl_hit || 0) >= 60 &&
                 (Q.lean_shinchukan_shakai || 0) >= 30; } },
      { id: 'kozo_kaikaku_sen', art: 'motif/danchi.jpg',
        name: '结构改革', desc: '在党内坚持江田路线。',
        when: function (Q) { return !!Q.kozo_kaikaku; } },
      { id: 'michi_saitaku', art: 'motif/ronoto28.jpg',
        name: '通向社会主义的道路', desc: '在党大会上通过了《日本走向社会主义的道路》。',
        when: function (Q) { return !!Q.michi_adopted; } },
      { id: 'sutoken', art: 'motif/miyahara.jpg',
        name: '为了罢工权', desc: '在罢工权罢工中获胜。',
        when: function (Q) { return !!Q.sutoken_won; } },
      { id: 'sayoku_toitsu', art: 'motif/sohyo_taikai.png',
        name: '劳动战线的革命统一', desc: '劳动战线在左侧完成了最终的统一。',
        when: function (Q) { return !!Q.left_unity; } },
      { id: 'zenrokyo_dachi', art: 'motif/gekkan_sohyo.png',
        name: '全劳协', desc: '在连合之外另建了一个全国工会中央组织。',
        when: function (Q) { return !!Q.zenrokyo; } },
      { id: 'kosen', art: 'motif/ryouha50.png',
        name: '党首公选', desc: '促成共产党实行党首公选，并迫使宫本显治引退。',
        when: function (Q) { return !!Q.kyosan_kaikaku; } },
      { id: 'shakyo_gassho', art: 'motif/touitsu55.jpg',
        name: '社共合同', desc: '和共产党实现了社会主义政党的统一。',
        when: function (Q) { return !!Q.kyosan_merged; } },
      //  実績の id は盤面の旗（minshu_shinto）と別の名にする。同じ名だと
      //  エンジンの achieve が旗を上書きして、結末の分岐が外れた（実測）。
      { id: 'hijimin_shinto', art: 'motif/akushu55.jpg',
        name: '非自民的统一新党', desc: '同在野党合并成了一个民主新党。',
        when: function (Q) { return !!Q.minshu_shinto; } },
      { id: 'jisha_naikaku', art: 'motif/sokaku.jpg',
        name: '自社内阁', desc: '同自民党联合执政。',
        when: function (Q) { return !!Q.jisha_cabinet; } },
      { id: 'kokumin_minshu_to', art: 'motif/minsha60.jpg',
        name: '国民民主党', desc: '社会党变成了一个由民间工会支撑的保守中道政党。',
        when: function (Q) { return !!Q.kokumin_minshu; } },
      { id: 'kakushin_jichitai', art: 'motif/minobe67.png',
        name: '革新自治体', desc: '在四个以上的自治体执政。',
        when: function (Q) {
          var n = (Q.local_kyoto || 0) + (Q.local_tokyo || 0) + (Q.local_yokohama || 0) +
                  (Q.local_osaka || 0) + (Q.local_hiroshima || 0) + (Q.local_nagasaki || 0) +
                  (Q.local_aichi || 0) + (Q.local_hokkaido || 0);
          return n >= 4;
        } },
      { id: 'yama_ga_ugoita', art: 'motif/sangiin.jpg',
        name: '地动山摇', desc: '在参议院的改选议席上超过过了自民党。',
        when: function (Q) { return !!Q.madonna; } },
      { id: 'goken_mamotta', art: 'motif/kenpou.jpg',
        name: '挡下了修宪', desc: '在众院、参院或国民投票中的某一关，挡下了对方的修宪。',
        when: function (Q) { return (Q.kaiken_block_n || 0) > 0; } },
      //  幕の目標
      { id: 'act1_pass', art: 'motif/taikai59.jpg',
        name: '第Ⅰ幕　分裂与安保', desc: '达成了到一九六〇年为止的目标。',
        end: true, when: function (Q) { return !!Q.act_pass && (Q.act || 0) === 1; } },
      { id: 'act2_pass', art: 'motif/kyodo67.jpg',
        name: '第Ⅱ幕　结构改革论争', desc: '达成了到一九六九年为止的目标。',
        end: true, when: function (Q) { return !!Q.act_pass && (Q.act || 0) === 2; } },
      { id: 'act3_pass', art: 'motif/yokkaichi.jpg',
        name: '第Ⅲ幕　死胡同', desc: '达成了到一九七七年为止的目标。',
        end: true, when: function (Q) { return !!Q.act_pass && (Q.act || 0) === 3; } },
      { id: 'act4_pass', art: 'motif/satsu.jpg',
        name: '第Ⅳ幕　向现实路线漂流', desc: '达成了到一九八五年为止的目标。',
        end: true, when: function (Q) { return !!Q.act_pass && (Q.act || 0) === 4; } },
      { id: 'act5_pass', art: 'motif/gijido52.jpg',
        name: '第Ⅴ幕　土井与崩溃', desc: '达成了到一九九三年为止的目标。',
        end: true, when: function (Q) { return !!Q.act_pass && (Q.act || 0) === 5; } },
      //  結末
      { id: 'kanso_1993', art: 'motif/toki.png',
        name: '一九九三年', desc: '恭喜你走到了最后。',
        end: true, when: function (Q) { return !!Q.ran_full; } },
      //  評価の四つの題（結末の q1〜q4 の頁が渡す）。題は評価（verdict）で決まる。
      { id: 'shori_no_shori', art: 'motif/akushu55.jpg',
        name: '夺取政权', desc: '跨过大选保住政权，或取得单独过半后结束。' },
      { id: 'shori_no_shippai', art: 'motif/saitouitsu55.jpg',
        name: '执政经验', desc: '进入过政权，但在跨过大选保住政权之前结束。' },
      { id: 'shippai_no_shori', art: 'motif/mayday49.png',
        name: '维持在野', desc: '未进入政权，但保住了接近史实的阵地后结束。' },
      { id: 'shippai_no_shippai', art: 'motif/hahaoya55.png',
        name: '失去阵地', desc: '未进入政权，也没能守住史实水平的阵地就结束了。' },
      //  三十四年の勝ちは、一九九三年まで打ったか、選挙をまたいで政権を保って
      //  早く終えたときにだけ付く。幕の終わりで降りたときは付かない。
      { id: 'zenkyoku_shori', art: 'motif/saitouitsu_taikai.png',
        name: '全局胜利', desc: '在贯穿三十四年的判定中获胜。',
        end: true, when: function (Q) { return !!Q.win_now && (!!Q.ran_full || !!Q.early_exit); } },
      { id: 'seiken_wo_tamotta', art: 'motif/sokaku.jpg',
        name: '保住了政权', desc: '取得政权后，跨过一次大选仍然守住了政权。',
        end: true, when: function (Q) { return (Q.gov_level || 0) === 3 && (!!Q.ran_full || !!Q.early_exit); } }
    ],

    //  毎手見て、条件が真になったものを渡す。
    //  E は場面のコードの中の this（DendryEngine）。無くても盤は止めない。
    checkAchievements: function (E, Q, atEnd) {
      var i, a, ok, n = 0;
      for (i = 0; i < this.ACH.length; i++) {
        a = this.ACH[i];
        if (!a.when) { continue; }
        if (a.end && !atEnd) { continue; }
        if (this.isSandbox(Q)) { break; }
        if (Q['achievement_' + a.id]) { continue; }
        ok = false;
        try { ok = !!a.when(Q); } catch (err) { ok = false; }
        if (!ok) { continue; }
        if (E && typeof E.achieve === 'function') { E.achieve(a.id); }
        else { this.award(a.id); }
        Q['achievement_' + a.id] = 1;
        n += 1;
      }
      return n;
    },

    //  実績の一覧を組む。取っていないものは薄く出す。
    //  見出しの語は ACH の中にあるので、訳は js の語の差し替えで当たる。
    achBlock: function (Q) {
      var base = (typeof window !== 'undefined' && window.JSP_ART) ? window.JSP_ART : 'art/';
      var i, a, got, s = '', done = 0;
      for (i = 0; i < this.ACH.length; i++) {
        if (Q['achievement_' + this.ACH[i].id]) { done += 1; }
      }
      s += '<p style="opacity:.6">' + done + ' / ' + this.ACH.length + '</p>';
      for (i = 0; i < this.ACH.length; i++) {
        a = this.ACH[i];
        got = !!Q['achievement_' + a.id];
        s += '<div style="display:flex;gap:.8em;align-items:center;margin:.55em 0;'
           + (got ? '' : 'opacity:.38;') + '">'
           + '<img src="' + base + a.art + '" alt="" '
           + 'style="width:82px;height:56px;object-fit:cover;flex:none;border-radius:2px;'
           + (got ? '' : 'filter:grayscale(1);') + '">'
           + '<div><b>' + a.name + '</b><br>'
           + '<span style="opacity:.75">' + a.desc + '</span></div>'
           + '</div>';
      }
      return s;
    },

    openAchievements: function () {
      try {
        var U = window.dendryUI;
        if (U && U.dendryEngine) { U.dendryEngine.goToScene('achievements'); }
      } catch (e) { /* 開けなくても盤は止めない */ }
      return false;
    },

    //  実績を渡す。エンジンが無くても進行には影響しない。
    //  砂場では実績を取らない。盤面を手で作って取れる実績には意味が無い。
    isSandbox: function (Q) {
      if (Q && Q.sandbox) { return true; }
      try {
        var st = window.dendryUI && window.dendryUI.dendryEngine
          && window.dendryUI.dendryEngine.state;
        return !!(st && st.qualities && st.qualities.sandbox);
      } catch (e) { return false; }
    },
    award: function (name) {
      try {
        if (this.isSandbox()) { return 0; }
        var e = window.dendryUI && window.dendryUI.dendryEngine;
        if (e && e.achieve) { e.achieve(name); }
      } catch (err) { return 0; }
      return 1;
    },

    // ══════════════════════════════════════════════════════════
    //  砂場（テスト用）
    //
    //  好きな幕から、好きな厚さの盤面で始める。控えを書き換えて
    //  金を足す手間を無くすためのもので、実績は一つも付かない。
    //
    //  外盤（人口・組織率・定数・他党の伸び）は年で決まるので、
    //  始める幕の頭まで一年ずつ進めてから carryOver に渡す。
    //  そうしないと一九八六年の盤に一九五八年の人口が乗る。
    // ══════════════════════════════════════════════════════════
    SANDBOX_KIT: {
      1: { budget: 10, capital: 8,  members: 45000,  seats_hr: 0 },
      2: { budget: 16, capital: 12, members: 55000,  seats_hr: 0 },
      3: { budget: 20, capital: 14, members: 65000,  seats_hr: 0 },
      4: { budget: 24, capital: 16, members: 70000,  seats_hr: 0 },
      5: { budget: 28, capital: 18, members: 75000,  seats_hr: 0 }
    },
    //  厚さ。薄い＝素の値、普通＝そのまま、厚い＝資源を積む
    SANDBOX_RICH: { thin: 0.5, normal: 1, thick: 3 },

    sandboxStart: function (Q, act, rich) {
      var cfg = this.ACTS[act] || this.ACTS[1];
      var kit = this.SANDBOX_KIT[act] || this.SANDBOX_KIT[1];
      var mul = this.SANDBOX_RICH[rich] || 1;
      var y;
      Q.sandbox = 1;
      //  外盤を始める年まで進める。公明・共産の伸びと定数もここで入る。
      for (y = 1959; y <= cfg.from; y += 1) { this.advanceYear(Q, y); }
      //  史実の党の出入り。数えるべき相手が盤に無いと議席計算が狂う。
      if (act >= 2 && !Q.minsha_exists && !Q.minsha_merged) { this.applySplit(Q, 'uha'); }
      //  議席を一度ちゃんと配り直す（初期値のままだと幕に合わない）
      try {
        var r = this.allocate(Q);
        Q.seats_hr = r.seats.shakai;
        Q.res_shakai = r.seats.shakai;
        Q.res_jimin = r.seats.jimin;
        Q.res_komei = r.seats.komei;
        Q.res_minsha = r.seats.minsha;
        Q.res_kyosan = r.seats.kyosan;
        Q.res_other = r.seats.other;
        Q.prev_seats = Q.seats_hr;
      } catch (e) { /* 配れなければ初期値のまま */ }
      //  参院は、始める年の前の参院選の史実の構成と当選にする（D2 は他党だけ、D3 で社会党も）
      this.hcHistStart(Q, cfg.from);
      //  幕の頭へ
      this.carryOver(Q, act);
      //  資源を置き直す
      Q.budget = Math.round(kit.budget * mul);
      Q.capital = Math.round(kit.capital * mul);
      Q.members = Math.round(kit.members * (mul > 1 ? 1.6 : (mul < 1 ? 0.7 : 1)));
      Q.arrears = 0;
      if (mul > 1) {
        //  厚いときは議席と参院にも下駄を履かせる。試すためのものなので
        //  取り方は問わない ── 実績が付かないのはそのためである。
        Q.seats_hr = Math.max(Q.seats_hr || 0, Math.round((Q.hr_total || 467) * 0.28));
        Q.res_shakai = Q.seats_hr;
        //  参院の下駄はその回の当選に数え、他党のその回の当選から引く（D3。定数 252 のまま）
        this.hcGain(Q, 70 - (Q.seats_hc || 0));
      }
      //  路線の帯が変わった知らせ（goalState）は、砂場で置いた線では出さない。
      //  次の refresh で今の帯を覚え直す。
      Q.goal_band = 0; Q.vc_note = 0; Q.vc_note_now = 0;
      this.tdReset(Q);
      this.refresh(Q);
      return Q;
    },

    // ── 基盤 ─────────────────────────────────────────────────
    //  その線が築くべきものを、その線の物差しで測る。
    //
    //  中間右（江田）の線は、組合を切って都市の票で組閣する。
    //  社公民で連立に入るまでが一番早い ── 一番易しい線である。
    //  だが残るものが一番薄い。都市の票は組織ではないので、
    //  次の選挙まで持っている保証が無い。だからここの重みだけ低い。
    //  泡沫化と空洞化の値段である。
    //
    //  左（協会）と右（民社）は、どちらも基盤を作り直す線である。
    //  作るものが違うだけで、作るのに要る年月は同じくらい長い。
    //  中間左は、労働戦線を残したまま都市にも手を伸ばす線。
    //  要求は中庸だが、両方を保つのは中間右より難しい。
    BASE_BY_BAND: {
      1: { name: '协会与官公劳的职场组织', w: 46,
           parts: [['union_kokorou', 250], ['kyokai_grip', 78], ['members', 130000]] },
      2: { name: '劳动战线的主导权与都市的支持', w: 38,
           parts: [['union_power', 450], ['lean_shinchukan_shakai', 24], ['members', 105000]] },
      3: { name: '都市的票与联合里的座位', w: 22,
           parts: [['lean_shinchukan_shakai', 30], ['lean_mishoshiki_shakai', 28], ['members', 85000]] },
      4: { name: '同盟一系的组织票与保守层', w: 42,
           parts: [['union_minrou', 290], ['lean_minrou_shakai', 32], ['members', 90000]] }
    },

    //  線ごとに違う数。
    //
    //  BAND_BAR   【停用・N4】超えるべき線の高さを線ごとに変えていた（中間右 0.70 など）。
    //             路線が動くと史実の線と幕の及第線が画面に何も出ないまま上下したので、
    //             どこからも読まない。数は記録のために残す。線の差は下の二つだけで出す。
    //  BAND_MULT  勝利点の係数（画面では「路線の係数」）。同じ議席・同じ閣僚でも、
    //             何を土台にして取ったかで、残るものが違う。
    //             都市の票は組織ではない。次の選挙まで持っている保証が無い。
    //  BASE_BY_BAND  基盤の中身と上限（上）。
    BAND_BAR:  { 1: 1.22, 2: 1.00, 3: 0.70, 4: 1.16 },
    BAND_MULT: { 1: 1.15, 2: 1.00, 3: 0.82, 4: 1.10 },

    //  史実の党が自分の線の物差しで取っていたであろう基盤 ── その線の上限の 85%。
    //  各打ち手の幕の終わりの基盤は中央値で 79〜100% だった（N4 の前の測り）。
    //  0.33 のままだと誰もが基盤だけで 15〜25 点を只で取り、史実をなぞった局が線を越えた。
    //  帯によって上限が違うので、この値も帯によって違う。
    HIST_BASE_FRAC: 0.85,
    histBase: function (band) {
      var cfg = this.BASE_BY_BAND[band] || this.BASE_BY_BAND[2];
      return cfg.w * this.HIST_BASE_FRAC * (this.BAND_MULT[band] || 1);
    },

    baseScore: function (Q) {
      var cfg = this.BASE_BY_BAND[this.bandOf(Q)] || this.BASE_BY_BAND[2];
      var sum = 0, i, k, need;
      for (i = 0; i < cfg.parts.length; i++) {
        k = cfg.parts[i][0]; need = cfg.parts[i][1];
        sum += Math.min(1, Math.max(0, Q[k] || 0) / need);
      }
      var frac = sum / cfg.parts.length;
      Q.base_frac = Math.round(frac * 100);
      Q.base_name = cfg.name;
      Q.base_cap = cfg.w;
      Q.base_score = Math.round(cfg.w * frac * 10) / 10;
      return Q.base_score;
    },

    //  組合にどれだけ依存しているか。中間右の線は、
    //  都市の票と社公民の枠を持てば、組合が離れても選挙が回る。
    //  回るようになった代わりに、組合が持っていた「確実な票」も無い。
    unionDependence: function (Q) {
      var b = this.bandOf(Q);
      var d = ({ 1: 1.00, 2: 0.85, 3: 0.55, 4: 0.75 })[b] || 0.85;
      if (b === 3) {
        //  都市の支持と社公民の枠が揃っているほど、組合から自由になる
        var urban = Math.min(1, (Q.lean_shinchukan_shakai || 0) / 30);
        var frame = Math.min(1, ((Q.rel_komei || 0) + (Q.rel_minsha || 0)) / 140);
        d -= 0.30 * urban * frame;
      }
      Q.union_dep = Math.round(Math.max(0.2, d) * 100);
      return Math.max(0.2, d);
    },

    //  閣僚は累計で数える。三十四年のあいだに何度か連立に入れば
    //  頭数はいくらでも増えていく ── 一度目の入閣と十八人目の閣僚は、
    //  同じ値打ちではない。史実の六人ぶんまでは満額、その先は三割にする。
    //  こうしないと、議席四十九・分裂三回の党が、
    //  議席百二十七の党より高い点を取ることになる。
    //  【N4 から勝利点には使わない】閣僚の数は政権の段（govLevel）の「主導」の条件にだけ効く。
    CAB_FULL: 6, CAB_TAIL: 0.30,
    cabCount: function (n) {
      n = n || 0;
      return n <= this.CAB_FULL ? n : this.CAB_FULL + (n - this.CAB_FULL) * this.CAB_TAIL;
    },

    // ══════════════════════════════════════════════════════════
    //  勝利条件（N4）
    //
    //  幕の目標  幕の終わりに二つのどちらかを満たしていれば、その幕は勝ち。
    //            そこで記録を残して降りることも、次の幕へ進むこともできる。
    //  三十四年  一九九三年まで打つか、選挙をまたいで政権を保って早く終えたときに、
    //            勝利点を史実の線と比べて勝ち負けを出す（finalScore）。
    //            幕の終わりで降りたときは、そこまでの評価の題だけを出し、勝ち負けは出さない。
    // ══════════════════════════════════════════════════════════

    //  ── 幕の目標 ───────────────────────────────────────
    //  二つのどちらかでよい。
    //   ① 幕の最後の総選挙で、衆院 ACTS[act].pass 議席以上（どの線でも同じ線）
    //   ② その幕のあいだに政権に入った
    //  以前は線ごとの難度（BAND_BAR）を掛けた及第線と、三つめの
    //  「基盤を六割作り、この幕で割れていない」があった。基盤の六割は測ると
    //  ほとんどの局のほとんどの幕で満たしていて、第Ⅱ・Ⅳ幕は何もしなくても勝っていた。
    //  ACT_BASE_NEED は【停用・N4】。
    ACT_BASE_NEED: 60,
    actVictory: function (Q) {
      //  目標の線と、議席・政権の二つの印は goalState が置く（主画面と脇柱も同じ値を出す）
      this.goalState(Q);
      var noSplit = (Q.splits || 0) <= (Q.splits_act_start || 0);
      Q.av_nosplit = noSplit ? 1 : 0;
      Q.act_pass = (Q.av_seats || Q.av_power) ? 1 : 0;
      //  この幕のうちに改憲の発議を止められず九条を失ったら、この幕は負け
      //  （「記録して降りる」もこれで選べなくなる）。
      Q.av_kaiken = (Q.kaiken_lost_act && Q.kaiken_lost_act === Q.act) ? 0 : 1;
      if (!Q.av_kaiken) { Q.act_pass = 0; }
      //  幕ごとの勝ち負け（結末の頁の「幕の勝敗」）。1 勝ち　2 負け　0 まだ
      Q['act_res_' + (Q.act || 1)] = Q.act_pass ? 1 : 2;
      return Q.act_pass;
    },

    //  ── 目標と評価の見込み（refresh の最後で毎回） ─────────────
    //  主画面の目標の一行、脇柱の「この幕の目標」と「三十四年の評価（いま終えたら）」、
    //  幕の開きの頁が読む値を置く。finalScore もここで毎回走るので、
    //  final_* と gr_* はいつも今の盤の値である（結末の頁でももう一度数える）。
    goalState: function (Q) {
      var cfg = this.ACTS[Q.act || 1] || this.ACTS[1];
      Q.act_line = cfg.pass;
      Q.act_to = cfg.to;
      Q.act_elec_last = cfg.elections[cfg.elections.length - 1];
      Q.act_elec_done = ((Q.elec_year || 0) >= Q.act_elec_last) ? 1 : 0;
      Q.av_seats = ((Q.seats_hr || 0) >= Q.act_line) ? 1 : 0;
      Q.av_power = (Q.in_power || Q.act_power) ? 1 : 0;
      if (Q.has_souri) { Q.souri_ever = 1; }
      //  一度だけの知らせ。主画面の on-arrival が vc_note_now に移して出し、0 に戻す。
      //   1 民社党化で勝ちの条件が変わった　2 路線の帯が移った（係数と基盤の中身が変わる）
      //  帯を初めて覚えるとき（開幕・砂場）は知らせない。
      var band = this.bandOf(Q);
      if (Q.goal_band && Q.goal_band !== band) { Q.vc_note = 2; }
      Q.goal_band = band;
      if (Q.minsha_ka && !Q.minsha_ka_noted) { Q.vc_note = 1; Q.minsha_ka_noted = 1; }
      Q.gv_seat_need = this.MINSHA_WIN_SEATS;
      this.finalScore(Q);
      //  一九九三年の史実の線（十二回の総選挙の史実の平均で測る）。
      //  第Ⅰ・Ⅱ幕の見込みはその幕の史実と比べるので高く出やすい。並べて出す。
      Q.final_base_1993 = this.histLine(Q, 5, true);
      return Q;
    },

    //  幕の勝利を取ったところで記録を残す。
    //  テンプレートの保存機構と同じ場所に、専用の枠として書く。
    //  枠は幕ごとに一つ ── 第Ⅲ幕の記録は第Ⅲ幕の記録を上書きする。
    //  テンプレートは game.title / game.author から保存の接頭辞を作るが、
    //  コンパイル後の game にはどちらも載っていないので
    //  "undefined_undefined_save" になる ── 同じオリジンの別の Dendry 作品と
    //  保存枠がぶつかる。読み込みより前にここで固定しておく。
    //  控えの鍵の前置き。
    //
    //  雛形は save_prefix を title + '_' + author + '_save' で作るが、
    //  Windows で組むと info.dry が拾われないので（tools/i18n/langs.mjs の註）
    //  'undefined_undefined_save' になる。以前はここで直していたが、
    //  呼ばれるのが saveCarry と importSave の中だけだったので、
    //  普通の控えは直る前の鍵で書かれていた ──
    //  実測で localStorage に jsp1959_save_a0 と
    //  undefined_undefined_save_a0 が同時に並んでいた。
    //  つまり同じ枠が途中で別の名前に移る。
    //
    //  さらに、日本語版と中文版は同じ所である（/ と /zh/）ので、
    //  前置きが同じなら控えの枠を引き合う。言語で分ける。
    savePrefix: function () {
      var lang = window.JSP_LANG || 'ja';
      return (lang === 'ja') ? 'jsp1959_save' : ('jsp1959_' + lang + '_save');
    },
    //  文庫を開く。is-special なので、戻るのは @backSpecialScene がやる。
    //  脇柱のタブではなく頭の並びに置いてある ── 脇柱は本文しか出さず、
    //  選択肢（目次）が押せないからである。原ゲームも全頁で出している。
    //  雛形の知らせは英語の定型なので、ここで言い換える。
    //  見当たらないものはそのまま出す（黙らせない）。
    TOAST: {
      'Saved.': '存档已保存。',
      'Loaded.': '存档已读入。',
      'No save available.': '这个位置没有存档。',
      'Saving and loading is currently disabled.': '现在不能存档。'
    },
    toast: function (msg) {
      var t = this.TOAST[String(msg)] || String(msg);
      try {
        var el = document.getElementById('jsp_toast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'jsp_toast';
          el.setAttribute('role', 'status');
          el.style.cssText = 'position:fixed;left:50%;bottom:2.2em;transform:translateX(-50%);'
            + 'background:rgba(20,18,16,.92);color:#f2efe7;padding:.5em 1.1em;border-radius:3px;'
            + 'font-size:.95em;z-index:9999;pointer-events:none;opacity:0;transition:opacity .18s';
          document.body.appendChild(el);
        }
        el.textContent = t;
        el.style.opacity = '1';
        if (this._toastT) { clearTimeout(this._toastT); }
        this._toastT = setTimeout(function () {
          var e2 = document.getElementById('jsp_toast');
          if (e2) { e2.style.opacity = '0'; }
        }, 1900);
      } catch (e) { /* 出せなくても保存は成功している */ }
    },

    openLibrary: function () {
      try {
        var U = window.dendryUI;
        if (U && U.dendryEngine) { U.dendryEngine.goToScene('library'); }
      } catch (e) { /* 開けなくても盤は止めない */ }
      return false;
    },

    fixSavePrefix: function () {
      try {
        var U = window.dendryUI;
        if (!U) { return; }
        var want = this.savePrefix();
        if (U.save_prefix !== want) { U.save_prefix = want; }
      } catch (e) { return; }
    },

    //  雛形の importSave は setState を try で囲っていないので、
    //  JSON でない控えや別の作品の控えを選ぶと FileReader の中で例外が飛び、
    //  何の知らせも無いまま終わる（盤面は壊れた状態で残る）。
    //  index.html の onchange をこちらへ向けてある（tools/i18n/inject.mjs）。
    importSave: function (id) {
      var ui = window.dendryUI;
      var el = document.getElementById(id);
      var file = el && el.files && el.files[0];
      if (!ui || !file) { return; }
      var self = this;
      var reader = new FileReader();
      reader.onerror = function () { window.alert(self.SAVE_MSG.unreadable); };
      reader.onload = function (e) {
        var data;
        try { data = JSON.parse(e.target.result); } catch (err) {
          window.alert(self.SAVE_MSG.notJson);
          el.value = '';
          return;
        }
        //  この作品の控えか。scene の名前が盤面に無ければ別の作品である。
        var g = ui.dendryEngine && ui.dendryEngine.game;
        var ok = data && data.qualities && typeof data.sceneId === 'string' &&
                 g && g.scenes && g.scenes[data.sceneId];
        if (!ok) { window.alert(self.SAVE_MSG.notOurs); el.value = ''; return; }
        try {
          ui.dendryEngine.setState(data);
        } catch (err2) {
          window.alert(self.SAVE_MSG.broken);
          el.value = '';
          return;
        }
        if (ui.hideSaveSlots) { ui.hideSaveSlots(); }
        self.afterLoad();
        el.value = '';
        window.alert(self.SAVE_MSG.loaded);
      };
      reader.readAsText(file);
    },
    //  中文版では build-lang.mjs の語の差し替えでここが訳される
    SAVE_MSG: {
      loaded: '已读取。',
      notJson: '这份存档读不了。请选导出的 save.txt。',
      notOurs: '这份存档是别的作品的。',
      broken: '这份存档已损坏，读不进来。',
      unreadable: '文件读取失败。'
    },

    saveCarry: function (Q) {
      this.fixSavePrefix();
      Q.carry_saved = 0;
      try {
        var E = window.dendryUI && window.dendryUI.dendryEngine;
        if (!E || !E.getExportableState || typeof localStorage === 'undefined') { return Q; }
        var pre = (window.dendryUI.save_prefix || 'jsp1959_save');
        var slot = '_carry_act' + (Q.act || 1);
        localStorage.setItem(pre + slot, JSON.stringify(E.getExportableState()));
        localStorage.setItem(pre + '_timestamp' + slot, String(Date.now()));
        Q.carry_saved = 1;
      } catch (e) { Q.carry_saved = 0; }
      return Q;
    },

    //  ── 全局勝利 ────────────────────────────────────────
    //  組織が残っているか。政権を取れなくても、
    //  次の三十年に渡せるものがあれば、それは負けではない。
    GLOBAL_ORG_NEED: { base_frac: 62, members: 90000, union_power: 300 },

    //  民社党化の線だけは、全局勝利の線が高い。
    //  自民党の隣の椅子は議席が少なくても手に入るので、そこを勝ちにすると
    //  「総評を手放して自民党に付いた小さい党」が最短の道になってしまう。
    //  この線では衆院 MINSHA_WIN_SEATS 議席と、組閣を二回続けること
    //  （＝総選挙を一度またいで政権を保つこと）の両方を課す。
    MINSHA_WIN_SEATS: 150,
    orgSurvives: function (Q) {
      var n = this.GLOBAL_ORG_NEED;
      this.baseScore(Q);
      var hit = 0;
      if ((Q.base_frac || 0) >= n.base_frac) { hit += 1; }
      if ((Q.members || 0) >= n.members) { hit += 1; }
      if ((Q.union_power || 0) >= n.union_power) { hit += 1; }
      Q.org_hits = hit;
      return hit >= 2;
    },

    //  結末の頁の外枠。勝ち負けと評価は finalScore が出す（win_now・verdict）。
    //  ここは結末の文を選ぶための値と、前からある名の値を揃えるだけ。
    //  gv_org は開きの文（組織が残ったか）を選ぶのにだけ使う。
    globalVictory: function (Q) {
      this.finalScore(Q);
      var org = this.orgSurvives(Q);
      var G = Q.gov_level || 0;
      Q.gv_held = (G === 3) ? 1 : 0;
      Q.gv_cabinet = (G >= 1) ? 1 : 0;
      Q.gv_org = org ? 1 : 0;
      Q.gv_minsha_line = Q.minsha_ka ? 1 : 0;
      Q.gv_seat_need = this.MINSHA_WIN_SEATS;
      Q.gv_seat_ok = ((Q.seats_hr || 0) >= this.MINSHA_WIN_SEATS) ? 1 : 0;
      //  前からある名。global_win は三十四年の勝ち、gv_kind と gr_global は評価の段。
      Q.global_win = Q.win_now ? 1 : 0;
      Q.gv_kind = Q.verdict === 3 ? 3 : (Q.verdict === 2 ? 2 : (Q.win_now ? 1 : 0));
      Q.gr_global = Q.verdict;
      Q.gr_global_t = this.GRADE_NAME[Q.gr_global];
      Q.gr_global_d = this.GRADE_TEXT.global[Q.gr_global];
      return Q.win_now;
    },

    //  ── 四つの面からの評語 ────────────────────────────────
    //  【N4 から画面に出さない】VERDICT と verdicts() は残してあるが、どこからも呼ばない。
    //  中文の対照表の鍵（文そのもの）を生かしておくためである。
    //  同じ点数でも、どこで取ったかで党の姿は違う。
    //  経済・組織・中央政治・地方政治の四つで別々に見る。
    VERDICT: {
      keizai: [
        '党务财政陷入全面枯竭。即便大幅裁减党工专职编制、压缩机关报印刷版面，财政赤字仍难以为继。由于缺乏独立的财源支持，党在面对各项政治议题与选战动员时，往往在方案论证阶段便因经费匮乏而被迫放弃。',
        '财政常年处于紧平衡与慢性亏损状态。随着产业结构转型与传统工会势力萎缩，来自总评等工会组织的分担金加速缩减，而个人党员党费的增长杯水车薪，收支失衡的局面始终未能得到根本扭转。',
        '成功开拓了工会分担金之外的多元财源支柱。依托都市后援会的民间小额募款与健全的党员定期缴费机制，即便外部劳工战线发生剧烈变动，中央与地方各级党部的日常运营依然维持了稳定的财务独立性。',
        '建立了充裕且健康的现代政党财政体系。充沛的资金不仅能长期支撑专业化的全职幕僚与智库调研团队，更使党在提出各项政策对案时具备详实的财源推演与预算数据，彻底摆脱了战后在野党缺乏实务精算能力的沉疴。'
      ],
      soshiki: [
        '基层组织网络几近瓦解，党员老龄化与脱党现象无法遏制。由于缺乏扎根职场与社区的核心骨干，党在重要政治议题上的号召多停留在口头宣示层面，已丧失在全国范围内发起有效社会运动与基层动员的现实能力。',
        '勉强维持了党支部的基本骨架，但组织基盘已极为脆弱。在战后劳动战线重编与工会整合进程中未能掌握主导权，普通党员规模长期停滞不前，组织体系未能突破既有官公劳工会的狭窄圈子，陷入慢性损耗。',
        '稳固了坚实的基层组织与阶级动员纽带。不仅在劳动战线与工会体系的重组风暴中守住了核心阵地，更成功吸纳了未组织劳工与市民团体的骨干力量，培养出一批兼具理论素养与实务能力的年轻干部队伍。',
        '成功蜕变为主体规模庞大的现代化大众政党。基层支部广泛渗透至城镇社区、青年团体与新兴服务行业，形成了覆盖全国的高效动员网络，将庞大的社会组织力直接转化为施压执政当局、重塑政治议程的制度性实力。'
      ],
      chuo: [
        '在中央政局中始终处于被边缘化的少数地位。在国会内既无力组建足够抗衡执政党的议事联盟，也缺乏推动立法的主导权，除了利用议事规则抵制法案之外无法将自身的政治主张转化为实质性的国家法律。',
        '长期扮演“在野第一党”的角色。国会议席足以维系阻止执政党单方面修宪的“三分之一壁垒”，却始终无法跨过单独执政或主导组阁的门槛，在“五五年体制”的抗议性生态位上陷入长期停滞。',
        '成功打破了自民党一党独大的垄断格局，作为执政联盟的核心力量入主中央政权。不仅实际掌握了关键阁僚席位，更将多项长期倡导的福利保障与社会民主政策落实为内阁施政纲领，实现了历史性的执政突破。',
        '不仅推戴党首出任内阁总理大臣，更在执政后面临的全国大选中经受住了民意检验、成功连任并巩固了政权。彻底终结了战后数十年被冠以“万年在野党”的历史定论，在日本宪政史上奠定了稳定的中道革新轮替执政格局。'
      ],
      chiho: [
        '在地方自治体首长与议会选举中遭遇全面溃败，革新地方政权彻底清零。由于丧失了直接推行民生实验的地方执政阵地，党的各项政策构想被剥离了实践土壤，退化为无从验证的纸上蓝图。',
        '地方革新阵地大幅收缩。20世纪70年代全盛期在各大主要都市推行的老人免费医疗、环境公害防治等开创性地方政策，在80年代中央主导的“行政改革”与财政紧缩浪潮中被逐一清算和削减，地方根据地日渐萎缩。',
        '牢固捍卫了关键都道府县与核心市的革新自治政权。在中央政权由保守阵营把持的时期，地方自治体成为党推行民生福祉、环境保护与基层民主实验的稳固后方，以扎实的地方施政成果抵御了自民党的地方渗透。',
        '构筑起极其深厚的地方执政根基与基层治理网络。不论中央选情与国会议席如何起伏变动，遍布全国的革新自治体首长与庞大的地方议员队伍始终构成了坚不可摧的支撑体系，使党在基层社会扎下了长久的执政合法性。'
      ]
    },

    grade: function (v, a, b, c) {
      return v >= c ? 3 : (v >= b ? 2 : (v >= a ? 1 : 0));
    },

    //  ── 終局の評語。四段で出す ─────────────────────────────
    //  達成／未達の二値だと「あと一歩」と「まるで届かなかった」が
    //  同じ顔になる。四段に割る。
    //  四段の評語の文面。0 失敗 / 1 略失敗 / 2 略成功 / 3 成功 の順。
    //  中文は tools/i18n/zh/js/jsp-core.js.json が差し替える。
    GRADE_TEXT: {
      title: [
        '失去阵地',
        '维持在野',
        '执政经验',
        '夺取政权'
      ],
      lead_full: [
        '一九九三年夏，国会内我党议席的那一排大幅缩短。<br>地方组织里，支持团体的选票不得不与他党候选人平分。<br>三宅坂本部闲置的会议室变多了。',
        '一九九三年，我党在国会的席位缩水，未能掌握主动权。<br>支持团体的集票能力下滑，选区协调中向他党让步的场面屡见不鲜。<br>我党守着残存的人手，就此转入关于往后路线的商议。',
        '步入一九九三年时，在围绕首班指名的角逐中，我党处在中轴位置。<br>依托支持组织的票盘维持了院内发言权，在同他党的交涉中贯彻了一定要求。<br>我党保有足以主导法案修正磋商的议席，止住了断崖式下滑。',
        '一九九三年，三宅坂党本部带着大幅增长的议席迎来大选。<br>我党拓宽支持基础，稳固了自身势力。<br>在宪法问题与日美安全保障条约的辩论中，我党占据了主导国会的地位，走完了这三十四年的历程。'
      ],
      lead_early: [
        '地方组织遭到削弱，各地专职骨干陷入枯竭。<br>能够推荐公认候选人的选区屈指可数，连排开街头活动的人手也凑不齐了。',
        '议席遭到削减，我党失去了国会对策委员会的发言权。<br>素来倚重的工会步调打乱，难以继续支撑下一次选战。',
        '我党维持了一定的会派规模，保留了地方组织的集票功能。<br>尽管止步于此，我党仍为后继者留下了能够交接的组织基础。',
        '我党在众院与参院确立了足以左右法案走势的地位，夯实了政策立案能力。<br>在排开问鼎政权的阵容之际，本阶段的任务告一段落。'
      ],
      //  幕の終わりで降りたとき、評価が「政権の獲得」で、しかも党が政権に入っているときの導入。
      //  lead_early[3] は「政権を伺う」と書くので、政権の中にいる盤では食い違う（N4 で足した）。
      lead_held: '我党已经加入内阁，派出的阁僚能够直接参与预算和法案的制定。<br>本阶段的任务就在我党执政的时候告一段落。',
      cabinet: [
        '我党仅保住议院运营委员会的理事席位，始终无缘登上阁僚名单。',
        '我党加入了少数派联合政权并派出大臣，核心职位却全数让给对方。',
        '我党整合他党推举出首相，锁定了数个关键职位。',
        '我党历经大选依然维持住内阁，重要法案由我党阁僚亲手促成通过。'
      ],
      reform: [
        '我党未能整合中选区的公认候选人，跌破了阻止修宪所需的三分之一底线。',
        '我党维持了在野第一大党的地位，距单独过半依然遥远。',
        '我党在各地选区累积议席，直逼过半数，阻击了执政党单独强行表决。',
        '我党在各地选区接连当选，达成单独过半，凭自身力量完成了首班指名。'
      ],
      unity: [
        '派阀对立导致退党者不断，地方组织与单产卷入其中，发生了两次以上的分裂。',
        '每逢纲领论争，各派阀便召开批判中央执行部的集会，部分议员怀揣退党申请坐进会场。',
        '面对激烈的派阀纷争，我党遏制了组建新党的动向，退党者仅局限在少数个别人士。',
        '我党平息了左右两派的纲领对立，维持了团结各大主力单产的统一执行部。'
      ],
      global: [
        '议席持续缩水，我党在众院与参院全体会议的发言时间遭到削减，支持组织的动员人数下滑，基底彻底松动。',
        '虽未能触及执政地位，我党靠稳固组织票盘守住了一定席位。',
        '我党加入联合政权框架，从三宅坂党本部向总理大臣官邸送出了阁僚。',
        '大选过后我党依然掌管政权，将政策决定权从官僚与他党手中收归己方。'
      ]
    },

    GRADE_NAME: ['失败', '略失败', '略成功', '成功'],
    GRADE_COLOR: ['#B23A34', '#C2703A', '#5B7FA8', '#3E6E8C'],

    //  評語が盤面と食い違わないようにする床。
    //  画面には数がそのまま出ているので、その数から言えないことは言わない。
    floor: function (g, n) { return g < n ? n : g; },

    //  そのときまでに衆院で取った最大の議席。控えから読む。
    seatPeak: function (Q) {
      var rows = this.elecRows(Q), n = Q.seats_hr || 0, i;
      for (i = 0; i < rows.length; i += 1) {
        if (rows[i].shakai > n) { n = rows[i].shakai; }
      }
      return n;
    },

    verdicts: function (Q) {
      //  経済 ── 毎手の収入と、抱えている負担
      var income = (Q.dues_now || 0);
      //  負担は収入の値打ちを食い切れない。食い切ると、毎手の収入が
      //  あるのに「自前の財政が無い」と書くことになる。
      var burden = Math.min(income * 1.3,
        (Q.local_debt || 0) * 0.04 + (Q.kokutetsu_debt || 0) * 0.5 + (Q.arrears || 0) * 0.3);
      var kz = income * 1.8 - burden + Math.min(3, (Q.budget || 0) * 0.12);
      Q.v_keizai = this.grade(kz, 0.9, 1.9, 3.2);
      //  収入も金庫もあるなら、いちばん下の評語は当たらない
      if (income >= 1.2 || (Q.budget || 0) >= 25) { Q.v_keizai = this.floor(Q.v_keizai, 1); }
      Q.v_keizai_t = this.VERDICT.keizai[Q.v_keizai];

      //  組織 ── 党員・労働戦線・その線の基盤
      this.baseScore(Q);
      var so = Math.min(1, (Q.members || 0) / 130000) * 40
             + Math.min(1, (Q.union_power || 0) / 460) * 35
             + (Q.base_frac || 0) * 0.25;
      Q.v_soshiki = this.grade(so, 28, 52, 74);
      Q.v_soshiki_t = this.VERDICT.soshiki[Q.v_soshiki];

      //  中央政治 ── 議席と政権
      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      //  政権に入ったこと自体を数える。閣僚の椅子を取らずに
      //  連立に参加しているだけの場合もあるが、入ったことは入ったことである。
      var inPower = (Q.ever_in_power || (Q.cabinet_posts_ever || 0) > 0) ? 1 : 0;
      //  分裂の引き算も上限を置く。四回割れた党でも、いま百五十議席
      //  あるなら「少数党にとどまった」ではない。
      var ch = (Q.seats_hr || 0) / maj * 60
             + inPower * 20
             + Math.min(12, (Q.cabinet_posts_ever || 0) * 2)
             + ((Q.power_elections || 0) >= 1 ? 25 : 0)
             - Math.min(16, (Q.splits || 0) * 4);
      Q.v_chuo = this.grade(ch, 30, 52, 78);
      //  盤面に出ている数から言えないことは言わない
      if ((Q.seats_hr || 0) >= maj * 0.45) { Q.v_chuo = this.floor(Q.v_chuo, 1); }
      if (inPower) { Q.v_chuo = this.floor(Q.v_chuo, 2); }
      if ((Q.power_elections || 0) >= 1) { Q.v_chuo = this.floor(Q.v_chuo, 3); }
      Q.v_chuo_t = this.VERDICT.chuo[Q.v_chuo];

      //  地方政治 ── 保有数と取り方、抱えた負担
      this.localPending(Q);
      //  負担は保有の値打ちの半分までしか食えない。八つ持っている党に
      //  「自治体は残らなかった」と書いていたのはここである。
      var lo = (Q.local_n || 0) * 14 + (Q.local_eff || 0) * 6;
      var chh = lo - Math.min(lo * 0.5, (Q.local_debt || 0) * 0.25);
      Q.v_chiho = this.grade(chh, 8, 26, 48);
      //  持っている数から言えないことは言わない
      if ((Q.local_n || 0) >= 1) { Q.v_chiho = this.floor(Q.v_chiho, 1); }
      if ((Q.local_n || 0) >= 4) { Q.v_chiho = this.floor(Q.v_chiho, 2); }
      Q.v_chiho_t = this.VERDICT.chiho[Q.v_chiho];

      Q.v_total = Q.v_keizai + Q.v_soshiki + Q.v_chuo + Q.v_chiho;
      return Q;
    },

    //  ── 勝利点の材料（N4） ─────────────────────────────────
    //  衆院の通算。これまでの総選挙の議席を、史実の値がある回だけ平均する
    //  （解散で打った回は史実が無いので入れない）。ours と hist は過半に対する割合
    //  （議席 ÷ 定数の半分）、seats と hseats は画面に出す議席の平均。
    //  総選挙がまだ一度も無いときは、いまの議席とその幕の史実で代える。
    seatAvg: function (Q) {
      var rows = this.elecRows(Q).filter(function (r) { return r.total > 0 && r.hist > 0; });
      var n = rows.length, i, o = 0, h = 0, s = 0, hs = 0;
      if (!n) {
        var tot = Q.hr_total || 511;
        var ref = this.HIST_ACT[Q.act || 1] || this.HIST_FINAL;
        return { ours: (Q.seats_hr || 0) / (tot / 2), hist: ref.hr / (tot / 2),
                 seats: Q.seats_hr || 0, hseats: ref.hr, n: 0 };
      }
      for (i = 0; i < n; i++) {
        o += rows[i].shakai / (rows[i].total / 2);
        h += rows[i].hist / (rows[i].total / 2);
        s += rows[i].shakai; hs += rows[i].hist;
      }
      return { ours: o / n, hist: h / n, seats: Math.round(s / n), hseats: Math.round(hs / n), n: n };
    },

    //  政権の段。3 選挙をまたいで政権を保った（民社党化の線では衆院 MINSHA_WIN_SEATS 以上も要る）
    //  2 連立を主導した（閣僚の累計 4 以上か首班）　1 政権に入った　0 入っていない
    govLevel: function (Q) {
      var posts = Q.cabinet_posts_ever || Q.cabinet_posts || 0;
      var held = (Q.power_elections || 0) >= 1 &&
        (!Q.minsha_ka || (Q.seats_hr || 0) >= this.MINSHA_WIN_SEATS);
      if (held) { return 3; }
      if (posts >= 4 || Q.souri_ever || Q.has_souri) { return 2; }
      if (Q.ever_in_power || posts > 0) { return 1; }
      return 0;
    },

    //  自治体の財政負担を引く点（正の数で返す。画面では「N 点引く」と言う）
    localPts: function (debt) {
      return Math.round(Math.min(this.LOCAL_CAP, -this.SCORE_W.local * Math.max(0, debt || 0)) * 10) / 10;
    },
    //  史実の線。同じ物差しで史実の党を測り、難度の上乗せ（DIFF.bar）を掛ける。
    //  衆院は、プレイヤーがこれまでに打った総選挙と同じ回の史実の平均（allYears なら十二回全部）。
    //  参院・分裂・政権の段はその幕の終わりの史実（HIST_ACT・HIST_GOV）、
    //  基盤は史実の党が立っていた線の上限の HIST_BASE_FRAC。線はプレイヤーの路線では動かない。
    histLine: function (Q, act, allYears, sa) {
      var ref = this.HIST_ACT[act] || this.HIST_FINAL;
      var h = 0, y, k = 0;
      if (allYears) {
        for (y in this.HIST_HR) {
          if (this.HIST_HR.hasOwnProperty(y)) { h += this.HIST_HR[y] / ((this.HIST_TOTAL[y] || 511) / 2); k += 1; }
        }
        h = k ? h / k : 0;
      } else { h = (sa || this.seatAvg(Q)).hist; }
      var refBand = this.bandOf({ route: ref.route === undefined ? -1 : ref.route });
      var w = this.SCORE_W;
      var raw = w.hr * h + w.hc * ref.hc / 126 + this.GOV_PTS[this.HIST_GOV[act] || 0] +
        w.split * ref.splits - this.localPts(ref.local || 0) + this.histBase(refBand);
      return Math.round(raw * this.diff(Q).bar * 10) / 10;
    },

    //  勝利点・史実の線・評価（verdict）・勝ち負け（win_now）・三つの目標の印。
    //  goalState（refresh の最後）から毎回呼ばれるので、盤は触らない（表示の値だけを書く）。
    //
    //  評価（四つの題）  3 政権の獲得  選挙をまたいで政権を保ったか、単独過半を取った
    //                    2 執政の経験  政権に入った（保つ前に終えた）
    //                    1 野党の維持  政権に入らず、政権の点を抜いた勝利点が史実の線（同じく抜く）の OPP_HOLD 以上
    //                    0 地歩の喪失  それに届かない。国家改造の発議に失敗して党が封じられたときも 0
    //  勝ち負け          勝利点が史実の線を越えたか、政権を保ったか、単独過半を取ったなら勝ち。
    //                    九条を失ったことは 30 点を引くだけで、負けにはしない（駕駛員の決め）。
    //  勝ち負けを画面で「判定」として出すのは、一九九三年まで打ったときと、政権を保って早く終えたとき、
    //  党が封じられたときだけ。幕の終わりで降りたときは評価の題だけを出す（結末の頁）。
    finalScore: function (Q) {
      var r1 = function (x) { return Math.round(x * 10) / 10; };
      var act = Q.act || 5;
      var sa = this.seatAvg(Q);
      var G = this.govLevel(Q);
      var mult = this.BAND_MULT[this.bandOf(Q)] || 1.0;
      var base = this.baseScore(Q);
      var w = this.SCORE_W;
      var posts = Q.cabinet_posts_ever || Q.cabinet_posts || 0;
      Q.band_mult = mult;
      Q.gov_level = G;
      //  内訳（画面では符号を付けずに出す。引く二つは「引く点」として正の数で持つ）
      Q.sc_hr = r1(w.hr * sa.ours);
      Q.sc_hc = r1(w.hc * (Q.seats_hc || 0) / 126);
      Q.sc_gov = this.GOV_PTS[G];
      Q.sc_split_abs = r1(-w.split * (Q.splits || 0));
      Q.sc_kaiken_abs = Q.kyujo_ushinatta ? -w.kaiken : 0;
      //  自治体の財政負担（D1）。負の負担（まれ）は点を足さない
      Q.sc_local_abs = this.localPts(Math.max(0, Q.local_debt || 0));
      var score = r1((Q.sc_hr + Q.sc_hc + Q.sc_gov - Q.sc_split_abs - Q.sc_kaiken_abs - Q.sc_local_abs + base) * mult);
      var line = this.histLine(Q, act, false, sa);
      var above = score > line;
      Q.final_score = score;
      Q.final_base = line;
      Q.hist_score = r1(line / (this.diff(Q).bar || 1));
      Q.score_ratio = line > 0 ? Math.round(100 * score / line) : 0;
      //  勝利点は分裂と九条の減点で負になりうる。画面では符号を付けず「0 より N 少ない」と言う（N5）。
      Q.final_score_neg = score < 0 ? 1 : 0;
      Q.final_score_abs = r1(Math.abs(score));
      Q.score_gap = r1(Math.max(0, line - score));
      var ref = this.HIST_ACT[act] || this.HIST_FINAL;
      Q.hist_hr = ref.hr; Q.hist_hc = ref.hc; Q.hist_splits = ref.splits; Q.hist_cab = ref.cabinet;
      Q.seat_avg = sa.seats; Q.seat_avg_hist = sa.hseats; Q.seat_avg_n = sa.n;
      Q.cab_ever = posts;

      //  評価の題
      var endBad = !!Q.kokka_failed;
      var hGov = this.GOV_PTS[this.HIST_GOV[act] || 0] * this.diff(Q).bar;
      var opp = score - Q.sc_gov * mult, oppLine = line - hGov;
      var verdict = endBad ? 0 : ((G === 3 || Q.won_majority_ever) ? 3
        : (G >= 1 ? 2 : (opp >= this.OPP_HOLD * oppLine ? 1 : 0)));
      Q.verdict = verdict;
      //  勝ち負けと、その理由。1 政権を保った　2 単独過半　3 線を越えた　4 届かなかった　6 党が封じられた
      //  （5「憲法が変わった」は設計書にあったが、九条を失っても負けにしないので使わない）
      Q.win_now = (!endBad && (above || G === 3 || Q.won_majority_ever)) ? 1 : 0;
      Q.win_why = endBad ? 6 : (G === 3 ? 1 : (Q.won_majority_ever ? 2 : (above ? 3 : 4)));
      //  結末の頁で勝ち負けを「判定」として出すか（一九九三年・政権を保った早い終わり・党が封じられた）
      Q.judge_on = (Q.ran_full || Q.early_exit || Q.kokka_failed) ? 1 : 0;

      //  三つの目標（組閣・単独過半・統一の四段の評語は gradeGoals）
      var self = this;
      var worst = Math.max.apply(null, self.FAC_KEYS
        .filter(function (f) { return self.inParty(Q, f); })
        .map(function (f) { return Q['mood_' + f] || 0; }).concat([0]));
      Q.worst_mood = Math.round(worst * 10) / 10;
      this.gradeGoals(Q);
      Q.ck_seats = (sa.ours >= sa.hist) ? 1 : 0;
      Q.ck_gov = (G >= 1) ? 1 : 0;
      //  党の統一（D1、駕駛員の決め 2026-09-25）：分裂が通して一回までなら達成。どの派閥が出たか
      //  （左派・中間右派・右派）は問わない。前は gr_unity >= 2（分裂 0 回か、1 回で最も不満な派閥 55 未満）で、
      //  不満の値にも縛られていた。四段の評語 gr_unity は前のまま（gradeGoals）。
      Q.ck_unity = ((Q.splits || 0) <= this.UNITY_MAX_SPLITS) ? 1 : 0;

      //  前からある名（道具と古い頁が読む）
      Q.above_base = above ? 1 : 0;
      Q.goal_met = Q.ck_gov;
      Q.quadrant = Q.ck_gov ? (above ? 1 : 2) : (above ? 3 : 4);
      Q.quadrant_name = ['', '胜利的胜利', '胜利的失败', '失败的胜利', '失败的失败'][Q.quadrant];
      var T = this.GRADE_TEXT;
      Q.gr_total = verdict;
      Q.gr_total_t = this.GRADE_NAME[verdict];
      Q.gr_title = T.title[verdict];
      Q.gr_lead_full = T.lead_full[verdict];
      //  幕の終わりで降りたときの導入。lead_early は旧い四段（失敗〜成功）の文なので、
      //  「野党の維持」でも線を越えている盤には、議席を削られたと書く [1] ではなく [2] を出す。
      //  政権の中にいて「政権の獲得」なら lead_held（[3] は「政権を伺う」と書くため）。
      var li = verdict === 3 ? 3 : (verdict === 2 ? 2 : (verdict === 1 ? (Q.win_now ? 2 : 1) : 0));
      Q.gr_lead_early = (verdict === 3 && Q.in_power) ? T.lead_held : T.lead_early[li];
      return Q;
    },

    //  ── 三つの目標の四段の評語 ─────────────────────────────
    //  組閣（＝政権の段 govLevel）、体制改革（単独過半）、党の統一。
    //  評価の題は finalScore が出す（以前ここで目標と点を半々に合わせていた総合は外した）。
    gradeGoals: function (Q) {
      var G = (Q.gov_level !== undefined && Q.gov_level !== null) ? Q.gov_level : this.govLevel(Q);
      Q.gr_cabinet = G;

      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      var peak = this.seatPeak(Q);
      Q.seat_peak = peak;
      Q.gr_reform = Q.won_majority_ever ? 3
        : (peak >= maj * 0.85 ? 2 : (peak >= maj * 0.62 ? 1 : 0));

      var sp = Q.splits || 0, worst = Q.worst_mood || 0;
      Q.gr_unity = (sp === 0 && worst < 45) ? 3
        : ((sp === 0 || (sp === 1 && worst < 55)) ? 2
          : ((sp <= 1 && worst < 85) ? 1 : 0));

      var g = this.GRADE_NAME, T = this.GRADE_TEXT;
      Q.gr_cabinet_d = T.cabinet[Q.gr_cabinet];
      Q.gr_reform_d = T.reform[Q.gr_reform];
      Q.gr_unity_d = T.unity[Q.gr_unity];
      Q.gr_cabinet_t = g[Q.gr_cabinet];
      Q.gr_reform_t = g[Q.gr_reform];
      Q.gr_unity_t = g[Q.gr_unity];
      return Q;
    },

    //  一九九三年の組閣判定。単独過半か、非自民の連立算術か。
    //  史実：社会党は 70 議席（全窗口で次に低い）で第一党として入閣した。
    //  強かったからではなく、自民党が割れたからである。
    //  ── 政権入りの判定 ──────────────────────────────────
    //  総選挙のたびに走る。年でも幕でも止めていない ── 第Ⅰ幕で
    //  非自民の過半を作れれば、一九六〇年に組閣できる。史実で
    //  一九九三年まで起きなかったのは自民党が割れなかったからである
    //  （ldp_split は 1993 以外は 0）。
    //    route 1  単独過半
    //    route 2  非自民が過半、かつ相手との関係が足りている（主導）
    //    route 3  過半はあるが担がれない（参加のみ）
    //    route 0  受け皿が無い
    //  commit を立てて呼ぶと、その場で政権に入る／保つところまでやる。
    //  立てずに呼ぶと数えるだけで、入るかどうかは組閣の頁が決める
    //  （＝プレイヤーが決める）。数を失って落ちるほうは選べないので、
    //  commit の有無にかかわらずその場で降りる。
    cabinetCheck: function (Q, commit) {
      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      Q.cab_majority_line = maj;
      var C = this.CAB;
      //  この選挙の前に政権にいたか。いたまま選挙を越えれば、
      //  それは「保った」ということで、全局勝利の一つ目の道になる。
      var wasIn = !!Q.in_power;
      Q.was_in_power = wasIn ? 1 : 0;
      Q.jisha_lost = 0;
      //  受け皿は route によらず数えて頁に出す
      var bloc = this.coalitionBloc(Q);
      Q.cab_bloc = bloc.seats;
      Q.cab_bloc_n = bloc.parties.length;
      Q.cab_bloc_list = this.blocLine(Q, bloc);
      Q.cab_nonldp = this.nonLdpSeats(Q);
      //  受け皿の中でいちばん大きいのが我々か。首班を出せるかがこれで決まる。
      var top = 0, i;
      for (i = 0; i < bloc.parties.length; i++) {
        if (bloc.parties[i].seats > top) { top = bloc.parties[i].seats; }
      }
      Q.cab_lead = (Q.seats_hr || 0) >= top ? 1 : 0;

      if (Q.seats_hr >= maj) {
        Q.cab_route = 1; Q.cab_nonldp = Q.seats_hr;
        Q.cab_offer = 1;
        if (commit) { this.takeCabinet(Q, 1); }
        return 1;
      }
      //  自社連立。民社党化した党が自民党と組んでいるとき、自民と我々の
      //  合計が過半なら連立は続く（まだ入っていなければ入る）。数を失えば解ける。
      if (Q.jisha_pact) {
        var js = (Q.seats_hr || 0) + (Q.res_jimin || 0);
        if (js >= maj) {
          Q.cab_route = 4; Q.cab_nonldp = js;
          Q.cab_offer = 1;
          if (commit) { this.takeCabinet(Q, 4); }
          return 4;
        }
        Q.jisha_pact = 0;
        Q.jisha_lost = 1;
        if (C && Q.in_power) { C.leavePower(Q); }
        Q.cab_route = 0; Q.cab_offer = 0;
        return 0;
      }
      //  こちらを外して過半を作れるか。作れるなら、我々の入らない
      //  非自民政権もありうる。作れないなら「非自民の政権はできたが
      //  我々は外」という結末は算術として成立しない ── 席が要るからである。
      var without = Q.cab_nonldp - (Q.seats_hr || 0);
      Q.cab_without = without;
      Q.cab_needed = (Q.cab_nonldp >= maj && without < maj) ? 1 : 0;
      //  共闘可能まで来ている党の議席を足して過半に届くか。
      //  届かなければ、非自民の合計がいくらあっても我々の内閣にはならない。
      if (bloc.seats < maj) {
        //  相手だけで過半を作れるなら、我々抜きの非自民政権ができる。
        //  作れないなら、政権は自民党に残る。
        Q.cab_route = (without >= maj) ? 5 : 0;
        Q.cab_offer = 0;
        if (C && Q.in_power) { C.leavePower(Q); }
        return Q.cab_route;
      }
      //  届いている。いちばん大きければ主導（首班を出せる）、
      //  そうでなければ参加のみ（首班は相手が出す）。
      Q.cab_route = Q.cab_lead ? 2 : 3;
      Q.cab_offer = 1;
      if (commit) { this.takeCabinet(Q, Q.cab_route); }
      return Q.cab_route;
    },

    // ══════════════════════════════════════════════════════════
    //  総選挙のあとの組閣
    //
    //  原ゲーム（dynamic_social_democracy）の coalition_menu と同じ作りにする。
    //  あちらは組み合わせごとに一つの選択肢を置き、
    //    view-if   ＝ 数。その組み合わせで過半に届くか
    //    choose-if ＝ 関係。相手が乗るか
    //    unavailable-subtitle ＝ 足りない条件を並べて見せる
    //  と分けている。数が足りない組み合わせはそもそも出さず、
    //  数は足りるが関係が足りないものは灰色で理由とともに出す。
    //
    //  ここは数と旗だけを立てる。文は場面の側で書く。
    // ══════════════════════════════════════════════════════════

    //  無所属と旗の無い小党（その他）は、六対四で自民と我々に割れる。
    OTHER_TO_US: 0.4,
    otherOurs: function (Q) {
      return Math.round((Q.res_other || 0) * this.OTHER_TO_US);
    },

    //  相手が乗る線。党首が我々の推した側なら十だけ下がる。
    //  （komei_left / minsha_left / kyosan_kaikaku は党首選への介入で立つ）
    CAB_LINE: { komei: 50, minsha: 55, kyosan: 50, jimin: 40 },
    cabRelLine: function (Q, p) {
      var v = this.CAB_LINE[p];
      if (v === undefined) { v = 50; }
      var soft = (p === 'kyosan') ? Q.kyosan_kaikaku : Q[p + '_left'];
      return soft ? v - 10 : v;
    },
    cabRelOk: function (Q, p) {
      if (p === 'komei' && !Q.komei_exists) { return false; }
      if (p === 'minsha' && !Q.minsha_exists) { return false; }
      if (p === 'kyosan' && Q.kyosan_merged) { return false; }
      return (Q['rel_' + p] || 0) >= this.cabRelLine(Q, p);
    },

    //  自民から割れて出て、自民を降ろす側に立つ党の議席
    allySplinterSeats: function (Q) {
      var n = 0, i, k, sp;
      for (i = 0; i < this.SPLINTER_KEYS.length; i += 1) {
        k = this.SPLINTER_KEYS[i];
        sp = this.SPLINTER[k];
        if (!sp || !sp.ally) { continue; }
        n += Q['res_sp_' + k] || 0;
      }
      return n;
    },

    //  自民党の総裁。組閣が向こうに回ったとき、首相の名前になる。
    //  党首選に介入して三木を担いだ盤では、そこから先が変わる。
    LDP_HEADS: [
      [1957, '岸信介'], [1960, '池田勇人'], [1964, '佐藤荣作'], [1972, '田中角荣'],
      [1974, '三木武夫'], [1976, '福田赳夫'], [1978, '大平正芳'], [1980, '铃木善幸'],
      [1982, '中曾根康弘'], [1987, '竹下登'], [1989, '海部俊树'], [1991, '宫泽喜一']
    ],
    ldpHead: function (Q) {
      //  党首選に介入して担いだ人は、その任期のあいだだけ残る。
      //  期限を切らないと、一度介入しただけで三十四年ぶん総裁が固まってしまう。
      var y0 = Q.year || 0;
      if (Q.jimin_head_name && y0 >= (Q.jimin_head_from || 0) &&
          y0 <= (Q.jimin_head_until || 0)) {
        return Q.jimin_head_name;
      }
      var y = Q.year || 1959, i, name = this.LDP_HEADS[0][1];
      for (i = 0; i < this.LDP_HEADS.length; i++) {
        if (y >= this.LDP_HEADS[i][0]) { name = this.LDP_HEADS[i][1]; }
      }
      return name;
    },

    //  組み合わせの一覧。順は画面に並べる順。
    CAB_SHAPES: ['tandoku', 'sakyo', 'shako', 'shamin', 'shakomin',
      'hijimin', 'zenyato', 'jisha'],

    cabinetOptions: function (Q) {
      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      var mine = Q.seats_hr || 0;
      var oth = this.otherOurs(Q);
      var ko = Q.komei_exists ? (Q.res_komei || 0) : 0;
      var mi = Q.minsha_exists ? (Q.res_minsha || 0) : 0;
      var ky = Q.kyosan_merged ? 0 : (Q.res_kyosan || 0);
      var sp = this.allySplinterSeats(Q);
      var ji = Q.res_jimin || 0;
      Q.cab_majority_line = maj;
      Q.cab_other_ours = oth;
      Q.cab_sp_seats = sp;
      Q.cab_ldp_seats = ji + ((Q.res_other || 0) - oth);
      Q.cab_ldp_head = this.ldpHead(Q);

      //  関係の旗。unavailable の文はこれを見て場面が書く。
      var ps = ['komei', 'minsha', 'kyosan', 'jimin'], pi;
      for (pi = 0; pi < ps.length; pi++) {
        Q['rel_ok_' + ps[pi]] = this.cabRelOk(Q, ps[pi]) ? 1 : 0;
      }
      //  全野党共闘の門。三党すべての党首が我々の推した側にいること。
      //  左派だけでは公明にも民社にも手が届かないので、この道は
      //  中間左派を通したときにしか開かない。
      Q.zenyato_ready = (Q.kyosan_kaikaku && Q.komei_left && Q.minsha_left) ? 1 : 0;

      var N = {
        tandoku: mine,
        sakyo: mine + ky + oth,
        shako: mine + ko + oth,
        shamin: mine + mi + oth,
        shakomin: mine + ko + mi + oth,
        hijimin: mine + ko + mi + sp + oth,
        zenyato: mine + ko + mi + ky + sp + oth,
        jisha: mine + ji + (Q.res_other || 0)
      };
      //  その組み合わせが盤の上で成り立つか（相手の党が在るか）
      var SHOW = {
        tandoku: 1,
        sakyo: (!Q.kyosan_merged && ky > 0) ? 1 : 0,
        shako: Q.komei_exists ? 1 : 0,
        shamin: Q.minsha_exists ? 1 : 0,
        shakomin: (Q.komei_exists && Q.minsha_exists) ? 1 : 0,
        hijimin: sp > 0 ? 1 : 0,
        zenyato: (!Q.kyosan_merged && ky > 0 && Q.komei_exists && Q.minsha_exists) ? 1 : 0,
        jisha: Q.minsha_ka ? 1 : 0
      };
      var REL = {
        tandoku: 1,
        sakyo: Q.rel_ok_kyosan,
        shako: Q.rel_ok_komei,
        shamin: Q.rel_ok_minsha,
        shakomin: (Q.rel_ok_komei && Q.rel_ok_minsha) ? 1 : 0,
        hijimin: (Q.rel_ok_komei && Q.rel_ok_minsha) ? 1 : 0,
        zenyato: (Q.rel_ok_komei && Q.rel_ok_minsha && Q.rel_ok_kyosan &&
          Q.zenyato_ready) ? 1 : 0,
        jisha: (Q.minsha_ka && Q.rel_ok_jimin) ? 1 : 0
      };
      var i, k, any = 0;
      for (i = 0; i < this.CAB_SHAPES.length; i++) {
        k = this.CAB_SHAPES[i];
        Q['cab_' + k + '_n'] = N[k];
        Q['cab_' + k + '_maj'] = N[k] >= maj ? 1 : 0;
        Q['cab_' + k + '_show'] = (SHOW[k] && N[k] >= maj) ? 1 : 0;
        Q['cab_' + k + '_rel'] = REL[k] ? 1 : 0;
        Q['cab_' + k + '_ok'] = (Q['cab_' + k + '_show'] && REL[k]) ? 1 : 0;
        if (Q['cab_' + k + '_ok']) { any = 1; }
      }
      //  自社は相手がこちらを要るときだけ差し出される
      if (Q.cab_jisha_ok && ji >= maj) { Q.cab_jisha_ok = 0; Q.cab_jisha_show = 0; }
      Q.cab_any = any;
      //  組閣の頁に出る組み合わせの数（灰色も数える）。0 なら「自民党が組閣する」
      //  しか無いので、組閣の頁は止まらずにそこへ進む（election.cabinet_form）。
      var shown = 0;
      for (i = 0; i < this.CAB_SHAPES.length; i++) { shown += Q['cab_' + this.CAB_SHAPES[i] + '_show'] ? 1 : 0; }
      Q.cab_any_show = shown;
      return Q;
    },

    //  選んだ組み合わせで政権に入る。
    //  kind は CAB が使う 1=単独 2=主導 3=参加 4=自社。
    cabShapeKind: function (Q, shape) {
      if (shape === 'tandoku') { return 1; }
      if (shape === 'jisha') { return 4; }
      //  受け皿の中でいちばん大きいのが我々なら首班を出せる
      var top = 0, list = [], i;
      if (shape !== 'shamin') { list.push(Q.komei_exists ? (Q.res_komei || 0) : 0); }
      list.push(Q.minsha_exists ? (Q.res_minsha || 0) : 0);
      if (shape === 'sakyo' || shape === 'zenyato') { list.push(Q.res_kyosan || 0); }
      for (i = 0; i < list.length; i++) { if (list[i] > top) { top = list[i]; } }
      return (Q.seats_hr || 0) >= top ? 2 : 3;
    },

    takeShape: function (Q, shape) {
      var kind = this.cabShapeKind(Q, shape);
      Q.cab_shape = shape;
      Q.cab_route = kind;
      if (shape === 'jisha') { Q.jisha_pact = 1; Q.jisha_cabinet = 1; }
      if (shape === 'zenyato') { Q.zenyato_done = 1; }
      this.takeCabinet(Q, kind);
      //  取った省に人を入れるのは派閥の強さの順。単独でも同じ表を使う。
      if (this.CAB && this.CAB.autoFill) { this.CAB.autoFill(Q); }
      return kind;
    },

    //  総選挙の直後に走る。ここでは政権に入りも出もしない ──
    //  どの組み合わせで組むかは、組閣の頁で作り手が決める。
    //  cabinetCheck（自動で決める版）は、一九九三年の判定と検査が使う。
    cabinetPre: function (Q) {
      Q.was_in_power = Q.in_power ? 1 : 0;
      Q.jisha_lost = 0;
      Q.cab_shape = '';
      this.cabinetOptions(Q);
      //  自社連立を組んでいたのに、二党を足しても過半を割ったら約束は消える
      if (Q.jisha_pact && !Q.cab_jisha_maj) { Q.jisha_pact = 0; Q.jisha_lost = 1; }
      var bloc = this.coalitionBloc(Q);
      Q.cab_bloc = bloc.seats;
      Q.cab_bloc_n = bloc.parties.length;
      Q.cab_bloc_list = this.blocLine(Q, bloc);
      Q.cab_nonldp = this.nonLdpSeats(Q);
      Q.cab_without = Q.cab_nonldp - (Q.seats_hr || 0);
      return Q;
    },

    //  連立から降りる。内閣は倒れる。
    //
    //  首班を譲っていれば、改造も解散も手元に無い ── どちらも総理の
    //  権限だからである。内閣を終わらせる手は、これ一つだけになる。
    //  一緒に座っていた相手との関係は、そのぶん大きく傷む。
    walkOut: function (Q) {
      var C = this.CAB;
      if (!Q.in_power) { return Q; }
      var kind = Q.cab_kind || 0;
      Q.cab_walked = 1;
      Q.walk_year = Q.year || 0;
      Q.walk_n = (Q.walk_n || 0) + 1;
      if (kind === 4) {
        //  自社連立を降りる。自民との関係が切れる。
        Q.rel_jimin = (Q.rel_jimin || 0) - 40;
        Q.rel_sohyo = (Q.rel_sohyo || 0) + 12;
      } else {
        if (Q.komei_exists) { Q.rel_komei = (Q.rel_komei || 0) - 25; }
        if (Q.minsha_exists) { Q.rel_minsha = (Q.rel_minsha || 0) - 25; }
        //  共産党は閣内に居ないことが多い。降りた側には近づく。
        Q.rel_kyosan = (Q.rel_kyosan || 0) + 8;
      }
      //  左派は喜ぶ。数を取りに行った側は惜しがる。
      Q.mood_saha = Math.max(0, (Q.mood_saha || 0) - 10);
      Q.mood_chuu = (Q.mood_chuu || 0) + 12;
      Q.mood_uha = (Q.mood_uha || 0) + 12;
      Q.souri_yuzuru = 0;
      if (C) { C.leavePower(Q); }
      return Q;
    },

    //  組閣は向こうに回った。野に戻る。
    stayOut: function (Q) {
      var maj = Q.cab_majority_line || (Math.floor((Q.hr_total || 511) / 2) + 1);
      Q.cab_shape = 'ldp';
      Q.cab_offer = 0;
      Q.jisha_pact = 0;
      //  組める組み合わせが有ったのに組まなかったのか、
      //  そもそも席が要らなかったのか。終局の頁がここを読む。
      if (Q.cab_any) {
        Q.cab_declined = 1;
        Q.cab_route = 0;
        Q.mood_saha = (Q.mood_saha || 0) + 6;
        Q.mood_chuu = (Q.mood_chuu || 0) - 6;
      } else {
        Q.cab_route = ((Q.cab_without || 0) >= maj) ? 5 : 0;
      }
      if (this.CAB && Q.in_power) { this.CAB.leavePower(Q); }
      return Q;
    },

    //  組閣を決めたときに呼ぶ。政権に入り、保ったなら一つ数える。
    takeCabinet: function (Q, route) {
      var C = this.CAB;
      //  形が変わったまま居座らせない。主導していた党が参加のみに落ちたら、
      //  持ち点も省も割り直しになる。
      if (C && Q.in_power && Q.cab_kind !== route) { C.leavePower(Q); }
      if (C) { C.enterPower(Q, route); }
      if (Q.was_in_power) { Q.power_elections = (Q.power_elections || 0) + 1; }
      Q.act_power = 1;
      Q.cab_declined = 0;
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  解散
    //
    //  衆議院を解散できるのは総理を出しているときだけである。
    //  やることは「この局面をここで畳んで、局面の終わりに置いてある
    //  総選挙を前へ持ってくる」こと ── 予定の総選挙を増やしも減らしもしない。
    //  残っている手はそのまま捨てることになる。
    //
    //  第Ⅰ幕だけは外す。あの幕の局面の切れ目は党大会と安保で、
    //  総選挙ではないので、前へ持ってくる先が無い。
    //  解散して打つ総選挙は、予定の総選挙とは別枠である。
    //  ここを「予定のものを前へ持ってくる」にしていたので、
    //  一度解散すると幕の中の総選挙が一回減っていた。減らさない。
    //
    //  止めるのは回数ではなく、政治資源と民意である。打つたびに
    //  資源が重くなり、選挙疲れが票に出る。何回でも打てるが、
    //  打つほど高くつく。
    KAISAN_COST: 6,
    KAISAN_STEP: 3,
    kaisanCost: function (Q) {
      return this.KAISAN_COST + this.KAISAN_STEP * (Q.kaisan_n || 0);
    },
    canDissolve: function (Q) {
      if (!Q.in_power || !Q.has_souri) { return 0; }
      //  解散したその手で選挙になるので、手が残っていること
      if ((Q.turns_left || 0) < 1) { return 0; }
      return (Q.capital || 0) >= this.kaisanCost(Q) ? 1 : 0;
    },

    dissolve: function (Q) {
      var cost = this.kaisanCost(Q);
      Q.kaisan_n = (Q.kaisan_n || 0) + 1;
      Q.kaisan_cost_paid = cost;
      Q.capital = Math.max(0, (Q.capital || 0) - cost);
      //  予定の総選挙は動かさない。この一回は別枠で打つ
      Q.snap_election = 1;
      //  何度も投票所へ呼べば、呼ばれる側は飽きる。
      //  二回目からは目に見えて重くなる。
      var n = Q.kaisan_n;
      Q.mood_chusa = (Q.mood_chusa || 0) + 4 + 2 * (n - 1);
      this.push(Q, ['shinchukan', 'mishoshiki'], -(n - 1));
      this.refresh(Q);
      return Q;
    },

    //  組まないと決めたときに呼ぶ。政権にいたのなら、そこで降りる。
    declineCabinet: function (Q) {
      var C = this.CAB;
      if (C && Q.in_power) { C.leavePower(Q); }
      Q.cab_declined = 1;
      //  野党に留まった判断は左派には歓迎される
      Q.mood_saha = (Q.mood_saha || 0) + 6;
      Q.mood_chuu = (Q.mood_chuu || 0) - 6;
      return Q;
    },

    // ── 傾向を押す。上限の手前25%に入ってから鈍る ──────────────
    //  校正: これ以前は (cap-cur)/cap で、実効係数が 0.11〜0.26 まで落ち、
    //  9手打っても議席が5しか動かなかった。戦略差が消えていた。
    //  押すのには二つの天井がある。
    //    ① 層の得票上限（capOf。組織率で決まる）
    //    ② 基線からどれだけ離せるか（LEAN_HEADROOM）
    //  ② を置いていなかった。erode は毎手基線へ DECAY だけ引き戻すが、
    //  押し続けるかぎり lean は base + amt/DECAY で釣り合う。
    //  amt=4・DECAY=0.18 なら base から +22 で止まる ── 監査で一九八三年の
    //  未組織・新中間層が base 19〜21 に対し lean 42〜45 になっていて、
    //  議席が史実の 1.9 倍に膞らんでいたのはこれである。
    //
    //  天井を上げる道は組織化だけである（baselineLean に orgb が乗る）。
    //  「押せば伸びる」から「組織したところだけ伸びる」へ戻すところである。
    //  九にしたのは、共産党の校正を入れてからである。
    //  以前は日共が一議席も取らなかったので、その分が自民へ回って
    //  自民が史実より多く見えていた。日共が正しく取るようにしたら
    //  社会党の膛らみが表に出たので、天井を一段下げている。
    LEAN_HEADROOM: 9,
    //  天井で削られた押しを、基線の持ち上げに振り替える率。
    //  ORG_LEAN_PULL が 22 なので、捨てられるはずだった 8 が
    //  基線（＝天井）を約一つ上げる。
    PUSH_SPILL: 0.001,
    //  天井から上での効き。伸ばす札が何も返さない状態を無くすためだけの値で、
    //  大きくすると天井そのものが意味を失う。
    PUSH_OVER: 0.15,
    //  天井の上に積める余地。ここまでは乗るが、基線には入らないので
    //  erode が毎手引き戻す。
    LEAN_OVER_ROOM: 4,
    //  普通の事象の選択肢で押した票を縮める率（(e) の前半。計画 N6・A1）。
    //  A1 で gen-events が普通の選択肢の fx を fxBegin / fxEnd で挟むと、そのあいだの push が
    //  ORD_FX_SCALE 倍になり、選んだあとで、その事象の選択肢の平均（EVENTS の fxm）の残りを足し戻す。
    //  選択肢どうしの差は縮み、事象が平均して与える票は変わらない。
    //  _fxScale は J に置いて控えには入れない。挟まれていなければ 1 で、push は前と同じ数を返す。
    ORD_FX_SCALE: 0.5,
    _fxScale: 1,
    _fxN: 0,
    push: function (Q, layers, amt) {
      amt = amt * (this._fxScale === undefined ? 1 : this._fxScale);
      var i, l, cap, cur, gain, next, spill;
      for (i = 0; i < layers.length; i++) {
        l = layers[i];
        cap = Math.min(this.capOf(Q, l), this.baselineLean(Q, l) + this.LEAN_HEADROOM);
        cur = Q['lean_' + l + '_shakai'];
        if (amt >= 0) {
          if (cur >= cap) {
            //  天井から上は柔らかくする。ここが硬いと、天井に貼り付いた層で
            //  「官公労 +3、新中間層 −2」の札が新中間層 −2 だけになり、
            //  伸ばすつもりで選んだ札が正味の損になっていた（監査で 633 件）。
            //  上に乗る分は基線へは入らないので、erode が毎手引き戻す ──
            //  天井を本当に上げる道は組織化だけ、という筋は変えていない。
            gain = Math.round(amt * this.PUSH_OVER * 10) / 10;
            next = Math.min(cap + this.LEAN_OVER_ROOM, cur + gain);
            if (next < cur) { next = cur; }
          } else {
            //  天井の手前25%に入ってから鈐る。これを (cap-cur)/cap にすると
            //  実効係数が 0.11〜0.26 まで落ち、九手打っても議席が五しか
            //  動かなくなる（戦略差が消える）のでこの形を保つ。
            gain = Math.round(amt * Math.min(1, Math.max(0, (cap - cur) / (0.25 * cap))) * 10) / 10;
            next = Math.min(cap, cur + gain);
          }
          //  削られた分を捨てない。天井に貼り付いた層では「＋8」の札を
          //  選んでも数が動かず、同じ札の「−2」だけが効いていた。
          //  押した手は基線に残る ── 天井を上げる道は組織化だけ、を保つ。
          spill = amt - (next - cur);
          if (spill > 0) {
            Q['orgb_' + l] = Math.min(0.75, (Q['orgb_' + l] || 0) + spill * this.PUSH_SPILL);
          }
        } else {
          //  下げるほうは鈐らせない。天井の近くで手が届かなくなる理由が無い
          //  （以前は同じ鈐りをかけていたので、下げる札が天井付近で効かなかった）。
          next = Math.max(2, cur + Math.round(amt * 10) / 10);
        }
        Q['lean_' + l + '_shakai'] = next;
        //  自民から移す量は、実際に動いた分と揃える。以前は gain を
        //  そのまま引いていたので、天井で切られたときに差が消えていた。
        Q['lean_' + l + '_jimin'] -= (next - cur);
      }
      return Q;
    },
    //  普通の選択肢の fx を挟む（A1 で gen-events が書く。N6 の時点ではどこからも呼ばない）。
    //  n は事象の番号。fxEnd は縮めた分の平均の残り（(1 − 縮め) × fxm）を層ごとに足し戻す。
    //  fxm の無い事象（手書き・fxm を書く前の盤）では足し戻さないだけで、誤りにはしない。
    fxBegin: function (Q, n) { this._fxScale = this.ORD_FX_SCALE; this._fxN = n; return Q; },
    fxEnd: function (Q, n) {
      var S = this._fxScale, e, m, l;
      this._fxScale = 1; this._fxN = 0;
      e = this.eventByN(n);
      m = e && e.fxm;
      if (m && S < 1) {
        for (l in m) { if (m.hasOwnProperty(l) && m[l]) { this.push(Q, [l], (1 - S) * m[l]); } }
      }
      return Q;
    },
    //  事象の番号から EVENTS の行を引く（最初に一度だけ索引を作る）
    eventByN: function (n) {
      var ix = this._evIx, i, E;
      if (!ix) {
        ix = {}; E = this.EVENTS || [];
        for (i = 0; i < E.length; i++) { if (E[i] && E[i].n !== undefined && !ix.hasOwnProperty(E[i].n)) { ix[E[i].n] = E[i]; } }
        this._evIx = ix;
      }
      return ix.hasOwnProperty(n) ? ix[n] : null;
    },


    // ── 組織化：組織率を上げ、組織したところは票にもなる ─────────
    //  オルグを回すのは人である。党員が少なければ、金があっても組織できない。
    //  これが「有金・有人・有票」の鎖の実体。
    organise: function (Q, layers, pts) {
      var power = pts * Math.min(2.2, Math.sqrt(Math.max(0, Q.members || 50000) / 50000));
      var i, l;
      for (i = 0; i < layers.length; i++) {
        l = layers[i];
        Q['orgb_' + l] = Math.min(0.75, (Q['orgb_' + l] || 0) + power);
        Q['org_' + l] = Math.min(0.92, (Q['org_' + l] || 0) + power);
      }
      this.push(Q, layers, 2);
      Q.last_org_power = Math.round(power * 1000) / 10;
      return Q;
    },
    // ── 党員拡大。協会が組織局を握っていれば代議員は左に流れる ──
    // ── 党大会の引き戻し ────────────────────────────────────
    //  中央がどの線を掲げていても、党大会の代議員を握っているのは
    //  県連であり、県連の職場を握っているのは協会である。
    //
    //  中間右（江田）の線にとって、これが一番の内なる敵になる。
    //  西欧型の社会民主政党にすると中央が決めても、
    //  大会が左の委員長を選べば、線はそこで止まる。
    //  だから中間右の線は、都市の票を取ると同時に
    //  協会系の代議員を減らしにいかなければならない ──
    //  減らせば線は通る。通ったあとに動員する組織は無い。
    //
    //  逆に左の線では、この引きは味方である。

    //  大会が支持している線。代議員の構成そのもの。
    //  無派閥の代議員は大会の線を持たない。中央の線に付く。
    //  以前は重み 0（＝中道）で平均に入れていたので、事象で無派閥が積み上がるほど
    //  大会の線が真ん中へ寄り、協会が三割を握っていても左の中央を右へ引き戻していた
    //  （報告あり：無派閥 995 票、協会 633 票で線が中間左）。
    //  いまは派閥の代議員だけで線を決め、無派閥は引きの速さを鈍らせるだけにする。
    //  協会が動かす代議員（中間左派のうち掌握度ぶん）は左派の重みで数える。
    //  脇柱は「社会主義協会 633 票」と別に出しているのに、線の計算では
    //  中間左派の重み（−1）で数えていたので、協会が三割を握っても線が
    //  中間左に留まり、脇柱の数字と線が食い違っていた。
    //  合同で入ってきた側も線を持つ。共産党系は協会より更に左、
    //  保守派は右派より更に右、自由派はその手前に立つ。
    CONGRESS_W: { saha: -3.5, chusa: -1.0, chuu: 1.0, uha: 2.5,
      kyosan: -4.5, jiyu: 2.0, hoshu: 4.0 },
    congressRoute: function (Q) {
      var w = this.CONGRESS_W, k, d, num = 0, den = 0;
      var grip = (Q.kyokai_grip === undefined ? 50 : Q.kyokai_grip);
      var ky = Math.round((Q.del_chusa || 0) * grip / 100);
      for (k in w) {
        if (!w.hasOwnProperty(k)) { continue; }
        d = Q['del_' + k] || 0;
        if (k === 'chusa') { d -= ky; }
        if (k === 'saha') { d += ky; }
        num += d * w[k]; den += d;
      }
      var r = den ? num / den : 0;
      r = Math.max(-5, Math.min(5, r));
      var muha = Q.del_muha || 0;
      Q.congress_weight = (den + muha) > 0 ? den / (den + muha) : 1;
      Q.congress_muha_pct = Math.round((1 - Q.congress_weight) * 100);
      Q.congress_route = Math.round(r * 10) / 10;
      Q.congress_gap = Math.round(((Q.route || 0) - r) * 10) / 10;
      return r;
    },

    //  一手ぶん、大会が中央の線を自分のほうへ引く。
    //  一幕（三十二手）ほうっておくと、二目盛りぶん近く戻される。
    CONGRESS_RATE: 0.035,
    //  引き戻しは画面に出す。以前は溜まりも大会の線も見えず、
    //  「何の前触れも無く線が半目盛り右へ動く」という報告になった。
    //    congress_last      この手に動いたか（1 右へ、2 左へ、0 動かず）
    //    congress_drag_pct  次の半目盛りまでの溜まり（％）
    congressDrift: function (Q) {
      var target = this.congressRoute(Q);
      var gap = target - (Q.route || 0);
      Q.congress_last = 0;
      if (Math.abs(gap) < 0.05) { Q.route_drag = 0; Q.congress_drag_pct = 0; return Q; }
      //  党の重心が怒っているとき、大会の引きは強くなる（最大で二倍）。
      //  出て行けない派の怒りは、ここで線を引き戻す力になる。
      var cr = this.CONGRESS_RATE * (1 + Math.min(60, Q.congress_anger || 0) / 60);
      //  無派閥が多いほど引きは鈍い（線そのものは動かさない）
      Q.route_drag = (Q.route_drag || 0) + gap * cr * (Q.congress_weight || 1);
      //  半目盛りたまったら実際に動かす
      while (Q.route_drag <= -0.5) {
        Q.route_drag += 0.5; Q.route = Math.max(-5, (Q.route || 0) - 0.5);
        Q.congress_pulled = (Q.congress_pulled || 0) + 1;
        Q.congress_last = 2;
      }
      while (Q.route_drag >= 0.5) {
        Q.route_drag -= 0.5; Q.route = Math.min(5, (Q.route || 0) + 0.5);
        Q.congress_pulled = (Q.congress_pulled || 0) + 1;
        Q.congress_last = 1;
      }
      Q.congress_drag_pct = Math.round(Math.abs(Q.route_drag || 0) / 0.5 * 100);
      return Q;
    },

    // ── 派閥の勢力と不満をひとまとめにする ──────────────────
    //  代議員票は四つの派閥に散っているが、左派（協会派）の票だけは
    //  独立した派閥になるまで中間左派の中に「掌握度」として入っている。
    //  札の view-if / choose-if は式しか書けないので、
    //  誰が主流で誰が傍流かも、ここで数に焼いておく。
    FAC_KEYS: ['uha', 'chuu', 'chusa', 'saha', 'kyosan', 'hoshu', 'jiyu'],
    //  不満度の「不穏」の入り口。ここから譲る相手として名前が出る
    FAC_ANGRY: 45,
    facPool: function (Q) {
      var d = this.delegates(Q), ks = this.FAC_KEYS, i, k;
      var p = { uha: d.uha, chuu: d.chuu, chusa: d.chusa, saha: d.kyokai + (Q.del_saha || 0),
        kyosan: d.kyosan, hoshu: d.hoshu, jiyu: d.jiyu };
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        p[k] = this.inParty(Q, k) ? Math.max(0, Math.round(p[k] || 0)) : 0;
      }
      return p;
    },

    //  派閥の代議員票を n だけ動かす。実際に動いた票を返す。
    facMove: function (Q, key, n) {
      n = Math.round(n);
      if (!n || !this.inParty(Q, key)) { return 0; }
      if (key === 'saha' && !(Q.del_saha > 0)) {
        //  協会がまだ独立した派閥になっていない盤では、その票は
        //  中間左派の中にある。動かすのは掌握度のほうである。
        var base = Math.max(1, Q.del_chusa || 1);
        var g0 = Q.kyokai_grip || 0;
        var g1 = clamp(g0 + n / base * 100, 0, 100);
        Q.kyokai_grip = Math.round(g1 * 10) / 10;
        return Math.round((g1 - g0) / 100 * base);
      }
      var kk = 'del_' + key, v = Q[kk] || 0;
      var got = n < 0 ? Math.max(n, -v) : n;
      Q[kk] = v + got;
      return got;
    },

    factionState: function (Q) {
      var ks = this.FAC_KEYS, p = this.facPool(Q), i, k, tot = 0, best = null;
      for (i = 0; i < ks.length; i++) { tot += p[ks[i]]; }
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (!this.inParty(Q, k)) { continue; }
        if (best === null || p[k] > p[best]) { best = k; }
      }
      //  委員長の席が空いていたり、その派閥が出て行っていたら、
      //  委員長の派閥は無いものとして数える。
      var chair = this.factionOf(Q.post_chair);
      if (chair && !this.inParty(Q, chair)) { chair = null; }
      Q.fac_main = best ? FNAME[best] : '';
      Q.fac_main_pct = (best && tot) ? Math.round(p[best] / tot * 100) : 0;
      var off = [], ang = [], rows = [], live, isOff, mood, pct;
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        live = this.inParty(Q, k) ? 1 : 0;
        isOff = (live && k !== best && k !== chair) ? 1 : 0;
        mood = Math.round(Q['mood_' + k] || 0);
        pct = tot ? Math.round(p[k] / tot * 100) : 0;
        Q['fac_' + k + '_in'] = live;
        Q['fac_' + k + '_off'] = isOff;
        Q['fac_' + k + '_pct'] = pct;
        Q['fac_' + k + '_mood'] = mood;
        Q['fac_' + k + '_yield'] = (live && mood >= this.FAC_ANGRY) ? 1 : 0;
        if (!live) { continue; }
        if (isOff) { off.push(FNAME[k]); }
        if (mood >= this.FAC_ANGRY) { ang.push(FNAME[k]); }
        rows.push(FNAME[k] + '　' + p[k] + ' 票 <span style="opacity:.6">(' + pct + '%)</span>' +
          '　不满 ' + mood +
          (k === best ? '　<span style="opacity:.6">大会主流派</span>' : '') +
          (k === chair ? '　<span style="opacity:.6">委员长的派阀</span>' : ''));
      }
      Q.fac_off_n = off.length;
      Q.fac_off_list = off.join('、');
      Q.fac_touki_cost = this.FAC_TOUKI_COST;
      Q.fac_angry_n = ang.length;
      Q.fac_angry_list = ang.join('、');
      Q.fac_block = rows.join('<br>');
      return Q;
    },

    //  党紀を締める。委員長の派閥と大会の主流を除いた派閥から票を剥がし、
    //  無派閥へ回す。剥がされた側は当然怒る。
    FAC_TOUKI_COST: 5,
    facDiscipline: function (Q) {
      var ks = this.FAC_KEYS, i, k, moved = 0;
      this.factionState(Q);
      var p = this.facPool(Q);
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (!Q['fac_' + k + '_off']) { continue; }
        moved += -this.facMove(Q, k, -Math.max(8, Math.round(p[k] * 0.12)));
      }
      Q.del_muha = (Q.del_muha || 0) + moved;
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (!this.inParty(Q, k)) { continue; }
        Q['mood_' + k] = (Q['mood_' + k] || 0) + (Q['fac_' + k + '_off'] ? 14 : 6);
      }
      Q.fac_moved = moved;
      return moved;
    },

    //  棚上げ。何も決めないと、決めない側が少しずつ痩せる。
    facShelve: function (Q) {
      var ks = this.FAC_KEYS, i, k, moved = 0;
      this.factionState(Q);
      var p = this.facPool(Q);
      for (i = 0; i < ks.length; i++) {
        k = ks[i];
        if (!this.inParty(Q, k)) { continue; }
        if (Q['fac_' + k + '_off']) {
          moved += -this.facMove(Q, k, -Math.max(3, Math.round(p[k] * 0.04)));
        }
        Q['mood_' + k] = (Q['mood_' + k] || 0) + 3;
      }
      Q.del_muha = (Q.del_muha || 0) + moved;
      Q.fac_moved = moved;
      return moved;
    },

    //  譲る。不満を落として、そのぶん票を積む。
    FAC_YIELD_MOOD: 18,
    FAC_YIELD_DEL: 30,
    facYield: function (Q, key) {
      Q['mood_' + key] = Math.max(0, (Q['mood_' + key] || 0) - this.FAC_YIELD_MOOD);
      Q.fac_moved = this.facMove(Q, key, this.FAC_YIELD_DEL);
      Q.fac_yield_name = FNAME[key] || '';
      this.factionState(Q);
      return Q.fac_moved;
    },

    growMembers: function (Q, n) {
      Q.members = Math.min(this.MEMBER_CAP, Q.members + n);
      Q.budget += Math.round(n / 10000);
      var grip = Q.kyokai_grip / 100;
      var newDel = Math.round(n / 1000);            // 党員1000人 = 代議員1票
      Q.del_chusa += Math.round(newDel * grip);
      var chairF = this.factionOf(Q.post_chair);
      if (chairF && chairF !== 'chusa') {
        Q['del_' + (chairF === 'saha' ? 'chusa' : chairF)] += Math.round(newDel * (1 - grip));
      } else {
        Q.del_chusa += Math.round(newDel * (1 - grip));
      }
      return newDel;
    },

    // ── 脱党判定。中間左派には出口がない ──────────────────────
    //  扉の判定は hasExit に一本化してある。factionPressure と
    //  ここで別の条件を書くと、どちらも拾わない派閣ができる。
    splitCheck: function (Q) {
      var fs = ['uha', 'chuu', 'saha'], i, f;
      for (i = 0; i < fs.length; i++) {
        f = fs[i];
        if (!this.inParty(Q, f)) { continue; }
        if ((Q['mood_' + f] || 0) < 100) { continue; }
        if (this.hasExit(Q, f)) { return f; }
      }
      return null;
    },

    transfer: function (Q, layer, from, to, amt) {
      var k = 'lean_' + layer + '_' + from;
      var a = Math.min(amt, Q[k] || 0);
      Q[k] -= a;
      Q['lean_' + layer + '_' + to] = (Q['lean_' + layer + '_' + to] || 0) + a;
      return a;
    },

    // ── 分裂の実行：内盤から1行消え、外盤に1列生える ──────────
    //  追随率。西尾派は除名という強制退場だったので派閥ごと出た（＝1.0）。
    //  江田や左派の離党は自発的で、実際に付いて行くのは一部にすぎない。
    //  放置した期間が長いほど＝不満度が高いほど、付いて行く者が増える。
    followRate: function (Q, f) {
      if (f === 'uha') { return 1.0; }
      var m = Q['mood_' + f] || 100;
      var r = 0.35 + 0.55 * Math.min(1, Math.max(0, (m - 100) / 60));
      return Math.round(r * 100) / 100;
    },

    applySplit: function (Q, f) {
      // 同じ派閥は二度は割れない。出口党はひとつしかない。
      if (f === 'uha' && Q.minsha_exists) { return 0; }
      if (f === 'chuu' && Q.shamin_exists) { return 0; }
      if (f === 'saha' && Q.shinsha_exists) { return 0; }
      var core, bleed, lost = 0;
      var fr = this.followRate(Q, f);
      Q.split_follow = Math.round(fr * 100);
      Q.splits += 1;

      if (f === 'uha') {
        // 民主社会党 1960.1  ── 隣接する中間右派からも漏れる（河上派の一部）
        core = Q.seat_uha;
        bleed = Math.round(Q.seat_chuu * BLEED);
        Q.seat_uha = 0;
        Q.seat_chuu -= bleed;
        lost = core + bleed;
        Q.del_uha = 0;
        Q.del_chuu = Math.round(Q.del_chuu * (1 - BLEED));
        Q.minsha_exists = 1;
        Q.minsha_seats = lost;
        this.transfer(Q, 'minrou', 'shakai', 'minsha', 24);
        this.transfer(Q, 'mishoshiki', 'shakai', 'minsha', 8);
        this.transfer(Q, 'shinchukan', 'shakai', 'minsha', 6);
        this.transfer(Q, 'jieigyo', 'shakai', 'minsha', 4);
        Q.rel_minsha = -30;
        Q.rel_sohyo += 5;
        Q.route -= 0.5;
        Q.members = Math.round(Q.members * 0.86);
        Q.split_faction = '右派（西尾派）';
        Q.split_party = '民主社会党';
        Q.mood_uha = 0;
        if (this.factionOf(Q.post_diet) === 'uha') { Q.post_diet = 'katsumata'; }
        if (this.factionOf(Q.post_chair) === 'uha') { Q.post_chair = 'suzuki'; }

      } else if (f === 'chuu') {
        // 社会民主連合 1978  ── 都市の無党派・知識人層を持って行く。
        //  議席規模は小さいので外盤に列は作らず「その他」へ流す。
        core = Math.round(Q.seat_chuu * fr);
        bleed = Math.round(Q.seat_chusa * BLEED * 0.5 * fr);
        Q.seat_chuu -= core;
        Q.seat_chusa -= bleed;
        lost = core + bleed;
        Q.del_chuu = Math.round(Q.del_chuu * (1 - fr));
        Q.del_chusa = Math.round(Q.del_chusa * (1 - BLEED * 0.5 * fr));
        Q.shamin_exists = 1;
        this.transfer(Q, 'shinchukan', 'shakai', 'other', Math.round(7 * fr));
        this.transfer(Q, 'mishoshiki', 'shakai', 'other', Math.round(4 * fr));
        Q.route -= 1;
        Q.members = Math.round(Q.members * 0.93);
        Q.split_faction = '中间右派（江田派）';
        Q.split_party = '社会民主联合';
        //  出て行った側の不満は残さない（moodInherit が繰り上げてしまう）
        Q.mood_chuu = 0;
        Q.mood_saha += 8;
        if (this.factionOf(Q.post_chair) === 'chuu') { Q.post_chair = 'sasaki'; }
        if (this.factionOf(Q.post_policy) === 'chuu') { Q.post_policy = 'katsumata'; }
        if (this.factionOf(Q.post_org) === 'chuu') { Q.post_org = 'sasaki'; }
        if (this.factionOf(Q.post_youth) === 'chuu') { Q.post_youth = 'sakisaka'; }

      } else if (f === 'saha') {
        // 新社会党  ── 史実は1996年、窗口外。プレイヤーが右へ押した結果として
        //  起きる反事実。協会が独立した派閥になっていることが前提。
        core = Math.round((Q.seat_saha || 0) * fr);
        bleed = Math.round(Q.seat_chusa * BLEED * 0.7 * fr);
        Q.seat_saha = (Q.seat_saha || 0) - core;
        Q.seat_chusa -= bleed;
        lost = core + bleed;
        Q.del_saha = Math.round((Q.del_saha || 0) * (1 - fr));
        Q.del_chusa = Math.round(Q.del_chusa * (1 - BLEED * 0.7 * fr));
        Q.shinsha_exists = 1;
        // 官公労の左翼部分と平和運動層を持って行く
        this.transfer(Q, 'kokorou', 'shakai', 'other', Math.round(12 * fr));
        this.transfer(Q, 'minrou', 'shakai', 'other', Math.round(4 * fr));
        Q.rel_sohyo -= 14;
        Q.route += 1;
        Q.kyokai_grip = 0;
        Q.members = Math.round(Q.members * 0.88);
        Q.split_faction = '左派（协会派）';
        Q.split_party = '新社会党';
        Q.mood_saha = 0;
        if (this.factionOf(Q.post_youth) === 'saha') { Q.post_youth = 'eda'; }
        if (this.factionOf(Q.post_org) === 'saha') { Q.post_org = 'narita'; }
      }

      Q.seats_hr = Math.max(0, Q.seats_hr - lost);
      Q.split_lost = lost;
      this.refresh(Q);
      return lost;
    },

    // ── 人物 ────────────────────────────────────────────────
    FIGURES: {
      suzuki:    { name: '鈴木茂三郎', faction: 'chusa', note: '統一社会党初代委員長' },
      asanuma:   { name: '浅沼稲次郎', faction: 'chusa', note: '「人間機関車」' },
      sasaki:    { name: '佐々木更三', faction: 'chusa', note: '鈴木の腹心' },
      katsumata: { name: '勝間田清一', faction: 'chusa', note: '政策通' },
      narita:    { name: '成田知巳',   faction: 'chusa', note: '党務型' },
      eda:       { name: '江田三郎',   faction: 'chuu',  note: '構造改革論' },
      kawakami:  { name: '河上丈太郎', faction: 'chuu',  note: '右派の長老' },
      wada:      { name: '和田博雄',   faction: 'chuu',  note: '元農相' },
      nishio:    { name: '西尾末広',   faction: 'uha',   note: '民主社会主義' },
      sone:      { name: '曽禰益',     faction: 'uha',   note: '西尾派' },
      sakisaka:  { name: '向坂逸郎',   faction: 'saha',  note: '社会主義協会' }
    },
    //  人物は jsp-leaders.js の FIG が正本で、FIGURES は第Ⅰ〜Ⅱ幕ぶんの
    //  控えでしかない。三十六人のうち二十五人が FIGURES に無く、
    //  factionOf が null を返していた ── 派閥の受動効果も、分裂後の
    //  人事の後始末も、民主リベラル新党の門も、そこで外れていた。
    //  正本を先に見て、無ければ控えを見る。
    figOf: function (id) {
      if (!id) { return null; }
      var L = this.LEADERS;
      if (L && L.FIG && L.FIG[id]) { return L.FIG[id]; }
      return this.FIGURES[id] || null;
    },
    factionOf: function (id) {
      var f = this.figOf(id);
      return f ? f.faction : null;
    },
    nameOf: function (id) {
      var f = this.figOf(id);
      return f ? f.name : '（空缺）';
    },
    postLine: function (Q, post) {
      var id = Q['post_' + post];
      var f = this.figOf(id);
      if (!f) { return '（空缺）'; }
      return f.name + ' <span style="opacity:.65;font-size:.9em">' + FNAME[f.faction] + '</span>';
    },

    //  脇柱（指導部の面）の党の六役（N7）。役職・人・派閥の三つの欄の格子にして、一つの役職を一行に収める
    //  （前は「国会対策委員長　岡田春夫 中間左派（鈴木–佐々木派）」が脇柱の幅で二行に折れ、六役で 252px あった）。
    //  派閥は括弧の中（西尾派・鈴木–佐々木派など）を落とした名で出す。括弧の中は派閥の面の見出しにある。
    //  事象の文と指導部の頁が読む line_* は前のまま。
    POST_SIDE: [['chair', '委员长'], ['secgen', '书记长'], ['policy', '政策审议会长'],
                ['diet', '国会对策委员长'], ['org', '组织局长'], ['youth', '青年部长']],
    postGrid: function (Q) {
      var out = [], i, p, f;
      for (i = 0; i < this.POST_SIDE.length; i++) {
        p = this.POST_SIDE[i];
        f = this.figOf(Q['post_' + p[0]]);
        out.push('<span>' + p[1] + '</span>' + (f
          ? '<span class="jsp-gw">' + f.name + '</span><span class="jsp-gd">'
            + String(FNAME[f.faction] || '').replace(/（[^（]*）$/, '') + '</span>'
          : '<span class="jsp-gw">' + '空缺' + '</span><span></span>'));
      }
      return '<span class="jsp-grid jsp-pt">' + out.join('') + '</span>';
    },

    // ══════════════════════════════════════════════════════════
    //  この一手の変化（N5）
    //
    //  脇柱の「この一手の変化／前の一手の変化」と、結果の頁の「長く残ること」。
    //  盤の値を一つの JSON に写して（文字列の quality）、あとで引き比べる。盤の算術には入らない。
    //    td0      この手の初め（執行部に着いたとき）の写し
    //    tdS      いまの一歩の初めの写し。一歩は、事象の選択の頁（markEventDone）・執行部（札と指導部）・
    //             改憲の手段と採決の結果（kaikenLever・kaikenDelay・kaikenWin・kaikenLose）で開く
    //    tdD      この手のうちに決定が動かした分の積み（一歩を閉じるたびに足す）
    //    tdN      党外の出来事が動かした分の積み（A5c の fireNews が tdNewsBegin / tdNewsEnd で挟む。いまは空）
    //    td_open  一歩が開いているか　　td_seq  td0 を取った手（turn_n）
    //  一歩は endturn の先頭と after_event で閉じる。そのあと endturn が払う入りと出・不満の漂い・
    //  基線への戻り・選挙は決定に入らないので、行の差の 6 割以上がそちらなら「（毎手の自然な動き）」と添える。
    //  幕が替わるとき（carryOver・sandboxStart）は全部捨てる。幕の切り替えそのものを変化に数えないため。
    //  語はすべて FXV（下の generated:fxvocab。tools/fx-vocab.mjs が元）から取る。
    // ══════════════════════════════════════════════════════════
    NEAR_EXIT: 85,          //  脇柱の「出口の前にいる」（主画面の赤字と同じ線）
    //  議席見込み（いま）。盤を写さず、Q を前に置いた薄い重ね（Object.create）の上で数える。
    //  allocate が負の傾向を 0 に挟む書き込みも重ねに落ちるので、盤は触らない。
    tdForeNow: function (Q) { return this.seatForecast(Object.create(Q)).seats; },
    tdBase: function (Q) {
      var bl = {}, i;
      for (i = 0; i < LAYERS.length; i++) { bl[LAYERS[i]] = this.baselineLean(Q, LAYERS[i]); }
      return bl;
    },
    //  押した票がすべて基線へ戻ったときの見込み（「うち約 N はやがて薄れる」の N を出すため）。
    //  この見込みは社会と自民のあいだの押し引きでは変わらない（二党の和と基線で決まる）ので、
    //  開票が読む値を鍵にして、前と同じなら数え直さない。
    tdForeBase: function (Q, bl) {
      var i, l, s0, key = [Q.kouho, Q.nom_bonus, Q.hr_total, Q.senkyoku_seido, Q.jimin_kiban];
      bl = bl || this.tdBase(Q);
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        key.push(bl[l], (Q['lean_' + l + '_jimin'] || 0) + (Q['lean_' + l + '_shakai'] || 0), Q['lean_' + l + '_minsha'],
                 Q['lean_' + l + '_komei'], Q['lean_' + l + '_kyosan'], Q['lean_' + l + '_other'], Q['pop_' + l], Q['org_' + l]);
      }
      key = key.join('|');
      var C = this._tdfb;
      if (C && C.k === key) { return C.v; }
      var cb = Object.create(Q);
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        s0 = Q['lean_' + l + '_shakai'] || 0;
        cb['lean_' + l + '_jimin'] = (Q['lean_' + l + '_jimin'] || 0) - (bl[l] - s0);
        cb['lean_' + l + '_shakai'] = bl[l];
      }
      var v = this.seatForecast(cb).seats;
      this._tdfb = { k: key, v: v };
      return v;
    },
    //  票の組ごとの基線（人口で重み付け）
    tdGroupBase: function (Q, v, bl) {
      var G = this.FXV.GRPL, g, i, l, w, sb, pop;
      bl = bl || this.tdBase(Q);
      for (g in G) {
        if (!G.hasOwnProperty(g)) { continue; }
        w = 0; sb = 0;
        for (i = 0; i < G[g].length; i++) { l = G[g][i]; pop = Number(Q['pop_' + l]) || 0; w += pop; sb += pop * bl[l]; }
        v['gb_' + g] = w > 0 ? sb / w : 0;
      }
      return v;
    },
    //  比べる値の一式。数でないものは 0（文字列で持つものは s_ を付ける）。
    //  lite：refresh の中で使う軽い版。議席見込みは refresh が数えたばかりの fc_seats を使い、
    //  基線の見込み（fore_base）と票の基線（gb_*）は数えない（tdRows が要るときだけ数える）。
    //  そのまま写す数の鍵（写しの名 ← 盤の名）。一度だけ組む。
    tdKeys: function () {
      var K = [['hr', 'seats_hr'], ['budget', 'budget'], ['capital', 'capital'], ['members', 'members'], ['route', 'route'],
               ['grip', 'kyokai_grip'], ['debt', 'local_debt'], ['local_n', 'local_n'], ['nom_bonus', 'nom_bonus']], i, k, f;
      for (f in this.FXV.FAC) { if (this.FXV.FAC.hasOwnProperty(f)) { K.push(['mood_' + f, 'mood_' + f]); } }
      for (k in this.FXV.REL) { if (this.FXV.REL.hasOwnProperty(k)) { K.push([k, k]); } }
      for (i = 0; i < LAYERS.length; i++) { K.push(['orgb_' + LAYERS[i], 'orgb_' + LAYERS[i]], ['capb_' + LAYERS[i], 'capb_' + LAYERS[i]]); }
      for (k in this.POLICY) { if (this.POLICY.hasOwnProperty(k)) { K.push(['pol_' + k, 'pol_' + k]); } }
      var F = ['michi_adopted', 'kozo_kaikaku', 'minsha_ka', 'kyosan_haijo', 'saha_independent', 'senkyoku_seido',
               'splits', 'nl_intake', 'nl_distance', 'nl_fallout_done', 'capital_extra', 'left_unity_pts',
               'seiji_kaikaku_an', 'sagawa_seido', 'kyosan_merged', 'minshu_shinto', 'opp_merged', 'jisha_pact', 'in_power'];
      for (i = 0; i < F.length; i++) { K.push([F[i], F[i]]); }
      var G = [], g;
      for (g in this.FXV.GRPL) {
        if (this.FXV.GRPL.hasOwnProperty(g)) {
          G.push(['g_' + g, this.FXV.GRPL[g].map(function (l) { return ['pop_' + l, 'lean_' + l + '_shakai']; })]);
        }
      }
      this._tdk = { num: K, grp: G, fac: Object.keys(this.FXV.FAC) };
      return this._tdk;
    },
    tdVals: function (Q, lite) {
      var v = {}, i, j, x, w, sum, pop, K = this._tdk || this.tdKeys();
      var num = function (y) { y = Number(y); return isFinite(y) ? y : 0; };
      if (lite) { v.fore = num(Q.fc_seats); }
      else {
        var bl = this.tdBase(Q);
        v.fore = this.tdForeNow(Q); v.fore_base = this.tdForeBase(Q, bl);
        this.tdGroupBase(Q, v, bl);
      }
      for (i = 0; i < K.num.length; i++) { v[K.num[i][0]] = num(Q[K.num[i][1]]); }
      v.kouho = num(this.nomPlanned(Q));
      for (i = 0; i < K.fac.length; i++) { v['in_' + K.fac[i]] = this.inParty(Q, K.fac[i]) ? 1 : 0; }
      for (i = 0; i < K.grp.length; i++) {
        w = 0; sum = 0;
        for (j = 0; j < K.grp[i][1].length; j++) {
          x = K.grp[i][1][j]; pop = num(Q[x[0]]); w += pop; sum += pop * num(Q[x[1]]);
        }
        v[K.grp[i][0]] = w > 0 ? sum / w : 0;
      }
      v.keimou = num(Q.keimou_open) + num(Q.keimou_seinen) + num(Q.keimou_kakudai);
      v.jimin_kiban = (Q.jimin_kiban === undefined) ? 100 : num(Q.jimin_kiban);
      v.kokutetsu_done = Q.kokutetsu_kind ? 1 : 0;
      v.s_shunto = Q.shunto_form ? String(Q.shunto_form) : '';
      v.s_party = Q.party_name ? String(Q.party_name) : '';
      return v;
    },
    //  写しを文字列にする（端数は四桁で切る。盤の値は一段の数なので浅い写しで足りる）
    tdPack: function (v) {
      var o = {}, k;
      for (k in v) {
        if (!v.hasOwnProperty(k)) { continue; }
        o[k] = (typeof v[k] === 'number') ? Math.round(v[k] * 10000) / 10000 : v[k];
      }
      return JSON.stringify(o);
    },
    //  控えの読み。refresh のたびに同じ文字列を読み直さないよう、最近読んだ数個を覚えておく
    //  （同じ文字列なら === がすぐ決まる）。読んだものは書き換えないこと。
    tdParse: function (s) {
      if (!s) { return null; }
      var C = this._tdc || (this._tdc = []), i, o = null;
      for (i = 0; i < C.length; i++) { if (C[i][0] === s) { return C[i][1]; } }
      try { o = JSON.parse(s); } catch (e) { o = null; }
      C.unshift([s, o]);
      if (C.length > 6) { C.length = 6; }
      return o;
    },
    tdTake: function (Q, slot) { Q[slot] = this.tdPack(this.tdVals(Q)); return Q; },
    //  差を積む（数の値だけ。0 の項は持たない）。acc は書き換えずに新しい表を返す。
    tdAccum: function (acc, from, to) {
      var D = {}, k, x;
      if (acc) { for (k in acc) { if (acc.hasOwnProperty(k)) { D[k] = acc[k]; } } }
      for (k in to) {
        if (!to.hasOwnProperty(k) || typeof to[k] !== 'number' || typeof from[k] !== 'number') { continue; }
        x = Math.round(((D[k] || 0) + to[k] - from[k]) * 10000) / 10000;
        if (x) { D[k] = x; } else { delete D[k]; }
      }
      return D;
    },
    //  一歩を開く。開いたままの一歩があれば、先に閉じる（指導部の札で執行部へ戻ったときなど）。
    tdStep: function (Q) {
      if (Q.td_open) { this.tdClose(Q); }
      this.tdTake(Q, 'tdS');
      Q.td_open = 1;
      Q.big_done = '';      //  前の一歩で決めた重大な決定の控え（bigDone）は、新しい一歩には持ち越さない
      return Q;
    },
    //  一歩を閉じる。一歩の初めからいままでの差を、決定の分として積む。
    tdClose: function (Q) {
      if (!Q.td_open) { return Q; }
      Q.td_open = 0;
      var s = this.tdParse(Q.tdS);
      if (!Q.td0 || !s) { return Q; }
      Q.tdD = JSON.stringify(this.tdAccum(this.tdParse(Q.tdD), s, this.tdVals(Q)));
      return Q;
    },
    //  執行部に着いたとき（main の on-arrival）。手が進んでいれば、前の手の行を
    //  「前の一手の変化」として留めてから、この手の写しを取り直す。そのあと一歩を開く（札と指導部）。
    tdTurn: function (Q) {
      if (Q.td_open) { this.tdClose(Q); }
      this.bigClear(Q);     //  執行部は重大な決定の頁ではない。脇柱の「この決定の見込み」を下げる
      var seq = Q.turn_n || 0;
      if (!Q.td0) {
        this.tdTake(Q, 'td0'); Q.tdD = ''; Q.tdN = ''; Q.td_seq = seq; Q.disp_td_last = '';
      } else if (Q.td_seq !== seq) {
        var rows = this.tdRows(Q, this.tdVals(Q));
        Q.disp_td_last = rows.length ? this.tdRender(this.FXV.TD.title_last, rows) : '';
        this.tdTake(Q, 'td0'); Q.tdD = ''; Q.tdN = ''; Q.td_seq = seq;
      }
      this.tdStep(Q);
      return Q;
    },
    tdReset: function (Q) {
      Q.td0 = ''; Q.tdS = ''; Q.tdD = ''; Q.tdN = ''; Q.tdNS = '';
      Q.td_open = 0; Q.td_seq = -1;
      Q.disp_td_last = ''; Q.disp_td = ''; Q.disp_fx_lt = ''; Q.td_show = 0;
      this.bigClear(Q); Q.big_done = '';
      return Q;
    },
    //  党外の出来事（A5c）。fireNews の前後をこの二つで挟むと、動いた分が「（党外の出来事）」になる。
    tdNewsBegin: function (Q) { if (Q.td0) { this.tdTake(Q, 'tdNS'); } return Q; },
    tdNewsEnd: function (Q) {
      var s = this.tdParse(Q.tdNS);
      if (Q.td0 && s) { Q.tdN = JSON.stringify(this.tdAccum(this.tdParse(Q.tdN), s, this.tdVals(Q))); }
      Q.tdNS = '';
      return Q;
    },
    tdFill: function (s, o) {
      return String(s).replace(/\{(\w+)\}/g, function (m, k) { return (o && o[k] !== undefined) ? o[k] : m; });
    },
    //  長く残る変化。a から z までの差で見る（組織と上積みは dec があればその分で見る。組織は毎手少しずつ溶けるため）。
    //  box = 1 は結果の頁の文（路線と候補も入れる）、0 は脇柱の行（路線と候補は別の行で出る）。
    tdLt: function (Q, a, z, dec, box) {
      var out = [], L = this.FXV.LT, X = this.FXV.LTX, P = this.FXV.LTPRI, T = this.FXV.TH, self = this, i, k, l;
      var d = function (key) { return (z[key] || 0) - (a[key] || 0); };
      var on = function (key) { return !a[key] && !!z[key]; };
      var put = function (key, pri, opt, ltx, cls) { out.push({ k: key, p: pri, t: opt, x: ltx, c: cls || 'neutral' }); };
      var dd = function (key) { return dec ? (typeof dec.get === 'function' ? dec.get(key) : (dec[key] || 0)) : d(key); };
      var who = function (pre, th) {
        var hit = {}, n = 0, g, G = self.FXV.GRPL, names = [];
        for (i = 0; i < LAYERS.length; i++) { if (dd(pre + LAYERS[i]) >= th) { hit[LAYERS[i]] = 1; n += 1; } }
        if (!n) { return ''; }
        for (g in G) {
          if (G.hasOwnProperty(g) && hit[G[g][0]] && hit[G[g][1]]) { names.push(self.FXV.PPL[g]); hit[G[g][0]] = 0; hit[G[g][1]] = 0; }
        }
        for (i = 0; i < LAYERS.length; i++) { if (hit[LAYERS[i]]) { names.push(self.FXV.PPL[LAYERS[i]]); } }
        return names.reduce(function (acc, x) { return acc ? self.tdFill(self.FXV.TD.join, { a: acc, b: x }) : x; }, '');
      };
      if (on('michi_adopted')) { put('michi_on', P.michi, L.michi_on, X.michi_on, 'bad'); }
      if (a.michi_adopted && !z.michi_adopted) { put('michi_off', P.michi, L.michi_off, X.michi_off, 'good'); }
      if (on('kozo_kaikaku')) { put('kozo_on', P.kozo, L.kozo_on, X.kozo_on, 'good'); }
      if (on('minsha_ka')) { put('minsha_ka', P.minsha_ka, L.minsha_ka, X.minsha_ka); }
      if (d('splits') > 0) { put('splits', P.splits, L.splits, X.splits, 'bad'); }
      if (d('senkyoku_seido') !== 0) { put('seido', P.seido, L.seido, X.seido); }
      if (on('kyosan_haijo')) { put('kyosan_haijo', P.kyosan_haijo, L.kyosan_haijo, X.kyosan_haijo); }
      if (on('saha_independent')) { put('saha_indep', P.saha_indep, L.saha_indep, X.saha_indep); }
      if (on('seiji_kaikaku_an') || on('sagawa_seido')) { put('ldp_seed', P.ldp_seed, L.ldp_seed, X.ldp_seed); }
      for (k in this.POLICY) {
        if (this.POLICY.hasOwnProperty(k) && d('pol_' + k) !== 0) {
          put('policy', P.policy, this.tdFill(L.policy, { name: this.POLICY[k].name }),
              this.tdFill(X.policy, { name: this.POLICY[k].name }));
        }
      }
      var org = who('orgb_', T.orgb);
      if (org) { put('organise', P.organise, this.tdFill(L.organise, { p: org }), this.tdFill(X.organise, { p: org }), 'good'); }
      var cap = who('capb_', 0.5);
      if (cap) { put('capBonus', P.capBonus, this.tdFill(L.capBonus, { p: cap }), this.tdFill(X.capBonus, { p: cap }), 'good'); }
      if (!z.nl_fallout_done && (d('nl_intake') > 0 || d('nl_distance') <= -6)) {
        put('newleft', P.newleft, d('nl_intake') > 0 ? L.nl_intake : L.nl_near, X.newleft, 'bad');
      }
      if (d('capital_extra') > 0) { put('capital_extra', P.capital_extra, L.capital_extra, X.capital_extra, 'good'); }
      if (d('left_unity_pts') > 0) { put('labor_front', P.labor_front, L.labor_front, X.labor_front); }
      if (d('keimou') > 0) { put('keimou', P.keimou, L.keimou, X.keimou, 'good'); }
      if (d('jimin_kiban') < 0) { put('kiban', P.kiban, L.kiban, X.kiban, 'good'); }
      if (d('local_n') > 0) { put('local', P.local, L.local_gain, X.local_gain); }
      if (d('local_n') < 0) { put('local', P.local, L.local_loss, X.local_loss); }
      if (z.s_shunto && z.s_shunto !== a.s_shunto) { put('shunto_form', P.shunto_form, L.shunto_form, X.shunto_form); }
      if (on('kokutetsu_done')) { put('kokutetsu', P.kokutetsu, L.kokutetsu, X.kokutetsu); }
      if ((z.s_party && a.s_party && z.s_party !== a.s_party) || on('kyosan_merged') || on('minshu_shinto') ||
          on('opp_merged') || d('jisha_pact') !== 0) { put('party_form', P.party_form, L.party_form, X.party_form); }
      if (box) {
        if (Math.abs(d('route')) >= 0.5) {
          put('route', P.route, d('route') > 0 ? L.route_r : L.route_l, d('route') > 0 ? X.route_r : X.route_l);
        }
        if (d('nom_bonus') > 0 || d('kouho') >= T.kouho) { put('candidates', P.candidates, '', X.candidates); }
      }
      out.sort(function (p, q) { return q.p - p.p; });
      return out;
    },
    //  脇柱の行。td0 からいま（z）まで。決定の分は tdD に、開いている一歩の分を足したもの。
    tdRows: function (Q, z) {
      var a = this.tdParse(Q.td0);
      if (!a) { return []; }
      var st = Q.td_open ? this.tdParse(Q.tdS) : null;
      //  決定の分：閉じた一歩の積み（tdD）に、開いている一歩の分（いま − tdS）を足したもの。要る鍵だけ数える。
      var D0 = this.tdParse(Q.tdD) || {};
      var decOf = function (key) {
        return (D0[key] || 0) + ((st && typeof st[key] === 'number') ? (z[key] || 0) - st[key] : 0);
      };
      var dec = { get: decOf };
      var nws = this.tdParse(Q.tdN) || {};
      var T = this.FXV.TD, H = this.FXV.TH, P = this.FXV.PRI, rows = [], self = this, i, k, f, g;
      var d = function (key) { return (z[key] || 0) - (a[key] || 0); };
      var n0 = function (x) { return Math.round(Math.abs(x)); };
      var tag = function (key, dd) {
        var nat = dd - decOf(key) - (nws[key] || 0);
        if (Math.abs(nat) >= H.passive * Math.abs(dd)) { return T.passive; }
        if (Math.abs(nws[key] || 0) >= H.passive * Math.abs(dd)) { return T.news; }
        return '';
      };
      var fresh = function (key, th) { return st ? Math.abs((z[key] || 0) - (st[key] || 0)) >= th : false; };
      var blc = null, getBl = function () { return blc || (blc = self.tdBase(Q)); };
      var add = function (pri, cls, text, q, isNew) { rows.push({ p: pri, c: cls, t: text, q: q || '', n: isNew ? 1 : 0 }); };
      //  長期
      var lt = this.tdLt(Q, a, z, dec, 0), cityLt = false, ltNew = {};
      if (st && lt.length) {
        var ls = this.tdLt(Q, st, z, null, 0);
        for (i = 0; i < ls.length; i++) { ltNew[ls[i].t] = 1; }
      }
      for (i = 0; i < lt.length; i++) {
        add(P.lt + lt[i].p / 1000, lt[i].c, this.tdFill(T.lt, { x: lt[i].t }), '', !!ltNew[lt[i].t]);
        if (lt[i].k === 'michi_on' || lt[i].k === 'michi_off' || lt[i].k === 'kozo_on') { cityLt = true; }
      }
      //  衆院（選挙・分裂・合同でしか動かない。自然な動きの添え書きはしない）
      var dh = d('hr');
      if (Math.abs(dh) >= H.hr) { add(P.hr, dh > 0 ? 'good' : 'bad', this.tdFill(dh > 0 ? T.hr_up : T.hr_dn, { n: n0(dh), v: n0(z.hr) }), '', fresh('hr', H.hr)); }
      //  議席見込み（うち押した票の分はやがて基線へ戻る）
      var df = d('fore');
      if (Math.abs(df) >= H.fore) {
        var qf = tag('fore', df), tt = '';
        if (!qf && z.fore_base === undefined) { z.fore_base = this.tdForeBase(Q, getBl()); }
        var tmp = qf ? 0 : df - d('fore_base');
        if (!qf && tmp * df > 0 && Math.abs(tmp) >= H.foreTmp) { tt = Math.min(n0(tmp), n0(df)); }
        add(P.fore + Math.abs(df), df > 0 ? 'good' : 'bad',
            this.tdFill(tt ? (df > 0 ? T.fore_up_t : T.fore_dn_t) : (df > 0 ? T.fore_up : T.fore_dn), { n: n0(df), v: n0(z.fore), t: tt }),
            qf, fresh('fore', H.fore));
      }
      //  派閥の不満（出て行った派閥は出さない。継いだ派閥の行に出る）
      for (f in this.FXV.FAC) {
        if (!this.FXV.FAC.hasOwnProperty(f) || !z['in_' + f]) { continue; }
        var dm = d('mood_' + f);
        if (Math.abs(dm) < H.mood) { continue; }
        add(P.mood * Math.abs(dm), dm > 0 ? 'bad' : 'good',
            this.tdFill(dm > 0 ? T.mood_up : T.mood_dn, { f: this.FXV.FAC[f] }) + ((dm > 0 && Q['near_' + f]) ? T.mood_near : ''),
            tag('mood_' + f, dm), fresh('mood_' + f, H.mood));
      }
      //  路線
      var dr = d('route');
      if (Math.abs(dr) >= H.route) {
        add(P.route * Math.abs(dr), 'neutral', this.tdFill(dr > 0 ? T.route_r : T.route_l, { band: Q.band_name || '' }),
            tag('route', dr), fresh('route', H.route));
      }
      //  他党・組合との関係
      for (k in this.FXV.REL) {
        if (!this.FXV.REL.hasOwnProperty(k)) { continue; }
        var R = this.FXV.REL[k];
        if (R.gate && !Q[R.gate]) { continue; }
        var dl = d(k);
        if (Math.abs(dl) < H.rel) { continue; }
        add(P.rel * Math.abs(dl), R.neutral ? 'neutral' : (dl > 0 ? 'good' : 'bad'),
            this.tdFill(dl > 0 ? T.rel_up : T.rel_dn, { a: k === 'rel_minsha' ? (Q.minsha_short || '民社') : R.name }),
            tag(k, dl), fresh(k, H.rel));
      }
      //  資金・政治資源（残りが負なら「足りない」と言う）
      var money = function (key, th, pri, up, dn, neg) {
        var dx = d(key), v = z[key] || 0;
        if (Math.abs(dx) < th) { return; }
        add(pri * Math.abs(dx), dx > 0 ? 'good' : 'bad',
            self.tdFill(dx > 0 ? up : (v < 0 ? neg : dn), { n: n0(dx), v: n0(v) }), tag(key, dx), fresh(key, th));
      };
      money('budget', H.budget, P.budget, T.budget_up, T.budget_dn, T.budget_dn_neg);
      money('capital', H.capital, P.capital, T.capital_up, T.capital_dn, T.capital_dn_neg);
      //  票（三つの組を人口で重み付け）。添え書きは一つだけ：基線ごと動いた／前の押しが戻っている／一時的
      for (g in this.FXV.GRP) {
        if (!this.FXV.GRP.hasOwnProperty(g) || (g === 'city' && cityLt)) { continue; }
        var dv = d('g_' + g);
        if (Math.abs(dv) < H.vote) { continue; }
        if (z['gb_' + g] === undefined) { this.tdGroupBase(Q, z, getBl()); }
        var db = d('gb_' + g), qv;
        if (Math.abs(db) >= 0.5 * Math.abs(dv) && db * dv > 0) { qv = T.vote_lasting; }
        else if (tag('g_' + g, dv) && dv < 0 && (a['g_' + g] || 0) > (a['gb_' + g] || 0)) { qv = T.vote_fading; }
        else { qv = T.vote_tmp; }
        add(P.vote * Math.abs(dv), dv > 0 ? 'good' : 'bad', this.tdFill(dv > 0 ? T.vote_up : T.vote_dn, { g: this.FXV.GRP[g] }),
            qv, fresh('g_' + g, H.vote));
      }
      var dg = d('grip');
      if (Math.abs(dg) >= H.grip) { add(P.grip * Math.abs(dg), 'neutral', dg > 0 ? T.grip_up : T.grip_dn, tag('grip', dg), fresh('grip', H.grip)); }
      var dme = d('members');
      if (Math.abs(dme) >= H.members) {
        add(P.members * Math.abs(dme), dme > 0 ? 'good' : 'bad', this.tdFill(dme > 0 ? T.mem_up : T.mem_dn, { n: n0(dme) }),
            tag('members', dme), fresh('members', H.members));
      }
      var dk = d('kouho');
      if (Math.abs(dk) >= H.kouho) {
        add(P.kouho * Math.abs(dk), 'neutral', this.tdFill(dk > 0 ? T.kouho_up : T.kouho_dn, { n: n0(dk), v: n0(z.kouho) }),
            tag('kouho', dk), fresh('kouho', H.kouho));
      }
      var dd2 = d('debt');
      if (Math.abs(dd2) >= H.debt) { add(P.debt * Math.abs(dd2), dd2 > 0 ? 'bad' : 'good', dd2 > 0 ? T.debt_up : T.debt_dn, tag('debt', dd2), fresh('debt', H.debt)); }
      rows.sort(function (p, q) { return q.p - p.p; });
      if (rows.length > H.maxRows) {
        var more = rows.length - (H.maxRows - 1);
        rows = rows.slice(0, H.maxRows - 1);
        rows.push({ p: 0, c: 'more', t: this.tdFill(T.more, { n: more }), q: '', n: 0 });
      }
      return rows;
    },
    //  行を脇柱の塊にする。矢印を <b> で包み、良し悪しの色を付ける。
    tdRender: function (title, rows) {
      var h = '<span class="jsp-td"><span class="jsp-td-h">' + title + '</span>', i, r;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        if (r.c === 'more') { h += '<span class="jsp-td-r jsp-td-more">' + r.t + '</span>'; continue; }
        h += '<span class="jsp-td-r ' + r.c + (r.n ? ' new' : '') + '">' +
          String(r.t).replace(/([↑↓←→])/, '<b>$1</b>') + (r.q ? '<span class="jsp-td-q">' + r.q + '</span>' : '') + '</span>';
      }
      return h + '</span>';
    },
    //  結果の頁の「長く残ること」。いまの一歩の初め（tdS）からの長く残る差を、文で三つまで。無ければ空。
    ltRender: function (Q, s, z) {
      if (!s) { return ''; }
      var lt = this.tdLt(Q, s, z, null, 1), i, h = '', seen = {};
      for (i = 0; i < lt.length && i < this.FXV.TH.ltBox; i++) {
        if (seen[lt[i].x]) { continue; }
        seen[lt[i].x] = 1;
        h += '<span class="jsp-lt-r">' + lt[i].x + '</span>';
      }
      //  重大な決定の結果の頁（bigDone）なら、その決定だけの文を足す（汎用の文で拾えないもの）
      var bl = this.bigLt(Q);
      if (bl && !seen[bl]) { h += '<span class="jsp-lt-r">' + bl + '</span>'; }
      return h ? '<span class="jsp-lt"><span class="jsp-lt-h">' + this.FXV.LTX.head + '</span>' + h + '</span>' : '';
    },
    //  refresh の最後。脇柱の塊（disp_td）と結果の頁の箱（disp_fx_lt）を作る。
    //  この手にまだ変化が無ければ「前の一手の変化」を出す。
    tdRefresh: function (Q) {
      if (!Q.td0) {
        Q.disp_td = Q.disp_td_last || ''; Q.disp_fx_lt = ''; Q.td_show = Q.disp_td ? 1 : 0;
        return Q;
      }
      var z = this.tdVals(Q, true), i;
      //  一つの頁で refresh は何度も走る（頁の on-arrival と脇柱）。控えと盤の値が前と同じなら前の結果を使う。
      var sig = [Q.td0, Q.tdS, Q.tdD, Q.tdN, Q.td_open ? 1 : 0, Q.disp_td_last || '', Q.band_name || '', Q.minsha_short || '',
                 Q.ym || 0, Q.near_uha, Q.near_chuu, Q.near_saha, Q.komei_exists, Q.minsha_exists, Q.domei_exists,
                 Q.rengo_formed, Q.big_done || '', Q.sohyo_giin || 0];
      for (var zk in z) { if (z.hasOwnProperty(zk)) { sig.push(z[zk]); } }
      for (i = 0; i < LAYERS.length; i++) { sig.push(Q['lean_' + LAYERS[i] + '_shakai']); }
      sig = sig.join('|');
      var M = this._tdm;
      if (M && M.sig === sig) {
        Q.td_rows = M.rows; Q.disp_td = M.td; Q.disp_fx_lt = M.lt; Q.td_show = M.td ? 1 : 0;
        return Q;
      }
      var rows = this.tdRows(Q, z);
      Q.td_rows = rows.length;
      Q.disp_td = rows.length ? this.tdRender(this.FXV.TD.title, rows) : (Q.disp_td_last || '');
      Q.disp_fx_lt = Q.td_open ? this.ltRender(Q, this.tdParse(Q.tdS), z) : '';
      Q.td_show = Q.disp_td ? 1 : 0;
      this._tdm = { sig: sig, rows: Q.td_rows, td: Q.disp_td, lt: Q.disp_fx_lt };
      return Q;
    },

    // ══════════════════════════════════════════════════════════
    //  この決定の見込み（N6、(e) の前半）
    //
    //  党の形を長く動かす手書きの決定（下の BIG の十の鍵）の頁に着いたとき、脇柱の状況の面の頭に
    //  「この決定の見込み」を出す。事象の頁には数を置かない（計画 §2 の一）。数は脇柱にだけ、符号なしで出し、
    //  多い少ないは色で言う。
    //    bigFrame(Q, key)      決定の頁の on-arrival の終わりで呼ぶ。Q.big_key・Q.disp_big・Q.big_show を書き、
    //                          状況の面へ一度だけ切り替える（bigTab。crisisTab と同じ置き方）
    //    bigDone(Q, key, opt)  結果の頁の on-arrival で呼ぶ（refresh の前）。脇柱の札を下げ、選んだ手を控える。
    //                          控え（big_done）は結果の頁の「長く残ること」（ltRender）だけが読む
    //    bigClear(Q)           札を下げる（執行部に着いたとき・見送ったとき・幕の替わり目）
    //  見込みは Q の写しの上で数える（seatForecast の opt.perm と fcCopy）。盤は触らない。
    //  選択肢の fx は、場面の on-arrival と同じ動きを写しに掛ける。場面を直したらここも直すこと
    //  （tools/audit-big.mjs が、場面を実際に選んだときの差と突き合わせる）。
    //  議席の見込み（bigSeats）：「いまのまま」は脇柱の「いま総選挙なら議席見込み」と同じ数。選択肢の行は、
    //  その選択肢が動かす分だけを次の総選挙のころの効き方で足す ── 押した票は総選挙までの手数ぶん薄れ、
    //  基線の動き（「道」・構造改革・路線）はそのぶん効いてくる。ほかの押した票はいまの高さのまま置く。
    //  分岐の実測（N6、同じ乱数で四通りずつ続けた 48 局面）で、いまある押した票まで基線へ戻して数える形より
    //  総評の候補の向きがよく合った（73% と 63%）。打ち続ければ票はまた押されるからである。
    //  seats: 2 の決定は「その先」（押した票がすべて基線へ戻ったとき）も並べる。
    //  路線・連合・分裂の議席への効き方は、路線の帯と、そのあと出る事象と、派閥の反発を通じて大きくなるので、
    //  式では当たらない（分岐の実測で、路線を一つ左へ動かすと式は約四議席、実際は約四十八議席）。それらは語だけで言う。
    // ══════════════════════════════════════════════════════════
    BIG: {
      //  構造改革論争（act2.kozo_1962）
      kozo: { vote: 'pass', votes: ['kozo_for', 'kozo_against', 'kozo_need'], seats: 2, opts: [
        { id: 'kozo_push', fx: function (c, J) {
          c.capital -= 4;
          if ((c.kozo_for || 0) >= (c.kozo_need || 0)) {
            c.kozo_kaikaku = 1; c.route += 1;
            J.push(c, ['shinchukan', 'mishoshiki'], 5);
            c.mood_saha += 26; c.mood_chuu -= 16; c.mood_uha -= 8;
          } else {
            c.mood_chuu += 18; c.mood_chusa += 6;
            c.kyokai_grip = Math.min(100, c.kyokai_grip + 8);
            c.capital -= 2;
          } } },
        { id: 'kozo_deal', fx: function (c) { c.capital -= 2; c.mood_chuu += 8; c.mood_saha += 6; c.kyokai_grip = Math.min(100, c.kyokai_grip + 3); } },
        { id: 'kozo_drop', fx: function (c) { c.route -= 1; c.mood_saha -= 18; c.mood_chuu += 22; c.rel_sohyo += 8; } }
      ] },
      //  「日本における社会主義への道」（act2.michi_1966）。票は「阻止する」が選べるかを決める
      michi: { vote: 'block', votes: ['michi_for', '', 'michi_need'], seats: 2, opts: [
        { id: 'michi_adopt', fx: function (c) { c.michi_adopted = 1; c.mood_saha -= 30; c.mood_chusa -= 8; c.mood_chuu += 20; c.mood_uha += 14; c.rel_sohyo += 10; } },
        { id: 'michi_block', fx: function (c) { c.capital -= 6; c.mood_saha += 34; c.mood_chusa += 10; c.mood_chuu -= 14; c.kyokai_grip = Math.max(0, c.kyokai_grip - 6); } },
        { id: 'michi_water', fx: function (c) { c.capital -= 4; c.mood_saha -= 12; c.mood_chuu += 8; c.rel_sohyo += 4; } }
      ] },
      //  七人委員会（act3.nanin_1974）
      nanin: { opts: [
        { id: 'nn_join', fx: function (c) {
          c.capital -= 4;
          c.kyokai_grip = Math.max(0, c.kyokai_grip - 18);
          c.mood_saha += 28; c.mood_chuu -= 14; c.mood_chusa -= 8;
          if (!c.saha_independent) {
            c.saha_independent = 1; c.del_chusa -= 120; c.del_saha = (c.del_saha || 0) + 120;
            c.seat_chusa -= Math.round(c.seat_chusa * 0.18); c.seat_saha = (c.seat_saha || 0) + Math.round(c.seats_hr * 0.10);
          } } },
        { id: 'nn_neutral', fx: function (c) { c.kyokai_grip = Math.min(100, c.kyokai_grip + 4); c.mood_saha += 8; c.mood_chuu += 8; c.capital += 1; } },
        { id: 'nn_kyokai', fx: function (c) { c.kyokai_grip = Math.min(100, c.kyokai_grip + 14); c.mood_saha -= 22; c.mood_chuu += 20; c.rel_sohyo += 8; c.route -= 0.5; } }
      ] },
      //  江田三郎（act3.eda_1977）。中間右派がもう出ていれば頁は eda_already へ飛ぶので出さない
      eda: { when: function (Q) { return !Q.shamin_exists; }, opts: [
        { id: 'eda_hold', fx: function (c) {
          c.capital -= 6; c.budget -= 4;
          c.mood_chuu = Math.max(0, c.mood_chuu - 35); c.mood_saha += 20; c.mood_chusa += 6;
          c.route += 0.5; c.eda_held = 1; } },
        { id: 'eda_let', fx: function (c, J) { c.pending_faction = 'chuu'; J.bigSplit(c, 'chuu'); } },
        { id: 'eda_expel', fx: function (c, J) {
          c.mood_chuu = 200; c.pending_faction = 'chuu'; J.bigSplit(c, 'chuu');
          c.mood_saha -= 18; c.rel_sohyo += 10; c.route -= 1; } }
      ] },
      //  社公合意（act4.shako_1980）
      shako: { opts: [
        { id: 'sg_sign', fx: function (c, J) {
          c.rel_komei += 35; c.rel_minsha += 25; c.rel_kyosan -= 35;
          c.mood_saha += 26; c.mood_chuu -= 12; c.shako_goi = 1; c.shakomin = 1; c.route += 1;
          J.push(c, ['shinchukan', 'mishoshiki'], 3); } },
        { id: 'sg_refuse', fx: function (c) { c.rel_komei -= 20; c.rel_kyosan += 12; c.mood_saha -= 20; c.mood_chuu += 14; c.route -= 0.5; } },
        { id: 'sg_vague', fx: function (c) { c.rel_komei += 10; c.mood_saha += 8; c.capital += 2; } }
      ] },
      //  非武装中立（act4.hibuso_1984）
      hibuso: { opts: [
        { id: 'hb_declare', fx: function (c, J) {
          c.hibuso_churitsu = 1;
          J.push(c, ['shinchukan'], 3); J.push(c, ['kokorou'], 3);
          c.rel_komei -= 18; c.rel_minsha -= 22; c.rel_jimin -= 15;
          c.mood_saha -= 24; c.mood_chuu += 18; c.rel_sohyo += 10; } },
        { id: 'hb_realistic', fx: function (c, J) {
          J.push(c, ['shinchukan', 'mishoshiki'], 5);
          c.rel_komei += 15; c.rel_minsha += 18; c.mood_saha += 30; c.mood_chusa += 8; c.rel_sohyo -= 14; c.route += 1; } },
        { id: 'hb_blur', fx: function (c) { c.mood_saha += 6; c.capital += 2; } }
      ] },
      //  新宣言（act5.shin_sengen）
      shin_sengen: { seats: 2, opts: [
        { id: 'ss_adopt', fx: function (c, J) {
          c.shin_sengen = 1; c.michi_adopted = 0; c.route += 1;
          J.push(c, ['shinchukan', 'mishoshiki'], 6);
          c.mood_saha += 30; c.mood_chusa += 6; c.rel_komei += 15; c.rel_minsha += 12; c.rel_sohyo -= 8; } },
        { id: 'ss_water', fx: function (c) { c.mood_saha += 10; c.mood_chuu += 6; c.capital += 1; } },
        { id: 'ss_reject', fx: function (c, J) {
          c.route -= 1; c.mood_saha -= 26; c.mood_chuu += 20; c.rel_sohyo += 12;
          J.push(c, ['shinchukan'], -4); J.push(c, ['kokorou'], 3); } }
      ] },
      //  政治改革と選挙制度（cards_events5.seiji_kaikaku）。生成事象の三件は A1 で足す
      seido: { seats: 1, opts: [
        { id: 'sk_oppose', fx: function (c, J) { c.senkyoku_seido = 0; c.mood_saha -= 8; c.rel_sohyo += 8; J.push(c, ['shinchukan'], -4); c.rel_komei -= 6; } },
        { id: 'sk_heiritsu', fx: function (c, J) {
          c.capital -= 5; c.senkyoku_seido = 4; J.push(c, ['shinchukan', 'mishoshiki'], 4);
          c.rel_komei += 14; c.rel_minsha += 10; c.mood_saha += 10; c.rel_sohyo -= 4; } },
        { id: 'sk_accept', fx: function (c, J) {
          c.senkyoku_seido = 6; J.push(c, ['shinchukan'], 6);
          c.rel_komei += 10; c.mood_saha += 26; c.rel_sohyo -= 16; c.route += 1; } }
      ] },
      //  執行部の権限（powers）。路線の二つは語だけ（帯と派閥の反応）、総評の候補は議席
      powers: { seats: 1, route: 1, opts: [
        { id: 'sohyo_kouho', seat: 1, fx: function (c, J) {
          c.budget -= 2; c.action_timer = 2;
          c.kouho = (c.kouho || J.NOM_OPEN) + 25;
          c.del_chusa = (c.del_chusa || 0) + 30;
          c.sohyo_giin = (c.sohyo_giin || 0) + 1;
          c.rel_sohyo -= 6; c.mood_chuu += 6; c.mood_uha += 8; },
          lt: function (Q, J) { return (Q.sohyo_giin || 0) <= 4 ? J.FXV.BIG.LT.sohyo_cost : ''; } },
        { id: 'route_right', seat: 0, band: 1, fx: function (c) {
          c.route += 1; c.capital -= (c.route_right_cost || 2);
          c.mood_uha -= 22; c.mood_chuu -= 10; c.mood_saha += 16; c.mood_chusa += 6; c.rel_sohyo -= 6; c.action_timer = 2; } },
        { id: 'route_left', seat: 0, band: 1, fx: function (c) {
          c.route -= 1; c.capital -= 1;
          c.mood_saha -= 18; c.mood_chusa -= 6; c.mood_uha += 20; c.mood_chuu += 8;
          c.rel_sohyo += 8; c.rel_kyosan += 5; c.action_timer = 2; } }
      ] },
      //  新左翼との距離（powers_line.lp_shinsayoku）。議席は一九七二年に払う分（nlFallout を写しに掛けた差）
      lp_shinsayoku: { when: function (Q) { return !Q.nl_fallout_done; }, bill: 1, opts: [
        { id: 'lp_ns_orgu', fx: function (c, J) {
          c.budget -= 2; c.capital -= 3; c.line_timer = 2;
          c.nl_distance = Math.max(0, (c.nl_distance === undefined ? 60 : c.nl_distance) - 12);
          c.nl_activity = Math.min(100, (c.nl_activity || 0) + 6);
          c.new_del = J.nlIntake(c, 22);
          c.mood_chuu += 6; c.mood_saha -= 4;
          J.push(c, ['shinchukan'], -3); } },
        { id: 'lp_ns_gaito', fx: function (c, J) {
          c.capital -= 2; c.line_timer = 1;
          c.nl_distance = Math.max(0, (c.nl_distance === undefined ? 60 : c.nl_distance) - 5);
          c.nl_activity = Math.min(100, (c.nl_activity || 0) + 10);
          c.mood_chuu += 2;
          J.push(c, ['mishoshiki'], 2); J.push(c, ['shinchukan'], -1); } },
        { id: 'lp_ns_kiru', fx: function (c, J) {
          c.capital += 1;
          c.nl_distance = Math.min(100, (c.nl_distance === undefined ? 60 : c.nl_distance) + 15);
          c.mood_saha += 8;
          J.push(c, ['shinchukan'], 3); J.push(c, ['jieigyo'], 2); } }
      ] }
    },
    //  分裂の写し（applySplit の中間右派の枝のうち、見出しが読むところだけ。applySplit は refresh を
    //  呼ぶので写しには掛けない）。付いて行く割合は割れる前の不満で決まる。
    bigSplit: function (c, f) {
      c._big_follow = this.followRate(c, f);
      c.splits = (c.splits || 0) + 1;
      if (f === 'chuu') { c.shamin_exists = 1; c.route -= 1; c.mood_chuu = 0; c.mood_saha += 8; }
      return c;
    },
    //  refresh と同じ挟みと繰り上げ（写しには refresh を掛けないので、見出しが読む量だけここでなぞる）。
    //  出て行った派閥に積んだ不満は、refresh の moodInherit が席を継いだ派閥へ移す。
    bigNorm: function (c) {
      var i, k, R = ['rel_kyosan', 'rel_komei', 'rel_minsha', 'rel_jimin', 'rel_sohyo'];
      c.route = clamp(Math.round((c.route || 0) * 10) / 10, -5, 5);
      for (i = 0; i < R.length; i++) { c[R[i]] = clamp(c[R[i]] || 0, -100, 100); }
      for (i = 0; i < this.FAC_KEYS.length; i++) { k = 'mood_' + this.FAC_KEYS[i]; c[k] = clamp(c[k] || 0, 0, 160); }
      c.kyokai_grip = clamp(c.kyokai_grip || 0, 0, 100);
      this.moodInherit(c);
      //  押して負になった傾向は、refresh の中の開票（tally）が 0 に挟む。同じことをしておかないと見込みがずれる
      this.tally(c);
      return c;
    },
    //  次の総選挙の年と、そこまでの手数。局面の終わりが総選挙の年月なら、そこまで。
    //  この幕に総選挙が残っていなければ、次の幕の最初の総選挙まで（幕の手数を足す）。
    bigElec: function (Q) {
      var a = Q.act || 1, cfg = this.ACTS[a], t = Q.turns_left || 0, ph = Math.max(1, Q.phase || 1), i, n, self = this;
      var isElec = function (g, k) {
        var mk = g.marks && g.marks[k];
        return !!mk && g.elections.indexOf(mk[0]) >= 0 && self.HR_MONTH[mk[0]] === mk[1];
      };
      if (!cfg) { return { y: 0, t: t }; }
      for (i = ph - 1; i < cfg.marks.length; i++) {
        if (i > ph - 1) { t += cfg.phases[i] || 0; }
        if (isElec(cfg, i)) { return { y: cfg.marks[i][0], t: t }; }
      }
      n = this.ACTS[a + 1];
      if (n) {
        for (i = 0; i < n.marks.length; i++) {
          t += n.phases[i] || 0;
          if (isElec(n, i)) { return { y: n.marks[i][0], t: t }; }
        }
      }
      return { y: 0, t: t };
    },
    //  選択肢を選んだあとの写し（c）の議席の見込み。Q は選ぶ前の盤。turns は次の総選挙までの手数。
    //  層ごとに、選択肢が押した分（c − Q の傾向）は (1 − DECAY)^turns だけ残り、基線の動きは 1 − (1 − DECAY)^turns だけ効く。
    bigSeatsFrom: function (Q, c, turns) {
      var f = Math.pow(1 - this.DECAY, Math.max(0, turns || 0)), i, l, s0, s1, b0, b1, nl;
      c = this.fcCopy(c);
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        s0 = Q['lean_' + l + '_shakai'] || 0; s1 = c['lean_' + l + '_shakai'] || 0;
        b0 = this.baselineLean(Q, l); b1 = this.baselineLean(c, l);
        nl = s0 + (s1 - s0) * f + (b1 - b0) * (1 - f);
        c['lean_' + l + '_jimin'] = (c['lean_' + l + '_jimin'] || 0) - (nl - s1);
        c['lean_' + l + '_shakai'] = nl;
      }
      return this.seatForecast(c).seats;
    },
    //  mode 'next'：次の総選挙のころ（上の形）。'base'：押した票がすべて基線へ戻ったとき（その先）
    bigSeats: function (Q, o, mode, turns) {
      var c = this.bigAfter(Q, o);
      if (mode === 'base') { return this.seatForecast(c, null, null, { decay: 'base' }).seats; }
      return this.bigSeatsFrom(Q, c, turns);
    },
    bandName: function (id) {
      var i;
      for (i = 0; i < this.ROUTE_BANDS.length; i++) { if (this.ROUTE_BANDS[i].id === id) { return this.ROUTE_BANDS[i].name; } }
      return '';
    },
    //  見出し：いまの盤（Q）と、選んだあとの写し（c）の差から、長く残るもの・路線・候補・協会・大会の票・反応の順に。
    bigTags: function (Q, c, o) {
      var V = this.FXV.BIG, X = V.T, H = V.TH, RR = V.R, self = this, out = [], rx = [], k, d, f, R, name;
      var put = function (t, cls, p) { out.push({ t: t, c: cls || 'neutral', p: p }); };
      var on = function (key) { return !Q[key] && !!c[key]; };
      var sum = function (x, ks) { var s = 0, i; for (i = 0; i < ks.length; i++) { s += Number(x['del_' + ks[i]]) || 0; } return s; };
      if (on('michi_adopted')) { put(X.michi_on, 'bad', 100); }
      if (Q.michi_adopted && !c.michi_adopted) { put(X.michi_off, 'good', 100); }
      if (on('kozo_kaikaku')) { put(X.kozo_on, 'good', 100); }
      if (on('saha_independent')) { put(X.saha_indep, 'neutral', 95); }
      if ((c.splits || 0) > (Q.splits || 0)) {
        if (c._big_follow !== undefined) { put(this.tdFill(V.follow, { p: Math.round(c._big_follow * 100) }), 'bad', 100); }
        put(X.splits, 'bad', 99);
      }
      if ((c.senkyoku_seido || 0) !== (Q.senkyoku_seido || 0)) { put(this.tdFill(V.seido, { name: this.seidoOf(c).name }), 'neutral', 90); }
      d = (c.route || 0) - (Q.route || 0);
      if (o.band && Math.abs(d) >= H.route && this.bandOf(Q) !== this.bandOf(c)) {
        put(this.tdFill(V.band, { a: this.bandName(this.bandOf(Q)), b: this.bandName(this.bandOf(c)) }), 'neutral', 85);
      } else if (Math.abs(d) >= H.route) {
        put(d > 0 ? (d >= H.routeStrong ? X.route_r2 : X.route_r) : (-d >= H.routeStrong ? X.route_l2 : X.route_l), 'neutral', 85);
      }
      d = this.nomPlanned(c) - this.nomPlanned(Q);
      if (d >= H.kouho) { put(d >= H.kouhoStrong ? X.kouho_up2 : X.kouho_up, 'neutral', 70); }
      d = (c.kyokai_grip || 0) - (Q.kyokai_grip || 0);
      if (Math.abs(d) >= H.grip) { put(d > 0 ? (d >= H.gripStrong ? X.grip_up2 : X.grip_up) : (-d >= H.gripStrong ? X.grip_dn2 : X.grip_dn), 'neutral', 60); }
      if (sum(c, ['chusa', 'saha', 'kyosan']) - sum(Q, ['chusa', 'saha', 'kyosan']) >= H.del) { put(X.del_l_up, 'neutral', 50); }
      if (sum(c, ['uha', 'chuu', 'hoshu', 'jiyu']) - sum(Q, ['uha', 'chuu', 'hoshu', 'jiyu']) >= H.del) { put(X.del_r_up, 'neutral', 50); }
      //  反応（他党・組合は上がれば満足、派閥は不満が下がれば満足）。大きい順
      for (k in this.FXV.REL) {
        if (!this.FXV.REL.hasOwnProperty(k)) { continue; }
        R = this.FXV.REL[k];
        if (R.neutral || (R.gate && !Q[R.gate])) { continue; }
        d = (c[k] || 0) - (Q[k] || 0);
        if (Math.abs(d) < H.rel) { continue; }
        name = k === 'rel_minsha' ? (Q.minsha_short || '民社') : R.name;
        rx.push({ t: this.tdFill(d > 0 ? (d >= H.relStrong ? RR.up2 : RR.up) : (-d >= H.relStrong ? RR.dn2 : RR.dn), { a: name }),
                  c: d > 0 ? 'good' : 'bad', p: 40 + Math.abs(d) / 10 });
      }
      for (f in this.FXV.FAC) {
        if (!this.FXV.FAC.hasOwnProperty(f) || !this.inParty(Q, f) || !this.inParty(c, f)) { continue; }
        d = (c['mood_' + f] || 0) - (Q['mood_' + f] || 0);
        if (Math.abs(d) < H.mood) { continue; }
        rx.push({ t: this.tdFill(d < 0 ? (-d >= H.moodStrong ? RR.up2 : RR.up) : (d >= H.moodStrong ? RR.dn2 : RR.dn), { a: this.FXV.FAC[f] }),
                  c: d < 0 ? 'good' : 'bad', p: 40 + Math.abs(d) / 10 });
      }
      out = out.concat(rx);
      out.sort(function (p, q) { return q.p - p.p; });
      if (out.length > H.tags) { out.length = H.tags; }
      if (!out.length) { out.push({ t: V.small, c: 'neutral', p: 0 }); }
      return out;
    },
    //  選んだあとの写し（見出し用）
    bigAfter: function (Q, o) {
      var c = this.fcCopy(Q);
      if (o && o.fx) { o.fx(c, this); }
      return this.bigNorm(c);
    },
    //  脇柱の札の中身（HTML）。数はどれも符号なし。
    bigRender: function (Q, key) {
      //  D1（N6 の検証の申し送り）：見出しと行が同じことを言うように、見出しに「いま総選挙なら」と
      //  「決定の分は次の総選挙のころの効き目で数える」を一緒に書き、行は数だけにした。
      //  選択肢は名前・議席（その先があれば「約 N／M」）の二つの欄の格子（jsp-big-g）に一行ずつ並べ、見出しは TH.tags（二つ）まで、
      //  票読みと可否は一行にまとめ、長い脚注（footSeats・foot）は外した（1280 幅で 446px → 約 200px）。
      var B = this.BIG[key], V = this.FXV.BIG, self = this, h = '', i, o, c, row, ref = null, ref2 = null, el = null;
      var esc = function (s) { return String(s); };
      var span = function (cls, t) { return '<span class="' + cls + '">' + t + '</span>'; };
      var fore = function (o, mode) { return self.bigSeats(Q, o, mode === 'base' ? 'base' : 'next', el.t); };
      var bill = function (fx) {
        var a = self.fcCopy(Q), b, s0, s1;
        if (fx) { fx(a, self); }
        self.bigNorm(a);
        s0 = self.seatForecast(self.fcCopy(a)).seats;
        b = self.fcCopy(a);
        self.nlFallout(b);
        s1 = self.seatForecast(b).seats;
        return Math.max(0, s0 - s1);
      };
      //  多いほうが良い（議席）か、少ないほうが良い（払う議席）か
      var cls = function (n, r, lessIsGood) {
        if (r === null || n === r) { return ''; }
        return (lessIsGood ? n < r : n > r) ? ' good' : ' bad';
      };
      var cols = 1, g = '';
      h += span('jsp-big-h', V.head);
      //  党大会の票（票読みと可否を一行に）
      if (B.vote) {
        var vf = Number(Q[B.votes[0]]) || 0, va = B.votes[1] ? (Number(Q[B.votes[1]]) || 0) : null, vn = Number(Q[B.votes[2]]) || 0;
        var vt = va === null ? this.tdFill(V.voteFor, { a: vf, c: vn }) : this.tdFill(V.vote, { a: vf, b: va, c: vn });
        if (B.vote === 'pass') { vt += '　' + span('jsp-big-v' + (vf >= vn ? ' good' : ' bad'), vf >= vn ? V.passOk : V.passNg); }
        else { vt += '　' + span('jsp-big-v', vf < vn ? V.blockOk : V.blockNg); }
        h += span('jsp-big-vote', vt);
      }
      //  議席の見出しと、いまのまま
      if (B.seats) {
        el = this.bigElec(Q);
        if (!el.y) { B = { opts: B.opts, route: B.route }; }
        else {
          h += span('jsp-big-s', this.tdFill(B.seats === 2 ? V.seats2 : V.seats, { y: el.y }));
          ref = fore(null, 'election');
          cols = 2;
          if (B.seats === 2) { ref2 = fore(null, 'base'); }
          g += span('jsp-big-o', V.keep) + span('jsp-big-n', B.seats === 2 ? this.tdFill(V.n2, { n: ref, m: ref2 }) : this.tdFill(V.n, { n: ref }));
        }
      } else if (B.bill) {
        h += span('jsp-big-s', V.bill);
        ref = bill(null);
        cols = 2;
        g += span('jsp-big-o', V.keep) + span('jsp-big-n', this.tdFill(V.n, { n: ref }));
      }
      //  選択肢ごと：名前・議席（・その先）を一行に、見出しはその下に
      for (i = 0; i < B.opts.length; i++) {
        o = B.opts[i];
        c = this.bigAfter(Q, o);
        row = span('jsp-big-o', esc(V.O[o.id] || o.id));
        if (B.seats && cols >= 2) {
          if (o.seat !== 0) {
            var n1 = fore(o, 'next');
            //  色は次の総選挙のころの数で決める（その先の数は並べるだけ）
            row += span('jsp-big-n' + cls(n1, ref, false),
                        B.seats === 2 ? this.tdFill(V.n2, { n: n1, m: fore(o, 'base') }) : this.tdFill(V.n, { n: n1 }));
          } else {
            row += span('jsp-big-n', '');
          }
        } else if (B.bill) {
          var nb = bill(o.fx);
          row += span('jsp-big-n' + cls(nb, ref, true), this.tdFill(V.n, { n: nb }));
        }
        var tg = this.bigTags(Q, c, o), t, j;
        t = '';
        for (j = 0; j < tg.length; j++) { t += span('jsp-big-tag ' + tg[j].c, tg[j].t); }
        g += row + span('jsp-big-tags', t);
      }
      h += span('jsp-big-g jsp-big-g' + cols, g);
      if (B.route) { h += span('jsp-big-f', V.footRoute); }
      return span('jsp-big', h);
    },
    bigFrame: function (Q, key) {
      var B = this.BIG[key];
      if (!B || (B.when && !B.when(Q))) { return this.bigClear(Q); }
      Q.big_key = key;
      Q.disp_big = this.bigRender(Q, key);
      Q.big_show = Q.disp_big ? 1 : 0;
      this.bigTab(Q);
      return Q;
    },
    bigClear: function (Q) { Q.big_key = ''; Q.disp_big = ''; Q.big_show = 0; return Q; },
    bigDone: function (Q, key, opt) {
      this.bigClear(Q);
      Q.big_done = this.BIG[key] ? key + '.' + (opt || '') : '';
      return Q;
    },
    //  結果の頁の「長く残ること」に足す、決定ごとの文（ltRender が読む）
    bigLt: function (Q) {
      var p = String(Q.big_done || '').split('.'), B = this.BIG[p[0]], i;
      if (!B || !p[1]) { return ''; }
      for (i = 0; i < B.opts.length; i++) {
        if (B.opts[i].id === p[1]) { return B.opts[i].lt ? (B.opts[i].lt(Q, this) || '') : ''; }
      }
      return '';
    },
    //  状況の面へ一度だけ切り替える。同じ決定・同じ手では二度切り替えない（読み手が面を替えたら、そのままにする）
    bigTab: function (Q) {
      try {
        var d = (typeof document !== 'undefined') && document;
        if (!d || !Q.big_show || !window.changeTab) { return; }
        var mark = Q.big_key + '@' + (Q.turn_n || 0);
        if (Q.big_tabbed === mark) { return; }
        Q.big_tabbed = mark;
        if (window.statusTab !== 'status') { window.changeTab('status', 'main_tab'); }
      } catch (e) { /* 脇柱が替わらないだけなので、盤面は止めない */ }
    },

    // ═══ generated:fxvocab start ═══
    //  tools/fx-vocab.mjs から tools/gen-fxvocab.mjs が書く。手で直さないこと（中文は jsp-core.js.json）。
    FXV: {
      TD: {
        title: '这一手的变化',
        title_last: '上一手的变化',
        more: '另有 {n} 项小变化',
        passive: '（每手的自然变化）',
        news: '（党外新闻）',
        lt: '长期：{x}',
        join: '{a}、{b}',
        fore_up: '预计议席 ↑ 多了约 {n} 席（现在 {v} 席）',
        fore_dn: '预计议席 ↓ 少了约 {n} 席（现在 {v} 席）',
        fore_up_t: '预计议席 ↑ 多了约 {n} 席（现在 {v} 席，其中约 {t} 席会慢慢消退）',
        fore_dn_t: '预计议席 ↓ 少了约 {n} 席（现在 {v} 席，其中约 {t} 席会慢慢回来）',
        hr_up: '众院议席 ↑ 多了 {n} 席（现在 {v} 席）',
        hr_dn: '众院议席 ↓ 少了 {n} 席（现在 {v} 席）',
        budget_up: '资金 ↑ 多了 {n}（现有 {v}）',
        budget_dn: '资金 ↓ 少了 {n}（现有 {v}）',
        budget_dn_neg: '资金 ↓ 少了 {n}（还缺 {v}）',
        capital_up: '政治资源 ↑ 多了 {n}（现有 {v}）',
        capital_dn: '政治资源 ↓ 少了 {n}（现有 {v}）',
        capital_dn_neg: '政治资源 ↓ 少了 {n}（还缺 {v}）',
        mem_up: '党员 ↑ 多了 {n} 人',
        mem_dn: '党员 ↓ 少了 {n} 人',
        mood_up: '{f}不满 ↑ 加深',
        mood_dn: '{f}不满 ↓ 缓和',
        mood_near: '（站在出口前）',
        rel_up: '与{a}的关系 ↑ 变好',
        rel_dn: '与{a}的关系 ↓ 变差',
        grip_up: '协会势力 ↑ 扩大',
        grip_dn: '协会势力 ↓ 收缩',
        route_r: '路线 → 向右移（现在是“{band}”）',
        route_l: '路线 ← 向左移（现在是“{band}”）',
        vote_up: '{g} ↑ 上升',
        vote_dn: '{g} ↓ 下降',
        vote_tmp: '（暂时）',
        vote_lasting: '（长期）',
        vote_fading: '（之前的效果在回落）',
        kouho_up: '候选人 ↑ 多了 {n} 人（现在 {v} 人）',
        kouho_dn: '候选人 ↓ 少了 {n} 人（现在 {v} 人）',
        debt_up: '地方财政负担 ↑ 加重',
        debt_dn: '地方财政负担 ↓ 减轻'
      },
      TH: {
        fore: 2,
        foreTmp: 2,
        hr: 1,
        budget: 3,
        capital: 2,
        members: 2000,
        mood: 6,
        rel: 6,
        grip: 6,
        route: 0.2,
        vote: 1.5,
        kouho: 5,
        debt: 3,
        orgb: 0.02,
        maxRows: 5,
        passive: 0.6,
        ltBox: 3
      },
      PRI: {
        lt: 100,
        hr: 90,
        fore: 50,
        mood: 0.216667,
        route: 5.5,
        rel: 0.166667,
        budget: 0.3,
        capital: 0.45,
        vote: 0.533333,
        grip: 0.116667,
        members: 0.00025,
        kouho: 0.1,
        debt: 0.166667
      },
      LTPRI: {
        minsha_ka: 100,
        splits: 100,
        michi: 100,
        kozo: 100,
        party_form: 100,
        seido: 90,
        route: 85,
        policy: 80,
        ldp_seed: 75,
        organise: 70,
        capBonus: 65,
        candidates: 60,
        newleft: 55,
        capital_extra: 50,
        labor_front: 40,
        keimou: 40,
        local: 60,
        kiban: 60,
        kyosan_haijo: 95,
        saha_indep: 95,
        shunto_form: 45,
        kokutetsu: 45
      },
      FAC: { uha: '右派', chuu: '中间右派', chusa: '中间左派', saha: '左派' },
      REL: {
        rel_sohyo: { name: '总评', gate: '', neutral: 0 },
        rel_komei: { name: '公明', gate: 'komei_exists', neutral: 0 },
        rel_kyosan: { name: '共产', gate: '', neutral: 0 },
        rel_jimin: { name: '自民', gate: '', neutral: 1 },
        rel_domei: { name: '同盟', gate: 'domei_exists', neutral: 0 },
        rel_rengo: { name: '连合', gate: 'rengo_formed', neutral: 0 },
        rel_zenrokyo: { name: '全劳协', gate: 'rengo_formed', neutral: 0 },
        coalition_rel: { name: '执政伙伴', gate: 'in_power', neutral: 0 },
        rel_minsha: { name: '', gate: 'minsha_exists', neutral: 0 }
      },
      GRP: { city: '城市票', union: '工会票', rural: '农村与自营工商票' },
      GRPL: {
        city: ['mishoshiki', 'shinchukan'],
        union: ['kokorou', 'minrou'],
        rural: ['jieigyo', 'noson']
      },
      PPL: {
        kokorou: '官公劳',
        minrou: '民间工会',
        mishoshiki: '未组织受雇者',
        shinchukan: '新中间层',
        jieigyo: '自营工商',
        noson: '农村',
        city: '城市上班族',
        union: '工会',
        rural: '农村与自营工商'
      },
      LT: {
        michi_on: '城市票长期下降',
        michi_off: '城市票的长期拖累解除',
        kozo_on: '城市票长期上升',
        minsha_ka: '胜利条件改变',
        splits: '算作一次党分裂',
        seido: '选举制度改变',
        kyosan_haijo: '关上与共产党合作的门',
        saha_indep: '协会成为独立派阀',
        ldp_seed: '为自民党分裂创造条件',
        policy: '国家政策改变（{name}）',
        organise: '在{p}中建立组织',
        capBonus: '{p}票的上限提高',
        nl_intake: '吸收激进活动家（日后拖累城市票）',
        nl_near: '靠近新左翼（日后拖累城市票）',
        capital_extra: '每手的政治资源增加',
        labor_front: '工会战线的走向改变',
        keimou: '劳动者教育推进一步',
        kiban: '削弱自民党的地盘',
        local_gain: '拿下自治体',
        local_loss: '失去自治体',
        shunto_form: '春斗的形式定下来',
        kokutetsu: '国铁的处理方式定下来',
        party_form: '党的形态改变',
        route_r: '路线右移',
        route_l: '路线左移'
      },
      LTX: {
        head: '长期影响',
        michi_on: '新中间层和未组织受雇者对我党的基本支持下降了，时间过去也不会自己恢复。',
        michi_off: '《道》给城市票带来的拖累解除了。',
        kozo_on: '新中间层和未组织受雇者对我党的基本支持上升了，不会随时间消退。',
        minsha_ka: '此后的胜利条件变了，新的条件显示在状况页的“三十四年综合评价”里。',
        route_r: '党的路线向右移了，各阶层的基本支持和派阀不满的积累速度都按新的位置计算。',
        route_l: '党的路线向左移了，各阶层的基本支持和派阀不满的积累速度都按新的位置计算。',
        splits: '这算作一次党的分裂，最后结算时会扣分。',
        candidates: '下次大选推出的候选人会增加，人数在选举前的调整里还可以改。',
        policy: '国家的“{name}”政策改变了。法律在我党离开政权后也会保留，并持续影响各阶层的支持。',
        organise: '我党在{p}中建立了组织，基本支持上升，只会慢慢流失。',
        capBonus: '我党在{p}中能拿到的票的上限提高了。',
        kyosan_haijo: '我党决定不与共产党合作，社共共斗的路关上了。',
        saha_indep: '协会成为独立派阀，在党大会上自己掌握票。',
        seido: '选举制度改变了，从下次大选起按新制度计算议席。',
        ldp_seed: '自民党分裂的条件形成了。',
        newleft: '和新左翼走得越近，日后城市票丢得越多。',
        capital_extra: '每手收到的政治资源增加了。',
        labor_front: '这会影响工会战线重组时的格局。',
        keimou: '劳动者教育推进了一步，党即使向左移，新中间层也不那么容易流失。',
        kiban: '削弱了自民党的地盘，从下次大选起见效。',
        local_gain: '我党掌握了一个自治体，每手要承担财政负担。',
        local_loss: '我党失去了一个自治体。',
        shunto_form: '春斗的形式定下来了，此后春斗的效果按这个形式计算。',
        kokutetsu: '国铁的处理方式定下来了。',
        party_form: '党的形态改变了。'
      },
      BIG: {
        head: '这项决定的预估',
        vote: '党代会票数　赞成 {a}・反对 {b}・过半数 {c}',
        voteFor: '党代会票数　预计赞成 {a}・过半数 {c}',
        passOk: '按现在的票数能够通过',
        passNg: '按现在的票数通不过',
        blockOk: '按现在的票数能够拦下',
        blockNg: '按现在的票数拦不下来',
        seats: '预计议席：现在就大选（决定的效果按{y}年时计算）',
        seats2: '预计议席：现在就大选／之后（决定的效果按{y}年时计算）',
        keep: '维持现状',
        n: '约 {n}',
        n2: '约 {n}／{m}',
        bill: '1972年要在城市票上付出的预计议席',
        follow: '党会分裂，约 {p}% 的中间右派离党',
        band: '路线区间从“{a}”变为“{b}”',
        seido: '从下次大选起，选举制度改为：{name}',
        small: '影响很小',
        footRoute: '路线变动的影响，会通过党内的反弹和之后的事件逐渐放大。',
        O: {
          kozo_push: '拿到大会上表决',
          kozo_deal: '用修正案妥协',
          kozo_drop: '让他撤回',
          michi_adopt: '通过它',
          michi_block: '拦下来',
          michi_water: '把它掏空',
          nn_join: '以执行部的身份支持七人委员会',
          nn_neutral: '保持中立',
          nn_kyokai: '站到协会那一边',
          eda_hold: '把人留下',
          eda_let: '让他走',
          eda_expel: '开除',
          sg_sign: '签',
          sg_refuse: '不签',
          sg_vague: '含糊过去',
          hb_declare: '白纸黑字写下来',
          hb_realistic: '转向务实的防卫政策',
          hb_blur: '不写',
          ss_adopt: '通过它',
          ss_water: '把它掏空',
          ss_reject: '否掉它',
          sk_oppose: '反对小选区制',
          sk_heiritsu: '拿并用制当对案',
          sk_accept: '认下单纯的小选区制',
          route_right: '路线往右挪',
          route_left: '路线往左挪',
          sohyo_kouho: '让总评出人来选',
          lp_ns_orgu: '把活动家接进党内',
          lp_ns_gaito: '街头上并肩，但不进党',
          lp_ns_kiru: '明确切割'
        },
        LT: { sohyo_cost: '工会干部成了党代会的代议员，此后把路线往右挪要花的政治资源会相应增加。' },
        R: { up: '{a}满意', up2: '{a}很满意', dn: '{a}不满', dn2: '{a}强烈不满' },
        T: {
          route_r: '路线右移',
          route_r2: '路线大幅右移',
          route_l: '路线左移',
          route_l2: '路线大幅左移',
          grip_up: '协会势力扩大',
          grip_up2: '协会势力大增',
          grip_dn: '协会势力收缩',
          grip_dn2: '协会势力大减',
          michi_on: '城市票长期下降',
          michi_off: '城市票的长期拖累解除',
          kozo_on: '城市票长期上升',
          saha_indep: '协会成为独立派阀',
          splits: '算作一次党分裂',
          kouho_up: '候选人增加',
          kouho_up2: '候选人大增',
          del_l_up: '党大会左派票增加',
          del_r_up: '党大会右派票增加'
        },
        TH: {
          route: 0.2,
          routeStrong: 0.8,
          rel: 6,
          relStrong: 15,
          mood: 6,
          moodStrong: 15,
          grip: 6,
          gripStrong: 12,
          kouho: 5,
          kouhoStrong: 15,
          del: 15,
          tags: 2
        }
      }
    },
    // ═══ generated:fxvocab end ═══

    // ── 主画面の党外の形勢と、赤字の数（N7） ──────────────────
    //  主画面（main）の on-arrival の終わりで frontView を呼ぶ。中日の場面は同じ一行を呼ぶだけにして、
    //  前は中文の場面にだけあった news_* の計算をここへ移した（audit-zh-code の許可を空にするため）。
    //
    //  党外の形勢の句（主画面の二段目。A5c の「党外の出来事」もここに入る）の出し分け。閾値は盤の値そのもので決める。
    //    news_jimin   3 自民党が過半より 35 以上多い　2 過半を保つ　1 過半を割った　0 こちらが政権の側（自民党の句を出さない）
    //    news_chudo   2 公明と民社がどちらも衆院に議席を持つ　1 民社だけが持つ　0 どちらでもない
    //                 （句が「衆院に議席を持つ」と言うので、党があるだけでなく議席を見る。
    //                   公明党は一九六四年にできるが、衆院に出たのは一九六七年の総選挙からである）
    //    news_kyosan  2 共産党 25 議席以上　1 10 議席以上
    //    news_shunto  2 春闘の動員 400 以上　1 200 以上
    newsView: function (Q) {
      var maj = Q.majority_line || (Math.floor((Q.hr_total || 467) / 2) + 1);
      var minsha = Q.minsha_exists === 1 && (Q.res_minsha || 0) > 0;
      var komei = Q.komei_exists === 1 && (Q.res_komei || 0) > 0;
      Q.news_jimin = Q.in_power ? 0 : (((Q.res_jimin || 0) >= maj + 35) ? 3 : (((Q.res_jimin || 0) >= maj) ? 2 : 1));
      Q.news_chudo = (komei && minsha) ? 2 : (minsha ? 1 : 0);
      Q.news_kyosan = ((Q.res_kyosan || 0) >= 25) ? 2 : (((Q.res_kyosan || 0) >= 10) ? 1 : 0);
      Q.news_shunto = ((Q.shunto_power || 0) >= 400) ? 2 : (((Q.shunto_power || 0) >= 200) ? 1 : 0);
      return Q;
    },

    //  赤字の知らせは、主画面・脇柱の状況の面・危機の面を合わせて、同時に赤で出すのは三つまで（計画 N7）。
    //  重い順に並べ、立っているものの上から三つだけを wr_<鍵> = 1（赤）、残りは 0（地の色で出す。字は消さない）。
    //  場面は <span class="jsp-w[+ wr_鍵 +]"> で包み、game.css の .jsp-w1 が赤にする。
    //  危機の帯は地が赤いので、出ていれば一つに数える（帯は消さない）。
    //  主画面と脇柱の両方に出る同じ知らせ（候補の過不足など）は一つに数える。
    //  良し悪しの印（評価の ○×、勝ちの側／負けの側、変化の矢印、見込みの数、路線や不満の色の付いた値）は知らせではないので数えない。
    //    crisis     危機（改憲の挿話を含む）の帯
    //    k_session  改憲の発議が国会にかかっている（脇柱）
    //    k_nolever  挿話で手段を打てる回がもう無く、このままなら通る（危機の面）
    //    k_hopeless 手段を全部使っても足りない見込み（危機の面）
    //    vc         勝ちの条件が変わった（主画面、一度だけ）
    //    k_reach    改憲の側が三分の二に届いている（脇柱・主画面の第Ⅱ幕の予警・この手の終わりに発議）
    //    exit_X     派閥が出口の前にいる（出口が開いていて不満 85 以上。不満の高い順）
    //    money      次の維持費で金庫が尽きる、または払えなかった回数が残っている
    //    k_near     改憲の側が三分の二に迫っている
    //    k_komei    公明が改憲の側に回るまで関係があと少し
    //  改憲の三つ（k_reach・k_near・k_komei）は、参院でも改憲の側が三分の二に届く見込みのとき（公明の予警は、公明が回れば
    //  参院でも届くとき）だけ立てる（N8）。D1 から九条が改められるのは衆参の三分の二と国民投票を越えたときだけで、
    //  参院で止まる見込みの盤で赤を出すと、実際には通らない発議を「危ない」と言い続けることになる。
    //  N8 の測り（普通・種 1〜20、執行部の手のうち）では、改憲の赤が出ていた手が idle 37% → 12%、random 25% → 2%、cards 19% → 2% に減り、
    //  参院も通る見込みで始まった挿話（本当の脅威）20 回は、どれも前の 12 手のうちに赤が出ていた（前と同じ）。
    //  字は消さない（地の色で出る）。主画面の「参院ではまだ三分の二に届いていない」（kk_hc_note）も前のまま。
    //    cand       候補が多すぎる／足りない
    //    nom        いまの票と人数では上限が過半に届かない（外盤の面）
    //    coal       連立の相手が離れかけている
    //    jichi      自治体の枠が空いていない
    //    congress   党大会が中央の線を引き戻した（知らせ）
    WARN_MAX: 3,
    warnRank: function (Q) {
      var ep = (Q.kaiken_ep || 0) > 0, act = Q.act || 1;
      var ex = ['uha', 'chuu', 'saha'].slice().sort(function (a, b) {
        return (Q['mood_' + b] || 0) - (Q['mood_' + a] || 0);
      });
      var list = [
        ['crisis', Q.crisis_on === 1],
        ['k_session', Q.kaiken_state === 1 && !Q.kaiken_withdrawn && (Q.kaiken_stage || 0) < 2],
        ['k_nolever', ep && !Q.kaiken_withdrawn && Q.kk_lever_ahead === 0 && (Q.kaiken_left || 0) > 0],
        ['k_hopeless', ep && Q.kaiken_hopeless === 1],
        ['vc', Q.vc_note_now === 1],
        ['k_reach', act >= 2 && (Q.kaiken_state || 0) < 3 && (Q.kaiken_gap || 0) <= 0 && Q.kk_hc_pass === 1]
      ];
      for (var e = 0; e < ex.length; e++) { list.push(['exit_' + ex[e], Q['near_' + ex[e]] === 1]); }
      list.push(['money', Q.budget_short === 1 || (Q.arrears || 0) > 0],
                ['k_near', Q.kaiken_warn === 2 && (Q.kaiken_gap || 0) > 0 && Q.kk_hc_pass === 1],
                ['k_komei', Q.kaiken_komei_warn === 1 && Q.kk_hc_komei_pass === 1],
                ['cand', (Q.fc_warn || 0) > 0],
                ['nom', (Q.nom_short || 0) > 0],
                ['coal', Q.in_power === 1 && (Q.coalition_rel || 0) <= 45],
                ['jichi', (Q.jichitai_pending || 0) > 0],
                ['congress', (Q.congress_last || 0) > 0]);
      var red = 0, on = 0;
      for (var i = 0; i < list.length; i++) {
        var lit = !!list[i][1] && red < this.WARN_MAX;
        if (list[i][1]) { on += 1; }
        if (lit) { red += 1; }
        Q['wr_' + list[i][0]] = lit ? 1 : 0;
      }
      Q.wr_on = on;
      Q.wr_red = red;
      return Q;
    },

    frontView: function (Q) {
      this.newsView(Q);
      this.warnRank(Q);
      return Q;
    },

    // ── 表示ヘルパ ──────────────────────────────────────────

    // ── 表示用の文字列をまとめて作り直す ────────────────────
    //  content 内の {! !} は生HTMLの素通しであって式評価ではないので、
    //  表示したいものは全部ここで quality に焼いてから [+ +] で出す。
    MEMBER_FLOOR: 5000,
    refresh: function (Q) {
      //  過半の線は定数だけで決まる。以前は runElection の中でしか置いていなかったので、
      //  最初の総選挙が終わるまで文庫の議席図に「過半 0」と出ていた。
      Q.hr_total = Q.hr_total || 467;
      Q.majority_line = Math.floor(Q.hr_total / 2) + 1;
      //  党員は下限で止める。負になると organise の √ が NaN を返し、
      //  組織率と傾向値が丸ごと壊れる（党費徴収カードを連打すると起きた）。
      Q.members = Math.max(this.MEMBER_FLOOR,
                           Math.min(this.MEMBER_CAP, Math.round(Q.members || this.MEMBER_FLOOR)));
      //  不満・関係・路線は加算のたびに端数が乗る。表示に 52.599999999999994 が
      //  出ていたので、ここで一括して丸める。
      var r1 = ['mood_uha', 'mood_chuu', 'mood_chusa', 'mood_saha',
                'mood_kyosan', 'mood_hoshu', 'mood_jiyu',
                'rel_kyosan', 'rel_minsha', 'rel_komei', 'rel_jimin', 'rel_sohyo',
                'coalition_rel', 'national_budget', 'kyokai_grip',
                'nl_activity', 'nl_revulsion', 'nl_distance', 'local_debt'];
      for (var ri = 0; ri < r1.length; ri++) {
        if (typeof Q[r1[ri]] === 'number') { Q[r1[ri]] = Math.round(Q[r1[ri]] * 10) / 10; }
      }
      //  路線は -5(極左) .. +5(民主社会主義) の目盛りである。挟んでいなかったので
      //  実測で -16 まで飛び、moodDrift の式（右派 = 4 + (-r)*3）が
      //  毎手 +52 を返していた。帯の判定も外れる。
      Q.route = clamp(Math.round((Q.route || 0) * 10) / 10, -5, 5);
      //  党際関係も挟む。実測で総評 633・民社 559 まで飛んでいた。
      //  blocOf の判定も、表示の目盛りも、この範囲を前提にしている。
      var rr = ['rel_kyosan', 'rel_komei', 'rel_minsha', 'rel_jimin', 'rel_sohyo'], rj;
      for (rj = 0; rj < rr.length; rj++) { Q[rr[rj]] = clamp(Q[rr[rj]] || 0, -100, 100); }
      Q.coalition_rel = clamp(Q.coalition_rel || 0, -20, 130);
      //  不満と掌握度もここで挟む。postEffects が 0..160 / 0..100 で挟んで
      //  いるが、あれは endturn でしか走らない。カードで動かした分は挟まれず、
      //  実測で協会の掌握度が -20% と 161%、協会派の不満が 206 まで出ていた。
      //  掌握度は grip の表示形式で ％ として画面に出るので、そのまま読者に
      //  見える。負の不満は「怒らせるまでの余白」を勝手に増やしてしまう。
      var mm = this.FAC_KEYS.map(function (k) { return 'mood_' + k; }), mj;
      for (mj = 0; mj < mm.length; mj++) { Q[mm[mj]] = clamp(Q[mm[mj]] || 0, 0, 160); }
      Q.kyokai_grip = clamp(Q.kyokai_grip || 0, 0, 100);
      Q.nl_activity = clamp(Q.nl_activity || 0, 0, 100);
      Q.disp_tmax     = this.pct(this.theoreticalMax(Q));
      this.localPending(Q);
      var oi, ol = ['kokorou', 'minrou', 'mishoshiki', 'jieigyo', 'noson', 'shinchukan'];
      for (oi = 0; oi < ol.length; oi++) {
        Q['org_' + ol[oi] + '_pct'] = Math.round((Q['org_' + ol[oi]] || 0) * 100);
      }
      Q.grain = Q.crisis_on ? this.GRAIN_FINE : this.GRAIN_COARSE;
      Q.grain_name = Q.grain === this.GRAIN_FINE ? '一个月' : '一个季度';
      //  暦の見出し。控えを読み直したときに月が入っていなければ一月にする
      if (!Q.ym) { Q.ym = this.ymOf(Q.year || 1958, Q.month || 1); }
      Q.month = this.monthOfYm(Q.ym);
      Q.quarter = Math.floor((Q.month - 1) / 3) + 1;
      Q.month_name = this.MONTH_JA[Q.month - 1];
      Q.route_band = this.bandOf(Q);
      Q.band_name = this.ROUTE_BANDS[Q.route_band - 1].name;
      //  いま国を動かしているのは誰か。
      //   gov_ours   我々の内閣（単独・非自民の連立）。自民党は野に居る
      //   gov_ldp    自民党の政権。三十四年の既定の側
      //   自社連立（cab_kind 4）はどちらでもない ── 両方が与党である
      //  民社の枠の名前。新進党や民主党にまとまれば mergeOpposition が
      //  書き換える。書き換えるまでは民社党である。
      if (!Q.minsha_short) { Q.minsha_short = '民社'; }
      if (!Q.minsha_name) { Q.minsha_name = '民社党'; }
      Q.gov_ours = (Q.in_power && Q.cab_kind !== 4) ? 1 : 0;
      Q.gov_ldp = (!Q.in_power) ? 1 : 0;
      Q.seido_name = this.seidoOf(Q).name;
      //  勤労者教育がいま何回ぶん効いているか（脇柱に出す）
      Q.keimou_n = Math.min(this.KEIMOU_STEPS, Q.keimou_open || 0);
      //  上積みの合計。脇柱に「研修・政策」の一行で出す。
      var cb = 0, ci;
      for (ci = 0; ci < LAYERS.length; ci++) { cb += (Q['capb_' + LAYERS[ci]] || 0); }
      Q.capb_total = Math.round(cb);
      Q.capital_extra_n = Math.round((Q.capital_extra || 0) * 10) / 10;
      Q.keimou_stage = (Q.keimou_open || 0) + (Q.keimou_seinen || 0) + (Q.keimou_kakudai || 0);
      //  大会の線と、中央との差。脇柱で見せる。
      this.congressRoute(Q);
      Q.del_total = this.delegates(Q).total;
      //  選挙の事象が実際の数で語るための差分。prev_seats は runElection が立てる。
      var sd = (Q.prev_seats === undefined) ? 0 : ((Q.seats_hr || 0) - (Q.prev_seats || 0));
      Q.seat_delta = sd; Q.seat_delta_abs = Math.abs(sd);
      Q.seat_dir = sd > 0 ? 1 : (sd < 0 ? 2 : 0);
      Q.res_kokumin = (Q.res_komei || 0) + (Q.res_minsha || 0);
      //  自治体の負担が毎手いくら積むか（脇柱の目安）
      var lb = 0, lc;
      for (lc in this.LOCAL_BURDEN) {
        if (this.LOCAL_BURDEN.hasOwnProperty(lc) && Q['local_' + lc]) { lb += this.LOCAL_BURDEN[lc]; }
      }
      Q.local_burden_now = Math.round(lb * 10) / 10;
      //  一回の締めで抜ける量。札の上でここを見せないと、
      //  積みの数字だけが大きく見えて「締めても無駄」に見える。
      Q.local_cut_now = this.localCut(Q, 1);
      if (Q.congress_drag_pct === undefined) { Q.congress_drag_pct = 0; }
      if (Q.congress_last === undefined) { Q.congress_last = 0; }
      Q.bloc = this.blocOf(Q);
      var by = Q.year || 1959;
      //  民社党が無い盤では「公明・民社」と書けない。右派が党に残っている
      //  （あるいは新党に畳んだ）ときは、中道の相手は公明党だけである。
      Q.bloc_name = ['还没往哪边定', '社共（跟共产党）',
        (Q.minsha_exists
          ? (by >= 1975 ? '社公民（跟公明、民社）'
              : (Q.komei_exists ? '中道路线（跟公明、民社）' : '往中道去（跟民社）'))
          : (Q.komei_exists ? '社公（跟公明）' : '往中道去'))][Q.bloc];
      //  新しい線の門。事象の選択肢は式しか書けないので、ここで数にしておく。
      //    chair_right   委員長が右派か中間右派か
      //    gassho_ready  社共合同の門（左の帯・共産党との関係・党首公選のあと・東欧のあと）
      //    minshu_ready  非自民の新党の門（右の帯・右寄りの委員長・連合のあと）
      var cf = this.factionOf(Q.post_chair);
      Q.chair_right = (cf === 'uha' || cf === 'chuu') ? 1 : 0;
      Q.gassho_ready = (!Q.kyosan_merged && !Q.minshu_shinto && Q.kyosan_kaikaku &&
        Q.evdone_toou && Q.route_band <= 2 && (Q.rel_kyosan || 0) >= 50) ? 1 : 0;
      Q.minshu_ready = (!Q.minshu_shinto && !Q.kyosan_merged && !Q.jisha_pact && !Q.jisha_cabinet &&
        Q.rengo_formed && Q.route_band === 4 && Q.chair_right) ? 1 : 0;
      //  民社党化の門。右の帯で共産を排除し、民社党が居ればその関係、居なければ右派が党内に残っている。
      Q.minsha_ka_ready = (Q.route_band === 4 && Q.kyosan_haijo && !Q.minsha_ka && !Q.kyosan_merged &&
        !Q.minshu_shinto && (!Q.minsha_exists || Q.minsha_merged || (Q.rel_minsha || 0) >= 30)) ? 1 : 0;
      if (!Q.party_name) { Q.party_name = '社会党'; }
      //  脱党した派閥に積まれた不満は、席を継いだ派閥へ繰り上げてから
      //  0 に潰す。カードや指導部や事象が加算したぶんは、ここで拾われる。
      this.moodInherit(Q);
      //  派閥の勢力・不満・主流／傍流。党務の札がここを読む。
      this.factionState(Q);
      //  難度。見送りの無料枠と、控えを取れるかどうか。
      var D = this.diff(Q);
      Q.diff_name = D.name;
      Q.discard_free = D.discard;
      Q.discard_used = Q.discard_used || 0;
      Q.discard_left = Math.max(0, D.discard - Q.discard_used);
      Q.discard_over = (Q.discard_used > D.discard) ? 1 : 0;
      //  新左翼。窓は一九七二年二月で閉じる。
      Q.nl_near = this.nlNear(Q);
      //  擁立数。いま総選挙をしたら何議席か（seatForecast）。
      //  以前は丸めた得票率と、事象で積んだ候補（nom_bonus）を含まない人数で
      //  天井だけを出していた。見込みは開票と同じ算術でなぞる。
      if (Q.kouho === undefined || Q.kouho === null) { Q.kouho = this.NOM_OPEN; }
      this.fcFields(Q, this.seatForecast(Q));
      //  政治資源の入りは endturn で払うが、脇柱ではいつでも見えていてほしい
      if (this.LEADERS) {
        var L2 = this.LEADERS, fit2 = 0, i2, p2, f2;
        for (i2 = 0; i2 < L2.POSTS.length; i2++) {
          p2 = L2.POSTS[i2];
          f2 = Q['post_' + p2] ? L2.FIG[Q['post_' + p2]] : null;
          if (f2 && !L2.gone(Q, Q['post_' + p2])) { fit2 += (f2.fit && f2.fit[p2]) || 0; }
        }
        var ang2 = Math.max(Q.mood_uha || 0, Q.mood_chuu || 0, Q.mood_chusa || 0, Q.mood_saha || 0);
        Q.capital_in = Math.round((fit2 / this.CAPITAL_PER_FIT) *
          (1 - Math.min(0.45, ang2 / 220)) * this.seatScale(Q)
          * this.diff(Q).income * 100) / 100;
      }
      //  分担金と維持費も、払うのは endturn だが見込みはいつでも出す。
      //  そうしないと一手目の脇柱がどちらも 0 になる。
      var mul3 = this.diff(Q).income;
      Q.dues_now = Math.round(((this.unionPower(Q).total * this.DUES_RATE +
        this.memberDues(Q)) * mul3 + (Q.dues_urban || 0)) * 100) / 100;
      Q.upkeep_now = Math.round(this.upkeepCost(Q) * 100) / 100;
      //  金の線。超えた分は毎手一割流れる（upkeep）。次の維持費を払うと
      //  金庫が尽きる見込みなら、脇柱に赤字で出す（入りは分担金と党費だけを見る）。
      Q.budget_soft = this.BUDGET_SOFT;
      Q.budget_over = ((Q.budget || 0) > this.BUDGET_SOFT) ? 1 : 0;
      Q.budget_short = ((Q.budget || 0) + (Q.dues_now || 0) < Q.upkeep_now) ? 1 : 0;
      //  総評から出してもらった候補は、通れば議席になる。ならないほうの
      //  代議員票は総評のものである。右へ寄る決議は、その人たちの
      //  反対を越えないと通らない ── 議席は借りられるが、党大会は借りられない。
      Q.sohyo_giin = Q.sohyo_giin || 0;
      Q.route_right_cost = 2 + Math.min(4, Q.sohyo_giin);
      Q.nl_open = ((Q.act || 1) >= 2 && (Q.year || 0) <= this.NL_WINDOW) ? 1 : 0;
      Q.nl_left = Math.max(0, this.NL_INTAKE_MAX - (Q.nl_intake || 0));
      Q.nl_intake = Q.nl_intake || 0;
      Q.nl_intake_del = Q.nl_intake_del || 0;
      this.applySaveLock(Q);
      var gf = ['uha', 'chuu', 'saha'], gi;
      for (gi = 0; gi < gf.length; gi++) {
        Q['gone_' + gf[gi]] = this.inParty(Q, gf[gi]) ? 0 : 1;
        //  出口が開いているか（exit_X）、その前にいるか（near_X：不満が NEAR_EXIT 以上）。
        //  脇柱の「（出口の前にいる）」と、選択肢の見出し（A2）が読む。
        Q['exit_' + gf[gi]] = (!Q['gone_' + gf[gi]] && this.hasExit(Q, gf[gi])) ? 1 : 0;
        Q['near_' + gf[gi]] = (Q['exit_' + gf[gi]] && (Q['mood_' + gf[gi]] || 0) >= this.NEAR_EXIT) ? 1 : 0;
      }
      Q.disp_tally    = this.tallyLine(Q);
      Q.disp_layers   = this.layerBlock(Q);
      Q.disp_unions   = this.unionBlock(Q);
      Q.disp_local    = this.localNames(Q);
      //  中間左派の道具でなだめられる幅。積んだ無派閥代議員から出る。
      Q.chusa_soothe = Math.min(13, 4 + Math.floor((Q.del_muha || 0) / 55));
      Q.disp_reorg    = this.reorgBlock(Q);
      Q.reorg_kind_now = this.reorgKind(Q);
      //  五通りの kind を、文の中でよく要る三つの旗に畳む。
      //   sohyo_gone   総評はこの先も残らないか（残る線は sohyo_survive だけ）
      //   rengo_dekiru 連合ができるか（史実の線と、右で統一する線）
      //   rosen_hidari 左で統一されるか（全労協が労戦を統一する）
      Q.sohyo_gone   = (Q.reorg_kind_now === 'sohyo_survive') ? 0 : 1;
      Q.rengo_dekiru = (Q.reorg_kind_now === 'history' || Q.reorg_kind_now === 'right_unify') ? 1 : 0;
      Q.rosen_hidari = (Q.reorg_kind_now === 'zenrokyo_unify') ? 1 : 0;
      //  国鉄の始末が決まったか。決まる前は kokutetsu_n が無く、
      //  そのままだと「= 0」（分割民営化）に読まれてしまう。
      Q.kokutetsu_done = Q.kokutetsu_kind ? 1 : 0;
      Q.disp_del      = this.delegateBlock(Q);
      Q.name_chair    = this.nameOf(Q.post_chair);
      Q.name_secgen   = this.nameOf(Q.post_secgen);
      Q.name_policy   = this.nameOf(Q.post_policy);
      Q.name_diet     = this.nameOf(Q.post_diet);
      Q.name_org      = this.nameOf(Q.post_org);
      Q.name_youth    = this.nameOf(Q.post_youth);
      Q.line_chair    = this.postLine(Q, 'chair');
      Q.line_secgen   = this.postLine(Q, 'secgen');
      Q.line_policy   = this.postLine(Q, 'policy');
      Q.line_diet     = this.postLine(Q, 'diet');
      Q.line_org      = this.postLine(Q, 'org');
      Q.line_youth    = this.postLine(Q, 'youth');
      Q.disp_posts    = this.postGrid(Q);
      Q.fac_chair     = FNAME[this.factionOf(Q.post_chair)] || '';
      Q.fac_org       = FNAME[this.factionOf(Q.post_org)] || '';
      Q.fac_youth     = FNAME[this.factionOf(Q.post_youth)] || '';
      if (this.LEADERS) { this.LEADERS.sync(Q); }
      if (this.CAB) { this.CAB.sync(Q); }
      //  解散できるか。札の choose-if は式しか書けないので、ここで数にしておく。
      //  組閣の組み合わせ。総選挙の頁だけでなく脇柱でも読む。
      this.cabinetOptions(Q);
      Q.can_dissolve = this.canDissolve(Q);
      Q.kaisan_cost = this.kaisanCost(Q);
      //  受け皿の数は選挙を跨がなくても脇柱に出したいので、毎手数え直す。
      var kb = this.coalitionBloc(Q);
      Q.cab_bloc = kb.seats;
      Q.cab_bloc_n = kb.parties.length;
      Q.cab_bloc_list = this.blocLine(Q, kb);
      Q.cab_bloc_short = (Q.cab_bloc || 0) - (Q.seats_hr || 0);
      //  政権の札の門。以前は一つの省に紐付けていたので、その省を
      //  取れなかった局では札が丸ごと死んだ ── 監査で「外交の実務」と
      //  「労働行政」は四十局で 0 回であった。副題は「大蔵か通産」と
      //  書いてあるのに has_okura しか見ていなかったのもここで揃える。
      this.fixSavePrefix();
      Q.disp_policy = this.policyBlock(Q);
      //  参院の他党：公明党ができたら創価学会系を移し、社会党の数が参院選の外で動いた分を詰める（D2）
      this.hcSync(Q);
      //  憲法。発議できる中身を先に数えておく。
      this.kaikenRisk(Q);
      Q.kaiken_line = this.kaikenLine(Q);
      var rk_, rkeys = ['kyujo', 'hirei', 'heiyo', 'renyo', 'heiritsu', 'kensetsu', 'gijutsu', 'kokka'];
      var anyOk = 0, bd_ = this.bandOf(Q);
      for (rk_ = 0; rk_ < rkeys.length; rk_ += 1) {
        var okk = this.reformOk(Q, rkeys[rk_]) ? 1 : 0;
        Q['kaiken_' + rkeys[rk_]] = okk;
        //  参院の三分の二と国民投票の過半数（D1。選択肢の choose-if と、選べない理由の出し分けが読む）。
        //  衆院に届いていない中身は数えない（札そのものが出ないか、衆院の理由で灰色になる）
        var okh = (okk && this.reformSupportHC(Q, rkeys[rk_]) >= (2 / 3)) ? 1 : 0;
        var okr = (okh && this.reformRefYes(Q, rkeys[rk_]) > 50) ? 1 : 0;
        Q['kaiken_hc_' + rkeys[rk_]] = okh;
        Q['kaiken_ref_' + rkeys[rk_]] = okr;
        //  三つとも越えられるか（選択肢の choose-if）と、越えられないならどこで止まるか（1 衆院 2 参院 3 国民投票）
        Q['kaiken_ok_' + rkeys[rk_]] = okr;
        Q['kaiken_why_' + rkeys[rk_]] = okr ? 0 : (!okk ? 1 : (!okh ? 2 : 3));
        //  札が出るのは、三つとも越えられて、いまの線で選べる中身が一つでもあるとき（D2。D1 までは衆院だけで
        //  数えていたので、参院か国民投票で止まる中身しか無い盤でも札が出て、選択肢が全部灰色になった）。
        //  九条は右の線、国のかたちは左の線でしか選べない（場面の choose-if と同じ）
        if (okr && (rkeys[rk_] !== 'kyujo' || bd_ === 4) && (rkeys[rk_] !== 'kokka' || bd_ === 1)) { anyOk = 1; }
      }
      //  札が出るのは、左か右の線に居て、何か一つでも発議できるとき。
      //  一度通しても札は出続ける ── 連ねていけることが国体への唯一の道である。
      //  相手の発議の挿話のあいだと、九条を失ったあとは出さない。
      Q.kaiken_can = (anyOk && (bd_ === 1 || bd_ === 4) && !Q.kaiken_ep && !Q.kyujo_ushinatta) ? 1 : 0;
      Q.kyogi_power = this.kyogiPower(Q);
      Q.kyogi_ok = Q.kyogi_power > 0 ? 1 : 0;
      Q.has_keizai_post = (Q.has_okura || Q.has_tsusan) ? 1 : 0;
      Q.has_rodo_post   = (Q.has_rodo || Q.has_kosei) ? 1 : 0;
      Q.has_gaikou_post = (Q.has_gaimu || Q.has_souri) ? 1 : 0;
      Q.has_sanmin_post = (Q.has_tsusan || Q.has_rodo) ? 1 : 0;
      //  幕の目標と、三十四年の評価の見込み（N4）。勝利点も毎回ここで数え直す。
      this.goalState(Q);
      //  符号を付けずに画面へ出すための値（N5）：路線と大会の線の目盛り、国庫への出入り、国家予算、与党内の関係。
      //  負の量は「左へ」「出ていく」「赤字」「0 より低い」と語で言う。
      Q.route_side = Q.route > 0 ? 1 : (Q.route < 0 ? 2 : 0);
      Q.route_abs = Math.round(Math.abs(Q.route || 0) * 10) / 10;
      Q.congress_side = (Q.congress_route || 0) > 0 ? 1 : ((Q.congress_route || 0) < 0 ? 2 : 0);
      Q.congress_abs = Math.round(Math.abs(Q.congress_route || 0) * 10) / 10;
      Q.pol_net_dir = (Q.pol_net || 0) > 0 ? 1 : ((Q.pol_net || 0) < 0 ? 2 : 0);
      Q.pol_net_abs = Math.round(Math.abs(Q.pol_net || 0) * 10) / 10;
      Q.nb_neg = (Q.national_budget || 0) < 0 ? 1 : 0;
      Q.nb_abs = Math.round(Math.abs(Q.national_budget || 0) * 10) / 10;
      Q.coalition_neg = (Q.coalition_rel || 0) < 0 ? 1 : 0;
      Q.coalition_abs = Math.round(Math.abs(Q.coalition_rel || 0) * 10) / 10;
      var sn = ['budget', 'capital', 'rel_kyosan', 'rel_komei', 'rel_minsha', 'local_debt'], si;
      for (si = 0; si < sn.length; si++) {
        Q[sn[si] + '_neg'] = (Q[sn[si]] || 0) < 0 ? 1 : 0;
        Q[sn[si] + '_abs'] = Math.round(Math.abs(Q[sn[si]] || 0) * 10) / 10;
      }
      //  新左派との距離は 0〜100 の量だが、事象が下限を挟まずに引くことがある（-1 まで出た）。
      //  盤の値はそのままにして、外盤に出す値だけ 0 で止める。
      Q.nl_distance_view = Math.max(0, Math.round(Q.nl_distance === undefined ? 60 : Q.nl_distance));
      //  赤字の知らせを三つまでに絞る（N7）。上の値（出口・候補・改憲・金・危機）を読む。
      //  tdRefresh は wr_* を読まず、warnRank も td の値を読まないので、順は入れ替えても同じ。tdRefresh を最後に置く決まりに合わせてここに置く。
      this.warnRank(Q);
      //  脇柱「この一手の変化」と結果の頁の「長く残ること」（N5）。最後に置く（上で丸めた値を比べる）。
      this.tdRefresh(Q);
      return Q;
    },

    pct: function (x) { return (Math.round(x * 10) / 10).toFixed(1); },

    tallyLine: function (Q) {
      var v = this.tally(Q), out = [], j, p;
      for (j = 0; j < PARTIES.length; j++) {
        p = PARTIES[j];
        if (p === 'minsha' && !Q.minsha_exists) { continue; }
        if (p === 'komei' && !Q.komei_exists) { continue; }
        var pn = (p === 'minsha' && Q.minsha_short) ? Q.minsha_short : PNAME[p];
        out.push('<span style="color:' + PCOLOR[p] + ';font-weight:bold">' + pn + '</span> ' + this.pct(v[p]) + '%');
      }
      return out.join('　');
    },

    //  労働四団体の一覧。組合員数と、その中の左右の比を出す。
    //  以前はここに「総評は同盟のおよそ二倍あり、だから右へ寄る取引は
    //  失うほうが得るほうより大きい」という説明文を置いていた。
    //  比は毎手動くので、説明ではなく数を出す。
    unionBlock: function (Q) {
      var y = this.yearOf(Q), k, u, size, lr, rows = [], rel, w;
      var order = ['sohyo', 'domei', 'churitsu', 'shinsan',
                   'rengo', 'zenrokyo', 'zenroren', 'sohyo_after'];
      for (var i = 0; i < order.length; i++) {
        k = order[i];
        u = this.UNIONS[k];
        size = this.unionSize(k, y, Q);
        if (!size) { continue; }
        rel = Math.round(Q[u.rel] || 0);
        w = (u.share === undefined) ? 1 : u.share;
        //  左の比。再編後の三団体は成り立ちで決まっているので固定値を出す。
        if (k === 'rengo') { lr = 22; }
        else if (k === 'zenrokyo') { lr = 96; }
        else if (k === 'zenroren') { lr = 98; }
        else { lr = (Q['lr_' + k] === undefined) ? this.LR_START[k] : Q['lr_' + k]; }
        lr = Math.round(lr * 10) / 10;
        rows.push('<b>' + u.name + '</b>　' + (Math.round(size * 10) / 10) + '万人　'
          + '<span style="color:#B23A34">左 ' + lr + '%</span>'
          + '／<span style="color:#3E6E8C">右 ' + (Math.round((100 - lr) * 10) / 10) + '%</span>'
          + '　跟党的关系 ' + (rel < 0 ? '比 0 低 {n}'.replace('{n}', -rel) : rel)
          + '　<span style="opacity:.6">官公劳 ' + Math.round(u.kokorou * 100) + '%'
          + (w < 1 ? '・算作我党的是 ' + Math.round(w * 100) + '%' : '')
          + '</span>');
      }
      return rows.join('<br>');
    },

    layerBlock: function (Q) {
      var i, l, sum, j, rows = [], sh;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        sum = 0;
        for (j = 0; j < PARTIES.length; j++) { sum += Q['lean_' + l + '_' + PARTIES[j]] || 0; }
        sh = sum > 0 ? (Q['lean_' + l + '_shakai'] / sum * 100) : 0;
        //  潮流の線も並べる。支持は放っておくとこの線へ戻る（erode）。
        //  「毎手、全層の支持が下がる」という報告は、六十年代の潮流が
        //  この線を毎年引き下げていることで、線が見えていなかった。
        var tide = sum > 0 ? (this.baselineLean(Q, l) / sum * 100) : 0;
        rows.push('<b>' + LNAME[l] + '</b>　人口 ' + Q['pop_' + l] + '%　组织率 ' +
          Math.round(Q['org_' + l] * 100) + '%　社会党 ' + this.pct(sh) +
          '%　<span style="opacity:.6">' + '潮流的线 ' + this.pct(tide) + '%　' + '上限 ' + Math.round(this.capOf(Q, l)) + '%</span>');
      }
      return rows.join('<br>');
    },

    delegateBlock: function (Q) {
      var d = this.delegates(Q), t = d.total, rows = [];
      function row(label, v) {
        return label + '　' + v + ' 票 <span style="opacity:.6">(' +
          Math.round(v / t * 100) + '%)</span>';
      }
      rows.push(row('右派', d.uha));
      rows.push(row('中间右派', d.chuu));
      rows.push(row('中间左派', d.chusa));
      rows.push(row('<span style="color:#B23A34">社会主义协会</span>', d.kyokai));
      rows.push(row('无派阀', d.muha));
      //  合同で入ってきた側は、居るときだけ出す。
      if (d.kyosan) { rows.push(row(FNAME.kyosan, d.kyosan)); }
      if (d.hoshu) { rows.push(row(FNAME.hoshu, d.hoshu)); }
      if (d.jiyu) { rows.push(row(FNAME.jiyu, d.jiyu)); }
      return rows.join('<br>');
    }
  };

  window.JSP = JSP;

  //  雛形は保存を読み込んだあと window.onLoad() を呼ぶ。
  //  ここで盤面の見た目（背景と危機の体裁）を state に合わせ直す。
  window.onLoad = function () { JSP.afterLoad(); };

  // ══════════════════════════════════════════════════════════
  //  音の設定
  //
  //  雛形は disable_audio を saveSettings で覚えるが、音量は覚えない
  //  （loadSettings が base_settings から 1 に戻してしまう）。
  //  音量だけ自前の枠で持つ。
  //
  //  入口の設定欄に行を足すのは tools/i18n/inject.mjs である。
  // ══════════════════════════════════════════════════════════
  var VOL_KEY = 'jsp1959_volume';

  function ui() { return window.dendryUI; }

  JSP.audioOn = function (on) {
    var U = ui();
    if (!U) { return; }
    if (U.toggle_audio) { U.toggle_audio(!!on); } else { U.disable_audio = !on; }
    if (U.saveSettings) { U.saveSettings(); }
    JSP.audioSync();
  };

  //  雛形の audio() は音量を jQuery の animate で動かす。掛かっている
  //  途中に直で volume を書くと取り合いになるので、先に畳む。
  //  背景の setBg と同じ話である（頁を裏に回すと fx タイマーが凍り、
  //  掛けっぱなしの animate が終わらないまま残る）。
  //  底を交替させるための位置。−1 から始めるので、最初に掛かるのは
  //  BEDS の先頭になる。頁を読み直すと先頭へ戻るが、見た目だけの話である。
  var bedIx = -1;

  function flushAudioFx(U) {
    var $ = window.jQuery;
    if ($ && U && U.currentAudio) { $(U.currentAudio).stop(true, true); }
  }

  //  play() の返す約束は、鳴り出す前に pause() されると AbortError で
  //  拒否される。この盤は局面ごとに曲を差し替えるので、そのたびに
  //  未処理の拒否が出ていた（入口を開けただけで 16 本）。
  //  雛形の core.js が play() を呼んでいて約束を持っていないので、
  //  ここで一度だけ包んで受ける。止められたのと自動再生禁止は
  //  黙って飲み、それ以外はこれまでどおり見えるようにしておく。
  (function () {
    var P = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (!P || P.__jspPlayPatched) { return; }
    var orig = P.play;
    P.play = function () {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { return; }
      if (r && typeof r.catch === 'function') {
        r.catch(function (e) {
          var n = e && e.name;
          if (n === 'AbortError' || n === 'NotAllowedError') { return; }
          if (window.console && console.warn) { console.warn('audio play:', e); }
        });
      }
      return r;
    };
    P.__jspPlayPatched = true;
  }());

  JSP.audioVol = function (v) {
    var U = ui();
    var x = Math.max(0, Math.min(1, Number(v)));
    if (!isFinite(x)) { x = 1; }
    if (U) {
      flushAudioFx(U);
      U.volume = x;
      if (U.current_settings) { U.current_settings.volume = x; }
      if (U.currentAudio) { U.currentAudio.volume = x; }
      if (U.saveSettings) { U.saveSettings(); }
    }
    try { localStorage.setItem(VOL_KEY, String(x)); } catch (e) { /* 無ければ既定 */ }
    JSP.audioSync();
  };

  //  設定欄の見た目を、いまの値に合わせる
  JSP.audioSync = function () {
    var U = ui();
    if (!U || typeof document === 'undefined') { return; }
    var yes = document.getElementById('audio_yes');
    var no = document.getElementById('audio_no');
    if (yes && no) { yes.checked = !U.disable_audio; no.checked = !!U.disable_audio; }
    var sl = document.getElementById('audio_volume');
    if (sl) { sl.value = String(Math.round((U.volume === undefined ? 1 : U.volume) * 100)); }
  };

  //  頁を開いたときに一度。雛形の loadSettings のあとに走らせたいので、
  //  dendryUI が出来るのを待つ。
  JSP.audioInit = function () {
    var U = ui();
    if (!U) { return false; }
    var v = 1;
    try {
      var raw = localStorage.getItem(VOL_KEY);
      if (raw !== null) { v = Math.max(0, Math.min(1, Number(raw))); }
    } catch (e) { v = 1; }
    if (!isFinite(v)) { v = 1; }
    U.volume = v;
    if (U.current_settings) { U.current_settings.volume = v; }

    //  曲を差し替えるたびに fadeOut→fadeIn を積む作りなので、
    //  事象が続けて起きると積み残しが出て、曲が何手も遅れて替わる。
    //  掛ける前に前の分を畳む（一度だけ包む）。
    if (!U.__jspAudioWrapped && typeof U.audio === 'function') {
      var orig = U.audio.bind(U);
      U.audio = function (a) {
        flushAudioFx(U);
        var r = orig(a);
        //  nofade の枝は音量を戻さないので（初回の淡転が残した値のまま）、
        //  ここで同期に入れ直す。これで fx タイマーに一切依らなくなる。
        flushAudioFx(U);
        if (U.currentAudio && !U.disable_audio) {
          U.currentAudio.volume = (U.volume === undefined) ? 1 : U.volume;
        }
        return r;
      };
      U.__jspAudioWrapped = true;
    }

    JSP.audioSync();
    return true;
  };

  //  控えの鍵の前置きを、dendryUI が出来た瞬間に確定させる。
  //
  //  afterLoad と refresh に付けても足りない ── 頁を開いただけの
  //  標題画面ではどちらもまだ走っていないので、そこで「セーブ」を
  //  押すと undefined_undefined_save_* に書かれる（実測で確認）。
  //  保存と読み込みの入口を包んで、呼ばれたときに必ず直す。
  JSP.saveInit = function () {
    var U = ui();
    if (!U) { return false; }
    JSP.fixSavePrefix();
    if (!U.__jspSaveWrapped) {
      var names = ['saveSlot', 'loadSlot', 'deleteSlot', 'exportSlot',
                   'quickSave', 'quickLoad', 'autosave', 'populateSaveSlots',
                   'showSaveSlots'];
      for (var i = 0; i < names.length; i += 1) {
        (function (n) {
          if (typeof U[n] !== 'function') { return; }
          var orig = U[n].bind(U);
          U[n] = function () {
            JSP.fixSavePrefix();
            //  雛形は保存と読み込みのたびに window.alert() を出す。
            //  これは二つ困る：画面が止まるのと、文が英語のままなのと。
            //  （実機の Chrome で alert が出ており、頁が完全にブロックされた。）
            //  呼んでいる間だけ alert を差し替え、短い帯で知らせる。
            var real = window.alert;
            window.alert = function (m) { JSP.toast(m); };
            try { return orig.apply(null, arguments); }
            finally { window.alert = real; }
          };
        }(names[i]));
      }
      U.__jspSaveWrapped = true;
    }
    return true;
  };

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var a = JSP.audioInit();
      var b = JSP.saveInit();
      if ((a && b) || tries > 60) { clearInterval(timer); }
    }, 100);
  }
}());
