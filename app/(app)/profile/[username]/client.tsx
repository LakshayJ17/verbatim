"use client";


import { toast } from "@/components/ui/toast";
import { useState } from "react";
import { toggleFollow } from "@/app/actions/social";
import { updateProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

interface ProfileClientProps {
  profileId: string;
  isOwner: boolean;
  initialIsFollowing: boolean;
  isGuest: boolean;
  initialProfile?: {
    full_name: string | null;
    username: string;
    bio: string | null;
  };
}

export function ProfileClient({ profileId, isOwner, initialIsFollowing, isGuest, initialProfile }: ProfileClientProps) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    full_name: initialProfile?.full_name || "",
    username: initialProfile?.username || "",
    bio: initialProfile?.bio || "",
  });

  const handleFollowToggle = async () => {
    if (isGuest) {
      toast("Log in to follow people.");
      return;
    }

    setIsLoading(true);
    setIsFollowing(!isFollowing); // Optimistic
    
    const res = await toggleFollow(profileId);
    
    if (res?.error) {
      toast(res.error);
      setIsFollowing(isFollowing); // Revert
    }
    setIsLoading(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const res = await updateProfile({
      full_name: editData.full_name,
      username: editData.username,
      bio: editData.bio
    });
    
    if (res?.error) {
      toast(res.error);
    } else {
      setIsEditing(false);
      if (res?.newUsername && res.newUsername !== initialProfile?.username) {
        router.push(`/profile/${res.newUsername}`);
      } else {
        router.refresh();
      }
    }
    setIsLoading(false);
  };

  if (isOwner) {
    return (
      <>
        <Button variant="secondary" onClick={() => setIsEditing(true)}>
          Edit profile
        </Button>

        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <form
              onSubmit={handleSaveProfile}
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-profile-title"
              data-ui="dialog" className="w-full max-w-md rounded-md bg-background p-6 shadow-xl"
            >
              <h2 id="edit-profile-title" className="heading-display mb-6 text-2xl">
                Edit profile
              </h2>

              <div className="space-y-5">
                <div>
                  <label htmlFor="profile-full-name" className="mb-1.5 block text-sm font-medium text-foreground">
                    Display name
                  </label>
                  <Input
                    id="profile-full-name"
                    name="full_name"
                    type="text"
                    autoComplete="name"
                    autoFocus
                    value={editData.full_name}
                    onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="profile-username" className="mb-1.5 block text-sm font-medium text-foreground">
                    Username
                  </label>
                  <Input
                    id="profile-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    spellCheck={false}
                    value={editData.username}
                    onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-medium text-foreground">
                    Bio
                  </label>
                  <textarea
                    id="profile-bio"
                    name="bio"
                    value={editData.bio}
                    onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3.5 py-2 text-base outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </>
    );
  }

  return (
    <Button
      variant={isFollowing ? "secondary" : "default"}
      onClick={handleFollowToggle}
      disabled={isLoading}
      aria-pressed={isFollowing}
    >
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
