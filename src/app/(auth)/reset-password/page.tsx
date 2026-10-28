"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage, passwordSchema } from "@/lib/validation";

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>This reset link is incomplete. Request a new one.</AlertDescription>
      </Alert>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api("/auth/password/reset", { method: "POST", body: { token, new_password: password }, anonymous: true });
      toast.success("Password changed. Sign in with your new password.");
      router.replace("/login");
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FormField id="password" label="New password" error={formState.errors.password?.message}
        hint="12+ characters, mixing 3 of: lowercase, uppercase, digits, symbols">
        <Input id="password" type="password" autoComplete="new-password" autoFocus {...register("password")} />
      </FormField>
      <FormField id="confirm" label="Repeat password" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
      </FormField>
      <Button type="submit" disabled={formState.isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You&apos;ll be signed out of all other sessions.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Suspense>
          <ResetForm />
        </Suspense>
        <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
