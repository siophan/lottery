import argparse
import calendar
import os
import sys
import time
from typing import Optional
from app import db, db_staff
from app.db_agents import BizError
from app.config import load_settings

def _parse_date(s: str) -> Optional[int]:
    if s.lower() == "never":
        return None
    return calendar.timegm(time.strptime(s, "%Y-%m-%d"))

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
    elif args.cmd == "list":
        for u in db.list_users(conn):
            exp = "never" if u.expires_at is None else time.strftime("%Y-%m-%d", time.gmtime(u.expires_at))
            print(f"{u.code}\t{u.status}\texpires={exp}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
