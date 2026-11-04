const assert = require('assert');

let storage = {};
let writes = 0;
let removes = 0;
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { writes += 1; storage[key] = JSON.parse(JSON.stringify(value)); },
  removeStorageSync(key) { removes += 1; delete storage[key]; }
};

const history = require('../miniprogram/utils/entry-history');

storage[history.STORAGE_KEY] = {
  goods: ['  旧善行  ', '重复', '重复'],
  faults: ['旧过失']
};
const days = {
  '2026-11-01': {
    goods: [{ text: '早日记录' }, { text: '当天较晚' }],
    faults: [{ text: '早日过失' }]
  },
  '2026-11-03': {
    goods: [{ text: '最新较早' }, { text: '最新较晚' }],
    faults: [{ text: '最新过失' }, { text: '旧过失' }]
  },
  invalid: { goods: [{ text: '不应读取' }] }
};
let loaded = history.load(days);
assert.deepStrictEqual(loaded.goods, ['旧善行', '重复', '最新较晚', '最新较早', '当天较晚', '早日记录']);
assert.deepStrictEqual(loaded.faults, ['旧过失', '最新过失', '早日过失']);
assert.deepStrictEqual(history.suggest(loaded, 'goods', ''), ['旧善行', '重复', '最新较晚', '最新较早', '当天较晚']);
assert.deepStrictEqual(history.suggest(loaded, 'goods', '最新'), ['最新较晚', '最新较早']);
assert.deepStrictEqual(history.suggest(loaded, 'faults', '过'), ['旧过失', '最新过失', '早日过失']);
assert.deepStrictEqual(history.suggest(loaded, 'goods', '旧善行'), []);
assert.deepStrictEqual(history.suggest(loaded, 'unknown', ''), []);

let remembered = history.remember(loaded, {
  goods: [{ text: '新一条' }, { text: '新二条' }, { text: '重复' }, { text: '新一条' }],
  faults: [{ text: '新过失' }]
});
assert.deepStrictEqual(remembered.goods.slice(0, 4), ['新一条', '重复', '新二条', '旧善行']);
assert.deepStrictEqual(remembered.faults.slice(0, 2), ['新过失', '旧过失']);
assert.strictEqual(writes, 1);

storage[history.STORAGE_KEY] = { goods: [], faults: [] };
let maxDays = { goods: [] };
for (let i = 0; i < 220; i += 1) maxDays.goods.push({ text: '历史-' + i });
let maxed = history.load({ '2026-12-01': maxDays });
assert.strictEqual(maxed.goods.length, 200);
assert.strictEqual(maxed.goods[0], '历史-219');
assert.strictEqual(maxed.goods[199], '历史-20');
assert.strictEqual(writes, 1, 'load 不得写入历史存储');
assert.strictEqual(history.suggest(maxed, 'goods', '').length, 5);

let malformed = history.load({ '2026-12-02': {
  goods: [
    { text: { bad: true } },
    { text: 42 },
    { text: ['array'] },
    { text: '保留这条' },
    { text: 'x'.repeat(120) }
  ],
  faults: []
} });
assert.deepStrictEqual(malformed.goods, ['x'.repeat(100), '保留这条']);

let special = history.remember({ goods: [], faults: [] }, {
  goods: [{ text: '__proto__' }, { text: 'toString' }], faults: []
});
assert.deepStrictEqual(special.goods, ['toString', '__proto__']);

storage = { main: { days: { keep: true } } };
global.wx.getStorageSync = function () { throw new Error('read failed'); };
assert.deepStrictEqual(history.load({ '2026-11-04': { goods: [{ text: '仍可回填' }] } }).goods, ['仍可回填']);
global.wx.setStorageSync = function () { throw new Error('write failed'); };
assert.doesNotThrow(function () { history.remember({ goods: ['保留'], faults: [] }, { goods: [{ text: '新增' }] }); });
assert.deepStrictEqual(storage.main, { days: { keep: true } });
global.wx.removeStorageSync = function (key) { removes += 1; delete storage[key]; };
history.clear();
assert.strictEqual(removes, 1);
assert.deepStrictEqual(storage.main, { days: { keep: true } });

console.log('历史建议测试通过：分类、顺序、筛选、去重、上限、坏数据与存储失败。');
