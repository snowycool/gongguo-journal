var dateUtils = require('./date');

var STORAGE_KEY = 'gongguo-grid-mini-v1';
var STATE_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultState() {
  return {
    version: STATE_VERSION,
    opening: 0,
    activeVowId: null,
    pendingNextVow: false,
    vows: [],
    days: {}
  };
}

function normalizeItem(item) {
  var text = String(item && item.text || '').trim();
  var points = Math.max(0, Math.floor(Number(item && item.points) || 0));
  return { text: text, points: text ? Math.max(1, points || 1) : 0 };
}

function normalizeDay(day, fallbackVowId) {
  var source = day && typeof day === 'object' ? day : {};
  return {
    goods: Array.isArray(source.goods) ? source.goods.map(normalizeItem).filter(function (item) { return item.text; }) : [],
    faults: Array.isArray(source.faults) ? source.faults.map(normalizeItem).filter(function (item) { return item.text; }) : [],
    completed: source.completed === true,
    vowId: Object.prototype.hasOwnProperty.call(source, 'vowId') ? source.vowId : fallbackVowId
  };
}

function normalizeVow(vow, index) {
  var value = vow && typeof vow === 'object' ? vow : {};
  var start = value.start || dateUtils.dateKey();
  return {
    id: value.id || 'vow-' + (index + 1),
    name: String(value.name || '未命名善愿').slice(0, 20),
    target: Math.min(1000000, Math.max(1, Math.floor(Number(value.target) || 1))),
    opening: Math.max(0, Math.floor(Number(value.opening) || 0)),
    start: start,
    createdAt: value.createdAt || start + 'T12:00:00+08:00',
    reason: String(value.reason || '').slice(0, 120),
    completedAt: value.completedAt || null
  };
}

function normalizeState(raw) {
  var source = raw && typeof raw === 'object' ? clone(raw) : createDefaultState();
  var vows = Array.isArray(source.vows) ? source.vows.map(normalizeVow) : [];

  if (!vows.length && source.vow) {
    vows = [normalizeVow(source.vow, 0)];
  }

  var state = {
    version: STATE_VERSION,
    opening: Math.max(0, Math.floor(Number(source.opening) || 0)),
    activeVowId: source.activeVowId || null,
    pendingNextVow: source.pendingNextVow === true,
    vows: vows,
    days: {}
  };

  if (!state.activeVowId && vows.length === 1 && !vows[0].completedAt) {
    state.activeVowId = vows[0].id;
  }

  if (state.activeVowId && !vows.some(function (vow) { return vow.id === state.activeVowId; })) {
    state.activeVowId = null;
  }

  var fallbackVowId = vows.length ? vows[0].id : null;
  var rawDays = source.days && typeof source.days === 'object' ? source.days : {};
  Object.keys(rawDays).forEach(function (key) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      state.days[key] = normalizeDay(rawDays[key], fallbackVowId);
    }
  });

  delete state.vow;
  return state;
}

function loadState() {
  // 读取失败时必须停止后续归一化与写回。否则临时读取异常会被当成
  // “首次使用”，空状态随后可能覆盖设备上原有的功过记录。
  var raw = wx.getStorageSync(STORAGE_KEY);
  var state = normalizeState(raw);
  syncVowCompletions(state, false);
  try {
    wx.setStorageSync(STORAGE_KEY, state);
  } catch (error) {
    // 页面保存时会再次提示用户，本次先返回内存状态。
  }
  return state;
}

function saveState(state, promptForNext) {
  var value = normalizeState(state);
  var changes = syncVowCompletions(value, promptForNext === true);
  wx.setStorageSync(STORAGE_KEY, value);
  return { state: value, completed: changes.completed, reopened: changes.reopened };
}

function pointSum(items) {
  return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
    return sum + Math.max(0, Math.floor(Number(item.points) || 0));
  }, 0);
}

function daySummary(day) {
  var value = day || { goods: [], faults: [] };
  var good = pointSum(value.goods);
  var fault = pointSum(value.faults);
  return { good: good, fault: fault, net: good - fault };
}

function addEvent(events, date, amount) {
  var points = Math.floor(Number(amount) || 0);
  if (!points) return;
  events[date] = (events[date] || 0) + points;
  if (!events[date]) delete events[date];
}

function chronologicalVows(state) {
  return state.vows.slice().sort(function (a, b) {
    var diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff || state.vows.indexOf(a) - state.vows.indexOf(b);
  });
}

// 每一愿只保留目标以内的功数，超出的净功按立愿顺序传给下一愿。
// 结余以日期事件传递，因此修改旧记录时，后续善愿会同步增减并重新判定满愿。
function settleVows(state) {
  var ordered = chronologicalVows(state);
  var settlements = {};
  var carryEvents = {};

  ordered.forEach(function (vow) {
    var events = {};
    var start = vow.start || dateUtils.dateKey();

    Object.keys(carryEvents).forEach(function (date) {
      addEvent(events, date < start ? start : date, carryEvents[date]);
    });
    addEvent(events, start, vow.opening);

    Object.keys(state.days).sort().forEach(function (date) {
      var day = state.days[date];
      if (day.vowId === vow.id) addEvent(events, date < start ? start : date, daySummary(day).net);
    });

    var balance = 0;
    var complete = false;
    var completedAt = null;
    var nextCarryEvents = {};

    Object.keys(events).sort().forEach(function (date) {
      var previousOverflow = Math.max(0, balance - vow.target);
      balance = Math.max(0, balance + events[date]);
      var nextOverflow = Math.max(0, balance - vow.target);
      addEvent(nextCarryEvents, date, nextOverflow - previousOverflow);

      if (balance >= vow.target) {
        if (!complete) completedAt = date;
        complete = true;
      } else {
        complete = false;
        completedAt = null;
      }
    });

    settlements[vow.id] = {
      progress: Math.min(vow.target, balance),
      overflow: Math.max(0, balance - vow.target),
      complete: complete,
      completedAt: complete ? completedAt : null
    };
    carryEvents = nextCarryEvents;
  });

  return { ordered: ordered, byId: settlements, carryEvents: carryEvents };
}

function vowProgress(state, vow) {
  if (!vow) return 0;
  var settlement = settleVows(state).byId[vow.id];
  return settlement ? settlement.progress : 0;
}

function vowFaults(state, vow) {
  if (!vow) return 0;
  return Object.keys(state.days).reduce(function (sum, key) {
    var day = state.days[key];
    return day.vowId === vow.id ? sum + pointSum(day.faults) : sum;
  }, 0);
}

function isVowComplete(state, vow) {
  if (!vow) return false;
  var settlement = settleVows(state).byId[vow.id];
  return Boolean(settlement && settlement.complete);
}

function activeVow(state) {
  var vow = state.vows.find(function (item) { return item.id === state.activeVowId; }) || null;
  return vow && !isVowComplete(state, vow) ? vow : null;
}

function latestVow(state) {
  var sorted = sortVows(state);
  return sorted.length ? sorted[0] : null;
}

function syncVowCompletions(state, promptForNext) {
  var completed = [];
  var reopened = [];
  var settlement = settleVows(state);

  settlement.ordered.forEach(function (vow) {
    var previousCompletedAt = vow.completedAt;
    var result = settlement.byId[vow.id];
    if (!previousCompletedAt && result.complete) completed.push(vow);
    if (previousCompletedAt && !result.complete) reopened.push(vow);
    vow.completedAt = result.completedAt;
  });

  var selected = state.vows.find(function (vow) { return vow.id === state.activeVowId; }) || null;
  if (reopened.length) {
    state.activeVowId = reopened[0].id;
  } else if (!selected || settlement.byId[selected.id].complete) {
    var next = settlement.ordered.find(function (vow) { return !settlement.byId[vow.id].complete; });
    state.activeVowId = next ? next.id : null;
  }

  if (reopened.length || state.activeVowId) {
    state.pendingNextVow = false;
  } else if (completed.length && promptForNext) {
    state.pendingNextVow = true;
  }
  return { completed: completed, reopened: reopened };
}

function sortVows(state) {
  return state.vows.slice().sort(function (a, b) {
    var diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return diff || state.vows.indexOf(b) - state.vows.indexOf(a);
  });
}

function createVowId() {
  return 'vow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function createVow(state, input) {
  var today = dateUtils.dateKey();
  var vow = normalizeVow({
    id: createVowId(),
    name: input.name,
    target: input.target,
    opening: 0,
    start: today,
    createdAt: new Date().toISOString(),
    reason: input.reason,
    completedAt: null
  }, state.vows.length);
  state.vows.push(vow);
  state.activeVowId = vow.id;
  state.pendingNextVow = false;
  return vow;
}

function updateVow(state, vowId, input) {
  var vow = state.vows.find(function (item) { return item.id === vowId; });
  if (!vow || isVowComplete(state, vow)) return false;
  vow.name = String(input.name || '').trim().slice(0, 20);
  vow.target = Math.min(1000000, Math.max(1, Math.floor(Number(input.target) || 1)));
  vow.reason = String(input.reason || '').trim().slice(0, 120);
  return true;
}

function monthSummary(state, year, monthIndex) {
  var prefix = dateUtils.monthPrefix(year, monthIndex);
  var dates = Object.keys(state.days).filter(function (key) { return key.indexOf(prefix) === 0; });
  var net = dates.reduce(function (sum, key) { return sum + daySummary(state.days[key]).net; }, 0);
  return { count: dates.length, net: net, dates: dates };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  createDefaultState: createDefaultState,
  normalizeState: normalizeState,
  loadState: loadState,
  saveState: saveState,
  pointSum: pointSum,
  daySummary: daySummary,
  settleVows: settleVows,
  vowProgress: vowProgress,
  vowFaults: vowFaults,
  isVowComplete: isVowComplete,
  activeVow: activeVow,
  latestVow: latestVow,
  syncVowCompletions: syncVowCompletions,
  sortVows: sortVows,
  createVow: createVow,
  updateVow: updateVow,
  monthSummary: monthSummary
};
