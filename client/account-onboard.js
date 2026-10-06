// 首次登录弹窗：强制修改初始密码并绑定实名手机号。纯 DOM 实现，不依赖 Vue（登录页是编译后的产物，无法重编）。
// 浏览器里挂到 window.dsOnboard（由 index.html 先于业务脚本加载），Node 测试里 require。
(function (root, factory) {
  var api = factory();
  // Electron nodeIntegration 同时暴露 module 和 window，必须两边都赋值
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.dsOnboard = api;
})(typeof window !== 'undefined' ? window : this, function () {
  var INITIAL_PASSWORD = '123456';
  var PHONE_RE = /^1[3-9]\d{9}$/;
  var NETWORK_ERROR = '网络异常，请稍后重试';
  // 票据失效 / 账号封禁 / 账号暂停：都不可能在当前弹窗里继续，必须重新登录
  var TERMINAL_CODES = { 10031: 1, 10024: 1, 10022: 1 };

  function isMobile(s) {
    return PHONE_RE.test(String(s == null ? '' : s));
  }

  // 文案与顺序必须与后端 backend/app/routes/auth.py 的 password_problem 一致
  function passwordProblem(oldPw, newPw, confirmPw) {
    oldPw = oldPw == null ? '' : String(oldPw);
    newPw = newPw == null ? '' : String(newPw);
    confirmPw = confirmPw == null ? '' : String(confirmPw);
    if (newPw.length < 8) return '新密码长度不能少于8位';
    if (newPw.length > 20) return '新密码长度不能超过20位';
    if (!(/[A-Za-z]/.test(newPw) && /[0-9]/.test(newPw))) return '新密码必须同时包含字母和数字';
    if (newPw === INITIAL_PASSWORD || newPw === oldPw) return '新密码不能与初始密码相同';
    if (newPw !== confirmPw) return '两次输入的新密码不一致';
    return null;
  }

  function validate(form) {
    form = form || {};
    if (!form.oldPassword) return '请输入旧密码';
    var pwProblem = passwordProblem(form.oldPassword, form.newPassword, form.confirmPassword);
    if (pwProblem) return pwProblem;
    if (!isMobile(form.phone)) return '手机号格式错误';
    if (!/^\d{6}$/.test(String(form.smsCode == null ? '' : form.smsCode))) return '请输入6位短信验证码';
    return null;
  }

  // 一次只允许一个弹窗：重复 open 先关掉旧的
  var current = null;

  function applyStyle(el, style) {
    Object.keys(style).forEach(function (k) { el.style[k] = style[k]; });
  }

  function open(options) {
    options = options || {};
    var doc = options.doc || (typeof document !== 'undefined' ? document : null);
    var fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    var setIntervalImpl = options.setIntervalImpl || (typeof setInterval !== 'undefined' ? setInterval : null);
    var clearIntervalImpl = options.clearIntervalImpl || (typeof clearInterval !== 'undefined' ? clearInterval : null);
    if (current) current.close();

    var closed = false;
    var submitting = false;
    var sending = false;
    var timer = null;

    function el(tag, role, style, text) {
      var e = doc.createElement(tag);
      if (role) e.setAttribute('data-role', role);
      if (style) applyStyle(e, style);
      if (text != null) e.textContent = text;
      return e;
    }

    var INPUT_STYLE = {
      display: 'block', width: '100%', boxSizing: 'border-box', margin: '8px 0', padding: '8px 10px',
      fontSize: '14px', border: '1px solid #dcdee2', borderRadius: '4px', outline: 'none',
    };

    function input(role, type, placeholder, maxlength) {
      var i = el('input', role, INPUT_STYLE);
      i.setAttribute('type', type);
      i.setAttribute('placeholder', placeholder);
      if (maxlength) i.setAttribute('maxlength', String(maxlength));
      return i;
    }

    var overlay = el('div', 'overlay', {
      position: 'fixed', top: '0', right: '0', bottom: '0', left: '0', inset: '0',
      zIndex: '2147483000', background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: '14px',
    });
    var card = el('div', 'card', {
      width: '380px', maxWidth: '92%', maxHeight: '92%', overflowY: 'auto', boxSizing: 'border-box',
      background: '#fff', borderRadius: '8px', padding: '24px', color: '#17233d',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', fontSize: '14px',
    });
    var title = el('div', 'title', { fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }, '首次登录 - 修改密码并绑定手机号');
    var note = el('div', 'note', { fontSize: '12px', color: '#808695', lineHeight: '1.5', marginBottom: '8px' },
      '为保障账号安全，首次登录需修改初始密码并绑定实名手机号，完成后请使用新密码重新登录。');
    var oldI = input('old', 'password', '旧密码', 20);
    oldI.value = INITIAL_PASSWORD;
    var newI = input('new', 'password', '新密码', 20);
    var hint = el('div', 'hint', { fontSize: '12px', color: '#808695' }, '8-20位，须同时包含字母和数字');
    var confirmI = input('confirm', 'password', '确认新密码', 20);
    var phoneI = input('phone', 'text', '实名手机号', 11);

    var codeRow = el('div', 'code-row', { display: 'flex', alignItems: 'center' });
    var codeI = input('code', 'text', '短信验证码', 6);
    codeI.style.flex = '1';
    codeI.style.width = 'auto';
    var sendBtn = el('button', 'send', {
      flex: 'none', marginLeft: '8px', padding: '8px 12px', fontSize: '14px', cursor: 'pointer',
      border: '1px solid #c0392b', color: '#c0392b', background: '#fff', borderRadius: '4px', whiteSpace: 'nowrap',
    }, '获取验证码');
    sendBtn.setAttribute('type', 'button');
    codeRow.appendChild(codeI);
    codeRow.appendChild(sendBtn);

    var errorBox = el('div', 'error', { color: '#e74c3c', fontSize: '13px', minHeight: '18px', margin: '4px 0' }, '');
    var submitBtn = el('button', 'submit', {
      display: 'block', width: '100%', padding: '10px', fontSize: '14px', cursor: 'pointer',
      border: 'none', color: '#fff', background: '#c0392b', borderRadius: '4px', marginTop: '8px',
    }, '确认提交');
    submitBtn.setAttribute('type', 'button');

    [title, note, oldI, newI, hint, confirmI, phoneI, codeRow, errorBox, submitBtn].forEach(function (n) { card.appendChild(n); });

    var exitBtn = null;
    if (typeof options.onExit === 'function') {
      exitBtn = el('button', 'exit', {
        display: 'block', margin: '12px auto 0', padding: '0', fontSize: '12px', cursor: 'pointer',
        border: 'none', background: 'none', color: '#808695', textDecoration: 'underline',
      }, '退出程序');
      exitBtn.setAttribute('type', 'button');
      exitBtn.addEventListener('click', function () { options.onExit(); });
      card.appendChild(exitBtn);
    }
    overlay.appendChild(card);

    function showError(msg) { errorBox.textContent = msg || ''; }

    function stopTimer() {
      if (timer != null && clearIntervalImpl) clearIntervalImpl(timer);
      timer = null;
    }

    // 弹窗不可取消：Esc 在捕获阶段拦截，关闭时必须摘掉监听
    function onKeydown(e) {
      if (e && e.key === 'Escape') {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
    }
    doc.addEventListener('keydown', onKeydown, true);

    function close() {
      if (closed) return;
      closed = true;
      stopTimer();
      doc.removeEventListener('keydown', onKeydown, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (current === handle) current = null;
    }
    var handle = { close: close };
    current = handle;

    function expired(msg) {
      close();
      if (typeof options.onExpired === 'function') options.onExpired(msg);
      else if (typeof alert === 'function') alert(msg);
    }

    // 返回 Promise<{code,msg,data}>；网络错误 / 非 JSON 都统一成 NETWORK_ERROR 抛出
    function post(path, body) {
      return Promise.resolve()
        .then(function () {
          return fetchImpl(options.apiURL + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || typeof res !== 'object') throw new Error('bad response');
          return res;
        });
    }

    // 统一处理终态码；返回 true 表示已处理（弹窗已关闭）
    function handleTerminal(res) {
      if (TERMINAL_CODES[res.code]) { expired(res.msg); return true; }
      return false;
    }

    function startCountdown(seconds) {
      var left = seconds;
      stopTimer();
      sendBtn.disabled = true;
      sendBtn.textContent = left + '秒后重发';
      if (!setIntervalImpl) return;
      timer = setIntervalImpl(function () {
        left -= 1;
        if (left <= 0) {
          stopTimer();
          sendBtn.disabled = false;
          sendBtn.textContent = '获取验证码';
        } else {
          sendBtn.textContent = left + '秒后重发';
        }
      }, 1000);
    }

    function sendCode() {
      if (closed || sending || timer != null) return;
      var phone = phoneI.value;
      if (!isMobile(phone)) { showError('手机号格式错误'); return; }
      showError('');
      sending = true;
      sendBtn.disabled = true;
      post('/auth/onboard/sms', { onboardToken: options.onboardToken, phone: phone })
        .then(function (res) {
          if (closed) return;
          sending = false;
          if (handleTerminal(res)) return;
          if (res.code === 0) {
            var n = res.data && Number(res.data.resendAfter);
            startCountdown(n > 0 ? n : 60);
          } else {
            sendBtn.disabled = false;
            showError(res.msg);
          }
        })
        .catch(function () {
          if (closed) return;
          sending = false;
          sendBtn.disabled = false;
          showError(NETWORK_ERROR);
        });
    }

    function submit() {
      if (closed || submitting) return;
      var form = {
        oldPassword: oldI.value, newPassword: newI.value, confirmPassword: confirmI.value,
        phone: phoneI.value, smsCode: codeI.value,
      };
      var problem = validate(form);
      if (problem) { showError(problem); return; }
      showError('');
      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中…';
      var body = { onboardToken: options.onboardToken };
      Object.keys(form).forEach(function (k) { body[k] = form[k]; });
      function done() {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = '确认提交';
      }
      post('/auth/onboard', body)
        .then(function (res) {
          if (closed) return;
          if (handleTerminal(res)) return;
          if (res.code === 0) {
            close();
            if (typeof options.onDone === 'function') options.onDone(res.msg);
          } else {
            done();
            showError(res.msg);
          }
        })
        .catch(function () {
          if (closed) return;
          done();
          showError(NETWORK_ERROR);
        });
    }

    sendBtn.addEventListener('click', sendCode);
    submitBtn.addEventListener('click', submit);
    [oldI, newI, confirmI, phoneI, codeI].forEach(function (i) {
      i.addEventListener('keydown', function (e) {
        if (e && e.key === 'Enter') {
          if (e.preventDefault) e.preventDefault();
          submit();
        }
      });
    });

    doc.body.appendChild(overlay);
    return handle;
  }

  return { isMobile: isMobile, passwordProblem: passwordProblem, validate: validate, open: open };
});
