const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const store = require('../miniprogram/utils/store');
const history = require('../miniprogram/utils/entry-history');

const copy = value => JSON.parse(JSON.stringify(value));
let storage = {};
let modal;
let toasts = [];
let failMainWrite = false;
let failHistoryWrite = false;
global.wx = {
  getStorageSync(key) { return copy(storage[key] || null); },
  setStorageSync(key, value) {
    if ((key === store.STORAGE_KEY && failMainWrite) ||
        (key === history.STORAGE_KEY && failHistoryWrite)) throw new Error('storage full');
    storage[key] = copy(value);
  },
  removeStorageSync(key) { delete storage[key]; },
  showShareMenu() {},
  showToast(value) { toasts.push(value); },
  showModal(value) { modal = value; }
};

function pageInstance(route) {
  const filename = path.resolve(__dirname, '../miniprogram/pages', route, 'index.js');
  let page;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename), Page(options) { page = options; }, wx: global.wx,
    setTimeout() { throw new Error('本测试不应触发满愿跳转'); }
  }, { filename });
  const instance = Object.assign({}, page, {
    data: copy(page.data),
    setData(value) { Object.assign(this.data, copy(value)); },
    getTabBar() { return { setData() {} }; }
  });
  instance.onLoad();
  // 包括新增 focus 事件，所有模板事件必须绑定到实际函数。
  const template = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8');
  for (const match of template.matchAll(/\b(?:bind|catch)[a-z]+="([\w$]+)"/g)) {
    assert.strictEqual(typeof instance[match[1]], 'function', '未实现模板事件 ' + match[1]);
  }
  return instance;
}

function event(kind, index, value) {
  return { currentTarget: { dataset: { kind, index } }, detail: { value } };
}
function choose(page, index) {
  page.chooseEntrySuggestion({ currentTarget: { dataset: { suggestion: index } } });
}
function enter(page, kind, index, value) {
  page.onEntryTextInput(event(kind, index, value));
}

const state = store.createDefaultState();
state.days['2020-01-01'] = {
  goods: [{ text: '帮家人做饭', points: 3 }, { text: '帮同事整理资料', points: 8 }],
  faults: [{ text: '急躁发脾气', points: 2 }], completed: true, vowId: null
};
storage[store.STORAGE_KEY] = copy(state);
const page = pageInstance('today');
page.startReflection();
const before = copy(storage);
page.onEntryFocus(event('goods', 0));
assert.deepStrictEqual(page.data.entrySuggestions.items, ['帮同事整理资料', '帮家人做饭']);
enter(page, 'goods', 0, '帮家');
assert.deepStrictEqual(page.data.entrySuggestions.items, ['帮家人做饭']);
choose(page, 0);
assert.strictEqual(page.data.draft.goods[0].text, '帮家人做饭');
assert.strictEqual(page.data.draft.goods[0].points, 1, '选择内容不能带入旧分数');
assert.strictEqual(page.data.draftSummary.good, 1);
assert.strictEqual(page.data.entrySuggestions.key, '');
assert.deepStrictEqual(storage, before, '输入和选择不能提前写入存储');

page.onEntryPointsChange(event('goods', 0, 4));
enter(page, 'goods', 0, '帮');
choose(page, 0);
assert.strictEqual(page.data.draft.goods[0].points, 5, '选择建议保留当前分数');
page.addEntry(event('goods'));
enter(page, 'goods', 1, '给家人打电话');
enter(page, 'goods', 0, '帮邻居搬东西'); // 先编辑后面的行，再编辑前面的行。
page.onEntryFocus(event('faults', 0));
assert.deepStrictEqual(page.data.entrySuggestions.items, ['急躁发脾气']);
enter(page, 'faults', 0, '急');
choose(page, 0);
page.submitReflection();
assert.strictEqual(page.data.reflectionVisible, false);
assert.strictEqual(storage[store.STORAGE_KEY].days[page.data.dateKey].goods[0].points, 5);
assert.deepStrictEqual(storage[history.STORAGE_KEY].goods.slice(0, 2), ['帮邻居搬东西', '给家人打电话'],
  '最近实际编辑的内容应排在最前，不能仅按行号排序');
assert.strictEqual(storage[history.STORAGE_KEY].faults[0], '急躁发脾气');

const savedHistory = copy(storage[history.STORAGE_KEY]);
page.startReflection();
enter(page, 'goods', 0, '取消的草稿不应记住');
page.closeReflection();
assert.deepStrictEqual(storage[history.STORAGE_KEY], savedHistory);
page.startReflection();
assert.notStrictEqual(page.data.draft.goods[0].text, '取消的草稿不应记住');
page.addEntry(event('goods'));
page.onEntryFocus(event('goods', 2));
assert.ok(page.data.entrySuggestions.items.length);
page.removeEntry(event('goods', 0));
assert.strictEqual(page.data.entrySuggestions.key, '', '增删行后不能误填错行');
enter(page, 'goods', 1, '完全不匹配的文字');
assert.deepStrictEqual(page.data.entrySuggestions.items, []);
enter(page, 'goods', 1, '   ');
assert.strictEqual(page.data.draft.goods[1].points, 0);
page.dismissEntrySuggestions();
assert.strictEqual(page.data.entrySuggestions.key, '');

failMainWrite = true;
enter(page, 'goods', 0, '主记录保存失败');
page.submitReflection();
assert.strictEqual(modal.title, '保存失败');
assert.deepStrictEqual(storage[history.STORAGE_KEY], savedHistory, '保存失败不能记入输入历史');
failMainWrite = false;
failHistoryWrite = true;
modal = null;
enter(page, 'goods', 0, '历史写入失败仍保存功过');
page.submitReflection();
assert.strictEqual(modal, null);
assert.strictEqual(toasts[toasts.length - 1].title, '今日功过已登记');
assert.strictEqual(storage[store.STORAGE_KEY].days[page.data.dateKey].goods[0].text, '历史写入失败仍保存功过');
failHistoryWrite = false;

// 从真实清空入口验证确认前无副作用，并检查所有本地历史已移除。
const vows = pageInstance('vows');
vows.confirmClearData();
const beforeCancel = copy(storage);
modal.success({ confirm: false });
assert.deepStrictEqual(storage, beforeCancel);
const normalRemove = global.wx.removeStorageSync;
global.wx.removeStorageSync = function () { throw new Error('remove failed'); };
vows.confirmClearData();
modal.success({ confirm: true });
assert.strictEqual(modal.title, '清空失败');
assert.deepStrictEqual(storage, beforeCancel, '删除失败应报告失败并保留记录以便重试');
global.wx.removeStorageSync = normalRemove;
vows.confirmClearData();
modal.success({ confirm: true });
assert.strictEqual(storage[history.STORAGE_KEY], undefined);
assert.deepStrictEqual(storage[store.STORAGE_KEY].days, {});
page.startReflection();
page.onEntryFocus(event('goods', 0));
assert.deepStrictEqual(page.data.entrySuggestions.items, [], '清空后不能从内存恢复历史');

console.log('输入联想交互测试通过：旧记录、分类、填入、分数、编辑顺序、取消、保存失败与清空。');
