"use client";

import { useMemo, useState } from "react";
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

  const keys = useMemo(() => keysQuery.data ?? [], [keysQuery.data]);

  const uniqueServicesCount = useMemo(
    () =>
      new Set(
        keys
          .map((key) => key.service?.trim().toLowerCase())
          .filter((service): service is string => Boolean(service))
      ).size,
    [keys]
  );

  const usedAtLeastOnceCount = useMemo(
    () => keys.filter((key) => Boolean(key.lastUsedAt)).length,
    [keys]
  );

  return (
    <>
      <Navbar />

      <main className="pt-20 pb-12 px-6 max-w-7xl mx-auto min-h-screen">
        <div className="mb-10">
          <h1 className="text-8xl md:text-[9rem] font-arcade text-primary tracking-tighter uppercase leading-none">
            API VAULT
          </h1>
          <p className="text-secondary font-arcade text-3xl md:text-4xl tracking-[0.2em] opacity-80 uppercase">
            Integrations Control
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface-container-high border-2 border-outline-variant px-4 py-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Stored Keys
            </p>
            <p className="text-3xl font-black text-primary font-headline mt-1">
              {keys.length}
            </p>
          </div>
          <div className="bg-surface-container-high border-2 border-outline-variant px-4 py-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Services Covered
            </p>
            <p className="text-3xl font-black text-secondary font-headline mt-1">
              {uniqueServicesCount}
            </p>
          </div>
          <div className="bg-surface-container-high border-2 border-outline-variant px-4 py-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Used At Least Once
            </p>
            <p className="text-3xl font-black text-primary-container font-headline mt-1">
              {usedAtLeastOnceCount}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-10">
          <section className="xl:col-span-2 bg-surface-container-high p-6 border-4 border-outline-variant shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="mb-4">
              <h2 className="text-2xl font-black font-headline uppercase tracking-tight text-primary">
                Add New Key
              </h2>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant mt-1">
                Store encrypted secrets for external integrations.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                  Key Name
                </p>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="STRIPE_TEST_KEY"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                  Service
                </p>
                <Input
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="stripe (optional)"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                  Secret Value
                </p>
                <Input
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Paste secret value"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button
                onClick={() =>
                  createMutation.mutate({
                    name: name.trim(),
                    service: service.trim() || undefined,
                    value,
                  })
                }
                disabled={createMutation.isPending || !name.trim() || !value}
                className="font-black uppercase tracking-wide text-on-primary-container hover:text-on-primary-container"
              >
                {createMutation.isPending ? "Saving..." : "Save key"}
              </Button>
              <span className="text-xs text-on-surface-variant uppercase tracking-wider">
                Keys are masked after storage.
              </span>
            </div>
          </section>

          <aside className="bg-surface-container p-6 border-4 border-outline-variant shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-lg font-black font-headline uppercase tracking-tight text-primary mb-4">
              Vault Protocol
            </h3>
            <ul className="space-y-3 text-sm text-on-surface-variant">
              <li className="border-l-2 border-primary pl-3">
                Use clear key names for faster mission setup.
              </li>
              <li className="border-l-2 border-secondary pl-3">
                Rotate credentials immediately after provider resets.
              </li>
              <li className="border-l-2 border-primary-container pl-3">
                Delete unused keys to reduce exposure surface.
              </li>
            </ul>
          </aside>
        </div>

        <section className="bg-surface-container-high p-6 border-4 border-outline-variant shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black font-headline uppercase tracking-tight text-primary">
                Stored Keys
              </h2>
              <p className="text-xs uppercase tracking-widest text-on-surface-variant mt-1">
                {keys.length} active records in secure storage
              </p>
            </div>
          </div>

          {keysQuery.isLoading ? (
            <div className="text-center py-16 text-on-surface-variant font-arcade text-2xl animate-pulse">
              LOADING_KEYS...
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-outline-variant text-on-surface-variant uppercase tracking-widest text-sm">
              No keys stored yet. Add your first integration secret.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {keys.map((key) => {
                const isEditing = editingKeyId === key.id;
                const isBusy = updateMutation.isPending || deleteMutation.isPending;

                return (
                  <div
                    key={key.id}
                    className="group bg-surface-container p-5 border-4 border-transparent hover:border-primary transition-all steps-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative"
                  >
                    <div className="absolute -top-4 -left-4 bg-primary text-on-primary-container px-2 py-1 text-[10px] font-black uppercase">
                      {key.id.slice(0, 8)}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <p className="font-mono text-lg font-black text-on-surface break-all">
                            {key.name}
                          </p>
                          <p className="text-xs text-on-surface-variant uppercase tracking-wide mt-1">
                            Service: {key.service || "unknown"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setEditingKeyId(key.id);
                              setNewValue("");
                            }}
                            disabled={isBusy}
                            className="font-black uppercase tracking-wide text-on-secondary hover:text-on-secondary"
                          >
                            Rotate
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => deleteMutation.mutate({ keyId: key.id })}
                            disabled={isBusy}
                            className="font-black uppercase tracking-wide"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-surface-container-lowest px-3 py-2 border border-outline-variant/30">
                          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
                            Last Used
                          </p>
                          <p className="text-sm text-on-surface mt-1">
                            {formatDate(key.lastUsedAt)}
                          </p>
                        </div>
                        <div className="bg-surface-container-lowest px-3 py-2 border border-outline-variant/30">
                          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
                            Secret Preview
                          </p>
                          <p className="text-sm text-on-surface mt-1 font-mono">••••••••••••</p>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="border-t border-outline-variant/40 pt-4">
                          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-2">
                            Rotate key material
                          </p>
                          <div className="flex flex-col md:flex-row gap-2">
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
                              className="font-black uppercase tracking-wide text-on-primary-container hover:text-on-primary-container"
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
                              className="font-black uppercase tracking-wide"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
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
