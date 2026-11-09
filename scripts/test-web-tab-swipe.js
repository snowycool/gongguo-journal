const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').join(__dirname, '../dist/index.html'), 'utf8');
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
assert.ok(/class="view-stage"/.test(html), '页面应有可叠放过渡卡片的容器');
assert.ok(/view-enter-forward/.test(html), '页面应声明前进过渡');
assert.ok(/view-enter-back/.test(html), '页面应声明后退过渡');
assert.ok(/\.view\.is-entering, \.view\.is-exiting \{[^}]*pointer-events: none/.test(html), '过渡期间页面内容应暂不拦截点击');
const navigation = html.match(/    const viewTransitionDuration[\s\S]*?    setupSwipeNavigation\(\);/);
assert.ok(navigation, '导航应在实际网页脚本中初始化');

const handlers = {};
const surface = { addEventListener(type, fn, options) {
  assert.strictEqual(options.passive, true, '不阻止原生滚动');
  handlers[type] = fn;
} };
function classes(active) {
  const names = new Set(active ? ['active'] : []);
  return {
    active,
    contains(name) { return names.has(name); },
    add(...values) {
      values.forEach(name => names.add(name));
      this.active = names.has('active');
    },
    remove(...values) {
      values.forEach(name => names.delete(name));
      this.active = names.has('active');
    },
    toggle(name, value) {
      if (value === undefined) value = !names.has(name);
      value ? this.add(name) : this.remove(name);
      return value;
    },
    has(name) { return names.has(name); }
  };
}
const views = ['today', 'ledger', 'vows'].map((id, i) => ({ id, classList: classes(i === 0) }));
const buttons = views.map((view, i) => ({
  dataset: { view: view.id }, classList: classes(i === 0),
  addEventListener(type, fn) { this[type] = fn; }
}));
let overlay = false;
let now = 0;
let reducedMotion = false;
let timerId = 0;
const timers = new Map();
const context = vm.createContext({
  document: {
    querySelector(selector) { return selector === '.app' ? surface : overlay ? {} : null; },
    querySelectorAll(selector) { return selector === '.view' ? views : buttons; }
  },
  window: { scrollTo() {}, matchMedia: () => ({ matches: reducedMotion }) }, render() {}, Date: { now: () => now },
  setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
  clearTimeout(id) { timers.delete(id); }
});
vm.runInContext(navigation[0], context);

function flushTimers() {
  while (timers.size) {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    timer.fn();
  }
}

const target = { closest: () => null };
const point = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });
function send(type, points, changes = [], blocked = false) {
  handlers[type]({ touches: points, changedTouches: changes, target: blocked ? { closest: () => ({}) } : target });
}
function current() {
  const active = buttons.findIndex(button => button.classList.active);
  assert.strictEqual(views.findIndex(view => view.classList.active), active, '页面与底部选中项一致');
  return active;
}
function assertNoTransitionClasses() {
  const classes = ['is-entering','is-exiting','is-entering-forward','is-entering-back','is-exiting-forward','is-exiting-back'];
  views.forEach(view => classes.forEach(name => assert.strictEqual(view.classList.has(name), false, `过渡结束后不应残留 ${name}`)));
}
function swipe(dx, dy = 0, duration = 200, blocked = false) {
  send('touchstart', [point(180, 200)], [], blocked);
  now += duration / 2;
  send('touchmove', [point(180 + dx, 200 + dy)]);
  now += duration / 2;
  send('touchend', [], [point(180 + dx, 200 + dy)]);
  flushTimers();
}
swipe(100); assert.strictEqual(current(), 0, '首页不循环');
swipe(-100); assert.strictEqual(current(), 1);
swipe(-100); assert.strictEqual(current(), 2);
swipe(-100); assert.strictEqual(current(), 2, '尾页不循环');
swipe(100); assert.strictEqual(current(), 1);
swipe(100); assert.strictEqual(current(), 0);

buttons[1].click();
assert.strictEqual(current(), 1, '点击切换仍有效');
assert.ok(views[0].classList.has('is-exiting-forward'), '前进点击应让旧页向左退出');
assert.ok(views[1].classList.has('is-entering-forward'), '前进点击应让新页从右侧进入');
flushTimers();
assertNoTransitionClasses();
buttons[0].click();
assert.ok(views[1].classList.has('is-exiting-back'), '后退点击应让旧页向右退出');
assert.ok(views[0].classList.has('is-entering-back'), '后退点击应让新页从左侧进入');
flushTimers();
assertNoTransitionClasses();

buttons[1].click();
buttons[2].click();
buttons[0].click();
assert.strictEqual(current(), 1, '快速连点期间保持当前过渡目标');
flushTimers();
assert.strictEqual(current(), 0, '快速连点最终到达最新目标');
assertNoTransitionClasses();

reducedMotion = true;
buttons[2].click();
assert.strictEqual(current(), 2, '减弱动效时仍能切换');
assertNoTransitionClasses();
assert.strictEqual(timers.size, 0, '减弱动效不应残留过渡定时器');
reducedMotion = false;
buttons[0].click();
flushTimers();
assertNoTransitionClasses();

buttons[1].click();
flushTimers();
assert.strictEqual(current(), 1, '点击切换仍有效');

for (const [dx, dy, duration] of [[0, 0, 100], [-30, 0, 100], [-100, 100, 100], [-10, 150, 100], [-100, 0, 2000]]) {
  swipe(dx, dy, duration);
  assert.strictEqual(current(), 1, '点击、短滑、斜滑、竖滑、长按不切页');
}
swipe(-100, 0, 200, true); assert.strictEqual(current(), 1, '输入和按钮不触发切页');
overlay = true; swipe(-100); overlay = false; assert.strictEqual(current(), 1, '弹层内不切页');
send('touchstart', [point(180, 200)]);
overlay = true; send('touchend', [], [point(20, 200)]); overlay = false;
assert.strictEqual(current(), 1, '中途打开弹层不切页');
send('touchstart', [point(180, 200)]);
send('touchmove', [point(180, 240)]);
send('touchend', [], [point(20, 240)]);
assert.strictEqual(current(), 1, '竖向起手后横移仍不切页');
send('touchstart', [point(180, 200)]);
send('touchmove', [point(100, 200), point(80, 200, 2)]);
send('touchend', [], [point(20, 200)]);
assert.strictEqual(current(), 1, '多指加入取消手势');
send('touchstart', [point(180, 200)]);
send('touchend', [], [point(20, 200, 2)]);
assert.strictEqual(current(), 1, '不同触点不接续手势');
send('touchstart', [point(180, 200)]);
send('touchcancel', []);
send('touchend', [], [point(20, 200)]);
assert.strictEqual(current(), 1, '取消后不切页');
send('touchstart', [point(180, 200)]);
buttons[2].click();
send('touchend', [], [point(300, 200)]);
assert.strictEqual(current(), 2, '导航变化后不执行旧手势');
swipe(100, 0, 1000);
assert.strictEqual(current(), 1, '稍慢的明确横滑仍可切页');
console.log('网页卡片切换测试通过：方向过渡、过渡结束、快速切换、减弱动效及原有手势防护。');
