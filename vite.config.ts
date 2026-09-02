// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Pin the Node server preset instead of Nitro's `cloudflare-module` default.
  //
  // This is required, not a preference: the official MongoDB driver opens raw
  // TCP/TLS sockets and depends on Node built-ins (net, tls, dns). Cloudflare
  // Workers provide none of those, and the Workers polyfill layer (unenv) cannot
  // resolve the driver's transitive `punycode/` dependency, so the build fails
  // outright with UNLOADABLE_DEPENDENCY.
  //
  // Since MongoDB is the only database for this project, a Node runtime is the
  // deployment target. Returning to Cloudflare would require fronting MongoDB
  // with an HTTP data proxy.
  nitro: { preset: "node-server" },
});
