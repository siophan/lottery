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
				case "1205r5-trend_sanmaHeZhiB":
					var all = [];
					var arr = common.sortArr(opennumber.split(","));
					for (var i = arr.length - 1; i > 1; i--) {
						for (var j = i - 1; j > 0; j--) {
							for (var k = j - 1; k > -1; k--) {
								all.push((parseInt(arr[i]) + parseInt(arr[j]) + parseInt(arr[k])) % 10);
							}
						}
					}
					//三码合值
					var sum = common.removeAgain(all);
					//同合
					var againSum = common.getAgain(all);
					var base = [sum, againSum];
					var color = ["gbg", "rbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差跨走势  差值跨度
				case "1105r5-trend_chazhiKuaDu":
				case "1205r5-trend_chazhiKuaDu":
				case "ssca3-trend_chakuaZouShi":
				case "sscp3-trend_chakuaZouShi":
				case "3dr3-trend_chakuaZouShi":
				case "plsr3-trend_chakuaZouShi":
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
					//差合走势
				case "k3r3-trend_chaheZouShi":
					var all = [];
					var all1 = [];
					var count = 0;
					var arr = common.sortArr(opennumber.split(","));
					for (var i = arr.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							all[count] = (parseInt(arr[i]) - parseInt(arr[j]));
							all1[count] = (parseInt(arr[i]) + parseInt(arr[j])) % 10;
							count++;
						}
					}
					//合值
					var sum = common.sortArr(common.removeAgain(all1));
					//差值
					var difference = common.sortArr(common.removeAgain(all));
					var base = [sum, difference];
					var color = ["gbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和跨走势
				case "1105a2-trend_hekuaZouShi":
				case "1205a2-trend_hekuaZouShi":
					var arr = common.sortArr(opennumber.split(","));
					//合值
					var sum = parseInt(arr[0]) + parseInt(arr[1]);
					//和值
					var sum1 = (parseInt(arr[0]) + parseInt(arr[1])) % 10;
					//差值
					var difference = parseInt(arr[1]) - parseInt(arr[0]);
					var base = [sum, sum1, difference];
					var color = ["gbg", "rbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//号码属性
				case "1105a2-trend_haomaShuXing":
				case "1205a2-trend_haomaShuXing":
					var number = opennumber.split(",");
					var arr = common.sortArr(opennumber.split(","));
					var array = [];
					var double = [2, 4, 6, 8, 10, 12];
					var he = [4, 6, 8, 9, 10, 12];
					for (var i = 0; i < 7; i++) {
						array[i] = 0;
					}
					for (var i = 0; i < arr.length; i++) {
						//大小
						if (id.indexOf("1105") > -1) {
							if (parseInt(arr[i]) < 6) {
								array[0]++;
							}
						} else {
							if (parseInt(arr[i]) <= 6) {
								array[0]++;
							}
						}
						for (var p = 0; p < double.length; p++) {
							//单双
							if (double[p] == parseInt(arr[i])) {
								array[1]++;
							}
							//质合
							if (he[p] == parseInt(arr[i])) {
								array[2]++;
							}
						}
					}
					//属性大小
					if (array[0] == 0) {
						array[3] = 2;
					} else if (array[0] == 2) {
						array[3] = 3;
					} else if (parseInt(number[0]) > parseInt(number[1])) {
						array[3] = 0;
					} else if (parseInt(number[1]) > parseInt(number[0])) {
						array[3] = 1;
					}
					//属性单双
					if (array[1] == 0) {
						array[4] = 2;
					} else if (array[1] == 2) {
						array[4] = 3;
					} else if (parseInt(number[0]) % 2 == 0) {
						array[4] = 1;
					} else if (parseInt(number[0]) % 2 == 1) {
						array[4] = 0;
					}
					//属性质合
					if (array[2] == 0) {
						array[5] = 2;
					} else if (array[2] == 2) {
						array[5] = 3;
					} else if (he.indexOf(parseInt(number[0])) > -1) {
						array[5] = 1;
					} else if (he.indexOf(parseInt(number[1])) > -1) {
						array[5] = 0;
					}
					//升降
					if (parseInt(number[0]) > parseInt(number[1])) {
						array[6] = 1;
					} else if (parseInt(number[0]) < parseInt(number[1])) {
						array[6] = 0;
					}
					array[0] = 2 - array[0];
					array[1] = 2 - array[1];
					array[2] = 2 - array[2];
					var color = ["gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "rbg"]
					for (var i = 0; i < array.length; i++) {
						json[i] = {
							num: [array[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//同位振幅
				case "1105a2-trend_tongweiZhenFu":
				case "1205a2-trend_tongweiZhenFu":
					var all = [];
					var count = 0;
					//获取上一期号码并按位截取
					var historynum = common.cutOutNumber(history[history.length - 2], id.split("-")[0]).split(
						",");
					var number = opennumber.split(",");
					//第一位
					var one = 0;
					//第二位
					var two = 0;
					if (parseInt(historynum[0]) > parseInt(number[0])) {
						one = parseInt(historynum[0]) - parseInt(number[0]);
					} else {
						one = parseInt(number[0]) - parseInt(historynum[0]);
					}
					if (parseInt(historynum[1]) > parseInt(number[1])) {
						two = parseInt(historynum[1]) - parseInt(number[1]);
					} else {
						two = parseInt(number[1]) - parseInt(historynum[1]);
					}
					var base = [one, two];
					var color = ["rbg", "gbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//连号重码
				case "1105r5-trend_lianhaoChongMa":
				case "1205r5-trend_lianhaoChongMa":
					//获取上一期号码
					var historynum = common.sortArr(history[history.length - 2].split(","));
					var number = common.sortArr(opennumber.split(","));
					var joinNumber = 0; //连号个数
					var lhds = 0; //连号段数
					var equal = 0; //重码
					for (var i = number.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							if (number[i] - number[j] == 1) {
								joinNumber++;
								if (joinNumber == 1) {
									if (number[i] - number[j] == 1) {
										lhds++;
									}
								} else if (joinNumber > 1) {
									if (number[i + 1] - number[j + 1] != 1) {
										lhds++;
									}
								}
								break;
							}
						}
					}
					var arr = [];
					var count = 0;
					for (var i = 0; i < number.length; i++) {
						for (var j = 0; j < historynum.length; j++) {
							if (parseInt(number[i]) == parseInt(historynum[j])) {
								equal++;
								break;
							}
						}
					}
					var base = [joinNumber, lhds, equal];
					var color = ["gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和合分布
				case "1105r5-trend_heheFenBu":
				case "1205r5-trend_heheFenBu":
					var number = common.sortArr(opennumber.split(","));
					var sum = new Array(); //两码和值
					for (var i = number.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							sum.push(parseInt(number[i]) + parseInt(number[j]));
						}
					}
					var sum1 = new Array(); //两码合值
					for (var i = 0; i < sum.length; i++) {
						sum1.push(sum[i] % 10);
					}
					var equal = common.getAgain(sum1);
					sum1 = common.removeAgain(sum1);
					sum = common.removeAgain(sum);
					var base = [sum, sum1, equal];
					var color = ["rbg", "lbg", "gbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和合分布
				case "ssca3-trend_heheFenBu":
				case "sscp3-trend_heheFenBu":
				case "plsr3-trend_heheFenBu":
				case "3dr3-trend_heheFenBu":
					var number = common.sortArr(opennumber.split(","));
					var sum = new Array(); //两码和值
					for (var i = number.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							sum.push(parseInt(number[i]) + parseInt(number[j]));
						}
					}
					var sum1 = new Array(); //两码合值
					for (var i = 0; i < sum.length; i++) {
						sum1.push(sum[i] % 10);
					}
					sum1 = common.removeAgain(sum1);
					sum = common.removeAgain(sum);
					var base = [sum, sum1];
					var color = ["rbg", "gbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//跳位合值
				case "1105r5-trend_tiaoweiHeZhiB":
				case "1205r5-trend_tiaoweiHeZhiB":
					var number = common.sortArr(opennumber.split(","));
					var jump = []; //跳位分布
					var jump1 = (parseInt(number[2]) + parseInt(number[0])) % 10; //跳位合1
					var jump2 = (parseInt(number[3]) + parseInt(number[1])) % 10; //跳位合2
					var jump3 = (parseInt(number[4]) + parseInt(number[2])) % 10; //跳位合3
					jump[0] = jump1;
					jump[1] = jump2;
					jump[2] = jump3;
					jump = common.sortArr(jump);
					jump1 = jump[0];
					jump2 = jump[1];
					jump3 = jump[2];
					jump = common.sortArr(jump);
					jump = common.removeAgain(jump);
					var base = [jump, [jump1],
						[jump2],
						[jump3]
					];
					var color = ["lbg", "gbg", "rbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//跳位差值
				case "1105r5-trend_tiaoweiChaZhi":
				case "1205r5-trend_tiaoweiChaZhi":
					var number = common.sortArr(opennumber.split(","));
					var jump = []; //跳位分布
					var jump1 = (parseInt(number[2]) - parseInt(number[0])) % 10; //跳位差1
					var jump2 = (parseInt(number[3]) - parseInt(number[1])) % 10; //跳位差2
					var jump3 = (parseInt(number[4]) - parseInt(number[2])) % 10; //跳位差3
					jump[0] = jump1;
					jump[1] = jump2;
					jump[2] = jump3;
					jump = common.sortArr(jump);
					jump1 = jump[0];
					jump2 = jump[1];
					jump3 = jump[2];
					jump = common.sortArr(jump);
					jump = common.removeAgain(jump);
					var base = [jump, [jump1],
						[jump2],
						[jump3]
					];
					var color = ["lbg", "gbg", "rbg", "lbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//均衡分布
				case "1105r5-trend_junhengFenBu":
					var number = common.sortArr(opennumber.split(","));
					//记录开奖号码大小进行比对
					var big = 0; //大数
					var centre = 1; //中间数
					var small = 0; //小数
					var bigC = 0; //带有连号的大号
					var smallC = 0; //带有连号的小号
					var index = 0; //均衡质数
					var consecutive = 0; //连号规矩
					var rail = 0; //均衡规矩
					var position = []; //均衡位
					for (var i = 0; i < number.length; i++) {
						if (parseInt(number[i]) < 6) {
							small++;
						} else if (parseInt(number[i]) == 6) {
							centre = 0;
						} else {
							big++;
						}
						if (parseInt(number[i]) >= 6) {
							if (parseInt(number[i]) + 1 == parseInt(number[i + 1])) {
								bigC++;
							}
						}
						if (parseInt(number[i + 1]) <= 6) {
							if (parseInt(number[i + 1]) == parseInt(number[i]) + 1) {
								smallC++;
							}
						}
					};
					//均衡位
					var xb = [5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5];
					for (var i = 0; i < xb.length; i++) {
						if (i < 5) {
							if (xb[i] == small) {
								position.push(i);
							}
						}
						if (i == 5) {
							if (xb[i] == centre) {
								position.push(i);
							}
						}
						if (i > 5) {
							if (xb[i] == big) {
								position.push(i);
							}
						}
					}
					//均衡质数
					if (small > big) {
						index = 0;
					} else if (small < big) {
						index = 2;
					} else {
						index = 1;
					}
					//连号规矩
					if (smallC > bigC) {
						consecutive = 0;
					} else if (smallC < bigC) {
						consecutive = 2;
					} else {
						consecutive = 1;
					}
					//均衡规矩
					if (consecutive != index) {
						rail = 3;
					} else {
						rail = index;
					}
					var base = [
						[index],
						[rail],
						[consecutive],
						position
					];
					var color = ["gbg", "rbg", "lbg", "gbg"]
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差值个数
				case "1105r5-trend_chazhiGeShu":
				case "1205r5-trend_chazhiGeShu":
				case "ssca3-trend_chazhiGeShu":
				case "sscp3-trend_chazhiGeShu":
				case "3dr3-trend_chazhiGeShu":
				case "plsr3-trend_chazhiGeShu":
				case "sscs4-trend_chazhiGeShu":
					var number = common.sortArr(opennumber.split(","));
					var leng = 10;
					var differ = new Array();
					var color = ["gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg"];
					if (id.indexOf("1205r5") > -1) {
						leng = 11;
						color = ["gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg"];
					}
					//数组初始化
					for (var i = 0; i < leng; i++) {
						differ[i] = 0;
					}
					if (id.indexOf("1205r5") > -1 || id.indexOf("1105r5") > -1) {
						for (var i = number.length - 1; i > 0; i--) {
							for (var j = i - 1; j > -1; j--) {
								var xb = parseInt(number[i]) - parseInt(number[j]);
								differ[xb - 1]++;
							}
						}
					} else {
						for (var i = number.length - 1; i > 0; i--) {
							for (var j = i - 1; j > -1; j--) {
								var xb = parseInt(number[i]) - parseInt(number[j]);
								differ[xb]++;
							}
						}
					}
					for (var i = 0; i < differ.length; i++) {
						json[i] = {
							num: [differ[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//三码和值
				case "1105r5-trend_sanmaHeZhiA":
				case "1205r5-trend_sanmaHeZhiA":
					var number = common.sortArr(opennumber.split(","));
					var sum = new Array();
					for (var i = number.length - 1; i > 1; i--) {
						for (var j = i - 1; j > 0; j--) {
							for (var l = j - 1; l > -1; l--) {
								sum.push(parseInt(number[i]) + parseInt(number[j]) + parseInt(number[l]));
							}
						}
					}
					sum = common.removeAgain(sum);
					for (var i = 0; i < sum.length; i++) {
						json[i] = {
							num: sum,
							type: "td",
							classname: "gbg"
						}
					}
					break;
					//三码差合
				case "1105r5-trend_sanmaChaHe":
				case "1205r5-trend_sanmaChaHe":
					var number = common.sortArr(opennumber.split(","));
					var sum = new Array();
					for (var i = number.length - 1; i > 1; i--) {
						for (var j = i - 1; j > 0; j--) {
							for (var l = j - 1; l > -1; l--) {
								var differ1 = parseInt(number[i]) - parseInt(number[j]);
								var differ2 = parseInt(number[i]) - parseInt(number[l]);
								var differ3 = parseInt(number[j]) - parseInt(number[l]);
								sum.push(differ1 + differ2 + differ3);
							}
						}
					}
					var and = new Array();
					for (var i = 0; i < sum.length; i++) {
						and[i] = sum[i] % 10;
					}
					sum = common.removeAgain(sum);
					var color = ["lbg", "rbg", "gbg"];
					var base = [sum, common.removeAgain(and), common.getAgain(and)];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//012路分布  012路个数
				case "1105r5-trend_012luFenBu":
				case "1205r5-trend_012luFenBu":
				case "1205a3-trend_012luGeShu":
				case "1105a3-trend_012luGeShu":
					var number = common.sortArr(opennumber.split(","));
					var ls = ["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"];
					//0路
					var zero = [3, 6, 9, 12];
					var z_count = 0;
					//1路
					var one = [1, 4, 7, 10];
					var o_count = 0;
					//2路
					var two = [2, 5, 8, 11];
					var t_count = 0;
					var num = new Array();
					for (var i = 0; i < number.length; i++) {
						for (var j = 0; j < ls.length; j++) {
							if (number[i] == ls[j]) {
								num.push(number[i]);
								break;
							}
						}
						for (var k = 0; k < zero.length; k++) {
							if (parseInt(number[i]) == zero[k]) {
								z_count++;
							}
							if (parseInt(number[i]) == one[k]) {
								o_count++;
							}
							if (parseInt(number[i]) == two[k]) {
								t_count++;
							}
						}
					}
					var color = ["bball", "gbg", "rbg", "lbg"];
					var base = [num, [z_count],
						[o_count],
						[t_count]
					];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差值二分布
				case "1105r5-trend_chazhiErFenBu":
				case "1205r5-trend_chazhiErFenBu":
					var number = common.sortArr(opennumber.split(","));
					var differ = new Array();
					var count = 0;
					for (var i = number.length - 1; i > 0; i--) {
						for (var k = i - 1; k > -1; k--) {
							if (parseInt(number[i]) - parseInt(number[k]) == 2) {
								differ.push(number[k] + "-" + number[i]);
								count++;
							}
						}
					}
					var color = ["rbg", "gbg"];
					var base = [differ, [count]];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差值三分布
				case "1105r5-trend_chazhiSanFenBu":
				case "1205r5-trend_chazhiSanFenBu":
					var number = common.sortArr(opennumber.split(","));
					var differ = new Array();
					var count = 0;
					for (var i = number.length - 1; i > 0; i--) {
						for (var k = i - 1; k > -1; k--) {
							if (parseInt(number[i]) - parseInt(number[k]) == 3) {
								differ.push(number[k] + "-" + number[i]);
								count++;
							}
						}
					}
					var color = ["rbg", "gbg"];
					var base = [differ, [count]];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差值四分布
				case "1105r5-trend_chazhiSiFenBu":
				case "1205r5-trend_chazhiSiFenBu":
					var number = common.sortArr(opennumber.split(","));
					var differ = new Array();
					var count = 0;
					for (var i = number.length - 1; i > 0; i--) {
						for (var k = i - 1; k > -1; k--) {
							if (parseInt(number[i]) - parseInt(number[k]) == 4) {
								differ.push(number[k] + "-" + number[i]);
								count++;
							}
						}
					}
					var color = ["rbg", "gbg"];
					var base = [differ, [count]];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//差值五分布
				case "1105r5-trend_chazhiWuFenBu":
				case "1205r5-trend_chazhiWuFenBu":
					var number = common.sortArr(opennumber.split(","));
					var differ = new Array();
					var count = 0;
					for (var i = number.length - 1; i > 0; i--) {
						for (var k = i - 1; k > -1; k--) {
							if (parseInt(number[i]) - parseInt(number[k]) == 5) {
								differ.push(number[k] + "-" + number[i]);
								count++;
							}
						}
					}
					var color = ["rbg", "gbg"];
					var base = [differ, [count]];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//开奖位置分布
				case "1105r5-trend_kaijiangweizhiFenBu":
				case "1205r5-trend_kaijiangweizhiFenBu":
					var number = common.sortArr(opennumber.split(","));
					var color = ["gball", "rball", "bball", "rball", "gball"];
					var base = [number[0], number[1], number[2], number[3], number[4]];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "span",
							classname: color[i]
						}
					}
					break;
					//和值区间
				case "1105a3-trend_hezhiQuJian":
				case "1205a3-trend_hezhiQuJian":
					var number = common.sortArr(opennumber.split(","));
					var sum = 0; //和值
					for (var i = 0; i < number.length; i++) {
						sum += parseInt(number[i]);
					}
					var qj = [common.getIntNum(6, 10), common.getIntNum(11, 15), common.getIntNum(16, 20),
						common.getIntNum(
							21, 25), common.getIntNum(26, 30)
					]; //和值分布
					if (id.indexOf("1205a3") > -1) {
						qj = [common.getIntNum(6, 12), common.getIntNum(13, 19), common.getIntNum(20, 26),
							common.getIntNum(
								27, 33)
						]; //和值分布
					}
					var section = 0;
					for (var i = 0; i < qj.length; i++) {
						for (var j = 0; j < qj[i].length; j++) {
							if (qj[i][j] == sum) {
								section = i;
							}
						}
					}
					var xiao = [0, 1, 2, 3, 4];
					var shuang = [0, 2, 4, 6, 8];
					var he = [0, 4, 6, 8, 9];
					var size = 0;
					var oddEven = 0;
					var Quality = 0;
					for (var i = 0; i < xiao.length; i++) {
						if (xiao[i] == sum % 10) {
							size = 1;
						}
						if (shuang[i] == sum % 10) {
							oddEven = 1;
						}
						if (he[i] == sum % 10) {
							Quality = 1;
						}
					}
					var base = [sum, section, size, oddEven, Quality];
					var color = ["rbg", "gbg", "lbg", "gbg", "rbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "span",
							classname: color[i]
						}
					}
					break;
					//跨度走势
				case "1105a3-trend_kuaduZouShi":
				case "1205a3-trend_kuaduZouShi":
					var number = common.sortArr(opennumber.split(","));
					var sum = parseInt(number[number.length - 1]) - parseInt(number[0]);
					var xiao = [1, 2, 3, 4, 5];
					if (id.indexOf("1205a3") > -1) {
						xiao = [2, 3, 4, 5, 6];
					}
					var shuang = [2, 4, 6, 8, 10];
					var he = [4, 6, 8, 9, 10];
					var size = 0;
					var oddEven = 0;
					var Quality = 0;
					for (var i = 0; i < xiao.length; i++) {
						if (xiao[i] == sum % 10) {
							size = 1;
						}
						if (shuang[i] == sum % 10) {
							oddEven = 1;
						}
						if (he[i] == sum % 10) {
							Quality = 1;
						}
					}
					var base = [sum, size, oddEven, Quality];
					var color = ["rbg", "gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "span",
							classname: color[i]
						}
					}
					break;
					//属性走势
				case "1105a3-trend_shuxingZouShi":
				case "1205a3-trend_shuxingZouShi":
					var number = opennumber.split(",");
					var da = 6;
					if (id.indexOf("1205a3") > -1) {
						da = 7;
					}
					var dan = [1, 3, 5, 7, 9, 11];
					var zhi = [1, 2, 3, 5, 7, 11];
					var size = [];
					var oddEven = [];
					var Quality = [];
					//转换成相对应的大小单双质合的组合
					var count = ["0,0,0", "0,0,1", "0,1,0", "1,0,0", "1,1,1", "1,1,0", "1,0,1", "0,1,1"];
					for (var i = 0; i < number.length; i++) {
						if (da > parseInt(number[i])) {
							size[i] = 1;
						} else {
							size[i] = 0;
						}
						if (dan.indexOf(parseInt(number[i])) > -1) {
							oddEven[i] = 0;
						} else {
							oddEven[i] = 1;
						}
						if (zhi.indexOf(parseInt(number[i])) > -1) {
							Quality[i] = 0;
						} else {
							Quality[i] = 1;
						}
					}
					var daxiao = 0;
					var danshuang = 0;
					var zhihe = 0;
					for (var i = 0; i < count.length; i++) {
						//统计
						var c1 = 0,
							c2 = 0,
							c3 = 0;
						for (var j = 0; j < count[i].split(",").length; j++) {
							if (size[j] == parseInt(count[i].split(",")[j])) {
								c1++;
							}
							if (oddEven[j] == parseInt(count[i].split(",")[j])) {
								c2++;
							}
							if (Quality[j] == parseInt(count[i].split(",")[j])) {
								c3++;
							}
						}
						if (c1 == 3) {
							daxiao = i;
						}
						if (c2 == 3) {
							danshuang = i;
						}
						if (c3 == 3) {
							zhihe = i;
						}
					}
					var base = [daxiao, danshuang, zhihe];
					var color = ["gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//同位振幅
				case "1105a3-trend_tongweiZhenFu":
				case "1205a3-trend_tongweiZhenFu":
					var number = opennumber.split(",");
					//获取上一期号码
					var historynum = history[history.length - 2].split(",");
					var amplitude = [];
					for (var i = 0; i < number.length; i++) {
						var receive = 0;
						if (parseInt(historynum[i]) > parseInt(number[i])) {
							receive = parseInt(historynum[i]) - parseInt(number[i]);
						} else {
							receive = parseInt(number[i]) - parseInt(historynum[i]);
						}
						amplitude[i] = receive;
					}
					var color = ["gbg", "rbg", "lbg"];
					for (var i = 0; i < amplitude.length; i++) {
						json[i] = {
							num: [amplitude[i]],
							type: "span",
							classname: color[i]
						}
					}
					break;
					//形态走势
				case "1105a3-trend_xingtaiZouShi":
				case "1205a3-trend_xingtaiZouShi":
					var number = opennumber.split(",");
					//获取上一期号码 
					var historynum = common.cutOutNumber(history[history.length - 2], id.split("-")[0]).split(
						",");
					var aotu = 0;
					if (parseInt(number[0]) > parseInt(number[1]) && parseInt(number[1]) > parseInt(number[
							2])) {
						aotu = 1;
					} else if (parseInt(number[0]) < parseInt(number[1]) && parseInt(number[1]) < parseInt(
							number[2])) {
						aotu = 0;
					} else if (parseInt(number[0]) > parseInt(number[1]) && parseInt(number[1]) < parseInt(
							number[2])) {
						aotu = 2;
					} else if (parseInt(number[0]) < parseInt(number[1]) && parseInt(number[1]) > parseInt(
							number[2])) {
						aotu = 3;
					}
					var xiao = [0, 1, 2, 3, 4, 5];
					if (id.indexOf("1205a3") > -1) {
						xiao = [1, 2, 3, 4, 5, 6];
					}
					var dan = [1, 3, 5, 7, 9, 11];
					var zhi = [1, 2, 3, 5, 7, 11];
					var xiaoshu = 0;
					var danshu = 0;
					var zhishu = 0;
					for (var i = 0; i < number.length; i++) {
						if (xiao.indexOf(parseInt(number[i])) > -1) {
							xiaoshu++;
						}
						if (dan.indexOf(parseInt(number[i])) < 0) {
							danshu++;
						}
						if (zhi.indexOf(parseInt(number[i])) < 0) {
							zhishu++;
						}
					}
					var one = new Array();
					var two = new Array();
					var three = new Array();
					for (var j = 0; j < number.length; j++) {
						if (parseInt(number[j]) == parseInt(historynum[0]) - 1) {
							one.push(0);
						} else if (parseInt(number[j]) == parseInt(historynum[0]) + 1) {
							one.push(2);
						}
						if (parseInt(number[j]) == parseInt(historynum[1]) - 1) {
							two.push(0);
						} else if (parseInt(number[j]) == parseInt(historynum[1]) + 1) {
							two.push(2);
						}
						if (parseInt(number[j]) == parseInt(historynum[2]) - 1) {
							three.push(0);
						} else if (parseInt(number[j]) == parseInt(historynum[2]) + 1) {
							three.push(2);
						}
					}
					if (one.length == 0) {
						one.push(1);
					}
					if (two.length == 0) {
						two.push(1);
					}
					if (three.length == 0) {
						three.push(1);
					}
					var jump = [];
					//上一期号码计算重码
					var again = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						jump[i] = history[history.length - 3].split(",")[i];
						again[i] = history[history.length - 2].split(",")[i];
					}
					var num = common.sortArr(opennumber.split(","));
					//连号 传号 重码 跳码
					var lian = "",
						chuan = "",
						chong = "",
						tiao = "";
					if (parseInt(num[1]) - 1 == parseInt(num[0]) || parseInt(num[2]) - 1 == parseInt(num[1])) {
						lian = language(common.cookieGet("language"), "conditions_lianhao");
					}
					//记录有无连传重跳
					var t_count = 0;
					var c_count = 0;
					var y_count = 0;
					for (var i = 0; i < num.length; i++) {
						var o = 0;
						for (var p = 0; p < again.length; p++) {
							if (parseInt(num[i]) == parseInt(again[p]) + 1 || parseInt(num[i]) == parseInt(
									again[p]) - 1) {
								t_count++;
							}
							if (parseInt(num[i]) == parseInt(again[p])) {
								c_count++;
							}
							if (parseInt(num[i]) == parseInt(again[p])) {
								o++;
							}
						}
						if (o == 0) {
							for (var k = 0; k < jump.length; k++) {
								if (parseInt(num[i]) == parseInt(jump[k])) {
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
					var base = [
						[aotu],
						[xiaoshu],
						[danshu],
						[zhishu], one, two, three, [lian, chuan, tiao, chong]
					];
					var color = ["rbg", "gbg", "rbg", "lbg", "rbg", "gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//两码合走势
				case "1105a3-trend_liangmaHeZouShiB":
				case "1205a3-trend_liangmaHeZouShiB":
					var number = opennumber.split(",");
					var yier = (parseInt(number[0]) + parseInt(number[1])) % 10;
					var yisan = (parseInt(number[0]) + parseInt(number[2])) % 10;
					var ersan = (parseInt(number[1]) + parseInt(number[2])) % 10;
					var sum = [yier, yisan, ersan];
					sum = common.removeAgain(sum);
					var base = [sum, [yier],
						[yisan],
						[ersan]
					];
					var color = ["lbg", "gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//两码差走势
				case "1105a3-trend_liangmaChaZouShi":
				case "1205a3-trend_liangmaChaZouShi":
					var number = opennumber.split(",");
					var yier = "";
					var yisan = parseInt(number[2]) - parseInt(number[0]);
					var ersan = parseInt(number[2]) - parseInt(number[1]);
					if (parseInt(number[1]) > parseInt(number[0])) {
						yier = parseInt(number[1]) - parseInt(number[0]);
					} else {
						yier = parseInt(number[0]) - parseInt(number[1]);
					}
					if (parseInt(number[2]) > parseInt(number[0])) {
						yisan = parseInt(number[2]) - parseInt(number[0]);
					} else {
						yisan = parseInt(number[0]) - parseInt(number[2]);
					}
					if (parseInt(number[2]) > parseInt(number[1])) {
						ersan = parseInt(number[2]) - parseInt(number[1]);
					} else {
						ersan = parseInt(number[1]) - parseInt(number[2]);
					}
					var sum = [yier, yisan, ersan];
					sum = common.removeAgain(sum);
					var base = [sum, [yier],
						[yisan],
						[ersan]
					];
					var color = ["lbg", "gbg", "rbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//龙头凤尾
				case "ssca2-trend_longtouFengWei":
				case "sscp2-trend_longtouFengWei":
				case "ssca3-trend_longtouFengWei":
				case "sscp3-trend_longtouFengWei":
				case "plsr3-trend_longtouFengWei":
				case "3dr3-trend_longtouFengWei":
				case "sscs4-trend_longtouFengWei":
					var number = opennumber.split(",");
					var lt = [language(common.cookieGet("language"), "conditions_shuang"), language(common
						.cookieGet(
							"language"),
						"conditions_he"), language(common.cookieGet("language"), "conditions_da")];
					var fw = [language(common.cookieGet("language"), "conditions_shuang"), language(common
						.cookieGet(
							"language"),
						"conditions_he"), language(common.cookieGet("language"), "conditions_da")];
					var l012 = 0;
					var f012 = 0;
					var xiao = [0, 1, 2, 3, 4];
					var dan = [1, 3, 5, 7, 9];
					var zhi = [1, 2, 3, 5, 7];
					for (var i = 0; i < xiao.length; i++) {
						//龙头
						if (parseInt(number[0]) == dan[i]) {
							lt[0] = language(common.cookieGet("language"), "conditions_dan");
						}
						if (parseInt(number[0]) == zhi[i]) {
							lt[1] = language(common.cookieGet("language"), "conditions_zhi");
						}
						if (parseInt(number[0]) == xiao[i]) {
							lt[2] = language(common.cookieGet("language"), "conditions_xiao");
						}
						//凤尾
						if (parseInt(number[number.length - 1]) == dan[i]) {
							fw[0] = language(common.cookieGet("language"), "conditions_dan");
						}
						if (parseInt(number[number.length - 1]) == zhi[i]) {
							fw[1] = language(common.cookieGet("language"), "conditions_zhi");
						}
						if (parseInt(number[number.length - 1]) == xiao[i]) {
							fw[2] = language(common.cookieGet("language"), "conditions_xiao");
						}
					}
					//龙头012
					l012 = parseInt(number[0]) % 3;
					//凤尾012
					f012 = parseInt(number[number.length - 1]) % 3;
					var base = [lt, fw,
						[l012],
						[f012]
					];
					var color = ["gbg", "lbg", "gbg", "rbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//012路走势
				case "ssca2-trend_012luZouShi":
				case "sscp2-trend_012luZouShi":
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
					//位置
					var one = number[0] % 3;
					var two = number[1] % 3;
					var base = [fb, [ll],
						[yl],
						[el],
						[one],
						[two]
					];
					var color = ["bball_s", "gbg", "rbg", "lbg", "rbg", "gbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//012路走势
				case "ssca3-trend_012luZouShi":
				case "sscp3-trend_012luZouShi":
				case "plsr3-trend_012luZouShi":
				case "3dr3-trend_012luZouShi":
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
					//位置
					var one = number[0] % 3;
					var two = number[1] % 3;
					var three = number[2] % 3;
					var base = [fb, [ll],
						[yl],
						[el],
						[one],
						[two],
						[three]
					];
					var color = ["bball_s", "gbg", "rbg", "lbg", "rbg", "gbg", "lbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//均值走势
				case "ssca3-trend_junzhizoushi":
				case "sscp3-trend_junzhizoushi":
				case "plsr3-trend_junzhizoushi":
				case "3dr3-trend_junzhizoushi":
					var number = opennumber.split(",");
					var mean = 0; //均值
					for (var i = 0; i < number.length; i++) {
						mean += parseInt(number[i]);
					}
					mean = Math.round(mean / 3);
					var sx = [];
					if (mean < 5) {
						sx[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						sx[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (mean % 2 == 0) {
						sx[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						sx[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					var z = "12357"
					if (z.indexOf(mean) > -1) {
						sx[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						sx[2] = language(common.cookieGet("language"), "conditions_he");
					}
					var base = [
						[mean], sx
					];
					var color = ["rbg", "gbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//和振走势
				case "ssca3-trend_hezhenzoushi":
				case "sscp3-trend_hezhenzoushi":
				case "plsr3-trend_hezhenzoushi":
				case "3dr3-trend_hezhenzoushi":
					var number = opennumber.split(",");
					//获取上一期号码
					var historynum = common.cutOutNumber(history[history.length - 2], id.split("-")[0]).split(
						",");
					var sum = 0;
					var historysum = 0;
					for (var i = 0; i < number.length; i++) {
						sum += parseInt(number[i]);
						historysum += parseInt(historynum[i]);
					}
					var shake = 0;
					if (sum > historysum) {
						shake = sum - historysum;
					} else {
						shake = historysum - sum;
					}
					var sx = [];
					if (shake < 14) {
						sx[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						sx[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (shake % 2 == 0) {
						sx[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						sx[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					var z = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27]
					if (z.indexOf(shake) > -1) {
						sx[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						sx[2] = language(common.cookieGet("language"), "conditions_he");
					}
					var base = [
						[shake], sx
					];
					var color = ["rbg", "gbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//定位分布
				case "ssca3-trend_dingweifenbu":
				case "sscp3-trend_dingweifenbu":
				case "plsr3-trend_dingweifenbu":
				case "3dr3-trend_dingweifenbu":
					var number = opennumber.split(",");
					//获取三个位置遗漏值
					var yl1 = new Array(10);
					var yl2 = new Array(10);
					var yl3 = new Array(10);
					for (var j = 0; j < yl1.length; j++) {
						if (yl1[j] == null) {
							yl1[j] = 0;
							yl2[j] = 0;
							yl3[j] = 0;
						}
						for (var i = 0; i < history.length - 1; i++) {
							//获取上一期号码
							var historynum = common.cutOutNumber(history[i], id.split("-")[0]).split(",");
							if (j != historynum[0]) {
								yl1[j]++;
							} else {
								yl1[j] = 0;
							}
							if (j != historynum[1]) {
								yl2[j]++;
							} else {
								yl2[j] = 0;
							}
							if (j != historynum[2]) {
								yl3[j]++;
							} else {
								yl3[j] = 0;
							}
						}
					}
					var minimum = yl1[number[0]] % 10; //第一位
					var middle = yl2[number[1]] % 10; //第二位
					var maximum = yl3[number[2]] % 10; //第三位
					var minimumAttr = [];
					var middleAttr = [];
					var maximumAttr = [];
					var z = "12357";
					//第一位属性
					if (minimum < 5) {
						minimumAttr[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						minimumAttr[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (minimum % 2 == 0) {
						minimumAttr[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						minimumAttr[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					if (z.indexOf(minimum) > -1) {
						minimumAttr[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						minimumAttr[2] = language(common.cookieGet("language"), "conditions_he");
					}
					//第二位属性
					if (middle < 5) {
						middleAttr[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						middleAttr[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (middle % 2 == 0) {
						middleAttr[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						middleAttr[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					if (z.indexOf(middle) > -1) {
						middleAttr[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						middleAttr[2] = language(common.cookieGet("language"), "conditions_he");
					}
					//第三位属性
					if (maximum < 5) {
						maximumAttr[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						maximumAttr[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (maximum % 2 == 0) {
						maximumAttr[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						maximumAttr[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					if (z.indexOf(maximum) > -1) {
						maximumAttr[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						maximumAttr[2] = language(common.cookieGet("language"), "conditions_he");
					}
					var base = [
						[minimum],
						[middle],
						[maximum], minimumAttr, middleAttr, maximumAttr
					];
					var color = ["rball_s", "bball_s", "gball_s", "rbg", "lbg", "gbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//排列走势
				case "ssca3-trend_pailiezoushi":
				case "sscp3-trend_pailiezoushi":
				case "plsr3-trend_pailiezoushi":
				case "3dr3-trend_pailiezoushi":
					var number = common.sortArr(opennumber.split(","));
					var minimum = number[0]; //最小数
					var middle = number[1]; //中间数
					var maximum = number[2]; //最大数
					var minimumAttr = [];
					var middleAttr = [];
					var maximumAttr = [];
					var z = "12357";
					//最小数属性
					if (minimum < 5) {
						minimumAttr[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						minimumAttr[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (minimum % 2 == 0) {
						minimumAttr[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						minimumAttr[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					if (z.indexOf(minimum) > -1) {
						minimumAttr[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						minimumAttr[2] = language(common.cookieGet("language"), "conditions_he");
					}
					//中间数属性
					if (middle < 5) {
						middleAttr[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						middleAttr[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (middle % 2 == 0) {
						middleAttr[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						middleAttr[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					if (z.indexOf(middle) > -1) {
						middleAttr[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						middleAttr[2] = language(common.cookieGet("language"), "conditions_he");
					}
					//最大数属性
					if (maximum < 5) {
						maximumAttr[0] = language(common.cookieGet("language"), "conditions_xiao");
					} else {
						maximumAttr[0] = language(common.cookieGet("language"), "conditions_da");
					}
					if (maximum % 2 == 0) {
						maximumAttr[1] = language(common.cookieGet("language"), "conditions_shuang");
					} else {
						maximumAttr[1] = language(common.cookieGet("language"), "conditions_dan");
					}
					if (z.indexOf(maximum) > -1) {
						maximumAttr[2] = language(common.cookieGet("language"), "conditions_zhi");
					} else {
						maximumAttr[2] = language(common.cookieGet("language"), "conditions_he");
					}
					var base = [
						[minimum],
						[middle],
						[maximum], minimumAttr, middleAttr, maximumAttr
					];
					var color = ["rball_s", "bball_s", "gball_s", "rbg", "lbg", "gbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//立体走势
				case "ssca3-trend_litiZouShi":
				case "sscp3-trend_litiZouShi":
				case "plsr3-trend_litiZouShi":
				case "3dr3-trend_litiZouShi":
					var number = opennumber.split(",");
					var sum = 0;
					for (var i = 0; i < number.length; i++) {
						sum += parseInt(number[i]);
					}
					var base = [number[0], number[1], number[2], sum];
					var color = ["bball_s", "gball_s", "rball_s", "rbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: [base[i]],
							type: "td",
							classname: color[i]
						}
					}
					break;
					//立体走势
				case "ssca2-trend_litiZouShi":
				case "sscp2-trend_litiZouShi":
					var number = opennumber.split(",");
					var historynum = common.cutOutNumber(history[history.length - 2], id.split("-")[0]).split(
						",");
					var sum = 0;
					var count = 0;
					for (var i = 0; i < number.length; i++) {
						sum += parseInt(number[i]);
						for (var j = 0; j < historynum.length; j++) {
							if (number[i] == historynum[j]) {
								count++;
							}
						}
					}
					var lh = "";
					var cm = "";
					if (parseInt(number[0]) + 1 == parseInt(number[1]) || parseInt(number[0]) - 1 == parseInt(
							number[1])) {
						lh = language(common.cookieGet("language"), "conditions_lianhao");
					}
					if (count > 0) {
						cm = language(common.cookieGet("language"), "conditions_chongma");
					}
					var base = [
						[number[0]],
						[number[1]],
						[lh, cm],
						[sum]
					];
					var color = ["bball_s", "gball_s", "lbg", "rbg"];
					for (var i = 0; i < base.length; i++) {
						json[i] = {
							num: base[i],
							type: "td",
							classname: color[i]
						}
					}
					break;
				default:
					break;
			}

			return json;
		},
		//处理特殊球颜色
		ball: function(id, number, num, colorall) {
			switch (id) {
				case "1105r5-trend_pingmianZouShi":
				case "1105r4-trend_pingmianZouShi":
				case "1105r3-trend_pingmianZouShi":
				case "1105p2-trend_pingmianZouShi":
				case "1105a3-trend_pingmianZouShi":
				case "1105a2-trend_pingmianZouShi":
				case "1105a3-trend_jibenZouShi":
				case "1105a2-trend_jibenZouShi":
					var color = colorall;
					if (parseInt(number) == 6 && id.indexOf("trend_jibenZouShi") < 0) {
						color = "rball";
					}
					return color;
				case "ssca2-trend_pingmianZouShi":
				case "ssca3-trend_pingmianZouShi":
				case "sscp2-trend_pingmianZouShi":
				case "sscp3-trend_pingmianZouShi":
				case "plsr3-trend_pingmianZouShi":
				case "sscs4-trend_pingmianZouShi":
				case "sscs4-trend_jibenZouShi":
				case "sscs4-trend_012luGeShu":
					var count = 0;
					for (var i = 0; i < num.length; i++) {
						if (num[i] == number) {
							++count;
						}
					}
					if (count >= 2) {
						return "rball_s";
					}
					break;
				case "3dr3-trend_pingmianZouShi":
				case "k3r3-trend_pingmianZouShi":
				case "ssca2-trend_jibenZouShi":
				case "ssca3-trend_jibenZouShi":
				case "sscp2-trend_jibenZouShi":
				case "sscp3-trend_jibenZouShi":
				case "k3r3-trend_jibenZouShi":
					var count = 0;
					for (var i = 0; i < num.length; i++) {
						if (num[i] == number) {
							++count;
						}
					}
					if (count == 2) {
						return "rball_s";
					} else if (count == 3) {
						return "zball_s";
					}
					break;
				default:
					break;
			}
		},
		//判断当前开奖号码类型
		type: function(num) {
			var count = 0;
			for (var i = 0; i < num.length - 1; i++) {
				for (var j = i + 1; j < num.length; j++) {
					if (num[i] == num[j]) {
						count++;
					}
				}
			}
			var color = "lbg";
			if (count == 2) {
				color = "rbg";
			} else if (count > 2) {
				color = "zbg";
			}
			return color;
		},
	};
}();