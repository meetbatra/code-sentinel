"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";

function formatDate(value: Date | null | undefined): string {
  if (!value) {
    return "Never";
  }
  return new Date(value).toLocaleString();
}

export default function IntegrationsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [value, setValue] = useState("");
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");

  const keysQuery = useQuery(trpc.integrations.listKeys.queryOptions());

  const createMutation = useMutation(
    trpc.integrations.createKey.mutationOptions({
      onSuccess: () => {
        setName("");
        setService("");
        setValue("");
        toast.success("API key saved.");
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const updateMutation = useMutation(
    trpc.integrations.updateKey.mutationOptions({
      onSuccess: () => {
        setEditingKeyId(null);
        setNewValue("");
        toast.success("API key rotated.");
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const deleteMutation = useMutation(
    trpc.integrations.deleteKey.mutationOptions({
      onSuccess: () => {
        toast.success("API key deleted.");
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const sortedKeys = useMemo(() => keysQuery.data ?? [], [keysQuery.data]);

  return (
    <>
      <Navbar />

      <main className="pt-20 pb-12 px-6 max-w-5xl mx-auto min-h-screen">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-5xl md:text-6xl font-arcade text-primary tracking-tighter uppercase leading-none">
              Integrations
            </h1>
            <p className="text-on-surface-variant text-sm mt-2 uppercase tracking-widest">
              Secure API key vault
            </p>
          </div>

          <Link
            href="/dashboard"
            className="h-9 px-4 inline-flex items-center bg-surface-container-high text-on-surface border border-outline font-headline font-black text-xs uppercase tracking-widest"
          >
            Back to Dashboard
          </Link>
        </div>

        <section className="mb-10 bg-surface-container-high p-5 border border-outline">
          <h2 className="font-headline text-xl font-black mb-4 uppercase">
            Add new key
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="STRIPE_TEST_KEY"
              autoComplete="off"
            />
            <Input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="stripe (optional)"
              autoComplete="off"
            />
            <Input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste secret value"
              autoComplete="off"
            />
          </div>
          <div className="mt-4">
            <Button
              onClick={() =>
                createMutation.mutate({
                  name: name.trim(),
                  service: service.trim() || undefined,
                  value,
                })
              }
              disabled={createMutation.isPending || !name.trim() || !value}
            >
              {createMutation.isPending ? "Saving..." : "Save key"}
            </Button>
          </div>
        </section>

        <section className="bg-surface-container-high p-5 border border-outline">
          <h2 className="font-headline text-xl font-black mb-4 uppercase">
            Stored keys
          </h2>

          {keysQuery.isLoading ? (
            <p className="text-on-surface-variant">Loading keys…</p>
          ) : sortedKeys.length === 0 ? (
            <p className="text-on-surface-variant">
              No keys yet. Add your first integration key.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedKeys.map((key) => {
                const isEditing = editingKeyId === key.id;
                const isBusy =
                  updateMutation.isPending || deleteMutation.isPending;

                return (
                  <div
                    key={key.id}
                    className="border border-outline-variant p-4 bg-surface-container"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="font-mono font-bold text-on-surface">
                          {key.name}
                        </p>
                        <p className="text-xs text-on-surface-variant uppercase tracking-wide">
                          {key.service || "unknown service"} · last used{" "}
                          {formatDate(key.lastUsedAt)}
                        </p>
                        <p className="text-sm text-on-surface-variant mt-1">
                          value: ••••••••••••
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingKeyId(key.id);
                            setNewValue("");
                          }}
                          disabled={isBusy}
                        >
                          Rotate
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => deleteMutation.mutate({ keyId: key.id })}
                          disabled={isBusy}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-3 flex flex-col md:flex-row gap-2">
                        <Input
                          type="password"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          placeholder="Enter new secret value"
                          autoComplete="off"
                        />
                        <Button
                          onClick={() =>
                            updateMutation.mutate({ keyId: key.id, value: newValue })
                          }
                          disabled={updateMutation.isPending || !newValue}
                        >
                          {updateMutation.isPending ? "Updating..." : "Update"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditingKeyId(null);
                            setNewValue("");
                          }}
                          disabled={updateMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
