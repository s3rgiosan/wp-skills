"""to-markdown.py — convert a user guide HTML page into Markdown.

Reads the guide page written to the HTML output contract (see references/outputs.md) and writes Markdown that
keeps its relative image links (`shots/<id>.png`), so the .md file and a copy of the shots/ folder can live side
by side in a repository or a wiki. Index links point at GitHub-style heading anchors.

Usage:
  python3 to-markdown.py guide.html guide.md
  python3 to-markdown.py --help

Requires Beautiful Soup 4: pip install beautifulsoup4
"""
import os
import re
import sys

from bs4 import BeautifulSoup, NavigableString, Tag

CIRCLED = "⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
USAGE = "usage: python3 to-markdown.py guide.html guide.md"
HEADING_LEVELS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
SKIPPED_INLINE_TAGS = ("script", "style")
BLOCK_TAGS = ("p", "ul", "ol", "figure", "div", "dl", "table", "blockquote", "hr", "pre") + tuple(HEADING_LEVELS)
UNSUPPORTED_TAGS = ("section", "nav", "video", "audio", "iframe")


def fail(message):
    print(f"error: {message}", file=sys.stderr)
    sys.exit(2)


def warn(message):
    print(f"warning: {message}", file=sys.stderr)


def warn_skipped(node, parent=""):
    if isinstance(node, Tag):
        label = node.name + "".join(f".{c}" for c in node.get("class", []))
    else:
        label = "#text"
    warn(f"skipped {parent}{label}")


def is_text(node):
    # Comment, Doctype, CData and similar are NavigableString subclasses; only plain text counts.
    return type(node) is NavigableString


def clean(text):
    return re.sub(r"\s+", " ", text).strip()


def slug(text):
    """GitHub heading anchor: lowercase, punctuation dropped, each space becoming a hyphen."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = text.strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"\s", "-", text)


def escape(text):
    """Backslash-escape the characters that would turn plain text into Markdown syntax."""
    text = re.sub(r"([\\\[\]*`<~]|&(?=#?\w+;))", r"\\\1", text)
    return re.sub(r"(?<![^\W_])_|_(?![^\W_])", r"\\_", text)


def link_target(url):
    return url.replace(" ", "%20").replace("(", "%28").replace(")", "%29").replace("<", "%3C").replace(">", "%3E")


def unique_slug(base, used):
    candidate = base
    suffix = 0
    while candidate in used:
        suffix += 1
        candidate = f"{base}-{suffix}"
    used.add(candidate)
    return candidate


def wrap(inner, before, after):
    """Put Markdown markers around the text, keeping the surrounding whitespace outside them."""
    match = re.match(r"(\s*)(.*?)(\s*)$", inner, re.S)
    lead, core, trail = match.groups()
    if not core:
        return inner
    return f"{lead}{before}{core}{after}{trail}"


def code_span(text):
    text = clean(text)
    if not text:
        return ""
    runs = re.findall(r"`+", text)
    fence = "`" * (max(len(r) for r in runs) + 1) if runs else "`"
    pad = " " if text.startswith("`") or text.endswith("`") else ""
    return f"{fence}{pad}{text}{pad}{fence}"


def inline_nodes(nodes, anchors, br=" "):
    """Render inline nodes. `br` is the text a <br> becomes."""
    out = []
    for child in nodes:
        if is_text(child):
            out.append(escape(re.sub(r"\s+", " ", str(child))))
            continue
        if not isinstance(child, Tag) or child.name in SKIPPED_INLINE_TAGS:
            continue
        if child.name in UNSUPPORTED_TAGS:
            warn_skipped(child)
            continue
        name = child.name
        classes = child.get("class", [])
        if name == "br":
            out.append(br)
        elif name == "span" and "n" in classes:
            raw = child.get_text(strip=True)
            if re.fullmatch(r"[0-9]+", raw):
                number = int(raw)
                out.append(CIRCLED[number] if number < len(CIRCLED) else f"({number})")
            else:
                out.append(escape(raw))
        elif name in ("b", "strong"):
            out.append(wrap(inline_nodes(child.children, anchors, br), "**", "**"))
        elif name in ("i", "em"):
            out.append(wrap(inline_nodes(child.children, anchors, br), "*", "*"))
        elif name in ("code", "kbd"):
            out.append(code_span(child.get_text()))
        elif name == "a":
            href = child.get("href", "")
            inner = inline_nodes(child.children, anchors, " ")
            if not href:
                out.append(inner)
                continue
            if href.startswith("#"):
                href = "#" + anchors.get(href[1:], href[1:])
            out.append(wrap(inner, "[", f"]({link_target(href)})"))
        elif name == "img":
            src = child.get("src")
            if src:
                out.append(f"![{escape(child.get('alt', ''))}]({link_target(src)})")
            else:
                warn_skipped(child)
        elif name in ("ul", "ol"):
            continue
        elif name in ("p", "div"):
            out.append(" " + inline_nodes(child.children, anchors, br) + " ")
        else:
            out.append(inline_nodes(child.children, anchors, br))
    return "".join(out)


def inline_text(node, anchors):
    """Render a node's children as one whitespace-normalised line."""
    return clean(inline_nodes(node.children, anchors, " "))


def paragraph(nodes, anchors):
    """Render inline nodes as paragraph lines; a <br> ends a line with a Markdown hard break."""
    lines = [clean(line) for line in inline_nodes(nodes, anchors, "\n").split("\n")]
    lines = [line for line in lines if line]
    return [line + "  " for line in lines[:-1]] + lines[-1:]


def quote(lines):
    return [f"> {line}" if line.strip() else ">" for line in lines]


def blocks_of(node, anchors, tight=False):
    """Render a node's children as blocks; runs of inline content become paragraphs.

    With `tight`, a list directly after a run of inline content follows it without a blank line.
    """
    lines = []
    run = []

    def add(chunk, joined=False):
        if chunk:
            if lines and not joined:
                lines.append("")
            lines.extend(chunk)

    for child in node.children:
        if isinstance(child, Tag) and child.name in BLOCK_TAGS:
            lead = paragraph(run, anchors)
            add(lead)
            run = []
            add(block(child, anchors), tight and bool(lead) and child.name in ("ul", "ol"))
        else:
            run.append(child)
    add(paragraph(run, anchors))
    return lines


def list_start(node):
    try:
        return int(node.get("start", 1))
    except ValueError:
        return 1


def list_md(node, anchors):
    lines = []
    ordered = node.name == "ol"
    number = list_start(node)
    for li in node.find_all("li", recursive=False):
        marker = f"{number}." if ordered else "-"
        number += 1
        indent = " " * (len(marker) + 1)
        body = blocks_of(li, anchors, tight=True)
        if not body:
            lines.append(marker)
            continue
        lines.append(f"{marker} {body[0]}")
        lines += [f"{indent}{line}" if line else "" for line in body[1:]]
    return lines


def span_of(cell, attribute):
    try:
        return max(1, int(cell.get(attribute, 1)))
    except ValueError:
        return 1


def table_cells(row, anchors):
    cells = []
    for cell in row.find_all(["th", "td"]):
        cells.append(inline_text(cell, anchors).replace("|", "\\|"))
        cells += [""] * (span_of(cell, "colspan") - 1)
    return cells


def table_md(table, anchors):
    rows = table.find_all("tr")
    if not rows:
        warn_skipped(table)
        return []
    head_rows = table.select("thead > tr")
    first = rows[0]
    has_header = bool(head_rows) and head_rows[0] is first
    if not has_header:
        cells = first.find_all(["th", "td"])
        has_header = bool(cells) and all(c.name == "th" for c in cells)
    if any(span_of(cell, "rowspan") > 1 for cell in table.find_all(["th", "td"])):
        warn("table rowspan is not supported; the cells below a spanning cell are not aligned")
    matrix = [table_cells(r, anchors) for r in rows]
    width = max(len(r) for r in matrix)
    if width == 0:
        warn_skipped(table)
        return []
    matrix = [r + [""] * (width - len(r)) for r in matrix]
    if has_header:
        header, body = matrix[0], matrix[1:]
    else:
        header, body = [""] * width, matrix
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join("---" for _ in header) + " |"]
    return lines + ["| " + " | ".join(r) + " |" for r in body]


def heading(node, anchors):
    return [f"{'#' * HEADING_LEVELS[node.name]} {inline_text(node, anchors)}"]


def paragraph_block(node, anchors):
    return paragraph(node.children, anchors)


def list_block(node, anchors):
    return list_md(node, anchors)


def figure_block(node, anchors):
    img = node.find("img")
    src = img.get("src") if img else None
    if not src:
        warn_skipped(node)
        return []
    lines = [f"![{escape(img.get('alt', ''))}]({link_target(src)})"]
    cap = node.find("figcaption")
    if cap:
        caption = inline_text(cap, anchors)
        if caption:
            lines += ["", f"*{caption}*"]
    return lines


def check_items(node, anchors):
    """Render a list of checklist items as `- [ ]` lines, nested lists indented under their item."""
    lines = []
    for li in node.find_all("li", recursive=False):
        text = inline_text(li, anchors)
        nested = []
        for sub in li.find_all(["ul", "ol"], recursive=False):
            nested += check_items(sub, anchors)
        if text:
            lines.append(f"- [ ] {text}")
            lines += [f"  {line}" for line in nested]
        else:
            lines += nested
    return lines


def check_block(node, anchors):
    lines = []
    title = next(iter(child_tags(node, ("h3",))), None)
    if title:
        lines += [f"**{inline_text(title, anchors)}**", ""]
    previous_items = False
    for child in node.children:
        if child is title:
            continue
        items = isinstance(child, Tag) and child.name in ("label", "ul", "ol")
        if not items:
            chunk = block(child, anchors)
        elif child.name == "label":
            text = inline_text(child, anchors)
            chunk = [f"- [ ] {text}"] if text else []
        else:
            chunk = check_items(child, anchors)
        if not chunk:
            continue
        if lines and lines[-1] != "" and not (items and previous_items):
            lines.append("")
        lines += chunk
        previous_items = items
    return lines


def definition_block(node, anchors):
    lines = []
    terms = []
    for child in node.find_all(["dt", "dd"], recursive=False):
        if child.name == "dt":
            terms.append(f"**{inline_text(child, anchors)}**")
            continue
        definition = inline_text(child, anchors)
        lines.append(f"- {', '.join(terms)}: {definition}" if terms else f"- {definition}")
        terms = []
    if terms:
        lines.append(f"- {', '.join(terms)}")
    return lines


def quote_block(node, anchors):
    return quote(blocks_of(node, anchors))


def pre_block(node, anchors):
    code = node.find("code")
    classes = node.get("class", []) + (code.get("class", []) if code else [])
    language = next((c[len("language-"):] for c in classes if c.startswith("language-")), "")
    text = node.get_text()
    if text.startswith("\n"):
        text = text[1:]
    runs = re.findall(r"`+", text)
    fence = "`" * max(3, max((len(r) for r in runs), default=0) + 1)
    return [f"{fence}{language}"] + text.rstrip("\n").split("\n") + [fence]


def rule_block(node, anchors):
    return ["---"]


def table_block(node, anchors):
    return table_md(node, anchors)


def div_block(node, anchors):
    classes = node.get("class", [])
    if "note" in classes:
        return quote(blocks_of(node, anchors))
    if "check" in classes:
        return check_block(node, anchors)
    if "table-wrap" in classes:
        table = node.find("table")
        if table:
            return table_md(table, anchors)
    warn_skipped(node)
    return []


BLOCK_HANDLERS = {
    "p": paragraph_block,
    "ul": list_block,
    "ol": list_block,
    "figure": figure_block,
    "dl": definition_block,
    "blockquote": quote_block,
    "hr": rule_block,
    "pre": pre_block,
    "table": table_block,
    "div": div_block,
    **{name: heading for name in HEADING_LEVELS},
}


def block(node, anchors):
    if not isinstance(node, Tag):
        if is_text(node) and node.strip():
            warn_skipped(node)
        return []
    handler = BLOCK_HANDLERS.get(node.name)
    if handler is None:
        if node.name not in SKIPPED_INLINE_TAGS:
            warn_skipped(node)
        return []
    return handler(node, anchors)


def child_tags(node, names):
    return [c for c in node.children if isinstance(c, Tag) and c.name in names]


def parse_contract(soup):
    """Return (cover, lede, toc_title, sections), exiting with a message when a contract element is missing."""
    cover = soup.select_one("header.cover")
    if cover is None:
        fail("missing header.cover")
    if cover.find("h1") is None:
        fail("missing header.cover h1")
    lede = cover.select_one(".lede")
    if lede is None:
        fail("missing header.cover .lede")
    toc_title = soup.select_one("nav.toc h2")
    if toc_title is None:
        fail("missing nav.toc h2")
    sections = soup.select("main > section[id]")
    if not sections:
        fail("missing main > section[id]")
    seen = set()
    for section in sections:
        if section["id"] in seen:
            fail(f"duplicate section id: {section['id']}")
        seen.add(section["id"])
        if not child_tags(section, ("h2",)):
            fail(f"missing h2 in main > section#{section['id']}")
    for main in soup.select("main"):
        for child in main.children:
            is_section = isinstance(child, Tag) and child.name == "section" and child.get("id")
            is_cover = child is cover
            is_blank = is_text(child) and not child.strip()
            if not (is_section or is_cover or is_blank) and (isinstance(child, Tag) or is_text(child)):
                warn_skipped(child, "main > ")
    for link in soup.select('nav.toc a[href^="#"]'):
        target = link["href"][1:]
        if target not in seen:
            warn(f"nav.toc link #{target} has no matching section")
    return cover, lede, toc_title, sections


def build_anchors(cover, toc_title, sections):
    """Map every section id and heading id to the GitHub-style anchor of its heading, numbering duplicates."""
    used = set()
    heading_slugs = {}
    ordered = [cover.find("h1"), toc_title]
    for section in sections:
        ordered += child_tags(section, tuple(HEADING_LEVELS))
    for node in ordered:
        heading_slugs[id(node)] = unique_slug(slug(inline_text(node, {})), used)
    anchors = {}
    for section in sections:
        anchors[section["id"]] = heading_slugs[id(child_tags(section, ("h2",))[0])]
    for node in ordered:
        if node.get("id"):
            anchors.setdefault(node["id"], heading_slugs[id(node)])
    return anchors, heading_slugs


def convert(soup):
    cover, lede, toc_title, sections = parse_contract(soup)
    anchors, heading_slugs = build_anchors(cover, toc_title, sections)
    out = [
        f"# {inline_text(cover.find('h1'), anchors)}",
        "",
        inline_text(lede, anchors),
        "",
        f"## {inline_text(toc_title, anchors)}",
        "",
    ]
    for section in sections:
        first_h2 = child_tags(section, ("h2",))[0]
        title = slug_free_text(inline_text(first_h2, anchors))
        out.append(f"- [{title}](#{heading_slugs[id(first_h2)]})")
    for section in sections:
        out.append("")
        for child in section.children:
            lines = block(child, anchors)
            if lines:
                out += lines + [""]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"


def slug_free_text(text):
    """Heading text with Markdown links reduced to their labels, for use as an index link label."""
    return re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)


def main(src, dest):
    if not os.path.isfile(src):
        fail(f"source file not found: {src}")
    try:
        with open(src, encoding="utf-8") as handle:
            soup = BeautifulSoup(handle.read(), "html.parser")
        text = convert(soup)
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        with open(dest, "w", encoding="utf-8") as handle:
            handle.write(text)
    except (OSError, UnicodeDecodeError) as error:
        fail(str(error))


if __name__ == "__main__":
    if any(arg in ("--help", "-h") for arg in sys.argv[1:]):
        print(f"{USAGE}\n\nConverts the guide HTML page to Markdown with relative image links.")
        sys.exit(0)
    if len(sys.argv) != 3:
        print(USAGE, file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
