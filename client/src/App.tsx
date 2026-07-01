import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Health {
  status: string;
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth);
  }, []);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>MyBike</CardTitle>
            <Badge variant="secondary">v0</Badge>
          </div>
          <CardDescription>Service health check</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            API: {health ? health.status : "loading..."}
          </p>
          <Button onClick={() => setHealth(null)}>Refresh</Button>
        </CardContent>
      </Card>
    </div>
  );
}
