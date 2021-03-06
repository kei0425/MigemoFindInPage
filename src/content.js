
(function() {

if (document.contentType && !/html/i.test(document.contentType)) return;
/*
window.addEventListener('MigemoFIP.Activate', show_searchbar, false);
window.addEventListener('MigemoFIP.Inactivate', hide_searchbar, false);
window.addEventListener('MigemoFIP.Next', function() {cycle(1)}, false);
window.addEventListener('MigemoFIP.Previous', function() {cycle(-1)}, false);
*/

var PREFIX = 'migemo-find-in-page-';

var ACTIVATE_KEY = 191; // slash
var HIDE_KEY = 10077; // C-m
var FIND_NEXT_KEY = 10190; // C-.
var FIND_PREV_KEY = 10188; // C-,
window.addEventListener('keydown', function(e) {
  var ele = document.activeElement;
  var tag = ele.tagName.toLowerCase();
  //var onsearchbox = (ele.id === PREFIX + 'input');
  var oninput = (tag === 'textarea' || 
      (tag === 'input' && !/^(hidden|checkbox|checkbox|file|submit|image|reset|button)$/.test(ele.type)));

  var key = e.keyCode;
  if (e.shiftKey) key += 1000;
  if (e.ctrlKey) key += 10000;
  if (e.metaKey) key += 100000;
  if (e.altKey) key += 1000000;

  if (key === ACTIVATE_KEY && !oninput) {
    e.preventDefault();
    show_searchbar();
  } else if (key === HIDE_KEY) {
    e.preventDefault();
    hide_searchbar(); 
  } else if (key === FIND_NEXT_KEY) {
    e.preventDefault();
    cycle(1);
  } else if (key === FIND_PREV_KEY) {
    e.preventDefault();
    cycle(-1);
  }
}, false);

function show_searchbar() {
  var div = document.getElementById(PREFIX + 'box');
  if (div) {
    var input = div.getElementsByTagName('input')[0];
  } else {
    div = document.createElement('div');
    div.id = PREFIX + 'box';
    div.className = PREFIX + 'inactive' + ' ' + PREFIX + document.compatMode;
    var input = document.createElement('input');
    input.id = PREFIX + 'input';
    div.appendChild(input);
    var span = document.createElement('span');
    div.appendChild(span);
    document.body.appendChild(div);
    input.addEventListener('input', function() {start_search(input.value);}, false);
  }
  setTimeout(function() {// change class in another event, otherwise no transition occurs.
    div.className = PREFIX + 'active' + ' ' + PREFIX + document.compatMode;
    setTimeout(function() { // focus after transition ends, otherwise unnessary scroll occurs.
      input.focus();
      input.select();
      highlight();
      select_first_on_screen();
      update_info();
    }, 150);
  }, 0);
}

function hide_searchbar(e) {
  var div = document.getElementById(PREFIX + 'box');
  if (div) {
    div.className = PREFIX + 'inactive' + ' ' + PREFIX + document.compatMode;
    var input = div.getElementsByTagName('input')[0];
    input.blur();
  }
  unhighlight(true);
}

var MIGEMO_ID = 'pocnedlaincikkkcmlpcbipcflgjnjlj';
var prevquery = '';
var query = '';
var re;
var wait;

function start_search(q, retry) {
  query = q;
  retry = retry || 0;
  if (retry > 2 && query === prevquery) return;
  prevquery = query;

  clearTimeout(wait);
  wait = setTimeout(function() {
    var timer = setTimeout(function() {// retry case 1. no response
      if (query === q) start_search(query, retry + 1);
    }, 200);

    chrome.extension.sendRequest(
      MIGEMO_ID,
      {"action": "getRegExpString", "query": query},
      function(response) {
        if (response.error) console.log(response.error);
        clearTimeout(timer);
        if (response.query !== query) return; // already typed next letter
        if (response.query && !response.result) return start_search(query, retry + 1); // retry case 2. something went wrong on the server
        re = new RegExp('(' + response.result + ')', 'i');
        unhighlight();
        highlight();
        select_first_on_screen();
        update_info();
      }
    )
  }, 200);
}

var XPATH = '/html/body/descendant::text()[string-length(normalize-space(self::text())) > 0 and not(ancestor::textarea or ancestor::script or ancestor::style or ancestor::x:textarea or ancestor::x:script or ancestor::x:style) and not(ancestor::*[1][contains(concat(" ",normalize-space(@class)," "), " ' + PREFIX + 'found ")])]';
var NSResolver = function() {return 'http://www.w3.org/1999/xhtml'};
var expr = document.createExpression(XPATH, NSResolver);

function highlight() {
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  var textNodes = expr.evaluate(document, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  var range = document.createRange();  // will be used to create DocumentFragment
  range.selectNodeContents(document.body);
  var i = 0, tn, len;
  while (tn = textNodes.snapshotItem(i++)) {
    var texts = tn.nodeValue.split(re); // eg. 'abc'.split(/(b)/) => ['a', 'b', 'c']
    if ((len = texts.length) === 1) continue; // textNode doesn't match the regexp
    var html = '';
    for (var j = 0; j < len; ++j) {
      var t = htmlEscape(texts[j]);
      html += (j % 2) ? '<font class="' + PREFIX + 'found">' + t + '</font>' : t;
    }
    var df = range.createContextualFragment(html);
    tn.parentNode.replaceChild(df, tn);
  }
  document.addEventListener('DOMNodeInserted', node_inserted_handler, false);
}

function unhighlight(focus) {
  // if focus == true, select the "selected" text and focus the parent node (can only focus anchors)
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  var selected = document.getElementById(PREFIX + 'selected');
  if (selected) selected.className = '';

  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
  var i = 0, hl;
  while (hl = highlights[i++]) { // replace highlighted <font> with its textContent
    var p = hl.parentNode;
    p.replaceChild(document.createTextNode(hl.textContent), hl);
  }
  if (!selected) return document.body.normalize();

  var p = selected.parentNode;
  var text = document.createTextNode(selected.textContent);
  p.replaceChild(text, selected);
  if (!focus) return document.body.normalize();

  var range = document.createRange();
  range.setStartBefore(text);
  range.setEndAfter(text);
  window.getSelection().addRange(range);
  do {
    if (/^a(rea)?$/i.test(p.nodeName)) {
      p.focus(); // focus if p is an anchor
      break;
    }
  } while (p = p.parentNode);

  document.body.normalize();
}

function node_inserted_handler(e) {
  // DOMNodeInserted occurs synchronously, so if some process inserts a lot of nodes, this captures all of them and get's very slow.
  // so remove event listener once and deal with them later all at once
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false); 
  setTimeout(function() {
    highlight();
    update_info();
  }, 10);
}

// if any matched text is on current screen, select it. otherwise, don't select anything
function select_first_on_screen() { 
  var selected = document.getElementById(PREFIX + 'selected');
  if (selected) {
    if (is_viewable(selected)) return;
    else selected.id = '';
  }

  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
  var i = 0, hl;
  while (hl = highlights[i++]) {
    if (is_viewable(hl)) {
      hl.id = PREFIX + 'selected';
      break;
    }
  }
}

function is_viewable(elem) {
  var rects = elem.getClientRects();
  var boxid = PREFIX + 'box';
  var inputid = PREFIX + 'input';
  var i = 0;
  while (r = rects[i++]) {
    var e = document.elementFromPoint(r.left, r.top);
    if (e && (e === elem || e.id === boxid || e.id === inputid)) return true;

    var e = document.elementFromPoint(r.left, r.bottom - 1);
    if (e && (e === elem || e.id === boxid || e.id === inputid)) return true;

    var e = document.elementFromPoint(r.right - 1, r.top);
    if (e && (e === elem || e.id === boxid || e.id === inputid)) return true;

    var e = document.elementFromPoint(r.right - 1, r.bottom - 1);
    if (e && (e === elem || e.id === boxid || e.id === inputid)) return true;
  }
  return false;
}

function update_info() {
  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
  var len = highlights.length;
  var i = 0;
  if (len) {
    var selected = document.getElementById(PREFIX + 'selected');
    var hl;
    if (selected) {
      while (hl = highlights[i++]) {
        if (hl === selected) break;
      }
    }
  }
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  document.querySelector('#' + PREFIX + 'box > span').textContent = i + ' of ' + len;
  document.addEventListener('DOMNodeInserted', node_inserted_handler, false);
}

var timer;
function cycle(n) {
  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
  var len = highlights.length;
  if (!len) return;
  var selected = document.getElementById(PREFIX + 'selected');
  var i = n > 0 ? -1 : len;
  var hl;
  if (selected) {
    while (hl = highlights[i += n]) {
      if (hl === selected) break;
    }
    selected.id = '';
  }
  hl = highlights[i = (i + n + len) % len];
  hl.id = PREFIX + 'selected';
  selected = hl;

  clearTimeout(timer);
  timer = setTimeout(function() {
    hl.id = '';
    var mover = new Mover;
    try {
      do {
        mover.test_move(hl); // sync move
        if (is_viewable(hl)) {
          hl.id = PREFIX + 'selected';
          mover.start(hl); // async move
          break;
        }
        hl = highlights[i = (i + n + len) % len];
      } while (hl !== selected); // break if we come back to the originally selected item
    } finally {
      mover.release();
    }
    update_info();
  }, 20);
}

function Mover() {
  this.elements = []; // collection of tainted elements
  this.viewport = {left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight};
}

Mover.prototype.test_move = function(elem) {
  if (elem === document.body) return;
  var target = elem;
  this.elements.push(target);
  if (elem = target.mfip_container) {
    this.scroll_to(target, elem);
    this.test_move(elem);
    return;
  }
  elem = target;
  while (elem = elem.parentNode) {
    this.elements.push(elem);
    var s = elem.mfip_style || (elem.mfip_style = getComputedStyle(elem, null));
    if (elem === document.body || /auto|scroll/.test(s.overflowX + s.overflowY)) {
      target.mfip_container = elem;
      this.scroll_to(target, elem);
      this.test_move(elem);
      return;
    }
  }
}

Mover.prototype.scroll_to = function(target, origin, async) {
  var inner = target.getBoundingClientRect();
  if (!origin.mfip_original_scroll) origin.mfip_original_scroll = {top: origin.scrollTop, left: origin.scrollLeft};

  if (origin === document.body) {
    var outer = this.viewport;
  } else {
    var outer = origin.getBoundingClientRect();
  }
  var dx = (inner.left + inner.right) / 2 - (outer.left + outer.right) / 2;
  var dy = (inner.top + inner.bottom) / 2 - (outer.top + outer.bottom) / 2;
  if (!async) {
    origin.scrollLeft += dx;
    origin.scrollTop += dy;
  } else {
    if (outer.left <= inner.left && outer.right >= inner.right) dx = 0;
    if (outer.top <= inner.top && outer.bottom >= inner.bottom) dy = 0;
    if (dx || dy) new Tween(origin, {
      time: 0.1,
      delay: 0,
      scrollLeft: {
        to: origin.scrollLeft + dx
      },
      scrollTop: {
        to: origin.scrollTop + dy
      }
    });
  }
}

Mover.prototype.start = function(elem) {
  var target;
  while ((target = elem) && (elem = elem.mfip_container)) {
    elem.scrollLeft = elem.mfip_original_scroll.left; // move back to the original position
    elem.scrollTop = elem.mfip_original_scroll.top;
    this.scroll_to(target, elem, true);
  }
}

Mover.prototype.release = function() {
  var elems = this.elements, e;
  while (e = elems.pop()) {
    delete e.mfip_container;
    delete e.mfip_style;
    delete e.mfip_original_scroll;
  }
}

var html_unsafe_hash = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};
function htmlEscape(text) {
  return text.replace(/[<>&"']/g,function(s) {return html_unsafe_hash[s];});
}

// tween2.js : http://code.google.com/p/autopatchwork/source/browse/AutoPatchWork/tween2.js
// Tweener Like snippet
// var tw = new Tween(div.style,{time:1, onComplete:function(){},left:{to:0,from:100,tmpl:"$#px"}});
function Tween(item, opt) {
	var self = this, TIME = 10, time = (opt.time||1) * 1000, TM_EXP = /(\+)?\$([\#\d])/g, sets = [], isFilter,
		easing = opt.transition || function(t, b, c, d){return c*t/d + b;}, _T = {time:1,onComplete:1,transition:1,delay:1};
	for (var k in opt) if (!_T[k]) {
		var set = opt[k], from = set.from || parseFloat(item[k]) || 0, values = [], tmpl = set.tmpl || '$#';
		if (typeof item === 'function') {
			isFilter = true;
			sets.push({from:from, to:set.to});
		} else {
			sets.push({key:k, from:from, to:set.to, tmpl:tmpl});
		}
	}
	var L = sets.length, delay = opt.delay*1000 || 0, startTime = new Date()*1 + delay, run = function(){
		var now = new Date()*1, tim = self.prev = now - startTime;
		for (var k = 0; k < L; ++k) {
			var set = sets[k], val = easing(tim, set.from, set.to - set.from, time);
			if (isFilter) {
				item(val);
			} else {
				item[set.key] = set.tmpl.replace(TM_EXP,
				function(m, p, m1){return p && val < 0 ? 0 : (m1 == '#' ? val : val.toFixed(m1));});
			}
		}
		if (tim <= time) {self.T=setTimeout(function(){run.call(self);},TIME);}
		else {
			for (var k = 0; k < L; ++k) {
				if (isFilter) {
					item(sets[k].to);
				} else {
					item[sets[k].key] = sets[k].tmpl.replace(TM_EXP, sets[k].to);
				}
			}
			if (typeof opt.onComplete == 'function') opt.onComplete(item);
			self.end = true;
		}
	};
	self.prev = 0;
	this.restart = function(){
		startTime = new Date()*1 - self.prev;
		run();
	};
	this.pause = function(){
		if(self.T){
			clearTimeout(self.T);
			self.T = null;
		}
	};
	this.stop = function(){
		if(self.T){
			clearTimeout(self.T);
			self.T = null;
			self.prev = 0;
			for (var k = 0; k < L; ++k) {
				var set = sets[k], val = set.from;
				if (isFilter) {
					item(val);
				} else {
					item[set.key] = set.tmpl.replace(TM_EXP,
						function(m, p, m1){return p && val < 0 ? 0 : (m1 == '#' ? val : val.toFixed(m1));});
				}
			}
		}
	};
	delay ? this.T=setTimeout(function(){run();},delay) : run(0);
}

})();
