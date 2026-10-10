/**
 * 「提交」按钮状态（第 011 章 7「加载中禁用重复提交；无方案时提交按钮置灰」）：
 * 当前方案的号码画完之前（加载中 / 同步失败）置灰，避免把上一个方案的号码提交到工作台；没选方案时置灰；
 * 点一次后锁定一秒，避免连点在工作台生成重复的条件卡。
 */
var kSubmit = function() {
	var LOCK_MS = 1000;
	var ready = false;
	var busy = false;

	function el(id) {
		return document.getElementById(id);
	}

	// 自定义方案要选了分组和方案；固定方案要本机有号码（pinjietj 从 localStorage 取）
	function hasPlan() {
		if (k.planMode() == 1) {
			return !!(el("zdyfa3").innerHTML && el("zdyfa4").innerHTML);
		}
		var id = el("tjfa3").value;
		return !!id && !!localStorage.getItem(id);
	}

	function refresh() {
		var btn = el("tijiao");
		if (btn) btn.disabled = busy || !ready;
	}

	return {
		// loadingData 开始画图
		loading : function() {
			ready = false;
			refresh();
		},
		// getyesAndno 拿到当前方案的号码
		ready : function() {
			ready = hasPlan();
			refresh();
		},
		// tj 开头调用：不可提交时返回 false
		begin : function() {
			if (busy || !ready) return false;
			busy = true;
			refresh();
			setTimeout(function() {
				busy = false;
				refresh();
			}, LOCK_MS);
			return true;
		},
		refresh : refresh
	};
}();
kSubmit.refresh();
