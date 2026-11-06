/**
 * @创建人：小宇
 * @创建时间：2019/11/21
 * @修改人：
 * @修改日期：
 * @备注：
 */
var qihao = "";
var kaijianghao = "";
var basePath = "https://soft-api.data-ys.com/api";
var baseUrl = "https://api.qkltj.com/api/draw-result";
var baseObj = {};
var initFlag = 0;
//回退
document.addEventListener('UniAppJSBridgeReady', function() {});


function aa() {
	var a = document.getElementById("cc").scrollTop;
	var b = document.getElementById("cc").scrollLeft;
	document.getElementById("dd").scrollTop = a;
	document.getElementById("hh").scrollLeft = b;
	document.getElementById("mm").scrollLeft = b;
}
//实时获取最新数据
function getData() {
	var url = "/lotteryNumber/topRows";
	var data = {
		"rows": 1,
		"play_id": JSON.parse(common.cookieGet("obj")).play_id,
		"code": JSON.parse(common.cookieGet("obj")).code,
	};
	var successRes = function(res) {
		if (res.code == 0) {
			if (res.data[0].expect != qihao || kaijianghao != res.data[0].opennumber) {
				common.refresh(parseInt($(".dqtanbg").text()));
			}
		}
	};
	common.request(url, data, "", successRes);
}
//代码走势实时获取最新数据
function getDmData() {
	var obj = JSON.parse(common.cookieGet("obj"));
	var url = "/codeTrend/sscList";
	var type = common.cookieGet("xzdm");
	if (obj.play_id == "1105r5") {
		url = "/codeTrend/11x5List";
		type = parseInt(common.cookieGet("xzdm"));
	}
	var playid = obj.play_id;
	if (obj.play_id == "plsr3") {
		playid = "p3";
	} else if (obj.play_id == "3dr3") {
		playid = "3d";
	}
	var data = {
		"rows": 1,
		"play_id": playid,
		"code": obj.code,
		"type": type
	};
	var successRes = function(res) {
		if (res.succ) {
			var obj = JSON.parse(common.cookieGet("obj"));
			let newQ = res.data[0][baseObj.response.expectKey];
			let newK = res.data[0][baseObj.response.openNumberKey];
			var openNum = newK;
			if (kaijianghao != openNum || qihao != newQ) {
				style.getStyle();
			}
		}
	};
	common.request(url, data, "", successRes);
}
//通用页面显示  条件提交
var common = function() {
	var json;
	return {
		/*提交*/
		submiting: function() {
			var playUl = {};
			$(".select-yes").each(function() {
				var dataPID = $(this).attr("alt");
				var dataUlid = $(this).attr("span");
				var value = $(this).attr("value");
				if (playUl[dataPID] == undefined) {
					playUl[dataPID] = {};
					playUl[dataPID][dataUlid] = value;
				} else {
					playUl[dataPID][dataUlid] == undefined ? playUl[dataPID][dataUlid] = value :
						playUl[dataPID][dataUlid] =
						playUl[dataPID][dataUlid] + "," + value;
				}
			});
			var play = [];
			var back = parseInt(JSON.parse(common.cookieGet("obj")).back);
			var i = 0;
			var count = 0;
			var index = 0;
			for (var key in playUl) {
				//start
				//新代码提交单独处理
				if (NewCode_Number_PD(key)) {
					//统计相同id中有几个不同的ulid
					var dmCount = 0;
					var code_val = playUl[key];
					for (var pp in code_val) {
						dmCount++;
					}
					//将多个ulid进行拆分 返回前台之前的处理
					if (dmCount > 1) {
						for (var c_ulid in code_val) {
							var dataVal;
							if (parseInt(c_ulid) == 0) {
								dataVal = {
									0: code_val[c_ulid]
								};
							}
							if (parseInt(c_ulid) == 2) {
								dataVal = {
									2: code_val[c_ulid]
								};
							}
							if (parseInt(c_ulid) == 4) {
								dataVal = {
									4: code_val[c_ulid]
								};
							}
							if (parseInt(c_ulid) == 6) {
								dataVal = {
									6: code_val[c_ulid]
								};
							}
							play[index] = substring_play(key, dataVal);
							index++;
						}
					} else {
						play[index] = substring_play(key, playUl[key]);
						index++;
					}
					//end 不一定什么时候不好使 
				} else {
					//正常提交
					play[i] = substring_play(key, playUl[key]);
				}
				if (play[i].tan) {
					count++;
					delete play[i].tan;
				}
				i++;
			}
			console.log(play);
			if (count == 0) {
				if (i > 0) {
					window.parent.postMessage(play, '*')
					showMsg("提交成功")
				} else {
					showMsg(language(common.cookieGet("language"), "beforesubm"));
				}
			} else {
				showMsg(language(common.cookieGet("language"), "sub_exception"));
			}
		},
		/*返回*/
		onBack: function() {
			uni.navigateBack({
				delta: 1
			});
		},
		//中英文转换
		getName: function(name) {
			language(this.cookieGet("language"), name);
		},
		//缓存处理
		cookieSet: function(key, value) {
			sessionStorage.setItem(key, value);
		},
		cookieGet: function(key) {
			return sessionStorage.getItem(key);
		},
		/**
		 * from_Id
		 * token
		 * code城市id
		 * play_id 玩法id
		 * chart_id走势图名字
		 * cat 大玩法
		 * language 语言
		 */
		receive: function(obj, num) {
			var id = obj.play_id + "-" + obj.chart_id;
			//动态获取头部底部信息
			if (initFlag < 1) {
				initFlag++;
				initialize.initialize(id, obj.chart_id);
			}
			var url = "/lotteryNumber/topRows";
			var rows = parseInt($("#qss").html())
			if (obj.chart_id == "trend_dingweifenbu") {
				rows += 200;
			}
			if (obj.chart_id == "trend_xingtaiZouShi" || obj.chart_id == "trend_jibenZouShi" && (obj.play_id
					.indexOf(
						"1105") >
					-1 || obj.play_id.indexOf("1205") > -1)) {
				rows += 2;
			}
			if ((obj.chart_id == "trend_litiZouShi" && (obj.play_id == "ssca2" || obj.play_id == "sscp2")) ||
				obj.chart_id == "trend_hezhenzoushi" || ((obj.chart_id == "trend_tongweiZhenFu" || obj
					.chart_id ==
					"trend_lianhaoChongMa") && (obj.play_id.indexOf("1105") > -1 || obj.play_id.indexOf(
					"1205") > -1))) {
				rows += 1;
			}
			var data = {
				"rows": rows,
				"play_id": obj.play_id,
				"code": obj.code,
			};
			var successRes = function(res) {
				qihao = res.data[0].expect;
				kaijianghao = res.data[0].opennumber;
				content.content(id, res.data)
			};
			this.request(url, data, "", successRes);
		},
		//获取数据
		request: function(url, data, beforeSend, successRes, type) {
			let code = data.code + ""
			let flag = code.substring(0, 2) == "11" ? true : false
			$.ajax({
				type: flag ? "post" : "GET",
				contentType: "application/json",
				url: flag ? basePath + url : baseUrl,
				data: flag ? JSON.stringify(data) : data,
				headers: {
					token: data.token
				},
				beforeSend: function() {
					if (typeof(beforeSend) == "function") {
						return beforeSend();
					} else {
						return true;
					}
				},
				success: function(response) {
					if (successRes) {
						if (typeof(successRes) == "function") {
							successRes(response);
						}
					}
				},
				error: function(XMLHttpRequest, textStatus, errorThrown) {
					// window.alert("数据加载缓慢，请重新操作");
					// if(plug){
					// plug.loadingcome(false);
					// }
				}
			});

		},
		requestType: function(url, data, successRes, requestType) {
			var par = data;
			if (requestType == "post") {
				par = JSON.stringify(data);
			}
			$.ajax({
				type: requestType,
				contentType: "application/json",
				url: userPath + url,
				data: par,
				headers: {
					token: data.token
				},
				beforeSend: function() {

				},
				success: function(response) {
					if (successRes) {
						if (typeof(successRes) == "function") {
							successRes(response);
						}
					}
				},
				error: function(XMLHttpRequest, textStatus, errorThrown) {

				}
			});
		},


		// 冒泡排序
		sortArr: function(arr) {
			arr = arr.concat();
			var length = arr.length;
			for (var i = 0; i < (length - 1); ++i) {
				for (var j = 0; j < (length - 1 - i); ++j) {
					if (arr[j] > arr[j + 1]) {
						var temp = arr[j];
						arr[j] = arr[j + 1];
						arr[j + 1] = temp;
					}
				}
			}
			return arr;
		},
		// 获取数组最小值
		getMinArr: function(arr) {
			var min = arr[0];
			for (var i = 1; i < arr.length; ++i) {
				if (arr[i] < min) {
					min = arr[i];
				}
			}
			return min;
		},
		// 获取数组最大值
		getMaxArr: function(arr) {
			var max = arr[0];
			for (var i = 1; i < arr.length; ++i) {
				if (arr[i] > max) {
					max = arr[i];
				}
			}
			return max;
		},
		//切换期数或 开奖号码出现变动则刷新
		refresh: function(num) {
			var obj = JSON.parse(this.cookieGet("obj"));
			$("#qss").html(num)
			this.receive(obj, num);
		},
		//按照位置截取
		cutOut: function(content, min, max) {
			return content.substring(min, max);
		},
		//判断当前开奖号码类型
		group: function(num) {
			var lan = this.cookieGet("language");
			var count = 0;
			for (var i = 0; i < num.length - 1; i++) {
				for (var j = i + 1; j < num.length; j++) {
					if (num[i] == num[j]) {
						count++;
					}
				}
			}
			var str = language(lan, "zuliu");
			if (count == 1) {
				str = language(lan, "zusan");
			} else if (count >= 2) {
				str = language(lan, "baozi");
			}
			return str;
		},
		//循环id
		getCondition: function(id, num) {
			var arr = [];
			for (var i = 0; i < num; i++) {
				arr[i] = id;
			}
			return arr;
		},
		//数组去重
		removeAgain: function(arr) {
			arr = this.sortArr(arr);
			var hash = [];
			arr.forEach(function(item) {
				if (hash.indexOf(item) == '-1') {
					hash.push(item);
				}
			})
			return hash;
		},
		//取出数组内相同的值
		getAgain: function(arr) {
			var again = [];
			arr = this.sortArr(arr);
			for (var i = 0; i < arr.length - 1; i++) {
				if (arr[i] == arr[i + 1]) {
					var count = 0;
					for (var p = 0; p < again.length; p++) {
						if (arr[i] == again[p]) {
							count++;
						}
					}
					if (count < 1 && again.indexOf(arr[i]) < 0) {
						again.push(arr[i]);
					}
				}
			}
			return again;
		},
		//按照位置截取 开奖号码
		cutOutNumber: function(opennumber, type) {
			var number = opennumber.split(",");
			var ball = "";
			for (var i = 0; i < number.length; i++) {
				ball += number[i] + ",";
			}
			ball = ball.substring(0, ball.length - 1);
			switch (type) {
				case "sscs4":
					ball = number[1] + "," + number[2] + "," + number[3] + "," + number[4];
					break;
				case "plsr3":
				case "ssca3":
					ball = number[0] + "," + number[1] + "," + number[2];
					break;
				case "ssca2":
					ball = number[0] + "," + number[1];
					break;
				case "sscp2":
					ball = number[3] + "," + number[4];
					break;
				case "sscp3":
					ball = number[2] + "," + number[3] + "," + number[4];
					break;
				case "1105a3":
				case "1205a3":
					ball = number[0] + "," + number[1] + "," + number[2];
					break;
				case "1105a2":
				case "1205a2":
					ball = number[0] + "," + number[1];
					break;
				default:
					break;
			}
			return ball;
		},
		//循环两位数带0类型的号码 
		getStringNum: function(minNum, maxNum) {
			var str = [];
			var count = 0;
			for (var i = minNum; i <= maxNum; i++) {
				if (i < 10) {
					str[count] = "0" + i;
				} else {
					str[count] = i.toString();
				}
				count++;
			}
			return str;
		},
		//循环一位数号码
		getIntNum: function(minNum, maxNum) {
			var number = [];
			var count = 0;
			for (var i = minNum; i <= maxNum; i++) {
				number[count] = i;
				count++;
			}
			return number;
		},
		//点击清除
		clickClean: function() {
			state = 0;
			var obj_tr = $("#bottomval").children("td");
			$.each(obj_tr, function(i, obj) {
				obj_tr[i].setAttribute("class", "");
			});
			conditionsSubmit = new Array();
		}, //提交条件的点击事件
		clickSubmit: function(obj) {
			$("#SignItem100 tr td[class='select-yes']").attr("class", "");
			var className = obj.getAttribute("class");
			if (className == "select-yes") {
				obj.setAttribute("class", "");
			} else {
				if (obj.getAttribute("id") != "undefined") {
					this.exclude(obj);
				} else if (obj.getAttribute("alt").indexOf("666") > -1) {
					obj.setAttribute("class", "");
					showMsg("该条件无法选择", 1500);
				} else {
					obj.setAttribute("class", "select-yes");
				}
			}
		}, //判断特殊走势图更改样式
		special: function() {
			var obj = JSON.parse(this.cookieGet("obj"));
			var id = obj.play_id + "-" + obj.chart_id;
			var width = 30;
			switch (id) {
				/***********代码图表************/
				case "1105r5-liangMaHeZhiA":
				case "1105r5-sanMaHeZhiA":
				case "1105r5-liangMaChaZhi":
					/**************正常**************/
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
					//12选5
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
					//时时彩前二后二
				case "ssca2-trend_litiZouShi":
				case "ssca2-trend_heheZouShi":
				case "ssca2-trend_chazhiZouShi":
				case "ssca2-trend_longtouFengWei":
				case "sscp2-trend_litiZouShi":
				case "sscp2-trend_heheZouShi":
				case "sscp2-trend_chazhiZouShi":
				case "sscp2-trend_longtouFengWei":
					//时时彩前三后三
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
					//排列三
				case "plsr3-trend_jibenZouShi":
				case "plsr3-trend_heheZouShi":
				case "plsr3-trend_hezhiZouShiA":
				case "plsr3-trend_longtouFengWei":
				case "plsr3-trend_012luZouShi":
					//3D
				case "3dr3-trend_jibenZouShi":
				case "3dr3-trend_heheZouShi":
				case "3dr3-trend_hezhiZouShiA":
				case "3dr3-trend_longtouFengWei":
				case "3dr3-trend_012luZouShi":
					//快三
				case "k3r3-trend_pingmianZouShi":
				case "k3r3-trend_chaheZouShi":
					//时时彩四星
				case "sscs4-trend_jibenZouShi":
				case "sscs4-trend_litiZouShi":
				case "sscs4-trend_heheZouShi":
				case "sscs4-trend_hezhiZouShiA":
					width = 44;
					break;
				default:
					break;
			}
			return width;
		},
		//特殊条件互斥
		exclude: function(obj) {
			var id = obj.getAttribute("id");
			obj.setAttribute("class", "select-yes");
			switch (id) {
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
					$("#oned").attr("class", "");
					$("#oney").attr("class", "");
					break;
				case "oned":
					$("#onez").attr("class", "");
					$("#oney").attr("class", "");
					break;
				case "oney":
					$("#onez").attr("class", "");
					$("#oned").attr("class", "");
					break;
				case "twoz":
					$("#twod").attr("class", "");
					$("#twoy").attr("class", "");
					break;
				case "twod":
					$("#twoz").attr("class", "");
					$("#twoy").attr("class", "");
					break;
				case "twoy":
					$("#twoz").attr("class", "");
					$("#twod").attr("class", "");
					break;
				case "thrz":
					$("#thrd").attr("class", "");
					$("#thry").attr("class", "");
					break;
				case "thrd":
					$("#thrz").attr("class", "");
					$("#thry").attr("class", "");
					break;
				case "thry":
					$("#thrz").attr("class", "");
					$("#thrd").attr("class", "");
					break;
				default:
					break;
			}
		},
	};
}();


function NewCode_Number_PD(key) {
	var codeNumber = false;
	switch (key) {
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
			codeNumber = true;
			break;
	}
	return codeNumber;
}
//条件提交拼值
function substring_play(key, val) {
	var play = {};
	play.id = key;
	play.tan = false;
	play.reaction = "0";
	play.tolerant = "0";
	switch (key) {
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
			var id = 6;
			if (key.indexOf("ssca2") > -1 || key.indexOf("sscp2") > -1) {
				id = 4
			}
			if (key.indexOf("sscs4") > -1) {
				id = 8
			}
			var kc = [];
			var arr = [];
			var appear = "";
			var count = 0;
			var z_cou = 0;
			for (var ulid in val) {
				arr[count] = {
					"ulid": parseInt(ulid),
					"value": val[ulid]
				};
				var kc = "";
				count++;
				for (var i = 0; i < val[ulid].split(",").length; i++) {
					if (i < 6) {
						kc += (i + 1) + ",";
					}
				}
				kc = kc.substring(0, kc.length - 1);
				arr[count] = {
					"ulid": parseInt(ulid) + 1,
					"value": kc
				};
				count++;
				z_cou++;
			}
			for (var i = 0; i < z_cou; i++) {
				appear += (i + 1) + ",";
			}
			appear = appear.substring(0, appear.length - 1);
			arr[count] = {
				"ulid": id,
				"value": appear
			}
			play.arr = arr;
			break;
			//代码走势
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
			var arr = [];
			var appear = "";
			var count = 0;
			var one = 0;
			var two = 0;
			var three = 0;
			var app_count = 0;
			for (var ulid in val) {
				arr[count] = {
					"ulid": ulid,
					"value": val[ulid]
				};
				count++;
				var kaichu = "";
				for (var i = 0; i < val[ulid].split(",").length; i++) {
					if (i < 6) {
						kaichu += (i + 1) + ",";
					}
				}
				arr[count] = {
					"ulid": parseInt(ulid) + 1 + "",
					"value": kaichu.substring(0, kaichu.length - 1)
				};
				count++;
				app_count++;
			}
			for (var i = 0; i < app_count; i++) {
				appear += (i + 1) + ",";
			}
			appear = appear.substring(0, appear.length - 1);
			arr[count] = {
				"ulid": "6",
				"value": appear
			}
			if (key.indexOf("21010") > -1) {
				arr[count] = {
					"ulid": "4",
					"value": appear
				}
			}
			if (key.indexOf("sscs4") > -1) {
				arr[count] = {
					"ulid": "8",
					"value": appear
				}
			}
			play.arr = arr;
			break;
			//开出ulid为10的条件
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
		case "sscs4007":
			var leng = 10;
			var kc = [];
			var arr = [];
			var appear = "";
			var count = 0;
			for (var ulid in val) {
				arr[count] = {
					"ulid": ulid,
					"value": val[ulid]
				};
				count++;
			}
			for (var i = 0; i < count; i++) {
				appear += (i + 1) + ",";
			}
			appear = appear.substring(0, appear.length - 1);
			if ("1105r5035" == key || "1205r5034" == key) {
				appear = count;
			}
			if ("1205r5034" == key) {
				arr[count] = {
					"ulid": "11",
					"value": appear
				}
			} else {
				arr[count] = {
					"ulid": "10",
					"value": appear
				}
			}

			play.arr = arr;
			break;
			//特殊条件
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
		case "sscs4010":
			var leng = 3;
			var zulid = 12;
			//小条件开出
			var kc1 = "";
			var kc2 = "";
			var kc3 = "";
			if (key == "1105r5016" || key == "1205r5016") {
				leng = 4;
				zulid = 8;
			} else if (key == "sscs4010" || key == "ssca3012" || key == "sscp3012" || key == "3dr3012" || key ==
				"plsr3012" ||
				key ==
				"sscp2009" || key == "ssca2009") {
				leng = 5;
				zulid = 11;
			}
			var arr = [];
			var appear = "";
			var count = 0;
			var countAppear = 0;
			var i = 0;
			var kc1_c = 1;
			var kc2_c = 1;
			var kc3_c = 1;
			var upulid = -1;
			var index = 0;
			for (var ulid in val) {
				arr[i] = {
					"ulid": ulid,
					"value": val[ulid]
				};
				if (key == "sscs4010" || key == "ssca3012" || key == "sscp3012" || key == "3dr3012" || key ==
					"plsr3012" || key ==
					"ssca2009" || key == "sscp2009") {
					if (parseInt(ulid) == 0 || parseInt(ulid) == 1) {
						if (kc1_c <= 2) {
							kc1 += kc1_c + ",";
							kc1_c++;
						}
					}
					if (parseInt(ulid) == 3 || parseInt(ulid) == 4) {
						if (kc2_c <= 2) {
							kc2 += kc2_c + ",";
							kc2_c++;
						}
					}
					if (parseInt(ulid) == 6 || parseInt(ulid) == 7) {
						if (kc3_c <= 2) {
							kc3 += kc3_c + ",";
							kc3_c++;
						}
					}
				} else if (key == "1105r5016" || key == "1205r5016") {
					if (parseInt(ulid) == 0 || parseInt(ulid) == 1) {
						if (kc1_c <= 2) {
							kc1 += kc1_c + ",";
							kc1_c++;
						}
					}
					if (parseInt(ulid) == 3 || parseInt(ulid) == 4) {
						if (kc2_c <= 2) {
							kc2 += kc2_c + ",";
							kc2_c++;
						}
					}
				} else {
					if (parseInt(ulid) == 0 || parseInt(ulid) == 1 || parseInt(ulid) == 2) {
						if (kc1_c <= 3) {
							kc1 += kc1_c + ",";
							kc1_c++;
						}
					}
					if (parseInt(ulid) == 4 || parseInt(ulid) == 5 || parseInt(ulid) == 6) {
						if (kc2_c <= 3) {
							kc2 += kc2_c + ",";
							kc2_c++;
						}
					}
					if (parseInt(ulid) == 8 || parseInt(ulid) == 9 || parseInt(ulid) == 10) {
						if (kc3_c <= 3) {
							kc3 += kc3_c + ",";
							kc3_c++;
						}
					}
				}
				i++;
				count++;
				/**
				 * 单独判断11X5或12X5龙头凤尾 
				 * ulid 0 == 龙头单双
				 * ulid 1 == 凤尾单双
				 * ulid 2 == 条件内置小开出条件
				 * ulid 3 == 龙头质合
				 * ulid 4 == 凤尾质合
				 * ulid 5 == 条件内置小开出条件
				 * ulid 6 == 龙头大小---仅时时彩 PL3 3D可用 （11X5或12X5 对应龙头012路）
				 * ulid 7 == 凤尾大小---仅时时彩 PL3 3D可用 （11X5或12X5 对应凤尾012路）
				 * ulid 8 == 条件内置小开出条件 11选5 无   11X5或12X5 对应大开出条件）
				 * ulid 9 == 龙头012路
				 * ulid 10 == 凤尾012路
				 * ulid 11 == 大开出条件
				 */
				if (key == "1105r5016" || key == "1205r5016") {
					if ((ulid == 1 || ulid == 0) && (upulid != 1 && upulid != 0)) {
						countAppear++;
					} else if ((ulid == 3 || ulid == 4) && (upulid != 3 && upulid != 4)) {
						countAppear++;
					} else if (ulid != 0 && ulid != 1 && ulid != 3 && ulid != 4) {
						countAppear++;
					}
				} else {
					if ((ulid == 1 || ulid == 0) && (upulid != 1 && upulid != 0)) {
						countAppear++;
					} else if ((ulid == 3 || ulid == 4) && (upulid != 3 && upulid != 4)) {
						countAppear++;
					} else if ((ulid == 6 || ulid == 7) && (upulid != 6 && upulid != 7)) {
						countAppear++;
					} else if (ulid != 0 && ulid != 1 && ulid != 3 && ulid != 4 && ulid != 6 && ulid != 7) {
						countAppear++;
					}
				}
				upulid = ulid;
			}
			if (key == "sscs4010" || key == "ssca3012" || key == "sscp3012" || key == "3dr3012" || key == "plsr3012" ||
				key ==
				"1105r5016" ||
				key == "1205r5016" || key == "ssca2009" || key == "sscp2009") {
				if (kc1 != "") {
					arr[count] = {
						"ulid": "2",
						"value": kc1.substring(0, kc1.length - 1)
					}
					count++;
				}
				if (kc2 != "") {
					arr[count] = {
						"ulid": "5",
						"value": kc2.substring(0, kc2.length - 1)
					}
					count++;
				}
				if (kc3 != "") {
					arr[count] = {
						"ulid": "8",
						"value": kc3.substring(0, kc3.length - 1)
					}
					count++;
				}
			} else {
				countAppear = 0;
				if (kc1 != "") {
					arr[count] = {
						"ulid": "3",
						"value": kc1.substring(0, kc1.length - 1)
					}
					count++;
					countAppear++;
				}
				if (kc2 != "") {
					arr[count] = {
						"ulid": "7",
						"value": kc2.substring(0, kc2.length - 1)
					}
					count++;
					countAppear++;
				}
				if (kc3 != "") {
					arr[count] = {
						"ulid": "11",
						"value": kc3.substring(0, kc3.length - 1)
					}
					count++;
					countAppear++;
				}
			}
			for (var i = 0; i < countAppear; i++) {
				if (i < leng) {
					appear += (i + 1) + ",";
				}
			}
			appear = appear.substring(0, appear.length - 1);
			arr[count] = {
				"ulid": zulid + "",
				"value": appear
			}
			play.arr = arr;
			break;
			//开出ulid为5的条件
		case "1105r5009":
		case "1105r5010":
		case "1105r5012":
		case "1105r5036": //特殊条件
		case "1105r5044":
		case "1105r5020":
		case "1205r5009":
		case "1205r5010":
		case "1205r5012":
		case "1205r5035": //特殊条件
		case "1205r5043":
		case "1105a3011":
		case "1205a3011":
		case "1105a3013":
		case "1205a3013":
			var leng = 5;
			var arr = [];
			var appear = "";
			var count = 0;
			for (var ulid in val) {
				kc = val[ulid].split(",");
				arr[count] = {
					"ulid": ulid,
					"value": val[ulid]
				};
				count++;
			}
			for (var i = 0; i < count; i++) {
				if (i < leng) {
					appear += (i + 1) + ",";
				}
			}
			appear = appear.substring(0, appear.length - 1);
			if ("1205r5035" == key || "1105r5036" == key) {
				appear = "0";
			}
			arr[count] = {
				"ulid": "5",
				"value": appear
			}
			play.arr = arr;
			break;
			//开出ulid为4的条件
		case "1105a2009":
		case "1205a2009":
		case "1105a3020":
		case "1205a3020":
		case "1105a2008":
		case "1205a2008":
		case "sscs4005":
			var leng = 4;
			var arr = [];
			var appear = "";
			var count = 0;
			for (var ulid in val) {
				arr[count] = {
					"ulid": ulid,
					"value": val[ulid]
				};
				count++;
			}
			for (var i = 0; i < count; i++) {
				if (i < leng) {
					appear += (i + 1) + ",";
				}
			}
			appear = appear.substring(0, appear.length - 1);

			arr[count] = {
				"ulid": "4",
				"value": appear
			}
			play.arr = arr;
			break;
			//开出ulid为3的条件
		case "1105r5018":
		case "1105r5017":
		case "1105r5028": //特殊开出
		case "1105r5029": //特殊开出
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
		case "1205r5027": //特殊开出
		case "1205r5028": //特殊开出
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
		case "ssca2007":
		case "sscp2007":
		case "ssca3023":
		case "ssca3025":
		case "sscp3023":
		case "ssca3025":
		case "plsr3023":
		case "plsr3025":
		case "3dr3023":
		case "3dr3025":
		case "sscs4011":
		case "sscs4008":
			var leng = 3;
			var arr = [];
			var appear = "";
			var count = 0;
			for (var ulid in val) {
				arr[count] = {
					"ulid": ulid,
					"value": val[ulid]
				};
				count++;
			}
			for (var i = 0; i < count; i++) {
				if (i < leng) {
					appear += (i + 1) + ",";
				}
			}
			appear = appear.substring(0, appear.length - 1);
			if (key == "1105r5028" || key == "1105r5029" || key == "1205r5028" || key == "1205r5027") {
				appear = "0";
			}
			arr[count] = {
				"ulid": "3",
				"value": appear
			}
			play.arr = arr;
			break;
			//开出ulid为2的条件
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
			var leng = 2;
			if (key == "1105r5021" || key == "1205r5020") {
				leng = 10;
			}
			var arr = [];
			var appear = "";
			var count = 0;
			var zh_leng = 0;
			if (common.cookieGet("trendid") == "trend_tongweiZhenFu") {
				for (var ulid in val) {
					var value = "";
					var number = kaijianghao.split(",");
					var val_count = 0;
					var data = val[ulid].split(",");
					var valdata = "";
					for (var i = 0; i < data.length; i++) {
						if (key == "1105a2006") {
							if (parseInt(number[ulid]) - parseInt(data[i]) > 0 || parseInt(data[i]) + parseInt(number[
									ulid]) <= 11) {
								if (parseInt(number[ulid]) - parseInt(data[i]) > 0) {
									if (parseInt(number[ulid]) - parseInt(data[i]) < 10) {
										valdata += "0" + (parseInt(number[ulid]) - parseInt(data[i])) + ",";
									} else {
										valdata += (parseInt(number[ulid]) - parseInt(data[i])) + ",";
									}
								}
								if (parseInt(data[i]) + parseInt(number[ulid]) <= 11) {
									if (parseInt(data[i]) + parseInt(number[ulid]) < 10) {
										valdata += "0" + (parseInt(data[i]) + parseInt(number[ulid])) + ",";
									} else {
										valdata += (parseInt(data[i]) + parseInt(number[ulid])) + ",";
									}
								}
							} else {
								val_count++;
							}
						} else {
							if (parseInt(data[i]) - parseInt(number[ulid]) > 0 || parseInt(data[i]) + parseInt(number[
									ulid]) <= 12) {
								if (parseInt(data[i]) - parseInt(number[ulid]) > 0) {
									if (parseInt(data[i]) - parseInt(number[ulid]) < 10) {
										valdata += "0" + (parseInt(data[i]) - parseInt(number[ulid])) + ",";
									} else {
										valdata += (parseInt(data[i]) - parseInt(number[ulid])) + ",";
									}
								}
								if (parseInt(data[i]) + parseInt(number[ulid]) <= 12) {
									if (parseInt(data[i]) + parseInt(number[ulid]) < 10) {
										valdata += "0" + (parseInt(data[i]) + parseInt(number[ulid])) + ",";
									} else {
										valdata += (parseInt(data[i]) + parseInt(number[ulid])) + ",";
									}
								}
							} else {
								val_count++;
							}
						}
					}
					if (val_count == data.length) {
						play.tan = true;
						break;
					} else {
						arr[count] = {
							"ulid": ulid,
							"value": valdata.substring(0, valdata.length - 1)
						};
						count++;
					}
				}
			} else {
				for (var ulid in val) {
					arr[count] = {
						"ulid": ulid,
						"value": val[ulid]
					};
					zh_leng = val[ulid].split(",").length;
					count++;
				}
			}
			for (var i = 0; i < count; i++) {
				appear += (i + 1) + ",";
			}
			if (key == "1105r5021" || key == "1205r5020") {
				appear = "";
				for (var i = 0; i < zh_leng; i++) {
					if (i < 5) {
						appear += (i + 1) + ",";
					}
				}
			}
			appear = appear.substring(0, appear.length - 1);
			arr[count] = {
				"ulid": "2",
				"value": appear
			}
			play.arr = arr;
			break;
			//开出ulid为1的条件
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
		case "1105a3001-0":
		case "1205a3001-0":
		case "1105a3001-1":
		case "1205a3001-1":
		case "1105a3001-2":
		case "1205a3001-2":
		case "sscs4001":
		case "sscs4012":
			var leng = 3;
			if (key == "1105r5001" || key == "1205r5001" || key == "1105r5041" || key == "1205r5040") {
				leng = 5;
			} else if (key == "1105a2001" || key == "1205a2001" || key == "ssca2001" || key == "sscp2001") {
				leng = 2;
			} else if (key == "sscs4012" || key == "1105r5031" || key == "1105r5032" || key == "1205r5030" || key ==
				"1205r5031" ||
				key ==
				"ssca3014" || key == "ssca3017" || key == "sscp3014" || key == "sscp3017" || key == "3dr3014" || key ==
				"3dr3017" || key == "plsr3014" || key == "plsr3017") {
				leng = 10;
			} else if (key == "1105r5033" || key == "1105r5039" || key == "1205r5032" || key == "1205r5038" || key ==
				"ssca3016" || key == "sscp3016" || key == "3dr3016" || key == "plsr3016") {
				leng = 9;
			} else if (key == "1105r5040" || key == "1205r5039") {
				leng = 6;
			} else if (key == "sscs4001" || key == "k3r3011") {
				leng = 4;
			}
			var kc = [];
			var arr = [];
			var appear = "";
			if ((key.indexOf("1205a3001") > -1 || key.indexOf("1105a3001") > -1) && common.cookieGet("trendid") ==
				"trend_xingtaiZouShi") {
				play.id = key.split("-")[0];
				var id = parseInt(key.split("-")[1]);
				var number = kaijianghao.split(",");
				var data = "";
				var count_kc = 0;
				for (var ulid in val) {
					count_kc = ulid;
					if (count_kc == 1) {
						if (key.indexOf("1205a3001") > -1) {
							if (parseInt(number[id]) - 1 > 0 || parseInt(number[id]) + 1 <= 12) {
								if (parseInt(number[id]) - 1 > 0) {
									if (parseInt(number[id]) - 1 < 10) {
										data += "0" + (parseInt(number[id]) - 1) + ",";
									} else {
										data += (parseInt(number[id]) - 1) + ",";
									}
								}
								if (parseInt(number[id]) + 1 <= 12) {
									if (parseInt(number[id]) + 1 < 10) {
										data += "0" + (parseInt(number[id]) + 1) + ",";
									} else {
										data += (parseInt(number[id]) + 1) + ",";
									}
								}
							} else {
								play.tan = true;
								break;
							}
						} else {
							if (parseInt(number[id]) - 1 > 0 || parseInt(number[id]) + 1 <= 11) {
								if (parseInt(number[id]) - 1 > 0) {
									if (parseInt(number[id]) - 1 < 10) {
										data += "0" + (parseInt(number[id]) - 1) + ",";
									} else {
										data += (parseInt(number[id]) - 1) + ",";
									}
								}
								if (parseInt(number[id]) + 1 <= 11) {
									if (parseInt(number[id]) + 1 < 10) {
										data += "0" + (parseInt(number[id]) + 1) + ",";
									} else {
										data += (parseInt(number[id]) + 1) + ",";
									}
								}
							} else {
								play.tan = true;
								break;
							}
						}
					} else if (count_kc == 0) {
						if (parseInt(number[id]) - 1 > 0) {
							if (parseInt(number[id]) - 1 < 10) {
								data += "0" + (parseInt(number[id]) - 1) + ",";
							} else {
								data += (parseInt(number[id]) - 1) + ",";
							}
						} else {
							play.tan = true;
							break;
						}
					} else if (count_kc == 2) {
						if (key.indexOf("1205a3001") > -1) {
							if (parseInt(number[id]) + 1 <= 12) {
								if (parseInt(number[id]) + 1 < 10) {
									data += "0" + (parseInt(number[id]) + 1) + ",";
								} else {
									data += (parseInt(number[id]) + 1) + ",";
								}
							} else {
								play.tan = true;
								break;
							}
						} else {
							if (parseInt(number[id]) + 1 <= 11) {
								if (parseInt(number[id]) + 1 < 10) {
									data += "0" + (parseInt(number[id]) + 1) + ",";
								} else {
									data += (parseInt(number[id]) + 1) + ",";
								}
							} else {
								play.tan = true;
								break;
							}
						}
					}
				}
				data = data.substring(0, data.length - 1);
				arr[0] = {
					"ulid": "0",
					"value": data
				};
				if (count_kc == 1) {
					appear = "0"
				} else {
					appear = "";
					for (var i = 0; i < data.split(",").length; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
				}
			} else {
				for (var ulid in val) {
					kc = val[ulid].split(",");
					arr[parseInt(ulid)] = {
						"ulid": ulid,
						"value": val[ulid]
					};
				}
				for (var i = 0; i < kc.length; i++) {
					if (i < leng) {
						appear += (i + 1) + ",";
					}
				}
				appear = appear.substring(0, appear.length - 1);
			}
			arr[1] = {
				"ulid": "1",
				"value": appear
			}
			play.arr = arr;
			break;
			//无开出条件
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
		case "sscs4004":
		case "sscs4002":
		case "sscs4006":
		case "sscs4003":
			var arr = [];
			for (var ulid in val) {
				arr[parseInt(ulid)] = {
					"ulid": ulid,
					"value": val[ulid]
				};
			}
			play.arr = arr;
			break;
		default:
			break;
	}
	return play;
}

function showMsg(msg, time) {
	if (!time) {
		time = 1000;
	}
	layer.msg(msg, {
		time: time
	});
};