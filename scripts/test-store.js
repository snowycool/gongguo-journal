const assert = require('assert');

let storage = {};
let failRead = false;
let writeCount = 0;
global.wx = {
  getStorageSync(key) {
    if (failRead) throw new Error('storage read failed');
    return storage[key];
  },
  setStorageSync(key, value) {
    writeCount += 1;
    storage[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync(key) {
    delete storage[key];
  }
};

const store = require('../miniprogram/utils/store');
const dates = require('../miniprogram/utils/date');

let state = store.loadState();
assert.deepStrictEqual(state.vows, []);
assert.deepStrictEqual(state.days, {});

const vow = store.createVow(state, { name: '三件善行', target: 3, reason: '测试善愿' });
assert.strictEqual(store.activeVow(state).id, vow.id);

state.days['2026-10-01'] = {
  goods: [{ text: '善行一', points: 2 }],
  faults: [],
  completed: true,
  vowId: vow.id
};
let result = store.saveState(state, true);
state = result.state;
assert.strictEqual(result.completed.length, 0);
assert.strictEqual(store.vowProgress(state, state.vows[0]), 2);

state.days['2026-10-02'] = {
  goods: [{ text: '善行二', points: 2 }],
  faults: [{ text: '过失一', points: 1 }],
  completed: true,
  vowId: vow.id
};
result = store.saveState(state, true);
state = result.state;
assert.strictEqual(result.completed.length, 1);
assert.strictEqual(state.pendingNextVow, true);
assert.strictEqual(state.activeVowId, null);
assert.strictEqual(store.vowProgress(state, state.vows[0]), 3);
assert.strictEqual(store.vowFaults(state, state.vows[0]), 1);
assert.strictEqual(store.updateVow(state, vow.id, { name: '不可修改', target: 4, reason: '' }), false);

const month = store.monthSummary(state, 2026, 9);
assert.strictEqual(month.count, 2);
assert.strictEqual(month.net, 3);

const nextVow = store.createVow(state, { name: '下一愿', target: 10, reason: '' });
result = store.saveState(state, false);
state = result.state;
assert.strictEqual(state.pendingNextVow, false);
assert.strictEqual(store.activeVow(state).id, nextVow.id);
assert.strictEqual(store.sortVows(state)[0].id, nextVow.id);

// 满愿超出的净功顺延到下一愿；修改旧记录后，完成状态和结余必须级联重算。
let cascade = store.createDefaultState();
const first = store.createVow(cascade, { name: '第一愿', target: 3, reason: '' });
first.start = '2026-10-01';
first.createdAt = '2026-10-01T12:00:00+08:00';
cascade.days['2026-10-02'] = {
  goods: [{ text: '善行', points: 7 }],
  faults: [{ text: '过失', points: 2 }],
  completed: true,
  vowId: first.id
};
result = store.saveState(cascade, true);
cascade = result.state;
assert.strictEqual(store.vowProgress(cascade, cascade.vows[0]), 3);
assert.strictEqual(store.settleVows(cascade).byId[first.id].overflow, 2);
assert.strictEqual(cascade.vows[0].completedAt, '2026-10-02');
assert.strictEqual(cascade.pendingNextVow, true);

const second = store.createVow(cascade, { name: '第二愿', target: 10, reason: '' });
second.start = '2026-10-03';
second.createdAt = '2026-10-03T12:00:00+08:00';
result = store.saveState(cascade, false);
cascade = result.state;
assert.strictEqual(store.vowProgress(cascade, cascade.vows[1]), 2, '第一愿结余应自动计入第二愿');
assert.strictEqual(store.activeVow(cascade).id, second.id);

cascade.days['2026-10-02'].goods[0].points = 4;
result = store.saveState(cascade, true);
cascade = result.state;
assert.strictEqual(result.reopened.length, 1);
assert.strictEqual(result.reopened[0].id, first.id);
assert.strictEqual(cascade.vows[0].completedAt, null);
assert.strictEqual(store.vowProgress(cascade, cascade.vows[0]), 2);
assert.strictEqual(store.vowProgress(cascade, cascade.vows[1]), 0, '旧记录减少后必须撤回结余');
assert.strictEqual(store.activeVow(cascade).id, first.id);
assert.strictEqual(cascade.pendingNextVow, false);

cascade.days['2026-10-02'].goods[0].points = 9;
result = store.saveState(cascade, true);
cascade = result.state;
assert.strictEqual(store.vowProgress(cascade, cascade.vows[0]), 3);
assert.strictEqual(store.vowProgress(cascade, cascade.vows[1]), 4);
assert.strictEqual(store.activeVow(cascade).id, second.id);
assert.strictEqual(cascade.pendingNextVow, false, '已有下一愿时不应再次要求立愿');

cascade.days['2026-10-04'] = {
  goods: [{ text: '后续善行', points: 8 }],
  faults: [],
  completed: true,
  vowId: second.id
};
result = store.saveState(cascade, true);
cascade = result.state;
assert.strictEqual(store.vowProgress(cascade, cascade.vows[1]), 10);
assert.strictEqual(cascade.vows[1].completedAt, '2026-10-04');
assert.strictEqual(cascade.pendingNextVow, true);

cascade.days['2026-10-02'].goods[0].points = 6;
result = store.saveState(cascade, true);
cascade = result.state;
assert.strictEqual(result.reopened.length, 1);
assert.strictEqual(result.reopened[0].id, second.id);
assert.strictEqual(store.vowProgress(cascade, cascade.vows[1]), 9);
assert.strictEqual(cascade.vows[1].completedAt, null);
assert.strictEqual(store.activeVow(cascade).id, second.id);
assert.strictEqual(cascade.pendingNextVow, false);

assert.strictEqual(dates.dateKey(new Date(2026, 9, 3, 12, 0, 0)), '2026-10-03');

const stateBeforeReadFailure = JSON.parse(JSON.stringify(storage[store.STORAGE_KEY]));
const writesBeforeReadFailure = writeCount;
failRead = true;
assert.throws(function () { store.loadState(); }, /storage read failed/);
assert.strictEqual(writeCount, writesBeforeReadFailure, '读取失败后不得写回任何状态');
assert.deepStrictEqual(storage[store.STORAGE_KEY], stateBeforeReadFailure, '读取失败后必须保留原记录');

console.log('数据层测试通过：动态满愿、结余顺延、纠错回退、月度汇总、下一愿与读取失败保护。');
