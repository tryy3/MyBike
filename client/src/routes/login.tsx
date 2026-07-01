import { useEffect } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { BikeIcon } from "lucide-react";
import { LoginForm } from "@/features/auth/LoginForm";

export function LoginPage() {
  const { redirect: redirectTo } = useSearch({ from: "/login" });

  useEffect(() => {
    document.title = "Sign in | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BikeIcon className="size-4" />
        </span>
        MyBike
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your bikes and components.
          </p>
        </div>
        <LoginForm redirectTo={redirectTo ?? "/"} />
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link to="/register" className="underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
