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
      { property: "og:image", content: "https://sixdegreesofcinema.com/og.jpg" },
      { name: "twitter:image", content: "https://sixdegreesofcinema.com/og.jpg" },
      // PWA / iOS home screen
      { name: "theme-color", content: "#0a0907" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "6° Cinema" },
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
              url: "https://sixdegreesofcinema.com",
            },
            {
              "@type": "Organization",
              name: "Six Degrees of Cinema",
              url: "https://sixdegreesofcinema.com",
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", href: "/app-icon.png" },
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
