import { useEffect } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { BikeIcon } from "lucide-react";
import { RegisterForm } from "@/features/auth/RegisterForm";

export function RegisterPage() {
  const { redirect: redirectTo } = useSearch({ from: "/register" });

  useEffect(() => {
    document.title = "Create account | MyBike";
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Create account
          </h1>
          <p className="text-sm text-muted-foreground">
            Start tracking your bikes and interchangeable components.
          </p>
        </div>
        <RegisterForm redirectTo={redirectTo ?? "/"} />
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link
          to="/login"
          search={{ redirect: redirectTo }}
          className="underline"
        >
          Sign in instead
        </Link>
      </p>
    </div>
  );
}
