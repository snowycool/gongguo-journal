const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const miniRoot = path.resolve(__dirname, '../miniprogram');
const app = require('../miniprogram/app.json');
const title = '极简功过格｜每日省察，修善断恶';
const home = 'pages/today/index';
assert.strictEqual(app.pages[0], home, '分享目标必须是实际首页');

let menus = [];
let storage = {};
global.wx = {
  showShareMenu(options) { menus.push(options); },
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = JSON.parse(JSON.stringify(value)); }
};

function plain(value) { return JSON.parse(JSON.stringify(value)); }

// 分享函数不得读取页面状态、来源参数或个人记录。
const privatePage = new Proxy({}, {
  get() { throw new Error('分享回调读取了页面隐私数据'); }
});

for (const route of app.pages) {
  const filename = path.join(miniRoot, route + '.js');
  const source = fs.readFileSync(filename, 'utf8');
  let page;
  let registrations = 0;
  vm.runInNewContext(source, {
    require: createRequire(filename),
    Page(options) { page = options; registrations += 1; },
    wx: global.wx,
    setTimeout
  }, { filename });
  assert.strictEqual(registrations, 1, route + ' 只能注册一个 Page');
  for (const lifecycle of ['onLoad', 'onShow']) {
    assert.strictEqual((source.match(new RegExp('\\b' + lifecycle + '\\s*:', 'g')) || []).length, 1,
      route + ' 不得重复定义生命周期');
  }

  const beforeShare = plain(storage);
  for (const from of ['menu', 'button']) {
    const content = plain(page.onShareAppMessage.call(privatePage, {
      from, target: { dataset: { record: 'PRIVATE_RECORD', userId: 'PRIVATE_USER' } }
    }));
    assert.deepStrictEqual(content, {
      title, path: '/' + home, imageUrl: '/assets/share-cover.png'
    });
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(miniRoot, content.path + '.' + extension)),
        '分享落地页缺少 ' + extension);
    }
    const image = fs.readFileSync(path.join(miniRoot, content.imageUrl));
    assert.strictEqual(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.strictEqual(image.readUInt32BE(16), image.readUInt32BE(20), '朋友圈封面应为正方形');
  }
  if (route === home) {
    assert.deepStrictEqual(plain(page.onShareTimeline.call(privatePage)), {
      title, query: '', imageUrl: '/assets/share-cover.png'
    });
  } else {
    assert.strictEqual(page.onShareTimeline, undefined,
      '非首页不能通过朋友圈 path 重定向到首页');
  }
  assert.deepStrictEqual(storage, beforeShare, '分享不得写入个人记录');

  const tabUpdates = [];
  const instance = Object.assign({}, page, {
    data: plain(page.data),
    setData(value) { Object.assign(this.data, value); },
    getTabBar() { return { setData(value) { tabUpdates.push(value); } }; }
  });
  instance.onLoad();
  menus = [];
  instance.onShow();
  instance.onShow(); // tab 返回或从分享面板返回后仍应可分享。
  assert.strictEqual(menus.length, 2);
  for (const options of menus) {
    assert.deepStrictEqual(options.menus,
      route === home ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage']);
    assert.strictEqual(options.withShareTicket, false);
  }
  assert.strictEqual(tabUpdates.length, 2, '已有 tabBar 生命周期应继续运行');
  assert.ok(route === home ? instance.data.dateKey : route.includes('ledger') ? instance.data.year : instance.expanded,
    '已有 onLoad 应继续初始化页面');
  assert.ok(instance.state, '已有 onShow 应继续加载当前设备数据');
}

// 缺少菜单 API 的环境不能阻断原有页面显示。
const share = require('../miniprogram/utils/share');
delete global.wx.showShareMenu;
assert.doesNotThrow(() => share.showMenu(true));
assert.doesNotThrow(() => share.showMenu(false));

console.log('分享测试通过：真实首页、静态封面、无隐私参数、单次 Page 注册、生命周期与菜单恢复。');
