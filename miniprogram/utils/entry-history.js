var STORAGE_KEY = 'gongguo-grid-entry-history-v1';
var MAX_HISTORY = 200;
var MAX_TEXT_LENGTH = 100;
var KINDS = ['goods', 'faults'];

function isKind(kind) {
  return kind === 'goods' || kind === 'faults';
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  var text = value.trim();
  return text ? text.slice(0, MAX_TEXT_LENGTH) : '';
}

function normalizeList(value) {
  var result = [];
  if (!Array.isArray(value)) return result;
  value.forEach(function (item) {
    var text = normalizeText(item);
    if (text && result.indexOf(text) < 0 && result.length < MAX_HISTORY) result.push(text);
  });
  return result;
}

function emptyHistory() {
  return { goods: [], faults: [] };
}

function normalizeHistory(value) {
  var result = emptyHistory();
  if (!value || typeof value !== 'object') return result;
  KINDS.forEach(function (kind) {
    result[kind] = normalizeList(value[kind]);
  });
  return result;
}

function appendDays(history, days) {
  if (!days || typeof days !== 'object') return history;
  var dates = Object.keys(days).filter(function (key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(key);
  }).sort().reverse();

  dates.forEach(function (date) {
    var day = days[date];
    if (!day || typeof day !== 'object') return;
    KINDS.forEach(function (kind) {
      var items = Array.isArray(day[kind]) ? day[kind].slice().reverse() : [];
      items.forEach(function (item) {
        var text = normalizeText(item && typeof item === 'object' ? item.text : item);
        if (text && history[kind].indexOf(text) < 0 && history[kind].length < MAX_HISTORY) {
          history[kind].push(text);
        }
      });
    });
  });
  return history;
}

function load(days) {
  var raw = null;
  try {
    raw = wx.getStorageSync(STORAGE_KEY);
  } catch (error) {
    raw = null;
  }
  return appendDays(normalizeHistory(raw), days);
}

function suggest(history, kind, text) {
  if (!isKind(kind)) return [];
  var query = normalizeText(text).toLowerCase();
  var result = [];
  var list = normalizeList(history && history[kind]);
  list.forEach(function (item) {
    var normalized = item.toLowerCase();
    if (query && normalized === query) return;
    if (!query || normalized.indexOf(query) >= 0) {
      result.push(item);
    }
  });
  return result.slice(0, 5);
}

function mergeRecent(list, recent) {
  var result = [];
  recent.forEach(function (text) {
    if (text && result.indexOf(text) < 0) result.push(text);
  });
  list.forEach(function (text) {
    if (text && result.indexOf(text) < 0 && result.length < MAX_HISTORY) result.push(text);
  });
  return result.slice(0, MAX_HISTORY);
}

function remember(history, day) {
  var current = normalizeHistory(history);
  var result = emptyHistory();
  KINDS.forEach(function (kind) {
    var recent = [];
    var items = day && Array.isArray(day[kind]) ? day[kind].slice().reverse() : [];
    items.forEach(function (item) {
      var text = normalizeText(item && typeof item === 'object' ? item.text : item);
      if (text && recent.indexOf(text) < 0) recent.push(text);
    });
    result[kind] = mergeRecent(current[kind], recent);
  });
  try {
    wx.setStorageSync(STORAGE_KEY, result);
  } catch (error) {
    // 历史建议写入失败不应影响已经保存的功过记录。
  }
  return result;
}

function clear() {
  wx.removeStorageSync(STORAGE_KEY);
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  load: load,
  suggest: suggest,
  remember: remember,
  clear: clear
};
