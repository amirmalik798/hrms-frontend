"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { initials } from "@/lib/format";

type ProfilePhotoProps = {
  name: string;
  employeeId?: string | null;
  currentUser?: boolean;
  organizationAdmin?: boolean;
  className?: string;
  refreshKey?: number;
  conversationId?: string | null;
  style?: CSSProperties;
};

/** Shared, permission-scoped profile image used across workforce workspaces. */
export function ProfilePhoto({
  name,
  employeeId,
  currentUser = false,
  organizationAdmin = false,
  className = "user-avatar",
  refreshKey = 0,
  conversationId,
  style,
}: ProfilePhotoProps) {
  const [failed, setFailed] = useState(false);
  const [eventVersion, setEventVersion] = useState(0);
  const imagePath = useMemo(() => {
    if (organizationAdmin) return "/api/backend/org/profile/photo";
    if (currentUser) return "/api/backend/employees/me/photo";
    if (employeeId) return `/api/backend/employees/${encodeURIComponent(employeeId)}/photo${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`;
    return null;
  }, [organizationAdmin, currentUser, employeeId, conversationId]);
  const imageUrl = imagePath ? `${imagePath}${imagePath.includes("?") ? "&" : "?"}v=${refreshKey + eventVersion}` : null;

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    const refresh = () => setEventVersion((version) => version + 1);
    window.addEventListener("hrms:profile-photo-updated", refresh);
    return () => window.removeEventListener("hrms:profile-photo-updated", refresh);
  }, []);

  return (
    <span className={`${className === "user-avatar" ? "user-avatar" : ""} profile-photo ${className === "user-avatar" ? "" : className || ""}`.trim()} style={style} aria-label={`${name || "Workforce member"} profile photo`} title={name || "Workforce member"}>
      {imageUrl && !failed ? (
        <img className="profile-photo-image" src={imageUrl} alt={`${name || "Workforce member"} profile`} onError={() => setFailed(true)} />
      ) : initials(name || "Workforce member")}
    </span>
  );
}
