
// 布林通道状态柱：命中红、未命中蓝；两种柱各自固定高度（红:蓝 = 2:1），无上下影线，柱高不表示任何数值
var STATUS_BAR_COLORS = {
	hit : 'red',
	miss : '#3388ff'
};

// 每期一根柱：[期序号, 柱在通道里的位置（该期走势的中点）, 是否命中]
function statusBars(datas) {
	var bars = [];
	for (var i = 0; i < datas.length; i++) {
		var from = datas[i][0], to = datas[i][1]; // 命中向上走、未命中向下走
		bars.push([ i, (from + to) / 2, to >= from ? 1 : 0 ]);
	}
	return bars;
}

function statusBarItem(params, api) {
	var hit = api.value(2) == 1;
	var unit = Math.max(2, params.coordSys.height * 0.04); // 蓝柱高度，随图表区域等比缩放
	var height = hit ? unit * 2 : unit;
	var width = Math.max(1, api.size([ 1, 0 ])[0] * 0.6);
	var center = api.coord([ api.value(0), api.value(1) ]);
	return {
		type : 'rect',
		shape : {
			x : center[0] - width / 2,
			y : center[1] - height / 2,
			width : width,
			height : height
		},
		style : {
			fill : hit ? STATUS_BAR_COLORS.hit : STATUS_BAR_COLORS.miss
		}
	};
}

function k_line(data, qhSum, openNumber, topgaodu, tp) {
	let userName = localStorage.getItem("userName");
	//console.log(JSON.stringify(data)+"   data");
	var gridListHeight = '40%';
	var macdKListHeight = '35%';
	var kdjKListHeight = '30%';
	var macdKListTop = '42%';
	var kdjKListTop = '65%';
	var macdK = localStorage.getItem(userName+"_macdK");
	var kdjK = localStorage.getItem(userName+"_kdjK");
	var gridBoolen = false;
	var tooltipboolen = true;
	if (tp == "yes") {
		tooltipboolen = false;
	}
	if (macdK != null && macdK != "" && kdjK != null && kdjK != "") {
		gridListHeight = '85%';
		gridBoolen = true;
	}
	
	var tooltips = {
		show : tooltipboolen,
	    trigger: 'axis',
		alwaysShowContent : true,
		position : [ 10, 10 ],
		formatter : function(params, ticket, callback) {
				var htmlStr = '';
				for (var i = 0; i < params.length; i++) {
					var param = params[i];
					var xName = param.name; //x轴的名称  
					var seriesName = param.seriesName; //图例名称  
					var value = 0; //y轴值  
					//if (seriesName.toString() == "KLine") {
						value = param.dataIndex;
					//}
					
					var color = param.color; //图例颜色  
					if (i === 0) {
						
							htmlStr +=  "【" + qhSum[value]
								+ "期     开奖号码：" + openNumber[value]
								+ '】'; //x轴的名称  
						
					}
				}
				return htmlStr;
			},
				axisPointer : {
					type : 'cross',
					label : {
						show : false,
					},
					crossStyle : {
						type : 'solid'
					},
				},
	};
	var gridList = [ {
		left : '1%',
		right : '1%',
		top : '4%',
		height : gridListHeight,
		zlevel : 1
	} ];
	var xAxisList = [ {
		type : 'category',
		data : data.times,
		scale : true,
		silent : true,
		show : false,
		axisLine : {
			onZero : false,
		},
		splitLine : {
			show : false,
		},
		axisLabel : {
			show : gridBoolen
		},
		boundaryGap : true // 两侧留白，首尾状态柱不被裁切
	} ];
	var yAxisList = [ {
		scale : true,
		splitArea : {
			show : false
		},
		gridIndex : 0,
		axisLabel : {
			show : false
		},
		axisTick : {
			show : false
		},
		splitLine : {
			show : false
		},
	} ]
	var seriesList = [ {
		name : '状态柱',
		type : 'custom',
		data : statusBars(data.datas),
		renderItem : statusBarItem,
		encode : {
			x : 0,
			y : 1
		}
	}, {
		name : '中轨',
		type : 'line',
		data : zgValue,
		smooth : true,
		symbolSize : 0,
		lineStyle : {
			normal : {
				width : 1
			}
		},
		itemStyle : {
			normal : {
				color : '#FFFFFF'
			}
		}
	}, {
		name : '上轨',
		type : 'line',
		data : sgValue,
		smooth : true,
		symbolSize : 0,
		lineStyle : {
			normal : {
				width : 1
			}
		},
		itemStyle : {
			normal : {
				color : '#FFFF00'
			}
		}
	}, {
		name : '下轨',
		type : 'line',
		data : xgValue,
		smooth : true,
		symbolSize : 0,
		lineStyle : {
			normal : {
				width : 1
			}
		},
		itemStyle : {
			normal : {
				color : '#FF00FF'
			}
		}
	} ];
	if (macdK == null || macdK == "") {
		var macdBoolen = false;
		if (kdjK != null && kdjK != "") {
			macdKListHeight = "40%";
			macdKListTop = "45%";
			macdBoolen = true;
		}
		var kkm = {
			left : '1%',
			right : '1%',
			top : macdKListTop,
			height : macdKListHeight,
			zlevel : 1
		};
		gridList.push(kkm);
		var kkm2 = {
			type : 'category',
			gridIndex : 1,
			data : data.times,
			axisLabel : {
				show : macdBoolen
			},
			axisTick : {
				show : false
			},
			splitLine : {
				show : false
			},
			boundaryGap : true // 两侧留白，首尾状态柱不被裁切
		};
		xAxisList.push(kkm2);
		var kkm3 = {
			gridIndex : 1,
			splitNumber : 1,
			axisLabel : {
				show : false
			},
			axisTick : {
				show : false
			},
			splitLine : {
				show : false
			}
		};
		yAxisList.push(kkm3);

		var kkm4 = {
			name : 'MACD',
			type : 'bar',
			xAxisIndex : 1,
			yAxisIndex : 1,
			barWidth : 6,
			data : macdList,
			smooth : true,
			symbolSize : 0,
			itemStyle : {
				normal : {
					color : function(params) {
						var colorList;
						if (macdZb == 0) {
							if (params.data >= sygParam) {
								colorList = 'red';
							} else {
								colorList = '#47e1e9';
							}
							sygParam = params.data;
						} else {
							if (params.data >= 0) {
								colorList = 'red';
							} else {
								colorList = '#47e1e9';
							}
						}
						return colorList;
					},
				}
			}
		};
		var kkm5 = {
			name : 'DIF',
			type : 'line',
			xAxisIndex : 1,
			yAxisIndex : 1,
			data : difList,
			symbolSize : 0,
			lineStyle : {
				normal : {
					width : 1
				}
			},
			itemStyle : {
				normal : {
					color : '#FFFFFF'
				}
			}
		};
		var kkm6 = {
			name : 'DEA',
			type : 'line',
			xAxisIndex : 1,
			yAxisIndex : 1,
			data : deaList,
			symbolSize : 0,
			lineStyle : {
				normal : {
					width : 1
				}
			},
			itemStyle : {
				normal : {
					color : '#FFFF00'
				}
			}
		};
		seriesList.push(kkm4);
		seriesList.push(kkm5);
		seriesList.push(kkm6);
	}
	if (kdjK == null || kdjK == "") {
		var gridIndex = 2;
		if (macdK != null && macdK != "") {
			gridIndex = 1;
			kdjKListHeight = "50%";
			kdjKListTop = "45%";
		}

		var kkm = {
			left : '1%',
			right : '1%',
			top : kdjKListTop,
			height : kdjKListHeight,
			

		};
		gridList.push(kkm);
		var kkm2 = {
			type : 'category',
			gridIndex : gridIndex,
			data : data.times,
			axisLabel : {
				show : true
			},
			axisTick : {
				show : false
			},
			splitLine : {
				show : false
			},
			boundaryGap : true // 两侧留白，首尾状态柱不被裁切
		};
		xAxisList.push(kkm2);
		var kkm3 = {
			gridIndex : gridIndex,
			splitNumber : 1,
			axisLabel : {
				show : false
			},
			axisTick : {
				show : false
			},
			splitLine : {
				show : false
			}
		};
		yAxisList.push(kkm3);

		var kkm4 = {
			name : 'kdjK',
			type : 'line',
			xAxisIndex : gridIndex,
			yAxisIndex : gridIndex,
			data : kList,
			symbolSize : 0,
			lineStyle : {
				normal : {
					width : 1
				}
			},
			itemStyle : {
				normal : {
					color : '#FFFFFF'
				}
			}
		};
		var kkm5 = {
			name : 'kdjD',
			type : 'line',
			xAxisIndex : gridIndex,
			yAxisIndex : gridIndex,
			data : dList,
			symbolSize : 0,
			lineStyle : {
				normal : {
					width : 1
				}
			},
			itemStyle : {
				normal : {
					color : '#FFFF00'
				}
			}
		};
		var kkm6 = {
			name : 'kdjJ',
			type : 'line',
			xAxisIndex : gridIndex,
			yAxisIndex : gridIndex,
			data : jList,
			symbolSize : 0,
			lineStyle : {
				normal : {
					width : 1
				}
			},
			itemStyle : {
				normal : {
					color : '#FF00FF'
				}
			}
		};
		seriesList.push(kkm4);
		seriesList.push(kkm5);
		seriesList.push(kkm6);
	}

	var option = {
		backgroundColor : '#000',
		textStyle : {
			color : '#fff'
		},
		title : {
			text : ktitle,
			right : 0,
			top : topgaodu,
			textStyle : {
				color : '#fff',
				fontSize : 15,
			}
		},

		axisPointer : {
			link : {
				xAxisIndex : 'all'
			},
			label : false
		},
		tooltip : tooltips,
		grid : gridList,
		xAxis : xAxisList,
		yAxis : yAxisList,
		series : seriesList,
		animation : false
	};


	return k.themeChart(option); // 背景、文字、坐标轴按当前主题

}