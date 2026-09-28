var style = function() {
	return {
		server: function() {
			var obj = JSON.parse(common.cookieGet("obj"));
			this.init_title(obj); //初始化头部信息
			this.init_bottom(obj); //初始化头部信息
		},
		//打印头部信息
		init_title: function(obj) {
			console.log("obj",obj)
			var play_id = obj.play_id;
			var chart_id = obj.chart_id;
			var json;
			if (common.isNull(obj.dm)) {
				json = this.title(play_id, chart_id, obj.dis, "dm");
			} else {
				json = this.title(play_id, chart_id, obj.dis);
			}
			var width = common.special();
			var html_tit = '';
			var html = '';
			var colgroup = '';
			var content_col = '';
			
			for (var i = 0; i < json.data.length; i++) {
				/*加载列数和列数颜色*/
				if (json.data[i].length == 0) {
					colgroup += '<col width="' + width + '" span="1">';
					content_col += '<col width="' + width + '" span="1">';
				} else {
					colgroup += '<col width="' + width + '" class="' + json.style[i] + '" span="' + json.data[i].length + '">';
					content_col += '<col width="' + width + '" class="' + json.style[i] + '" span="' + json.data[i].length + '">';
				}
				colgroup += '</col>';
				/*加载头部名字  例如平面走势-大小比*/
				if (json.data[i].length == 0) {
					html_tit += '<th colspan="1" rowspan="2" class="ltop3">' + json.name[i] + '</th>';
				} else {
					if (chart_id == "hzzs" && !common.isNull(obj.dis)) {
						if (i < 2) {
							if (play_id == "plwr5") {
								html_tit += '<th  colspan="' + (parseInt(json.data[i].length) - 1) * 5 + '" class="ltop3">' + json.name[i] +
									'</th>';
							} else {
								html_tit += '<th  colspan="' + (parseInt(json.data[i].length) - 1) * 3 + '" class="ltop3">' + json.name[i] +
									'</th>';
							}
						}
					} else {
						html_tit += '<th  colspan="' + json.data[i].length + '" class="ltop3">' + json.name[i] + '</th>';
					}
				}
				/*加载号码比例等数据*/
				for (var j = 0; j < json.data[i].length; j++) {
					html += '<td>' + json.data[i][j] + '</td>'
				}
			}
			$("#titlecol").html(colgroup);
			$("#content_col").html(content_col);
			$("#title_name").html(html_tit);
			$("#title_con").html(html);
		},
		//头部信息
		title: function(play_id, chart_id, dis, type) {
			var id = play_id + "_" + chart_id;
			if (common.isNull(type)) {
				id = play_id + "_" + chart_id + "_" + type;
			}
			if (common.isNull(dis)) {
				id = play_id + "_" + chart_id + "_" + dis;
			}
			var json = {};
			switch (id) {
				/*************平面走势********************/
				case '3dr3_pmzs':
				case 'plsr3_pmzs':
				case 'hasha3_pmzs':
				case 'plwr5_pmzs':
				case 'ssq_pmzs_qq':
				case 'dlt_pmzs_qq':
					var title_name = ["形态", "平面走势", "奇偶比", "质合比", "大小比", "和值"]; //3d pl3
					var title_style = ["", "", "bg5", "bg3", "bg4", ""];
					var title_data = [
						[], common.getIntNum(0, 9), common.getReverseRatio(0, 3), common.getReverseRatio(0, 3), common.getReverseRatio(
							0, 3), []
					];
					if (play_id == "plwr5") {
						title_name = ["平面走势", "奇偶比", "质合比", "大小比", "和值"];
						title_style = ["", "bg5", "bg3", "bg4", ""];
						title_data = [
							common.getIntNum(0, 9), common.getReverseRatio(0, 5), common.getReverseRatio(0, 5), common.getReverseRatio(0,
								5), []
						];
					}
					if (play_id == "ssq") {
						if (dis == "qq") {
							title_name = ["一区", "二区", "三区"];
							title_style = ["bg4", "bg5", "bg3"];
							title_data = [
								common.getStringNum(1, 11), common.getStringNum(12, 22), common.getStringNum(23, 33)
							];
						}

					}
					if (play_id == "dlt") {
						if (dis == "qq") {
							title_name = ["一区", "二区", "三区"];
							title_style = ["bg4", "bg5", "bg3"];
							title_data = [
								common.getStringNum(1, 12), common.getStringNum(13, 24), common.getStringNum(25, 35)
							];
						} else {
							title_name = ["平面走势"];
							title_style = ["bg5"];
							title_data = [common.getStringNum(1, 12)];
						}
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
				case 'animalsa2_pmzs':
				case 'animalsq2_pmzs':
					var title_name = ["平面走势", "奇偶比", "质合比", "大小比", "和值"]; //3d pl3
					var title_style = ["", "bg5", "bg3", "bg4", ""];
					var title_data = [
						common.getIntNum(1, 6), common.getReverseRatio(0, 2), common.getReverseRatio(0, 2), common.getReverseRatio(
							0, 2), []
					];
					
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************立体走势********************/
				case '3dr3_ltzs':
				case 'plsr3_ltzs':
				case 'hasha3_ltzs':
				case 'plwr5_ltzs':
					var title_name = ["万位", "千位", "百位"]; // pl3
					var title_style = ["bg4", "bg5", "bg3"];
					var title_data = [
						common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)
					]
					if (play_id == "3dr3") {
						title_name = ["百位", "十位", "个位"];
					}
					if (play_id == "plwr5") {
						title_name = ["万位", "千位", "百位", "十位", "个位"];
						title_style = ["bg4", "bg5", "bg3", "bg4", "bg5"];
						title_data = [
							common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(
								0, 9)
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************和合走势********************/
				case '3dr3_hhzs':
				case 'plsr3_hhzs':
				case 'hasha_hhzs':
				case 'plwr5_hhzs':
					var title_name = ["和值分布", "合值走势"]; // pl3
					var title_style = ["bg5", "bg4"];
					var title_data = [
						["0-9", "10-18", "19-27"], common.getIntNum(0, 9),
					]
					if (play_id == "plwr5") {
						title_data = [
							["0-9", "10-18", "19-27", "28-36", "37-45"], common.getIntNum(0, 9),
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************和值走势********************/
				case '3dr3_hzzs':
				case 'plsr3_hzzs':
				case 'hasha3_hzzs':
				case 'plwr5_hzzs':
					var title_name = ["和值", "和值走势"]; // pl3
					var title_style = ["bg3", "bg5", "bg4", "bg5"];
					var title_data = [
						[], common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)
					]
					if (play_id == "plwr5") {
						title_data = [
							[], common.getIntNum(0, 14), common.getIntNum(15, 30), common.getIntNum(31, 45)
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************双色球大乐透后区平面走势********************/
				case 'dlt_pmzs_hq':
				case 'ssc_pmzs_hq':
					var title_name = ["号码分布"]; // pl3
					var title_style = ["bg1"];
					var title_data = [
						common.getStringNum(1, 12)
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************双色球大乐透和值走势********************/
				case 'dlt_hzzs_qq':
				case 'ssq_hzzs_qq':
					var title_name = ["和值"]; // pl3
					var title_style = ["bg4"];
					var title_data = [
						["15-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75-84", "85-94", "95-104", "105-114", "115-124",
							"125-134", "135-144", "145-154", "155-165"
						]
					]
					if (id.indexOf("ssq") > -1) {
						title_data = [
							["21-26", "27-32", "33-38", "39-44", "45-50", "51-56", "57-62", "63-68", "69-74", "75-80", "81-86",
								"87-92", "93-98", "99-104", "105-110", "111-116", "117-122", "123-128", "129-134", "135-140", "141-146",
								"147-152", "153-158", "159-164", "165-170", "171-176", "177-182", "183-188"
							]
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************大乐透后区和值走势********************/
				case 'dlt_hzzs_hq':
					var title_name = ["和值"]; // pl3
					var title_style = ["bg4"];
					var title_data = [
						common.getIntNum(3, 23)
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************大乐透后区跨度走势********************/
				case 'dlt_kdzs_hq':
					var title_name = ["跨度"]; // pl3
					var title_style = ["bg4"];
					var title_data = [
						common.getIntNum(1, 11)
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************双色球大乐透跨度走势********************/
				case 'dlt_kdzs_qq':
				case 'ssq_kdzs_qq':
					var title_name = ["跨度"]; // pl3
					var title_style = ["bg4"];
					var title_data = [
						["4-8", "9-13", "14-18", "19-23", "24-28", "29-34"]
					]
					if (id.indexOf("ssq") > -1) {
						title_data = [
							common.getIntNum(5, 32)
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************差跨走势********************/
				case '3dr3_ckzs':
				case 'plsr3_ckzs':
				case 'hasha3_ckzs':
				case 'plwr5_ckzs':
					var title_name = ["任意两码差值", "同差走势", "跨度走势"]; // pl3
					var title_style = ["bg5", "bg3", "bg4"];
					var title_data = [
						common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************差值个数********************/
				case '3dr3_czgs':
				case 'plsr3_czgs':
				case 'hasha3_czgs':
				case 'plwr5_czgs':
					var title_name = ["差0个数", "差1个数", "差2个数", "差3个数", "差4个数", "差5个数", "差6个数", "差7个数", "差8个数", "差9个数"]; // pl3
					var title_style = ["bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
					var title_data = [
						[0, 1, 3], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
						common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(
							0, 2)
					]
					if (play_id == "plwr5") {
						var title_data = [
							[0, 1, 2, 3, 4, 6, 10], common.getIntNum(0, 6), common.getIntNum(0, 6), common.getIntNum(0, 6), [0, 1, 2, 3,
								4, 6
							],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6]
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************龙头凤尾********************/
				case '3dr3_ltfw':
				case 'plsr3_ltfw':
				case 'hasha3_ltfw':
				case 'plwr5_ltfw':
					var title_name = ["龙头", "凤尾", "龙头012路", "凤尾012路"]; // pl3
					var title_style = ["bg5", "bg4", "bg5", "bg3"];
					var title_data = [
						["单", "双", "质", "合", "大", "小"],
						["单", "双", "质", "合", "大", "小"], common.getIntNum(0, 2), common.getIntNum(0, 2)
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************012路走势********************/
				case '3dr3_012lzs':
				case 'plsr3_012lzs':
				case 'hasha3_012lzs':
				case 'plwr5_012lzs':
					var title_name = ["012路分布", "0路个数", "1路个数", "2路个数", "万位", "千位", "百位"]; // pl3
					var title_style = ["", "bg5", "bg3", "bg4", "bg3", "bg5", "bg4"];
					var title_data = [
						[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 3), common
						.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2)
					]
					if (play_id == "3dr3") {
						title_name = ["012路分布", "0路个数", "1路个数", "2路个数", "百位", "十位", "个位"]
					}
					if (play_id == "plwr5") {
						title_name = ["012路分布", "0路个数", "1路个数", "2路个数"]; // plw
						title_style = ["", "bg5", "bg3", "bg4"];
						title_data = [
							[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 5), common.getIntNum(0, 5), common.getIntNum(0, 5)
						]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************和合分布********************/
				case '3dr3_hhfb':
				case 'plsr3_hhfb':
				case 'hasha3_hhfb':
					var title_name = ["任意两码和值", "任意两码合值"]; // pl3
					var title_style = ["bg3", "bg5"];
					var title_data = [common.getIntNum(0, 18), common.getIntNum(0, 9)]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************均值走势********************/
				case '3dr3_jzzs':
				case 'plsr3_jzzs':
				case 'hasha3_jzzs':
					var title_name = ["均值", "均值属性"]; // pl3
					var title_style = ["bg3", "bg1"];
					var title_data = [common.getIntNum(0, 9), ["大", "小", "单", "双", "质", "合"]]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************和振走势********************/
				case '3dr3_hzhenzs':
				case 'plsr3_hzhenzs':
				case 'hasha3_hzhenzs':
					var title_name = ["和值振幅", "和振属性"]; // pl3
					var title_style = ["bg3", "bg1"];
					var title_data = [common.getIntNum(0, 27), ["大", "小", "单", "双", "质", "合"]]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************排列走势********************/
				case '3dr3_plzs':
				case 'plsr3_plzs':
				case 'hasha3_plzs':
					var title_name = ["最小数", "中间数", "最大数", "最小数", "中间数", "最大数"]; // pl3
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
					var title_data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), ["大", "小", "单", "双",
							"质", "合"
						],
						["大", "小", "单", "双", "质", "合"],
						["大", "小", "单", "双", "质", "合"]
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************定位分布********************/
				case '3dr3_dwfb':
				case 'plsr3_dwfb':
				case 'hasha3_dwfb':
					var title_name = ["万位", "千位", "百位", "万位", "千位", "百位"]; // pl3
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
					var title_data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), ["大", "小", "单", "双",
							"质", "合"
						],
						["大", "小", "单", "双", "质", "合"],
						["大", "小", "单", "双", "质", "合"]
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************012路定位********************/
				case 'plwr5_012ldw':
					var title_name = ["万位", "千位", "百位", "十位", "个位"]; // pl3
					var title_style = ["bg5", "bg4", "bg3", "bg5", "bg4"];
					var title_data = [common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
						common.getIntNum(0, 2)
					]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************代码走势********************/
				case '3dr3_dmzs':
				case 'plsr3_dmzs':
				case 'hasha3_dmzs':
					var title_name = ["万位", "千位", "百位"]; // pl3
					var title_style = ["bg4", "bg3", "bg5"];
					var title_data = [common.getStringNum(1, 10), common.getIntNum(11, 20), common.getIntNum(21, 30)]
					if (play_id == "3dr3") {
						title_name = ["百位", "十位", "个位"]; // 3d
						title_data = [common.getIntNum(21, 30), common.getIntNum(31, 40), common.getIntNum(41, 50)]
					}
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************代码图表********************/
					/*************平面走势********************/
				case '3dr3_pmzs_dm':
				case 'plsr3_pmzs_dm':
				case 'hasha3_pmzs_dm':
					var title_name = ["代码分布", "大小比", "奇偶比", "质合比"]; //3d pl3
					var title_style = ["", "bg3", "bg4", "bg5"];
					var title_data = [
						common.getStringNum(1, 12), common.getRatio(3, 6), common.getRatio(3, 6), common.getRatio(
							3, 6)
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************和值走势********************/
				case '3dr3_hhzs_dm':
				case 'plsr3_hhzs_dm':
				case 'hasha3_hhzs_dm':
					var title_name = ["和值走势", "合值走势"]; //3d pl3
					var title_style = ["bg4", "bg5"];
					var title_data = [common.getIntNum(48, 71), common.getIntNum(0, 9)]
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************012路走势********************/
				case '3dr3_012lzs_dm':
				case 'plsr3_012lzs_dm':
				case 'hasha3_012lzs_dm':
					var title_style = ["", "bg3", "bg4", "bg5"];
					var title_name = ["代码分布", "0路个数", "1路个数", "2路个数"]; //3d pl3
					var title_data = [
						["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"], common.getIntNum(1, 4), common.getIntNum(
							1, 4), common.getIntNum(1, 4)
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************连号重码********************/
				case '3dr3_lhcm_dm':
				case 'plsr3_lhcm_dm':
				case 'hasha3_lhcm_dm':
					var title_style = ["bg3", "bg4", "bg5"];
					var title_name = ["连号个数", "重码个数", "跨度"]; //3d pl3
					var title_data = [
						common.getIntNum(5, 7), common.getIntNum(6, 9), common.getIntNum(9, 11)
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************两码和个数********************/
				case '3dr3_lmhgsA_dm':
				case 'plsr3_lmhgsA_dm':
				case 'hasha3_lmhgsA_dm':
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3",
						"bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"
					];
					var title_name = ["和3个数", "和4个数", "和5个数", "和6个数", "和7个数", "和8个数", "和9个数", "和10个数", "和11个数", "和12个数", "和13",
						"和14个数", "和15个数", "和16个数", "和17个数", "和18个数", "和19个数", "和20个数", "和21个数", "和22", "和23"
					]; //3d pl3
					var title_data = [
						common.getIntNum(0, 1), common.getIntNum(0, 1), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(
							0, 3), common.getIntNum(0, 3), common.getIntNum(1, 3), common.getIntNum(1, 3), common.getIntNum(2, 4), common
						.getIntNum(2, 4), common.getIntNum(3, 4), common.getIntNum(2, 4), common.getIntNum(2, 4), common.getIntNum(1,
							3), common.getIntNum(1, 4), common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 2), common.getIntNum(
							0, 2), common.getIntNum(0, 1), common.getIntNum(0, 1)
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************两码合个数********************/
				case '3dr3_lmhgsB_dm':
				case 'plsr3_lmhgsB_dm':
				case 'hasha3_lmhgsB_dm':
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3"];
					var title_name = ["合0个数", "合1个数", "合2个数", "合3个数", "合4个数", "合5个数", "合6个数", "合7个数", "合8个数", "合9个数"]; //3d pl3
					var title_data = [
						common.getIntNum(1, 5), common.getIntNum(3, 5), common.getIntNum(2, 5), common.getIntNum(3, 6), common.getIntNum(
							2, 4), common.getIntNum(2, 5), common.getIntNum(2, 5), common.getIntNum(2, 5), common.getIntNum(2, 4), common
						.getIntNum(3, 5),
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************两码差个数********************/
				case '3dr3_lmcgs_dm':
				case 'plsr3_lmcgs_dm':
				case 'hasha3_lmcgs_dm':
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4"];
					var title_name = ["差1个数", "差2个数", "差3个数", "差4个数", "差5个数", "差6个数", "差7个数", "合8个数", "差9个数", "差10个数", "差11"]; //3d pl3
					var title_data = [
						common.getIntNum(5, 7), common.getIntNum(4, 7), common.getIntNum(4, 6), common.getIntNum(3, 6), common.getIntNum(
							3, 5), common.getIntNum(3, 4), common.getIntNum(2, 4), common.getIntNum(1, 3), common.getIntNum(0, 2), common
						.getIntNum(0, 2), common.getIntNum(0, 1),
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************三码和个数********************/
				case '3dr3_smhgsA_dm':
				case 'plsr3_smhgsA_dm':
				case 'hasha3_smhgsA_dm':
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3",
						"bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3"
					];
					var title_name = ["和6个数", "和7个数", "和8个数", "和9个数", "和10个数", "和11个数", "和12个数", "和13个数", "和14个数",
						"和15个数", "和16个数", "和17个数", "和18个数", "和19个数", "和20个数", "和21个数", "和22个数", "和23个数", "和24个数", "和25个数",
						"和26个数", "和27个数", "和28个数", "和29个数", "和30个数", "和31个数", "和32", "和33"
					]; //3d pl3
					var title_data = [
						common.getIntNum(0, 1), common.getIntNum(0, 1), common.getIntNum(0, 2), common.getIntNum(0, 3), common.getIntNum(
							0, 4), common.getIntNum(0, 4), common.getIntNum(0, 6), common.getIntNum(0, 5), common.getIntNum(1, 7), common
						.getIntNum(1, 7), common.getIntNum(2, 7), common.getIntNum(2, 7), common.getIntNum(4, 8), common.getIntNum(4,
							7), common.getIntNum(4, 7), common.getIntNum(4, 8), common.getIntNum(3, 7), common.getIntNum(2, 7), common.getIntNum(
							2, 8), common.getIntNum(1, 7), common.getIntNum(1, 7), [0, 1, 2, 3, 4, 6], common.getIntNum(0, 5), common.getIntNum(
							0, 4), common.getIntNum(0, 3), common.getIntNum(0, 2), common.getIntNum(0, 1), common.getIntNum(0, 1)
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
					/*************三码合个数********************/
				case '3dr3_smhgsB_dm':
				case 'plsr3_smhgsB_dm':
				case 'hasha3_smhgsB_dm':
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3"];
					var title_name = ["合0个数", "合1个数", "合2个数", "合3个数", "合4个数", "合5个数", "合6个数", "合7个数", "合8个数", "合9个数"]; //3d pl3
					var title_data = [
						[5, 7, 8, 9, 10], common.getIntNum(6, 10), common.getIntNum(6, 11), common.getIntNum(6, 11), common.getIntNum(
							7, 11), [7, 8, 9, 11], common.getIntNum(6, 10), common.getIntNum(7, 11), common.getIntNum(7, 12), [5, 7, 8, 9,
							10
						]
					];
					json.name = title_name;
					json.data = title_data;
					json.style = title_style;
					break;
				default:
					break;
			}
			return json;
		},
		init_bottom: function(obj) {
			var play_id = obj.play_id;
			var chart_id = obj.chart_id;
			var json;
			if (common.isNull(obj.dm)) {
				json = this.bottom(play_id, chart_id, obj.dis, "dm");
			} else {
				json = this.bottom(play_id, chart_id, obj.dis);
			}
			console.log('json',json)
			var width = common.special();
			var html_tit = '';
			var html = '';
			var colgroup = '';
			var content_col = '';
			var html1 = '';
			
			if (obj.dis == "qq" && chart_id == 'pmzs' && (play_id == 'ssq' || play_id == 'dlt')) {
				json = this.specialBottom(play_id, chart_id, obj.dis);
				for (var i = 0; i < json.data.length; i++) {
					/*加载列数和列数颜色*/
					if (json.data[i].length == 0) {
						colgroup += '<col width="' + width + '" span="1">';
					} else {
						colgroup += '<col width="' + width + '" class="' + json.style[i] + '" span="' + json.data[i].length + '">';
					}
					colgroup += '</col>';
					/*加载号码比例等数据*/
					for (var j = 0; j < json.data[i].length; j++) {
						if (json.span[i].split(",").length > 1) {
							html += '<td id="o' + json.id[i][j] + '" span="' + json.span[i].split(",")[j] + '" alt="' + json.alt[i] +
								'" value="' + json.val[i][j] + '" onclick="common.clickSubmit(this)" class="fline">' + json.data[i][j] +
								'</td>'
						} else {
							html += '<td id="o' + json.id[i][j] + '" span="' + json.span[i] + '" alt="' + json.alt[i] + '" value="' + json
								.val[i][j] + '" onclick="common.clickSubmit(this)" class="fline">' + json.data[i][j] + '</td>'
						}
						if (json.span[i].split(",").length > 1) {
							html1 += '<td id="t' + json.id[i][j] + '" span="' + json.span[i].split(",")[j] + '" alt="' + json.alt[i] +
								'" value="' + json.val[i][j] + '" onclick="common.clickSubmit(this)" class="fline">' + json.data[i][j] +
								'</td>'
						} else {
							html1 += '<td id="t' + json.id[i][j] + '" span="' + json.span[i] + '" alt="' + json.alt[i] + '" value="' +
								json
								.val[i][j] + '" onclick="common.clickSubmit(this)" class="fline">' + json.data[i][j] + '</td>'
						}
					}
				}
				$("#tjc2").html(html1);
			} else {
				for (var i = 0; i < json.data.length; i++) {
					/*加载列数和列数颜色*/
					if (json.data[i].length == 0) {
						colgroup += '<col width="' + width + '" span="1">';
					} else {
						colgroup += '<col width="' + width + '" class="' + json.style[i] + '" span="' + json.data[i].length + '">';
					}
					colgroup += '</col>';
					/*加载号码比例等数据*/
					if (json.data[i].length == 0) {
						html += '<td></td>'
					} else {
						for (var j = 0; j < json.data[i].length; j++) {
							if (json.span[i].split(",").length > 1) {
								html += '<td id="' + json.id[i][j] + '" span="' + json.span[i].split(",")[j] + '" alt="' + json.alt[i] +
									'" value="' + json.val[i][j] + '" onclick="common.clickSubmit(this)" class="fline">' + json.data[i][j] +
									'</td>'
							} else {
								html += '<td id="' + json.id[i][j] + '" span="' + json.span[i] + '" alt="' + json.alt[i] + '" value="' + json
									.val[i][j] + '" onclick="common.clickSubmit(this)" class="fline">' + json.data[i][j] + '</td>'
							}
						}
					}
				}
			}
			$("#bottom_col").html(colgroup);
			$("#tjc1").html(html);
		},
		/*双色球 大乐透走势*/
		specialBottom: function(play_id, chart_id, dis) {
			var id = play_id + "_" + chart_id + "_" + dis;
			var json = {};
			switch (id) {
				case 'ssq_pmzs_qq':
				case 'dlt_pmzs_qq':
					var span = ["0", "0", "0"]; //条件id
					var title_name = ["一区", "二区", "三区"];
					var title_style = ["bg4", "bg5", "bg3"];
					var alt = ["dcbred001", "dcbred001", "dcbred001"];
					var id = [
						common.getIntNum(1, 11),
						common.getIntNum(12, 22),
						common.getIntNum(23, 33),
					];
					var title_data = [
						common.getStringNum(1, 11), common.getStringNum(12, 22), common.getStringNum(23, 33)
					];
					var title_val = [
						common.getStringNum(1, 11), common.getStringNum(12, 22), common.getStringNum(23, 33)
					];
					if (play_id == "dlt") {
						alt = ["splored001", "splored001", "splored001"];
						id = [
							common.getIntNum(1, 12),
							common.getIntNum(13, 24),
							common.getIntNum(25, 35),
						];
						title_data = [
							common.getStringNum(1, 12), common.getStringNum(13, 24), common.getStringNum(25, 35)
						];
						title_val = [
							common.getStringNum(1, 12), common.getStringNum(13, 24), common.getStringNum(25, 35)
						];
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				default:
					break;
			}
			return json;
		},
		bottom: function(play_id, chart_id, dis, type) {
			var id = play_id + "_" + chart_id;
			if (common.isNull(type)) {
				id = play_id + "_" + chart_id + "_" + type;
			}
			if (common.isNull(dis)) {
				id = play_id + "_" + chart_id + "_" + dis;
			}
			var json = {};
			switch (id) {
				/*************平面走势********************/
				case '3dr3_pmzs':
				case 'plsr3_pmzs':
				case 'hasha3_pmzs':
				case 'plwr5_pmzs':
					var title_style = ["", "", "bg5", "bg3", "bg4", ""]; //背景颜色
					var alt = ["", "3dr3001", "3dr3010", "3dr3010", "3dr3010", ""]; //条件id
					var span = ["", "0", "0", "1", "2", ""]; //条件id
					var title_data = [
						[], common.getIntNum(0, 9), common.getReverseRatio(0, 3), common.getReverseRatio(0, 3), common.getReverseRatio(
							0, 3), []
					]; //显示的数据
					var title_val = [
						[], common.getIntNum(0, 9), common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 3), []
					]; //传到前一个页面的值
					var id = [
						[],
						[],
						[],
						[],
						[],
						[]
					]; //条件互斥
					//双色球 大乐透 七星彩能用到
					var title_data2 = []; //显示的数据 
					var title_val2 = []; //传到前一个页面的值
					if (play_id == "plsr3") {
						alt = ["", "plsr3001", "plsr3010", "plsr3010", "plsr3010", ""];
					}
					if (play_id == "hasha3") {
						alt = ["", "hasha3001", "hasha3010", "hasha3010", "hasha3010", ""];
					}
					if (play_id == "plwr5") {
						title_style = ["", "bg5", "bg3", "bg4", ""];
						alt = ["plwr5001", "plwr5008", "plwr5008", "plwr5008", ""];
						var span = ["0", "0", "1", "2", ""]; //条件id
						title_data = [
							common.getIntNum(0, 9), common.getReverseRatio(0, 5), common.getReverseRatio(0, 5), common.getReverseRatio(0,
								5), []
						];
						title_val = [
							common.getIntNum(0, 9), common.getIntNum(0, 5), common.getIntNum(0, 5), common.getIntNum(0,
								5), []
						];
						id = [
							[],
							[],
							[],
							[],
							[]
						]; //条件互斥

					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case 'animalsa2_pmzs':
				case 'animalsq2_pmzs':
					var title_style = [ "", "bg5", "bg3", "bg4", ""]; //背景颜色
					var alt = ["3dr3001", "3dr3010", "3dr3010", "3dr3010", ""]; //条件id
					var span = ["0", "0", "1", "2", ""]; //条件id
					var title_data = [
						common.getIntNum(1, 6), common.getReverseRatio(0, 2), common.getReverseRatio(0, 2), common.getReverseRatio(
							0, 2), []
					]; //显示的数据
					var title_val = [
						common.getIntNum(1, 6), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), []
					]; //传到前一个页面的值
					var id = [
					
						[],
						[],
						[],
						[],
						[]
					]; //条件互斥
					var title_data2 = []; //显示的数据 
					var title_val2 = []; //传到前一个页面的值
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************立体走势********************/
				case '3dr3_ltzs':
				case 'plsr3_ltzs':
				case 'hasha3_ltzs':
				case 'plwr5_ltzs':
					var title_style = ["bg4", "bg5", "bg3"]; //背景颜色
					var alt = ["plsr3006", "plsr3006", "plsr3006"]; //条件id
					var span = ["0", "1", "2"]; //条件id
					var title_data = [
						common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)
					]
					var title_val = [
						common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)
					]
					id = [
						[],
						[],
						[],
						[],
						[]
					];
					if (play_id == "3dr3") {
						alt = ["3dr3006", "3dr3006", "3dr3006"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3006", "hasha3006", "hasha3006"]; //条件id
					}
					if (play_id == "plwr5") {
						title_style = ["bg4", "bg5", "bg3", "bg4", "bg5"];
						alt = ["plwr5005", "plwr5005", "plwr5005", "plwr5005", "plwr5005"]; //条件id
						span = ["0", "1", "2", "3", "4"]; //条件id
						title_data = [
							common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(
								0, 9)
						]
						title_val = [
							common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(
								0, 9)
						]
						span = ["0", "1", "2", "3", "4"];
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************和合走势********************/
				case '3dr3_hhzs':
				case 'plsr3_hhzs':
				case 'hasha3_hhzs':
				case 'plwr5_hhzs':
					var title_style = ["bg5", "bg4"]; //背景颜色
					var alt = ["plsr3007", "plsr3003"]; //条件id
					var span = ["0", "0"]; //条件id
					var title_data = [
						["0-9", "10-18", "19-27"], common.getIntNum(0, 9),
					]
					var title_val = [
						[0, 1, 2], common.getIntNum(0, 9),
					]
					id = [
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = ["3dr3007", "3dr3003"]; //条件id
					}
					if (play_id == "hasha3") {
						alt =["hasha3007", "hasha3003"]; //条件id
					}
					if (play_id == "plwr5") {
						alt = ["plwr5006", "plwr5003"]; //条件id
						title_data = [
							["0-9", "10-18", "19-27", "28-26", "37-45"], common.getIntNum(0, 9),
						]
						title_val = [
							[0, 1, 2, 3, 4], common.getIntNum(0, 9),
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************和值走势********************/
				case '3dr3_hzzs':
				case 'plsr3_hzzs':
				case 'hasha3_hzzs':
				case 'plwr5_hzzs':
					var title_style = ["bg3", "bg5", "bg4", "bg5"]; //背景颜色
					var alt = ["", "plsr3002", "plsr3002", "plsr3002"]; //条件id
					var span = ["", "0", "0", "0"]; //条件id
					var title_data = [
						[], common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)
					]
					var title_val = [
						[], common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)
					]
					id = [
						[],
						[],
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = ["", "3dr3002", "3dr3002", "3dr3002"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["", "hasha3002", "hasha3002", "hasha3002"]; //条件id
					}
					if (play_id == "plwr5") {
						alt = ["", "plwr5002", "plwr5002", "plwr5002"]; //条件id
						title_data = [
							[], common.getIntNum(0, 14), common.getIntNum(15, 30), common.getIntNum(31, 45)
						]
						title_val = [
							[], common.getIntNum(0, 14), common.getIntNum(15, 30), common.getIntNum(31, 45)
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************双色球大乐透后区平面走势********************/
				case 'dlt_pmzs_hq':
				case 'ssq_pmzs_hq':
					var title_style = ["bg1"]; //背景颜色
					var alt = ["sploblue001"]; //条件id
					var span = ["0"]; //条件id
					var title_data = [
						common.getStringNum(1, 12)
					]
					var title_val = [
						common.getStringNum(1, 12)
					]
					var id = [
						[],
					];
					if (id.indexOf("ssq") > -1) {
						alt = ["dcbred001"]; //条件id
						title_data = [
							["21-26", "27-32", "33-38", "39-44", "45-50", "51-56", "57-62", "63-68", "69-74", "75-80", "81-86",
								"87-92", "93-98", "99-104", "105-110", "111-116", "117-122", "123-128", "129-134", "135-140", "141-146",
								"147-152", "153-158", "159-164", "165-170", "171-176", "177-182", "183-188"
							]
						]
						title_val = [
							common.getIntNum(0, 28)
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************大乐透和值走势********************/
				case 'dlt_hzzs_qq':
				case 'ssq_hzzs_qq':
					var title_style = ["bg4"]; //背景颜色
					var alt = ["splored002"]; //条件id
					var span = ["0"]; //条件id
					var title_data = [
						["15-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75-84", "85-94", "95-104", "105-114", "115-124",
							"125-134", "135-144", "145-154", "155-165"
						]
					]
					var title_val = [
						common.getIntNum(0, 14)
					]
					if (id.indexOf("ssq") > -1) {
						alt = ["dcbred002"]; //条件id
						title_data = [
							["21-26", "27-32", "33-38", "39-44", "45-50", "51-56", "57-62", "63-68", "69-74", "75-80", "81-86",
								"87-92", "93-98", "99-104", "105-110", "111-116", "117-122", "123-128", "129-134", "135-140", "141-146",
								"147-152", "153-158", "159-164", "165-170", "171-176", "177-182", "183-188"
							]
						]
						title_val = [
							common.getIntNum(0, 27)
						]
					}
					var id = [
						[],
					];

					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************大乐透和值走势********************/
				case 'dlt_hzzs_hq':
					var title_style = ["bg4"]; //背景颜色
					var alt = ["sploblue002"]; //条件id
					var span = ["0"]; //条件id
					var title_data = [
						common.getIntNum(3, 23)
					]
					var title_val = [
						common.getIntNum(3, 23)
					]
					var id = [
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************大乐透后区跨度走势********************/
				case 'dlt_kdzs_hq':
					var title_style = ["bg4"]; //背景颜色
					var alt = ["sploblue003"]; //条件id
					var span = ["0"]; //条件id
					var title_data = [
						common.getIntNum(1, 11)
					]
					var title_val = [
						common.getIntNum(1, 11)
					]
					var id = [
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************双色球大乐透跨度走势********************/
				case 'ssq_kdzs_qq':
				case 'dlt_kdzs_qq':
					var title_style = ["bg4"]; //背景颜色
					var alt = ["splored003"]; //条件id
					var span = ["0"]; //条件id
					var title_data = [
						["4-8", "9-13", "14-18", "19-23", "24-28", "29-34"]
					]
					var title_val = [
						common.getIntNum(0, 5)
					]
					id = [
						[],
					];
					if (play_id == "ssq") {
						alt = ["dcbred003"]; //条件id
						title_data = [
							common.getIntNum(5, 32)
						]
						title_val = [
							common.getIntNum(5, 32)
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************差跨走势********************/
				case '3dr3_ckzs':
				case 'plsr3_ckzs':
				case 'hasha3_ckzs':
				case 'plwr5_ckzs':
					var title_style = ["bg5", "bg3", "bg4"]; //背景颜色
					var alt = ["plsr3014", "plsr3008", "plsr3004"]; //条件id
					var span = ["0", "0,1,2,3,4,5,6,7,8,9", "0"]; //条件id
					var title_data = [
						common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)
					]
					var title_val = [
						common.getIntNum(0, 9), ["3", "2", "2", "2", "2", "2", "2", "2", "2", "2"], common.getIntNum(0, 9)
					]
					id = [
						[],
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = ["3dr3014", "3dr3008", "3dr3004"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3014", "hasha3008", "hasha3004"]; //条件id
					}
					if (play_id == "plwr5") {
						alt = ["plwr5012", "plwr5007", "plwr5004"]; //条件id
						title_val = [
							common.getIntNum(0, 9), ["2,3,4,6,10", "2,3,4,5,6", "2,3,4,5,6", "2,3,4,5,6", "2,3,4,6", "2,3,4,6", "2,3,4,6",
								"2,3,4,6", "2,3,4,6", "2,3,4,6"
							], common.getIntNum(0, 9)
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************差值个数********************/
				case '3dr3_czgs':
				case 'plsr3_czgs':
				case 'hasha3_czgs':
				case 'plwr5_czgs':
					var title_style = ["bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"]; //背景颜色
					var alt = common.getCondition("plsr3008", title_style.length); //条件id
					var span = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]; //条件id
					var title_data = [
						[0, 1, 3], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
						common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(
							0, 2)
					]
					var title_val = [
						[0, 1, 3], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
						common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(
							0, 2)
					]
					id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = common.getCondition("3dr3008", title_style.length); //条件id
					}
					if (play_id == "hasha3") {
						alt = common.getCondition("hasha3008", title_style.length); //条件id
					}
					if (play_id == "plwr5") {
						alt = common.getCondition("plwr5007", title_style.length); //条件id
						title_data = [
							[0, 1, 2, 3, 4, 6, 10], common.getIntNum(0, 6), common.getIntNum(0, 6), common.getIntNum(0, 6), [0, 1, 2, 3,
								4, 6
							],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6]
						]
						title_val = [
							[0, 1, 2, 3, 4, 6, 10], common.getIntNum(0, 6), common.getIntNum(0, 6), common.getIntNum(0, 6), [0, 1, 2, 3,
								4, 6
							],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6],
							[0, 1, 2, 3, 4, 6]
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************龙头凤尾********************/
				case '3dr3_ltfw':
				case 'plsr3_ltfw':
				case 'hasha3_ltfw':
				case 'plwr5_ltfw':
					var title_style = ["bg5", "bg4", "bg5", "bg3"]; //背景颜色
					var alt = common.getCondition("plsr3012", title_style.length); //条件id
					var span = ["0,0,3,3,6,6", "1,1,4,4,7,7", "9", "10"]; //条件id
					var title_data = [
						["单", "双", "质", "合", "大", "小"],
						["单", "双", "质", "合", "大", "小"], common.getIntNum(0, 2), common.getIntNum(0, 2)
					]
					var title_val = [
						[0, 1, 0, 1, 0, 1],
						[0, 1, 0, 1, 0, 1], common.getIntNum(0, 2), common.getIntNum(0, 2)
					]
					id = [
						["ltd", "lts", "ltz", "lth", "lt_da", "lt_xiao"],
						["fwd", "fws", "fwz", "fwh", "fw_da", "fw_xiao"],
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = common.getCondition("3dr3012", title_style.length); //条件id
					}
					if (play_id == "hasha3") {
						alt = common.getCondition("hasha3012", title_style.length); //条件id
					}
					if (play_id == "plwr5") {
						alt = common.getCondition("plwr5010", title_style.length); //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************012路走势********************/
				case '3dr3_012lzs':
				case 'plsr3_012lzs':
				case 'hasha3_012lzs':
				case 'plwr5_012lzs':
					var title_style = ["", "bg5", "bg3", "bg4", "bg3", "bg5", "bg4"]; //背景颜色
					var alt = ["plsr3001", "plsr3013", "plsr3013", "plsr3013", "plsr3006", "plsr3006", "plsr3006"]; //条件id
					var span = ["0", "0", "1", "2", "0", "1", "2"]; //条件ulid
					var title_data = [
						[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 3), common
						.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2)
					]
					var title_val = [
						[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 3), [
							"0,3,6,9", "1,4,7", "2,5,8"
						],
						["0,3,6,9", "1,4,7", "2,5,8"],
						["0,3,6,9", "1,4,7", "2,5,8"]
					]
					id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = ["3dr3001", "3dr3013", "3dr3013", "3dr3013", "3dr3006", "3dr3006", "3dr3006"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3001", "hasha3013", "hasha3013", "hasha3013", "hasha3006", "hasha3006", "hasha3006"]; //条件id
					}
					if (play_id == "plwr5") {
						alt = ["plwr5001", "plwr5011", "plwr5011", "plwr5011"]; //条件id
						span = ["0", "0", "1", "2"]; //条件ulid
						title_data = [
							[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 5), common.getIntNum(0, 5), common.getIntNum(0, 5)
						]
						title_val = [
							[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 5), common.getIntNum(0, 5), common.getIntNum(0, 5)
						]
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case '3dr3_hhfb':
				case 'plsr3_hhfb':
				case 'hasha3_hhfb':
					var title_style = ["bg3", "bg5"]; //背景颜色
					var alt = ["plsr3017", "plsr3016"]; //条件id
					var span = ["0", "0"]; //条件ulid
					var title_data = [common.getIntNum(0, 18), common.getIntNum(0, 9)]
					var title_val = [common.getIntNum(0, 18), common.getIntNum(0, 9)]
					id = [
						[],
						[],
					];
					if (play_id == "3dr3") {
						alt = ["3dr3017", "3dr3016"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3017", "hasha3016"]; //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case '3dr3_jzzs':
				case 'plsr3_jzzs':
				case 'hasha3_jzzs':
					var title_style = ["bg3", "bg1"]; //背景颜色
					var alt = ["plsr3019", "plsr3020"]; //条件id
					var span = ["0", "0,0,1,1,2,2"]; //条件ulid
					var title_data = [common.getIntNum(0, 9), ["大", "小", "单", "双", "质", "合"]]
					var title_val = [common.getIntNum(0, 9), [0, 1, 0, 1, 0, 1]]
					id = [
						[],
						["lt_dan", "lt_shuang", "lt_zhi", "lt_he", "lt_da", "lt_xiao"]
					];
					if (play_id == "3dr3") {
						alt = ["3dr3019", "3dr3020"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3019", "hasha3020"]; //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case '3dr3_hzhenzs':
				case 'plsr3_hzhenzs':
				case 'hasha3_hzhenzs':
					var title_style = ["bg3", "bg1"]; //背景颜色
					var alt = ["plsr3021", "plsr3022"]; //条件id
					var span = ["0", "0,0,1,1,2,2"]; //条件ulid
					var title_data = [common.getIntNum(0, 27), ["大", "小", "单", "双", "质", "合"]]
					var title_val = [common.getIntNum(0, 27), [0, 1, 0, 1, 0, 1]]
					id = [
						[],
						["lt_dan", "lt_shuang", "lt_zhi", "lt_he", "lt_da", "lt_xiao"]
					];
					if (play_id == "3dr3") {
						alt = ["3dr3021", "3dr3022"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3021", "hasha3022"]; //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case '3dr3_plzs':
				case 'plsr3_plzs':
				case 'hasha3_plzs':
					var title_name = ["最小数", "中间数", "最大数", "最小数", "中间数", "最大数"]; // pl3
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
					var alt = ["plsr3023", "plsr3023", "plsr3023", "plsr3024", "plsr3024", "plsr3024"]; //条件id
					var span = ["0", "1", "2", "0,0,1,1,2,2", "4,4,5,5,6,6", "8,8,9,9,10,10"]; //条件ulid
					var title_data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), ["大", "小", "单", "双",
							"质", "合"
						],
						["大", "小", "单", "双", "质", "合"],
						["大", "小", "单", "双", "质", "合"]
					]
					var title_val = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), [0, 1, 0, 1, 0, 1],
						[0, 1, 0, 1, 0, 1],
						[0, 1, 0, 1, 0, 1]
					]
					id = [
						[],
						[],
						[],
						["zx_da", "zx_xiao", "zx_dan", "zx_shuang", "zx_zhi", "zx_he"],
						["zj_da", "zj_xiao", "zj_dan", "zj_shuang", "zj_zhi", "zj_he"],
						["zd_da", "zd_xiao", "zd_dan", "zd_shuang", "zd_zhi", "zd_he"],
					];
					if (play_id == "3dr3") {
						alt = ["3dr3023", "3dr3023", "3dr3023", "3dr3024", "3dr3024", "3dr3024"]; //条件id
					}
					if (play_id == "hasha3") {
						alt = ["hasha3023", "hasha3023", "hasha3023", "hasha3024", "hasha3024", "hasha3024"]; //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case '3dr3_dwfb':
				case 'plsr3_dwfb':
				case 'hasha3_dwfb':
					var title_name = ["万位", "千位", "百位", "万位", "千位", "百位"]; // pl3
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
					var alt = ["plsr3025", "plsr3025", "plsr3025", "plsr3026", "plsr3026", "plsr3026"]; //条件id
					var span = ["0", "1", "2", "0,0,1,1,2,2", "4,4,5,5,6,6", "8,8,9,9,10,10"]; //条件ulid
					var title_data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), ["大", "小", "单", "双",
							"质", "合"
						],
						["大", "小", "单", "双", "质", "合"],
						["大", "小", "单", "双", "质", "合"]
					]
					var title_val = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), [0, 1, 0, 1, 0, 1],
						[0, 1, 0, 1, 0, 1],
						[0, 1, 0, 1, 0, 1]
					]
					id = [
						[],
						[],
						[],
						["zx_da", "zx_xiao", "zx_dan", "zx_shuang", "zx_zhi", "zx_he"],
						["zj_da", "zj_xiao", "zj_dan", "zj_shuang", "zj_zhi", "zj_he"],
						["zd_da", "zd_xiao", "zd_dan", "zd_shuang", "zd_zhi", "zd_he"],
					];
					if (play_id == "3dr3") {
						title_name = ["百位", "十位", "个位", "百位", "十位", "个位"]; // pl3
						alt = ["3dr3025", "3dr3025", "3dr3025", "3dr3026", "3dr3026", "3dr3026"]; //条件id
					}
					if (play_id == "hasha3") {
						title_name = ["万位", "千位", "百位", "万位", "千位", "百位"]; // pl3
						alt = ["hasha3025", "hasha3025", "hasha3025", "hasha3026", "hasha3026", "hasha3026"]; //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case 'plwr5_012ldw':
					var title_style = ["bg5", "bg4", "bg3", "bg5", "bg4"];
					var alt = ["plwr5005", "plwr5005", "plwr5005", "plwr5005", "plwr5005"]; //条件id
					var span = ["0", "1", "2", "3", "4"]; //条件ulid
					var title_data = [common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
						common.getIntNum(0, 2)
					]

					var title_val = [
						["0,3,6,9", "1,4,7", "2,5,8"],
						["0,3,6,9", "1,4,7", "2,5,8"],
						["0,3,6,9", "1,4,7", "2,5,8"],
						["0,3,6,9", "1,4,7", "2,5,8"],
						["0,3,6,9", "1,4,7", "2,5,8"]
					]
					id = [
						[],
						[],
						[],
						[],
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				case '3dr3_dmzs':
				case 'plsr3_dmzs':
				case 'hasha3_dmzs':
					var title_style = ["bg4", "bg3", "bg5"];
					var code_id = common.cookieGet("code_id");
					var alt = common.getCondition("plsr3dmzs" + code_id.substring(code_id.length - 1, code_id.length), title_style.length); //条件id
					var span = ["0", "2", "4"]; //条件ulid
					var title_data = [common.getStringNum(1, 10), common.getIntNum(11, 20), common.getIntNum(21, 30)]

					var title_val = [
						common.getStringNum(1, 10), common.getIntNum(11, 20), common.getIntNum(21, 30)
					]
					id = [
						[],
						[],
						[],
					];
					if (play_id == "3dr3") {
						title_name = ["百位", "十位", "个位"]; // 3d
						title_data = [common.getIntNum(21, 30), common.getIntNum(31, 40), common.getIntNum(41, 50)]
						title_val = [common.getIntNum(21, 30), common.getIntNum(31, 40), common.getIntNum(41, 50)]
						alt = common.getCondition("3dr3dmzs" + code_id.substring(code_id.length - 1, code_id.length), title_style.length); //条件id
					}
					if (play_id == "hasha3") {
						title_name = ["万位", "千位", "百位"]; // 3d
						title_data = [common.getStringNum(1, 10), common.getIntNum(11, 20), common.getIntNum(21, 30)]
						title_val = [common.getStringNum(1, 10), common.getIntNum(11, 20), common.getIntNum(21, 30)]
						alt = common.getCondition("hasha3dmzs" + code_id.substring(code_id.length - 1, code_id.length), title_style.length); //条件id
					}
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/***************代码图表********************/
					/*************平面走势********************/
				case '3dr3_pmzs_dm':
				case 'plsr3_pmzs_dm':
				case 'hasha3_pmzs_dm':
					var title_style = ["", "bg3", "bg4", "bg5"];
					var span = ["0", "2", "0", "1"]; //条件ulid
					var alt = [play_id + common.cookieGet("dm") + "01", play_id + common.cookieGet("dm") + "05", play_id + common.cookieGet(
						"dm") + "05", play_id + common.cookieGet("dm") + "05"];
					var title_data = [
						common.getStringNum(1, 12), common.getRatio(3, 6), common.getRatio(3, 6), common.getRatio(
							3, 6)
					];
					var title_val = [
						common.getStringNum(1, 12), common.getReverse(3, 6), common.getReverse(3, 6), common.getReverse(3, 6)
					]
					id = [
						[],
						[],
						[],
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************和合走势********************/
				case '3dr3_hhzs_dm':
				case 'plsr3_hhzs_dm':
				case 'hasha3_hhzs_dm':
					var title_style = ["bg4", "bg5"];
					var span = ["0", "0"]; //条件ulid
					var alt = [play_id + common.cookieGet("dm") + "02", play_id + common.cookieGet("dm") + "03"];
					var title_data = [
						common.getIntNum(48, 71), common.getIntNum(0, 9)
					];
					var title_val = [common.getIntNum(48, 71), common.getIntNum(0, 9)]
					id = [
						[],
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************012路走势********************/
				case '3dr3_012lzs_dm':
				case 'plsr3_012lzs_dm':
				case 'hasha3_012lzs_dm':
					var title_style = ["", "bg3", "bg4", "bg5"];
					var span = ["0", "0", "1", "2"]; //条件ulid
					var alt = [play_id + common.cookieGet("dm") + "01", play_id + common.cookieGet("dm") + "07", play_id + common.cookieGet(
						"dm") + "07", play_id + common.cookieGet("dm") + "07"];
					var title_data = [
						["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"], common.getIntNum(1, 4), common.getIntNum(
							1, 4), common.getIntNum(1, 4)
					];
					var title_val = [
						["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"], common.getIntNum(1, 4), common.getIntNum(
							1, 4), common.getIntNum(1, 4)
					]
					id = [
						[],
						[],
						[],
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************连号重码********************/
				case '3dr3_lhcm_dm':
				case 'plsr3_lhcm_dm':
				case 'hasha3_lhcm_dm':
					var title_style = ["bg3", "bg4", "bg5"];
					var span = ["0", "1", "0"]; //条件ulid
					var alt = [play_id + common.cookieGet("dm") + "06", play_id + common.cookieGet("dm") + "06", play_id + common.cookieGet(
						"dm") + "04"];
					var title_data = [
						common.getIntNum(5, 7), common.getIntNum(6, 9), common.getIntNum(9, 11)
					];
					var title_val = [
						common.getIntNum(5, 7), common.getIntNum(6, 9), common.getIntNum(9, 11)
					]
					id = [
						[],
						[],
						[],
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************两码和个数********************/
				case '3dr3_lmhgsA_dm':
				case 'plsr3_lmhgsA_dm':
				case 'hasha3_lmhgsA_dm':
					var id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];

					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3",
						"bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"
					];
					var alt = common.getCondition(play_id + common.cookieGet("dm") + "08", title_style.length);
					var span = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17",
						"18", "19", "20"
					]; //条件ulid
					var title_data = [
						common.getIntNum(0, 1), common.getIntNum(0, 1), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(
							0, 3), common.getIntNum(0, 3), common.getIntNum(1, 3), common.getIntNum(1, 3), common.getIntNum(2, 4), common
						.getIntNum(2, 4), common.getIntNum(3, 4), common.getIntNum(2, 4), common.getIntNum(2, 4), common.getIntNum(1,
							3), common.getIntNum(1, 4), common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 2), common.getIntNum(
							0, 2), common.getIntNum(0, 1), common.getIntNum(0, 1)
					];
					var title_val = [
						common.getIntNum(0, 1), common.getIntNum(0, 1), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(
							0, 3), common.getIntNum(0, 3), common.getIntNum(1, 3), common.getIntNum(1, 3), common.getIntNum(2, 4), common
						.getIntNum(2, 4), common.getIntNum(3, 4), common.getIntNum(2, 4), common.getIntNum(2, 4), common.getIntNum(1,
							3), common.getIntNum(1, 4), common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 2), common.getIntNum(
							0, 2), common.getIntNum(0, 1), common.getIntNum(0, 1)
					]
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************两码合个数********************/
				case '3dr3_lmhgsB_dm':
				case 'plsr3_lmhgsB_dm':
				case 'hasha3_lmhgsB_dm':
					var id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3"];
					var alt = common.getCondition(play_id + common.cookieGet("dm") + "09", title_style.length);
					var span = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]; //条件ulid
					var title_val = [
						common.getIntNum(1, 5), common.getIntNum(3, 5), common.getIntNum(2, 5), common.getIntNum(3, 6), common.getIntNum(
							2, 4), common.getIntNum(2, 5), common.getIntNum(2, 5), common.getIntNum(2, 5), common.getIntNum(2, 4), common
						.getIntNum(3, 5),
					]
					var title_data = [
						common.getIntNum(1, 5), common.getIntNum(3, 5), common.getIntNum(2, 5), common.getIntNum(3, 6), common.getIntNum(
							2, 4), common.getIntNum(2, 5), common.getIntNum(2, 5), common.getIntNum(2, 5), common.getIntNum(2, 4), common
						.getIntNum(3, 5),
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					console.log()
					break;
					/*************两码差个数********************/
				case '3dr3_lmcgs_dm':
				case 'plsr3_lmcgs_dm':
				case 'hasha3_lmcgs_dm':
					var id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4"];
					var alt = common.getCondition(play_id + common.cookieGet("dm") + "10", title_style.length);
					var span = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]; //条件ulid
					var title_val = [
						common.getIntNum(5, 7), common.getIntNum(4, 7), common.getIntNum(4, 6), common.getIntNum(3, 6), common.getIntNum(
							3, 5), common.getIntNum(3, 4), common.getIntNum(2, 4), common.getIntNum(1, 3), common.getIntNum(0, 2), common
						.getIntNum(0, 2), common.getIntNum(0, 1),
					]
					var title_data = [
						common.getIntNum(5, 7), common.getIntNum(4, 7), common.getIntNum(4, 6), common.getIntNum(3, 6), common.getIntNum(
							3, 5), common.getIntNum(3, 4), common.getIntNum(2, 4), common.getIntNum(1, 3), common.getIntNum(0, 2), common
						.getIntNum(0, 2), common.getIntNum(0, 1),
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************三码和个数********************/
				case '3dr3_smhgsA_dm':
				case 'plsr3_smhgsA_dm':
				case 'hasha3_smhgsA_dm':
					var id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3",
						"bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3"
					];
					var alt = common.getCondition(play_id + common.cookieGet("dm") + "11", title_style.length);
					var span = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17",
						"18", "19", "20", "21", "22", "23", "24", "25", "26", "27"
					]; //条件ulid
					var title_val = [
						common.getIntNum(0, 1), common.getIntNum(0, 1), common.getIntNum(0, 2), common.getIntNum(0, 3), common.getIntNum(
							0, 4), common.getIntNum(0, 4), common.getIntNum(0, 6), common.getIntNum(0, 5), common.getIntNum(1, 7), common
						.getIntNum(1, 7), common.getIntNum(2, 7), common.getIntNum(2, 7), common.getIntNum(4, 8), common.getIntNum(4,
							7), common.getIntNum(4, 7), common.getIntNum(4, 8), common.getIntNum(3, 7), common.getIntNum(2, 7), common.getIntNum(
							2, 8), common.getIntNum(1, 7), common.getIntNum(1, 7), [0, 1, 2, 3, 4, 6], common.getIntNum(0, 5), common.getIntNum(
							0, 4), common.getIntNum(0, 3), common.getIntNum(0, 2), common.getIntNum(0, 1), common.getIntNum(0, 1)
					]
					var title_data = [
						common.getIntNum(0, 1), common.getIntNum(0, 1), common.getIntNum(0, 2), common.getIntNum(0, 3), common.getIntNum(
							0, 4), common.getIntNum(0, 4), common.getIntNum(0, 6), common.getIntNum(0, 5), common.getIntNum(1, 7), common
						.getIntNum(1, 7), common.getIntNum(2, 7), common.getIntNum(2, 7), common.getIntNum(4, 8), common.getIntNum(4,
							7), common.getIntNum(4, 7), common.getIntNum(4, 8), common.getIntNum(3, 7), common.getIntNum(2, 7), common.getIntNum(
							2, 8), common.getIntNum(1, 7), common.getIntNum(1, 7), [0, 1, 2, 3, 4, 6], common.getIntNum(0, 5), common.getIntNum(
							0, 4), common.getIntNum(0, 3), common.getIntNum(0, 2), common.getIntNum(0, 1), common.getIntNum(0, 1)
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
					/*************三码合个数********************/
				case '3dr3_smhgsB_dm':
				case 'plsr3_smhgsB_dm':
				case 'hasha3_smhgsB_dm':
					var id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
					];
					var title_style = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3"];
					var alt = common.getCondition(play_id + common.cookieGet("dm") + "12", title_style.length);
					var span = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]; //条件ulid
					var title_val = [
						[5, 7, 8, 9, 10], common.getIntNum(6, 10), common.getIntNum(6, 11), common.getIntNum(6, 11), common.getIntNum(
							7, 11), [7, 8, 9, 11], common.getIntNum(6, 10), common.getIntNum(7, 11), common.getIntNum(7, 12), [5, 7, 8, 9,
							10
						]
					]
					var title_data = [
						[5, 7, 8, 9, 10], common.getIntNum(6, 10), common.getIntNum(6, 11), common.getIntNum(6, 11), common.getIntNum(
							7, 11), [7, 8, 9, 11], common.getIntNum(6, 10), common.getIntNum(7, 11), common.getIntNum(7, 12), [5, 7, 8, 9,
							10
						]
					];
					json.data = title_data;
					json.style = title_style;
					json.val = title_val;
					json.alt = alt;
					json.id = id;
					json.span = span;
					break;
				default:
					break;
			}
			return json;

		},
	}
}();
