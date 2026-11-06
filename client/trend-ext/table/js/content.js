var content = {
	content: function(e, n) {
		for (var a = "", t = 0, r = new Array(50), s = [], o = [], g = [], i = [], l = [], c = 0; c < r
			.length; c++) r[c] = 0, s[c] = 0, o[c] = 0, g[c] = 0, i[c] = 0, l[c] = 0;
		var m = "",
			p = "<colgroup>",
			u = initialize.content(e);
		for (p += '<col span="1" width="100" ></col>', c = 0; c < u.data.length; c++) p += '<col class="' + u
			.listclass[c] + '"span="' + u.list[c] + '" width="' + common.special() + '"></col>';
		p += "</colgroup>", m += "<tbody id='trendcontent'>";
		var h = [],
			d = 0,
			b = 0;
		var object = JSON.parse(common.cookieGet("obj"));
		for (c = n.length - 1; - 1 < c; c--)
			if (t = 0, -1 < e.indexOf("trend_xingtaiZouShi") || -1 < e.indexOf("trend_jibenZouShi") && (-1 < e
					.indexOf("1105") || -1 < e.indexOf("1205")) || (-1 < e.indexOf("trend_tongweiZhenFu") || -
					1 < e.indexOf("trend_lianhaoChongMa")) && (-1 < e.indexOf("1105") || -1 < e.indexOf(
					"1205") || -1 < e.indexOf("animals")) || -1 < e.indexOf("trend_hezhenzoushi") || -1 < e
				.indexOf("trend_litiZouShi") && (-1 < e.indexOf("ssca2") || -1 < e.indexOf("sscp2")) ? (h[d] =
					n[c].opennumber, d++) : -1 < e.indexOf("trend_dingweifenbu") ? (h[b] = n[c].opennumber,
					b++) : d = 3, -1 < e.indexOf("trend_dingweifenbu") && 200 < b || 2 < d || (-1 < e.indexOf(
						"trend_hezhenzoushi") || -1 < e.indexOf("trend_litiZouShi") && (-1 < e.indexOf(
						"ssca2") || -1 < e.indexOf("sscp2")) || -1 < e.indexOf("trend_tongweiZhenFu") || -1 < e
					.indexOf("trend_lianhaoChongMa")) && 1 < d) {
				var _;
				if (object.play_id.indexOf('animals') > -1) {
					_ = n[c].expect.substring(4, n[c].expect.length)
				} else if ("plsr3" == object.play_id) {
					_ = n[c].expect
				} else {
					_ = 7 < n[c].expect.length ? common.cutOut(n[c].expect, n[c].expect.length - 5, n[c].expect
						.length) : common.cutOut(n[c].expect, 4, n[c].expect.length)
				}
				e.indexOf("trend_pingmianZouShi") < 0 && (n[c].opennumber = common.cutOutNumber(n[c].opennumber,
						e.split("-")[0])),
					a += "<tr>", a += '<td class="qh">' + _ + "</td>", a += "</tr>";
				var f = this.calculate(e, n[c].opennumber, h);
				m += "<tr>", m += '<td class="kjhm">' + n[c].opennumber + "</td>";
				for (var I = 0, k = 0; k < u.list.length; k++) {
					1 == parseInt(u.list[k]) && (m += '<td class="' + (null == f[k].classname ? this.type(n[c]
							.opennumber) : f[k].classname) + '">' + f[k].num[0] + "</td>", t++), 0 == u.val[k]
						.length && I++;
					for (var S = 0; S < u.val[k].length; S++) {
						t++;
						var Z = -1;
						if (-1 < e.indexOf("trend_xingtaiZouShi") && (-1 < e.indexOf("1105a3") || -1 < e
								.indexOf("1205a3"))) {
							for (var x = 0; x < f[k].num.length; x++)
								if (k == u.list.length - 1) f[k].num[x] == u.data[k][S] && (Z = u.data[k][S]);
								else if (parseInt(f[k].num[x]) == parseInt(u.val[k][S])) {
								Z = 4 != k && 5 != k && 6 != k || 0 != f[k].num[x] && 2 != f[k].num[x] ? u.data[
									k][S] : language(common.cookieGet("language"), "conditions_chuan");
								break
							}
						} else if (-1 < e.indexOf("trend_hezhizoushiB") && (-1 < e.indexOf("1105r3") || -1 < e
								.indexOf("1205r3"))) {
							for (x = 0; x < f[k].num.length; x++)
								if (parseInt(f[k].num[x]) == parseInt(u.val[k][S])) {
									Z = u.val[k][S];
									break
								}
						} else if (-1 < e.indexOf("trend_hezhiShuJuA")) parseInt(f[k].num[S]) != parseInt(u.val[
							k][S]) && f[k].num[S] != u.data[k][S] || (Z = u.data[k][S]);
						else if (-1 < e.indexOf("trend_chazhiKuaDu") || -1 < e.indexOf("trend_sanmaHeZhiB") || -
							1 < e.indexOf("trend_sanmaChaHe") || -1 < e.indexOf("trend_heheFenBu") ||
							"sscs4-trend_chakuaZouShi" == e || "3dr3-trend_chakuaZouShi" == e ||
							"plsr3-trend_chakuaZouShi" == e || "hasha3-trend_chakuaZouShi" == e || -1 < e
							.indexOf("trend_hechazoushi")) {
							for (x = 0; x < f[k].num.length; x++)
								if (f[k].num[x] == u.data[k][S]) {
									Z = u.data[k][S];
									break
								}
						} else if (-1 < e.indexOf("trend_chazhiSanFenBu") || -1 < e.indexOf(
								"trend_chazhiErFenBu") || -1 < e.indexOf("trend_chazhiSiFenBu") || -1 < e
							.indexOf("trend_chazhiWuFenBu") || -1 < e.indexOf("trend_chazhiWuFenBu"))
							for (x = 0; x < f[k].num.length; x++) f[k].num[x] == u.data[k][S] && (Z = u.data[k][
								S
							]);
						else if (-1 < e.indexOf("trend_junhengFenBu"))
							for (x = 0; x < f[k].num.length; x++) parseInt(f[k].num[x]) == parseInt(u.val[k][
								S
							]) && (Z = u.data[k][S]);
						else
							for (x = 0; x < f[k].num.length; x++)
								if (parseInt(f[k].num[x]) == parseInt(u.val[k][S]) || f[k].num[x] == u.data[k][
										S
									]) {
									Z = u.data[k][S];
									break
								} if (-1 != Z) {
							if (s[I]++, g[I] = 0, o[I]++, -1 < f[k].classname.indexOf("all")) {
								var v = this.ball(e, Z, f[k].num, f[k].classname),
									y = null != v ? v : f[k].classname; - 1 < e.indexOf("trend_012luFenBu") || -
									1 < e.indexOf("trend_012luGeShu") ? -1 < e.indexOf("1105") && 9 == parseInt(
										Z) || 10 == parseInt(Z) || -1 < e.indexOf("1205") && 12 == parseInt(
										Z) || 10 == parseInt(Z) || "sscs4-trend_012luGeShu" == e && (9 ==
										parseInt(u.val[k][S]) || 7 == parseInt(u.val[k][S])) ? m +=
									'<td style="border-right: 2px solid #999 !important;"><span class="' + y +
									'">' + Z + "</span></td>" : m += '<td><span class="' + y + '">' + Z +
									"</span></td>" : -1 < e.indexOf("trend_012luZouShi") && (object.play_id
										.indexOf("animals") > -1 ? (6 == parseInt(Z) || 4 == parseInt(Z)) : (
											9 == parseInt(Z) || 7 == parseInt(Z))) ? m +=
									'<td style="border-right: 2px solid #999 !important;"><span class="' + y +
									'">' + Z + "</span></td>" : m += '<td><span class="' + y + '">' + Z +
									"</span></td>"
							} else m += '<td class="' + f[k].classname + '">' + Z + "</td>";
							r[I] = 0
						} else {
							++g[I], o[I] = 0;
							if ("sscs4-trend_012luGeShu" == e) {
								if (9 == parseInt(u.val[k][S]) || 7 == parseInt(u.val[k][S])) {
									m += '<td style="border-right: 2px solid #999 !important;">' + ++r[I] +
										"</td>"
								} else {
									m += "<td>" + ++r[I] + "</td>"
								}
							} else if (-1 < e.indexOf("trend_012luFenBu") || -1 < e.indexOf(
									"trend_012luGeShu")) {
								if (-1 < e.indexOf("1105") && 9 == parseInt(u.val[k][S]) ||
									10 == parseInt(u.val[k][S]) || -1 < e.indexOf("1205") && 12 == parseInt(u
										.val[k][S]) || 10 == parseInt(u.val[k][S])) {
									m += '<td style="border-right: 2px solid #999 !important;">' + ++r[I] +
										"</td>"
								} else {
									m += "<td>" + ++r[I] + "</td>"
								}
							} else if (-1 < e.indexOf("trend_012luZouShi")) {
								if (-1 < e.indexOf("animals")) {
									(6 == parseInt(u.val[k][S]) || 4 == parseInt(u.val[k][S])) ? m +=
										'<td style="border-right: 2px solid #999 !important;">' + ++r[I] +
										"</td>": m += "<td>" + ++r[I] + "</td>";
								} else {
									(9 == parseInt(u.val[k][S]) || 7 == parseInt(u.val[k][S])) ? m +=
										'<td style="border-right: 2px solid #999 !important;">' + ++r[I] +
										"</td>": m += "<td>" + ++r[I] + "</td>";
								}
							} else {
								m += "<td>" + ++r[I] + "</td>";
							}

							// - 1 < e.indexOf("trend_012luFenBu") || -1 < e.indexOf(
							// 	"trend_012luGeShu") ? -1 < e.indexOf("1105") && 9 == parseInt(u.val[k][
							// 	S
							// ]) ||
							// 10 == parseInt(u.val[k][S]) || -1 < e.indexOf("1205") && 12 == parseInt(u.val[k]
							// 	[
							// 		S
							// 	]) || 10 == parseInt(u.val[k][S]) || "sscs4-trend_012luGeShu" == e && (9 ==
							// 	parseInt(u.val[k][S]) || 7 == parseInt(u.val[k][S])) ? m +=
							// '<td style="border-right: 2px solid #999 !important;">' + ++r[I] + "</td>" :
							// m +=
							// "<td>" + ++r[I] + "</td>" : -1 < e.indexOf("trend_012luZouShi") && (9 ==
							// 	parseInt(u
							// 		.val[k][S]) || 7 == parseInt(u.val[k][S])) ? m +=
							// '<td style="border-right: 2px solid #999 !important;">' + ++r[I] + "</td>" :
							// m +=
							// "<td>" + ++r[I] + "</td>";
						}
						o[I] > l[I] && (l[I] = o[I]), i[I] < g[I] && (i[I] = g[I]), I++
					}
				}
				m += "</tr>"
			} m += "</tbody>";
		var O = "<td></td>",
			A = "<td></td>",
			G = "<td></td>";
		for (c = 0; c < t; c++) O += "<td>" + s[c] + "</td>", A += "<td>" + l[c] + "</td>", G += "<td>" + i[c] +
			"</td>";
		$("#opennumber").html(a), $("#width1").html(p + m), $("#arise1").html(O), $("#continuous1").html(A), $(
			"#omit1").html(G), setTimeout(function() {
			$("#width1").parent().scrollTop($("#width1").height())
		}, 0)
	},
	calculate: function(e, n, a) {
		var t = [];
		var obj = JSON.parse(common.cookieGet("obj"));
		switch (e) {
			case "sscs4-trend_012luDingWei":
				for (var r = [
						[re = (g = n.split(","))[0] % 3],
						[se = g[1] % 3],
						[nn = g[2] % 3],
						[g[3] % 3]
					], s = ["gbg", "lbg", "gbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "sscs4-trend_012luGeShu":
				var g = n.split(","),
					i = [0, 3, 6, 9, 1, 4, 7, 2, 5, 8],
					l = [],
					c = 0,
					m = 0,
					p = 0;
				for (o = 0; o < g.length; o++) {
					for (var u = 0; u < i.length; u++) parseInt(g[o]) == i[u] && (l[o] = i[u]);
					g[o] % 3 == 0 && c++, g[o] % 3 == 1 && m++, g[o] % 3 == 2 && p++
				}
				for (r = [l, [c],
						[m],
						[p]
					], s = ["bball_s", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "sscs4-trend_chakuaZouShi":
				var h = [],
					d = 0;
				for (o = (O = common.sortArr(n.split(","))).length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--) h[d] = parseInt(O[o]) - parseInt(O[u]), d++;
				for (r = [f = common.sortArr(common.removeAgain(h)), common.getAgain(h), [parseInt(O[O.length -
						1]) - parseInt(O[0])]], s = ["gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "sscs4-trend_heheZouShi":
				for (l = [common.getIntNum(0, 12), common.getIntNum(13, 25), common.getIntNum(25, 36)], o = h =
					0; o < n.split(",").length; o++) h += parseInt(n.split(",")[o]);
				var b = h % 10;
				for (o = d = 0; o < l.length; o++)
					for (var _ = 0; _ < l[o].length; _++) h == l[o][_] && (d = o);
				for (r = [d, b], s = ["gbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "sscs4-trend_litiZouShi":
				g = n.split(",");
				var f = 0;
				for (o = 0; o < g.length; o++) f += parseInt(g[o]);
				for (r = [g[0], g[1], g[2], g[3], f], s = ["bball_s", "gball_s", "rball_s", "gball_s", "rbg"],
					o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "sscs4-trend_jibenZouShi":
				var I = [];
				for (o = h = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o], h += parseInt(n.split(
					",")[o]);
				t[0] = {
					num: common.sortArr(n.split(",")),
					type: "span",
					classname: "bball_s"
				};
				var k = [0, 1, 2, 3, 4],
					S = [0, 2, 4, 6, 8],
					Z = [0, 4, 6, 8, 9],
					x = 0,
					v = 0,
					y = 0;
				for (o = 0; o < I.length; o++) I[o] = parseInt(I[o]), -1 < k.indexOf(I[o]) && x++, -1 < S
					.indexOf(I[o]) && v++, -1 < Z.indexOf(I[o]) && y++;
				t[1] = {
					num: [v],
					type: "td",
					classname: "rbg"
				}, t[2] = {
					num: [y],
					type: "td",
					classname: "lbg"
				}, t[3] = {
					num: [x],
					type: "td",
					classname: "gbg"
				}, t[4] = {
					num: [h],
					type: "td",
					classname: "rbg"
				};
				break;
			case "1105r5-trend_pingmianZouShi":
			case "1105r4-trend_pingmianZouShi":
			case "1105r3-trend_pingmianZouShi":
			case "1105p2-trend_pingmianZouShi":
			case "1105a3-trend_pingmianZouShi":
			case "1105a2-trend_pingmianZouShi":
			case "1205r5-trend_pingmianZouShi":
			case "1205r4-trend_pingmianZouShi":
			case "1205r3-trend_pingmianZouShi":
			case "1205p2-trend_pingmianZouShi":
			case "1205a3-trend_pingmianZouShi":
			case "1205a2-trend_pingmianZouShi":
				for (I = [], o = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o];
				for (t[0] = {
						num: common.sortArr(n.split(",")),
						type: "span",
						classname: "bball"
					}, k = [1, 2, 3, 4, 5], S = [2, 4, 6, 8, 10], Z = [4, 6, 8, 9, 10], -1 < e.indexOf(
						"1205") && (k = [1, 2, 3, 4, 5, 6], S = [2, 4, 6, 8, 10, 12], Z = [4, 6, 8, 9, 10, 12]),
					o =
					y = v = x = 0; o < I.length; o++) I[o] = parseInt(I[o]), -1 < k.indexOf(I[o]) && x++, -1 < S
					.indexOf(I[o]) && v++, -1 < Z.indexOf(I[o]) && y++;
				t[1] = {
					num: [x],
					type: "td",
					classname: "rbg"
				}, t[2] = {
					num: [v],
					type: "td",
					classname: "lbg"
				}, t[3] = {
					num: [y],
					type: "td",
					classname: "gbg"
				};
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
				for (I = [], o = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o];
				for (t[0] = {
						num: common.sortArr(n.split(",")),
						type: "span",
						classname: "bball_s"
					}, k = [1, 2, 3], S = [2, 4, 6], Z = [4, 6],
					o =
					y = v = x = 0; o < I.length; o++) I[o] = parseInt(I[o]), -1 < k.indexOf(I[o]) && x++, -1 < S
					.indexOf(I[o]) && v++, -1 < Z.indexOf(I[o]) && y++;
				t[1] = {
					num: [x],
					type: "td",
					classname: "rbg"
				}, t[2] = {
					num: [v],
					type: "td",
					classname: "lbg"
				}, t[3] = {
					num: [y],
					type: "td",
					classname: "gbg"
				};
				break;
			case "ssca2-trend_pingmianZouShi":
			case "ssca3-trend_pingmianZouShi":
			case "sscp2-trend_pingmianZouShi":
			case "sscp3-trend_pingmianZouShi":
			case "plsr3-trend_pingmianZouShi":
			case "sscs4-trend_pingmianZouShi":
				var num = [];
				var all = 0;
				for (var i = 0; i < n.split(",").length; i++) {
					num[i] = n.split(",")[i];
					all += parseInt(n.split(",")[i]);
				}
				t[0] = {
					num: common.sortArr(n.split(",")),
					type: "span",
					classname: "bball_s"
				}
				var xs = [0, 1, 2, 3, 4];
				var os = [0, 2, 4, 6, 8];
				var hs = [0, 4, 6, 8, 9];
				var little = 0; //小数
				var pair = 0 //偶数
				var he = 0 //合数
				for (var i = 0; i < num.length; i++) {
					num[i] = parseInt(num[i]);
					if (xs.indexOf(num[i]) > -1) {
						little++;
					}
					if (os.indexOf(num[i]) > -1) {
						pair++;
					}
					if (hs.indexOf(num[i]) > -1) {
						he++;
					}
				}
				t[1] = {
					num: [little],
					type: "td",
					classname: "rbg"
				}
				t[2] = {
					num: [pair],
					type: "td",
					classname: "lbg"
				}
				t[3] = {
					num: [he],
					type: "td",
					classname: "gbg"
				}
				t[4] = {
					num: [all],
					type: "td",
					classname: "rbg"
				}
				break;
			case "3dr3-trend_pingmianZouShi":
			case "k3r3-trend_pingmianZouShi":
			case "ssca3-trend_jibenZouShi":
			case "sscp3-trend_jibenZouShi":
			case "plsr3-trend_jibenZouShi":
			case "hasha3-trend_jibenZouShi":
			case "hasha3-trend_pingmianZouShi":
				for (I = [], o = h = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o], h += parseInt(n
					.split(",")[o]);
				for (t[0] = {
						num: [common.group(I)],
						type: "td",
						classname: null
					}, t[1] = {
						num: common.sortArr(n.split(",")),
						type: "span",
						classname: "bball_s"
					}, k = [0, 1, 2, 3, 4], -1 < e.indexOf("k3r3") && (k = [1, 2, 3]), S = [0, 2, 4, 6, 8],
					Z = [0, 4, 6, 8, 9], o = y = v = x = 0; o < I.length; o++) I[o] = parseInt(I[o]), -1 < k
					.indexOf(I[o]) && x++, -1 < S.indexOf(I[o]) && v++, -1 < Z.indexOf(I[o]) && y++;
				t[4] = {
					num: [y],
					type: "td",
					classname: "gbg"
				}, t[3] = {
					num: [v],
					type: "td",
					classname: "lbg"
				}, t[2] = {
					num: [x],
					type: "td",
					classname: "rbg"
				}, t[5] = {
					num: [h],
					type: "td",
					classname: "rbg"
				};
				var O = common.sortArr(n.split(",")); - 1 < e.indexOf("k3r3") && (t[5] = {
					num: [O[O.length - 1] - O[0]],
					type: "td",
					classname: "rbg"
				});
				break;
			case "ssca2-trend_jibenZouShi":
			case "sscp2-trend_jibenZouShi":
				for (I = [], o = h = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o], h += parseInt(n
					.split(",")[o]);
				for (t[0] = {
						num: common.sortArr(n.split(",")),
						type: "span",
						classname: "bball_s"
					}, k = [0, 1, 2, 3, 4], S = [0, 2, 4, 6, 8], Z = [0, 4, 6, 8, 9], o = y = v = x = 0; o < I
					.length; o++) I[o] = parseInt(I[o]), -1 < k.indexOf(I[o]) && x++, -1 < S.indexOf(I[o]) &&
					v++, -1 < Z.indexOf(I[o]) && y++;
				t[1] = {
					num: [v],
					type: "td",
					classname: "rbg"
				}, t[2] = {
					num: [y],
					type: "td",
					classname: "lbg"
				}, t[3] = {
					num: [x],
					type: "td",
					classname: "gbg"
				}, t[4] = {
					num: [h],
					type: "td",
					classname: "rbg"
				};
				break;
			case "1105r5-trend_linkongFenBu":
			case "1205r5-trend_linkongFenBu":
			case "k3r3-trend_linkongFenBu":
				g = common.sortArr(n.split(","));
				var A = 0;
				for (o = 0; o < g.length - 1; o++) g[o + 1] - g[o] > A && (A = g[o + 1] - g[o]);
				s = ["gbg", "rbg", "lbg", "rbg"];
				var G = 11; - 1 < e.indexOf("1205") ? G = 12 : -1 < e.indexOf("k3r3") && (s = ["gbg", "rbg",
					"gbg"
				], G = 6);
				var z = parseInt(g[0]) - 1 + (G - parseInt(g[g.length - 1])),
					F = z + A,
					w = [A, z, _n = g[g.length - 1] - g[0] - 4, F];
				for (-1 < e.indexOf("k3r3") && (w = [A, z, F]), o = 0; o < w.length; o++) t[o] = {
					num: [w[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a3-trend_jibenZouShi":
			case "1205a3-trend_jibenZouShi":
				for (I = [], o = y = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o], y += parseInt(n
					.split(",")[o]);
				for (r = [I, [I[0]],
						[I[1]],
						[I[2]]
					], s = ["bball", "gball", "rball", "bball"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "span",
					classname: s[o]
				};
				t[4] = {
					num: [y],
					type: "td",
					classname: "rbg"
				};
				break;
			case "1105a2-trend_jibenZouShi":
			case "1205a2-trend_jibenZouShi":
				I = [];
				var B = [],
					N = [];
				for (o = y = 0; o < n.split(",").length; o++) B[o] = a[a.length - 3].split(",")[o], N[o] = a[a
					.length - 2].split(",")[o], I[o] = n.split(",")[o], y += parseInt(n.split(",")[o]);
				I = common.sortArr(I);
				var j = "",
					H = "",
					W = "",
					C = "";
				parseInt(I[1]) - 1 == parseInt(I[0]) && (j = language(common.cookieGet("language"),
					"conditions_lianhao"));
				var $ = 0,
					J = 0,
					M = 0;
				for (o = 0; o < I.length; o++)
					for (_ = 0; _ < N.length; _++) {
						parseInt(I[o]) != parseInt(N[_]) + 1 && parseInt(I[o]) != parseInt(N[_]) - 1 || $++,
							parseInt(I[o]) == parseInt(N[_]) && J++;
						for (var D = 0; D < B.length; D++) parseInt(I[o]) != parseInt(N[_]) && parseInt(I[o]) ==
							parseInt(B[D]) && M++
					}
				for (0 < $ && (H = language(common.cookieGet("language"), "conditions_chuanhao")), 0 < J && (W =
						language(common.cookieGet("language"), "conditions_chongma")), 0 < M && (C = language(
						common.cookieGet("language"), "conditions_tiaoma")), r = [I, [n.split(",")[0]],
						[n.split(",")[1]],
						[j, H, C, W]
					], s = ["bball", "gball", "rball", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "span",
					classname: s[o]
				};
				t[4] = {
					num: [y],
					type: "td",
					classname: "rbg"
				};
				break;
			case "1105r5-trend_hezhiShuJuA":
			case "1205r5-trend_hezhiShuJuA":
				var E = 11; - 1 < e.indexOf("1205") && (E = 12), I = [];
				var K = [3, 3, 3],
					Q = [3, 3, 3],
					T = [3, 3, 3],
					X = [3, 3, 3],
					q = [8, 8, 8, 8, 8, 8, 8, 8],
					L = [2, 2, 2, 2],
					P = [2, 2, 2, 2];
				for (o = h = 0; o < n.split(",").length; o++) I[o] = n.split(",")[o], h += parseInt(n.split(
					",")[o]);
				I = common.sortArr(I), K[h % 3] = h % 3, Q[h % 10 % 3] = h % 10 % 3, I[0] % 2 == 1 ? L[0] = 0 :
					L[1] = 1;
				var R = [1, 2, 3, 5, 7, 11],
					U = 0,
					V = 0;
				for (o = 0; o < R.length; o++) R[o] == parseInt(I[0]) && U++, R[o] == parseInt(I[I.length -
					1]) && V++;
				for (0 < U ? L[2] = 0 : L[3] = 1, I[I.length - 1] % 2 == 1 ? P[0] = 0 : P[1] = 1, 0 < V ? P[2] =
					0 : P[3] = 1, T[I[0] % 3] = I[0] % 3, X[I[I.length - 1] % 3] = I[I.length - 1] % 3, d = [],
					_ = 0; _ < E - 1; _++) d[_] = 0;
				for (o = I.length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--)
						for (_ = 1; _ < E; _++) I[o] - I[u] == _ && d[_ - 1]++;
				var Y = 0;
				for (o = 0; o < d.length; o++) 0 < d[o] && Y++;
				for (q[Y - 4] = Y - 4, r = [K, Q, L, P, T, X, q], s = ["gbg", "rbg", "gbg", "lbg", "gbg", "rbg",
						"gbg"
					], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_hezhiZouShiA":
			case "1205r5-trend_hezhiZouShiA":
			case "ssca3-trend_hezhiZouShiA":
			case "sscp3-trend_hezhiZouShiA":
			case "3dr3-trend_hezhiZouShiA":
			case "plsr3-trend_hezhiZouShiA":
			case "hasha3-trend_hezhiZouShiA":
			case "sscs4-trend_hezhiZouShiA":
				for (o = h = 0; o < n.split(",").length; o++) h += parseInt(n.split(",")[o]);
				for (r = [h, h], s = ["rbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_hezhiFenBuA":
			case "1205r5-trend_hezhiFenBuA":
			case "ssca3-trend_heheZouShi":
			case "sscp3-trend_heheZouShi":
			case "3dr3-trend_heheZouShi":
			case "plsr3-trend_heheZouShi":
			case "hasha3-trend_heheZouShi":
				for (l = [common.getIntNum(0, 9), common.getIntNum(10, 18), common.getIntNum(19, 27)], -1 < e
					.indexOf("1105r5") ? l = [common.getIntNum(15, 20), common.getIntNum(21, 26), common
						.getIntNum(27, 33), common.getIntNum(34, 39), common.getIntNum(40, 45)
					] : -1 < e.indexOf("1205r5") && (l = [common.getIntNum(15, 21), common.getIntNum(22, 28),
						common.getIntNum(29, 36), common.getIntNum(37, 43), common.getIntNum(44, 50)
					]), o = h = 0; o < n.split(",").length; o++) h += parseInt(n.split(",")[o]);
				for (b = h % 10, o = d = 0; o < l.length; o++)
					for (_ = 0; _ < l[o].length; _++) h == l[o][_] && (d = o);
				for (r = [d, b], s = ["gbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca2-trend_heheZouShi":
			case "sscp2-trend_heheZouShi":
			case "k3r3-trend_heheFenBu":
				for (l = [common.getIntNum(0, 6), common.getIntNum(7, 12), common.getIntNum(13, 18)], o = h =
					0; o < n.split(",").length; o++) h += parseInt(n.split(",")[o]);
				for (b = h % 10, o = d = 0; o < l.length; o++)
					for (_ = 0; _ < l[o].length; _++) h == l[o][_] && (d = o);
				for (r = [h, h, b, d], s = ["rbg", "gbg", "rbg", "lbg"], -1 < e.indexOf("k3r3") && (r = [h, b],
						s = ["gbg", "rbg"]), o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca2-trend_chazhiZouShi":
			case "sscp2-trend_chazhiZouShi":
				for (I = n.split(","), o = h = 0; o < I.length; o++) h += parseInt(I[o]);
				for (r = [h, parseInt(I[0]) > parseInt(I[1]) ? parseInt(I[0]) - parseInt(I[1]) : parseInt(I[
						1]) - parseInt(I[0])], s = ["gbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a3-trend_heheZouShi":
			case "1205a3-trend_heheZouShi":
				for (o = h = 0; o < n.split(",").length; o++) h += parseInt(n.split(",")[o]);
				for (r = [h, h, b = h % 10], s = ["rbg", "gbg", "rbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break
			case "animalsa2-trend_hezhikuadu":
			case "animalsa3-trend_hezhikuadu":
			case "animalsp2-trend_hezhikuadu":
			case "animalsp3-trend_hezhikuadu":
			case "animalsq1a2-trend_hezhikuadu":
			case "animalsq1a3-trend_hezhikuadu":
			case "animalsq1p2-trend_hezhikuadu":
			case "animalsq1p3-trend_hezhikuadu":
			case "animalsq2a2-trend_hezhikuadu":
			case "animalsq2a3-trend_hezhikuadu":
			case "animalsq2p2-trend_hezhikuadu":
			case "animalsq2p3-trend_hezhikuadu":
			case "animalsq3a2-trend_hezhikuadu":
			case "animalsq3a3-trend_hezhikuadu":
			case "animalsq3p2-trend_hezhikuadu":
			case "animalsq3p3-trend_hezhikuadu":
			case "animalsq4a2-trend_hezhikuadu":
			case "animalsq4a3-trend_hezhikuadu":
			case "animalsq4p2-trend_hezhikuadu":
			case "animalsq4p3-trend_hezhikuadu":
			case "animalsq5a2-trend_hezhikuadu":
			case "animalsq5a3-trend_hezhikuadu":
			case "animalsq5p2-trend_hezhikuadu":
			case "animalsq5p3-trend_hezhikuadu":
			case "animalsq6a2-trend_hezhikuadu":
			case "animalsq6a3-trend_hezhikuadu":
			case "animalsq6p2-trend_hezhikuadu":
			case "animalsq6p3-trend_hezhikuadu":
			case "animalsq7a2-trend_hezhikuadu":
			case "animalsq7a3-trend_hezhikuadu":
			case "animalsq7p2-trend_hezhikuadu":
			case "animalsq7p3-trend_hezhikuadu":
			case "animalsq8a2-trend_hezhikuadu":
			case "animalsq8a3-trend_hezhikuadu":
			case "animalsq8p2-trend_hezhikuadu":
			case "animalsq8p3-trend_hezhikuadu":
			case "animalsq9a2-trend_hezhikuadu":
			case "animalsq9a3-trend_hezhikuadu":
			case "animalsq9p2-trend_hezhikuadu":
			case "animalsq9p3-trend_hezhikuadu":
			case "animalsq0a2-trend_hezhikuadu":
			case "animalsq0a3-trend_hezhikuadu":
			case "animalsq0p2-trend_hezhikuadu":
			case "animalsq0p3-trend_hezhikuadu":
				var openNumber = n.split(",");
				var h = 0
				for (let i = 0; i < openNumber.length; i++) {
					h += parseInt(openNumber[i]);
				}
				var num = common.sortArr(openNumber)
				var kuadu = 0
				var end = obj.play_id.substring(obj.play_id.length - 1, obj.play_id.length)
				if (end == 2) {
					kuadu = parseInt(num[1]) - parseInt(num[0])
				} else {
					kuadu = parseInt(num[2]) - parseInt(num[0])
				}
				let val = [h, h, h % 10, kuadu];
				let className = ["rbg", "gbg", "rbg", "lbg"];
				for (i = 0; i < val.length; i++) {
					t[i] = {
						num: [val[i]],
						type: "td",
						classname: className[i]
					}
				};
				break;
			case "animalsa2-trend_dingweizoushi":
			case "animalsa3-trend_dingweizoushi":
			case "animalsp2-trend_dingweizoushi":
			case "animalsp3-trend_dingweizoushi":
			case "animalsq1a2-trend_dingweizoushi":
			case "animalsq1a3-trend_dingweizoushi":
			case "animalsq1p2-trend_dingweizoushi":
			case "animalsq1p3-trend_dingweizoushi":
			case "animalsq2a2-trend_dingweizoushi":
			case "animalsq2a3-trend_dingweizoushi":
			case "animalsq2p2-trend_dingweizoushi":
			case "animalsq2p3-trend_dingweizoushi":
			case "animalsq3a2-trend_dingweizoushi":
			case "animalsq3a3-trend_dingweizoushi":
			case "animalsq3p2-trend_dingweizoushi":
			case "animalsq3p3-trend_dingweizoushi":
			case "animalsq4a2-trend_dingweizoushi":
			case "animalsq4a3-trend_dingweizoushi":
			case "animalsq4p2-trend_dingweizoushi":
			case "animalsq4p3-trend_dingweizoushi":
			case "animalsq5a2-trend_dingweizoushi":
			case "animalsq5a3-trend_dingweizoushi":
			case "animalsq5p2-trend_dingweizoushi":
			case "animalsq5p3-trend_dingweizoushi":
			case "animalsq6a2-trend_dingweizoushi":
			case "animalsq6a3-trend_dingweizoushi":
			case "animalsq6p2-trend_dingweizoushi":
			case "animalsq6p3-trend_dingweizoushi":
			case "animalsq7a2-trend_dingweizoushi":
			case "animalsq7a3-trend_dingweizoushi":
			case "animalsq7p2-trend_dingweizoushi":
			case "animalsq7p3-trend_dingweizoushi":
			case "animalsq8a2-trend_dingweizoushi":
			case "animalsq8a3-trend_dingweizoushi":
			case "animalsq8p2-trend_dingweizoushi":
			case "animalsq8p3-trend_dingweizoushi":
			case "animalsq9a2-trend_dingweizoushi":
			case "animalsq9a3-trend_dingweizoushi":
			case "animalsq9p2-trend_dingweizoushi":
			case "animalsq9p3-trend_dingweizoushi":
			case "animalsq0a2-trend_dingweizoushi":
			case "animalsq0a3-trend_dingweizoushi":
			case "animalsq0p2-trend_dingweizoushi":
			case "animalsq0p3-trend_dingweizoushi":
				openNumber = n.split(",");
				nums = [];
				for (let i = 0; i < openNumber.length; i++) {
					nums.push(parseInt(openNumber[i]));
				}
				let classn = ["rball_s", "bball_s", "gball_s"];
				for (i = 0; i < nums.length; i++) {
					t[i] = {
						num: [nums[i]],
						type: "td",
						classname: classn[i]
					}
				};
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
				openNumber = n.split(",");
				nums = [];
				ze = [3, 6, 1, 4, 2, 5];
				let yw = [3, 6],
					ew = [1, 4],
					sw = [2, 5],
					f1 = 0,
					f2 = 0,
					f3 = 0;
				for (let i = 0; i < openNumber.length; i++) {
					for (let j = 0; j < ze.length; j++) {
						if (ze[j] == parseInt(openNumber[i])) {
							nums.push(parseInt(openNumber[i]));
						}
					}
					for (let j = 0; j < yw.length; j++) {
						if (openNumber[i] == yw[j]) {
							f1++
						}
						if (openNumber[i] == ew[j]) {
							f2++
						}
						if (openNumber[i] == sw[j]) {
							f3++
						}
					}
				}
				classs = ["bball_s", "gbg", "rbg", "lbg"];
				vals = [nums,
					[f1],
					[f2],
					[f3]
				];
				for (i = 0; i < vals.length; i++) {
					t[i] = {
						num: vals[i],
						type: "td",
						classname: classs[i]
					}
				};
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
				openNumber = common.sortArr(n.split(","))
				flagCha = [];
				flagHe = [];
				flagHeB = [];
				for (let i = openNumber.length - 1; i > 0; i--) {
					for (let j = i - 1; j > -1; j--) {
						flagCha.push(parseInt(openNumber[i]) - parseInt(openNumber[j]));
						flagHe.push(parseInt(openNumber[i]) + parseInt(openNumber[j]));
						flagHeB.push((parseInt(openNumber[i]) + parseInt(openNumber[j])) % 10);
					}
				}
				arrs = [
					common.removeAgain(flagHe),
					common.removeAgain(flagHeB),
					common.removeAgain(flagCha)
				]
				classhc = ["gbg", "lbg", "rbg"];
				for (i = 0; i < arrs.length; i++) {
					t[i] = {
						num: arrs[i],
						type: "td",
						classname: classhc[i]
					}
				};
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
				te = common.sortArr(a[a.length - 2].split(","));
				var oe = 0,
					ge = 0,
					ie = 0;
				for (o = (g = common.sortArr(n.split(","))).length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--)
						if (g[o] - g[u] == 1) {
							1 == ++oe ? g[o] - g[u] == 1 && ge++ : 1 < oe && g[o + 1] - g[u + 1] != 1 && ge++;
							break
						} for (O = [], o = d = 0; o < g.length; o++)
					for (u = 0; u < te.length; u++)
						if (parseInt(g[o]) == parseInt(te[u])) {
							ie++;
							break
						} for (r = [oe, ie], s = ["gbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r3-trend_hezhizoushiB":
			case "1205r3-trend_hezhizoushiB":
			case "1105r5-trend_sanmaHeZhiB":
			case "1205r5-trend_sanmaHeZhiB":
				for (h = [], o = (O = common.sortArr(n.split(","))).length - 1; 1 < o; o--)
					for (u = o - 1; 0 < u; u--)
						for (D = u - 1; - 1 < D; D--) h.push((parseInt(O[o]) + parseInt(O[u]) + parseInt(O[
							D])) % 10);
				for (r = [f = common.removeAgain(h), common.getAgain(h)], s = ["gbg", "rbg"], o = 0; o < r
					.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_chazhiKuaDu":
			case "1205r5-trend_chazhiKuaDu":
			case "ssca3-trend_chakuaZouShi":
			case "sscp3-trend_chakuaZouShi":
			case "3dr3-trend_chakuaZouShi":
			case "plsr3-trend_chakuaZouShi":
			case "hasha3-trend_chakuaZouShi":
				for (h = [], d = 0, o = (O = common.sortArr(n.split(","))).length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--) h[d] = parseInt(O[o]) - parseInt(O[u]), d++;
				for (r = [f = common.sortArr(common.removeAgain(h)), common.getAgain(h), [parseInt(O[O.length -
						1]) - parseInt(O[0])]], s = ["gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "k3r3-trend_chaheZouShi":
				h = [];
				var ee = [];
				for (d = 0, o = (O = common.sortArr(n.split(","))).length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--) h[d] = parseInt(O[o]) - parseInt(O[u]), ee[d] = (parseInt(O[
						o]) + parseInt(O[u])) % 10, d++;
				for (r = [f = common.sortArr(common.removeAgain(ee)), common.sortArr(common.removeAgain(h))],
					s = ["gbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a2-trend_hekuaZouShi":
			case "1205a2-trend_hekuaZouShi":
				for (O = common.sortArr(n.split(",")), r = [f = parseInt(O[0]) + parseInt(O[1]), le = (parseInt(
						O[0]) + parseInt(O[1])) % 10, parseInt(O[1]) - parseInt(O[0])], s = ["gbg", "rbg",
						"lbg"
					], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a2-trend_haomaShuXing":
			case "1205a2-trend_haomaShuXing":
				g = n.split(","), O = common.sortArr(n.split(","));
				var ne = [],
					ae = [2, 4, 6, 8, 10, 12];
				for (y = [4, 6, 8, 9, 10, 12], o = 0; o < 7; o++) ne[o] = 0;
				for (o = 0; o < O.length; o++)
					for (-1 < e.indexOf("1105") ? parseInt(O[o]) < 6 && ne[0]++ : parseInt(O[o]) <= 6 && ne[
							0]++, _ = 0; _ < ae.length; _++) ae[_] == parseInt(O[o]) && ne[1]++, y[_] ==
						parseInt(O[
							o]) && ne[2]++;
				for (0 == ne[0] ? ne[3] = 2 : 2 == ne[0] ? ne[3] = 3 : parseInt(g[0]) > parseInt(g[1]) ? ne[3] =
					0 : parseInt(g[1]) > parseInt(g[0]) && (ne[3] = 1), 0 == ne[1] ? ne[4] = 2 : 2 == ne[1] ?
					ne[4] = 3 : parseInt(g[0]) % 2 == 0 ? ne[4] = 1 : parseInt(g[0]) % 2 == 1 && (ne[4] = 0),
					0 == ne[2] ? ne[5] = 2 : 2 == ne[2] ? ne[5] = 3 : -1 < y.indexOf(parseInt(g[0])) ? ne[5] =
					1 : -1 < y.indexOf(parseInt(g[1])) && (ne[5] = 0), parseInt(g[0]) > parseInt(g[1]) ? ne[6] =
					1 : parseInt(g[0]) < parseInt(g[1]) && (ne[6] = 0), ne[0] = 2 - ne[0], ne[1] = 2 - ne[1],
					ne[2] = 2 - ne[2], s = ["gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "rbg"], o = 0; o < ne
					.length; o++) t[o] = {
					num: [ne[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a2-trend_tongweiZhenFu":
			case "1205a2-trend_tongweiZhenFu":
				h = [], d = 0;
				var te = common.cutOutNumber(a[a.length - 2], e.split("-")[0]).split(","),
					re = (g = n.split(","), 0),
					se = 0;
				for (r = [re = parseInt(te[0]) > parseInt(g[0]) ? parseInt(te[0]) - parseInt(g[0]) : parseInt(g[
							0]) - parseInt(te[0]), se = parseInt(te[1]) > parseInt(g[1]) ? parseInt(te[1]) -
						parseInt(g[1]) : parseInt(g[1]) - parseInt(te[1])
					], s = ["rbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_lianhaoChongMa":
			case "1205r5-trend_lianhaoChongMa":
				te = common.sortArr(a[a.length - 2].split(","));
				var oe = 0,
					ge = 0,
					ie = 0;
				for (o = (g = common.sortArr(n.split(","))).length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--)
						if (g[o] - g[u] == 1) {
							1 == ++oe ? g[o] - g[u] == 1 && ge++ : 1 < oe && g[o + 1] - g[u + 1] != 1 && ge++;
							break
						} for (O = [], o = d = 0; o < g.length; o++)
					for (u = 0; u < te.length; u++)
						if (parseInt(g[o]) == parseInt(te[u])) {
							ie++;
							break
						} for (r = [oe, ge, ie], s = ["gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_heheFenBu":
			case "1205r5-trend_heheFenBu":
				for (g = common.sortArr(n.split(",")), f = new Array, o = g.length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--) f.push(parseInt(g[o]) + parseInt(g[u]));
				var le = new Array;
				for (o = 0; o < f.length; o++) le.push(f[o] % 10);
				for (ie = common.getAgain(le), le = common.removeAgain(le), r = [f = common.removeAgain(f), le,
						ie
					], s = ["rbg", "lbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_heheFenBu":
			case "sscp3-trend_heheFenBu":
			case "plsr3-trend_heheFenBu":
			case "hasha3-trend_heheFenBu":
			case "3dr3-trend_heheFenBu":
				for (g = common.sortArr(n.split(",")), f = new Array, o = g.length - 1; 0 < o; o--)
					for (u = o - 1; - 1 < u; u--) f.push(parseInt(g[o]) + parseInt(g[u]));
				for (le = new Array, o = 0; o < f.length; o++) le.push(f[o] % 10);
				for (le = common.removeAgain(le), r = [f = common.removeAgain(f), le], s = ["rbg", "gbg"], o =
					0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_tiaoweiHeZhiB":
			case "1205r5-trend_tiaoweiHeZhiB":
				g = common.sortArr(n.split(",")), B = [];
				var ce = (parseInt(g[2]) + parseInt(g[0])) % 10,
					me = (parseInt(g[3]) + parseInt(g[1])) % 10,
					pe = (parseInt(g[4]) + parseInt(g[2])) % 10;
				for (B[0] = ce, B[1] = me, B[2] = pe, ce = (B = common.sortArr(B))[0], me = B[1], pe = B[2], B =
					common.sortArr(B), r = [B = common.removeAgain(B), [ce],
						[me],
						[pe]
					], s = ["lbg", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_tiaoweiChaZhi":
			case "1205r5-trend_tiaoweiChaZhi":
				for (g = common.sortArr(n.split(",")), B = [], ce = (parseInt(g[2]) - parseInt(g[0])) % 10, me =
					(parseInt(g[3]) - parseInt(g[1])) % 10, pe = (parseInt(g[4]) - parseInt(g[2])) % 10, B[0] =
					ce, B[1] = me, B[2] = pe, ce = (B = common.sortArr(B))[0], me = B[1], pe = B[2], B = common
					.sortArr(B), r = [B = common.removeAgain(B), [ce],
						[me],
						[pe]
					], s = ["lbg", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_junhengFenBu":
				g = common.sortArr(n.split(","));
				var ue = 0,
					he = 1,
					de = 0,
					be = 0,
					_e = 0,
					fe = 0,
					Ie = 0,
					ke = [];
				for (o = 0; o < g.length; o++) parseInt(g[o]) < 6 ? de++ : 6 == parseInt(g[o]) ? he = 0 : ue++,
					6 <= parseInt(g[o]) && parseInt(g[o]) + 1 == parseInt(g[o + 1]) && be++, parseInt(g[o +
						1]) <= 6 && parseInt(g[o + 1]) == parseInt(g[o]) + 1 && _e++;
				var Se = [5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5];
				for (o = 0; o < Se.length; o++) o < 5 && Se[o] == de && ke.push(o), 5 == o && Se[o] == he && ke
					.push(o), 5 < o && Se[o] == ue && ke.push(o);
				for (r = [
						[fe = ue < de ? 0 : de < ue ? 2 : 1],
						[(Ie = be < _e ? 0 : _e < be ? 2 : 1) != fe ? 3 : fe],
						[Ie], ke
					], s = ["gbg", "rbg", "lbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_chazhiGeShu":
			case "1205r5-trend_chazhiGeShu":
			case "ssca3-trend_chazhiGeShu":
			case "sscp3-trend_chazhiGeShu":
			case "3dr3-trend_chazhiGeShu":
			case "plsr3-trend_chazhiGeShu":
			case "hasha3-trend_chazhiGeShu":
			case "sscs4-trend_chazhiGeShu":
				g = common.sortArr(n.split(","));
				var Ze = 10,
					xe = new Array;
				for (s = ["gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg"], -1 < e.indexOf(
						"1205r5") && (Ze = 11, s = ["gbg", "rbg", "lbg", "gbg", "rbg", "lbg", "gbg", "rbg",
						"lbg", "gbg", "rbg"
					]), o = 0; o < Ze; o++) xe[o] = 0;
				if (-1 < e.indexOf("1205r5") || -1 < e.indexOf("1105r5"))
					for (o = g.length - 1; 0 < o; o--)
						for (u = o - 1; - 1 < u; u--) xe[(Se = parseInt(g[o]) - parseInt(g[u])) - 1]++;
				else
					for (o = g.length - 1; 0 < o; o--)
						for (u = o - 1; - 1 < u; u--) xe[Se = parseInt(g[o]) - parseInt(g[u])]++;
				for (o = 0; o < xe.length; o++) t[o] = {
					num: [xe[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_sanmaHeZhiA":
			case "1205r5-trend_sanmaHeZhiA":
				for (g = common.sortArr(n.split(",")), f = new Array, o = g.length - 1; 1 < o; o--)
					for (u = o - 1; 0 < u; u--)
						for (var ve = u - 1; - 1 < ve; ve--) f.push(parseInt(g[o]) + parseInt(g[u]) + parseInt(
							g[ve]));
				for (f = common.removeAgain(f), o = 0; o < f.length; o++) t[o] = {
					num: f,
					type: "td",
					classname: "gbg"
				};
				break;
			case "1105r5-trend_sanmaChaHe":
			case "1205r5-trend_sanmaChaHe":
				for (g = common.sortArr(n.split(",")), f = new Array, o = g.length - 1; 1 < o; o--)
					for (u = o - 1; 0 < u; u--)
						for (ve = u - 1; - 1 < ve; ve--) {
							var ye = parseInt(g[o]) - parseInt(g[u]),
								Oe = parseInt(g[o]) - parseInt(g[ve]),
								Ae = parseInt(g[u]) - parseInt(g[ve]);
							f.push(ye + Oe + Ae)
						}
				var Ge = new Array;
				for (o = 0; o < f.length; o++) Ge[o] = f[o] % 10;
				for (s = ["lbg", "rbg", "gbg"], r = [f = common.removeAgain(f), common.removeAgain(Ge), common
						.getAgain(Ge)
					], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_012luFenBu":
			case "1205r5-trend_012luFenBu":
			case "1205a3-trend_012luGeShu":
			case "1105a3-trend_012luGeShu":
				g = common.sortArr(n.split(","));
				var ze = ["03", "06", "09", "12", "01", "04", "07", "10", "02", "05", "08", "11"],
					Fe = [3, 6, 9, 12],
					we = 0,
					Be = (re = [1, 4, 7, 10], 0);
				for (se = [2, 5, 8, 11], $ = 0, I = new Array, o = 0; o < g.length; o++) {
					for (u = 0; u < ze.length; u++)
						if (g[o] == ze[u]) {
							I.push(g[o]);
							break
						}
					for (D = 0; D < Fe.length; D++) parseInt(g[o]) == Fe[D] && we++, parseInt(g[o]) == re[
						D] && Be++, parseInt(g[o]) == se[D] && $++
				}
				for (s = ["bball", "gbg", "rbg", "lbg"], r = [I, [we],
						[Be],
						[$]
					], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_chazhiErFenBu":
			case "1205r5-trend_chazhiErFenBu":
				for (g = common.sortArr(n.split(",")), xe = new Array, d = 0, o = g.length - 1; 0 < o; o--)
					for (D = o - 1; - 1 < D; D--) parseInt(g[o]) - parseInt(g[D]) == 2 && (xe.push(g[D] + "-" +
						g[o]), d++);
				for (s = ["rbg", "gbg"], r = [xe, [d]], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_chazhiSanFenBu":
			case "1205r5-trend_chazhiSanFenBu":
				for (g = common.sortArr(n.split(",")), xe = new Array, d = 0, o = g.length - 1; 0 < o; o--)
					for (D = o - 1; - 1 < D; D--) parseInt(g[o]) - parseInt(g[D]) == 3 && (xe.push(g[D] + "-" +
						g[o]), d++);
				for (s = ["rbg", "gbg"], r = [xe, [d]], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_chazhiSiFenBu":
			case "1205r5-trend_chazhiSiFenBu":
				for (g = common.sortArr(n.split(",")), xe = new Array, d = 0, o = g.length - 1; 0 < o; o--)
					for (D = o - 1; - 1 < D; D--) parseInt(g[o]) - parseInt(g[D]) == 4 && (xe.push(g[D] + "-" +
						g[o]), d++);
				for (s = ["rbg", "gbg"], r = [xe, [d]], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_chazhiWuFenBu":
			case "1205r5-trend_chazhiWuFenBu":
				for (g = common.sortArr(n.split(",")), xe = new Array, d = 0, o = g.length - 1; 0 < o; o--)
					for (D = o - 1; - 1 < D; D--) parseInt(g[o]) - parseInt(g[D]) == 5 && (xe.push(g[D] + "-" +
						g[o]), d++);
				for (s = ["rbg", "gbg"], r = [xe, [d]], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105r5-trend_kaijiangweizhiFenBu":
			case "1205r5-trend_kaijiangweizhiFenBu":
				for (s = ["gball", "rball", "bball", "rball", "gball"], r = [(g = common.sortArr(n.split(",")))[
						0], g[1], g[2], g[3], g[4]], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "span",
					classname: s[o]
				};
				break;
			case "1105a3-trend_hezhiQuJian":
			case "1205a3-trend_hezhiQuJian":
				for (g = common.sortArr(n.split(",")), o = f = 0; o < g.length; o++) f += parseInt(g[o]);
				var Ne = [common.getIntNum(6, 10), common.getIntNum(11, 15), common.getIntNum(16, 20), common
					.getIntNum(21, 25), common.getIntNum(26, 30)
				]; - 1 < e.indexOf("1205a3") && (Ne = [common.getIntNum(6, 12), common.getIntNum(13, 19), common
					.getIntNum(20, 26), common.getIntNum(27, 33)
				]);
				var je = 0;
				for (o = 0; o < Ne.length; o++)
					for (u = 0; u < Ne[o].length; u++) Ne[o][u] == f && (je = o);
				var He = [0, 1, 2, 3, 4],
					We = [0, 2, 4, 6, 8],
					Ce = (y = [0, 4, 6, 8, 9], 0),
					$e = 0,
					Je = 0;
				for (o = 0; o < He.length; o++) He[o] == f % 10 && (Ce = 1), We[o] == f % 10 && ($e = 1), y[
					o] == f % 10 && (Je = 1);
				for (r = [f, je, Ce, $e, Je], s = ["rbg", "gbg", "lbg", "gbg", "rbg"], o = 0; o < r.length; o++)
					t[o] = {
						num: [r[o]],
						type: "span",
						classname: s[o]
					};
				break;
			case "1105a3-trend_kuaduZouShi":
			case "1205a3-trend_kuaduZouShi":
				for (g = common.sortArr(n.split(",")), f = parseInt(g[g.length - 1]) - parseInt(g[0]), He = [1,
						2, 3, 4, 5
					], -1 < e.indexOf("1205a3") && (He = [2, 3, 4, 5, 6]), We = [2, 4, 6, 8, 10], y = [4, 6, 8,
						9, 10
					], o = Je = $e = Ce = 0; o < He.length; o++) He[o] == f % 10 && (Ce = 1), We[o] == f % 10 &&
					($e = 1), y[o] == f % 10 && (Je = 1);
				for (r = [f, Ce, $e, Je], s = ["rbg", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "span",
					classname: s[o]
				};
				break;
			case "1105a3-trend_shuxingZouShi":
			case "1205a3-trend_shuxingZouShi":
				g = n.split(",");
				var Me = 6; - 1 < e.indexOf("1205a3") && (Me = 7);
				var De = [1, 3, 5, 7, 9, 11],
					Ee = [1, 2, 3, 5, 7, 11];
				for (Ce = [], $e = [], Je = [], d = ["0,0,0", "0,0,1", "0,1,0", "1,0,0", "1,1,1", "1,1,0",
						"1,0,1", "0,1,1"
					], o = 0; o < g.length; o++) Me > parseInt(g[o]) ? Ce[o] = 1 : Ce[o] = 0, -1 < De.indexOf(
						parseInt(g[o])) ? $e[o] = 0 : $e[o] = 1, -1 < Ee.indexOf(parseInt(g[o])) ? Je[o] = 0 :
					Je[o] = 1;
				var Ke = 0,
					Qe = 0,
					Te = 0;
				for (o = 0; o < d.length; o++) {
					var Xe = 0,
						qe = 0,
						Le = 0;
					for (u = 0; u < d[o].split(",").length; u++) Ce[u] == parseInt(d[o].split(",")[u]) && Xe++,
						$e[u] == parseInt(d[o].split(",")[u]) && qe++, Je[u] == parseInt(d[o].split(",")[u]) &&
						Le++;
					3 == Xe && (Ke = o), 3 == qe && (Qe = o), 3 == Le && (Te = o)
				}
				for (r = [Ke, Qe, Te], s = ["gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a3-trend_tongweiZhenFu":
			case "1205a3-trend_tongweiZhenFu":
				g = n.split(","), te = a[a.length - 2].split(",");
				var Pe = [];
				for (o = 0; o < g.length; o++) {
					var Re = 0;
					Re = parseInt(te[o]) > parseInt(g[o]) ? parseInt(te[o]) - parseInt(g[o]) : parseInt(g[o]) -
						parseInt(te[o]), Pe[o] = Re
				}
				for (s = ["gbg", "rbg", "lbg"], o = 0; o < Pe.length; o++) t[o] = {
					num: [Pe[o]],
					type: "span",
					classname: s[o]
				};
				break;
			case "1105a3-trend_xingtaiZouShi":
			case "1205a3-trend_xingtaiZouShi":
				g = n.split(","), te = common.cutOutNumber(a[a.length - 2], e.split("-")[0]).split(",");
				var Ue = 0;
				parseInt(g[0]) > parseInt(g[1]) && parseInt(g[1]) > parseInt(g[2]) ? Ue = 1 : parseInt(g[0]) <
					parseInt(g[1]) && parseInt(g[1]) < parseInt(g[2]) ? Ue = 0 : parseInt(g[0]) > parseInt(g[
						1]) && parseInt(g[1]) < parseInt(g[2]) ? Ue = 2 : parseInt(g[0]) < parseInt(g[1]) &&
					parseInt(g[1]) > parseInt(g[2]) && (Ue = 3), He = [0, 1, 2, 3, 4, 5], -1 < e.indexOf(
						"1205a3") && (He = [1, 2, 3, 4, 5, 6]), De = [1, 3, 5, 7, 9, 11], Ee = [1, 2, 3, 5, 7,
						11
					];
				var Ve = 0,
					Ye = 0,
					en = 0;
				for (o = 0; o < g.length; o++) - 1 < He.indexOf(parseInt(g[o])) && Ve++, De.indexOf(parseInt(g[
					o])) < 0 && Ye++, Ee.indexOf(parseInt(g[o])) < 0 && en++;
				re = new Array, se = new Array;
				var nn = new Array;
				for (u = 0; u < g.length; u++) parseInt(g[u]) == parseInt(te[0]) - 1 ? re.push(0) : parseInt(g[
						u]) == parseInt(te[0]) + 1 && re.push(2), parseInt(g[u]) == parseInt(te[1]) - 1 ? se
					.push(0) : parseInt(g[u]) == parseInt(te[1]) + 1 && se.push(2), parseInt(g[u]) == parseInt(
						te[2]) - 1 ? nn.push(0) : parseInt(g[u]) == parseInt(te[2]) + 1 && nn.push(2);
				for (0 == re.length && re.push(1), 0 == se.length && se.push(1), 0 == nn.length && nn.push(1),
					B = [], N = [], o = 0; o < n.split(",").length; o++) B[o] = a[a.length - 3].split(",")[o],
					N[o] = a[a.length - 2].split(",")[o];
				for (I = common.sortArr(n.split(",")), C = W = H = j = "", parseInt(I[1]) - 1 != parseInt(I[
						0]) && parseInt(I[2]) - 1 != parseInt(I[1]) || (j = language(common.cookieGet(
							"language"),
						"conditions_lianhao")), o = M = J = $ = 0; o < I.length; o++) {
					var an = 0;
					for (_ = 0; _ < N.length; _++) parseInt(I[o]) != parseInt(N[_]) + 1 && parseInt(I[o]) !=
						parseInt(N[_]) - 1 || $++, parseInt(I[o]) == parseInt(N[_]) && J++, parseInt(I[o]) ==
						parseInt(N[_]) && an++;
					if (0 == an)
						for (D = 0; D < B.length; D++) parseInt(I[o]) == parseInt(B[D]) && M++
				}
				for (0 < $ && (H = language(common.cookieGet("language"), "conditions_chuanhao")), 0 < J && (W =
						language(common.cookieGet("language"), "conditions_chongma")), 0 < M && (C = language(
						common.cookieGet("language"), "conditions_tiaoma")), r = [
						[Ue],
						[Ve],
						[Ye],
						[en], re, se, nn, [j, H, C, W]
					], s = ["rbg", "gbg", "rbg", "lbg", "rbg", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++)
					t[o] = {
						num: r[o],
						type: "td",
						classname: s[o]
					};
				break;
			case "1105a3-trend_liangmaHeZouShiB":
			case "1205a3-trend_liangmaHeZouShiB":
				for (g = n.split(","), f = [tn = (parseInt(g[0]) + parseInt(g[1])) % 10, rn = (parseInt(g[0]) +
						parseInt(g[2])) % 10, sn = (parseInt(g[1]) + parseInt(g[2])) % 10], r = [f = common
						.removeAgain(f), [tn],
						[rn],
						[sn]
					], s = ["lbg", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "1105a3-trend_liangmaChaZouShi":
			case "1205a3-trend_liangmaChaZouShi":
				g = n.split(",");
				var tn = "",
					rn = parseInt(g[2]) - parseInt(g[0]),
					sn = parseInt(g[2]) - parseInt(g[1]);
				for (f = [tn = parseInt(g[1]) > parseInt(g[0]) ? parseInt(g[1]) - parseInt(g[0]) : parseInt(g[
							0]) - parseInt(g[1]), rn = parseInt(g[2]) > parseInt(g[0]) ? parseInt(g[2]) -
						parseInt(g[0]) : parseInt(g[0]) - parseInt(g[2]), sn = parseInt(g[2]) > parseInt(g[1]) ?
						parseInt(g[2]) - parseInt(g[1]) : parseInt(g[1]) - parseInt(g[2])
					], r = [f = common.removeAgain(f), [tn],
						[rn],
						[sn]
					], s = ["lbg", "gbg", "rbg", "lbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca2-trend_longtouFengWei":
			case "sscp2-trend_longtouFengWei":
			case "ssca3-trend_longtouFengWei":
			case "sscp3-trend_longtouFengWei":
			case "plsr3-trend_longtouFengWei":
			case "hasha3-trend_longtouFengWei":
			case "3dr3-trend_longtouFengWei":
			case "sscs4-trend_longtouFengWei":
				g = n.split(",");
				var on = [language(common.cookieGet("language"), "conditions_shuang"), language(common
						.cookieGet("language"), "conditions_he"), language(common.cookieGet("language"),
						"conditions_da")],
					gn = [language(common.cookieGet("language"), "conditions_shuang"), language(common
						.cookieGet("language"), "conditions_he"), language(common.cookieGet("language"),
						"conditions_da")];
				for (He = [0, 1, 2, 3, 4], De = [1, 3, 5, 7, 9], Ee = [1, 2, 3, 5, 7], o = 0; o < He
					.length; o++) parseInt(g[0]) == De[o] && (on[0] = language(common.cookieGet("language"),
						"conditions_dan")), parseInt(g[0]) == Ee[o] && (on[1] = language(common.cookieGet(
						"language"), "conditions_zhi")), parseInt(g[0]) == He[o] && (on[2] = language(common
						.cookieGet("language"), "conditions_xiao")), parseInt(g[g.length - 1]) == De[o] && (gn[
						0] = language(common.cookieGet("language"), "conditions_dan")), parseInt(g[g.length -
						1]) == Ee[o] && (gn[1] = language(common.cookieGet("language"), "conditions_zhi")),
					parseInt(g[g.length - 1]) == He[o] && (gn[2] = language(common.cookieGet("language"),
						"conditions_xiao"));
				for (r = [on, gn, [parseInt(g[0]) % 3],
						[parseInt(g[g.length - 1]) % 3]
					], s = ["gbg", "lbg", "gbg", "rbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca2-trend_012luZouShi":
			case "sscp2-trend_012luZouShi":
				for (g = n.split(","), i = [0, 3, 6, 9, 1, 4, 7, 2, 5, 8], l = [], o = p = m = c = 0; o < g
					.length; o++) {
					for (u = 0; u < i.length; u++) parseInt(g[o]) == i[u] && (l[o] = i[u]);
					g[o] % 3 == 0 && c++, g[o] % 3 == 1 && m++, g[o] % 3 == 2 && p++
				}
				for (r = [l, [c],
						[m],
						[p],
						[re = g[0] % 3],
						[se = g[1] % 3]
					], s = ["bball_s", "gbg", "rbg", "lbg", "rbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_012luZouShi":
			case "sscp3-trend_012luZouShi":
			case "plsr3-trend_012luZouShi":
			case "hasha3-trend_012luZouShi":
			case "3dr3-trend_012luZouShi":
				for (g = n.split(","), i = [0, 3, 6, 9, 1, 4, 7, 2, 5, 8], l = [], o = p = m = c = 0; o < g
					.length; o++) {
					for (u = 0; u < i.length; u++) parseInt(g[o]) == i[u] && (l[o] = i[u]);
					g[o] % 3 == 0 && c++, g[o] % 3 == 1 && m++, g[o] % 3 == 2 && p++
				}
				for (r = [l, [c],
						[m],
						[p],
						[re = g[0] % 3],
						[se = g[1] % 3],
						[nn = g[2] % 3]
					], s = ["bball_s", "gbg", "rbg", "lbg", "rbg", "gbg", "lbg"], o = 0; o < r.length; o++) t[
					o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_junzhizoushi":
			case "sscp3-trend_junzhizoushi":
			case "plsr3-trend_junzhizoushi":
			case "hasha3-trend_junzhizoushi":
			case "3dr3-trend_junzhizoushi":
				g = n.split(",");
				var ln = 0;
				for (o = 0; o < g.length; o++) ln += parseInt(g[o]);
				for (ln = Math.round(ln / 3), (mn = [])[0] = ln < 5 ? language(common.cookieGet("language"),
						"conditions_xiao") : language(common.cookieGet("language"), "conditions_da"), mn[1] =
					ln % 2 == 0 ? language(common.cookieGet("language"), "conditions_shuang") : language(common
						.cookieGet("language"), "conditions_dan"), -1 < (R = "12357").indexOf(ln) ? mn[2] =
					language(common.cookieGet("language"), "conditions_zhi") : mn[2] = language(common
						.cookieGet("language"), "conditions_he"), r = [
						[ln], mn
					], s = ["rbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_hezhenzoushi":
			case "sscp3-trend_hezhenzoushi":
			case "plsr3-trend_hezhenzoushi":
			case "hasha3-trend_hezhenzoushi":
			case "3dr3-trend_hezhenzoushi":
				g = n.split(","), te = common.cutOutNumber(a[a.length - 2], e.split("-")[0]).split(",");
				var cn = f = 0;
				for (o = 0; o < g.length; o++) f += parseInt(g[o]), cn += parseInt(te[o]);
				var mn, pn = 0;
				for ((mn = [])[0] = (pn = cn < f ? f - cn : cn - f) < 14 ? language(common.cookieGet(
						"language"), "conditions_xiao") : language(common.cookieGet("language"),
						"conditions_da"), mn[1] = pn % 2 == 0 ? language(common.cookieGet("language"),
						"conditions_shuang") : language(common.cookieGet("language"), "conditions_dan"), -1 < (
						R = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27]).indexOf(pn) ? mn[2] = language(
						common.cookieGet("language"), "conditions_zhi") : mn[2] = language(common.cookieGet(
						"language"), "conditions_he"), r = [
						[pn], mn
					], s = ["rbg", "gbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_dingweifenbu":
			case "sscp3-trend_dingweifenbu":
			case "plsr3-trend_dingweifenbu":
			case "hasha3-trend_dingweifenbu":
			case "3dr3-trend_dingweifenbu":
				g = n.split(",");
				var un = new Array(10),
					hn = new Array(10),
					dn = new Array(10);
				for (u = 0; u < un.length; u++)
					for (null == un[u] && (un[u] = 0, hn[u] = 0, dn[u] = 0), o = 0; o < a.length - 1; o++) u !=
						(te = common.cutOutNumber(a[o], e.split("-")[0]).split(","))[0] ? un[u]++ : un[u] = 0,
						u != te[1] ? hn[u]++ : hn[u] = 0, u != te[2] ? dn[u]++ : dn[u] = 0;
				var bn = un[g[0]] % 10,
					_n = hn[g[1]] % 10,
					fn = dn[g[2]] % 10,
					In = [],
					kn = [];
				for (R = "12357", (Sn = [])[0] = bn < 5 ? language(common.cookieGet("language"),
						"conditions_xiao") : language(common.cookieGet("language"), "conditions_da"), Sn[1] =
					bn % 2 == 0 ? language(common.cookieGet("language"), "conditions_shuang") : language(common
						.cookieGet("language"), "conditions_dan"), -1 < R.indexOf(bn) ? Sn[2] = language(common
						.cookieGet("language"), "conditions_zhi") : Sn[2] = language(common.cookieGet(
						"language"), "conditions_he"), In[0] = _n < 5 ? language(common.cookieGet("language"),
						"conditions_xiao") : language(common.cookieGet("language"), "conditions_da"), In[1] =
					_n % 2 == 0 ? language(common.cookieGet("language"), "conditions_shuang") : language(common
						.cookieGet("language"), "conditions_dan"), -1 < R.indexOf(_n) ? In[2] = language(common
						.cookieGet("language"), "conditions_zhi") : In[2] = language(common.cookieGet(
						"language"), "conditions_he"), kn[0] = fn < 5 ? language(common.cookieGet("language"),
						"conditions_xiao") : language(common.cookieGet("language"), "conditions_da"), kn[1] =
					fn % 2 == 0 ? language(common.cookieGet("language"), "conditions_shuang") : language(common
						.cookieGet("language"), "conditions_dan"), -1 < R.indexOf(fn) ? kn[2] = language(common
						.cookieGet("language"), "conditions_zhi") : kn[2] = language(common.cookieGet(
						"language"), "conditions_he"), r = [
						[bn],
						[_n],
						[fn], Sn, In, kn
					], s = ["rball_s", "bball_s", "gball_s", "rbg", "lbg", "gbg"], o = 0; o < r.length; o++) t[
					o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_pailiezoushi":
			case "sscp3-trend_pailiezoushi":
			case "plsr3-trend_pailiezoushi":
			case "hasha3-trend_pailiezoushi":
			case "3dr3-trend_pailiezoushi":
				var Sn;
				for (bn = (g = common.sortArr(n.split(",")))[0], _n = g[1], fn = g[2], In = [], kn = [], R =
					"12357", (Sn = [])[0] = bn < 5 ? language(common.cookieGet("language"), "conditions_xiao") :
					language(common.cookieGet("language"), "conditions_da"), Sn[1] = bn % 2 == 0 ? language(
						common.cookieGet("language"), "conditions_shuang") : language(common.cookieGet(
						"language"), "conditions_dan"), -1 < R.indexOf(bn) ? Sn[2] = language(common.cookieGet(
						"language"), "conditions_zhi") : Sn[2] = language(common.cookieGet("language"),
						"conditions_he"), In[0] = _n < 5 ? language(common.cookieGet("language"),
						"conditions_xiao") : language(common.cookieGet("language"), "conditions_da"), In[1] =
					_n % 2 == 0 ? language(common.cookieGet("language"), "conditions_shuang") : language(common
						.cookieGet("language"), "conditions_dan"), -1 < R.indexOf(_n) ? In[2] = language(common
						.cookieGet("language"), "conditions_zhi") : In[2] = language(common.cookieGet(
						"language"), "conditions_he"), kn[0] = fn < 5 ? language(common.cookieGet("language"),
						"conditions_xiao") : language(common.cookieGet("language"), "conditions_da"), kn[1] =
					fn % 2 == 0 ? language(common.cookieGet("language"), "conditions_shuang") : language(common
						.cookieGet("language"), "conditions_dan"), -1 < R.indexOf(fn) ? kn[2] = language(common
						.cookieGet("language"), "conditions_zhi") : kn[2] = language(common.cookieGet(
						"language"), "conditions_he"), r = [
						[bn],
						[_n],
						[fn], Sn, In, kn
					], s = ["rball_s", "bball_s", "gball_s", "rbg", "lbg", "gbg"], o = 0; o < r.length; o++) t[
					o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca3-trend_litiZouShi":
			case "sscp3-trend_litiZouShi":
			case "plsr3-trend_litiZouShi":
			case "hasha3-trend_litiZouShi":
			case "3dr3-trend_litiZouShi":
				for (g = n.split(","), o = f = 0; o < g.length; o++) f += parseInt(g[o]);
				for (r = [g[0], g[1], g[2], f], s = ["bball_s", "gball_s", "rball_s", "rbg"], o = 0; o < r
					.length; o++) t[o] = {
					num: [r[o]],
					type: "td",
					classname: s[o]
				};
				break;
			case "ssca2-trend_litiZouShi":
			case "sscp2-trend_litiZouShi":
				for (g = n.split(","), te = common.cutOutNumber(a[a.length - 2], e.split("-")[0]).split(","),
					o = d = f = 0; o < g.length; o++)
					for (f += parseInt(g[o]), u = 0; u < te.length; u++) g[o] == te[u] && d++;
				var Zn = "",
					xn = "";
				for (parseInt(g[0]) + 1 != parseInt(g[1]) && parseInt(g[0]) - 1 != parseInt(g[1]) || (Zn =
						language(common.cookieGet("language"), "conditions_lianhao")), 0 < d && (xn = language(
						common.cookieGet("language"), "conditions_chongma")), r = [
						[g[0]],
						[g[1]],
						[Zn, xn],
						[f]
					], s = ["bball_s", "gball_s", "lbg", "rbg"], o = 0; o < r.length; o++) t[o] = {
					num: r[o],
					type: "td",
					classname: s[o]
				}
		}
		return t
	},
	ball: function(e, n, a, t) {
		switch (e) {
			case "1105r5-trend_pingmianZouShi":
			case "1105r4-trend_pingmianZouShi":
			case "1105r3-trend_pingmianZouShi":
			case "1105p2-trend_pingmianZouShi":
			case "1105a3-trend_pingmianZouShi":
			case "1105a2-trend_pingmianZouShi":
			case "1105a3-trend_jibenZouShi":
			case "1105a2-trend_jibenZouShi":
				var r = t;
				return 6 == parseInt(n) && e.indexOf("trend_jibenZouShi") < 0 && (r = "rball"), r;
			case "ssca2-trend_pingmianZouShi":
			case "ssca3-trend_pingmianZouShi":
			case "sscp2-trend_pingmianZouShi":
			case "sscp3-trend_pingmianZouShi":
			case "plsr3-trend_pingmianZouShi":
			case "hasha3-trend_pingmianZouShi":
			case "sscs4-trend_pingmianZouShi":
			case "sscs4-trend_jibenZouShi":
			case "sscs4-trend_012luGeShu":
				for (var s = 0, o = 0; o < a.length; o++) a[o] == n && ++s;
				if (2 <= s) return "rball_s";
				break;
			case "3dr3-trend_pingmianZouShi":
			case "k3r3-trend_pingmianZouShi":
			case "ssca2-trend_jibenZouShi":
			case "ssca3-trend_jibenZouShi":
			case "sscp2-trend_jibenZouShi":
			case "sscp3-trend_jibenZouShi":
			case "k3r3-trend_jibenZouShi":
			case "hasha3-trend_jibenZouShi":
				for (o = s = 0; o < a.length; o++) a[o] == n && ++s;
				if (2 == s) return "rball_s";
				if (3 == s) return "zball_s"
		}
	},
	type: function(e) {
		for (var n = 0, a = 0; a < e.length - 1; a++)
			for (var t = a + 1; t < e.length; t++) e[a] == e[t] && n++;
		var r = "lbg";
		return 2 == n ? r = "rbg" : 2 < n && (r = "zbg"), r
	}
};