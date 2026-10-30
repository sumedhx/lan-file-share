from flask import Flask, request, render_template, send_from_directory, redirect, url_for, flash, abort
from pathlib import Path
from werkzeug.utils import secure_filename
import os

app = Flask(__name__)
app.secret_key = os.environ.get("LAN_SHARE_SECRET", os.urandom(32).hex())

SHARE_DIR = Path.home() / "LAN-File-Share"
SHARE_DIR.mkdir(parents=True, exist_ok=True)

# MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1 GB per request
MAX_FILE_SIZE = int(2.5 * 1024 * 1024 * 1024)  # 2.5 GB
# MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB


@app.get("/")
def index():
    current = request.args.get("path", "")
    folder = (SHARE_DIR / current).resolve()

    if not folder.is_relative_to(SHARE_DIR.resolve()) or not folder.is_dir():
        return "Invalid folder", 400

    items = []
    for item in sorted(folder.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        items.append({
            "name": item.name,
            "is_dir": item.is_dir(),
            "size": item.stat().st_size if item.is_file() else None
        })

    return render_template("index.html", items=items, current=current)


@app.post("/upload")
def upload():
    current = request.form.get("path", "")
    folder = (SHARE_DIR / current).resolve()

    if not folder.is_relative_to(SHARE_DIR.resolve()) or not folder.is_dir():
        return "Invalid folder", 400

    files = request.files.getlist("files")

    for file in files:
        if not file.filename:
            continue

        filename = secure_filename(file.filename)
        if not filename:
            continue

        destination = folder / filename

        # Avoid overwriting existing files.
        if destination.exists():
            stem, suffix = destination.stem, destination.suffix
            counter = 1
            while destination.exists():
                destination = folder / f"{stem}_{counter}{suffix}"
                counter += 1

        file.save(destination)

    return redirect(url_for("index", path=current))


@app.get("/download/<path:filename>")
def download(filename):
    current = request.args.get("path", "")
    folder = (SHARE_DIR / current).resolve()
    target = (folder / filename).resolve()

    if not folder.is_relative_to(SHARE_DIR.resolve()):
        return "Invalid folder", 400

    if not target.is_relative_to(folder) or not target.is_file():
        return "File not found", 404

    return send_from_directory(folder, target.name, as_attachment=True)


@app.post("/mkdir")
def mkdir():
    current = request.form.get("path", "")
    name = secure_filename(request.form.get("name", ""))
    folder = (SHARE_DIR / current).resolve()

    if not folder.is_relative_to(SHARE_DIR.resolve()) or not folder.is_dir():
        return "Invalid folder", 400

    if not name:
        return "Invalid folder name", 400

    (folder / name).mkdir(exist_ok=False)
    return redirect(url_for("index", path=current))


def get_safe_folder(relative_path=""):
    root = SHARE_DIR.resolve()
    folder = (root / relative_path).resolve()

    if not folder.is_relative_to(root) or not folder.is_dir():
        abort(400, "Invalid folder")

    return folder

@app.post("/upload-folder")
def upload_folder():
    current = request.form.get("path", "")
    folder = get_safe_folder(current)

    files = request.files.getlist("files")

    for file in files:
        if not file.filename:
            continue

        # Browser supplies paths such as Photos/Subfolder/image.jpg
        relative_path = Path(file.filename)

        # Reject unsafe paths
        if relative_path.is_absolute() or ".." in relative_path.parts:
            abort(400, "Invalid file path")

        # Keep the selected folder's name
        destination = (folder / relative_path).resolve()

        if not destination.is_relative_to(folder):
            abort(400, "Invalid file path")

        destination.parent.mkdir(parents=True, exist_ok=True)

        # Avoid overwriting existing files
        if destination.exists():
            stem = destination.stem
            suffix = destination.suffix
            parent = destination.parent
            counter = 1

            while destination.exists():
                destination = parent / f"{stem}_{counter}{suffix}"
                counter += 1

        file.save(destination)

    return "", 200

if __name__ == "__main__":
    app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE
    app.run(host="0.0.0.0", port=8000, debug=False)
