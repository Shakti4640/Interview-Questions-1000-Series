/* =====================================================================
   _enhance.js  —  shared behavior for the Interview_Questions HTML files.
   Turns the flat markdown export into a tabbed reader:
     - one chapter per tab (chapter heading level is detected per file)
     - navigation is through the top-left hamburger menu only
       (Left / Right arrow keys also move between chapters, with wrap)
     - top-right dark / light toggle (light is the default)
     - each question hides its answer behind a "Show answer" toggle;
       a top-bar button shows or hides every answer at once
     - the redundant "Jump to Batch" / "Main Titles" list is dropped
   It only MOVES existing nodes into panels (answers stay, just hidden).
   ===================================================================== */
(function () {
  var ARROW = '\u2192'; // the "→" that separates a question from its answer

  function isSkippable(title) {
    var t = (title || '').replace(/[^a-z ]/gi, '').trim().toLowerCase();
    return t === 'jump to batch' || t === 'main titles' || t.indexOf('jump to') === 0;
  }

  function build() {
    var docEl = document.documentElement;
    try {
      // ---- saved theme (light by default) ----
      var savedTheme = null;
      try { savedTheme = localStorage.getItem('enh-theme'); } catch (e) {}
      if (savedTheme === 'dark') docEl.classList.add('enh-dark');

      var body = document.body;

      // ---- gather real content (skip scripts/styles/links and our own UI) ----
      var kids = Array.prototype.slice.call(body.children);
      var content = kids.filter(function (el) {
        var t = el.tagName.toLowerCase();
        if (t === 'script' || t === 'style' || t === 'link') return false;
        if (el.id && el.id.indexOf('enh-') === 0) return false;
        return true;
      });

      // ---- page title = first h1 (fallback to the document title) ----
      var titleHTML = document.title || 'Interview Questions';
      var titleEl = null;
      for (var i = 0; i < content.length; i++) {
        if (content[i].tagName.toLowerCase() === 'h1') { titleEl = content[i]; break; }
      }
      if (titleEl) titleHTML = titleEl.innerHTML;

      var rest = content.filter(function (el) { return el !== titleEl; });

      // ---- find the chapter heading level (smallest level used >= 2 times) ----
      var counts = {};
      rest.forEach(function (el) {
        var m = /^h([1-6])$/.exec(el.tagName.toLowerCase());
        if (m) { var lv = +m[1]; counts[lv] = (counts[lv] || 0) + 1; }
      });
      var primary = null, lv;
      for (lv = 1; lv <= 6; lv++) { if (counts[lv] >= 2) { primary = lv; break; } }
      if (primary === null) { for (lv = 1; lv <= 6; lv++) { if (counts[lv]) { primary = lv; break; } } }

      function isBoundary(el) {
        var m = /^h([1-6])$/.exec(el.tagName.toLowerCase());
        return !!m && (+m[1] === primary);
      }

      // ---- split content into sections ----
      var sections = [], intro = [], current = null;
      rest.forEach(function (el) {
        if (primary !== null && isBoundary(el)) {
          current = { title: (el.textContent || '').trim(), nodes: [el] };
          sections.push(current);
        } else if (current) {
          current.nodes.push(el);
        } else {
          intro.push(el);
        }
      });
      if (intro.length) {
        var introTitle = 'Overview';
        for (var k = 0; k < intro.length; k++) {
          if (/^h[1-6]$/.test(intro[k].tagName.toLowerCase())) {
            introTitle = (intro[k].textContent || '').trim(); break;
          }
        }
        sections.unshift({ title: introTitle, nodes: intro });
      }
      if (!sections.length) sections.push({ title: 'Contents', nodes: rest });

      // ---- drop the redundant "Jump to Batch" / "Main Titles" section ----
      sections = sections.filter(function (sec) {
        if (isSkippable(sec.title)) {
          sec.nodes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
          return false;
        }
        return true;
      });
      if (!sections.length) sections.push({ title: 'Contents', nodes: rest });

      // ---- build the UI scaffold (no horizontal tab strip) ----
      var topbar = document.createElement('div'); topbar.id = 'enh-topbar';
      var burger = document.createElement('button');
      burger.id = 'enh-hamburger'; burger.className = 'enh-iconbtn';
      burger.setAttribute('aria-label', 'Open chapter menu');
      burger.textContent = '\u2630';
      var homeBtn = document.createElement('a');
      homeBtn.id = 'enh-home'; homeBtn.className = 'enh-iconbtn';
      homeBtn.href = 'index.html'; homeBtn.title = 'Back to home';
      homeBtn.setAttribute('aria-label', 'Back to home');
      homeBtn.textContent = '\uD83C\uDFE0'; // house
      var titleDiv = document.createElement('div');
      titleDiv.id = 'enh-title'; titleDiv.innerHTML = titleHTML;
      var answersBtn = document.createElement('button');
      answersBtn.id = 'enh-answers'; answersBtn.type = 'button';
      answersBtn.textContent = 'Show answers';
      var themeBtn = document.createElement('button');
      themeBtn.id = 'enh-theme'; themeBtn.className = 'enh-iconbtn';
      themeBtn.setAttribute('aria-label', 'Toggle dark mode');
      topbar.appendChild(burger);
      topbar.appendChild(homeBtn);
      topbar.appendChild(titleDiv);
      topbar.appendChild(answersBtn);
      topbar.appendChild(themeBtn);

      var overlay = document.createElement('div'); overlay.id = 'enh-overlay';
      var drawer = document.createElement('aside'); drawer.id = 'enh-drawer';
      var drawerHead = document.createElement('div'); drawerHead.id = 'enh-drawer-head';
      drawerHead.textContent = 'All Chapters';
      var drawerList = document.createElement('ul'); drawerList.id = 'enh-drawer-list';
      drawer.appendChild(drawerHead); drawer.appendChild(drawerList);
      var panels = document.createElement('main'); panels.id = 'enh-panels';

      var drawerItems = [];
      sections.forEach(function (sec, idx) {
        var panel = document.createElement('section');
        panel.className = 'enh-panel';
        sec.nodes.forEach(function (n) { panel.appendChild(n); });
        panels.appendChild(panel);

        var li = document.createElement('li');
        var num = document.createElement('span');
        num.className = 'enh-num'; num.textContent = (idx + 1);
        li.appendChild(num);
        li.appendChild(document.createTextNode(sec.title || ('Section ' + (idx + 1))));
        li.addEventListener('click', function () { activate(idx); closeDrawer(); });
        drawerList.appendChild(li);
        drawerItems.push(li);
      });

      // ---- turn each "question / answer" item into a hidden answer ----
      // Two layouts appear in these files:
      //   1) "Question ... -> Answer ..."  (separated by the arrow)
      //   2) "Question ...\nAnswer ..."    (question on line 1, answer on line 2)
      var answerBlocks = [], answerToggles = [];
      var items = panels.querySelectorAll('li');
      Array.prototype.forEach.call(items, function (item) {
        // only top-level question items (not items nested inside another list item)
        if (item.parentElement && item.parentElement.closest('li')) return;

        var html = item.innerHTML;
        var qHTML, aHTML;
        var ai = html.indexOf(ARROW);
        if (ai !== -1) {
          qHTML = html.slice(0, ai);
          aHTML = html.slice(ai + ARROW.length);
        } else {
          var m = /^(\s*<p[^>]*>[^\n]*?)\n([\s\S]+)$/.exec(html);
          if (!m) return;                       // no clear split -> leave as is
          qHTML = m[1];
          aHTML = m[2];
        }

        var q = document.createElement('div'); q.className = 'enh-q'; q.innerHTML = qHTML;
        var a = document.createElement('div'); a.className = 'enh-a'; a.innerHTML = aHTML;
        if (!q.textContent.trim() || !a.textContent.trim()) return; // nothing useful

        var btn = document.createElement('button');
        btn.className = 'enh-toggle'; btn.type = 'button'; btn.textContent = 'Show answer';
        a.hidden = true;
        btn.addEventListener('click', function () { setAnswer(btn, a, a.hidden); });

        item.innerHTML = '';
        item.appendChild(q); item.appendChild(btn); item.appendChild(a);
        answerBlocks.push(a); answerToggles.push(btn);
      });

      function setAnswer(btn, a, show) {
        a.hidden = !show;
        btn.textContent = show ? 'Hide answer' : 'Show answer';
        btn.classList.toggle('open', show);
      }

      // remove the now-relocated title element (its text lives in the top bar)
      if (titleEl && titleEl.parentNode) titleEl.parentNode.removeChild(titleEl);

      body.insertBefore(panels, body.firstChild);
      body.insertBefore(drawer, body.firstChild);
      body.insertBefore(overlay, body.firstChild);
      body.insertBefore(topbar, body.firstChild);

      var activeIndex = 0;
      function activate(idx) {
        if (idx < 0) idx = sections.length - 1;
        if (idx >= sections.length) idx = 0;
        activeIndex = idx;
        for (var i = 0; i < drawerItems.length; i++) {
          var on = (i === idx);
          panels.children[i].classList.toggle('active', on);
          drawerItems[i].classList.toggle('active', on);
        }
        window.scrollTo(0, 0);
        try { localStorage.setItem('enh-tab-' + location.pathname, String(idx)); } catch (e) {}
      }

      // ---- hamburger / drawer ----
      function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); burger.textContent = '\u2715'; }
      function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); burger.textContent = '\u2630'; }
      function toggleDrawer() { drawer.classList.contains('open') ? closeDrawer() : openDrawer(); }
      burger.addEventListener('click', toggleDrawer);
      overlay.addEventListener('click', closeDrawer);

      // ---- master show / hide all answers ----
      var allShown = false;
      answersBtn.addEventListener('click', function () {
        allShown = !allShown;
        for (var i = 0; i < answerBlocks.length; i++) setAnswer(answerToggles[i], answerBlocks[i], allShown);
        answersBtn.textContent = allShown ? 'Hide answers' : 'Show answers';
      });

      // ---- theme toggle ----
      function paintTheme() { themeBtn.textContent = docEl.classList.contains('enh-dark') ? '\u2600' : '\u263D'; }
      themeBtn.addEventListener('click', function () {
        docEl.classList.toggle('enh-dark');
        try { localStorage.setItem('enh-theme', docEl.classList.contains('enh-dark') ? 'dark' : 'light'); } catch (e) {}
        paintTheme();
      });
      paintTheme();

      // ---- keyboard: arrows switch chapters, Esc closes the menu ----
      document.addEventListener('keydown', function (e) {
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (e.key === 'Escape') { closeDrawer(); return; }
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowRight') { activate(activeIndex + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { activate(activeIndex - 1); e.preventDefault(); }
      });

      // ---- in-page links jump to the chapter holding the target ----
      panels.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;
        var raw = a.getAttribute('href').slice(1);
        var target = null;
        try { target = document.getElementById(decodeURIComponent(raw)); } catch (x) {}
        if (!target) target = document.getElementById(raw);
        if (!target) return;
        var panel = target.closest ? target.closest('.enh-panel') : null;
        if (!panel) return;
        var pIdx = Array.prototype.indexOf.call(panels.children, panel);
        if (pIdx >= 0) {
          e.preventDefault();
          activate(pIdx);
          setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
        }
      });

      // ---- open the last chapter the reader used ----
      var start = 0;
      try {
        var s = localStorage.getItem('enh-tab-' + location.pathname);
        if (s !== null && +s >= 0 && +s < sections.length) start = +s;
      } catch (e) {}
      activate(start);

      docEl.classList.add('enh-ready');
    } catch (err) {
      docEl.classList.add('enh-ready'); // never leave the page hidden
      if (window.console) console.error('enhance failed:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
