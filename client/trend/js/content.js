var content = function() {
	return {
		/*打印中心内容*/
		server: function(data) {
			var obj = JSON.parse(common.cookieGet("obj"));
			var omit = new Array(80); //
			var appeardTimes = []; // 出现次数
			var maxSuccessive = []; // 最大连续
			var maxOmission = []; // 最大遗漏
			var flag_omit = []; //统计最大遗漏
			var flag_appeard = []; // 统计出现次数
			var max = 0; //记录多少列
			if (obj.chart_id == "smhgsA") {
				omit = new Array(160);
			}
			for (var i = 0; i < omit.length; i++) {
				omit[i] = 0;
				appeardTimes[i] = 0;
				maxSuccessive[i] = 0;
				maxOmission[i] = 0;
				flag_omit[i] = 0;
				flag_appeard[i] = 0;
			}
			var rows = 0;
			var hisnumber = [];
			var id = obj.play_id + "-" + obj.chart_id;
			var list;
			if (common.isNull(obj.dm)) {
				list = style.bottom(obj.play_id, obj.chart_id, obj.dis, "dm");
				id = obj.play_id + "-" + obj.chart_id + "-dm";
			} else {
				list = style.bottom(obj.play_id, obj.chart_id, obj.dis);
			}
			if (obj.chart_id == "dwfb") {
				rows += 200;
			}
			if (obj.chart_id == "lhcm" || obj.chart_id == "hzhenzs") {
				rows += 1;
			}
			if (common.isNull(obj.dis)) {
				id += "-" + obj.dis
			}
			var html = '';
			var number = '';
			var index = 0;
			for (var i = data.length - 1; i > -1; i--) {
				if (index >= rows) {
					var count = 0;
					expect = common.cutOut(data[i].expect, data[i].expect.length - 3, data[i].expect.length);
					number += '<tr>'
					number += '<td class="qh">' + expect + '</td>'
					if (obj.play_id == "ssq") {
						number += '<td class="kjhm">'
						for (var j = 0; j < data[i].opennumber.split(",").length; j++) {
							if (j == data[i].opennumber.split(",").length - 1) {
								number += '<span style="color:#000"> | </span>';
								number += '<span style="color:#0d90ff">' + data[i].opennumber.split(",")[j] + '</span>';
							} else {
								if (j == data[i].opennumber.split(",").length - 2) {
									number += '<span>' + data[i].opennumber.split(",")[j] + '</span>'
								} else {
									number += '<span>' + data[i].opennumber.split(",")[j] + ',</span>'
								}
							}
						}
						number += '</td>';
					} else if (obj.play_id == "dlt") {
						number += '<td class="kjhm">'
						for (var j = 0; j < data[i].opennumber.split(",").length; j++) {
							if (j == data[i].opennumber.split(",").length - 2) {
								number += '<span style="color:#000"> | </span>';
								number += '<span style="color:#0d90ff">' + data[i].opennumber.split(",")[j] + ',</span>';
							} else if (j == data[i].opennumber.split(",").length - 1) {
								number += '<span style="color:#0d90ff">' + data[i].opennumber.split(",")[j] + '</span>';
							} else {
								if (j == data[i].opennumber.split(",").length - 3) {
									number += '<span>' + data[i].opennumber.split(",")[j] + '</span>'
								} else {
									number += '<span>' + data[i].opennumber.split(",")[j] + ',</span>'
								}
							}
						}
						number += '</td>';
					} else {
						if (common.isNull(obj.dm) || common.isNull(obj.code_id)) {
							number += '<td class="kjhm">' + data[i].openNumber + '</td>'
						} else {
							number += '<td class="kjhm">' + data[i].opennumber + '</td>'
						}
					}
					number += '</tr>';
					var json;
					if (common.isNull(obj.code_id)) {
						hisnumber[index] = data[i][common.cookieGet("code_id")];
						json = this.calculate(data[i][common.cookieGet("code_id")], hisnumber, id)
					} else if (common.isNull(obj.dm)) {
						hisnumber[index] = data[i].result;
						json = this.calculate(data[i].result, hisnumber, id)
					} else {
						hisnumber[index] = data[i].opennumber;
						if (common.isNull(obj.dis) && obj.chart_id == "pmzs" && obj.dis == "qq") {
							list = style.specialBottom(obj.play_id, obj.chart_id, obj.dis);
						}
						json = this.calculate(data[i].opennumber, hisnumber, id);
					}
					html += "<tr>"
					max = 0;
					for (var j = 0; j < list.data.length; j++) {
						if (list.data[j].length == 0) {
							count++;
							max++;
							html += '<td class="incrMark ' + json[j].classname + '">' + json[j].data[0] + '</td>'
						} else {
							var index1 = 0;
							for (var p = 0; p < list.data[j].length; p++) {
								var flag = null;
								var classname = null;
								if (json[j].data.length == 0) {
									flag = null;
								} else {
									for (var k = 0; k < json[j].data.length; k++) {
										if (obj.chart_id == "jzzs" || obj.chart_id == "hzhenzs" || obj.chart_id == "plzs" || obj.chart_id == "dwfb") { //均值 需要单独处理
											if (json[j].data.length == 1) {
												if (list.val[j][p] == json[j].data[index1]) {
													flag = list.data[j][p];
													classname = json[j].classname[index1];
													index1++;
													break;
												}
											} else {
												if (list.val[j][p] == json[j].data[index1]) {
													flag = list.data[j][p];
													classname = json[j].classname[index1];
													index1++;
													break;
												} else {
													index1++;
													flag = null;
													break;
												}
											}
										} else if (obj.chart_id == "ltfw") { //龙头凤尾 需要单独处理
											if (list.val[j][p] == json[j].data[index1]) {
												flag = list.data[j][p];
												classname = json[j].classname[index1];
												index1++;
												break;
											} else {
												index1++;
												flag = null;
												break;
											}
										} else if (obj.chart_id == "ckzs" || obj.chart_id == "012lzs" || obj.chart_id == "012ldw") { //差值跨度需要单独处理
											if (list.data[j][p] == json[j].data[k]) {
												flag = list.data[j][p];
												classname = json[j].classname[k];
												break;
											}
										} else {
											if (list.val[j][p] == json[j].data[k]) {
												flag = list.data[j][p];
												classname = json[j].classname[k];
												break;
											}
										}
									}
								}
								if (flag != null) {
									appeardTimes[count]++; //出现则加一
									maxOmission[count] = 0; //最大遗漏
									maxSuccessive[count]++;
									omit[count] = 0;
									if (json[j].type == "span") {
										if (json[j].line == 0) {
											if (obj.chart_id == "012lzs") { //如果是012路走势时需要添加class
												if (common.isNull(obj.dm)) {
													if ((flag == 12 || flag == 10)) {
														html += '<td class="incrMark rbline1"><span class="incrMark ' + classname + '">' + flag +
															'</span></td>'
													} else {
														html += '<td class="incrMark"><span class="incrMark ' + classname + '">' + flag + '</span></td>'
													}
												} else {
													if ((flag == 9 || flag == 7)) {
														html += '<td class="incrMark rbline1"><span class="incrMark ' + classname + '">' + flag +
															'</span></td>'
													} else {
														html += '<td class="incrMark"><span class="incrMark ' + classname + '">' + flag + '</span></td>'
													}
												}
											} else {
												html += '<td class="incrMark"><span class="incrMark ' + classname + '">' + flag + '</span></td>'
											}
										} else {
											html += '<td class="lineMark "><span class="' + classname + '">' + flag + '</span></td>'
										}
									} else {
										if (json[j].line == 0) {
											html += '<td class="incrMark ' + classname + '">' + flag + '</td>'
										} else {
											if (obj.chart_id == "hzzs") {
												html += '<td class="lineMark ' + classname + ' stableColorMark">' + flag + '</td>'
											} else {
												html += '<td class="lineMark ' + classname + '">' + flag + '</td>'
											}
										}
									}
								} else {
									++maxOmission[count]; //最大遗漏
									maxSuccessive[count] = 0; //最大连出
									if (obj.chart_id == "012lzs" && list.data[j].length > 8) {
										if (common.isNull(obj.dm)) {
											if ((p == 3 || p == 7)) {
												html += '<td class="incrMark rbline1">' + ++omit[count] + '</td>';
											} else {
												html += '<td class="incrMark ">' + ++omit[count] + '</td>';
											}
										} else {
											if ((p == 3 || p == 6)) {
												html += '<td class="incrMark rbline1">' + ++omit[count] + '</td>';
											} else {
												html += '<td class="incrMark ">' + ++omit[count] + '</td>';
											}
										}
									} else {
										html += '<td class="incrMark ">' + ++omit[count] + '</td>';
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
								max++;
							}
						}
					}
					html += "</tr>"
				} else {
					if (common.isNull(obj.code_id)) {
						hisnumber[index] = data[i][common.cookieGet("code_id")];
					} else if (common.isNull(obj.dm)) {
						hisnumber[index] = data[i].result;
					} else {
						hisnumber[index] = data[i].opennumber;
					}
				}
				index++;
			}
			var arise1 = '';
			var continuous1 = '';
			var omit1 = '';
			for (var i = 0; i < max; i++) {
				arise1 += '<td>' + appeardTimes[i] + '</td>';
				continuous1 += '<td>' + flag_appeard[i] + '</td>';
				omit1 += '<td>' + flag_omit[i] + '</td>';
			}
			$("#cxcs").html(arise1);
			$("#tjlc").html(continuous1);
			$("#tjyl").html(omit1);
			$("#content").html(html)
			$("#opennumber").html(number);
		},
		/*算法*/
		calculate: function(opennumber, hisnumber, id) {
			var json = [];
			var type = []; //返回类型 td span
			var calssname = []; //返回对应颜色值
			var data = []; //返回数据
			var line = []; //返回是否有线
			switch (id) {
				/*************平面走势********************/
				
				case "3dr3-pmzs":
				case "plsr3-pmzs":
				case "hasha3-pmzs":
				case "plwr5-pmzs":
					var num = [];
					var all = 0;
					var ball = [];
					var ballcolor = [];
					var xs = common.getIntNum(0, 4)
					var os = common.getPairNum(0, 9);
					var hs = common.gethsNum(0, 9);
					var little = 0; //小数
					var pair = 0; //偶数
					var he = 0; //合数
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					ball = common.removeAgain(num);
					for (var i = 0; i < ball.length; i++) {
						ballcolor[i] = this.ball('pmzs', ball[i], num);
					}
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
					data = [
						[this.group(num)], ball, [pair],
						[he],
						[little],
						[all]
					];
					type = ["td", "span", "td", "td", "td", "td"];
					line = [0, 0, 1, 1, 1, 0];
					calssname = [
						[this.groupClass(num)], ballcolor, ["gbg"],
						["rbg"],
						["lbg"],
						["rbg"]
					];
					if (id.indexOf("plwr5") > -1) {
						data = [
							ball, [pair],
							[he],
							[little],
							[all]
						];
						type = ["span", "td", "td", "td", "td"];
						line = [0, 1, 1, 1, 0];
						calssname = [
							ballcolor, ["gbg"],
							["rbg"],
							["lbg"],
							["rbg"]
						];
					}
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
				case "animalsa2-pmzs":
				case "animalsq2-pmzs":
					var num = [];
					var all = 0;
					var ball = [];
					var ballcolor = [];
					var xs = common.getIntNum(0, 4)
					var os = common.getPairNum(0, 9);
					var hs = common.gethsNum(0, 9);
					var little = 0; //小数
					var pair = 0; //偶数
					var he = 0; //合数
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					ball = common.removeAgain(num);
					for (var i = 0; i < ball.length; i++) {
						ballcolor[i] = this.ball('pmzs', ball[i], num);
					}
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
					data = [
						ball, [pair],
						[he],
						[little],
						[all]
					];
					type = ["span", "td", "td", "td", "td"];
					line = [0, 1, 1, 1, 0];
					calssname = [
						 ballcolor, ["gbg"],
						["rbg"],
						["lbg"],
						["rbg"]
					];
					
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************立体走势********************/
				case '3dr3-ltzs':
				case 'plsr3-ltzs':
				case 'hasha3-ltzs':
				case 'plwr5-ltzs':
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
					}
					data = [
						[num[0]],
						[num[1]],
						[num[2]],
					];
					type = ["span", "span", "span"];
					line = [1, 1, 1];
					calssname = [
						["bball1"],
						["gball1"],
						["rball1"],
					];
					if (id.indexOf("plwr5") > -1) {
						data = [
							[num[0]],
							[num[1]],
							[num[2]],
							[num[3]],
							[num[4]]
						];
						type = ["span", "span", "span", "span", "span"];
						line = [1, 1, 1, 1, 1];
						calssname = [
							["bball1"],
							["gball1"],
							["rball1"],
							["bball1"],
							["gball1"]
						];
					}
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************和合走势********************/
				case '3dr3-hhzs':
				case 'plsr3-hhzs':
				case 'hasha3-hhzs':
				case 'plwr5-hhzs':
					var all = 0;
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = opennumber.split(",")[i];
						all += parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					var flag = 0;
					var he = [common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)];
					if (obj.play_id == "plwr5") {
						he = [common.getIntNum(0, 14), common.getIntNum(15, 30), common.getIntNum(31, 45)];

					}
					for (var i = 0; i < he.length; i++) {
						for (var j = 0; j < he[i].length; j++) {
							if (he[i][j] == all) {
								flag = i;
								break;
							}
						}
					}
					data = [
						[flag],
						[all % 10],
					];
					type = ["td", "td"];
					line = [1, 1];
					calssname = [
						["gbg"],
						["lbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************和值走势********************/
				case '3dr3-hzzs':
				case 'plsr3-hzzs':
				case 'hasha3-hzzs':
				case 'plwr5-hzzs':
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var he = [common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)];
					if (obj.play_id == "plwr5") {
						he = [common.getIntNum(0, 14), common.getIntNum(15, 30), common.getIntNum(31, 45)];

					}
					var flag = 0;
					for (var i = 0; i < he.length; i++) {
						for (var j = 0; j < he[i].length; j++) {
							if (he[i][j] == all) {
								flag = i;
								break;
							}
						}
					}
					data = [
						[all],
					];

					for (var i = 0; i < he.length; i++) {
						if (flag == i) {
							data.push([all]);
						} else {
							data.push([]);
						}
					}
					type = ["td", "td", "td", "td"];
					line = [0, 1, 1, 1];
					calssname = [
						["rbg"],
						["gbg"],
						["lbg"],
						["gbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************差跨走势********************/
				case '3dr3-ckzs':
				case 'plsr3-ckzs':
				case 'hasha3-ckzs':
				case 'plwr5-ckzs':
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					var flag = []; //获取所有差值
					for (var i = num.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							flag.push(num[i] - num[j]);
						}
					}
					var span = num[num.length - 1] - num[0];
					var diff = common.removeAgain(flag); //差值
					var sameDiff = common.getAgain(flag); //同差
					data = [
						diff,
						sameDiff,
						[span],
					];
					type = ["td", "td", "td"];
					line = [0, 0, 1];
					calssname = [
						common.getCondition("gbg", diff.length),
						common.getCondition("rbg", diff.length),
						["lbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************差值个数********************/
				case '3dr3-czgs':
				case 'plsr3-czgs':
				case 'hasha3-czgs':
				case 'plwr5-czgs':
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					var flag = []; //获取所有差值
					for (var i = num.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							flag.push(num[i] - num[j]);
						}
					}
					flag = common.sortArr(flag);
					var diff = [];
					for (var i = 0; i < 10; i++) {
						diff[i] = 0;
						for (var j = 0; j < flag.length; j++) {
							if (i == flag[j]) {
								diff[i]++;
							}
						}
					}
					type = common.getCondition("td", diff.length);
					line = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
					calssname = [
						["gbg"],
						["rbg"],
						["lbg"],
						["gbg"],
						["rbg"],
						["lbg"],
						["gbg"],
						["rbg"],
						["lbg"],
						["gbg"],
					];
					for (var i = 0; i < diff.length; i++) {
						json[i] = {
							data: [diff[i]],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************龙头凤尾********************/
				case '3dr3-ltfw':
				case 'plsr3-ltfw':
				case 'hasha3-ltfw':
				case 'plwr5-ltfw':
					var head, head_ds, head_dx, head_zx, head_012 = [];
					var end, end_ds, end_dx, end_zx, end_012 = [];
					var lt = [],
						fw = [];
					head = parseInt(opennumber.split(",")[0]);
					end = parseInt(opennumber.split(",")[opennumber.split(",").length - 1]);
					var xs = common.getIntNum(0, 4);
					var os = common.getPairNum(0, 9);
					var hs = common.gethsNum(0, 9);
					//龙头单双
					if (os.indexOf(head) > -1) {
						head_ds = 1;
						lt[0] = -1;
						lt[1] = 1;
					} else {
						head_ds = 0;
						lt[0] = 0;
						lt[1] = -1;
					}
					//龙头质合
					if (hs.indexOf(head) > -1) {
						head_zx = 1;
						lt[2] = -1;
						lt[3] = 1;
					} else {
						head_zx = 0;
						lt[2] = 0;
						lt[3] = -1;
					}
					//龙头大小
					if (xs.indexOf(head) > -1) {
						head_dx = 1;
						lt[4] = -1;
						lt[5] = 1;
					} else {
						head_dx = 0;
						lt[4] = 0;
						lt[5] = -1;
					}
					//凤尾单双
					if (os.indexOf(end) > -1) {
						end_ds = 1;
						fw[0] = -1;
						fw[1] = 1;
					} else {
						end_ds = 0;
						fw[0] = 0;
						fw[1] = -1;
					}
					//凤尾质合
					if (hs.indexOf(end) > -1) {
						end_zx = 1;
						fw[2] = -1;
						fw[3] = 1;
					} else {
						end_zx = 0;
						fw[2] = 0;
						fw[3] = -1;
					}
					//凤尾大小
					if (xs.indexOf(end) > -1) {
						end_dx = 1;
						fw[4] = -1;
						fw[5] = 1;
					} else {
						end_dx = 0;
						fw[4] = 0;
						fw[5] = -1;
					}
					for (var i = 0; i < 3; i++) {
						//龙头012
						if (i == head % 3) {
							head_012[i] = i;
						} else {
							head_012[i] = -1;
						}
						//凤尾012
						if (i == end % 3) {
							end_012[i] = i;
						} else {
							end_012[i] = -1;
						}
					}
					data = [
						lt,
						fw,
						head_012,
						end_012,
					];
					type = common.getCondition("td", data.length);
					line = [0, 0, 1, 1];
					calssname = [
						common.getCondition("gbg", lt.length),
						common.getCondition("lbg", fw.length),
						common.getCondition("gbg", head_012.length),
						common.getCondition("rbg", end_012.length),
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************012路走势********************/
				case '3dr3-012lzs':
				case 'plsr3-012lzs':
				case 'hasha3-012lzs':
				case 'plwr5-012lzs':
					var num = [];
					var ballcolor = [];
					//记录012路的个数
					var zero = 0,
						one = 0,
						two = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						if (opennumber.split(",")[i] % 3 == 0) {
							zero++;
						}
						if (opennumber.split(",")[i] % 3 == 1) {
							one++;
						}
						if (opennumber.split(",")[i] % 3 == 2) {
							two++;
						}
						num[i] = parseInt(opennumber.split(",")[i]);
					}
					// num = common.sortArr(num);
					var ball = common.removeAgain(num);
					var flag = [];
					for (var i = 0; i < ball.length; i++) {
						if (ball[i] == 0) {
							flag[0] = ball[i];
							ballcolor[0] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 3) {
							flag[1] = ball[i];
							ballcolor[1] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 6) {
							flag[2] = ball[i];
							ballcolor[2] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 9) {
							flag[3] = ball[i];
							ballcolor[3] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 1) {
							flag[4] = ball[i];
							ballcolor[4] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 4) {
							flag[5] = ball[i];
							ballcolor[5] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 7) {
							flag[6] = ball[i];
							ballcolor[6] = this.ball('012lzs', ball[i], num);
						}
						if (ball[i] == 2) {
							flag[7] = ball[i];
							ballcolor[7] = this.ball('pmzs', ball[i], num);
						}
						if (ball[i] == 5) {
							flag[8] = ball[i];
							ballcolor[8] = this.ball('pmzs', ball[i], num);
						}
						if (ball[i] == 8) {
							flag[9] = ball[i];
							ballcolor[9] = this.ball('pmzs', ball[i], num);
						}
					}
					var h = [],
						hs = [],
						index = 0;
					for (var i = 0; i < flag.length; i++) {
						if (flag[i] != null) {
							h[index] = flag[i];
							hs[index] = ballcolor[i];
							index++;
						}
					}
					data = [
						h,
						[zero],
						[one],
						[two],
						[num[0] % 3],
						[num[1] % 3],
						[num[2] % 3],
					];
					type = ["span", "td", "td", "td", "td", "td", "td"];
					line = [0, 1, 1, 1, 1, 1, 1];
					calssname = [
						hs,
						["gbg"],
						["rbg"],
						["lbg"],
						["rbg"],
						["gbg"],
						["lbg"],
					];
					if (id.indexOf("plwr5") > -1) {
						data = [
							h,
							[zero],
							[one],
							[two],
						];
						type = ["span", "td", "td", "td"];
						line = [0, 1, 1, 1];
						calssname = [
							hs,
							["gbg"],
							["rbg"],
							["lbg"],
						];
					}
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************和合分布********************/
				case '3dr3-hhfb':
				case 'plsr3-hhfb':
				case 'hasha3-hhfb':
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					var lmhzA = this.special(num, "lmhzA");
					lmhzA = common.sortArr(lmhzA);
					lmhzA = common.removeAgain(lmhzA);
					var lmhzB = this.special(num, "lmhzB");
					lmhzB = common.sortArr(lmhzB);
					lmhzB = common.removeAgain(lmhzB);
					data = [
						lmhzA,
						lmhzB,
					];
					type = ["td", "td"];
					line = [0, 0];
					calssname = [
						common.getCondition("rbg", lmhzA.length),
						common.getCondition("gbg", lmhzB.length),
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************均值走势********************/
				case '3dr3-jzzs':
				case 'plsr3-jzzs':
				case 'hasha3-jzzs':
					var mean = 0; //均值
					for (var i = 0; i < opennumber.split(",").length; i++) {
						mean += parseInt(opennumber.split(",")[i]);
					}
					mean = Math.round(mean / 3);
					var xs = common.getIntNum(0, 4);
					var os = common.getPairNum(0, 9);
					var hs = common.gethsNum(0, 9);
					var flag = [];
					if (xs.indexOf(mean) > -1) {
						flag[0] = -1;
						flag[1] = 1;
					} else {
						flag[0] = 0;
						flag[1] = -1;
					}
					if (os.indexOf(mean) > -1) {
						flag[2] = -1;
						flag[3] = 1;
					} else {
						flag[2] = 0;
						flag[3] = -1;
					}
					if (hs.indexOf(mean) > -1) {
						flag[4] = -1;
						flag[5] = 1;
					} else {
						flag[4] = 0;
						flag[5] = -1;
					}
					data = [
						[mean],
						flag,
					];
					type = ["td", "td"];
					line = [1, 0];
					calssname = [
						["rbg"],
						["gbg", "gbg", "lbg", "lbg", "gbg", "gbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************和振走势********************/
				case '3dr3-hzhenzs':
				case 'plsr3-hzhenzs':
				case 'hasha3-hzhenzs':
					var presentAll = 0; //当前的和值
					var upAll = 0; //上期的和值
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						presentAll += parseInt(opennumber.split(",")[i]);
						upAll += parseInt(hisnumber[hisnumber.length - 2].split(",")[i]);
					}
					if (presentAll >= upAll) {
						all = presentAll - upAll;
					} else {
						all = upAll - presentAll;
					}
					var xs = common.getIntNum(0, 13);
					var os = common.getPairNum(0, 27);
					var hs = common.gethsNum(0, 27);
					var flag = [];
					if (xs.indexOf(all) > -1) {
						flag[0] = -1;
						flag[1] = 1;
					} else {
						flag[0] = 0;
						flag[1] = -1;
					}
					if (os.indexOf(all) > -1) {
						flag[2] = -1;
						flag[3] = 1;
					} else {
						flag[2] = 0;
						flag[3] = -1;
					}
					if (hs.indexOf(all) > -1) {
						flag[4] = -1;
						flag[5] = 1;
					} else {
						flag[4] = 0;
						flag[5] = -1;
					}
					data = [
						[all],
						flag,
					];
					type = ["td", "td"];
					line = [1, 0];
					calssname = [
						["rbg"],
						["gbg", "gbg", "lbg", "lbg", "gbg", "gbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************排列走势********************/
				case '3dr3-plzs':
				case 'plsr3-plzs':
				case 'hasha3-plzs':
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						num[i] = parseInt(opennumber.split(",")[i]);
					}
					num = common.sortArr(num);
					var xs = common.getIntNum(0, 4);
					var os = common.getPairNum(0, 9);
					var hs = common.gethsNum(0, 9);
					var flag = [];
					var flag1 = [];
					var flag2 = [];
					//最小数
					if (xs.indexOf(num[0]) > -1) {
						flag[0] = -1;
						flag[1] = 1;
					} else {
						flag[0] = 0;
						flag[1] = -1;
					}
					if (os.indexOf(num[0]) > -1) {
						flag[2] = -1;
						flag[3] = 1;
					} else {
						flag[2] = 0;
						flag[3] = -1;
					}
					if (hs.indexOf(num[0]) > -1) {
						flag[4] = -1;
						flag[5] = 1;
					} else {
						flag[4] = 0;
						flag[5] = -1;
					}
					//中间数
					if (xs.indexOf(num[1]) > -1) {
						flag1[0] = -1;
						flag1[1] = 1;
					} else {
						flag1[0] = 0;
						flag1[1] = -1;
					}
					if (os.indexOf(num[1]) > -1) {
						flag1[2] = -1;
						flag1[3] = 1;
					} else {
						flag1[2] = 0;
						flag1[3] = -1;
					}
					if (hs.indexOf(num[1]) > -1) {
						flag1[4] = -1;
						flag1[5] = 1;
					} else {
						flag1[4] = 0;
						flag1[5] = -1;
					}
					//最大数
					if (xs.indexOf(num[2]) > -1) {
						flag2[0] = -1;
						flag2[1] = 1;
					} else {
						flag2[0] = 0;
						flag2[1] = -1;
					}
					if (os.indexOf(num[2]) > -1) {
						flag2[2] = -1;
						flag2[3] = 1;
					} else {
						flag2[2] = 0;
						flag2[3] = -1;
					}
					if (hs.indexOf(num[2]) > -1) {
						flag2[4] = -1;
						flag2[5] = 1;
					} else {
						flag2[4] = 0;
						flag2[5] = -1;
					}
					data = [
						[num[0]],
						[num[1]],
						[num[2]],
						flag,
						flag1,
						flag2,
					];
					type = ["span", "span", "span", "td", "td", "td"];
					line = [1, 1, 1, 0, 0, 0];
					calssname = [
						["rball1"],
						["bball1"],
						["gball1"],
						common.getCondition("rbg", flag.length),
						common.getCondition("lbg", flag1.length),
						common.getCondition("gbg", flag2.length),
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************定位分布********************/
				case '3dr3-dwfb':
				case 'plsr3-dwfb':
				case 'hasha3-dwfb':
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
						for (var i = 0; i < hisnumber.length - 1; i++) {
							//获取上一期号码
							if (j != hisnumber[i].split(",")[0]) {
								yl1[j]++;
							} else {
								yl1[j] = 0;
							}
							if (j != hisnumber[i].split(",")[1]) {
								yl2[j]++;
							} else {
								yl2[j] = 0;
							}
							if (j != hisnumber[i].split(",")[2]) {
								yl3[j]++;
							} else {
								yl3[j] = 0;
							}
						}
					}
					var num = opennumber.split(",");
					var minimum = yl1[num[0]] % 10; //第一位
					var middle = yl2[num[1]] % 10; //第二位
					var maximum = yl3[num[2]] % 10; //第三位			
					var xs = common.getIntNum(0, 4);
					var os = common.getPairNum(0, 9);
					var hs = common.gethsNum(0, 9);
					var flag = [];
					var flag1 = [];
					var flag2 = [];
					//第一位
					if (xs.indexOf(minimum) > -1) {
						flag[0] = -1;
						flag[1] = 1;
					} else {
						flag[0] = 0;
						flag[1] = -1;
					}
					if (os.indexOf(minimum) > -1) {
						flag[2] = -1;
						flag[3] = 1;
					} else {
						flag[2] = 0;
						flag[3] = -1;
					}
					if (hs.indexOf(minimum) > -1) {
						flag[4] = -1;
						flag[5] = 1;
					} else {
						flag[4] = 0;
						flag[5] = -1;
					}
					//第二位
					if (xs.indexOf(middle) > -1) {
						flag1[0] = -1;
						flag1[1] = 1;
					} else {
						flag1[0] = 0;
						flag1[1] = -1;
					}
					if (os.indexOf(middle) > -1) {
						flag1[2] = -1;
						flag1[3] = 1;
					} else {
						flag1[2] = 0;
						flag1[3] = -1;
					}
					if (hs.indexOf(middle) > -1) {
						flag1[4] = -1;
						flag1[5] = 1;
					} else {
						flag1[4] = 0;
						flag1[5] = -1;
					}
					//第三位
					if (xs.indexOf(maximum) > -1) {
						flag2[0] = -1;
						flag2[1] = 1;
					} else {
						flag2[0] = 0;
						flag2[1] = -1;
					}
					if (os.indexOf(maximum) > -1) {
						flag2[2] = -1;
						flag2[3] = 1;
					} else {
						flag2[2] = 0;
						flag2[3] = -1;
					}
					if (hs.indexOf(maximum) > -1) {
						flag2[4] = -1;
						flag2[5] = 1;
					} else {
						flag2[4] = 0;
						flag2[5] = -1;
					}
					data = [
						[minimum],
						[middle],
						[maximum],
						flag,
						flag1,
						flag2,
					];
					type = ["span", "span", "span", "td", "td", "td"];
					line = [1, 1, 1, 0, 0, 0];
					calssname = [
						["rball1"],
						["bball1"],
						["gball1"],
						common.getCondition("rbg", flag.length),
						common.getCondition("lbg", flag1.length),
						common.getCondition("gbg", flag2.length),
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************012路定位********************/
				case 'plwr5-012ldw':
					var num = opennumber.split(",");
					data = [
						[num[0] % 3],
						[num[1] % 3],
						[num[2] % 3],
						[num[3] % 3],
						[num[4] % 3],
					];
					type = ["td", "td", "td", "td", "td"];
					line = [1, 1, 1, 1, 1];
					calssname = ["gbg", "lbg", "rbg", "gbg", "lbg"];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: [calssname[i]],
							line: line[i]
						}
					}
					break;
					/*************代码走势********************/
				case '3dr3-dmzs':
				case 'plsr3-dmzs':
				case 'hasha3-dmzs':
					var yw = [],
						ew = [],
						sw = [];
					for (var i = 0; i < opennumber.length; i++) {
						if (id.indexOf("3dr3") > -1) {
							if (i < 10) {
								if (opennumber[i] > 0) {
									yw.push((i + 21));
								} else {
									yw.push(-1);
								}
							} else if (i < 20) {
								if (opennumber[i] > 0) {
									ew.push((i + 21));
								} else {
									ew.push(-1);
								}
							} else {
								if (opennumber[i] > 0) {
									sw.push((i + 21));
								} else {
									sw.push(-1);
								}
							}
						} else {
							if (i < 10) {
								if (opennumber[i] > 0) {
									if ((i + 1) < 10) {
										yw.push("0" + (i + 1));
									} else {
										yw.push((i + 1));
									}
								} else {
									yw.push(-1);
								}
							} else if (i < 20) {
								if (opennumber[i] > 0) {
									ew.push((i + 1));
								} else {
									ew.push(-1);
								}
							} else {
								if (opennumber[i] > 0) {
									sw.push((i + 1));
								} else {
									sw.push(-1);
								}
							}
						}
					}
					data = [
						yw, ew, sw
					];
					type = ["td", "td", "td"];
					line = [0, 0, 0];
					calssname = [common.getCondition("lbg", yw.length), common.getCondition("rbg", ew.length), common.getCondition(
						"gbg", sw.length)];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************代码图表********************/
					/*************平面走势********************/
				case '3dr3-pmzs-dm':
				case 'plsr3-pmzs-dm':
				case 'hasha3-pmzs-dm':
					var num = [];
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							if ((i + 1) < 10) {
								num.push("0" + (i + 1))
							} else {
								num.push((i + 1) + "")
							}
						}
					}
					var little = 0; //小数
					var pair = 0; //偶数
					var he = 0; //合数
					var xs = common.getStringNum(1, 6)
					var os = common.getPairNum(1, 12);
					var hs = common.gethsNum(1, 12);
					for (var i = 0; i < num.length; i++) {
						if (xs.indexOf(num[i]) > -1) {
							little++;
						}
						if (os.indexOf(parseInt(num[i])) > -1) {
							pair++;
						}
						if (hs.indexOf(parseInt(num[i])) > -1) {
							he++;
						}
					}
					data = [
						num, [little],
						[pair],
						[he]
					];
					type = ["span", "td", "td", "td"];
					line = [0, 1, 1, 1];
					calssname = [common.getCondition("bball", opennumber.length), ["rbg"],
						["lbg"],
						["gbg"]
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************和合走势********************/
				case '3dr3-hhzs-dm':
				case 'plsr3-hhzs-dm':
				case 'hasha3-hhzs-dm':
					var all = 0; //统计和值
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							all += (i + 1);
						}
					}
					data = [
						[all],
						[all % 10]
					];
					type = ["td", "td"];
					line = [1, 1];
					calssname = [
						["lbg"],
						["gbg"]
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************和合走势********************/
				case '3dr3-012lzs-dm':
				case 'plsr3-012lzs-dm':
				case 'hasha3-012lzs-dm':
					var num = [];
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							if ((i + 1) < 10) {
								num.push("0" + (i + 1))
							} else {
								num.push((i + 1) + "")
							}
						}
					}
					var distribution = ["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"];
					/*012*/
					var linglu = "03, 06, 09, 12",
						yilu = "01, 04, 07, 10",
						erlu = "02, 05, 08, 11";
					var zreo = 0,
						one = 0,
						two = 0;
					var hm = [];
					index = 0;
					for (var i = 0; i < distribution.length; i++) {
						for (var j = 0; j < num.length; j++) {
							if (distribution[i] == num[j]) {
								hm[index] = distribution[i];
								if (linglu.indexOf(distribution[i]) > -1) {
									zreo++;
								}
								if (yilu.indexOf(distribution[i]) > -1) {
									one++;
								}
								if (erlu.indexOf(distribution[i]) > -1) {
									two++;
								}
								break;
							} else {
								hm[index] = 0;
							}
						}
						index++;
					}
					data = [
						hm,
						[zreo],
						[one],
						[two],
					];
					type = ["span", "td", "td", "td"];
					line = [0, 1, 1, 1];
					calssname = [
						common.getCondition("bball", opennumber.length),
						["rbg"],
						["lbg"],
						["gbg"]
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************连号重码********************/
				case '3dr3-lhcm-dm':
				case 'plsr3-lhcm-dm':
				case 'hasha3-lhcm-dm':
					var repetition = 0, //重码
						continuous = 0, //连号
						bestraddle = 0, //跨度
						min = -1, //开出最小号
						max = 0, //开出最大号
						up = hisnumber[hisnumber.length - 2]; //上期号码
					for (var i = 0; i < opennumber.length; i++) {
						//计算跨度
						if (min == -1 && opennumber[i] > 0) {
							min = i
						}
						if (opennumber[i] > 0) {
							max = i
						}
						//计算重码
						if (opennumber[i] == up[i] && up[i] > 0) {
							repetition++;
						}
						//计算连号
						if (opennumber[i] > 0 && opennumber[i - 1] > 0) {
							continuous++;
						}
					}
					bestraddle = max - min;
					data = [
						[continuous],
						[repetition],
						[bestraddle],
					];
					type = ["td", "td", "td"];
					line = [1, 1, 1];
					calssname = [
						["rbg"],
						["lbg"],
						["gbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************两码和个数********************/
				case '3dr3-lmhgsA-dm':
				case 'plsr3-lmhgsA-dm':
				case 'hasha3-lmhgsA-dm':
					var number = new Array();
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							number.push(i + 1);
						}
					}
					var arr = this.special(number, "lmhzA");
					var sum = common.getIntNum(3, 23);
					var data = new Array();
					for (var i = 0; i < sum.length; i++) {
						var count = 0;
						for (var j = 0; j < arr.length; j++) {
							if (sum[i] == arr[j]) {
								count++;
							}
						}
						data.push([count]);
					}
					calssname = ["rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg",
						"gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg"
					];
					type = common.getCondition("td", calssname.length);
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: [calssname[i]],
							line: 1
						}
					}
					break;
					/*************两码和个数********************/
				case '3dr3-lmhgsB-dm':
				case 'plsr3-lmhgsB-dm':
				case 'hasha3-lmhgsB-dm':
					var number = new Array();
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							number.push(i + 1);
						}
					}
					var arr = this.special(number, "lmhzB");
					var data = new Array();
					for (var i = 0; i < 10; i++) {
						var count = 0;
						for (var j = 0; j < arr.length; j++) {
							if (i == arr[j]) {
								count++;
							}
						}
						data.push([count]);
					}
					calssname = ["rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg"];
					type = common.getCondition("td", calssname.length);
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: [calssname[i]],
							line: 1
						}
					}
					break;
					/*************两码差个数********************/
				case '3dr3-lmcgs-dm':
				case 'plsr3-lmcgs-dm':
				case 'hasha3-lmcgs-dm':
					var number = new Array();
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							number.push(i + 1);
						}
					}
					var arr = this.special(number, "lmcz");
					var diff = common.getIntNum(1, 11);
					var data = new Array();
					for (var i = 0; i < diff.length; i++) {
						var count = 0;
						for (var j = 0; j < arr.length; j++) {
							if (diff[i] == arr[j]) {
								count++;
							}
						}
						data.push([count]);
					}
					calssname = ["rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg"];
					type = common.getCondition("td", calssname.length);
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: [calssname[i]],
							line: 1
						}
					}
					break;
					/*************三码和个数********************/
				case '3dr3-smhgsA-dm':
				case 'plsr3-smhgsA-dm':
				case 'hasha3-smhgsA-dm':
					var number = new Array();
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							number.push(i + 1);
						}
					}
					var arr = this.special(number, "smhzA");
					var sum = common.getIntNum(6, 33);
					var data = new Array();
					for (var i = 0; i < sum.length; i++) {
						var count = 0;
						for (var j = 0; j < arr.length; j++) {
							if (sum[i] == arr[j]) {
								count++;
							}
						}
						data.push([count]);
					}
					calssname = ["rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg",
						"gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg"
					];
					type = common.getCondition("td", calssname.length);
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: [calssname[i]],
							line: 1
						}
					}
					break;
					/*************三码合个数********************/
				case '3dr3-smhgsB-dm':
				case 'plsr3-smhgsB-dm':
				case 'hasha3-smhgsB-dm':
					var number = new Array();
					for (var i = 0; i < opennumber.length; i++) {
						if (opennumber[i] > 0) {
							number.push(i + 1);
						}
					}
					var arr = this.special(number, "smhzB");
					var data = new Array();
					for (var i = 0; i < 10; i++) {
						var count = 0;
						for (var j = 0; j < arr.length; j++) {
							if (i == arr[j]) {
								count++;
							}
						}
						data.push([count]);
					}
					calssname = ["rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg"];
					type = common.getCondition("td", calssname.length);
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: [calssname[i]],
							line: 1
						}
					}
					break;
					/*************双色球大乐透平面走势*******************/
				case "ssq-pmzs-qq":
				case "dlt-pmzs-qq":
					var num = [];
					var ball = [];
					var oneq = [];
					var twoq = [];
					var threeq = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						if (id.indexOf("dlt") > -1) {
							if (i < opennumber.split(",").length - 2) {
								num[i] = opennumber.split(",")[i];
							}
						} else {
							if (i != opennumber.split(",").length - 1) {
								num[i] = opennumber.split(",")[i];
							}
						}
					}
					num = common.sortArr(num);
					for (var i = 0; i < num.length; i++) {
						num[i] = parseInt(num[i]);
						if (id.indexOf("ssq") > -1) {
							if (num[i] <= 11) {
								oneq.push(num[i]);
							} else if (num[i] <= 22) {
								twoq.push(num[i]);
							} else if (num[i] <= 33) {
								threeq.push(num[i]);
							}
						} else {
							if (num[i] <= 12) {
								oneq.push(num[i]);
							} else if (num[i] <= 24) {
								twoq.push(num[i]);
							} else if (num[i] <= 35) {
								threeq.push(num[i]);
							}
						}
					}
					data = [
						oneq, twoq, threeq
					];
					type = ["span", "span", "span"];
					line = [0, 0, 0];
					calssname = [
						common.getCondition("bball", oneq.length),
						common.getCondition("gball", twoq.length),
						common.getCondition("rball", threeq.length),
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************双色球大乐透和值走势*******************/
				case "ssq-hzzs-qq":
				case "dlt-hzzs-qq":
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						all += parseInt(opennumber.split(",")[i]);
					}
					var he = [common.getIntNum(15, 24), common.getIntNum(25, 34), common.getIntNum(35, 44), common.getIntNum(45, 54),
						common.getIntNum(55, 64), common.getIntNum(65, 74), common.getIntNum(75, 84), common.getIntNum(85, 94), common
						.getIntNum(95, 104), common.getIntNum(105, 114), common.getIntNum(115, 124), common.getIntNum(125, 134),
						common.getIntNum(135, 144), common.getIntNum(145, 154), common.getIntNum(155, 164)
					];
					if (obj.play_id == "ssq") {
						he = [common.getIntNum(21, 26), common.getIntNum(27, 32), common.getIntNum(33, 38), common.getIntNum(39, 44),
							common.getIntNum(45, 50), common.getIntNum(51, 56), common.getIntNum(57, 62), common.getIntNum(63, 68),
							common.getIntNum(69, 74), common.getIntNum(75, 80), common.getIntNum(81, 86), common.getIntNum(87, 92),
							common.getIntNum(93, 98), common.getIntNum(99, 104), common.getIntNum(105, 110), common.getIntNum(111, 116),
							common.getIntNum(117, 122), common.getIntNum(123, 128), common.getIntNum(129, 134), common.getIntNum(135, 140),
							common.getIntNum(141, 146), common.getIntNum(147, 152), common.getIntNum(153, 158), common.getIntNum(159, 164),
							common.getIntNum(165, 170), common.getIntNum(171, 176), common.getIntNum(177, 182), common.getIntNum(183, 188),
						];
					}
					var flag = 0;
					for (var i = 0; i < he.length; i++) {
						for (var j = 0; j < he[i].length; j++) {
							if (he[i][j] == all) {
								flag = i;
								break;
							}
						}
					}
					data = [
						[flag],
					];
					type = ["td"];
					line = [1];
					calssname = [
						["lbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************双色球大乐透跨度走势********************/
				case "ssq-kdzs-qq":
				case "dlt-kdzs-qq":
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						if (id.indexOf("dlt") > -1) {
							if (i < opennumber.split(",").length - 2) {
								num[i] = opennumber.split(",")[i];
							}
						} else {
							if (i != opennumber.split(",").length - 1) {
								num[i] = opennumber.split(",")[i];
							}
						}
					}
					num = common.sortArr(num);
					var kd = [common.getIntNum(4, 8), common.getIntNum(9, 13), common.getIntNum(14, 18), common.getIntNum(19, 23),
						common.getIntNum(24, 28), common.getIntNum(29, 34)
					];
					var diff = num[num.length - 1] - num[0];
					var flag = 0;
					for (var i = 0; i < kd.length; i++) {
						for (var j = 0; j < kd[i].length; j++) {
							if (kd[i][j] == diff) {
								flag = i;
								break;
							}
						}
					}
					data = [];
					if (id.indexOf("ssq") > -1) {
						data[0] = [diff];
					} else {
						data[0] = [flag];
					}
					type = ["td"];
					line = [1];
					calssname = [
						["lbg"],
					];
					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************大乐透双色球后区平面走势********************/
				case "ssq-pmzs-hq":
				case "dlt-pmzs-hq":
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						if (id.indexOf("dlt") > -1) {
							if (i >= opennumber.split(",").length - 2) {
								num.push(opennumber.split(",")[i]);
							}
						} else {
							if (i >= opennumber.split(",").length - 1) {
								num.push(opennumber.split(",")[i]);
							}
						}
					}
					num = common.sortArr(num);
					data = [
						num,
					];
					type = ["span", "span"];
					line = [0, 0];
					calssname = [
						common.getCondition("bball", num.length)
					];

					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************大乐透后区和值走势********************/
				case "dlt-hzzs-hq":
					var all = 0;
					for (var i = 0; i < opennumber.split(",").length; i++) {
						if (i >= opennumber.split(",").length - 2) {
							all += parseInt(opennumber.split(",")[i]);
						}
					}
					data = [
						[all],
					];
					type = ["td"];
					line = [1];
					calssname = [
						["lbg"]
					];

					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
					/*************大乐透后区跨度走势********************/
				case "dlt-kdzs-hq":
					var num = [];
					for (var i = 0; i < opennumber.split(",").length; i++) {
						if (i >= opennumber.split(",").length - 2) {
							num.push(parseInt(opennumber.split(",")[i]));
						}
					}
					data = [
						[num[num.length - 1] - num[0]],
					];
					type = ["td"];
					line = [1];
					calssname = [
						["lbg"]
					];

					for (var i = 0; i < data.length; i++) {
						json[i] = {
							data: data[i],
							type: type[i],
							classname: calssname[i],
							line: line[i]
						}
					}
					break;
				default:
					break;
			}
			return json;
		},
		//判断当前开奖号码类型
		group: function(num) {
			var count = 0;
			for (var i = 0; i < num.length - 1; i++) {
				for (var j = i + 1; j < num.length; j++) {
					if (num[i] == num[j]) {
						count++;
					}
				}
			}
			var str = "组六";
			if (count == 1) {
				str = "组三";
			} else if (count >= 2) {
				str = "豹子";
			}
			return str;
		},
		//判断当前开奖号码类型
		groupClass: function(num) {
			var count = 0;
			for (var i = 0; i < num.length - 1; i++) {
				for (var j = i + 1; j < num.length; j++) {
					if (num[i] == num[j]) {
						count++;
					}
				}
			}
			var str = "lbg";
			if (count == 1) {
				str = "rbg";
			} else if (count >= 2) {
				str = "zbg";
			}
			return str;
		},
		//通用计算
		special: function(number, type) {
			var arr = new Array();
			switch (type) {
				case "lmhzA":
					for (var i = 0; i < number.length - 1; i++) {
						for (var j = i + 1; j < number.length; j++) {
							arr.push(number[i] + number[j])
						}
					}
					break;
				case "lmhzB":
					for (var i = 0; i < number.length - 1; i++) {
						for (var j = i + 1; j < number.length; j++) {
							arr.push((number[i] + number[j]) % 10)
						}
					}
					break;
				case "lmcz":
					for (var i = number.length - 1; i > 0; i--) {
						for (var j = i - 1; j > -1; j--) {
							arr.push(number[i] - number[j])
						}
					}
					break;
				case "smhzA":
					for (var i = 0; i < number.length - 2; i++) {
						for (var j = i + 1; j < number.length - 1; j++) {
							for (var k = j + 1; k < number.length; k++) {
								arr.push(number[i] + number[j] + number[k])
							}
						}
					}
					break;
				case "smhzB":
					for (var i = 0; i < number.length - 2; i++) {
						for (var j = i + 1; j < number.length - 1; j++) {
							for (var k = j + 1; k < number.length; k++) {
								arr.push((number[i] + number[j] + number[k]) % 10)
							}
						}
					}
					break;
				default:
					break;
			}
			return arr;
		},
		//处理特殊球颜色
		ball: function(id, number, num) {
			var obj = JSON.parse(common.cookieGet("obj"));
			switch (id) {
				case "pmzs":
				case "012lzs":
					var count = 0;
					for (var i = 0; i < num.length; i++) {
						if (num[i] == number) {
							++count;
						}
					}
					if (obj.play_id == "plwr5") {
						if (count >= 2) {
							return "rball1";
						} else {
							return "bball1";
						}
					} else {
						if (count == 2) {
							return "rball1";
						} else if (count == 3) {
							return "zball1";
						} else {
							return "bball1";
						}
					}
					break;
				default:
					break;
			}
		},
		// 画线方法
		drawLines: function() {
			this.removeLines();
			tableId = 'width1';
			var markClass = 'lineMark'; // 元素标记class名称
			var firstRow = $('#' + tableId + ' tbody').eq(0).children('tr').eq(0); // 第一行
			var rowNums = $('#' + tableId + ' tbody').eq(0).children('tr').length; // 行数
			var rowElementNums = firstRow.children('.' + markClass).length; // 每行元素数量
			var cells = $('#' + tableId + ' tbody').eq(0).find('.' + markClass); // 所有单元格
			var cellHeight = firstRow.children('td').eq(0).outerHeight(); // 元素高
			var cellWidth = firstRow.children('td').eq(0).outerWidth(); // 元素宽
			var lastCell;
			if (rowNums <= 1 || rowElementNums <= 0) { // 只有一行或者没有元素带标记则直接结束（一行无法画线）
				return;
			}
			$('#' + tableId).prepend('<canvas id="' + lineRegionId + '" height="' + $('#' + tableId).height() +
				'" width="' + $('#' + tableId).width() +
				'" style="top: 0px; left: 0px; position: absolute; pointer-events: none; transform:translateZ(1px)"></canvas>');
			var canvas = document.getElementById(lineRegionId);
			var paint = canvas.getContext('2d');
			paint.lineWidth = 2;

			for (var i = 0; i < rowElementNums; ++i) { // 每一个标题组(全部行)
				var firstCell = firstRow.children('.' + markClass).eq(i);
				var color = '';
				var alpha = 1;
				// 和值走势固定颜色
				if (firstCell.hasClass('stableColorMark')) { // 如若指定颜色，则使用指定颜色；否则读取第一行对应元素的颜色
					color = "#0a6c91";
				} else {
					var colorData = this.getHexBackgroundColor((firstCell.children('span').length == 0) ? (firstCell) : (firstCell.children(
						'span')));
					color = colorData.color;
					alpha = colorData.alpha;
				}
				paint.strokeStyle = color;
				paint.globalAlpha = alpha;
				// 一条线画到底
				paint.beginPath();
				for (var j = 0; j < rowNums; ++j) { // 每一行
					var cellPosition = cells.eq(i + j * rowElementNums).position();
					var cell = {
						'top': cellPosition.top + cellHeight / 2,
						'left': cellPosition.left + cellWidth / 2
					}
					if (j != 0) { // 不是第一行才画线
						paint.moveTo(lastCell.left, lastCell.top + cellHeight * 0); // 因为线不一定连贯，因此有移动画笔但不画线的moveTo；如果offsetPer不为0，则线实际上不连贯
						paint.lineTo(cell.left, cell.top - cellHeight * 0);
					}
					lastCell = cell;
				}
				paint.stroke();
			}
		},
		removeLines: function() {
			$('#' + lineRegionId).remove();
		},
		// 获取颜色的十六进制码（rgb(255,255,255)转#FFFFFF）【支持css3的aplha通道】
		getHexBackgroundColor: function(obj) {
			var objColor = obj.css('background-color');
			var color = 'black';
			var alpha = 1;

			function hex(x) {
				return ("0" + parseInt(x).toString(16)).slice(-2);
			}

			function alphaHandle(x) {
				var newAlpha = parseFloat(x) + 0;
				if (newAlpha > 1) {
					newAlpha = 1;
				} else if (newAlpha < 0) {
					newAlpha = 0;
				}
				return newAlpha;
			}
			if (!$.browser.msie) {
				var ways = objColor.split(',').length;
				switch (ways) {
					case 3: // css2，rgb模式
						var rgb = objColor.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)*\)$/);
						color = "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
						break;
					case 4: // css3，rgba模式
						var rgba = objColor.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d)[.]{0,1}[0-9]*\)$/);
						color = "#" + hex(rgba[1]) + hex(rgba[2]) + hex(rgba[3]);
						alpha = objColor.substring(objColor.indexOf('.') - 1, objColor.indexOf(')'));
						break;
					default: // 颜色获取异常，默认黑色
						break;
				}
			}
			return {
				'color': color,
				'alpha': alphaHandle(alpha)
			}
		}
	}
}();
