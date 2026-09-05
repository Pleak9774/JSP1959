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
    chusa: '中间左派（铃木–佐佐木派）', saha: '左派（协会派）'
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
          pts[p] += Q['pop_' + l] * w * ((Q['lean_' + l + '_' + p] || 0) / sum) * (this.PARTY_EFF[p] || 1);
        }
      }
      for (j = 0; j < PARTIES.length; j++) { tot += pts[PARTIES[j]]; }
      var adj = {}, t2 = 0;
      for (j = 0; j < PARTIES.length; j++) {
        p = PARTIES[j];
        adj[p] = Math.max(0, pts[p] / tot * 100 - this.SEAT_THRESHOLD);
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
      var ks = ['uha', 'chuu', 'chusa', 'muha', 'saha'], i, s = 0;
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
      return {
        uha: Q.del_uha, chuu: Q.del_chuu, chusa: Q.del_chusa - ky,
        kyokai: ky, muha: Q.del_muha,
        total: Q.del_uha + Q.del_chuu + Q.del_chusa + Q.del_muha
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
    DUES_RATE: 0.0016,   // 動員力 1 につき一手あたりの分担金
    //  党費。まず党員の関数である ── 地道に組織を作った党が後半に
    //  金を持っているのは筋が通る。ただし線形にすると、党員を倍にした
    //  だけで収入も倍になり、組織化が唯一の答えになってしまう。
    //  指数 0.6 で、四倍にして 2.3 倍。実際に届く幅は五万〜十五万人で、
    //  そのあいだ一手あたり 0.34 → 0.67 になる。
    MEMBER_DUES_BASE: 50000,
    MEMBER_DUES_K: 0.34,
    MEMBER_DUES_EXP: 0.6,
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
               + ((Q.kyokai_grip || 50) - 50) * 0.28
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
        Q.rel_sohyo += 18; Q.kyokai_grip = Math.min(100, (Q.kyokai_grip || 50) + 10);
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
    kokutetsuUpkeep: function (Q) {
      var d = Q.kokutetsu_debt || 0;
      if (!d) { return Q; }
      Q.budget -= d;
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
      var rT = this.ROSOKON_START + ((Q.rel_kyosan || 40) - 40) * 0.30 - (grip - 50) * 0.16
             - Math.min(12, pts * 0.25);
      if (tT < 4) { tT = 4; }
      if (rT < 3) { rT = 3; }
      var tc = (Q.u_tekko === undefined) ? this.TEKKO_START : Q.u_tekko;
      var rc = (Q.u_rosokon === undefined) ? this.ROSOKON_START : Q.u_rosokon;
      Q.u_tekko   = Math.round((tc + (tT - tc) * 0.05) * 10) / 10;
      Q.u_rosokon = Math.round((rc + (rT - rc) * 0.05) * 10) / 10;
      return Q;
    },

    //  解散と再編。一度だけ走る。
    //  総評の左のうち、共産党に近い分が全労連へ、党に近い分が全労協へ抜ける。
    //  抜けなかった分と同盟・中立労連が連合になる。
    unionReorg: function (Q) {
      var J = this;
      if (Q.reorg_done) { return Q; }
      if (this.yearOf(Q) < this.REORG_YEAR) { return Q; }
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
      var toKyosan = Math.min(0.8, Math.max(0.15, (Q.rel_kyosan || 40) / 80));

      //  ── 誰が総評を率いていたかで、統一の形が変わる ──────────
      //  議長と事務局長。二人とも左なら左へ、二人とも右なら右へ、
      //  混ざれば史実どおり連合になる。総評の大会で決まっている。
      var ch = Q.sohyo_chair || 'chusa';
      var sg = Q.sohyo_secgen || 'chuu';
      var lefts = (ch === 'saha' ? 1 : 0) + (sg === 'saha' ? 1 : 0);
      var rights = (ch === 'uha' ? 1 : 0) + (sg === 'uha' ? 1 : 0);
      //  総評の左が厚く、同盟の右の塊が痩せていること。
      //  同盟はオルグを積むほど切り崩される。
      var sohyoLeft = sohyo * lrS;
      var domeiHard = domei * (1 - Math.min(0.6, (Q.left_unity_pts || 0) * 0.012));
      Q.reorg_sohyo_left = Math.round(sohyoLeft);
      Q.reorg_domei_hard = Math.round(domeiHard);

      var tekko = (Q.u_tekko === undefined) ? this.TEKKO_START : Q.u_tekko;
      var rosokon = (Q.u_rosokon === undefined) ? this.ROSOKON_START : Q.u_rosokon;
      Q.reorg_tekko = Math.round(tekko);
      Q.reorg_rosokon = Math.round(rosokon);
      //  左で統一するには四つとも要る。総評が大きいだけでは足りない。
      //  中の右（鉄鋼系）と、中の共産系（統一労組懇）を先に落としておくこと。
      var canLeft = sohyoLeft >= this.REORG_LEFT_NEED &&
                    domeiHard <= this.REORG_DOMEI_MAX &&
                    tekko <= this.REORG_TEKKO_MAX &&
                    rosokon <= this.REORG_ROSOKON_MAX;
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
      //  一九五九年の五万人で 0.34/手。組合が離れても残る金である。
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
      var urban = built * built * (1 - dep) * 2.8;
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
      if (f === 'uha') { return !Q.minsha_exists; }
      if (f === 'chuu') { return !Q.shamin_exists; }
      if (f === 'saha') { return !Q.shinsha_exists; }
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

    //  発議できるか。三分の二に届いているか。
    reformOk: function (Q, key) {
      return this.reformSupport(Q, key) >= (2 / 3);
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
    kaikenBloc: function (Q) {
      var n = (Q.res_jimin || 0) + (Q.res_minsha || 0)
            + (Q.res_sp_shinsei || 0) + (Q.res_sp_shinjiyu || 0);
      //  公明は護憲寄り。こちらとの関係が壊れているときだけ向こうへ行く。
      if ((Q.rel_komei || 0) < -20) { n += Q.res_komei || 0; }
      //  その他の半分は保守系無所属である。
      n += Math.round((Q.res_other || 0) * 0.5);
      return n;
    },

    kaikenRisk: function (Q) {
      Q.goken_seats = this.gokenSeats(Q);
      Q.goken_line = this.gokenLine(Q);
      Q.goken_ratio = Math.round((Q.goken_seats / (Q.hr_total || 511)) * 1000) / 10;
      Q.kaiken_bloc = this.kaikenBloc(Q);
      var band = this.bandOf(Q);
      //  相手が三分の二を集めたときだけ。
      //  こちらが右の線に居るなら党が呾んだということなので危機にならない。
      Q.kaiken_danger = (Q.kaiken_bloc >= this.kaikenLine(Q) && band !== 4) ? 1 : 0;
      return Q.kaiken_danger;
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
      var fs = ['uha', 'chuu', 'chusa', 'saha'], i, f;
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
      var r = Q.route, i, k, f = ['uha', 'chuu', 'chusa', 'saha'];
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
    //    政治資源 貯まるものではない。使わなければ散る（毎手 6%）。
    //  校正（実機139手の通しを6シードずつ）：
    //    維持費なし        careless hr111 / 資金峰34 / 政治資源峰83
    //    0.35 / 0.96      careless hr 61 / 資金峰18 / 政治資源峰28 / 未払23回
    //                     金に気を配る打ち手 hr103 / 資金峰45 / 未払0回
    //  金を見ない打ち手と見る打ち手で 42議席の差が付く。それまでは差が無かった。
    //  専従と機関紙。党員に比例するが、こちらも線形ではない ──
    //  機関紙は一度刷れば部数が増えても割安になるし、県連の事務所は
    //  党員が倍になっても倍にはならない。指数は党費（0.6）より小さく、
    //  そのぶん「組織を作れば手元は楽になる、ただし楽になり方は鈍る」。
    //  五万人で 0.175、十五万五千人で 0.29。自治体の分は線形のまま
    //  （一つ持てば一つぶんの役所が要る）。
    UPKEEP_MEMBER_BASE: 50000,
    UPKEEP_MEMBER_K: 0.175,
    UPKEEP_MEMBER_EXP: 0.45,
    memberUpkeep: function (Q) {
      var m = Math.max(0, Q.members || 0);
      if (m <= 0) { return 0; }
      return this.UPKEEP_MEMBER_K *
        Math.pow(m / this.UPKEEP_MEMBER_BASE, this.UPKEEP_MEMBER_EXP);
    },
    UPKEEP_PER_CITY: 0.34,
    CAPITAL_DECAY: 0.90,
    CAPITAL_SOFT: 12,   // ここまでは減らない。上だけ削る
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
      { id: 0, name: '簡単',   discard: 3, budget:  6, capital:  4, upkeep: 0.7, income: 1.35, bar: 1.00, save: 1 },
      { id: 1, name: '普通',   discard: 2, budget:  0, capital:  0, upkeep: 1.0, income: 1.00, bar: 1.05, save: 1 },
      { id: 2, name: '難しい', discard: 1, budget: -3, capital: -2, upkeep: 1.3, income: 0.80, bar: 1.12, save: 1 },
      { id: 3, name: '史実',   discard: 0, budget: -3, capital: -2, upkeep: 1.3, income: 0.80, bar: 1.12, save: 0 }
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
    //  開幕は適性合計 30（六人とも適任）で、一手あたり 1.2 前後になる。
    //  減衰 0.96 と釣り合う天井は 30 ほど。貯め込みは効かない。
    CAPITAL_PER_FIT: 20,
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
      var inc = (fit / this.CAPITAL_PER_FIT) * unity * this.diff(Q).income;
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
      var cost = (this.memberUpkeep(Q) +
                  this.localCount(Q) * this.UPKEEP_PER_CITY) * this.diff(Q).upkeep;
      Q.upkeep_acc = (Q.upkeep_acc || 0) + cost;
      var pay = Math.floor(Q.upkeep_acc);
      if (pay > 0) { Q.upkeep_acc = Math.round((Q.upkeep_acc - pay) * 100) / 100; Q.budget -= pay; }
      Q.upkeep_now = Math.round(cost * 10) / 10;
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
        name: '警察と公安', lo: -3, hi: 3,
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
        name: '与阵营的距离', lo: -3, hi: 3,
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

    //  政策の一覧。サイドバーに出す。動いている軸だけ書く。
    policyBlock: function (Q) {
      var i, k, p, v, out = [], n = 0;
      for (i = 0; i < this.POLICY_KEYS.length; i++) {
        k = this.POLICY_KEYS[i];
        v = Q['pol_' + k] || 0;
        if (!v) { continue; }
        p = this.POLICY[k];
        n += 1;
        out.push('<span style="opacity:.8">' + p.name + '</span>　'
          + (v > 0 ? '<span style="color:#3E6E8C;">' : '<span style="color:#B23A34;">')
          + (v > 0 ? '＋' : '−') + Math.abs(v) + '</span>');
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
      Q.seats_hc = (Q.seats_hc || 0) + ht;
      Q.hc_shakai = Q.seats_hc;
      Q.hc_kyosan = 0;
      Q.hc_other = (Q.hc_other || 0) + (hk - ht);
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        v = Q['lean_' + l + '_kyosan'] || 0;
        Q['lean_' + l + '_shakai'] = (Q['lean_' + l + '_shakai'] || 0) + v * keep;
        Q['lean_' + l + '_other'] = (Q['lean_' + l + '_other'] || 0) + v * (1 - keep);
        Q['lean_' + l + '_kyosan'] = 0;
      }
      //  合同した議員は左派の席になる。大会の代議員も左へ寄る。
      Q.seat_saha = (Q.seat_saha || 0) + take;
      Q.del_saha = (Q.del_saha || 0) + Math.round(take * 0.6);
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
      if (Q.minsha_exists) {
        k = Q.res_minsha || 0; take = Math.round(k * keep);
        Q.seats_hr = (Q.seats_hr || 0) + take;
        Q.res_shakai = Q.seats_hr;
        Q.res_minsha = 0;
        Q.res_other = (Q.res_other || 0) + (k - take);
        var hk = Q.hc_minsha || 0, ht = Math.round(hk * keep);
        Q.seats_hc = (Q.seats_hc || 0) + ht;
        Q.hc_shakai = Q.seats_hc;
        Q.hc_minsha = 0;
        Q.hc_other = (Q.hc_other || 0) + (hk - ht);
        for (i = 0; i < LAYERS.length; i++) {
          l = LAYERS[i];
          v = Q['lean_' + l + '_minsha'] || 0;
          Q['lean_' + l + '_shakai'] = (Q['lean_' + l + '_shakai'] || 0) + v * keep;
          Q['lean_' + l + '_other'] = (Q['lean_' + l + '_other'] || 0) + v * (1 - keep);
          Q['lean_' + l + '_minsha'] = 0;
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
        this.transfer(Q, 'shinchukan', 'other', 'shakai', 5);
        this.transfer(Q, 'mishoshiki', 'other', 'shakai', 3);
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
    crisisReasons: function (Q) {
      var r = [], self = this, f;
      var fs = ['uha', 'chuu', 'chusa', 'saha'];
      var worst = 0;
      for (var i = 0; i < fs.length; i++) {
        f = fs[i];
        if (this.inParty(Q, f) && (Q['mood_' + f] || 0) > worst) { worst = Q['mood_' + f]; }
      }
      if (worst >= 92) { r.push('有派阀站在出口跟前'); }
      if (Q.in_power && Q.cab_kind !== 1 && (Q.coalition_rel || 0) <= 25) { r.push('联合快要垮了'); }
      if (Q.act === 1 && Q.phase === 2) { r.push('安保国会'); }
      if (Q.act === 5 && Q.phase === 3) { r.push('政界重编'); }
      if (Q.in_power && (Q.national_budget || 0) < 0) { r.push('国家预算编不出来'); }
      if ((Q.arrears || 0) >= 20 && (Q.budget || 0) <= 1) { r.push('党的金库空了'); }
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
        //  刻んだ手数を使い切ったら、理由が消えていなくても平時に戻る
        Q.crisis_turns_left = Math.max(0, (Q.crisis_turns_left || 0) - 1);
        if (!on || Q.crisis_turns_left <= 0) {
          Q.crisis_on = 0;
          Q.crisis_why = '';
          Q.crisis_turns_left = 0;
        }
      } else if (on && !Q.crisis_used) {
        //  局面ごとに一度だけ。crisis_used は局面の境で戻る
        Q.crisis_used = 1;
        Q.crisis_on = 1;
        Q.crisis_why = r.join('・');
        //  「暦は同じで手数が三倍」を素直にやると、第Ⅱ幕の12手局面で
        //  +24手になってしまう。危機として細かく刻むのは先の四手ぶんまで。
        Q.crisis_gain = Math.min(Q.turns_left, this.CRISIS_MAX_FINE) * (this.GRAIN_COARSE - 1);
        //  暦は turns_left で測るので、総手数も同じだけ増やす。
        //  そうしないと危機のあいだだけ暦が先へ走る（tickYear の①）。
        //  増やしたぶん一手あたりの月数が三分の一になる ── 危機の一手が
        //  一か月になるというのは、暦の側から見るとこのことである。
        var pcfg = this.ACTS[Q.act || 1];
        var pnow = Q.phase_turns || (pcfg && pcfg.phases[(Q.phase || 1) - 1]) || Q.turns_left;
        Q.phase_turns = pnow + Q.crisis_gain;
        Q.turns_left += Q.crisis_gain;
        //  鰴った手数と同じだけ続く。危機そのものが「細かい手の束」である
        Q.crisis_turns_left = Math.max(1, Q.crisis_gain);
        Q.grain = this.GRAIN_FINE;
        Q.crisis_shown = 0;
      }
      Q.grain = Q.crisis_on ? this.GRAIN_FINE : this.GRAIN_COARSE;
      Q.grain_name = Q.grain === this.GRAIN_FINE ? '一个月' : '一个季度';
      return Q.crisis_on;
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
    bandOf: function (Q) {
      var r = Q.route || 0, i, b;
      for (i = 0; i < this.ROUTE_BANDS.length; i++) {
        b = this.ROUTE_BANDS[i];
        if (r >= b.lo && r < b.hi) { return b.id; }
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
    LEFT_LOSE:  { shinchukan: 1.5, jieigyo: 1.2, noson: 1.0, mishoshiki: 0.5, minrou: 0.3 },
    LEFT_GAIN:  { kokorou: 1.2, minrou: 0.6, mishoshiki: 0.4 },

    baselineLean: function (Q, l) {
      var t = Math.min(1, Math.max(0, (this.yearOf(Q) - 1959) / 34));
      var u = Math.pow(t, this.FRONT);
      var b = this.LEAN_1959[l] + (this.LEAN_1993[l] - this.LEAN_1959[l]) * u;
      b += this.ORG_LEAN_PULL * (Q['orgb_' + l] || 0);
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
        b -= (this.LEFT_LOSE[l] || 0) * (-rr);
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
        when: function (Q) { return Q.year >= 1972 && Q.c_labor >= window.JSP.needOf(Q, 0.17); } },
      { n: 22, id: 'lockheed', name: 'ロッキード事件', acts: [3], need: { diet: 0.17 },
        // 一九七六年二月
        when: function (Q) { return Q.year >= 1972 && Q.c_diet >= window.JSP.needOf(Q, 0.17); } },
      { n: 23, id: 'shinjiyu', name: '新自由クラブ', acts: [3], need: { rel: 0.17 },
        // 一九七六年六月
        when: function (Q) { return Q.year >= 1972 && Q.c_rel >= window.JSP.needOf(Q, 0.17); } },
      { n: 24, id: 'narita_sangensoku', name: '野党共闘の三原則', acts: [3], need: { koryo: 0.17 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.17); } },
      { n: 25, id: 'sanrizuka', name: '三里塚', acts: [3], need: { rally: 0.17 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.17); } },

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
        when: function (Q) { return Q.phase >= 3 && Q.c_koryo >= window.JSP.needOf(Q, 0.12); } },
      { n: 45, id: 'shinto_boom', name: '新党ブーム', acts: [5], need: { rel: 0.17 },
        // 日本新党は一九九二年。局面3から
        when: function (Q) { return Q.phase >= 3 && Q.c_rel >= window.JSP.needOf(Q, 0.17); } },


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
        when: function (Q) { return Q.year >= 1958; } },
      // 警職法　1958年〜・史実
      { n: 1011, id: 'a1_keishokuho', name: '警職法', acts: [1], need: { diet: 0.2 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958; } },
      // 長崎国旗事件　1958年〜・史実
      { n: 8101, id: 'a1_nagasaki_kokki', name: '長崎国旗事件', acts: [1], need: { rel: 0.12 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958; } },
      // 団地　1958年〜・史実
      { n: 8102, id: 'a1_danchi', name: '団地', acts: [1], need: { org: 0.12 }, year: 1958, fixed: true,
        when: function (Q) { return Q.year >= 1958; } },
      // 砂川・伊達判決　1959年〜・史実
      { n: 1002, id: 'a1_sunagawa', name: '砂川・伊達判決', acts: [1], need: { rally: 0.15 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 「日中共同の敵」　1959年〜・asanumaが在席・史実
      { n: 1003, id: 'a1_asanuma_hokyo', name: '「日中共同の敵」', acts: [1], need: { rel: 0.2 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959 &&
                 window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 原水協の席次　1959年〜・史実
      { n: 1005, id: 'a1_gensuikyo', name: '原水協の席次', acts: [1], need: { rally: 0.2 }, year: 1959, fixed: true,
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
      { n: 1801, id: 'a1_isewan', name: '伊勢湾台風', acts: [1], need: { org: 0.14 }, year: 1959, fixed: true,
        when: function (Q) { return Q.year >= 1959; } },
      // 皇太子の結婚　1959年〜・史実
      { n: 1802, id: 'a1_kotaishi', name: '皇太子の結婚', acts: [1], need: { name: 0.14 }, year: 1959, fixed: true,
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
      // 日比谷の壇上　1960年〜・asanumaが退場後・史実
      { n: 1010, id: 'a1_asanuma_shi', name: '日比谷の壇上', acts: [1], need: { name: 0.35 }, year: 1960, fixed: true,
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
      // 政暴法　1961年〜・asanumaが退場後・史実
      { n: 2001, id: 'a2_seiboho', name: '政暴法', acts: [2], need: { diet: 0.15 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961 &&
                 !window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 河上委員長　1961年〜・kawakamiが在席・asanumaが退場後・史実
      { n: 2002, id: 'a2_kawakami', name: '河上委員長', acts: [2], need: { chair: 0.15 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961 &&
                 window.JSP.LEADERS.here(Q, 'kawakami') &&
                 !window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 国民皆保険　1961年〜・史実
      { n: 2165, id: 'a2_kokumin_kenko', name: '国民皆保険', acts: [2], need: { diet: 0.2 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961; } },
      // 農業基本法　1961年〜・史実
      { n: 8103, id: 'a2_nogyo_kihonho', name: '農業基本法', acts: [2], need: { org: 0.14 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961; } },
      // ソ連の核実験再開　1961年〜・史実
      { n: 8104, id: 'a2_kakujikken', name: 'ソ連の核実験再開', acts: [2], need: { rally: 0.14 }, year: 1961, fixed: true,
        when: function (Q) { return Q.year >= 1961; } },
      // キューバ危機　1962年〜・史実
      { n: 2801, id: 'a2_cuba', name: 'キューバ危機', acts: [2], need: { rally: 0.17 }, year: 1962, fixed: true,
        when: function (Q) { return Q.year >= 1962; } },
      // 新産業都市　1962年〜・史実
      { n: 2802, id: 'a2_shinsangyo', name: '新産業都市', acts: [2], need: { org: 0.2 }, year: 1962, fixed: true,
        when: function (Q) { return Q.year >= 1962; } },
      // 日韓基本条約　帯中間右/右・1963年〜・史実
      { n: 115, id: 'nikkan', name: '日韓基本条約', acts: [2], need: { diet: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // ベトナム戦争と北爆　帯中間右/右・1963年〜・史実
      { n: 116, id: 'vietnam', name: 'ベトナム戦争と北爆', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 東京オリンピック　1963年〜・史実
      { n: 312, id: 'a2_tokyo_gorin', name: '東京オリンピック', acts: [2], need: { rally: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // 公害が名前を持つ　帯中間右/右・1963年〜・史実
      { n: 313, id: 'a2_kougai_hajime', name: '公害が名前を持つ', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
        when: function (Q) { return Q.year >= 1963 &&
                 Q.minsha_exists; } },
      // 松川事件の判決　1963年〜・史実
      { n: 2161, id: 'a2_matsukawa', name: '松川事件の判決', acts: [2], need: { rally: 0.15 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963; } },
      // 日韓基本条約　帯左/中間左・1963年〜・史実
      { n: 7115, id: 'nikkan_sa', name: '日韓基本条約', acts: [2], need: { diet: 0.14 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // ベトナム戦争と北爆　帯左/中間左・1963年〜・史実
      { n: 7116, id: 'vietnam_sa', name: 'ベトナム戦争と北爆', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 公害が名前を持つ　帯左/中間左・1963年〜・史実
      { n: 7313, id: 'kougai_hajime_sa', name: '公害が名前を持つ', acts: [2], need: { rally: 0.2 }, year: 1963, fixed: true,
        when: function (Q) { return Q.year >= 1963 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
        when: function (Q) { return Q.year >= 1964; } },
      // 原潜寄港　1964年〜・史実
      { n: 2803, id: 'a2_gensen', name: '原潜寄港', acts: [2], need: { rally: 0.2 }, year: 1964, fixed: true,
        when: function (Q) { return Q.year >= 1964; } },
      // 佐々木更三　1965年〜・史実
      { n: 2008, id: 'a2_sasaki', name: '佐々木更三', acts: [2], need: { chair: 0.2 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965; } },
      // 日韓基本条約　1965年〜・史実
      { n: 2009, id: 'a2_nikkan', name: '日韓基本条約', acts: [2], need: { diet: 0.3 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965; } },
      // 北爆　1965年〜・史実
      { n: 2010, id: 'a2_vietnam', name: '北爆', acts: [2], need: { rally: 0.3 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965; } },
      // ベ平連　1965年〜・史実
      { n: 2804, id: 'a2_beheiren', name: 'ベ平連', acts: [2], need: { youth: 0.17 }, year: 1965, fixed: true,
        when: function (Q) { return Q.year >= 1965; } },
      // 黒い霧解散　帯中間右/右・1966年〜・史実
      { n: 117, id: 'kuroikiri', name: '黒い霧解散', acts: [2], need: { diet: 0.22 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 黒い霧　1966年〜・史実
      { n: 2016, id: 'a2_kuroi_kiri', name: '黒い霧', acts: [2], need: { name: 0.25 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966; } },
      // 中ソ対立　1966年〜・史実
      { n: 2036, id: 'a2_chuso', name: '中ソ対立', acts: [2], need: { rel: 0.35 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.kyokai_grip >= 35; } },
      // 黒い霧解散　帯左/中間左・1966年〜・史実
      { n: 7117, id: 'kuroikiri_sa', name: '黒い霧解散', acts: [2], need: { diet: 0.22 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 総評の代替わり　1966年〜・史実
      { n: 8012, id: 'a2_sohyo_kotai66', name: '総評の代替わり', acts: [2], need: { labor: 0.2 }, year: 1966, fixed: true,
        when: function (Q) { return Q.year >= 1966; } },
      // 学園紛争　帯中間右/右・1967年〜・史実
      { n: 119, id: 'gakuen', name: '学園紛争', acts: [2], need: { rally: 0.28 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 一九六七年一月　1967年〜・史実
      { n: 2019, id: 'a2_1967', name: '一九六七年一月', acts: [2], need: { hr: 0.35 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967 &&
                 Q.minsha_exists; } },
      // 公害　1967年〜・史実
      { n: 2027, id: 'a2_kogai', name: '公害', acts: [2], need: { org: 0.3 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967; } },
      // 学園紛争　帯左/中間左・1967年〜・史実
      { n: 7119, id: 'gakuen_sa', name: '学園紛争', acts: [2], need: { rally: 0.28 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 建国記念の日　1967年〜・史実
      { n: 2805, id: 'a2_kenkoku', name: '建国記念の日', acts: [2], need: { rally: 0.2 }, year: 1967, fixed: true,
        when: function (Q) { return Q.year >= 1967; } },
      // エンタープライズ　1968年〜・史実
      { n: 2020, id: 'a2_enterprise', name: 'エンタープライズ', acts: [2], need: { rally: 0.35 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
      // 社青同解放派　1968年〜・史実
      { n: 2034, id: 'a2_seinen_bunretsu', name: '社青同解放派', acts: [2], need: { youth: 0.35 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968 &&
                 Q.kyokai_grip >= 35; } },
      // プラハ　1968年〜・史実
      { n: 2037, id: 'a2_praha', name: 'プラハ', acts: [2], need: { rel: 0.4 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968 &&
                 Q.kyokai_grip >= 35; } },
      // 成田知巳　1968年〜・史実
      { n: 2042, id: 'a2_naritachi', name: '成田知巳', acts: [2], need: { chair: 0.35 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
      // 水俣　1968年〜・史実
      { n: 2166, id: 'a2_suigai', name: '水俣', acts: [2], need: { org: 0.25 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
      // 大学の紛争　1968年〜・史実
      { n: 2167, id: 'a2_gakusei_undo', name: '大学の紛争', acts: [2], need: { youth: 0.25 }, year: 1968, fixed: true,
        when: function (Q) { return Q.year >= 1968; } },
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
        when: function (Q) { return Q.year >= 1969 &&
                 Q.minsha_exists; } },
      // 七〇年安保への構え　1969年〜・史実
      { n: 2049, id: 'a2_anpo_jido', name: '七〇年安保への構え', acts: [2], need: { rally: 0.4 }, year: 1969, fixed: true,
        when: function (Q) { return Q.year >= 1969; } },
      // 自社連立の打診　史実
      { n: 4807, id: 'a4_jisha_dashin', name: '自社連立の打診', acts: [3, 4], need: { diet: 0.2 }, fixed: true,
        when: function (Q) { return Q.minsha_ka && !Q.jisha_pact && !Q.in_power && !Q.kyosan_merged && !Q.minshu_shinto && (Q.elec_year || 0) >= 1976 && (Q.res_jimin || 0) < Math.floor((Q.hr_total || 511) / 2) + 1 && (Q.res_jimin || 0) + (Q.seats_hr || 0) >= Math.floor((Q.hr_total || 511) / 2) + 1; } },
      // 自動延長　1970年〜・史実
      { n: 3001, id: 'a3_jido_encho', name: '自動延長', acts: [3], need: { rally: 0.2 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // 公害国会　1970年〜・史実
      { n: 3002, id: 'a3_kogai_kokkai', name: '公害国会', acts: [3], need: { diet: 0.2 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970 &&
                 Q.local_n >= 1; } },
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
      { n: 8105, id: 'a3_anpo_jido70', name: '七〇年安保の自動延長', acts: [3], need: { rally: 0.14 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // ウーマン・リブ　1970年〜・史実
      { n: 8113, id: 'a3_uman_ribu', name: 'ウーマン・リブ', acts: [3], need: { org: 0.16 }, year: 1970, fixed: true,
        when: function (Q) { return Q.year >= 1970; } },
      // 三里塚　1971年〜・史実
      { n: 3003, id: 'a3_sanrizuka', name: '三里塚', acts: [3], need: { rally: 0.25 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971; } },
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
      { n: 3801, id: 'a3_kogai_saiban', name: '四大公害裁判', acts: [3], need: { diet: 0.2 }, year: 1971, fixed: true,
        when: function (Q) { return Q.year >= 1971; } },
      // 日中国交正常化　1972年〜・史実
      { n: 133, id: 'nicchu', name: '日中国交正常化', acts: [3], need: { rel: 0.14 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // 金脈問題　1972年〜・史実
      { n: 135, id: 'kinmyaku', name: '金脈問題', acts: [3], need: { diet: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // ニクソン訪中　1972年〜・史実
      { n: 322, id: 'a3_bei_chugoku', name: 'ニクソン訪中', acts: [3], need: { rel: 0.14 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // 列島改造と地価　1972年〜・史実
      { n: 323, id: 'a3_retto_kaizo', name: '列島改造と地価', acts: [3], need: { diet: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // あさま山荘　1972年〜・史実
      { n: 3006, id: 'a3_asama', name: 'あさま山荘', acts: [3], need: { name: 0.2 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
      // 日中国交正常化　1972年〜・史実
      { n: 3007, id: 'a3_nicchu', name: '日中国交正常化', acts: [3], need: { rel: 0.25 }, year: 1972, fixed: true,
        when: function (Q) { return Q.year >= 1972; } },
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
      // 金脈　1974年〜・史実
      { n: 3010, id: 'a3_kaneda', name: '金脈', acts: [3], need: { name: 0.25 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // 企業ぐるみ選挙　1974年〜・史実
      { n: 3011, id: 'a3_kigyo_gurumi', name: '企業ぐるみ選挙', acts: [3], need: { hc: 0.3 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // 三木内閣　1974年〜・史実
      { n: 3012, id: 'a3_miki', name: '三木内閣', acts: [3], need: { diet: 0.25 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // 原子力船むつ　1974年〜・史実
      { n: 3804, id: 'a3_mutsu', name: '原子力船むつ', acts: [3], need: { org: 0.2 }, year: 1974, fixed: true,
        when: function (Q) { return Q.year >= 1974; } },
      // スト権スト　帯中間右/右・1975年〜・史実
      { n: 3013, id: 'a3_suto_ken', name: 'スト権スト', acts: [3], need: { labor: 0.35 }, year: 1975, fixed: true,
        when: function (Q) { return Q.year >= 1975 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中道連合の始まり　軸未定/社公民・1976年〜・史実
      { n: 140, id: 'shakomin_goi_zen', name: '中道連合の始まり', acts: [3], need: { rel: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 三木の政治改革　1976年〜・史実
      { n: 325, id: 'a3_miki_kaikaku', name: '三木の政治改革', acts: [3], need: { diet: 0.2 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists; } },
      // ロッキードのあと　1976年〜・史実
      { n: 432, id: 'a3_lockheed_ato', name: 'ロッキードのあと', acts: [3], need: { diet: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists; } },
      // 革新自治体の敗北　1976年〜・史実
      { n: 433, id: 'a3_kakushin_haiboku', name: '革新自治体の敗北', acts: [3], need: { rel: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists; } },
      // ロッキード　帯中間右/右・1976年〜・史実
      { n: 3015, id: 'a3_lockheed', name: 'ロッキード', acts: [3], need: { name: 0.35 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新自由クラブ　1976年〜・史実
      { n: 3016, id: 'a3_shinjiyu', name: '新自由クラブ', acts: [3], need: { hr: 0.35 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976; } },
      // 保革伯仲　帯中間右/右・1976年〜・史実
      { n: 3017, id: 'a3_hakuchu', name: '保革伯仲', acts: [3], need: { hr: 0.4 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_exists && Q.seats_hr >= 110; } },
      // 一九七六年十二月　1976年〜・史実
      { n: 3170, id: 'a3_1976_senkyo', name: '一九七六年十二月', acts: [3], need: { hr: 0.4 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 Q.komei_exists; } },
      // 主任制　1976年〜・史実
      { n: 3171, id: 'a3_shunin_kyoiku', name: '主任制', acts: [3], need: { labor: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976; } },
      // 保革伯仲　帯左/中間左・1976年〜・史実
      { n: 7138, id: 'hokaku_hakuchu_sa', name: '保革伯仲', acts: [3], need: { diet: 0.25 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.seats_hr >= 110; } },
      // ロッキード　帯左/中間左・1976年〜・史実
      { n: 7315, id: 'lockheed_sa', name: 'ロッキード', acts: [3], need: { name: 0.35 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 数の均衡　帯左/中間左・1976年〜・史実
      { n: 7317, id: 'hakuchu2_sa', name: '数の均衡', acts: [3], need: { hr: 0.4 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.seats_hr >= 110; } },
      // 査問問題　1976年〜・史実
      { n: 3802, id: 'a3_miyamoto_samon', name: '査問問題', acts: [3], need: { rel: 0.2 }, year: 1976, fixed: true,
        when: function (Q) { return Q.year >= 1976; } },
      // 飛鳥田一雄　1977年〜・史実
      { n: 3020, id: 'a3_asukata', name: '飛鳥田一雄', acts: [3], need: { chair: 0.3 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.local_n >= 1; } },
      // 社会市民連合　1977年〜・史実
      { n: 3210, id: 'a3_shakai_shiminren', name: '社会市民連合', acts: [3], need: { split: 0.35 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977; } },
      // 一九七七年参院選　1977年〜・史実
      { n: 3211, id: 'a3_1977_sanin', name: '一九七七年参院選', acts: [3], need: { hc: 0.35 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.local_n >= 1; } },
      // 共産党の党首公選　1977年〜・史実
      { n: 3803, id: 'a3_kyosan_kosen', name: '共産党の党首公選', acts: [3], need: { rel: 0.14 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.kyosan_kosen; } },
      // 円高不況　1977年〜・史実
      { n: 3805, id: 'a3_endaka', name: '円高不況', acts: [3], need: { labor: 0.2 }, year: 1977, fixed: true,
        when: function (Q) { return Q.year >= 1977; } },
      // 開港　1978年〜・史実
      { n: 4001, id: 'a4_narita_kaiko', name: '開港', acts: [4], need: { rally: 0.15 }, year: 1978, fixed: true,
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
      { n: 8107, id: 'a4_guideline', name: '日米防衛協力の指針', acts: [4], need: { diet: 0.16 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978; } },
      // 超法規的行動　1978年〜・史実
      { n: 8108, id: 'a4_kurisu', name: '超法規的行動', acts: [4], need: { diet: 0.14 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978; } },
      // 牛肉・オレンジ　1978年〜・史実
      { n: 4801, id: 'a4_gyuniku', name: '牛肉・オレンジ', acts: [4], need: { diet: 0.2 }, year: 1978, fixed: true,
        when: function (Q) { return Q.year >= 1978; } },
      // 自治体からの撤退　1979年〜・史実
      { n: 441, id: 'a4_shakomin_jichitai', name: '自治体からの撤退', acts: [4], need: { org: 0.14 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 Q.local_n >= 1; } },
      // 美濃部引退　1979年〜・史実
      { n: 4002, id: 'a4_minobe_intai', name: '美濃部引退', acts: [4], need: { org: 0.2 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 Q.komei_exists; } },
      // 革新自治体の崩落　帯中間右/右・1979年〜・史実
      { n: 4003, id: 'a4_jichitai_hokai', name: '革新自治体の崩落', acts: [4], need: { org: 0.3 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.local_n >= 2; } },
      // 一般消費税　帯中間右/右・1979年〜・史実
      { n: 4004, id: 'a4_shohizei_1', name: '一般消費税', acts: [4], need: { diet: 0.2 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 元号法制化　1979年〜・史実
      { n: 4162, id: 'a4_gengo', name: '元号法制化', acts: [4], need: { diet: 0.15 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979; } },
      // 一九七九年十月　1979年〜・史実
      { n: 4163, id: 'a4_1979_senkyo', name: '一九七九年十月', acts: [4], need: { hr: 0.25 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 Q.minsha_exists; } },
      // 革新自治体の崩落　帯左/中間左・1979年〜・史実
      { n: 7402, id: 'jichitai_hokai_sa', name: '革新自治体の崩落', acts: [4], need: { org: 0.3 }, year: 1979, fixed: true,
        when: function (Q) { return Q.year >= 1979 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.local_n >= 2; } },
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
        when: function (Q) { return Q.year >= 1980; } },
      // 教科書問題　1980年〜・史実
      { n: 153, id: 'kyokasho', name: '教科書問題', acts: [4], need: { rel: 0.14 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980; } },
      // 指紋押捺拒否　1980年〜・史実
      { n: 4301, id: 'a4_shimon', name: '指紋押捺拒否', acts: [4], need: { rally: 0.2 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980; } },
      // 社公合意　軸未定/社公民・1980年〜・史実
      { n: 4005, id: 'a4_shako_goi', name: '社公合意', acts: [4], need: { rel: 0.3 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // ハプニング解散　1980年〜・史実
      { n: 4006, id: 'a4_happening', name: 'ハプニング解散', acts: [4], need: { diet: 0.3 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980; } },
      // 選挙中の死　1980年〜・史実
      { n: 4164, id: 'a4_ohira_shi', name: '選挙中の死', acts: [4], need: { name: 0.2 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980; } },
      // 一九八〇年六月　1980年〜・史実
      { n: 4176, id: 'a4_1980_senkyo', name: '一九八〇年六月', acts: [4], need: { hr: 0.3 }, year: 1980, fixed: true,
        when: function (Q) { return Q.year >= 1980 &&
                 Q.minsha_exists; } },
      // 第二臨調　帯中間右/右・1981年〜・史実
      { n: 4007, id: 'a4_rincho', name: '第二臨調', acts: [4], need: { labor: 0.25 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 第二臨調　帯左/中間左・1981年〜・史実
      { n: 7401, id: 'rincho_sa', name: '第二臨調', acts: [4], need: { labor: 0.25 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中国残留孤児　1981年〜・史実
      { n: 8109, id: 'a4_zanryu_koji', name: '中国残留孤児', acts: [4], need: { diet: 0.14 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981; } },
      // 国際障害者年　1981年〜・史実
      { n: 8110, id: 'a4_shogaisha', name: '国際障害者年', acts: [4], need: { org: 0.16 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981; } },
      // ライシャワー発言　1981年〜・史実
      { n: 4802, id: 'a4_reischauer', name: 'ライシャワー発言', acts: [4], need: { rally: 0.2 }, year: 1981, fixed: true,
        when: function (Q) { return Q.year >= 1981; } },
      // 労働戦線統一の民間先行　1982年〜・史実
      { n: 156, id: 'minkan_senko', name: '労働戦線統一の民間先行', acts: [4], need: { labor: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 Q.minsha_exists; } },
      // 難民条約と国民年金　1982年〜・史実
      { n: 4302, id: 'a4_nanmin', name: '難民条約と国民年金', acts: [4], need: { diet: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982; } },
      // 全民労協　帯中間右/右・1982年〜・史実
      { n: 4008, id: 'a4_zenmin_rokyo', name: '全民労協', acts: [4], need: { labor: 0.3 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中曽根内閣　帯中間右/右・1982年〜・史実
      { n: 4009, id: 'a4_nakasone', name: '中曽根内閣', acts: [4], need: { name: 0.25 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 教科書問題　1982年〜・史実
      { n: 4010, id: 'a4_kyokashu', name: '教科書問題', acts: [4], need: { rally: 0.2 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982; } },
      // 全民労協　帯左/中間左・1982年〜・史実
      { n: 7404, id: 'zenmin_rokyo_sa', name: '全民労協', acts: [4], need: { labor: 0.3 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 中曽根内閣　帯左/中間左・1982年〜・史実
      { n: 7405, id: 'nakasone_sa', name: '中曽根内閣', acts: [4], need: { name: 0.25 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共産党の綱領改定　1982年〜・史実
      { n: 4805, id: 'a4_kyosan_koryo', name: '共産党の綱領改定', acts: [4], need: { rel: 0.14 }, year: 1982, fixed: true,
        when: function (Q) { return Q.year >= 1982 &&
                 Q.kyosan_kaikaku; } },
      // 「不沈空母」発言　1983年〜・史実
      { n: 154, id: 'fuchinkubo', name: '「不沈空母」発言', acts: [4], need: { rally: 0.14 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
      // 男女雇用機会均等法　1983年〜・史実
      { n: 155, id: 'kintou_ho', name: '男女雇用機会均等法', acts: [4], need: { diet: 0.2 }, year: 1983, fixed: true,
        when: function (Q) { return Q.year >= 1983; } },
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
        when: function (Q) { return Q.year >= 1983; } },
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
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
      { n: 8111, id: 'a4_rinkyoshin', name: '臨時教育審議会', acts: [4], need: { labor: 0.16 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 健康保険の一割負担　1984年〜・史実
      { n: 8112, id: 'a4_kenpo_kaisei', name: '健康保険の一割負担', acts: [4], need: { labor: 0.18 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 被爆者援護法　1984年〜・史実
      { n: 4803, id: 'a4_hibakusha', name: '被爆者援護法', acts: [4], need: { diet: 0.2 }, year: 1984, fixed: true,
        when: function (Q) { return Q.year >= 1984; } },
      // 国鉄の処理　帯中間右/右・1985年〜・史実
      { n: 4014, id: 'a4_kokutetsu_bunkatsu', name: '国鉄の処理', acts: [4], need: { labor: 0.4 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 男女雇用機会均等法　帯中間右/右・1985年〜・史実
      { n: 4015, id: 'a4_danjo', name: '男女雇用機会均等法', acts: [4], need: { diet: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 電電と専売　1985年〜・史実
      { n: 4165, id: 'a4_denden_senbai', name: '電電と専売', acts: [4], need: { labor: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 公式参拝　1985年〜・史実
      { n: 4166, id: 'a4_yasukuni', name: '公式参拝', acts: [4], need: { rally: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // プラザ合意　1985年〜・史実
      { n: 4167, id: 'a4_plaza', name: 'プラザ合意', acts: [4], need: { org: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 年金の改定　1985年〜・史実
      { n: 4204, id: 'a4_nenkin_kaisei', name: '年金の改定', acts: [4], need: { diet: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 「戦後政治の総決算」　1985年〜・史実
      { n: 4208, id: 'a4_sengo_seiji', name: '「戦後政治の総決算」', acts: [4], need: { koryo: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 指紋押捺　1985年〜・史実
      { n: 4210, id: 'a4_zainichi', name: '指紋押捺', acts: [4], need: { rally: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 労働戦線の詰め　1985年〜・史実
      { n: 4212, id: 'a4_1985_toitsu', name: '労働戦線の詰め', acts: [4], need: { labor: 0.35 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 Q.minsha_exists; } },
      // 国鉄の処理　帯左/中間左・1985年〜・史実
      { n: 7403, id: 'kokutetsu_bunkatsu_sa', name: '国鉄の処理', acts: [4], need: { labor: 0.4 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 男女雇用機会均等法　帯左/中間左・1985年〜・史実
      { n: 7407, id: 'danjo_sa', name: '男女雇用機会均等法', acts: [4], need: { diet: 0.25 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 補助金の一律削減　1985年〜・史実
      { n: 4804, id: 'a4_hojokin', name: '補助金の一律削減', acts: [4], need: { diet: 0.2 }, year: 1985, fixed: true,
        when: function (Q) { return Q.year >= 1985; } },
      // 自社連立の再打診　史実
      { n: 5807, id: 'a5_jisha_saido', name: '自社連立の再打診', acts: [5], need: { diet: 0.2 }, fixed: true,
        when: function (Q) { return Q.minsha_ka && Q.reorg_done && !Q.jisha_pact && !Q.in_power && !Q.kyosan_merged && !Q.minshu_shinto && Q.evdone_a4_jisha_dashin && (Q.elec_year || 0) >= 1986 && (Q.res_jimin || 0) < Math.floor((Q.hr_total || 511) / 2) + 1 && (Q.res_jimin || 0) + (Q.seats_hr || 0) >= Math.floor((Q.hr_total || 511) / 2) + 1; } },
      // 国民民主党　史実
      { n: 5808, id: 'a5_kokumin_minshu', name: '国民民主党', acts: [5], need: { koryo: 0.2 }, fixed: true,
        when: function (Q) { return Q.jisha_cabinet && Q.in_power && Q.cab_kind === 4 && Q.reorg_done && !Q.kokumin_minshu && !Q.kyosan_merged && !Q.minshu_shinto; } },
      // 昭和が終わる　1986年〜・史実
      { n: 173, id: 'tenno', name: '昭和が終わる', acts: [5], need: { rel: 0.2 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986 &&
                 Q.local_n >= 1; } },
      // マドンナたち　1986年〜・史実
      { n: 341, id: 'a5_madonna', name: 'マドンナたち', acts: [5], need: { org: 0.14 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 地価と株価　1986年〜・史実
      { n: 342, id: 'a5_baburu', name: '地価と株価', acts: [5], need: { diet: 0.14 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 国鉄の後始末　1986年〜・史実
      { n: 343, id: 'a5_kokutetsu_saiyou', name: '国鉄の後始末', acts: [5], need: { labor: 0.14 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 押捺拒否一万人　1986年〜・史実
      { n: 5301, id: 'a5_shimon_zenkoku', name: '押捺拒否一万人', acts: [5], need: { rally: 0.22 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 一九八六年七月　1986年〜・史実
      { n: 5001, id: 'a5_doujitsu86', name: '一九八六年七月', acts: [5], need: { hr: 0.15 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 原発をどうするか　1986年〜・史実
      { n: 5207, id: 'a5_chernobyl', name: '原発をどうするか', acts: [5], need: { rally: 0.25 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 前川リポート　1986年〜・史実
      { n: 5801, id: 'a5_maekawa', name: '前川リポート', acts: [5], need: { labor: 0.2 }, year: 1986, fixed: true,
        when: function (Q) { return Q.year >= 1986; } },
      // 売上税　1987年〜・史実
      { n: 5003, id: 'a5_baiagezei', name: '売上税', acts: [5], need: { diet: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987; } },
      // 民間連合　1987年〜・史実
      { n: 5004, id: 'a5_rengo_minkan', name: '民間連合', acts: [5], need: { labor: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 Q.minsha_exists; } },
      // 国労の最後　1987年〜・史実
      { n: 5102, id: 'a5_b1_kokurou_saigo', name: '国労の最後', acts: [5], need: { labor: 0.25 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987; } },
      // 一九八七年の地方選　1987年〜・史実
      { n: 5161, id: 'a5_chihosen87', name: '一九八七年の地方選', acts: [5], need: { org: 0.15 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987; } },
      // 竹下内閣　1987年〜・史実
      { n: 5162, id: 'a5_takeshita', name: '竹下内閣', acts: [5], need: { name: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987; } },
      // 統一地方選（一九八七年）　1987年〜・史実
      { n: 8032, id: 'a5_touitsu_87', name: '統一地方選（一九八七年）', acts: [5], need: { org: 0.2 }, year: 1987, fixed: true,
        when: function (Q) { return Q.year >= 1987 &&
                 Q.local_n >= 1; } },
      // リクルート　帯中間右/右・1988年〜・史実
      { n: 5005, id: 'a5_recruit', name: 'リクルート', acts: [5], need: { name: 0.25 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 消費税成立　帯中間右/右・1988年〜・史実
      { n: 5006, id: 'a5_shohizei_seiritsu', name: '消費税成立', acts: [5], need: { diet: 0.3 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // リクルート　帯左/中間左・1988年〜・史実
      { n: 7602, id: 'recruit_sa', name: 'リクルート', acts: [5], need: { name: 0.25 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 消費税成立　帯左/中間左・1988年〜・史実
      { n: 7603, id: 'shohizei_seiritsu_sa', name: '消費税成立', acts: [5], need: { diet: 0.3 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 自粛　1988年〜・史実
      { n: 8114, id: 'a5_jishuku', name: '自粛', acts: [5], need: { diet: 0.16 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988; } },
      // 牛肉・オレンジの自由化　1988年〜・史実
      { n: 5802, id: 'a5_gyuniku_jiyuka', name: '牛肉・オレンジの自由化', acts: [5], need: { org: 0.2 }, year: 1988, fixed: true,
        when: function (Q) { return Q.year >= 1988; } },
      // 宇野内閣　1989年〜・史実
      { n: 5007, id: 'a5_uno', name: '宇野内閣', acts: [5], need: { name: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 山が動いた　帯中間右/右・1989年〜・史実
      { n: 5008, id: 'a5_yama_ga_ugoita', name: '山动了', acts: [5], need: { hc: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.seats_hc >= 80; } },
      // 連合結成　帯中間右/右・1989年〜・史実
      { n: 5009, id: 'a5_rengo_kessei', name: '連合結成', acts: [5], need: { labor: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 昭和が終わる　1989年〜・史実
      { n: 5163, id: 'a5_showa_owari', name: '昭和が終わる', acts: [5], need: { name: 0.2 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 四月一日　1989年〜・史実
      { n: 5164, id: 'a5_shohizei_jisshi', name: '四月一日', acts: [5], need: { diet: 0.25 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 「やるっきゃない」　1989年〜・史実
      { n: 5165, id: 'a5_doi_ninki', name: '「やるっきゃない」', acts: [5], need: { name: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 海部内閣　1989年〜・史実
      { n: 5166, id: 'a5_kaifu', name: '海部内閣', acts: [5], need: { name: 0.25 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 総評解散　1989年〜・史実
      { n: 5169, id: 'a5_sohyo_kaisan', name: '総評解散', acts: [5], need: { labor: 0.3 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 Q.kyokai_grip >= 35; } },
      // 土地基本法　1989年〜・史実
      { n: 5204, id: 'a5_tochi_kihon', name: '土地基本法', acts: [5], need: { diet: 0.25 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 山が動いた　帯左/中間左・1989年〜・史実
      { n: 7604, id: 'yama_ga_ugoita_sa', name: '山动了', acts: [5], need: { hc: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.seats_hc >= 80; } },
      // 連合結成　帯左/中間左・1989年〜・史実
      { n: 7605, id: 'rengo_kessei_sa', name: '連合結成', acts: [5], need: { labor: 0.35 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 労働戦線の帰結　1989年〜・史実
      { n: 8002, id: 'a5_roso_kiketsu', name: '労働戦線の帰結', acts: [5], need: { labor: 0.2 }, year: 1989, fixed: true,
        when: function (Q) { return Q.year >= 1989; } },
      // 東欧革命　1990年〜・史実
      { n: 174, id: 'toou', name: '東欧革命', acts: [5], need: { koryo: 0.14 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
      // コメ市場開放　1990年〜・史実
      { n: 175, id: 'kome', name: 'コメ市場開放', acts: [5], need: { labor: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
      // 佐川急便事件　1990年〜・史実
      { n: 176, id: 'sagawa', name: '佐川急便事件', acts: [5], need: { diet: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
      // 世代交代　1990年〜・史実
      { n: 179, id: 'yamahana', name: '世代交代', acts: [5], need: { org: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.komei_exists; } },
      // 参院選の大勝　1990年〜・史実
      { n: 452, id: 'a5_sanin_daishou', name: '参院選の大勝', acts: [5], need: { rally: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
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
        when: function (Q) { return Q.year >= 1990; } },
      // 閣僚配分の交渉　軸社公民・1990年〜・史実
      { n: 633, id: 'c2_a5_kakuryo_haibun', name: '閣僚配分の交渉', acts: [5], need: { rel: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 一九九〇年二月　1990年〜・史実
      { n: 5010, id: 'a5_1990', name: '一九九〇年二月', acts: [5], need: { hr: 0.35 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.minsha_exists; } },
      // 湾岸　帯中間右/右・1990年〜・史実
      { n: 5011, id: 'a5_wangan', name: '湾岸', acts: [5], need: { rally: 0.3 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 地価　1990年〜・史実
      { n: 5167, id: 'a5_bubble', name: '地価', acts: [5], need: { org: 0.25 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990; } },
      // 湾岸　帯左/中間左・1990年〜・史実
      { n: 7606, id: 'wangan_sa', name: '湾岸', acts: [5], need: { rally: 0.3 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社共合同　1990年〜・史実
      { n: 5805, id: 'a5_shakyo_gassho', name: '社共合同', acts: [5], need: { rel: 0.2 }, year: 1990, fixed: true,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.kyosan_kaikaku && Q.evdone_toou && !Q.kyosan_merged && !Q.minshu_shinto && window.JSP.bandOf(Q) <= 2 && (Q.rel_kyosan || 0) >= 50; } },
      // 日韓覚書と特別永住　1991年〜・史実
      { n: 5302, id: 'a5_tokubetsu_eiju', name: '日韓覚書と特別永住', acts: [5], need: { rel: 0.25 }, year: 1991, fixed: true,
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
        when: function (Q) { return Q.year >= 1991; } },
      // 九十億ドル　1991年〜・史実
      { n: 5168, id: 'a5_wangan_kikin', name: '九十億ドル', acts: [5], need: { diet: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.komei_exists; } },
      // ソ連が消えた　帯左/中間左・1991年〜・史実
      { n: 7607, id: 'soren_sa', name: 'ソ連が消えた', acts: [5], need: { koryo: 0.3 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 証券不祥事　1991年〜・史実
      { n: 5803, id: 'a5_shoken', name: '証券不祥事', acts: [5], need: { diet: 0.25 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991; } },
      // 育児休業法　1991年〜・史実
      { n: 5804, id: 'a5_ikuji', name: '育児休業法', acts: [5], need: { diet: 0.2 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991; } },
      // 民主リベラル新党　1991年〜・史実
      { n: 5806, id: 'a5_minshu_kessei', name: '民主リベラル新党', acts: [5], need: { rel: 0.2 }, year: 1991, fixed: true,
        when: function (Q) { return Q.year >= 1991 &&
                 Q.rengo_formed && Q.reorg_done && !Q.minshu_shinto && !Q.kyosan_merged && !Q.jisha_pact && !Q.jisha_cabinet && window.JSP.bandOf(Q) === 4 && (window.JSP.factionOf(Q.post_chair) === "uha" || window.JSP.factionOf(Q.post_chair) === "chuu"); } },
      // PKO国会　帯中間右/右・1992年〜・史実
      { n: 5014, id: 'a5_pko', name: 'PKO国会', acts: [5], need: { diet: 0.35 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 小選挙区制　帯中間右/右・1992年〜・史実
      { n: 5016, id: 'a5_shosenkyoku', name: '小選挙区制', acts: [5], need: { koryo: 0.35 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 東京佐川急便　1992年〜・史実
      { n: 8115, id: 'a5_sagawa', name: '東京佐川急便', acts: [5], need: { name: 0.16 }, year: 1992, fixed: true,
        when: function (Q) { return Q.year >= 1992; } },
      // 内閣不信任　1993年〜・史実
      { n: 5018, id: 'a5_fushinnin', name: '内閣不信任', acts: [5], need: { diet: 0.4 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.cab_kind > 0; } },
      // 一九九三年七月　帯中間右/右・1993年〜・史実
      { n: 5019, id: 'a5_1993', name: '一九九三年七月', acts: [5], need: { hr: 0.5 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 山花委員長　1993年〜・史実
      { n: 5020, id: 'a5_yamahana', name: '山花委員長', acts: [5], need: { chair: 0.35 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.cab_kind > 0; } },
      // 政治改革関連法　1993年〜・史実
      { n: 5172, id: 'a5_seiji_kaikaku_ho', name: '政治改革関連法', acts: [5], need: { diet: 0.35 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.komei_exists; } },
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
                 Q.cab_kind > 0; } },
      // 一九九三年七月　帯左/中間左・1993年〜・史実
      { n: 7610, id: 'senkyo93_sa', name: '一九九三年七月', acts: [5], need: { hr: 0.5 }, year: 1993, fixed: true,
        when: function (Q) { return Q.year >= 1993 &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 警職法の記憶
      { n: 101, id: 'keishokuho', name: '警職法の記憶', acts: [1], need: { rally: 0.12 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.12); } },
      // 機関紙の拡張運動
      { n: 102, id: 'kikanshi_kakucho', name: '機関紙の拡張運動', acts: [2], need: { fund: 0.12 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.12); } },
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
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 沖縄と小笠原
      { n: 106, id: 'okinawa_59', name: '沖縄と小笠原', acts: [2], need: { rel: 0.12 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.12); } },
      // 浅沼訪中　asanumaが在席
      { n: 107, id: 'asanuma_china', name: '浅沼訪中', acts: [1], need: { rel: 0.22 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.22) &&
                 window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 松川事件の判決
      { n: 108, id: 'matsukawa', name: '松川事件の判決', acts: [2], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2); } },
      // 全学連の突出　帯左/中間左
      { n: 109, id: 'zengakuren_59', name: '全学連の突出', acts: [2], need: { rally: 0.28 },
        when: function (Q) { return Q.c_rally >= window.JSP.needOf(Q, 0.28) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政暴法　asanumaが退場後
      { n: 111, id: 'seiboho', name: '政暴法', acts: [2], need: { diet: 0.14 },
        when: function (Q) { return Q.year <= 1963 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 !window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 江田ビジョン　帯中間左/中間右・edaが在席
      { n: 112, id: 'eda_vision', name: '江田ビジョン', acts: [2], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [2, 3].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda'); } },
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
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
                 Q.local_n >= 1; } },
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
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14); } },
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
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14); } },
      // 土井委員長の登場　帯中間右/右
      { n: 172, id: 'doi_shunin', name: '土井委員長の登場', acts: [5], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
                 Q.komei_exists; } },
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
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 全労協の準備　帯左・1988年〜
      { n: 241, id: 'a5_saha_zenrokyo', name: '全労協の準備', acts: [5], need: { labor: 0.2 }, year: 1988,
        when: function (Q) { return Q.year >= 1988 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 新党構想　帯右・1990年〜
      { n: 242, id: 'a5_uha_shinto', name: '新党構想', acts: [5], need: { koryo: 0.2 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社共共闘の最後　軸社共
      { n: 243, id: 'a5_sakyo_saigo', name: '社共共闘の最後', acts: [5], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 一六六議席のあと　asanumaが在席
      { n: 301, id: 'a1_1958_senkyo', name: '一六六議席のあと', acts: [1], need: { koryo: 0.12 },
        when: function (Q) { return Q.year <= 1959 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.12) &&
                 window.JSP.LEADERS.here(Q, 'asanuma'); } },
      // 勤評闘争
      { n: 302, id: 'a1_gyakkoro', name: '勤評闘争', acts: [1], need: { labor: 0.12 },
        when: function (Q) { return Q.year <= 1960 &&
                 Q.c_labor >= window.JSP.needOf(Q, 0.12); } },
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
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 所得倍増計画　帯中間右/右
      { n: 311, id: 'a2_shotoku_baizo', name: '所得倍増計画', acts: [2], need: { diet: 0.14 },
        when: function (Q) { return Q.year <= 1965 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.14) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.14); } },
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
                 Q.minsha_exists; } },
      // 党の名前　1990年〜
      { n: 345, id: 'a5_shakaito_saigo', name: '党の名前', acts: [5], need: { koryo: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.14); } },
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
      // 党財政の底
      { n: 413, id: 'a2_zaisei_kiki', name: '党財政の底', acts: [2], need: { fund: 0.2 },
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
                 Q.c_rally >= window.JSP.needOf(Q, 0.25); } },
      // 社会保障の設計
      { n: 423, id: 'a2_shakai_hosho', name: '社会保障の設計', acts: [2], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25); } },
      // 炭鉱の閉山
      { n: 424, id: 'a2_hokkaido_tanko', name: '炭鉱の閉山', acts: [2], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 Q.local_n >= 1; } },
      // 社会主義インター　帯中間左/中間右/右
      { n: 425, id: 'a2_kokusai', name: '社会主義インター', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [2, 3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 青年組織の空洞
      { n: 431, id: 'a3_seiseido_kaitai', name: '青年組織の空洞', acts: [3], need: { org: 0.14 },
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
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 政策集団と学者　帯中間左/中間右/右
      { n: 437, id: 'a3_gakusha', name: '政策集団と学者', acts: [3], need: { koryo: 0.14 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [2, 3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 核持ち込み疑惑
      { n: 443, id: 'a4_kaku_mochikomi', name: '核持ち込み疑惑', acts: [4], need: { diet: 0.25 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25); } },
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
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25); } },
      // 日本新党ブーム　1990年〜
      { n: 455, id: 'a5_hosokawa_boom', name: '日本新党ブーム', acts: [5], need: { rally: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_rally >= window.JSP.needOf(Q, 0.14) &&
                 Q.komei_exists; } },
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
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3); } },
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
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3); } },
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
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
                 Q.cab_kind > 0; } },
      // 協同組合との関係
      { n: 545, id: 'a5_soshiki_kyodo', name: '協同組合との関係', acts: [5], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14); } },
      // 協会の最後の抵抗　帯左
      { n: 546, id: 'a5_saha_shinsha', name: '協会の最後の抵抗', acts: [5], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 解党論　帯右・1990年〜
      { n: 547, id: 'a5_uha_kaisan', name: '解党論', acts: [5], need: { koryo: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.14) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 革新という語　軸社共
      { n: 548, id: 'a5_sakyo_owaru', name: '革新という語', acts: [5], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 選挙協力の実務　軸未定/社公民・1990年〜
      { n: 549, id: 'a5_senkyo_kyoryoku', name: '選挙協力の実務', acts: [5], need: { rel: 0.14 }, year: 1990,
        when: function (Q) { return Q.year >= 1990 &&
                 Q.c_rel >= window.JSP.needOf(Q, 0.14) &&
                 [0, 2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 最後の総選挙の前に
      { n: 550, id: 'a5_saigo_no_toki', name: '最後の総選挙の前に', acts: [5], need: { diet: 0.35 },
        when: function (Q) { return Q.phase >= 3 &&
                 Q.c_diet >= window.JSP.needOf(Q, 0.35) &&
                 Q.minsha_exists; } },
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
                 Q.minsha_exists; } },
      // 労働学校の量産　帯左
      { n: 608, id: 'b1_a3_rodo_gakko', name: '労働学校の量産', acts: [3], need: { org: 0.2 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共闘の実務　軸社共
      { n: 621, id: 'c1_a1_kyodo_jitsumu', name: '共闘の実務', acts: [1], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 共闘の縮小　軸社共
      { n: 622, id: 'c1_a4_kyodo_shukusho', name: '共闘の縮小', acts: [4], need: { rel: 0.2 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.2) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 中道という場所　軸社公民
      { n: 631, id: 'c2_a1_chudo_tanjo', name: '中道という場所', acts: [1], need: { rel: 0.25 },
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
      // 春闘という発明
      { n: 1006, id: 'a1_shunto', name: '春闘という発明', acts: [1], need: { labor: 0.2 },
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
                 [0, 1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
                 window.JSP.LEADERS.here(Q, 'eda'); } },
      // 原水禁の分裂　1963年〜
      { n: 2005, id: 'a2_gensuikin_split', name: '原水禁の分裂', acts: [2], need: { rally: 0.25 }, year: 1963,
        when: function (Q) { return Q.year >= 1963 &&
                 Q.c_rally >= window.JSP.needOf(Q, 0.25); } },
      // 「道」第一次草案　帯左/中間左・1964年〜
      { n: 2012, id: 'a2_michi_1', name: '「道」第一次草案', acts: [2], need: { koryo: 0.3 }, year: 1964,
        when: function (Q) { return Q.year >= 1964 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
      // 革新自治体の増殖
      { n: 2018, id: 'a2_kaku_jichitai', name: '革新自治体の増殖', acts: [2], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 Q.local_n >= 2; } },
      // 党本部の帳簿
      { n: 2025, id: 'a2_shakyo_jimu', name: '党本部の帳簿', acts: [2], need: { fund: 0.25 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.25); } },
      // 国鉄の組合
      { n: 2026, id: 'a2_kokutetsu', name: '国鉄の組合', acts: [2], need: { labor: 0.35 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.35); } },
      // 保革伯仲の予感
      { n: 2028, id: 'a2_hokakuhaku', name: '保革伯仲の予感', acts: [2], need: { hr: 0.4 },
        when: function (Q) { return Q.c_hr >= window.JSP.needOf(Q, 0.4) &&
                 Q.minsha_exists && Q.seats_hr >= 130; } },
      // 「道」第二次草案　帯左・1966年〜
      { n: 2029, id: 'a2_michi_2', name: '「道」第二次草案', acts: [2], need: { koryo: 0.4 }, year: 1966,
        when: function (Q) { return Q.year >= 1966 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.4) &&
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 構造改革派の残り火　帯中間左/中間右
      { n: 2030, id: 'a2_kozo_zanto', name: '構造改革派の残り火', acts: [2], need: { koryo: 0.35 },
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
        when: function (Q) { return Q.c_mem >= window.JSP.needOf(Q, 0.25); } },
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
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.25); } },
      // 春闘相場
      { n: 2046, id: 'a2_shunto_soba', name: '春闘相場', acts: [2], need: { labor: 0.4 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.4); } },
      // 地方議員団
      { n: 2047, id: 'a2_chihou_giin', name: '地方議員団', acts: [2], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.local_n >= 1; } },
      // 参議院という別の場所
      { n: 2048, id: 'a2_sanin', name: '参議院という別の場所', acts: [2], need: { hc: 0.25 },
        when: function (Q) { return Q.c_hc >= window.JSP.needOf(Q, 0.25); } },
      // 国対政治
      { n: 2050, id: 'a2_kokutai', name: '国対政治', acts: [2], need: { diet: 0.4 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.4); } },
      // 自治体の赤字
      { n: 3014, id: 'a3_jichitai_akaji', name: '自治体の赤字', acts: [3], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 Q.local_n >= 1 && Q.local_debt >= 6; } },
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
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 社共の最後の枠　軸社共
      { n: 4018, id: 'a4_sakyo_saigo', name: '社共の最後の枠', acts: [4], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 協会の後退　帯中間右/右
      { n: 4019, id: 'a4_kyokai_taisei', name: '協会の後退', acts: [4], need: { org: 0.35 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.35) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.kyokai_grip <= 55; } },
      // 新宣言　1986年〜
      { n: 5002, id: 'a5_shin_sengen', name: '新宣言', acts: [5], need: { koryo: 0.2 }, year: 1986,
        when: function (Q) { return Q.year >= 1986 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 Q.kyokai_grip >= 35; } },
      // 日本新党　1992年〜
      { n: 5015, id: 'a5_nihon_shinto', name: '日本新党', acts: [5], need: { hr: 0.4 }, year: 1992,
        when: function (Q) { return Q.year >= 1992 &&
                 Q.c_hr >= window.JSP.needOf(Q, 0.4) &&
                 Q.komei_exists; } },
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
      // 市民運動との回路　帯中間左
      { n: 3111, id: 'a3_b2_shimin_undo', name: '市民運動との回路', acts: [3], need: { org: 0.25 },
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
                 Q.minsha_exists; } },
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
      { n: 3142, id: 'a3_c1_kyosan_nobiru', name: '共産党の伸長', acts: [3], need: { hr: 0.25 },
        when: function (Q) { return Q.c_hr >= window.JSP.needOf(Q, 0.25) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
                 Q.minsha_exists; } },
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
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
      // 環境という新しい軸　帯中間左
      { n: 4112, id: 'a4_b2_kankyo', name: '環境という新しい軸', acts: [4], need: { org: 0.25 },
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
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 三党の実務者会議　軸社公民
      { n: 4151, id: 'a4_c2_santo_jimu', name: '三党の実務者会議', acts: [4], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 首班の扱い　軸社公民
      { n: 4152, id: 'a4_c2_shuhan', name: '首班の扱い', acts: [4], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
      { n: 4172, id: 'a4_sanin_giin', name: '参院の存在感', acts: [4], need: { hc: 0.3 },
        when: function (Q) { return Q.c_hc >= window.JSP.needOf(Q, 0.3); } },
      // 老いていく国
      { n: 4173, id: 'a4_kaigo', name: '老いていく国', acts: [4], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3); } },
      // 少数与党の国会
      { n: 4174, id: 'a4_shosuha_kyoryoku', name: '少数与党の国会', acts: [4], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 Q.seats_hr >= 105; } },
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
                 [1].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 革新票の行方　軸社共
      { n: 5142, id: 'a5_c1_kaku_hyo', name: '革新票の行方', acts: [5], need: { hr: 0.3 },
        when: function (Q) { return Q.c_hr >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 非自民の枠　軸社公民
      { n: 5151, id: 'a5_c2_hijimin', name: '非自民の枠', acts: [5], need: { rel: 0.3 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.3) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 閣僚の割り振り　軸社公民
      { n: 5152, id: 'a5_c2_kakuryo_wari', name: '閣僚の割り振り', acts: [5], need: { rel: 0.35 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 新党さきがけ　1993年〜
      { n: 5171, id: 'a5_sakigake', name: '新党さきがけ', acts: [5], need: { hr: 0.35 }, year: 1993,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.c_hr >= window.JSP.needOf(Q, 0.35) &&
                 Q.cab_kind > 0; } },
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
                 [2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 生産性運動をどう見るか　帯中間右
      { n: 2121, id: 'a2_b3_seisansei', name: '生産性運動をどう見るか', acts: [2], need: { labor: 0.25 },
        when: function (Q) { return Q.c_labor >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 社会保障の設計　帯中間右
      { n: 2122, id: 'a2_b3_shakai_hoshou', name: '社会保障の設計', acts: [2], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 民社党との対話　帯右
      { n: 2131, id: 'a2_b4_minsha_taiwa', name: '民社党との対話', acts: [2], need: { rel: 0.25 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 Q.minsha_exists; } },
      // 現代資本主義論　帯右
      { n: 2132, id: 'a2_b4_gendai_shihon', name: '現代資本主義論', acts: [2], need: { koryo: 0.25 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.25) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 共闘会議　軸社共
      { n: 2141, id: 'a2_c1_kyodo_kaigi', name: '共闘会議', acts: [2], need: { rel: 0.2 },
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
                 Q.cab_kind > 0; } },
      // 地方の県本部
      { n: 2171, id: 'a2_chihou_seken', name: '地方の県本部', acts: [2], need: { org: 0.3 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.3) &&
                 Q.kyokai_grip >= 35; } },
      // テレビが来る
      { n: 2172, id: 'a2_terebi', name: 'テレビが来る', acts: [2], need: { name: 0.25 },
        when: function (Q) { return Q.c_name >= window.JSP.needOf(Q, 0.25) &&
                 Q.kyokai_grip >= 35; } },
      // 国対の金
      { n: 2173, id: 'a2_kokutai_ura', name: '国対の金', acts: [2], need: { fund: 0.3 },
        when: function (Q) { return Q.c_fund >= window.JSP.needOf(Q, 0.3); } },
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
                 Q.kyokai_grip >= 35; } },
      // 最後の党大会　1993年〜
      { n: 5215, id: 'a5_saigo_no_taikai', name: '最後の党大会', acts: [5], need: { koryo: 0.4 }, year: 1993,
        when: function (Q) { return Q.year >= 1993 &&
                 Q.c_koryo >= window.JSP.needOf(Q, 0.4) &&
                 Q.cab_kind > 0; } },
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
      // 原発の立地に反対する　帯左/中間左
      { n: 6007, id: 'a3_b1_genpatsu_hantai', name: '原発の立地に反対する', acts: [3], need: { org: 0.3 },
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
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 平和教育　帯左/中間左
      { n: 6011, id: 'a4_b1_heiwa_kyoiku', name: '平和教育', acts: [4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 政権の予行演習　帯中間右/右
      { n: 6012, id: 'a4_b4_seiken_kunren', name: '政権の予行演習', acts: [4], need: { koryo: 0.35 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.35) &&
                 [3, 4].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 革新という言葉　軸社共
      { n: 6013, id: 'a4_c1_kakushin_saigo', name: '革新という言葉', acts: [4], need: { koryo: 0.3 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.3) &&
                 [1].indexOf(window.JSP.blocOf(Q)) >= 0; } },
      // 連立の名簿　軸社公民
      { n: 6014, id: 'a4_c2_seiken_meibo', name: '連立の名簿', acts: [4], need: { rel: 0.35 },
        when: function (Q) { return Q.c_rel >= window.JSP.needOf(Q, 0.35) &&
                 [2].indexOf(window.JSP.blocOf(Q)) >= 0; } },
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
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
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
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 江田三郎の離党　帯左/中間左・1977年〜・edaが在席
      { n: 7318, id: 'eda_ridatsu_sa', name: '江田三郎の離党', acts: [3], need: { split: 0.3 }, year: 1977,
        when: function (Q) { return Q.year >= 1977 &&
                 Q.c_split >= window.JSP.needOf(Q, 0.3) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 window.JSP.LEADERS.here(Q, 'eda'); } },
      // 土井委員長の登場　帯左/中間左
      { n: 7601, id: 'doi_shunin_sa', name: '土井委員長の登場', acts: [5], need: { org: 0.14 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.14) &&
                 [1, 2].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 党大会の主導権　帯中間右
      { n: 8021, id: 'c3_taikai_shudo', name: '党大会の主導権', acts: [2, 3, 4], need: { org: 0.25 },
        when: function (Q) { return Q.c_org >= window.JSP.needOf(Q, 0.25) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 連立の座席　帯中間右
      { n: 8022, id: 'c3_rengo_seiken', name: '連立の座席', acts: [4, 5], need: { diet: 0.3 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.3) &&
                 [3].indexOf(window.JSP.bandOf(Q)) >= 0; } },
      // 民主社会主義の党　帯右
      { n: 4806, id: 'a4_minsha_ka', name: '民主社会主義の党', acts: [3, 4, 5], need: { koryo: 0.2 },
        when: function (Q) { return Q.c_koryo >= window.JSP.needOf(Q, 0.2) &&
                 [4].indexOf(window.JSP.bandOf(Q)) >= 0 &&
                 (Q.year || 0) >= 1970 && Q.kyosan_haijo && !Q.minsha_ka && !Q.kyosan_merged && !Q.minshu_shinto && (!Q.minsha_exists || Q.minsha_merged || (Q.rel_minsha || 0) >= 30); } },
      // 与党の社会党
      { n: 4808, id: 'c4_jisha_yoto', name: '与党の社会党', acts: [4, 5], need: { diet: 0.2 },
        when: function (Q) { return Q.c_diet >= window.JSP.needOf(Q, 0.2) &&
                 Q.in_power && Q.cab_kind === 4; } },
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
      { n: 9102, id: 'sp_yokohama1963', name: '横浜市長選', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1963, 4); } },
      { n: 9103, id: 'sp_year1964', name: '一九六四年', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1964, 11); } },
      { n: 9104, id: 'sp_michi1966', name: '日本における社会主義への道', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1966, 1); } },
      { n: 9105, id: 'sp_tokyo1967', name: '東京都知事選', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1967, 4); } },
      { n: 9111, id: 'sp_rengo_sekigun1972', name: 'あさま山荘', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1972, 2); } },
      { n: 9112, id: 'sp_oil1973', name: '石油危機', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1973, 10); } },
      { n: 9113, id: 'sp_nanin1974', name: '七人委員会', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1974, 2); } },
      { n: 9114, id: 'sp_zaisei1975', name: '革新自治体の財政危機', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1975, 4); } },
      { n: 9115, id: 'sp_eda1977', name: '江田三郎', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1977, 2); } },
      { n: 9121, id: 'sp_jichitai1979', name: '革新自治体の崩壊', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1979, 4); } },
      { n: 9122, id: 'sp_shako1980', name: '社公合意', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1980, 1); } },
      { n: 9123, id: 'sp_hibuso1984', name: '非武装中立', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1984, 1); } },
      { n: 9131, id: 'sp_shin_sengen1986', name: '新宣言', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1986, 1); } },
      { n: 9132, id: 'sp_kokutetsu1987', name: '国鉄分割民営化', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1987, 4); } },
      //  消費税とマドンナは七月の参院選の結果を語る。参院選のあとに出す。
      { n: 9133, id: 'sp_madonna1989', name: '消費税とマドンナ', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1989, 7) && !!Q.evdone_hc1989; } },
      //  連合の結成は十一月。参院選とマドンナのあと。
      { n: 9134, id: 'sp_rengo1989', name: '連合結成', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1989, 11) && !!Q.evdone_sp_madonna1989; } },
      { n: 9135, id: 'sp_gulf1991', name: '湾岸戦争', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1991, 1); } },
      { n: 9136, id: 'sp_pko1992', name: 'PKO協力法', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1992, 6); } },

      //  参院選。三年ごとの半数改選。手を消費しない割り込みとして出す。
      //  中身は一つの頁（hc.election）を年ごとに使い回す。
      { n: 7001, id: 'hc1962', name: '参院選', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1962, 7); } },
      { n: 7002, id: 'hc1965', name: '参院選', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1965, 7); } },
      { n: 7003, id: 'hc1968', name: '参院選', acts: [2], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1968, 7); } },
      { n: 7004, id: 'hc1971', name: '参院選', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1971, 6); } },
      { n: 7005, id: 'hc1974', name: '参院選', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1974, 7); } },
      { n: 7006, id: 'hc1977', name: '参院選', acts: [3], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1977, 7); } },
      { n: 7007, id: 'hc1980', name: '参院選', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1980, 6); } },
      { n: 7008, id: 'hc1983', name: '参院選', acts: [4], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1983, 6); } },
      { n: 7009, id: 'hc1986', name: '参院選', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1986, 7); } },
      { n: 7010, id: 'hc1989', name: '参院選', acts: [5], fixed: true,
        when: function (Q) { return Q.ym >= window.JSP.ymOf(1989, 7); } },
      { n: 7011, id: 'hc1992', name: '参院選', acts: [5], fixed: true,
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
      Q.pending_event = 0;
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
      var i, f, worst = 0, fs = ['uha', 'chuu', 'chusa', 'saha'];
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
      'koku_kouyou', 'shunto_peak', 'shunto_jisei'
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
                   'action_timer', 'jinji_timer', 'turns_left', 'phase'];
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
    nomCeiling: function (Q, share) {
      var k = Q.kouho || this.NOM_OPEN;
      var tot = Q.hr_total || 511;
      var dens = k / tot;
      var ratio = dens > 0 ? share / dens : 0;
      var win = this.nomWinRate(ratio);
      return { kouho: k, ratio: Math.round(ratio * 10) / 10,
               win: win, cap: Math.round(k * win) };
    },

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
        + 'aria-label="历次总选举的获得议席与史实对比">'];
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
      shinjiyu: { parent: 'jimin', name: '新自由クラブ', born: 1976, back: 1986 },
      //  一九九二、細川護熙。史実は一九九三年に 35 議席。
      //  母党は自民にする。史実の三十五議席は都市の無党派と
      //  自民から来ていて、「その他」の四十議席からはその大きさが出ない
      //  （実測で中央値 9 議席にしかならなかった）。
      nihonshin: { parent: 'jimin', name: '日本新党', born: 1992 },
      //  一九九三、羽田・小沢。史実 55 議席。
      shinsei: { parent: 'jimin', name: '新生党', born: 1993 },
      //  一九九三、武村正義。史実 13 議席。
      sakigake: { parent: 'jimin', name: '新党さきがけ', born: 1993 }
    },
    //  切り出す順。一九九三年の自民の分裂を先に正確に取り、
    //  日本新党はその残りから取る。逆にすると ldp_split と
    //  実際に切り出した議席がずれる（新生党が 49 まで痩せた）。
    SPLINTER_KEYS: ['shinjiyu', 'shinsei', 'sakigake', 'nihonshin'],

    splinterOn: function (Q, k) { return (Q['sp_' + k] || 0) > 0; },

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
        if (year < s.born) { continue; }
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
        if (year < s.born) { frac = 0; }
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

    //  一九九三年の分裂を実行する。新生党と さきがけ に配る（史実の比 55:13）。
    splitLDP1993: function (Q) {
      var total = this.ldpSplitSize(Q);
      Q.ldp_split = total;
      var jimin = Q.res_jimin || 1;
      var frac = Math.max(0, Math.min(0.9, total / jimin));
      //  羽田・小沢が大きく、武村が小さい
      Q.sp_shinsei = frac * 0.81;
      Q.sp_sakigake = frac * 0.19;
      Q.ldp_split_done = 1;
      return total;
    },

    //  参院の各党の議席。衛院の得票率から作る。
    //  社会党だけは全国区と名士票の分を乗せる（seats_hc と揃える）。
    HC_TOTAL: 252,

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
    //  改選数。七一年に定数が二五〇→二五二になる
    hcSeatsUp: function (year) {
      var n = (year >= 1971) ? 126 : 125;
      return { chihou: n - 50, zenkoku: 50, total: n };
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
      var up = this.hcSeatsUp(year);
      var sh = this.tally(Q).shakai / 100;
      var org = this.hcOrgVote(Q);
      //  比例代表は八三年から。名簿の順で決まるので、党の名前が効く
      var meibo = (year >= 1983) ? 1 : 0;
      //  地方区。一人区では小さい党が落ちるので、得票率より低く出る
      var chihou = Math.round(up.chihou * sh * 0.92 * (1 + (Q.hc_chihou_push || 0)));
      //  全国区。労組の推薦名簿のぶん、得票率より高く出る
      var zenkoku = Math.round(up.zenkoku * sh * (1 + 0.9 * org) * (1 + (Q.hc_zenkoku_push || 0)));
      chihou = clamp(chihou, 0, up.chihou);
      zenkoku = clamp(zenkoku, 0, up.zenkoku);
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
      Q.hc_diff = Q.seats_hc - Q.hc_prev;
      Q.hc_year = year;
      Q.hist_hc = this.HIST_HC[year] || 0;
      Q.hc_chihou_push = 0; Q.hc_zenkoku_push = 0;
      //  参院の内訳を引き直す
      this.hcBreakdown(Q, this.allocate(Q).share);
      //  参院の過半（一二七）を野党で越えているか
      Q.hc_majority_line = Math.floor(this.HC_TOTAL / 2) + 1;
      this.tallyCounter(Q, 'hc');
      this.tallyCounter(Q, 'name');
      this.refresh(Q);
      return Q;
    },

    hcBreakdown: function (Q, share) {
      var P = ['jimin', 'shakai', 'minsha', 'komei', 'kyosan', 'other'];
      var w = {}, i, k, sum = 0;
      for (i = 0; i < P.length; i += 1) {
        k = P[i];
        w[k] = Math.max(0, (share[k] || 0)) * (k === 'shakai' ? 1.25 : 1);
        sum += w[k];
      }
      if (sum <= 0) { return Q; }
      //  社会党は seats_hc を正とし、残りを他の党で割る。
      var mine = Math.max(0, Math.min(this.HC_TOTAL, Q.seats_hc || 0));
      var rest = this.HC_TOTAL - mine, rw = sum - w.shakai, got = 0;
      for (i = 0; i < P.length; i += 1) {
        k = P[i];
        if (k === 'shakai') { Q.hc_shakai = mine; continue; }
        Q['hc_' + k] = (rw > 0) ? Math.round(rest * w[k] / rw) : 0;
        got += Q['hc_' + k];
      }
      //  丸めの差は「その他」で吸う
      Q.hc_other = Math.max(0, (Q.hc_other || 0) + (rest - got));
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
      //  参院は三年ごとの半数改選なので、衆院の得票率に半歩遅れて追随する。
      //  全国区と地方の名士票のぶん、党の全国得票率より高めに出る（係数1.25）。
      //    史実の当てはめ： 1959 27.6% → 87（実績85）
      //                    1986 17.2% → 54（実績42）
      //  これを入れる前は seats_hc が開幕の85から一方向にしか動かず、
      //  勝利点の四要素のうち参院だけが盤面と無関係に効いていた。
      //  参院は参院選（runHCElection）が持つ。ここでは触らない。
      //  以前はここで share から一本の式で作っていたので、
      //  参院が盤面の一部ではなく衆院の影になっていた。
      //  参院の内訳。以前は社会党の数しか無かったので、議席図が描けない。
      //  衛院と同じ得票率から作る（社会党だけ名士票の係数 1.25 が乗る）。
      //  定数 252 に合うよう規格化し、余りは「その他」へ入れる。
      this.hcBreakdown(Q, r.share);
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
      this.cabinetCheck(Q);
      //  選挙が済むと擁立数は目減りする（落ちた候補は次に立たない）。
      //  党員と自治体で決まる床までは、放っておいても戻る。
      var fl = this.nomFloor(Q);
      Q.kouho = (Q.kouho || this.NOM_OPEN) > fl
        ? Math.max(fl, Math.round((Q.kouho || this.NOM_OPEN) * 0.94))
        : Math.min(fl, (Q.kouho || this.NOM_OPEN) + 6);
      Q.nomination = 0;
      Q.next_election_idx = (Q.next_election_idx || 0) + 1;
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
                  label: '社会党単独推薦' },
      sakyo:    { off: 0.00, kyosan: 0.62, komei: -0.22, minsha: -0.40, self: 0.10,
                  budget: 6, capital: 5, bonus: 1.00, mult: 1.10, dir: 'saha',
                  label: '社共推薦' },
      shakomin: { off: 0.00, kyosan: -0.48, komei: 0.46, minsha: 0.48, self: 0.10,
                  budget: 6, capital: 5, bonus: 1.00, mult: 1.10, dir: 'chuu',
                  label: '社公民推薦' },
      hounin:   { off: -0.06, kyosan: 0.22, komei: 0.18, minsha: 0.16, self: -0.10,
                  budget: 0, capital: 0, bonus: 0.30, mult: 0.45, dir: '',
                  label: '放任（推薦を出さない）' }
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
      Q.defend_kept_names = kept.join('・') || 'なし';
      Q.defend_lost_names = lost.join('・') || 'なし';
      this.localMult(Q); this.localDir(Q);
      this.refresh(Q);
      return Q;
    },


    // ══════════════════════════════════════════════════════════
    //  勝利点と四象限
    //  三つの目標（組閣・体制改革・党の統一）のどれかを達成したかと、
    //  勝利点が史実の水準を超えたかで四つに分ける。
    //  史実は「組閣は達成、点は低い」＝ 勝利の失敗 に落ちる。
    // ══════════════════════════════════════════════════════════
    SCORE_W: { hr: 100, hc: 40, members: 30, split: -25, cabinet: 8 },

    //  史実の終値（1993年）。衆院70/511、参院約70、党員約5万、
    //  分裂2（民社党・社民連）、細川内閣での閣僚6。
    HIST_FINAL: { hr: 70, hr_total: 511, hc: 70, members: 50000, splits: 2, cabinet: 6, route: -1 },

    //  各幕の終わりにおける史実の値。プレイヤーが途中で降りたときは、
    //  一九九三年ではなく「そこまでの史実」と比べる。
    //    Ⅰ 1960総選挙 145/467・参院85     Ⅱ 1969総選挙 90/486・参院65
    //    Ⅲ 1976総選挙 123/511・参院56     Ⅳ 1983総選挙 112/511・参院44
    //    Ⅴ 1993総選挙  70/511・参院71・細川内閣で閣僚6
    //  route は、その幕で史実の党が実際に立っていた線。
    //  比較は同じ線の物差しでやらないと意味が無い ──
    //  中間右の線は易しく点も低いので、史実を中間右で測ると
    //  「史実が勝つ」ことになってしまう。
    HIST_ACT: {
      1: { hr: 145, hr_total: 467, hc: 85, members: 50000, splits: 1, cabinet: 0, route: -2 },
      2: { hr: 90,  hr_total: 486, hc: 65, members: 50000, splits: 1, cabinet: 0, route: -1 },
      3: { hr: 123, hr_total: 511, hc: 56, members: 50000, splits: 1, cabinet: 0, route: -1 },
      4: { hr: 112, hr_total: 511, hc: 44, members: 50000, splits: 2, cabinet: 0, route: -1 },
      5: { hr: 70,  hr_total: 511, hc: 71, members: 50000, splits: 2, cabinet: 6, route: -1 }
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
        name: '首班', desc: '由社会党推出了内阁总理大臣。',
        when: function (Q) { return !!Q.has_souri; } },
      { id: 'nishio_nokotta', art: 'motif/minsha60.jpg',
        name: '西尾留下了', desc: '民主社会党没有成立。',
        when: function (Q) { return (Q.act || 1) >= 2 && !Q.minsha_exists; } },
      { id: 'eda_nokotta', art: 'motif/ryouha50.png',
        name: '江田留下了', desc: '社会民主连合没有成立。',
        when: function (Q) { return (Q.act || 1) >= 4 && !Q.shamin_exists; } },
      { id: 'mada_warete_inai', art: 'motif/touitsu55.jpg',
        name: '没有分裂', desc: '一次也没有分裂。',
        when: function (Q) { return (Q.splits || 0) === 0 && (Q.act || 1) >= 2; } },
      { id: 'hibuso_kanto', art: 'motif/kenpou.jpg',
        name: '非武装中立', desc: '直到收局也没有降下非武装中立。',
        end: true, when: function (Q) { return !!Q.hibuso_churitsu; } },
      { id: 'kokumin_seito', art: 'motif/shotengai.jpg',
        name: '国民政党', desc: '社会党是国民政党。',
        end: true, when: function (Q) { return window.JSP.bandOf(Q) === 4; } },
      { id: 'shinsayoku_orgu', art: 'events/kaihoha.jpg',
        name: '组织员', desc: '把街头的活动家接进县联，接满了名额。',
        when: function (Q) { return (Q.nl_intake || 0) >= window.JSP.NL_INTAKE_MAX; } },
      { id: 'asama_no_ato', art: 'motif/yokkaichi.jpg',
        name: '山庄之后', desc: '跟新左翼合过手，浅间山庄之后仍旧没有丢掉城里的受雇者。',
        when: function (Q) { return !!Q.nl_fallout_done && (Q.nl_hit || 0) >= 60 &&
                 (Q.lean_shinchukan_shakai || 0) >= 30; } },
      { id: 'kozo_kaikaku_sen', art: 'motif/danchi.jpg',
        name: '構造改革', desc: '把江田三郎的路线变成了党的路线。',
        when: function (Q) { return !!Q.kozo_kaikaku; } },
      { id: 'michi_saitaku', art: 'motif/ronoto28.jpg',
        name: '走向社会主义的道路', desc: '通过了《日本走向社会主义的道路》。',
        when: function (Q) { return !!Q.michi_adopted; } },
      { id: 'sutoken', art: 'motif/miyahara.jpg',
        name: '罢工权', desc: '在罢工权罢工中获胜。',
        when: function (Q) { return !!Q.sutoken_won; } },
      { id: 'sayoku_toitsu', art: 'motif/sohyo_taikai.png',
        name: '左翼统一', desc: '劳动战线在左侧完成了统一。',
        when: function (Q) { return !!Q.left_unity; } },
      { id: 'zenrokyo_dachi', art: 'motif/gekkan_sohyo.png',
        name: '全劳协', desc: '在连合之外另建了一个全国中央组织。',
        when: function (Q) { return !!Q.zenrokyo; } },
      { id: 'kosen', art: 'motif/ryouha50.png',
        name: '党首公选', desc: '促成共产党实行党首公选，让宫本显治退了下去。',
        when: function (Q) { return !!Q.kyosan_kaikaku; } },
      { id: 'shakyo_gassho', art: 'motif/touitsu55.jpg',
        name: '社共合同', desc: '和共产党合成了一个党。',
        when: function (Q) { return !!Q.kyosan_merged; } },
      //  実績の id は盤面の旗（minshu_shinto）と別の名にする。同じ名だと
      //  エンジンの achieve が旗を上書きして、結末の分岐が外れた（実測）。
      { id: 'hijimin_shinto', art: 'motif/akushu55.jpg',
        name: '非自民的新党', desc: '把在野党结集成了一个党。',
        when: function (Q) { return !!Q.minshu_shinto; } },
      { id: 'jisha_naikaku', art: 'motif/sokaku.jpg',
        name: '自社内阁', desc: '和自民党组了联合。',
        when: function (Q) { return !!Q.jisha_cabinet; } },
      { id: 'kokumin_minshu_to', art: 'motif/minsha60.jpg',
        name: '国民民主党', desc: '成了一个由连合的民间劳组撑着的保守中道政党。',
        when: function (Q) { return !!Q.kokumin_minshu; } },
      { id: 'kakushin_jichitai', art: 'motif/minobe67.png',
        name: '革新自治体', desc: '在四个以上的自治体取得首长。',
        when: function (Q) {
          var n = (Q.local_kyoto || 0) + (Q.local_tokyo || 0) + (Q.local_yokohama || 0) +
                  (Q.local_osaka || 0) + (Q.local_hiroshima || 0) + (Q.local_nagasaki || 0) +
                  (Q.local_aichi || 0) + (Q.local_hokkaido || 0);
          return n >= 4;
        } },
      { id: 'yama_ga_ugoita', art: 'motif/sangiin.jpg',
        name: '山动了', desc: '在参议院的改选议席上压过了自民党。',
        when: function (Q) { return !!Q.madonna; } },
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
        name: '一九九三年', desc: '把三十四年打到了最后。',
        end: true, when: function (Q) { return !!Q.ran_full; } },
      { id: 'shori_no_shori', art: 'motif/akushu55.jpg',
        name: '胜利的胜利', desc: '达成了目标，也超过了史实的数字。' },
      { id: 'shori_no_shippai', art: 'motif/saitouitsu55.jpg',
        name: '胜利的失败', desc: '达成了目标，数字却与史实几乎无异。' },
      { id: 'shippai_no_shori', art: 'motif/mayday49.png',
        name: '失败的胜利', desc: '没有达成目标，但超过了史实的数字。' },
      { id: 'shippai_no_shippai', art: 'motif/hahaoya55.png',
        name: '失败的失败', desc: '输了，只留下了曾经反对的记录。' },
      { id: 'zenkyoku_shori', art: 'motif/saitouitsu_taikai.png',
        name: '全局胜利', desc: '在贯穿三十四年的判定中获胜。',
        end: true, when: function (Q) { return !!Q.global_win; } },
      { id: 'seiken_wo_tamotta', art: 'motif/sokaku.jpg',
        name: '保住了政权', desc: '没有让一九九三年的政权垮掉。',
        end: true, when: function (Q) { return (Q.gv_kind || 0) === 3; } }
    ],

    //  毎手見て、条件が真になったものを渡す。
    //  E は場面のコードの中の this（DendryEngine）。無くても盤は止めない。
    checkAchievements: function (E, Q, atEnd) {
      var i, a, ok, n = 0;
      for (i = 0; i < this.ACH.length; i++) {
        a = this.ACH[i];
        if (!a.when) { continue; }
        if (a.end && !atEnd) { continue; }
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
    award: function (name) {
      try {
        var e = window.dendryUI && window.dendryUI.dendryEngine;
        if (e && e.achieve) { e.achieve(name); }
      } catch (err) { return 0; }
      return 1;
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

    //  線ごとに二つの数が違う。難度と、天井である。
    //
    //  BAND_BAR   超えるべき線の高さ。中間右は組合を切って
    //             都市の票と社公民の枠で連立に入る ── 一番早く着くので線も低い。
    //  BAND_MULT  得点の倍率。同じ議席・同じ閣僚でも、
    //             何を土台にして取ったかで、残るものが違う。
    //             都市の票は組織ではない。次の選挙まで持っている保証が無い。
    //
    //  結果として中間右は「達成しやすく、点は一番低い」線になる。
    //  左と右はどちらも基盤を作り直す線なので、遠く、そのぶん高い。
    BAND_BAR:  { 1: 1.22, 2: 1.00, 3: 0.70, 4: 1.16 },
    BAND_MULT: { 1: 1.15, 2: 1.00, 3: 0.82, 4: 1.10 },

    //  史実の党が自分の線の物差しで取っていたであろう基盤 ── その線の上限の三分の一。
    //  比較の基準にこれを足さないと、基盤の分だけ全員が得をする。
    //  帯によって上限が違うので、この値も帯によって違う。
    HIST_BASE_FRAC: 0.33,
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
    CAB_FULL: 6, CAB_TAIL: 0.30,
    cabCount: function (n) {
      n = n || 0;
      return n <= this.CAB_FULL ? n : this.CAB_FULL + (n - this.CAB_FULL) * this.CAB_TAIL;
    },

    // ══════════════════════════════════════════════════════════
    //  勝利条件
    //
    //  幕の勝利  幕の終わりに最低条件を満たしていれば、その幕は勝ち。
    //            そこで記録を残して降りることも、次の幕へ進むこともできる。
    //  全局勝利  ① 組閣したあと、次の総選挙でも政権を保った ── その場で決まる。
    //            ② 一九九三年まで行って、一度でも組閣したか、
    //               政権は取れなかったが組織が残っているか。
    // ══════════════════════════════════════════════════════════

    //  ── 幕の最低勝利条件 ──────────────────────────────────
    //  三つのうちどれかでよい。線によって届く道が違うからである。
    //   ① 及第線に届く（線ごとの難度で割った線）
    //   ② その幕のあいだに政権に入った
    //   ③ 議席は届かなくても、その線の基盤を六割作れていて、
    //      かつその幕で新しく割れていない
    ACT_BASE_NEED: 60,
    actVictory: function (Q) {
      var bar = this.BAND_BAR[this.bandOf(Q)] || 1;
      //  表示にも使うので残す。finalScore を呼ばない幕の結算でも要る。
      Q.band_bar = bar;
      Q.band_mult = this.BAND_MULT[this.bandOf(Q)] || 1;
      var line = Math.round((Q.pass_line || 0) * bar);
      Q.act_line = line;
      this.baseScore(Q);
      var bySeats = (Q.seats_hr || 0) >= line;
      var noSplit = (Q.splits || 0) <= (Q.splits_act_start || 0);
      var byBase = (Q.base_frac || 0) >= this.ACT_BASE_NEED && noSplit;
      var byPower = !!Q.in_power || !!Q.act_power;
      Q.av_seats = bySeats ? 1 : 0;
      Q.av_base = byBase ? 1 : 0;
      Q.av_power = byPower ? 1 : 0;
      Q.av_nosplit = noSplit ? 1 : 0;
      Q.act_pass = (bySeats || byBase || byPower) ? 1 : 0;
      return Q.act_pass;
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

    globalVictory: function (Q) {
      this.finalScore(Q);
      //  選挙をまたいで政権を保った＝組閣を二回続けた
      var held = (Q.power_elections || 0) >= 1;
      var everCab = !!Q.ever_in_power || (Q.cabinet_posts_ever || 0) > 0;
      var org = this.orgSurvives(Q);
      var above = (Q.final_score || 0) > (Q.final_base || 0);
      Q.gv_held = held ? 1 : 0;
      Q.gv_cabinet = everCab ? 1 : 0;
      Q.gv_org = org ? 1 : 0;
      //  民社党化の線。議席と連続組閣の両方が要る。
      var mk = !!Q.minsha_ka;
      Q.gv_minsha_line = mk ? 1 : 0;
      Q.gv_seat_need = this.MINSHA_WIN_SEATS;
      Q.gv_seat_ok = ((Q.seats_hr || 0) >= this.MINSHA_WIN_SEATS) ? 1 : 0;
      //  ① 政権を保った ── これだけで全局勝利
      //  ② 一九九三年まで行って、組閣したことがあるか、組織が残っている
      //  民社党化の線では ① も ② も使えない。上の二つを両方満たすことだけが勝ちになる。
      Q.global_win = (mk ? (held && Q.gv_seat_ok === 1)
        : (held || everCab || (org && above))) ? 1 : 0;
      //  見出しは起きたことを言う。勝ったかどうかは global_win が言う。
      Q.gv_kind = held ? 3 : (everCab ? 2 : (org && above ? 1 : 0));
      this.verdicts(Q);
      return Q.global_win;
    },

    //  ── 四つの面からの評語 ────────────────────────────────
    //  同じ点数でも、どこで取ったかで党の姿は違う。
    //  経済・組織・中央政治・地方政治の四つで別々に見る。
    VERDICT: {
      keizai: [
        '没有自己的财政。裁了专职，把机关报做薄，还是不够。而一个没钱的党，凡是要花钱的决定都会先放弃掉。',
        '每年都是紧巴巴地转过来的。工会分担金变细的速度，跟收党费的速度，终究没能扯平。',
        '总算有了分担金之外的柱子。靠城里的个人后援会和党费，工会就算换了模样，财政也没有塌。',
        '不用为钱发愁就雇得起人，养得起调查部门，对案也写得出数字。这些东西，这个党在史实里一样也没有过。'
      ],
      soshiki: [
        '组织几乎没剩下什么。一个动员不出人的党，举什么旗都只是举一下就完了。',
        '骨架是留住了，只是很细。劳动战线重编时没拿到主导权，党员也没长，年头就这么过去了。',
        '基盘保住了。不论是劳动战线还是党员，手里都有交得给下一代的东西。',
        '组织长厚了。动员得出多少人，就直接是多大的政治可能性。'
      ],
      chuo: [
        '在国会里，始终是个少数党。拦得住法案，可通不过法案。',
        '一直是在野第一党。不多也不少。而政权，靠这双手是做不出来的。',
        '在联合里拿到了座位。出了阁僚，也把一部分政策做了出来。对这个党来说，这是头一回。',
        '拿到了政权，还跨过一场选举把它保住了。这个党被叫作"万年在野党"的历史，到这里断了。'
      ],
      chiho: [
        '自治体一个也没剩下。能真把政策做出来的地方，这个党终究没有过。',
        '自治体少了。七十年代造出来的那些制度，到八十年代的行革里被一一点名，然后一层层削掉。',
        '自治体全守住了。中央拿不到的东西，在地方一直拿得到。',
        '地方的落脚地很厚。就算国政议席掉了的年份，也是首长和地方议员在撑着这个党。'
      ]
    },

    grade: function (v, a, b, c) {
      return v >= c ? 3 : (v >= b ? 2 : (v >= a ? 1 : 0));
    },

    verdicts: function (Q) {
      //  経済 ── 毎手の収入と、抱えている負担
      var income = (Q.dues_now || 0);
      var burden = (Q.local_debt || 0) * 0.04 + (Q.kokutetsu_debt || 0) * 0.5 + (Q.arrears || 0) * 0.3;
      var kz = income * 1.8 - burden + Math.min(3, (Q.budget || 0) * 0.12);
      Q.v_keizai = this.grade(kz, 0.9, 1.9, 3.2);
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
      var ch = (Q.seats_hr || 0) / maj * 60
             + inPower * 20
             + Math.min(12, (Q.cabinet_posts_ever || 0) * 2)
             + ((Q.power_elections || 0) >= 1 ? 25 : 0)
             - (Q.splits || 0) * 4;
      Q.v_chuo = this.grade(ch, 30, 52, 78);
      Q.v_chuo_t = this.VERDICT.chuo[Q.v_chuo];

      //  地方政治 ── 保有数と取り方、抱えた負担
      this.localPending(Q);
      var chh = (Q.local_n || 0) * 14 + (Q.local_eff || 0) * 6 - (Q.local_debt || 0) * 0.25;
      Q.v_chiho = this.grade(chh, 8, 26, 48);
      Q.v_chiho_t = this.VERDICT.chiho[Q.v_chiho];

      Q.v_total = Q.v_keizai + Q.v_soshiki + Q.v_chuo + Q.v_chiho;
      return Q;
    },

    scoreOf: function (v) {
      var w = this.SCORE_W;
      return Math.round((
        w.hr * (v.hr / (v.hr_total / 2)) +
        w.hc * (v.hc / 126) +
        w.members * (v.members / 100000) +
        w.split * v.splits +
        w.cabinet * this.cabCount(v.cabinet)
      ) * 10) / 10;
    },

    finalScore: function (Q) {
      var v = {
        hr: Q.seats_hr, hr_total: Q.hr_total || 511, hc: Q.seats_hc || 0,
        members: Q.members, splits: Q.splits || 0,
        cabinet: Q.cabinet_posts_ever || Q.cabinet_posts || 0
      };
      var mult = this.BAND_MULT[this.bandOf(Q)] || 1.0;
      Q.band_mult = mult;
      var score = Math.round((this.scoreOf(v) + this.baseScore(Q)) * mult * 10) / 10;
      var ref = this.HIST_ACT[Q.act] || this.HIST_FINAL;
      //  基準は史実が立っていた線で測る。プレイヤーの線ではない。
      var refBand = this.bandOf({ route: ref.route === undefined ? -1 : ref.route });
      var raw = this.scoreOf(ref) + this.histBase(refBand);
      Q.hist_hr = ref.hr; Q.hist_hc = ref.hc; Q.hist_splits = ref.splits; Q.hist_cab = ref.cabinet;
      //  史実に「並んだ」だけでは超えたことにしない。5%の余裕を要求する。
      //  これがないと史実そのものが基準ちょうどで通ってしまい、
      //  「勝利の失敗＝史実」という設計の前提が崩れる。
      //  線ごとの高さを掛ける。中間右は低く、左と右は高い。
      var bar = this.BAND_BAR[this.bandOf(Q)] || 1.0;
      Q.band_bar = bar;
      var base = Math.round(raw * this.diff(Q).bar * bar * 10) / 10;

      // 三つの目標。どれかひとつ達成していれば「目標達成」
      var g_cabinet = ((Q.cabinet_posts_ever || Q.cabinet_posts || 0) > 0) || !!Q.ever_in_power;
      var g_reform = !!Q.won_majority_ever;      // 単独過半を一度でも取ったか
      //  党の統一は「割れなかった」だけでは足りない。
      //  終わった時点で、どの派閥も出口の前に立っていないこと。
      //  党に残っている派閥だけで測る（出て行った派閥の不満は数えない）
      var self = this;
      var worst = Math.max.apply(null, ['uha', 'chuu', 'chusa', 'saha']
        .filter(function (f) { return self.inParty(Q, f); })
        .map(function (f) { return Q['mood_' + f] || 0; }).concat([0]));
      var g_unity = ((Q.splits || 0) <= 1) && worst < 70;
      Q.worst_mood = Math.round(worst * 10) / 10;
      var achieved = g_cabinet || g_reform || g_unity;
      var above = score > base;

      Q.final_score = score;
      Q.final_base = base;
      Q.hist_score = Math.round(raw * 10) / 10;
      Q.g_cabinet = g_cabinet ? 1 : 0;
      Q.g_reform = g_reform ? 1 : 0;
      Q.g_unity = g_unity ? 1 : 0;
      Q.goal_met = achieved ? 1 : 0;
      Q.above_base = above ? 1 : 0;
      Q.quadrant = achieved ? (above ? 1 : 2) : (above ? 3 : 4);
      Q.quadrant_name = ['', '胜利的胜利', '胜利的失败', '失败的胜利', '失败的失败'][Q.quadrant];
      // 内訳（表示用）
      var w = this.SCORE_W;
      Q.sc_hr = Math.round(w.hr * (v.hr / (v.hr_total / 2)) * 10) / 10;
      Q.sc_hc = Math.round(w.hc * (v.hc / 126) * 10) / 10;
      Q.sc_mem = Math.round(w.members * (v.members / 100000) * 10) / 10;
      Q.sc_split = Math.round(w.split * v.splits * 10) / 10;
      Q.sc_cab = Math.round(w.cabinet * this.cabCount(v.cabinet) * 10) / 10;
      Q.cab_ever = v.cabinet;
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
    cabinetCheck: function (Q) {
      var maj = Math.floor((Q.hr_total || 511) / 2) + 1;
      Q.cab_majority_line = maj;
      var C = this.CAB;
      //  この選挙の前に政権にいたか。いたまま選挙を越えれば、
      //  それは「保った」ということで、全局勝利の一つ目の道になる。
      var wasIn = !!Q.in_power;
      Q.was_in_power = wasIn ? 1 : 0;
      if (Q.seats_hr >= maj) {
        Q.cab_route = 1; Q.cab_nonldp = Q.seats_hr;
        if (C) { C.enterPower(Q, 1); }
        if (wasIn) { Q.power_elections = (Q.power_elections || 0) + 1; }
        Q.act_power = 1;
        return 1;
      }
      //  自社連立。民社党化した党が自民党と組んでいるとき、自民と我々の
      //  合計が過半なら連立は続く（まだ入っていなければ入る）。数を失えば解ける。
      if (Q.jisha_pact) {
        var js = (Q.seats_hr || 0) + (Q.res_jimin || 0);
        if (js >= maj) {
          Q.cab_route = 4; Q.cab_nonldp = js;
          if (C) { C.enterPower(Q, 4); }
          if (wasIn) { Q.power_elections = (Q.power_elections || 0) + 1; }
          Q.act_power = 1;
          return 4;
        }
        Q.jisha_pact = 0;
        Q.jisha_lost = 1;
        if (C && Q.in_power) { C.leavePower(Q); }
        Q.cab_route = 0; Q.cab_nonldp = this.nonLdpSeats(Q);
        return 0;
      }
      //  分裂した新党を含めて数える（nonLdpSeats に一本化）。
      //  以前は ldp_split を直に足していたので、新党を入れると二重になる。
      var nonLDP = this.nonLdpSeats(Q);
      Q.cab_nonldp = nonLDP;
      if (nonLDP < maj) { Q.cab_route = 0; if (C && Q.in_power) { C.leavePower(Q); } return 0; }
      // 共産は連立に入らない。公明と民社の窓口が開いているかで決まる
      var ok = (Q.rel_komei >= 10) && (Q.rel_minsha >= -10);
      if (!ok) { Q.cab_route = 3; if (C && Q.in_power) { C.leavePower(Q); } return 0; }
      Q.cab_route = 2;
      if (C) { C.enterPower(Q, 2); }
      if (wasIn) { Q.power_elections = (Q.power_elections || 0) + 1; }
      Q.act_power = 1;
      return 2;
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
    push: function (Q, layers, amt) {
      var i, l, cap, cur, gain, next;
      for (i = 0; i < layers.length; i++) {
        l = layers[i];
        cap = Math.min(this.capOf(Q, l), this.baselineLean(Q, l) + this.LEAN_HEADROOM);
        cur = Q['lean_' + l + '_shakai'];
        if (amt >= 0) {
          //  天井の手前25%に入ってから鈐る。これを (cap-cur)/cap にすると
          //  実効係数が 0.11〜0.26 まで落ち、九手打っても議席が五しか
          //  動かなくなる（戦略差が消える）のでこの形を保つ。
          gain = Math.round(amt * Math.min(1, Math.max(0, (cap - cur) / (0.25 * cap))) * 10) / 10;
          next = Math.min(cap, cur + gain);
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
    CONGRESS_W: { saha: -3.5, chusa: -1.0, chuu: 1.0, uha: 2.5 },
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
    factionOf: function (id) {
      var f = this.FIGURES[id];
      return f ? f.faction : null;
    },
    nameOf: function (id) {
      var f = this.FIGURES[id];
      return f ? f.name : '（空缺）';
    },
    postLine: function (Q, post) {
      var id = Q['post_' + post];
      var f = this.FIGURES[id];
      if (!f) { return '（空缺）'; }
      return f.name + ' <span style="opacity:.65;font-size:.9em">' + FNAME[f.faction] + '</span>';
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
      var mm = ['mood_uha', 'mood_chuu', 'mood_chusa', 'mood_saha'], mj;
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
      //  大会の線と、中央との差。脇柱で見せる。
      this.congressRoute(Q);
      Q.del_total = this.delegates(Q).total;
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
      //  難度。見送りの無料枠と、控えを取れるかどうか。
      var D = this.diff(Q);
      Q.diff_name = D.name;
      Q.discard_free = D.discard;
      Q.discard_used = Q.discard_used || 0;
      Q.discard_left = Math.max(0, D.discard - Q.discard_used);
      Q.discard_over = (Q.discard_used > D.discard) ? 1 : 0;
      //  新左翼。窓は一九七二年二月で閉じる。
      Q.nl_near = this.nlNear(Q);
      //  擁立数。いま立てている数だと、この盤面で最大何議席まで届くか。
      if (Q.kouho === undefined || Q.kouho === null) { Q.kouho = this.NOM_OPEN; }
      var nc0 = this.nomCeiling(Q, this.pct(this.tally(Q).shakai));
      Q.nom_kouho = nc0.kouho;
      Q.nom_ratio = nc0.ratio;
      Q.nom_win = Math.round(nc0.win * 100);
      Q.nom_cap = nc0.cap;
      Q.nom_floor = this.nomFloor(Q);
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
          (1 - Math.min(0.45, ang2 / 220)) * this.diff(Q).income * 100) / 100;
      }
      //  分担金と維持費も、払うのは endturn だが見込みはいつでも出す。
      //  そうしないと一手目の脇柱がどちらも 0 になる。
      var mul3 = this.diff(Q).income;
      Q.dues_now = Math.round(((this.unionPower(Q).total * this.DUES_RATE +
        this.memberDues(Q)) * mul3 + (Q.dues_urban || 0)) * 100) / 100;
      Q.upkeep_now = Math.round(((this.memberUpkeep(Q) +
        this.localCount(Q) * this.UPKEEP_PER_CITY) * this.diff(Q).upkeep) * 100) / 100;
      //  総評から出してもらった候補は、通れば議席になる。ならないほうの
      //  代議員票は総評のものである。右へ寄る決議は、その人たちの
      //  反対を越えないと通らない ── 議席は借りられるが、党大会は借りられない。
      Q.sohyo_giin = Q.sohyo_giin || 0;
      Q.route_right_cost = 2 + Math.min(4, Q.sohyo_giin);
      Q.nom_short = Math.max(0, (Math.floor((Q.hr_total || 511) / 2) + 1) - nc0.cap);
      Q.nl_open = ((Q.act || 1) >= 2 && (Q.year || 0) <= this.NL_WINDOW) ? 1 : 0;
      Q.nl_left = Math.max(0, this.NL_INTAKE_MAX - (Q.nl_intake || 0));
      Q.nl_intake = Q.nl_intake || 0;
      Q.nl_intake_del = Q.nl_intake_del || 0;
      this.applySaveLock(Q);
      var gf = ['uha', 'chuu', 'saha'], gi;
      for (gi = 0; gi < gf.length; gi++) {
        Q['gone_' + gf[gi]] = this.inParty(Q, gf[gi]) ? 0 : 1;
      }
      Q.disp_tally    = this.tallyLine(Q);
      Q.disp_layers   = this.layerBlock(Q);
      Q.disp_unions   = this.unionBlock(Q);
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
      Q.fac_chair     = FNAME[this.factionOf(Q.post_chair)] || '';
      Q.fac_org       = FNAME[this.factionOf(Q.post_org)] || '';
      Q.fac_youth     = FNAME[this.factionOf(Q.post_youth)] || '';
      if (this.LEADERS) { this.LEADERS.sync(Q); }
      if (this.CAB) { this.CAB.sync(Q); }
      //  政権の札の門。以前は一つの省に紐付けていたので、その省を
      //  取れなかった局では札が丸ごと死んだ ── 監査で「外交の実務」と
      //  「労働行政」は四十局で 0 回であった。副題は「大蔵か通産」と
      //  書いてあるのに has_okura しか見ていなかったのもここで揃える。
      this.fixSavePrefix();
      Q.disp_policy = this.policyBlock(Q);
      //  憲法。発議できる中身を先に数えておく。
      this.kaikenRisk(Q);
      Q.kaiken_line = this.kaikenLine(Q);
      var rk_, rkeys = ['kyujo', 'hirei', 'heiyo', 'renyo', 'heiritsu', 'kensetsu', 'gijutsu', 'kokka'];
      var anyOk = 0;
      for (rk_ = 0; rk_ < rkeys.length; rk_ += 1) {
        var okk = this.reformOk(Q, rkeys[rk_]) ? 1 : 0;
        Q['kaiken_' + rkeys[rk_]] = okk;
        if (okk) { anyOk = 1; }
      }
      //  札が出るのは、左か右の線に居て、何か一つでも発議できるとき。
      var bd_ = this.bandOf(Q);
      //  一度通しても札は出続ける ── 連ねていけることが国体への唯一の道である。
      Q.kaiken_can = (anyOk && (bd_ === 1 || bd_ === 4)) ? 1 : 0;
      Q.kyogi_power = this.kyogiPower(Q);
      Q.kyogi_ok = Q.kyogi_power > 0 ? 1 : 0;
      Q.has_keizai_post = (Q.has_okura || Q.has_tsusan) ? 1 : 0;
      Q.has_rodo_post   = (Q.has_rodo || Q.has_kosei) ? 1 : 0;
      Q.has_gaikou_post = (Q.has_gaimu || Q.has_souri) ? 1 : 0;
      Q.has_sanmin_post = (Q.has_tsusan || Q.has_rodo) ? 1 : 0;
      return Q;
    },

    pct: function (x) { return (Math.round(x * 10) / 10).toFixed(1); },

    tallyLine: function (Q) {
      var v = this.tally(Q), out = [], j, p;
      for (j = 0; j < PARTIES.length; j++) {
        p = PARTIES[j];
        if (p === 'minsha' && !Q.minsha_exists) { continue; }
        if (p === 'komei' && !Q.komei_exists) { continue; }
        out.push('<span style="color:' + PCOLOR[p] + ';font-weight:bold">' + PNAME[p] + '</span> ' + this.pct(v[p]) + '%');
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
          + '　跟党的关系 ' + rel
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
        rows.push('<b>' + LNAME[l] + '</b>　人口 ' + Q['pop_' + l] + '%　組織率 ' +
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
