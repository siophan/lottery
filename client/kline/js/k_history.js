/**
 * 后退 / 前进（第 011 章 3）：在本屏看过的方案之间切换；没有可后退 / 前进的方案时按钮置灰。
 * 每次画图（loadingData）记下当前方案，同一方案重画不重复记录；后退 / 前进只切换要看的方案，不改已保存的分组和方案。
 * 原来按期数翻页的后退 / 前进不再使用。
 */
var kHistory = function() {
	var MAX = 50;
	var list = [];
	var index = -1;

	function el(id) {
		return document.getElementById(id);
	}

	// 当前在画的方案：自定义（含「关联」到保存方案）为 {group, plan}，固定方案为 {fixed}；没选中方案时为 null
	function current() {
		if (k.planMode() == 1) {
			var group = el("zdyfa3").innerHTML;
			var plan = el("zdyfa4").innerHTML;
			return group && plan ? { group: group, plan: plan } : null;
		}
		var fixed = el("tjfa3").value;
		return fixed ? { fixed: String(fixed) } : null;
	}

	function same(a, b) {
		return !!a && !!b && a.group === b.group && a.plan === b.plan && a.fixed === b.fixed;
	}

	function refresh() {
		el("houtui").disabled = index <= 0;
		el("qianjin").disabled = index >= list.length - 1;
	}

	function hasFixed(id) {
		var options = el("tjfa3").options;
		for (var i = 0; i < options.length; i++) {
			if (String(options[i].value) === id) return true;
		}
		return false;
	}

	// 切回记下的方案并重画；方案已不存在时返回 false
	function apply(state) {
		if (state.fixed !== undefined) {
			if (!hasFixed(state.fixed)) return false;
			k.linked = false;
			el("zdyfa").checked = false;
			el("tjfa").checked = true;
			el("tjfa3").disabled = false;
			el("tjfa3").value = state.fixed;
			loadingData();
			return true;
		}
		return !!(parent.pickPlan && parent.pickPlan(state.group, state.plan, kScreenNo()));
	}

	function go(step) {
		var from = index;
		var target = from + step;
		while (target >= 0 && target < list.length) {
			// 先移指针：重画时 record 看到的就是这一项，不会截掉另一个方向的记录
			index = target;
			if (apply(list[target])) {
				refresh();
				return;
			}
			// 方案已删除：去掉这一项，继续往同一方向找
			list.splice(target, 1);
			if (step < 0) {
				from--;
				target--;
			}
		}
		index = from;
		refresh();
	}

	return {
		record : function() {
			var state = current();
			if (state && !same(state, list[index])) {
				list = list.slice(0, index + 1);
				list.push(state);
				if (list.length > MAX) list = list.slice(list.length - MAX);
				index = list.length - 1;
			}
			refresh();
		},
		back : function() {
			go(-1);
		},
		forward : function() {
			go(1);
		},
		refresh : refresh
	};
}();
if (document.getElementById("houtui")) kHistory.refresh();
