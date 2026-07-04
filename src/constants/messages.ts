export const ERROR_MESSAGES = {
  DB_URI_MISSING: "Please define the MONGODB_URI environment variable inside .env",
  USER_ALREADY_EXISTS: "User with this email already exists",
  ROUTE_NOT_FOUND: "API endpoint not found",
  INVALID_CREDENTIALS: "Invalid credentials",
  USER_NOT_FOUND: "No user found with this email",
  INCORRECT_PASSWORD: "Incorrect password",
  SERVER_ERROR: "An unexpected error occurred on the server",
};

export const SUCCESS_MESSAGES = {
  REGISTER_SUCCESS: "User registered successfully",
  DEFAULT_SUCCESS: "Success",
};
