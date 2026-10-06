import base64
import xml.etree.ElementTree as ET
import pytest
from app import db, profile

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 60
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 60
WEBP = b"RIFF\0\0\0\0WEBPVP8 " + b"\0" * 60

def data_url(kind: str, raw: bytes) -> str:
    return f"data:image/{kind};base64," + base64.b64encode(raw).decode()

def fresh():
    conn = db.connect(":memory:"); db.init_db(conn)
    return conn

def test_messages_are_verbatim():
    assert (profile.NICK_EMPTY, profile.NICK_TOO_LONG, profile.NICK_BAD) == (
        "昵称不能为空", "昵称最多 12 个字", "昵称包含不支持的字符")
    assert (profile.AVATAR_BAD, profile.AVATAR_TOO_BIG) == ("头像格式不支持", "头像图片过大")
    assert (profile.NICK_MAX, profile.AVATAR_MAX_BYTES) == (12, 102400)

def test_word_lists_are_large_and_unique():
    for words in (profile.ADJECTIVES, profile.NOUNS):
        assert len(words) >= 30 and len(set(words)) == len(words)

def test_default_nickname_is_stable_case_insensitive_and_varied():
    assert profile.default_nickname("abc123") == profile.default_nickname("ABC123")
    n = profile.default_nickname("1000001")
    assert n == profile.default_nickname("1000001")
    assert "的" in n and 1 <= len(n) <= profile.NICK_MAX
    assert len({profile.default_nickname(str(1000000 + i)) for i in range(200)}) >= 100

def test_default_avatar_is_valid_svg_stable_and_varied():
    prefix = "data:image/svg+xml;base64,"
    a = profile.default_avatar("1000001")
    assert a == profile.default_avatar("1000001") == profile.default_avatar("1000001".lower())
    assert a.startswith(prefix)
    root = ET.fromstring(base64.b64decode(a[len(prefix):]))
    assert root.tag.endswith("svg")
    assert len({profile.default_avatar(str(1000000 + i)) for i in range(50)}) >= 45

@pytest.mark.parametrize("raw,expected", [
    ("小明", "小明"), ("  小明  ", "小明"), ("a" * 12, "a" * 12), ("好运的海豚🐬", "好运的海豚🐬"),
    ("👨‍👩", "👨‍👩"),
])
def test_clean_nickname_accepts(raw, expected):
    assert profile.clean_nickname(raw) == (expected, None)

@pytest.mark.parametrize("raw,err", [
    (None, "昵称不能为空"), ("", "昵称不能为空"), ("   ", "昵称不能为空"),
    ("a" * 13, "昵称最多 12 个字"), ("a\nb", "昵称包含不支持的字符"), ("a\x00b", "昵称包含不支持的字符"),
    ("a‮b", "昵称包含不支持的字符"), ("a b", "昵称包含不支持的字符"), (123, "昵称包含不支持的字符"),
])
def test_clean_nickname_rejects(raw, err):
    assert profile.clean_nickname(raw) == (None, err)

@pytest.mark.parametrize("kind,raw", [("jpeg", JPEG), ("png", PNG), ("webp", WEBP)])
def test_clean_avatar_accepts_matching_magic(kind, raw):
    v = data_url(kind, raw)
    assert profile.clean_avatar(v) == (v, None)

def test_clean_avatar_size_limit_is_inclusive():
    ok = data_url("jpeg", JPEG + b"\0" * (profile.AVATAR_MAX_BYTES - len(JPEG)))
    assert profile.clean_avatar(ok) == (ok, None)
    big = data_url("jpeg", JPEG + b"\0" * (profile.AVATAR_MAX_BYTES - len(JPEG) + 1))
    assert profile.clean_avatar(big) == (None, "头像图片过大")
    huge = data_url("jpeg", JPEG + b"\0" * (5 * profile.AVATAR_MAX_BYTES))
    assert profile.clean_avatar(huge) == (None, "头像图片过大")

@pytest.mark.parametrize("v", [
    None, 1, "", "http://x/a.jpg", data_url("svg+xml", b"<svg/>"), data_url("gif", b"GIF89a"),
    data_url("png", JPEG), data_url("jpeg", PNG), "data:image/jpeg;base64,", "data:image/jpeg;base64,@@@@",
    "data:image/jpeg;base64,abc",
])
def test_clean_avatar_rejects(v):
    assert profile.clean_avatar(v) == (None, "头像格式不支持")

def test_migration_is_idempotent_and_creates_storage():
    conn = fresh()
    db.init_db(conn)                                   # 第二次初始化不报错
    assert "nickname" in {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    assert {r["name"] for r in conn.execute("PRAGMA table_info(user_avatars)")} == {"user_id", "data", "updated_at"}

def test_set_and_clear_profile():
    conn = fresh()
    u = db.create_user(conn, "U1", "pw", None)
    assert u.nickname is None and db.get_user_avatar(conn, u.id) is None
    db.set_user_profile(conn, u.id, nickname="小明", avatar="data:x", now=5)
    assert db.get_user_by_id(conn, u.id).nickname == "小明"
    assert db.get_user_avatar(conn, u.id) == "data:x"
    db.set_user_profile(conn, u.id, avatar="data:y", now=6)          # 覆盖头像，昵称不变
    assert db.get_user_avatar(conn, u.id) == "data:y"
    assert conn.execute("SELECT updated_at FROM user_avatars WHERE user_id=?", (u.id,)).fetchone()[0] == 6
    assert db.get_user_by_id(conn, u.id).nickname == "小明"
    db.set_user_profile(conn, u.id, nickname=None, avatar=None)
    assert db.get_user_by_id(conn, u.id).nickname is None and db.get_user_avatar(conn, u.id) is None

def test_delete_user_removes_avatar():
    conn = fresh()
    u = db.create_user(conn, "U1", "pw", None)
    db.set_user_profile(conn, u.id, avatar="data:x")
    assert db.delete_user(conn, "U1")
    assert conn.execute("SELECT COUNT(*) FROM user_avatars").fetchone()[0] == 0

def test_display_nickname_falls_back_to_default():
    conn = fresh()
    u = db.create_user(conn, "U1", "pw", None)
    assert profile.display_nickname(u) == profile.default_nickname("U1")
    db.set_user_profile(conn, u.id, nickname="小明")
    assert profile.display_nickname(db.get_user_by_id(conn, u.id)) == "小明"
