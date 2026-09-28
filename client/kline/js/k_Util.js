function sleep(numberMillis) {
            var now = new Date();
            var exitTime = now.getTime() + numberMillis;
            while (true) {
                now = new Date();
                if (now.getTime() > exitTime)
                    return;
            }
}
var  zdyfa_plan = "";
var basePath = "https://soft-api.bajiaoxing-tech.com/api";
var k_util = function() {
	var idarr={
			"1105r5":5,
			"1105r4":4,
			"1105r3":3,
			"1105r2":2,
			"1105p2":2,
			"1105q2zh":2,
			"1105q2z":2,
			"1105q3zh":3,
			"1105q3z":3,
			"ssca2":2,
			"sscp2":2,
			"ssca3":3,
			"plsr3":3,
			"sscp3":3,
			"sscs4":4,
			"sscs5":5,
			"3dr3":3,
	};
	return {
		/**
		 * @创建人：薛贵平
		 * @创建时间：2017-12-13
		 * @修改人：
		 * @修改日期：
		 * @备注： jquery异步调用
		 * @参数说明：
		 * @参数url：调用路径
		 * @参数data：post提交的json数据
		 * @参数beforeSend：提交之前的验证，可以为null
		 * @参数successRes：成功之后的处理
		 * @参数async： true:异步,false:同步
		 * @返回值：返回response对象
		 */
		request : function(url, data, beforeSend, successRes, async) {
			if (typeof (async) != "boolean") {
				async = true;
			}
			var ption="";
			data.from_id = 801;
			$.ajax({
				headers: {
					"Content-Type": "application/json",
					"token": btutil.cookieGet("token"),
					"Access-Control-Allow-Origin": "*"
				},
				timeout : 1000 * 30,
				cache : false,
				type : "post",
				dataType : "json",
				url : basePath + url,
				data : JSON.stringify(data),
				async : async,
				beforeSend : function() {
					if (typeof (beforeSend) == "function") {
						return beforeSend();
					} else {
						return true;
					}
				},
				success : function(response) {
					if (response && response.result == -1) {
						clearInterval(isLoginObj);
						if (setIntervalArray) { //主页面获取最新开奖号的定时方法对象，要是没用就不用管
							$.each(setIntervalArray, function(index, value) {
								clearInterval(value);
							});
						}
						//将单独打开的页面全部关闭
						baseFlow.closeAllOpener();
						alert(btutil.getName("font.notlogged"), function() {
							window.location.href = basePath;
						});
					} else if (response && response.result == -2) {
						clearInterval(isLoginObj);
						if (setIntervalArray) { //主页面获取最新开奖号的定时方法对象，要是没用就不用管
							$.each(setIntervalArray, function(index, value) {
								clearInterval(value);
							});
						}
						//将单独打开的页面全部关闭
						baseFlow.closeAllOpener();
						alert(btutil.getName("font.Remotelogin"), function() {
							btms.closeWin();
						});
					} else {
						if (successRes) {
							if (typeof (successRes) == "function") {
								ption = successRes(response);
							}
						}
					}
				},
				error : function(XMLHttpRequest, textStatus, errorThrown) {

				}
			});
			return ption;
		},
		
		requestA : function(url, successRes) {
			var ption="";
			$.ajax({
				headers: {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": "*"
				},
				timeout : 1000 * 30,
				cache : false,
				type : "GET",
				dataType : "json",
				url : url,
				async : true,
				success : function(response) {
					if (response && response.result == -1) {
						clearInterval(isLoginObj);
						if (setIntervalArray) { //主页面获取最新开奖号的定时方法对象，要是没用就不用管
							$.each(setIntervalArray, function(index, value) {
								clearInterval(value);
							});
						}
						//将单独打开的页面全部关闭
						baseFlow.closeAllOpener();
						alert(btutil.getName("font.notlogged"), function() {
							window.location.href = basePath;
						});
					} else if (response && response.result == -2) {
						clearInterval(isLoginObj);
						if (setIntervalArray) { //主页面获取最新开奖号的定时方法对象，要是没用就不用管
							$.each(setIntervalArray, function(index, value) {
								clearInterval(value);
							});
						}
						//将单独打开的页面全部关闭
						baseFlow.closeAllOpener();
						alert(btutil.getName("font.Remotelogin"), function() {
							btms.closeWin();
						});
					} else {
						if (successRes) {
							if (typeof (successRes) == "function") {
								ption = successRes(response);
							}
						}
					}
				},
				error : function(XMLHttpRequest, textStatus, errorThrown) {
		
				}
			});
			return ption;
		},
	
		
		
		/**
		 * @创建人：关宏岩
		 * @备注：调用cookie固定方案与开奖号码对比
		 */
		getyesAndno : function(data,cat,play_id,fa_id,onBack){
			
			var  opengudingarr;
			var fa = $("input[name='fa']:checked").val();
			if(fa == 1){
				opengudingarr = fa_id.split("-")
			}else{
			
				opengudingarr =  JSON.parse(localStorage.getItem(fa_id));
			}
			zdyfa_plan = opengudingarr;
			
			for(var i=0;i<data.length;i++){
				var opennumber = data[i].opennumber;
				if(play_id == 'animalsp3'){
					opennumber = opennumber.split(",")[3]+","+opennumber.split(",")[4]+","+opennumber.split(",")[5]
					opennumber = opennumber.replace(/0(\d)/g, '$1');
				}else if(play_id == 'animalsa3'){
					opennumber = opennumber.split(",")[0]+","+opennumber.split(",")[1]+","+opennumber.split(",")[2]
					opennumber = opennumber.replace(/0(\d)/g, '$1');
				}else if(play_id == 'hasha3'){
					opennumber = opennumber.split(",")[0]+","+opennumber.split(",")[1]+","+opennumber.split(",")[2]
				}else if(play_id == 'animalsa2'){
					opennumber = opennumber.split(",")[0]+","+opennumber.split(",")[1]
					opennumber = opennumber.replace(/0(\d)/g, '$1');
				}else if(play_id == 'animalsp2'){
					opennumber = opennumber.split(",")[4]+","+opennumber.split(",")[5]
					opennumber = opennumber.replace(/0(\d)/g, '$1');
				}
				if(play_id == "1105r5"){
					if(k_util.yesAanno(opennumber,opengudingarr,5)){
						data[i].result="y"
					}else {
						data[i].result="n"
					}
				}else if(play_id == "1105r4"){
					
					if(k_util.yesAanno(opennumber,opengudingarr,4)){
						data[i].result="y"
					}else {
						data[i].result="n"
					}
				}else if(play_id == "1105r3"){
					if(k_util.yesAanno(opennumber,opengudingarr,3)){
						data[i].result="y"
					}else {
						data[i].result="n"
					}
				}else if(play_id == "1105r2"){
					if(k_util.yesAanno(opennumber,opengudingarr,2)){
						data[i].result="y"
					}else {
						data[i].result="n"
					}
				}else{
					if(opengudingarr.indexOf(opennumber)>-1){
						data[i].result="y"
					}else {
						data[i].result="n"
					}
				}
				
			}
			if(opengudingarr[opengudingarr.length-1]==""||opengudingarr[opengudingarr.length-1]==null||typeof(opengudingarr[opengudingarr.length-1]) == undefined){
				data.len=opengudingarr.length-1
			}else{
				data.len=opengudingarr.length
			}
			
			return onBack(data);
		},
		
		/**
		 * @创建人：关宏岩
		 * @备注：任五，任四，任三，任二
		 */
		yesAanno : function(opennumber,gudingplan,len){
			var  numArr = opennumber.split(",");
			for (var i = 0; i < gudingplan.length; i++) {
				var gdpl = gudingplan[i].split(","); 
				//console.log("转的数组"+gdpl)
				var count = 0;
				for (var j = 0; j < gdpl.length; j++) {
					if (numArr[0]==(gdpl[j])) {
						count++;
					} else if (numArr[1]==(gdpl[j])) {
						count++;
					} else if (numArr[2]==(gdpl[j])) {
						count++;
					} else if (numArr[3]==(gdpl[j])) {
						count++;
					} else if (numArr[4]==(gdpl[j])) {
						count++;
					}
				}
				
				if (count == len) {
					return true;
				}
			}
			return false;
		},
		/**
		 * @前几z组选
		 */
		
		yesAannoqianjizu : function(opennumber,gudingplan,len){
			var  numArr = opennumber.split(",");
			for (var i = 0; i < gudingplan.length; i++) {
				var gdpl = gudingplan[i].split(",");
				//console.log(gdpl)
				var count = 0;
				for (var j = 0; j < gdpl.length; j++) {
					if(len == 2){
						if (numArr[0]==(gdpl[j])) {
							count++;
						} else if (numArr[1]==(gdpl[j])) {
							count++;
						} 
					}else if(len == 3){
						if (numArr[0]==(gdpl[j])) {
							count++;
						} else if (numArr[1]==(gdpl[j])) {
							count++;
						} else if(numArr[2]==(gdpl[j])){
							count++;
						}
					}
				}
				if (count == len) {
					return true;
				}
			}
			return false;
		},
		
		/**
		 * @后几直选,ssc后几
		 */
		
		sscyesAannohouji : function(opennumber,gudingplan,len){
			var n1 = opennumber.split(",")[2];
			var n2 = opennumber.split(",")[3];
			var n3 = opennumber.split(",")[4];
			var numStr = "";
			if (len == 2) {
				numStr = n2 + "," + n3;
			} else if (len == 3) {
				numStr = n1 + "," + n2 + "," + n3;
			}
			var b =JSON.stringify(gudingplan).indexOf(numStr) != -1;
			return b;
		},
		/**
		 * @前几直选,ssc前几
		 */
		
		sscyesAannoqianji : function(opennumber,gudingplan,len){
			var n1 = opennumber.split(",")[0];
			var n2 = opennumber.split(",")[1];
			var n3 = opennumber.split(",")[2];
			var n4 = opennumber.split(",")[3];
			var n5 = opennumber.split(",")[4];
			var numStr = "";
			if (len == 2) {
				numStr = n1 + "," + n2;
			} else if (len == 3) {
				numStr = n1 + "," + n2 + "," + n3;
			} else if(len == 4){
				numStr = n1 + "," + n2 + "," + n3 + ","+n4;
			} else if(len == 5){
				numStr = n1 + "," + n2 + "," + n3 + ","+n4+","+n5;
			}
	
				var b =JSON.stringify(gudingplan).indexOf(numStr) != -1;
		
			return b;
		},
	}	
}();
