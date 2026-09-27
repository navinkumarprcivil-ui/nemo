#!/usr/bin/env python3
"""
Decode a Firebase `media` export and write shrunk JPEGs ready for assets/media/.

Replaces the python + `sips` pair in docs/BANDWIDTH.md. Works on Windows, macOS and Linux;
needs Pillow once:  pip install Pillow

Run it in the folder holding the exported JSON:  python shrink-media.py
Optionally point it at your checkout so already-migrated keys are skipped:
    python shrink-media.py --repo C:\\path\\to\\nemo
"""
import argparse, base64, glob, io, json, os, sys

ap = argparse.ArgumentParser()
ap.add_argument("--repo", default="", help="path to the nemo checkout; skips keys already in assets/media/")
ap.add_argument("--out", default="media", help="output folder (default: ./media)")
args = ap.parse_args()

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is missing.  Run:  pip install Pillow")

exports = sorted(glob.glob("*media-export*.json"), key=os.path.getmtime)
if not exports:
    sys.exit("No *media-export*.json here. Export the `media` node from the Firebase console first.")
src = exports[-1]
print(f"reading {src}")

existing = set()
if args.repo:
    d = os.path.join(args.repo, "assets", "media")
    if not os.path.isdir(d):
        sys.exit(f"No assets/media/ under {args.repo}")
    existing = {os.path.splitext(f)[0] for f in os.listdir(d)}
    print(f"{len(existing)} keys already migrated — those will be skipped")

os.makedirs(args.out, exist_ok=True)
data = json.load(open(src, encoding="utf-8"))

wrote = skipped = urls = videos = failed = 0
for key, val in data.items():
    if not isinstance(val, str):
        continue
    if not val.startswith("data:"):
        urls += 1          # a https:// URL from a Storage upload — nothing to decode
        continue
    if "video" in val[:40]:
        videos += 1        # videos are not migrated; they stay in the database
        continue
    if key in existing:
        skipped += 1
        continue
    try:
        raw = base64.b64decode(val.partition(",")[2])
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as e:
        print(f"  ! {key}: {e}")
        failed += 1
        continue

    # JPEG holds no transparency. Flatten onto white rather than letting it go black.
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        flat = Image.new("RGB", img.size, (255, 255, 255))
        flat.paste(img, mask=img.split()[-1])
        img = flat
    elif img.mode != "RGB":
        img = img.convert("RGB")

    cap = 320 if key.endswith("_thumb") else 1000
    if max(img.size) > cap:
        img.thumbnail((cap, cap), Image.LANCZOS)

    img.save(os.path.join(args.out, key + ".jpg"), "JPEG", quality=60, optimize=True, progressive=True)
    wrote += 1

print(f"\nwrote {wrote} images to {os.path.abspath(args.out)}")
if skipped: print(f"skipped {skipped} already in assets/media/")
if urls:    print(f"ignored {urls} that were already URLs, not base64")
if videos:  print(f"ignored {videos} video(s) — these stay in the database")
if failed:  print(f"FAILED on {failed} — listed above")
if wrote == 0:
    print("\nNothing new to migrate.")
