# 子项目 D：用户头像与昵称。默认值由账号编号确定性生成（不落库，同一账号永远相同）；自定义值的校验。
import base64
import binascii
import colorsys
import hashlib
import re
import unicodedata

NICK_MAX = 12
AVATAR_MAX_BYTES = 100 * 1024

NICK_EMPTY = "昵称不能为空"
NICK_TOO_LONG = "昵称最多 12 个字"
NICK_BAD = "昵称包含不支持的字符"
AVATAR_BAD = "头像格式不支持"
AVATAR_TOO_BIG = "头像图片过大"

ADJECTIVES = (
    "好运", "快乐", "闪亮", "勇敢", "机智", "温柔", "阳光", "安静", "活泼", "聪明",
    "可爱", "淡定", "热情", "自在", "灵动", "沉稳", "开朗", "优雅", "欢乐", "清新",
    "敏捷", "神秘", "幸运", "乐观", "悠闲", "纯真", "坚定", "灿烂", "睿智", "爽朗",
    "温暖", "轻盈", "明亮", "欢喜", "耐心", "豪爽", "潇洒", "专注", "勤奋", "从容",
)
NOUNS = (
    "海豚", "星星", "熊猫", "狮子", "老虎", "白鹤", "雄鹰", "松鼠", "兔子", "小鹿",
    "海鸥", "鲸鱼", "企鹅", "考拉", "狐狸", "骏马", "孔雀", "蝴蝶", "萤火虫", "向日葵",
    "月亮", "太阳", "彩虹", "云朵", "流星", "山峰", "大树", "小溪", "浪花", "风筝",
    "灯塔", "帆船", "蒲公英", "银杏", "竹子", "梅花", "锦鲤", "麒麟", "凤凰", "青龙",
)

def _digest(code: str) -> bytes:
    return hashlib.sha256(code.upper().encode("utf-8")).digest()

def default_nickname(code: str) -> str:
    d = _digest(code)
    adj = ADJECTIVES[int.from_bytes(d[0:4], "big") % len(ADJECTIVES)]
    noun = NOUNS[int.from_bytes(d[4:8], "big") % len(NOUNS)]
    return f"{adj}的{noun}"

def _hex(h: float, l: float, s: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))

def default_avatar(code: str) -> str:
    """5×5 左右对称的几何图案（左 3 列由哈希取位，右 2 列镜像），前景色色相由哈希决定、背景同色相浅色。"""
    d = _digest(code)
    hue = int.from_bytes(d[8:10], "big") % 360 / 360
    fg, bg = _hex(hue, 0.5, 0.55), _hex(hue, 0.93, 0.4)
    bits = int.from_bytes(d[10:12], "big")
    on = [(x, y) for y in range(5) for x in range(3) if bits >> (y * 3 + x) & 1] or [(2, 2)]
    cells = "".join(f'<rect x="{cx * 10 + 5}" y="{y * 10 + 5}" width="10" height="10"/>'
                    for x, y in on for cx in sorted({x, 4 - x}))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="128" height="128">'
           f'<rect width="60" height="60" fill="{bg}"/><g fill="{fg}">{cells}</g></svg>')
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")

_BAD_CATEGORIES = {"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp", "Zs"}
_ZWJ = "‍"      # 零宽连接符：组合 emoji 需要，放行

def clean_nickname(v) -> tuple[str | None, str | None]:
    if v is None:
        return None, NICK_EMPTY
    if not isinstance(v, str):
        return None, NICK_BAD
    v = v.strip()
    if not v:
        return None, NICK_EMPTY
    if len(v) > NICK_MAX:
        return None, NICK_TOO_LONG
    if any(ch != _ZWJ and unicodedata.category(ch) in _BAD_CATEGORIES for ch in v):
        return None, NICK_BAD
    return v, None

_AVATAR_RE = re.compile(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})")
_B64_MAX = (AVATAR_MAX_BYTES + 2) // 3 * 4       # 解码前先按长度挡掉明显过大的
_MAGIC = {
    "jpeg": lambda b: b[:3] == b"\xff\xd8\xff",
    "png": lambda b: b[:8] == b"\x89PNG\r\n\x1a\n",
    "webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}

def clean_avatar(v) -> tuple[str | None, str | None]:
    if not isinstance(v, str):
        return None, AVATAR_BAD
    m = _AVATAR_RE.fullmatch(v)
    if m is None:
        return None, AVATAR_BAD
    kind, b64 = m.groups()
    if len(b64) > _B64_MAX:
        return None, AVATAR_TOO_BIG
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        return None, AVATAR_BAD
    if len(raw) > AVATAR_MAX_BYTES:
        return None, AVATAR_TOO_BIG
    if not _MAGIC[kind](raw):
        return None, AVATAR_BAD
    return v, None

def display_nickname(u) -> str:
    return u.nickname if u.nickname is not None else default_nickname(u.code)
