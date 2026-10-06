// 首页左上角用户信息区（子项目 D）：头像 + 昵称，昵称下显示积分余额；点击打开头像昵称编辑弹窗。
// 纯 DOM 实现，不依赖 Vue（首页是编译后的产物）。由 index.html 先于业务脚本加载，挂到 window.dsProfile；
// 首页（app chunk 的 profile v1 补丁）在 mounted 时调用 mount(el, { request, apiURL, points })。
// request 为首页的 axios 实例：令牌注入与 10020/10022/10024/10025 拦截（提示并退回登录）都由它统一处理，
// 被拦截时 Promise 以 undefined 兑现，这里一律当作「无数据」忽略。
(function (root, factory) {
  var api = factory();
  // Electron nodeIntegration 同时暴露 module 和 window，必须两边都赋值
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsProfile = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var NICK_MAX = 12;
  var AVATAR_SIZE = 128;
  var AVATAR_QUALITY = 0.85;
  var POLL_MS = 60000;
  var MSG = {
    nickEmpty: '昵称不能为空',
    nickTooLong: '昵称最多 12 个字',
    pickImage: '请选择图片文件',
    saveFailed: '保存失败，请稍后重试',
    network: '网络异常，请稍后重试',
  };

  // 按码点计数，与后端 len(str) 一致（emoji 算 1 个）
  function charLen(s) {
    return Array.from(s).length;
  }

  // 与后端 profile.clean_nickname 的前两条规则一致；字符类别由后端判定
  function nicknameProblem(v) {
    v = v == null ? '' : String(v).trim();
    if (!v) return MSG.nickEmpty;
    if (charLen(v) > NICK_MAX) return MSG.nickTooLong;
    return null;
  }

  function fmtPoints(p) {
    var n = typeof p === 'number' ? p : (p == null || p === '' ? NaN : Number(p));
    return '积分：' + (isFinite(n) ? String(n) : '—');
  }

  // 居中裁成正方形：返回源图上的裁剪区域
  function cropBox(w, h) {
    var s = Math.min(w, h);
    return { sx: (w - s) / 2, sy: (h - s) / 2, s: s };
  }

  function squareDataURL(img, doc, size) {
    var c = doc.createElement('canvas');
    c.width = size;
    c.height = size;
    var ctx = c.getContext('2d');
    var b = cropBox(img.naturalWidth || img.width, img.naturalHeight || img.height);
    ctx.fillStyle = '#ffffff'; // 透明 PNG 转 JPEG 时底色为白
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, b.sx, b.sy, b.s, b.s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', AVATAR_QUALITY);
  }

  // 浏览器里读取用户选的图片文件 → 128×128 JPEG data URL；无法解码则 reject
  function readImage(file, doc) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          resolve(squareDataURL(img, doc, AVATAR_SIZE));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      img.src = url;
    });
  }

  function setStyle(e, style) {
    for (var k in style) e.style[k] = style[k];
  }

  function btnStyle(primary) {
    return {
      padding: '5px 12px', margin: '0 4px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer',
      border: '1px solid ' + (primary ? '#409eff' : '#dcdfe6'),
      background: primary ? '#409eff' : '#ffffff', color: primary ? '#ffffff' : '#606266',
    };
  }

  function mount(el, options) {
    var o = options || {};
    var doc = o.doc || document;
    var request = o.request;
    var apiURL = o.apiURL || '';
    var setIntervalFn = o.setInterval || setInterval;
    var clearIntervalFn = o.clearInterval || clearInterval;
    var readImageFn = o.readImage || function (file) { return readImage(file, doc); };
    var state = { nickname: '', avatar: '', defaultAvatar: '' };
    var inflight = false;
    var destroyed = false;
    var editor = null;

    function make(tag, role, style, text) {
      var e = doc.createElement(tag);
      if (role) e.setAttribute('data-role', role);
      if (style) setStyle(e, style);
      if (text != null) e.textContent = text;
      return e;
    }

    var box = make('div', 'ds-profile', {
      position: 'absolute', top: '8px', left: '8px', zIndex: '10', display: 'flex', alignItems: 'center',
      maxWidth: '180px', cursor: 'pointer',
    });
    box.style.setProperty('-webkit-app-region', 'no-drag'); // 顶部是窗口拖动区，不设置则点不到
    var avatarImg = make('img', 'ds-profile-avatar', {
      width: '44px', height: '44px', flex: '0 0 44px', borderRadius: '50%', objectFit: 'cover',
      boxSizing: 'border-box', border: '2px solid rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.3)',
    });
    avatarImg.setAttribute('alt', '');
    var textCol = make('div', null, {
      marginLeft: '8px', minWidth: '0', color: '#ffffff', lineHeight: '20px', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
    });
    var nickEl = make('div', 'ds-profile-nick', {
      fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }, '');
    var pointsEl = make('div', 'ds-profile-points', { fontSize: '12px' }, fmtPoints(o.points));
    textCol.appendChild(nickEl);
    textCol.appendChild(pointsEl);
    box.appendChild(avatarImg);
    box.appendChild(textCol);
    el.appendChild(box);

    function setPoints(p) {
      pointsEl.textContent = fmtPoints(p);
    }

    function apply(d) {
      if (!d) return;
      if (typeof d.nickname === 'string') {
        state.nickname = d.nickname;
        nickEl.textContent = d.nickname;
      }
      if (typeof d.avatar === 'string') {
        state.avatar = d.avatar;
        avatarImg.src = d.avatar;
      }
      if (typeof d.defaultAvatar === 'string') state.defaultAvatar = d.defaultAvatar;
      if (typeof d.points === 'number') setPoints(d.points);
    }

    function call(method, path, data) {
      var cfg = { url: apiURL + path, method: method };
      if (data !== undefined) cfg.data = data;
      try {
        return Promise.resolve(request(cfg)); // 同步发出请求；同步抛错也按失败处理
      } catch (e) {
        return Promise.reject(e);
      }
    }

    // 拉取头像昵称与余额；points 为登录时存下的余额，先行显示。请求进行中时不重复发起
    function refresh(points) {
      if (points != null && points !== '') setPoints(points);
      if (inflight || destroyed) return Promise.resolve();
      inflight = true;
      return call('get', '/user/profile').then(function (res) {
        if (!destroyed && res && res.code == 0) apply(res.data);
      }, function () {}).then(function () { inflight = false; });
    }

    function pollPoints() {
      // 首页被 keep-alive 缓存（deactivated）后挂载点已不在文档里：不再每 60 秒白打一次请求
      if (!box.isConnected) return Promise.resolve();
      return call('get', '/user/points').then(function (res) {
        if (!destroyed && res && res.code == 0 && res.data && typeof res.data.points === 'number') {
          setPoints(res.data.points);
        }
      }, function () {});
    }

    function openEditor() {
      if (editor || destroyed) return;
      var pending; // undefined = 头像未改；null = 恢复默认；字符串 = 新头像 data URL
      var overlay = make('div', 'ds-profile-editor', {
        position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '3000',
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      overlay.style.setProperty('-webkit-app-region', 'no-drag');
      var panel = make('div', null, {
        width: '230px', boxSizing: 'border-box', padding: '14px', borderRadius: '6px', background: '#ffffff',
        color: '#333333', fontSize: '13px', textAlign: 'center',
      });
      var title = make('div', null, { fontSize: '15px', fontWeight: 'bold', marginBottom: '10px' }, '修改头像和昵称');
      var preview = make('img', 'preview', {
        width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', background: '#eeeeee',
      });
      preview.setAttribute('alt', '');
      if (state.avatar) preview.src = state.avatar;
      var row = make('div', null, { margin: '8px 0' });
      var pick = make('button', 'pick', btnStyle(false), '更换头像');
      var reset = make('button', 'reset', btnStyle(false), '恢复默认');
      var file = make('input', 'file', { display: 'none' });
      file.setAttribute('type', 'file');
      file.setAttribute('accept', 'image/*');
      var input = make('input', 'nick-input', {
        width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: '13px',
        border: '1px solid #dcdfe6', borderRadius: '4px',
      });
      input.setAttribute('placeholder', '昵称，最多 12 个字');
      input.value = state.nickname;
      var err = make('div', 'error', { minHeight: '18px', margin: '6px 0', color: '#f56c6c', fontSize: '12px' }, '');
      var foot = make('div', null, { display: 'flex', justifyContent: 'flex-end' });
      var cancel = make('button', 'cancel', btnStyle(false), '取消');
      var save = make('button', 'save', btnStyle(true), '保存');

      row.appendChild(pick);
      row.appendChild(reset);
      foot.appendChild(cancel);
      foot.appendChild(save);
      [title, preview, row, file, input, err, foot].forEach(function (c) { panel.appendChild(c); });
      overlay.appendChild(panel);

      function showError(m) {
        err.textContent = m || '';
      }
      function close() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        editor = null;
      }

      pick.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        file.value = ''; // 允许再次选择同一文件
        if (!f) return;
        if (!/^image\//.test(f.type || '')) {
          showError(MSG.pickImage);
          return;
        }
        readImageFn(f).then(function (url) {
          pending = url;
          preview.src = url;
          showError('');
        }, function () {
          showError(MSG.pickImage);
        });
      });
      reset.addEventListener('click', function () {
        pending = null;
        if (state.defaultAvatar) preview.src = state.defaultAvatar;
        showError('');
      });
      cancel.addEventListener('click', close);
      overlay.addEventListener('click', function (e) {
        if (e && e.target === overlay) close();
      });
      save.addEventListener('click', function () {
        var nick = String(input.value == null ? '' : input.value).trim();
        var problem = nicknameProblem(nick);
        if (problem) {
          showError(problem);
          return;
        }
        var data = {};
        if (nick !== state.nickname) data.nickname = nick;
        if (pending !== undefined) data.avatar = pending;
        if (!('nickname' in data) && !('avatar' in data)) {
          close();
          return;
        }
        save.disabled = true;
        save.textContent = '保存中…';
        showError('');
        call('post', '/user/profile', data).then(function (res) {
          if (res && res.code == 0) {
            apply(res.data);
            close();
          } else if (!res) {
            close(); // 被统一拦截：已提示并退回登录
          } else {
            showError(res.msg || MSG.saveFailed);
          }
        }, function () {
          showError(MSG.network);
        }).then(function () {
          save.disabled = false;
          save.textContent = '保存';
        });
      });

      doc.body.appendChild(overlay);
      editor = { close: close };
    }

    box.addEventListener('click', openEditor);
    var timer = setIntervalFn(pollPoints, POLL_MS);
    refresh();

    function destroy() {
      destroyed = true;
      clearIntervalFn(timer);
      box.removeEventListener('click', openEditor);
      if (editor) editor.close();
      if (box.parentNode) box.parentNode.removeChild(box);
    }

    return { refresh: refresh, destroy: destroy, openEditor: openEditor };
  }

  return {
    mount: mount, nicknameProblem: nicknameProblem, fmtPoints: fmtPoints, cropBox: cropBox,
    squareDataURL: squareDataURL, readImage: readImage,
    NICK_MAX: NICK_MAX, AVATAR_SIZE: AVATAR_SIZE, AVATAR_QUALITY: AVATAR_QUALITY, POLL_MS: POLL_MS, MSG: MSG,
  };
});
