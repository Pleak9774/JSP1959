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
    souri:    { name: '内閣総理大臣', w: 5, fit: 'chair',  scope: 'state',
                note: '首班。取れるのは単独か連立を主導したときだけ',
                intro: '首班である。社会党の総理は、一九四七年の片山哲と一九九四年の村山富市しかいない。\nどちらも連立で、どちらも一年もたなかった。\n\n総理を取るということは、閣議のすべての案件に署名するということでもある。\n反対してきた政策の書類にも、自分の名前が入る。',
                taken: '総理大臣の椅子に、この党の人間が座った。\n\n戦後二度目である。前の一度は九か月で終わった。',
                acted: '施政方針演説を読んだ。三十年反対してきた側が、三十年やってきた側の席から読んでいる。\n\n野党席のどこかから、こちらの昔の演説の一節が野次で返ってきた。' },
    kanbo:    { name: '内閣官房長官', w: 3, fit: 'secgen', scope: 'party',
                note: '政権の内側の情報と日程を握る',
                intro: '官房長官は毎日二回、記者の前に立つ。政権が何を考えているかは、\nこの人の言い回しから外へ出ていく。\n\n連立の中の調整も、日程の握りも、情報の出し入れも、ここに集まる。\n格は総理より低いが、政権の内側でいちばん忙しい席である。',
                taken: '官房長官を取った。政権の内側の情報と日程が、こちらを通るようになる。\n\n地味な席である。地味な席ほど、手放したときに効く。',
                acted: '連立の各党の幹事長を、一日で三人回った。日程を一つ動かし、\n人事を一つ呑ませ、記者会見の言い方を一つ揃えた。\n\nこの種の仕事は記録に残らない。残らないまま、政権を保たせている。' },
    okura:    { name: '大蔵大臣',     w: 4, fit: 'policy', scope: 'state',
                note: '予算編成。国の金庫の鍵',
                intro: '大蔵大臣は予算編成の総責任者である。国の金の使い道は、\n八月の概算要求から十二月の大臣折衝まで、この省で決まる。\n\n社会党が三十四年掲げてきた政策は、ほとんどが金の要る政策だった。\nその金をどこから出すかを、初めてこちらの側で書くことになる。',
                taken: '大蔵大臣を取った。国の金庫の鍵である。\n\n何を削るかを決めるのも、同じ鍵の仕事である。',
                acted: '予算を組み替えた。削った先には、削られた側の陳情がある。\n\n野党のときは「組み替え動議」を出せばよかった。\nいまは、組み替えた結果に責任がある。' },
    gaimu:    { name: '外務大臣',     w: 4, fit: 'diet',   scope: 'state',
                note: '安保と外交。党の中立政策が試される場所',
                intro: '外務大臣は、この党にとっていちばん危ない席である。\n\n非武装中立、日米安保の破棄、自衛隊違憲 ── 三十年掲げてきた党の看板は、\nどれも外務省の実務とは噛み合わない。\n国連にも、ワシントンにも、北京にも、同じ顔で行かなければならない。',
                taken: '外務大臣を取った。安保と外交である。\n\n党の綱領と、明日の会談の議題が、同じ机の上に並ぶことになる。',
                acted: '中立の枠を一つ広げた。相手国の駐日大使が、党本部ではなく外務省に来る。\n\n党内では「現実に呑まれた」と言われている。\n呑まれずに外交をやる方法を、誰も書いたことがない。' },
    tsusan:   { name: '通商産業大臣', w: 3, fit: 'policy', scope: 'state',
                note: '産業政策。民間労組の雇用がここで決まる',
                intro: '通産省は産業政策の官庁である。どの産業を伸ばし、どれを畳むかを、\n行政指導という形式で決めてきた。\n\n民間労組の雇用は、この省の判断の下流にある。\n鉄鋼も造船も石炭も、伸びた年と畳まれた年が、ここの書類で決まっていた。',
                taken: '通商産業大臣を取った。産業政策である。\n\n民間労組の組合員が、どの工場で何年働けるかが、この省の下流にある。',
                acted: '産業政策を打った。新しい産業に人が移り、古い産業の職場が減る。\n\n移った先で組合を作れるかどうかは、この省の仕事ではない。\n党の仕事である。' },
    rodo:     { name: '労働大臣',     w: 2, fit: 'org',    scope: 'state',
                note: '労働行政。組織率に直接手が届く唯一の省',
                intro: '労働省は、この党が組織率に直接手を届かせられる唯一の省である。\n\n最低賃金、労働時間、職業訓練、そして労働組合法の運用。\n未組織の職場に組合を作るのを、行政の側から助けることができる。\n\n三十四年のあいだ、社会党の労働大臣は一人も出ていない。',
                taken: '労働大臣を取った。組織率に直接手が届く唯一の省である。\n\n党がいちばん欲しかったものが、いちばん格の低い席にある。',
                acted: '労働行政を動かした。中小の職場に監督官を回し、\n組合の結成を妨げる慣行に行政指導を入れた。\n\n組織率が上がるのは何年か先である。それでも、上がる側に手を掛けた。' },
    kosei:    { name: '厚生大臣',     w: 2, fit: 'policy', scope: 'state',
                note: '医療と年金。未組織層に届く',
                intro: '厚生省は医療と年金と生活保護の官庁である。\n\n革新自治体が七十年代に作った老人医療の無料化は、\nもともと地方から始まって国が追いかけた制度だった。\nこの省を取るということは、その追いかける側に立つということである。\n\n届く相手は、組合の名簿に載っていない人たちである。',
                taken: '厚生大臣を取った。医療と年金である。\n\n組合に入っていない人に、党の名前で何かが届く数少ない経路である。',
                acted: '医療と年金の枠を広げた。窓口で払う額が下がる。\n\n下がった分は国庫から出る。出した分の請求書は、\n三年後の予算編成で大蔵省から回ってくる。' },
    kensetsu: { name: '建設大臣',     w: 2, fit: 'org',    scope: 'party',
                note: '公共事業。自民党の資金源でもある',
                intro: '建設省は公共事業の官庁である。道路、河川、住宅、都市計画。\n\n同時に、自民党の集票と資金の構造がいちばん濃く通っている場所でもある。\n業界団体、地方の建設業者、その先の後援会 ── 三十年かけて組まれた回路がある。\n\nそこに社会党の大臣が座ると、回路のほうが先に戸惑う。',
                taken: '建設大臣を取った。公共事業である。\n\n自民党が三十年使ってきた回路の、真ん中に座ることになる。',
                acted: '事業の配分を組み替えた。回してきた先が変わると、\n地元の建設業者の名簿も変わる。\n\n「同じことをやっている」と党内で言われた。\n違うことをやるには、この省ではない場所が要る。' },
    jichi:    { name: '自治大臣',     w: 2, fit: 'org',    scope: 'party',
                note: '地方財政と選挙制度。自治体を持っていれば効く',
                intro: '自治省は地方財政と選挙制度の官庁である。\n\n地方交付税の算定、地方債の許可、そして公職選挙法の運用。\n革新自治体が財政で締め上げられたのも、この省の匙加減だった。\n\n自治体を持っている党にとって、ここは本丸の裏口である。',
                taken: '自治大臣を取った。地方財政と選挙制度である。\n\nこちらの持っている自治体に、初めて国の側から手が届く。',
                acted: '地方交付税の算定を動かし、地方債の枠を広げた。\n\nこちらの自治体の予算が組めるようになる。\n同時に、相手の自治体の予算も同じだけ組めるようになる。' },
    monbu:    { name: '文部大臣',     w: 2, fit: 'youth',  scope: 'state',
                note: '教育行政。日教組と正面から向き合う',
                intro: '文部省と日教組は、一九五〇年代からずっと対立してきた。\n勤務評定、学力テスト、主任制 ── 争点は十年ごとに変わり、対立だけが続いた。\n\nその省に社会党の大臣が座る。日教組は最大の支持組織のひとつである。\n味方に立つのか、行政の長として立つのか、初日に問われる。',
                taken: '文部大臣を取った。日教組と正面から向き合う席である。\n\n支持組織の相手側の長官席に、その支持組織の代表が座った。',
                acted: '教育行政を動かした。現場の裁量を広げ、上からの管理を一段ゆるめた。\n\n文部省の官僚は表情を変えない。\n次の政権で全部戻せることを、彼らは知っている。' },
    norin:    { name: '農林水産大臣', w: 2, fit: 'diet',   scope: 'state',
                note: '農村。三十年間ずっと自民党のものだった層',
                intro: '農村は三十四年のあいだ、ほとんどずっと自民党のものだった。\n\n農協と土地改良区と食糧管理制度。この三つが束になって、\n農村の票を保守の側につないでいた。社会党が入り込む隙は薄い。\n\n農林大臣を取るということは、その回路に初めて手を掛けるということである。',
                taken: '農林水産大臣を取った。三十年間ずっと自民党のものだった層である。\n\n隙は薄い。薄いところに手を掛けなければ、この層は永久に動かない。',
                acted: '米価と農政の枠を動かした。農協の県連が、初めて党本部に人を寄越した。\n\n一度来たからといって、票が来るわけではない。\n来ないところに三十年通うのが、この仕事である。' },
    unyu:     { name: '運輸大臣',     w: 2, fit: 'diet',   scope: 'party',
                note: '国鉄と私鉄。官公労の本丸',
                intro: '運輸省は国鉄と私鉄の監督官庁である。\n\n国鉄には国労と動労、私鉄には私鉄総連。どれも総評の中核であり、\nこの党の組織の本丸そのものである。\n\n監督する側に座るということは、身内を監督するということでもある。\nストが起きたとき、どちらの側から発言するのかが最初に問われる。',
                taken: '運輸大臣を取った。国鉄と私鉄、官公労の本丸である。\n\n監督する側と、支持される側が、同じ人間になる。',
                acted: '運輸行政を動かした。国鉄の要員計画に、こちらの側から線を引く。\n\n組合は喜んだ。新聞は「お手盛り」と書いた。\nどちらも、半分ずつ正しい。' }
  };
  var ORDER = ['souri', 'kanbo', 'okura', 'gaimu', 'tsusan', 'rodo',
               'kosei', 'kensetsu', 'jichi', 'monbu', 'norin', 'unyu'];

  //  組閣の持ち点。連立の中で我々が占める議席比で決まる。
  //  校正：史実の細川内閣で社会党は 70/258 ≒ 27%、閣僚は 6 ポスト
  //  （大半が格2）＝ 12 点。45 × 0.27 = 12。単独過半なら 45 点で全部取れる。
  var POINT_SCALE = 45;

  function share(Q) {
    if (Q.cab_kind === 1) { return 1; }
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
    if (key === 'souri' && Q.cab_kind === 3) { return false; }   // 参加だけでは首班は取れない
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
    souri: { name: '施政方針で押す', scope: 'state', desc: '新中間層・未組織 +5、国家予算 −6、政治資源 +3',
      run: function (Q, k) { J.push(Q, ['shinchukan', 'mishoshiki'], 5 * k);
        Q.national_budget -= 6; Q.capital += Math.round(3 * k); } },
    kanbo: { name: '与党内を回す', scope: 'party', desc: '与党内関係 +14、政治資源 +4',
      run: function (Q, k) { Q.coalition_rel += Math.round(14 * k); Q.capital += Math.round(4 * k); } },
    okura: { name: '予算を組み替える', scope: 'state', desc: '国家予算 +12、資金 +4',
      run: function (Q, k) { Q.national_budget += Math.round(12 * k); Q.budget += Math.round(4 * k); } },
    gaimu: { name: '中立外交を進める', scope: 'state', desc: '新中間層 +4、共産 +8、国家予算 −4',
      run: function (Q, k) { J.push(Q, ['shinchukan'], 4 * k); Q.rel_kyosan += Math.round(8 * k);
        Q.national_budget -= 4; } },
    tsusan: { name: '産業政策を打つ', scope: 'state', desc: '民間労組の人口 +0.6、国家予算 −8',
      run: function (Q, k) { Q.pop_minrou = Math.round((Q.pop_minrou + 0.6 * k) * 10) / 10;
        Q.pop_jieigyo = Math.round((Q.pop_jieigyo - 0.6 * k) * 10) / 10;
        Q.national_budget -= 8; J.push(Q, ['minrou'], 3 * k); } },
    rodo: { name: '労働行政を動かす', scope: 'state', desc: '未組織・新中間層の組織率 +、国家予算 −6',
      run: function (Q, k) { J.organise(Q, ['mishoshiki', 'shinchukan'], 0.05 * k);
        Q.national_budget -= 6; Q.rel_sohyo += Math.round(6 * k); } },
    kosei: { name: '医療と年金を広げる', scope: 'state', desc: '未組織 +6、国家予算 −10',
      run: function (Q, k) { J.push(Q, ['mishoshiki', 'noson'], 6 * k); Q.national_budget -= 10; } },
    kensetsu: { name: '公共事業を配る', scope: 'party', desc: '資金 +10、農村・自営 +3、国家予算 −10',
      run: function (Q, k) { Q.budget += Math.round(10 * k);
        J.push(Q, ['noson', 'jieigyo'], 3 * k); Q.national_budget -= 10; } },
    jichi: { name: '地方財政を回す', scope: 'party', desc: '資金 +6、無派閥代議員 +15、自治体の負担 −',
      run: function (Q, k) { Q.budget += Math.round(6 * k); Q.del_muha += Math.round(15 * k);
        Q.local_debt = Math.max(0, (Q.local_debt || 0) - 8 * k); } },
    monbu: { name: '教育行政を握る', scope: 'state', desc: '官公労 +5、新中間層 −2、国家予算 −5',
      run: function (Q, k) { J.push(Q, ['kokorou'], 5 * k); J.push(Q, ['shinchukan'], -2 * k);
        Q.national_budget -= 5; Q.rel_sohyo += Math.round(5 * k); } },
    norin: { name: '農政に手を入れる', scope: 'state', desc: '農村 +5、国家予算 −12',
      run: function (Q, k) { J.push(Q, ['noson'], 5 * k); Q.national_budget -= 12; } },
    unyu: { name: '国鉄に手を入れる', scope: 'party', desc: '官公労 +4、総評 +10、国家予算 −8',
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
    Q.coalition_rel = route === 1 ? 100 : 62;
    Q.national_budget = 60;
    Q.gov_turns = 0;
    Q.cab_rel_fired = 0;
    Q.ever_in_power = 1;
    clearAll(Q);
    sync(Q);
    return Q;
  }

  function leavePower(Q) {
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
      Q['mname_' + k] = id ? J.LEADERS.FIG[id].name : '（空席）';
      if (Q['has_' + k]) {
        rows.push('<b>' + m.name + '</b> <span style="opacity:.6">格' + m.w + '</span>　' +
          (id ? J.LEADERS.FIG[id].name + ' <span style="opacity:.6">×' + power(Q, k) + '</span>'
              : '<span style="color:#B23A34">空席</span>'));
      }
    }
    Q.cab_block = rows.length ? rows.join('<br>') : '<span style="opacity:.6">まだ一つも取っていない</span>';
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
