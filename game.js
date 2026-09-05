(function() {
  var game;
  var ui;

  var DateOptions = {hour: 'numeric',
                 minute: 'numeric',
                 second: 'numeric',
                 year: 'numeric',
                 month: 'short',
                 day: 'numeric' };

  var main = function(dendryUI) {
    ui = dendryUI;
    game = ui.game;

    //  選べない札（冷却中・回数切れ・資源不足）は押せないようにする。
    //  雛形は薄く塗るだけで、押せばそのまま頁が開いていた。指導部の札で
    //  誤って押す報告が多かった。捕捉段階で止めるので、雛形の
    //  委譲された click より先に走る。
    //  雛形はピン留めの札に unavailable-card を付けない（山札の札には付ける）。
    //  choose-if が偽の札をエンジンの選択肢から引いて印を付け、押しても開かないようにする。
    var content = document.getElementById('content');
    var cannot = function (id) {
      try {
        var ch = dendryUI.dendryEngine.getCurrentChoices();
        for (var i = 0; i < ch.length; i++) { if (ch[i].id === id) { return ch[i].canChoose === false; } }
      } catch (e) { return false; }
      return false;
    };
    var mark = function () {
      var lis = content.querySelectorAll('ul.pinned-cards li, ul.decks li, ul.hand li');
      for (var i = 0; i < lis.length; i++) {
        var a = lis[i].querySelector('a[card-id]');
        if (a && cannot(a.getAttribute('card-id'))) { lis[i].classList.add('unavailable-card'); }
      }
    };
    if (content && !content.jspGuard) {
      content.jspGuard = true;
      content.addEventListener('click', function (evt) {
        var t = evt.target, a = null;
        while (t && t !== content) {
          if (t.classList && t.classList.contains('unavailable-card')) {
            evt.preventDefault(); evt.stopPropagation(); return false;
          }
          if (!a && t.getAttribute && t.getAttribute('card-id')) { a = t; }
          t = t.parentNode;
        }
        if (a && cannot(a.getAttribute('card-id'))) {
          evt.preventDefault(); evt.stopPropagation(); return false;
        }
        return true;
      }, true);
      var pending = false;
      new MutationObserver(function () {
        if (pending) { return; }
        pending = true;
        //  rAF は裏の tab で止まる。時計で回す。
        setTimeout(function () { pending = false; mark(); }, 0);
      }).observe(content, { childList: true, subtree: true });
      mark();
    }
  };

  var TITLE = "" + '_' + "";

  window.showStats = function() {
    if (window.dendryUI.dendryEngine.state.sceneId.startsWith('stats')) {
        window.dendryUI.dendryEngine.goToScene('backSpecialScene');
    } else {
        window.dendryUI.dendryEngine.goToScene('stats');
    }
  };
  
  window.showOptions = function() {
      var save_element = document.getElementById('options');
      window.populateOptions();
      save_element.style.display = "block";
      if (!save_element.onclick) {
          save_element.onclick = function(evt) {
              var target = evt.target;
              var save_element = document.getElementById('options');
              if (target == save_element) {
                  window.hideOptions();
              }
          };
      }
  };

  window.hideOptions = function() {
      var save_element = document.getElementById('options');
      save_element.style.display = "none";
  };

  window.disableBg = function() {
      window.dendryUI.disable_bg = true;
      document.body.style.backgroundImage = 'none';
      window.dendryUI.saveSettings();
  };

  window.enableBg = function() {
      window.dendryUI.disable_bg = false;
      window.dendryUI.setBg(window.dendryUI.dendryEngine.state.bg);
      window.dendryUI.saveSettings();
  };

  window.disableAnimate = function() {
      window.dendryUI.animate = false;
      window.dendryUI.saveSettings();
  };

  window.enableAnimate = function() {
      window.dendryUI.animate = true;
      window.dendryUI.saveSettings();
  };

  window.disableAnimateBg = function() {
      window.dendryUI.animate_bg = false;
      window.dendryUI.saveSettings();
  };

  window.enableAnimateBg = function() {
      window.dendryUI.animate_bg = true;
      window.dendryUI.saveSettings();
  };

  // populates the checkboxes in the options view
  window.populateOptions = function() {
    var disable_bg = window.dendryUI.disable_bg;
    var animate = window.dendryUI.animate;
    var animate_bg = window.dendryUI.animate_bg;
    if (disable_bg) {
        $('#backgrounds_no')[0].checked = true;
    } else {
        $('#backgrounds_yes')[0].checked = true;
    }
    if (animate) {
        $('#animate_yes')[0].checked = true;
    } else {
        $('#animate_no')[0].checked = true;
    }
    if (animate_bg) {
        $('#animate_bg_yes')[0].checked = true;
    } else {
        $('#animate_bg_no')[0].checked = true;
    }
  };
  
  // This function allows you to modify the text before it's displayed.
  // E.g. wrapping chat-like messages in spans.
  window.displayText = function(text) {
      return text;
  };

  // This function allows you to do something in response to signals.
  window.handleSignal = function(signal, event, scene_id) {
  };
  
  // This function runs on a new page. Right now, this auto-saves.
  window.onNewPage = function() {
    var scene = window.dendryUI.dendryEngine.state.sceneId;
    if (scene != 'root' && !window.justLoaded) {
        window.dendryUI.autosave();
    }
    if (window.justLoaded) {
        window.justLoaded = false;
    }
  };

  // TODO: have some code for tabbed sidebar browsing.
  window.updateSidebar = function() {
      $('#qualities').empty();
      var scene = dendryUI.game.scenes[window.statusTab];
      dendryUI.dendryEngine._runActions(scene.onArrival);
      var displayContent = dendryUI.dendryEngine._makeDisplayContent(scene.content, true);
      $('#qualities').append(dendryUI.contentToHTML.convert(displayContent));
  };

  window.changeTab = function(newTab, tabId) {
      var tabButton = document.getElementById(tabId);
      var tabButtons = document.getElementsByClassName('tab_button');
      for (i = 0; i < tabButtons.length; i++) {
        tabButtons[i].className = tabButtons[i].className.replace(' active', '');
      }
      tabButton.className += ' active';
      window.statusTab = newTab;
      window.updateSidebar();
  };


  window.onDisplayContent = function() {
      window.updateSidebar();
  };

  window.justLoaded = true;
  window.statusTab = "status";
  window.dendryModifyUI = main;
  console.log("Modifying stats: see dendryUI.dendryEngine.state.qualities");

  window.onload = function() {
    window.dendryUI.loadSettings();
  };

}());
