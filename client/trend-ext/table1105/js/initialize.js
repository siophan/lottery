var trend_id, lan, initialize = {
	setSpread: function(n) {
		var o = "<tr>",
			a = "",
			t = "<tr>",
			i = "",
			e = language(lan, "trend_paiming");
		"en" == common.cookieGet("language") && (e = language(lan, "trend_paiming").split(" ")[0] + "</br>" +
				language(lan, "trend_paiming").split(" ")[1], $(".l-zebra td.l2").css("line-height", "40px")),
			o += '<th rowspan="2" >' + e + "</th>", a += '<col class="bg1" span="1" width="100"></col>', i +=
			"<td></td>";
		for (var g = 0; g < n.data.length; g++)
			if (a += '<col class="' + n.listclass[g] + '"  span="' + n.list[g] + '"  width="' + common
				.special() + '"></col>', 1 == n.list[g] ? o += '<th colspan="' + n.list[g] + '" rowspan="2">' +
				n
				.listName[g] + "</th>" : o += '<th colspan="' + n.list[g] + '">' + n.listName[g] + "</th>", 0 ==
				n.data[g].length && (i += "<td></td>"), -1 < trend_id.indexOf("trend_hezhizoushiB") && (-1 <
					trend_id.indexOf("1105r3") || -1 < trend_id.indexOf("1205r3")))
				for (var m = 0; m < n.val[g].length; m++) t += "<td>" + n.val[g][m] + "</td>", 0 == n.data[g]
					.length ? i += "<td></td>" : 1 < n.span[g].length ? i += '<td id="' + n.id[g][m] +
					'" onclick=common.clickSubmit(this) span="' + n.span[g].split(",")[m] + '"alt="' + n.alt[g][
						m
					] + '" value="' + n.val[g][m] + '">' + n.data[g][m] + "</td>" : i += '<td id="' + n.id[g][
						m
					] + '" onclick=common.clickSubmit(this) span="' + n.span[g] + '"alt="' + n.alt[g][m] +
					'" value="' + n.val[g][m] + '">' + n.data[g][m] + "</td>";
			else
				for (m = 0; m < n.data[g].length; m++) t += "<td>" + n.data[g][m] + "</td>", 1 < n.span[g]
					.length ? i += '<td id="' + n.id[g][m] + '" onclick=common.clickSubmit(this) span="' + n
					.span[g].split(",")[m] + '"alt="' + n.alt[g][m] + '"  value="' + n.val[g][m] + '">' + n
					.data[g][m] + "</td>" : i += '<td id="' + n.id[g][m] +
					'" onclick=common.clickSubmit(this) span="' + n.span[g] + '"alt="' + n.alt[g][m] +
					'"  value="' + n.val[g][m] + '">' + n.data[g][m] + "</td>";
		o += "</tr>", t += "</tr>", $("#colgroup").html(a), $("#titlecontent").html(o + t), $("#bottomcol")
			.html(a), -1 < trend_id.indexOf("sscp2-trend_litiZouShi") ? ($("#tj").attr("style", "display:none"),
				$("#dd").attr("style", "bottom:80px"), $("#cc").attr("style", "bottom:80px")) : $("#bottomval")
			.html(i)
	},
	initialize: function(n, o) {
		lan = common.cookieGet("language"), trend_id = n, $("#chartName").html(language(lan, o)), $("#issue")
			.html(language(lan, "trend_issue")), $("#return").html(language(lan, "return")), $("#qs").html(50 +
				language(lan, "trend_term")), $("#clean").html(language(lan, "trend_clean")), $("#submit").html(
				language(lan, "trend_submit").substring(0, 3)), $("#arise").html(language(lan,
				"trend_dangqiancishu")), $("#continuous").html(language(lan, "trend_dangqianlianchuMax")), $(
				"#omit").html(language(lan, "trend_dangqianyilouMax")), this.setSpread(this.content(n))
	},
	content: function(n) {
		var o = [];
		switch (n) {
			case "sscs4-trend_012luDingWei":
				var a = ["sscs4005"];
				o.listName = [language(lan, "conditions_qianwei"), language(lan, "conditions_baiwei"), language(
					lan, "conditions_shiwei"), language(lan, "conditions_gewei")], o.id = [
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 3), common.getCondition(a[0], 3), common.getCondition(
					a[0], 3), common.getCondition(a[0], 3)], o.span = [0, 1, 2, 3], o.listclass = ["bg5",
					"bg4", "bg5", "bg4"
				], o.data = [common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common
					.getIntNum(0, 2)
				], o.val = [
					["0,3,6,9", "1,4,7", "2,5,8"],
					["0,3,6,9", "1,4,7", "2,5,8"],
					["0,3,6,9", "1,4,7", "2,5,8"],
					["0,3,6,9", "1,4,7", "2,5,8"]
				], o.list = [3, 3, 3, 3];
				break;
			case "sscs4-trend_012luGeShu":
				a = ["sscs4001", "sscs4011"], o.listName = [language(lan, "conditions_012lufenbu"), language(
					lan, "conditions_0lugeshu"), language(lan, "conditions_1lugeshu"), language(lan,
					"conditions_2lugeshu")], o.id = [
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 5), common
					.getCondition(a[1], 5), common.getCondition(a[1], 5)
				], o.span = [0, 0, 1, 2], o.listclass = ["bg1", "bg5", "bg3", "bg4"], o.data = [
					[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 4), common.getIntNum(0, 4), common
					.getIntNum(0, 4)
				], o.val = [
					[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 4), common.getIntNum(0, 4), common
					.getIntNum(0, 4)
				], o.list = [10, 5, 5, 5];
				break;
			case "sscs4-trend_chazhiGeShu":
				a = ["sscs4007"], o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 5), common.getCondition(a[0], 5), common.getCondition(
						a[0], 5), common.getCondition(a[0], 5), common.getCondition(a[0], 5), common
					.getCondition(a[0], 5), common.getCondition(a[0], 5), common.getCondition(a[0], 5),
					common.getCondition(a[0], 5), common.getCondition(a[0], 5)
				], o.listName = [language(lan, "conditions_cha0geshu"), language(lan,
					"conditions_cha1geshu"), language(lan, "conditions_cha2geshu"), language(lan,
					"conditions_cha3geshu"), language(lan, "conditions_cha4geshu"), language(lan,
					"conditions_cha5geshu"), language(lan, "conditions_cha6geshu"), language(lan,
					"conditions_cha7geshu"), language(lan, "conditions_cha8geshu"), language(lan,
					"conditions_cha9geshu")], o.span = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], o.listclass = ["bg5",
					"bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"
				], o.data = [
					[0, 1, 2, 3, 6], common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4),
					common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4), common
					.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4)
				], o.val = [
					[0, 1, 2, 3, 6], common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4),
					common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4), common
					.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4)
				], o.list = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
				break;
			case "sscs4-trend_chakuaZouShi":
				var t = 10;
				o.id = [
					[],
					[],
					[]
				], a = ["sscs4012", "sscs4007", "sscs4004"], o.alt = [common.getCondition(a[0], t), common
					.getCondition(a[1], t - 1), common.getCondition(a[2], t)
				], o.listName = [language(lan, "conditions_renyiliangmachazhi"), language(lan,
					"conditions_tongchazoushi"), language(lan, "conditions_kuaduzoushi")], o.span = [0,
					"0,1,2,3,4,5,6,7,8,9", 0
				];
				var i = [];
				i = ["2,3,6", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4"],
					o.listclass = ["bg5", "bg3", "bg4"], o.alt = [common.getCondition(a[0], 10), common
						.getCondition(a[1], 10), common.getCondition(a[2], 10)
					], o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)], o
					.val = [common.getIntNum(0, 9), i, common.getIntNum(0, 9)], o.list = [10, 10, 10];
				break;
			case "sscs4-trend_hezhiZouShiA":
				var e = 0,
					g = 36;
				a = ["sscs4002"], o.id = [
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], g - (e - 1))], o
					.listName = [language(lan, "conditions_hezhiA"), language(lan, "conditions_hezhizoushi")], o
					.span = [0, 0], o.listclass = ["bg3", "bg5"], o.data = [
						[], common.getIntNum(e, g)
					], o.val = [
						[], common.getIntNum(e, g)
					], o.list = [1, g - (e - 1)];
				break;
			case "sscs4-trend_heheZouShi":
				t = 3;
				var m = ["0-12", "13-24", "25-36"];
				a = ["sscs4006", "sscs4003"], o.id = [
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t), common.getCondition(a[1], 10)], o.listName = [
						language(lan, "conditions_hezhifenbuA"), language(lan, "conditions_hezhifenbuB")
					], o.span = [0, 0], o.listclass = ["bg5", "bg4"], o.data = [m, common.getIntNum(0, 9)], o
					.val = [common.getIntNum(0, t - 1), common.getIntNum(0, 9)], o.list = [t, 10];
				break;
			case "sscs4-trend_litiZouShi":
				a = ["sscs4005"], o.id = [
					[],
					[],
					[],
					[],
					[]
				], o.listName = [language(lan, "conditions_qianwei"), language(lan, "conditions_baiwei"),
					language(lan, "conditions_shiwei"), language(lan, "conditions_gewei"), language(lan,
						"conditions_hezhiA")
				], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[0], 10), common
					.getCondition(a[0], 10), common.getCondition(a[0], 10), common.getCondition(a[0], 1)
				], o.span = [0, 1, 2, 3, 0], o.listclass = ["bg4", "bg5", "bg3", "bg5", "bg3"], o.data = [
					common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common
					.getIntNum(0, 9), []
				], o.val = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), common
					.getIntNum(0, 9), []
				], o.list = [10, 10, 10, 10, 1];
				break;
			case "sscs4-trend_jibenZouShi":
				a = "sscs4001";
				var s = "sscs4008";
				o.id = [
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a, 10), common.getCondition(s, 5), common.getCondition(s,
					5), common.getCondition(s, 5), common.getCondition(s, 1)], o.listName = [language(lan,
						"conditions_haomaFenBu"), language(lan, "conditions_jioubi"),
					language(lan, "conditions_zhihebi"), language(lan, "conditions_daxiaobi"), language(lan,
						"conditions_hezhiA")
				], o.span = [0, 0, 1, 2, 0], o.listclass = ["bg1", "bg3", "bg4", "bg5", "bg3"], o.data = [
					common.getIntNum(0, 9), this.getReverseRatio(0, 4), this.getReverseRatio(0, 4), this
					.getReverseRatio(0, 4), []
				], o.val = [common.getIntNum(0, 9), common.getIntNum(0, 4), common.getIntNum(0, 4), common
					.getIntNum(0, 4), []
				], o.list = [10, 5, 5, 5, 1];
				break;
			case "1105r5-trend_pingmianZouShi":
			case "1205r5-trend_pingmianZouShi":
				t = 11, a = "1105r5001", s = "1105r5018", -1 < n.indexOf("1205") && (t = 12, a = "1205r5001",
					s = "1205r5018"), o.id = [
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a, t), common.getCondition(s, t), common.getCondition(s, t),
					common.getCondition(s, t)
				], o.listName = [language(lan, "conditions_haomaFenBu"), language(lan,
					"conditions_daxiaobi"), language(lan, "conditions_jioubi"), language(lan,
					"conditions_zhihebi")], o.span = [0, 2, 0, 1], o.listclass = ["bg1", "bg3", "bg4",
					"bg5"
				], o.data = [common.getStringNum(1, t), this.getRatio(0, 5), this.getRatio(0, 5),
					this.getRatio(0, 5)
				], o.val = [common.getStringNum(1, t), this.getReverse(5, 0), this.getReverse(5, 0), this
					.getReverse(5, 0)
				], o.list = [t, 6, 6, 6];
				break;
			case "1105r4-trend_pingmianZouShi":
			case "1105r3-trend_pingmianZouShi":
			case "1105p2-trend_pingmianZouShi":
			case "1105a3-trend_pingmianZouShi":
			case "1105a2-trend_pingmianZouShi":
			case "1205r4-trend_pingmianZouShi":
			case "1205r3-trend_pingmianZouShi":
			case "1205p2-trend_pingmianZouShi":
			case "1205a3-trend_pingmianZouShi":
			case "1205a2-trend_pingmianZouShi":
			case "ssca2-trend_pingmianZouShi":
			case "ssca3-trend_pingmianZouShi":
			case "sscp2-trend_pingmianZouShi":
			case "sscp3-trend_pingmianZouShi":
			case "sscs4-trend_pingmianZouShi":
			case "plsr3-trend_pingmianZouShi":
				t = 11, a = "1105r5001", s = "1105r5018", -1 < n.indexOf("1205") && (t = 12, a = "1205r5001",
						s = "1205r5018"), -1 < n.indexOf("animals") && (t = 6),
					o.alt = [common.getCondition(a, t), common.getCondition(s, t), common
						.getCondition(s, t), common.getCondition(s, t)
					],
					o.alt = [common.getCondition("1105r5001", t), common.getCondition("1105r5018", t), common
						.getCondition("1105r5018", t), common.getCondition("1105r5018", t)
					],
					o.alt = [common.getCondition("", t), common.getCondition("", t), common.getCondition("",
						t), common.getCondition("", t)],
					-1 < n.indexOf("1105r4") ? (a = "1105r4001", s = "1105r4-666",
						o.alt = [common.getCondition(a, t), common.getCondition(s, t), common
							.getCondition(s, t), common.getCondition(s, t)
						]) : -1 < n.indexOf("1105r3") ? (a = "1105r3001", s = "1105r3-666",
						o.alt = [common
							.getCondition(a, t), common.getCondition(s, t), common.getCondition(s, t), common
							.getCondition(s, t)
						]) : -1 < n.indexOf("1105p2") ? (a = "1105p2001", s = "1105p2-666",
						o.alt = [common
							.getCondition(a, t), common.getCondition(s, t), common.getCondition(s, t), common
							.getCondition(s, t)
						]) : -1 < n.indexOf("1105a3") ? (a = "1105a3001", s = "1105a3-666",
						o.alt = [common
							.getCondition(a, t), common.getCondition(s, t), common.getCondition(s, t), common
							.getCondition(s, t)
						]) : -1 < n.indexOf("1105a2") ? (a = "1105a2001", s = "1105a2-666",
						o.alt = [common
							.getCondition(a, t), common.getCondition(s, t), common.getCondition(s, t), common
							.getCondition(s, t)
						]) : -1 < n.indexOf("animalsa2") ? (a = "animalsa2001", s = "1105a2-666",
						o.alt = [common
							.getCondition(a, t), common.getCondition(s, t), common.getCondition(s, t), common
							.getCondition(s, t)
						]) : ($("#bottomval").attr("style", "display:none"), $("#tj").attr("style",
							"display:none"),
						$(".l-center").css("bottom", "80"), $(".t-content").css("bottom", "80")), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.listName = [language(lan, "conditions_haomaFenBu"), language(lan,
						"conditions_daxiaobi"), language(lan, "conditions_jioubi"), language(lan,
						"conditions_zhihebi")], o.span = [0, 0, 1, 2], o.listclass = ["bg1", "bg3", "bg4",
						"bg5"
					], o.data = [common.getStringNum(1, t), this.getRatio(0, 5), this.getRatio(0, 5),
						this.getRatio(0, 5)
					], o.val = [common.getStringNum(1, t), this.getReverse(5, 0), this.getReverse(5, 0), this
						.getReverse(5, 0)
					], o.list = [t, 6, 6, 6], n.indexOf("1205") < 0 && n.indexOf("1105") < 0 && (o.listName = [
						language(lan, "conditions_haomaFenBu"), language(lan, "conditions_daxiaobi"),
						language(lan, "conditions_jioubi"), language(lan, "conditions_zhihebi")
					], o.listclass = ["bg1", "bg3", "bg4", "bg5"], o.list = [10, 6, 6, 6], o.data = [common
						.getIntNum(0, 9), this.getRatio(0, 5), this.getRatio(0, 5), this.getRatio(0, 5)
					], o.val = [common.getIntNum(0, 9), this.getReverse(5, 0), this.getReverse(5, 0), this
						.getReverse(5, 0)
					]);
				break;
			case "animalsa2-trend_pingmianZouShi":
			case "animalsa3-trend_pingmianZouShi":
			case "animalsp2-trend_pingmianZouShi":
			case "animalsp3-trend_pingmianZouShi":
			case "animalsq1a2-trend_pingmianZouShi":
			case "animalsq1a3-trend_pingmianZouShi":
			case "animalsq1p2-trend_pingmianZouShi":
			case "animalsq1p3-trend_pingmianZouShi":
			case "animalsq2a2-trend_pingmianZouShi":
			case "animalsq2a3-trend_pingmianZouShi":
			case "animalsq2p2-trend_pingmianZouShi":
			case "animalsq2p3-trend_pingmianZouShi":
			case "animalsq3a2-trend_pingmianZouShi":
			case "animalsq3a3-trend_pingmianZouShi":
			case "animalsq3p2-trend_pingmianZouShi":
			case "animalsq3p3-trend_pingmianZouShi":
			case "animalsq4a2-trend_pingmianZouShi":
			case "animalsq4a3-trend_pingmianZouShi":
			case "animalsq4p2-trend_pingmianZouShi":
			case "animalsq4p3-trend_pingmianZouShi":
			case "animalsq5a2-trend_pingmianZouShi":
			case "animalsq5a3-trend_pingmianZouShi":
			case "animalsq5p2-trend_pingmianZouShi":
			case "animalsq5p3-trend_pingmianZouShi":
			case "animalsq6a2-trend_pingmianZouShi":
			case "animalsq6a3-trend_pingmianZouShi":
			case "animalsq6p2-trend_pingmianZouShi":
			case "animalsq6p3-trend_pingmianZouShi":
			case "animalsq7a2-trend_pingmianZouShi":
			case "animalsq7a3-trend_pingmianZouShi":
			case "animalsq7p2-trend_pingmianZouShi":
			case "animalsq7p3-trend_pingmianZouShi":
			case "animalsq8a2-trend_pingmianZouShi":
			case "animalsq8a3-trend_pingmianZouShi":
			case "animalsq8p2-trend_pingmianZouShi":
			case "animalsq8p3-trend_pingmianZouShi":
			case "animalsq9a2-trend_pingmianZouShi":
			case "animalsq9a3-trend_pingmianZouShi":
			case "animalsq9p2-trend_pingmianZouShi":
			case "animalsq9p3-trend_pingmianZouShi":
			case "animalsq0a2-trend_pingmianZouShi":
			case "animalsq0a3-trend_pingmianZouShi":
			case "animalsq0p2-trend_pingmianZouShi":
			case "animalsq0p3-trend_pingmianZouShi":
				t = 6
				var obj = JSON.parse(common.cookieGet("obj"));
				if (n.indexOf('a2') > -1 || n.indexOf('p2') > -1) {
					o.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					];
					id = [obj.play_id + "001", obj.play_id + "006"];
					o.alt = [common.getCondition(id[0], t), common.getCondition(id[1], 3), common
						.getCondition(id[1], 3), common.getCondition(id[1], 3)
					];
					o.listName = [language(lan, "conditions_paimingFenBu"), language(lan,
						"conditions_daxiaobi"), language(lan, "conditions_jioubi"), language(lan,
						"conditions_zhihebi")];
					o.span = [0, 2, 0, 1];
					o.listclass = ["bg1", "bg3", "bg4", "bg5"];
					o.data = [common.getIntNum(1, t), this.getRatio(0, 2), this.getRatio(0, 2),
						this.getRatio(0, 2)
					];
					o.val = [common.getIntNum(1, t), this.getReverse(2, 0), this.getReverse(2, 0),
						this
						.getReverse(2, 0)
					];
					o.list = [t, 3, 3, 3];
				} else if (n.indexOf('a3') > -1 || n.indexOf('p3') > -1) {
					o.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					];
					id = [obj.play_id + "001", obj.play_id + "013"];
					o.alt = [common.getCondition(id[0], t), common.getCondition(id[1], 4), common
						.getCondition(id[1], 4), common.getCondition(id[1], 4)
					];
					o.listName = [language(lan, "conditions_paimingFenBu"), language(lan,
						"conditions_daxiaobi"), language(lan, "conditions_jioubi"), language(lan,
						"conditions_zhihebi")];
					o.span = [0, 2, 0, 1];
					o.listclass = ["bg1", "bg3", "bg4", "bg5"];
					o.data = [common.getIntNum(1, t), this.getRatio(0, 3), this.getRatio(0, 3),
						this.getRatio(0, 3)
					];
					o.val = [common.getIntNum(1, t), this.getReverse(3, 0), this.getReverse(3, 0),
						this.getReverse(3, 0)
					];
					o.list = [t, 4, 4, 4];
				}
				break;
			case "animalsa3-trend_hezhikuadu":
			case "animalsp3-trend_hezhikuadu":
			case "animalsq1a3-trend_hezhikuadu":
			case "animalsq1p3-trend_hezhikuadu":
			case "animalsq2a3-trend_hezhikuadu":
			case "animalsq2p3-trend_hezhikuadu":
			case "animalsq3a3-trend_hezhikuadu":
			case "animalsq3p3-trend_hezhikuadu":
			case "animalsq4a3-trend_hezhikuadu":
			case "animalsq4p3-trend_hezhikuadu":
			case "animalsq5a3-trend_hezhikuadu":
			case "animalsq5p3-trend_hezhikuadu":
			case "animalsq6a3-trend_hezhikuadu":
			case "animalsq6p3-trend_hezhikuadu":
			case "animalsq7a3-trend_hezhikuadu":
			case "animalsq7p3-trend_hezhikuadu":
			case "animalsq8a3-trend_hezhikuadu":
			case "animalsq8p3-trend_hezhikuadu":
			case "animalsq9a3-trend_hezhikuadu":
			case "animalsq9p3-trend_hezhikuadu":
			case "animalsq0a3-trend_hezhikuadu":
			case "animalsq0p3-trend_hezhikuadu":
				var obj = JSON.parse(common.cookieGet("obj"));
				t = 15, id = [obj.play_id + "002", obj.play_id + "004", obj.play_id + "003"];
				o.id = [
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(id[0], 1), common.getCondition(id[0], 10), common
					.getCondition(id[1], 10), common.getCondition(id[2], 4)
				];
				o.listName = [language(lan, "conditions_hezhiA"), language(lan,
					"trend_hezhiZouShiA"), language(lan, "trend_hezhizoushiB"), language(lan,
					"conditions_kuadu")];
				o.span = [0, 0, 0, 0];
				o.listclass = ["bg3", "bg5", "bg3", "bg4"];
				o.data = [
					[], common.getIntNum(6, t), common.getIntNum(0, 9), common.getIntNum(2, 5)
				];
				o.val = [
					[], common.getIntNum(6, t), common.getIntNum(0, 9), common.getIntNum(2, 5)
				];
				o.list = [1, 10, 10, 4];
				break;
			case "animalsa2-trend_hezhikuadu":
			case "animalsp2-trend_hezhikuadu":
			case "animalsq1a2-trend_hezhikuadu":
			case "animalsq1p2-trend_hezhikuadu":
			case "animalsq2a2-trend_hezhikuadu":
			case "animalsq2p2-trend_hezhikuadu":
			case "animalsq3a2-trend_hezhikuadu":
			case "animalsq3p2-trend_hezhikuadu":
			case "animalsq4a2-trend_hezhikuadu":
			case "animalsq4p2-trend_hezhikuadu":
			case "animalsq5a2-trend_hezhikuadu":
			case "animalsq5p2-trend_hezhikuadu":
			case "animalsq6a2-trend_hezhikuadu":
			case "animalsq6p2-trend_hezhikuadu":
			case "animalsq7a2-trend_hezhikuadu":
			case "animalsq7p2-trend_hezhikuadu":
			case "animalsq8a2-trend_hezhikuadu":
			case "animalsq8p2-trend_hezhikuadu":
			case "animalsq9a2-trend_hezhikuadu":
			case "animalsq9p2-trend_hezhikuadu":
			case "animalsq0a2-trend_hezhikuadu":
			case "animalsq0p2-trend_hezhikuadu":
				var obj = JSON.parse(common.cookieGet("obj"));
				t = 11, id = [obj.play_id + "002", obj.play_id + "004", obj.play_id + "003"];
				o.id = [
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(id[0], 1), common.getCondition(id[0], 9), common
					.getCondition(id[1], 10), common.getCondition(id[2], 5)
				];
				o.listName = [language(lan, "conditions_hezhiA"), language(lan,
					"trend_hezhiZouShiA"), language(lan, "trend_hezhizoushiB"), language(lan,
					"conditions_kuadu")];
				o.span = [0, 0, 0, 0];
				o.listclass = ["bg3", "bg5", "bg3", "bg4"];
				o.data = [
					[], common.getIntNum(3, t), common.getIntNum(0, 9), common.getIntNum(1, 5)
				];
				o.val = [
					[], common.getIntNum(3, t), common.getIntNum(0, 9), common.getIntNum(1, 5)
				];
				o.list = [1, 9, 10, 5];
				break;
			case "animalsa3-trend_dingweizoushi":
			case "animalsp3-trend_dingweizoushi":
			case "animalsq1a3-trend_dingweizoushi":
			case "animalsq1p3-trend_dingweizoushi":
			case "animalsq2a3-trend_dingweizoushi":
			case "animalsq2p3-trend_dingweizoushi":
			case "animalsq3a3-trend_dingweizoushi":
			case "animalsq3p3-trend_dingweizoushi":
			case "animalsq4a3-trend_dingweizoushi":
			case "animalsq4p3-trend_dingweizoushi":
			case "animalsq5a3-trend_dingweizoushi":
			case "animalsq5p3-trend_dingweizoushi":
			case "animalsq6a3-trend_dingweizoushi":
			case "animalsq6p3-trend_dingweizoushi":
			case "animalsq7a3-trend_dingweizoushi":
			case "animalsq7p3-trend_dingweizoushi":
			case "animalsq8a3-trend_dingweizoushi":
			case "animalsq8p3-trend_dingweizoushi":
			case "animalsq9a3-trend_dingweizoushi":
			case "animalsq9p3-trend_dingweizoushi":
			case "animalsq0a3-trend_dingweizoushi":
			case "animalsq0p3-trend_dingweizoushi":
				var obj = JSON.parse(common.cookieGet("obj"));
				t = 6, id = [obj.play_id + "011"];
				o.id = [
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(id[0], 6), common.getCondition(id[0], 6), common.getCondition(id[
					0], 6)]
				o.listName = [language(lan, "conditions_diyiwei"), language(lan, "conditions_dierwei"),
					language(lan, "conditions_disanwei")
				];
				o.span = [0, 1, 2];
				o.listclass = ["bg3", "bg4", "bg5"];
				o.data = [
					common.getIntNum(1, t), common.getIntNum(1, t), common.getIntNum(1, t)
				];
				o.val = [
					common.getIntNum(1, t), common.getIntNum(1, t), common.getIntNum(1, t)
				];
				o.list = [t, t, t];
				break;
			case "animalsa2-trend_dingweizoushi":
			case "animalsp2-trend_dingweizoushi":
			case "animalsq1a2-trend_dingweizoushi":
			case "animalsq1p2-trend_dingweizoushi":
			case "animalsq2a2-trend_dingweizoushi":
			case "animalsq2p2-trend_dingweizoushi":
			case "animalsq3a2-trend_dingweizoushi":
			case "animalsq3p2-trend_dingweizoushi":
			case "animalsq4a2-trend_dingweizoushi":
			case "animalsq4p2-trend_dingweizoushi":
			case "animalsq5a2-trend_dingweizoushi":
			case "animalsq5p2-trend_dingweizoushi":
			case "animalsq6a2-trend_dingweizoushi":
			case "animalsq6p2-trend_dingweizoushi":
			case "animalsq7a2-trend_dingweizoushi":
			case "animalsq7p2-trend_dingweizoushi":
			case "animalsq8a2-trend_dingweizoushi":
			case "animalsq8p2-trend_dingweizoushi":
			case "animalsq9a2-trend_dingweizoushi":
			case "animalsq9p2-trend_dingweizoushi":
			case "animalsq0a2-trend_dingweizoushi":
			case "animalsq0p2-trend_dingweizoushi":
				var obj = JSON.parse(common.cookieGet("obj"));
				t = 6, id = [obj.play_id + "005"];
				o.id = [
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(id[0], 6), common.getCondition(id[0], 6)]
				o.listName = [language(lan, "conditions_diyiwei"), language(lan, "conditions_dierwei")];
				o.span = [0, 1];
				o.listclass = ["bg3", "bg4"];
				o.data = [
					common.getIntNum(1, t), common.getIntNum(1, t)
				];
				o.val = [
					common.getIntNum(1, t), common.getIntNum(1, t)
				];
				o.list = [t, t];
				break;
			case "animalsa3-trend_012luZouShi":
			case "animalsp3-trend_012luZouShi":
			case "animalsq1a3-trend_012luZouShi":
			case "animalsq1p3-trend_012luZouShi":
			case "animalsq2a3-trend_012luZouShi":
			case "animalsq2p3-trend_012luZouShi":
			case "animalsq3a3-trend_012luZouShi":
			case "animalsq3p3-trend_012luZouShi":
			case "animalsq4a3-trend_012luZouShi":
			case "animalsq4p3-trend_012luZouShi":
			case "animalsq5a3-trend_012luZouShi":
			case "animalsq5p3-trend_012luZouShi":
			case "animalsq6a3-trend_012luZouShi":
			case "animalsq6p3-trend_012luZouShi":
			case "animalsq7a3-trend_012luZouShi":
			case "animalsq7p3-trend_012luZouShi":
			case "animalsq8a3-trend_012luZouShi":
			case "animalsq8p3-trend_012luZouShi":
			case "animalsq9a3-trend_012luZouShi":
			case "animalsq9p3-trend_012luZouShi":
			case "animalsq0a3-trend_012luZouShi":
			case "animalsq0p3-trend_012luZouShi":
				var obj = JSON.parse(common.cookieGet("obj"));
				t = 6;
				id = [obj.play_id + "001", obj.play_id + "009"];
				o.id = [
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(id[0], t), common.getCondition(id[1], 3), common
					.getCondition(id[1], 3), common.getCondition(id[1], 3)
				]
				o.listName = [language(lan, "conditions_012lufenbu"), language(lan, "conditions_0lugeshu"),
					language(lan, "conditions_1lugeshu"), language(lan, "conditions_2lugeshu")
				];
				o.span = [0, 0, 1, 2];
				o.listclass = ["bg1", "bg5", "bg3", "bg4"];
				o.data = [
					[3, 6, 1, 4, 2, 5], common.getIntNum(0, 2), common.getIntNum(0, 2),
					common.getIntNum(0, 2)
				];
				o.val = [
					[3, 6, 1, 4, 2, 5], common.getIntNum(0, 2), common.getIntNum(0, 2),
					common.getIntNum(0, 2)
				];
				o.list = [t, 3, 3, 3];
				break;
			case "animalsa3-trend_hechazoushi":
			case "animalsp3-trend_hechazoushi":
			case "animalsq1a3-trend_hechazoushi":
			case "animalsq1p3-trend_hechazoushi":
			case "animalsq2a3-trend_hechazoushi":
			case "animalsq2p3-trend_hechazoushi":
			case "animalsq3a3-trend_hechazoushi":
			case "animalsq3p3-trend_hechazoushi":
			case "animalsq4a3-trend_hechazoushi":
			case "animalsq4p3-trend_hechazoushi":
			case "animalsq5a3-trend_hechazoushi":
			case "animalsq5p3-trend_hechazoushi":
			case "animalsq6a3-trend_hechazoushi":
			case "animalsq6p3-trend_hechazoushi":
			case "animalsq7a3-trend_hechazoushi":
			case "animalsq7p3-trend_hechazoushi":
			case "animalsq8a3-trend_hechazoushi":
			case "animalsq8p3-trend_hechazoushi":
			case "animalsq9a3-trend_hechazoushi":
			case "animalsq9p3-trend_hechazoushi":
			case "animalsq0a3-trend_hechazoushi":
			case "animalsq0p3-trend_hechazoushi":
				var obj = JSON.parse(common.cookieGet("obj"));
				id = [obj.play_id + "006", obj.play_id + "012", obj.play_id + "007"];
				o.id = [
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(id[0], 9), common.getCondition(id[1], 10), common.getCondition(id[
					2], 5)]
				o.listName = [language(lan, "conditions_liangmahezhiA"), language(lan,
					"conditions_liangmahezhiB"), language(lan, "conditions_liangmachazhi")];
				o.span = [0, 0, 0];
				o.listclass = ["bg5", "bg4", "bg3"];
				o.data = [common.getIntNum(3, 11), [0, 1, 3, 4, 5, 6, 7, 8, 9], common.getIntNum(1, 5)];
				o.val = [common.getIntNum(3, 11), [0, 1, 3, 4, 5, 6, 7, 8, 9], common.getIntNum(1, 5)];
				o.list = [9, 9, 5];
				break;
			case "animalsa3-trend_lianhaoChongMa":
			case "animalsp3-trend_lianhaoChongMa":
			case "animalsq1a3-trend_lianhaoChongMa":
			case "animalsq1p3-trend_lianhaoChongMa":
			case "animalsq2a3-trend_lianhaoChongMa":
			case "animalsq2p3-trend_lianhaoChongMa":
			case "animalsq3a3-trend_lianhaoChongMa":
			case "animalsq3p3-trend_lianhaoChongMa":
			case "animalsq4a3-trend_lianhaoChongMa":
			case "animalsq4p3-trend_lianhaoChongMa":
			case "animalsq5a3-trend_lianhaoChongMa":
			case "animalsq5p3-trend_lianhaoChongMa":
			case "animalsq6a3-trend_lianhaoChongMa":
			case "animalsq6p3-trend_lianhaoChongMa":
			case "animalsq7a3-trend_lianhaoChongMa":
			case "animalsq7p3-trend_lianhaoChongMa":
			case "animalsq8a3-trend_lianhaoChongMa":
			case "animalsq8p3-trend_lianhaoChongMa":
			case "animalsq9a3-trend_lianhaoChongMa":
			case "animalsq9p3-trend_lianhaoChongMa":
			case "animalsq0a3-trend_lianhaoChongMa":
			case "animalsq0p3-trend_lianhaoChongMa":
				var obj = JSON.parse(common.cookieGet("obj"));
				id = [obj.play_id + "014"];
				o.id = [
					[],
					[],
				];
				o.alt = [common.getCondition(id[0], 3), common.getCondition(id[0], 4)]
				o.listName = [language(lan, "conditions_lianhaogeshu"), language(lan,
					"conditions_chongmageshu")];
				o.span = [0, 1];
				o.listclass = ["bg5", "bg4"];
				o.data = [common.getIntNum(0, 2), common.getIntNum(0, 3)];
				o.val = [common.getIntNum(0, 2), common.getIntNum(0, 3)];
				o.list = [3, 4];
				break;
			case "3dr3-trend_pingmianZouShi":
			case "hasha3-trend_pingmianZouShi":
			case "hasha3-trend_jibenZouShi":
			case "k3r3-trend_pingmianZouShi":
			case "ssca3-trend_jibenZouShi":
			case "sscp3-trend_jibenZouShi":
			case "plsr3-trend_jibenZouShi":
				var id1 = "k3r3001";
				var id2 = "k3r3013";
				var id3 = "k3r3004";
				if (n.indexOf("3dr3") > -1) {
					id1 = "3dr3001";
					id2 = "3dr3010";
				} else if (n.indexOf("plsr3") > -1) {
					id1 = "plsr3001";
					id2 = "plsr3010";
				} else if (n.indexOf("ssca3") > -1) {
					id1 = "ssca3001";
					id2 = "ssca3010";
				} else if (n.indexOf("sscp3") > -1) {
					id1 = "sscp3001";
					id2 = "sscp3010";
				} else if (n.indexOf("hasha3") > -1) {
					id1 = "hasha3001";
					id2 = "hasha3010"
				}
				o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
				];
				o.alt = [common.getCondition(id1, 1), common.getCondition(id1, 10), common.getCondition(
					id2, 4), common.getCondition(
					id2, 4), common.getCondition(id2, 4), common.getCondition(id2, 1)];
				o.listName = [language(lan, "conditions_form"), language(lan, "conditions_haomaFenBu"),
					language(lan, "conditions_daxiaobi"), language(lan, "conditions_jioubi"), language(lan,
						"conditions_zhihebi"), language(lan,"conditions_hezhiA")
				];
				o.span = [0, 0, 2, 0, 1, 0];
				o.listclass = ["bg1", "bg1", "bg3", "bg4", "bg5", "bg5"];
				o.data = [
					[], common.getIntNum(0, 9), this.getReverseRatio(0, 3), this.getReverseRatio(0, 3),
					this.getReverseRatio(0, 3), []
				];
				o.val = [
					[], common.getIntNum(0, 9), common.getIntNum(0, 3), common.getIntNum(0, 3),
					common.getIntNum(0, 3), []
				];
				o.list = [1, 10, 4, 4, 4, 1];
				if (n.indexOf("k3r3") > -1) {
					o.alt = [common.getCondition(id1, 1), common.getCondition(id1, 6), common.getCondition(
							id2, 4), common.getCondition(
							id2, 4), common.getCondition(id2, 4), common.getCondition(id3, 6), common
						.getCondition(
							id3, 1)
					];
					o.listName = [language(lan, "conditions_form"), language(lan,
						"conditions_haomaFenBu"), language(lan, "conditions_jioubi"), language(lan,
						"conditions_zhihebi"), language(lan, "conditions_daxiaobi"), language(lan,
						"conditions_kuadu")];
					o.list = [1, 6, 4, 4, 4, 6];
					o.span = [0, 0, 0, 1, 2, 0];
					o.listclass = ["bg1", "bg1", "bg3", "bg4", "bg5", "bg3"];
					o.data = [
						[], common.getIntNum(1, 6), this.getRatio(0, 3), this.getRatio(0, 3),
						this.getRatio(0, 3), common.getIntNum(0, 5)
					];
					o.val = [
						[], common.getIntNum(1, 6), this.getReverse(3, 0), this.getReverse(3, 0),
						this.getReverse(3, 0), common.getIntNum(0, 5)
					];
				}
				break;
			case "ssca2-trend_jibenZouShi":
			case "sscp2-trend_jibenZouShi":
				a = "ssca2001", s = "ssca2007", -1 < n.indexOf("sscp2") && (a = "sscp2001", s =
						"sscp2007"),
					o
					.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a, 10), common.getCondition(s, 4), common.getCondition(
						s,
						4), common.getCondition(s, 4), common.getCondition(s, 1)], o.listName = [language(
							lan,
							"conditions_haomaFenBu"), language(lan, "conditions_jioubi"),
						language(lan, "conditions_zhihebi"), language(lan, "conditions_daxiaobi"), language(
							lan,
							"conditions_hezhiA")
					], o.span = [0, 0, 1, 2, 0], o.listclass = ["bg1", "bg3", "bg4", "bg5", "bg5"], o
					.data = [
						common.getIntNum(0, 9), this.getReverseRatio(0, 2), this.getReverseRatio(0, 2), this
						.getReverseRatio(0, 2), []
					], o.val = [common.getIntNum(0, 9), common.getIntNum(0, 2), common.getIntNum(0, 2),
						common
						.getIntNum(0, 2), []
					], o.list = [10, 3, 3, 3, 1];
				break;
			case "1105r5-trend_linkongFenBu":
			case "1205r5-trend_linkongFenBu":
			case "k3r3-trend_linkongFenBu":
				a = ["1105r5027", "1105r5008", "1105r5006", "1105r5007"], -1 < n.indexOf("1205r5") ?
					a = [
						"1205r5026", "1205r5008", "1205r5006", "1205r5007"
					] : -1 < n.indexOf("k3r3") && (a = ["k3r3015", "k3r3006", "k3r3005"]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 7), common.getCondition(a[1], 7), common
						.getCondition(
							a[2], 7), common.getCondition(a[3], 5)
					], o.listName = [language(lan,
						"conditions_zuidalinma"), language(lan, "conditions_biankongzhi"), language(lan,
						"conditions_jiankongzhi"), language(lan, "conditions_bianlinzhi")], o.span = [0, 0,
						0,
						0
					], o.listclass = ["bg5", "bg3", "bg4", "bg3"], o.data = [common.getIntNum(1, 7), common
						.getIntNum(0, 6), common.getIntNum(0, 6), common.getIntNum(3, 7)
					], o.val = [common.getIntNum(1, 7), common.getIntNum(0, 6), common.getIntNum(0, 6),
						common
						.getIntNum(3, 7)
					], o.list = [7, 7, 7, 5], -1 < n.indexOf("k3r3") && (o.alt = [common.getCondition(a[0],
								6),
							common.getCondition(a[1], 6), common.getCondition(a[2], 3)
						], o.listName = [language(lan, "conditions_zuidalinma"), language(lan,
							"conditions_biankongzhi"), language(lan, "conditions_bianlinzhi")], o.span = [0,
							0,
							0
						], o.listclass = ["bg5", "bg3", "bg5"], o.data = [common.getIntNum(0, 5), common
							.getIntNum(0, 5), common.getIntNum(3, 5)
						], o.val = [common.getIntNum(0, 5), common.getIntNum(0, 5), common.getIntNum(3, 5)],
						o
						.list = [6, 6, 3]), "1205r5-trend_pingmianZouShi" == n && (o.alt = [common
						.getCondition(
							a[0], 8), common.getCondition(a[1], 8), common.getCondition(a[2], 8), common
						.getCondition(a[3], 6)
					], o.data = [common.getIntNum(1, 8), common.getIntNum(0, 7), common.getIntNum(0, 7),
						common.getIntNum(3, 8)
					], o.val = [common.getIntNum(1, 8), common.getIntNum(0, 7), common.getIntNum(0, 7),
						common.getIntNum(3, 8)
					], o.list = [8, 8, 8, 6]);
				break;
			case "1105a3-trend_jibenZouShi":
			case "1205a3-trend_jibenZouShi":
				t = 11, a = ["1105a3001", "1105a3007"], -1 < n.indexOf("1205") && (t = 12, a = [
					"1205a3001",
					"1205a3007"
				]), o.id = [
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], t), common.getCondition(a[1], t), common
					.getCondition(
						a[1], t), common.getCondition(a[1], t), common.getCondition(a[1], 1)
				], o.listName = [
					language(lan, "conditions_haomaFenBu"), language(lan, "conditions_diyiwei"),
					language(
						lan, "conditions_dierwei"), language(lan, "conditions_disanwei"), language(lan,
						"conditions_hezhiA")
				], o.span = [0, 0, 1, 2, 0], o.listclass = ["bg1", "bg5", "bg3", "bg4"], o.data = [
					common
					.getStringNum(1, t), common.getStringNum(1, t), common.getStringNum(1, t), common
					.getStringNum(1, t), []
				], o.val = [common.getStringNum(1, t), common.getStringNum(1, t), common.getStringNum(1,
						t),
					common.getStringNum(1, t), []
				], o.list = [t, t, t, t, 1];
				break;
			case "1105a2-trend_jibenZouShi":
			case "1205a2-trend_jibenZouShi":
				t = 11, a = ["1105r5001", "1105a2006", "1105a2008"], -1 < n.indexOf("1205") && (t = 12,
						a = [
							"1205a2001", "1205a2006", "1205a2008"
						]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t), common.getCondition(a[1], t), common
						.getCondition(
							a[1], t), common.getCondition(a[2], 4), common.getCondition(a[2], 1)
					], o.listName = [
						language(lan, "conditions_haomaFenBu"), language(lan, "conditions_diyiwei"),
						language(
							lan, "conditions_dierwei"), language(lan, "conditions_lianchuanchongtiao"),
						language(lan, "conditions_hezhiA")
					], o.span = [0, 0, 1, "0,1,2,3", 0], o.listclass = ["bg1", "bg5", "bg3", "bg4"], o
					.data = [
						common.getStringNum(1, t), common.getStringNum(1, t), common.getStringNum(1, t), [
							language(lan, "conditions_lianhao"), language(lan, "conditions_chuanhao"),
							language(
								lan, "conditions_tiaoma"), language(lan, "conditions_chongma")
						],
						[]
					], o.val = [common.getStringNum(1, t), common.getStringNum(1, t), common.getStringNum(1,
							t),
						["1", "1,2", "1,2", "1,2"],
						[]
					], o.list = [t, t, t, 4, 1];
				break;
			case "1105r5-trend_hezhiShuJuA":
			case "1205r5-trend_hezhiShuJuA":
				t = 5, a = ["1105r5019", "1105r5016", "1105r5005"], -1 < n.indexOf("1205") && (t = 6,
					a = [
						"1205r5019", "1205r5016", "1205r5005"
					]), o.alt = [common.getCondition(a[0], 3), common.getCondition(a[0], 3), common
					.getCondition(a[1], 4), common.getCondition(a[1], 4), common.getCondition(a[1], 3),
					common.getCondition(a[1], 3), common.getCondition(a[2], t + 1)
				], o.listName = [language(lan, "conditions_hezhishujuA"), language(lan,
					"conditions_hezhishujuB"), language(lan, "conditions_longtou"), language(lan,
					"conditions_fengwei"), language(lan, "conditions_longtou012lu"), language(lan,
					"conditions_fengwei012lu"), language(lan, "conditions_ACzhizoushi")], o.id = [
					[],
					[],
					["ltd", "lts", "ltz", "lth"],
					["fwd", "fws", "fwz", "fwh"],
					[],
					[],
					[]
				], o.span = [0, 1, "0,0,3,3", "1,1,4,4", 6, 7, 0], o.listclass = ["bg5", "bg3", "bg5",
					"bg4", "bg5", "bg3", "bg5"
				], o.data = [common.getIntNum(0, 2), common.getIntNum(0, 2), [language(lan,
						"conditions_dan"), language(lan, "conditions_shuang"), language(lan,
						"conditions_zhi"), language(lan, "conditions_he")],
					[language(lan, "conditions_dan"), language(lan, "conditions_shuang"), language(lan,
						"conditions_zhi"), language(lan, "conditions_he")], common.getIntNum(0, 2),
					common
					.getIntNum(0, 2), common.getIntNum(0, t)
				], o.val = [common.getIntNum(0, 2), common.getIntNum(0, 2), [0, 1, 0, 1],
					[0, 1, 0, 1], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, t)
				], o.list = [3, 3, 4, 4, 3, 3, t + 1];
				break;
			case "1105r5-trend_hezhiZouShiA":
			case "1205r5-trend_hezhiZouShiA":
			case "ssca3-trend_hezhiZouShiA":
			case "sscp3-trend_hezhiZouShiA":
			case "3dr3-trend_hezhiZouShiA":
			case "hasha3-trend_hezhiZouShiA":
			case "plsr3-trend_hezhiZouShiA":
				e = 0, g = 27, a = ["3dr3002"], -1 < n.indexOf("1105") ? (e = 15, g = 45, a = [
						"1105r5002"
					]) : -
					1 < n.indexOf("1205") ? (e = 15, g = 50, a = ["1205r5002"]) : -1 < n.indexOf("ssca3") ?
					a = ["ssca3002"] : -1 < n.indexOf("sscp3") ? a = ["sscp3002"] : -1 < n.indexOf(
						"plsr3") && (a = ["plsr3002"]);
				if (-1 < n.indexOf("hasha3")) {
					a = ["hasha3002"]
				}
				o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], g - (e - 1))], o
					.listName = [language(lan, "conditions_hezhiA"), language(lan,
						"conditions_hezhizoushi")], o
					.span = [0, 0], o.listclass = ["bg3", "bg5"], o.data = [
						[], common.getIntNum(e, g)
					], o.val = [
						[], common.getIntNum(e, g)
					], o.list = [1, g - (e - 1)];
				break;
			case "1105r5-trend_hezhiFenBuA":
			case "1205r5-trend_hezhiFenBuA":
			case "ssca3-trend_heheZouShi":
			case "sscp3-trend_heheZouShi":
			case "3dr3-trend_heheZouShi":
			case "hasha3-trend_heheZouShi":
			case "plsr3-trend_heheZouShi":
				t = 3, m = ["0-9", "10-18", "19-27"], a = ["3dr3007", "3dr3003"], -1 < n.indexOf(
						"1105r5") ?
					(
						t = 5, m = ["15-20", "21-26", "27-33", "34-39", "40-45"], a = ["1105r5013",
							"1105r5004"
						]
					) : -1 < n.indexOf("1205r5") ? (t = 5, m = ["15-21", "22-28", "29-36", "37-43",
						"44-50"
					], a = ["1205r5013", "1205r5004"]) : -1 < n.indexOf("ssca3") ? a = ["ssca3007",
						"ssca3003"
					] : -1 < n.indexOf("sscp3") ? a = ["sscp3007", "sscp3003"] : -1 < n.indexOf("plsr3") &&
					(
						a = ["plsr3007", "plsr3003"]);
				if (-1 < n.indexOf("hasha3")) {
					a = ["hasha3007", "hasha3003"]
				}
				o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t), common.getCondition(a[1], 10)], o.listName = [
						language(lan, "conditions_hezhifenbuA"), language(lan, "conditions_hezhifenbuB")
					], o.span = [0, 0], o.listclass = ["bg5", "bg4"], o.data = [m, common.getIntNum(0, 9)],
					o
					.val = [common.getIntNum(0, t - 1), common.getIntNum(0, 9)], o.list = [t, 10];
				break;
			case "1105a3-trend_heheZouShi":
			case "1205a3-trend_heheZouShi":
				t = 30, a = ["1105a3002", "1105a3004"], -1 < n.indexOf("1205a3") && (t = 33, a = [
					"1205a3002",
					"1205a3004"
				]), o.id = [
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], 28), common
					.getCondition(a[1], 10)
				], o.listName = [language(lan, "conditions_hezhiA"), language(lan,
						"trend_hezhiZouShiA"),
					language(lan, "trend_hezhizoushiB")
				], o.span = [0, 0, 0], o.listclass = ["bg3", "bg5", "bg3"], o.data = [
					[], common.getIntNum(6, t), common.getIntNum(0, 9)
				], o.val = [
					[], common.getIntNum(6, t), common.getIntNum(0, 9)
				], o.list = [1, 25, 10], -1 < n.indexOf("1205a3") && (o.list = [1, 28, 10]);
				break;
			case "1105r3-trend_hezhizoushiB":
			case "1205r3-trend_hezhizoushiB":
			case "1105r5-trend_sanmaHeZhiB":
			case "1205r5-trend_sanmaHeZhiB":
				-1 < n.indexOf("1205r3") && ($("#bottomval").attr("style", "display:none"), $("#tj")
						.attr(
							"style", "display:none"), $(".l-center").css("bottom", "80"), $(".t-content")
						.css(
							"bottom", "80")), a = ["1105r3004", "1105r3004"], o.id = [
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 10)], o
					.listName = [
						language(lan, "conditions_renyisanmahezhiB"), language(lan,
							"conditions_tonghezoushi")
					], o.span = [0, 0], o.listclass = ["bg5", "bg3"], o.data = [common.getIntNum(0, 9), []],
					o
					.val = [common.getIntNum(0, 9), common.getIntNum(0, 9)], n.indexOf("1105r3") < 0 && n
					.indexOf("1205r3") < 0 && (o.val = [common.getIntNum(0, 9), ["2,3", "2,3", "2,3", "2",
						"2,3", "2,3", "2,3", "2,3", "2,3", "2,3"
					]], -1 < n.indexOf("1205r5") ? (o.val = [common.getIntNum(0, 9), ["2,3,4", "2,3,4",
						"2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4", "2,3,4"
					]], a = ["1205r5038", "1205r5042"]) : -1 < n.indexOf("1105r5") && (a = ["1105r5039",
						"1105r5043"
					]), o.span = [0, "0,1,2,3,4,5,6,7,8,9"], o.alt = [common.getCondition(a[0], 10),
						common
						.getCondition(a[1], 10)
					], o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9)]), o.list = [10, 10];
				break;
			case "ssca2-trend_heheZouShi":
			case "sscp2-trend_heheZouShi":
				a = ["ssca2002", "ssca2003", "ssca2006"], -1 < n.indexOf("sscp2") && (a = ["sscp2002",
					"sscp2003", "sscp2006"
				]), o.id = [
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], 19), common
					.getCondition(a[1], 10), common.getCondition(a[2], 3)
				], o.listName = [language(lan, "conditions_hezhiA"), language(lan,
					"conditions_hezhizoushi"), language(lan, "conditions_hezhizoushiB"), language(
					lan,
					"conditions_hezhifenbuA")], o.span = [0, 0, 0, 0], o.listclass = ["bg5", "bg5",
					"bg3",
					"bg4"
				], o.data = [
					[], common.getIntNum(0, 18), common.getIntNum(0, 9), ["0-6", "7-12", "13-18"]
				], o.val = [
					[], common.getIntNum(0, 18), common.getIntNum(0, 9), common.getIntNum(0, 2)
				], o.list = [1, 19, 10, 3];
				break;
			case "ssca2-trend_chazhiZouShi":
			case "sscp2-trend_chazhiZouShi":
				a = ["ssca2004"], -1 < n.indexOf("sscp2") && (a = ["sscp2004"]), o.id = [
					[],
					[]
				], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], 10)], o.listName = [
					language(lan, "conditions_hezhiA"), language(lan, "conditions_chazhizoushi")
				], o.span = [0, 0], o.listclass = ["bg5", "bg4"], o.data = [
					[], common.getIntNum(0, 9)
				], o.val = [
					[], common.getIntNum(0, 9)
				], o.list = [1, 10];
				break;
			case "k3r3-trend_heheFenBu":
				o.alt = [common.getCondition("k3r3002", 16), common.getCondition("k3r3003", 10)], o
					.id = [
						[],
						[],
						[],
						[],
						[]
					], o.listName = [language(lan, "conditions_hezhiA"), language(lan,
						"conditions_hezhiB")], o
					.span = [0, 0], o.listclass = ["bg5", "bg3"], o.data = [common.getIntNum(3, 18), common
						.getIntNum(0, 9)
					], o.val = [common.getIntNum(3, 18), common.getIntNum(0, 9)], o.list = [16, 10];
				break;
			case "1105r5-trend_chazhiKuaDu":
			case "1205r5-trend_chazhiKuaDu":
			case "ssca3-trend_chakuaZouShi":
			case "sscp3-trend_chakuaZouShi":
			case "3dr3-trend_chakuaZouShi":
			case "hasha3-trend_chakuaZouShi":
			case "plsr3-trend_chakuaZouShi":
				var leng = 10;
				o.id = [
					[],
					[],
					[],
					[],
					[],

				];
				var a = ["1105r5032", "1105r5035", "1105r5003"];
				if (n.indexOf("1205") > -1) {
					leng = 11;
					a = ["1205r5031", "1205r5034", "1205r5003"];
				} else if (n.indexOf("ssca3") > -1) {
					a = ["ssca3014", "ssca3008", "ssca3004"];
				} else if (n.indexOf("sscp3") > -1) {
					a = ["sscp3014", "sscp3008", "sscp3004"];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3014", "3dr3008", "3dr3004"];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3014", "plsr3008", "plsr3004"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3014", "hasha3008", "hasha3004"];
				}
				o.alt = [common.getCondition(a[0], leng), common.getCondition(a[1], leng - 1),
					common.getCondition(a[2],
						leng - 3)
				];
				o.listName = [language(lan, "conditions_renyiliangmachazhi"), language(lan,
						"conditions_tongchazoushi"),
					language(lan, "conditions_kuaduzoushi")
				];
				o.span = [0, "0,1,2,3,4,5,6,7,8,9", 0];
				var value = [];
				if (n.indexOf("1105") > -1) {
					o.span = [0, "0,1,2,3,4,5,6,7,8", 0];
					value = ["2,3,4", "2,3,4", "2,3", "2,3", "2,3", "2", "2", "2", "2"];
				} else if (n.indexOf("1205") > -1) {
					value = ["2,3,4", "2,3,4", "2,3", "2,3", "2,3", "2", "2", "2", "2", "2"];
				} else {
					value = ["3", "2", "2", "2", "2", "2", "2", "2", "2", "2"];
				}
				o.listclass = ["bg5", "bg3", "bg4"];
				o.data = [common.getIntNum(1, leng), common.getIntNum(1, leng - 1), common.getIntNum(4,
					leng)];
				o.val = [common.getIntNum(1, leng), value, common.getIntNum(4, leng)];
				o.list = [leng, leng - 1, leng - 3];
				if (n.indexOf("trend_chakuaZouShi") > -1) {
					o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 10), common
						.getCondition(
							a[2], 10)
					];
					o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9)];
					o.val = [common.getIntNum(0, 9), value, common.getIntNum(0, 9)];
					o.list = [10, 10, 10];
				}
				break;
			case "k3r3-trend_chaheZouShi":
				a = ["k3r3010", "k3r3011"], o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 6)], o.listName = [
					language(lan, "conditions_renyiliangmahezhiB"), language(lan,
						"conditions_renyiliangmachazhi")
				], o.span = [0, 0], o.listclass = ["bg5", "bg4"], o.data = [common.getIntNum(0, 9),
					common
					.getIntNum(0, 5)
				], o.val = [common.getIntNum(0, 9), common.getIntNum(0, 5)], o.list = [10, 6];
				break;
			case "1105a2-trend_hekuaZouShi":
			case "1205a2-trend_hekuaZouShi":
				a = ["1105a2002", "1105a2004", "1105a2003"], -1 < n.indexOf("1205a2") && (a = [
					"1205a2002",
					"1205a2004", "1205a2003"
				]), o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 19), common.getCondition(a[1], 10), common
					.getCondition(a[2], 10)
				], o.listName = [language(lan, "conditions_hezhiA"), language(lan, "conditions_hezhiB"),
					language(lan, "conditions_kuadu")
				], o.span = [0, 0, 0], o.listclass = ["bg5", "bg3", "bg4"], o.data = [common.getIntNum(
					3,
					21), common.getIntNum(0, 9), common.getIntNum(1, 10)], o.val = [common.getIntNum(3,
						21),
					common.getIntNum(0, 9), common.getIntNum(1, 10)
				], o.list = [19, 10, 10], -1 < n.indexOf("1205") && (o.alt = [common.getCondition(a[0],
							21),
						common.getCondition(a[1], 10), common.getCondition(a[2], 11)
					], o.data = [common.getIntNum(3, 23), common.getIntNum(0, 9), common.getIntNum(1,
						11)],
					o.val = [common.getIntNum(3, 23), common.getIntNum(0, 9), common.getIntNum(1, 11)],
					o
					.list = [21, 10, 11]);
				break;
			case "1105a2-trend_haomaShuXing":
			case "1205a2-trend_haomaShuXing":
				a = ["1105a2009", "1105a2007", "1105a2009"], -1 < n.indexOf("1205a2") && (a = [
					"1205a2009",
					"1205a2007", "1205a2009"
				]), o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 3), common.getCondition(a[0], 3), common
					.getCondition(
						a[0], 3), common.getCondition(a[1], 4), common.getCondition(a[1], 4), common
					.getCondition(a[1], 4), common.getCondition(a[2], 2)
				], o.listName = [language(lan, "conditions_daxiaobi"), language(lan,
						"conditions_jioubi"),
					language(lan, "conditions_zhihebi"), language(lan, "conditions_daxiaoxingtai"),
					language(lan, "conditions_danshuangxingtai"), language(lan,
						"conditions_zhihexingtai"),
					language(lan, "conditions_shengjiang")
				], o.span = [0, 1, 2, 0, 1, 2, 3], o.listclass = ["bg5", "bg3", "bg4", "bg5", "bg3",
					"bg4",
					"bg3"
				], o.data = [this.getRatio(0, 2), this.getRatio(0, 2), this.getRatio(0, 2), [language(
						lan,
						"conditions_daxiao"), language(lan, "conditions_xiaoda"), language(lan,
						"conditions_dada"), language(lan, "conditions_xiaoxiao")],
					[language(lan, "conditions_danshuang"), language(lan, "conditions_shuangdan"),
						language(
							lan, "conditions_dandan"), language(lan, "conditions_shuangshuang")
					],
					[language(lan, "conditions_zhihe"), language(lan, "conditions_hezhi"), language(lan,
						"conditions_zhizhi"), language(lan, "conditions_hehe")],
					[language(lan, "conditions_sheng"), language(lan, "conditions_jiang")]
				], o.val = [common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
					common
					.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(0, 3), common.getIntNum(
						0, 1)
				], o.list = [3, 3, 3, 4, 4, 4, 2];
				break;
			case "1105a2-trend_tongweiZhenFu":
			case "1205a2-trend_tongweiZhenFu":
				t = 10, a = ["1105a2006"], -1 < n.indexOf("1205a2") && (t = 11, a = ["1205a2002"]), o
					.id = [
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t + 1), common.getCondition(a[0], t + 1)], o
					.listName = [language(lan, "conditions_diyiwei"), language(lan, "conditions_dierwei")],
					o
					.span = [0, 1], o.listclass = ["bg3", "bg5"], o.data = [common.getIntNum(0, t), common
						.getIntNum(0, t)
					], o.val = [common.getIntNum(0, t), common.getIntNum(0, t)], o.list = [t + 1, t + 1];
				break;
			case "1105r5-trend_lianhaoChongMa":
			case "1205r5-trend_lianhaoChongMa":
				a = ["1105r5017"], -1 < n.indexOf("1205r5") && (a = ["1205r5017"]), o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 5), common.getCondition(a[0], 3), common
					.getCondition(
						a[0], 6)
				], o.listName = [language(lan, "conditions_lianhaogeshu"), language(lan,
					"conditions_lianhaoduanshu"), language(lan, "conditions_chongmageshu")], o.span = [
					0, 1,
					2
				], o.listclass = ["bg5", "bg3", "bg4"], o.data = [common.getIntNum(0, 4), common
					.getIntNum(
						0, 2), common.getIntNum(0, 5)
				], o.val = [common.getIntNum(0, 4), common.getIntNum(0, 2),
					common.getIntNum(0, 5)
				], o.list = [5, 3, 6];
				break;
			case "1105r5-trend_heheFenBu":
			case "1205r5-trend_heheFenBu":
				t = 21, a = ["1105r5031", "1105r5033", "1105r5034"], -1 < n.indexOf("1205r5") && (t =
						23,
						a = [
							"1205r5030", "1205r5032", "1205r5033"
						]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t - 2), common.getCondition(a[1], 10), common
						.getCondition(a[2], 10)
					], o.listName = [language(lan, "conditions_renyiliangmahezhiA"), language(lan,
						"conditions_renyiliangmahezhiB"), language(lan, "conditions_tonghezoushi")], o
					.span = [
						0, 0, "0,1,2,3,4,5,6,7,8,9"
					], o.listclass = ["bg3", "bg4", "bg5"], o.data = [common.getIntNum(3, t), common
						.getIntNum(
							0, 9), common.getIntNum(0, 9)
					], o.val = [common.getIntNum(3, t), common.getIntNum(0, 9),
						common.getCondition("2,3", 10)
					], o.list = [t - 2, 10, 10];
				break;
			case "ssca3-trend_heheFenBu":
			case "sscp3-trend_heheFenBu":
			case "plsr3-trend_heheFenBu":
			case "3dr3-trend_heheFenBu":
			case "hasha3-trend_heheFenBu":
				var a = ["plsr3017", "plsr3016"];
				if (n.indexOf("3dr3") > -1) {
					a = ["3dr3017", "3dr3016"];
				} else if (n.indexOf("ssca3") > -1) {
					a = ["ssca3017", "ssca3016"];
				} else if (n.indexOf("sscp3") > -1) {
					a = ["sscp3017", "sscp3016"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3017", "hasha3016"];
				}
				o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(a[0], 19), common.getCondition(a[1], 10)];
				o.listName = [language(lan, "conditions_renyiliangmahezhiA"), language(lan,
					"conditions_renyiliangmahezhiB")];
				o.span = [0, 0];
				o.listclass = ["bg3", "bg5"];
				o.data = [common.getIntNum(0, 18), common.getIntNum(0, 9)];
				o.val = [common.getIntNum(0, 18), common.getIntNum(0, 9)];
				o.list = [19, 10];
				break;
			case "1105r5-trend_tiaoweiHeZhiB":
			case "1205r5-trend_tiaoweiHeZhiB":
				t = 9, a = ["1105r5010", "1105r5029"], -1 < n.indexOf("1205r5") && (a = ["1205r5010",
						"1205r5028"
					]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], t - 2), common
						.getCondition(a[1], 10), common.getCondition(a[1], 10)
					], o.listName = [language(lan, "conditions_tiaoweihefenbuB"), language(lan,
						"tiaoweihezhiyi"), language(lan, "tiaoweihezhier"), language(lan,
						"tiaoweihezhisan")], o.span = [0, 0, 1, 2], o.listclass = ["bg4", "bg5", "bg3",
						"bg4"
					],
					o.data = [common.getIntNum(0, t), common.getIntNum(0, 7), common.getIntNum(0, t), common
						.getIntNum(0, t)
					], o.val = [common.getIntNum(0, t), common.getIntNum(0, 7), common.getIntNum(0, t),
						common
						.getIntNum(0, t)
					], o.list = [t + 1, 8, t + 1, t + 1];
				break;
			case "1105r5-trend_tiaoweiChaZhi":
			case "1205r5-trend_tiaoweiChaZhi":
				t = 8, a = ["1105r5009", "1105r5028"], -1 < n.indexOf("1205r5") && (a = ["1205r5009",
						"1205r5027"
					], t = 9), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t - 1), common.getCondition(a[1], 4), common
						.getCondition(a[1], t - 1), common.getCondition(a[1], t - 1)
					], o.listName = [language(lan, "conditions_tiaoweichafenbu"), language(lan,
						"tiaoweichazhiyi"), language(lan, "tiaoweichazhier"), language(lan,
						"tiaoweichazhisan")], o.span = [0, 0, 1, 2], o.listclass = ["bg4", "bg5", "bg3",
						"bg4"
					],
					o.data = [common.getIntNum(2, t), common.getIntNum(2, 5), common.getIntNum(2, t), common
						.getIntNum(2, t)
					], o.val = [common.getIntNum(2, t), common.getIntNum(2, 5), common.getIntNum(2, t),
						common
						.getIntNum(2, t)
					], o.list = [t - 1, 4, t - 1, t - 1];
				break;
			case "1105r5-trend_junhengFenBu":
				a = ["1105r5020"], o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], 3), common.getCondition(a[0], 4), common
					.getCondition(
						a[0], 3), common.getCondition(a[0], 11)
				], o.listName = [language(lan,
					"conditions_junhengzhishu"), language(lan, "conditions_junhengguiju"), language(
					lan,
					"conditions_lianhaoguiju"), language(lan, "conditions_junhengwei")], o.span = [2, 3,
					4,
					1
				], o.listclass = ["bg5", "bg3", "bg4", "bg3"], o.data = [
					["+", "=", "-"],
					["+", "=", "-", "*"],
					["+", "=", "-"],
					[5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5]
				], o.val = [common.getIntNum(0, 2), common.getIntNum(0, 3), common.getIntNum(0, 2),
					common
					.getIntNum(0, 10)
				], o.list = [3, 4, 3, 11];
				break;
			case "1105r5-trend_chazhiGeShu":
			case "1205r5-trend_chazhiGeShu":
			case "ssca3-trend_chazhiGeShu":
			case "sscp3-trend_chazhiGeShu":
			case "3dr3-trend_chazhiGeShu":
			case "plsr3-trend_chazhiGeShu":
			case "hasha3-trend_chazhiGeShu":
				var a = ["ssca3008"];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3008"];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3008"];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3008"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3008"];
				}
				o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				];
				o.alt = [common.getCondition(a[0], 3), common.getCondition(a[0], 3), common.getCondition(
						a[0], 3),
					common.getCondition(a[0], 3), common.getCondition(a[0], 3), common.getCondition(
						a[0], 3), common.getCondition(
						a[0], 3), common.getCondition(a[0], 3), common.getCondition(a[0], 3),
					common.getCondition(a[0], 3)
				];
				o.listName = [language(lan, "conditions_cha0geshu"), language(lan,
						"conditions_cha1geshu"), language(lan,
						"conditions_cha2geshu"), language(lan, "conditions_cha3geshu"), language(lan,
						"conditions_cha4geshu"),
					language(lan, "conditions_cha5geshu"), language(lan, "conditions_cha6geshu"),
					language(lan,
						"conditions_cha7geshu"), language(lan, "conditions_cha8geshu"), language(lan,
						"conditions_cha9geshu")
				];
				o.span = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
				o.listclass = ["bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
				o.data = [
					[0, 1, 3], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
					common.getIntNum(0, 2),
					common.getIntNum(
						0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
					common.getIntNum(0, 2)
				];
				o.val = [
					[0, 1, 3], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
					common.getIntNum(0, 2),
					common.getIntNum(
						0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2),
					common.getIntNum(0, 2)
				];
				o.list = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
				if (n.indexOf("1205r5") > -1) {
					a = ["1205r5034"];
					o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					];
					o.alt = [common.getCondition(a[0], 5), common.getCondition(a[0], 5), common
						.getCondition(
							a[0], 4),
						common.getCondition(a[0], 4), common.getCondition(a[0], 4), common.getCondition(
							a[0], 3), common.getCondition(
							a[0], 3), common.getCondition(a[0], 3), common.getCondition(a[0], 3),
						common.getCondition(a[0], 3),
						common.getCondition(a[0], 2)
					];
					o.listName = [language(lan, "conditions_cha1geshu"), language(lan,
							"conditions_cha2geshu"), language(
							lan, "conditions_cha3geshu"), language(lan, "conditions_cha4geshu"),
						language(lan, "conditions_cha5geshu"),
						language(lan, "conditions_cha6geshu"), language(lan, "conditions_cha7geshu"),
						language(lan,
							"conditions_cha8geshu"), language(lan, "conditions_cha9geshu"), language(
							lan, "conditions_cha10geshu"),
						language(lan, "conditions_cha11geshu")
					];
					o.span = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
					o.listclass = ["bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5",
						"bg3"
					];
					o.data = [common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 3),
						common.getIntNum(0, 3),
						common.getIntNum(
							0, 3), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0,
							2), common.getIntNum(0, 2),
						common.getIntNum(
							0, 2), common.getIntNum(0, 1)
					];
					o.val = [common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 3),
						common.getIntNum(0, 3),
						common.getIntNum(
							0, 3), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0,
							2), common.getIntNum(0, 2),
						common.getIntNum(
							0, 2), common.getIntNum(0, 1)
					];
					o.list = [5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2];
				} else if (n.indexOf("1105r5") > -1) {
					a = ["1105r5035"];
					o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					];
					o.alt = [common.getCondition(a[0], 5), common.getCondition(a[0], 5), common
						.getCondition(
							a[0], 4),
						common.getCondition(a[0], 4), common.getCondition(a[0], 4), common.getCondition(
							a[0], 3), common.getCondition(
							a[0], 3), common.getCondition(a[0], 3), common.getCondition(a[0], 3),
						common.getCondition(a[0], 2)
					];
					o.listName = [language(lan, "conditions_cha1geshu"), language(lan,
							"conditions_cha2geshu"), language(
							lan, "conditions_cha3geshu"), language(lan, "conditions_cha4geshu"),
						language(lan, "conditions_cha5geshu"),
						language(lan, "conditions_cha6geshu"), language(lan, "conditions_cha7geshu"),
						language(lan,
							"conditions_cha8geshu"), language(lan, "conditions_cha9geshu"), language(
							lan, "conditions_cha10geshu")
					];
					o.span = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
					o.listclass = ["bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
					o.data = [common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 3),
						common.getIntNum(0, 3),
						common.getIntNum(
							0, 3), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0,
							2), common.getIntNum(0, 2),
						common.getIntNum(
							0, 1)
					];
					o.val = [common.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 3),
						common.getIntNum(0, 3),
						common.getIntNum(
							0, 3), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0,
							2), common.getIntNum(0, 2),
						common.getIntNum(
							0, 1)
					];
					o.list = [5, 5, 4, 4, 4, 3, 3, 3, 3, 2];
				}
				break;
			case "1105r5-trend_sanmaHeZhiA":
			case "1205r5-trend_sanmaHeZhiA":
				a = ["1105r5038"], t = 30, -1 < n.indexOf("1205r5") && (a = ["1205r5037"], t = 33), o
					.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t - 5)], o.listName = [language(lan,
						"conditions_sanmahezhiA")], o.span = [0], o.listclass = ["bg5"], o.data = [common
						.getIntNum(6, t)
					], o.val = [common.getIntNum(6, t)], o.list = [t - 5];
				break;
			case "1105r5-trend_sanmaChaHe":
			case "1205r5-trend_sanmaChaHe":
				a = ["1105r5040", "1105r5041", "1105r5044"], -1 < n.indexOf("1205r5") && (a = [
						"1205r5039",
						"1205r5040", "1205r5043"
					]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 9), common.getCondition(a[1], 5), common
						.getCondition(
							a[2], 5)
					], o.listName = [language(lan, "conditions_sanmachahezoushiA"), language(lan,
						"conditions_sanmachahezoushiB"), language(lan,
						"conditions_sanmachatonghezoushi")], o
					.span = [0, 0, "0,1,2,3,4"], o.listclass = ["bg4", "bg3", "bg5"], o.data = [
						[4, 6, 8, 10, 12, 14, 16, 18, 20],
						[0, 2, 4, 6, 8],
						[0, 2, 4, 6, 8]
					], o.val = [
						[4, 6, 8, 10, 12, 14, 16, 18, 20],
						[0, 2, 4, 6, 8],
						["2,3,4,5,6", "2,3,4", "2,3,4,5", "2,3,4,5", "2,3,4,5"]
					], o.list = [9, 5, 5], -1 < n.indexOf("1205r5") && (o.alt = [common.getCondition(a[0],
							9),
						common.getCondition(a[1], 5), common.getCondition(a[2], 5)
					], o.data = [
						[4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
						[0, 2, 4, 6, 8],
						[0, 2, 4, 6, 8]
					], o.val = [
						[4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
						[0, 2, 4, 6, 8],
						["2,3,4,5,6", "2,3,4", "2,3,4,5", "2,3,4,5", "2,3,4,5"]
					], o.list = [10, 5, 5]);
				break;
			case "1105r5-trend_012luFenBu":
			case "1205r5-trend_012luFenBu":
			case "1205a3-trend_012luGeShu":
			case "1105a3-trend_012luGeShu":
				a = ["1105r5001", "1105r5030"], t = 11, -1 < n.indexOf("1205r5") ? (t = 12, a = [
						"1205r5001",
						"1205r5029"
					]) : -1 < n.indexOf("1205a3") ? (t = 12, a = ["1205a3001", "1205a3027"]) : -1 < n
					.indexOf(
						"1105a3") && (a = ["1105a3001", "1105a3027"]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t), common.getCondition(a[1], 5), common
						.getCondition(
							a[1], 5), common.getCondition(a[1], 5)
					], o.listName = [language(lan,
						"conditions_012lufenbu"), language(lan, "conditions_0lugeshu"), language(lan,
						"conditions_1lugeshu"), language(lan, "conditions_2lugeshu")], o.span = [0, 0, 1,
						2
					], o
					.listclass = ["bg1", "bg5", "bg3", "bg4"], o.data = [
						["03", "06", "09", "01", "04", "07", "10", "02", "05", "08", "11"], common
						.getIntNum(0,
							4), common.getIntNum(0, 4), common.getIntNum(0, 4)
					], o.val = [
						["03", "06", "09", "01", "04", "07", "10", "02", "05", "08", "11"], common
						.getIntNum(0,
							4), common.getIntNum(0, 4), common.getIntNum(0, 4)
					], (-1 < n.indexOf("1205r5") || -1 < n.indexOf("1205a3")) && (o.data = [
						["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"], common
						.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4)
					], o.val = [
						["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"], common
						.getIntNum(0, 4), common.getIntNum(0, 4), common.getIntNum(0, 4)
					]), o.list = [t, 5, 5, 5];
				break;
			case "1105r5-trend_chazhiErFenBu":
			case "1205r5-trend_chazhiErFenBu":
				a = ["1105r5021", "1105r5035"], -1 < n.indexOf("1205r5") && (a = ["1205r5020",
						"1205r5034"
					]), o
					.id = [
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 9), common.getCondition(a[1], 5)], o.listName = [
						language(lan, "conditions_chazhierzoushi"), language(lan, "conditions_cha2geshu")
					], o.span = [0, 1], o.listclass = ["bg3", "bg5"], o.data = [
						["01-03", "02-04", "03-05", "04-06", "05-07", "06-08", "07-09", "08-10", "09-11"],
						common.getIntNum(0, 4)
					], o.val = [
						[1, 11, 20, 28, 35, 41, 46, 50, 53], common.getIntNum(0, 4)
					], o.list = [9, 5], -1 < n.indexOf("1205r5") && (o.data = [
						["01-03", "02-04", "03-05", "04-06", "05-07", "06-08", "07-09", "08-10",
							"09-11",
							"10-12"
						], common.getIntNum(0, 4)
					], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 5)], o.val = [
						[1, 12, 22, 31, 39, 46, 52, 57, 61, 64], common.getIntNum(0, 4)
					], o.list = [10, 5]);
				break;
			case "1105r5-trend_chazhiSanFenBu":
			case "1205r5-trend_chazhiSanFenBu":
				a = ["1105r5021", "1105r5035"], -1 < n.indexOf("1205r5") && (a = ["1205r5020",
						"1205r5034"
					]), o
					.id = [
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 8), common.getCondition(a[1], 4)], o.listName = [
						language(lan, "conditions_chazhisanzoushi"), language(lan, "conditions_cha3geshu")
					], o.span = [0, 2], o.listclass = ["bg3", "bg5"], o.data = [
						["01-04", "02-05", "03-06", "04-07", "05-08", "06-09", "07-10", "08-11"], common
						.getIntNum(0, 3)
					], o.val = [
						[2, 12, 21, 29, 36, 42, 47, 51], common.getIntNum(0, 3)
					], o.list = [8, 4], -1 < n.indexOf("1205r5") && (o.data = [
						["01-04", "02-05", "03-06", "04-07", "05-08", "06-09", "07-10", "08-11",
							"09-12"
						],
						common.getIntNum(0, 3)
					], o.alt = [common.getCondition(a[0], 9), common.getCondition(a[1], 4)], o.val = [
						[2, 13, 23, 32, 40, 47, 53, 58, 62], common.getIntNum(0, 3)
					], o.list = [9, 4]);
				break;
			case "1105r5-trend_chazhiSiFenBu":
			case "1205r5-trend_chazhiSiFenBu":
				a = ["1105r5021", "1105r5035"], -1 < n.indexOf("1205r5") && (a = ["1205r5020",
						"1205r5034"
					]), o
					.id = [
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 7), common.getCondition(a[1], 4)], o.listName = [
						language(lan, "conditions_chazhisizoushi"), language(lan, "conditions_cha4geshu")
					], o.span = [0, 3], o.listclass = ["bg3", "bg5"], o.data = [
						["01-05", "02-06", "03-07", "04-08", "05-09", "06-10", "07-11"], common.getIntNum(0,
							3)
					], o.val = [
						[3, 13, 22, 30, 37, 43, 48], common.getIntNum(0, 3)
					], o.list = [7, 4], -1 < n.indexOf("1205r5") && (o.data = [
						["01-05", "02-06", "03-07", "04-08", "05-09", "06-10", "07-11", "08-12"], common
						.getIntNum(0, 3)
					], o.alt = [common.getCondition(a[0], 8), common.getCondition(a[1], 4)], o.val = [
						[3, 14, 24, 33, 41, 48, 54, 59], common.getIntNum(0, 3)
					], o.list = [8, 4]);
				break;
			case "1105r5-trend_chazhiWuFenBu":
			case "1205r5-trend_chazhiWuFenBu":
				a = ["1105r5021", "1105r5035"], -1 < n.indexOf("1205r5") && (a = ["1205r5020",
						"1205r5034"
					]), o
					.id = [
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 6), common.getCondition(a[1], 4)], o.listName = [
						language(lan, "conditions_chazhiwuzoushi"), language(lan, "conditions_cha5geshu")
					], o.span = [0, 4], o.listclass = ["bg3", "bg5"], o.data = [
						["01-06", "02-07", "03-08", "04-09", "05-10", "06-11"], common.getIntNum(0, 3)
					], o.val = [
						[4, 14, 23, 31, 38, 44], common.getIntNum(0, 3)
					], o.list = [6, 4], -1 < n.indexOf("1205r5") && (o.data = [
						["01-06", "02-07", "03-08", "04-09", "05-10", "06-11", "07-12"], common
						.getIntNum(0,
							3)
					], o.alt = [common.getCondition(a[0], 7), common.getCondition(a[1], 4)], o.val = [
						[4, 15, 25, 34, 42, 49, 55], common.getIntNum(0, 3)
					], o.list = [7, 4]);
				break;
			case "1105r5-trend_kaijiangweizhiFenBu":
			case "1205r5-trend_kaijiangweizhiFenBu":
				a = ["1105r5036"], t = 7, -1 < n.indexOf("1205r5") && (a = ["1205r5035"], t = 8), o
					.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t), common.getCondition(a[0], t), common
						.getCondition(
							a[0], t), common.getCondition(a[0], t), common.getCondition(a[0], t)
					], o.listName = [
						language(lan, "conditions_diyiwei"), language(lan, "conditions_dierwei"), language(
							lan,
							"conditions_disanwei"), language(lan, "conditions_disiwei"), language(lan,
							"conditions_diwuwei")
					], o.span = [0, 1, 2, 3, 4], o.listclass = ["bg5", "bg3", "bg4", "bg3", "bg5"], o
					.data = [
						common.getStringNum(1, t), common.getStringNum(2, t + 1), common.getStringNum(3, t +
							2),
						common.getStringNum(4, t + 3), common.getStringNum(5, t + 4)
					], o.val = [common.getStringNum(1, t), common.getStringNum(2, t + 1), common
						.getStringNum(3,
							t + 2), common.getStringNum(4, t + 3), common.getStringNum(5, t + 4)
					], o.list = [t, t,
						t, t, t
					];
				break;
			case "1105a3-trend_hezhiQuJian":
			case "1205a3-trend_hezhiQuJian":
				a = ["1105a3014", "1105a3015"], -1 < n.indexOf("1205a3") && (a = ["1205a3014",
						"1205a3015"
					]), o
					.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], 5), common
						.getCondition(
							a[1], 2), common.getCondition(a[1], 2), common.getCondition(a[1], 2)
					], o.listName = [
						language(lan, "conditions_hezhiA"), language(lan, "conditions_hezhifenbuA"),
						language(
							lan, "conditions_hezhiBdaxiao"), language(lan, "conditions_hezhiBdanshaung"),
						language(lan, "conditions_hezhiBzhihe")
					], o.span = [0, 0, 0, 1, 2], o.listclass = ["bg3", "bg5", "bg4", "bg5", "bg3"], o
					.data = [
						[],
						["6-10", "11-15", "16-20", "21-25", "26-30"],
						[language(lan, "conditions_da"), language(lan, "conditions_xiao")],
						[language(lan, "conditions_dan"), language(lan, "conditions_shuang")],
						[language(lan, "conditions_zhi"), language(lan, "conditions_he")]
					], o.val = [
						[], common.getIntNum(0, 4), [0, 1],
						[0, 1],
						[0, 1]
					], o.list = [1, 5, 2, 2, 2], -1 < n.indexOf("1205a3") && (o.data = [
						[],
						["6-12", "13-19", "20-26", "27-33"],
						[language(lan, "conditions_da"), language(lan, "conditions_xiao")],
						[language(lan, "conditions_dan"), language(lan, "conditions_shuang")],
						[language(lan, "conditions_zhi"), language(lan, "conditions_he")]
					], o.alt = [common.getCondition(a[0], 1), common.getCondition(a[0], 4), common
						.getCondition(a[1], 2), common.getCondition(a[1], 2), common.getCondition(a[1],
							2)
					], o.val = [
						[], common.getIntNum(0, 3), [0, 1],
						[0, 1],
						[0, 1]
					], o.list = [1, 4, 2, 2, 2]);
				break;
			case "1105a3-trend_kuaduZouShi":
			case "1205a3-trend_kuaduZouShi":
				a = ["1105a3003", "1105a3016"], t = 10, -1 < n.indexOf("1205a3") && (a = ["1205a3003",
					"1205a3016"
				], t = 11), o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], t - 1), common.getCondition(a[1], 2), common
					.getCondition(a[1], 2), common.getCondition(a[1], 2)
				], o.listName = [language(lan, "conditions_kuaduzoushi"), language(lan,
					"conditions_kuadudaxiao"), language(lan, "conditions_kuadudanshuang"), language(
					lan,
					"conditions_kuaduzhihe")], o.span = [0, 0, 1, 2], o.listclass = ["bg3", "bg5",
					"bg3",
					"bg4"
				], o.data = [common.getIntNum(2, t), [language(lan, "conditions_da"), language(lan,
						"conditions_xiao")],
					[language(lan, "conditions_dan"), language(lan, "conditions_shuang")],
					[language(lan, "conditions_zhi"), language(lan, "conditions_he")]
				], o.val = [common.getIntNum(2, t), [0, 1],
					[0, 1],
					[0, 1]
				], o.list = [t - 1, 2, 2, 2];
				break;
			case "1105a3-trend_shuxingZouShi":
			case "1205a3-trend_shuxingZouShi":
				a = ["1105a3017"], -1 < n.indexOf("1205a3") && (a = ["1205a3017"]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 8), common.getCondition(a[0], 8), common
						.getCondition(
							a[0], 8)
					], o.listName = [language(lan, "conditions_daxiao"), language(lan,
						"conditions_danshuang"), language(lan, "conditions_zhihe")], o.span = [0, 1, 2], o
					.listclass = ["bg5", "bg3", "bg4"], o.data = [
						[language(lan, "conditions_dadada"), language(lan, "conditions_dadaxiao"), language(
							lan,
							"conditions_daxiaoda"), language(lan, "conditions_xiaodada"), language(lan,
							"conditions_xiaoxiaoda"), language(lan, "conditions_xiaodaxiao"), language(
							lan,
							"conditions_daxiaoxiao"), language(lan, "conditions_xiaoxiaoxiao")],
						[language(lan, "conditions_dandandan"), language(lan, "conditions_dandanshuang"),
							language(lan, "conditions_danshuangdan"), language(lan,
								"conditions_shuangdandan"),
							language(lan, "conditions_shuangshuangdan"), language(lan,
								"conditions_shuangdanshuang"), language(lan, "conditions_danshuangshuang"),
							language(lan, "conditions_shuangshuangshuang")
						],
						[language(lan, "conditions_zhizhizhi"), language(lan, "conditions_zhizhihe"),
							language(
								lan, "conditions_zhihezhi"), language(lan, "conditions_hezhizhi"), language(
								lan,
								"conditions_hehezhi"), language(lan, "conditions_hezhihe"), language(lan,
								"conditions_zhihehe"), language(lan, "conditions_hehehe")
						]
					], o.val = [
						[0, 1, 2, 3, 5, 6, 7, 4],
						[0, 1, 2, 3, 5, 6, 7, 4],
						[0, 1, 2, 3, 5, 6, 7, 4]
					], o.list = [8, 8, 8];
				break;
			case "1105a3-trend_tongweiZhenFu":
			case "1205a3-trend_tongweiZhenFu":
				a = ["1105a3007"], t = 10, -1 < n.indexOf("1205r5") && (a = ["1205a3007"], t = 11), o
					.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], t), common.getCondition(a[0], t), common
						.getCondition(
							a[0], t)
					], o.listName = [language(lan, "conditions_diyiwei"), language(lan,
						"conditions_dierwei"), language(lan, "conditions_disanwei")], o.span = [0, 1, 2], o
					.listclass = ["bg5", "bg3", "bg4"], o.data = [common.getIntNum(0, t), common.getIntNum(
						0,
						t), common.getIntNum(0, t)], o.val = [common.getIntNum(0, t), common.getIntNum(0,
							t),
						common.getIntNum(0, t)
					], o
					.list = [t + 1, t + 1, t + 1];
				break;
			case "1105a3-trend_xingtaiZouShi":
			case "1205a3-trend_xingtaiZouShi":
				a = ["1105a3018", "1105a3019", "1105a3001-0", "1105a3001-1", "1105a3001-2",
						"1105a3020"
					], -
					1 < n
					.indexOf("1205r5") && (a = ["1205a3018", "1205a3019", "1205a3001-0", "1205a3001-1",
						"1205a3001-3", "1205a3020"
					]), o.id = [
						[],
						[],
						[],
						[],
						["onez", "oned", "oney"],
						["twoz", "twod", "twoy"],
						["thrz", "thrd", "thry"],
						[]
					], o.alt = [common.getCondition(a[0], 4), common.getCondition(a[1], 4), common
						.getCondition(
							a[1], 4), common.getCondition(a[1], 4), common.getCondition(a[2], 3), common
						.getCondition(a[3], 3), common.getCondition(a[4], 3), common.getCondition(a[5], 4)
					], o.listName = [language(lan, "conditions_aotuxingtai"), language(lan,
						"conditions_xiaoshugeshu"), language(lan, "conditions_danshugeshu"), language(
						lan,
						"conditions_zhishugeshu"), language(lan, "conditions_diyiwei"), language(lan,
						"conditions_dierwei"), language(lan, "conditions_disanwei"), language(lan,
						"conditions_lianchuanchongtiao")], o.span = [0, 2, 0, 1, "0,1,2", "0,1,2", "0,1,2",
						"0,1,2,3"
					], o.listclass = ["bg3", "bg5", "bg3", "bg4", "bg3", "bg5", "bg3", "bg4"], o.data = [
						[language(lan, "conditions_sheng"), language(lan, "conditions_jiang"), language(lan,
							"conditions_ao"), language(lan, "conditions_tu")], common.getIntNum(0, 3),
						common
						.getIntNum(0, 3), common.getIntNum(0, 3), [language(lan, "conditions_zuo"),
							language(
								lan, "conditions_duan"), language(lan, "conditions_you")
						],
						[language(lan, "conditions_zuo"), language(lan, "conditions_duan"), language(lan,
							"conditions_you")],
						[language(lan, "conditions_zuo"), language(lan, "conditions_duan"), language(lan,
							"conditions_you")],
						[language(lan, "conditions_lianhao"), language(lan, "conditions_chuanhao"),
							language(
								lan, "conditions_tiaoma"), language(lan, "conditions_chongma")
						]
					], o.val = [common.getIntNum(0, 3), common.getIntNum(0, 3), [3, 2, 1, 0],
						[3, 2, 1, 0], common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0,
							2), [
							"1,2", "1,2,3", "1,2,3", "1,2,3"
						]
					], o.list = [4, 4, 4, 4, 3, 3, 3, 4];
				break;
			case "1105a3-trend_liangmaHeZouShiB":
			case "1205a3-trend_liangmaHeZouShiB":
				a = ["1105a3011", "1105a3008"], -1 < n.indexOf("1205a3") && (a = ["1205a3011",
						"1205a3008"
					]), o
					.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 10), common
						.getCondition(a[1], 10), common.getCondition(a[1], 10)
					], o.listName = [language(lan, "conditions_liangmahefenbuB"), language(lan,
						"conditions_yierweiheB"), language(lan, "conditions_yisanweiheB"), language(lan,
						"conditions_ersanweiheB")], o.span = [0, 0, 1, 2], o.listclass = ["bg4", "bg5",
						"bg3",
						"bg4"
					], o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9),
						common
						.getIntNum(0, 9)
					], o.val = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9),
						common
						.getIntNum(0, 9)
					], o.list = [10, 10, 10, 10];
				break;
			case "1105a3-trend_liangmaChaZouShi":
			case "1205a3-trend_liangmaChaZouShi":
				a = ["1105a3013", "1105a3009"], t = 10, -1 < n.indexOf("1205a3") && (a = ["1205a3013",
					"1205a3009"
				], t = 11), o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				], o.alt = [common.getCondition(a[0], t), common.getCondition(a[1], t), common
					.getCondition(
						a[1], t), common.getCondition(a[1], t)
				], o.listName = [language(lan,
					"conditions_liangmachafenbu"), language(lan, "conditions_yierweicha"), language(
					lan,
					"conditions_yisanweicha"), language(lan, "conditions_ersanweicha")], o.span = [0, 0,
					1,
					2
				], o.listclass = ["bg4", "bg5", "bg3", "bg4"], o.data = [common.getIntNum(1, t), common
					.getIntNum(1, t), common.getIntNum(1, t), common.getIntNum(1, t)
				], o.val = [common.getIntNum(1, t), common.getIntNum(1, t), common.getIntNum(1, t),
					common
					.getIntNum(1, t)
				], o.list = [t, t, t, t];
				break;
			case "ssca2-trend_longtouFengWei":
			case "sscp2-trend_longtouFengWei":
			case "ssca3-trend_longtouFengWei":
			case "sscp3-trend_longtouFengWei":
			case "plsr3-trend_longtouFengWei":
			case "3dr3-trend_longtouFengWei":
			case "hasha3-trend_longtouFengWei":
			case "sscs4-trend_longtouFengWei":
				var a = ["sscp2009"];
				if (n.indexOf("ssca2") > -1) {
					a = ["ssca2009"];
				} else if (n.indexOf("ssca3") > -1) {
					a = ["ssca3012"];
				} else if (n.indexOf("sscp3") > -1) {
					a = ["sscp3012"];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3012"];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3012"];
				} else if (n.indexOf("sscs4") > -1) {
					a = ["sscs4010"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3012"];
				}
				o.id = [
					["lt_dan", "lt_shuang", "lt_zhi", "lt_he", "lt_da", "lt_xiao"],
					["fw_dan", "fw_shuang", "fw_zhi", "fw_he", "fw_da", "fw_xiao"],
					[],
					[],
					[],
					[],
					[],
					[],
				];
				o.alt = [common.getCondition(a[0], 6), common.getCondition(a[0], 6), common
					.getCondition(
						a[0], 3),
					common.getCondition(a[0], 3)
				];
				o.listName = [language(lan, "conditions_longtou"), language(lan, "conditions_fengwei"),
					language(
						lan, "conditions_longtou012lu"), language(lan, "conditions_fengwei012lu")
				];
				o.span = ["0,0,3,3,6,6", "1,1,4,4,7,7", 9, 10];
				o.listclass = ["bg5", "bg4", "bg5", "bg3"];
				o.data = [
					[language(lan, "conditions_dan"), language(lan, "conditions_shuang"), language(lan,
							"conditions_zhi"),
						language(lan, "conditions_he"), language(lan, "conditions_da"), language(lan,
							"conditions_xiao")
					],
					[language(lan, "conditions_dan"), language(lan, "conditions_shuang"), language(lan,
							"conditions_zhi"),
						language(lan, "conditions_he"), language(lan, "conditions_da"), language(lan,
							"conditions_xiao")
					], common.getIntNum(0, 2), common.getIntNum(0, 2)
				];
				o.val = [
					[0, 1, 0, 1, 0, 1],
					[0, 1, 0, 1, 0, 1], common.getIntNum(0, 2), common.getIntNum(0, 2)
				];
				o.list = [6, 6, 3, 3];
				break;
			case "ssca2-trend_012luZouShi":
			case "sscp2-trend_012luZouShi":
				a = ["sscp2001", "sscp2010", "sscp2005"], o.listName = [language(lan,
							"conditions_012lufenbu"),
						language(lan, "conditions_0lugeshu"), language(lan, "conditions_1lugeshu"),
						language(
							lan, "conditions_2lugeshu"), language(lan, "conditions_wanwei"), language(lan,
							"conditions_qianwei")
					], -1 < n.indexOf("ssca2") && (a = ["ssca2001", "ssca2010", "ssca2005"], o.listName = [
						language(lan, "conditions_012lufenbu"), language(lan, "conditions_0lugeshu"),
						language(lan, "conditions_1lugeshu"), language(lan, "conditions_2lugeshu"),
						language(lan, "conditions_shiwei"), language(lan, "conditions_gewei")
					]), o.id = [
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[],
						[]
					], o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 3), common
						.getCondition(a[1], 3), common.getCondition(a[1], 3), common.getCondition(a[2], 3),
						common.getCondition(a[2], 3)
					], o.span = [0, 0, 1, 2, 0, 1], o.listclass = ["bg1", "bg5", "bg3", "bg4", "bg3",
						"bg5"
					], o
					.data = [
						[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 2), common.getIntNum(0, 2),
						common
						.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2)
					], o.val = [
						[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 2), common.getIntNum(0, 2),
						common
						.getIntNum(0, 2), ["0,3,6,9", "1,4,7", "2,5,8"],
						["0,3,6,9", "1,4,7", "2,5,8"]
					], o.list = [10, 3, 3, 3, 3, 3];
				break;
			case "ssca3-trend_012luZouShi":
			case "sscp3-trend_012luZouShi":
			case "plsr3-trend_012luZouShi":
			case "3dr3-trend_012luZouShi":
			case "hasha3-trend_012luZouShi":
				var a = ["ssca3001", "ssca3013", "ssca3006"];
				o.listName = [language(lan, "conditions_012lufenbu"), language(lan,
						"conditions_0lugeshu"), language(
						lan, "conditions_1lugeshu"), language(lan, "conditions_2lugeshu"), language(lan,
						"conditions_wanwei"),
					language(lan, "conditions_qianwei"), language(lan, "conditions_baiwei")
				];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3001", "sscp3013", "sscp3006"];
					o.listName = [language(lan, "conditions_012lufenbu"), language(lan,
							"conditions_0lugeshu"), language(
							lan, "conditions_1lugeshu"), language(lan, "conditions_2lugeshu"), language(
							lan, "conditions_baiwei"),
						language(lan, "conditions_shiwei"), language(lan, "conditions_gewei")
					];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3001", "3dr3013", "3dr3006"];
					o.listName = [language(lan, "conditions_012lufenbu"), language(lan,
							"conditions_0lugeshu"), language(
							lan, "conditions_1lugeshu"), language(lan, "conditions_2lugeshu"), language(
							lan, "conditions_baiwei"),
						language(lan, "conditions_shiwei"), language(lan, "conditions_gewei")
					];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3001", "plsr3013", "plsr3006"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3001", "hasha3013", "hasha3006"];
				}
				o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
				];
				o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 4), common
					.getCondition(
						a[1], 4),
					common.getCondition(a[1], 4), common.getCondition(a[2], 3), common.getCondition(
						a[2], 3), common.getCondition(
						a[2], 3)
				];
				o.span = [0, 0, 1, 2, 0, 1, 2];
				o.listclass = ["bg1", "bg5", "bg3", "bg4", "bg3", "bg5", "bg4"];
				o.data = [
					[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 3), common.getIntNum(0, 3),
					common.getIntNum(
						0, 3), common.getIntNum(0, 2), common.getIntNum(0, 2), common.getIntNum(0, 2)
				];
				o.val = [
					[0, 3, 6, 9, 1, 4, 7, 2, 5, 8], common.getIntNum(0, 3), common.getIntNum(0, 3),
					common.getIntNum(0, 3), [
						"0,3,6,9",
						"1,4,7", "2,5,8"
					],
					["0,3,6,9", "1,4,7", "2,5,8"],
					["0,3,6,9", "1,4,7", "2,5,8"]
				];
				o.list = [10, 4, 4, 4, 3, 3, 3];
				break;
			case "ssca3-trend_junzhizoushi":
			case "sscp3-trend_junzhizoushi":
			case "plsr3-trend_junzhizoushi":
			case "3dr3-trend_junzhizoushi":
			case "hasha3-trend_junzhizoushi":
				var a = ["ssca3019", "ssca3020"];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3019", "sscp3020"];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3019", "3dr3020"];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3019", "plsr3020"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3019", "hasha3020"];
				}
				o.id = [
					[],
					["lt_dan", "lt_shuang", "lt_zhi", "lt_he", "lt_da", "lt_xiao"]
				];
				o.listName = [language(lan, "junzhi"), language(lan, "cdt.junzhishuxing")];
				o.alt = [common.getCondition(a[0], 10), common.getCondition(a[1], 6)];
				o.span = [0, "0,0,1,1,2,2"];
				o.listclass = ["bg3", "bg5"];
				o.data = [common.getIntNum(0, 9), [language(lan, "conditions_da"), language(lan,
						"conditions_xiao"), language(
						lan, "conditions_dan"), language(lan, "conditions_shuang"), language(lan,
						"conditions_zhi"),
					language(lan, "conditions_he")
				]];
				o.val = [
					common.getIntNum(0, 9), [0, 1, 0, 1, 0, 1]
				];
				o.list = [10, 6];
				break;
			case "ssca3-trend_hezhenzoushi":
			case "sscp3-trend_hezhenzoushi":
			case "plsr3-trend_hezhenzoushi":
			case "3dr3-trend_hezhenzoushi":
			case "hasha3-trend_hezhenzoushi":

				var a = ["ssca3021", "ssca3022"];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3021", "sscp3022"];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3021", "3dr3022"];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3021", "plsr3022"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3021", "hasha3022"];
				}
				o.id = [
					[],
					["lt_dan", "lt_shuang", "lt_zhi", "lt_he", "lt_da", "lt_xiao"]
				];
				o.listName = [language(lan, "cdt.hezhizhenfu"), language(lan, "cdt.hezhenshuxing")];
				o.alt = [common.getCondition(a[0], 28), common.getCondition(a[1], 6)];
				o.span = [0, "0,0,1,1,2,2"];
				o.listclass = ["bg3", "bg5"];
				o.data = [common.getIntNum(0, 27), [language(lan, "conditions_da"), language(lan,
						"conditions_xiao"),
					language(
						lan, "conditions_dan"), language(lan, "conditions_shuang"), language(lan,
						"conditions_zhi"),
					language(lan, "conditions_he")
				]];
				o.val = [
					common.getIntNum(0, 27), [0, 1, 0, 1, 0, 1]
				];
				o.list = [28, 6];
				break;
			case "ssca3-trend_pailiezoushi":
			case "sscp3-trend_pailiezoushi":
			case "plsr3-trend_pailiezoushi":
			case "3dr3-trend_pailiezoushi":
			case "hasha3-trend_pailiezoushi":

				var a = ["ssca3023", "ssca3024"];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3023", "sscp3024"];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3023", "3dr3024"];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3023", "plsr3024"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3023", "hasha3024"];
				}
				o.id = [
					[],
					[],
					[],
					["zx_da", "zx_xiao", "zx_dan", "zx_shuang", "zx_zhi", "zx_he"],
					["zj_da", "zj_xiao", "zj_dan", "zj_shuang", "zj_zhi", "zj_he"],
					["zd_da", "zd_xiao", "zd_dan", "zd_shuang", "zd_zhi", "zd_he"],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[]
				];
				o.listName = [language(lan, "cdt.zuixiaoshu"), language(lan, "cdt.zhongjianshu"),
					language(lan,
						"cdt.zuidashu"), language(lan, "cdt.zuixiaoshu"), language(lan,
						"cdt.zhongjianshu"), language(lan,
						"cdt.zuidashu")
				];
				o.alt = [common.getCondition(a[0], 10), common.getCondition(a[0], 10), common
					.getCondition(
						a[0], 10),
					common.getCondition(a[1], 6), common.getCondition(a[1], 6), common.getCondition(
						a[1], 6)
				];
				o.span = [0, 1, 2, "0,0,1,1,2,2", "4,4,5,5,6,6", "8,8,9,9,10,10"];
				o.listclass = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
				o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), [
						language(lan,
							"conditions_da"),
						language(lan, "conditions_xiao"), language(lan, "conditions_dan"), language(lan,
							"conditions_shuang"),
						language(lan, "conditions_zhi"), language(lan, "conditions_he")
					],
					[language(lan, "conditions_da"),
						language(lan, "conditions_xiao"), language(lan, "conditions_dan"), language(lan,
							"conditions_shuang"),
						language(lan, "conditions_zhi"), language(lan, "conditions_he")
					],
					[language(lan, "conditions_da"),
						language(lan, "conditions_xiao"), language(lan, "conditions_dan"), language(lan,
							"conditions_shuang"),
						language(lan, "conditions_zhi"), language(lan, "conditions_he")
					]
				];
				o.val = [
					common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), [0, 1, 0, 1,
						0, 1
					],
					[0, 1, 0, 1, 0, 1],
					[0, 1, 0, 1, 0, 1]
				];
				o.list = [10, 10, 10, 6, 6, 6];
				break;
			case "ssca3-trend_dingweifenbu":
			case "sscp3-trend_dingweifenbu":
			case "plsr3-trend_dingweifenbu":
			case "3dr3-trend_dingweifenbu":
			case "hasha3-trend_dingweifenbu":
				var a = ["ssca3025", "ssca3026"];
				var wz = [language(lan, "conditions_wanwei"), language(lan, "conditions_qianwei"), language(
					lan,
					"conditions_baiwei")];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3025", "sscp3026"];
					wz = [language(lan, "conditions_baiwei"), language(lan, "conditions_shiwei"), language(
						lan,
						"conditions_gewei")];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3025", "3dr3026"];
					wz = [language(lan, "conditions_baiwei"), language(lan, "conditions_shiwei"), language(
						lan,
						"conditions_gewei")];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3025", "plsr3026"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3025", "hasha3026"];
				}
				o.id = [
					[],
					[],
					[],
					["zx_da", "zx_xiao", "zx_dan", "zx_shuang", "zx_zhi", "zx_he"],
					["zj_da", "zj_xiao", "zj_dan", "zj_shuang", "zj_zhi", "zj_he"],
					["zd_da", "zd_xiao", "zd_dan", "zd_shuang", "zd_zhi", "zd_he"],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
				];
				o.listName = [wz[0], wz[1], wz[2], wz[0], wz[1], wz[2]];
				o.alt = [common.getCondition(a[0], 10), common.getCondition(a[0], 10), common
					.getCondition(
						a[0], 10),
					common.getCondition(a[1], 6), common.getCondition(a[1], 6), common.getCondition(
						a[1], 6)
				];
				o.span = [0, 1, 2, "0,0,1,1,2,2", "4,4,5,5,6,6", "8,8,9,9,10,10"];
				o.listclass = ["bg3", "bg4", "bg5", "bg3", "bg4", "bg5"];
				o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), [
						language(lan,
							"conditions_da"),
						language(lan, "conditions_xiao"), language(lan, "conditions_dan"), language(lan,
							"conditions_shuang"),
						language(lan, "conditions_zhi"), language(lan, "conditions_he")
					],
					[language(lan, "conditions_da"),
						language(lan, "conditions_xiao"), language(lan, "conditions_dan"), language(lan,
							"conditions_shuang"),
						language(lan, "conditions_zhi"), language(lan, "conditions_he")
					],
					[language(lan, "conditions_da"),
						language(lan, "conditions_xiao"), language(lan, "conditions_dan"), language(lan,
							"conditions_shuang"),
						language(lan, "conditions_zhi"), language(lan, "conditions_he")
					]
				];
				o.val = [
					common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), [0, 1, 0, 1,
						0, 1
					],
					[0, 1, 0, 1, 0, 1],
					[0, 1, 0, 1, 0, 1]
				];
				o.list = [10, 10, 10, 6, 6, 6];
				break;
			case "ssca3-trend_litiZouShi":
			case "sscp3-trend_litiZouShi":
			case "plsr3-trend_litiZouShi":
			case "3dr3-trend_litiZouShi":
			case "hasha3-trend_litiZouShi":
				var a = ["ssca3006"];
				o.id = [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
				];
				var wz = [language(lan, "conditions_wanwei"), language(lan, "conditions_qianwei"), language(
					lan,
					"conditions_baiwei")];
				if (n.indexOf("sscp3") > -1) {
					a = ["sscp3006"];
					wz = [language(lan, "conditions_baiwei"), language(lan, "conditions_shiwei"), language(
						lan,
						"conditions_gewei")];
				} else if (n.indexOf("3dr3") > -1) {
					a = ["3dr3006"];
					wz = [language(lan, "conditions_baiwei"), language(lan, "conditions_shiwei"), language(
						lan, "conditions_gewei")];
				} else if (n.indexOf("plsr3") > -1) {
					a = ["plsr3006"];
				} else if (n.indexOf("hasha3") > -1) {
					a = ["hasha3006"];
				}
				o.listName = [wz[0], wz[1], wz[2], language(lan, "conditions_hezhiA")];
				o.alt = [common.getCondition(a[0], 10), common.getCondition(a[0], 10), common
					.getCondition(
						a[0], 10),
					common.getCondition(a[0], 1)
				];
				o.span = [0, 1, 2, 0];
				o.listclass = ["bg4", "bg5", "bg3", "bg3"];
				o.data = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), []];
				o.val = [common.getIntNum(0, 9), common.getIntNum(0, 9), common.getIntNum(0, 9), []];
				o.list = [10, 10, 10, 1];
				break;
			case "ssca2-trend_litiZouShi":
			case "sscp2-trend_litiZouShi":
				a = ["ssca2005", "ssca2008"], o.id = [
						[],
						[],
						[],
						[],
						[],
						[]
					], l = [language(lan, "conditions_wanwei"), language(lan, "conditions_qianwei")], -1 < n
					.indexOf("sscp2") && (a = ["sscp2005", "sscp2008"], l = [language(lan,
							"conditions_shiwei"),
						language(lan, "conditions_gewei")
					]), o.listName = [l[0], l[1], language(lan, "conditions_lianhaochongma"), language(lan,
						"conditions_hezhiA")], o.alt = [common.getCondition(a[0], 10), common.getCondition(
						a[0],
						10), common.getCondition(a[1], 2), common.getCondition(a[1], 1)], o.span = [0, 1,
						"0,1",
						0
					], o.listclass = ["bg4", "bg5", "bg4", "bg3"], o.data = [common.getIntNum(0, 9), common
						.getIntNum(0, 9), [language(lan, "conditions_lianhao"), language(lan,
							"conditions_chongma")],
						[]
					], o.val = [common.getIntNum(0, 9), common.getIntNum(0, 9), ["1", "1,2"],
						[]
					], o.list = [10, 10, 2, 1]
		}
		return o
	},
	getReverse: function(n, o) {
		for (var a = [], t = 0, i = n; o <= i; i--) a[t] = i, t++;
		return a
	},
	getRatio: function(n, o) {
		for (var a = [], t = [], i = o, e = [], g = n; g <= o; g++) t[a[g] = g] = i--;
		for (g = 0; g < a.length; g++) e[g] = a[g] + ":" + t[g];
		return e
	},
	getReverseRatio: function(n, o) {
		for (var a = [], t = [], i = o, e = [], g = n; g <= o; g++) t[a[g] = g] = i--;
		for (g = 0; g < a.length; g++) e[g] = t[g] + ":" + a[g];
		return e
	}
};