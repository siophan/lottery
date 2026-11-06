// 本地走势页（table / table1105）的取数桥：开奖列表请求（topRows / mantissaTopRows）交给走势窗口的
// window.parent.trendSync，与 K 线同源（见 client/trend-sync.js）。原页面写死从区块链统计 / 上游取数，
// 不管工作台选的是哪个数据源。不在走势窗口里打开（没有 parent.trendSync 或没带 api 参数）时返回 false，页面照原逻辑请求。
function trendSyncRequest(path, data, done) {
	if (path != "/lotteryNumber/topRows" && path != "/lotteryNumber/mantissaTopRows") return false;
	var ts = null;
	try {
		ts = window.parent !== window ? window.parent.trendSync : null;
	} catch (e) {}
	var obj = {};
	try {
		obj = JSON.parse(sessionStorage.getItem("obj")) || {};
	} catch (e) {}
	if (!ts || !obj.api) return false;
	ts.load({
		api: obj.api,
		code: data.code,
		rows: data.rows,
		mantissa: path == "/lotteryNumber/mantissaTopRows" ? data.mantissa : undefined,
		requestUrl: obj.ds
	}).then(function(rows) {
		if (rows.length && typeof done == "function") done({ code: 0, data: rows });
	}).catch(function(e) {
		console.warn("[trend-data] 走势页取数失败：" + (e && e.message));
	});
	return true;
}
