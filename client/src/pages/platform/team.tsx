import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/role-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlatform } from "@/lib/platform-context";
import { Users, Plus, Shield, HeadphonesIcon, Trash2 } from "lucide-react";
import { useState } from "react";

interface PlatformMemberRow {
  id: number;
  userId: string;
  role: string;
  active: boolean;
  createdAt: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export default function PlatformTeam() {
  const { data: members, isLoading } = useQuery<PlatformMemberRow[]>({
    queryKey: ["/api/platform/members"],
  });
  const { platformRole } = usePlatform();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "support">("support");

  const isAdmin = platformRole === "admin";

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/platform/members", { email, role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/members"] });
      setOpen(false);
      setEmail("");
      setRole("support");
      toast({ title: "Member added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add member", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/platform/members/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/members"] });
      toast({ title: "Member removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("PATCH", `/api/platform/members/${id}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/members"] });
      toast({ title: "Role updated" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Platform Team</h1>
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-platform-team-title">Platform Team</h1>
          <p className="text-muted-foreground">{members?.length || 0} member{(members?.length || 0) !== 1 ? "s" : ""}</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-platform-member">
                <Plus className="h-4 w-4 mr-1" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Platform Member</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="member-email">Email</Label>
                  <Input
                    id="member-email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-platform-member-email"
                  />
                  <p className="text-xs text-muted-foreground">The user must have registered an account first</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-role">Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "admin" | "support")}>
                    <SelectTrigger data-testid="select-platform-member-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="support">Support</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={addMutation.isPending} data-testid="button-submit-platform-member">
                  {addMutation.isPending ? "Adding..." : "Add Member"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-3">
        {members?.map((member) => (
          <Card key={member.id} data-testid={`card-platform-member-${member.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    {member.role === "admin" ? (
                      <Shield className="h-5 w-5 text-primary" />
                    ) : (
                      <HeadphonesIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => updateRoleMutation.mutate({ id: member.id, role: v })}
                    >
                      <SelectTrigger className="w-28" data-testid={`select-role-${member.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <RoleBadge role={member.role === "admin" ? "platform_admin" : "support"} />
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeMutation.mutate(member.id)}
                      data-testid={`button-remove-member-${member.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!members || members.length === 0) && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No platform members yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
