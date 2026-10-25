var store = require('../../utils/store');
var dateUtils = require('../../utils/date');
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
  data: {
    dateKey: '',
    dateTitle: '',
    weekday: '',
    hasVow: false,
    vow: {},
    today: { good: 0, fault: 0, net: 0, netText: '0', netClass: 'zero', completed: false },
    reflectionVisible: false,
    pointOptions: pointOptions(),
    draft: { goods: [newItem()], faults: [newItem()] },
    draftSummary: { good: 0, fault: 0, net: 0, netText: '0' }
  },

  onLoad: function () {
    var now = new Date();
    this.setData({
      dateKey: dateUtils.dateKey(now),
      dateTitle: dateUtils.chineseMonthDay(now),
      weekday: dateUtils.weekdayText(now)
    });
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0, hidden: this.data.reflectionVisible });
    this.renderPage();
  },

  renderPage: function () {
    var state = store.loadState();
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
    var state = store.loadState();
    var day = state.days[this.data.dateKey];
    var active = store.activeVow(state);
    var goods = day && day.goods && day.goods.length ? cloneItems(day.goods) : [newItem()];
    var faults = day && day.faults && day.faults.length ? cloneItems(day.faults) : [newItem()];
    this.state = state;
    this.draftVowId = day && Object.prototype.hasOwnProperty.call(day, 'vowId') ? day.vowId : active ? active.id : null;
    this.setTabBarHidden(true);
    this.setData({
      reflectionVisible: true,
      draft: { goods: goods, faults: faults }
    });
    this.updateDraftSummary();
  },

  closeReflection: function () {
    this.setTabBarHidden(false);
    this.setData({ reflectionVisible: false });
  },

  setTabBarHidden: function (hidden) {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0, hidden: hidden });
  },

  noop: function () {},

  onEntryTextInput: function (event) {
    var kind = event.currentTarget.dataset.kind;
    var index = Number(event.currentTarget.dataset.index);
    var draft = this.data.draft;
    var list = cloneItems(draft[kind]);
    var text = event.detail.value;
    list[index].text = text;
    list[index].points = text.trim() ? Math.max(1, Number(list[index].points) || 1) : 0;
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind] = list;
    this.setData({ draft: next });
    this.updateDraftSummary();
  },

  onEntryPointsChange: function (event) {
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
    var kind = event.currentTarget.dataset.kind;
    var draft = this.data.draft;
    var next = { goods: cloneItems(draft.goods), faults: cloneItems(draft.faults) };
    next[kind].push(newItem());
    this.setData({ draft: next });
  },

  removeEntry: function (event) {
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
    function clean(items) {
      return items.filter(function (item) { return item.text.trim(); }).map(function (item) {
        return {
          text: item.text.trim().slice(0, 100),
          points: Math.max(1, Math.min(10000, Math.floor(Number(item.points) || 1)))
        };
      });
    }

    var state = this.state || store.loadState();
    state.days[this.data.dateKey] = {
      goods: clean(draft.goods),
      faults: clean(draft.faults),
      completed: true,
      vowId: this.draftVowId || null
    };

    try {
      var result = store.saveState(state, true);
      this.state = result.state;
      this.setTabBarHidden(false);
      this.setData({ reflectionVisible: false });
      this.renderPage();
      if (result.completed.length) {
        wx.showToast({ title: '善愿已满，立下一愿', icon: 'none', duration: 1600 });
        setTimeout(function () {
          wx.switchTab({ url: '/pages/vows/index' });
        }, 700);
      } else {
        wx.showToast({ title: '今日功过已登记', icon: 'success' });
      }
    } catch (error) {
      wx.showModal({ title: '保存失败', content: '本机存储暂时不可用，请稍后再试。', showCancel: false });
    }
  }
});
