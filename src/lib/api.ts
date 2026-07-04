import axios from "axios";

const api = axios.create(
  {
    baseURL: "/api",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

// Response Interceptors
api.interceptors.response.use(
  (response) =>
  {
    // Returns the success response body (extracts backend wrapper format data)
    return response;
  },
  (error) =>
  {
    // Extract the backend's error message if available
    const message = error.response?.data?.message || error.message || "An unexpected error occurred";
    const customError = new Error(message);

    // Attach response status if available for detailed error handling in components
    if (error.response)
    {
      (customError as any).status = error.response.status;
      (customError as any).data = error.response.data;
    }

    return Promise.reject(customError);
  }
);

export default api;
