"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";

const schema = z.object({ email: z.email("Enter a valid email") });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    // The API answers the same whether or not the account exists, so this never reveals who has an account.
    await api("/auth/password/forgot", { method: "POST", body: values, anonymous: true }).catch(() => undefined);
    setSent(true);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          {sent
            ? "If an account exists for that email, a reset link is on its way. It expires in 30 minutes."
            : "We'll email you a link to choose a new password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!sent && (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <FormField id="email" label="Email" error={formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
            </FormField>
            <Button type="submit" disabled={formState.isSubmitting}>
              Send reset link
            </Button>
          </form>
        )}
        <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
