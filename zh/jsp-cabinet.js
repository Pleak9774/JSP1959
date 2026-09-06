/*  jsp-cabinet.js ──────────────────────────────────────────────
 *  内閣。幕の付属物ではなく機構である。
 *
 *  第Ⅰ幕で非自民の過半を作れば、一九六〇年に組閣できる。史実で一九九三年
 *  まで起きなかったのは自民党が割れなかったからであって、規則の側で
 *  年を止めているわけではない。cabinetCheck は総選挙のたびに走る。
 *
 *  四枚のカード：
 *    組閣       時間を食わない。持ち点の範囲で省を取る
 *    人選       取った省に人を入れる（党指導部の人事と同じ作り）
 *    内閣改造   手札。持ち点を戻して取り直す（時間を食う）
 *    内部関係   時間を食わない。与党内の関係が線を割ると割り込む
 *
 *  閣僚の行動は「省」が決め、「人」が倍率を決める。二十人×十二省を
 *  個別に書くのは維持できないので、省を主語にした。
 * ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var J = window.JSP;

  //  省。w は格（組閣の持ち点を食う量）。史実の序列におおむね沿わせてある。
  //  scope: 'party' は党の資源を動かし、'state' は国の側を動かす。
  var MIN = {
    souri:    { name: '内阁总理大臣', w: 5, fit: 'chair',  scope: 'state',
                note: '政府首脑。仅在单独执政或主导执政联盟时方可出任',
                intro: '日本政府首脑与内阁最高负责人。战后日本社会党仅产生过两位首相：1947年的片山哲与1994年的村山富市，两次均为多党联合政权且维持不足一年。\n\n出任首相意味着社会党必须在所有内阁决议与政府政策上承担最终连带责任，同时面临执政现实与长期在野纲领之间的妥协与考验。',
                taken: '社会党成员就任内阁总理大臣，正式成为执政核心。但作为多党联合政权的领袖，必须在党内路线与维系政权稳定之间寻求平衡。',
                acted: '在国会发表施政方针演说，正式推进内阁施政纲领。面对自民党等原执政势力的严厉质询，在野时期的主张被迫接受执政立场的全面检验' },
    kanbo:    { name: '内阁官房长官', w: 3, fit: 'secgen', scope: 'party',
                note: '内阁枢纽与政府发言人，掌管日常政务与联盟协调',
                intro: '首相的核心幕僚与内阁综合协调长官，每日两次代表政府举行例行记者会发布政见。\n\n其主要职责包括把控内阁日常议程、协调执政联盟内各党派矛盾以及统领各省厅官僚机构，是维系联合政权运转的最关键枢纽',
                taken: '掌握内阁官房长官一职，接管了内阁会议运作、公文审查与政权对外的官方发声渠道，全面主导日常政务协调',
                acted: '全面展开执政各党间的议程协调与危机公关，统一步调并平息人事与政策分歧，维持了联合政权的正常运转' },
    okura:    { name: '大藏大臣',     w: 4, fit: 'policy', scope: 'state',
                note: '掌管国家财政与预算编制权，统领中央金库',
                intro: '负责国家预算编制与财税政策的最高长官。从每年夏季的概算要求到年底的大臣折冲，中央财政资源的分配均由此裁定。\n\n社会党长期主张扩大福利与公共支出，出任大藏大臣则意味着必须在财政收支平衡与落实党内施政主张之间做出权衡',
                taken: '掌握大藏大臣一职，直接接管国家金库与预算编制权，承担起国家财政赤字与收支统筹的直接责任',
                acted: '主持完成国家预算的重新审定与编制，在削减部分传统既得利益支出的同时，承担起分配紧缩所带来的政治游说压力' },
    gaimu:    { name: '外务大臣',     w: 4, fit: 'diet',   scope: 'state',
                note: '掌管外交与安全保障政策，直接检验党的中立路线',
                intro: '统辖国家对外关系、防务条约与多边谈判的阁僚职位。\n\n社会党长期坚持“非武装中立”与反对日美安保条约，出任外务大臣直接将党纲置于同盟关系、国际地缘现实及外务省传统建制派的严峻考验之下',
                taken: '掌握外务大臣一职，社会党开始直接处理日美同盟与国际外交事务，党内理想路线与现实外交需求正面相遇',
                acted: '展开务实外交磋商，在坚持和平主义原则的同时，对既有安保框架做出渐进式调整与现实妥协，推动多边官方交往' },
    tsusan:   { name: '通商产业大臣', w: 3, fit: 'policy', scope: 'state',
                note: '掌管产业结构与贸易政策，直接影响民间工会就业',
                intro: '主导战后日本产业政策与进出口贸易的核心部门，长期依靠“行政指导”推动产业升级与结构调整。\n\n钢铁、造船、煤炭等传统重工业的兴衰与新兴战略产业的扶持，直接决定了民间制造业工会的就业基础与组织规模',
                taken: '掌握通商产业大臣一职，获得参与国家产业规划与行业资源倾斜的主导权，直接影响民间产业工人的就业生态',
                acted: '出台产业扶持与转型指导方案，引导资本与劳动力向新兴产业分流，同时妥善应对传统衰退产业的工人安置与工会重组问题' },
    rodo:     { name: '劳动大臣',     w: 2, fit: 'org',    scope: 'state',
                note: '主管劳动行政与法规执行，直接对接工会组织率',
                intro: '负责劳动基准监督、职业培训、最低工资及工会法执行的行政长官。\n\n对以劳工运动为基本盘的社会党而言，劳动省是通过行政手段规范用工制度、保障劳工结社权并协助未组织职场建立工会的核心阵地',
                taken: '掌握劳动大臣一职，社会党首次将劳动行政权收归麾下，直接对接工会维权与工人劳动保障体系',
                acted: '强化劳动基准监督与行政指导，纠正企业阻挠成立工会的不当惯例，为基层劳工结社与权益保障提供行政支持' },
    kosei:    { name: '厚生大臣',     w: 2, fit: 'policy', scope: 'state',
                note: '掌管医疗、年金与社会保障，面向广大未组织民众',
                intro: '负责医疗保险、公共年金与生活保障的核心民生省厅。\n\n20世纪70年代革新地方自治体率先推行的老人免费医疗等福利政策，多由此省转化为国家制度。该职位出台的政策直接惠及广大家庭与未加入工会的普通劳动者',
                taken: '掌握厚生大臣一职，获得主导国家社会保障政策的权力，直接向非工会群众与基层弱势群体输出政策成果。',
                acted: '扩大医疗与公共年金的覆盖面，下调部分民生负担，提升了低收入群体与未组织阶层的社会安全兜底水平。' },
    kensetsu: { name: '建设大臣',     w: 2, fit: 'org',    scope: 'party',
                note: '主管公共工程与基建，传统自民党利权网络的核心',
                intro: '统辖道路、河川、住宅与都市开发等大规模公共事业预算的部门。\n\n在战后自民党长期执政下，建设省与地方建筑企业、行业团体及后援会紧密绑定，形成成熟的票源与利益输送网络。由非自民势力入主往往带来深远的政商震动。',
                taken: '掌握建设大臣一职，直接介入国家公共事业投资与项目审批，直面自民党经营数十年的地方利益网络',
                acted: '调整公共工程立项与预算分配结构，削减部分争议性基建项目，推动工程招标透明化并整顿行业既得利益' },
    jichi:    { name: '自治大臣',     w: 2, fit: 'org',    scope: 'party',
                note: '统辖地方财政与选举行政，为革新自治体提供制度支持',
                intro: '负责地方交付税分配、地方债发行审批及公职选举法执行的综合省厅。\n\n20世纪六七十年代革新自治体在推行进步政策时，常受到中央财政杠杆的严格限制；掌握该省有助于在中央层面改善地方财政自主权',
                taken: '掌握自治大臣一职，控制地方财政调节工具与选举监管行政，为友好地方自治体建立有利的财政环境。',
                acted: '优化地方交付税计算标准并放宽地方发债限制，缓解地方自治体财政压力，稳步推进地方自主与分权改革' },
    monbu:    { name: '文部大臣',     w: 2, fit: 'youth',  scope: 'state',
                note: '主管教育行政，与社会党支持基盘日教组长期对峙',
                intro: '负责学校教育、学术文化及教科书审定的主管官厅。\n\n战后文部省围绕勤务评定、全国统考及道德教育等议题，与社会党核心支柱日本教职员组合（日教组）长期处于尖锐对立状态，出任该职需在行政中立与工会诉求间寻求平衡',
                taken: '掌握文部大臣一职，社会党正式进驻与支持母体日教组对峙数十年的教育官厅长官席位',
                acted: '放宽对一线教学机构的行政干预与考核指标，推动教育现场自主化，缓解了文部省官僚与教员工会之间的紧张对立' },
    norin:    { name: '农林水产大臣', w: 2, fit: 'diet',   scope: 'state',
                note: '掌管农业补贴与粮食制度，直面自民党农村票仓',
                intro: '主管农业政策、粮食管理制度及农林渔业补贴的行政机构。\n\n战后自民党依托全国农协体系、土地改良资金与大米统购统销政策，牢固垄断了农村选票；社会党长期难以有效渗透，入主该省旨在切入保守阵营的核心阵地。',
                taken: '掌握农林水产大臣一职，首次将手伸入保守阵营根深蒂固的农业保护与补贴分配体系。',
                acted: '调整粮食保护价格与农业补贴结构，加强与各地农协组织的对话机制，尝试在传统保守农村地区建立政策认同。' },
    unyu:     { name: '运输大臣',     w: 2, fit: 'diet',   scope: 'party',
                note: '监管国铁与私铁运输行政，直属社会党官公劳核心盘',
                intro: '负责全国铁路、海运及航空运输监管的主管省厅。\n\n其直辖的日本国有铁道内活跃着国劳、动劳等工会组织，与私铁总联同为总评及社会党的坚实后盾。出任运输大臣兼具行业监管者与工会政治盟友的双重身份。',
                taken: '掌握运输大臣一职，社会党直接接管了对全国铁路及公共交通系统的行政监督权',
                acted: '稳步推进国铁运营与人员编制调整，在保障公共交通运输秩序的同时兼顾劳工权益，平衡改革需求与工会利益' }
  };
  var ORDER = ['souri', 'kanbo', 'okura', 'gaimu', 'tsusan', 'rodo',
               'kosei', 'kensetsu', 'jichi', 'monbu', 'norin', 'unyu'];

  //  組閣の持ち点。連立の中で我々が占める議席比で決まる。
  //  校正：史実の細川内閣で社会党は 70/258 ≒ 27%、閣僚は 6 ポスト
  //  （大半が格2）＝ 12 点。45 × 0.27 = 12。単独過半なら 45 点で全部取れる。
  var POINT_SCALE = 45;

  function share(Q) {
    if (Q.cab_kind === 1) { return 1; }
    //  自社連立。相手は自民党なので、非自民の合計ではなく自民と我々の合計で割る。
    if (Q.cab_kind === 4) {
      var t4 = (Q.seats_hr || 0) + (Q.res_jimin || 0);
      return Math.min(1, (Q.seats_hr || 0) / Math.max(1, t4));
    }
    var tot = Q.cab_nonldp || Q.seats_hr || 1;
    return Math.min(1, (Q.seats_hr || 0) / tot);
  }

  function points(Q) {
    if (!Q.in_power) { return 0; }
    return Math.max(2, Math.round(POINT_SCALE * share(Q)));
  }

  function used(Q) {
    var i, k, u = 0;
    for (i = 0; i < ORDER.length; i++) {
      k = ORDER[i];
      if (Q['has_' + k]) { u += MIN[k].w; }
    }
    return u;
  }

  function left(Q) { return points(Q) - used(Q); }

  function canTake(Q, key) {
    var m = MIN[key];
    if (!m || Q['has_' + key]) { return false; }
    if (key === 'souri' && (Q.cab_kind === 3 || Q.cab_kind === 4)) { return false; }   // 参加だけでは首班は取れない（自社連立も）
    return left(Q) >= m.w;
  }

  function take(Q, key) {
    if (window.JSP && window.JSP.tallyCounter) { window.JSP.tallyCounter(Q, 'cab'); }
    if (!canTake(Q, key)) { return 0; }
    Q['has_' + key] = 1;
    Q['who_' + key] = '';
    Q.cabinet_posts = (Q.cabinet_posts || 0) + 1;
    //  勝利点が見るのは累計。政権が倒れても、就いた事実は消えない。
    Q.cabinet_posts_ever = (Q.cabinet_posts_ever || 0) + 1;
    sync(Q);
    return MIN[key].w;
  }

  //  内閣改造。持ち点を全部戻し、省も人も手放す。
  function clearAll(Q) {
    var i, k;
    for (i = 0; i < ORDER.length; i++) {
      k = ORDER[i];
      Q['has_' + k] = 0; Q['who_' + k] = '';
    }
    Q.cabinet_posts = 0;
    sync(Q);
    return Q;
  }

  //  ── 人選 ────────────────────────────────────────────────
  //  党指導部と同じ名簿から選ぶ。党の役職と兼務はできない。
  function candidates(Q, key) {
    var L = J.LEADERS;
    return L.roster(Q).filter(function (id) {
      var i, k;
      for (i = 0; i < ORDER.length; i++) {
        k = ORDER[i];
        if (Q['who_' + k] === id) { return false; }
      }
      return true;
    });
  }

  function assign(Q, key, id) {
    if (window.JSP && window.JSP.tallyCounter) { window.JSP.tallyCounter(Q, 'cab'); }
    if (!Q['has_' + key]) { return 0; }
    Q['who_' + key] = id;
    Q['cd_m_' + key] = 0;
    Q['uses_m_' + key] = 3;
    //  その人の畑と、その省の仕事が合っているか。
    //  合っていれば役所は早く動くし、畑違いなら事務次官が判断する。
    var f = J.LEADERS && J.LEADERS.FIG[id];
    var fit = (f && f.fit && MIN[key]) ? (f.fit[MIN[key].fit] || 0) : 0;
    Q.cab_fit = fit;
    Q.cab_fit_hi = fit >= 4 ? 1 : 0;
    Q.cab_fit_mid = (fit >= 2 && fit < 4) ? 1 : 0;
    Q.cab_fit_lo = fit < 2 ? 1 : 0;
    sync(Q);
    return 1;
  }

  //  人物の適性がそのまま倍率になる。fit は 0〜5。
  function power(Q, key) {
    var id = Q['who_' + key];
    var f = id && J.LEADERS.FIG[id];
    if (!f) { return 0; }
    var v = (f.fit && f.fit[MIN[key].fit]) || 2;
    return Math.round((0.6 + 0.18 * v) * 100) / 100;      // fit0=0.6 … fit5=1.5
  }

  //  ── 閣僚の行動 ──────────────────────────────────────────
  //  省が何をするかを決め、人が倍率を決める。
  var ACTS = {
    souri: { name: '推动施政方针', scope: 'state', desc: '新中间层与未组织支持度 +5、国家预算 −6、政治资源 +3',
      run: function (Q, k) { J.push(Q, ['shinchukan', 'mishoshiki'], 5 * k);
        Q.national_budget -= 6; Q.capital += Math.round(3 * k); } },
    kanbo: { name: '在党内进行斡旋', scope: 'party', desc: '执政党内关系 +14、政治资源 +4',
      run: function (Q, k) { Q.coalition_rel += Math.round(14 * k); Q.capital += Math.round(4 * k); } },
    okura: { name: '重编预算', scope: 'state', desc: '国家预算 +12、资金 +4',
      run: function (Q, k) { Q.national_budget += Math.round(12 * k); Q.budget += Math.round(4 * k); } },
    gaimu: { name: '推动重力外交', scope: 'state', desc: '新中间层支持度 +4、共产 +8、国家预算 −4',
      run: function (Q, k) { J.push(Q, ['shinchukan'], 4 * k); Q.rel_kyosan += Math.round(8 * k);
        Q.national_budget -= 4; } },
    tsusan: { name: '调整产业政策', scope: 'state', desc: '民间工会的人口 +0.6、国家预算 −8',
      run: function (Q, k) { Q.pop_minrou = Math.round((Q.pop_minrou + 0.6 * k) * 10) / 10;
        Q.pop_jieigyo = Math.round((Q.pop_jieigyo - 0.6 * k) * 10) / 10;
        Q.national_budget -= 8; J.push(Q, ['minrou'], 3 * k); } },
    rodo: { name: '增强劳动行政', scope: 'state', desc: '未组织与新中间层的组织率 +、国家预算 −6',
      run: function (Q, k) { J.organise(Q, ['mishoshiki', 'shinchukan'], 0.05 * k);
        Q.national_budget -= 6; Q.rel_sohyo += Math.round(6 * k); } },
    kosei: { name: '增强医疗与年金体制', scope: 'state', desc: '未组织支持度 +6、国家预算 −10',
      run: function (Q, k) { J.push(Q, ['mishoshiki', 'noson'], 6 * k); Q.national_budget -= 10; } },
    kensetsu: { name: '分派公共工程', scope: 'party', desc: '资金 +10、农村与自营业者支持度 +3、国家预算 −10',
      run: function (Q, k) { Q.budget += Math.round(10 * k);
        J.push(Q, ['noson', 'jieigyo'], 3 * k); Q.national_budget -= 10; } },
    jichi: { name: '充实地方财政', scope: 'party', desc: '资金 +6、无派阀代议员 +15、自治体的负担 −',
      run: function (Q, k) { Q.budget += Math.round(6 * k); Q.del_muha += Math.round(15 * k);
        Q.local_debt = Math.max(0, (Q.local_debt || 0) - 8 * k); } },
    monbu: { name: '改革教育行政', scope: 'state', desc: '官公劳 +5、新中间层支持度 −2、国家预算 −5',
      run: function (Q, k) { J.push(Q, ['kokorou'], 5 * k); J.push(Q, ['shinchukan'], -2 * k);
        Q.national_budget -= 5; Q.rel_sohyo += Math.round(5 * k); } },
    norin: { name: '改革农政', scope: 'state', desc: '农村支持度 +5、国家预算 −12',
      run: function (Q, k) { J.push(Q, ['noson'], 5 * k); Q.national_budget -= 12; } },
    unyu: { name: '推动国铁改革', scope: 'party', desc: '官公劳 +4、总评 +10、国家预算 −8',
      run: function (Q, k) { J.push(Q, ['kokorou'], 4 * k); Q.rel_sohyo += Math.round(10 * k);
        Q.national_budget -= 8; } }
  };

  function canAct(Q, key) {
    if (!Q['has_' + key] || !Q['who_' + key]) { return false; }
    if ((Q['cd_m_' + key] || 0) > 0) { return false; }
    if ((Q['uses_m_' + key] || 0) <= 0) { return false; }
    return true;
  }

  function doAct(Q, key) {
    if (window.JSP && window.JSP.tallyCounter) { window.JSP.tallyCounter(Q, 'cab'); }
    if (!canAct(Q, key)) { return 0; }
    var a = ACTS[key];
    a.run(Q, power(Q, key));
    Q['cd_m_' + key] = 3;
    Q['uses_m_' + key] = (Q['uses_m_' + key] || 0) - 1;
    //  国の金を使えば与党内の風当たりが強くなる
    if (a.scope === 'state') { Q.coalition_rel -= 3; }
    if (Q.national_budget < 0) { Q.coalition_rel -= 5; }
    sync(Q);
    return 1;
  }

  function tick(Q) {
    var i, k;
    for (i = 0; i < ORDER.length; i++) {
      k = ORDER[i];
      if ((Q['cd_m_' + k] || 0) > 0) { Q['cd_m_' + k] -= 1; }
    }
    if (!Q.in_power) { return Q; }
    //  与党内の関係は放っておくと下がる。路線が左に寄っているほど速い。
    var drift = 2 + Math.max(0, -(Q.route || 0));
    Q.coalition_rel -= drift;
    //  国家予算は毎手すこし戻る（税収）
    Q.national_budget = Math.min(120, (Q.national_budget || 0) + 4);
    Q.gov_turns = (Q.gov_turns || 0) + 1;
    //  関係がゼロを割れば政権は終わる。省も人も失う。
    if (Q.coalition_rel <= 0) {
      Q.cab_fell = 1;
      Q.cab_fell_turns = Q.gov_turns;
      leavePower(Q);
    }
    return Q;
  }

  //  関係が線を割ったら内部関係カードが割り込む。一度出たら
  //  次に割るまで出ない（rel_fired で押さえる）。
  var REL_LINE = 30;
  function checkRelation(Q) {
    if (!Q.in_power || Q.cab_kind === 1) { Q.cab_rel_pending = 0; return 0; }
    if (Q.coalition_rel < REL_LINE && !Q.cab_rel_fired) {
      Q.cab_rel_pending = 1; return 1;
    }
    if (Q.coalition_rel >= REL_LINE + 15) { Q.cab_rel_fired = 0; }
    Q.cab_rel_pending = 0;
    return 0;
  }

  //  ── 政権入り ────────────────────────────────────────────
  //  総選挙のたびに走る。年で止めていない。
  function enterPower(Q, route) {
    if (Q.in_power) { return Q; }
    Q.in_power = 1;
    Q.cab_kind = route;
    Q.coalition_rel = route === 1 ? 100 : (route === 4 ? 58 : 62);
    Q.national_budget = 60;
    Q.gov_turns = 0;
    Q.cab_rel_fired = 0;
    Q.ever_in_power = 1;
    clearAll(Q);
    sync(Q);
    return Q;
  }

  function leavePower(Q) {
    //  自社連立が倒れれば、自民との約束も消える
    if (Q.cab_kind === 4) { Q.jisha_pact = 0; }
    Q.in_power = 0; Q.cab_kind = 0; Q.coalition_rel = 0;
    clearAll(Q);
    sync(Q);
    return Q;
  }

  //  ── 表示 ────────────────────────────────────────────────
  function sync(Q) {
    var i, k, m, rows = [], id;
    Q.cab_points = points(Q);
    Q.cab_used = used(Q);
    Q.cab_left = left(Q);
    Q.cab_share = Math.round(share(Q) * 100);
    for (i = 0; i < ORDER.length; i++) {
      k = ORDER[i]; m = MIN[k];
      Q['can_' + k] = canTake(Q, k) ? 1 : 0;
      Q['ok_m_' + k] = canAct(Q, k) ? 1 : 0;
      Q['empty_' + k] = (Q['has_' + k] && !Q['who_' + k]) ? 1 : 0;
      id = Q['who_' + k];
      Q['mname_' + k] = id ? J.LEADERS.FIG[id].name : '（空缺）';
      if (Q['has_' + k]) {
        rows.push('<b>' + m.name + '</b> <span style="opacity:.6">名位' + m.w + '</span>　' +
          (id ? J.LEADERS.FIG[id].name + ' <span style="opacity:.6">×' + power(Q, k) + '</span>'
              : '<span style="color:#B23A34">空缺</span>'));
      }
    }
    Q.cab_block = rows.length ? rows.join('<br>') : '<span style="opacity:.6">一个也还没拿到</span>';
    Q.cab_empty_n = ORDER.filter(function (k2) { return Q['has_' + k2] && !Q['who_' + k2]; }).length;
    return Q;
  }

  window.JSP.CAB = {
    MIN: MIN, ORDER: ORDER, ACTS: ACTS, REL_LINE: REL_LINE,
    points: points, used: used, left: left, canTake: canTake, take: take,
    clearAll: clearAll, candidates: candidates, assign: assign, power: power,
    canAct: canAct, doAct: doAct, tick: tick, checkRelation: checkRelation,
    enterPower: enterPower, leavePower: leavePower, sync: sync
  };
}());
