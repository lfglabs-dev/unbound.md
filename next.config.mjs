import nextra from "nextra";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const withNextra = nextra({
  latex: false,
  search: {
    codeblocks: false,
  },
  contentDirBasePath: "/",
});

export default withNextra({
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "next-mdx-import-source-file": "./next-mdx-import-source-file.ts",
    },
  },
});
