import { useEffect, useState } from "react";

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
    <div>
      <h1>MyBike</h1>
      <p>API: {health ? health.status : "loading..."}</p>
    </div>
  );
}
