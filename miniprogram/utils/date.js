function pad2(value) {
  return String(value).length < 2 ? '0' + value : String(value);
}

function dateKey(date) {
  var value = date || new Date();
  return [value.getFullYear(), pad2(value.getMonth() + 1), pad2(value.getDate())].join('-');
}

function parseDateKey(key) {
  var parts = String(key || '').split('-').map(Number);
  return new Date(parts[0], Math.max(0, parts[1] - 1), parts[2] || 1, 12, 0, 0);
}

function chineseMonthDay(date) {
  var value = date || new Date();
  return (value.getMonth() + 1) + '月' + value.getDate() + '日';
}

function weekdayText(date) {
  var names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return names[(date || new Date()).getDay()];
}

function fullDateText(key) {
  var value = parseDateKey(key);
  return value.getFullYear() + '年' + (value.getMonth() + 1) + '月' + value.getDate() + '日';
}

function monthPrefix(year, monthIndex) {
  return year + '-' + pad2(monthIndex + 1) + '-';
}

module.exports = {
  pad2: pad2,
  dateKey: dateKey,
  parseDateKey: parseDateKey,
  chineseMonthDay: chineseMonthDay,
  weekdayText: weekdayText,
  fullDateText: fullDateText,
  monthPrefix: monthPrefix
};
