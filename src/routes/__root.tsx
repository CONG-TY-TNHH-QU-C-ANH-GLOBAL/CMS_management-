import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { CmsSidebar } from "@/components/app-shell/Sidebar";
import { CommandPalette } from "@/components/app-shell/CommandPalette";
import { CopilotWidget } from "@/features/copilot/components/CopilotWidget";
import { Toaster } from "@/components/ui/sonner";
import { meFn } from "@/features/auth/auth.actions";

// /admin/* requires Google OAuth session. Everything else (/, /login,
// /api/auth/*, /api/v1/*) is open. /api/v1/* serves landing via REST.
function requiresAuth(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

function isAppShellRoute(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    if (!requiresAuth(location.pathname)) return { user: null };
    const { user } = await meFn();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { user };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "THG Content OS — CMS quản trị nội dung" },
      { name: "description", content: "Hệ thống CMS quản lý nội dung landing page, blog, pricing và workflow agent cho THG Fulfill." },
      { name: "author", content: "THG Fulfill" },
      { property: "og:title", content: "THG Content OS — CMS quản trị nội dung" },
      { property: "og:description", content: "Hệ thống CMS quản lý nội dung landing page, blog, pricing và workflow agent cho THG Fulfill." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "THG Content OS — CMS quản trị nội dung" },
      { name: "twitter:description", content: "Hệ thống CMS quản lý nội dung landing page, blog, pricing và workflow agent cho THG Fulfill." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a692855-ccda-4099-a995-e33e5fe9dba0/id-preview-0d355495--84697f0d-2e11-4463-8a41-1095312c1f8c.lovable.app-1778399375177.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a692855-ccda-4099-a995-e33e5fe9dba0/id-preview-0d355495--84697f0d-2e11-4463-8a41-1095312c1f8c.lovable.app-1778399375177.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: appCss },
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showAppShell = isAppShellRoute(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      {showAppShell ? (
        <div className="flex min-h-screen w-full bg-background">
          <CmsSidebar />
          <main className="flex-1 min-w-0 flex flex-col">
            <Outlet />
          </main>
        </div>
      ) : (
        <Outlet />
      )}
      {showAppShell && <CommandPalette />}
      {showAppShell && <CopilotWidget />}
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
