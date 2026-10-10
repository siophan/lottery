var screenStatus = 'normal'; // 同屏状态判断 normal=正常；moreScreen=同屏
var nowCode = "";
var from_id = "802";
var intervalID = null;
var url_u = window.location.href;
var type_name = url_u.split(",");
var addstr = document.URL;
var num = addstr.indexOf("?")
addstr = addstr.substr(num + 1);
var main_id = "202";
var play_id = "3dr3";
var requestUrl = null;
var cat = "3d";
var yuyan = "cn";
var playId = addstr.split(",")[1];
var k_language = yuyan // cn或者en
var nowOpenNumber = "";
var planList = {
	"3dr3": [512, 513, 514, 515, 516, 517, 518, 519, 520],
	"plsr3": [505, 506, 507, 508, 509, 510, 511, 521, 522],
	"animalsa3": [547, 548, 549, 550, 551, 552, 553, 554, 555],
	"animalsp3": [557, 558, 559, 560, 561, 562, 563, 564, 565],
	"animalsa2": [529, 530, 531, 532, 533, 534, 535, 536, 537],
	"animalsp2": [538, 539, 540, 541, 542, 543, 544, 545, 546],
	"hasha3": [572, 573, 574, 575, 576, 577, 578, 579, 580],
	"1105r5": [582, 583, 584, 585, 586, 587, 588, 589, 590],
	"1105r4": [591, 592, 593, 594, 595, 596, 597, 598, 599],
};
/**
 * @创建人：关宏岩
 * @备注：关闭窗口
 */
function c() {
	window.close();
}

function getQueryVariable(variable) {
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
var playList = {
	"plsr3": [{
		"key": "plsr3",
		"name": "排3"
	}],
	"3dr3": [{
		"key": "3dr3",
		"name": "3D"
	}]
};
// 每十分刷新一次
/*
 * function myrefresh() { window.location.reload(); }
 * setTimeout('myrefresh()',600000);
 */
$(document).ready(function() {
	main_id = getQueryVariable("code");
	play_id = getQueryVariable("playId");
	cat = getQueryVariable("cat");
	requestUrl = getQueryVariable("requestUrl");

	$("#wf").val(play_id);
	myChart = echarts.init(document.getElementById('main'));
	//根据彩种添加玩法
	getkjname(cat);
	// 获取自定义方案组
	k.getUserK(true);
	// 为自定义方案列表添加事件
	$('.placeholder').click(k.spanclic);
	// 语言同步主页面
	//$("#yuyan").val(k_language);
});
/**
 * @创建人：关宏岩
 * @备注：根据传入的彩种,和k_language（中英文）.动态添加页面空间名字
 */
function getkjname(cat) {
	$("title").html("K线图")
	$("#szcs").val("设置参数");
	$("#szcs").click(function() {
		openLayersRefer("设置参数", 'szcs.html?id=11x5', '620px', '500px', "保存", "取消");
	});
	$("#tongping").val("同屏");
	$("#tijiao").val("提交");
	$("#houtui").val("后退");
	$("#qianjin").val("前进");
	$("#zdy").html("自定义");
	$("#tjding").html("关联");
	playId = $('#wf').val();
	loadingPlan();
}

function qhwf() {
	playId = $('#wf').val();
	loadingPlan();
}

function loadingPlan() {

	var html = "";
	console.log("play_id", play_id)
	let list = localStorage.getItem(play_id + "_plan");
	console.log("list", list)
	list = JSON.parse(list)
	for (var i = 0; i < list.length; i++) {
		html += '<option value="' + list[i].id + '">' + list[i].name + '</option>';
	}
	$('#tjfa3 option').remove();
	$('#tjfa3').append(html);
	gssz();

}



/**
 * @创建人：关宏岩
 * @备注：获取设置选项里的初始化值存入cookie里
 */
function gssz() {

	let userName = localStorage.getItem("userName");
	if (ShiFouKong(localStorage.getItem(userName + "_Kxtsjfw"))) {
		localStorage.setItem(userName + "_Kxtsjfw", "120"); // 范围
	}
	if (ShiFouKong(localStorage.getItem(userName + "_Kxtbc"))) {
		localStorage.setItem(userName + "_Kxtbc", "20"); // 
	}
	if (ShiFouKong(localStorage.getItem(userName + "_Kxtxs"))) {
		localStorage.setItem(userName + "_Kxtxs", "2"); // 
	}
	if (ShiFouKong(localStorage.getItem(userName + "_Kxtzb"))) {
		localStorage.setItem(userName + "_Kxtzb", "0"); // 
	}
	if (ShiFouKong(localStorage.getItem(userName + "_Kxtjszq"))) {
		localStorage.setItem(userName + "_Kxtjszq", "9"); // 
	}

	loadingData();

}

function ShiFouKong(char) {
	if (typeof(char) == undefined || char == "" || char == null) {
		return true
	} else {
		return false;
	}
}

/**
 * @创建人：关宏岩
 * @备注：一次性获取九个固定方案存入本地缓存
 */
function getgdfa(from_id, cat, pageId) {
	var success = function(data) {
		var d = data.data;
		for (var i = 1; i < d.length + 1; i++) {
			btutil.cookieSet(d[i - 1].id, d[i - 1].content);

		}
		btutil.cookieSet(cat + pageId, JSON.stringify(data.data));
	}

	btutil.cookieSet(cat + pageId, "");
	if (btutil.cookieGet(cat + pageId) == "" || btutil.cookieGet(cat + pageId) == null || btutil.cookieGet(cat +
			pageId) ==
		"undefined") {
		var gddata = {
			play_id: playId,
			type: 1
		};
		btms.request('planFixed/contentList', gddata, "", success, false);
	}

}

/**
 * @创建人：关宏岩
 * @备注：初始化请求数据
 */
function loadingData(f) {

	let userInfo = localStorage.getItem("userInfo") || {};
	userInfo = JSON.parse(userInfo)
	let userName = userInfo.id;
	//nowOpenNumber = JSON.parse(localStorage.getItem("new_"+main_id)).opennumber;
	//初始化将“main”div显示，用于echarts获取

	if (!$("#tp").is(':hidden') && !f) {
		TongPing()
	} else {
		if ($("#main").is(':hidden')) {
			$("#tp").html("");
			$("#tp").hide();
			$("#main").show();
			ishide(false);
			var scrWidth = screen.availWidth;
			var scrHeight = screen.availHeight;

		}

		myChart.clear();
		// 记下本屏当前方案，供「后退 / 前进」切换（k_history.js）
		kHistory.record();
		// 方案号码画完前「提交」置灰（k_submit.js）
		kSubmit.loading();

		//薛贵平修改
		window.onresize = function() {
			var main = document.getElementById('main');
			main.style.width = window.innerWidth * 0.96 + 'px';
			main.style.height = window.innerHeight * 0.84 + 'px';
			myChart.resize();
		};
		zgValue = [], sgValue = [], xgValue = [], qhSum = [], difList = [],
			deaList = [],
			macdList = [];
		openNumber = [];
		kList = [], dList = [], jList = [], zdjList = [], zgjList = [], zgValue = [], sgValue = [], xgValue = [],
			zqValue = [],
			bcnCnum = [];
		sunZs = 0, faZs = 0, hm1 = 0, bcfw = 20, zgz1 = 0, hlxzh = 0, xs = 2, sumC = 0, kssc = 0, ksc = 0; // 步长范围内所有c之和
		kdjZq = 9, zdj = 0, zgj = 0, kdjK = 50, kdjD = 50, syqK = 0, syqD = 0, macdZb = 0, sygParam = 0, zqNum = 0,
			cwNum =
			0;
		syqEma12 = 0,
			syqEma26 = 0,
			syqDea = 0;
		var fa = k.planMode(); // 关联到保存方案时按自定义方案取数
		var Id = "";
		// typeZs();
		wfType = $('#wf').val();
		let info = localStorage.getItem("klink_info");
		var data;
		if (typeof(info) == undefined || info == "" || info == null) {
			data = {};
			data.dataRange = 120;
			data.step = 20;
			data.coefficient = 2;
			data.macd = 0;
			data.cycle = 9;
		} else {
			data = JSON.parse(info);
		}
		sjfw = data.dataRange; // /数据范围
		bcfw = data.step; // /步长范围
		xs = data.coefficient; // /系数范围
		macdZb = data.macd; // /指数平滑指标
		kdjZq = data.cycle; // /随机指标
		var code = localStorage.getItem("topCode" + type_name[1]);
		// 将获取的城市代码记录本地，方便后期判断
		nowCode = code;
		var pageId = "";
		pageId = $('#wf').val();
		faName = $("#wf").find("option:selected").text();
		if (1 == fa) {
			Id = document.getElementById("zdyfa4").innerText;
		} else {
			Id = document.getElementById("tjfa3").value;
		}
		var rows = data.dataRange;
		var rowNum = $("#jdqqs").val();
		// planList[playId].forEach(itme=>{
		// 	if(ShiFouKong(localStorage.getItem(itme))){
		// 		parent.setPlan(itme);
		// 	}
		// })
		if (fa == 2) {

			if (Id == "f001" || Id == "f002") {
				let planData = JSON.parse(localStorage.getItem("plan_" + main_id));
				planData = planData[Id];
				planData = planData.slice(1, rows + 1);
				onBack(planData);

			} else {

				// //发送请求
				// var zdyFamc = $('#zdyfa4').attr("data");
				// var parm = {
				// 	plan_id: zdyFamc,
				// 	play_id: playId,
				// 	code: code,
				// 	rows: rows
				// };
				// // 发送请求
				// if ($('#zdyfa3').text() != "" && $('#zdyfa4').text() != "") {
				// 	btms.request('/kLink/getDataByrecommend', parm, "", onBack, true);

				// }

				var successRes = function(res) { //智能数据
					k_util.getyesAndno(res.data, cat, pageId, Id, onBack)
				};
				// 取数失败时显示失败状态和重试入口（k_sync.js），重试即重新加载本屏
				kSync.fetchDraws({
					code: main_id,
					rows: rows,
					mantissa: getQueryVariable("mantissa"),
					requestUrl: requestUrl
				}, successRes, function() { loadingData(); });



				// $.ajax({
				// 	url: ,
				// 	method: 'post',
				// 	headers: {
				// 		Fromid: from_id,
				// 		token: '383f98c13cbe4b1a93b55c5e05c22d6b',
				// 		'Content-Type': 'application/json'
				// 	},
				// 	data: {
				// 		code: main_id,
				// 		rows: rows
				// 	},
				// 	dataType: 'json',
				// 	success: function(response) {
				// 		// 请求成功时的回调函数
				// 		
				// 	}

				// });
			}


		} else {
			var zdyfa3 = $('#zdyfa3').text();
			var zdyfa4 = $('#zdyfa4').text();
			// let data = JSON.parse(localStorage.getItem("num_" + main_id));
			// data = data.slice(0, rows);
			// parent.getPlan(zdyfa3, zdyfa4, data);

			var successRes = function(res) { //智能数据
				parent.getPlan(zdyfa3, zdyfa4, res.data, kScreenNo());
			};
			// 取数失败时显示失败状态和重试入口（k_sync.js），重试即重新加载本屏
			kSync.fetchDraws({
				code: main_id,
				rows: rows,
				mantissa: getQueryVariable("mantissa"),
				requestUrl: requestUrl
			}, successRes, function() { loadingData(); });


			// //发送请求
			// var zdyFamc = $('#zdyfa4').attr("data");
			// var parm = {
			// 	plan_id: zdyFamc,
			// 	play_id: playId,
			// 	code: code,
			// 	rows: rows
			// };
			// // 发送请求
			// if ($('#zdyfa3').text() != "" && $('#zdyfa4').text() != "") {
			// 	btms.request('/kLink/getDataByrecommend', parm, "", onBack, true);

			// }
		}
	}


}

/**
 * @创建人：关宏岩
 * @备注：回调方法
 */
function onBack(data) {
	let infoData = JSON.parse(localStorage.getItem("klink_info"));
	if (typeof(infoData) == undefined || infoData == "" || infoData == null) {
		infoData = {};
		infoData.dataRange = 120;
		infoData.step = 20;
		infoData.coefficient = 2;
		infoData.macd = 0;
		infoData.cycle = 9;
	}
	faZs = data.len;
	let userName = localStorage.getItem("userName");
	ktjfaList = "";
	sunZs = getsunzs(cat, wfType); // /获取总注数
	var Id = $("#tjfa3").val(); // /推荐方案值
	for (var i = 0; i <= 9; i++) {
		if (Id == i) {
			faName = faName + k.getName("k.tjfa" + i);
		}
	}

	if (Id == "f001" || Id == "f002") {
		var w = JSON.stringify(data);
		var reg = new RegExp('"result":1', "g");
		w = w.replace(reg, '"result":"y"');
		reg = new RegExp('"result":0', "g")
		w = w.replace(reg, '"result":"n"');
		data = JSON.parse(w);
	}


	var fa = k.planMode() // /fa：==1（自定义方案，含关联到保存方案） ==2（推荐方案）
	if (fa == 1) {
		faName = $("#zdyfa4").text();
	} else {
		faName = $("#tjfa3").find("option:selected").text();
	}

	var rows = infoData.dataRange;
	ksc = 0;


	var val = k.planMode();
	if ((Id == "f001" || Id == "f002") && parseInt(val) == 2) {
		faZs = data[1].data.length;
	}


	data.reverse(); // /数据排序
	var myobj = eval(data);

	$.each(data, function(i, item) {
		if (i <= rows) {
			ktjfaList += item.opennumber + "-";
			openNumber.push(item.opennumber);
			qhSum.push(item.expect);
			kssc = i + 1;

			if (item.result.toString() == "y") { // 红
				ksc++;
			}
		}
	})
	kssc = rows;
	myobj = myobj.slice(0, rows);
	addMainData(myobj);

}

/**
 * @创建人：关宏岩
 * @备注：计算理论遗漏值
 */
function jsbcr5() {
	var bc = (sunZs / faZs) / 1 - 1; // 理论遗漏
	var t = $('#wf').val();
	bc = (sjfw - ksc) / ksc; // 平均遗漏
	return bc;
}

function pushdArray(arr, index, value, value2) { // arr 被插二维数组 index二维数组索引
	// value插入值
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

/**
 * @创建人：关宏岩
 * @备注：计算公式
 */
var option = "";

function addMainData(data23) {
	// myChart.clear();
	var datar5 = new Array();
	var datar51 = new Array();
	// ma标准
	var ma1 = 0;
	var bc = jsbcr5();
	var pjyl = "";
	// console.log("理论遗漏："+bc)
	var yl1 = 0;
	for (var i = 0; i < data23.length; i++) { // 计算k线
		// K线

		var one = i + 1;
		var yn = data23[i].result; // y红 n绿
		if (yn.toString() == "y") { // 红
			datar5 = pushdArray(datar5, i, hm1, (hm1 + bc));
			hm1 = hm1 + bc; // 红线计算上端坐标
			// ksc ++;
			yl1 = 0;
		} else { // 绿
			datar5 = pushdArray(datar5, i, hm1, (hm1 - 1));
			hm1 = hm1 - 1; // 绿线计算下端坐标 固定值为-1
			yl1++;
		}
		// 收盘价c
		var spjC = hm1;
		// console.log(i+"收盘价："+spjC)
		// 当前是否超出不长
		var js1 = i - (bcfw - 1);
		if (js1 > 0) { // 当等于步长时，去掉
			if (yn.toString() == "y") {
				if (zqValue[0] == "y") {} else {
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
		// console.log("zqValue:"+zqValue);
		// ma = 步长范围内所有c（红绿线）之和 / 步长
		ma1 = hlxzh / bcfw;
		var tsumC = 0;
		for (var j = 0; j < bcnCnum.length; j++) {
			tsumC = tsumC + (bcnCnum[j] - ma1) * (bcnCnum[j] - ma1);
		}
		// sumC = sumC + ((spjC-ma1)*(spjC-ma1));//（步长内每期c-ma）平方 累加之和
		// 标准差
		var httttt = tsumC / bcfw;
		var bzc = Math.sqrt(httttt); // 开放【（步长内每期c-ma）平方 累加之和 / 步长】
		bzc = parseFloat(bzc).toFixed(2);
		// console.log(tsumC+"-----"+bcfw+"-----"+httttt+"标准差："+bzc)
		// 中轨 = 步长范围内所有红绿线之和 / 步长 + 上一期中轨值
		// console.log("正确数："+zqNum+";错误数："+cwNum+";")
		var hz111 = (zqNum * bc) - cwNum;
		hz111 = parseFloat(hz111).toFixed(2);
		var zg1 = hz111 / bcfw + zgz1 * 1;
		// zg1 = parseFloat(zg1).toFixed(2);
		// console.log(""+"上一期中轨："+zgz1+"；和:"+(zqNum*bc - cwNum)+";步长："+bcfw)
		// console.log(i+"中轨："+zg1)
		// 添加中轨集合
		zgValue.push(zg1);
		// 上轨 中轨+系数*标准差
		var sg1 = zg1 + xs * bzc;
		// 添加上轨集合
		sgValue.push(sg1);
		// 下轨 中轨-系数*标准差
		var xg1 = zg1 - xs * bzc;
		// console.log(i+"下轨："+xg1)
		// 添加下轨集合
		// console.log("中轨："+zg1+"；上轨："+sg1+"；下轨："+xg1)
		xgValue.push(xg1);
		// 上一期中轨值
		zg1 = parseFloat(zg1).toFixed(2);
		zgz1 = zg1;
		// 第二个图表
		var dqqEma12 = (syqEma12 * 11 / 13) + (spjC * 2 / 13);
		var dqqEma26 = (syqEma26 * 25 / 27) + (spjC * 2 / 27);
		syqEma12 = dqqEma12;
		syqEma26 = dqqEma26;
		var dqDif = syqEma12 - syqEma26;
		var dqDea = (syqDea * 8 / 10) + (dqDif * 2 / 10);
		var dqMacd = (dqDif - dqDea) * 2;
		difList.push(dqDif);
		deaList.push(dqDea);
		macdList.push(dqMacd);
		syqDea = dqDea;
		var js2 = i - (kdjZq - 1);
		if (js2 > 0) {
			zdjList.splice(0, 1);
			zdjList.push(spjC);
		} else {
			zdjList.push(spjC);
		}
		zgj = Math.max.apply(null, zdjList); // 最高价H
		zdj = Math.min.apply(null, zdjList); // 最低价L
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

	ktitle = faName + "【" + faZs + "组合    实出：" + ksc + "/" + kssc // /右上角显示信息
		+
		"   当前遗漏：" + yl1 + "】";

	var data = splitData(datar5);
	/**
	 * @创建人：关宏岩
	 * @备注：数组处理
	 */
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
	//画图表
	option = k_line(data, qhSum, openNumber, "0%", "no") // 同屏时yes,全屏时no
	myChart.setOption(option);
}
/**
 * @创建人：关宏岩
 * @备注：同屏
 */
function TongPing() {
	if (kScreenNo() && parent.toggleTongPing) {
		parent.toggleTongPing();
		return;
	}
	screenStatus = 'moreScreen';
	var myChartarr = [];
	var fa = $("input[name='fa']:checked").val();
	var wfid = $('#wf').val();
	if (fa == 1) {
		var length = $("#zdyfa2 li").length;
		if (length < 2) {
			layer.msg(k.getName('k.zdytpno'));
			return false;
		} else {
			$("#main").hide();
			$("#tp").show();
			var i = 0;
			var fa2 = $("#zdyfa2 li").text();
			$("#zdyfa2 li").each(function() {
				var t = "";
				var name = $(this).children("div").attr("data");
				t += "<div  ondblclick='QuXiaoTP(" + name + ")' id=" + name + " class='gdtp'></div>";
				$("#tp").append(t);
				myChartarr[i] = echarts.init(document.getElementById(name));
				myChartarr[i].clear();
				//tploadingData(fa, cat, name, wfid);
				var charg = tploadingData(fa, cat, name, wfid);
				myChartarr[i].setOption(charg); // 获取九个固定方案的图表
				i++;
			});
			//薛贵平修改
			//window.resizeTo(1536, 774);
			window.addEventListener("resize", function() {
				for (var i = 0; i < myChartarr.length; i++) {
					myChartarr[i].resize();
				}
			});
		}
	} else {
		$("#main").hide();
		$("#tp").show();
		var idname = "gdfatp";
		// var parm = {
		// 	code: btutil.cookieGet("topCode" + type_name[1]),
		// 	rows: 30,
		// 	play_id: playId,
		// };
		//var success = function(data) {

		var successRes = function(res) { //智能数据
			btutil.cookieSet("tpkjdata", JSON.stringify(res.data));
			let arr = planList[play_id];
			console.log("arr", arr)
			arr.forEach(itme => {
				var t = "";
				var id = itme;
				t += "<div  ondblclick='QuXiaoTP(" + id + ")' id=" + idname + id + " class='gdtp'></div>";
				$("#tp").append(t);
				myChartarr[i] = echarts.init(document.getElementById(idname + id));
				myChartarr[i].clear();
				var char = tploadingData(fa, cat, id, wfid);
				myChartarr[i].setOption(char); // 获取九个固定方案的图表
			})
			// window.addEventListener("resize", function() {
			// 	for (var i = 0; i < 9; i++) {
			// 		myChartarr[i].resize();
			// 	}
			// });
		};


		let mantissa = getQueryVariable("mantissa");
		if (null != mantissa && typeof mantissa != undefined && mantissa != "undefined" && mantissa) {
			k_util.request('/lotteryNumber/mantissaTopRows', {
				code: main_id,
				rows: 30,
				mantissa: mantissa
			}, "", successRes, true)

		} else if ("null" != requestUrl && null != requestUrl && typeof requestUrl != undefined && requestUrl !=
			"undefined" &&
			requestUrl) {

			k_util.requestA(requestUrl + '?code=' + main_id + "&rows=30", successRes)
		} else {
			k_util.request('/lotteryNumber/topRows', {
				code: main_id,
				rows: 30
			}, "", successRes, true)

		}

		// btutil.cookieSet("tpkjdata", JSON.stringify(data));
		// var pageId = $('#wf').val();
		// var arr = JSON.parse(btutil.cookieGet(cat + pageId));

		// for (var i = 0; i < arr.length; i++) {

		// }
		//薛贵平修改
		//window.resizeTo(1536, 774);

		//}
		//btms.request('lotteryNum/topRows', parm, "", success, true);
	}
	ishide(true);
}
/**
 * @创建人：关宏岩
 * @备注：f为true所以按钮失效，为false恢复
 */
function ishide(f) {
	//$("#wf").attr("disabled", f);
	$(".buttonK").attr("disabled", f);
	$("#zdyfa").attr("disabled", f);
	$("#tjfa").attr("disabled", f);
	$("#MACD").attr("disabled", f);
	$("#tjfa").attr("disabled", f);
	$("#KDJ").attr("disabled", f);
}
/**
 * @创建人：关宏岩
 * @备注：同屏转全屏
 */
function QuXiaoTP(id) {
	screenStatus = 'normal';
	var fa = $("input[name='fa']:checked").val();
	if (fa == 1) {
		$("#zdyfa2 li").each(function() {
			var name = $(this).children("div").attr("data");
			if (name == id) {
				$("#zdyfa4").attr("data", id);
				$("#zdyfa4").text($(this).children("div").text());
			}
		});

	} else {
		$("#tjfa3").val(id);
	}
	loadingData(1);
}
/**
 * @创建人：关宏岩
 * @备注：提交到主页面
 */
function tj() {
	var fa = k.planMode();
	if (($("#tjfa3").val() == "f001" || $("#tjfa3").val() == "f002") && fa == 2) {
		layer.msg("原智能数据不能提交");
		return false;
	}
	if (!kSubmit.begin()) return false;
	/*	console.log($("#wf").val());
		console.log(window.parent);
		if ($("#wf").val() == "q2zh") {
			if (window.document.getElementById("1105a2btn106").attr("style") != "background-color: rgb(255, 0, 0);") {

			}
		} else if ($("#wf").val() == "q2z") {
		}
	*/
	var ck = btutil.cookieGet("pageId" + type_name[1]);
	var wfid = $("#wf").val();

	var id = "";
	var fa = k.planMode();
	if (fa == 2) {
		id = $("#tjfa3").val();
		// window.opener.onCallBackFatj(id, "-1", "1", "0",wfid); //固定方案
		pinjietj(id, "0", wfid);
	} else {
		id = $("#zdyfa4").attr("data");
		// window.opener.onCallBackFatj(id, "-1", "1", "1",wfid); //自定义方案
		pinjietj(id, "1", wfid);
	}
	layer.msg("提交成功");

}
/**
 * @创建人：关宏岩
 * @备注：拼接提交的json串参数
 */
function pinjietj(faid, zdy, wfid) {

	var tt1 = "";
	var playid = btutil.getValue("playId");
	// var arr = [{
	// 	"ulid": "0",
	// 	"value": "-1",
	// 	"show_value": ,
	// 	"arr": zdy,
	// 	"show_name": "K线方案"
	// }];
	let parameter = {};
	var play = {};
	let name = {};
	if (zdy == 1) {
		name.title = "自定义K线方案";
		name.content = $("#zdyfa4").text();
		parameter.id = playid + "aidata";
		parameter.type = 2;
		let arr = [];
		for (let i = 0; i < zdyfa_plan.length; i++) {
			let obj = {};
			obj.value = zdyfa_plan[i];
			arr.push(obj);
		}
		parameter.arr = arr;

	} else {
		name.title = "K线方案";
		name.content = $("#tjfa3 option:selected").text();
		parameter.id = playid + "aidata";
		parameter.type = 2;
		let arr = [];
		let plan = JSON.parse(localStorage.getItem(faid));
		for (let i = 0; i < plan.length; i++) {
			let obj = {};
			obj.value = plan[i];
			arr.push(obj);
		}
		parameter.arr = arr;
	}
	play.name = name;
	parameter.reaction = 0;
	parameter.tolerant = 0;
	play.parameter = parameter;
	play.exterior = {
		"showReaction": 0,
		"showTolerant": 0,
		"style": 3,
		"isUse": 1
	};
	play.conditionName = "";
	play.subTypeName = "";



	// play.show_name = "K线方案";
	// play.cookie_id = wfid + "_001";
	// play.id = faid;
	// play.max = "-1";
	// play.arr = arr;
	// play.reaction = "0";
	// play.tolerant = "0";
	// var playid = btutil.getValue("code");
	// // if (cat == "ssc") {
	// // 	playid = addstr.substring(4, 9);
	// // }
	//var playid = btutil.getValue("playId");
	//submitTrend(play, playid);
	window.parent.postMessage({
		type: 'submit',
		data: play
	}, '*');
}
/**
 * @创建人：关宏岩
 * @备注：将k线图中的条件加到缓存中
 */
function submitTrend(obj, playid) {



	var cookie = JSON.parse(btutil.cookieGet(playid));
	var cdt_id = obj.id;
	var cookie_play = cookie.play;
	var play = new Array();
	var str = 1;
	if (cookie_play != undefined) {
		cookie_play = JSON.parse("[" + cookie_play + "]");
		for (var i = 0; i < cookie_play.length; i++) {
			var c_id = cookie_play[i].cookie_id;
			if (c_id != cdt_id) { // 原有数据
				play.push(JSON.stringify(cookie_play[i]));
			}
			var temp_id = cdt_id;
			var temp_str = 1;
			if (btutil.isContain(cdt_id, "_")) {
				temp_id = cdt_id.substring(0, cdt_id.indexOf("_"));

			}
			if (cookie_play[i].id == temp_id) {
				temp_str = c_id.substring(c_id.indexOf("_") + 1, c_id.length);
				str = parseInt(temp_str) + 1;
			}
		}
	}
	// 不包含下划线就是新增，序列新建（新增数据）
	if (!btutil.isContain(cdt_id, "_")) {
		var seq = btutil.leftFillZero(str.toString(), 3);
		cdt_id = cdt_id + "_" + seq;
		obj.cookie_id = cdt_id;
		play.push(JSON.stringify(obj));
	}
	cookie.play = play;
	btutil.cookieSet(playid, JSON.stringify(cookie));
	opener.baseFlow.getSelectCdt(playid);
	//提交到本地
	if (playid == 'sscs4' || playid == 'sscs5' || playid == 'plwr5') {
		if (FixedKlinedata(obj.id)) {
			multistars(0, JSON.stringify(obj))
		} else {
			var cookieobj = JSON.parse(JSON.stringify(cookie));
			cookieobj.code = btutil.cookieGet("topCode" + playid);
			cookieobj.play_id = playid;
			cookieobj.play = '[' + JSON.stringify(obj) + ']';
			var url = "/core/serviceAi";
			var successRes = function(res) { //智能数据
				multistars(3, '{"cookie_id":"' + obj.cookie_id + '","arr":' + JSON.stringify(res.data) + '}');
				multistars(2, "0");
			};
			btms.request(url, cookieobj, "", successRes, true);
		}
	}
	opener.baseFlow.serviceSubmit(cookie);
}

function FixedKlinedata(id) {
	switch (id) {
		case '145':
		case '146':
		case '147':
		case '148':
		case '149':
		case '150':
		case '151':
		case '152':
		case '153':
			return true;
	}
	return false;
}
// 定时获取cookie中的topCode，如果与当前不符，则重新加载
$(document).ready(function() {


});