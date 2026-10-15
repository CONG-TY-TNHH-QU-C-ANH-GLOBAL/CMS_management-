import type { Element, ElementContent, Root, RootContent } from "hast";

const element = (
  tagName: string,
  children: ElementContent[],
  properties: Element["properties"] = {},
): Element => ({ type: "element", tagName, properties, children });
const text = (value: string): ElementContent => ({ type: "text", value });
function textOf(node: RootContent | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") {
    if (node.tagName === "img") return String(node.properties.alt ?? "");
    return node.children.map(textOf).join("");
  }
  return "";
}

/** One Markdown pass supplies both heading IDs and the outline, including rich headings. */
export function articleOutline({ label }: { label: string }) {
  return (tree: Root) => {
    const headings: { id: string; title: string; level: string }[] = [];
    const ids = new Set<string>();
    function walk(nodes: (RootContent | ElementContent)[]) {
      for (const node of nodes) {
        if (node.type !== "element") continue;
        if (node.tagName === "h2" || node.tagName === "h3") {
          const title = textOf(node).trim();
          if (!title) continue;
          const slug =
            title
              .normalize("NFD")
              .replace(/\p{M}/gu, "")
              .toLowerCase()
              .replace(/đ/g, "d")
              .replace(/[^\p{L}\p{N}]+/gu, "-")
              .replace(/^-|-$/g, "") || "section";
          const base = `article-${slug}`;
          let id = base;
          let suffix = 2;
          while (ids.has(id)) id = `${base}-${suffix++}`;
          ids.add(id);
          node.properties.id = id;
          node.properties.className = ["scroll-mt-28"];
          headings.push({ id, title, level: node.tagName });
        }
        walk(node.children);
      }
    }
    walk(tree.children);
    if (headings.length < 2) return;

    const list = element("ol", [], { className: ["space-y-2", "list-none", "p-0", "m-0"] });
    let parent: Element | undefined;
    let nested: Element | undefined;
    for (const heading of headings) {
      const item = element("li", [
        element("a", [text(heading.title)], {
          href: `#${heading.id}`,
          className: [
            "block",
            "py-1",
            "text-sm",
            "text-foreground",
            "hover:text-primary",
            "hover:underline",
            "break-words",
          ],
        }),
      ]);
      if (heading.level === "h3" && parent) {
        if (!nested) {
          nested = element("ol", [], { className: ["mt-2", "space-y-1", "list-none", "pl-5"] });
          parent.children.push(nested);
        }
        nested.children.push(item);
      } else {
        list.children.push(item);
        parent = heading.level === "h2" ? item : undefined;
        nested = undefined;
      }
    }
    tree.children.unshift(
      element(
        "nav",
        [
          element(
            "details",
            [
              element("summary", [text(label)], {
                className: ["cursor-pointer", "font-semibold", "mb-3"],
              }),
              list,
            ],
            { open: true },
          ),
        ],
        {
          ariaLabel: label,
          className: [
            "not-prose",
            "my-6",
            "rounded-xl",
            "border",
            "border-border",
            "bg-muted/40",
            "p-4",
            "sm:p-5",
          ],
        },
      ),
    );
  };
}
