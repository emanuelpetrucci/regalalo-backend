## 2025-05-15 - [Path Traversal in Local Storage Adapter]
**Vulnerability:** The `LocalFilesystemStorageAdapter` was vulnerable to path traversal because it used `path.join` with unsanitized user-provided paths (extracted from URLs) to write and delete files.
**Learning:** Even when paths seem to be system-generated (like UUIDs), if they are ever extracted from URLs or stored in the database after being received from a client, they must be validated before being used in filesystem operations. Simple `startsWith` checks can be bypassed if the base path is not correctly terminated with a separator.
**Prevention:** Always use `path.resolve` and verify that the resulting absolute path is contained within the intended base directory, ensuring both paths are treated as directories (by appending `path.sep`) to avoid sibling directory bypasses.

## 2026-06-04 - [IDOR in Profile Avatar Management]
**Vulnerability:** A user could manipulate their `avatarUrl` to point to another user's storage path and then trigger its deletion by setting it to `null`.
**Learning:** Even if a file deletion is indirect (via a background queue), the ownership must be verified both when the reference is created (Use Case) and when the deletion is enqueued (Repository). Storage path conventions should be strictly enforced at the architectural boundaries.
**Prevention:** Enforce ownership of storage paths by verifying that the path starts with a user-specific prefix (`avatars/${userId}/`) before allowing updates or enqueuing deletions. Use `extractStoragePathFromPublicUrl` to resolve URLs to storage paths before validation.
