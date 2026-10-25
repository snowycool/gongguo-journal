const assert = require('assert');

let storage = {};
global.wx = {
  getStorageSync(key) {
    return storage[key];
  },
  setStorageSync(key, value) {
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
assert.strictEqual(dates.dateKey(new Date(2026, 9, 3, 12, 0, 0)), '2026-10-03');

console.log('数据层测试通过：立愿、功过结算、满愿、月度汇总与下一愿。');
