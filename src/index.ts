import { Parser, ParserOptions } from "prettier";
import { parsers as htmlParsers } from "prettier/parser-html";
import { OrganizeOptionsSort, miniorganize } from "./organize";
import { PRESETS, PRESET_KEYS } from "./presets";

const prettierParsers = htmlParsers as any;

export const parsers = {
  html: wrapParser(prettierParsers.html),
  vue: wrapParser(prettierParsers.vue),
  angular: wrapParser(prettierParsers.angular),
  blade: wrapBladeParser(),
};

export const options: {
  [K in keyof PrettierPluginOrganizeAttributesParserOptions]: any;
} = {
  attributeGroups: {
    type: "string",
    category: "Global",
    array: true,
    description: "Provide an order to organize HTML attributes into groups.",
    default: [{ value: [] }],
  },
  attributeSort: {
    type: "string",
    category: "Global",
    description:
      "attributeSort HTML attribute groups internally. ASC, DESC or NONE.",
  },
  attributeIgnoreCase: {
    type: "boolean",
    category: "Global",
    description: "A flag to ignore casing in regexps or not.",
    default: true,
  },
};

interface HTMLNode {
  children?: HTMLNode[];
  attrMap?: { [key: string]: any };
  attrs?: { name: string; value: any }[];
  value?: string;
  type: string;
}

function wrapParser(parser: Parser<any>): Parser<any> {
  return {
    ...parser,
    parse: transformPostParse(parser.parse),
  };
}

function wrapBladeParser(): Parser<any> {
  let realParser: Parser<any> | null = null;
  return {
    astFormat: "blade-ast",
    locStart: (node) => realParser?.locStart(node) ?? 0,
    locEnd: (node) => realParser?.locEnd(node) ?? 0,
    parse: (text, options) => {
      const opts = options as ParserOptions & PrettierPluginOrganizeAttributesParserOptions;
      realParser = (opts.plugins as any[])?.find(
        (p) => p?.parsers?.blade && (p.printers?.blade || p.printers?.["blade-ast"])
      )?.parsers?.blade ?? null;
      if (!realParser) return {};
      const ast = realParser.parse(text, opts);
      const sort: OrganizeOptionsSort = opts.attributeSort === "NONE" ? false : opts.attributeSort;
      transformBladeNode(ast, [...opts.attributeGroups], sort, opts.attributeIgnoreCase);
      return ast;
    },
  };
}

function transformPostParse(parse: Parser<any>["parse"]): Parser<any>["parse"] {
  return (text, options) =>
    transformRootNode(
      parse(text, options),
      options as ParserOptions & PrettierPluginOrganizeAttributesParserOptions
    );
}

function transformRootNode(
  node: HTMLNode,
  options: ParserOptions & PrettierPluginOrganizeAttributesParserOptions
) {
  const sort: OrganizeOptionsSort =
    options.attributeSort === "NONE" ? false : options.attributeSort;
  const groups = [...options.attributeGroups];
  const ignoreCase = options.attributeIgnoreCase;

  if (groups.length === 0) {
    switch (options.parser.toString().toLowerCase()) {
      case "angular":
        groups.push(PRESET_KEYS.$ANGULAR);
        break;
      case "vue":
        groups.push(PRESET_KEYS.$VUE);
        break;
      case "html":
      default:
        groups.push(PRESET_KEYS.$HTML);
    }
  }

  transformNode(node, groups, sort, ignoreCase);
  return node;
}

function transformNode(
  node: HTMLNode,
  groups: string[],
  sort: OrganizeOptionsSort,
  ignoreCase = true
): void {
  if (node.attrs) {
    node.attrs = miniorganize(node.attrs, {
      presets: PRESETS,
      ignoreCase,
      groups,
      sort,
      map: ({ name }) => name,
    }).flat;
  }

  node.children?.forEach((child) =>
    transformNode(child, groups, sort, ignoreCase)
  );
}

function transformBladeNode(
  node: any,
  groups: string[],
  sort: OrganizeOptionsSort,
  ignoreCase = true,
  seen = new WeakSet<object>()
): void {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);

  if (node.attrs?.length && node.attrs[0].source) {
    node.attrs = miniorganize(node.attrs, {
      presets: PRESETS,
      ignoreCase,
      groups,
      sort,
      map: (attr: any) =>
        attr.source.slice(attr.start, attr.end).split("=")[0].trim(),
    }).flat;
  }

  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child))
      child.forEach((c) => transformBladeNode(c, groups, sort, ignoreCase, seen));
    else if (child && typeof child === "object")
      transformBladeNode(child, groups, sort, ignoreCase, seen);
  }
}

export type PrettierPluginOrganizeAttributesParserOptions = {
  attributeGroups: string[];
  attributeSort: "ASC" | "DESC" | "NONE";
  attributeIgnoreCase: boolean;
};
