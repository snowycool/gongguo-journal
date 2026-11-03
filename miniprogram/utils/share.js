var SHARE_TITLE = '极简功过格｜每日省察，修善断恶';
var HOME_PATH = '/pages/today/index';
var SHARE_IMAGE = '/assets/share-cover.png';

function showMenu(allowTimeline) {
  if (typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({
    // 普通好友/群转发无需 shareTicket，也不读取群信息。
    withShareTicket: false,
    menus: allowTimeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage']
  });
}

function appMessage() {
  // 必须指定静态封面，避免默认页面截图包含记录或统计。
  return { title: SHARE_TITLE, path: HOME_PATH, imageUrl: SHARE_IMAGE };
}

function timeline() {
  // 朋友圈只能落在当前页，因此仅首页注册此回调。显式清空来源参数。
  return { title: SHARE_TITLE, query: '', imageUrl: SHARE_IMAGE };
}

module.exports = {
  showMenu: showMenu,
  appMessage: appMessage,
  timeline: timeline
};
