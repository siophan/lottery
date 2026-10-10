// 六屏：本页作为第 N 号屏嵌在 K 线独立页里（地址带 screen=N），回调父页面时带上屏号；单独打开时为空
function kScreenNo() {
	var m = /[?&]screen=(\d)/.exec(window.location.search);
	return m ? m[1] : "";
}
var k = function() {
	return {
		/**
		 * @创建人：关宏岩
		 * @备注：自定方案点击事件
		 */
		liclic : function(v) {
			var pat = $(v).parent().parent().parent(".select");
			pat.removeClass('is-open');
			var span = pat.find("span");
			span.text($(v).text());
			var spanid = span.attr("id");
			if (spanid == "zdyfa4") {
				loadingData();
			} else {
				parent.printPlan($(v).text(), kScreenNo());
				loadingData();
			}
		},
		
		/**
		 * @创建人：关宏岩
		 * @备注：删除方案
		 */
		deleteFaBtn : function(name) {
			let groupName = $("#zdyfa3").text();
			parent.delPlan(groupName, name, kScreenNo());
			
		},
		/**
		 * @创建人：关宏岩
		 * @备注：删除组方法
		 */
		deleteZuBtn : function(name) {
			parent.delGroup(name, kScreenNo());
			
		},
		/**
		 * @创建人：关宏岩
		 * @备注：自定方案列表
		 */
		spanclic : function() {
			var fa = $("input[name='fa']:checked").val();
				
			if (fa == 1) {
				var parent = $(this).closest('.select');
				if (!parent.hasClass('is-open')) {
					parent.addClass('is-open');
					$('.select.is-open').not(parent).removeClass('is-open');
					
				} else {
					parent.removeClass('is-open');
				}
			}
		},
		/**
		 * @创建人：关宏岩
		 * @备注：获取自定义方案组
		 */
		getUserK : function(f) {
			parent.loadGroup(kScreenNo());
			
			
		},
		/**
		 * @创建人：关宏岩
		 * @备注：获取组中的自定义方案
		 */
		getUserK2 : function(f) {
			var fzName = $("#zdyfa3").attr("data");
			var url = '/planCustomize/list';
			var cp = $("#wf").val();
			var parm = {
				group_id : fzName
			};
			var onBackUserK2 = function(data) {
				var fa = $("input[name='fa']:checked").val();
				var result = data.succ;
				if (result) {
					var plans = data.data;
					var nr = "";
					for (var i = (plans.length - 1); i > -1; i--) {
						nr += "<li ><div onclick='k.liclic(this)' data='"+plans[i].id+"'>"
							+ plans[i].name
							+ "</div><input type='button' class='deleteCss' value='X' onclick=\"k.deleteFaBtn('"
							+ plans[i].id + "')\"></li>";
					}
					$("#zdyfa2").html(nr);
					if (f) {
						if (plans.length == 0 || plans[(plans.length - 1)] == "") {

							$("#zdyfa4").html("");
                            $("#zdyfa4").attr("data","");
						} else {
							$("#zdyfa4").html(plans[(plans.length - 1)].name);
                            $("#zdyfa4").attr("data",plans[(plans.length - 1)].id);
							if (fa == 1) {
								loadingData();
							}
						}
					}
				}
			}
			// 发送请求
			btms.request(url, parm, "", onBackUserK2, true);
		},
		/**
		 * @创建人：关宏岩
		 * @备注：自切换玩法
		 */
		WanFaQieHuan : function() {
			k.getUserK(true);
			var fa = $("input[name='fa']:checked").val();
			$("#tjfa").prop("checked", true);
			if (fa == 1) {
				k.getUserK(true);
				$("#tjfa3").attr("disabled", false);
			} else {
				$("#tjfa3").attr("disabled", false);
			}
			loadingData();
		},
		/**
		 * @创建人：关宏岩
		 * @备注：自定方案和固定方案切换
		 */
		checkfa : function(v, x) {
			if (v == 1) {
				k.getUserK(true);
				 $("#tjfa3").attr("disabled", true);
				 if (!kScreenNo()) $("#tongping").hide();
				 
				loadingData();
			} else if (v == 2) {
				$("#tjfa3").attr("disabled", false);
				 $("#tongping").show();
				$("input[name='fa']:eq(1)").prop("checked", true);
				// 六屏：「关联」回到本屏最近保存的方案，父页面选好后调 useLinked 重画
				if (kScreenNo() && parent.linkPlan) {
					parent.linkPlan(kScreenNo());
				} else if (x == 1) {
					loadingData();
				}
			}
		},
		/**
		 * 六屏：「关联」单选关联到本屏保存的方案时为 true，此时按自定义方案（zdyfa3 / zdyfa4）画图
		 */
		linked : false,
		/**
		 * 实际画图用的方案类型：1 自定义（含关联到保存方案），2 固定方案
		 */
		planMode : function() {
			var fa = $("input[name='fa']:checked").val();
			return fa == 2 && k.linked ? "1" : fa;
		},
		/**
		 * 六屏：父页面处理完「关联」后调用；has 为该屏有保存方案（已选进分组 / 方案下拉），没有时按兜底的固定方案画
		 */
		useLinked : function(has) {
			k.linked = !!has;
			$("#tjfa").prop("checked", true);
			$("#tjfa3").attr("disabled", false);
			loadingData();
		},
		/**
		 * 六屏：父页面按屏位记录选好分组 / 方案后，切到自定义方案并重画（不回调 loadGroup，避免循环）
		 */
		useCustom : function() {
			$("#zdyfa").prop("checked", true);
			$("#tjfa3").attr("disabled", true);
			loadingData();
		},
		/**
		 * 复制窗口：恢复源窗口该屏选的固定方案；方案没变时不重画
		 */
		useFixed : function(id) {
			k.linked = false;
			var before = $("#tjfa").prop("checked") ? String($("#tjfa3").val()) : null;
			$("#tjfa").prop("checked", true);
			$("#tjfa3").attr("disabled", false);
			if ($("#tjfa3 option").filter(function() { return this.value == id; }).length) {
				$("#tjfa3").val(id);
			}
			if (String($("#tjfa3").val()) !== before) {
				loadingData();
			}
		},
		/**
		 * 背景主题（第 011 章）：只换背景、面板底色、网格线和辅助文字；红蓝柱、布林线、MACD、KDJ 的语义色不变，
		 * 三套都是深色底，保证这些线和柱清楚
		 */
		themes : {
			night : { bg : "#000000", panel : "#141414", text : "#ffffff", sub : "#a0a0a0", line : "#444444" },
			ocean : { bg : "#06162c", panel : "#0c2342", text : "#e6f0ff", sub : "#8fb0d8", line : "#2c4f7c" },
			amber : { bg : "#1f1b17", panel : "#2b251f", text : "#f6e3c0", sub : "#c9a46a", line : "#5a4a36" }
		},
		themeName : "night",
		palette : function() {
			return k.themes[k.themeName] || k.themes.night;
		},
		// 六屏里按父页面当前主题，单独打开时用深夜黑
		startTheme : function() {
			try {
				if (kScreenNo() && parent.klineTheme) return parent.klineTheme();
			} catch (e) {}
			return "night";
		},
		// 给 echarts 配置上色（就地修改并返回），k_line 生成配置和换主题时共用
		themeChart : function(option) {
			var p = k.palette();
			option.backgroundColor = p.bg;
			option.textStyle = Object.assign({}, option.textStyle, { color : p.text });
			if (option.title) option.title.textStyle = Object.assign({}, option.title.textStyle, { color : p.text });
			[].concat(option.xAxis || [], option.yAxis || []).forEach(function(axis) {
				var line = axis.axisLine || {};
				axis.axisLabel = Object.assign({}, axis.axisLabel, { color : p.sub });
				axis.axisLine = Object.assign({}, line, { lineStyle : Object.assign({}, line.lineStyle, { color : p.line }) });
			});
			return option;
		},
		// 父页面切换主题时调用：换页面底色，已画好的图表就地重涂，不重新取数
		applyTheme : function(name) {
			k.themeName = k.themes[name] ? name : "night";
			$("body").css("background-color", k.palette().panel);
			var chart = typeof myChart != "undefined" ? myChart : null;
			var current = chart && chart.getOption ? chart.getOption() : null;
			if (!current) return;
			var blank = function() { return {}; };
			chart.setOption(k.themeChart({
				title : {},
				xAxis : (current.xAxis || []).map(blank),
				yAxis : (current.yAxis || []).map(blank)
			}));
		},
		/**
		 * @创建人：关宏岩
		 * @备注：根据main_id得到彩种id
		 */
		czid : function(main_id) {
			var cat = ""
			if (main_id == "104") {
				cat = "pls"
			} else if (main_id == "202") {
				cat = "3d"
			}
			return cat;
		},
	}
}();
$(function() {
	k.applyTheme(k.startTheme());
});
//MACD
function macdFunction() {
	let userName = localStorage.getItem("userName");
	var macdK = localStorage.getItem(userName+"_macdK");
	if (macdK == null || macdK == "") {
		localStorage.setItem(userName+"_macdK","1");
		
	} else {
		localStorage.setItem(userName+"_macdK","");
	}
	loadingData();
}
//KDJ
function kdjFunction() {
	let userName = localStorage.getItem("userName");
	var kdjK = localStorage.getItem(userName+"_kdjK");
	if (kdjK == null || kdjK == "") {
		localStorage.setItem(userName+"_kdjK", "1")
	} else {
		localStorage.setItem(userName+"_kdjK", "")
	}
	loadingData();
}
/**
 * @创建人：关宏岩
 * @备注：监听页面滚轮事件
 */
window.onload = function() {
	var odvafa = document.getElementById("tjfa3");
	gunlun(odvafa, 'mousewheel', fagundong);
//gunlun(odvafa,'DOMMouseScroll',fagundong);
}
function gunlun(obj, x, f) {
	if (obj != null) {
		if (obj.attachEvent) {
			obj.attachEvent("on" + x, f)
		} else {
			obj.addEventListener(x, f, false);
		}
	} else {
	}
}
function fagundong(e) {
	var c = $("#tjfa3").val();
	e = e || window.event;
	if (e.wheelDelta) { //判断浏览器IE，谷歌滑轮事件
		if (e.wheelDelta > 0) { //当滑轮向上滚动时
			c--;
			for (var i = 1; i <= 9; i++) {
				if (c == i) {
					$("#tjfa3").val(i)
				}
			}
			if (c > 0) {
				setTimeout(loadingData, 500)
			}
			if (c < 1) {
				c = 1
			}
		}
		if (e.wheelDelta < 0) { //当滑轮向下滚动时
			c++;
			for (var i = 1; i <= 9; i++) {
				if (c == i) {
					$("#tjfa3").val(i)
				}
			}
			if (c < 10) {
				setTimeout(loadingData, 500)
			}
			if (c > 9) {
				c = 9
			}
		}
	} else if (e.detail) { //Firefox滑轮事件
		if (e.detail > 0) { //当滑轮向上滚动时
			c--;
			for (var i = 1; i <= 9; i++) {
				if (c == i) {
					$("#tjfa3").val(i)
				}
			}
			if (c > 0) {
				setTimeout(loadingData, 500)
			}
			if (c < 1) {
				c = 1
			}
		}
		if (e.detail < 0) { //当滑轮向下滚动时
			c++;
			for (var i = 1; i <= 9; i++) {
				if (c == i) {
					$("#tjfa3").val(i)
				}
			}
			if (c < 10) {
				setTimeout(loadingData, 500)
			}
			if (c > 9) {
				c = 9
			}
		}
	}
}
///根据彩种玩法设置总注数
function getsunzs(cat, wf) {
	var num = 0;

		if (wf == "1105r5") {
			num = 462 ;
		} else if (wf == "1105r4") {
			num = 330 ;
		} else if (wf == "1105r3") {
			num = 165
		} else if (wf == "1105p2") {
			num = 55
		} else if (wf == "1105q2zh" || wf == "1105q2z") {
			num = 55
		} else if (wf = "1105q3zh" || wf == "1105q3z") {
			num = 165
		}else if (wf == "ssca2" || wf == "sscp2") {
			num = 100
		} else if (wf == "ssca3" || wf == "sscp3") {
			num = 1000
		} else if (wf == "sscs4") {
			num = 10000
		}else if (wf == "plsr3") {
			num = 1000
		} else if (wf == "plsr5") {
			num = 100000
		}else if (wf == "3dr3") {
			num = 1000
		}

	return num
}