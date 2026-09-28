/**
 	* 
  	* @param 标题 title
	* @param 页面地址 url
	* @param 弹出框宽度 width
	* @param 弹出框高度 height
 */
function openLayersRefer(title,url,width,height,baocun,quxiao,w){
		  //自定页
			layer.open({
			  type: 2,
			  title: title,
			  skin: 'layui-layer-lan', //样式类名
			  closeBtn: 0, //不显示关闭按钮
			  anim: 5,
			  shadeClose: false, //开启遮罩关闭
			  area: [width, height], //宽高
			  btn: [baocun,quxiao],
			  content: url,
			  success: function( layero,index){
					
			  },
			  btn1: function(index, layero){
				  var form = $(layero).find("iframe")[0].contentWindow;//获取子页面元素
				  form.onchangeDiv();
				  layer.close(index);
			  }
			});
		}