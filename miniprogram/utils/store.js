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
  var raw;
  try {
    raw = wx.getStorageSync(STORAGE_KEY);
  } catch (error) {
    raw = null;
  }
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
  var completed = syncVowCompletions(value, promptForNext === true);
  wx.setStorageSync(STORAGE_KEY, value);
  return { state: value, completed: completed };
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

function vowProgress(state, vow) {
  if (!vow) return 0;
  var progress = (Number(vow.opening) || 0) + Object.keys(state.days).reduce(function (sum, key) {
    var day = state.days[key];
    if (day.vowId !== vow.id) return sum;
    var summary = daySummary(day);
    return sum + summary.net;
  }, 0);
  return Math.max(0, progress);
}

function vowFaults(state, vow) {
  if (!vow) return 0;
  return Object.keys(state.days).reduce(function (sum, key) {
    var day = state.days[key];
    return day.vowId === vow.id ? sum + pointSum(day.faults) : sum;
  }, 0);
}

function isVowComplete(state, vow) {
  return Boolean(vow && (vow.completedAt || vowProgress(state, vow) >= Number(vow.target)));
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
  state.vows.forEach(function (vow) {
    if (!vow.completedAt && vowProgress(state, vow) >= vow.target) {
      vow.completedAt = dateUtils.dateKey();
      completed.push(vow);
    }
  });
  var selected = state.vows.find(function (vow) { return vow.id === state.activeVowId; });
  if (selected && isVowComplete(state, selected)) {
    state.activeVowId = null;
  }
  if (completed.length && promptForNext) state.pendingNextVow = true;
  return completed;
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
