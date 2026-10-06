from app.upstream import filter_request_headers, filter_response_headers, mask_token

def test_filter_request_drops_hop_by_hop_case_insensitive():
    h = {"Host": "x", "Content-Length": "5", "token": "abc", "fromId": "1004"}
    out = filter_request_headers(h)
    assert "host" not in {k.lower() for k in out}
    assert "content-length" not in {k.lower() for k in out}
    assert out["token"] == "abc"
    assert out["fromId"] == "1004"

def test_filter_response_drops_transfer_encoding():
    out = filter_response_headers({"Transfer-Encoding": "chunked", "Content-Type": "application/json"})
    assert {k.lower() for k in out} == {"content-type"}

def test_mask_token_long():
    assert mask_token("sk-1234567890abcdef") == "sk-1…cdef"

def test_mask_token_short():
    assert mask_token("abc") == "***"

def test_filter_request_keeps_only_known_client_headers():
    # 上游网关若认 X-Original-URL / X-HTTP-Method-Override 之类，可借此绕过路径拦截：只转发已知头
    h = {"Content-Type": "application/json", "Accept": "application/json", "Accept-Language": "zh-CN",
         "User-Agent": "Electron", "token": "abc", "fromId": "1004",
         "X-Original-URL": "/order/create", "X-Rewrite-URL": "/order/create",
         "X-HTTP-Method-Override": "DELETE", "X-Forwarded-For": "1.1.1.1", "Cookie": "a=b",
         "Authorization": "Bearer x", "Origin": "app://.", "Accept-Encoding": "zstd"}
    assert set(filter_request_headers(h)) == {"Content-Type", "Accept", "Accept-Language",
                                             "User-Agent", "token", "fromId"}
