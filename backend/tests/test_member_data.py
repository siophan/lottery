# 会员各自的数据（app/member_data.py）：方案 / 关注专家本地存储，遗漏监控 / 模拟练习存在共用上游账号下、按登记的归属过滤。
# 任一会员都看不到、删不掉别人的数据，也看不到共用账号名下原有的数据。
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app import db, member_data
from app.dayys_session import DataYsSession
from tests.points_helpers import set_points_raw

class Upstream:
    """有状态的上游：misscontrol 与 userNumPlan 的条目都存在共用账号名下。"""

    def __init__(self):
        self.next_id = 100
        # 共用账号名下原有的数据（原账号主人的）：谁都不该看到
        self.miss = [{"id": 1, "planName": "原主人", "planContent": "1,2", "playId": "animalsa2", "code": "9",
                      "missCount": 3, "warnMiss": 5, "email": "owner@example.com", "status": 1}]
        self.nums = [{"id": 2, "expect": "2026001", "openTime": "2026-10-19", "code": "202", "content": "9,9,9\n",
                      "consumeAmount": "800", "prizeAmount": "5000", "status": 1, "multiplier": 1}]
        self.calls = []
        self.save_returns_id = False
        self.fail = {}          # path → 响应
        self.extra_on_save = 0  # 保存时共用账号在别处同时新建的条数

    def _new_id(self):
        self.next_id += 1
        return self.next_id

    def __call__(self, req):
        path = req.url.path.removeprefix("/api/")
        if path == "auth/login":
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK", "userInfo": {}}})
        body = json.loads(req.content or b"{}")
        self.calls.append((path, body))
        if path in self.fail:
            return httpx.Response(200, json=self.fail[path])
        if path == "misscontrol/list":
            return self._ok([m for m in self.miss if m["playId"] == body.get("playId") and m["code"] == body.get("code")])
        if path == "misscontrol/save":
            item = {**body, "id": self._new_id(), "missCount": 0, "warnCount": 0, "status": 1, "createDate": "2026-10-18"}
            self.miss.append(item)
            for _ in range(self.extra_on_save):
                self.miss.append({**body, "id": self._new_id(), "planName": "别处新建"})
            return self._ok(item["id"] if self.save_returns_id else None)
        if path == "misscontrol/del":
            self.miss = [m for m in self.miss if m["id"] != body["id"]]
            return self._ok(None)
        if path == "userNumPlan/list":
            rows = [n for n in self.nums if n["code"] == body.get("code") and n["openTime"][:7] == body.get("date")]
            return self._ok({"list": rows, "total": [{"touru": 99999, "zhongchu": 99999}]})
        if path == "userNumPlan/save":
            self.nums.append({**body, "id": self._new_id(), "status": 0, "prizeAmount": 0, "opennumber": ""})
            return self._ok(None)
        if path == "userNumPlan/info":
            return self._ok(next((n for n in self.nums if n["id"] == body["id"]), None))
        if path == "userNumPlan/del":
            self.nums = [n for n in self.nums if n["id"] != body["id"]]
            return self._ok(None)
        return httpx.Response(200, json={"code": 0, "msg": "成功", "data": {"list": [], "total": 0},
                                         "favorites": {"id": 9, "expertId": 123}})

    @staticmethod
    def _ok(data):
        return httpx.Response(200, json={"code": 0, "msg": "成功", "data": data})

    def paths(self):
        return [p for p, _ in self.calls]

def build():
    conn = db.connect(":memory:"); db.init_db(conn)
    up = Upstream()
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(up))
    dayys = DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600)
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn, dayys=dayys)
    toks = []
    for code in ("20240001", "20240002"):
        u = db.create_user(conn, code, "pw", None)
        set_points_raw(conn, code, 9)
        toks.append(db.create_session(conn, u.id, 3600))
    return conn, up, TestClient(app), toks

def post(tc, tok, path, body=None):
    return tc.post(f"/api/{path}", json=body if body is not None else {}, headers={"token": tok}).json()

AVERAGE = {"planName": "均衡一", "planType": 0, "sumBetting": "20.00", "sumBonus": "35.00", "sumEarning": "15.00",
           "resultName": "平均优化", "odds": 3.5,
           "resultArr": [{"odds": "1.75", "mode": 5, "betting": 10, "bonus": "17.50", "earning": 7.5,
                          "optionArr": [{"matchId": 1, "matchNum": "周一001", "leagueName": "英超", "homeTeamName": "甲",
                                         "awayTeamName": "乙", "optionName": "h", "goalLine": "-1", "type": 1, "odds": 1.75},
                                        {"matchId": 2, "optionName": "d", "type": 0}]}]}
DOUBLE = {"planName": "倍投一", "sumBetting": "40.00", "sumBonus": "70.00", "earning": "0.00", "odds": 3.5, "planType": 0,
          "resultArr": [{"odds": 3.5, "mode": 10, "betting": 20, "bonus": "35.00", "earning": 0,
                         "resultName": "计算结果1(平均优化)",
                         "oddsArr": [{"odds": 1.75, "mode": 5, "betting": 10, "bonus": 0, "earning": 0, "optionArr": []}]}]}

def test_all_member_paths_require_login_and_never_reach_upstream():
    conn, up, tc, _ = build()
    for norm in sorted(tc.app.state.member.handlers):
        assert tc.post(f"/api/{norm}", json={}).json()["code"] == 10020, norm
    assert up.calls == []

def test_average_plan_is_private_to_its_member():
    conn, up, tc, (a, b) = build()
    assert post(tc, a, "averagePlan/save", AVERAGE) == {"code": 0, "msg": "成功", "data": None}
    rows = post(tc, a, "averagePlan/list", {"params": {"limit": "10", "page": "1"}})["data"]
    assert rows["total"] == 1
    row = rows["list"][0]
    assert {k: row[k] for k in ("planName", "planType", "sumBetting", "odds", "sumBonus")} == \
        {"planName": "均衡一", "planType": 0, "sumBetting": "20.00", "odds": 3.5, "sumBonus": "35.00"}
    assert len(row["createTime"]) == 19
    info = post(tc, a, "averagePlan/info", {"planId": row["id"]})["data"]
    assert info["id"] == row["id"] and info["resultName"] == "平均优化" and info["createTime"] == row["createTime"]
    opts = info["resultArr"][0]["optionArr"]
    assert opts[0]["name"] == "-1胜"              # 让球选项名：详情页显示「让」+ name
    assert "name" not in opts[1]
    # 另一个会员：看不到、查不到、删不掉
    assert post(tc, b, "averagePlan/list", {"params": {}})["data"] == {"list": [], "total": 0}
    assert post(tc, b, "averagePlan/info", {"planId": row["id"]}) == {"code": 1, "msg": "方案不存在"}
    assert post(tc, b, "averagePlan/del", {"id": [row["id"]]})["code"] == 1
    assert post(tc, a, "averageplan/LIST", {})["data"]["total"] == 1      # 路径大小写不敏感
    assert post(tc, a, "averagePlan/del", {"id": [row["id"]]})["code"] == 0   # 均衡方案删除发数组
    assert post(tc, a, "averagePlan/list", {})["data"]["total"] == 0
    assert up.calls == []

def test_double_plan_fills_display_fields_and_deletes_by_scalar_id():
    conn, up, tc, (a, b) = build()
    post(tc, a, "doublePlan/save", DOUBLE)
    pid = post(tc, a, "doublePlan/list", {"params": {"limit": "10", "page": "1"}})["data"]["list"][0]["id"]
    info = post(tc, a, "doublePlan/info", {"planId": str(pid)})["data"]
    assert info["resultName"] == "计算结果1(平均优化)"
    assert info["resultArr"][0]["oddsArr"][0]["bouns"] == 0          # 展开行读 bouns
    assert post(tc, a, "averagePlan/list", {})["data"]["total"] == 0  # 均衡与倍投分开
    assert post(tc, b, "doublePlan/del", {"id": pid})["code"] == 1
    assert post(tc, a, "doublePlan/del", {"id": pid})["code"] == 0    # 倍投方案删除发标量

def test_plan_paging_newest_first():
    conn, up, tc, (a, _) = build()
    for i in range(3):
        post(tc, a, "averagePlan/save", {**AVERAGE, "planName": f"p{i}"})
    page = post(tc, a, "averagePlan/list", {"params": {"limit": "2", "page": "2"}})["data"]
    assert page["total"] == 3 and [r["planName"] for r in page["list"]] == ["p0"]
    first = post(tc, a, "averagePlan/list", {"params": {"limit": "x", "page": "0"}})["data"]["list"]
    assert [r["planName"] for r in first] == ["p2", "p1", "p0"]

def test_plan_save_validation_and_limits(monkeypatch):
    conn, up, tc, (a, _) = build()
    assert post(tc, a, "averagePlan/save", {**AVERAGE, "planName": "  "})["msg"] == "请输入方案名"
    assert post(tc, a, "averagePlan/save", {**AVERAGE, "planName": "x" * 51})["code"] == 1
    assert post(tc, a, "averagePlan/save", {**AVERAGE, "resultArr": "x"})["msg"] == "参数错误"
    assert post(tc, a, "averagePlan/save", {**AVERAGE, "pad": "x" * member_data.PLAN_BYTES_MAX})["msg"] == "方案过大，无法保存"
    r = tc.post("/api/averagePlan/save", content=b"{bad", headers={"token": a}).json()
    assert r["msg"] == "请输入方案名"
    assert post(tc, a, "averagePlan/del", {"id": ["x"]})["code"] == 1
    assert post(tc, a, "averagePlan/info", {})["code"] == 1
    monkeypatch.setattr(member_data, "PLAN_MAX", 1)
    assert post(tc, a, "averagePlan/save", AVERAGE)["code"] == 0
    assert post(tc, a, "averagePlan/save", AVERAGE) == {"code": 1, "msg": member_data.LIMIT_MSG}

def test_expert_favorites_per_member_with_type_from_expert_page():
    conn, up, tc, (a, b) = build()
    page = lambda tok: post(tc, tok, "sportExpertPlan/footballJc/expert",
                            {"params": {"expertId": 123, "limit": "5", "page": "1", "type": 2}})
    assert page(a)["favorites"] is None                      # 共用账号的关注记录不下发
    fav = post(tc, a, "expertFavorites/save", {"expertId": 123, "expertName": "专家A"})["data"]
    assert {k: fav[k] for k in ("expertId", "expert_id", "name", "type")} == \
        {"expertId": 123, "expert_id": 123, "name": "专家A", "type": 2}
    assert post(tc, a, "expertFavorites/save", {"expertId": "123", "expertName": "改名"})["data"]["id"] == fav["id"]
    assert page(a)["favorites"]["id"] == fav["id"]
    assert page(b)["favorites"] is None
    assert post(tc, a, "expertFavorites/list")["data"] == [fav]
    assert post(tc, b, "expertFavorites/list")["data"] == []
    assert post(tc, b, "expertFavorites/del", {"id": fav["id"]}) == {"code": 1, "msg": "数据不存在"}
    assert post(tc, a, "expertFavorites/del", {"id": fav["id"]})["code"] == 0
    assert page(a)["favorites"] is None
    # 没打开过专家页：类型按 0
    assert post(tc, b, "expertFavorites/save", {"expertId": 5, "expertName": "x"})["data"]["type"] == 0
    assert post(tc, b, "expertFavorites/save", {"expertName": "x"})["msg"] == "参数错误"
    assert [p for p in up.paths()] == ["sportExpertPlan/footballJc/expert"] * 4

def test_misscontrol_items_are_claimed_and_filtered():
    conn, up, tc, (a, b) = build()
    q = {"playId": "animalsa2", "code": "9"}
    assert post(tc, a, "misscontrol/list", q)["data"] == []          # 原主人的监测看不到
    form = {**q, "planName": "我的", "warnMiss": 5, "planContent": "1,2-3,4", "planCount": 2}
    assert post(tc, a, "misscontrol/save", form) == {"code": 0, "msg": "成功", "data": None}
    mine = post(tc, a, "misscontrol/list", q)["data"]
    assert [m["planName"] for m in mine] == ["我的"] and mine[0]["missCount"] == 0   # 上游计算的字段照传
    assert post(tc, b, "misscontrol/list", q)["data"] == []
    n = len(up.calls)
    assert post(tc, b, "misscontrol/del", {"id": mine[0]["id"]}) == {"code": 1, "msg": "数据不存在"}
    assert post(tc, a, "misscontrol/del", {"id": 1})["code"] == 1           # 原主人的也删不掉
    assert len(up.calls) == n                                                # 都没转发
    assert post(tc, a, "misscontrol/del", {"id": mine[0]["id"]})["code"] == 0
    assert post(tc, a, "misscontrol/del", {"id": mine[0]["id"]})["code"] == 1   # 登记已释放
    assert ("misscontrol/save", form) in up.calls

def test_misscontrol_save_errors_and_ambiguous_claims():
    conn, up, tc, (a, _) = build()
    q = {"playId": "animalsa2", "code": "9"}
    form = {**q, "planName": "我的", "warnMiss": 5, "planContent": "1,2", "planCount": 1, "userId": 777}
    up.fail["misscontrol/save"] = {"code": 9981, "msg": "未购买", "data": {"secret": 1}}
    assert post(tc, a, "misscontrol/save", form) == {"code": 9981, "msg": "未购买"}   # 原样回 code / msg，不带 data
    del up.fail["misscontrol/save"]
    up.extra_on_save = 1                                  # 别处同时新建了一条：按提交的字段认领自己的
    assert post(tc, a, "misscontrol/save", form)["code"] == 0
    assert [m["planName"] for m in post(tc, a, "misscontrol/list", q)["data"]] == ["我的"]
    assert all("userId" not in body for p, body in up.calls if p == "misscontrol/save")   # 只转发表单字段
    up.extra_on_save = 1                                  # 新建的两条都对不上提交的字段 → 认不出 → 报错
    assert post(tc, a, "misscontrol/save", {**form, "planName": "别处新建"}) == {"code": 1, "msg": "保存失败，请重试"}
    up.save_returns_id = True                             # 上游直接回了 id：以它为准
    assert post(tc, a, "misscontrol/save", {**form, "planName": "别处新建"})["code"] == 0
    assert len(post(tc, a, "misscontrol/list", q)["data"]) == 2

def test_misscontrol_limit(monkeypatch):
    conn, up, tc, (a, _) = build()
    monkeypatch.setattr(member_data, "UPSTREAM_ITEM_MAX", 1)
    form = {"playId": "animalsa2", "code": "9", "planName": "x", "warnMiss": 5, "planContent": "1,2", "planCount": 1}
    assert post(tc, a, "misscontrol/save", form)["code"] == 0
    n = len(up.calls)
    assert post(tc, a, "misscontrol/save", form) == {"code": 1, "msg": member_data.LIMIT_MSG}
    assert len(up.calls) == n

def test_num_plan_list_total_and_info_are_own_only():
    conn, up, tc, (a, b) = build()
    q = {"code": "202", "date": "2026-10"}
    assert post(tc, a, "userNumPlan/list", q)["data"] == {"list": [], "total": [{"touru": 0, "zhongchu": 0}]}
    for amount in ("10", "2.5"):
        form = {"expect": "2026002", "openTime": "2026-10-20", "consumeAmount": amount, "bonus": "100",
                "multiplier": 1, "content": "1,2,3\n", "code": "202"}
        assert post(tc, a, "userNumPlan/save", form)["code"] == 0
    up.nums[-1]["prizeAmount"] = "40"                    # 上游开奖后算出的中奖金额
    data = post(tc, a, "userNumPlan/list", q)["data"]
    assert len(data["list"]) == 2
    assert data["total"] == [{"touru": 12.5, "zhongchu": 40.0}]   # 只算本人的，不用上游整个账号的 total
    rid = data["list"][0]["id"]
    assert post(tc, a, "userNumPlan/info", {"id": rid})["data"]["id"] == rid
    assert post(tc, b, "userNumPlan/info", {"id": rid}) == {"code": 1, "msg": "数据不存在"}
    assert post(tc, a, "userNumPlan/info", {"id": 2})["code"] == 1          # 原主人的
    assert post(tc, b, "userNumPlan/list", q)["data"]["list"] == []
    assert post(tc, a, "userNumPlan/del", {"id": rid})["code"] == 0
    assert len(post(tc, a, "userNumPlan/list", q)["data"]["list"]) == 1

def test_upstream_failures():
    conn, up, tc, (a, _) = build()
    up.fail["misscontrol/list"] = {"code": 500, "msg": "上游错误", "data": [{"id": 1}]}
    assert post(tc, a, "misscontrol/list", {"playId": "animalsa2", "code": "9"}) == {"code": 500, "msg": "上游错误"}
    assert post(tc, a, "misscontrol/save", {"playId": "animalsa2", "code": "9", "planName": "x"})["code"] == 500
    assert "misscontrol/save" not in up.paths()          # 保存前拉列表失败就不保存

def test_upstream_unreachable_returns_502():
    conn = db.connect(":memory:"); db.init_db(conn)
    def router(req):
        if req.url.path.endswith("/auth/login"):
            return httpx.Response(200, json={"code": 0, "data": {"token": "DYTOK"}})
        raise httpx.ConnectError("down")
    client = httpx.AsyncClient(base_url="https://up.example/api", transport=httpx.MockTransport(router))
    app = create_app(Settings(session_ttl=3600), client=client, conn=conn,
                     dayys=DataYsSession(client, "SRV", "pw", "dev", "1004", token_ttl=3600))
    u = db.create_user(conn, "20240001", "pw", None); set_points_raw(conn, "20240001", 9)
    r = TestClient(app).post("/api/misscontrol/list", json={}, headers={"token": db.create_session(conn, u.id, 3600)})
    assert r.status_code == 502 and r.json()["error"] == "upstream_unreachable"

def test_expired_shared_session_relogs_once():
    conn, up, tc, (a, _) = build()
    seen = []
    orig = up.__call__
    def flaky(req):
        if req.url.path.endswith("/misscontrol/list") and not seen:
            seen.append(1)
            return httpx.Response(200, json={"code": 10021, "msg": "token 失效"})
        return orig(req)
    tc.app.state.client._transport = httpx.MockTransport(flaky)
    assert post(tc, a, "misscontrol/list", {"playId": "animalsa2", "code": "9"}) == {"code": 0, "msg": "成功", "data": []}
    assert seen == [1]

def test_delete_user_removes_member_data():
    conn, up, tc, (a, _) = build()
    post(tc, a, "averagePlan/save", AVERAGE)
    post(tc, a, "expertFavorites/save", {"expertId": 1, "expertName": "x"})
    post(tc, a, "misscontrol/save", {"playId": "animalsa2", "code": "9", "planName": "x", "planContent": "1,2"})
    assert db.delete_user(conn, "20240001")
    for table in ("member_plans", "member_favorites", "member_upstream_items"):
        assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0, table

@pytest.mark.parametrize("path", ["coursemsg/save", "averagePlan/other", "misscontrol/info"])
def test_other_paths_stay_blocked(path):
    conn, up, tc, (a, _) = build()
    assert post(tc, a, path) == {"code": 1, "msg": "该功能暂不可用"}
    assert up.calls == []
