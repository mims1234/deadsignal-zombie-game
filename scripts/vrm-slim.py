"""Slim a VRoid .vrm (VRM 0.x) for the web: every texture scaled down (bodies/clothes to MAX, face parts to MAX/2),
normal maps and the thumbnail swapped for tiny flat images, and the face blend shapes the game never uses removed (with
their normals). The glTF JSON keeps its indices. Needs ffmpeg on the PATH.
usage: python scripts/vrm-slim.py IN.vrm public/anime/OUT.vrm [MAX=1024]"""
import json, struct, subprocess, sys, os, tempfile

src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
b = open(src, 'rb').read()
jlen = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jlen])
boff = 20 + jlen + 8
bin_ = b[boff:boff + struct.unpack('<I', b[20 + jlen:24 + jlen])[0]]
tmp = tempfile.mkdtemp()

def png_size(d):
    return struct.unpack('>II', d[16:24]) if d[:8] == b'\x89PNG\r\n\x1a\n' else (0, 0)

def ff(data, w, h, flat=None):
    i, o = os.path.join(tmp, 'i.png'), os.path.join(tmp, 'o.png')
    open(i, 'wb').write(data)
    if flat:
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'color=c={flat}:s=4x4', '-frames:v', '1', o]
    else:
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', i, '-vf', f'scale={w}:{h}:flags=lanczos', '-compression_level', '9', o]
    subprocess.run(cmd, check=True)
    return open(o, 'rb').read()

# which images are normal maps (VRM0 material properties, and the glTF materials)
normals = set()
for mp in j.get('extensions', {}).get('VRM', {}).get('materialProperties', []):
    t = mp.get('textureProperties', {}).get('_BumpMap')
    if t is not None: normals.add(j['textures'][t]['source'])
for m in j['materials']:
    if 'normalTexture' in m: normals.add(j['textures'][m['normalTexture']['index']]['source'])
meta = j.get('extensions', {}).get('VRM', {}).get('meta', {})
thumb = j['textures'][meta['texture']]['source'] if 'texture' in meta else None

# keep only the morph targets the game's expressions use (and drop their normals): VRoid faces carry ~40
KEEP_PRESETS = {'a', 'i', 'u', 'e', 'o', 'blink', 'blink_l', 'blink_r', 'angry', 'fun', 'joy', 'sorrow'}
bsm = j.get('extensions', {}).get('VRM', {}).get('blendShapeMaster', {})
used = {}
for g in bsm.get('blendShapeGroups', []):
    if g.get('presetName') in KEEP_PRESETS or g.get('name') == 'Surprised':
        for x in g['binds']: used.setdefault(x['mesh'], set()).add(x['index'])
    else:
        g['binds'] = []
for mi, me in enumerate(j['meshes']):
    keep = sorted(used.get(mi, set()))
    remap = {old: new for new, old in enumerate(keep)}
    for pr in me['primitives']:
        if 'targets' not in pr: continue
        pr['targets'] = [{'POSITION': pr['targets'][k]['POSITION']} for k in keep]
        if not pr['targets']: del pr['targets']
        names = pr.get('extras', {}).get('targetNames')
        if names: pr['extras']['targetNames'] = [names[k] for k in keep]
    if 'weights' in me: me['weights'] = [me['weights'][k] for k in keep] or None
    if me.get('weights') is None: me.pop('weights', None)
    names = me.get('extras', {}).get('targetNames')
    if names: me['extras']['targetNames'] = [names[k] for k in keep]
    for g in bsm.get('blendShapeGroups', []):
        g['binds'] = [dict(x, index=remap[x['index']]) if x['mesh'] == mi else x for x in g['binds'] if x['mesh'] != mi or x['index'] in remap]
# accessors still referenced; the buffer views of the rest are emptied
live = set()
for me in j['meshes']:
    for pr in me['primitives']:
        live.update(pr['attributes'].values())
        if 'indices' in pr: live.add(pr['indices'])
        for t in pr.get('targets', []): live.update(t.values())
for sk in j.get('skins', []):
    if 'inverseBindMatrices' in sk: live.add(sk['inverseBindMatrices'])
for an in j.get('animations', []):
    for sm in an['samplers']: live.update((sm['input'], sm['output']))
live_views = {j['accessors'][a]['bufferView'] for a in live if 'bufferView' in j['accessors'][a]}
live_views |= {im['bufferView'] for im in j.get('images', []) if 'bufferView' in im}
dead_views = set(range(len(j['bufferViews']))) - live_views
views = j['bufferViews']
# rebuild the binary: every buffer view copied, images replaced
order = sorted(range(len(views)), key=lambda k: views[k].get('byteOffset', 0))
newbin = bytearray()
img_of_view = {im['bufferView']: n for n, im in enumerate(j.get('images', [])) if 'bufferView' in im}
before = after = 0
for k in order:
    v = views[k]
    data = bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    if k in dead_views:
        data = bytes(4)
    elif k in img_of_view:
        n = img_of_view[k]
        w, h = png_size(data)
        before += len(data)
        name = j['images'][n].get('name', '')
        if n in normals:
            data = ff(data, 0, 0, flat='0x8080ff')
        elif n == thumb:
            data = ff(data, 256, 256)
        elif w:
            face = any(s in name for s in ('Eye', 'Face', 'Brow', 'Mouth'))
            cap = MAX // 2 if face else MAX
            s = min(1, cap / max(w, h))
            if s < 1: data = ff(data, max(4, int(w * s)), max(4, int(h * s)))
        after += len(data)
        j['images'][n]['mimeType'] = 'image/png'
    while len(newbin) % 4: newbin.append(0)
    v['byteOffset'] = len(newbin)
    v['byteLength'] = len(data)
    newbin += data
while len(newbin) % 4: newbin.append(0)
j['buffers'][0]['byteLength'] = len(newbin)
js = json.dumps(j, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
while len(js) % 4: js += b' '
out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(newbin))
out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(newbin)) + b'BIN\x00' + bytes(newbin)
open(dst, 'wb').write(out)
print(f'{os.path.basename(src)}: {len(b)/1e6:.1f} MB -> {len(out)/1e6:.1f} MB (images {before/1e6:.1f} -> {after/1e6:.1f})')
