var tabSwipe = require('../../utils/tab-swipe').createHandlers(0);
var store = require('../../utils/store');
var storageFeedback = require('../../utils/storage-feedback');
var dateUtils = require('../../utils/date');
var share = require('../../utils/share');
var entryHistory = require('../../utils/entry-history');
var entrySequence = 0;

function entryKey() {
  entrySequence += 1;
  return 'entry-' + Date.now() + '-' + entrySequence;
}

function newItem() {
  return { _key: entryKey(), text: '', points: 0 };
}

function pointOptions() {
  var values = [];
  for (var i = 1; i <= 100; i += 1) values.push(i);
  return values;
}

function cloneItems(items) {
  return (items || []).map(function (item) {
    return { _key: item._key || entryKey(), text: item.text, points: item.points };
  });
}

function netClass(net) {
  return net > 0 ? 'positive' : net < 0 ? 'negative' : 'zero';
}

function netText(net) {
  return net > 0 ? '+' + net : String(net);
}

Page({
  onTabTouchStart: tabSwipe.start,
  onTabTouchMove: tabSwipe.move,
  onTabTouchEnd: tabSwipe.end,
  onTabTouchCancel: tabSwipe.cancel,
  onHide: tabSwipe.hide,

  data: {
    tabTransitionClass: '',
    dateKey: '',
    dateTitle: '',
    weekday: '',
    hasVow: false,
    vow: {},
    today: { good: 0, fault: 0, net: 0, netText: '0', netClass: 'zero', completed: false },
    reflectionVisible: false,
    pointOptions: pointOptions(),
    draft: { goods: [newItem()], faults: [newItem()] },
    entrySuggestions: { kind: '', key: '', items: [] },
    draftSummary: { good: 0, fault: 0, net: 0, netText: '0' }
  },

  onLoad: function () {
    this.setCurrentDate(new Date());
  },

  setCurrentDate: function (now) {
    var value = now || new Date();
    this.setData({
      dateKey: dateUtils.dateKey(value),
      dateTitle: dateUtils.chineseMonthDay(value),
      weekday: dateUtils.weekdayText(value)
    });
  },

  syncCurrentDate: function () {
    var now = new Date();
    var nextDateKey = dateUtils.dateKey(now);
    if (!this.data.dateKey || this.data.dateKey === nextDateKey) return true;

    if (!this.data.reflectionVisible) {
      this.setCurrentDate(now);
      return true;
    }

    if (this._crossDayPromptVisible) return false;
    this._crossDayPromptVisible = true;
    var page = this;
    var nextDateTitle = dateUtils.chineseMonthDay(now);
    wx.showModal({
      title: '已进入新的一天',
      content: '当前表单属于' + this.data.dateTitle + '。切换到' + nextDateTitle + '将关闭表单，未保存内容不会写入；也可以继续登记昨日。',
      confirmText: '切换今日',
      cancelText: '继续昨日',
      success: function (result) {
        page._crossDayPromptVisible = false;
        if (result.confirm) {
          page.setTabBarHidden(false);
          page.setData({ reflectionVisible: false, entrySuggestions: { kind: '', key: '', items: [] } });
          page.setCurrentDate(now);
        }
        page.renderPage();
      },
      fail: function () {
        page._crossDayPromptVisible = false;
        page.renderPage();
      }
    });
    return false;
  },

  onShow: function () {
    tabSwipe.show.call(this);
    share.showMenu(true);
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0, hidden: this.data.reflectionVisible });
    if (this.syncCurrentDate()) this.renderPage();
  },

  onShareAppMessage: share.appMessage,

  onShareTimeline: share.timeline,

  renderPage: function (savedState) {
    var page = this;
    var state = savedState || storageFeedback.load(this, function () { page.renderPage(); });
    if (!state) return;
    var vow = store.activeVow(state) || store.latestVow(state);
    var day = state.days[this.data.dateKey] || { goods: [], faults: [], completed: false };
    var summary = store.daySummary(day);
    var vowView = {};

    if (vow) {
      var current = store.vowProgress(state, vow);
      var complete = store.isVowComplete(state, vow);
      vowView = {
        id: vow.id,
        name: vow.name,
        current: current,
        complete: complete,
        remaining: Math.max(0, vow.target - current),
        percent: Math.min(100, Math.max(0, Math.round(current / vow.target * 1000) / 10)),
        startText: vow.start.split('-').join('.')
      };
    }

    this.state = state;
    this._storageReadFailed = false;
    this.setData({
      hasVow: Boolean(vow),
      vow: vowView,
      today: {
        good: summary.good,
        fault: summary.fault,
        net: summary.net,
        netText: netText(summary.net),
        netClass: netClass(summary.net),
        completed: day.completed === true
      }
    });
  },

  goToVows: function () {
    wx.switchTab({ url: '/pages/vows/index' });
  },

  startReflection: function () {
    var page = this;
    var state = storageFeedback.load(this, function () { page.startReflection(); });
    if (!state) return;
    var day = state.days[this.data.dateKey];
    var active = store.activeVow(state);
    var goods = day && day.goods && day.goods.length ? cloneItems(day.goods) : [newItem()];
    var faults = day && day.faults && day.faults.length ? cloneItems(day.faults) : [newItem()];
    this.state = state;
    this.entryHistory = entryHistory.load(state.days);
    this.entryEditOrder = { goods: [], faults: [] };
    this.draftVowId = day && Object.prototype.hasOwnProperty.call(day, 'vowId') ? day.vowId : active ? active.id : null;
    this.setTabBarHidden(true);
    this.setData({
      reflectionVisible: true,
      entrySuggestions: { kind: '', key: '', items: [] },
      draft: { goods: goods, faults: faults }
    });
    this.updateDraftSummary();
  },

  closeReflection: function () {
    this.setTabBarHidden(false);
    this.setData({ reflectionVisible: false, entrySuggestions: { kind: '', key: '', items: [] } });
    if (this.data.dateKey !== dateUtils.dateKey()) {
      this.setCurrentDate(new Date());
      this.renderPage();
    }
  },

  setTabBarHidden: function (hidden) {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0, hidden: hidden });
  },

  noop: function () {},

  dismissEntrySuggestions: function () {
    if (this.data.entrySuggestions.key) {
      this.setData({ entrySuggestions: { kind: '', key: '', items: [] } });
    }
  },

  showEntrySuggestions: function (kind, item) {
    this.setData({
      entrySuggestions: {
        kind: kind,
        key: item._key,
        items: entryHistory.suggest(this.entryHistory, kind, item.text)
      }
    });
  },

  trackEntryEdit: function (kind, key) {
    if (!this.entryEditOrder) this.entryEditOrder = { goods: [], faults: [] };
    this.entryEditOrder[kind] = this.entryEditOrder[kind].filter(function (value) { return value !== key; });
    this.entryEditOrder[kind].push(key);
  },

  editedHistoryDay: function () {
    var draft = this.data.draft;
    var order = this.entryEditOrder || { goods: [], faults: [] };
    function editedItems(kind) {
      return order[kind].map(function (key) {
        return draft[kind].find(function (item) { return item._key === key; });
      }).filter(function (item) { return item && item.text.trim(); });
    }
    return { goods: editedItems('goods'), faults: editedItems('faults') };
  },

  onEntryFocus: function (event) {
    var kind = event.currentTarget.dataset.kind;
    var index = Number(event.currentTarget.dataset.index);
    var list = this.data.draft[kind];
    if (list && list[index]) this.showEntrySuggestions(kind, list[index]);
  },

  chooseEntrySuggestion: function (event) {
    var suggestions = this.data.entrySuggestions;
    var text = suggestions.items[Number(event.currentTarget.dataset.suggestion)];
    if (typeof text !== 'string') return;
    var kind = suggestions.kind;
    var draft = this.data.draft;
    var index = (draft[kind] || []).findIndex(function (item) { return item._key === suggestions.key; });
    if (index < 0) return;
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind][index].text = text;
    next[kind][index].points = Math.max(1, Number(next[kind][index].points) || 1);
    this.trackEntryEdit(kind, suggestions.key);
    this.setData({ draft: next, entrySuggestions: { kind: '', key: '', items: [] } });
    this.updateDraftSummary();
  },

  onEntryTextInput: function (event) {
    var kind = event.currentTarget.dataset.kind;
    var index = Number(event.currentTarget.dataset.index);
    var draft = this.data.draft;
    var list = cloneItems(draft[kind]);
    var text = event.detail.value;
    list[index].text = text;
    list[index].points = text.trim() ? Math.max(1, Number(list[index].points) || 1) : 0;
    this.trackEntryEdit(kind, list[index]._key);
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind] = list;
    this.setData({ draft: next });
    this.updateDraftSummary();
    this.showEntrySuggestions(kind, list[index]);
  },

  onEntryPointsChange: function (event) {
    this.dismissEntrySuggestions();
    var kind = event.currentTarget.dataset.kind;
    var index = Number(event.currentTarget.dataset.index);
    var optionIndex = Number(event.detail.value);
    var draft = this.data.draft;
    var list = cloneItems(draft[kind]);
    var item = list[index];
    if (!item || !item.text.trim()) return;
    item.points = Number(this.data.pointOptions[optionIndex]) || 1;
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind] = list;
    this.setData({ draft: next });
    this.updateDraftSummary();
  },

  addEntry: function (event) {
    this.dismissEntrySuggestions();
    var kind = event.currentTarget.dataset.kind;
    var draft = this.data.draft;
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind].push(newItem());
    this.setData({ draft: next });
  },

  removeEntry: function (event) {
    this.dismissEntrySuggestions();
    var kind = event.currentTarget.dataset.kind;
    var index = Number(event.currentTarget.dataset.index);
    var draft = this.data.draft;
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind].splice(index, 1);
    if (!next[kind].length) next[kind].push(newItem());
    this.setData({ draft: next });
    this.updateDraftSummary();
  },

  updateDraftSummary: function () {
    var draft = this.data.draft;
    var cleanGoods = draft.goods.filter(function (item) { return item.text.trim(); });
    var cleanFaults = draft.faults.filter(function (item) { return item.text.trim(); });
    var good = store.pointSum(cleanGoods);
    var fault = store.pointSum(cleanFaults);
    this.setData({
      draftSummary: { good: good, fault: fault, net: good - fault, netText: netText(good - fault) }
    });
  },

  submitReflection: function () {
    var draft = this.data.draft;
    var submittedDateKey = this.data.dateKey;
    function clean(items) {
      return items.filter(function (item) { return item.text.trim(); }).map(function (item) {
        return {
          text: item.text.trim().slice(0, 100),
          points: Math.max(1, Math.min(10000, Math.floor(Number(item.points) || 1)))
        };
      });
    }

    var page = this;
    var state = storageFeedback.current(this, function () { page.submitReflection(); });
    if (!state) return;
    state = store.normalizeState(state);
    state.days[this.data.dateKey] = {
      goods: clean(draft.goods),
      faults: clean(draft.faults),
      completed: true,
      vowId: this.draftVowId || null
    };

    var result;
    try {
      result = store.saveState(state, true);
    } catch (error) {
      wx.showModal({ title: '保存失败', content: '本机存储暂时不可用，请稍后再试。', showCancel: false });
      return;
    }
    this.state = result.state;
    this.entryHistory = entryHistory.remember(this.entryHistory, this.editedHistoryDay());
    this.setTabBarHidden(false);
    this.setData({ reflectionVisible: false, entrySuggestions: { kind: '', key: '', items: [] } });
    if (submittedDateKey !== dateUtils.dateKey()) this.setCurrentDate(new Date());
    // 用已确认写入的状态刷新，避免保存后的读取异常被误报为保存失败。
    this.renderPage(result.state);
    if (result.reopened.length) {
      wx.showToast({ title: '记录已更新，善愿进度已重算', icon: 'none', duration: 1800 });
    } else if (result.completed.length) {
      if (result.state.pendingNextVow) {
        wx.showToast({ title: '善愿已满，立下一愿', icon: 'none', duration: 1600 });
        setTimeout(function () {
          wx.switchTab({ url: '/pages/vows/index' });
        }, 700);
      } else {
        wx.showToast({ title: '善愿已满，余功已顺延', icon: 'none', duration: 1800 });
      }
    } else {
      wx.showToast({ title: submittedDateKey === this.data.dateKey ? '今日功过已登记' : '昨日功过已登记', icon: 'success' });
    }
  }
});
