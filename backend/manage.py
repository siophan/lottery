import argparse
import calendar
import os
import sys
import time
from typing import Optional
from app import db, db_points, db_staff
from app.db_agents import BizError
from app.config import load_settings

def _parse_date(s: str) -> Optional[int]:
    if s.lower() == "never":
        return None
    return calendar.timegm(time.strptime(s, "%Y-%m-%d"))

RECHARGE_REASON = "积分上线初始充值"

def _recharge_arrears(conn, points: int, dry_run: bool) -> int:
    """积分上线后的初始充值：直接写库（与后台批量充值同一函数，每 1000 个一批、每批全有或全无），
    不经 HTTP、不需要运维密钥。只挑已欠费（已激活且余额 0）、使用控制正常、未到期的账号；
    重复执行只会处理仍为 0 分的账号，中途失败可安全重跑。"""
    try:
        db_points.check_amount(points)
    except BizError as e:
        print(f"error: {e.msg}")
        return 1
    now = int(time.time())
    codes = [r["code"] for r in conn.execute(
        "SELECT code FROM users WHERE first_activated_at IS NOT NULL AND points=0 AND status='active'"
        " AND (expires_at IS NULL OR expires_at >= ?) ORDER BY id", (now,))]
    print(f"accounts to recharge: {len(codes)}")
    if dry_run or not codes:
        return 0
    for i in range(0, len(codes), db_points.MAX_BATCH):
        try:
            r = db_points.batch_recharge(conn, codes[i:i + db_points.MAX_BATCH], points, RECHARGE_REASON,
                                         actor_type="system", actor="manage.py", agent_id=None, now=now)
        except BizError as e:
            print(f"error: {e.msg}")
            return 1
        print(f"batch {r['batch_id']}: {r['count']} accounts, {r['total']} points")
    return 0

def main(argv: list, conn=None) -> int:
    p = argparse.ArgumentParser(prog="manage.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add"); a.add_argument("code"); a.add_argument("password"); a.add_argument("--expires", default="never")
    d = sub.add_parser("del"); d.add_argument("code")
    se = sub.add_parser("set-expiry"); se.add_argument("code"); se.add_argument("date")
    di = sub.add_parser("disable"); di.add_argument("code")
    en = sub.add_parser("enable"); en.add_argument("code")
    ads = sub.add_parser("admin-set"); ads.add_argument("username"); ads.add_argument("password")
    ss = sub.add_parser("set-super"); ss.add_argument("username")
    sub.add_parser("list")
    ra = sub.add_parser("recharge-arrears", help="给所有「已欠费、使用正常、未到期」的账号各充值 POINTS 分")
    ra.add_argument("points", type=int); ra.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    if conn is None:
        settings = load_settings(os.environ)
        conn = db.connect(settings.db_path); db.init_db(conn)

    if args.cmd == "add":
        db.create_user(conn, args.code, args.password, _parse_date(args.expires)); print(f"added {args.code.upper()}")
    elif args.cmd == "del":
        print("deleted" if db.delete_user(conn, args.code) else "not found")
    elif args.cmd == "set-expiry":
        print("ok" if db.update_user(conn, args.code, expires_at=_parse_date(args.date)) else "not found")
    elif args.cmd == "disable":
        print("ok" if db.update_user(conn, args.code, status="disabled") else "not found")
    elif args.cmd == "enable":
        print("ok" if db.update_user(conn, args.code, status="active") else "not found")
    elif args.cmd == "admin-set":
        try:
            db_staff.upsert_staff_admin(conn, args.username, args.password, int(time.time()))
        except BizError as e:
            print(f"error: {e.msg}")
            return 1
        print(f"admin set: {args.username}")
    elif args.cmd == "set-super":
        res = db.set_super(conn, args.username)
        if res != "ok":
            print({"not_found": "not found", "is_agent": "agent cannot be super"}[res])
            return 1
        print(f"super set: {args.username}")
    elif args.cmd == "recharge-arrears":
        return _recharge_arrears(conn, args.points, args.dry_run)
    elif args.cmd == "list":
        for u in db.list_users(conn):
            exp = "never" if u.expires_at is None else time.strftime("%Y-%m-%d", time.gmtime(u.expires_at))
            print(f"{u.code}\t{u.status}\texpires={exp}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
