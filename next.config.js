/** @type {import('next').NextConfig} */
const nextConfig = {
  // Old page URLs, kept working after the 1 Sep 2026 nav rename ("Submit
  // Audit"/"H&S Walkaround" -> "POS Check"/"H&S Check") so any existing
  // bookmarks or shared links don't break. Permanent (308) redirects,
  // handled at the edge before a page ever renders.
  async redirects() {
    return [
      { source: "/upload", destination: "/pos-check", permanent: true },
      { source: "/hs-walkaround", destination: "/hs-check", permanent: true },
    ];
  },
};

module.exports = nextConfig;
