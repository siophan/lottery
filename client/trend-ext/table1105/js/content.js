/**
 * @创建人：小宇
 * @创建时间：2019/11/21
 * @修改人：
 * @修改日期：
 * @备注：算法
 */
var content = function() {
	return {
		//打印中心内容
		content: function(id, data) {
			console.log(data)
			var number = "";
			var max = 0;
			var omit = new Array(50); //
			var appeardTimes = []; // 出现次数
			var maxSuccessive = []; // 最大连续
			var maxOmission = []; // 最大遗漏
			var flag_omit = []; //统计最大遗漏
			var flag_appeard = []; // 统计出现次数
			for (var i = 0; i < omit.length; i++) {
				omit[i] = 0;
				appeardTimes[i] = 0;
				maxSuccessive[i] = 0;
				maxOmission[i] = 0;
				flag_omit[i] = 0;
				flag_appeard[i] = 0;
			}
			var html = "";
			var colgroup = "<colgroup>";
			var coo = initialize.content(id);
			colgroup += '<col span="1" width="100" ></col>';
			for (var i = 0; i < coo.data.length; i++) {
				colgroup += '<col class="' + coo.listclass[i] + '"span="' + coo.list[i] + '" width="' + common
					.special() +
					'"></col>';
			}
			colgroup += "</colgroup>";
			html += "<tbody id='trendcontent'>";
			var history = [];
			var hCount = 0;
			var tj = 0;
			for (var i = data.length - 1; i > -1; i--) {
				var baseExpect = data[i].expect;
				var baseOpenNumber = data[i].opennumber;
				max = 0;
				//判断特殊走势图
				if (id.indexOf("trend_xingtaiZouShi") > -1 || id.indexOf("trend_jibenZouShi") > -1 && (id
						.indexOf("1105") > -1 || id.indexOf("1205") > -1)) {
					history[hCount] = baseOpenNumber;
					hCount++;
				} else if (((id.indexOf("trend_tongweiZhenFu") > -1 || id.indexOf("trend_lianhaoChongMa") > -
						1) && (id.indexOf("1105") > -1 || id.indexOf("1205") > -1)) || id.indexOf(
						"trend_hezhenzoushi") > -1) {
					history[hCount] = baseOpenNumber;
					hCount++;
				} else if (id.indexOf("trend_litiZouShi") > -1 && (id.indexOf("ssca2") > -1 || id.indexOf(
						"sscp2") > -1)) {
					history[hCount] = baseOpenNumber;
					hCount++;
				} else if (id.indexOf("trend_dingweifenbu") > -1) {
					history[tj] = baseOpenNumber;
					tj++;
				} else {
					hCount = 3;
				}

				//正常情况下
				if ((id.indexOf("trend_dingweifenbu") > -1 && tj > 200) || (hCount > 2 || ((id.indexOf(
								"trend_hezhenzoushi") > -1 ||
							(id.indexOf("trend_litiZouShi") > -1 && (id.indexOf("ssca2") > -1 || id.indexOf(
								"sscp2") > -1)) || id.indexOf(
								"trend_tongweiZhenFu") > -1 || id.indexOf("trend_lianhaoChongMa") > -1) &&
						hCount > 1))) {
					var expect;
					if (baseExpect.length > 7) {
						expect = common.cutOut(baseExpect, baseExpect.length - 5, baseExpect
							.length);
					} else {
						expect = common.cutOut(baseExpect, 4, baseExpect.length);
					}
					if (id.indexOf("trend_pingmianZouShi") < 0) {
						baseOpenNumber = common.cutOutNumber(baseOpenNumber, id.split("-")[0]);
					}
					number += "<tr>";
					number += '<td class="qh">' + expect + '</td>'; //期号
					number += "</tr>";
					var json = this.calculate(id, baseOpenNumber, history); //计算数据
					html += "<tr>";
					html += '<td class="kjhm">' + baseOpenNumber + '</td>'; //开奖号
					var count = 0;
					//循环列
					for (var p = 0; p < coo.list.length; p++) {
						if (parseInt(coo.list[p]) == 1) {
							var type = json[p].classname == null ? this.type(baseOpenNumber) : json[p]
								.classname;
							html += '<td class="' + type + '">' + json[p].num[0] + '</td>';
							max++;
						}
						if (coo.val[p].length == 0) {
							count++;
						}
						for (var j = 0; j < coo.val[p].length; j++) {
							max++;
							var flag = -1;
							//统计列数 便于打印下方遗漏
							//特殊走势图特殊铺值
							if (id.indexOf("trend_xingtaiZouShi") > -1 && (id.indexOf("1105a3") > -1 || id
									.indexOf("1205a3") > -1)) {
								for (var k = 0; k < json[p].num.length; k++) {
									if (p == coo.list.length - 1) {
										if (json[p].num[k] == coo.data[p][j]) {
											flag = coo.data[p][j];
										}
									} else if (parseInt(json[p].num[k]) == parseInt(coo.val[p][j])) {
										if (p == 4 || p == 5 || p == 6) {
											if (json[p].num[k] == 0 || json[p].num[k] == 2) {
												flag = language(common.cookieGet("language"),
													"conditions_chuan");
											} else {
												flag = coo.data[p][j];
											}
										} else {
											flag = coo.data[p][j];
										}
										break;
									}
								}
							} else if (id.indexOf("trend_hezhizoushiB") > -1 && (id.indexOf("1105r3") > -1 ||
									id.indexOf("1205r3") > -1)) {
								for (var k = 0; k < json[p].num.length; k++) {
									if (parseInt(json[p].num[k]) == parseInt(coo.val[p][j])) {
										flag = coo.val[p][j];
										break;
									}
								}
							} else if (id.indexOf("trend_hezhiShuJuA") > -1) {
								if (parseInt(json[p].num[j]) == parseInt(coo.val[p][j]) || json[p].num[j] ==
									coo.data[p][j]) {
									flag = coo.data[p][j];
								}
							} else if (id.indexOf("trend_chazhiKuaDu") > -1 || id.indexOf("trend_sanmaHeZhiB") >
								-1 || id.indexOf("trend_sanmaChaHe") > -1 || id.indexOf("trend_heheFenBu") >
								-1 || id == "sscs4-trend_chakuaZouShi") {
								for (var k = 0; k < json[p].num.length; k++) {
									if (json[p].num[k] == coo.data[p][j]) {
										flag = coo.data[p][j];
										break;
									}
								}
							} else if (id.indexOf("trend_chazhiSanFenBu") > -1 || id.indexOf(
									"trend_chazhiErFenBu") > -1 || id.indexOf(
									"trend_chazhiSiFenBu") > -1 || id.indexOf("trend_chazhiWuFenBu") > -1 || id
								.indexOf("trend_chazhiWuFenBu") >
								-1) {
								for (var k = 0; k < json[p].num.length; k++) {
									if (json[p].num[k] == coo.data[p][j]) {
										flag = coo.data[p][j];
									}
								}
							} else if (id.indexOf("trend_junhengFenBu") > -1) {
								for (var k = 0; k < json[p].num.length; k++) {
									if (parseInt(json[p].num[k]) == parseInt(coo.val[p][j])) {
										flag = coo.data[p][j];
									}
								}
							} else {
								for (var k = 0; k < json[p].num.length; k++) {
									if (parseInt(json[p].num[k]) == parseInt(coo.val[p][j]) || json[p].num[k] ==
										coo.data[p][j]) {
										flag = coo.data[p][j];
										break;
									}
								}
							}
							if (flag != -1) {
								appeardTimes[count]++; //出现则加一
								maxOmission[count] = 0; //最大遗漏
								maxSuccessive[count]++;
								//号码球颜色变更
								if (json[p].classname.indexOf("all") > -1) {
									var ball = this.ball(id, flag, json[p].num, json[p].classname);
									var color = ball != null ? ball : json[p].classname;
									//012路走势图后面加线
									if (id.indexOf("trend_012luFenBu") > -1 || id.indexOf("trend_012luGeShu") >
										-1) {
										if ((id.indexOf("1105") > -1 && (parseInt(flag) == 9) || parseInt(
													flag) ==
												10) || (id.indexOf("1205") > -1 && (parseInt(flag) == 12) ||
												parseInt(flag) == 10) || (id ==
												"sscs4-trend_012luGeShu" && (parseInt(coo.val[p][j]) == 9 ||
													parseInt(coo.val[
														p][j]) == 7))) {
											html +=
												'<td style="border-right: 2px solid #999 !important;"><span class="' +
												color + '">' + flag +
												'</span></td>';
										} else {
											html += '<td><span class="' + color + '">' + flag +
												'</span></td>';
										}
									} else if (id.indexOf("trend_012luZouShi") > -1) {
										if (parseInt(flag) == 9 || parseInt(flag) == 7) {
											html +=
												'<td style="border-right: 2px solid #999 !important;"><span class="' +
												color + '">' + flag +
												'</span></td>';
										} else {
											html += '<td><span class="' + color + '">' + flag +
												'</span></td>';
										}
									} else {
										html += '<td><span class="' + color + '">' + flag +
											'</span></td>';
									}
								} else {
									html += '<td class="' + json[p].classname + '">' + flag + '</td>';
								}
								omit[count] = 0;
							} else {
								++maxOmission[count];
								maxSuccessive[count] = 0;
								if (id.indexOf("trend_012luFenBu") > -1 || id.indexOf("trend_012luGeShu") > -
									1) {
									if ((id.indexOf("1105") > -1 && (parseInt(coo.val[p][j]) == 9) || parseInt(
											coo.val[p][j]) == 10) || (id.indexOf("1205") > -1 && (parseInt(coo
											.val[p][j]) == 12) || parseInt(coo
											.val[p][j]) == 10) || (id == "sscs4-trend_012luGeShu" && (parseInt(
											coo.val[p][j]) == 9 || parseInt(coo.val[
											p][j]) == 7))) {
										html += '<td style="border-right: 2px solid #999 !important;">' + ++
										omit[count] + '</td>';
									} else {
										html += '<td>' + ++omit[count] + '</td>';
									}
								} else if (id.indexOf("trend_012luZouShi") > -1) {
									if (parseInt(coo.val[p][j]) == 9 || parseInt(coo.val[p][j]) == 7) {
										html += '<td style="border-right: 2px solid #999 !important;">' + ++
										omit[count] + '</td>';
									} else {
										html += '<td>' + ++omit[count] + '</td>';
									}
								} else {
									html += '<td>' + ++omit[count] + '</td>';
								}
							}
							//如果当前大过历史 历史等于当前
							if (maxSuccessive[count] > flag_appeard[count]) {
								flag_appeard[count] = maxSuccessive[count]
							}
							if (flag_omit[count] < maxOmission[count]) {
								flag_omit[count] = maxOmission[count];
							}
							count++;
						}
					}
					html += "</tr>";
				}
			}
			html += "</tbody>";
			var arise1 = '<td></td>';
			var continuous1 = '<td></td>';
			var omit1 = '<td></td>';
			for (var i = 0; i < max; i++) {
				arise1 += '<td>' + appeardTimes[i] + '</td>';
				continuous1 += '<td>' + flag_appeard[i] + '</td>';
				omit1 += '<td>' + flag_omit[i] + '</td>';
			}
			//打印左侧期号号码
			$("#opennumber").html(number);
			//中间内容铺值
			$("#width1").html(colgroup + html);
			$("#arise1").html(arise1);
			$("#continuous1").html(continuous1);
			$("#omit1").html(omit1);
			//this.omit(max);
			//固定滚动条到最底部
			setTimeout(function() {
				$('#width1').parent().scrollTop($('#width1').height());
			}, 0);
		},
		//算法
		calculate: function(id, opennumber, history) {
			var json = [];
			switch (id) {
				//时时彩四星-012路定位
				case "sscs4-trend_012luDingWei":
					var number = opennumber.split(",");
					//位置
					var one = number[0] % 3;
					var two = number[1] % 3;
					var three = number[2] % 3;
					var four = number[3] % 3;
					var base = [
						[one],
						[two],
						[three],
						[four]
					];
					var color = ["gbg", "lbg", "gbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//时时彩四星012路个数
				case "sscs4-trend_012luGeShu":
					var number = opennumber.split(",");
					var distribution = [0, 3, 6, 9, 1, 4, 7, 2, 5, 8];
					var fb = [];
					//012路
					var ll = 0;
					var yl = 0;
					var el = 0;
					for (var i = 0; i < number.length; i++) {
						for (var j = 0; j < distribution.length; j++) {
							if (parseInt(number[i]) == distribution[j]) {
								fb[i] = distribution[j];
							}
						}
						if (number[i] % 3 == 0) {
							ll++;
						}
						if (number[i] % 3 == 1) {
							yl++;
						}
						if (number[i] % 3 == 2) {
							el++;
						}
					}
					var base = [fb, [ll],
						[yl],
						[el],
					];
					var color = ["bball_s", "gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差跨走势
				case "sscs4-trend_chakuaZouShi":
					var all = [];
					var count = 0;
					var arr = common.sortArr(opennumber.split(","));
					for (var i = arr.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							all[count] = (parseInt(arr[i]) - parseInt(arr[j]));
							count++;
						}
					}
					//差值
					var sum = common.sortArr(common.removeAgain(all));
					//同差
					var againSum = common.getAgain(all)
					var base = [sum, againSum, [parseInt(arr[arr.length - 1]) - parseInt(arr[0])]];
					var color = ["gbg", "rbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//时时彩四星和合走势
				case "sscs4-trend_heheZouShi":
					var fb = [common.getIntNum(0, 12), common.getIntNum(13, 25), common.getIntNum(25, 36)];
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var remainder = all % 10;
					var count = 0;
					for (var i = 0; i < fb.length; i++) {
						for (var p = 0; p < fb[i].length; p++) {
							if (all == fb[i][p]) {
								count = i;
							}
						}
					}
					var base = [count, remainder];
					var color = ["gbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//立体走势-四星
				case "sscs4-trend_litiZouShi":
					var number = opennumber.split(",");
					var sum = 0;
					for (var i = 0; i < number.length; i++) {
						sum += parseInt(number[i]);
					}
					var base = [number[0], number[1], number[2], number[3], sum];
					var color = ["bball_s", "gball_s", "rball_s", "gball_s", "rbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//时时彩四星基本走势
				case "sscs4-trend_jibenZouShi":
					var num = [];
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					json[0] = {
						num: common.sortArr(opennumber.split(",")),
						type: "span",
						classname: "bball_s"
					}
					var xs = [0, 1, 2, 3, 4];
					var os = [0, 2, 4, 6, 8];
					var hs = [0, 4, 6, 8, 9];
					var little = 0; //小数
					var pair = 0 //偶数
					var he = 0 //合数
					for (var i = 0; i < num.length; i++) {
						num[i] = parseInt(num[i]);
						if (xs.indexOf(num[i]) > -1) {
							little++;
						}
						if (os.indexOf(num[i]) > -1) {
							pair++;
						}
						if (hs.indexOf(num[i]) > -1) {
							he++;
						}
					}
					json[1] = {
						num: [pair],
						type: "td",
						classname: "rbg"
					}
					json[2] = {
						num: [he],
						type: "td",
						classname: "lbg"
					}
					json[3] = {
						num: [little],
						type: "td",
						classname: "gbg"
					}
					json[4] = {
						num: [all],
						type: "td",
						classname: "rbg"
					}
					break;
					//平面走势
				case "1105r5-trend_pingmianZouShi":
				case "1105r4-trend_pingmianZouShi":
				case "1105r3-trend_pingmianZouShi":
				case "1105p2-trend_pingmianZouShi":
				case "1105a3-trend_pingmianZouShi":
				case "1105a2-trend_pingmianZouShi":
				case "1205r5-trend_pingmianZouShi":
				case "1205r4-trend_pingmianZouShi":
				case "1205r3-trend_pingmianZouShi":
				case "1205p2-trend_pingmianZouShi":
				case "1205a3-trend_pingmianZouShi":
				case "1205a2-trend_pingmianZouShi":
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
					}
					json[0] = {
						num: common.sortArr(opennumber.split(",")),
						type: "span",
						classname: "bball"
					}
					var xs = [1, 2, 3, 4, 5];
					var os = [2, 4, 6, 8, 10];
					var hs = [4, 6, 8, 9, 10];
					if (id.indexOf("1205") > -1) {
						xs = [1, 2, 3, 4, 5, 6];
						os = [2, 4, 6, 8, 10, 12];
						hs = [4, 6, 8, 9, 10, 12];
					}
					var little = 0; //小数
					var pair = 0 //偶数
					var he = 0 //合数
					for (var i = 0; i < num.length; i++) {
						num[i] = parseInt(num[i]);
						if (xs.indexOf(num[i]) > -1) {
							little++;
						}
						if (os.indexOf(num[i]) > -1) {
							pair++;
						}
						if (hs.indexOf(num[i]) > -1) {
							he++;
						}
					}
					json[1] = {
						num: [little],
						type: "td",
						classname: "rbg"
					}
					json[2] = {
						num: [pair],
						type: "td",
						classname: "lbg"
					}
					json[3] = {
						num: [he],
						type: "td",
						classname: "gbg"
					}
					break;
					//平面走势-SSC
				case "ssca2-trend_pingmianZouShi":
				case "ssca3-trend_pingmianZouShi":
				case "sscp2-trend_pingmianZouShi":
				case "sscp3-trend_pingmianZouShi":
				case "plsr3-trend_pingmianZouShi":
				case "sscs4-trend_pingmianZouShi":
					var num = [];
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					json[0] = {
						num: common.sortArr(opennumber.split(",")),
						type: "span",
						classname: "bball_s"
					}
					var xs = [0, 1, 2, 3, 4];
					var os = [0, 2, 4, 6, 8];
					var hs = [0, 4, 6, 8, 9];
					var little = 0; //小数
					var pair = 0 //偶数
					var he = 0 //合数
					for (var i = 0; i < num.length; i++) {
						num[i] = parseInt(num[i]);
						if (xs.indexOf(num[i]) > -1) {
							little++;
						}
						if (os.indexOf(num[i]) > -1) {
							pair++;
						}
						if (hs.indexOf(num[i]) > -1) {
							he++;
						}
					}
					json[1] = {
						num: [little],
						type: "td",
						classname: "rbg"
					}
					json[2] = {
						num: [pair],
						type: "td",
						classname: "lbg"
					}
					json[3] = {
						num: [he],
						type: "td",
						classname: "gbg"
					}
					json[4] = {
						num: [all],
						type: "td",
						classname: "rbg"
					}
					break;
					//平面走势   基本走势 
				case "3dr3-trend_pingmianZouShi":
				case "k3r3-trend_pingmianZouShi":
				case "ssca3-trend_jibenZouShi":
				case "sscp3-trend_jibenZouShi":
				case "plsr3-trend_jibenZouShi":
					var num = [];
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					json[0] = {
						num: [common.group(num)],
						type: "td",
						classname: null
					}
					json[1] = {
						num: common.sortArr(opennumber.split(",")),
						type: "span",
						classname: "bball_s"
					}
					var xs = [0, 1, 2, 3, 4];
					if (id.indexOf("k3r3") > -1) {
						xs = [1, 2, 3];
					}
					var os = [0, 2, 4, 6, 8];
					var hs = [0, 4, 6, 8, 9];
					var little = 0; //小数
					var pair = 0 //偶数
					var he = 0 //合数
					for (var i = 0; i < num.length; i++) {
						num[i] = parseInt(num[i]);
						if (xs.indexOf(num[i]) > -1) {
							little++;
						}
						if (os.indexOf(num[i]) > -1) {
							pair++;
						}
						if (hs.indexOf(num[i]) > -1) {
							he++;
						}
					}
					json[2] = {
						num: [pair],
						type: "td",
						classname: "rbg"
					}
					json[3] = {
						num: [he],
						type: "td",
						classname: "lbg"
					}
					json[4] = {
						num: [little],
						type: "td",
						classname: "gbg"
					}
					json[5] = {
						num: [all],
						type: "td",
						classname: "rbg"
					}
					var arr = common.sortArr(opennumber.split(","));
					if (id.indexOf("k3r3") > -1) {
						json[5] = {
							num: [arr[arr.length - 1] - arr[0]],
							type: "td",
							classname: "rbg"
						}
					}
					break;
					//基本走势-前二
				case "ssca2-trend_jibenZouShi":
				case "sscp2-trend_jibenZouShi":
					var num = [];
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					json[0] = {
						num: common.sortArr(opennumber.split(",")),
						type: "span",
						classname: "bball_s"
					}
					var xs = [0, 1, 2, 3, 4];
					var os = [0, 2, 4, 6, 8];
					var hs = [0, 4, 6, 8, 9];
					var little = 0; //小数
					var pair = 0 //偶数
					var he = 0 //合数
					for (var i = 0; i < num.length; i++) {
						num[i] = parseInt(num[i]);
						if (xs.indexOf(num[i]) > -1) {
							little++;
						}
						if (os.indexOf(num[i]) > -1) {
							pair++;
						}
						if (hs.indexOf(num[i]) > -1) {
							he++;
						}
					}
					json[1] = {
						num: [pair],
						type: "td",
						classname: "rbg"
					}
					json[2] = {
						num: [he],
						type: "td",
						classname: "lbg"
					}
					json[3] = {
						num: [little],
						type: "td",
						classname: "gbg"
					}
					json[4] = {
						num: [all],
						type: "td",
						classname: "rbg"
					}
					break;
					//邻空分布
				case "1105r5-trend_linkongFenBu":
				case "1205r5-trend_linkongFenBu":
				case "k3r3-trend_linkongFenBu":
					var number = common.sortArr(opennumber.split(","));
					//最大邻码
					var adjacent = 0;
					for (var i = 0; i < number.length - 1; i++) {
						if (number[i + 1] - number[i] > adjacent) {
							adjacent = number[i + 1] - number[i];
						}
					}
					var color = ["gbg", "rbg", "lbg", "rbg"];
					//边空值
					var brimcount = 11;
					if (id.indexOf("1205") > -1) {
						brimcount = 12;
					} else if (id.indexOf("k3r3") > -1) {
						color = ["gbg", "rbg", "gbg"];
						brimcount = 6;
					}
					var brim = (parseInt(number[0]) - 1) + (brimcount - parseInt(number[number.length - 1]));
					//间空值
					var middle = number[number.length - 1] - number[0] - 4;
					//边邻值
					var brimval = brim + adjacent;
					var numval = [adjacent, brim, middle, brimval];
					if (id.indexOf("k3r3") > -1) {
						numval = [adjacent, brim, brimval];
					}
					for (var i = 0; i < numval.length; i++) {
						json[i] = {
							num: [numval[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//基本走势-前三
				case "1105a3-trend_jibenZouShi":
				case "1205a3-trend_jibenZouShi":
					var num = [];
					var he = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						he += parseInt(opennumber.split(",")[i]);
					}
					var base = [num, [num[0]],
						[num[1]],
						[num[2]]
					];
					var color = ["bball", "gball", "rball", "bball"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "span",
							classname: color[i]
						}
					}
					json[4] = {
						num: [he],
						type: "td",
						classname: "rbg"
					}
					break;
					//基本走势-前二
				case "1105a2-trend_jibenZouShi":
				case "1205a2-trend_jibenZouShi":
					var num = [];
					//上两期号码计算跳码
					var jump = [];
					//上一期号码计算重码
					var again = [];
					var he = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						jump[i] = history[history.length - 3].split(",")[i];
						again[i] = history[history.length - 2].split(",")[i];
						num[i] = opennumber.split(",")[i];
						he += parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					//连号 传号 重码 跳码
					var lian = "",
						chuan = "",
						chong = "",
						tiao = "";
					if (parseInt(num[1]) - 1 == parseInt(num[0])) {
						lian = language(common.cookieGet("language"), "conditions_lianhao");
					}
					//记录有无连传重跳
					var t_count = 0;
					var c_count = 0;
					var y_count = 0;
					for (var i = 0; i < num.length; i++) {
						for (var p = 0; p < again.length; p++) {
							if (parseInt(num[i]) == parseInt(again[p]) + 1 || parseInt(num[i]) == parseInt(
									again[p]) - 1) {
								t_count++;
							}
							if (parseInt(num[i]) == parseInt(again[p])) {
								c_count++;
							}
							for (var k = 0; k < jump.length; k++) {
								if (parseInt(num[i]) != parseInt(again[p]) && parseInt(num[i]) == parseInt(jump[
										k])) {
									y_count++;
								}
							}
						}
					}
					if (t_count > 0) {
						chuan = language(common.cookieGet("language"), "conditions_chuanhao");
					}
					if (c_count > 0) {
						chong = language(common.cookieGet("language"), "conditions_chongma");
					}
					if (y_count > 0) {
						tiao = language(common.cookieGet("language"), "conditions_tiaoma");
					}
					var base = [num, [opennumber.split(",")[0]],
						[opennumber.split(",")[1]],
						[lian, chuan, tiao, chong]
					];
					var color = ["bball", "gball", "rball", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "span",
							classname: color[i]
						}
					}
					json[4] = {
						num: [he],
						type: "td",
						classname: "rbg"
					}
					break;
					//和值数据
				case "1105r5-trend_hezhiShuJuA":
				case "1205r5-trend_hezhiShuJuA":
					var len = 11;
					if (id.indexOf("1205") > -1) {
						len = 12;
					}
					var num = [];
					var all = 0,
						sumA = [3, 3, 3],
						sumB = [3, 3, 3],
						head012 = [3, 3, 3],
						end012 = [3, 3, 3],
						AC = [8, 8, 8, 8, 8, 8, 8, 8];
					var head = [2, 2, 2, 2];
					var end = [2, 2, 2, 2];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					//和值数据A
					sumA[(all % 3)] = all % 3;

					//和值数据B
					sumB[(all % 10 % 3)] = all % 10 % 3;
					//龙头单双
					if (num[0] % 2 == 1) {
						head[0] = 0;
					} else {
						head[1] = 1;
					}
					//质数
					var z = [1, 2, 3, 5, 7, 11];
					var lt_z = 0;
					var fw_z = 0;
					for (var i = 0; i < z.length; i++) {
						if (z[i] == parseInt(num[0])) {
							lt_z++;
						}
						if (z[i] == parseInt(num[num.length - 1])) {
							fw_z++;
						}
					}
					//龙头质合
					if (lt_z > 0) {
						head[2] = 0;
					} else {
						head[3] = 1;
					}
					//凤尾单双
					if (num[num.length - 1] % 2 == 1) {
						end[0] = 0;
					} else {
						end[1] = 1;
					}
					//凤尾质合
					if (fw_z > 0) {
						end[2] = 0;
					} else {
						end[3] = 1;
					}
					//龙头012路
					head012[(num[0] % 3)] = num[0] % 3;
					//凤尾012路
					end012[(num[num.length - 1] % 3)] = num[num.length - 1] % 3;
					//统计差值个数
					var count = [];
					for (var p = 0; p < len - 1; p++) {
						count[p] = 0;
					}
					for (var i = num.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							for (var p = 1; p < len; p++) {
								if (num[i] - num[j] == p) {
									count[p - 1]++;
								}
							}
						}
					}
					//统计开出的差值 计算出AC结果
					var ac_count = 0;
					for (var i = 0; i < count.length; i++) {
						if (count[i] > 0) {
							ac_count++;
						}
					}
					AC[(ac_count - 4)] = ac_count - 4;
					var base = [sumA, sumB, head, end, head012, end012, AC];
					var color = ["gbg", "rbg", "gbg", "lbg", "gbg", "rbg", "gbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和值走势
				case "1105r5-trend_hezhiZouShiA":
				case "1205r5-trend_hezhiZouShiA":
				case "ssca3-trend_hezhiZouShiA":
				case "sscp3-trend_hezhiZouShiA":
				case "3dr3-trend_hezhiZouShiA":
				case "plsr3-trend_hezhiZouShiA":
				case "sscs4-trend_hezhiZouShiA":
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var base = [all, all];
					var color = ["rbg", "gbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和合走势 和值分布
				case "1105r5-trend_hezhiFenBuA":
				case "1205r5-trend_hezhiFenBuA":
				case "ssca3-trend_heheZouShi":
				case "sscp3-trend_heheZouShi":
				case "3dr3-trend_heheZouShi":
				case "plsr3-trend_heheZouShi":
					var fb = [common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)];
					if (id.indexOf("1105r5") > -1) {
						fb = [common.getIntNum(15, 20), common.getIntNum(21, 26), common.getIntNum(27, 33),
							common.getIntNum(
								34, 39), common.getIntNum(40, 45)
						];
					} else if (id.indexOf("1205r5") > -1) {
						fb = [common.getIntNum(15, 21), common.getIntNum(22, 28), common.getIntNum(29, 36),
							common.getIntNum(37, 43), common.getIntNum(44, 50)
						];
					}
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var remainder = all % 10;
					var count = 0;
					for (var i = 0; i < fb.length; i++) {
						for (var p = 0; p < fb[i].length; p++) {
							if (all == fb[i][p]) {
								count = i;
							}
						}
					}
					var base = [count, remainder];
					var color = ["gbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和合走势
				case "ssca2-trend_heheZouShi":
				case "sscp2-trend_heheZouShi":
				case "k3r3-trend_heheFenBu":
					var fb = [common.getIntNum(0, 6), common.getIntNum(7, 12), common.getIntNum(13, 18)];
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var remainder = all % 10;
					var count = 0;
					for (var i = 0; i < fb.length; i++) {
						for (var p = 0; p < fb[i].length; p++) {
							if (all == fb[i][p]) {
								count = i;
							}
						}
					}
					var base = [all, all, remainder, count];
					var color = ["rbg", "gbg", "rbg", "lbg"]
					if (id.indexOf("k3r3") > -1) {
						base = [all, remainder];
						color = ["gbg", "rbg"]
					}
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差值走势
				case "ssca2-trend_chazhiZouShi":
				case "sscp2-trend_chazhiZouShi":
					var num = opennumber.split(",");
					var all = 0;
					for (var i = 0; i < num.length; i++) {
						all += parseInt(num[i]);
					}
					var chazhi = 0;
					if (parseInt(num[0]) > parseInt(num[1])) {
						chazhi = parseInt(num[0]) - parseInt(num[1]);
					} else {
						chazhi = parseInt(num[1]) - parseInt(num[0]);
					}
					var base = [all, chazhi];
					var color = ["gbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和合走势
				case "1105a3-trend_heheZouShi":
				case "1205a3-trend_heheZouShi":
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var remainder = all % 10;
					var base = [all, all, remainder];
					var color = ["rbg", "gbg", "rbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//合值走势  三码合值
				case "1105r3-trend_hezhizoushiB":
				case "1205r3-trend_hezhizoushiB":
				case "1105r5-trend_sanmaHeZhiB":
				case "1205r5-trend_sanmaH