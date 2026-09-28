
var sunZs = 0;
var zx_chart = function() {

	return {
		/**
		 * @创建人：关宏岩
			START
		 */
		service : function(data, title, len, noteLen) {
			data.reverse(); //顺序颠倒
			sunZs = 1000;
		
			var end_obj = zx_chart.datajs(data, len);
			 var ziran = Math.round(noteLen / sunZs * 10000) / 100.0 + "%";
			 var now = Math.round((len - end_obj.zyl) / len * 10000) / 100.0 + "%";
			 $('#title_yl').html("&nbsp;&nbsp; 期数 :" + len +
			 	"&nbsp;&nbsp;注 :" + noteLen +
			 	"&nbsp;&nbsp;最大遗漏 :" + end_obj.max +
			 	"&nbsp;&nbsp;自然中奖率 :" + ziran + "&nbsp;&nbsp;当前中奖率 :" + now+"&nbsp;&nbsp;遗漏值:"+end_obj.lc[len-1].value)
			 $('#title').html(title+"遗漏查询")
			$('#aaa').html(end_obj.qishu[len - 1] + '期&nbsp;&nbsp; 开奖号码:' + end_obj.num[len - 1])
			return zx_chart.New_Option(title, noteLen, len, end_obj);
		},

		/**
		 * @创建人：关宏岩3
			START
		 */

		datajs : function(data, len) {
			var zyl = 0; //总遗漏数
			var max = 0;
			var data = data;
			var lc = []; //遗漏值
			var maxly = [];
			var dc = 0;
			for (var i = 0; i < data.length; i++) {
				if (data[i].dc == "n") {
					zyl += 1;
					dc++;
				} else {
					dc = 0;
				}
				lc[i] = {};
				lc[i].value = dc;
				maxly[i] = dc
			}
			var pjyl = zyl / (len - zyl);
			pjyl = pjyl.toFixed(2);
			for (var i = 0; i < lc.length; i++) {
				var label = {};
				var itemStyle = {};
				var normal = {};
				lc[i].label = label;
				lc[i].itemStyle = itemStyle;
				lc[i].itemStyle.normal = normal;
				if (lc[i].value == 0) {
					lc[i].itemStyle.normal.color = 'red';
					lc[i].symbolSize = 5;
					lc[i].label.show = true;
					if (i != 0) {
						lc[i - 1].label.show = true;
						lc[i - 1].symbolSize = 5;
						lc[i - 1].showSymbol = true;

					}
				} else {
					lc[i].symbolSize = 3;
				}
			}
			var bolen = 0;
			if (len == 200) {
				bolen = 100 / 2
			} else if (len == 300) {
				bolen = 100 / 3
			} else if (len == 500) {
				bolen = 100 / 5
			}else if(len == 1000){
				bolen = 100/10
			}else if(len == 50){
				bolen = 100/1
			}else if(len == 3000){
				bolen = 100/30
			}else {
				bolen = len
			}
			//最大遗漏
			max = Math.max.apply(null, maxly);
			var label = {};
			var itemStyle = {};
			var normal = {};
			if (lc[lc.length - 1].value == max) {
				lc[lc.length - 1].label.show = true;
				lc[lc.length - 1].symbolSize = 20;
				lc[lc.length - 1].showSymbol = true;
			}
			var qishu = [];
			var num = [];
			for (var i = 0; i < data.length; i++) {

				qishu[i] = data[i].qishu;
				num[i] = data[i].num;
			}
			end_obj.qishu = qishu;
			end_obj.num = num;
			end_obj.lc = lc;
			end_obj.max = max;
			end_obj.zyl = zyl;
			end_obj.pjyl = pjyl;
			end_obj.len = bolen;
			return end_obj;
		},
		///画图表
		New_Option : function(title1, title2, title3, end_obj) {
			var option = {
				title : [
					{
						text : title1,
						show : false,
						textStyle : {
							fontSize : 25
						},

						top : 2,
						left : 0
					},
					{
						id : "aaa",
						text : "&nbsp;&nbsp;期数:" + title3 + ";&nbsp;&nbsp;&nbsp;注数:" + title2 + ";&nbsp;&nbsp;&nbsp;最大遗漏:" + end_obj.max + ";&nbsp;&nbsp;&nbsp;总遗漏:" + end_obj.zyl + ";&nbsp;&nbsp;&nbsp;平均遗漏:" + end_obj.pjyl,
						show : false,
						textStyle : {
							fontSize : 14,
							fontWeight : 'normal',
						},

						top : 39,
						right : '10%',
					},
				],
				dataZoom : [
					{
						type : 'slider',
						zoomLock : true,
						show : true,
						start : 0,
						fillerColor : "#386db3", //折线点的颜色
						end : end_obj.len,
					}

				],
				tooltip : {
					position : [ '10%', '4%' ],
					show : true,
					trigger : 'axis',
					alwaysShowContent : false,
					backgroundColor : 'rgba(192,192,192,0)',
					formatter : function(params, ticket, callback) {
						var html = ""
						for (var i = 0; i < end_obj.num.length; i++) {
							if (params[0].name == end_obj.qishu[i]) {
								html += params[0].name +  "期&nbsp;&nbsp;开奖号码 :"+ end_obj.num[i] ;
							}
						}
						document.getElementById('aaa').innerHTML = html
						return "";

					},
					axisPointer : {
						type : 'cross',
						axis : 'auto',
						label : {
							show : false,
						},
						crossStyle : {
							type : 'solid'
						},
					},
					textStyle : {
						fontSize : 14,
						color : '  	#000000',
					},
				},
				axisPointer : {
					link : {
						xAxisIndex : 'all'
					},
					label : false
				},
				xAxis : {
					type : 'category',
					data : end_obj.qishu,
					show : true,
					axisLabel : {
						show : false,
					},
					boundaryGap : false
				},
				yAxis : [
					{
						type : 'value',
						max : end_obj.max + 5,
					//min: 0,
					}, {
						type : 'value',
					}
				],
				grid:[{
					left: '3%',
					right: '3%',
					zlevel: 1
				}],
				series : [ {
					data : end_obj.lc,
					type : 'line',
					showAllSymbol : true,
					itemStyle : {
						normal : {
							color : "red", //折线点的颜色
							label : {
								fontSize : 15,
								color : '#123234',
								position : 'top',
								distance : 0,
							},
						},
					},
					color : '#1E90FF',
				} ]
			};
			return option;
		}
	}

}();
function type() {
	var ur = window.location.href.substr(0).split("&");
	var type_name = decodeURIComponent(ur[0]).split("=")[1];
	return type_name;
}