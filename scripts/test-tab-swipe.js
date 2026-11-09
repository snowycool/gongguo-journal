const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const switches = [];
let clock = 0;
let timerSequence = 0;
const timers = new Map();
global.setTimeout = (fn, delay) => {
  const id = ++timerSequence;
  timers.set(id, { fn, at: clock + delay });
  return id;
};
global.clearTimeout = id => timers.delete(id);
function advance(duration) {
  const end = clock + duration;
  while (true) {
    const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    timers.delete(next[0]);
    clock = next[1].at;
    next[1].fn();
  }
  clock = end;
}
global.wx = { switchTab(options) { switches.push(options); } };
const transition = require('../miniprogram/utils/tab-transition');

function pageInstance(name) {
  const filename = path.resolve(__dirname, '../miniprogram/pages', name, 'index.js');
  let page;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename), Page(options) { page = options; }, wx: global.wx
  }, { filename });
  const instance = Object.assign({}, page, {
    data: JSON.parse(JSON.stringify(page.data)),
    setData(value, callback) { Object.assign(this.data, value); if (callback) callback(); }
  });
  const template = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8');
  for (const name of ['start', 'move', 'end', 'cancel']) {
    const handler = template.match(new RegExp(`bindtouch${name}="([\\w$]+)"`));
    assert.ok(handler, '页面需绑定 touch' + name);
    assert.strictEqual(typeof instance[handler[1]], 'function');
  }
  return instance;
}

function touch(x, y, id = 1) { return { clientX: x, clientY: y, identifier: id }; }
function event(touches, timeStamp, changedTouches = []) { return { touches, timeStamp, changedTouches }; }
function swipe(page, dx, dy = 0, duration = 200) {
  page.onTabTouchStart(event([touch(160, 200)], 0));
  page.onTabTouchMove(event([touch(160 + dx, 200 + dy)], duration / 2));
  page.onTabTouchEnd(event([], duration, [touch(160 + dx, 200 + dy)]));
  advance(110);
}
function finish() {
  const options = switches[switches.length - 1];
  const index = ['today', 'ledger', 'vows'].findIndex(name => options.url.includes('/' + name + '/'));
  const target = [today, ledger, vows][index];
  transition.show(target, index);
  assert.ok(target.data.tabTransitionClass.startsWith('tab-card-enter-'), '目标页应播放入场动画');
  options.complete();
  advance(230);
  assert.strictEqual(target.data.tabTransitionClass, '', '入场动画结束需清理样式');
  assert.strictEqual(transition.isBusy(), false);
}
function noSwitch(action, reason) {
  const before = switches.length;
  action();
  assert.strictEqual(switches.length, before, reason);
}

const today = pageInstance('today');
const ledger = pageInstance('ledger');
const vows = pageInstance('vows');
for (const [page, dx, expected] of [
  [today, -100, '/pages/ledger/index'],
  [ledger, -100, '/pages/vows/index'],
  [vows, 100, '/pages/ledger/index'],
  [ledger, 100, '/pages/today/index']
]) {
  swipe(page, dx, 10);
  assert.strictEqual(switches[switches.length - 1].url, expected);
  noSwitch(() => swipe(page, dx), '切换完成前不重复跳转');
  finish();
}

noSwitch(() => swipe(today, 100), '首页不循环');
noSwitch(() => swipe(vows, -100), '尾页不循环');
for (const [dx, dy, duration] of [[0, 0, 100], [-30, 0, 100], [-60, 60, 100], [-10, 150, 100], [-100, 0, 2000]]) {
  noSwitch(() => swipe(ledger, dx, dy, duration), '点击、短滑、斜滑、竖滑、长按不切页');
}
for (const [page, field] of [[today, 'reflectionVisible'], [ledger, 'detailVisible'], [vows, 'formVisible']]) {
  page.data[field] = true;
  noSwitch(() => swipe(page, -100), '弹层开启时不切页');
  page.data[field] = false;
}
noSwitch(() => {
  ledger.onTabTouchStart(event([touch(160, 200)], 0));
  ledger.data.detailVisible = true;
  ledger.onTabTouchEnd(event([], 100, [touch(20, 200)]));
  ledger.data.detailVisible = false;
}, '手势中途打开弹层不切页');
noSwitch(() => {
  ledger.onTabTouchStart(event([touch(160, 200)], 0));
  ledger.onTabTouchMove(event([touch(160, 230)], 50));
  ledger.onTabTouchEnd(event([], 100, [touch(20, 230)]));
}, '竖向滚动后改为横移不切页');
noSwitch(() => {
  ledger.onTabTouchStart(event([touch(160, 200)], 0));
  ledger.onTabTouchMove(event([touch(100, 200), touch(80, 200, 2)], 50));
  ledger.onTabTouchEnd(event([], 100, [touch(20, 200)]));
}, '多指加入后不切页');
noSwitch(() => {
  ledger.onTabTouchStart(event([touch(160, 200), touch(80, 200, 2)], 0));
  ledger.onTabTouchEnd(event([], 100, [touch(20, 200)]));
}, '多指开始不切页');
for (const reset of ['onTabTouchCancel', 'onHide']) {
  noSwitch(() => {
    ledger.onTabTouchStart(event([touch(160, 200)], 0));
    ledger[reset]();
    ledger.onTabTouchEnd(event([], 100, [touch(20, 200)]));
  }, '取消或离开页面后清除手势');
}
noSwitch(() => {
  ledger.onTabTouchStart(event([touch(160, 200)], 0));
  ledger.onTabTouchEnd(event([], 100, [touch(20, 200, 2)]));
}, '不同手指不能接续手势');

swipe(ledger, -100);
assert.strictEqual(switches[switches.length - 1].url, '/pages/vows/index', '取消后可正常重新滑动');
finish();

// 离场必须先渲染，再发起原生页面跳转；首尾与失败不应留下锁或透明页面。
let before = switches.length;
assert.strictEqual(transition.switchTab(0, 1, today), true);
assert.strictEqual(today.data.tabTransitionClass, 'tab-card-leave-next');
advance(109);
assert.strictEqual(switches.length, before, '离场期间尚未硬切页面');
assert.strictEqual(transition.switchTab(0, 2, today), false, '快速点击不叠加动画');
advance(1);
transition.show(ledger, 1);
assert.strictEqual(ledger.data.tabTransitionClass, 'tab-card-enter-next');
switches[switches.length - 1].complete();
assert.strictEqual(transition.switchTab(1, 0, ledger), false, '入场时不叠加下一次切换');
advance(230);
assert.strictEqual(today.data.tabTransitionClass, '');
assert.strictEqual(ledger.data.tabTransitionClass, '');

transition.switchTab(1, 0, ledger);
assert.strictEqual(ledger.data.tabTransitionClass, 'tab-card-leave-previous');
advance(110);
switches[switches.length - 1].fail();
switches[switches.length - 1].complete();
assert.strictEqual(ledger.data.tabTransitionClass, '', '跳转失败恢复页面');
assert.strictEqual(transition.isBusy(), false, '跳转失败解除锁');

before = switches.length;
transition.switchTab(1, 0, ledger);
ledger.onHide();
advance(110);
assert.strictEqual(switches.length, before, '离场过程中进入后台则取消跳转');
assert.strictEqual(transition.isBusy(), false);

// 模拟自定义导航点击：与手势共用过渡，失败时不得提前改变选中项。
const barFile = path.resolve(__dirname, '../miniprogram/custom-tab-bar/index.js');
let bar;
vm.runInNewContext(fs.readFileSync(barFile, 'utf8'), {
  require: createRequire(barFile), Component(options) { bar = options; },
  getCurrentPages: () => [ledger]
}, { filename: barFile });
const barInstance = { data: { selected: 1, tabs: bar.data.tabs } };
bar.methods.switchTab.call(barInstance, { currentTarget: { dataset: { index: 0 } } });
assert.strictEqual(ledger.data.tabTransitionClass, 'tab-card-leave-previous');
assert.strictEqual(barInstance.data.selected, 1, '跳转前保留当前选中项');
advance(110);
transition.show(today, 0);
assert.strictEqual(today.data.tabTransitionClass, 'tab-card-enter-previous');
switches[switches.length - 1].complete();
advance(230);
assert.strictEqual(transition.isBusy(), false);
assert.strictEqual(timers.size, 0, '结束后不遗留计时器');
console.log('小程序滑动及卡片过渡测试通过：方向、动画时序、点击共用、快速操作、失败恢复、后台取消和原有手势防护。');
