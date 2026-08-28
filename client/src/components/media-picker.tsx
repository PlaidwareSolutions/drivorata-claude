import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Image, Trash2, Check, Loader2 } from "lucide-react";
import type { Media } from "@shared/schema";

interface MediaPickerProps {
  tenantId: number;
  value?: string;
  onSelect: (url: string) => void;
  label?: string;
}

export function MediaPicker({ tenantId, value, onSelect, label }: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: mediaItems = [], isLoading } = useQuery<Media[]>({
    queryKey: ["/api/tenants", tenantId, "media"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/media`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId && open,
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: async (response) => {
      const fileInput = document.getElementById("media-file-input") as HTMLInputElement;
      const fileName = fileInput?.files?.[0]?.name || "upload";
      const fileType = fileInput?.files?.[0]?.type || "";
      const fileSize = fileInput?.files?.[0]?.size || 0;

      await apiRequest("POST", `/api/tenants/${tenantId}/media`, {
        filename: fileName,
        objectPath: response.objectPath,
        contentType: fileType,
        size: fileSize,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "media"] });
      toast({ title: "Image uploaded" });
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/tenants/${tenantId}/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "media"] });
      toast({ title: "Image deleted" });
    },
  });

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    await uploadFile(file);
  }, [uploadFile, toast]);

  const handleSelect = (item: Media) => {
    onSelect(item.objectPath);
    setOpen(false);
  };

  return (
    <div>
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div className="flex items-center gap-2 mt-1">
        {value ? (
          <div className="relative w-16 h-16 rounded-md overflow-visible border bg-muted">
            <img
              src={value}
              alt="Selected"
              className="w-full h-full object-cover rounded-md"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-md border border-dashed flex items-center justify-center bg-muted/50">
            <Image className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            data-testid="button-open-media-picker"
          >
            <Image className="h-3 w-3 mr-1" /> {value ? "Change" : "Select Image"}
          </Button>
          {value && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelect("")}
              data-testid="button-clear-image"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Media Library</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2">
            <input
              id="media-file-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("media-file-input")?.click()}
              disabled={isUploading}
              data-testid="button-upload-media"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              {isUploading ? "Uploading..." : "Upload Image"}
            </Button>
            <Input
              placeholder="Paste image URL..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const url = (e.target as HTMLInputElement).value.trim();
                  if (url) {
                    onSelect(url);
                    setOpen(false);
                  }
                }
              }}
              data-testid="input-image-url"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="aspect-square rounded-md" />
                ))}
              </div>
            ) : mediaItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No images yet. Upload your first image above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {mediaItems.map((item) => (
                  <div
                    key={item.id}
                    className={`relative group aspect-square rounded-md overflow-visible border cursor-pointer ${
                      value === item.objectPath ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleSelect(item)}
                    data-testid={`media-item-${item.id}`}
                  >
                    <img
                      src={item.objectPath}
                      alt={item.alt || item.filename}
                      className="w-full h-full object-cover rounded-md"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "";
                        (e.target as HTMLImageElement).className = "w-full h-full bg-muted rounded-md flex items-center justify-center";
                      }}
                    />
                    {value === item.objectPath && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center rounded-md">
                        <Check className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.filename}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(item.id);
                      }}
                      data-testid={`button-delete-media-${item.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
