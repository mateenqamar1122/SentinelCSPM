import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/cspm/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const statusStyles: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  accepted: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  in_progress: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  declined: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function MyEngagements() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("engagements").select("*").order("updated_at", { ascending: false });
      const ids = new Set<string>();
      (data ?? []).forEach((e) => { ids.add(e.startup_id); ids.add(e.pentester_id); });
      const { data: profs } = ids.size
        ? await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", Array.from(ids))
        : { data: [] as any[] };
      setProfiles(new Map((profs ?? []).map((p) => [p.user_id, p])));
      setItems(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const asStartup = items.filter((e) => e.startup_id === user.id);
  const asPentester = items.filter((e) => e.pentester_id === user.id);

  const renderList = (list: any[], counterpartKey: "pentester_id" | "startup_id", emptyMsg: string) => (
    list.length === 0 ? (
      <Card className="p-10 text-center">
        <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground mb-4">{emptyMsg}</p>
        <Button asChild variant="outline"><Link to="/marketplace">Browse marketplace</Link></Button>
      </Card>
    ) : (
      <div className="space-y-3">
        {list.map((e) => {
          const p = profiles.get(e[counterpartKey]);
          return (
            <Link key={e.id} to={`/dashboard/engagements/${e.id}`}>
              <Card className="p-4 hover:border-primary/50 transition-colors flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground text-sm font-semibold shrink-0">
                  {p?.display_name?.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold truncate">{e.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {counterpartKey === "pentester_id" ? "to" : "from"} {p?.display_name ?? "Unknown"} · {formatDistanceToNow(new Date(e.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant="outline" className={`capitalize ${statusStyles[e.status] ?? ""}`}>
                  {e.status.replace("_", " ")}
                </Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Card>
            </Link>
          );
        })}
      </div>
    )
  );

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-serif mb-1">Engagements</h1>
          <p className="text-sm text-muted-foreground">Hire requests and active pentests.</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading...</div>
        ) : (
          <Tabs defaultValue="hires">
            <TabsList>
              <TabsTrigger value="hires">As startup ({asStartup.length})</TabsTrigger>
              <TabsTrigger value="jobs">As pentester ({asPentester.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="hires" className="mt-4">
              {renderList(asStartup, "pentester_id", "You haven't sent any hire requests yet.")}
            </TabsContent>
            <TabsContent value="jobs" className="mt-4">
              {renderList(asPentester, "startup_id", "No incoming requests yet. Make sure your profile is published.")}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
