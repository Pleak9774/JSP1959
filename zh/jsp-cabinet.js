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
                note: '首班。只有单独执政或主导联合的时候才拿得到',
                intro: '这是首班。社会党出过的总理只有两个：一九四七年的片山哲，和一九九四年的村山富市。\n两回都是联合，两回都没撑满一年。\n\n而拿下总理，同时也意味着内阁会议上每一件案子都要签字。\n那些反对了多年的政策文件上，也会有自己的名字。',
                taken: '总理大臣的椅子上，坐了一个这个党的人。\n\n战后第二回。上一回，九个月就完了。',
                acted: '念了施政方针演说。反对了三十年的那一边，坐在干了三十年的那一边的位子上念。\n\n在野党席上不知谁喊了一句倒彩，喊的是我们自己当年演说里的一段。' },
    kanbo:    { name: '内阁官房长官', w: 3, fit: 'secgen', scope: 'party',
                note: '握着政权内部的消息和日程',
                intro: '官房长官每天要在记者面前站两回。政权在想什么，\n就是从这个人的措辞里漏到外面去的。\n\n联合内部的调配、日程的把控、消息的进出，全汇到这里。\n名位比总理低，可这是政权内部最忙的一张椅子。',
                taken: '拿下了官房长官。政权内部的消息和日程，从此都要过这边一遍。\n\n这是张不起眼的椅子。而越不起眼的椅子，撒手的时候越显出分量。',
                acted: '一天里跑了联合三个党的干事长。挪了一处日程，\n逼人咽下一桩人事，又把记者会上的口径统一了一句。\n\n这种活儿是不进记录的。不进记录，却撑着这个政权。' },
    okura:    { name: '大藏大臣',     w: 4, fit: 'policy', scope: 'state',
                note: '编预算。国家金库的钥匙',
                intro: '大藏大臣是编预算的总负责人。国家的钱怎么花，\n从八月的概算要求到十二月的大臣折冲，都在这个省里定。\n\n社会党举了三十四年的政策，几乎样样都要钱。\n而这笔钱从哪儿出，头一回轮到这边来写。',
                taken: '拿下了大藏大臣，也就是国家金库的钥匙。\n\n而决定砍掉什么，也是这把钥匙的活。',
                acted: '把预算重编了一遍。砍掉的地方，后面跟着被砍那一方的陈情。\n\n在野的时候，递一份"重编动议"就算完了。\n如今，重编出来的结果是要负责的。' },
    gaimu:    { name: '外务大臣',     w: 4, fit: 'diet',   scope: 'state',
                note: '安保与外交。党的中立政策要在这里挨试',
                intro: '对这个党来说，外务大臣是最危险的一张椅子。\n\n非武装中立、废除日美安保、自卫队违宪——举了三十年的这些招牌，\n没有一样跟外务省的实务咬得上。\n而去联合国也好，去华盛顿也好，去北京也好，都得带着同一张脸。',
                taken: '拿下了外务大臣，管的是安保和外交。\n\n从此党的纲领和明天会谈的议题，要摆在同一张桌子上。',
                acted: '把中立的框子撑开了一格。对方国家的驻日大使，如今是往外务省跑，不是往党本部跑。\n\n党内说这是"被现实吞掉了"。\n可不被吞掉又能把外交做起来的法子，从来没有一个人写出来过。' },
    tsusan:   { name: '通商产业大臣', w: 3, fit: 'policy', scope: 'state',
                note: '产业政策。民间工会的饭碗在这里定',
                intro: '通产省是管产业政策的衙门。哪个产业往上抬、哪个收摊，\n一直是用"行政指导"这个形式定下来的。\n\n而民间工会的饭碗，就在这个省判断的下游。\n钢铁也好造船也好煤炭也好，哪一年长、哪一年收，都写在这里的公文上。',
                taken: '拿下了通商产业大臣，管的是产业政策。\n\n民间工会的会员在哪家工厂干到哪一年，就在这个省的下游。',
                acted: '打出了产业政策。人往新产业挪，老产业的岗位跟着少。\n\n至于挪过去之后建不建得起工会，那不是这个省的活。\n那是党的活。' },
    rodo:     { name: '劳动大臣',     w: 2, fit: 'org',    scope: 'state',
                note: '劳动行政。唯一一个手能直接够到组织率的省',
                intro: '劳动省是这个党唯一一个手能直接够到组织率的省。\n\n最低工资、劳动时间、职业训练，还有劳动组合法怎么执行。\n未组织的职场要建工会，行政这一边是帮得上忙的。\n\n而这三十四年里，社会党一个劳动大臣也没出过。',
                taken: '拿下了劳动大臣，唯一一个手能直接够到组织率的省。\n\n这个党最想要的东西，偏偏放在名位最低的那张椅子上。',
                acted: '把劳动行政动了起来。往中小职场派监督官，\n又对那些妨碍建工会的惯例下了行政指导。\n\n组织率要涨还得等好几年。即便如此，手总算搭在了往上涨的那一头。' },
    kosei:    { name: '厚生大臣',     w: 2, fit: 'policy', scope: 'state',
                note: '医疗与年金。话够得到未组织层',
                intro: '厚生省是管医疗、年金和低保的衙门。\n\n革新自治体七十年代做出来的老人医疗免费，\n本来就是地方先起头、国家在后头追的制度。\n拿下这个省，也就是站到"在后头追"的那一边。\n\n而话够得到的那些人，名字不在工会的名册上。',
                taken: '拿下了厚生大臣，管的是医疗和年金。\n\n对没进工会的人，能以党的名义送去点什么——这样的路子没有几条。',
                acted: '把医疗和年金的框子撑开了些，窗口上要付的钱降了下来。\n\n降掉的那一块由国库出。而这笔账的单子，\n三年后编预算的时候会从大藏省转过来。' },
    kensetsu: { name: '建设大臣',     w: 2, fit: 'org',    scope: 'party',
                note: '公共工程。同时也是自民党的钱袋子',
                intro: '建设省是管公共工程的衙门：道路、河川、住宅、都市规划。\n\n同时，这也是自民党拉票和搞钱那套结构走得最浓的地方。\n行业团体、地方的建筑商，再往后是后援会——一条花三十年搭起来的回路。\n\n社会党的大臣往那儿一坐，先愣住的是那条回路。',
                taken: '拿下了建设大臣，管的是公共工程。\n\n自民党用了三十年的那条回路，如今要坐在它的正中间。',
                acted: '把工程的分配重编了一遍。钱流去的地方一变，\n当地建筑商的名册也跟着变。\n\n党内有人说："这不还是在干同一件事。"\n可要干不一样的事，就得换一个不是这个省的地方。' },
    jichi:    { name: '自治大臣',     w: 2, fit: 'org',    scope: 'party',
                note: '地方财政与选举制度。手上有自治体就管用',
                intro: '自治省是管地方财政和选举制度的衙门。\n\n地方交付税怎么算、地方债批不批，还有公职选举法怎么执行。\n当年革新自治体在财政上被勒紧，靠的也是这个省手上那点分寸。\n\n对一个手上握着自治体的党来说，这里是本丸的后门。',
                taken: '拿下了自治大臣，管的是地方财政和选举制度。\n\n这边手上那些自治体，头一回从国家这一侧够得着了。',
                acted: '动了地方交付税的算法，又把地方债的额度撑开了些。\n\n这边的自治体，预算总算编得出来了。\n而与此同时，对方的自治体也一样编得出来了。' },
    monbu:    { name: '文部大臣',     w: 2, fit: 'youth',  scope: 'state',
                note: '教育行政。要跟日教组正面相对',
                intro: '文部省和日教组从五十年代起就一直对着干。\n勤务评定、学力测验、主任制——争点每十年换一个，对立本身没断过。\n\n如今社会党的大臣要坐进这个省。而日教组是最大的支持组织之一。\n是站在自己人那边，还是以行政长官的身份站着？第一天就要被问。',
                taken: '拿下了文部大臣，这是要跟日教组正面相对的一张椅子。\n\n支持组织的对家那把长官椅上，坐的是这个支持组织自己的代表。',
                acted: '把教育行政动了起来：给一线放宽了裁量，自上而下的管理松了一档。\n\n文部省的官僚脸上没有半点变化。\n因为他们知道，换一届政权就能全部改回去。' },
    norin:    { name: '农林水产大臣', w: 2, fit: 'diet',   scope: 'state',
                note: '农村。三十年来一直是自民党的那一层',
                intro: '这三十四年里，农村差不多一直是自民党的。\n\n农协、土地改良区、粮食管理制度——这三样捆成一束，\n把农村的票拴在保守那一边。社会党挤得进去的缝很薄。\n\n而拿下农林大臣，就是头一回把手搭到那条回路上。',
                taken: '拿下了农林水产大臣。这是三十年来一直属于自民党的那一层。\n\n缝很薄。可不往薄的地方搭手，这一层就永远不会动。',
                acted: '动了米价和农政的框子。农协的县联，头一回往党本部派了人来。\n\n来过一趟，不等于票就会来。\n往不来票的地方跑上三十年——这份活就是这么回事。' },
    unyu:     { name: '运输大臣',     w: 2, fit: 'diet',   scope: 'party',
                note: '国铁与私铁。官公劳的本丸',
                intro: '运输省是管国铁和私铁的监督衙门。\n\n国铁那边有国劳和动劳，私铁那边有私铁总连。样样都是总评的核心，\n也正是这个党组织的本丸。\n\n坐到监督的那一侧，同时也就意味着要去监督自己人。\n一旦罢起工来，你站哪一边说话，这是第一道要答的题。',
                taken: '拿下了运输大臣，管的是国铁和私铁，官公劳的本丸。\n\n监督的那一方和被支持的那一方，成了同一个人。',
                acted: '把运输行政动了起来：国铁的人员计划，由这边来划线。\n\n工会很高兴。报纸写的是"自己给自己盛饭"。\n这两样，各对一半。' }
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
    souri: { name: '拿施政方针去推', scope: 'state', desc: '新中间层与未组织 +5、国家预算 −6、政治资源 +3',
      run: function (Q, k) { J.push(Q, ['shinchukan', 'mishoshiki'], 5 * k);
        Q.national_budget -= 6; Q.capital += Math.round(3 * k); } },
    kanbo: { name: '在执政党内部张罗', scope: 'party', desc: '执政党内关系 +14、政治资源 +4',
      run: function (Q, k) { Q.coalition_rel += Math.round(14 * k); Q.capital += Math.round(4 * k); } },
    okura: { name: '把预算重编', scope: 'state', desc: '国家预算 +12、资金 +4',
      run: function (Q, k) { Q.national_budget += Math.round(12 * k); Q.budget += Math.round(4 * k); } },
    gaimu: { name: '推中立外交', scope: 'state', desc: '新中间层 +4、共产 +8、国家预算 −4',
      run: function (Q, k) { J.push(Q, ['shinchukan'], 4 * k); Q.rel_kyosan += Math.round(8 * k);
        Q.national_budget -= 4; } },
    tsusan: { name: '打出产业政策', scope: 'state', desc: '民间工会的人口 +0.6、国家预算 −8',
      run: function (Q, k) { Q.pop_minrou = Math.round((Q.pop_minrou + 0.6 * k) * 10) / 10;
        Q.pop_jieigyo = Math.round((Q.pop_jieigyo - 0.6 * k) * 10) / 10;
        Q.national_budget -= 8; J.push(Q, ['minrou'], 3 * k); } },
    rodo: { name: '把劳动行政动起来', scope: 'state', desc: '未组织与新中间层的组织率 +、国家预算 −6',
      run: function (Q, k) { J.organise(Q, ['mishoshiki', 'shinchukan'], 0.05 * k);
        Q.national_budget -= 6; Q.rel_sohyo += Math.round(6 * k); } },
    kosei: { name: '把医疗和年金撑开', scope: 'state', desc: '未组织 +6、国家预算 −10',
      run: function (Q, k) { J.push(Q, ['mishoshiki', 'noson'], 6 * k); Q.national_budget -= 10; } },
    kensetsu: { name: '分派公共工程', scope: 'party', desc: '资金 +10、农村与自营 +3、国家预算 −10',
      run: function (Q, k) { Q.budget += Math.round(10 * k);
        J.push(Q, ['noson', 'jieigyo'], 3 * k); Q.national_budget -= 10; } },
    jichi: { name: '把地方财政张罗起来', scope: 'party', desc: '资金 +6、无派阀代议员 +15、自治体的负担 −',
      run: function (Q, k) { Q.budget += Math.round(6 * k); Q.del_muha += Math.round(15 * k);
        Q.local_debt = Math.max(0, (Q.local_debt || 0) - 8 * k); } },
    monbu: { name: '把教育行政攥住', scope: 'state', desc: '官公劳 +5、新中间层 −2、国家预算 −5',
      run: function (Q, k) { J.push(Q, ['kokorou'], 5 * k); J.push(Q, ['shinchukan'], -2 * k);
        Q.national_budget -= 5; Q.rel_sohyo += Math.round(5 * k); } },
    norin: { name: '往农政上动手', scope: 'state', desc: '农村 +5、国家预算 −12',
      run: function (Q, k) { J.push(Q, ['noson'], 5 * k); Q.national_budget -= 12; } },
    unyu: { name: '往国铁上动手', scope: 'party', desc: '官公劳 +4、总评 +10、国家预算 −8',
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
