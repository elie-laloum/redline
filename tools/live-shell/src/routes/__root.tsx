import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
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
      {/* Le theme suit le systeme, et rien ne le pose : la feuille de style
          bascule sur `prefers-color-scheme`, donc le sombre est peint des la
          premiere frame, rendu serveur compris. Un script qui ajoutait `.dark`
          sur `<html>` avant hydratation vivait ici — il ne servait aucune regle
          CSS et ne produisait qu'une chose, un ecart d'hydratation signale a
          chaque chargement. */}
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
