import nextra from "nextra";

const withNextra = nextra({
  latex: false,
  search: {
    codeblocks: false,
  },
  contentDirBasePath: "/",
});

export default withNextra({
  reactStrictMode: true,
});
