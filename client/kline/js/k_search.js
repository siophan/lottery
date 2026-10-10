/**
 * 方案搜索（第 011 章 6、7「分组 / 方案下拉：搜索并加载已保存的K线方案」）：
 * 按方案名或分组名搜索本机保存的方案，选中后本屏加载该方案。方案列表由六屏父页面提供，单独打开时不显示搜索框。
 */
var kSearch = function() {
	var results = [];

	function el(id) {
		return document.getElementById(id);
	}

	function hide() {
		var ul = el("faSearchList");
		ul.innerHTML = "";
		ul.style.display = "none";
		results = [];
	}

	// 结果按文字显示（textContent），分组 / 方案名不当 HTML 解析
	function show(list) {
		var ul = el("faSearchList");
		ul.innerHTML = "";
		results = list;
		if (list.length == 0) {
			var empty = document.createElement("li");
			empty.className = "empty";
			empty.textContent = "没有找到方案";
			ul.appendChild(empty);
		}
		list.forEach(function(item) {
			var li = document.createElement("li");
			li.textContent = item.group + " / " + item.plan;
			li.title = li.textContent;
			li.onclick = function() {
				pick(item.group, item.plan);
			};
			ul.appendChild(li);
		});
		ul.style.display = "";
	}

	function pick(group, plan) {
		hide();
		el("faSearch").value = "";
		if (!parent.pickPlan(group, plan, kScreenNo())) {
			layer.msg("该方案已不存在");
		}
	}

	function search(keyword) {
		if (!String(keyword || "").trim()) {
			hide();
			return;
		}
		show(Array.prototype.slice.call(parent.searchPlans(keyword) || []));
	}

	return {
		init : function() {
			var box = el("faSearchBox");
			if (!box) return;
			if (!kScreenNo() || !parent.searchPlans) {
				box.style.display = "none";
				return;
			}
			var input = el("faSearch");
			hide();
			input.oninput = function() {
				search(input.value);
			};
			// 窗口打开后工作台可能又保存了方案，点进搜索框时先刷新方案列表
			input.onfocus = function() {
				if (parent.refreshPlans) parent.refreshPlans();
			};
			input.onkeydown = function(e) {
				if (e.key === "Escape") {
					hide();
				} else if (e.key === "Enter" && results.length) {
					e.preventDefault();
					pick(results[0].group, results[0].plan);
				}
			};
			document.addEventListener("click", function(e) {
				if (!box.contains(e.target)) hide();
			});
		}
	};
}();
kSearch.init();
