/**
 * 缓存取值
 * @param 键 key
 */
function  cookieGet(key){
	var t = sessionStorage.getItem(key);
	return t;
}


/**
 * 缓存赋值
 * @param 键 key
 * @param 值 value
 */
function cookieSet(key,value){
	sessionStorage.setItem(key, value);
}
