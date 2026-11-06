 $(document).ready(function() {
	var e;
	$(".mod-menu");
	(e = $(".menu-item li")).each(function() {
		var n = $(this).index();
		$(this).mouseenter(function() {
			var e = $(this).position().top;
			$(".menu-cont").show(), $(".menu-cont").css("top", e), $(this).addClass("mouse-bg")
				.siblings().removeClass("mouse-bg"), $(".menu-cont>div").eq(n).show().siblings()
				.hide()
		})
	}), $(".mod-menu").mouseleave(function() {
		$(".menu-cont").hide(), e.removeClass("mouse-bg")
	})
});