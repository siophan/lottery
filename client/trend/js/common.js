var userPath = "http://192.168.1.151/soft-user";
//回退
document.addEventListener('UniAppJSBridgeReady', function() {});
//滚动条触发事件 
function roll() {
	var a = document.getElementById("cc").scrollTop;
	var b = document.getElementById("cc").scrollLeft;
	document.getElementById("dd").scrollTop = a;
	document.getElementById("hh").scrollLeft = b;
	document.getElementById("mm").scrollLeft = b;
}
var lineRegionId = 'lineRegion';

//监听窗口变化 重新画线
window.onresize = function() {
	$("#showFace").show();
	var flagLeft = $('#width1').parent().scrollLeft();
	setTimeout(function() {
		$('#width1').parent().scrollTop(0); //滚动条到最顶端
		$('#width1').parent().scrollLeft(0); //滚动条到最左侧
	}, 0);
	content.removeLines(); //清空画线
	//固定滚动条到最底部
	setTimeout(function() {
		content.drawLines();
		$('#width1').parent().scrollTop($('#width1').height());
		$('#width1').parent().scrollLeft(flagLeft); //滚动条到最左侧
		$("#showFace").hide();
	}, 300);
}
var common = function() {
	return {
		//数据初始化入口
		server: function() {
			var obj = JSON.parse(this.cookieGet("obj"));
			$("#showFace").show(); //打开loding层
			setTimeout(function() {
				$('#width1').parent().scrollTop(0); //滚动条到最顶端
				$('#width1').parent().scrollLeft(0); //滚动条到最左侧
			}, 0);
			content.removeLines(); //清空画线
			//页面初始化
			this.initialize();
			style.server(); //初始化页面数据
			//获取数据
			if (obj.from_Id == 901) {
				this.receiveWindows();
			} else if (obj.from_Id == 902 || obj.from_Id == 903) {
				this.receivePhone();
			}
			//this.receive(); //网页调用接口进行测试
		},
		receiveWindows: function(num) {
			var rows = 0;
			if (null == num) {
				rows = 100;
			} else {
				rows = num;
			}
			if (obj.chart_id == "dwfb") {
				rows += 200;
			}
			if (obj.chart_id == "lhcm" || obj.chart_id == "hzhenzs") {
				rows += 1;
			}
			this.cookieSet("num", rows);
			var data = {
				"rows": rows,
				"code": obj.code,
			};
			if (this.isNull(this.cookieGet("code_id"))) {
				data.code_id = this.cookieGet("code_id").substring(2, this.cookieGet("code_id").length)
			} else if (this.isNull(obj.dm)) {
				data.dm = obj.dm
			}
			var result = parent.topRows(data, this.opennumberRes);
		},
		receivePhone: function(num) {
			var rows = 0;
			if (null == num) {
				rows = 30;
			} else {
				rows = parseInt(num);
			}
			this.cookieSet("num", rows);
			var data = {
			};
			var result = [];
			var number = [];
			var url = "";
			if (this.isNull(obj.code_id)) {
				url = "https://chart-c-num.bajiaoxing-tech.com/codeTrend/getCodeTrend";
				data.rows = rows;
				data.code = obj.code;
				data.type_id = obj.play_id;
				data.id = obj.play_id + "dmzs" + this.cookieGet("code_id").substring(2, this.cookieGet("code_id").length);
				if (obj.play_id == "3dr3") {
					data.cat = "3d";
				}else if(obj.play_id == "hasha3"){
					data.cat = "hash";
				} else {
					data.cat = "pls";
				}
				var successRes = function(res) {
					console.log(res)
					var result = res.data;
					if (common.isNull(obj.dm) || common.isNull(obj.code_id)) {
						result = res.data.reverse();
					}
					content.server(result);
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
						//关闭loding
						$("#showFace").hide();
					}, 100);
				};
				this.request(url, data, "", successRes);
			} else if (this.isNull(obj.dm)) {
				url = "https://chart-c-num.bajiaoxing-tech.com/codeTrend/getCodeTrend";
				data.rows = rows;
				data.code = obj.code;
				data.type_id = obj.play_id;
				data.id = obj.play_id + obj.dm;
				data.page = 0;
				data.pageSize = 0;
				if (obj.play_id == "3dr3") {
					data.cat = "3d";
				}else if(obj.play_id == "hasha3"){
					data.cat = "hash";
				} else {
					data.cat = "pls";
				}
				var successRes = function(res) {
					var result = res.data;
					if (common.isNull(obj.dm) || common.isNull(obj.code_id)) {
						result = res.data.reverse();
					}
					content.server(result);
					var flagLeft = $('#width1').parent().scrollLeft(); //记录原横滚位置
					setTimeout(function() {
						$('#width1').parent().scrollTop(0); //滚动条到最顶端
						$('#width1').parent().scrollLeft(0); //滚动条到最左侧
					}, 0);
					content.removeLines(); //清空画线
					if (obj.code == 101 || obj.code == 201 || obj.code == 106) {
						if (obj.from_Id != 901) {
							$(".qh").attr("style", "width:8px !important");
							$(".span").css("padding", "1px 0px !important");
						} else {
							$(".qh").attr("style", "width:10px !important");
						}
					}
					//固定滚动条到最底部
					setTimeout(function() {
						content.drawLines(); //画线
						$('#width1').parent().scrollLeft(flagLeft); //滚动条到最左侧
						$('#width1').parent().scrollTop($('#width1').height());
						//关闭loding
						$("#showFace").hide();
					}, 100);
				};
				this.request(url, data, "", successRes);
			} else {
				// for (var i = 0; i < rows; i++) {
				// 	result.push(obj.number[i]);
				// }
				
				//content.server(result);
				content.server([{
					expect:'24126',
					opennumber: "02,10,17,28,34,07,08"
				}]);
				var flagLeft = $('#width1').parent().scrollLeft(); //记录原横滚位置
				setTimeout(function() {
					$('#width1').parent().scrollTop(0); //滚动条到最顶端
					$('#width1').parent().scrollLeft(0); //滚动条到最左侧
				}, 0);
				content.removeLines(); //清空画线
				if (obj.code == 101 || obj.code == 201 || obj.code == 106) {
					if (obj.from_Id != 901) {
						$(".qh").attr("style", "width:8px !important");
						$(".span").css("padding", "1px 0px !important");
					} else {
						$(".qh").attr("style", "width:10px !important");
					}
				}
				//固定滚动条到最底部
				setTimeout(function() {
					content.drawLines(); //画线
					$('#width1').parent().scrollLeft(flagLeft); //滚动条到最左侧
					$('#width1').parent().scrollTop($('#width1').height());
					//关闭loding
					$("#showFace").hide();
				}, 100);
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
			var obj = JSON.parse(this.cookieGet("obj"));
			var url = "http://192.168.1.151/soft-num/bauth/lotteryNum/topRows";
			var rows = 0;
			if (null == num) {
				if (obj.from_Id == 901) {
					rows = 100;
				} else {
					rows = 30;
				}
				this.cookieSet("num", rows);
			} else {
				rows = num;
			}
			if (obj.chart_id == "dwfb") {
				rows += 200;
			}
			if (obj.chart_id == "lhcm" || obj.chart_id == "hzhenzs") {
				rows += 1;
			}
			var data = {
				"rows": rows,
				"play_id": "p3", //obj.play_id
				"code": obj.code,
			};
			//如果传值有dm参数说明是代码图表 将参数拼装 
			if (this.isNull(obj.dm)) {
				url = "http://192.168.1.151/soft-num/bauth/codeTrend/chart";
				data.type = obj.play_id + obj.dm;
			}
			//如果传值有code_id说明是代码走势
			if (this.isNull(obj.code_id)) {
				data.type = this.cookieGet("code_id");
				url = "http://192.168.1.151/soft-num/bauth/codeTrend/sscList";
			}
			var successRes = function(res) {
				var result = res.data;
				if (common.isNull(obj.dm) || common.isNull(obj.code_id)) {
					result = res.data.reverse();
				}
				content.server(result);
				var flagLeft = $('#width1').parent().scrollLeft(); //记录原横滚位置
				setTimeout(function() {
					$('#width1').parent().scrollTop(0); //滚动条到最顶端
					$('#width1').parent().scrollLeft(0); //滚动条到最左侧
				}, 0);
				content.removeLines(); //清空画线
				if (obj.code == 101 || obj.code == 201 || obj.code == 106) {
					if (obj.from_Id != 901) {
						$(".qh").attr("style", "width:8px !important");
						$(".span").css("padding", "1px 0px !important");
					} else {
						$(".qh").attr("style", "width:10px !important");
					}
				}
				//固定滚动条到最底部
				setTimeout(function() {
					content.drawLines(); //画线
					$('#width1').parent().scrollLeft(flagLeft); //滚动条到最左侧
					$('#width1').parent().scrollTop($('#width1').height());
					//关闭loding
					$("#showFace").hide();
				}, 100);
			};
			this.request(url, data, "", successRes);
		},
		opennumberRes: function(result) {
			content.server(result);
			var flagLeft = $('#width1').parent().scrollLeft(); //记录原横滚位置
			setTimeout(function() {
				$('#width1').parent().scrollTop(0); //滚动条到最顶端
				$('#width1').parent().scrollLeft(0); //滚动条到最左侧
			}, 0);
			content.removeLines(); //清空画线
			if (obj.code == 101 || obj.code == 201 || obj.code == 106) {
				if (obj.from_Id != 901) {
					$(".qh").attr("style", "width:8px !important");
					$(".span").css("padding", "1px 0px !important");
				} else {
					$(".qh").attr("style", "width:10px !important");
				}
			}
			//固定滚动条到最底部
			setTimeout(function() {
				content.drawLines(); //画线
				$('#width1').parent().scrollLeft(flagLeft); //滚动条到最左侧
				$('#width1').parent().scrollTop($('#width1').height());
				//关闭loding
				$("#showFace").hide();
			}, 100);
		},
		/*代码图表需要判断当前代码是什么*/
		GetCodeName: function(key) {
			var result = "";
			if (key == "dm1") {
				result = "代码一";
			} else if (key == "dm2") {
				result = "代码二";
			} else if (key == "dm3") {
				result = "代码三";
			} else if (key == "dm4") {
				result = "代码四";
			} else if (key == "dm5") {
				result = "代码五";
			} else if (key == "dm6") {
				result = "代码六";
			} else if (key == "dm7") {
				result = "代码七";
			} else if (key == "dm8") {
				result = "代码八";
			} else if (key == "dm9") {
				result = "代码九";
			}
			return result;
		},
		//页面初始化 页面布局
		initialize: function() {
			var obj = JSON.parse(this.cookieGet("obj"));
			var json = trend_name_json;
			var chart_name = '';
			//加载走势图名字
			//如果有代码条件需要先加载代码几
			if (this.isNull(obj.dm)) {
				chart_name += this.GetCodeName(obj.dm) + "|";
			}
			if (this.isNull(obj.dis)) {
				if (obj.play_id == "ssq") {
					chart_name += "双色球"
				} else if (obj.play_id == "dlt") {
					chart_name += "大乐透-"
					if (obj.dis == "qq") {
						chart_name += "前区|"
					} else if (obj.dis == "hq") {
						chart_name += "后区|"
					}
				} else if (obj.play_id == "七星彩") {
					chart_name += "大乐透"
				}
			}
			for (var i = 0; i < json.length; i++) {
				if (obj.chart_id == json[i].trend_id) {
					chart_name += json[i].name.cn
				}
			}
			if (chart_name.length > 8) {
				$("#chart_name").attr("title", chart_name);
				chart_name = chart_name.substring(0, 8) + "...";
			}
			$("title").html(chart_name);
			$("#chart_name").html(chart_name);
			//如果传值没有代码走势隐藏按钮
			if (!this.isNull(obj.code_id)) {
				$(".diqu1").hide();
			} else {
				this.cookieSet("code_id", "dm1");
			}
			//大乐透 双色球 七星彩样式 号码列表加宽
			if (obj.code == 101 || obj.code == 201 || obj.code == 106) {
				if (document.documentElement.clientWidth > 960) {
					$(".l-center").css("bottom", "209px");
					$(".t-content").css("bottom", "194px");
					$(".l-top").css("width", "215px");
					$(".t-head").css("left", "215px");
					$(".l-center").css("width", "215px");
					$(".t-content").css("left", "215px");
					$(".l-bottom").css("width", "215px");
					$(".t-bottom").css("left", "215px");
				} else {
					$(".l-top").css("width", "185px");
					$(".t-head").css("left", "185px");
					$(".l-center").css("width", "185px");
					$(".t-content").css("left", "185px");
					$(".l-bottom").css("width", "185px");
					$(".t-bottom").css("left", "185px");
					$(".t-bottom").css("bottom", "0px");
					$(".l-bottom").css("bottom", "0px");
				}
				if (obj.chart_id == 'pmzs' && obj.dis == "qq") {
					$("#tjc2").attr("style", "");
					$("#tj2").show();
					$("#tj1").hide();
				} else {
					if (document.documentElement.clientWidth > 960) {
						$(".l-center").css("bottom", "178px");
						$(".t-content").css("bottom", "162px");
					} else {
						$(".l-center").css("bottom", "115px");
						$(".t-content").css("bottom", "115px");
						$(".l-bottom").css("bottom", "0px");
						$(".t-bottom").css("bottom", "0px");
					}
				}
			} else {
				if (document.documentElement.clientWidth > 960) {
					$(".l-center").css("bottom", "178px");
					$(".t-content").css("bottom", "162px");
				} else {
					$(".l-center").css("bottom", "115px");
					$(".t-content").css("bottom", "115px");
					$(".l-bottom").css("bottom", "0px");
					$(".t-bottom").css("bottom", "0px");
				}

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
				}
			} else {

			}
		},
		/*隐藏显示下方提交和遗漏*/
		show: function(parameter) {
			if (parameter == "hide") {
				$("#conbottom").hide();
				$("#leftbottom").hide();
				$("#show").show();
				$("#hide").hide();
				//存储原有style样式  (class)l-center== dd(id)  (class)t-content == cc(id)
				this.cookieSet("dd", $("#dd").attr("style"));
				this.cookieSet("cc", $("#cc").attr("style"));
				$("#dd").attr("style", this.cookieGet("dd") + " bottom:0px;");
				$("#cc").attr("style", this.cookieGet("cc") + " bottom:0px;");
			} else {
				$("#show").hide();
				$("#hide").show();
				//赋给原有的样式
				$("#dd").attr("style", this.cookieGet("dd"));
				$("#cc").attr("style", this.cookieGet("cc"));
				$("#conbottom").show();
				$("#leftbottom").show();
			}
			setTimeout(function() {
				$('#width1').parent().scrollTop($('#width1').height());
			}, 0);
		},
		/*返回按钮*/
		onBack: function() {
			uni.navigateBack({
				delta: 1
			});
		},
		//切换横竖屏
		rotate: function(type) {
			if (type == "heng") {
				$("#print1").attr("id", "print");
				this.cookieSet("rotate", "shu");
				var width = document.documentElement.clientWidth;
				var height = document.documentElement.clientHeight;
				if (width < height) {
					$print = $('#print');
					$print.width(height);
					$print.height(width);
					$print.css('top', (height - width) / 2);
					$print.css('left', 0 - (height - width) / 2);
					$print.css('transform', 'rotate(90deg)');
					$print.css('transform-origin', '50% 50%');
				}
				$("#rotate").attr("onclick", "common.rotate('shu')");
				$("#rotate").html("竖屏");
			} else {
				$("#print").attr("style", "");
				$("#print").attr("id", "print1");
				this.cookieSet("rotate", "heng");
				$("#rotate").attr("onclick", "common.rotate('heng')");
				$("#rotate").html("横屏");
			}
			this.botton('colse');
		},
		//切换期数或 开奖号码出现变动则刷新
		refresh: function(num) {
			var flag = false;
			if (this.cookieGet("num") == num) {
				this.showMsg("选择期数未发生变化", 2000);
				return;
			} else {
				if (this.cookieGet("rotate") == "shu") {
					flag = true;
					common.rotate('shu');
				}
				this.cookieSet("num", num);
			}
			var obj = JSON.parse(this.cookieGet("obj"));
			if (obj.from_Id == 901) {
				var qs = [10, 20, 30, 50, 100, 200, 300];
				for (var i = 0; i < qs.length; i++) {
					if (num == qs[i]) {
						$("#q" + qs[i]).attr("class", "on")
					} else {
						$("#q" + qs[i]).attr("class", "")
					}
				}
			}
			$("#showFace").show();
			//获取数据
			if (obj.from_Id == 901) {
				this.receiveWindows(num);
			} else if (obj.from_Id == 902 || obj.from_Id == 903) {
				this.receivePhone(num);
			}
			//this.receive(num); //网页调用接口进行测试
			if (flag) {
				setTimeout(function() {
					common.rotate('heng');
					$('#width1').parent().scrollTop($('#width1').height());
				}, 800);
			}
		},
		//切换代码
		refreshCode: function(num) {
			$("#showFace").show();
			this.cookieSet("code_id", "dm" + num);
			var obj = JSON.parse(this.cookieGet("obj"));
			style.server();
			//获取数据
			if (obj.from_Id == 901) {
				this.receiveWindows(this.cookieGet("num"));
				for (var i = 0; i < 4; i++) {
					if (i == num - 1) {
						$("#code" + i).attr("class", "on");
					} else {
						$("#code" + i).attr("class", "");
					}
				}
			} else if (obj.from_Id == 902 || obj.from_Id == 903) {
				this.receivePhone(this.cookieGet("num"));
				$("#code_name").html($("#code" + (num - 1)).html());
			}
		},
		//点击更多弹出按钮
		botton: function(parameter) {
			if (parameter == "colse") {
				$("#tanchu").attr("style", "display:none;");
			} else {
				$("#tanchu").attr("style", "");
			}
		},
		//弹出消息
		showMsg: function(msg, time) {
			if (!time) {
				time = 1000;
			}
			layer.msg(msg, {
				time: time
			});
		},
		//为空判断
		isNull: function(src) {
			if (null != src && src != "" && typeof src != undefined) {
				return true;
			}
			return false;
		},
		//缓存处理
		cookieSet: function(key, value) {
			sessionStorage.setItem(key, value);
		},
		//获取缓存数据
		cookieGet: function(key) {
			return sessionStorage.getItem(key);
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
		//循环一个字符串
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
		//按照位置截取
		cutOut: function(content, min, max) {
			return content.substring(min, max);
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
				case "hasha3":
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
		//循环合数
		gethsNum: function(minNum, maxNum) {
			var arr = [];
			var count = 0;
			for (var j = minNum; j <= maxNum; j++) {
				if (j == 0) {
					arr.push(j)
				} else if (j > 3) {
					for (var i = 2; i < j - 1; i++) {
						if (j % i == 0) {
							arr.push(j)
							break;
						}
					}
				}
			}
			return arr;
		},
		//循环偶数
		getPairNum: function(minNum, maxNum) {
			var arr = [];
			for (var i = minNum; i <= maxNum; i++) {
				if (i % 2 == 0) {
					arr.push(i);
				}
			}
			return arr;
		},
		//循环两位数带0类型的号码 例如11选5 01 02 03 04 05
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
		//循环一位数号码 例如3D 1 2 3
		getIntNum: function(minNum, maxNum) {
			var number = [];
			var count = 0;
			for (var i = minNum; i <= maxNum; i++) {
				number[count] = i;
				count++;
			}
			return number;
		},
		//提交条件的点击事件
		clickSubmit: function(obj) {
			var className = obj.getAttribute("class");
			var id = obj.getAttribute("id");
			if (className == "select-yes") {
				obj.setAttribute("class", "fline");
			} else {
				if (this.isNull(obj.getAttribute("id")) && !this.isNull(JSON.parse(this.cookieGet("obj")).dis)) {
					console.log(1)
					this.exclude(obj);
				} else if (obj.getAttribute("alt").indexOf("666") > -1) {
					console.log(2)
					obj.setAttribute("class", "");
					common.showMsg("该条件无法选择", 1500);
				} else {
					if (this.isNull(JSON.parse(this.cookieGet("obj")).dis) && JSON.parse(this.cookieGet("obj")).chart_id == "pmzs" &&
						JSON.parse(this.cookieGet("obj")).dis == "qq") {
						var obj_tr2 = $("#tjc2").children("td");
						var flag = 0;
						if (id.indexOf("t") > -1) {
							if (JSON.parse(this.cookieGet("obj")).play_id == "ssq" || JSON.parse(this.cookieGet("obj")).play_id == "dlt") {
								$.each(obj_tr2, function(i, obj) {
									if (obj_tr2[i].className.indexOf("select-yes") > -1) {
										flag++;
									}
								});
								if (JSON.parse(this.cookieGet("obj")).play_id == "ssq") {
									if (flag >= 5) {
										common.showMsg("选择胆码过多无法继续选择!");
										return;
									}
								}
								if (JSON.parse(this.cookieGet("obj")).play_id == "dlt") {
									if (flag >= 4) {
										common.showMsg("选择胆码过多无法继续选择!");
										return;
									}
								}
							}
							$("#o" + parseInt(id.substring(1, id.length))).attr("class", "fline");
						} else {
							$("#t" + parseInt(id.substring(1, id.length))).attr("class", "fline");
						}
					} else {

					}
					obj.setAttribute("class", "select-yes");
				}
			}
		},
		//点击清除
		clickClean: function() {
			var o = JSON.parse(this.cookieGet("obj"));
			var obj_tr = $("#tjc1").children("td");
			$.each(obj_tr, function(i, obj) {
				obj_tr[i].setAttribute("class", "fline");
			});
			var obj_tr2 = $("#tjc2").children("td");
			$.each(obj_tr2, function(i, obj) {
				obj_tr2[i].setAttribute("class", "fline");
			});

		},
		//逆向循环
		getReverse: function(minNum, maxNum) {
			var ret = [];
			var count = 0;
			for (var i = maxNum; i >= minNum; i--) {
				ret[count] = i;
				count++;
			}
			return ret;
		},
		//循环属性比例 例如0:1 0:2
		getRatio: function(minNum, maxNum) {
			var min = [];
			var max = [];
			var maxnum = maxNum;
			var ret = [];
			var count = 0;
			for (var i = minNum; i <= maxNum; i++) {
				min[count] = i;
				max[count] = maxnum--;
				count++;
			}
			for (var i = 0; i < min.length; i++) {
				ret[i] = min[i] + ":" + max[i];
			}
			return ret;
		},
		//逆向循环属性比例 例如2:1 2:0
		getReverseRatio: function(minNum, maxNum) {
			var min = [];
			var max = [];
			var maxnum = maxNum;
			var ret = [];
			var count = 0;
			for (var i = minNum; i <= maxNum; i++) {
				min[count] = i;
				max[count] = maxnum--;
				count++;
			}
			for (var i = 0; i < min.length; i++) {
				ret[i] = max[i] + ":" + min[i];
			}
			return ret;
		},
		/*特殊提交 双色球 大乐透两行提交时走这里*/
		specialSub: function() {
			var playUl = {};
			var obj_tr2 = $("#tjc2").children("td");
			var obj_tr = $("#tjc1").children("td");
			var count = 0;
			var torr = 0;
			$.each(obj_tr2, function(i, obj) {
				if (obj_tr2[i].className.indexOf("select-yes") > -1) {
					count++;
				}
			});
			$.each(obj_tr, function(i, obj) {
				if (obj_tr[i].className.indexOf("select-yes") > -1) {
					torr++;
				}
			});
			if (count == 0) {
				common.showMsg("未选择胆码无法进行提交!");
				return;
			}
			$.each(obj_tr2, function(i, obj) {
				if (obj_tr2[i].className.indexOf("select-yes") > -1) {
					var dataPID = $(obj_tr2[i]).attr("alt");
					var dataUlid = $(obj_tr2[i]).attr("span");
					var value = $(obj_tr2[i]).attr("value");
					if (playUl[dataPID] == undefined) {
						playUl[dataPID] = {};
						playUl[dataPID][dataUlid] = value;
					} else {
						playUl[dataPID][dataUlid] == undefined ? playUl[dataPID][dataUlid] = value :
							playUl[dataPID][dataUlid] = playUl[dataPID][dataUlid] + "," + value;
					}
				}
			});
			var res = [];
			var index = 0;
			var jlkc = 0;
			var jlval = '';
			var leng = 5;
			if (JSON.parse(this.cookieGet("obj")).dis == "dlt") {
				leng = 4;
			}
			for (var key in playUl) {
				var play = {};
				play.id = key;
				play.reaction = "0";
				play.tolerant = "0";
				var kc = [];
				var arr = [];
				var appear = "";
				for (var ulid in playUl[key]) {
					kc = playUl[key][ulid].split(",");
					arr[parseInt(ulid)] = {
						"ulid": ulid,
						"value": playUl[key][ulid]
					};
					jlval = playUl[key][ulid];
				}
				arr[1] = {
					"ulid": "1",
					"value": kc.length + ""
				}
				jlkc = kc.length;
				play.arr = arr;
				res[index] = play
				index++;
			}
			if (torr == 0) {
				var play = {};
				play.id = key;
				play.reaction = "0";
				play.tolerant = "0";
				var leng = 5;
				if (JSON.parse(this.cookieGet("obj")).dis == "dlt") {
					leng = 4;
				}
				var kc = [];
				var arr = [];
				arr[0] = {
					"ulid": "0",
				};
				var arrval = '';
				$.each(obj_tr, function(i, obj) {
					var value = $(obj_tr[i]).attr("value");
					if (jlval.indexOf(value) < 0) {
						arrval += value + ",";
					}
				});
				arrval = arrval.substring(0, arrval.length - 1);
				arr[0].value = arrval;
				var appear = '';
				for (var i = 0; i < (leng - jlkc) + 1; i++) {
					appear += (i + 1) + ",";
				}
				appear = appear.substring(0, appear.length - 1);
				arr[1] = {
					"ulid": "1",
					"value": appear
				}
				play.arr = arr;
				res[index] = play
			} else {
				var play = {};
				play.id = key;
				play.reaction = "0";
				play.tolerant = "0";
				var leng = 5;
				if (JSON.parse(this.cookieGet("obj")).dis == "dlt") {
					leng = 4;
				}
				var kc = [];
				playUl = {};
				$.each(obj_tr, function(i, obj) {
					if (obj_tr[i].className.indexOf("select-yes") > -1) {
						var dataPID = $(obj_tr[i]).attr("alt");
						var dataUlid = $(obj_tr[i]).attr("span");
						var value = $(obj_tr[i]).attr("value");
						if (playUl[dataPID] == undefined) {
							playUl[dataPID] = {};
							playUl[dataPID][dataUlid] = value;
						} else {
							playUl[dataPID][dataUlid] == undefined ? playUl[dataPID][dataUlid] = value :
								playUl[dataPID][dataUlid] = playUl[dataPID][dataUlid] + "," + value;
						}
					}
				});
				for (var key in playUl) {
					var play = {};
					play.id = key;
					play.reaction = "0";
					play.tolerant = "0";
					var kc = [];
					var arr = [];
					var appear = "";
					var length = 0;
					for (var ulid in playUl[key]) {
						kc = playUl[key][ulid].split(",");
						arr[parseInt(ulid)] = {
							"ulid": ulid,
							"value": playUl[key][ulid]
						};
					}
					for (var i = 0; i < (leng - jlkc) + 1; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
					arr[1] = {
						"ulid": "1",
						"value": appear
					}
					play.arr = arr;
					res[index] = play
					index++;
				}
			}
			console.log(res)
			if (i > 0) {
				if (JSON.parse(this.cookieGet("obj")).from_Id == "901") {
					parent.submiting(res)
				} else {
					uni.postMessage({
						data: res
					});
					uni.navigateBack({
						delta: back
					});
				}
				common.showMsg("提交成功");
			} else {
				common.showMsg("提交失败");
			}
		},
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
			var index = 0;
			for (var key in playUl) {
				play[index] = this.substring_play(key, playUl[key]);
				index++;
				if (play[i].tan) {
					delete play[i].tan;
				}
				i++;
			}
			console.log(play)
			if (i > 0) {
				if (JSON.parse(this.cookieGet("obj")).from_Id == "901") {
					parent.submiting(play)
				} else {
					uni.postMessage({
						data: play
					});
					uni.navigateBack({
						delta: back
					});
				}
				common.showMsg("提交成功");
			} else {
				common.showMsg("提交失败");
			}
		},
		//将提交条件拆分
		substring_play: function(key, val) {
			var play = {};
			play.id = key;
			play.tan = false;
			play.reaction = "0";
			play.tolerant = "0";
			switch (key) {
				/******************特殊条件***********************/
				case "3dr3dm108":
				case "3dr3dm208":
				case "3dr3dm308":
				case "3dr3dm408":
				case "3dr3dm508":
				case "3dr3dm608":
				case "3dr3dm708":
				case "3dr3dm808":
				case "3dr3dm908":
				case "plsr3dm108":
				case "plsr3dm208":
				case "plsr3dm308":
				case "plsr3dm408":
				case "plsr3dm508":
				case "plsr3dm608":
				case "plsr3dm708":
				case "plsr3dm808":
				case "plsr3dm908":
				
				case "hasha3dm108":
				case "hasha3dm208":
				case "hasha3dm308":
				case "hasha3dm408":
				case "hasha3dm508":
				case "hasha3dm608":
				case "hasha3dm708":
				case "hasha3dm808":
				case "hasha3dm908":
					var arr = new Array()
					var count = 0;
					var appear = "";
					for (var ulid in val) {
						var sort = [];
						var str = "";
						for (var i = 0; i < val[ulid].split(",").length; i++) {
							sort[i] = parseInt(val[ulid].split(",")[i]);
						}
						sort = common.sortArr(sort);
						for (var i = 0; i < sort.length; i++) {
							str += sort[i] + ",";
						}
						str = str.substring(0, str.length - 1);
						arr[count] = {
							"ulid": ulid,
							"value": str,
						};
						count++;
					}
					for (var i = 0; i < count; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
					arr[count] = {
						"ulid": "21",
						"value": appear,
					}
					play.max = 22;
					play.type = 9;
					play.arr = arr;
					break;
				case "3dr3dm109":
				case "3dr3dm209":
				case "3dr3dm309":
				case "3dr3dm409":
				case "3dr3dm509":
				case "3dr3dm609":
				case "3dr3dm709":
				case "3dr3dm809":
				case "3dr3dm909":
				case "3dr3dm112":
				case "3dr3dm212":
				case "3dr3dm312":
				case "3dr3dm412":
				case "3dr3dm512":
				case "3dr3dm612":
				case "3dr3dm712":
				case "3dr3dm812":
				case "3dr3dm912":
				case "plsr3dm109":
				case "plsr3dm209":
				case "plsr3dm309":
				case "plsr3dm409":
				case "plsr3dm509":
				case "plsr3dm609":
				case "plsr3dm709":
				case "plsr3dm809":
				case "plsr3dm909":
				case "plsr3dm112":
				case "plsr3dm212":
				case "plsr3dm312":
				case "plsr3dm412":
				case "plsr3dm512":
				case "plsr3dm612":
				case "plsr3dm712":
				case "plsr3dm812":
				case "plsr3dm912":
				
				case "hasha3dm109":
				case "hasha3dm209":
				case "hasha3dm309":
				case "hasha3dm409":
				case "hasha3dm509":
				case "hasha3dm609":
				case "hasha3dm709":
				case "hasha3dm809":
				case "hasha3dm909":
				case "hasha3dm112":
				case "hasha3dm212":
				case "hasha3dm312":
				case "hasha3dm412":
				case "hasha3dm512":
				case "hasha3dm612":
				case "hasha3dm712":
				case "hasha3dm812":
				case "hasha3dm912":
					var arr = new Array()
					var count = 0;
					var appear = "";
					for (var ulid in val) {
						var sort = [];
						var str = "";
						for (var i = 0; i < val[ulid].split(",").length; i++) {
							sort[i] = parseInt(val[ulid].split(",")[i]);
						}
						sort = common.sortArr(sort);
						for (var i = 0; i < sort.length; i++) {
							str += sort[i] + ",";
						}
						str = str.substring(0, str.length - 1);
						arr[count] = {
							"ulid": ulid,
							"value": str,
						};
						count++;
					}
					for (var i = 0; i < count; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
					arr[count] = {
						"ulid": "10",
						"value": appear,
					}
					play.max = 11;
					play.type = 9;
					play.arr = arr;
					break;
				case "3dr3dm110":
				case "3dr3dm210":
				case "3dr3dm310":
				case "3dr3dm410":
				case "3dr3dm510":
				case "3dr3dm610":
				case "3dr3dm710":
				case "3dr3dm810":
				case "3dr3dm910":
				case "plsr3dm110":
				case "plsr3dm210":
				case "plsr3dm310":
				case "plsr3dm410":
				case "plsr3dm510":
				case "plsr3dm610":
				case "plsr3dm710":
				case "plsr3dm810":
				case "plsr3dm910":
				
				case "hasha3dm110":
				case "hasha3dm210":
				case "hasha3dm310":
				case "hasha3dm410":
				case "hasha3dm510":
				case "hasha3dm610":
				case "hasha3dm710":
				case "hasha3dm810":
				case "hasha3dm910":
					var arr = new Array()
					var count = 0;
					var appear = "";
					for (var ulid in val) {
						var sort = [];
						var str = "";
						for (var i = 0; i < val[ulid].split(",").length; i++) {
							sort[i] = parseInt(val[ulid].split(",")[i]);
						}
						sort = common.sortArr(sort);
						for (var i = 0; i < sort.length; i++) {
							str += sort[i] + ",";
						}
						str = str.substring(0, str.length - 1);
						arr[count] = {
							"ulid": ulid,
							"value": str,
						};
						count++;
					}
					for (var i = 0; i < count; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
					arr[count] = {
						"ulid": "11",
						"value": appear,
					}
					play.max = 12;
					play.type = 9;
					play.arr = arr;
					break;
				case "3dr3dm111":
				case "3dr3dm211":
				case "3dr3dm311":
				case "3dr3dm411":
				case "3dr3dm511":
				case "3dr3dm611":
				case "3dr3dm711":
				case "3dr3dm811":
				case "3dr3dm911":
				case "plsr3dm111":
				case "plsr3dm211":
				case "plsr3dm311":
				case "plsr3dm411":
				case "plsr3dm511":
				case "plsr3dm611":
				case "plsr3dm711":
				case "plsr3dm811":
				case "plsr3dm911":
				
				case "hasha3dm111":
				case "hasha3dm211":
				case "hasha3dm311":
				case "hasha3dm411":
				case "hasha3dm511":
				case "hasha3dm611":
				case "hasha3dm711":
				case "hasha3dm811":
				case "hasha3dm911":
					var arr = new Array()
					var count = 0;
					var appear = "";
					for (var ulid in val) {
						var sort = [];
						var str = "";
						for (var i = 0; i < val[ulid].split(",").length; i++) {
							sort[i] = parseInt(val[ulid].split(",")[i]);
						}
						sort = common.sortArr(sort);
						for (var i = 0; i < sort.length; i++) {
							str += sort[i] + ",";
						}
						str = str.substring(0, str.length - 1);
						arr[count] = {
							"ulid": ulid,
							"value": str,
						};
						count++;
					}
					for (var i = 0; i < count; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
					arr[count] = {
						"ulid": "28",
						"value": appear,
					}
					play.max = 29;
					play.type = 9;
					play.arr = arr;
					break;
					/*开出条件 ulid=3*/
				case "3dr3dm105":
				case "3dr3dm205":
				case "3dr3dm305":
				case "3dr3dm405":
				case "3dr3dm505":
				case "3dr3dm605":
				case "3dr3dm705":
				case "3dr3dm805":
				case "3dr3dm905":
				case "3dr3dm107":
				case "3dr3dm207":
				case "3dr3dm307":
				case "3dr3dm407":
				case "3dr3dm507":
				case "3dr3dm607":
				case "3dr3dm707":
				case "3dr3dm807":
				case "3dr3dm907":
				case "plsr3dm105":
				case "plsr3dm205":
				case "plsr3dm305":
				case "plsr3dm405":
				case "plsr3dm505":
				case "plsr3dm605":
				case "plsr3dm705":
				case "plsr3dm805":
				case "plsr3dm905":
				case "plsr3dm107":
				case "plsr3dm207":
				case "plsr3dm307":
				case "plsr3dm407":
				case "plsr3dm507":
				case "plsr3dm607":
				case "plsr3dm707":
				case "plsr3dm807":
				case "plsr3dm907":
				
				case "hasha3dm105":
				case "hasha3dm205":
				case "hasha3dm305":
				case "hasha3dm405":
				case "hasha3dm505":
				case "hasha3dm605":
				case "hasha3dm705":
				case "hasha3dm805":
				case "hasha3dm905":
				case "hasha3dm107":
				case "hasha3dm207":
				case "hasha3dm307":
				case "hasha3dm407":
				case "hasha3dm507":
				case "hasha3dm607":
				case "hasha3dm707":
				case "hasha3dm807":
				case "hasha3dm907":
				
				case "plwr5008":
					var leng = 3;
					var arr = [];
					var appear = "";
					var count = 0;
					for (var ulid in val) {
						var sort = [];
						var str = "";
						if (common.cookieGet("trendid") == "trend_pingmianZouShi") {
							for (var i = 0; i < val[ulid].split(",").length; i++) {
								sort[i] = parseInt(val[ulid].split(",")[i]);
							}
							sort = common.sortArr(sort);
							for (var i = 0; i < sort.length; i++) {
								str += sort[i] + ",";
							}
							str = str.substring(0, str.length - 1);
						} else {
							str = val[ulid];
						}
						arr[count] = {
							"ulid": ulid,
							"value": str
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
						"ulid": "3",
						"value": appear
					}
					play.arr = arr;
					break;
					/*开出条件 ulid=2*/
				case "3dr3dm106":
				case "3dr3dm206":
				case "3dr3dm306":
				case "3dr3dm406":
				case "3dr3dm506":
				case "3dr3dm606":
				case "3dr3dm706":
				case "3dr3dm806":
				case "3dr3dm906":
				case "plsr3dm106":
				case "plsr3dm206":
				case "plsr3dm306":
				case "plsr3dm406":
				case "plsr3dm506":
				case "plsr3dm606":
				case "plsr3dm706":
				case "plsr3dm806":
				case "plsr3dm906":
				
				case "hasha3dm106":
				case "hasha3dm206":
				case "hasha3dm306":
				case "hasha3dm406":
				case "hasha3dm506":
				case "hasha3dm606":
				case "hasha3dm706":
				case "hasha3dm806":
				case "hasha3dm906":
					var arr = [];
					var appear = "";
					var count = 0;
					var zh_leng = 0;
					for (var ulid in val) {
						arr[count] = {
							"ulid": ulid,
							"value": val[ulid]
						};
						zh_leng = val[ulid].split(",").length;
						count++;
					}
					for (var i = 0; i < count; i++) {
						appear += (i + 1) + ",";
					}
					appear = appear.substring(0, appear.length - 1);
					arr[count] = {
						"ulid": "2",
						"value": appear
					}
					play.arr = arr;
					break;
					/*开出条件 ulid=1*/
				case "3dr3dm101":
				case "3dr3dm201":
				case "3dr3dm301":
				case "3dr3dm401":
				case "3dr3dm501":
				case "3dr3dm601":
				case "3dr3dm701":
				case "3dr3dm801":
				case "3dr3dm901":
				case "plsr3dm101":
				case "plsr3dm201":
				case "plsr3dm301":
				case "plsr3dm401":
				case "plsr3dm501":
				case "plsr3dm601":
				case "plsr3dm701":
				case "plsr3dm801":
				case "plsr3dm901":
				
				case "hasha3dm101":
				case "hasha3dm201":
				case "hasha3dm301":
				case "hasha3dm401":
				case "hasha3dm501":
				case "hasha3dm601":
				case "hasha3dm701":
				case "hasha3dm801":
				case "hasha3dm901":
					var kc = [];
					var arr = [];
					var appear = "";
					for (var ulid in val) {
						kc = val[ulid].split(",");
						arr[parseInt(ulid)] = {
							"ulid": ulid,
							"value": val[ulid]
						};
					}
					for (var i = 0; i < kc.length; i++) {
						if (i < 9) {
							appear += (i + 1) + ",";
						}
					}
					appear = appear.substring(0, appear.length - 1);
					arr[1] = {
						"ulid": "1",
						"value": appear
					}
					play.arr = arr;
					break;
					/*无开出条件*/
				case "3dr3dm102":
				case "3dr3dm202":
				case "3dr3dm302":
				case "3dr3dm402":
				case "3dr3dm502":
				case "3dr3dm602":
				case "3dr3dm702":
				case "3dr3dm802":
				case "3dr3dm902":
				case "3dr3dm103":
				case "3dr3dm203":
				case "3dr3dm303":
				case "3dr3dm403":
				case "3dr3dm503":
				case "3dr3dm603":
				case "3dr3dm703":
				case "3dr3dm803":
				case "3dr3dm903":
				case "3dr3dm104":
				case "3dr3dm204":
				case "3dr3dm304":
				case "3dr3dm404":
				case "3dr3dm504":
				case "3dr3dm604":
				case "3dr3dm704":
				case "3dr3dm804":
				case "3dr3dm904":
				case "plsr3dm102":
				case "plsr3dm202":
				case "plsr3dm302":
				case "plsr3dm402":
				case "plsr3dm502":
				case "plsr3dm602":
				case "plsr3dm702":
				case "plsr3dm802":
				case "plsr3dm902":
				case "plsr3dm103":
				case "plsr3dm203":
				case "plsr3dm303":
				case "plsr3dm403":
				case "plsr3dm503":
				case "plsr3dm603":
				case "plsr3dm703":
				case "plsr3dm803":
				case "plsr3dm903":
				case "plsr3dm104":
				case "plsr3dm204":
				case "plsr3dm304":
				case "plsr3dm404":
				case "plsr3dm504":
				case "plsr3dm604":
				case "plsr3dm704":
				case "plsr3dm804":
				case "plsr3dm904":
				
				case "hasha3dm102":
				case "hasha3dm202":
				case "hasha3dm302":
				case "hasha3dm402":
				case "hasha3dm502":
				case "hasha3dm602":
				case "hasha3dm702":
				case "hasha3dm802":
				case "hasha3dm902":
				case "hasha3dm103":
				case "hasha3dm203":
				case "hasha3dm303":
				case "hasha3dm403":
				case "hasha3dm503":
				case "hasha3dm603":
				case "hasha3dm703":
				case "hasha3dm803":
				case "hasha3dm903":
				case "hasha3dm104":
				case "hasha3dm204":
				case "hasha3dm304":
				case "hasha3dm404":
				case "hasha3dm504":
				case "hasha3dm604":
				case "hasha3dm704":
				case "hasha3dm804":
				case "hasha3dm904":
					var arr = [];
					for (var ulid in val) {
						arr[parseInt(ulid)] = {
							"ulid": ulid,
							"value": val[ulid]
						};
					}
					play.arr = arr;
					break;
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
				
				case "hasha310201":
				case "hasha310202":
				case "hasha310203":
				case "hasha310204":
				case "hasha310205":
				case "hasha310206":
				case "hasha310207":
				case "hasha310208":
				case "hasha310209":
					var id = 6;
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
				case "plsr3dmzs1":
				case "plsr3dmzs2":
				case "plsr3dmzs3":
				case "plsr3dmzs4":
				case "3dr3dmzs1":
				case "3dr3dmzs2":
				case "3dr3dmzs3":
				case "3dr3dmzs4":
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
					play.arr = arr;
					break;
					//开出ulid为10的条件
				case "3dr3008":
				case "plsr3008":
				case "hasha3008":
				case "plwr5007":
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
					arr[count] = {
						"ulid": "10",
						"value": appear
					}
					play.arr = arr;
					break;
					//特殊条件
				case "3dr3012":
				case "3dr3024":
				case "3dr3026":
				case "plsr3012":
				case "plsr3024":
				case "plsr3026":
				case "plwr5010":
				
				case "hasha3012":
				case "hasha3024":
				case "hasha3026":
				case "plwr5010":
					var leng = 3;
					var zulid = 12;
					if (key == "3dr3012" || key == "plsr3012" || key == "hasha3012" || key == "plwr5010") {
						leng = 5;
						zulid = 11;
					}
					//小条件开出
					var kc1 = "";
					var kc2 = "";
					var kc3 = "";
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
						if (key == "3dr3012" || key == "plsr3012" || key == "hasha3012" ||key == "plwr5010") {
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
						if ((ulid == 1 || ulid == 0) && (upulid != 1 && upulid != 0)) {
							countAppear++;
						} else if ((ulid == 3 || ulid == 4) && (upulid != 3 && upulid != 4)) {
							countAppear++;
						} else if ((ulid == 6 || ulid == 7) && (upulid != 6 && upulid != 7)) {
							countAppear++;
						} else if (ulid != 0 && ulid != 1 && ulid != 3 && ulid != 4 && ulid != 6 && ulid != 7) {
							countAppear++;
						}
						upulid = ulid;
					}
					if (key == "3dr3012" || key == "plsr3012" || key == "hasha012" || key == "plwr5010") {
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
				case "plwr5005":
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
						if (i < 5) {
							appear += (i + 1) + ",";
						}
					}
					appear = appear.substring(0, appear.length - 1);
					arr[count] = {
						"ulid": "5",
						"value": appear
					}
					play.arr = arr;
					break;

					//开出ulid为3的条件
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
				case "plsr3023":
				case "plsr3025":
				
				case "hasha3006":
				case "hasha3010":
				case "hasha3013":
				case "hasha3020":
				case "hasha3022":
				case "hasha3024":
				case "hasha3025":
				case "hasha3023":
				case "hasha3025":
				
				case "3dr3023":
				case "3dr3025":
				case "plwr5010":
				case "plwr5011":
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
					arr[count] = {
						"ulid": "3",
						"value": appear
					}
					play.arr = arr;
					break;

					//开出ulid为1的条件
				case "3dr3001":
				case "plsr3001":
				case "hasha3001":
				case "1205a2001":
				case "3dr3014":
				case "3dr3016":
				case "3dr3017":
				case "plsr3014":
				case "plsr3016":
				case "plsr3017":
				
				case "hasha3014":
				case "hasha3016":
				case "hasha3017":
				case "plwr5001":
				case "plwr5012":
				case "sploblue001":
					var leng = 9;
					if (key.indexOf("sploblue001") > -1) {
						leng = 2;
					}
					var kc = [];
					var arr = [];
					var appear = "";
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
					arr[1] = {
						"ulid": "1",
						"value": appear
					}
					play.arr = arr;
					break;
					//无开出条件
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
				case "plwr5002":
				case "plwr5003":
				case "plwr5004":
				case "plwr5006":
				case "splored002":
				case "splored003":
				case "sploblue002":
				case "sploblue003":
				case "dcbred002":
				case "dcbred003":
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
		//判断特殊走势图更改元素宽度
		special: function() {
			var obj = JSON.parse(this.cookieGet("obj"));
			var id = obj.play_id + "-" + obj.chart_id;
			if (this.isNull(obj.dis)) {
				id = obj.play_id + "-" + obj.chart_id + "-" + obj.dis;
			}
			var width = 30;
			if (obj.from_Id == 901) {
				width = 35;
			}
			switch (id) {
				/***********代码图表************/

				/**************正常**************/
				//排列三
				case "plsr3-pmzs":
				case "plsr3-hhzs":
				case "plsr3-hzzs":
				case "plsr3-ltfw":
				case "plsr3-012lzs":
				
				case "hasha3-pmzs":
				case "hasha3-hhzs":
				case "hasha3-hzzs":
				case "hasha3-ltfw":
				case "hasha3-012lzs":
				
					//3D
				case "3dr3-pmzs":
				case "3dr3-hhzs":
				case "3dr3-hzzs":
				case "3dr3-ltfw":
				case "3dr3-012lzs":
					width = 44;
					break;
				case "dlt-hzzs-qq":
				case "ssq-hzzs-qq":
					width = 64;
					break;
				default:
					break;
			}
			return width;
		},
		//获取数据
		request: function(url, data, beforeSend, successRes) {
			data.from_Id = JSON.parse(this.cookieGet("obj")).from_Id;
			var token = "";
			if (data.from_Id == "901") {
				token = localStorage.getItem("cn_newToken");
			} else {
				token = common.cookieGet("token");
			}
			$.ajax({
				type: "post",
				contentType: "application/json",
				url: url,
				data: JSON.stringify(data),
				headers: {
					token: token
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
		sortArrayByEnType: function(arr, enType) {
			arr.sort(function(a, b) {
				// order是规则  objs是需要排序的数组
				let order = enType;
				return order.indexOf(a) - order.indexOf(b);
			});
		},

	}
}();
