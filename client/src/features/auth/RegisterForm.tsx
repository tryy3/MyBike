import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { registerSchema, type RegisterInput } from "shared";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSignUp } from "./api";

export function RegisterForm() {
  const signUp = useSignUp();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((data) => {
    signUp.mutate(data, {
      onSuccess: () => {
        toast.success("Account created");
        window.location.href = "/";
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
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-name">Name</FieldLabel>
              <Input
                {...field}
                id="register-name"
                autoComplete="name"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-email">Email</FieldLabel>
              <Input
                {...field}
                id="register-email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-password">Password</FieldLabel>
              <Input
                {...field}
                id="register-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" search={{ redirect: undefined }} className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
