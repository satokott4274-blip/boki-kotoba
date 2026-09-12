"""Bundle the app into one HTML file using only Python's standard library."""

import argparse
from pathlib import Path


def main():
    site = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="簿記ことばの単体HTMLを生成します")
    parser.add_argument("--output", type=Path, default=site / "index.html")
    output = parser.parse_args().output
    html = (site / "dist/index.html").read_text(encoding="utf-8")
    css = (site / "dist/styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>" + css + "</style>")
    for name in ("data.js", "core.js", "app.js"):
        script = (site / "dist" / name).read_text(encoding="utf-8").replace("</script", r"<\/script")
        html = html.replace('<script src="' + name + '"></script>', "<script>" + script + "</script>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
