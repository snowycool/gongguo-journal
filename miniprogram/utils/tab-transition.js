var TAB_PATHS = ['/pages/today/index', '/pages/ledger/index', '/pages/vows/index'];
var LEAVE_DURATION = 110;
var ENTER_DURATION = 230;
var active = null;
var lastIndex = null;

function clearPage(page) {
  if (!page) return;
  page._tabSwipeSwitching = false;
  page.setData({ tabTransitionClass: '' });
}

function finish(transition) {
  if (active !== transition) return;
  clearTimeout(transition.leaveTimer);
  clearTimeout(transition.enterTimer);
  clearTimeout(transition.fallbackTimer);
  clearPage(transition.source);
  clearPage(transition.target);
  active = null;
}

function switchTab(from, to, page) {
  if (active || !TAB_PATHS[to] || from === to || !page) return false;
  if (page.data.reflectionVisible || page.data.detailVisible || page.data.formVisible) return false;
  var transition = {
    source: page, to: to, direction: to > from ? 'next' : 'previous', phase: 'leaving'
  };
  active = transition;
  page._tabSwipeSwitching = true;
  page.setData({ tabTransitionClass: 'tab-card-leave-' + transition.direction }, function () {
    if (active !== transition) return;
    // 等视图收到离场样式后再计时，避免低速设备直接跳页。
    transition.leaveTimer = setTimeout(function () {
      if (active !== transition) return;
      transition.phase = 'switching';
      wx.switchTab({
        url: TAB_PATHS[to],
        fail: function () { finish(transition); },
        complete: function () {
          if (active === transition && !transition.target) {
            transition.fallbackTimer = setTimeout(function () { finish(transition); }, 500);
          }
        }
      });
    }, LEAVE_DURATION);
  });
  return true;
}

function show(page, index) {
  var previous = lastIndex;
  lastIndex = index;
  var transition = active;
  if (!transition || transition.to !== index) {
    if (transition) finish(transition);
    if (previous === null || previous === index) {
      clearPage(page);
      return;
    }
    transition = { to: index, direction: index > previous ? 'next' : 'previous' };
    active = transition;
  }
  clearTimeout(transition.fallbackTimer);
  transition.target = page;
  transition.phase = 'entering';
  page.setData({ tabTransitionClass: 'tab-card-enter-' + transition.direction }, function () {
    if (active !== transition) return;
    transition.enterTimer = setTimeout(function () { finish(transition); }, ENTER_DURATION);
  });
}

function hide(page) {
  var transition = active;
  if (transition && ((transition.source === page && transition.phase === 'leaving') ||
      transition.target === page)) finish(transition);
  clearPage(page);
}

module.exports = {
  switchTab: switchTab,
  show: show,
  hide: hide,
  isBusy: function () { return Boolean(active); }
};
