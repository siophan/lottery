var qihao = "",
	kaijianghao = "",
	basePath = "https://soft-api.data-ys.com/api",
	userPath = "https://soft-api.data-ys.com/api",
	getDataUrl = "/lotteryNumber/topRows";
var baseUrl = "https://api.qkltj.com/api/draw-result";
var initFlag = 0;

function aa() {
	var s = document.getElementById("cc").scrollTop,
		a = document.getElementById("cc").scrollLeft;
	document.getElementById("dd").scrollTop = s, document.getElementById("hh").scrollLeft = a, document.getElementById(
		"mm").scrollLeft = a
}

function getData() {
	var s = {
		rows: 1,
		play_id: JSON.parse(common.cookieGet("obj")).play_id,
		code: JSON.parse(common.cookieGet("obj")).code
	};
	var obj = JSON.parse(common.cookieGet("obj"));
	if (obj.play_id.indexOf("animals") > -1) {
		if (obj.play_id.indexOf("q") > -1) {
			s.mantissa = obj.play_id.substring(obj.play_id.length - 3, obj.play_id.length - 2)
		}
	}
	common.request(getDataUrl, s, "", function(res) {
		if (res.code == 0) {
			if (kaijianghao != res.data[0].opennumber || qihao != res.data[0].expect) {
				common.refresh()
			}
		}
	})
}

function getDmData() {
	var s = JSON.parse(common.cookieGet("obj")),
		a = "/codeTrend/sscList",
		e = common.cookieGet("xzdm");
	"1105r5" == s.play_id && (a = "/codeTrend/11x5List", e = parseInt(common.cookieGet("xzdm")));
	var c = s.play_id;
	"plsr3" == s.play_id ? c = "p3" : "3dr3" == s.play_id && (c = "3d");
	var r = {
		rows: 1,
		play_id: c,
		code: s.code,
		type: e
	};
	common.request(a, r, "", function(s) {
		console.log(JSON.stringify(s))
		if (s.code == 0) {
			var a = "1105r5" == JSON.parse(common.cookieGet("obj")).play_id ? s.data[0].openNumber : s.data[0]
				.opennumber;
			kaijianghao == a && qihao == s.data[0].expect || style.getStyle()
		}
	})
}
document.addEventListener("UniAppJSBridgeReady", function() {});
var common = {
	submiting: function() {
		let obj = JSON.parse(common.cookieGet("obj"));
		var c = {};
		$(".select-yes").each(function() {
			var s = $(this).attr("alt"),
				a = $(this).attr("span"),
				e = $(this).attr("value");
			null == c[s] ? (c[s] = {}, c[s][a] = e) : null == c[s][a] ? c[s][a] = e : c[s][a] = c[s][
				a
			] + "," + e
		});
		var s = [],
			a = parseInt(JSON.parse(common.cookieGet("obj")).back),
			e = 0,
			r = 0,
			t = 0;
		for (var n in c) {
			if (NewCode_Number_PD(n)) {
				var i = 0,
					l = c[n];
				for (var o in l) i++;
				if (1 < i)
					for (var p in l) {
						var d;
						0 == parseInt(p) && (d = {
							0: l[p]
						}), 2 == parseInt(p) && (d = {
							2: l[p]
						}), 4 == parseInt(p) && (d = {
							4: l[p]
						}), 6 == parseInt(p) && (d = {
							6: l[p]
						}), s[t] = substring_play(n, d), t++
					} else s[t] = substring_play(n, c[n]), t++
			} else s[e] = substring_play(n, c[n]);
			s[e].tan && (r++, delete s[e].tan), e++
		}
		let datas = {
			data: s
		}
		if (obj.from_type == "pc") {
			console.log(datas)
			window.parent.postMessage(datas, '*')
			showMsg("提交成功")
		} else {
			0 == r ? 0 < e ? (
				// window.parent.postMessage(datas, '*'),
				uni.postMessage({
					data: s
				}),
				uni.navigateBack({
					delta: a
				})
			) : showMsg(language(common.cookieGet("language"), "beforesubm")) : showMsg(language(common
				.cookieGet("language"), "sub_exception"))
		}
	},
	onBack: function() {
		uni.navigateBack({
			delta: 1
		})
	},
	getName: function(s) {
		language(this.cookieGet("language"), s)
	},
	cookieSet: function(s, a) {
		sessionStorage.setItem(s, a)
	},
	cookieGet: function(s) {
		return sessionStorage.getItem(s)
	},
	receive: function(type, a) {
		var play = type.play_id + "-" + type.chart_id;
		if (initFlag < 1) {
			initFlag++;
			initialize.initialize(play, type.chart_id);
		}
		var num = parseInt($("#qss").html())
		getDataUrl = "/lotteryNumber/topRows"
		if (type.chart_id == "trend_dingweifenbu") {
			num += 200
		} else if ("trend_xingtaiZouShi" == type.chart_id || "trend_jibenZouShi" == type.chart_id && (-1 < type
				.play_id.indexOf("1105") || -1 < type.play_id.indexOf("1205"))) {
			num += 2
		} else if (("trend_litiZouShi" != type.chart_id || "ssca2" != type.play_id && "sscp2" != type
				.play_id) && "trend_hezhenzoushi" != type.chart_id && ("trend_tongweiZhenFu" != type.chart_id &&
				"trend_lianhaoChongMa" != type.chart_id || !(-1 < type.play_id.indexOf("1105") || -1 < type
					.play_id.indexOf("1205") || type.play_id.indexOf("animals") > -1)) && type.play_id.indexOf(
				"animals") < 0) {
			num += 1
		}
		var r = {
			rows: num,
			play_id: type.play_id,
			code: type.code
		};
		if (type.play_id.indexOf("animals") > -1) {
			if (type.play_id.indexOf("q") > -1) {
				r.mantissa = type.play_id.substring(type.play_id.length - 3, type.play_id.length - 2)
				getDataUrl = "/lotteryNumber/mantissaTopRows"
			}
			let plays = type.play_id.substring(type.play_id.length - 2, type.play_id.length)
			let start = []
			if (plays == "a2") {
				start = [0, 2]
			} else if (plays == "a3") {
				start = [0, 3]
			} else if (plays == "p2") {
				start = [4, 6]
			} else if (plays == "p3") {
				start = [3, 6]
			}
			this.request(getDataUrl, r, "", function(src) {
				if (src.code == 0) {
					let dataFlag = src.data;
					let flag = []
					for (let i = 0; i < dataFlag.length; i++) {
						let obj = dataFlag[i]
						let newObj = {
							createTime: obj.createTime,
							creater: obj.creater,
							expect: obj.expect,
							id: obj.id,
							isEnable: obj.isEnable,
							lotteryExdate: obj.lotteryExdate,
							lottoId: obj.lottoId,
							lottoType: obj.lottoType,
							lottoTypeCn: obj.lottoTypeCn,
							modifier: obj.modifier,
							modifyTime: obj.modifyTime,
							nextIssueNo: obj.nextIssueNo,
							nextOpenTime: obj.nextOpenTime,
							openTime: obj.openTime,
						}
						let opennumber = obj.opennumber.split(",")
						let newNumber = ""
						for (let j = start[0]; j < start[1]; j++) {
							newNumber += opennumber[j] + ","
						}
						newNumber = newNumber.substring(0, newNumber.length - 1)
						newObj.opennumber = newNumber
						flag.push(newObj)
					}
					qihao = src.data[0].expect;
					kaijianghao = src.data[0].opennumber;
					content.content(play, flag)
				}
			})
		} else {
			this.request(getDataUrl, r, "", function(src) {
				if (src.code == 0) {
					qihao = src.data[0].expect;
					kaijianghao = src.data[0].opennumber;
					content.content(play, src.data)
				}
			})
		}
	},
	request: function(s, a, e, c) {
		let obj = JSON.parse(this.cookieGet("obj"))
		a.from_Id = obj.from_Id, a.token = obj.token;
		if (obj.play_id.indexOf("hash") > -1 || obj.play_id.indexOf("animals") > -1) {
			$.ajax({
				type: "GET",
				contentType: "application/json",
				url: baseUrl,
				data: a,
				headers: {
					token: obj.token,
					fromId: "802",
				},
				beforeSend: function() {
					return "function" != typeof e || e()
				},
				success: function(s) {
					c && "function" == typeof c && c(s)
				},
				error: function(s, a, e) {}
			})
		} else {
			$.ajax({
				type: "post",
				contentType: "application/json",
				url: userPath + s,
				data: JSON.stringify(a),
				headers: {
					token: obj.token,
					fromId: "802",
				},
				beforeSend: function() {
					return "function" != typeof e || e()
				},
				success: function(s) {
					c && "function" == typeof c && c(s)
				},
				error: function(s, a, e) {}
			})
		}
	},
	requestType: function(s, a, e, c) {
		var r = a;
		"post" == c && (r = JSON.stringify(a)), $.ajax({
			type: c,
			contentType: "application/json",
			url: userPath + s,
			data: r,
			headers: {
				token: a.token
			},
			beforeSend: function() {},
			success: function(s) {
				e && "function" == typeof e && e(s)
			},
			error: function(s, a, e) {}
		})
	},
	sortArr: function(s) {
		for (var a = (s = s.concat()).length, e = 0; e < a - 1; ++e)
			for (var c = 0; c < a - 1 - e; ++c)
				if (s[c] > s[c + 1]) {
					var r = s[c];
					s[c] = s[c + 1], s[c + 1] = r
				} return s
	},
	getMinArr: function(s) {
		for (var a = s[0], e = 1; e < s.length; ++e) s[e] < a && (a = s[e]);
		return a
	},
	getMaxArr: function(s) {
		for (var a = s[0], e = 1; e < s.length; ++e) s[e] > a && (a = s[e]);
		return a
	},
	refresh: function(s) {
		var a = JSON.parse(this.cookieGet("obj"));
		$("#qss").html(s)
		this.receive(a, s)
	},
	cutOut: function(s, a, e) {
		return s.substring(a, e)
	},
	group: function(s) {
		for (var a = this.cookieGet("language"), e = 0, c = 0; c < s.length - 1; c++)
			for (var r = c + 1; r < s.length; r++) s[c] == s[r] && e++;
		var t = language(a, "zuliu");
		return 1 == e ? t = language(a, "zusan") : 2 <= e && (t = language(a, "baozi")), t
	},
	getCondition: function(s, a) {
		for (var e = [], c = 0; c < a; c++) e[c] = s;
		return e
	},
	removeAgain: function(s) {
		s = this.sortArr(s);
		var a = [];
		return s.forEach(function(s) {
			"-1" == a.indexOf(s) && a.push(s)
		}), a
	},
	getAgain: function(s) {
		var a = [];
		s = this.sortArr(s);
		for (var e = 0; e < s.length - 1; e++)
			if (s[e] == s[e + 1]) {
				for (var c = 0, r = 0; r < a.length; r++) s[e] == a[r] && c++;
				c < 1 && a.indexOf(s[e]) < 0 && a.push(s[e])
			} return a
	},
	cutOutNumber: function(s, a) {
		for (var e = s.split(","), c = "", r = 0; r < e.length; r++) c += e[r] + ",";
		switch (c = c.substring(0, c.length - 1), a) {
			case "sscs4":
				c = e[1] + "," + e[2] + "," + e[3] + "," + e[4];
				break;
			case "plsr3":
			case "ssca3":
			case "hasha3":
				c = e[0] + "," + e[1] + "," + e[2];
				break;
			case "ssca2":
				c = e[0] + "," + e[1];
				break;
			case "sscp2":
				c = e[3] + "," + e[4];
				break;
			case "sscp3":
				c = e[2] + "," + e[3] + "," + e[4];
				break;
			case "1105a3":
			case "1205a3":
				c = e[0] + "," + e[1] + "," + e[2];
				break;
			case "1105a2":
			case "1205a2":
				c = e[0] + "," + e[1]
		}
		return c
	},
	getStringNum: function(s, a) {
		for (var e = [], c = 0, r = s; r <= a; r++) e[c] = r < 10 ? "0" + r : r.toString(), c++;
		return e
	},
	getIntNum: function(s, a) {
		for (var e = [], c = 0, r = s; r <= a; r++) e[c] = r, c++;
		return e
	},
	clickClean: function() {
		state = 0;
		var e = $("#bottomval").children("td");
		$.each(e, function(s, a) {
			e[s].setAttribute("class", "")
		}), conditionsSubmit = new Array
	},
	clickSubmit: function(s) {
		$("#SignItem100 tr td[class='select-yes']").attr("class", ""), "select-yes" == s.getAttribute("class") ?
			s.setAttribute("class", "") : "undefined" != s.getAttribute("id") ? this.exclude(s) : -1 < s
			.getAttribute("alt").indexOf("666") ? (s.setAttribute("class", ""), showMsg("该条件无法选择", 1500)) : s
			.setAttribute("class", "select-yes")
	},
	special: function() {
		var s = JSON.parse(this.cookieGet("obj")),
			a = 44;
		switch (s.play_id + "-" + s.chart_id) {
			case "1105r5-liangMaHeZhiA":
			case "1105r5-sanMaHeZhiA":
			case "1105r5-liangMaChaZhi":
			case "1105r5-trend_hezhiFenBuA":
			case "1105r5-trend_hezhiShuJuA":
			case "1105r5-trend_hezhiZouShiA":
			case "1105r5-trend_lianhaoChongMa":
			case "1105r5-trend_junhengFenBu":
			case "1105r5-trend_sanmaChaHe":
			case "1105r5-trend_chazhiErFenBu":
			case "1105r5-trend_chazhiSanFenBu":
			case "1105r5-trend_chazhiSiFenBu":
			case "1105r5-trend_chazhiWuFenBu":
			case "1105r5-trend_chazhiGeShu":
			case "1105a3-trend_heheZouShi":
			case "1105a3-trend_kuaduZouShi":
			case "1105a3-trend_hezhiQuJian":
			case "1105a3-trend_shuxingZouShi":
			case "1105a3-trend_xingtaiZouShi":
			case "1105a2-trend_jibenZouShi":
			case "1105a2-trend_haomaShuXing":
			case "1205r5-trend_hezhiFenBuA":
			case "1205r5-trend_hezhiShuJuA":
			case "1205r5-trend_hezhiZouShiA":
			case "1205r5-trend_lianhaoChongMa":
			case "1205r5-trend_junhengFenBu":
			case "1205r5-trend_sanmaChaHe":
			case "1205r5-trend_chazhiErFenBu":
			case "1205r5-trend_chazhiSanFenBu":
			case "1205r5-trend_chazhiSiFenBu":
			case "1205r5-trend_chazhiWuFenBu":
			case "1205r5-trend_chazhiGeShu":
			case "1205a3-trend_heheZouShi":
			case "1205a3-trend_kuaduZouShi":
			case "1205a3-trend_hezhiQuJian":
			case "1205a3-trend_shuxingZouShi":
			case "1205a3-trend_xingtaiZouShi":
			case "1205a2-trend_jibenZouShi":
			case "1205a2-trend_haomaShuXing":
			case "ssca2-trend_litiZouShi":
			case "ssca2-trend_heheZouShi":
			case "ssca2-trend_chazhiZouShi":
			case "ssca2-trend_longtouFengWei":
			case "sscp2-trend_litiZouShi":
			case "sscp2-trend_heheZouShi":
			case "sscp2-trend_chazhiZouShi":
			case "sscp2-trend_longtouFengWei":
			case "ssca3-trend_jibenZouShi":
			case "ssca3-trend_heheZouShi":
			case "ssca3-trend_hezhiZouShiA":
			case "ssca3-trend_longtouFengWei":
			case "ssca3-trend_012luZouShi":
			case "sscp3-trend_jibenZouShi":
			case "sscp3-trend_heheZouShi":
			case "sscp3-trend_hezhiZouShiA":
			case "sscp3-trend_longtouFengWei":
			case "sscp3-trend_012luZouShi":
			case "plsr3-trend_jibenZouShi":
			case "plsr3-trend_heheZouShi":
			case "plsr3-trend_hezhiZouShiA":
			case "plsr3-trend_longtouFengWei":
			case "plsr3-trend_012luZouShi":
			case "3dr3-trend_jibenZouShi":
			case "3dr3-trend_heheZouShi":
			case "3dr3-trend_hezhiZouShiA":
			case "3dr3-trend_longtouFengWei":
			case "3dr3-trend_012luZouShi":
			case "k3r3-trend_pingmianZouShi":
			case "k3r3-trend_chaheZouShi":
			case "sscs4-trend_jibenZouShi":
			case "sscs4-trend_litiZouShi":
			case "sscs4-trend_heheZouShi":
			case "sscs4-trend_hezhiZouShiA":
				a = 44
		}
		return a
	},
	exclude: function(s) {
		var a = s.getAttribute("id");
		switch (s.setAttribute("class", "select-yes"), a) {
			case "ltd":
				$("#lts").attr("class", "");
				break;
			case "lts":
				$("#ltd").attr("class", "");
				break;
			case "ltz":
				$("#lth").attr("class", "");
				break;
			case "lth":
				$("#ltz").attr("class", "");
				break;
			case "fwd":
				$("#fws").attr("class", "");
				break;
			case "fws":
				$("#fwd").attr("class", "");
				break;
			case "fwz":
				$("#fwh").attr("class", "");
				break;
			case "fwh":
				$("#fwz").attr("class", "");
				break;
			case "lt_da":
				$("#lt_xiao").attr("class", "");
				break;
			case "lt_xiao":
				$("#lt_da").attr("class", "");
				break;
			case "lt_dan":
				$("#lt_shuang").attr("class", "");
				break;
			case "lt_shuang":
				$("#lt_dan").attr("class", "");
				break;
			case "lt_zhi":
				$("#lt_he").attr("class", "");
				break;
			case "lt_he":
				$("#lt_zhi").attr("class", "");
				break;
			case "fw_da":
				$("#fw_xiao").attr("class", "");
				break;
			case "fw_xiao":
				$("#fw_da").attr("class", "");
				break;
			case "fw_dan":
				$("#fw_shuang").attr("class", "");
				break;
			case "fw_shuang":
				$("#fw_dan").attr("class", "");
				break;
			case "fw_zhi":
				$("#fw_he").attr("class", "");
				break;
			case "fw_he":
				$("#fw_zhi").attr("class", "");
				break;
			case "zx_da":
				$("#zx_xiao").attr("class", "");
				break;
			case "zx_xiao":
				$("#zx_da").attr("class", "");
				break;
			case "zx_dan":
				$("#zx_shuang").attr("class", "");
				break;
			case "zx_shuang":
				$("#zx_dan").attr("class", "");
				break;
			case "zx_zhi":
				$("#zx_he").attr("class", "");
				break;
			case "zx_he":
				$("#zx_zhi").attr("class", "");
				break;
			case "zj_da":
				$("#zj_xiao").attr("class", "");
				break;
			case "zj_xiao":
				$("#zj_da").attr("class", "");
				break;
			case "zj_dan":
				$("#zj_shuang").attr("class", "");
				break;
			case "zj_shuang":
				$("#zj_dan").attr("class", "");
				break;
			case "zj_zhi":
				$("#zj_he").attr("class", "");
				break;
			case "zj_he":
				$("#zj_zhi").attr("class", "");
				break;
			case "zd_da":
				$("#zd_xiao").attr("class", "");
				break;
			case "zd_xiao":
				$("#zd_da").attr("class", "");
				break;
			case "zd_dan":
				$("#zd_shuang").attr("class", "");
				break;
			case "zd_shuang":
				$("#zd_dan").attr("class", "");
				break;
			case "zd_zhi":
				$("#zd_he").attr("class", "");
				break;
			case "zd_he":
				$("#zd_zhi").attr("class", "");
				break;
			case "onez":
				$("#oned").attr("class", ""), $("#oney").attr("class", "");
				break;
			case "oned":
				$("#onez").attr("class", ""), $("#oney").attr("class", "");
				break;
			case "oney":
				$("#onez").attr("class", ""), $("#oned").attr("class", "");
				break;
			case "twoz":
				$("#twod").attr("class", ""), $("#twoy").attr("class", "");
				break;
			case "twod":
				$("#twoz").attr("class", ""), $("#twoy").attr("class", "");
				break;
			case "twoy":
				$("#twoz").attr("class", ""), $("#twod").attr("class", "");
				break;
			case "thrz":
				$("#thrd").attr("class", ""), $("#thry").attr("class", "");
				break;
			case "thrd":
				$("#thrz").attr("class", ""), $("#thry").attr("class", "");
				break;
			case "thry":
				$("#thrz").attr("class", ""), $("#thrd").attr("class", "")
		}
	}
};

function NewCode_Number_PD(s) {
	var a = !1;
	switch (s) {
		case "sscp210201":
		case "sscp210202":
		case "sscp210203":
		case "sscp210204":
		case "sscp210205":
		case "sscp210206":
		case "sscp210207":
		case "sscp210208":
		case "sscp210209":
		case "ssca210201":
		case "ssca210202":
		case "ssca210203":
		case "ssca210204":
		case "ssca210205":
		case "ssca210206":
		case "ssca210207":
		case "ssca210208":
		case "ssca210209":
		case "ssca310201":
		case "ssca310202":
		case "ssca310203":
		case "ssca310204":
		case "ssca310205":
		case "ssca310206":
		case "ssca310207":
		case "ssca310208":
		case "ssca310209":
		case "sscp310201":
		case "sscp310202":
		case "sscp310203":
		case "sscp310204":
		case "sscp310205":
		case "sscp310206":
		case "sscp310207":
		case "sscp310208":
		case "sscp310209":
		case "3dr310201":
		case "3dr310202":
		case "3dr310203":
		case "3dr310204":
		case "3dr310205":
		case "3dr310206":
		case "3dr310207":
		case "3dr310208":
		case "3dr310209":
		case "plsr310201":
		case "plsr310202":
		case "plsr310203":
		case "plsr310204":
		case "plsr310205":
		case "plsr310206":
		case "plsr310207":
		case "plsr310208":
		case "plsr310209":
		case "sscs410201":
		case "sscs410202":
		case "sscs410203":
		case "sscs410204":
		case "sscs410205":
		case "sscs410206":
		case "sscs410207":
		case "sscs410208":
		case "sscs410209":
			a = !0
	}
	return a
}

function substring_play(s, a) {
	var e = {};
	switch (e.id = s, e.tan = !1, e.reaction = "0", e.tolerant = "0", s) {
		case "sscp210201":
		case "sscp210202":
		case "sscp210203":
		case "sscp210204":
		case "sscp210205":
		case "sscp210206":
		case "sscp210207":
		case "sscp210208":
		case "sscp210209":
		case "ssca210201":
		case "ssca210202":
		case "ssca210203":
		case "ssca210204":
		case "ssca210205":
		case "ssca210206":
		case "ssca210207":
		case "ssca210208":
		case "ssca210209":
		case "ssca310201":
		case "ssca310202":
		case "ssca310203":
		case "ssca310204":
		case "ssca310205":
		case "ssca310206":
		case "ssca310207":
		case "ssca310208":
		case "ssca310209":
		case "sscp310201":
		case "sscp310202":
		case "sscp310203":
		case "sscp310204":
		case "sscp310205":
		case "sscp310206":
		case "sscp310207":
		case "sscp310208":
		case "sscp310209":
		case "3dr310201":
		case "3dr310202":
		case "3dr310203":
		case "3dr310204":
		case "3dr310205":
		case "3dr310206":
		case "3dr310207":
		case "3dr310208":
		case "3dr310209":
		case "plsr310201":
		case "plsr310202":
		case "plsr310203":
		case "plsr310204":
		case "plsr310205":
		case "plsr310206":
		case "plsr310207":
		case "plsr310208":
		case "plsr310209":
		case "sscs410201":
		case "sscs410202":
		case "sscs410203":
		case "sscs410204":
		case "sscs410205":
		case "sscs410206":
		case "sscs410207":
		case "sscs410208":
		case "sscs410209":
			var c = 6;
			(-1 < s.indexOf("ssca2") || -1 < s.indexOf("sscp2")) && (c = 4), -1 < s.indexOf("sscs4") && (c = 8);
			var r = [],
				t = [],
				n = "",
				i = 0,
				l = 0;
			for (var o in a) {
				t[i] = {
					ulid: parseInt(o),
					value: a[o]
				};
				r = "";
				i++;
				for (var p = 0; p < a[o].split(",").length; p++) p < 6 && (r += p + 1 + ",");
				r = r.substring(0, r.length - 1), t[i] = {
					ulid: parseInt(o) + 1,
					value: r
				}, i++, l++
			}
			for (p = 0; p < l; p++) n += p + 1 + ",";
			n = n.substring(0, n.length - 1), t[i] = {
				ulid: c,
				value: n
			}, e.arr = t;
			break;
		case "ssca310101":
		case "ssca310102":
		case "ssca310103":
		case "ssca310104":
		case "plsr310101":
		case "plsr310102":
		case "plsr310103":
		case "plsr310104":
		case "sscp310101":
		case "sscp310102":
		case "sscp310103":
		case "sscp310104":
		case "3dr310101":
		case "3dr310102":
		case "3dr310103":
		case "3dr310104":
		case "1105r5dmzs*1":
		case "1105r5dmzs*2":
		case "1105r5dmzs*3":
		case "1105r5dmzs*4":
		case "ssca210101":
		case "ssca210102":
		case "ssca210103":
		case "ssca210104":
		case "sscp210101":
		case "sscp210102":
		case "sscp210103":
		case "sscp210104":
		case "sscs410101":
		case "sscs410102":
		case "sscs410103":
		case "sscs410104":
			t = [], n = "", i = 0;
			var d = 0;
			for (var o in a) {
				t[i] = {
					ulid: o,
					value: a[o]
				}, i++;
				var u = "";
				for (p = 0; p < a[o].split(",").length; p++) p < 6 && (u += p + 1 + ",");
				t[i] = {
					ulid: parseInt(o) + 1 + "",
					value: u.substring(0, u.length - 1)
				}, i++, d++
			}
			for (p = 0; p < d; p++) n += p + 1 + ",";
			n = n.substring(0, n.length - 1), t[i] = {
				ulid: "6",
				value: n
			}, -1 < s.indexOf("21010") && (t[i] = {
				ulid: "4",
				value: n
			}), -1 < s.indexOf("sscs4") && (t[i] = {
				ulid: "8",
				value: n
			}), e.arr = t;
			break;
		case "1105r5034":
		case "1105r5035":
		case "1105r5043":
		case "1205r5033":
		case "1205r5034":
		case "1205r5042":
		case "ssca3008":
		case "sscp3008":
		case "3dr3008":
		case "plsr3008":
		case "hasha3008":
		case "sscs4007":
			var h = 10;
			r = [], t = [], n = "", i = 0;
			for (var o in a) t[i] = {
				ulid: o,
				value: a[o]
			}, i++;
			for (p = 0; p < i; p++) n += p + 1 + ",";
			n = n.substring(0, n.length - 1), "1105r5035" != s && "1205r5034" != s || (n = i), t[i] = "1205r5034" == s ?
			{
				ulid: "11",
				value: n
			} : {
				ulid: "10",
				value: n
			}, e.arr = t;
			break;
		case "1105r5016":
		case "1205r5016":
		case "ssca2009":
		case "sscp2009":
		case "ssca3012":
		case "ssca3024":
		case "ssca3026":
		case "sscp3012":
		case "sscp3024":
		case "sscp3026":
		case "3dr3012":
		case "3dr3024":
		case "3dr3026":
		case "plsr3012":
		case "plsr3024":
		case "plsr3026":
		case "hasha3012":
		case "hasha3024":
		case "hasha3026":
		case "sscs4010":
			h = 3;
			var _ = 12,
				g = "",
				f = "",
				b = "";
			"1105r5016" == s || "1205r5016" == s ? (h = 4, _ = 8) : "sscs4010" != s && "ssca3012" != s && "sscp3012" !=
				s && "3dr3012" != s && "plsr3012" != s && "hasha3012" != s && "sscp2009" != s && "ssca2009" != s || (h =
					5, _ = 11);
			t = [], n = "", i = 0;
			var k = 0,
				I = (p = 0, 1),
				v = 1,
				z = 1,
				m = -1;
			for (var o in a) t[p] = {
					ulid: o,
					value: a[o]
				}, "sscs4010" == s || "ssca3012" == s || "sscp3012" == s || "3dr3012" == s || "plsr3012" == s ||
				"hasha3012" == s ||
				"ssca2009" == s || "sscp2009" == s ? (0 != parseInt(o) && 1 != parseInt(o) || I <= 2 && (g += I + ",",
						I++), 3 != parseInt(o) && 4 != parseInt(o) || v <= 2 && (f += v + ",", v++), 6 != parseInt(o) &&
					7 != parseInt(o) || z <= 2 && (b += z + ",", z++)) : "1105r5016" == s || "1205r5016" == s ? (0 !=
					parseInt(o) && 1 != parseInt(o) || I <= 2 && (g += I + ",", I++), 3 != parseInt(o) && 4 != parseInt(
						o) || v <= 2 && (f += v + ",", v++)) : (0 != parseInt(o) && 1 != parseInt(o) && 2 != parseInt(
						o) || I <= 3 && (g += I + ",", I++), 4 != parseInt(o) && 5 != parseInt(o) && 6 != parseInt(o) ||
					v <= 3 && (f += v + ",", v++), 8 != parseInt(o) && 9 != parseInt(o) && 10 != parseInt(o) || z <=
					3 && (b += z + ",", z++)), p++, i++, "1105r5016" == s || "1205r5016" == s ? ((1 == o || 0 == o) &&
					1 != m && 0 != m || (3 == o || 4 == o) && 3 != m && 4 != m || 0 != o && 1 != o && 3 != o && 4 != o
				) && k++ : ((1 == o || 0 == o) && 1 != m && 0 != m || (3 == o || 4 == o) && 3 != m && 4 != m || (
						6 == o || 7 == o) && 6 != m && 7 != m || 0 != o && 1 != o && 3 != o && 4 != o && 6 != o && 7 !=
					o) && k++, m = o;
			"sscs4010" == s || "ssca3012" == s || "sscp3012" == s || "3dr3012" == s || "plsr3012" == s || "hasha3012" ==
				s || "1105r5016" ==
				s || "1205r5016" == s || "ssca2009" == s || "sscp2009" == s ? ("" != g && (t[i] = {
					ulid: "2",
					value: g.substring(0, g.length - 1)
				}, i++), "" != f && (t[i] = {
					ulid: "5",
					value: f.substring(0, f.length - 1)
				}, i++), "" != b && (t[i] = {
					ulid: "8",
					value: b.substring(0, b.length - 1)
				}, i++)) : (k = 0, "" != g && (t[i] = {
					ulid: "3",
					value: g.substring(0, g.length - 1)
				}, i++, k++), "" != f && (t[i] = {
					ulid: "7",
					value: f.substring(0, f.length - 1)
				}, i++, k++), "" != b && (t[i] = {
					ulid: "11",
					value: b.substring(0, b.length - 1)
				}, i++, k++));
			for (p = 0; p < k; p++) p < h && (n += p + 1 + ",");
			n = n.substring(0, n.length - 1), t[i] = {
				ulid: _ + "",
				value: n
			}, e.arr = t;
			break;
		case "1105r5009":
		case "1105r5010":
		case "1105r5012":
		case "1105r5036":
		case "1105r5044":
		case "1105r5020":
		case "1205r5009":
		case "1205r5010":
		case "1205r5012":
		case "1205r5035":
		case "1205r5043":
		case "1105a3011":
		case "1205a3011":
		case "1105a3013":
		case "1205a3013":
		case "animalsa3012":
		case "animalsp3012":
		case "animalsq1a3012":
		case "animalsq1p3012":
		case "animalsq2a3012":
		case "animalsq2p3012":
		case "animalsq3a3012":
		case "animalsq3p3012":
		case "animalsq4a3012":
		case "animalsq4p3012":
		case "animalsq5a3012":
		case "animalsq5p3012":
		case "animalsq6a3012":
		case "animalsq6p3012":
		case "animalsq7a3012":
		case "animalsq7p3012":
		case "animalsq8a3012":
		case "animalsq8p3012":
		case "animalsq9a3012":
		case "animalsq9p3012":
		case "animalsq0a3012":
		case "animalsq0p3012":
		case "animalsa3006":
		case "animalsp3006":
		case "animalsq1a3006":
		case "animalsq1p3006":
		case "animalsq2a3006":
		case "animalsq2p3006":
		case "animalsq3a3006":
		case "animalsq3p3006":
		case "animalsq4a3006":
		case "animalsq4p3006":
		case "animalsq5a3006":
		case "animalsq5p3006":
		case "animalsq6a3006":
		case "animalsq6p3006":
		case "animalsq7a3006":
		case "animalsq7p3006":
		case "animalsq8a3006":
		case "animalsq8p3006":
		case "animalsq9a3006":
		case "animalsq9p3006":
		case "animalsq0a3006":
		case "animalsq0p3006":
		case "animalsa3007":
		case "animalsp3007":
		case "animalsq1a3007":
		case "animalsq1p3007":
		case "animalsq2a3007":
		case "animalsq2p3007":
		case "animalsq3a3007":
		case "animalsq3p3007":
		case "animalsq4a3007":
		case "animalsq4p3007":
		case "animalsq5a3007":
		case "animalsq5p3007":
		case "animalsq6a3007":
		case "animalsq6p3007":
		case "animalsq7a3007":
		case "animalsq7p3007":
		case "animalsq8a3007":
		case "animalsq8p3007":
		case "animalsq9a3007":
		case "animalsq9p3007":
		case "animalsq0a3007":
		case "animalsq0p3007":
			h = 5, t = [], n = "", i = 0;
			for (var o in a) r = a[o].split(","), t[i] = {
				ulid: o,
				value: a[o]
			}, i++;
			for (p = 0; p < i; p++) p < h && (n += p + 1 + ",");
			n = n.substring(0, n.length - 1), "1205r5035" != s && "1105r5036" != s || (n = "0"), t[i] = {
				ulid: "5",
				value: n
			}, e.arr = t;
			break;
		case "1105a2009":
		case "1205a2009":
		case "1105a3020":
		case "1205a3020":
		case "1105a2008":
		case "1205a2008":
		case "sscs4005":
			h = 4, t = [], n = "", i = 0;
			for (var o in a) t[i] = {
				ulid: o,
				value: a[o]
			}, i++;
			for (p = 0; p < i; p++) p < h && (n += p + 1 + ",");
			n = n.substring(0, n.length - 1), t[i] = {
				ulid: "4",
				value: n
			}, e.arr = t;
			break;
		case "1105r5018":
		case "1105r5017":
		case "1105r5028":
		case "1105r5029":
		case "1105r5030":
		case "1105a3007":
		case "1105a3008":
		case "1105a3009":
		case "1105a3015":
		case "1105a3016":
		case "1105a3017":
		case "1105a3019":
		case "1105a3027":
		case "1105a2007":
		case "1205r5017":
		case "1205r5018":
		case "1205r5027":
		case "1205r5028":
		case "1205r5029":
		case "1205a3007":
		case "1205a3008":
		case "1205a3009":
		case "1205a3015":
		case "1205a3016":
		case "1205a3017":
		case "1205a3019":
		case "1205a3027":
		case "1205a2007":
		case "k3r3013":
		case "ssca2010":
		case "sscp2010":
		case "ssca3006":
		case "ssca3010":
		case "ssca3013":
		case "ssca3020":
		case "ssca3022":
		case "ssca3024":
		case "ssca3025":
		case "sscp3006":
		case "sscp3010":
		case "sscp3013":
		case "sscp3020":
		case "sscp3022":
		case "sscp3024":
		case "sscp3025":
		case "3dr3006":
		case "3dr3010":
		case "3dr3013":
		case "3dr3020":
		case "3dr3022":
		case "3dr3024":
		case "3dr3025":
		case "plsr3006":
		case "plsr3010":
		case "plsr3013":
		case "plsr3020":
		case "plsr3022":
		case "plsr3024":
		case "plsr3025":
		case "hasha3006":
		case "hasha3010":
		case "hasha3013":
		case "hasha3020":
		case "hasha3022":
		case "hasha3024":
		case "hasha3025":
		case "ssca2007":
		case "sscp2007":
		case "ssca3023":
		case "ssca3025":
		case "sscp3023":
		case "ssca3025":
		case "plsr3023":
		case "plsr3025":
		case "hasha3023":
		case "hasha3025":
		case "3dr3023":
		case "3dr3025":
		case "sscs4011":
		case "sscs4008":
		case "animalsa2006":
		case "animalsp2006":
		case "animalsq1a2006":
		case "animalsq1p2006":
		case "animalsq2a2006":
		case "animalsq2p2006":
		case "animalsq3a2006":
		case "animalsq3p2006":
		case "animalsq4a2006":
		case "animalsq4p2006":
		case "animalsq5a2006":
		case "animalsq5p2006":
		case "animalsq6a2006":
		case "animalsq6p2006":
		case "animalsq7a2006":
		case "animalsq7p2006":
		case "animalsq8a2006":
		case "animalsq8p2006":
		case "animalsq9a2006":
		case "animalsq9p2006":
		case "animalsq0a2006":
		case "animalsq0p2006":
		case "animalsa3013":
		case "animalsp3013":
		case "animalsq1a3013":
		case "animalsq1p3013":
		case "animalsq2a3013":
		case "animalsq2p3013":
		case "animalsq3a3013":
		case "animalsq3p3013":
		case "animalsq4a3013":
		case "animalsq4p3013":
		case "animalsq5a3013":
		case "animalsq5p3013":
		case "animalsq6a3013":
		case "animalsq6p3013":
		case "animalsq7a3013":
		case "animalsq7p3013":
		case "animalsq8a3013":
		case "animalsq8p3013":
		case "animalsq9a3013":
		case "animalsq9p3013":
		case "animalsq0a3013":
		case "animalsq0p3013":
		case "animalsa3011":
		case "animalsp3011":
		case "animalsq1a3011":
		case "animalsq1p3011":
		case "animalsq2a3011":
		case "animalsq2p3011":
		case "animalsq3a3011":
		case "animalsq3p3011":
		case "animalsq4a3011":
		case "animalsq4p3011":
		case "animalsq5a3011":
		case "animalsq5p3011":
		case "animalsq6a3011":
		case "animalsq6p3011":
		case "animalsq7a3011":
		case "animalsq7p3011":
		case "animalsq8a3011":
		case "animalsq8p3011":
		case "animalsq9a3011":
		case "animalsq9p3011":
		case "animalsq0a3011":
		case "animalsq0p3011":
		case "animalsa3009":
		case "animalsp3009":
		case "animalsq1a3009":
		case "animalsq1p3009":
		case "animalsq2a3009":
		case "animalsq2p3009":
		case "animalsq3a3009":
		case "animalsq3p3009":
		case "animalsq4a3009":
		case "animalsq4p3009":
		case "animalsq5a3009":
		case "animalsq5p3009":
		case "animalsq6a3009":
		case "animalsq6p3009":
		case "animalsq7a3009":
		case "animalsq7p3009":
		case "animalsq8a3009":
		case "animalsq8p3009":
		case "animalsq9a3009":
		case "animalsq9p3009":
		case "animalsq0a3009":
		case "animalsq0p3009":
			h = 3, t = [], n = "", i = 0;
			for (var o in a) t[i] = {
				ulid: o,
				value: a[o]
			}, i++;
			for (p = 0; p < i; p++) p < h && (n += p + 1 + ",");
			n = n.substring(0, n.length - 1), "1105r5028" != s && "1105r5029" != s && "1205r5028" != s && "1205r5027" !=
				s || (n = "0"), t[i] = {
					ulid: "3",
					value: n
				}, e.arr = t;
			break;
		case "1105r5021":
		case "1105r5019":
		case "1105a2006":
		case "1205r5020":
		case "1205r5019":
		case "1205a2006":
		case "ssca2005":
		case "ssca2008":
		case "sscp2005":
		case "sscp2008":
		case "animalsa2005":
		case "animalsp2005":
		case "animalsq1a2005":
		case "animalsq1p2005":
		case "animalsq2a2005":
		case "animalsq2p2005":
		case "animalsq3a2005":
		case "animalsq3p2005":
		case "animalsq4a2005":
		case "animalsq4p2005":
		case "animalsq5a2005":
		case "animalsq5p2005":
		case "animalsq6a2005":
		case "animalsq6p2005":
		case "animalsq7a2005":
		case "animalsq7p2005":
		case "animalsq8a2005":
		case "animalsq8p2005":
		case "animalsq9a2005":
		case "animalsq9p2005":
		case "animalsq0a2005":
		case "animalsq0p2005":
		case "animalsa3014":
		case "animalsp3014":
		case "animalsq1a3014":
		case "animalsq1p3014":
		case "animalsq2a3014":
		case "animalsq2p3014":
		case "animalsq3a3014":
		case "animalsq3p3014":
		case "animalsq4a3014":
		case "animalsq4p3014":
		case "animalsq5a3014":
		case "animalsq5p3014":
		case "animalsq6a3014":
		case "animalsq6p3014":
		case "animalsq7a3014":
		case "animalsq7p3014":
		case "animalsq8a3014":
		case "animalsq8p3014":
		case "animalsq9a3014":
		case "animalsq9p3014":
		case "animalsq0a3014":
		case "animalsq0p3014":
			h = 2;
			"1105r5021" != s && "1205r5020" != s || (h = 10);
			t = [], n = "", i = 0;
			var S = 0;
			if ("trend_tongweiZhenFu" == common.cookieGet("trendid"))
				for (var o in a) {
					var $ = kaijianghao.split(","),
						x = 0,
						y = a[o].split(","),
						w = "";
					for (p = 0; p < y.length; p++) "1105a2006" == s ? 0 < parseInt($[o]) - parseInt(y[p]) || parseInt(y[
						p]) + parseInt($[o]) <= 11 ? (0 < parseInt($[o]) - parseInt(y[p]) && (parseInt($[o]) -
						parseInt(y[p]) < 10 ? w += "0" + (parseInt($[o]) - parseInt(y[p])) + "," : w +=
						parseInt($[o]) - parseInt(y[p]) + ","), parseInt(y[p]) + parseInt($[o]) <= 11 && (
						parseInt(y[p]) + parseInt($[o]) < 10 ? w += "0" + (parseInt(y[p]) + parseInt($[o])) +
						"," : w += parseInt(y[p]) + parseInt($[o]) + ",")) : x++ : 0 < parseInt(y[p]) - parseInt($[
						o]) || parseInt(y[p]) + parseInt($[o]) <= 12 ? (0 < parseInt(y[p]) - parseInt($[o]) && (
							parseInt(y[p]) - parseInt($[o]) < 10 ? w += "0" + (parseInt(y[p]) - parseInt($[o])) +
							"," : w += parseInt(y[p]) - parseInt($[o]) + ","), parseInt(y[p]) + parseInt($[o]) <=
						12 && (parseInt(y[p]) + parseInt($[o]) < 10 ? w += "0" + (parseInt(y[p]) + parseInt($[o])) +
							"," : w += parseInt(y[p]) + parseInt($[o]) + ",")) : x++;
					if (x == y.length) {
						e.tan = !0;
						break
					}
					t[i] = {
						ulid: o,
						value: w.substring(0, w.length - 1)
					}, i++
				} else
					for (var o in a) t[i] = {
						ulid: o,
						value: a[o]
					}, S = a[o].split(",").length, i++;
			for (p = 0; p < i; p++) n += p + 1 + ",";
			if ("1105r5021" == s || "1205r5020" == s) {
				n = "";
				for (p = 0; p < S; p++) p < 5 && (n += p + 1 + ",")
			}
			n = n.substring(0, n.length - 1), t[i] = {
				ulid: "2",
				value: n
			}, e.arr = t;
			break;
		case "animalsa2001":
		case "animalsp2001":
		case "animalsq1a2001":
		case "animalsq1p2001":
		case "animalsq2a2001":
		case "animalsq2p2001":
		case "animalsq3a2001":
		case "animalsq3p2001":
		case "animalsq4a2001":
		case "animalsq4p2001":
		case "animalsq5a2001":
		case "animalsq5p2001":
		case "animalsq6a2001":
		case "animalsq6p2001":
		case "animalsq7a2001":
		case "animalsq7p2001":
		case "animalsq8a2001":
		case "animalsq8p2001":
		case "animalsq9a2001":
		case "animalsq9p2001":
		case "animalsq0a2001":
		case "animalsq0p2001":
		case "animalsa3001":
		case "animalsp3001":
		case "animalsq1a3001":
		case "animalsq1p3001":
		case "animalsq2a3001":
		case "animalsq2p3001":
		case "animalsq3a3001":
		case "animalsq3p3001":
		case "animalsq4a3001":
		case "animalsq4p3001":
		case "animalsq5a3001":
		case "animalsq5p3001":
		case "animalsq6a3001":
		case "animalsq6p3001":
		case "animalsq7a3001":
		case "animalsq7p3001":
		case "animalsq8a3001":
		case "animalsq8p3001":
		case "animalsq9a3001":
		case "animalsq9p3001":
		case "animalsq0a3001":
		case "animalsq0p3001":
		case "1105r5001":
		case "1105r4001":
		case "1105r3001":
		case "1105p2001":
		case "1105a3001":
		case "1105a2001":
		case "k3r3001":
		case "1205r5001":
		case "1105a3001":
		case "1205a3001":
		case "ssca2001":
		case "sscp2001":
		case "ssca3001":
		case "sscp3001":
		case "3dr3001":
		case "plsr3001":
		case "hasha3001":
		case "1205a2001":
		case "1105a2001":
		case "1105r5031":
		case "1105r5032":
		case "1105r5033":
		case "1105r5039":
		case "1105r5040":
		case "1105r5041":
		case "1205r5030":
		case "1205r5031":
		case "1205r5032":
		case "1205r5038":
		case "1205r5039":
		case "1205r5040":
		case "1205r5040":
		case "k3r3011":
		case "k3r3010":
		case "ssca3014":
		case "ssca3016":
		case "ssca3017":
		case "sscp3014":
		case "sscp3016":
		case "sscp3017":
		case "3dr3014":
		case "3dr3016":
		case "3dr3017":
		case "plsr3014":
		case "plsr3016":
		case "plsr3017":
		case "hasha3014":
		case "hasha3016":
		case "hasha3017":
		case "1105a3001-0":
		case "1205a3001-0":
		case "1105a3001-1":
		case "1205a3001-1":
		case "1105a3001-2":
		case "1205a3001-2":
		case "sscs4001":
		case "sscs4012":
			h = 3;
			"1105r5001" == s || "1205r5001" == s || "1105r5041" == s || "1205r5040" == s ? h = 5 : "1105a2001" == s ||
				"1205a2001" == s || "ssca2001" == s || "sscp2001" == s ? h = 2 : "sscs4012" == s || "1105r5031" == s ||
				"1105r5032" == s || "1205r5030" == s || "1205r5031" == s || "ssca3014" == s || "ssca3017" == s ||
				"sscp3014" == s || "sscp3017" == s || "3dr3014" == s || "3dr3017" == s || "plsr3014" == s ||
				"hasha3014" == s ||
				"plsr3017" == s || "hasha3017" == s ? h = 10 : "1105r5033" == s || "1105r5039" == s || "1205r5032" ==
				s || "1205r5038" ==
				s || "ssca3016" == s || "sscp3016" == s || "3dr3016" == s || "plsr3016" == s || "hasha3016" == s ? h =
				9 : "1105r5040" ==
				s || "1205r5039" == s ? h = 6 : "sscs4001" != s && "k3r3011" != s || (h = 4);
			r = [], t = [], n = "";
			if ((-1 < s.indexOf("1205a3001") || -1 < s.indexOf("1105a3001")) && "trend_xingtaiZouShi" == common
				.cookieGet("trendid")) {
				e.id = s.split("-")[0];
				c = parseInt(s.split("-")[1]), $ = kaijianghao.split(","), y = "";
				var Z = 0;
				for (var o in a)
					if (1 == (Z = o))
						if (-1 < s.indexOf("1205a3001")) {
							if (!(0 < parseInt($[c]) - 1 || parseInt($[c]) + 1 <= 12)) {
								e.tan = !0;
								break
							}
							0 < parseInt($[c]) - 1 && (parseInt($[c]) - 1 < 10 ? y += "0" + (parseInt($[c]) - 1) + "," :
								y += parseInt($[c]) - 1 + ","), parseInt($[c]) + 1 <= 12 && (parseInt($[c]) + 1 <
								10 ? y += "0" + (parseInt($[c]) + 1) + "," : y += parseInt($[c]) + 1 + ",")
						} else {
							if (!(0 < parseInt($[c]) - 1 || parseInt($[c]) + 1 <= 11)) {
								e.tan = !0;
								break
							}
							0 < parseInt($[c]) - 1 && (parseInt($[c]) - 1 < 10 ? y += "0" + (parseInt($[c]) - 1) + "," :
								y += parseInt($[c]) - 1 + ","), parseInt($[c]) + 1 <= 11 && (parseInt($[c]) + 1 <
								10 ? y += "0" + (parseInt($[c]) + 1) + "," : y += parseInt($[c]) + 1 + ",")
						}
				else if (0 == Z) {
					if (!(0 < parseInt($[c]) - 1)) {
						e.tan = !0;
						break
					}
					parseInt($[c]) - 1 < 10 ? y += "0" + (parseInt($[c]) - 1) + "," : y += parseInt($[c]) - 1 + ","
				} else if (2 == Z)
					if (-1 < s.indexOf("1205a3001")) {
						if (!(parseInt($[c]) + 1 <= 12)) {
							e.tan = !0;
							break
						}
						parseInt($[c]) + 1 < 10 ? y += "0" + (parseInt($[c]) + 1) + "," : y += parseInt($[c]) + 1 + ","
					} else {
						if (!(parseInt($[c]) + 1 <= 11)) {
							e.tan = !0;
							break
						}
						parseInt($[c]) + 1 < 10 ? y += "0" + (parseInt($[c]) + 1) + "," : y += parseInt($[c]) + 1 + ","
					} if (y = y.substring(0, y.length - 1), t[0] = {
						ulid: "0",
						value: y
					}, 1 == Z) n = "0";
				else {
					n = "";
					for (p = 0; p < y.split(",").length; p++) n += p + 1 + ",";
					n = n.substring(0, n.length - 1)
				}
			} else {
				for (var o in a) r = a[o].split(","), t[parseInt(o)] = {
					ulid: o,
					value: a[o]
				};
				for (p = 0; p < r.length; p++) p < h && (n += p + 1 + ",");
				n = n.substring(0, n.length - 1)
			}
			t[1] = {
				ulid: "1",
				value: n
			}, e.arr = t;
			break;
		case "1105r5002":
		case "1105r5003":
		case "1105r5004":
		case "1105r5005":
		case "1105r5006":
		case "1105r5007":
		case "1105r5008":
		case "1105r5013":
		case "1105r5027":
		case "1105r5038":
		case "1105r3004":
		case "1105a3002":
		case "1105a3003":
		case "1105a3004":
		case "1105a3014":
		case "1105a2002":
		case "1105a2003":
		case "1105a2004":
		case "1205r5002":
		case "1205r5003":
		case "1205r5004":
		case "1205r5005":
		case "1205r5006":
		case "1205r5007":
		case "1205r5008":
		case "1205r5013":
		case "1205r5026":
		case "1205r5037":
		case "1205r5038":
		case "1205a3002":
		case "1205a3003":
		case "1205a3004":
		case "1205a3014":
		case "1205a2002":
		case "1205a2003":
		case "1205a2004":
		case "1205a2001":
		case "k3r3002":
		case "k3r3004":
		case "k3r3003":
		case "k3r3005":
		case "k3r3006":
		case "k3r3015":
		case "ssca2002":
		case "ssca2003":
		case "ssca2004":
		case "ssca2006":
		case "sscp2002":
		case "sscp2003":
		case "sscp2004":
		case "sscp2006":
		case "ssca3002":
		case "ssca3003":
		case "ssca3004":
		case "ssca3007":
		case "ssca3019":
		case "ssca3021":
		case "sscp3002":
		case "sscp3003":
		case "sscp3004":
		case "sscp3007":
		case "sscp3019":
		case "sscp3021":
		case "3dr3002":
		case "3dr3003":
		case "3dr3004":
		case "3dr3007":
		case "3dr3019":
		case "3dr3021":
		case "plsr3002":
		case "plsr3003":
		case "plsr3004":
		case "plsr3007":
		case "plsr3019":
		case "plsr3021":
		case "hasha3002":
		case "hasha3003":
		case "hasha3004":
		case "hasha3007":
		case "hasha3019":
		case "hasha3021":
		case "sscs4004":
		case "sscs4002":
		case "sscs4006":
		case "sscs4003":
		case "animalsa2002":
		case "animalsp2002":
		case "animalsq1a2002":
		case "animalsq1p2002":
		case "animalsq2a2002":
		case "animalsq2p2002":
		case "animalsq3a2002":
		case "animalsq3p2002":
		case "animalsq4a2002":
		case "animalsq4p2002":
		case "animalsq5a2002":
		case "animalsq5p2002":
		case "animalsq6a2002":
		case "animalsq6p2002":
		case "animalsq7a2002":
		case "animalsq7p2002":
		case "animalsq8a2002":
		case "animalsq8p2002":
		case "animalsq9a2002":
		case "animalsq9p2002":
		case "animalsq0a2002":
		case "animalsq0p2002":
		case "animalsa3002":
		case "animalsp3002":
		case "animalsq1a3002":
		case "animalsq1p3002":
		case "animalsq2a3002":
		case "animalsq2p3002":
		case "animalsq3a3002":
		case "animalsq3p3002":
		case "animalsq4a3002":
		case "animalsq4p3002":
		case "animalsq5a3002":
		case "animalsq5p3002":
		case "animalsq6a3002":
		case "animalsq6p3002":
		case "animalsq7a3002":
		case "animalsq7p3002":
		case "animalsq8a3002":
		case "animalsq8p3002":
		case "animalsq9a3002":
		case "animalsq9p3002":
		case "animalsq0a3002":
		case "animalsq0p3002":
		case "animalsa2004":
		case "animalsp2004":
		case "animalsq1a2004":
		case "animalsq1p2004":
		case "animalsq2a2004":
		case "animalsq2p2004":
		case "animalsq3a2004":
		case "animalsq3p2004":
		case "animalsq4a2004":
		case "animalsq4p2004":
		case "animalsq5a2004":
		case "animalsq5p2004":
		case "animalsq6a2004":
		case "animalsq6p2004":
		case "animalsq7a2004":
		case "animalsq7p2004":
		case "animalsq8a2004":
		case "animalsq8p2004":
		case "animalsq9a2004":
		case "animalsq9p2004":
		case "animalsq0a2004":
		case "animalsq0p2004":
		case "animalsa3004":
		case "animalsp3004":
		case "animalsq1a3004":
		case "animalsq1p3004":
		case "animalsq2a3004":
		case "animalsq2p3004":
		case "animalsq3a3004":
		case "animalsq3p3004":
		case "animalsq4a3004":
		case "animalsq4p3004":
		case "animalsq5a3004":
		case "animalsq5p3004":
		case "animalsq6a3004":
		case "animalsq6p3004":
		case "animalsq7a3004":
		case "animalsq7p3004":
		case "animalsq8a3004":
		case "animalsq8p3004":
		case "animalsq9a3004":
		case "animalsq9p3004":
		case "animalsq0a3004":
		case "animalsq0p3004":
		case "animalsa2003":
		case "animalsp2003":
		case "animalsq1a2003":
		case "animalsq1p2003":
		case "animalsq2a2003":
		case "animalsq2p2003":
		case "animalsq3a2003":
		case "animalsq3p2003":
		case "animalsq4a2003":
		case "animalsq4p2003":
		case "animalsq5a2003":
		case "animalsq5p2003":
		case "animalsq6a2003":
		case "animalsq6p2003":
		case "animalsq7a2003":
		case "animalsq7p2003":
		case "animalsq8a2003":
		case "animalsq8p2003":
		case "animalsq9a2003":
		case "animalsq9p2003":
		case "animalsq0a2003":
		case "animalsq0p2003":
		case "animalsa3003":
		case "animalsp3003":
		case "animalsq1a3003":
		case "animalsq1p3003":
		case "animalsq2a3003":
		case "animalsq2p3003":
		case "animalsq3a3003":
		case "animalsq3p3003":
		case "animalsq4a3003":
		case "animalsq4p3003":
		case "animalsq5a3003":
		case "animalsq5p3003":
		case "animalsq6a3003":
		case "animalsq6p3003":
		case "animalsq7a3003":
		case "animalsq7p3003":
		case "animalsq8a3003":
		case "animalsq8p3003":
		case "animalsq9a3003":
		case "animalsq9p3003":
		case "animalsq0a3003":
		case "animalsq0p3003":
			t = [];
			for (var o in a) t[parseInt(o)] = {
				ulid: o,
				value: a[o]
			};
			e.arr = t
	}
	return e
}

function showMsg(s, a) {
	a = a || 1e3, layer.msg(s, {
		time: a
	})
}