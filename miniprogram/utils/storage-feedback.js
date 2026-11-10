var store = require('./store');

// 读取异常不能回退为空状态。保留页面和草稿，只在用户选择重试时再读取。
function load(page, retry) {
  try {
    var state = store.loadState();
    page.state = state;
    page._storageReadFailed = false;
    return state;
  } catch (error) {
    page._storageReadFailed = true;
    if (!page._storageReadPrompt) {
      page._storageReadPrompt = true;
      wx.showModal({
        title: '暂时无法读取记录',
        content: '本机数据暂时不可用，未改动已保存的记录。请稍后重试。',
        confirmText: '重试',
        cancelText: '稍后',
        success: function (result) {
          page._storageReadPrompt = false;
          if (result.confirm) retry();
        },
        fail: function () { page._storageReadPrompt = false; }
      });
    }
    return null;
  }
}

function current(page, retry) {
  // 刷新已失败时，旧页面缓存可能过期，恢复读取之前不能用于保存。
  return !page._storageReadFailed && page.state ? page.state : load(page, retry);
}

module.exports = { load: load, current: current };
