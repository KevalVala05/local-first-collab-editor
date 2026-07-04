export const ERROR_MESSAGES = {
  DB_URI_MISSING: "Please define the MONGODB_URI environment variable inside .env",
  USER_ALREADY_EXISTS: "User with this email already exists",
  ROUTE_NOT_FOUND: "API endpoint not found",
  INVALID_CREDENTIALS: "Invalid credentials",
  USER_NOT_FOUND: "No user found with this email",
  INCORRECT_PASSWORD: "Incorrect password",
  SERVER_ERROR: "An unexpected error occurred on the server",

  // Document messages
  UNAUTHORIZED: "Unauthorized access. Please log in.",
  DOCUMENT_NOT_FOUND: "Document not found",
  DOCUMENT_ACCESS_DENIED: "You do not have permission to access this document",
  VIEWER_CANNOT_EDIT: "You have read-only access. Viewers cannot edit documents.",
  OWNER_ONLY_DELETE: "Only the document owner can delete this document",
  OWNER_CANNOT_SHARE: "This user is already the owner of the document",
  USER_EMAIL_NOT_FOUND: "User with this email is not registered",

  // Validation messages
  TITLE_REQUIRED: "Title is required",
  TITLE_MIN_LENGTH: "Title must be at least 2 characters",
  TITLE_MAX_LENGTH: "Title must not exceed 100 characters",
  NAME_REQUIRED: "Name is required",
  NAME_MIN_LENGTH: "Name must be at least 2 characters",
  NAME_MAX_LENGTH: "Name must not exceed 50 characters",
  EMAIL_REQUIRED: "Email is required",
  INVALID_EMAIL: "Invalid email address",
  EMAIL_MIN_LENGTH: "Email must be at least 2 characters",
  EMAIL_MAX_LENGTH: "Email must not exceed 50 characters",
  PASSWORD_REQUIRED: "Password is required",
  PASSWORD_MIN_LENGTH: "Password must be at least 6 characters",
  PASSWORD_MAX_LENGTH: "Password must not exceed 100 characters",
  ROLE_INVALID: "Role must be either EDITOR or VIEWER",

  // AI & Snapshot messages
  AI_ACTION_REQUIRED: "Missing action parameter",
  GEMINI_KEY_MISSING: "Gemini API key is not configured on the server. Please add GEMINI_API_KEY in your .env file.",
  AI_LANGUAGE_REQUIRED: "Missing targetLanguage parameter",
  AI_TONE_REQUIRED: "Missing targetTone parameter",
  AI_INVALID_ACTION: "Invalid action",
  AI_FAILED: "Failed to call AI assistant",
  VIEWER_CANNOT_SNAPSHOT: "Viewers cannot create snapshots",
  VIEWER_CANNOT_RESTORE: "Viewers cannot restore snapshots",
  SNAPSHOT_NOT_FOUND: "Snapshot not found",
};

export const SUCCESS_MESSAGES = {
  REGISTER_SUCCESS: "User registered successfully",
  DEFAULT_SUCCESS: "Success",

  // Document messages
  DOCUMENT_CREATE_SUCCESS: "Document created successfully",
  DOCUMENT_RETRIEVE_SUCCESS: "Documents retrieved successfully",
  DOCUMENT_UPDATE_SUCCESS: "Document updated successfully",
  DOCUMENT_DELETE_SUCCESS: "Document deleted successfully",
  DOCUMENT_SHARE_SUCCESS: "Document shared successfully",

  // Snapshot messages
  SNAPSHOT_RETRIEVE_SUCCESS: "Snapshots retrieved successfully",
  SNAPSHOT_CREATE_SUCCESS: "Snapshot created successfully",
  DOCUMENT_RESTORE_SUCCESS: "Document restored successfully",
};
