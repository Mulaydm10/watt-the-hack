import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@core": fileURLToPath(new URL("../packages/core/src", import.meta.url)) },
  },
  // .env with the AI key stays in app/; core reads import.meta.env through Vite
  envDir: ".",
  server: { fs: { allow: [".."] } },
});
