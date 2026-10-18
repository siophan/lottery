# 会员各自的数据（设计：docs/superpowers/specs/2026-10-18-member-own-data-design.md）。所有会员在上游共用一个账号，
# 下面这些功能的数据原本存在该账号名下、人人可见可删，这里改成按会员隔离：
# - 均衡 / 倍投方案、关注专家：金额赔率都是客户端算好的，本地存储，不再访问上游；
# - 遗漏监控、模拟练习：当前遗漏、开奖号、中奖金额由上游按开奖数据实时计算，仍存在上游，本地登记每条归哪个会员，
#   列表只回本人的，详情 / 删除先校验归属。
# 路径按 gate.normalize（小写）在兜底转发里先于放行清单分派（main.proxy），不会被原样转发。
import asyncio
import json
import time
from datetime import datetime
import httpx
from . import db_member, gate
from .upstream import forward
from .userinfo import _CST, _rewrite_json

PLAN_MAX = 200                 # 每账号每类方案
FAVORITE_MAX = 500             # 每账号关注专家
UPSTREAM_ITEM_MAX = 200        # 每账号每类上游条目
PLAN_BYTES_MAX = 256 * 1024    # 单个方案 JSON
PLAN_NAME_MAX = 50
EXPERT_NAME_MAX = 50
LIST_LIMIT_MAX = 50
TYPE_MEMO_MAX = 20000          # 「会员 + 专家 → 类型」进程内记忆的条数上限，超出清空重记
LIMIT_MSG = "已达上限，请先删除旧数据"
NOT_FOUND = "数据不存在"
# 客户端模板里的选项代码 → 中文（sport.vue / myPlanList.vue 同一套映射）
OPTION_NAMES = {"h": "胜", "d": "平", "a": "负", "hh": "胜胜", "hd": "胜平", "ha": "胜负", "dh": "平胜", "dd": "平平",
                "da": "平负", "ah": "负胜", "ad": "负平", "aa": "负负"}
# 专家详情页：响应顶层 favorites 是关注记录，换成本人的
EXPERT_PAGE = "sportexpertplan/footballjc/expert"

class UpstreamUnavailable(Exception):
    pass

def _ok(data) -> dict:
    return {"code": 0, "msg": "成功", "data": data}

def _fail(msg: str) -> dict:
    return {"code": 1, "msg": msg}

def _int(v) -> int | None:
    """客户端的 id 有时是数字、有时是数字字符串；其余（含 bool）一律视为无效。"""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.strip().isdigit():
        return int(v.strip())
    return None

def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0

def _time(ts: int) -> str:
    return datetime.fromtimestamp(ts, _CST).strftime("%Y-%m-%d %H:%M:%S")

def _error(obj: dict) -> dict:
    """上游失败响应只回 code / msg：data 里可能带着共用账号的其他数据。"""
    return {"code": obj.get("code"), "msg": obj.get("msg")}

def _ids(items) -> set[str]:
    return {str(it["id"]) for it in items if isinstance(it, dict) and it.get("id") is not None}

def _fill_average(data: dict) -> None:
    # 详情页让球选项显示「让」+ name，保存时客户端不带 name（上游原先会补）
    for res in data.get("resultArr") or []:
        for opt in (res.get("optionArr") or []) if isinstance(res, dict) else []:
            if isinstance(opt, dict) and str(opt.get("type")) == "1" and "name" not in opt:
                code = opt.get("optionName")
                opt["name"] = f"{opt.get('goalLine', '')}{OPTION_NAMES.get(code, code if code is not None else '')}"

def _fill_double(data: dict) -> None:
    # 详情页顶部读顶层 resultName、展开行读 bouns（客户端拼写），保存时只带每行的 resultName 和 bonus
    arr = [r for r in data.get("resultArr") or [] if isinstance(r, dict)]
    if "resultName" not in data and arr:
        data["resultName"] = arr[0].get("resultName", "")
    for res in arr:
        for item in res.get("oddsArr") or []:
            if isinstance(item, dict) and "bouns" not in item:
                item["bouns"] = item.get("bonus")

PLAN_KINDS = {"averageplan": ("average", _fill_average), "doubleplan": ("double", _fill_double)}

class MemberData:
    def __init__(self, conn, client: httpx.AsyncClient, dayys, from_id: str):
        self.conn = conn
        self.client = client
        self.dayys = dayys
        self.from_id = from_id
        self._types: dict[tuple[int, int], int] = {}
        self._locks = {"misscontrol": asyncio.Lock(), "usernumplan": asyncio.Lock()}
        self.handlers = {}
        for prefix in PLAN_KINDS:
            for op in ("save", "list", "info", "del"):
                self.handlers[f"{prefix}/{op}"] = getattr(self, f"_plan_{op}")
        self.handlers.update({
            "expertfavorites/save": self._favorite_save,
            "expertfavorites/del": self._favorite_del,
            "expertfavorites/list": self._favorite_list,
            "misscontrol/list": self._miss_list,
            "misscontrol/save": self._miss_save,
            "misscontrol/del": self._miss_del,
            "usernumplan/list": self._num_list,
            "usernumplan/save": self._num_save,
            "usernumplan/info": self._num_info,
            "usernumplan/del": self._num_del,
        })

    async def handle(self, norm: str, user, payload: dict) -> dict:
        fn = self.handlers[norm]
        if norm.split("/", 1)[0] in PLAN_KINDS:
            return fn(PLAN_KINDS[norm.split("/", 1)[0]], user, payload)
        result = fn(user, payload)
        return await result if asyncio.iscoroutine(result) else result

    # ---- 均衡 / 倍投方案（本地） ----

    def _plan_save(self, kind, user, p: dict) -> dict:
        name = p.get("planName")
        if not isinstance(name, str) or not name.strip():
            return _fail("请输入方案名")
        if len(name.strip()) > PLAN_NAME_MAX:
            return _fail(f"方案名最多 {PLAN_NAME_MAX} 个字")
        if not isinstance(p.get("resultArr"), list):
            return _fail("参数错误")
        if len(json.dumps(p, ensure_ascii=False).encode()) > PLAN_BYTES_MAX:
            return _fail("方案过大，无法保存")
        if db_member.count_plans(self.conn, user.id, kind[0]) >= PLAN_MAX:
            return _fail(LIMIT_MSG)
        db_member.add_plan(self.conn, user.id, kind[0], {**p, "planName": name.strip()}, int(time.time()))
        return _ok(None)

    def _plan_list(self, kind, user, p: dict) -> dict:
        params = p.get("params") if isinstance(p.get("params"), dict) else p
        limit = min(max(_int(params.get("limit")) or 10, 1), LIST_LIMIT_MAX)
        page = max(_int(params.get("page")) or 1, 1)
        rows = db_member.list_plans(self.conn, user.id, kind[0], limit, (page - 1) * limit)
        out = []
        for r in rows:
            d = json.loads(r["data"])
            out.append({"id": r["id"], "planName": d.get("planName"), "planType": d.get("planType"),
                        "createTime": _time(r["created_at"]), "sumBetting": d.get("sumBetting"),
                        "odds": d.get("odds"), "sumBonus": d.get("sumBonus")})
        return _ok({"list": out, "total": db_member.count_plans(self.conn, user.id, kind[0])})

    def _plan_info(self, kind, user, p: dict) -> dict:
        pid = _int(p.get("planId"))
        row = db_member.get_plan(self.conn, user.id, kind[0], pid) if pid is not None else None
        if row is None:
            return _fail("方案不存在")
        data = json.loads(row["data"])
        data.update(id=row["id"], createTime=_time(row["created_at"]))
        kind[1](data)
        return _ok(data)

    def _plan_del(self, kind, user, p: dict) -> dict:
        # 均衡方案发 {"id": [n]}，倍投方案发 {"id": n}
        raw = p.get("id")
        ids = [_int(v) for v in (raw if isinstance(raw, list) else [raw])]
        if not ids or len(ids) > PLAN_MAX or any(i is None for i in ids):
            return _fail("方案不存在")
        if db_member.delete_plans(self.conn, user.id, kind[0], ids) == 0:
            return _fail("方案不存在")
        return _ok(None)

    # ---- 关注专家（本地） ----

    @staticmethod
    def _favorite(row) -> dict:
        # 列表页用 expert_id 打开专家页、用 id 取消关注；专家页用 id 取消关注
        return {"id": row["id"], "expertId": row["expert_id"], "expert_id": row["expert_id"], "name": row["name"],
                "type": row["expert_type"], "createTime": _time(row["created_at"])}

    def _remember_expert(self, user, body: bytes) -> tuple[int, int] | None:
        """专家页请求 {"params": {"expertId", "type", ...}}：记下类型（关注时客户端不带类型），返回 (专家, 类型)。"""
        try:
            params = json.loads(body or b"{}").get("params")
        except (ValueError, RecursionError, AttributeError):
            return None
        if not isinstance(params, dict) or (eid := _int(params.get("expertId"))) is None:
            return None
        etype = _int(params.get("type"))
        etype = 0 if etype is None else etype
        if len(self._types) >= TYPE_MEMO_MAX:
            self._types.clear()
        self._types[(user.id, eid)] = etype
        return eid, etype

    def rewrite_expert_page(self, content: bytes, user, body: bytes) -> bytes:
        """专家页响应：favorites 换成本人对该专家的关注记录（没有则 null）。"""
        view = self._remember_expert(user, body)
        row = db_member.get_favorite(self.conn, user.id, *view) if view else None
        def fn(payload):
            if row is None and payload.get("favorites") is None:
                return False
            payload["favorites"] = self._favorite(row) if row is not None else None
        return _rewrite_json(content, fn)

    def _favorite_save(self, user, p: dict) -> dict:
        eid = _int(p.get("expertId"))
        if eid is None:
            return _fail("参数错误")
        name = p.get("expertName")
        name = name.strip()[:EXPERT_NAME_MAX] if isinstance(name, str) else ""
        etype = self._types.get((user.id, eid), 0)
        row = db_member.get_favorite(self.conn, user.id, eid, etype)
        if row is None:
            if db_member.count_favorites(self.conn, user.id) >= FAVORITE_MAX:
                return _fail(LIMIT_MSG)
            row = db_member.add_favorite(self.conn, user.id, eid, etype, name, int(time.time()))
        return _ok(self._favorite(row))

    def _favorite_del(self, user, p: dict) -> dict:
        fid = _int(p.get("id"))
        if fid is None or not db_member.delete_favorite(self.conn, user.id, fid):
            return _fail(NOT_FOUND)
        return _ok(None)

    def _favorite_list(self, user, p: dict) -> dict:
        return _ok([self._favorite(r) for r in db_member.list_favorites(self.conn, user.id)])

    # ---- 共用上游账号下的条目（遗漏监控、模拟练习） ----

    async def _upstream(self, path: str, payload: dict) -> dict:
        body = json.dumps(payload, ensure_ascii=False).encode()
        for attempt in range(2):
            headers = {"content-type": "application/json;charset=UTF-8", "token": await self.dayys.get_token(),
                       "fromId": self.from_id}
            t0 = time.monotonic()
            try:
                resp = await forward(self.client, "POST", "/" + path, headers, body, {})
            except (httpx.TimeoutException, httpx.RequestError) as e:
                print(f"POST /api/{path} (member) -> ERR {int((time.monotonic()-t0)*1000)}ms ({e})")
                raise UpstreamUnavailable(str(e))
            print(f"POST /api/{path} (member) -> {resp.status_code} {int((time.monotonic()-t0)*1000)}ms")
            if attempt == 0 and gate.response_signals_invalid(resp.content):
                self.dayys.invalidate()        # 共用账号会话失效：重登后重试一次，与兜底转发一致
                continue
            break
        try:
            obj = resp.json()
        except ValueError:
            raise UpstreamUnavailable("上游返回非 JSON")
        if not isinstance(obj, dict):
            raise UpstreamUnavailable("上游返回格式错误")
        return obj

    @staticmethod
    def _pick(new_items: list, saved, match: dict) -> str | None:
        """保存后列表里新出现的条目中认领哪一条：上游保存响应带了 id 就用它；否则只有一条新的就是它；
        有多条（共用账号在别处也新建了）时按提交的字段找唯一一条。认不出来返回 None。"""
        new_ids = _ids(new_items)
        for cand in (saved, saved.get("id") if isinstance(saved, dict) else None):
            if cand is not None and not isinstance(cand, bool) and str(cand) in new_ids:
                return str(cand)
        if len(new_items) == 1:
            return str(new_items[0]["id"])
        hits = [it for it in new_items if all(str(it.get(k)) == str(v) for k, v in match.items())]
        return str(hits[0]["id"]) if len(hits) == 1 else None

    async def _claim_new(self, user, kind: str, list_path: str, queries: list[dict], rows_of,
                         save_path: str, form: dict, match: dict) -> dict:
        """先拉列表、再保存、再拉列表，新出现的那条登记给当前会员。同类保存串行，避免两人同时保存互相认领。"""
        async with self._locks[kind]:
            if len(db_member.owned_ids(self.conn, user.id, kind)) >= UPSTREAM_ITEM_MAX:
                return _fail(LIMIT_MSG)
            before = set()
            for q in queries:
                obj = await self._upstream(list_path, q)
                if obj.get("code") != 0:
                    return _error(obj)
                before |= _ids(rows_of(obj))
            saved = await self._upstream(save_path, form)
            if saved.get("code") != 0:
                return _error(saved)          # 含 9981「未购买此服务」，客户端按原逻辑提示
            new_items = []
            for q in queries:
                obj = await self._upstream(list_path, q)
                if obj.get("code") == 0:
                    new_items += [it for it in rows_of(obj) if isinstance(it, dict) and it.get("id") is not None
                                  and str(it["id"]) not in before and str(it["id"]) not in _ids(new_items)]
            picked = self._pick(new_items, saved.get("data"), match)
            if picked is None:
                return _fail("保存失败，请重试")   # 上游那条成为无主数据，对所有人隐藏
            db_member.claim(self.conn, user.id, kind, picked, int(time.time()))
            return {"code": 0, "msg": saved.get("msg") or "成功", "data": None}

    async def _owned_call(self, user, kind: str, path: str, p: dict, on_ok=None) -> dict:
        """详情 / 删除：id 不是本人登记的当作不存在，不转发。"""
        uid = _int(p.get("id"))
        if uid is None or not db_member.is_owned(self.conn, user.id, kind, str(uid)):
            return _fail(NOT_FOUND)
        obj = await self._upstream(path, {"id": uid})
        if obj.get("code") != 0:
            return _error(obj)
        if on_ok:
            on_ok(str(uid))
        return obj

    # 遗漏监控：列表 data 是数组；当前遗漏 missCount、提醒次数 warnCount、状态 status 由上游计算

    @staticmethod
    def _miss_rows(obj: dict) -> list:
        return obj.get("data") if isinstance(obj.get("data"), list) else []

    async def _miss_list(self, user, p: dict) -> dict:
        obj = await self._upstream("misscontrol/list", {"playId": p.get("playId"), "code": p.get("code")})
        if obj.get("code") != 0:
            return _error(obj)
        owned = db_member.owned_ids(self.conn, user.id, "misscontrol")
        return {**obj, "data": [it for it in self._miss_rows(obj) if isinstance(it, dict) and str(it.get("id")) in owned]}

    async def _miss_save(self, user, p: dict) -> dict:
        form = {k: p[k] for k in ("planName", "warnMiss", "email", "planContent", "planCount", "playId", "code") if k in p}
        return await self._claim_new(user, "misscontrol", "misscontrol/list",
                                     [{"playId": p.get("playId"), "code": p.get("code")}], self._miss_rows,
                                     "misscontrol/save", form,
                                     {"planName": p.get("planName"), "planContent": p.get("planContent")})

    async def _miss_del(self, user, p: dict) -> dict:
        return await self._owned_call(user, "misscontrol", "misscontrol/del", p,
                                      lambda uid: db_member.release(self.conn, user.id, "misscontrol", uid))

    # 模拟练习：列表按 (彩种, 月份) 查，data = {list, total}；开奖号、状态、中奖金额由上游计算

    @staticmethod
    def _num_rows(obj: dict) -> list:
        data = obj.get("data")
        rows = data.get("list") if isinstance(data, dict) else None
        return rows if isinstance(rows, list) else []

    async def _num_list(self, user, p: dict) -> dict:
        obj = await self._upstream("userNumPlan/list", {"code": p.get("code"), "date": p.get("date")})
        if obj.get("code") != 0:
            return _error(obj)
        owned = db_member.owned_ids(self.conn, user.id, "usernumplan")
        rows = [it for it in self._num_rows(obj) if isinstance(it, dict) and str(it.get("id")) in owned]
        # 月度投入 / 中奖总额只算本人的（上游的 total 是整个共用账号的）
        total = [{"touru": round(sum(_num(r.get("consumeAmount")) for r in rows), 2),
                  "zhongchu": round(sum(_num(r.get("prizeAmount")) for r in rows), 2)}]
        return {**obj, "data": {"list": rows, "total": total}}

    async def _num_save(self, user, p: dict) -> dict:
        form = {k: p[k] for k in ("expect", "openTime", "consumeAmount", "bonus", "multiplier", "content", "code") if k in p}
        # 列表按开奖日期所在月份查；保险起见当月也查（上游若按创建时间归月）
        months = []
        for m in (p.get("openTime")[:7] if isinstance(p.get("openTime"), str) else None,
                  datetime.now(_CST).strftime("%Y-%m")):
            if m and m not in months:
                months.append(m)
        return await self._claim_new(user, "usernumplan", "userNumPlan/list",
                                     [{"code": p.get("code"), "date": m} for m in months], self._num_rows,
                                     "userNumPlan/save", form,
                                     {"expect": p.get("expect"), "content": p.get("content")})

    async def _num_info(self, user, p: dict) -> dict:
        return await self._owned_call(user, "usernumplan", "userNumPlan/info", p)

    async def _num_del(self, user, p: dict) -> dict:
        return await self._owned_call(user, "usernumplan", "userNumPlan/del", p,
                                      lambda uid: db_member.release(self.conn, user.id, "usernumplan", uid))
