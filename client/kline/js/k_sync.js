/**
 * K线页取开奖数据（第 011 章 3「数据同步」）：
 * 同步失败（网络错误、超时、返回里没有开奖列表）时在图表区域显示失败状态和「重试」入口，不画旧数据；
 * 重试成功后提示消失。retry 由调用方传入（K线页里就是重新加载本屏）。
 */
var kSync = function() {
	var BOX_ID = "kSyncFail";

	// 地址栏参数缺省时会是 "undefined" / "null" 字样
	function given(v, nullText) {
		return !!v && v != "undefined" && !(nullText && v == "null");
	}

	function box() {
		var el = document.getElementById(BOX_ID);
		if (!el) {
			el = document.createElement("div");
			el.id = BOX_ID;
			el.className = "k-sync-fail";
			var msg = document.createElement("span");
			msg.className = "k-sync-msg";
			var btn = document.createElement("button");
			btn.className = "k-sync-retry buttonK";
			btn.textContent = "重试";
			el.appendChild(msg);
			el.appendChild(btn);
			(document.getElementById("k1") || document.body).appendChild(el);
		}
		return el;
	}

	function fail(retry) {
		var el = box();
		var msg = el.querySelector(".k-sync-msg");
		var btn = el.querySelector(".k-sync-retry");
		msg.textContent = "数据同步失败";
		btn.disabled = false;
		btn.onclick = function() {
			btn.disabled = true;
			msg.textContent = "正在重新同步…";
			retry();
		};
		el.style.display = "";
	}

	function ok() {
		var el = document.getElementById(BOX_ID);
		if (el) el.style.display = "none";
	}

	return {
		/**
		 * src：{code, rows, mantissa, requestUrl}；successRes 只在拿到开奖列表时调用
		 */
		fetchDraws : function(src, successRes, retry) {
			var done = function(res) {
				if (!res || !Array.isArray(res.data)) {
					fail(retry);
					return;
				}
				ok();
				successRes(res);
			};
			var failed = function() {
				fail(retry);
			};
			if (given(src.mantissa)) {
				k_util.request('/lotteryNumber/mantissaTopRows', {
					code: src.code,
					rows: src.rows,
					mantissa: src.mantissa
				}, "", done, true, failed);
			} else if (given(src.requestUrl, true)) {
				k_util.requestA(src.requestUrl + '?code=' + src.code + "&rows=" + src.rows, done, failed);
			} else {
				k_util.request('/lotteryNumber/topRows', {
					code: src.code,
					rows: src.rows
				}, "", done, true, failed);
			}
		}
	};
}();
