"""从 dist 中的源码、照片与手势模型生成单文件圣诞树。仅使用 Python 标准库。"""

import argparse
import base64
import gzip
import hashlib
import json
import re
from pathlib import Path
from tempfile import NamedTemporaryFile


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist'
MARKER = '<!-- portable-assets -->'


def encoded(data):
    return base64.b64encode(data).decode('ascii')


def json_text(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def build_album():
    folder = (SITE / 'photos').resolve()
    entries = json.loads((folder / 'album.json').read_text(encoding='utf-8-sig'))
    if not isinstance(entries, list) or len(entries) > 24:
        raise ValueError('album.json 应是按展示顺序排列的照片列表，最多 24 张。')
    photos = []
    ids = set()
    for entry in entries:
        photo_id, name, filename = entry['id'], entry['name'], entry['file']
        if not all(isinstance(value, str) and value for value in (photo_id, name, filename)):
            raise ValueError('每张照片都需要填写 id、name 和 file。')
        if photo_id in ids:
            raise ValueError(f'相册中有重复的 id：{photo_id}')
        ids.add(photo_id)
        photo = (folder / filename).resolve()
        if photo.parent != folder or photo.name != filename:
            raise ValueError('file 应填写 photos 文件夹内的 JPEG 文件名。')
        data = photo.read_bytes()
        if not data.startswith(b'\xff\xd8\xff'):
            raise ValueError(f'需要 JPEG 文件：{filename}')
        photos.append({'id': photo_id, 'name': name, 'src': 'data:image/jpeg;base64,' + encoded(data)})
    # An edited album starts with its own saved state, including when the same browser opens it.
    key = hashlib.sha256(json_text(photos).encode('utf-8')).hexdigest()[:20]
    return {'key': key, 'photos': photos}


def album_tag(album):
    safe = json_text(album).translate({
        ord('&'): r'\u0026', ord('<'): r'\u003c', ord('>'): r'\u003e',
        0x2028: r'\u2028', 0x2029: r'\u2029',
    })
    return '<script type="application/json" id="recording-album">' + safe + '</script>'


def resource_tags():
    for directory in (SITE / 'assets', SITE / 'vision'):
        for asset in sorted(directory.iterdir()):
            if not asset.is_file() or asset.suffix == '.ttf':
                continue
            data = asset.read_bytes()
            flag = ''
            if asset.suffix != '.jpg':
                data = gzip.compress(data, compresslevel=7, mtime=0)
                flag = ' data-gzip'
            name = asset.relative_to(SITE).as_posix()
            yield f'<script type="application/octet-stream" id="asset:{name}"{flag}>{encoded(data)}</script>'


def inline_script(match):
    filename = match.group(1).partition('?')[0]
    code = (SITE / filename).read_text(encoding='utf-8')
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'


def build(output):
    page = (SITE / 'index.html').read_text(encoding='utf-8')
    style = (SITE / 'style.css').read_text(encoding='utf-8')
    font = encoded((SITE / 'assets' / 'GreatVibes-Regular.ttf').read_bytes())
    style = style.replace('./assets/GreatVibes-Regular.ttf', 'data:font/ttf;base64,' + font)
    page, css_count = re.subn(r'<link rel="stylesheet" href="\./style\.css(?:\?[^"]*)?">',
                              lambda _: '<style>\n' + style + '\n</style>', page)
    if css_count != 1 or page.count(MARKER) != 1:
        raise ValueError('请检查 index.html 中的样式表标签与 portable-assets 标记。')
    page = re.sub(r'<script src="\./([^"]+)"></script>', inline_script, page)
    album = build_album()
    page = page.replace(MARKER, '\n'.join([*resource_tags(), album_tag(album)]))
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with NamedTemporaryFile('w', encoding='utf-8', newline='\n', dir=output.parent, delete=False) as temp:
            temporary_path = Path(temp.name)
            temp.write(page)
        temporary_path.replace(output)
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)
    print(f'{output.name}  |  {len(album["photos"])} 张相册照片  |  {output.stat().st_size / 1_000_000:.1f} MB')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '打开圣诞树.html')
    build(parser.parse_args().output.resolve())
