import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "shared";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSignIn } from "./api";

interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo = "/" }: LoginFormProps) {
  const signIn = useSignIn();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((data) => {
    signIn.mutate(data, {
      onSuccess: () => {
        toast.success("Signed in");
        window.location.href = redirectTo;
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-email">Email</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-email-error" : undefined
                }
              />
              {fieldState.error ? (
                <FieldError
                  id="login-email-error"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                {...field}
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-password-error" : undefined
                }
              />
              {fieldState.error ? (
                <FieldError
                  id="login-password-error"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link to="/register" search={{ redirect: redirectTo }} className="underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
