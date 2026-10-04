# 各外部数据源返回格式 → 统一的 Draw。新增一种返回格式时，在此加一个解析函数并注册到 ADAPTERS。
from dataclasses import dataclass

@dataclass(frozen=True)
class Draw:
    expect: str        # 期号
    opennumber: str    # 开奖号码，逗号分隔
    open_time: str     # 'YYYY-MM-DD HH:MM:SS'，排序依据

class ParseError(Exception):
    pass

def _items(obj) -> list:
    if not isinstance(obj, dict):
        raise ParseError("响应不是 JSON 对象")
    if obj.get("code") != 0:
        raise ParseError(f"远端返回 code={obj.get('code')}: {obj.get('msg', '')}")
    data = obj.get("data")
    if not isinstance(data, list):
        raise ParseError("data 不是列表")
    return data

def _field(item, name: str) -> str:
    v = item.get(name) if isinstance(item, dict) else None
    if not isinstance(v, str) or not v.strip():
        raise ParseError(f"缺少字段 {name}")
    return v.strip()

def _parse(obj, expect_key: str, number_key: str, time_key: str) -> list[Draw]:
    return [Draw(_field(it, expect_key), _field(it, number_key), _field(it, time_key))
            for it in _items(obj)]

def parse_qkltj(obj) -> list[Draw]:
    """区块链统计 api.qkltj.com：expect / opennumber / openTime"""
    return _parse(obj, "expect", "opennumber", "openTime")

def parse_qqtj(obj) -> list[Draw]:
    """全球统计 qqtj666.com：issue / drawResult / drawTime"""
    return _parse(obj, "issue", "drawResult", "drawTime")

ADAPTERS = {"qkltj": parse_qkltj, "qqtj": parse_qqtj}
