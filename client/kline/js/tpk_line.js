
var tpfa = "";
var Id = "";
yuyan = "";
function tploadingData(fa, cat, id, wf) {

	zgValue = [], sgValue = [], xgValue = [], qhSum = [], difList = [],
	deaList = [],
	macdList = [];
	openNumber = [];
	kList = [], dList = [], jList = [], zdjList = [], zgjList = [], zgValue = [], sgValue = [], xgValue = [], zqValue = [], bcnCnum = [];
	sunZs = 0, faZs = 0, hm1 = 0, bcfw = 20, zgz1 = 0, hlxzh = 0, xs = 2, sumC = 0, kssc = 0, ksc = 0; //步长范围内所有c之和
	kdjZq = 9, zdj = 0, zgj = 0, kdjK = 50, kdjD = 50, syqK = 0, syqD = 0, macdZb = 0, sygParam = 0, zqNum = 0, cwNum = 0;syqEma12 = 0,
	syqEma26 = 0, Id = id;
	syqDea = 0;
	faName = "";
	wfType = wf;
	var url_u = window.location.href;
	var type_name = url_u.split(",");
	var code = btutil.cookieGet("topCode" + type_name[1]);
	var rows = 30;
	// if (fa == 2) {
	// 	var ddaa = btutil.cookieGet("tpkjdata")
	// 	return k_util.getyesAndno(JSON.parse(ddaa), cat, wf, Id, tponBacks);

	// } else {
	// 	//					//发送请求

	// 	var parm = {
	// 		plan_id : id,
	// 		play_id : wf,
	// 		code : code,
	// 		rows : rows
	// 	};
	// 	//发送请求
	// 	return k_util.request('/kLink/getDataByrecommend', parm, "", tponBacks, false);
	// }
	
	var ddaa = btutil.cookieGet("tpkjdata")
	return k_util.getyesAndno(JSON.parse(ddaa), cat, wf, Id, tponBacks);

}
var ktjfaList = "";



function tponBacks(data) {

	var boption = "";
	ktjfaList = "";
	//1105r5任五  1105a3前三组  1105a2前二组   1105a3z前三直  1105a2z前二直
	//1105r5任五  1105a3前三组  1105a2前二组   1105a3z前三直  1105a2z前二直
	if (wfType == "1105r5") {
		sunZs = 462;
	} else if (wfType == "1105r4") {
		sunZs = 330;
	} else if (wfType == "1105r3") {
		sunZs = 165;
	} else if (wfType == "1105r2") {
		sunZs = 55;
	} else if (wfType == "1105q3z") {
		sunZs = 165;
	} else if (wfType == "1105q2z") {
		sunZs = 55;
	} else if (wfType == "1105q3zh") {
		sunZs = 990;
	} else if (wfType == "1105q2zh") {
		sunZs = 110;
	} else if (wfType == "ssca2" || wfType == "sscp2") {
		sunZs = 100;
	} else if (wfType == "ssca3" || wfType == "sscp3" || wfType == "plsr3" || wfType == "3dr3") {
		sunZs = 1000;
	} else if (wfType == "sscs4") {
		sunZs = 10000;
	} else if (wfType == "sscs5") {
		sunZs = 100000;
	}else if (wfType == "animalsa3"|| wfType == "animalsp3") {
		sunZs = 120;
	}else if (wfType == "animalsa2"|| wfType == "animalsp2") {
		sunZs = 30;
	}else if (wfType == "hasha3") {
		sunZs = 1000;
	}

	faName = $("#wf").find("option:selected").text();
	if (yuyan == "cn") {
		if (Id == 1) {
			faName =  "推荐方案一";
		} else if (Id == 2) {
			faName =  "推荐方案二";
		} else if (Id == 3) {
			faName =  "推荐方案三";
		} else if (Id == 4) {
			faName =  "推荐方案四";
		} else if (Id == 5) {
			faName =  "推荐方案五";
		} else if (Id == 6) {
			faName =  "推荐方案六";
		} else if (Id == 7) {
			faName =  "推荐方案七";
		} else if (Id == 8) {
			faName =  "推荐方案八";
		} else if (Id == 9) {
			faName =  "推荐方案九";
		}
	} else {
		if (Id == 1) {
			faName =  "Plan-1";
		} else if (Id == 2) {
			faName =  "Plan-2";
		} else if (Id == 3) {
			faName =  "Plan-1";
		} else if (Id == 4) {
			faName =  "Plan-2";
		} else if (Id == 5) {
			faName =  "Plan-3";
		} else if (Id == 6) {
			faName =  "Plan-4";
		} else if (Id == 7) {
			faName =  "Plan-5";
		} else if (Id == 8) {
			faName =  "Plan-6";
		} else if (Id == 9) {
			faName =  "Plan-7";
		}
	}
	if (tpfa == 1) {

		faName = Id;

	}
	var rows = 30;
	ksc = 0;
	var dataResult = true;
	if (dataResult) {
		//		console.log(JSON.stringify(data)+"   d ata====");
		faZs = data.len;
		if (wfType == "3dr3" || wfType == "plsr3") {
			faZs = data.len - 1;
		}

		data.reverse(); ///数据排序
		var myobj = eval(data);
		$.each(data, function(i, item) {
			if (i <= rows) {
				ktjfaList += item.opennumber + "-";
				openNumber.push(item.opennumber);
				qhSum.push(item.expect);
				kssc = i + 1;

				if (item.result.toString() == "y") { //红
					ksc++;
				}
			}

		})
		kssc = rows;
		myobj = myobj.slice(0, rows);
		boption = tpaddMainData(myobj);
		return boption;
	} else {
		layer.msg('加载数据失败');
	}

}

function tppushdArray(arr, index, value, value2) { //arr 被插二维数组 index二维数组索引 value插入值
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

function tpjsbcr5() {
	var bc = (sunZs / faZs) / 1 - 1;
	var t = wf;
	if (t == "1105r2" || t == "1105r3" || t == "1105r4" || t == "1105q2zh" || t == "1105q2z" || t == "1105q3zh" || t == "1105q3z") {
		bc = (sjfw - ksc) / ksc;
	}
	//	console.log("总注数：" + sunZs + "；方案注数：" + faZs + ";")
	return bc;
}
function tpaddMainData(data23) {

	var roption = "";
	var datar5 = new Array();
	var datar51 = new Array();
	//ma标准
	var ma1 = 0;
	var bc = tpjsbcr5();
	var pjyl = "";

	var yl1 = 0;
	for (var i = 0; i < data23.length; i++) { //计算k线
		//K线
		var one = i + 1;
		var yn = data23[i].result; //y红  n绿
		if (yn.toString() == "y") { //红
			datar5 = tppushdArray(datar5, i, hm1, (hm1 + bc));
			hm1 = hm1 + bc; //红线计算上端坐标
			//ksc ++;
			yl1 = 0;
		} else { //绿
			datar5 = tppushdArray(datar5, i, hm1, (hm1 - 1));
			hm1 = hm1 - 1; //绿线计算下端坐标   固定值为-1
			yl1++;
		}
		//收盘价c
		var spjC = hm1;
		//					console.log(i+"收盘价："+spjC)
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
		//					console.log(tsumC+"-----"+bcfw+"-----"+httttt+"标准差："+bzc)
		//中轨  = 步长范围内所有红绿线之和  / 步长  + 上一期中轨值
		//					console.log("正确数："+zqNum+";错误数："+cwNum+";")

		var hz111 = (zqNum * bc) - cwNum;
		hz111 = parseFloat(hz111).toFixed(2);
		var zg1 = hz111 / bcfw + zgz1 * 1;
		//					zg1 = parseFloat(zg1).toFixed(2);
		//					console.log(""+"上一期中轨："+zgz1+"；和:"+(zqNum*bc - cwNum)+";步长："+bcfw)
		//console.log(i+"中轨："+zg1)
		//添加中轨集合
		zgValue.push(zg1);
		//上轨     中轨+系数*标准差
		var sg1 = zg1 + xs * bzc;
		//添加上轨集合
		sgValue.push(sg1);

		//下轨     中轨-系数*标准差
		var xg1 = zg1 - xs * bzc;
		//console.log(i+"下轨："+xg1)
		//添加下轨集合
		//console.log("中轨："+zg1+"；上轨："+sg1+"；下轨："+xg1)
		xgValue.push(xg1);
		//上一期中轨值
		zg1 = parseFloat(zg1).toFixed(2);
		zgz1 = zg1;

		//第二个图表
		var dqqEma12 = syqEma12 * 11 / 13 + spjC * 2 / 13;
		var dqqEma26 = syqEma26 * 25 / 27 + spjC * 2 / 27;
		var dqDif = syqEma12 - syqEma26;
		var dqDea = syqDea * 8 / 10 + dqDif * 2 / 10;
		var dqMacd = (dqDif - dqDea) * 2;

		difList.push(dqDif);
		deaList.push(dqDea);
		macdList.push(dqMacd);

		syqEma12 = dqqEma12;
		syqEma26 = dqqEma26;
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
		zgj = zdjList.max(); //最高价H
		zdj = zdjList.min(); //最低价L

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
	//console.log("macdListmacdList:"+JSON.stringify(macdList));
	if (yuyan == "cn") {
		ktitle = "【" + faZs + "组合    实出：" + ksc + "/" + kssc ///右上角显示信息
			+ "   当前遗漏：" + yl1 + "】";
	} else {
		ktitle = faName + "【" + faZs + "notes    Real output：" + ksc + "/" + kssc
			+ "   Current omission：" + yl1 + "】";
	}
	var data = tpsplitData(datar5);
	function tpsplitData(rawData) {
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
			datas : datas,
			times : times,
			vols : vols,
			macds : macds,
			difs : difs,
			deas : deas,
			hm : hm
		};
	}


	roption = k_line(data, qhSum, openNumber, "89%", "yes") //同屏时yes,全屏时no
	return roption;
}