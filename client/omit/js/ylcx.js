/**

 * @创建时间：2018-12-17
 * @修改人：
 * @修改日期：
 * @备注：遗漏查询处理
 */
var d_iv = "main" //div的id
var end_obj = {};
var max = 0
var title = ""
var nowTopCode;
var neirong;
var myChart;
var code = "";

var ylcx = function() {
		return {
			isNullSrc(param) {
				if (null == param || param == "" || typeof param == undefined || param == "undefined" || param == " " || param
					.length == 0) {
					return true
				} else {
					return false
				}
			},
			/**
	
			 * @备注：获取开奖数据
			 * @参数说明：
			 * @参数code:城市ID
			 */
			KaiJiangShuJu: function() {
				var hangshu = $("input[name='rows']:checked").val();
				code = ylcx.getQueryVariable("code");
				let url = 'https://soft-api.bajiaoxing-tech.com/api/lotteryNumber/topRows'
				let data = {
					code: code,
					rows: hangshu
				}
				const mantissa = ylcx.getQueryVariable("mantissa");
				if (mantissa) {
					url = 'https://soft-api.bajiaoxing-tech.com/api/lotteryNumber/mantissaTopRows';
					data.mantissa = mantissa;
				}
				const requestUrl = ylcx.getQueryVariable("requestUrl");
				if(ylcx.isNullSrc(requestUrl) || requestUrl == "null"){
					$.ajax({
						headers: {
							"Content-Type": "application/json",
							"Access-Control-Allow-Origin": "*"
						},
						timeout: 1000 * 30,
						type: "post",
						dataType: "json",
						url: url,
						data: JSON.stringify(data),
						beforeSend: function() {
					
						},
						success: function(response) {
							if (response.code == 0) {
								ylcx.HuiDiao(response.data);
							}
						},
						error: function(XMLHttpRequest, textStatus, errorThrown) {
					
						}
					});
				}else{
		
					$.ajax({
						headers: $.extend({
							"Content-Type": "application/json",
							"Access-Control-Allow-Origin": "*"
						// 服务端下发的数据源接口需要 token，第三方地址返回 {}
						}, window.dsSources ? window.dsSources.serverHeaders(requestUrl) : {}),
						timeout: 1000 * 30,
						type: "GET",
						dataType: "json",
						url: requestUrl + "?code=" + code + "&rows=" + hangshu,
						success: function(response) {
							// 第三方源字段名各异，先归一化成 expect/opennumber/openTime/lottoId
							response = window.dsSources ? window.dsSources.normalizeDraws(response, code) : response;
							if (response.code == 0) {
								ylcx.HuiDiao(response.data);
							}
						},
						error: function(XMLHttpRequest, textStatus, errorThrown) {
					
						}
					});
				}
			},
			/**
	
			 * @备注：通过接口获取开奖数据成功后回调
			 * @参数说明：
			 * @参数data:开奖数据
			 */

			HuiDiao: function(data) {
				neirong = $("#content").val();
				if (!ylcx.ShiFouKong(neirong)) {
					layer.alert("内容不能为空");
					return;
				}
				neirong = ylcx.ZhengLi(neirong); //console.log(neirong)
				neirong = neirong.split("\n");
				var shuju_jh = ylcx.ShuJuPinZhuang(data, neirong);
				if (code == "202") {
					title = "3D";
				} else if (code == "104") {
					title = "排三";
				}
				var len = shuju_jh.length;
				var neironglen = neirong.length - 1
				myChart = echarts.init(document.getElementById(d_iv));

				var op = zx_chart.service(shuju_jh, title, len, neironglen)
				myChart.setOption(op);
				window.addEventListener("resize", function() {
					myChart.resize();
				});
				
				onBack(shuju_jh)

			},
			/**
			 * @创建人：张虒瑜
			 * @备注：整理格式
			 */
			ZhengLi: function(neirong) {
				let typeId = ylcx.getQueryVariable("typeId");
				var num = 0;
				neirong = neirong.toString().replace(/\ +/g, "").replace(/,/g, "").replace(/[\r\n]/g, "");
				num = 3 * 2;
				if (typeId == 'animalsa2' || typeId == 'animalsp2') {
					num = 4;
				}
				if (typeId == '1105r5') {
					num = 15;
				} else if (typeId == '1105r4') {
					num = 12;
				} else if (typeId == '1105r3') {
					num = 9;
				} else if (typeId == '1105r2') {
					num = 6;
				}else if (typeId == '1105a3') {
					num = 9;
				}else if (typeId == '1105a2') {
					num = 2;
				}
				if (typeId.indexOf("animals") > -1) {
					neirong = neirong.replace(/0/g, '');
				}
				if (typeId.indexOf('1105') > -1) {
					neirong = neirong.replace(/(.{2})/g, '$1,');
				} else {
					neirong = neirong.replace(/(.{1})/g, '$1,');
				}
				for (var i = 1; i < neirong.length + 1; i++) {
					if (i % num == 0) {
						neirong = neirong.substring(0, i - 1) + "\n" + neirong.substring(i, neirong.length);
					}
				}

				return neirong;
			},
			/**
			
			 * @备注：判断变量是否为空
			 * @参数说明：
			 * @参数char:变量
			 */
			ShiFouKong: function(char) {
				if (typeof(char) == undefined || char == "" || char == null) {
					return false
				} else {
					return true;
				}
			},
			/**
			
			 * @备注：获取粘贴板内容赋值到页面元素中  暂时从cookie中获取用户复制的内容，chrome禁止使用js获取复制内容
			 * @参数说明：
			 * @参数id:元素ID
			 */
			ZhanTieNeiRong: function(e) {
				let code = ylcx.getQueryVariable("code");
				let copyData = localStorage.getItem(code + "_copyData");
				if (ylcx.ShiFouKong(copyData)) {
					$("#content").val(copyData);
				} else {
					layer.alert("没有可粘贴内容");
				}
			},
			/**
	
			 * @备注：拼装图表所需要的数据
			 * @参数说明：
			 * @参数data:开奖号码集合
			 * @参数neirong:粘贴号码
			 */
			ShuJuPinZhuang: function(data, neirong) {
				
				let typeId = ylcx.getQueryVariable("typeId");
				let jihe = [];
				for (var i = 0; i < data.length; i++) {
					var jihe_value = {};
					jihe_value.qishu = data[i].expect;
					jihe_value.num = data[i].opennumber;
					var opennumber = data[i].opennumber;
					if (typeId == 'animalsp3') {
						opennumber = opennumber.split(",")[3] + "," + opennumber.split(",")[4] + "," + opennumber
							.split(",")[5]
						opennumber = opennumber.replace(/0(\d)/g, '$1');
					} else if (typeId == 'animalsa3') {
						opennumber = opennumber.split(",")[0] + "," + opennumber.split(",")[1] + "," + opennumber
							.split(",")[2]
							opennumber = opennumber.replace(/0(\d)/g, '$1');
					} else if (typeId == 'animalsa2') {
						opennumber = opennumber.split(",")[0] + "," + opennumber.split(",")[1]
						opennumber = opennumber.replace(/0(\d)/g, '$1');
					} else if (typeId == 'animalsp2') {
						opennumber = opennumber.split(",")[4] + "," + opennumber.split(",")[5]
						opennumber = opennumber.replace(/0(\d)/g, '$1');
					} else if (typeId == 'hasha3') {
						opennumber = opennumber.split(",")[0] + "," + opennumber.split(",")[1] + "," + opennumber
							.split(",")[2]
					} else if (typeId == '1105a3') {
						opennumber = opennumber.split(",")[0] + "," + opennumber.split(",")[1] + "," + opennumber
							.split(",")[2]
					}else if (typeId == '1105a2') {
						opennumber = opennumber.split(",")[0] + "," + opennumber.split(",")[1] 
					}
					
					if (typeId.indexOf("1105r") > -1) {
						let len = 5;
						if (typeId == "1105r4") {
							len = 4;
						} else if (typeId == "1105r3") {
							len = 3;
						}
						if (typeId == "1105r2") {
							len = 2;
						}
						if (ylcx.yesAanno(opennumber, neirong, len)) {
							jihe_value.dc = "y";
						} else {
							jihe_value.dc = "n";
						}
					} else if (typeId == '1105a3' || typeId == '1105a2') {
						let list = opennumber.split(",");
						list.sort();
						opennumber = "";
						for (let u = 0; u < list.length; u++) {
							opennumber += list[u];
							if ((u + 1) < list.length) {
									opennumber += ",";
								}
							}
							
							if (neirong.indexOf(opennumber) > -1) {
								jihe_value.dc = "y";
							} else {
								jihe_value.dc = "n";
							}
						} else {

							if (neirong.indexOf(opennumber) > -1) {
								jihe_value.dc = "y";
							} else {
								jihe_value.dc = "n";
							}
						}
						jihe.push(jihe_value);
					}
					return jihe;
				},

				yesAanno: function(opennumber, gudingplan, len) {
						var numArr = opennumber.split(",");
						for (var i = 0; i < gudingplan.length; i++) {
							var gdpl = gudingplan[i].split(",");
							//console.log("转的数组"+gdpl)
							var count = 0;
							for (var j = 0; j < gdpl.length; j++) {
								if (numArr[0] == (gdpl[j])) {
									count++;
								} else if (numArr[1] == (gdpl[j])) {
									count++;
								} else if (numArr[2] == (gdpl[j])) {
									count++;
								} else if (numArr[3] == (gdpl[j])) {
									count++;
								} else if (numArr[4] == (gdpl[j])) {
									count++;
								}
							}
							if (count == len) {
								return true;
							}
						}
						return false;
					},
					getQueryVariable: function(variable) {
						var query = window.location.search.substring(1);
						var vars = query.split("&");
						for (var i = 0; i < vars.length; i++) {
							var pair = vars[i].split("=");
							if (pair[0] == variable) {
								return pair[1];
							}
						}
						return (false);
					}
			};
		}();

		function type() {
			var ur = window.location.href.substr(0).split("&");
			var type_name = decodeURIComponent(ur[0]).split("=")[1];
			return type_name;
		}