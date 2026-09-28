var content = function() {
	var hda = ["w", "d", "l"];
	var hf = ['ww', 'wd', 'wl', 'dw', 'dd', 'dl', 'lw', 'ld', 'll'];
	var ttg = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
	var crs = ['t0100', 't0200', 't0201', 't0300', 't0301', 't0302', 't0400', 't0401', 't0402', 't0500', 't0501', 't0502',
		'hother',
		't0000', 't0101', 't0202', 't0303', 'dother',
		't0001', 't0002', 't0102', 't0003', 't0103', 't0203', 't0004', 't0104', 't0204', 't0005', 't0105', 't0205',
		'aother'
	];
	return {
		server: function(data) {
			var obj = JSON.parse(common.cookieGet("obj"));
			var omit = new Array(30); //
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
			var serial = "";
			var html = "";
			var submit = "";
			common.cookieSet("data", data[data.length - 1]);
			for (var i = 0; i < data.length; i++) {
				//序号
				serial += '<tr><td class="qh">' + (i + 1) + '</td></tr>'
				//判断走势图
				html += "<tr>"
				var count = 0; //记录当前出多少相同的;
				var index = 0; //遗漏下标统计
				var jl = 0;
				for (var j = 0; j < data[i].length; j++) {
					var flag = "";
					//胜平负
					if (this.calculate(obj.type, obj.oddsType, data[i][j])) {
						flag = (j + 1)
					}
					if (i == data.length - 1) {
						if (data[i][j] == "" && common.isNull(JSON.parse(common.cookieGet("game_id"))[jl])) {
							submit += '<td span=' + JSON.parse(common.cookieGet("game_id"))[jl] + ' alt=' + content.subid(obj.type + "-" +
								obj.oddsType) + ' onclick="content.clickSubmit(this)" class="fline">' + j + '</td>';
							jl++;
							common.cookieSet("flag", jl)
						} else {
							submit += '<td onclick=common.showMsg("选择无效",800)></td>'
						}
					}
					if (flag != "") {
						count++;
						appeardTimes[index]++; //出现则加一
						maxOmission[index] = 0; //最大遗漏
						maxSuccessive[index]++;
						omit[index] = 0;
						html += '<td class="incrMark"><span class="bball1">' + (flag - 1) + '</span></td>';
					} else {
						++maxOmission[index]; //最大遗漏
						maxSuccessive[index] = 0; //最大连出
						html += '<td class="incrMark ">' + ++omit[index] + '</td>';
					}
					//如果当前大过历史 历史等于当前
					if (maxSuccessive[index] > flag_appeard[index]) {
						flag_appeard[index] = maxSuccessive[index]
					}
					if (flag_omit[index] < maxOmission[index]) {
						flag_omit[index] = maxOmission[index];
					}
					index++;
				}
				for (var j = 0; j < 11; j++) {
					if (i == data.length - 1) {
						submit += '<td onclick=common.showMsg("选择无效",800)></td>'
					}
					if (count == j) {
						appeardTimes[index]++; //出现则加一
						maxOmission[index] = 0; //最大遗漏
						maxSuccessive[index]++;
						omit[index] = 0;
						if (j == 10) {
							html += '<td class="lineMark"><span class="gball">' + count + '</span></td>';
						} else {
							html += '<td class="lineMark"><span class="gball1">' + count + '</span></td>';
						}
					} else {
						++maxOmission[index]; //最大遗漏
						maxSuccessive[index] = 0; //最大连出
						html += '<td class="incrMark ">' + ++omit[index] + '</td>';
					}
					//如果当前大过历史 历史等于当前
					if (maxSuccessive[index] > flag_appeard[index]) {
						flag_appeard[index] = maxSuccessive[index]
					}
					if (flag_omit[index] < maxOmission[index]) {
						flag_omit[index] = maxOmission[index];
					}
					index++;
				}

			}
			var arise1 = '';
			var continuous1 = '';
			var omit1 = '';
			for (var i = 0; i < 21; i++) {
				arise1 += '<td>' + appeardTimes[i] + '</td>';
				continuous1 += '<td>' + flag_appeard[i] + '</td>';
				omit1 += '<td>' + flag_omit[i] + '</td>';
			}
			$("#cxcs").html(arise1);
			$("#tjlc").html(continuous1);
			$("#tjyl").html(omit1);
			$("#serial").html(serial);
			$("#content").html(html);
			//提交
			$("#tjc1").html(submit)
			common.cookieSet("page", 1)
		},
		submiting: function() {
			var playUl = {};
			$(".select-yes").each(function() {
				var dataPID = $(this).attr("alt");
				var dataUlid = $(this).attr("span");
				if (playUl[dataPID] == undefined) {
					playUl[dataPID] = dataUlid;
				} else {
					playUl[dataPID] += "," + dataUlid;
				}
			});
			var data = {}
			for (var key in playUl) {
				data.type = key;
				data.gameid = playUl[key].split(",")
			}
			var obj = JSON.parse(common.cookieGet("obj"));
			var localName = '';
			var bodyEn = [];
			var local = {};
			var sublen = 0;
			if (obj.type == "crs") {
				localName = 'homePageCrs';
				bodyEn = crs;
				sublen = 6;
			} else if (obj.type == "hda") {
				localName = "homePageHda";
				bodyEn = hda;
				sublen = 10;
			} else if (obj.type == "hf") {
				localName = "homePageHf";
				bodyEn = hf;
				sublen = 6;
			} else if (obj.type == "hhda") {
				localName = "homePageHhda";
				bodyEn = hda;
				sublen = 10;
			} else if (obj.type == "ttg") {
				localName = "homePageTtg";
				bodyEn = ttg;
				sublen = 8;
			}
			if (JSON.parse(common.cookieGet("obj")).from_Id == "901") {
				local = JSON.parse(localStorage.getItem(localName));
				content.localCommon(local,data,bodyEn,sublen);
			} else if (JSON.parse(common.cookieGet("obj")).from_Id == "902" || JSON.parse(common.cookieGet("obj")).from_Id ==
				"903") {
				local = JSON.parse(plus.storage.getItem(localName));
				content.localCommon(local,data,bodyEn,sublen,localName);	
			}
		},
		localCommon: function(local,data,bodyEn,sublen,localName){
			var matchIdAll = local.matchIdAll; //第一个
			var chooseId = local.chooseId; //第二个
			var chooseMatchDatas = local.chooseMatchDatas; //第三个
			var flag = false;
			for (var i = 0; i < data.gameid.length; i++) {
				if (matchIdAll.indexOf(data.gameid[i]) == -1) {
					flag = true;
				}
				if (chooseId.indexOf(data.gameid[i]) == -1) {
					chooseId.push(data.gameid[i])
				}
				if (common.isNull(chooseMatchDatas[data.gameid[i]])) {
					var p = data.type.split(',');
					for (let j = 0; j < p.length; j++) {
						if (chooseMatchDatas[data.gameid[i]].indexOf(p[j]) == -1) {
							chooseMatchDatas[data.gameid[i]].push(p[j])
						}
					}
					common.sortArrayByEnType(chooseMatchDatas[data.gameid[i]], bodyEn);
				} else {
					let objData = data.type.split(',');
					chooseMatchDatas[data.gameid[i]] = objData;
				}
			}
			if (flag || chooseId.length > sublen) {
				common.showMsg("提交失败");
				return;
			}
			local.chooseMatchIndex = chooseId.length;
			local.chooseId = chooseId;
			local.chooseMatchDatas = chooseMatchDatas;
			if (JSON.parse(common.cookieGet("obj")).from_Id == "901") {
				parent.submiting(local)
				common.showMsg("提交成功");
			} else if (JSON.parse(common.cookieGet("obj")).from_Id == "902" || JSON.parse(common.cookieGet("obj")).from_Id ==
				"903") {
				plus.storage.setItem(localName,JSON.stringify(local));
				common.showMsg("提交成功");	
			}
		},
		//提交条件的点击事件
		clickSubmit: function(obj) {
			var className = obj.getAttribute("class");
			if (className == "select-yes") {
				obj.setAttribute("class", "");
			} else {
				obj.setAttribute("class", "select-yes");
			}
		},
		//计算
		calculate: function(type, oddsType, data) {
			var str = false;
			if (type == "hda") {
				if (oddsType == "w") {
					if (data == "胜") {
						str = true;
					}
				} else if (oddsType == "d") {
					if (data == "平") {
						str = true;
					}
				} else if (oddsType == "l") {
					if (data == "负") {
						str = true;
					}
				}
			} else if (type == "hhda") {
				if (oddsType == "w") {
					if (data == "胜") {
						str = true;
					}
				} else if (oddsType == "d") {
					if (data == "平") {
						str = true;
					}
				} else if (oddsType == "l") {
					if (data == "负") {
						str = true;
					}
				}
			} else if (type == "hf") {
				if (oddsType == "bw") {
					if (data.substring(0, 1) == "胜") {
						str = true;
					}
				} else if (oddsType == "bd") {
					if (data.substring(0, 1) == "平") {
						str = true;
					}
				} else if (oddsType == "bl") {
					if (data.substring(0, 1) == "负") {
						str = true;
					}
				} else if (oddsType == "aw") {
					if (data.substring(1, 2) == "胜") {
						str = true;
					}
				} else if (oddsType == "ad") {
					if (data.substring(1, 2) == "平") {
						str = true;
					}
				} else if (oddsType == "al") {
					if (data.substring(1, 2) == "负") {
						str = true;
					}
				}
			} else if (type == "ttg") {
				if (oddsType == "s0") {
					if (parseInt(data) == 0) {
						str = true;
					}
				} else if (oddsType == "s1") {
					if (parseInt(data) == 1) {
						str = true;
					}
				} else if (oddsType == "s2") {
					if (parseInt(data) == 2) {
						str = true;
					}
				} else if (oddsType == "s3") {
					if (parseInt(data) == 3) {
						str = true;
					}
				} else if (oddsType == "s4") {
					if (parseInt(data) == 4) {
						str = true;
					}
				} else if (oddsType == "s5") {
					if (parseInt(data) == 5) {
						str = true;
					}
				} else if (oddsType == "s6") {
					if (parseInt(data) == 6) {
						str = true;
					}
				} else if (oddsType == "s7") {
					if (parseInt(data) > 6) {
						str = true;
					}
				}
			} else if (type == "crs") {
				if (oddsType == "w0") {
					if (data.split(":")[1] == 0 && data.split(":")[0] > 0) {
						str = true;
					}
				} else if (oddsType == "w1") {
					if ((data.split(":")[1] == 1 && data.split(":")[0] > 1) || data.split(":")[1] == 0 && data.split(":")[0] == 0) {
						str = true;
					}
				} else if (oddsType == "w2") {
					if ((data.split(":")[1] == 2 && data.split(":")[0] > 2) || (data.split(":")[1] == 0 && data.split(":")[0] ==
							2) || (data.split(":")[1] == 1 && data.split(":")[0] == 2)) {
						str = true;
					}
				} else if (oddsType == "w3") {
					if (data.split(":")[1] < 3 && data.split(":")[0] == 3) {
						str = true;
					}
				} else if (oddsType == "w4") {
					if (data.split(":")[1] < 3 && data.split(":")[0] == 4) {
						str = true;
					}
				} else if (oddsType == "w5") {
					if ((data.split(":")[1] < 3 && data.split(":")[0] == 5) || data == "胜其他") {
						str = true;
					}
				} else if (oddsType == "d0") {
					if (data.split(":")[1] == 0 && data.split(":")[0] == 0) {
						str = true;
					}
				} else if (oddsType == "d1") {
					if (data.split(":")[1] == 1 && data.split(":")[0] == 1) {
						str = true;
					}
				} else if (oddsType == "d2") {
					if (data.split(":")[1] == 2 && data.split(":")[0] == 2) {
						str = true;
					}
				} else if (oddsType == "d3") {
					if ((data.split(":")[1] == 3 && data.split(":")[0] == 3) || data == "平其他") {
						str = true;
					}
				} else if (oddsType == "l0") {
					if (data.split(":")[1] > 0 && data.split(":")[0] == 0) {
						str = true;
					}
				} else if (oddsType == "l1") {
					if ((data.split(":")[1] > 1 && data.split(":")[0] == 1) || (data.split(":")[1] == 1 && data.split(":")[0] == 0)) {
						str = true;
					}
				} else if (oddsType == "l2") {
					if ((data.split(":")[1] > 2 && data.split(":")[0] == 2) || (data.split(":")[1] == 2 && data.split(":")[0] == 0) ||
						(data.split(":")[1] == 2 && data.split(":")[0] == 1)) {
						str = true;
					}
				} else if (oddsType == "l3") {
					if (data.split(":")[1] == 3 && data.split(":")[0] < 3) {
						str = true;
					}
				} else if (oddsType == "l4") {
					if (data.split(":")[1] == 4 && data.split(":")[0] < 3) {
						str = true;
					}
				} else if (oddsType == "l5") {
					if ((data.split(":")[1] == 5 && data.split(":")[0] < 3) || data == "负其他") {
						str = true;
					}
				}
			}
			return str;
		},
		subid: function(id) {
			var str = "";
			switch (id) {
				case "hda-w":
					str = "w";
					break;
				case "hda-d":
					str = "d";
					break;
				case "hda-l":
					str = "l";
					break;
				case "hhda-w":
					str = "w";
					break;
				case "hhda-d":
					str = "d";
					break;
				case "hhda-l":
					str = "l";
					break;
				case "hf-bw":
					str = "ww,wd,wl";
					break;
				case "hf-bd":
					str = "dw,dd,dl";
					break;
				case "hf-bl":
					str = "lw,ld,ll";
					break;
				case "hf-aw":
					str = "ww,dw,lw";
					break;
				case "hf-ad":
					str = "wd,dd,ld";
					break;
				case "hf-al":
					str = "wl,dl,ll";
					break;
				case "ttg-s0":
					str = "s0";
					break;
				case "ttg-s1":
					str = "s1";
					break;
				case "ttg-s2":
					str = "s2";
					break;
				case "ttg-s3":
					str = "s3";
					break;
				case "ttg-s4":
					str = "s4";
					break;
				case "ttg-s5":
					str = "s5";
					break;
				case "ttg-s6":
					str = "s6";
					break;
				case "ttg-s7":
					str = "s7";
					break;
				case "crs-w0":
					str = "t0100,t0200,t0300,t0400,t0500";
					break;
				case "crs-w1":
					str = "t0100,t0201,t0301,t0401,t0501";
					break;
				case "crs-w2":
					str = "t0200,t0201,t0302,t0402,t0502";
					break;
				case "crs-w3":
					str = "t0300,t0301,t0302";
					break;
				case "crs-w4":
					str = "t0400,t0401,t0402";
					break;
				case "crs-w5":
					str = "t0500,t0501,t0502,hother";
					break;
				case "crs-d0":
					str = "t0000";
					break;
				case "crs-d1":
					str = "t0101";
					break;
				case "crs-d2":
					str = "t0202";
					break;
				case "crs-d3":
					str = "t0303,dother";
					break;
				case "crs-l0":
					str = "t0001,t0002,t0003,t0004,t0005";
					break;
				case "crs-l1":
					str = "t0001,t0102,t0103,t0104,t0105";
					break;
				case "crs-l2":
					str = "t0002,t0102,t0203,t0204,t0205";
					break;
				case "crs-l3":
					str = "t0003,t0103,t0203";
					break;
				case "crs-l4":
					str = "t0004,t0104,t0204";
					break;
				case "crs-l5":
					str = "t0005,t0105,t0205,aother";
					break;

				default:
					break;
			}
			return str;
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
