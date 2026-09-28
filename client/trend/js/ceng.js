$(function() {

	$(".p-n-1 p").click(function() {
		var ul = $(".wftan");
		if (ul.css("display") == "none") {
			ul.slideDown();
		} else {
			ul.slideUp();
		}
	});

	$(".wftanbg").click(function() {
		var _name = $(this).attr("name");
		if ($("[name=" + _name + "]").length > 1) {
			$("[name=" + _name + "]").removeClass("wftanbgd");
			$(this).addClass("wftanbgd");
		} else {
			if ($(this).hasClass("wftanbgd")) {
				$(this).removeClass("wftanbgd");
			} else {
				$(this).addClass("wftanbgd");
			}
		}
	});

	$(".p-n-1 li").click(function() {
		var li = $(this).text();
		$(".p-n-1 p").html(li);
		$(".wftan").hide();
		$("p").removeClass("wftanbgd");
	});
})





$(function() {

	$(".diqu p").click(function() {
		var ul = $(".dqtan");
		if (ul.css("display") == "none") {
			ul.slideDown();
		} else {
			ul.slideUp();
		}
	});

	$(".dqtanbg").click(function() {
		var _name = $(this).attr("name");
		if ($("[name=" + _name + "]").length > 1) {
			$("[name=" + _name + "]").removeClass("dqtanbgd");
			$(this).addClass("dqtanbgd");
		} else {
			if ($(this).hasClass("dqtanbgd")) {
				$(this).removeClass("dqtanbgd");
			} else {
				$(this).addClass("dqtanbgd");
			}
		}
	});

	$(".diqu li").click(function() {
		var li = $(this).text();
		$(".diqu p").html(li);
		var obj = JSON.parse(common.cookieGet("obj"));
		if (obj.from_Id != 901) {
			$(".dqtan").hide();
		}
		/*$(".dqtanbg").css({background:'none'});*/
		$("p").removeClass("dqtanbgd");
	});
	/***************代码走势*******************/
	$(".diqu1 p").click(function() {
		var ul = $(".dqtan1");
		if (ul.css("display") == "none") {
			ul.slideDown();
		} else {
			ul.slideUp();
		}
	});

	$(".dqtanbg1").click(function() {
		var _name = $(this).attr("name");
		if ($("[name=" + _name + "]").length > 1) {
			$("[name=" + _name + "]").removeClass("dqtanbgd1");
			$(this).addClass("dqtanbgd1");
		} else {
			if ($(this).hasClass("dqtanbgd1")) {
				$(this).removeClass("dqtanbgd1");
			} else {
				$(this).addClass("dqtanbgd1");
			}
		}
	});

	$(".diqu1 li").click(function() {
		var li = $(this).text();
		$(".diqu1 p").html(li);
		if (obj.from_Id != 901) {
			$(".dqtan1").hide();
		}
		/*$(".dqtanbg").css({background:'none'});*/
		$("p").removeClass("dqtanbgd1");
	});
	/***************竞彩图表*******************/
	$(".diqu2 p").click(function() {
		var ul = $(".dqtan2");
		if (ul.css("display") == "none") {
			ul.slideDown();
		} else {
			ul.slideUp();
		}
	});

	$(".dqtanbg2").click(function() {
		var _name = $(this).attr("name");
		if ($("[name=" + _name + "]").length > 1) {
			$("[name=" + _name + "]").removeClass("dqtanbgd2");
			$(this).addClass("dqtanbgd2");
		} else {
			if ($(this).hasClass("dqtanbgd2")) {
				$(this).removeClass("dqtanbgd2");
			} else {
				$(this).addClass("dqtanbgd2");
			}
		}
	});

	$(".diqu2 li").click(function() {
		console.log(111)
		var li = $(this).text();
		$(".diqu2 p").html(li);
		$(".dqtan2").hide();
		/*$(".dqtanbg").css({background:'none'});*/
		$("p").removeClass("dqtanbgd2");
	});
})
