var transition = require('./tab-transition');
var MIN_DISTANCE = 56;
var MAX_DURATION = 1500;

function blocked(page) {
  return page.data.reflectionVisible || page.data.detailVisible || page.data.formVisible;
}

function cancel() {
  this._tabSwipe = null;
}

function createHandlers(index) {
  return {
    start: function (event) {
      this._tabSwipe = null;
      if (blocked(this) || transition.isBusy() || event.touches.length !== 1) return;
      var touch = event.touches[0];
      this._tabSwipe = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        time: event.timeStamp
      };
    },

    move: function (event) {
      var gesture = this._tabSwipe;
      if (!gesture) return;
      if (blocked(this) || event.touches.length !== 1) return cancel.call(this);
      var touch = event.touches[0];
      var dx = Math.abs(touch.clientX - gesture.x);
      var dy = Math.abs(touch.clientY - gesture.y);
      // 一旦开始上下滚动，本次手势便不再参与页面切换。
      if (touch.identifier !== gesture.id || (dy > 10 && dy >= dx)) cancel.call(this);
    },

    end: function (event) {
      var gesture = this._tabSwipe;
      cancel.call(this);
      if (!gesture || blocked(this) || transition.isBusy() ||
          event.touches.length || event.changedTouches.length !== 1) return;
      var touch = event.changedTouches[0];
      var dx = touch.clientX - gesture.x;
      var dy = Math.abs(touch.clientY - gesture.y);
      var duration = event.timeStamp - gesture.time;
      if (touch.identifier !== gesture.id || duration < 0 || duration > MAX_DURATION ||
          Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < dy * 1.5) return;
      var next = index + (dx < 0 ? 1 : -1);
      transition.switchTab(index, next, this);
    },

    cancel: cancel,
    show: function () { transition.show(this, index); },
    hide: function () { cancel.call(this); transition.hide(this); }
  };
}

module.exports = { createHandlers: createHandlers };
