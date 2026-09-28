var btutil = function() {
	return {
		getName: function(t) {
			return $.i18n.prop(t)
		},
		showMsg: function(t, e) {
			e = e || 600, layer.msg(t, {
				time: e
			})
		},
		showMsg2: function(t, e, n, r) {
			e = e || 600, null != r && null != n ? layer.msg(btutil.getName(t) + "!!" + btutil.getName(n) +
				btutil.cookieGet("expect" + type_name) + btutil.getName(r), {
					time: e
				}) : layer.msg(btutil.getName(t), {
				time: e
			})
		},
		replaceAll: function(t, e, n) {
			return t.replace(new RegExp(e, "gm"), n)
		},
		isNull: function(t) {
			return "" == t || null == t || !t
		},
		leftFillZero: function(t, e) {
			for (; t.length < e;) t = "0" + t;
			return t.toString()
		},
		isArray: function(t) {
			return !(!t || "object" != typeof t || "function" != typeof t.sort || "number" != typeof t.length)
		},
		isNumber: function(t) {
			return /^\+?[1-9][0-9]*$/.test(t)
		},
		isMobile: function(t) {
			return /^1[3|4|5|7|8][0-9]\d{8}$/.test(t)
		},
		isEmail: function(t) {
			return /^([0-9A-Za-z\-_\.]+)@([0-9A-Za-z\-_\.])+\.[a-zA-Z]{2,3}$/g.test(t)
		},
		isCard: function(t) {
			return /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(t)
		},
		isWechat: function(t) {
			return /^[a-zA-Z\d_]{5,}$/.test(t)
		},
		subString: function(t, e) {
			var n, r = 0;
			str_cut = new String, n = t.length;
			for (var i = 0; i < n; i++)
				if (a = t.charAt(i), r++, 4 < escape(a).length && r++, str_cut = str_cut.concat(a), e <= r)
					return str_cut = str_cut.concat("   "), str_cut;
			if (r < e) return t
		},
		getValue: function(t) {
			var e = location.search.match(new RegExp("[?&]" + t + "=([^&]*)(&?)", "i"));
			return e ? e[1] : e
		},
		submitClick: function(i, e, a, n) {
			$("#" + i).submit(function(t) {
				n ? $("#" + i).attr("target", n) : $("#" + i).attr("target", "_self"), $("#" + i).attr(
					"action", basePath + e), $("#" + i).attr("method", "POST"), $.each(a, function(
					t, e) {
					var n = i + "_" + a[t].key,
						r = a[t].value;
					$("#" + n).attr("value", r)
				})
			}), $("#" + i).submit()
		},
		sleep: function(t) {
			for (var e = (new Date).getTime(); !((new Date).getTime() - e > t););
		},
		isContain: function(t, e) {
			return 0 <= t.indexOf(e)
		},
		maxJsonArray: function(json_array, value) {
			var list = new Array;
			for (var i in json_array) eval("list.push(json_array[" + i + "]." + value + ");");
			list.sort(function(t, e) {
				return t - e
			});
			var maxcnt = eval(list[list.length - 1]);
			return maxcnt
		},
		uniqueArray: function(t) {
			for (var e = [], n = {}, r = 0; r < t.length; r++) n[t[r]] || (e.push(t[r]), n[t[r]] = 1);
			return e
		},
		serializeJson: function(t) {
			var e = $("#" + t),
				n = {},
				r = e.serializeArray();
			e.serialize();
			return $(r).each(function() {
				n[e.name] ? $.isArray(n[e.name]) ? n[e.name].push(e.value) : n[e.name] = [n[e.name], e
					.value
				] : n[e.name] = e.value
			}), n
		},
		cookieSet: function(t, e, n) {
			t = btutil.getLanguageKey(t, n), localStorage.setItem(t, e)
		},
		cookieGet: function(t, e) {
			return t = btutil.getLanguageKey(t, e), localStorage.getItem(t)
		},
		cookieDel: function(t, e) {
			t = btutil.getLanguageKey(t, e), localStorage.removeItem(t)
		},
		cookieClear: function() {
			localStorage.clear()
		},
		getLanguageKey: function(t, e) {
			e || (t = btutil.getLanguage() + "_" + t);
			return t
		},
		getLanguage: function() {
			var t = btutil.cookieGet("language", !0);
			return t = btutil.isNull(t) ? "cn" : t
		},
		changeLanguage: function(t) {
			t = t || "cn", jQuery.i18n.properties({
				name: "language",
				path: "i18n/",
				mode: "map",
				language: t,
				callback: function() {
					btutil.cookieSet("language", t, 1)
				}
			})
		},
		changeWarn: function(t) {
			t = t || "cn", jQuery.i18n.properties({
				name: "warn",
				path: "i18n/",
				mode: "map",
				language: t,
				callback: function() {
					btutil.cookieSet("warn", t, 1)
				}
			})
		}
	}
}();

function sortarr(t) {
	for (i = 0; i < t.length - 1; i++)
		for (j = 0; j < t.length - 1 - i; j++)
			if (t[j] > t[j + 1]) {
				var e = t[j];
				t[j] = t[j + 1], t[j + 1] = e
			} return t
}
Date.prototype.format = function(t) {
	var e = {
		"M+": this.getMonth() + 1,
		"d+": this.getDate(),
		"h+": this.getHours(),
		"m+": this.getMinutes(),
		"s+": this.getSeconds(),
		"q+": Math.floor((this.getMonth() + 3) / 3),
		S: this.getMilliseconds()
	};
	for (var n in /(y+)/.test(t) && (t = t.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1
			.length))), e) new RegExp("(" + n + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? e[
		n] : ("00" + e[n]).substr(("" + e[n]).length)));
	return t
}, String.prototype.startWith = function(t) {
	return new RegExp("^" + t).test(this)
}, String.prototype.endWith = function(t) {
	return new RegExp(t + "$").test(this)
}, Array.prototype.min = function() {
	for (var t = this[0], e = this.length, n = 1; n < e; n++) this[n] < t && (t = this[n]);
	return t
}, Array.prototype.max = function() {
	for (var t = this[0], e = this.length, n = 1; n < e; n++) this[n] > t && (t = this[n]);
	return t
}, Array.prototype.indexOf = function(t) {
	for (var e = 0; e < this.length; e++)
		if (this[e] == t) return e;
	return -1
}, Array.prototype.remove = function(t) {
	var e = this.indexOf(t); - 1 < e && this.splice(e, 1)
}, window.alert = function(t, e) {
	$.alertable ? $.alertable.alert(t).always(function() {
		"function" == typeof e && e()
	}) : window.alert(t)
}, window.confirm = function(t, e) {
	$.alertable ? $.alertable.confirm(t).then(function() {
		"function" == typeof e && e()
	}) : window.confirm(t)
}, Array.prototype.intersect = function(t) {
	for (var e = {}, n = [], r = 0; r < t.length; r++) e[t[r]] = r;
	for (r = 0; r < this.length; r++) null != e[this[r]] && n.push(this[r]);
	return n
}, $(document).ready(function() {});
