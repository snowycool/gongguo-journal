Component({
  data: {
    selected: 0,
    hidden: false,
    tabs: [
      { pagePath: '/pages/today/index', text: '今日', seal: '日' },
      { pagePath: '/pages/ledger/index', text: '功过簿', seal: '簿' },
      { pagePath: '/pages/vows/index', text: '善愿', seal: '愿' }
    ]
  },

  lifetimes: {
    attached: function () {
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show: function () {
      this.syncSelected();
    }
  },

  methods: {
    syncSelected: function () {
      var pages = getCurrentPages();
      var route = pages.length ? '/' + pages[pages.length - 1].route : '';
      var index = this.data.tabs.findIndex(function (item) {
        return item.pagePath === route;
      });
      if (index >= 0 && index !== this.data.selected) {
        this.setData({ selected: index });
      }
    },

    switchTab: function (event) {
      var index = Number(event.currentTarget.dataset.index);
      var tab = this.data.tabs[index];
      if (!tab || index === this.data.selected) return;
      this.setData({ selected: index });
      wx.switchTab({ url: tab.pagePath });
    }
  }
});
