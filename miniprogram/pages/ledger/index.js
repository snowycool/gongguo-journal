var store = require('../../utils/store');
var dateUtils = require('../../utils/date');

function displayNet(net, hasRecord) {
  if (!hasRecord) return '—';
  return net > 0 ? '+' + net : String(net);
}

function netClass(net, hasRecord) {
  if (!hasRecord) return '';
  return net > 0 ? 'positive' : net < 0 ? 'negative' : 'zero';
}

Page({
  data: {
    mode: 'month',
    year: 0,
    month: 0,
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    monthSummary: { count: 0, net: 0, netText: '—', netClass: '' },
    calendarCells: [],
    yearMonths: [],
    detailVisible: false,
    detail: { title: '', good: 0, fault: 0, netText: '0', goods: [], faults: [] }
  },

  onLoad: function () {
    var now = new Date();
    this.setData({ year: now.getFullYear(), month: now.getMonth() });
  },

  onShow: function () {
    var tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 1 });
    this.renderLedger();
  },

  changeMode: function (event) {
    this.setData({ mode: event.currentTarget.dataset.mode });
    this.renderLedger();
  },

  previousMonth: function () {
    var date = new Date(this.data.year, this.data.month - 1, 1, 12, 0, 0);
    this.setData({ year: date.getFullYear(), month: date.getMonth() });
    this.renderMonth();
  },

  nextMonth: function () {
    var date = new Date(this.data.year, this.data.month + 1, 1, 12, 0, 0);
    this.setData({ year: date.getFullYear(), month: date.getMonth() });
    this.renderMonth();
  },

  previousYear: function () {
    this.setData({ year: this.data.year - 1 });
    this.renderYear();
  },

  nextYear: function () {
    this.setData({ year: this.data.year + 1 });
    this.renderYear();
  },

  selectYearMonth: function (event) {
    this.setData({ mode: 'month', month: Number(event.currentTarget.dataset.month) });
    this.renderMonth();
  },

  renderLedger: function () {
    this.state = store.loadState();
    if (this.data.mode === 'year') this.renderYear();
    else this.renderMonth();
  },

  renderMonth: function () {
    var state = this.state || store.loadState();
    var year = this.data.year;
    var month = this.data.month;
    var summary = store.monthSummary(state, year, month);
    var firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    var dayCount = new Date(year, month + 1, 0).getDate();
    var today = dateUtils.dateKey();
    var cells = [];
    var index;

    for (index = 0; index < firstOffset; index += 1) {
      cells.push({ key: 'blank-start-' + index, blank: true });
    }

    for (index = 1; index <= dayCount; index += 1) {
      var key = year + '-' + dateUtils.pad2(month + 1) + '-' + dateUtils.pad2(index);
      var day = state.days[key];
      var dayValue = day ? store.daySummary(day) : { net: 0 };
      cells.push({
        key: key,
        blank: false,
        day: index,
        date: key,
        today: key === today,
        hasEntry: Boolean(day),
        netText: displayNet(dayValue.net, Boolean(day)),
        netClass: netClass(dayValue.net, Boolean(day))
      });
    }

    while (cells.length % 7) {
      cells.push({ key: 'blank-end-' + cells.length, blank: true });
    }

    this.setData({
      monthSummary: {
        count: summary.count,
        net: summary.net,
        netText: displayNet(summary.net, summary.count > 0),
        netClass: netClass(summary.net, summary.count > 0)
      },
      calendarCells: cells
    });
  },

  renderYear: function () {
    var state = this.state || store.loadState();
    var year = this.data.year;
    var now = new Date();
    var months = [];
    for (var month = 0; month < 12; month += 1) {
      var summary = store.monthSummary(state, year, month);
      months.push({
        month: month,
        count: summary.count,
        net: summary.net,
        netText: displayNet(summary.net, summary.count > 0),
        netClass: netClass(summary.net, summary.count > 0),
        current: year === now.getFullYear() && month === now.getMonth()
      });
    }
    this.setData({ yearMonths: months });
  },

  openDayDetail: function (event) {
    if (!event.currentTarget.dataset.entry) return;
    var key = event.currentTarget.dataset.date;
    var state = this.state || store.loadState();
    var day = state.days[key];
    if (!day) return;
    var summary = store.daySummary(day);
    this.setData({
      detailVisible: true,
      detail: {
        title: dateUtils.fullDateText(key),
        good: summary.good,
        fault: summary.fault,
        netText: displayNet(summary.net, true),
        goods: day.goods.map(function (item, index) { return Object.assign({ _key: key + '-good-' + index }, item); }),
        faults: day.faults.map(function (item, index) { return Object.assign({ _key: key + '-fault-' + index }, item); })
      }
    });
  },

  closeDayDetail: function () {
    this.setData({ detailVisible: false });
  },

  noop: function () {}
});
