# 客户端用户信息区（子项目 D）：头像、昵称与积分余额。以请求头 token 认证，
# 拦截规则与其他业务请求一致（gate.authorize_user：10020 / 10022 / 10024 / 10025）。
import json
import time
from fastapi import APIRouter, Request
from .. import db, gate, profile, userinfo

router = APIRouter()

def _ok(data: dict) -> dict:
    return {"code": 0, "msg": "成功", "data": data}

def _fail(msg: str) -> dict:
    return {"code": 1, "msg": msg}

def _profile(conn, u: db.User) -> dict:
    avatar = db.get_user_avatar(conn, u.id)
    default_avatar = profile.default_avatar(u.code)
    return _ok({"code": u.code, "nickname": profile.display_nickname(u),
                "avatar": avatar if avatar is not None else default_avatar,
                "defaultAvatar": default_avatar, "points": u.points,
                "nicknameIsDefault": u.nickname is None, "avatarIsDefault": avatar is None})

def _auth(request: Request):
    return gate.authorize_user(request.app.state.db_conn, request.headers.get("token", ""))

@router.get("/user/profile")
async def get_profile(request: Request):
    u, err = _auth(request)
    if err:
        return err
    return _profile(request.app.state.db_conn, u)

@router.get("/user/points")
async def get_points(request: Request):
    u, err = _auth(request)
    if err:
        return err
    return _ok({"points": u.points})

@router.post("/user/profile")
async def save_profile(request: Request):
    u, err = _auth(request)
    if err:
        return err
    try:
        payload = json.loads(await request.body() or b"{}")
    except (ValueError, RecursionError):
        return _fail("参数错误")
    if not isinstance(payload, dict):
        return _fail("参数错误")
    # 先全部校验再落库：任何一项非法都不产生部分修改
    changes = {}
    if "nickname" in payload:
        v, e = profile.clean_nickname(payload["nickname"])
        if e:
            return _fail(e)
        changes["nickname"] = v
    if "avatar" in payload:
        if payload["avatar"] is None:
            changes["avatar"] = None
        else:
            v, e = profile.clean_avatar(payload["avatar"])
            if e:
                return _fail(e)
            changes["avatar"] = v
    conn = request.app.state.db_conn
    if changes:
        db.set_user_profile(conn, u.id, **changes)
    return _profile(conn, db.get_user_by_id(conn, u.id))

@router.post("/user/legacy-prefixes")
async def legacy_prefixes(request: Request):
    """遗漏页本地数据找回（client/legacy-keys.js）：客户端把本地 key 的前缀发来，回其中哪些是用过的共用账号编号。
    客户端只能确认它本地已有的前缀，共用账号编号本身不下发。"""
    u, err = _auth(request)
    if err:
        return err
    try:
        payload = json.loads(await request.body() or b"{}")
    except (ValueError, RecursionError):
        return _fail("参数错误")
    cands = payload.get("candidates") if isinstance(payload, dict) else None
    if (not isinstance(cands, list) or len(cands) > userinfo.LEGACY_CANDIDATES_MAX
            or not all(isinstance(c, str) and 0 < len(c) <= userinfo.LEGACY_CANDIDATE_LEN_MAX for c in cands)):
        return _fail("参数错误")
    if not request.app.state.legacy_limiter.allow(u.id, int(time.time())):
        return _fail("操作过于频繁，请明天再试")
    return _ok({"matches": userinfo.legacy_matches(request.app.state.db_conn, [c for c in cands if c != u.code])})
