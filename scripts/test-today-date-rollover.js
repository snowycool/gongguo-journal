const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const copy = value => JSON.parse(JSON.stringify(value));
const filename = path.resolve(__dirname, '../miniprogram/pages/today/index.js');
const RealDate = Date;
let now = new RealDate(2026, 10, 8, 23, 59, 0);
let storage = {};
let modal = null;
let toasts = [];

class FakeDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [now.getTime()]));
  }

  static now() {
    return now.getTime();
  }
}

global.wx = {
  getStorageSync(key) { return copy(storage[key] || null); },
  setStorageSync(key, value) { storage[key] = copy(value); },
  showShareMenu() {},
  showModal(value) { modal = value; },
  showToast(value) { toasts.push(value); }
};

function createPage() {
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    Page(options) { definition = options; },
    Date: FakeDate,
    wx: global.wx,
    setTimeout() {}
  }, { filename });
  const page = Object.assign({}, definition, {
    data: copy(definition.data),
    setData(value) { Object.assign(this.data, copy(value)); },
    getTabBar() { return { setData() {} }; }
  });
  page.onLoad();
  return page;
}

let page = createPage();
assert.strictEqual(page.data.dateKey, '2026-11-08');
page.onShow();
now = new RealDate(2026, 10, 9, 8, 0, 0);
page.onShow();
assert.strictEqual(page.data.dateKey, '2026-11-09', '跨天返回后应自动切换到当天');
assert.strictEqual(page.data.dateTitle, '11月9日');
assert.strictEqual(modal, null, '没有打开表单时无需打断用户');

now = new RealDate(2026, 10, 8, 23, 59, 0);
page = createPage();
page.onShow();
page.startReflection();
page.onEntryTextInput({
  currentTarget: { dataset: { kind: 'goods', index: 0 } },
  detail: { value: '跨天前尚未保存的记录' }
});
now = new RealDate(2026, 10, 9, 8, 0, 0);
page.onShow();
assert.ok(modal, '表单打开时跨天应询问记录归属');
assert.strictEqual(page.data.dateKey, '2026-11-08');
assert.strictEqual(page.data.reflectionVisible, true);
assert.strictEqual(page.data.draft.goods[0].text, '跨天前尚未保存的记录');
let currentModal = modal;
modal = null;
currentModal.success({ confirm: false });
assert.strictEqual(page.data.dateKey, '2026-11-08', '选择继续昨日时应保留原日期');
assert.strictEqual(page.data.draft.goods[0].text, '跨天前尚未保存的记录');

page.submitReflection();
assert.strictEqual(storage['gongguo-grid-mini-v1'].days['2026-11-08'].goods[0].text, '跨天前尚未保存的记录');
assert.strictEqual(page.data.dateKey, '2026-11-09', '昨日记录保存后应回到当天');
assert.strictEqual(page.data.reflectionVisible, false);
assert.strictEqual(toasts[toasts.length - 1].title, '昨日功过已登记');

now = new RealDate(2026, 10, 8, 23, 59, 0);
page = createPage();
page.onShow();
page.startReflection();
page.onEntryTextInput({
  currentTarget: { dataset: { kind: 'goods', index: 0 } },
  detail: { value: '选择切换时不应误存' }
});
now = new RealDate(2026, 10, 9, 8, 0, 0);
page.onShow();
currentModal = modal;
modal = null;
currentModal.success({ confirm: true });
assert.strictEqual(page.data.dateKey, '2026-11-09');
assert.strictEqual(page.data.reflectionVisible, false);
assert.strictEqual(storage['gongguo-grid-mini-v1'].days['2026-11-08'].goods[0].text, '跨天前尚未保存的记录',
  '切换今日不能把未保存草稿写入昨日记录');

console.log('今日跨天测试通过：自动切换、昨日草稿保护、归属选择和保存后回到当天。');
