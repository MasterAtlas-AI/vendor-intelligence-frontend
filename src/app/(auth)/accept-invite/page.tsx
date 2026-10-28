"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { TokenResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { errorMessage, passwordSchema } from "@/lib/validation";

const schema = z
  .object({
    full_name: z.string().trim().max(200).optional(),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function AcceptForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>This invitation link is incomplete. Ask your administrator to resend it.</AlertDescription>
      </Alert>
    );
  }

  const onSubmit = handleSubmit(async ({ full_name, password }) => {
    setError(null);
    try {
      const res = await api<TokenResponse>("/auth/invitations/accept", {
        method: "POST",
        body: { token, password, full_name: full_name || null },
        anonymous: true,
      });
      setSession(res.access_token, res.user);
      router.replace("/dashboard");
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
      <FormField id="full_name" label="Your name" hint="Leave blank to keep the name your administrator entered">
        <Input id="full_name" autoComplete="name" autoFocus {...register("full_name")} />
      </FormField>
      <FormField id="password" label="Password" error={formState.errors.password?.message}
        hint="12+ characters, mixing 3 of: lowercase, uppercase, digits, symbols">
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
      </FormField>
      <FormField id="confirm" label="Repeat password" error={formState.errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
      </FormField>
      <Button type="submit" disabled={formState.isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept your invitation</CardTitle>
        <CardDescription>Set a password to finish creating your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <AcceptForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
