import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gold-bright font-display">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Scene not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This connection doesn't exist in our filmography.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md gradient-gold px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
          >
            Back to start
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-display text-gold-bright">Cut! Something went wrong.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md gradient-gold px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "S4YdAM0lesBWECFAQCv-S8bgQjvbac6vOt4x8q9Vv_A" },
      { title: "Six Degrees of Cinema — A Hollywood Movie Trivia Game" },
      {
        name: "description",
        content:
          "Connect two movie stars in six degrees or fewer using acting and directing credits. A daily Hollywood puzzle.",
      },
      { property: "og:title", content: "Six Degrees of Cinema — A Hollywood Movie Trivia Game" },
      {
        property: "og:description",
        content:
          "Connect two movie stars in six degrees or fewer using acting and directing credits. A daily Hollywood puzzle.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Six Degrees of Cinema" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Six Degrees of Cinema — A Hollywood Movie Trivia Game" },
      {
        name: "twitter:description",
        content:
          "Connect two movie stars in six degrees or fewer using acting and directing credits.",
      },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b3f65fa4-b7bb-45d7-b3b7-7c05190131e6/id-preview-c218b1fe--9c50da83-f9f6-4251-baec-551f0db8dd05.lovable.app-1779134867974.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b3f65fa4-b7bb-45d7-b3b7-7c05190131e6/id-preview-c218b1fe--9c50da83-f9f6-4251-baec-551f0db8dd05.lovable.app-1779134867974.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: "Six Degrees of Cinema",
              url: "https://sixdegreesofcinema.lovable.app",
            },
            {
              "@type": "Organization",
              name: "Six Degrees of Cinema",
              url: "https://sixdegreesofcinema.lovable.app",
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
