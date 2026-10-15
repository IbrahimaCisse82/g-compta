import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Sandbox-only: the Base44 preview proxy forwards requests with a
 * `<port>-<sandbox id>.$BASE44_SANDBOX_HOST_DOMAIN` Host header (the sandbox id
 * changes on every rebuild), which Vite's host check answers with 403, so the
 * whole app - page and assets - fails to load. Vite 5 has no
 * `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` support, hence the explicit wildcard.
 * Gated on Base44's preview flag: with the variable unset or any other value the
 * original configuration is used unchanged.
 */
const previewHostWildcard =
  process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_SANDBOX_HOST_DOMAIN
    ? `.${process.env.BASE44_SANDBOX_HOST_DOMAIN}`
    : undefined;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    ...(previewHostWildcard ? { allowedHosts: [previewHostWildcard] } : {}),
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
