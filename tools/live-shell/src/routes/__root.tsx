import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "autopilot — live" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
        {/* Le theme suit le systeme, sans flash : le shell s'ouvre tout seul
            dans le navigateur, il n'a pas de moment ou l'utilisateur choisit. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: une ligne, avant hydratation, sans donnee externe
          dangerouslySetInnerHTML={{
            __html:
              "if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
