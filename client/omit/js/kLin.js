		var url = window.parent.document.referrer;
			var cookie,
				oldOpenNumber;
				var zgValue = [], sgValue = [], xgValue = [], qhSum = [], difList = [],
					deaList = [],
					macdList = [];
			var	openNumber = [];
			var	duicuo = [];
			var	kList = [], dList = [], jList = [], zdjList = [], zgjList = [], zgValue = [], sgValue = [], xgValue = [], zqValue = [],
					bcnCnum = [];
			var	faZs = 0, hm1 = 0, bcfw = 20, zgz1 = 0, hlxzh = 0, xs = 2, sumC = 0, kssc = 0, ksc = 0; //步长范围内所有c之和
				kdjZq = 9, zdj = 0, zgj = 0, kdjK = 50, kdjD = 50, syqK = 0, syqD = 0, macdZb = 0, sygParam = 0, zqNum = 0, cwNum =
					0;
			var	syqEma12 = 0,
					syqEma26 = 0,
					sunZs = 0, type_id = "";
				var syqDea = 0;
				var csid = 0;

			function c() {
				window.close();
			}

			var csid;
			// console.log("城市的id" + csid);
			var from_id = "301";
			var cat = "1105";
			var g_id = 0;
			var g_count = 0;
			var isTP = "";
			var g_zdy = "";
			var g_m;
			var cn_en = ""
			
			function rxgetkjname() {
				$("#qishu").html(k.getName('k.rxqishu'))
				$(".qi").html(k.getName('k.rxxxqi'))
			}

			//请求数据
			function guanbi() {
				windowK.closed;
			}

			
			function ajaxs(onback) {
		
				var data;
				cookie = window.opener.dmzs11x5.pinjiedmzs_k();
				cookie.rows = cookie.qishu;
				cookie.play_id = cookie.type_id;
				delete cookie.qishu;
				delete cookie.type_id;
				//根据代码走势中期数选中K线中期数
				$("input[name='qs']").each(function() {
					if ($(this).val() == cookie.rows) {
						$(this).attr("checked", "checked");
					}
				});
				cookie.code = btutil.cookieGet("topCode1105r5");
				oldOpenNumber = btutil.cookieGet("openNumber");
				var url = "/codeTrend/KLine";
				var successRes = function(res) {
					data = res;
					sunZs = 462;
					type_id = data.play_id;
					csid = data.code;
					if (type_id == "ssca2" || type_id == "sscp2" || type_id == "sscrx2") {
						sunZs = 100
					} else if (type_id == "ssca3" || type_id == "sscp3" || type_id == "sscrx3" || type_id == "plsr3" || type_id ==
						"3dr3") {
						sunZs = 1000
					} else if (type_id == "sscs4" || type_id == "sscrx4") {
						sunZs = 10000
					} else if (type_id == "sscs5") {
						sunZs = 100000
					}
					onBack(data);
				};
				btms.request(url, cookie, "", successRes, false);
			}

			/////k线图内提交的期数
			function k_ajaxs() {
				zgValue = [], sgValue = [], xgValue = [], qhSum = [], difList = [],
					deaList = [],
					macdList = [];
				openNumber = [];
				duicuo = [];
				kList = [], dList = [], jList = [], zdjList = [], zgjList = [], zgValue = [], sgValue = [], xgValue = [], zqValue = [],
					bcnCnum = [];
				faZs = 0, hm1 = 0, bcfw = 20, zgz1 = 0, hlxzh = 0, xs = 2, sumC = 0, kssc = 0, ksc = 0; //步长范围内所有c之和
				kdjZq = 9, zdj = 0, zgj = 0, kdjK = 50, kdjD = 50, syqK = 0, syqD = 0, macdZb = 0, sygParam = 0, zqNum = 0, cwNum =
					0;
				syqEma12 = 0,
					syqEma26 = 0,
					sunZs = 0, type_id = cookieGet("pageId");
				syqDea = 0;
				csid = 0;

				var data;
				if (!cookie) {
					cookie = window.opener.dmzs11x5.pinjiedmzs_k();
				}
				var qishu = $("input[type='radio']:checked").val();
				cookie.rows = cookie.qishu;
				cookie.play_id = cookie.type_id;
				delete cookie.qishu;
				delete cookie.type_id;
				var url = "codeTrend/KLine";
				var successRes = function(res) {
					data = res;
					sunZs = 462;
					onBack(data);
					type_id = data.type_id;
					csid = btutil.cookieGet("topCode1105r5");
					if (type_id == "ssca2" || type_id == "sscp2" || type_id == "sscrx2") {
						sunZs = 100
					} else if (type_id == "ssca3" || type_id == "sscp3" || type_id == "sscrx3" || type_id == "plsr3" || type_id ==
						"3dr3") {
						sunZs = 1000
					} else if (type_id == "sscs4" || type_id == "sscrx4") {
						sunZs = 10000
					} else if (type_id == "sscs5") {
						sunZs = 100000
					}
				};
				btms.request(url, cookie, "", successRes, false);
			}

			function tijiaoqisu() {
				zgValue = [], sgValue = [], xgValue = [], qhSum = [], difList = [],
					deaList = [],
					macdList = [];
				openNumber = [];
				duicuo = [];
				kList = [], dList = [], jList = [], zdjList = [], zgjList = [], zgValue = [], sgValue = [], xgValue = [], zqValue = [],
					bcnCnum = [];
				faZs = 0, hm1 = 0, bcfw = 20, zgz1 = 0, hlxzh = 0, xs = 2, sumC = 0, kssc = 0, ksc = 0; //步长范围内所有c之和
				kdjZq = 9, zdj = 0, zgj = 0, kdjK = 50, kdjD = 50, syqK = 0, syqD = 0, macdZb = 0, sygParam = 0, zqNum = 0, cwNum =
					0;
				syqEma12 = 0,
					syqEma26 = 0,
					sunZs = 0, type_id = cookieGet("pageId");
				syqDea = 0;
				csid = 0;
				var qishu = $("input[type='radio']:checked").val();
				k_ajaxs(onBack, qishu);

			}


			function onBack(data) {

			qhSum = [],openNumber = [];
				ktjfaList = "";
				rows = data.length;
				ksc = 0;
					var myobj = eval(data);
					$.each(data, function(i, item) {
						if (i <= rows) {
							ktjfaList += item.num + "-";
							openNumber.push(item.num);
							qhSum.push(item.qishu);
							duicuo.push(item.dc);
							kssc = i + 1;
							if (item.dc == "y") { //红
								ksc++;
							}
						}

					})
					kssc = rows;
					/* myobj = myobj.slice(0, rows); */
					addMainData(data);
				

			}

			function pushdArray(arr, index, value, value2) { //arr 被插二维数组 index二维数组索引 value插入值
				arr[index] = new Array();
				arr[index][0] = index + 1;
				arr[index][1] = value;
				arr[index][2] = value2;
				arr[index][3] = value;
				arr[index][4] = value2;
				arr[index][5] = value;
				arr[index][6] = value2;
				arr[index][7] = value;
				arr[index][8] = value2;
				arr[index][9] = value;
				arr[index][10] = value2;

				return arr;
			}


			function jsbcr5() {
				faZs = neirong.length;
				var bc = (sunZs / faZs) / 1 - 1;
				var t = $('#wf', parent.document).val();
				if (t == 2 || t == 3 || t == 4) {
					bc = (sjfw - ksc) / ksc;
				}
				return bc;
			}

			var myChart1;
			function addMainData(data23) {
				myChart1 = echarts.init(document.getElementById("main1"));

				//1105r5任五  1105a3前三组  1105a2前二组   1105a3z前三直  1105a2z前二直
				var datar5 = new Array();
				var datar51 = new Array();
				//ma标准
				var ma1 = 0;
				var bc = jsbcr5();
				var pjyl = "";
				var yl1 = 0;
				for (var i = 0; i < data23.length; i++) { //计算k线
					//K线
					var one = i + 1;
					var yn = data23[i].dc; //y红  n绿
					if (yn.toString() == "y") { //红
						datar5 = pushdArray(datar5, i, hm1, (hm1 + bc));
						hm1 = hm1 + bc; //红线计算上端坐标
						//ksc ++;
						yl1 = 0;
					} else { //绿
						datar5 = pushdArray(datar5, i, hm1, (hm1 - 1));
						hm1 = hm1 - 1; //绿线计算下端坐标   固定值为-1
						yl1++;
					}
					//收盘价c
					var spjC = hm1;
					//当前是否超出不长
					var js1 = i - (bcfw - 1);
					if (js1 > 0) { //当等于步长时，去掉
						if (yn.toString() == "y") {
							if (zqValue[0] == "y") {

							} else {
								zqNum++;
								cwNum--;
							}
						} else {
							if (zqValue[0] == "n") {

							} else {
								zqNum--;
								cwNum++;
							}
						}
						hlxzh = hlxzh - datar5[js1 - 1][1] + hm1;
						zqValue.splice(0, 1);
						zqValue.push(yn);
						bcnCnum.splice(0, 1);
						bcnCnum.push(hm1);

					} else {
						hlxzh = hlxzh + hm1;
						zqValue.push(yn);
						bcnCnum.push(hm1);
						if (yn.toString() == "y") {
							zqNum++;
						} else {
							cwNum++;
						}
					}
					//console.log("zqValue:"+zqValue);
					//ma = 步长范围内所有c（红绿线）之和  / 步长
					ma1 = hlxzh / bcfw;
					var tsumC = 0;
					for (var j = 0; j < bcnCnum.length; j++) {
						tsumC = tsumC + (bcnCnum[j] - ma1) * (bcnCnum[j] - ma1);
					}

					//sumC = sumC + ((spjC-ma1)*(spjC-ma1));//（步长内每期c-ma）平方    累加之和

					//标准差
					var httttt = tsumC / bcfw;
					var bzc = Math.sqrt(httttt); //开放【（步长内每期c-ma）平方    累加之和 / 步长】
					bzc = parseFloat(bzc).toFixed(2);

					//中轨  = 步长范围内所有红绿线之和  / 步长  + 上一期中轨值
					//					console.log("正确数："+zqNum+";错误数："+cwNum+";")

					var hz111 = (zqNum * bc) - cwNum;
					hz111 = parseFloat(hz111).toFixed(2);
					var zg1 = hz111 / bcfw + zgz1 * 1;
					//					zg1 = parseFloat(zg1).toFixed(2);
					//添加中轨集合
					zgValue.push(zg1);
					//上轨     中轨+系数*标准差
					var sg1 = zg1 + xs * bzc;
					//添加上轨集合
					sgValue.push(sg1);

					//下轨     中轨-系数*标准差
					var xg1 = zg1 - xs * bzc;
					//添加下轨集合

					xgValue.push(xg1);
					//上一期中轨值
					zg1 = parseFloat(zg1).toFixed(2);
					zgz1 = zg1;

					//第二个图表
					var dqqEma12 = (syqEma12 * 11 / 13) + (spjC * 2 / 13);

					var dqqEma26 = (syqEma26 * 25 / 27) + (spjC * 2 / 27);
					syqEma12 = dqqEma12;
					syqEma26 = dqqEma26;
					var dqDif = syqEma12 - syqEma26;
					//console.log(syqEma12+"=="+syqEma26+"dqDif="+(syqEma12 - syqEma26));
					var dqDea = (syqDea * 8 / 10) + (dqDif * 2 / 10);
					var dqMacd = (dqDif - dqDea) * 2;
					//console.log("dqqEma12="+dqDif +"dqDea=="+dqDea+"dqMacd=="+dqMacd);
					difList.push(dqDif);
					deaList.push(dqDea);
					//if(dqMacd==0){
					//macdList.push(-0.01);
					//}else{
					macdList.push(dqMacd);
					//}


					syqDea = dqDea;

					//第三个坐标图表

					//					var kdj = 9;//kdj周期
					//					var zdj=0,zgj=0,kdjK=50,kdjD=50,syqK=0,syqD=0;
					//					var kList = [],dList = [],jList=[];
					//					var zdjList =[],zgjList[];

					var js2 = i - (kdjZq - 1);
					if (js2 > 0) {
						zdjList.splice(0, 1);
						zdjList.push(spjC);
					} else {
						zdjList.push(spjC);
					}
					
			
				
					zgj = Math.max.apply(null, zdjList); //最高价H
					zdj = Math.min.apply(null, zdjList); //最低价L

					var rsv = 0;
					if (i == 0) {
						rsv = 100;
					} else {
						rsv = (spjC - zdj) / (zgj - zdj) * 100;
					}
					if (syqK == 0) {
						syqK = 50;
					}
					if (syqD == 0) {
						syqD = 50;
					}

					kdjK = 2 / 3 * syqK + 1 / 3 * rsv;
					kdjD = 2 / 3 * syqD + 1 / 3 * kdjK;
					var kdjJ = 3 * kdjK - 2 * kdjD;
					if (i == 0) {
						kdjJ = 0;
					}
					kList.push(kdjK);
					dList.push(kdjD);
					jList.push(kdjJ);
					syqK = kdjK;
					syqD = kdjD;
				}
				
				//if (cn_en == "cn") {

					ktitle = "【" + faZs + "注    实出：" + ksc + "/" + kssc +
						"   当前遗漏：" + yl1 + "】";
				//} else {
				//	ktitle = "【" + faZs + "notes    Real output：" + ksc + "/" + kssc +
				//		"   Current omission：" + yl1 + "】";
				//}

				var data = splitData(datar5);

				//数组处理
				function splitData(rawData) {
					var datas = [];
					var times = [];
					var vols = [];
					var macds = [];
					var difs = [];
					var deas = [];
					var hm = [];
					for (var i = 0; i < rawData.length; i++) {
						datas.push(rawData[i]);
						times.push(rawData[i].splice(0, 1)[0]);
						vols.push(rawData[i][4]);
						macds.push(rawData[i][6]);
						difs.push(rawData[i][7]);
						deas.push(rawData[i][8]);
						hm.push(i + "sdfsdf");
					}
					return {
						datas: datas,
						times: times,
						vols: vols,
						macds: macds,
						difs: difs,
						deas: deas,
						hm: hm
					};
				}

				var gridListHeight = '85%';
				var macdKListHeight = '30%';
				var kdjKListHeight = '30%';
				var macdKListTop = '45%';
				var kdjKListTop = '66%';
				var macdK = "";
				var kdjK = "";
				var gridBoolen = false;
				if (macdK != null && macdK != "" && kdjK != null && kdjK != "") {
					gridListHeight = '85%';
					gridBoolen = true;
				}
				var legendlist = [];
				var gridList = [{
					left: '3%',
					right: '3%',
					zlevel: 1
				}];
				var xAxisList = [{
					type: 'category',
					data: data.times,
					scale: true,
					silent: true,
					show: false,
					axisLine: {
						onZero: false,
					},
					splitLine: {
						show: false,
					},
					axisLabel: {
						show: gridBoolen
					},
					boundaryGap: false
				}];
				var yAxisList = [{
					splitArea: {
						show: false
					},
					gridIndex: 0,

				}]

				var endLen = 0;
				if (kssc == 200) {
					endLen = 100 / 2
				} else if (kssc == 300) {
					endLen = 100 / 3
				} else if (kssc == 500) {
					endLen = 100 / 5
				}else if(kssc == 1000){
					endLen = 100/10
				}else if(kssc == 50){
					endLen = 100/1
				}else {
					endLen = kssc
				}
			
				var seriesList = [{
					name : 'KLine',
					type: 'candlestick',
					data: data.datas,
					symbolSize: 0,
					smooth: true,
					itemStyle: {
						normal: {
							color: '#ec0000',
							color0: '#00da3c',
							borderColor: '#ec0000',
							borderColor0: '#00da3c'
						}
					},
				}, {
					name : '中轨',
					type: 'line',
					data: zgValue,
					smooth: true,
					symbolSize: 0,
					lineStyle: {
						normal: {
							width: 1
						}
					},
					itemStyle: {
						normal: {
							color: '#de7e7b'
						}
					}
				}, {
					name : '上轨',
					type: 'line',
					data: sgValue,
					smooth: true,
					symbolSize: 0,
					lineStyle: {
						normal: {
							width: 1
						}
					},
					itemStyle: {
						normal: {
							color: '#547b95'
						}
					}
				}, {
					name : '下轨',
					type: 'line',
					data: xgValue,
					smooth: true,
					symbolSize: 0,
					lineStyle: {
						normal: {
							width: 1
						}
					},
					itemStyle: {
						normal: {
							color: '#8b969d'
						}
					}
				}];
				var option = {

					textStyle: {
						color: '#000'
					},

					dataZoom : [
						{
							type : 'slider',
							zoomLock : true,
							show : true,
							start : 0,
							fillerColor : "#386db3", //折线点的颜色
							end: endLen
						}

					],
					tooltip: {
						trigger: 'axis',
						alwaysShowContent: true,
						position: [10, 10],
						formatter: function(params, ticket, callback) {
							var htmlStr = '';
							for (var i = 0; i < params.length; i++) {

								var param = params[i];
								var xName = param.name; //x轴的名称
								var seriesName = param.seriesName; //图例名称
								var value = 0; //y轴值
								if (seriesName.toString() == "KLine") {
									value = param.value[0];
								}
								var color = param.color; //图例颜色
								if (i === 0) {
									htmlStr += qhSum[value] + "期&nbsp;&nbsp; 开奖号:"+ openNumber[value];
								}
							}
							document.getElementById('aaa').innerHTML = htmlStr;
							return "";
						},
						axisPointer: {
							type: 'cross',
							label: {
								show: false,
							},
							crossStyle: {
								type: 'solid'
							},
						},
					},
					axisPointer: {
						link: {
							xAxisIndex: 'all'
						},
						label: false
					},
					legend: legendlist,
					grid: gridList,
					xAxis: xAxisList,
					yAxis: yAxisList,
					series: seriesList,
					animation: false
				};

				myChart1.setOption(option);
				window.addEventListener("resize", function() {
					myChart1.resize();
				});
				zgValue = [], sgValue = [], xgValue = [], difList = [],
					deaList = [],
					macdList = [],

				duicuo = [];
				kList = [], dList = [], jList = [], zdjList = [], zgjList = [], zgValue = [], sgValue = [], xgValue = [], zqValue = [],
					bcnCnum = [];
				faZs = 0, hm1 = 0, bcfw = 20, zgz1 = 0, hlxzh = 0, xs = 2, sumC = 0, kssc = 0, ksc = 0; //步长范围内所有c之和
				kdjZq = 9, zdj = 0, zgj = 0, kdjK = 50, kdjD = 50, syqK = 0, syqD = 0, macdZb = 0, sygParam = 0, zqNum = 0, cwNum =
					0;
				syqEma12 = 0,
					syqEma26 = 0,
					sunZs = 0;
				syqDea = 0;
				csid = 0;
				//myChart.resize;
				//window.onresize = myChart1.resize; //图表自适应窗口大小

			}