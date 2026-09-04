// ══════════════════════════════════════════════════════════════
//  JSP 指導部モジュール
//  ・人物ごとに 在籍期間 / 役職適性 / 受動効果 / 固有アクション
//  ・党大会で代議員数に応じて自動的に役職が決まる（均衡人事）
//  ・プレイヤーは差し替えられる。派閥間の距離に応じて好感度が動く
//  window.JSP に生やす。jsp-core.js のあとに読むこと。
// ══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var J = window.JSP;
  if (!J) { throw new Error('jsp-leaders.js は jsp-core.js のあとに読み込むこと'); }

  var POSTS = ['chair', 'secgen', 'policy', 'diet', 'org', 'youth'];
  var POST_NAME = {
    chair: '委员长', secgen: '书记长', policy: '政策审议会长',
    diet: '国会对策委员长', org: '组织局长', youth: '青年部长'
  };
  // 役職の重み。差し替えたときに派閥感情がどれだけ動くか
  var POST_WEIGHT = { chair: 14, secgen: 9, policy: 6, diet: 6, org: 7, youth: 5 };

  // 派閥間の親和。負 = その派閥の不満が下がる（＝好感度が上がる）
  // 行 = 起用した派閥、列 = 影響を受ける派閥
  var AFFINITY = {
    uha:   { uha: -1.00, chuu: -0.40, chusa: +0.45, saha: +0.80 },
    chuu:  { uha: -0.40, chuu: -1.00, chusa: +0.25, saha: +0.50 },
    chusa: { uha: +0.45, chuu: +0.25, chusa: -1.00, saha: -0.40 },
    saha:  { uha: +0.80, chuu: +0.50, chusa: -0.40, saha: -1.00 }
  };

  // ── 人物 ────────────────────────────────────────────────────
  //  n     : .dry の view-if で使う数値ID
  //  from/to : 在籍する年。to を過ぎると候補から消える
  //  fit   : 役職適性（高いほど自動選出で選ばれやすい）
  //  act   : 固有アクション。cost / cd（冷却） / uses（幕あたりの回数）
  var FIG = {
    suzuki: { n: 1, name: '铃木茂三郎', faction: 'chusa', from: 1955, to: 1970,
      note: '统一后社会党的首任委员长。晚年被人说教条',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 1, org: 1, youth: 0 },
      passive: '每回把所有派阀的不满压下 1',
      act: { name: '讲党的统一', desc: '各派的不满 −8', cost: { capital: 2 }, cd: 3, uses: 2 } },

    asanuma: { n: 2, name: '浅沼稻次郎', faction: 'chusa', from: 1955, to: 1960,
      note: '人称"人肉火车头"。靠演讲把这个党一路拉过来的人',
      fit: { chair: 4, secgen: 5, policy: 1, diet: 3, org: 2, youth: 1 },
      passive: '每回，未组织受雇者和新中间层的倾向往上走一点',
      act: { name: '站到街头上去', desc: '未组织与新中间层 +3、政治资源 +2', cost: {}, cd: 2, uses: 4 } },

    sasaki: { n: 3, name: '佐佐木更三', faction: 'chusa', from: 1955, to: 1980,
      note: '铃木的心腹。对结构改革论正面反对到底',
      fit: { chair: 4, secgen: 3, policy: 2, diet: 2, org: 5, youth: 2 },
      passive: '每回，中间左派的代议员多 3',
      act: { name: '下地方跑组织', desc: '无派阀代议员 +25', cost: { budget: 3 }, cd: 3, uses: 3 } },

    katsumata: { n: 4, name: '胜间田清一', faction: 'chusa', from: 1955, to: 1985,
      note: '懂政策。出自旧和田派那条系谱',
      fit: { chair: 3, secgen: 2, policy: 5, diet: 2, org: 2, youth: 1 },
      passive: '每回，政治资源 +1',
      act: { name: '把政策文件拢出来', desc: '政治资源 +4', cost: {}, cd: 3, uses: 3 } },

    narita: { n: 5, name: '成田知巳', faction: 'chusa', from: 1955, to: 1979,
      note: '党务型。后来长期出任委员长',
      fit: { chair: 3, secgen: 5, policy: 3, diet: 2, org: 4, youth: 1 },
      passive: '每回，资金 +1',
      act: { name: '把党务勒紧', desc: '资金 +4、协会的掌握度 −3', cost: { capital: 1 }, cd: 3, uses: 3 } },

    eda: { n: 6, name: '江田三郎', faction: 'chuu', from: 1955, to: 1977,
      note: '结构改革论。后来退党，去了社民联',
      fit: { chair: 4, secgen: 4, policy: 5, diet: 3, org: 3, youth: 3 },
      passive: '每回，中间右派的不满 −2、左派的不满 +1',
      act: { name: '讲结构改革', desc: '新中间层 +5、路线 +0.5、左派 +12', cost: { capital: 2 }, cd: 3, uses: 3 } },

    kawakami: { n: 7, name: '河上丈太郎', faction: 'chuu', from: 1955, to: 1965,
      note: '右派的元老。人称"十字架委员长"',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 3, org: 1, youth: 0 },
      passive: '每回，把右派和中间右派的不满各压下 1',
      act: { name: '在两派中间说合', desc: '右派和左派的不满 −12', cost: { capital: 3 }, cd: 4, uses: 2 } },

    wada: { n: 8, name: '和田博雄', faction: 'chuu', from: 1955, to: 1967,
      note: '当过农相。官僚出身的政策家',
      fit: { chair: 2, secgen: 3, policy: 5, diet: 4, org: 3, youth: 1 },
      passive: '每回，政治资源 +1（两回里有一回）',
      act: { name: '接下政策协议', desc: '政治资源 +3、自民 +8、总评 −4', cost: {}, cd: 3, uses: 3 } },

    nishio: { n: 9, name: '西尾末广', faction: 'uha', from: 1955, to: 1981,
      note: '民主社会主义。后来把党劈开走掉的那个人',
      fit: { chair: 4, secgen: 3, policy: 3, diet: 5, org: 2, youth: 0 },
      passive: '每回，右派的不满 −4、左派的不满 +2',
      act: { name: '举出民主社会主义', desc: '路线 +1、右派 −20、左派 +18', cost: { capital: 2 }, cd: 9, uses: 1 } },

    sone: { n: 10, name: '曾祢益', faction: 'uha', from: 1955, to: 1980,
      note: '西尾派。外交与安保的实务家',
      fit: { chair: 1, secgen: 2, policy: 4, diet: 4, org: 1, youth: 0 },
      passive: '每回，右派的不满 −2',
      act: { name: '做一份安保的修正案', desc: '政治资源 +4、总评 −6', cost: {}, cd: 3, uses: 3 } },

    sakisaka: { n: 11, name: '向坂逸郎', faction: 'saha', from: 1955, to: 1985,
      note: '社会主义协会的理论支柱。他不担党职，可实际上就是领导',
      fit: { chair: 1, secgen: 1, policy: 3, diet: 0, org: 4, youth: 5 },
      passive: '每回，协会的掌握度 +2、左派的不满 −3',
      act: { name: '把劳动者教育组织起来', desc: '官公劳 +4、掌握度 +6', cost: { budget: 2 }, cd: 3, uses: 3 } },

    // ── 一九七〇年代の世代 ────────────────────────────────────
    ishibashi: { n: 12, name: '石桥政嗣', faction: 'chusa', from: 1970, to: 1993,
      note: '《非武装中立论》的作者。在成田手下当书记长',
      fit: { chair: 4, secgen: 5, policy: 5, diet: 4, org: 2, youth: 1 },
      passive: '每回，新中间层的倾向往上走一点',
      act: { name: '讲非武装中立', desc: '新中间层 +4、左派 −6', cost: { capital: 2 }, cd: 3, uses: 3 } },

    asukata: { n: 13, name: '飞鸟田一雄', faction: 'chusa', from: 1963, to: 1990,
      note: '横滨市长，全国革新市长会会长。人还坐在市长位上就当了党委员长，只此一位',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 2, org: 4, youth: 2 },
      passive: '每回，资金 +1、无派阀的代议员 +2',
      act: { name: '把全国革新市长会调动起来', desc: '资金 +5、无派阀代议员 +30', cost: {}, cd: 4, uses: 2 } },

    doi: { n: 14, name: '土井多贺子', faction: 'chusa', from: 1969, to: 1993,
      note: '宪法学者。一九六九年初次当选。后来说出那句"只能豁出去了"',
      fit: { chair: 3, secgen: 2, policy: 4, diet: 3, org: 2, youth: 3 },
      passive: '每回，未组织受雇者的倾向往上走一点',
      act: { name: '拿过日子的题目去推', desc: '未组织与新中间层 +3、政治资源 +2', cost: {}, cd: 2, uses: 4 } },

    takazawa: { n: 15, name: '高泽寅男', faction: 'saha', from: 1969, to: 1993,
      note: '社会主义协会的代表性议员。把向坂的理论在党内落成实务',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 2, org: 5, youth: 4 },
      passive: '每回，协会的掌握度 +2',
      act: { name: '把协会的组织力调起来', desc: '官公劳 +4、掌握度 +5', cost: { budget: 2 }, cd: 3, uses: 3 } },

    tahideo: { n: 16, name: '田英夫', faction: 'chuu', from: 1971, to: 1977,
      note: '当过新闻主播。因越南的报道被撤下，转去参院。后来进了社民联',
      fit: { chair: 2, secgen: 2, policy: 4, diet: 4, org: 1, youth: 2 },
      passive: '每回，政治资源 +1',
      act: { name: '上电视去讲', desc: '新中间层 +5。话直接够得到浮动票', cost: { capital: 2 }, cd: 3, uses: 2 } },

    // ── 一九八〇年代の世代 ────────────────────────────────────
    tanabe: { n: 17, name: '田边诚', faction: 'chusa', from: 1970, to: 1993,
      note: '全递出身，专管跟工会打交道。土井之后接任委员长',
      fit: { chair: 4, secgen: 4, policy: 2, diet: 4, org: 4, youth: 1 },
      passive: '每回，跟总评的关系 +2',
      act: { name: '跟工会把手拍定', desc: '资金 +6、总评 +10', cost: {}, cd: 3, uses: 3 } },

    yamaguchi: { n: 18, name: '山口鹤男', faction: 'chusa', from: 1969, to: 1993,
      note: '党务型的书记长。组织和选举的实务都由他跑',
      fit: { chair: 2, secgen: 5, policy: 3, diet: 3, org: 4, youth: 1 },
      passive: '每回，无派阀的代议员 +2',
      act: { name: '把选举的布局勒紧', desc: '政治资源 +3、无派阀代议员 +20', cost: { budget: 2 }, cd: 3, uses: 3 } },

    ueda: { n: 19, name: '上田哲', faction: 'saha', from: 1968, to: 1993,
      note: '当过 NHK 记者。人是偏协会的，可讲话的方式是冲着城里人来的',
      fit: { chair: 3, secgen: 2, policy: 4, diet: 3, org: 2, youth: 4 },
      passive: '每回，新中间层的倾向往上走一点',
      act: { name: '在街头和电视上一起推', desc: '未组织与新中间层 +4', cost: { capital: 2 }, cd: 2, uses: 3 } },

    murayama: { n: 20, name: '村山富市', faction: 'chusa', from: 1972, to: 1993,
      note: '大分的自治劳出身。不显眼。可最后当上了首相',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 4, org: 3, youth: 1 },
      passive: '每回，把中间左派的不满压下 1',
      act: { name: '把党内拢到一处', desc: '各派的不满 −6', cost: { capital: 2 }, cd: 3, uses: 3 } },
    //  ── 中間右派の後継（監査で 1978年以降ゼロだった） ──────────
    //  江田三郎（〜1977）と田英夫（〜1977）が抜けたあと、中間右派に
    //  据えられる人物が一人もいなくなっていた。mood_chuu は生きていて
    //  社民連の分裂も起こりうるのに、人事でなだめる手が無かった。
    itoshige: { n: 21, name: '伊藤茂', faction: 'chuu', from: 1972, to: 1993,
      note: '接下了江田派那条务实路线。当过政审会长、国对委员长，后来做运输大臣',
      fit: { chair: 3, secgen: 4, policy: 5, diet: 5, org: 2, youth: 1 },
      passive: '每回，政治资源 +1',
      act: { name: '去做朝野之间的调配', desc: '政治资源 +5、公明 +8、自民 +6', cost: {}, cd: 3, uses: 3 } },
    yamahana: { n: 22, name: '山花贞夫', faction: 'chuu', from: 1976, to: 1993,
      note: '律师出身。新浪潮的一面旗。一九九三年当上委员长',
      fit: { chair: 4, secgen: 3, policy: 4, diet: 3, org: 3, youth: 4 },
      passive: '每回，新中间层的倾向往上走一点',
      act: { name: '举出政治改革', desc: '新中间层与未组织 +5、公明 +10。左派 +10', cost: { capital: 2 }, cd: 3, uses: 3 } },
    kubo: { n: 23, name: '久保亘', faction: 'chuu', from: 1974, to: 1993,
      note: '鹿儿岛的教组出身，可在党务上是务实派。当过书记长，后来做副总理兼大藏大臣',
      fit: { chair: 3, secgen: 5, policy: 4, diet: 4, org: 4, youth: 1 },
      passive: '每回，资金 +1',
      act: { name: '把党的财政重新勒一遍', desc: '资金 +8、欠账一笔勾销。左派 +6', cost: { capital: 2 }, cd: 4, uses: 2 } },
    uehara: { n: 24, name: '上原康助', faction: 'chusa', from: 1970, to: 1993,
      note: '冲绳人，从全军劳委员长做起。一直把基地问题挂在党的课题上',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 4, org: 4, youth: 2 },
      passive: '每回，官公劳的倾向往上走一点',
      act: { name: '拿基地问题去推', desc: '官公劳 +4、未组织 +3、自民 −10', cost: { capital: 2 }, cd: 3, uses: 3 } },
    //  ── 鈴木茂三郎の世代（統一社会党の創立期） ──────────────
    //  第Ⅰ幕を一九五八年起点にしたので、この世代の人数を厚くした。
    //  多くは一九六〇年代のうちに退場する。誰を使い切るかが第Ⅰ〜Ⅱ幕の問題になる。
    matsumoto: { n: 25, name: '松本治一郎', faction: 'saha', from: 1955, to: 1966,
      note: '部落解放同盟委员长，参院副议长。人称"部落解放之父"',
      fit: { chair: 3, secgen: 2, policy: 2, diet: 4, org: 5, youth: 2 },
      passive: '每回，未组织层的倾向往上走一点',
      act: { name: '把解放同盟调动起来', desc: '未组织 +5、无派阀代议员 +15', cost: {}, cd: 3, uses: 3 } },
    kato: { n: 26, name: '加藤勘十', faction: 'saha', from: 1955, to: 1965,
      note: '劳动运动的元老。片山内阁的劳动大臣——这个党出的头一批阁僚之一',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 3, org: 5, youth: 1 },
      passive: '每回，跟总评的关系 +2',
      act: { name: '以元老的身份去调停', desc: '总评 +14、官公劳 +3、各派的不满 −5', cost: {}, cd: 4, uses: 2 } },
    kuroda: { n: 27, name: '黑田寿男', faction: 'saha', from: 1955, to: 1969,
      note: '从农民运动里出来的。日中友好的窗口，他做了很多年',
      fit: { chair: 2, secgen: 2, policy: 3, diet: 4, org: 3, youth: 1 },
      passive: '每回，农村的倾向往上走一点',
      act: { name: '把日中的窗口张罗起来', desc: '共产 +12、自营工商 +3、农村 +2', cost: { capital: 2 }, cd: 3, uses: 3 } },
    okada: { n: 28, name: '冈田春夫', faction: 'chusa', from: 1955, to: 1990,
      note: '国会论战的好手。因为总能掏出把政府逼到墙角的材料，人称"炸弹男"',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 5, org: 2, youth: 2 },
      passive: '每回，政治资源 +1',
      act: { name: '在国会上扔炸弹', desc: '自民 −16、政治资源 +6、新中间层 +3', cost: {}, cd: 3, uses: 3 } },
    yamahana_h: { n: 29, name: '山花秀雄', faction: 'chusa', from: 1955, to: 1972,
      note: '劳动运动出身的书记长，跑党务的人。山花贞夫的父亲',
      fit: { chair: 2, secgen: 5, policy: 2, diet: 3, org: 4, youth: 2 },
      passive: '每回，工会一系的代议员 +2',
      act: { name: '把党务勒紧', desc: '工会一系代议员 +25、总评 +8', cost: { capital: 2 }, cd: 3, uses: 3 } },
    miyake: { n: 30, name: '三宅正一', faction: 'chusa', from: 1955, to: 1980,
      note: '农民运动的元老，众院副议长。在农村给这个党做出落脚地的少数几个人之一',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 4, org: 4, youth: 1 },
      passive: '每回，农村的倾向往上走一点',
      act: { name: '把农民组合调动起来', desc: '农村 +5、无派阀代议员 +12', cost: { budget: 2 }, cd: 3, uses: 3 } },
    togano: { n: 31, name: '户叶里子', faction: 'chuu', from: 1955, to: 1972,
      note: '管外交和妇女问题。在女议员一只手数得过来的年代里的一个',
      fit: { chair: 2, secgen: 2, policy: 4, diet: 4, org: 2, youth: 4 },
      passive: '每回，新中间层的倾向往上走一点',
      act: { name: '从妇女和外交上讲', desc: '新中间层 +5、未组织 +3', cost: { capital: 2 }, cd: 3, uses: 3 } },
    kono: { n: 32, name: '河野密', faction: 'chuu', from: 1955, to: 1970,
      note: '政策审议会长。合并之前，右派社会党的纲领是他写的',
      fit: { chair: 3, secgen: 3, policy: 5, diet: 3, org: 2, youth: 1 },
      passive: '每回，政治资源 +1',
      act: { name: '写纲领的草案', desc: '路线 +0.5、新中间层 +4。左派 +12', cost: { capital: 2 }, cd: 4, uses: 2 } }
  };

  var BY_N = {};
  Object.keys(FIG).forEach(function (k) { FIG[k].id = k; BY_N[FIG[k].n] = k; });

  // 分裂で党を出た人物
  function gone(Q, id) {
    var f = FIG[id];
    if (!f) { return true; }
    if (Q.year > f.to) { return true; }
    if (Q.minsha_exists && f.faction === 'uha') { return true; }
    if (Q.asanuma_dead && id === 'asanuma') { return true; }
    // 飛鳥田は横浜市長である。市を取っていなければ党内に登場しない ──
    // 地方の実績が党内人事に還流する、その入口。
    if (id === 'asukata' && !Q.local_yokohama && !Q.asukata_resigned) { return true; }
    return false;
  }

  //  その人物がいま盤面にいるか。事象の門はこれを見る。
  //  gone は「退場したか」だけを見るので、登場前（from より手前）は
  //  拾えない。事象の側で要るのは「いま動けるか」なので、両方を見る。
  function here(Q, id) {
    var f = FIG[id];
    if (!f) { return false; }
    return !gone(Q, id) && (Q.year || 0) >= f.from;
  }

  function roster(Q) {
    return Object.keys(FIG).filter(function (id) {
      return !gone(Q, id) && Q.year >= FIG[id].from;
    });
  }

  // ── 党大会での自動選出。代議員数に応じた均衡人事 ──────────────
  function elect(Q) {
    var d = J.delegates(Q);
    var strength = { uha: d.uha, chuu: d.chuu, chusa: d.chusa, saha: d.kyokai };
    if (!Q.saha_independent) { strength.chusa += strength.saha; strength.saha = 0; }
    var avail = roster(Q);
    var byFaction = {};
    avail.forEach(function (id) {
      var f = FIG[id].faction;
      (byFaction[f] = byFaction[f] || []).push(id);
    });

    // 役職を代議員シェアで配る。最大派閥が委員長を取る
    var total = 0, k;
    for (k in strength) { if (byFaction[k] && byFaction[k].length) { total += strength[k]; } else { strength[k] = 0; } }
    if (total <= 0) { return Q; }

    var order = Object.keys(strength).sort(function (a, b) { return strength[b] - strength[a]; });
    var quota = {}, used = {};
    order.forEach(function (f) { quota[f] = strength[f] / total * POSTS.length; used[f] = 0; });

    var taken = {};
    POSTS.forEach(function (post) {
      // まだ配分の残っている派閥のうち、この役職への適性が最も高い者
      var best = null, bestScore = -1;
      order.forEach(function (f) {
        if (!byFaction[f]) { return; }
        var room = quota[f] - used[f];
        byFaction[f].forEach(function (id) {
          if (taken[id]) { return; }
          var score = FIG[id].fit[post] + room * 1.4 + (post === 'chair' ? strength[f] / total * 6 : 0);
          if (score > bestScore) { bestScore = score; best = id; }
        });
      });
      if (best) { taken[best] = 1; used[FIG[best].faction] += 1; Q['post_' + post] = best; }
    });
    syncIds(Q);
    return Q;
  }

  // ── プレイヤーによる差し替え。派閥間の距離で好感度が動く ─────────
  // ── 大会の票読み ────────────────────────────────────────────
  //
  //  人事は委員長が決めるものではない。党大会の代議員が決める。
  //  石橋政嗣が委員長になれたのは、一九八三年の大会で左と中間左が
  //  多数だったからである。大会が右に寄っていれば、同じ人事は通らない。
  //
  //  ある人物を推したとき、各派の代議員がどれだけ賛成に回るかを、
  //  派閥間の親和から出す。親和は AFFINITY の裏返しで、
  //  「その派を起用すると不満が下がる派」＝「賛成する派」である。
  function support(Q, id) {
    var f = FIG[id] && FIG[id].faction;
    if (!f) { return { pct: 0, by: {} }; }
    var d = J.delegates(Q);
    var row = AFFINITY[f];
    //  協会は左派の塊として別に数える
    var block = { uha: d.uha, chuu: d.chuu, chusa: d.chusa, saha: d.kyokai };
    var yes = 0, tot = 0, by = {};
    ['uha', 'chuu', 'chusa', 'saha'].forEach(function (g) {
      var n = block[g] || 0;
      tot += n;
      //  親和 -1.00（自派）で全部、+0.80（正面から敵）でほぼ 0
      var rate = (1 - (row[g] + 1) / 2);
      if (rate < 0) { rate = 0; }
      if (rate > 1) { rate = 1; }
      var v = n * rate;
      by[g] = Math.round(v);
      yes += v;
    });
    //  無派閥は党の勢い（政治資源）で動く。何も無ければ半分。
    var muha = d.muha || 0;
    tot += muha;
    var mrate = 0.35 + Math.min(0.4, (Q.capital || 0) / 100);
    by.muha = Math.round(muha * mrate);
    yes += muha * mrate;
    return { pct: tot ? Math.round(yes / tot * 1000) / 10 : 0, by: by, total: tot };
  }

  //  推した人物が大会を通るか。通らなければ、代わりに
  //  いちばん大きい派の候補が座る（大会はそういう場所である）。
  function nominate(Q, post, id) {
    var s = support(Q, id);
    Q.jinji_support = s.pct;
    if (s.pct >= 50) { Q.jinji_result = 1; return appoint(Q, post, id); }
    Q.jinji_result = 0;
    //  否決。推した側は政治資源を失い、大会の主流が不満を下げる。
    Q.capital = Math.max(0, (Q.capital || 0) - 2);
    var d = J.delegates(Q);
    var big = 'chusa', bn = -1;
    [['uha', d.uha], ['chuu', d.chuu], ['chusa', d.chusa], ['saha', d.kyokai]].forEach(function (r) {
      if (r[1] > bn) { bn = r[1]; big = r[0]; }
    });
    //  主流派から、いま党にいて空いている人を立てる
    var alt = null, y = J.yearOf(Q);
    for (var k in FIG) {
      if (!FIG.hasOwnProperty(k)) { continue; }
      if (gone(Q, k) || FIG[k].faction !== big) { continue; }
      if (FIG[k].from > y || FIG[k].to < y) { continue; }
      var held = false;
      for (var i = 0; i < POSTS.length; i++) { if (Q['post_' + POSTS[i]] === k) { held = true; } }
      if (held) { continue; }
      alt = k; break;
    }
    Q.jinji_alt = alt || '';
    if (alt) { appoint(Q, post, alt); }
    else { Q.jinji_timer = 2; }
    return false;
  }

  function appoint(Q, post, id) {
    if (!FIG[id] || gone(Q, id)) { return false; }
    //  党人事そのものが事象の呼び水になる（c_chair）。
    if (window.JSP && window.JSP.tallyCounter) { window.JSP.tallyCounter(Q, 'chair'); }
    // 同じ人物が二つの役職を持つのは避ける
    for (var i = 0; i < POSTS.length; i++) {
      if (POSTS[i] !== post && Q['post_' + POSTS[i]] === id) { Q['post_' + POSTS[i]] = null; }
    }
    var f = FIG[id].faction;
    var w = POST_WEIGHT[post] || 6;
    var row = AFFINITY[f];
    ['uha', 'chuu', 'chusa', 'saha'].forEach(function (g) {
      var v = Q['mood_' + g] + row[g] * w;
      Q['mood_' + g] = Math.max(0, Math.min(160, Math.round(v * 10) / 10));
    });
    Q['post_' + post] = id;
    Q.jinji_timer = 4;
    syncIds(Q);
    return true;
  }

  // ── 没した人・党を出た人を役職から外す ──────────────────────
  //  gone() は名簿と行動と表示では見ていたが、役職に就いたままの人物は
  //  誰も外していなかった。実測（一五〇局・一二二七四手番）で、
  //  手番の 28.5% に「党にいない人物がどこかの役職に就いている」状態があり、
  //  鈴木茂三郎（一九七〇年没）が一九九三年まで委員長で毎手 mood を下げ、
  //  佐々木更三（〜一九八〇）が組織局長のまま代議員を毎手 +3 していた。
  //
  //  空席のままにすると盤が動かなくなるので、同じ派閥の中から
  //  その役職に向く人へ引き継ぐ。誰も居なければ空席にする。
  function heldBy(Q, id) {
    for (var i = 0; i < POSTS.length; i++) { if (Q['post_' + POSTS[i]] === id) { return true; } }
    return false;
  }
  function successor(Q, post) {
    var cur = Q['post_' + post], f = cur ? FIG[cur] : null;
    var pool = roster(Q).filter(function (id) { return !heldBy(Q, id); });
    if (!pool.length) { return ''; }
    pool.sort(function (a, b) {
      var A = FIG[a], B = FIG[b];
      var sa = (A.fit[post] || 0) + (f && A.faction === f.faction ? 3 : 0);
      var sb = (B.fit[post] || 0) + (f && B.faction === f.faction ? 3 : 0);
      return sb - sa;
    });
    return pool[0];
  }
  function sweepPosts(Q) {
    var moved = 0;
    POSTS.forEach(function (post) {
      var id = Q['post_' + post];
      if (!id || !gone(Q, id)) { return; }
      Q['post_' + post] = successor(Q, post) || null;
      moved += 1;
    });
    if (moved) { Q.post_swept = (Q.post_swept || 0) + moved; syncIds(Q); }
    return Q;
  }

  // ── 受動効果。endturn ごとに呼ぶ ────────────────────────────
  function passives(Q) {
    sweepPosts(Q);
    var seen = {};
    POSTS.forEach(function (post) {
      var id = Q['post_' + post];
      //  引き継ぎに失敗して空席のまま残ったときのための止め。
      //  没した人物の受動効果を配り続けないこと。
      if (id && gone(Q, id)) { return; }
      if (!id || seen[id]) { return; }
      seen[id] = 1;
      switch (id) {
        case 'suzuki':
          ['uha', 'chuu', 'chusa', 'saha'].forEach(function (g) { Q['mood_' + g] -= 1; }); break;
        case 'asanuma':
          J.push(Q, ['mishoshiki', 'shinchukan'], 0.3); break;
        case 'sasaki':   Q.del_chusa += 3; break;
        case 'katsumata': Q.capital += 1; break;
        case 'narita':   Q.budget += 1; break;
        case 'eda':      Q.mood_chuu -= 2; Q.mood_saha += 1; break;
        case 'kawakami': Q.mood_uha -= 1; Q.mood_chuu -= 1; break;
        case 'wada':     Q.wada_tick = (Q.wada_tick || 0) + 1;
                         if (Q.wada_tick % 2 === 0) { Q.capital += 1; } break;
        case 'nishio':   Q.mood_uha -= 4; Q.mood_saha += 2; break;
        case 'sone':     Q.mood_uha -= 2; break;
        case 'sakisaka': Q.kyokai_grip = Math.min(100, Q.kyokai_grip + 2); Q.mood_saha -= 3; break;
        case 'ishibashi': J.push(Q, ['shinchukan'], 0.3); break;
        case 'asukata':  Q.budget += 1; Q.del_muha += 2; break;
        case 'doi':      J.push(Q, ['mishoshiki'], 0.3); break;
        case 'takazawa': Q.kyokai_grip = Math.min(100, Q.kyokai_grip + 2); break;
        case 'tahideo':  Q.capital += 1; break;
        case 'tanabe':    Q.rel_sohyo += 2; break;
        case 'yamaguchi': Q.del_muha += 2; break;
        case 'ueda':      J.push(Q, ['shinchukan'], 0.3); break;
        case 'murayama':  Q.mood_chusa = Math.max(0, Q.mood_chusa - 1); break;
        case 'itoshige':  Q.capital += 1; break;
        case 'yamahana':  J.push(Q, ['shinchukan'], 0.3); break;
        case 'kubo':      Q.budget += 1; break;
        case 'uehara':    J.push(Q, ['kokorou'], 0.3); break;
        case 'matsumoto': J.push(Q, ['mishoshiki'], 0.3); break;
        case 'kato':      Q.rel_sohyo += 2; break;
        case 'kuroda':    J.push(Q, ['noson'], 0.3); break;
        case 'okada':     Q.capital += 1; break;
        case 'yamahana_h': Q.del_chusa += 2; break;
        case 'miyake':    J.push(Q, ['noson'], 0.3); break;
        case 'togano':    J.push(Q, ['shinchukan'], 0.3); break;
        case 'kono':      Q.capital += 1; break;
      }
    });
    ['uha', 'chuu', 'chusa', 'saha'].forEach(function (g) {
      Q['mood_' + g] = Math.max(0, Math.min(160, Math.round(Q['mood_' + g] * 10) / 10));
    });
    return Q;
  }

  // ── 固有アクションの実行 ────────────────────────────────────
  function canAct(Q, id) {
    var f = FIG[id];
    if (!f || gone(Q, id)) { return false; }
    if ((Q['cd_' + id] || 0) > 0) { return false; }
    if ((Q['uses_' + id] || 0) >= f.act.uses) { return false; }
    var c = f.act.cost;
    if (c.capital && Q.capital < c.capital) { return false; }
    if (c.budget && Q.budget < c.budget) { return false; }
    return true;
  }

  //  領袖の行動が、どの種類の政治を一手ぶん進めるか。
  //  全部を org にすると org だけが閾値を越え、他の counter に載る
  //  事象が一件も出なくなる。行動の中身に合わせて散らす。
  var ACT_DOMAIN = {
    asanuma: 'rally',
    asukata: 'org',
    doi: 'rally',
    eda: 'koryo',
    ishibashi: 'koryo',
    itoshige: 'rel',
    kato: 'labor',
    katsumata: 'diet',
    kawakami: 'koryo',
    kono: 'koryo',
    kubo: 'fund',
    kuroda: 'rel',
    matsumoto: 'org',
    miyake: 'org',
    murayama: 'koryo',
    narita: 'org',
    nishio: 'koryo',
    okada: 'diet',
    sakisaka: 'labor',
    sasaki: 'org',
    sone: 'diet',
    suzuki: 'koryo',
    tahideo: 'rally',
    takazawa: 'labor',
    tanabe: 'labor',
    togano: 'rally',
    ueda: 'rally',
    uehara: 'labor',
    wada: 'diet',
    yamaguchi: 'org',
    yamahana: 'rel',
    yamahana_h: 'org'
  };

  function doAct(Q, id) {
    //  一手を使う行動は必ず何かの蓄積になる。ここが無いと、
    //  指導部に手を割いた幕では事象が一歩も進まない。
    if (window.JSP && window.JSP.tallyCounter) {
      window.JSP.tallyCounter(Q, ACT_DOMAIN[id] || 'org');
    }
    if (!canAct(Q, id)) { return false; }
    var f = FIG[id], c = f.act.cost;
    if (c.capital) { Q.capital -= c.capital; }
    if (c.budget) { Q.budget -= c.budget; }
    Q['cd_' + id] = f.act.cd;
    Q['uses_' + id] = (Q['uses_' + id] || 0) + 1;
    switch (id) {
      case 'suzuki':
        ['uha', 'chuu', 'chusa', 'saha'].forEach(function (g) { Q['mood_' + g] -= 8; }); break;
      case 'asanuma':
        J.push(Q, ['mishoshiki', 'shinchukan'], 3); Q.capital += 2; break;
      case 'sasaki':   Q.del_muha += 25; break;
      case 'katsumata': Q.capital += 4; break;
      case 'narita':   Q.budget += 4; Q.kyokai_grip = Math.max(0, Q.kyokai_grip - 3); break;
      case 'eda':      J.push(Q, ['shinchukan'], 5); Q.route += 0.5; Q.mood_saha += 12; Q.mood_chuu -= 6; break;
      case 'kawakami': Q.mood_uha -= 12; Q.mood_saha -= 12; break;
      case 'wada':     Q.capital += 3; Q.rel_jimin += 8; Q.rel_sohyo -= 4; break;
      case 'nishio':   Q.route += 1; Q.mood_uha -= 20; Q.mood_saha += 18; break;
      case 'sone':     Q.capital += 4; Q.rel_sohyo -= 6; break;
      case 'sakisaka': J.push(Q, ['kokorou'], 4); Q.kyokai_grip = Math.min(100, Q.kyokai_grip + 6); break;
      case 'ishibashi': J.push(Q, ['shinchukan'], 4); Q.mood_saha -= 6; break;
      case 'asukata':  Q.budget += 5; Q.del_muha += 30; break;
      case 'doi':      J.push(Q, ['mishoshiki', 'shinchukan'], 3); Q.capital += 2; break;
      case 'takazawa': J.push(Q, ['kokorou'], 4); Q.kyokai_grip = Math.min(100, Q.kyokai_grip + 5); break;
      case 'tahideo':  J.push(Q, ['shinchukan'], 5); break;
      case 'tanabe':    Q.budget += 6; Q.rel_sohyo += 10; break;
      case 'yamaguchi': Q.capital += 3; Q.del_muha += 20; break;
      case 'ueda':      J.push(Q, ['mishoshiki', 'shinchukan'], 4); break;
      case 'murayama':  ['uha','chuu','chusa','saha'].forEach(function (g) { Q['mood_' + g] -= 6; }); break;
      case 'itoshige': Q.capital += 5; Q.rel_komei += 8; Q.rel_jimin += 6; Q.mood_saha += 6; break;
      case 'yamahana': J.push(Q, ['shinchukan', 'mishoshiki'], 5); Q.rel_komei += 10;
                       Q.mood_saha += 10; Q.mood_chuu -= 8; break;
      //  未払いを帳消しにするのは、この一人だけができること
      case 'kubo':     Q.budget += 8; Q.upkeep_acc = 0; Q.arrears = 0;
                       Q.mood_saha += 6; Q.rel_sohyo -= 4; break;
      case 'uehara':   J.push(Q, ['kokorou'], 4); J.push(Q, ['mishoshiki'], 3);
                       Q.rel_jimin -= 10; Q.rel_sohyo += 6; break;
      case 'matsumoto': J.push(Q, ['mishoshiki'], 5); Q.del_muha += 15; break;
      case 'kato':      Q.rel_sohyo += 14; J.push(Q, ['kokorou'], 3);
                        ['uha','chuu','chusa','saha'].forEach(function (g) { Q['mood_' + g] -= 5; }); break;
      case 'kuroda':    Q.rel_kyosan += 12; J.push(Q, ['jieigyo'], 3); J.push(Q, ['noson'], 2); break;
      case 'okada':     Q.rel_jimin -= 16; Q.capital += 6; J.push(Q, ['shinchukan'], 3); break;
      case 'yamahana_h': Q.del_chusa += 25; Q.rel_sohyo += 8; break;
      case 'miyake':    J.push(Q, ['noson'], 5); Q.del_muha += 12; break;
      case 'togano':    J.push(Q, ['shinchukan'], 5); J.push(Q, ['mishoshiki'], 3); break;
      case 'kono':      Q.route += 0.5; J.push(Q, ['shinchukan'], 4); Q.mood_saha += 12; break;
    }
    ['uha', 'chuu', 'chusa', 'saha'].forEach(function (g) {
      Q['mood_' + g] = Math.max(0, Math.min(160, Math.round(Q['mood_' + g] * 10) / 10));
    });
    return true;
  }

  function tickCooldowns(Q) {
    Object.keys(FIG).forEach(function (id) {
      if ((Q['cd_' + id] || 0) > 0) { Q['cd_' + id] -= 1; }
    });
    return Q;
  }

  // ── .dry から読むための数値・文字列を焼く ────────────────────
  function syncIds(Q) {
    POSTS.forEach(function (post) {
      var id = Q['post_' + post];
      var f = id ? FIG[id] : null;
      Q[post + '_id'] = f ? f.n : 0;
      Q['name_' + post] = f ? f.name : '（空缺）';
      Q['fac_' + post] = f ? J.FNAME[f.faction] : '';
      Q['line_' + post] = f
        ? f.name + ' <span style="opacity:.65;font-size:.9em">' + J.FNAME[f.faction] + '</span>'
        : '（空缺）';
      Q['note_' + post] = f ? f.note : '';
      Q['pass_' + post] = f ? f.passive : '';
      Q['actname_' + post] = f ? f.act.name : '';
      Q['actdesc_' + post] = f ? f.act.desc : '';
      Q['actok_' + post] = (f && canAct(Q, id)) ? 1 : 0;
      Q['actleft_' + post] = f ? (f.act.uses - (Q['uses_' + id] || 0)) : 0;
      Q['actcd_' + post] = f ? (Q['cd_' + id] || 0) : 0;
    });
    Q.board_lines = POSTS.map(function (p) {
      return POST_NAME[p] + '　' + Q['line_' + p];
    }).join('<br>');
    // .dry の view-if 用：誰が執行部に入っているか、その人が動けるか
    Object.keys(FIG).forEach(function (id) {
      var post = null, i;
      for (i = 0; i < POSTS.length; i++) { if (Q['post_' + POSTS[i]] === id) { post = POSTS[i]; break; } }
      Q['inpost_' + id] = post ? 1 : 0;
      Q['avail_' + id] = gone(Q, id) ? 0 : 1;
      Q['postname_' + id] = post ? POST_NAME[post] : '';
      Q['ok_' + id] = (post && canAct(Q, id)) ? 1 : 0;
      Q['left_' + id] = FIG[id].act.uses - (Q['uses_' + id] || 0);
      Q['cdleft_' + id] = Q['cd_' + id] || 0;
    });
    return Q;
  }

  // 差し替え候補の一覧（表示用）
  function candidates(Q, post) {
    return roster(Q).filter(function (id) { return Q['post_' + post] !== id; })
      .sort(function (a, b) { return FIG[b].fit[post] - FIG[a].fit[post]; });
  }
  function candidateLines(Q, post) {
    return candidates(Q, post).map(function (id) {
      var f = FIG[id];
      return f.name + ' <span style="opacity:.6">' + J.FNAME[f.faction] +
             '・适性' + f.fit[post] + '</span>';
    }).join('<br>');
  }

  J.LEADERS = {
    FIG: FIG, BY_N: BY_N, POSTS: POSTS, POST_NAME: POST_NAME, AFFINITY: AFFINITY,
    elect: elect, appoint: appoint, nominate: nominate, support: support, passives: passives,
    canAct: canAct, doAct: doAct, tick: tickCooldowns,
    sync: syncIds, roster: roster, candidates: candidates, candidateLines: candidateLines,
    gone: gone, here: here
  };
}());
