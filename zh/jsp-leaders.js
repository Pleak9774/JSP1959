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
      note: '党内的左派元老，社会党再统一后的首任委员长。在党内、市民运动和工会中很有威望。',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 1, org: 1, youth: 0 },
      passive: '每回合全派阀不满-1',
      act: { name: '重申党的统一', desc: '各派的不满 −8', cost: { capital: 2 }, cd: 3, uses: 2 } },

    asanuma: { n: 2, name: '浅沼稻次郎', faction: 'chusa', from: 1955, to: 1960,
      note: '人称"人肉火车头"。以演讲而闻名的老资历社会主义者。性格温和。',
      fit: { chair: 4, secgen: 5, policy: 1, diet: 3, org: 2, youth: 1 },
      passive: '每回合增长新中间层和未组织层的支持倾向',
      act: { name: '去街头演讲', desc: '未组织与新中间层支持度 +3、政治资源 +2', cost: {}, cd: 2, uses: 4 } },

    sasaki: { n: 3, name: '佐佐木更三', faction: 'chusa', from: 1955, to: 1980,
      note: '铃木的心腹和接班人，继承了铃木在党内的威望，主张温和的劳农派路线。',
      fit: { chair: 4, secgen: 3, policy: 2, diet: 2, org: 5, youth: 2 },
      passive: '每回合中间左派的代议员增加3',
      act: { name: '去地方组织活动家', desc: '无派阀代议员 +25', cost: { budget: 3 }, cd: 3, uses: 3 } },

    katsumata: { n: 4, name: '胜间田清一', faction: 'chusa', from: 1955, to: 1985,
      note: '旧和田派大将，在党内是左翼务实派，在党务、政策上有丰富的经验。',
      fit: { chair: 3, secgen: 2, policy: 5, diet: 2, org: 2, youth: 1 },
      passive: '每回合政治资源 +1',
      act: { name: '整理并提出政策文件', desc: '政治资源 +4', cost: {}, cd: 3, uses: 3 } },

    narita: { n: 5, name: '成田知巳', faction: 'chusa', from: 1955, to: 1979,
      note: '原为江田派成员，后在江田派和协会派中倾向左派，主张调和态度。',
      fit: { chair: 3, secgen: 5, policy: 3, diet: 2, org: 4, youth: 1 },
      passive: '每回合政党资金 +1',
      act: { name: '重申党的纪律', desc: '资金 +4、协会的掌握度 −3', cost: { capital: 1 }, cd: 3, uses: 3 } },

    eda: { n: 6, name: '江田三郎', faction: 'chuu', from: 1955, to: 1977,
      note: '原为铃木派成员，后针对党的问题主张进行结构改革，坚持议会民主务实路线，在党内的知识分子、务实派中很有影响力。',
      fit: { chair: 4, secgen: 4, policy: 5, diet: 3, org: 3, youth: 3 },
      passive: '每回合中间右派的不满 −2、左派的不满 +1',
      act: { name: '宣讲改革路线', desc: '新中间层支持度 +5、路线 +0.5、左派 +12', cost: { capital: 2 }, cd: 3, uses: 3 } },

    kawakami: { n: 7, name: '河上丈太郎', faction: 'chuu', from: 1955, to: 1965,
      note: '右派的元老。右派社会党原委员长，人称"十字架委员长"，性格温和，积极在左右派之间进行斡旋调解。',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 3, org: 1, youth: 0 },
      passive: '每回合右派和中间右派的不满各减少1',
      act: { name: '在两派中间说合', desc: '右派和左派的不满 −12', cost: { capital: 3 }, cd: 4, uses: 2 } },

    wada: { n: 8, name: '和田博雄', faction: 'chuu', from: 1955, to: 1967,
      note: '曾在第一次吉田内阁中任农相、在片山内阁中出任经济安定本部长官。原为革新官僚，后加入社会党，为官僚出身的政策家',
      fit: { chair: 2, secgen: 3, policy: 5, diet: 4, org: 3, youth: 1 },
      passive: '每两回合政治资源 +1',
      act: { name: '商讨政策协议', desc: '政治资源 +3、自民 +8、总评 −4', cost: {}, cd: 3, uses: 3 } },

    nishio: { n: 9, name: '西尾末广', faction: 'uha', from: 1955, to: 1981,
      note: '战前工人运动的旗手之一，主张稳健与劳资协调路线。战后曾任片山内阁的官房长官，后加入右派社会党，在党内和左派就路线问题有过多次争论。',
      fit: { chair: 4, secgen: 3, policy: 3, diet: 5, org: 2, youth: 0 },
      passive: '每回合右派的不满 −4、左派的不满 +2',
      act: { name: '提倡民主社会主义', desc: '路线 +1、右派 −20、左派 +18', cost: { capital: 2 }, cd: 9, uses: 1 } },

    sone: { n: 10, name: '曾祢益', faction: 'uha', from: 1955, to: 1980,
      note: '外务省官僚出身，社会党右派及西尾派骨干。长期负责外交与安保政策，主张务实的现实主义路线。',
      fit: { chair: 1, secgen: 2, policy: 4, diet: 4, org: 1, youth: 0 },
      passive: '每回合右派的不满 −2',
      act: { name: '提出安保修正案', desc: '政治资源 +4、总评 −6', cost: {}, cd: 3, uses: 3 } },

    sakisaka: { n: 11, name: '向坂逸郎', faction: 'saha', from: 1955, to: 1985,
      note: '马克思主义学者，劳农派代表人物与社会主义协会理论领袖。虽未担任正式党职，但长期指导基层工会干部与青年党员，对党内左派路线影响极深。',
      fit: { chair: 1, secgen: 1, policy: 3, diet: 0, org: 4, youth: 5 },
      passive: '每回合协会的掌握度 +2、左派的不满 −3',
      act: { name: '组织青年劳动者', desc: '官公劳 +4、掌握度 +6', cost: { budget: 2 }, cd: 3, uses: 3 } },

    // ── 一九七〇年代の世代 ────────────────────────────────────
    ishibashi: { n: 12, name: '石桥政嗣', faction: 'chusa', from: 1970, to: 1993,
      note: '全驻劳出身，社会党中左派代表人物与《非武装中立论》的理论奠基者。历任党书记长与委员长，长期致力于将非武装中立政策系统化与现实化。',
      fit: { chair: 4, secgen: 5, policy: 5, diet: 4, org: 2, youth: 1 },
      passive: '每回合增长新中间层的支持倾向',
      act: { name: '宣讲非武装中立原则', desc: '新中间层支持度 +4、左派 −6', cost: { capital: 2 }, cd: 3, uses: 3 } },

    asukata: { n: 13, name: '飞鸟田一雄', faction: 'chusa', from: 1963, to: 1990,
      note: '曾任横滨市长与全国革新市长会会长，革新自治体运动的标志人物。提倡扩大党员数量和党制改革。',
      fit: { chair: 5, secgen: 2, policy: 2, diet: 2, org: 4, youth: 2 },
      passive: '每回合政党资金 +1、无派阀的代议员 +2',
      act: { name: '动员全国革新市长会', desc: '资金 +5、无派阀代议员 +30', cost: {}, cd: 4, uses: 2 } },

    doi: { n: 14, name: '土井多贺子', faction: 'chusa', from: 1969, to: 1993,
      note: '宪法学者出身，1969年首次当选众议员。深耕市民生活与护宪议题，主张推动政策现代化和社会福利改革。',
      fit: { chair: 3, secgen: 2, policy: 4, diet: 3, org: 2, youth: 3 },
      passive: '每回合增长未组织劳动者的支持倾向',
      act: { name: '宣讲福利政策', desc: '未组织与新中间层支持度 +3、政治资源 +2', cost: {}, cd: 2, uses: 4 } },

    takazawa: { n: 15, name: '高泽寅男', faction: 'saha', from: 1969, to: 1993,
      note: '社会主义协会派系在国会内的骨干议员，长期主管党务与基层组织协调，是将向坂逸郎理论转化为党内实际组织影响力的核心操盘手。',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 2, org: 5, youth: 4 },
      passive: '每回合协会的掌握度 +2',
      act: { name: '动员协会组织', desc: '官公劳 +4、协会掌握度 +5', cost: { budget: 2 }, cd: 3, uses: 3 } },

    tahideo: { n: 16, name: '田英夫', faction: 'chuu', from: 1971, to: 1977,
      note: '新闻记者与TBS知名主播出身，因越南战争前线报道辞职后转入政界，在参院选举中高票当选。持温和改革立场，以大众传播和舆论引导见长',
      fit: { chair: 2, secgen: 2, policy: 4, diet: 4, org: 1, youth: 2 },
      passive: '每回合政治资源 +1',
      act: { name: '在电视上宣传党的政策', desc: '新中间层支持度 +5。', cost: { capital: 2 }, cd: 3, uses: 2 } },

    // ── 一九八〇年代の世代 ────────────────────────────────────
    tanabe: { n: 17, name: '田边诚', faction: 'chusa', from: 1970, to: 1993,
      note: '全递出身，社会党内中道实务派领袖。长期负责国会对策与总评劳工统筹，善于跨党派协调与朝野协商。',
      fit: { chair: 4, secgen: 4, policy: 2, diet: 4, org: 4, youth: 1 },
      passive: '每回合跟总评的关系 +2',
      act: { name: '同工会进行协调', desc: '资金 +6、总评 +10', cost: {}, cd: 3, uses: 3 } },

    yamaguchi: { n: 18, name: '山口鹤男', faction: 'chusa', from: 1969, to: 1993,
      note: '群马县职劳出身的党务型官僚，长期担任党书记长。精通选举统筹、组织联络与议事程序',
      fit: { chair: 2, secgen: 5, policy: 3, diet: 3, org: 4, youth: 1 },
      passive: '每回合无派阀的代议员 +2',
      act: { name: '进行选举布局', desc: '政治资源 +3、无派阀代议员 +20', cost: { budget: 2 }, cd: 3, uses: 3 } },

    ueda: { n: 19, name: '上田哲', faction: 'saha', from: 1968, to: 1993,
      note: 'NHK工会领袖与记者出身，政治光谱偏向协会左派。擅长街头演说与大众传媒公关，是党内左派中罕见具备强大都市浮动选民动员力的议员',
      fit: { chair: 3, secgen: 2, policy: 4, diet: 3, org: 2, youth: 4 },
      passive: '每回合增长新中间层的支持倾向',
      act: { name: '全面推进宣传策略', desc: '未组织与新中间层支持度 +4', cost: { capital: 2 }, cd: 2, uses: 3 } },

    murayama: { n: 20, name: '村山富市', faction: 'chusa', from: 1972, to: 1993,
      note: '自治劳出身，大分县地方议员起步。作风温和务实，善于调和党内派阀矛盾与朝野纠纷',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 4, org: 3, youth: 1 },
      passive: '每回合减少中间左派的不满1',
      act: { name: '在党内进行调和', desc: '各派的不满 −6', cost: { capital: 2 }, cd: 3, uses: 3 } },
    //  ── 中間右派の後継（監査で 1978年以降ゼロだった） ──────────
    //  江田三郎（〜1977）と田英夫（〜1977）が抜けたあと、中間右派に
    //  据えられる人物が一人もいなくなっていた。mood_chuu は生きていて
    //  社民連の分裂も起こりうるのに、人事でなだめる手が無かった。
    itoshige: { n: 21, name: '伊藤茂', faction: 'chuu', from: 1972, to: 1993,
      note: '继承江田三郎结构改革路线的中间右派代表人物。历任政策审议会长与国对委员长，长于政策立案与跨党派沟通',
      fit: { chair: 3, secgen: 4, policy: 5, diet: 5, org: 2, youth: 1 },
      passive: '每回合政治资源 +1',
      act: { name: '在朝野两方进行联络', desc: '政治资源 +5、公明 +8、自民 +6', cost: {}, cd: 3, uses: 3 } },
    yamahana: { n: 22, name: '山花贞夫', faction: 'chuu', from: 1976, to: 1993,
      note: '律师出身，党内中间右派“新浪潮”代表人物。致力于推动选举制度改革与现实路线转型。',
      fit: { chair: 4, secgen: 3, policy: 4, diet: 3, org: 3, youth: 4 },
      passive: '每回合增长新中间层的支持倾向',
      act: { name: '宣传政治改革', desc: '新中间层与未组织支持度 +5、公明 +10。左派 +10', cost: { capital: 2 }, cd: 3, uses: 3 } },
    kubo: { n: 23, name: '久保亘', faction: 'chuu', from: 1974, to: 1993,
      note: '鹿儿岛教组出身的中间右派实务家，深谙政策与党务财政重整。力促社会党向现实主义路线转型',
      fit: { chair: 3, secgen: 5, policy: 4, diet: 4, org: 4, youth: 1 },
      passive: '每回合政党资金 +1',
      act: { name: '整理党的财政', desc: '资金 +8、欠账一笔勾销。左派 +6', cost: { capital: 2 }, cd: 4, uses: 2 } },
    uehara: { n: 24, name: '上原康助', faction: 'chusa', from: 1970, to: 1993,
      note: '冲绳全军劳委员长出身，冲绳回归前后革新阵营的关键领袖。长期在国会围绕美军基地、驻军法案及冲绳自治问题展开斗争',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 4, org: 4, youth: 2 },
      passive: '每回合增加官公劳的支持倾向',
      act: { name: '推动解决基地问题', desc: '官公劳 +4、未组织 +3、自民 −10', cost: { capital: 2 }, cd: 3, uses: 3 } },
    //  ── 鈴木茂三郎の世代（統一社会党の創立期） ──────────────
    //  第Ⅰ幕を一九五八年起点にしたので、この世代の人数を厚くした。
    //  多くは一九六〇年代のうちに退場する。誰を使い切るかが第Ⅰ〜Ⅱ幕の問題になる。
    matsumoto: { n: 25, name: '松本治一郎', faction: 'saha', from: 1955, to: 1966,
      note: '部落解放运动领导人，部落解放同盟执行委员长，被尊为“部落解放之父”。曾任参议院副议长，是党内兼具深厚大众动员力与权威的左派元老。',
      fit: { chair: 3, secgen: 2, policy: 2, diet: 4, org: 5, youth: 2 },
      passive: '每回合增加未组织层的支持倾向',
      act: { name: '调动部落解放同盟', desc: '未组织 +5、无派阀代议员 +15', cost: {}, cd: 3, uses: 3 } },
    kato: { n: 26, name: '加藤勘十', faction: 'saha', from: 1955, to: 1965,
      note: '战前劳工与无产政党运动元老，战后曾任片山内阁劳动大臣。作为左派社会党的核心长老，在党内各派及工会势力间享有极高的威望与调停力',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 3, org: 5, youth: 1 },
      passive: '每回合跟总评的关系 +2',
      act: { name: '以元老的身份进行调停', desc: '总评 +14、官公劳 +3、各派的不满 −5', cost: {}, cd: 4, uses: 2 } },
    kuroda: { n: 27, name: '黑田寿男', faction: 'saha', from: 1955, to: 1969,
      note: '战前日本农民组合骨干，长期深耕农民运动。战后积极推动中日民间交流与中日邦交正常化，是党内最坚定的亲华派与正统革新左派之一',
      fit: { chair: 2, secgen: 2, policy: 3, diet: 4, org: 3, youth: 1 },
      passive: '每回合增加农村的支持倾向',
      act: { name: '推动日中交流', desc: '共产 +12、自营工商 +3、农村 +2', cost: { capital: 2 }, cd: 3, uses: 3 } },
    okada: { n: 28, name: '冈田春夫', faction: 'chusa', from: 1955, to: 1990,
      note: '战后革新阵营著名的论战家。因多次在国会曝光自卫队机密文件、质询风格犀利逼退内阁而得名“炸弹男”，后曾任众议院副议长。',
      fit: { chair: 2, secgen: 3, policy: 3, diet: 5, org: 2, youth: 2 },
      passive: '每回合政治资源 +1',
      act: { name: '在国会上“扔炸弹”', desc: '自民 −16、政治资源 +6、新中间层 +3', cost: {}, cd: 3, uses: 3 } },
    yamahana_h: { n: 29, name: '山花秀雄', faction: 'chusa', from: 1955, to: 1972,
      note: '战前工运出身，长期负责党务组织与工会联络。曾任左派社会党书记长及统合后的副委员长',
      fit: { chair: 2, secgen: 5, policy: 2, diet: 3, org: 4, youth: 2 },
      passive: '每回合增加工会系的代议员2',
      act: { name: '争取工会支持', desc: '工会一系代议员 +25、总评 +8', cost: { capital: 2 }, cd: 3, uses: 3 } },
    miyake: { n: 30, name: '三宅正一', faction: 'chusa', from: 1955, to: 1980,
      note: '日本农民组合创始人之一，长期致力于在农村地区开拓社会党基本盘。曾任众议院副议长，是党内兼具农村号召力与资历的元老',
      fit: { chair: 3, secgen: 3, policy: 3, diet: 4, org: 4, youth: 1 },
      passive: '每回合增加农村的支持倾向',
      act: { name: '调动农民组合', desc: '农村 +5、无派阀代议员 +12', cost: { budget: 2 }, cd: 3, uses: 3 } },
    togano: { n: 31, name: '户叶里子', faction: 'chuu', from: 1955, to: 1972,
      note: '战后首批当选众议员的女性政治家，连续当选十一届。长期致力于战后民间外交、裁军和平及妇女儿童权益保障等议题',
      fit: { chair: 2, secgen: 2, policy: 4, diet: 4, org: 2, youth: 4 },
      passive: '每回合增长新中间层的支持倾向',
      act: { name: '宣讲外交政策和妇女权益', desc: '新中间层 +5、未组织 +3', cost: { capital: 2 }, cd: 3, uses: 3 } },
    kono: { n: 32, name: '河野密', faction: 'chuu', from: 1955, to: 1970,
      note: '无产政党时期的理论家，社会党右派的核心智囊。曾任政策审议会长，在1955年左右社会党统合前主笔起草了右派社会党的基本纲领',
      fit: { chair: 3, secgen: 3, policy: 5, diet: 3, org: 2, youth: 1 },
      passive: '每回合政治资源 +1',
      act: { name: '提出纲领草案', desc: '路线 +0.5、新中间层 +4。左派 +12', cost: { capital: 2 }, cd: 4, uses: 2 } }
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
