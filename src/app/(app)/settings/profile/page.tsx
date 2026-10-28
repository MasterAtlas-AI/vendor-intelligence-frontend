"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { CurrentUser, UserRead } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { humanize } from "@/lib/format";
import { errorMessage, passwordSchema } from "@/lib/validation";

const nameSchema = z.object({ full_name: z.string().trim().min(1, "Required").max(200) });
const passwordFormSchema = z
  .object({ current_password: z.string().min(1, "Required"), new_password: passwordSchema, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function NameCard({ user }: { user: CurrentUser }) {
  const setSession = useAuth((s) => s.setSession);
  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { full_name: user.full_name },
  });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof nameSchema>) => api<UserRead>(`/users/${user.id}`, { method: "PATCH", body: v }),
    onSuccess: (u) => {
      const { accessToken } = useAuth.getState();
      if (accessToken) setSession(accessToken, { ...user, full_name: u.full_name });
      toast.success("Name updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            {user.email} · {[...user.platform_roles, ...user.roles].map(humanize).join(", ") || "No role"}
          </CardDescription>
        </CardHeader>
        <CardContent className="py-4">
          <FormField id="full_name" label="Full name" error={form.formState.errors.full_name?.message}>
            <Input id="full_name" autoComplete="name" {...form.register("full_name")} />
          </FormField>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const router = useRouter();
  const clearSession = useAuth((s) => s.clearSession);
  const form = useForm<z.infer<typeof passwordFormSchema>>({ resolver: zodResolver(passwordFormSchema) });
  const change = useMutation({
    mutationFn: (v: z.infer<typeof passwordFormSchema>) =>
      api("/auth/password/change", {
        method: "POST",
        body: { current_password: v.current_password, new_password: v.new_password },
      }),
    onSuccess: () => {
      // The backend signs out every session, including this one.
      toast.success("Password changed. Please sign in again.");
      clearSession();
      router.replace("/login");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit((v) => change.mutate(v))}>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>You&apos;ll be signed out on all devices.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 py-4">
          <FormField id="current_password" label="Current password" error={form.formState.errors.current_password?.message}>
            <Input id="current_password" type="password" autoComplete="current-password" {...form.register("current_password")} />
          </FormField>
          <FormField id="new_password" label="New password" error={form.formState.errors.new_password?.message}
            hint="12+ characters, mixing 3 of: lowercase, uppercase, digits, symbols">
            <Input id="new_password" type="password" autoComplete="new-password" {...form.register("new_password")} />
          </FormField>
          <FormField id="confirm" label="Repeat new password" error={form.formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
          </FormField>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={change.isPending}>
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ProfilePage() {
  const user = useAuth((s) => s.user)!;
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid max-w-xl gap-6">
        {/* Profile edits go through the tenant user API; platform staff names are set with the CLI. */}
        {user.tenant && <NameCard user={user} />}
        <PasswordCard />
      </div>
    </>
  );
}
