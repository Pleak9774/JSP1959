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
    chair: '委員長', secgen: '書記長', policy: '政策審議会長',
    diet: '国会対策委員長', org: '組織局長', youth: '青年部長'
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
    suzuki: { n: 1, name: '鈴木茂三郎', faction: 'chusa', from: 1955, to: 1970,
      note: '統一社会党初代委員長。晩年は教条的と言われた',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 1, org: 1, youth: 0 },
      passive: '毎回すべての派閥の不満を 1 抑える',
      act: { name: '党の統一を説く', desc: '全派閥の不満 −8', cost: { capital: 2 }, cd: 3, uses: 2 } },

    asanuma: { n: 2, name: '浅沼稲次郎', faction: 'chusa', from: 1955, to: 1960,
      note: '「人間機関車」。演説で党を運んできた男',
      fit: { chair: 4, secgen: 5, policy: 1, diet: 3, org: 2, youth: 1 },
      passive: '毎回、未組織勤労者と新中間層の傾向が少し上がる',
      act: { name: '街頭に立つ', desc: '未組織・新中間層 +3、政治資源 +2', cost: {}, cd: 2, uses: 4 } },

    sasaki: { n: 3, name: '佐々木更三', faction: 'chusa', from: 1955, to: 1980,
      note: '鈴木の腹心。構造改革論に真っ向から反対した',
      fit: { chair: 4, secgen: 3, policy: 2, diet: 2, org: 5, youth: 2 },
      passive: '毎回、中間左派の代議員が 3 増える',
      act: { name: '地方オルグ', desc: '無派閥代議員 +25', cost: { budget: 3 }, cd: 3, uses: 3 } },

    katsumata: { n: 4, name: '勝間田清一', faction: 'chusa', from: 1955, to: 1985,
      note: '政策通。旧和田派の系譜',
      fit: { chair: 3, secgen: 2, policy: 5, diet: 2, org: 2, youth: 1 },
      passive: '毎回、政治資源 +1',
      act: { name: '政策文書をまとめる', desc: '政治資源 +4', cost: {}, cd: 3, uses: 3 } },

    narita: { n: 5, name: '成田知巳', faction: 'chusa', from: 1955, to: 1979,
      note: '党務型。のちに長く委員長を務める',
      fit: { chair: 3, secgen: 5, policy: 3, diet: 2, org: 4, youth: 1 },
      passive: '毎回、資金 +1',
      act: { name: '党務を締める', desc: '資金 +4、協会の掌握度 −3', cost: { capital: 1 }, cd: 3, uses: 3 } },

    eda: { n: 6, name: '江田三郎', faction: 'chuu', from: 1955, to: 1977,
      note: '構造改革論。のちに離党して社民連へ',
      fit: { chair: 4, secgen: 4, policy: 5, diet: 3, org: 3, youth: 3 },
      passive: '毎回、中間右派の不満 −2、左派の不満 +1',
      act: { name: '構造改革を説く', desc: '新中間層 +5、路線 +0.5、左派 +12', cost: { capital: 2 }, cd: 3, uses: 3 } },

    kawakami: { n: 7, name: '河上丈太郎', faction: 'chuu', from: 1955, to: 1965,
      note: '右派の長老。「十字架委員長」',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 3, org: 1, youth: 0 },
      passive: '毎回、右派と中間右派の不満を 1 抑える',
      act: { name: '両派の仲を取り持つ', desc: '右派と左派の不満 −12', cost: { capital: 3 }, cd: 4, uses: 2 } },

    wada: { n: 8, name: '和田博雄', faction: 'chuu', from: 1955, to: 1967,
      note: '元農相。官僚出身の政策家',
      fit: { chair: 2, secgen: 3, policy: 5, diet: 4, org: 3, youth: 1 },
      passive: '毎回、政治資源 +1（二回に一回）',
      act: { name: '政策協議に応じる', desc: '政治資源 +3、自民 +8、総評 −4', cost: {}, cd: 3, uses: 3 } },

    nishio: { n: 9, name: '西尾末広', faction: 'uha', from: 1955, to: 1981,
      note: '民主社会主義。党を割って出て行くことになる男',
      fit: { chair: 4, secgen: 3, policy: 3, diet: 5, org: 2, youth: 0 },
      passive: '毎回、右派の不満 −4、左派の不満 +2',
      act: { name: '民主社会主義を掲げる', desc: '路線 +1、右派 −20、左派 +18', cost: { capital: 2 }, cd: 9, uses: 1 } },

    sone: { n: 10, name: '曽禰益', faction: 'uha', from: 1955, to: 1980,
      note: '西尾派。外交・安保の実務家',
      fit: { chair: 1, secgen: 2, policy: 4, diet: 4, org: 1, youth: 0 },
      passive: '毎回、右派の不満 −2',
      act: { name: '安保の修正案を作る', desc: '政治資源 +4、総評 −6', cost: {}, cd: 3, uses: 3 } },

    sakisaka: { n: 11, name: '向坂逸郎', faction: 'saha', from: 1955, to: 1985,
      note: '社会主義協会の理論的支柱。党の役職者ではないが、事実上の指導者',
      fit: { chair: 1, secgen: 1, policy: 3, diet: 0, org: 4, youth: 5 },
      passive: '毎回、協会の掌握度 +2、左派の不満 −3',
      act: { name: '労働者教育を組織する', desc: '官公労 +4、掌握度 +6', cost: { budget: 2 }, cd: 3, uses: 3 } },

    // ── 一九七〇年代の世代 ────────────────────────────────────
    ishibashi: { n: 12, name: '石橋政嗣', faction: 'chusa', from: 1970, to: 1993,
      note: '「非武装中立論」の理論家。成田のもとで書記長を務める',
      fit: { chair: 4, secgen: 5, policy: 5, diet: 4, org: 2, youth: 1 },
      passive: '毎回、新中間層の傾向が少し上がる',
      act: { name: '非武装中立を説く', desc: '新中間層 +4、左派 −6', cost: { capital: 2 }, cd: 3, uses: 3 } },

    asukata: { n: 13, name: '飛鳥田一雄', faction: 'chusa', from: 1963, to: 1990,
      note: '横浜市長。全国革新市長会長。市長のまま党委員長になる唯一の男',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 2, org: 4, youth: 2 },
      passive: '毎回、資金 +1、無派閥の代議員 +2',
      act: { name: '全国革新市長会を動かす', desc: '資金 +5、無派閥代議員 +30', cost: {}, cd: 4, uses: 2 } },

    doi: { n: 14, name: '土井たか子', faction: 'chusa', from: 1969, to: 1993,
      note: '憲法学者。一九六九年初当選。のちに「やるっきゃない」と言う',
      fit: { chair: 3, secgen: 2, policy: 4, diet: 3, org: 2, youth: 3 },
      passive: '毎回、未組織勤労者の傾向が少し上がる',
      act: { name: '生活課題で押す', desc: '未組織・新中間層 +3、政治資源 +2', cost: {}, cd: 2, uses: 4 } },

    takazawa: { n: 15, name: '高沢寅男', faction: 'saha', from: 1969, to: 1993,
      note: '社会主義協会の代表的議員。向坂の理論を党内で実務に落とす',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 2, org: 5, youth: 4 },
      passive: '毎回、協会の掌握度 +2',
      act: { name: '協会の組織力を回す', desc: '官公労 +4、掌握度 +5', cost: { budget: 2 }, cd: 3, uses: 3 } },

    tahideo: { n: 16, name: '田英夫', faction: 'chuu', from: 1971, to: 1977,
      note: '元ニュースキャスター。ベトナム報道で降板し、参院へ。のち社民連',
      fit: { chair: 2, secgen: 2, policy: 4, diet: 4, org: 1, youth: 2 },
      passive: '毎回、政治資源 +1',
      act: { name: 'テレビで語る', desc: '新中間層 +5。浮動票に直接届く', cost: { capital: 2 }, cd: 3, uses: 2 } },

    // ── 一九八〇年代の世代 ────────────────────────────────────
    tanabe: { n: 17, name: '田辺誠', faction: 'chusa', from: 1970, to: 1993,
      note: '全逓出身。労組との交渉役。土井のあと委員長を継ぐ',
      fit: { chair: 4, secgen: 4, policy: 2, diet: 4, org: 4, youth: 1 },
      passive: '毎回、総評との関係 +2',
      act: { name: '労組と手を打つ', desc: '資金 +6、総評 +10', cost: {}, cd: 3, uses: 3 } },

    yamaguchi: { n: 18, name: '山口鶴男', faction: 'chusa', from: 1969, to: 1993,
      note: '党務型の書記長。組織と選挙の実務を回す',
      fit: { chair: 2, secgen: 5, policy: 3, diet: 3, org: 4, youth: 1 },
      passive: '毎回、無派閥の代議員 +2',
      act: { name: '選挙態勢を締める', desc: '政治資源 +3、無派閥代議員 +20', cost: { budget: 2 }, cd: 3, uses: 3 } },

    ueda: { n: 19, name: '上田哲', faction: 'saha', from: 1968, to: 1993,
      note: '元NHK記者。協会寄りだが、話し方は都市向けである',
      fit: { chair: 3, secgen: 2, policy: 4, diet: 3, org: 2, youth: 4 },
      passive: '毎回、新中間層の傾向が少し上がる',
      act: { name: '街頭とテレビで押す', desc: '未組織・新中間層 +4', cost: { capital: 2 }, cd: 2, uses: 3 } },

    murayama: { n: 20, name: '村山富市', faction: 'chusa', from: 1972, to: 1993,
      note: '大分の自治労出身。目立たない。だが最後に首相になる',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 4, org: 3, youth: 1 },
      passive: '毎回、中間左派の不満を 1 抑える',
      act: { name: '党内を取りまとめる', desc: '全派閥の不満 −6', cost: { capital: 2 }, cd: 3, uses: 3 } },
    //  ── 中間右派の後継（監査で 1978年以降ゼロだった） ──────────
    //  江田三郎（〜1977）と田英夫（〜1977）が抜けたあと、中間右派に
    //  据えられる人物が一人もいなくなっていた。mood_chuu は生きていて
    //  社民連の分裂も起こりうるのに、人事でなだめる手が無かった。
    itoshige: { n: 21, name: '伊藤茂', faction: 'chuu', from: 1972, to: 1993,
      note: '江田派の現実路線を継いだ。政審会長・国対委員長。のち運輸大臣',
      fit: { chair: 3, secgen: 4, policy: 5, diet: 5, org: 2, youth: 1 },
      passive: '毎回、政治資源 +1',
      act: { name: '与野党の調整に入る', desc: '政治資源 +5、公明 +8、自民 +6', cost: {}, cd: 3, uses: 3 } },
    yamahana: { n: 22, name: '山花貞夫', faction: 'chuu', from: 1976, to: 1993,
      note: '弁護士出身。ニューウェーブの旗。一九九三年に委員長',
      fit: { chair: 4, secgen: 3, policy: 4, diet: 3, org: 3, youth: 4 },
      passive: '毎回、新中間層の傾向が少し上がる',
      act: { name: '政治改革を掲げる', desc: '新中間層・未組織 +5、公明 +10。左派 +10', cost: { capital: 2 }, cd: 3, uses: 3 } },
    kubo: { n: 23, name: '久保亘', faction: 'chuu', from: 1974, to: 1993,
      note: '鹿児島の教組出身だが党務では現実派。書記長。のち副総理・大蔵大臣',
      fit: { chair: 3, secgen: 5, policy: 4, diet: 4, org: 4, youth: 1 },
      passive: '毎回、資金 +1',
      act: { name: '党財政を締め直す', desc: '資金 +8、未払いを帳消し。左派 +6', cost: { capital: 2 }, cd: 4, uses: 2 } },
    uehara: { n: 24, name: '上原康助', faction: 'chusa', from: 1970, to: 1993,
      note: '沖縄。全軍労委員長から。基地問題を党の課題にし続けた',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 4, org: 4, youth: 2 },
      passive: '毎回、官公労の傾向が少し上がる',
      act: { name: '基地問題で押す', desc: '官公労 +4、未組織 +3、自民 −10', cost: { capital: 2 }, cd: 3, uses: 3 } },
    //  ── 鈴木茂三郎の世代（統一社会党の創立期） ──────────────
    //  第Ⅰ幕を一九五八年起点にしたので、この世代の人数を厚くした。
    //  多くは一九六〇年代のうちに退場する。誰を使い切るかが第Ⅰ〜Ⅱ幕の問題になる。
    matsumoto: { n: 25, name: '松本治一郎', faction: 'saha', from: 1955, to: 1966,
      note: '部落解放同盟委員長。参院副議長。「部落解放の父」と呼ばれた',
      fit: { chair: 3, secgen: 2, policy: 2, diet: 4, org: 5, youth: 2 },
      passive: '毎回、未組織層の傾向が少し上がる',
      act: { name: '解放同盟を動かす', desc: '未組織 +5、無派閥代議員 +15', cost: {}, cd: 3, uses: 3 } },
    kato: { n: 26, name: '加藤勘十', faction: 'saha', from: 1955, to: 1965,
      note: '労働運動の長老。片山内閣の労働大臣 ── この党が出した最初の閣僚のひとり',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 3, org: 5, youth: 1 },
      passive: '毎回、総評との関係 +2',
      act: { name: '長老として仲裁する', desc: '総評 +14、官公労 +3、全派閥の不満 −5', cost: {}, cd: 4, uses: 2 } },
    kuroda: { n: 27, name: '黒田寿男', faction: 'saha', from: 1955, to: 1969,
      note: '農民運動から。日中友好の窓口を長く務めた',
      fit: { chair: 2, secgen: 2, policy: 3, diet: 4, org: 3, youth: 1 },
      passive: '毎回、農村の傾向が少し上がる',
      act: { name: '日中の窓口を回す', desc: '共産 +12、自営商工 +3、農村 +2', cost: { capital: 2 }, cd: 3, uses: 3 } },
    okada: { n: 28, name: '岡田春夫', faction: 'chusa', from: 1955, to: 1990,
      note: '国会論戦の名手。政府を追い詰める資料を出すので「爆弾男」と呼ばれた',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 5, org: 2, youth: 2 },
      passive: '毎回、政治資源 +1',
      act: { name: '国会で爆弾を投げる', desc: '自民 −16、政治資源 +6、新中間層 +3', cost: {}, cd: 3, uses: 3 } },
    yamahana_h: { n: 29, name: '山花秀雄', faction: 'chusa', from: 1955, to: 1972,
      note: '労働運動出身の書記長。党務を回す人。山花貞夫の父',
      fit: { chair: 2, secgen: 5, policy: 2, diet: 3, org: 4, youth: 2 },
      passive: '毎回、労組系の代議員 +2',
      act: { name: '党務を締める', desc: '労組系代議員 +25、総評 +8', cost: { capital: 2 }, cd: 3, uses: 3 } },
    miyake: { n: 30, name: '三宅正一', faction: 'chusa', from: 1955, to: 1980,
      note: '農民運動の長老。衆院副議長。農村に党の足場を作った数少ない人',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 4, org: 4, youth: 1 },
      passive: '毎回、農村の傾向が少し上がる',
      act: { name: '農民組合を回す', desc: '農村 +5、無派閥代議員 +12', cost: { budget: 2 }, cd: 3, uses: 3 } },
    togano: { n: 31, name: '戸叶里子', faction: 'chuu', from: 1955, to: 1972,
      note: '外交と婦人問題。女性議員が数えるほどしかいない時代の一人',
      fit: { chair: 2, secgen: 2, policy: 4, diet: 4, org: 2, youth: 4 },
      passive: '毎回、新中間層の傾向が少し上がる',
      act: { name: '婦人と外交で語る', desc: '新中間層 +5、未組織 +3', cost: { capital: 2 }, cd: 3, uses: 3 } },
    kono: { n: 32, name: '河野密', faction: 'chuu', from: 1955, to: 1970,
      note: '政策審議会長。統一前の右派社会党で綱領を書いた',
      fit: { chair: 3, secgen: 3, policy: 5, diet: 3, org: 2, youth: 1 },
      passive: '毎回、政治資源 +1',
      act: { name: '綱領の草案を書く', desc: '路線 +0.5、新中間層 +4。左派 +12', cost: { capital: 2 }, cd: 4, uses: 2 } }
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

  // ── 受動効果。endturn ごとに呼ぶ ────────────────────────────
  function passives(Q) {
    var seen = {};
    POSTS.forEach(function (post) {
      var id = Q['post_' + post];
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
      Q['name_' + post] = f ? f.name : '（空席）';
      Q['fac_' + post] = f ? J.FNAME[f.faction] : '';
      Q['line_' + post] = f
        ? f.name + ' <span style="opacity:.65;font-size:.9em">' + J.FNAME[f.faction] + '</span>'
        : '（空席）';
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
             '・適性' + f.fit[post] + '</span>';
    }).join('<br>');
  }

  J.LEADERS = {
    FIG: FIG, BY_N: BY_N, POSTS: POSTS, POST_NAME: POST_NAME, AFFINITY: AFFINITY,
    elect: elect, appoint: appoint, nominate: nominate, support: support, passives: passives,
    canAct: canAct, doAct: doAct, tick: tickCooldowns,
    sync: syncIds, roster: roster, candidates: candidates, candidateLines: candidateLines,
    gone: gone
  };
}());
