import pytest
from app.adapters import ADAPTERS, Draw, ParseError, parse_qkltj, parse_qqtj

# 2026-10-04 实测返回（截取一条）
QKLTJ = {"msg": "成功！", "code": 0, "data": [{
    "block": "86816657", "expect": "202610041324", "lottoId": "6001",
    "lottoTypeCn": "哈希分分彩", "openTime": "2026-10-04 22:04:14", "opennumber": "3,9,7,4,5"}]}
QQTJ = {"code": 0, "msg": "成功", "data": [{
    "cycleNo": 1324, "issue": "202610041324", "drawResult": "3,9,7,4,5",
    "drawTime": "2026-10-04 22:04:00", "context": {"block": "86816657"}}]}

def test_parse_qkltj():
    assert parse_qkltj(QKLTJ) == [Draw("202610041324", "3,9,7,4,5", "2026-10-04 22:04:14")]

def test_parse_qqtj():
    assert parse_qqtj(QQTJ) == [Draw("202610041324", "3,9,7,4,5", "2026-10-04 22:04:00")]

def test_registry():
    assert ADAPTERS["qkltj"] is parse_qkltj and ADAPTERS["qqtj"] is parse_qqtj

def test_qqtj_payload_fed_to_qkltj_adapter_fails_loudly():
    # 本次 bug 的回归用例：字段名不兼容必须报错，而不是静默产出空数据
    with pytest.raises(ParseError, match="expect"):
        parse_qkltj(QQTJ)

def test_remote_error_code():
    with pytest.raises(ParseError, match="参数错误"):
        parse_qqtj({"code": 1, "msg": "参数错误", "data": []})

@pytest.mark.parametrize("bad", [None, [], "x", {"code": 0, "data": {}}, {"code": 0}])
def test_malformed_payload(bad):
    with pytest.raises(ParseError):
        parse_qkltj(bad)

def test_blank_field_rejected():
    obj = {"code": 0, "data": [{"issue": "1", "drawResult": "  ", "drawTime": "t"}]}
    with pytest.raises(ParseError, match="drawResult"):
        parse_qqtj(obj)

def test_empty_list_ok():
    assert parse_qqtj({"code": 0, "data": []}) == []
