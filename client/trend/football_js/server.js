var server = function() {
	return {
		//数据初始化入口
		server: function() {
			var obj = JSON.parse(common.cookieGet("obj"));
			$("#showFace").show(); //打开loding层
			setTimeout(function() {
				$('#width1').parent().scrollTop(0); //滚动条到最顶端
				$('#width1').parent().scrollLeft(0); //滚动条到最左侧
			}, 0);
			content.removeLines(); //清空画线
			//页面初始化
			this.initialize();
			//获取数据
			this.receive();
		},
		//页面初始化 页面布局
		initialize: function() {
			var obj = JSON.parse(common.cookieGet("obj"));
			//加载走势图名字
			var chart_name = this.chartName(obj.type + "-" + obj.oddsType);
			$("title").html(chart_name);
			$("#chart_name").html(chart_name);
			//修改样式
			$(".l-top").css("width", "60px");
			$(".l-center").css("width", "60px");
			$(".l-bottom").css("width", "60px");
			$(".t-head").css("left", "60px");
			$(".t-content").css("left", "60px");
			$(".t-bottom").css("left", "60px");
			if (document.documentElement.clientWidth > 960) {
				$(".l-center").css("bottom", "178px");
				$(".t-content").css("bottom", "162px");
			} else {
				$(".l-center").css("bottom", "115px");
				$(".t-content").css("bottom", "115px");
				$(".l-bottom").css("bottom", "0px");
				$(".t-bottom").css("bottom", "0px");
			}
			if (obj.from_Id != 901) {
				//手机版改变样式
				//选择期数样式
				$(".diqu ul li").css("width", "50px");
				$(".diqu p").css("padding", "2px 10px 2px 12px");
				$(".diqu ul").css("width", "51px");
				if (common.cookieGet("rotate") == "heng") {
					$(".topname").css("width", "118px");
					$(".diqu").css("left", "125px");
				} else if (common.cookieGet("rotate") == "shu") {

				}
			}
		},
		/**
		 * 主要在网页测试
		 * from_Id
		 * token
		 * code城市id
		 * play_id 玩法id
		 * chart_id走势图名字
		 * cat 大玩法
		 * language 语言
		 */
		receive: function(num) {
			var obj = JSON.parse(common.cookieGet("obj"));
			var url = "https://chart-c-football.bajiaoxing-tech.com/game/selectTrendDatasByType"; //测试接口
			// var url = "http://192.168.1.151/lottery-football/game/selectTrendDatasByType"; //测试接口
			var total = 0;
			if (null == num) {
				total = 20;
			} else {
				total = num;
			}
			common.cookieSet("total", total);
			var data = {
				"type": obj.type,
				"oddsType": obj.oddsType, //obj.play_id
				"total": total,
			};
			//过滤条件id
			if (common.isNull(obj.competitionId)) {
				data.competitionId = obj.competitionId;
			}
			//已选择条件id
			if (common.isNull(obj.minOdds) && common.isNull(obj.maxOdds)) {
				data.minOdds = obj.minOdds;
				data.maxOdds = obj.maxOdds;
			}
			var successRes = function(res) {
				if (res.data.length < 2) {
					$("#showFace").hide();
					$("#print2").show();
				} else {
					var result = res.data;
					//根据返回数据打印图表按钮
					var code_name = "图表";
					var game_id = [];
					var html = '';
					var len = 0;
					game_id = JSON.parse(common.cookieGet("game_id"));
					//循环最后一行
					for (var i = 0; i < result[result.length - 1].length; i++) {
						if (common.isNull(result[result.length - 1][i])) {
							len++;
						}
					}
					len += game_id.length;
					if (game_id.length > 0) {
						if (Math.ceil(len / 10) < 1) {
							html += "<li id='chart" + 1 + "' class='on' onclick='server.page(" + 1 + ")'>" + code_name + "-" + 1 +
								"</li>";
						} else {
							//向上取整计算
							for (var i = 0; i < Math.ceil(len / 10); i++) {
								if (i == 0) {
									html += "<li id='chart" + (i + 1) + "' class='on' onclick='server.page(" + (i + 1) + ")'>" +
										code_name + "-" + (i + 1) + "</li>";
								} else {
									html += "<li id='chart" + (i + 1) + "' onclick='server.page(" + (i + 1) + ")'>" + code_name + "-" + (
										i + 1) + "</li>";
								}
							}
						}
					}
					$("#chartCon").html(html)
					content.server(result);
					//页面操作
					var flagLeft = $('#width1').parent().scrollLeft(); //记录原横滚位置
					setTimeout(function() {
						$('#width1').parent().scrollTop(0); //滚动条到最顶端
						$('#width1').parent().scrollLeft(0); //滚动条到最左侧
					}, 0);
					content.removeLines(); //清空画线
					//固定滚动条到最底部
					setTimeout(function() {
						content.drawLines(); //画线
						$('#width1').parent().scrollLeft(flagLeft); //滚动条到最左侧
						$('#width1').parent().scrollTop($('#width1').height());
					}, 100);
					setTimeout(function() {
						//关闭loding
						$("#showFace").hide();
					}, 100);
				}
			};
			common.request(url, data, "", successRes);
		},
		//切换图表改变提交内保存的值
		page: function(id) {
			var page = 1;
			var obj = JSON.parse(common.cookieGet("obj"));
			var game_id = JSON.parse(common.cookieGet("game_id"));
			var data = common.cookieGet("data").split(",");
			var min = JSON.parse(common.cookieGet("flag"));
			var max = min + 10;
			$(".dqtan2").hide();
			$("#chart").html("图表-" + id);
			var submit = '';
			if (id == 1) {
				var jl = 0;
				for (var i = 0; i < 10; i++) {
					if (!common.isNull(data[i]) && common.isNull(game_id[jl])) {
						submit += '<td span=' + game_id[jl] + ' alt=' + content.subid(obj.type + "-" + obj.oddsType) +
							' onclick="content.clickSubmit(this)" class="fline">' + i + '</td>';
						jl++;
					} else {
						submit += '<td></td>'
					}
				}
				for (var i = 0; i < 11; i++) {
					submit += '<td></td>'
				}
			} else {
				while (true) {
					if (max > game_id.length) {
						max = game_id.length;
					}
					page++;
					if (page == id) {
						for (var i = 0; i < 10; i++) {
							if (common.isNull(game_id[i + min])) {
								submit += '<td span=' + game_id[i + min] + ' alt=' + content.subid(obj.type + "-" + obj.oddsType) +
									' onclick="content.clickSubmit(this)" class="fline">' + i + '</td>';
							} else {
								submit += '<td onclick=common.showMsg("选择无效",800)></td>'
							}
						}
						for (var i = 0; i < 11; i++) {
							submit += '<td onclick=common.showMsg("选择无效",800)></td>'
						}
					}
					if (common.isNull(submit)) {
						break;
					}
					min += 10;
					max += 10;
				}
			}
			$("#tjc1").html(submit)
		},
		//切换期数
		refresh: function(num) {
			var flag = false;
			if (common.cookieGet("total") == num) {
				common.showMsg("选择期数未发生变化", 2000);
				return;
			} else {
				if (common.cookieGet("rotate") == "shu") {
					flag = true;
					common.rotate('shu');
				}
				common.cookieSet("total", num);
			}
			var obj = JSON.parse(common.cookieGet("obj"));
			if (obj.from_Id == 901) {
				var qs = [10, 20, 30];
				for (var i = 0; i < qs.length; i++) {
					if (num == qs[i]) {
						$("#q" + qs[i]).attr("class", "on")
					} else {
						$("#q" + qs[i]).attr("class", "")
					}
				}
			}
			$("#showFace").show();
			this.receive(num);
			if (flag) {
				setTimeout(function() {
					common.rotate('heng');
					$('#width1').parent().scrollTop($('#width1').height());
				}, 800);
			}
		},
		chartName: function(id) {
			var name = "";
			switch (id) {
				case "hda-w":
					name = "胜走势图";
					break;
				case "hda-d":
					name = "平走势图";
					break;
				case "hda-l":
					name = "负走势图";
					break;
				case "hhda-w":
					name = "胜走势图";
					break;
				case "hhda-d":
					name = "平走势图";
					break;
				case "hhda-l":
					name = "负走势图";
					break;
				case "hf-bw":
					name = "前胜走势";
					break;
				case "hf-bd":
					name = "前平走势";
					break;
				case "hf-bl":
					name = "前负走势";
					break;
				case "hf-aw":
					name = "后胜走势";
					break;
				case "hf-ad":
					name = "后平走势";
					break;
				case "hf-al":
					name = "后负走势";
					break;
				case "ttg-s0":
					name = "0球走势";
					break;
				case "ttg-s1":
					name = "1球走势";
					break;
				case "ttg-s2":
					name = "2球走势";
					break;
				case "ttg-s3":
					name = "3球走势";
					break;
				case "ttg-s4":
					name = "4球走势";
					break;
				case "ttg-s5":
					name = "5球走势";
					break;
				case "ttg-s6":
					name = "6球走势";
					break;
				case "ttg-s7":
					name = "7+走势";
					break;
				case "crs-w0":
					name = "胜0胆走势";
					break;
				case "crs-w1":
					name = "胜1胆走势";
					break;
				case "crs-w2":
					name = "胜2胆走势";
					break;
				case "crs-w3":
					name = "胜3胆走势";
					break;
				case "crs-w4":
					name = "胜4胆走势";
					break;
				case "crs-w5":
					name = "胜5胆走势";
					break;
				case "crs-d0":
					name = "平0胆走势";
					break;
				case "crs-d1":
					name = "平1胆走势";
					break;
				case "crs-d2":
					name = "平2胆走势";
					break;
				case "crs-d3":
					name = "平3胆走势";
					break;
				case "crs-l0":
					name = "负0胆走势";
					break;
				case "crs-l1":
					name = "负1胆走势";
					break;
				case "crs-l2":
					name = "负2胆走势";
					break;
				case "crs-l3":
					name = "负3胆走势";
					break;
				case "crs-l4":
					name = "负4胆走势";
					break;
				case "crs-l5":
					name = "负5胆走势";
					break;

				default:
					break;
			}
			return name;
		},
	}
}();
