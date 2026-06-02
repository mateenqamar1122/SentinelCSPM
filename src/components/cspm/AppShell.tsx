import { Link } from "react-router-dom";
import { Shield, LogOut, LogIn } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FloatingDock } from "./FloatingDock";

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut, roles } = useAuth();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-14 flex items-center justify-between border-b border-border bg-background/70 backdrop-blur-xl px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Link to="/dashboard" className="flex items-center gap-2 group shrink-0 ml-2">
                <div className="relative w-8 h-8 grid place-items-center rounded-full bg-primary text-primary-foreground">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="leading-tight">
                  <div className="text-base font-serif tracking-tight">Sentinel<span className="italic">CSPM</span></div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">unified security posture</div>
                </div>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {user ? (
                <>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {user.email} {roles.length > 0 && <span className="text-[10px] uppercase tracking-wider ml-1 px-1.5 py-0.5 rounded bg-secondary">{roles[0]}</span>}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => signOut()}>
                    <LogOut className="w-3.5 h-3.5" /> Sign out
                  </Button>
                </>
              ) : (
                <Button variant="cta" size="sm" asChild>
                  <Link to="/auth"><LogIn className="w-3.5 h-3.5" /> Sign in</Link>
                </Button>
              )}
            </div>
          </header>
          <main className="container pt-8 pb-24 flex-1 animate-fade-in">{children}</main>
          <footer className="border-t border-border py-6 mt-12">
            <div className="container flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span>SentinelCSPM · cloud security posture</span>
              <span>v0.1 · demo</span>
            </div>
          </footer>
        </div>
      </div>
      <FloatingDock />
    </SidebarProvider>
  );
};
