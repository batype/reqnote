import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/reqnote/",
  plugins: [
    react(),
    {
      name: "production-csp",
      transformIndexHtml: {
        order: "post",
        handler(html, context) {
          if (context.server) return html;
          return html.replace(
            "<head>",
            "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'\">",
          );
        },
      },
    },
  ],
  build: { target: "es2022" },
  worker: { format: "es" },
});
