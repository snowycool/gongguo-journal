const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const copy = value => JSON.parse(JSON.stringify(value));
const store = require('../miniprogram/utils/store');
const todayKey = require('../miniprogram/utils/date').dateKey();

let storage = {};
let failRead = false;
let failWrite = false;
let reads = 0;
let writes = 0;
let modal = null;
let modalCount = 0;
let toasts = [];

global.wx = {
  getStorageSync(key) {
    if (key === store.STORAGE_KEY) reads += 1;
    if (failRead && key === store.STORAGE_KEY) throw new Error('storage read failed');
    return copy(storage[key] || null);
  },
  setStorageSync(key, value) {
    if (failWrite && key === store.STORAGE_KEY) throw new Error('storage write failed');
    writes += 1;
    storage[key] = copy(value);
  },
  removeStorageSync(key) { delete storage[key]; },
  showShareMenu() {},
  showToast(value) { toasts.push(value); },
  showModal(value) { modalCount += 1; modal = value; }
};

function pageInstance(route) {
  const filename = path.resolve(__dirname, '../miniprogram/pages', route, 'index.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    Page(options) { definition = options; },
    wx: global.wx,
    setTimeout() {}
  }, { filename });
  const instance = Object.assign({}, definition, {
    data: copy(definition.data),
    setData(value) {
      Object.keys(value).forEach((key) => {
        if (key.indexOf('.') < 0) this.data[key] = copy(value[key]);
        else {
          const parts = key.split('.');
          let target = this.data;
          for (let index = 0; index < parts.length - 1; index += 1) target = target[parts[index]];
          target[parts[parts.length - 1]] = copy(value[key]);
        }
      });
    },
    getTabBar() { return { setData() {} }; }
  });
  instance.onLoad();
  return instance;
}

function resolveModal(confirm) {
  assert.ok(modal, '应显示本机数据读取提示');
  const current = modal;
  modal = null;
  current.success({ confirm });
}

const initial = store.createDefaultState();
const vow = store.createVow(initial, { name: '测试善愿', target: 1, reason: '' });
initial.pendingNextVow = true;
initial.days[todayKey] = {
  goods: [{ text: '已保存记录', points: 2 }], faults: [], completed: true, vowId: vow.id
};
storage[store.STORAGE_KEY] = copy(initial);

// 三个页面的生命周期都应把读取异常转成可取消的提示，且不得写回空状态。
const before = copy(storage[store.STORAGE_KEY]);
const beforeWrites = writes;
failRead = true;
const today = pageInstance('today');
const ledger = pageInstance('ledger');
const vows = pageInstance('vows');
assert.doesNotThrow(() => today.onShow());
assert.strictEqual(today.data.reflectionVisible, false);
assert.strictEqual(modal.title, '暂时无法读取记录');
resolveModal(false);
assert.strictEqual(writes, beforeWrites);
assert.deepStrictEqual(storage[store.STORAGE_KEY], before);

modal = null;
assert.doesNotThrow(() => ledger.onShow());
resolveModal(false);
modal = null;
assert.doesNotThrow(() => vows.onShow());
assert.strictEqual(vows.data.formVisible, false, '读取失败时不能自动打开下一愿表单');
resolveModal(false);

// 确认重试只在存储恢复后执行一次；连续失败不会递归重试或重复弹窗。
modal = null;
assert.doesNotThrow(() => today.onShow());
const readsBeforeRetry = reads;
const promptsBeforeRetry = modalCount;
assert.doesNotThrow(() => today.onShow());
assert.strictEqual(reads, readsBeforeRetry + 1, '生命周期重入只进行本次读取，不自动循环重试');
assert.strictEqual(modalCount, promptsBeforeRetry, '同一提示未处理前不能重复弹窗');
assert.ok(modal);
failRead = false;
resolveModal(true);
assert.ok(today.state);
assert.strictEqual(today.data.today.good, 2);

// 善愿页恢复读取后才处理 pendingNextVow。
modal = null;
failRead = true;
assert.doesNotThrow(() => vows.onShow());
assert.strictEqual(vows.data.formVisible, false);
failRead = false;
resolveModal(true);
assert.strictEqual(vows.data.formVisible, true);
vows.data.form = { name: '恢复前已填写的善愿', target: '20', reason: '保留缘起' };
failRead = true;
vows.onShow();
failRead = false;
resolveModal(true);
assert.strictEqual(vows.data.form.name, '恢复前已填写的善愿', '读取恢复后不能重新打开空表单覆盖草稿');
vows.closeVowForm();

// 保存已成功后，刷新使用已写入状态，读取异常不能误报为“保存失败”。
today.startReflection();
today.data.draft.goods[0].text = '保存后无需重读';
today.data.draft.goods[0].points = 1;
failRead = true;
modal = null;
const writesBeforeSubmit = writes;
const readsBeforeSubmit = reads;
today.submitReflection();
assert.strictEqual(today.data.reflectionVisible, false);
assert.strictEqual(modal, null);
assert.strictEqual(reads, readsBeforeSubmit, '保存后刷新无需重新读取主记录');
assert.strictEqual(toasts[toasts.length - 1].title, '今日功过已登记');
assert.strictEqual(writes, writesBeforeSubmit + 2, '主记录和输入历史各写入一次');
assert.strictEqual(storage[store.STORAGE_KEY].days[today.data.dateKey].goods[0].text, '保存后无需重读');
failRead = false;

// 页面已有缓存时，如果一次刷新读取失败，提交也必须再次读取而不能用旧缓存覆盖新记录。
today.startReflection();
today.data.draft.goods[0].text = '等待恢复后保存';
today.data.draft.goods[0].points = 1;
failRead = true;
modal = null;
today.renderPage();
resolveModal(false);
const beforeSubmitReadFailure = copy(storage[store.STORAGE_KEY]);
const writesBeforeSubmitReadFailure = writes;
today.submitReflection();
assert.strictEqual(writes, writesBeforeSubmitReadFailure, '提交前读取失败不得写入旧缓存');
assert.deepStrictEqual(storage[store.STORAGE_KEY], beforeSubmitReadFailure);
assert.strictEqual(today.data.reflectionVisible, true);
assert.strictEqual(modal.title, '暂时无法读取记录');
// 读取恢复期间，模拟另一个页面已经写入了一条新日期记录。
storage[store.STORAGE_KEY].days['2001-01-01'] = {
  goods: [{ text: '恢复期间新增记录', points: 4 }], faults: [], completed: true, vowId: null
};
failRead = false;
resolveModal(true);
assert.strictEqual(today.data.reflectionVisible, false);
assert.strictEqual(storage[store.STORAGE_KEY].days['2001-01-01'].goods[0].text, '恢复期间新增记录');
assert.strictEqual(storage[store.STORAGE_KEY].days[today.data.dateKey].goods[0].text, '等待恢复后保存');

// 真正写入失败时，表单必须保留，方便用户重试；失败的善愿创建不能重复写入内存状态。
today.startReflection();
today.data.draft.goods[0].text = '写入失败后仍在表单';
failWrite = true;
modal = null;
today.submitReflection();
assert.strictEqual(today.data.reflectionVisible, true);
assert.strictEqual(modal.title, '保存失败');
failWrite = false;

vows.state = store.loadState();
vows.openNewVow(false);
vows.data.form = { name: '不会重复创建', target: '10', reason: '' };
failWrite = true;
modal = null;
vows.submitVow();
assert.strictEqual(vows.data.formVisible, true);
assert.strictEqual(modal.title, '保存失败');
assert.strictEqual(vows.state.vows.filter(item => item.name === '不会重复创建').length, 0);
failWrite = false;
failRead = true;
modal = null;
const readsBeforeVowSubmit = reads;
vows.submitVow();
assert.strictEqual(vows.state.vows.filter(item => item.name === '不会重复创建').length, 1);
assert.strictEqual(vows.data.formVisible, false);
assert.strictEqual(modal, null, '善愿写入成功后也不能因读取故障误报保存失败');
assert.strictEqual(reads, readsBeforeVowSubmit);
assert.strictEqual(toasts[toasts.length - 1].title, '新善愿已立');

// 所有无缓存的读取操作都必须安全停止，不能打开误导性的空白编辑表单。
const failedActions = [
  ['today', p => p.startReflection()],
  ['today', p => p.submitReflection()],
  ['ledger', p => p.renderMonth()],
  ['ledger', p => p.renderYear()],
  ['ledger', p => p.openDayDetail({ currentTarget: { dataset: { entry: true, date: todayKey } } })],
  ['vows', p => p.openEditVow({ currentTarget: { dataset: { id: vow.id } } })],
  ['vows', p => p.activateVow({ currentTarget: { dataset: { id: vow.id } } })],
  ['vows', p => {
    p.openNewVow(false);
    p.data.form = { name: '读取失败草稿', target: '10', reason: '' };
    p.submitVow();
    assert.strictEqual(p.data.formVisible, true);
    assert.strictEqual(p.data.form.name, '读取失败草稿');
  }]
];
for (const [route, action] of failedActions) {
  const p = pageInstance(route);
  const saved = copy(storage);
  const beforeActionWrites = writes;
  modal = null;
  assert.doesNotThrow(() => action(p));
  assert.strictEqual(modal.title, '暂时无法读取记录');
  assert.strictEqual(writes, beforeActionWrites);
  assert.deepStrictEqual(storage, saved);
  resolveModal(false);
}

// 一次用户重试仍失败时，只提示一次；下一次用户重试恢复后正常展示。
const retryLedger = pageInstance('ledger');
retryLedger.onShow();
const beforeFailedRetryReads = reads;
resolveModal(true);
assert.strictEqual(reads, beforeFailedRetryReads + 1);
assert.strictEqual(modal.title, '暂时无法读取记录');
failRead = false;
resolveModal(true);
assert.strictEqual(modal, null);
assert.ok(retryLedger.data.calendarCells.some(cell => cell.date === todayKey && cell.hasEntry));

console.log('存储恢复测试通过：三页读取失败提示、取消/重试、无覆盖、保存后刷新、写入失败保留表单与善愿防重复。');
