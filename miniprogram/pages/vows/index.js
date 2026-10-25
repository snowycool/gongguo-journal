var store = require('../../utils/store');
var dateUtils = require('../../utils/date');

function findTierIndex(options, name, target) {
  var targetText = String(target || '');
  for (var i = 0; i < options.length; i += 1) {
    if (options[i].name === name && options[i].target === targetText) return i;
  }
  return -1;
}

Page({
  data: {
    vows: [],
    hasActiveVow: false,
    formVisible: false,
    formTitle: '新增善愿',
    editingVowId: '',
    vowTierOptions: [
      { name: '百善愿', target: '100', reasonHint: '从一件小善开始，写下此愿的缘起' },
      { name: '千善愿', target: '1000', reasonHint: '愿日日积善，写下希望坚持的初心' },
      { name: '三千善愿', target: '3000', reasonHint: '仿了凡先生立三千善愿，写下自己的发愿缘起' },
      { name: '万善愿', target: '10000', reasonHint: '愿以长久善行成就大愿，写下初心与回向' }
    ],
    selectedTierIndex: -1,
    customTier: false,
    reasonPlaceholder: '请先选择善愿档次',
    tierMenuField: '',
    nameFocus: false,
    targetFocus: false,
    form: { name: '', target: '', reason: '' }
  },

  onLoad: function () {
    this.expanded = {};
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 2, hidden: this.data.formVisible });
    this.renderVows();
    if (this.state && this.state.pendingNextVow) {
      this.openNewVow(true);
    }
  },

  renderVows: function () {
    var state = store.loadState();
    var current = store.activeVow(state);
    var expanded = this.expanded || {};
    var vows = store.sortVows(state).map(function (vow) {
      var complete = store.isVowComplete(state, vow);
      var progress = store.vowProgress(state, vow);
      return {
        id: vow.id,
        name: vow.name,
        target: vow.target,
        current: progress,
        faults: store.vowFaults(state, vow),
        remaining: Math.max(0, vow.target - progress),
        percent: Math.min(100, Math.max(0, Math.round(progress / vow.target * 1000) / 10)),
        startText: dateUtils.fullDateText(vow.start),
        completedText: vow.completedAt ? dateUtils.fullDateText(vow.completedAt) : '',
        reason: vow.reason,
        complete: complete,
        active: current && current.id === vow.id,
        status: complete ? '已满愿' : current && current.id === vow.id ? '当前进行中' : '待继续',
        expanded: complete && expanded[vow.id] === true
      };
    });

    this.state = state;
    this.setData({ vows: vows, hasActiveVow: Boolean(current) });
  },

  toggleVow: function (event) {
    if (!event.currentTarget.dataset.complete) return;
    var id = event.currentTarget.dataset.id;
    this.expanded[id] = !this.expanded[id];
    this.renderVows();
  },

  activateVow: function (event) {
    var id = event.currentTarget.dataset.id;
    var state = this.state || store.loadState();
    var vow = state.vows.find(function (item) { return item.id === id; });
    if (!vow || store.isVowComplete(state, vow)) return;
    state.activeVowId = id;
    try {
      this.state = store.saveState(state, false).state;
      this.renderVows();
      wx.showToast({ title: '已设为当前善愿', icon: 'success' });
    } catch (error) {
      wx.showModal({ title: '保存失败', content: '本机存储暂时不可用，请稍后再试。', showCancel: false });
    }
  },

  openNewVow: function (automatic) {
    this.openedAutomatically = automatic === true;
    this.setTabBarHidden(true);
    this.setData({
      formVisible: true,
      formTitle: automatic === true ? '善愿已满 · 立下一愿' : '新增善愿',
      editingVowId: '',
      selectedTierIndex: -1,
      customTier: false,
      reasonPlaceholder: '请先选择善愿档次',
      tierMenuField: '',
      nameFocus: false,
      targetFocus: false,
      form: { name: '', target: '', reason: '' }
    });
  },

  openEditVow: function (event) {
    var id = event.currentTarget.dataset.id;
    var state = this.state || store.loadState();
    var vow = state.vows.find(function (item) { return item.id === id; });
    if (!vow || store.isVowComplete(state, vow)) {
      wx.showToast({ title: '满愿后不可调整', icon: 'none' });
      return;
    }
    var tierIndex = findTierIndex(this.data.vowTierOptions, vow.name, vow.target);
    this.openedAutomatically = false;
    this.setTabBarHidden(true);
    this.setData({
      formVisible: true,
      formTitle: '调整善愿',
      editingVowId: id,
      selectedTierIndex: tierIndex,
      customTier: tierIndex < 0,
      reasonPlaceholder: tierIndex >= 0 ? this.data.vowTierOptions[tierIndex].reasonHint : '请输入立愿缘起',
      tierMenuField: '',
      nameFocus: false,
      targetFocus: false,
      form: { name: vow.name, target: String(vow.target), reason: vow.reason }
    });
  },

  closeVowForm: function () {
    if (this.openedAutomatically && this.state && this.state.pendingNextVow) {
      this.state.pendingNextVow = false;
      try { this.state = store.saveState(this.state, false).state; } catch (error) {}
    }
    this.openedAutomatically = false;
    this.setTabBarHidden(false);
    this.setData({ formVisible: false });
    this.renderVows();
  },

  setTabBarHidden: function (hidden) {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 2, hidden: hidden });
  },

  noop: function () {},

  showTierMenu: function (event) {
    var field = event.currentTarget.dataset.field;
    if (field !== 'name' && field !== 'target') return;
    this.setData({
      tierMenuField: field,
      nameFocus: false,
      targetFocus: false
    });
  },

  closeTierMenu: function () {
    this.setData({ tierMenuField: '' });
  },

  onCustomInputBlur: function (event) {
    var field = event.currentTarget.dataset.field;
    if (field === 'name') this.setData({ nameFocus: false });
    if (field === 'target') this.setData({ targetFocus: false });
  },

  chooseVowTier: function (event) {
    var field = event.currentTarget.dataset.field;
    var custom = event.currentTarget.dataset.custom === true || event.currentTarget.dataset.custom === 'true';
    if (custom) {
      var focusUpdate = {
        'form.name': '',
        'form.target': '',
        selectedTierIndex: -1,
        customTier: true,
        reasonPlaceholder: '请输入立愿缘起',
        tierMenuField: '',
        nameFocus: field === 'name',
        targetFocus: field === 'target'
      };
      this.setData(focusUpdate);
      return;
    }
    var index = Number(event.currentTarget.dataset.index);
    var tier = this.data.vowTierOptions[index];
    if (!tier) return;
    this.setData({
      'form.name': tier.name,
      'form.target': tier.target,
      selectedTierIndex: index,
      customTier: false,
      reasonPlaceholder: tier.reasonHint,
      tierMenuField: '',
      nameFocus: false,
      targetFocus: false
    });
  },

  onNameInput: function (event) {
    this.setData({
      'form.name': event.detail.value,
      selectedTierIndex: -1,
      customTier: true,
      reasonPlaceholder: '请输入立愿缘起',
      tierMenuField: ''
    });
  },

  onTargetInput: function (event) {
    this.setData({
      'form.target': event.detail.value,
      selectedTierIndex: -1,
      customTier: true,
      reasonPlaceholder: '请输入立愿缘起',
      tierMenuField: ''
    });
  },

  onReasonInput: function (event) {
    this.setData({ 'form.reason': event.detail.value });
  },

  submitVow: function () {
    var form = this.data.form;
    var name = String(form.name || '').trim();
    var target = Math.floor(Number(form.target));
    var reason = String(form.reason || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写善愿名称', icon: 'none' });
      return;
    }
    if (!target || target < 1 || target > 1000000) {
      wx.showToast({ title: '目标善数须为正整数', icon: 'none' });
      return;
    }

    var state = this.state || store.loadState();
    var updated = true;
    if (this.data.editingVowId) {
      updated = store.updateVow(state, this.data.editingVowId, { name: name, target: target, reason: reason });
    } else {
      store.createVow(state, { name: name, target: target, reason: reason });
    }
    if (!updated) {
      wx.showToast({ title: '满愿后不可调整', icon: 'none' });
      this.setTabBarHidden(false);
      this.setData({ formVisible: false });
      return;
    }

    try {
      var result = store.saveState(state, true);
      this.state = result.state;
      this.openedAutomatically = false;
      this.setTabBarHidden(false);
      this.setData({ formVisible: false });
      this.renderVows();
      if (result.completed.length) {
        var page = this;
        wx.showToast({ title: '善愿已满，立下一愿', icon: 'none', duration: 1600 });
        setTimeout(function () { page.openNewVow(true); }, 500);
      } else {
        wx.showToast({ title: this.data.editingVowId ? '善愿已更新' : '新善愿已立', icon: 'success' });
      }
    } catch (error) {
      wx.showModal({ title: '保存失败', content: '本机存储暂时不可用，请稍后再试。', showCancel: false });
    }
  },

  confirmClearData: function () {
    var page = this;
    wx.showModal({
      title: '清空本机记录',
      content: '将删除全部功过与善愿，且无法恢复。确定继续吗？',
      confirmColor: '#a95847',
      success: function (result) {
        if (!result.confirm) return;
        try {
          wx.removeStorageSync(store.STORAGE_KEY);
          page.expanded = {};
          page.renderVows();
          wx.showToast({ title: '本机记录已清空', icon: 'success' });
        } catch (error) {
          wx.showModal({ title: '清空失败', content: '请稍后再试。', showCancel: false });
        }
      }
    });
  }
});
