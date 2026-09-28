var city_josn = [
{"code":"1001","name":"山东","cat":"11x5"},
{"code":"1002","name":"广东","cat":"11x5"},
{"code":"1003","name":"安徽","cat":"11x5"},
{"code":"1004","name":"北京","cat":"11x5"},
{"code":"1005","name":"福建","cat":"11x5"},
{"code":"1006","name":"甘肃","cat":"11x5"},
{"code":"1007","name":"广西","cat":"11x5"},
{"code":"1008","name":"贵州","cat":"11x5"},
{"code":"1009","name":"河北","cat":"11x5"},
{"code":"1010","name":"黑龙江","cat":"11x5"},
{"code":"1011","name":"湖北","cat":"11x5"},
{"code":"1012","name":"吉林","cat":"11x5"},
{"code":"1013","name":"江苏","cat":"11x5"},
{"code":"1014","name":"江西","cat":"11x5"},
{"code":"1015","name":"辽宁","cat":"11x5"},
{"code":"1016","name":"内蒙古","cat":"11x5"},
{"code":"1017","name":"上海","cat":"11x5"},
{"code":"1018","name":"陕西","cat":"11x5"},
{"code":"1019","name":"山西","cat":"11x5"},
{"code":"1020","name":"天津","cat":"11x5"},
{"code":"1021","name":"新疆","cat":"11x5"},
{"code":"1022","name":"云南","cat":"11x5"},
{"code":"1023","name":"浙江","cat":"11x5"},
{"code":"1024","name":"青海","cat":"11x5"},

{"code":"2001","name":"辽宁","cat":"12x5"},
{"code":"2002","name":"四川","cat":"12x5"},
{"code":"2003","name":"浙江","cat":"12x5"},

{"code":"3001","name":"重庆","cat":"ssc"},
{"code":"3002","name":"天津","cat":"ssc"},
{"code":"3003","name":"新疆","cat":"ssc"},
{"code":"3004","name":"云南","cat":"ssc"},

{"code":"4001","name":"吉林","cat":"k3"},
{"code":"4002","name":"江苏","cat":"k3"},
{"code":"4003","name":"青海","cat":"k3"}
]; // 城市id
function GetCodeName(code){
for(var i=0;i<city_josn.length;i++){
	if(city_josn[i].code == code){
		return city_josn[i].name;
	}
}
return "";
}


var city_josn_en = [
{"code":"1001","name":"Shandong","cat":"11x5"},
{"code":"1002","name":"Guangdong","cat":"11x5"},
{"code":"1003","name":"Anhui","cat":"11x5"},
{"code":"1004","name":"Beijing","cat":"11x5"},
{"code":"1005","name":"Fujian","cat":"11x5"},
{"code":"1006","name":"Gansu","cat":"11x5"},
{"code":"1007","name":"Guangxi","cat":"11x5"},
{"code":"1008","name":"Guizhou","cat":"11x5"},
{"code":"1009","name":"Hebei","cat":"11x5"},
{"code":"1010","name":"Heilongjiang","cat":"11x5"},
{"code":"1011","name":"Hubei","cat":"11x5"},
{"code":"1012","name":"Jilin","cat":"11x5"},
{"code":"1013","name":"Jiangsu","cat":"11x5"},
{"code":"1014","name":"Jiangxi","cat":"11x5"},
{"code":"1015","name":"Liaoning","cat":"11x5"},
{"code":"1016","name":"Neimenggu","cat":"11x5"},
{"code":"1017","name":"Shanghai","cat":"11x5"},
{"code":"1018","name":"Shaanxi(SN)","cat":"11x5"},
{"code":"1019","name":"shanxi(SX)","cat":"11x5"},
{"code":"1020","name":"Tianjing","cat":"11x5"},
{"code":"1021","name":"Xinjiang","cat":"11x5"},
{"code":"1022","name":"Yunnan","cat":"11x5"},
{"code":"1023","name":"Zhejiang","cat":"11x5"},
{"code":"1024","name":"Qinghai","cat":"11x5"},

{"code":"2001","name":"Liaoning","cat":"12x5"},
{"code":"2002","name":"Sichuan","cat":"12x5"},
{"code":"2003","name":"Zhejiang","cat":"12x5"},

{"code":"3001","name":"Chongqing","cat":"ssc"},
{"code":"3002","name":"Tianjing","cat":"ssc"},
{"code":"3003","name":"Xinjiang","cat":"ssc"},
{"code":"3004","name":"Yunnan","cat":"ssc"},

{"code":"4001","name":"Jilin","cat":"k3"},
{"code":"4002","name":"Jiangsu","cat":"k3"},
{"code":"4003","name":"Qinghai","cat":"k3"}
]; // 城市id
function GetCodeName_en(code){
for(var i=0;i<city_josn_en.length;i++){
	if(city_josn_en[i].code == code){
		return city_josn_en[i].name;
	}
}
return "";
}