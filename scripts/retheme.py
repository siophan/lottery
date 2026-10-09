#!/usr/bin/env python3
"""Re-skin the compiled client: swap the old maroon theme and Element UI's
default blue accent for the red/gold "lottery mao" palette.

The client ships as compiled Vue output with no source, so this is a plain
colour substitution over client/. Lottery-semantic colours (red/blue balls,
green/red trend marks) are deliberately left alone. Re-running is a no-op.
"""
import pathlib
import re

CLIENT = pathlib.Path(__file__).resolve().parent.parent / 'client'

RED = '#c8161e'           # theme red (was maroon #711616)
RED_DARK = '#b4141b'      # pressed / active
BAR = 'linear-gradient(90deg,#a80f17,#d8261e)'  # title bars

# Element UI primary palette (#409eff and its tints) -> RED and its tints.
ELEMENT = {
    '#409eff': RED,
    '#53a8ff': '#ce2d35',
    '#66b1ff': '#d3454b',
    '#79bbff': '#d95c62',
    '#8cc5ff': '#de7378',
    '#a0cfff': '#e48b8f',
    '#b3d8ff': '#e9a2a5',
    '#c6e2ff': '#efb9bc',
    '#d9ecff': '#f4d0d2',
    '#ecf5ff': '#fae8e9',
    '#3a8ee6': RED_DARK,
}

# The main panel / sub-window frame was a blue scheme -> deep red with gold text.
FRAME = {
    '#1795ff': '#d8261e',
    '#004b9e': '#7a0b12',
    '#007be4': RED,
    '#00264e': '#4f060b',
    '#09417b': '#8e0f16',
    '#0146b1': '#a8101a',
    '#173f83': '#7a0b12',
    '#038': '#7a0b12',
    '#bedbec': '#e9b04f',   # also used as a card-header background under white text
    '#bbd5f9': '#ffe2b0',
    '#b8d4ff': '#ffdca0',
    '#b3d9f9': '#ffe2b0',
    '#8da9e0': '#e8b86a',
    '#add2fa': '#fff0e0',
    '#8ab8f6': '#f6c9a8',
    '#e8f6ff': '#fdf0e6',   # table header / gutter
    '#e1eefd': '#fdf0e6',   # rules text panel
    '#2767ae': '#a8101a',   # table current row
    '#155d9a': '#a8101a',   # selected option chips
}
# Left blue on purpose: .lan / .qiu_blue / .bgl / .two (blue balls) and .bifen (scores).


def sub_ci(pattern, repl, text):
    return re.subn(pattern, repl, text, flags=re.IGNORECASE)


def main():
    total = 0
    files = [p for p in CLIENT.rglob('*') if p.suffix in ('.css', '.js')
             and p.is_file() and 'node_modules' not in p.parts]
    for p in files:
        src = p.read_text(encoding='utf-8', errors='surrogateescape')
        out, n = src, 0
        # Title bars in compiled templates: `"background": "#711616"`.
        out, k = sub_ci(r'("background":\s*")#711616(")', r'\g<1>' + BAR + r'\g<2>', out); n += k
        out, k = sub_ci(r'#711616\b', RED, out); n += k
        out, k = sub_ci(r'("background":\s*")#038(")', r'\g<1>' + FRAME['#038'] + r'\g<2>', out); n += k
        if p.suffix == '.css':
            for old, new in FRAME.items():
                out, k = sub_ci(re.escape(old) + r'\b', new, out); n += k
            # Login window min/close buttons now sit on the red banner.
            out, k = sub_ci(r'(\.frame-actions \.el-button\[data-v-6fe3f3d5\]\{-webkit-app-region:no-drag;color:)#999',
                            r'\g<1>rgba(255,255,255,.85)', out); n += k
            out, k = sub_ci(r'rgba\(64,\s*158,\s*255,', 'rgba(200,22,30,', out); n += k
            for old, new in ELEMENT.items():
                out, k = sub_ci(re.escape(old) + r'\b', new, out); n += k
        if n:
            p.write_text(out, encoding='utf-8', errors='surrogateescape')
            total += n
            print(f'{n:5d}  {p.relative_to(CLIENT)}')
    print(f'{total} replacements')


if __name__ == '__main__':
    main()
